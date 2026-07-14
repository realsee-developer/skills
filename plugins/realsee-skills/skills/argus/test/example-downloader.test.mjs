import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { copyFile, lstat, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  downloadExampleSet,
  parseExampleDownloadArgs
} from '../src/example-downloader.mjs';
import { runExampleDownload } from '../scripts/download-examples.mjs';

test('downloads a manifest set to an explicit external directory with byte and SHA-256 checks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-examples-'));
  const skillDir = join(root, 'skill');
  const outputDir = join(root, 'downloads', 'cn');
  const files = new Map([
    ['/pano01.jpg', Buffer.from('first panorama fixture')],
    ['/pano02.jpg', Buffer.from('second panorama fixture')]
  ]);
  const requested = [];
  const server = createServer((request, response) => {
    requested.push(request.url);
    const body = files.get(request.url);
    if (!body) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-length': String(body.length) });
    response.end(body);
  });

  try {
    const baseUrl = await listen(server);
    const manifestPath = await writeManifest(skillDir, 'cn', [...files].map(([path, body], index) => ({
      name: `pano${String(index + 1).padStart(2, '0')}.jpg`,
      source_url: `${baseUrl}${path}`,
      bytes: body.length,
      sha256: sha256(body)
    })));

    assert.deepEqual(
      parseExampleDownloadArgs(['--region', 'cn', '--output', outputDir], { skillDir }),
      { region: 'cn', outputDir }
    );
    const result = await downloadExampleSet({ manifestPath, region: 'cn', outputDir, skillDir });

    assert.deepEqual(requested, ['/pano01.jpg', '/pano02.jpg']);
    assert.equal(result.region, 'cn');
    assert.equal(result.output_dir, outputDir);
    assert.deepEqual(result.images, [join(outputDir, 'pano01.jpg'), join(outputDir, 'pano02.jpg')]);
    assert.deepEqual(await readFile(result.images[0]), files.get('/pano01.jpg'));
    assert.deepEqual(await readFile(result.images[1]), files.get('/pano02.jpg'));
    assert.deepEqual(await readdir(dirname(outputDir)), ['cn']);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('a SHA-256 mismatch leaves neither the final set nor temporary files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-examples-'));
  const skillDir = join(root, 'skill');
  const outputDir = join(root, 'downloads', 'cn');
  const body = Buffer.from('corrupt panorama fixture');
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-length': String(body.length) });
    response.end(body);
  });

  try {
    const baseUrl = await listen(server);
    const manifestPath = await writeManifest(skillDir, 'cn', [{
      name: 'pano01.jpg',
      source_url: `${baseUrl}/pano01.jpg`,
      bytes: body.length,
      sha256: '0'.repeat(64)
    }]);

    await assert.rejects(
      downloadExampleSet({ manifestPath, region: 'cn', outputDir, skillDir }),
      /SHA-256/u
    );
    await assert.rejects(stat(outputDir), (error) => error?.code === 'ENOENT');
    assert.deepEqual(await readdir(dirname(outputDir)), []);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('does not replace an output directory created while the set is downloading', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-examples-'));
  const skillDir = join(root, 'skill');
  const outputDir = join(root, 'downloads', 'cn');
  const body = Buffer.from('panorama fixture');
  let releaseBody;
  let markChunkConsumed;
  const bodyReleased = new Promise((resolve) => {
    releaseBody = resolve;
  });
  const chunkConsumed = new Promise((resolve) => {
    markChunkConsumed = resolve;
  });

  async function* delayedBody() {
    yield body;
    markChunkConsumed();
    await bodyReleased;
  }

  try {
    const manifestPath = await writeManifest(skillDir, 'cn', [{
      name: 'pano01.jpg',
      source_url: 'https://cdn.example.com/pano01.jpg',
      bytes: body.length,
      sha256: sha256(body)
    }]);
    const download = downloadExampleSet({
      manifestPath,
      region: 'cn',
      outputDir,
      skillDir,
      transport: async () => ({
        statusCode: 200,
        headers: { 'content-length': String(body.length) },
        body: delayedBody()
      })
    });

    await chunkConsumed;
    await mkdir(outputDir, { recursive: true });
    releaseBody();

    await assert.rejects(download, /already exists/u);
    assert.deepEqual(await readdir(outputDir), []);
    assert.deepEqual(await readdir(dirname(outputDir)), ['cn']);
  } finally {
    releaseBody();
    await rm(root, { recursive: true, force: true });
  }
});

test('requires a supported region and an absolute output outside the skill directory', () => {
  const skillDir = '/tmp/argus-skill';
  assert.throws(
    () => parseExampleDownloadArgs(['--region', 'cn', '--output', 'relative'], { skillDir }),
    /absolute/u
  );
  assert.throws(
    () => parseExampleDownloadArgs(['--region', 'cn', '--output', join(skillDir, 'examples', 'cn')], { skillDir }),
    /outside/u
  );
  assert.throws(
    () => parseExampleDownloadArgs(['--region', 'other', '--output', '/tmp/examples'], { skillDir }),
    /cn or global/u
  );
  assert.throws(
    () => parseExampleDownloadArgs(['--region', 'cn'], { skillDir }),
    /--output/u
  );
});

test('rejects an external-looking output whose parent symlink resolves inside the skill', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-examples-'));
  const skillDir = join(root, 'skill');
  const insideDir = join(skillDir, 'inside');
  const alias = join(root, 'outside-alias');
  const outputDir = join(alias, 'downloaded');
  let transportCalled = false;

  try {
    const body = Buffer.from('panorama fixture');
    const manifestPath = await writeManifest(skillDir, 'cn', [{
      name: 'pano01.jpg',
      source_url: 'https://cdn.example.com/pano01.jpg',
      bytes: body.length,
      sha256: sha256(body)
    }]);
    await mkdir(insideDir, { recursive: true });
    await symlink(insideDir, alias, 'dir');

    await assert.rejects(
      downloadExampleSet({
        manifestPath,
        region: 'cn',
        outputDir,
        skillDir,
        transport: async () => {
          transportCalled = true;
          throw new Error('transport should not be called');
        }
      }),
      /outside the installed skill directory/u
    );
    assert.equal(transportCalled, false);
    await assert.rejects(stat(join(insideDir, 'downloaded')), (error) => error?.code === 'ENOENT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('does not replace a final symlink introduced while the set is downloading', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-examples-'));
  const skillDir = join(root, 'skill');
  const insideDir = join(skillDir, 'inside');
  const outputDir = join(root, 'downloads', 'cn');
  const body = Buffer.from('panorama fixture');
  let releaseBody;
  let markChunkConsumed;
  const bodyReleased = new Promise((resolve) => {
    releaseBody = resolve;
  });
  const chunkConsumed = new Promise((resolve) => {
    markChunkConsumed = resolve;
  });

  async function* delayedBody() {
    yield body;
    markChunkConsumed();
    await bodyReleased;
  }

  try {
    const manifestPath = await writeManifest(skillDir, 'cn', [{
      name: 'pano01.jpg',
      source_url: 'https://cdn.example.com/pano01.jpg',
      bytes: body.length,
      sha256: sha256(body)
    }]);
    await mkdir(insideDir, { recursive: true });
    const download = downloadExampleSet({
      manifestPath,
      region: 'cn',
      outputDir,
      skillDir,
      transport: async () => ({
        statusCode: 200,
        headers: { 'content-length': String(body.length) },
        body: delayedBody()
      })
    });
    await chunkConsumed;
    await symlink(insideDir, outputDir, 'dir');
    releaseBody();

    await assert.rejects(download, /already exists/u);
    assert.equal((await lstat(outputDir)).isSymbolicLink(), true);
    assert.deepEqual(await readdir(insideDir), []);
    assert.deepEqual(await readdir(dirname(outputDir)), ['cn']);
  } finally {
    releaseBody();
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI aborts on SIGINT and removes staging downloads before exiting', { timeout: 10_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-examples-signal-'));
  const sourceSkillDir = resolve(import.meta.dirname, '..');
  const skillDir = join(root, 'skill');
  const outputDir = join(root, 'downloads', 'cn');
  const body = Buffer.alloc(2048);
  let child;
  let response;
  let childStdout = '';
  let childStderr = '';
  let markRequestStarted;
  const requestStarted = new Promise((resolveRequest) => {
    markRequestStarted = resolveRequest;
  });
  const server = createServer((_request, activeResponse) => {
    response = activeResponse;
    activeResponse.writeHead(200, { 'content-length': String(body.length) });
    activeResponse.write(body.subarray(0, 1024));
    markRequestStarted();
  });

  try {
    const baseUrl = await listen(server);
    for (const relativePath of [
      'scripts/download-examples.mjs',
      'src/example-downloader.mjs',
      'src/downloader.mjs',
      'src/sanitizer.mjs'
    ]) {
      const target = join(skillDir, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(sourceSkillDir, relativePath), target);
    }
    await writeManifest(skillDir, 'cn', [{
      name: 'pano01.jpg',
      source_url: `${baseUrl}/pano01.jpg`,
      bytes: body.length,
      sha256: sha256(body)
    }]);

    child = spawn(process.execPath, [
      join(skillDir, 'scripts', 'download-examples.mjs'),
      '--region',
      'cn',
      '--output',
      outputDir
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      childStdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      childStderr += chunk;
    });
    const childExit = once(child, 'exit');
    await Promise.race([
      requestStarted,
      childExit.then(([code, signal]) => {
        throw new Error(
          `download CLI exited before requesting the fixture: code=${code} signal=${signal} stdout=${childStdout} stderr=${childStderr}`
        );
      })
    ]);
    await waitFor(async () => {
      const stagingEntries = await readDirectoryOrEmpty(dirname(outputDir));
      for (const entry of stagingEntries.filter((name) => name.startsWith('.cn.'))) {
        const files = await readDirectoryOrEmpty(join(dirname(outputDir), entry));
        if (files.some((name) => name.endsWith('.tmp'))) return true;
      }
      return false;
    });

    assert.equal(child.kill('SIGINT'), true);
    const [code, signal] = await childExit;
    assert.equal(code, 130);
    assert.equal(signal, null);
    assert.deepEqual(await readDirectoryOrEmpty(dirname(outputDir)), []);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await once(child, 'exit');
    }
    response?.destroy();
    server.closeAllConnections?.();
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI treats a completed download as committed even if its signal aborts before reporting', async () => {
  const controller = new AbortController();
  const skillDir = '/tmp/argus-example-skill';
  const outputDir = '/tmp/argus-example-output';
  const committed = {
    region: 'cn',
    output_dir: outputDir,
    images: [join(outputDir, 'pano01.jpg')]
  };

  const result = await runExampleDownload(
    ['--region', 'cn', '--output', outputDir],
    {
      skillDir,
      signal: controller.signal,
      downloadSet: async ({ signal }) => {
        controller.abort(new Error('signal arrived after atomic publication'));
        assert.equal(signal.aborted, true);
        return committed;
      }
    }
  );

  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(result, committed);
});

async function writeManifest(skillDir, region, files) {
  const manifestPath = join(skillDir, 'examples', 'manifest.json');
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify({
    schema_version: 1,
    sets: { [region]: { region, count: files.length, files } }
  })}\n`);
  return manifestPath;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function readDirectoryOrEmpty(path) {
  try {
    return await readdir(path);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function waitFor(predicate) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(20);
  }
  throw new Error('timed out waiting for the download staging file');
}

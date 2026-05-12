import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/cli.mjs';
import { buildJpegWithDimensions } from './helpers/jpeg.mjs';

// cli.mjs enforces 2:1 for panorama tests and 1:1 for pinhole tests, so the
// fake JPEG payload must carry valid SOF dimensions of the right ratio.
const PINHOLE_JPEG = buildJpegWithDimensions(1024, 1024);
const PANORAMA_JPEG = buildJpegWithDimensions(4096, 2048);

const LIVE_ENV = {
  REALSEE_REGION: 'global',
  REALSEE_APP_KEY: 'test-app-key',
  REALSEE_APP_SECRET: 'test-app-secret',
  REALSEE_POLL_INTERVAL_MS: '1',
  REALSEE_POLL_MAX_ATTEMPTS: '5'
};

function createWritableCapture() {
  return {
    text: '',
    write(chunk) {
      this.text += String(chunk);
    }
  };
}

function fakeToken() {
  return {
    tmpSecretId: 'a', tmpSecretKey: 'b', sessionToken: 'c',
    ttl: '0', prefix: 'p', expire: 0, app_id: 'a',
    bucket: 'b', region: 'r', is_accelerate: 'false',
    host: 'h', primaryid: 'p', download_type: 'direct',
    download_host: 'd', custom_domain: '', custom_scheme: ''
  };
}

test('async cli writes state.json and returns in_progress without polling', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-async-'));
  try {
    const imagePath = join(root, 'pano.jpg');
    await writeFile(imagePath, imagePath.endsWith('pano.jpg') ? PANORAMA_JPEG : PINHOLE_JPEG);

    const calls = { trigger: 0, poll: 0, spawnDetached: 0, upload: 0 };
    const fakeGateway = {
      async getUploadToken() {
        return { input_image_id: 'image-async-1', upload_token: fakeToken() };
      },
      async triggerVGGT() { calls.trigger += 1; return {}; },
      async pollVGGT() { calls.poll += 1; return { status: 'pending' }; }
    };
    const stdout = createWritableCapture();

    const result = await main([
      '--image', imagePath,
      '--type', 'panorama',
      '--workspace', root,
      '--async',
      '--json',
      '--yes'
    ], {
      env: LIVE_ENV,
      stdout,
      stderr: createWritableCapture(),
      now: () => new Date('2026-05-11T00:00:00Z'),
      createGateway: () => fakeGateway,
      upload: async ({ uploadKey }) => {
        calls.upload += 1;
        return { providerName: 'aws', key: uploadKey, etag: 'etag-async' };
      },
      spawnDetached: () => {
        calls.spawnDetached += 1;
        return 99999;
      },
      sleep: () => Promise.resolve()
    });

    assert.equal(calls.trigger, 1);
    assert.equal(calls.upload, 1);
    assert.equal(calls.poll, 0);
    assert.equal(calls.spawnDetached, 1);

    assert.equal(result.status, 'in_progress');
    assert.equal(result.input_image_id, 'image-async-1');
    assert.equal(result.vggt_type, 'pano');
    assert.equal(result.background_poll_pid, 99999);
    assert.equal(result.upload.key, 'panoImage.jpg');

    const stateText = await readFile(join(result.workspace_dir, 'state.json'), 'utf8');
    const state = JSON.parse(stateText);
    assert.equal(state.status, 'in_progress');
    assert.equal(state.input_image_id, 'image-async-1');
    assert.equal(state.background_poll_pid, 99999);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resume cli polls + downloads using state.json from a prior async run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-resume-'));
  try {
    const imagePath = join(root, 'photo.jpg');
    await writeFile(imagePath, imagePath.endsWith('pano.jpg') ? PANORAMA_JPEG : PINHOLE_JPEG);

    // Phase 1: prepare workspace using --async (skips poll, writes state).
    const phase1Gateway = {
      async getUploadToken() {
        return { input_image_id: 'image-resume-1', upload_token: fakeToken() };
      },
      async triggerVGGT() { return {}; },
      async pollVGGT() { throw new Error('phase1 should not poll'); }
    };
    const phase1 = await main([
      '--image', imagePath,
      '--type', 'image',
      '--workspace', root,
      '--async',
      '--json',
      '--yes'
    ], {
      env: LIVE_ENV,
      stdout: createWritableCapture(),
      stderr: createWritableCapture(),
      now: () => new Date('2026-05-11T00:00:00Z'),
      createGateway: () => phase1Gateway,
      upload: async ({ uploadKey }) => ({ providerName: 'aws', key: uploadKey, etag: 'etag-r' }),
      spawnDetached: () => 1234,
      sleep: () => Promise.resolve()
    });
    assert.equal(phase1.status, 'in_progress');
    const workspaceDir = phase1.workspace_dir;

    // Phase 2: --resume reads state and finishes poll + download.
    const phase2Poll = { count: 0 };
    const phase2Gateway = {
      async getUploadToken() { throw new Error('phase2 should not re-fetch upload token'); },
      async triggerVGGT() { throw new Error('phase2 should not re-trigger'); },
      async pollVGGT({ type, inputImageId }) {
        phase2Poll.count += 1;
        assert.equal(type, 'pinhole');
        assert.equal(inputImageId, 'image-resume-1');
        if (phase2Poll.count < 2) return { status: 'pending' };
        return {
          status: 'success',
          alg_task_id: 'task-resume-1',
          result_url: 'https://cdn.example.com/r.glb'
        };
      }
    };
    let downloadedTo = '';
    const stdout = createWritableCapture();
    const result = await main([
      '--resume',
      '--workspace', workspaceDir,
      '--json'
    ], {
      env: LIVE_ENV,
      stdout,
      stderr: createWritableCapture(),
      createGateway: () => phase2Gateway,
      download: async ({ url, outputPath }) => {
        downloadedTo = outputPath;
        await writeFile(outputPath, Buffer.from('glb-bytes'));
        return { bytes: 9, host: 'cdn.example.com', redirected: false };
      },
      sleep: () => Promise.resolve()
    });

    assert.equal(phase2Poll.count, 2);
    assert.equal(result.status, 'success');
    assert.equal(result.task_id, 'task-resume-1');
    assert.equal(result.input_image_id, 'image-resume-1');
    assert.equal(result.region, 'global');
    assert.equal(result.upload.key, 'pinholeImage.jpg');
    assert.match(downloadedTo, /task-resume-1\.glb$/);

    const resultFile = JSON.parse(await readFile(join(workspaceDir, 'result.json'), 'utf8'));
    assert.equal(resultFile.status, 'success');
    assert.equal(resultFile.task_id, 'task-resume-1');

    const stateFile = JSON.parse(await readFile(join(workspaceDir, 'state.json'), 'utf8'));
    assert.equal(stateFile.status, 'success');
    assert.equal(stateFile.task_id, 'task-resume-1');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resume cli persists failure payload on poll error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-resume-fail-'));
  try {
    const imagePath = join(root, 'p.jpg');
    // This async test triggers a panorama run, so the JPEG must be 2:1.
    await writeFile(imagePath, PANORAMA_JPEG);

    const startGateway = {
      async getUploadToken() {
        return { input_image_id: 'image-fail-1', upload_token: fakeToken() };
      },
      async triggerVGGT() { return {}; },
      async pollVGGT() { throw new Error('should not poll in async start'); }
    };
    const phase1 = await main([
      '--image', imagePath,
      '--type', 'panorama',
      '--workspace', root,
      '--async',
      '--json',
      '--yes'
    ], {
      env: LIVE_ENV,
      stdout: createWritableCapture(),
      stderr: createWritableCapture(),
      now: () => new Date('2026-05-11T00:00:00Z'),
      createGateway: () => startGateway,
      upload: async ({ uploadKey }) => ({ providerName: 'cos', key: uploadKey, etag: 'etag-f' }),
      spawnDetached: () => 5555,
      sleep: () => Promise.resolve()
    });

    const failingGateway = {
      async pollVGGT() {
        return { status: 'failed', failed_reason: 'malformed pano' };
      }
    };

    await assert.rejects(
      () => main(['--resume', '--workspace', phase1.workspace_dir, '--json'], {
        env: LIVE_ENV,
        stdout: createWritableCapture(),
        stderr: createWritableCapture(),
        createGateway: () => failingGateway,
        download: async () => { throw new Error('should not download'); },
        sleep: () => Promise.resolve()
      }),
      /malformed pano/
    );

    const stateFile = JSON.parse(await readFile(join(phase1.workspace_dir, 'state.json'), 'utf8'));
    assert.equal(stateFile.status, 'error');
    assert.match(stateFile.error, /malformed pano/);
    const resultFile = JSON.parse(await readFile(join(phase1.workspace_dir, 'result.json'), 'utf8'));
    assert.equal(resultFile.status, 'error');
    assert.match(resultFile.error, /malformed pano/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resume cli rejects when state.json is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-resume-bare-'));
  try {
    await assert.rejects(
      () => main(['--resume', '--workspace', root, '--json'], {
        env: LIVE_ENV,
        stdout: createWritableCapture(),
        stderr: createWritableCapture()
      }),
      /No resumable state found/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

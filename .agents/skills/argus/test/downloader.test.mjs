import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadFileAtomic } from '../src/downloader.mjs';

test('downloads output.zip atomically and verifies length and optional MD5', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-download-'));
  const body = Buffer.from('zip bytes for test');
  try {
    const outputPath = join(root, 'output.zip');
    const receipt = await downloadFileAtomic({
      url: 'https://cdn.invalid/output.zip',
      outputPath,
      expectedBytes: body.length,
      expectedMd5: createHash('md5').update(body).digest('hex'),
      transport: async () => ({
        statusCode: 200,
        headers: { 'content-length': String(body.length) },
        body
      })
    });
    assert.equal(receipt.bytes, body.length);
    assert.deepEqual(await readFile(outputPath), body);
    assert.deepEqual((await readdir(root)).sort(), ['output.zip']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('follows redirects but does not persist the signed URL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-download-'));
  const seen = [];
  try {
    const receipt = await downloadFileAtomic({
      url: 'https://gateway.invalid/result?secret=one',
      outputPath: join(root, 'output.zip'),
      transport: async ({ url }) => {
        seen.push(url.toString());
        return seen.length === 1
          ? { statusCode: 302, headers: { location: 'https://cdn.invalid/output.zip?secret=two' }, body: Buffer.alloc(0) }
          : { statusCode: 200, headers: { 'content-length': '3' }, body: Buffer.from('zip') };
      }
    });
    assert.equal(receipt.host, 'cdn.invalid');
    assert.equal(receipt.redirected, true);
    assert.equal(JSON.stringify(receipt).includes('secret='), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects HTTP length, actual length, and MD5 mismatches without a final file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-download-'));
  try {
    const outputPath = join(root, 'output.zip');
    await assert.rejects(
      () => downloadFileAtomic({
        url: 'https://cdn.invalid/output.zip',
        outputPath,
        expectedBytes: 4,
        transport: async () => ({ statusCode: 200, headers: { 'content-length': '3' }, body: Buffer.from('abc') })
      }),
      /Content-Length/
    );
    await assert.rejects(
      () => downloadFileAtomic({
        url: 'https://cdn.invalid/output.zip',
        outputPath,
        expectedMd5: '00000000000000000000000000000000',
        transport: async () => ({ statusCode: 200, headers: {}, body: Buffer.from('abc') })
      }),
      /MD5/
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('removes an interrupted temporary download', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-download-'));
  async function* interrupted() {
    yield Buffer.from('partial');
    throw new Error('connection reset');
  }
  try {
    await assert.rejects(
      () => downloadFileAtomic({
        url: 'https://cdn.invalid/output.zip',
        outputPath: join(root, 'output.zip'),
        transport: async () => ({ statusCode: 200, headers: {}, body: interrupted() })
      }),
      /connection reset/
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stops reading a chunked response as soon as it exceeds the expected size', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-download-'));
  let chunksRead = 0;
  async function* oversized() {
    for (let index = 0; index < 4; index += 1) {
      chunksRead += 1;
      yield Buffer.alloc(1024 * 1024);
    }
  }

  try {
    await assert.rejects(
      downloadFileAtomic({
        url: 'https://cdn.invalid/output.zip',
        outputPath: join(root, 'output.zip'),
        expectedBytes: 1,
        transport: async () => ({ statusCode: 200, headers: {}, body: oversized() })
      }),
      /more than expected/u
    );
    assert.equal(chunksRead, 1);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('does not accumulate error listeners while waiting for write backpressure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-download-'));
  const warnings = [];
  const onWarning = (warning) => {
    if (warning.name === 'MaxListenersExceededWarning') warnings.push(warning);
  };
  process.on('warning', onWarning);

  try {
    const chunks = Array.from({ length: 10 }, () => Buffer.alloc(64 * 1024));
    await downloadFileAtomic({
      url: 'https://cdn.invalid/output.zip',
      outputPath: join(root, 'output.zip'),
      expectedBytes: chunks.length * chunks[0].length,
      transport: async () => ({
        statusCode: 200,
        headers: { 'content-length': String(chunks.length * chunks[0].length) },
        body: Readable.from(chunks)
      })
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(warnings, []);
  } finally {
    process.off('warning', onWarning);
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects an asynchronous writer error after backpressure without crashing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-download-'));
  try {
    const moduleUrl = new URL('../src/downloader.mjs', import.meta.url).href;
    const script = `
      import fs from 'node:fs';
      import { readdir } from 'node:fs/promises';
      import { syncBuiltinESMExports } from 'node:module';
      import { join } from 'node:path';
      import { Writable } from 'node:stream';

      class FailingWriter extends Writable {
        writes = 0;

        constructor() {
          super({ highWaterMark: 2 });
        }

        _write(_chunk, _encoding, callback) {
          this.writes += 1;
          if (this.writes === 1) {
            setImmediate(callback);
            return;
          }
          setImmediate(() => callback(new Error('asynchronous disk failure')));
        }
      }

      async function* body() {
        yield Buffer.alloc(2);
        yield Buffer.alloc(1);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      fs.createWriteStream = () => new FailingWriter();
      syncBuiltinESMExports();
      const { downloadFileAtomic } = await import(${JSON.stringify(moduleUrl)});
      const root = ${JSON.stringify(root)};
      try {
        await downloadFileAtomic({
          url: 'https://cdn.invalid/output.zip',
          outputPath: join(root, 'output.zip'),
          transport: async () => ({ statusCode: 200, headers: {}, body: body() })
        });
        throw new Error('download unexpectedly succeeded');
      } catch (error) {
        if (error.message !== 'asynchronous disk failure') throw error;
        if ((await readdir(root)).length !== 0) throw new Error('temporary download was not removed');
        process.stdout.write(error.message);
      }
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      encoding: 'utf8'
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, 'asynchronous disk failure');
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

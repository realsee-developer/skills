import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  downloadArgusGlb
} from '../src/downloader.mjs';

test('downloadArgusGlb follows API-provided redirects without host allowlist checks', async () => {
  const runDir = await mkdtemp(join(tmpdir(), 'argus-downloader-'));
  const outputPath = join(runDir, 'output.glb');
  const seen = [];
  try {
    const result = await downloadArgusGlb({
      url: 'https://global-public.realsee-cdn.com/a.glb',
      outputPath,
      transport: async ({ url }) => {
        seen.push(url.toString());
        if (seen.length === 1) {
          return {
          statusCode: 302,
            headers: { location: 'https://example-cdn.invalid/a.glb' },
          body: Buffer.alloc(0)
          };
        }
        return {
          statusCode: 200,
          headers: {},
          body: Buffer.from('glTF redirected payload')
        };
      }
    });

    assert.equal(result.bytes, 'glTF redirected payload'.length);
    assert.equal(result.host, 'example-cdn.invalid');
    assert.deepEqual(seen, [
      'https://global-public.realsee-cdn.com/a.glb',
      'https://example-cdn.invalid/a.glb'
    ]);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test('downloadArgusGlb writes non-empty glb atomically', async () => {
  const runDir = await mkdtemp(join(tmpdir(), 'argus-downloader-'));
  const outputPath = join(runDir, 'output.glb');
  try {
    const result = await downloadArgusGlb({
      url: 'https://global-public.realsee-cdn.com/a.glb',
      outputPath,
      transport: async () => ({
        statusCode: 200,
        headers: {},
        body: Buffer.from('glTF mock glb payload')
      })
    });

    assert.equal(result.bytes, 'glTF mock glb payload'.length);
    assert.equal(result.host, 'global-public.realsee-cdn.com');
    assert.equal(await readFile(outputPath, 'utf8'), 'glTF mock glb payload');
    await assert.rejects(() => stat(`${outputPath}.tmp`), /ENOENT/);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test('downloadArgusGlb ignores stale temp file from previous run', async () => {
  const runDir = await mkdtemp(join(tmpdir(), 'argus-downloader-'));
  const outputPath = join(runDir, 'output.glb');
  try {
    await writeFile(`${outputPath}.tmp`, 'stale partial download');

    const result = await downloadArgusGlb({
      url: 'https://global-public.realsee-cdn.com/a.glb',
      outputPath,
      transport: async () => ({
        statusCode: 200,
        headers: {},
        body: Buffer.from('glTF fresh payload')
      })
    });

    assert.equal(result.bytes, 'glTF fresh payload'.length);
    assert.equal(await readFile(outputPath, 'utf8'), 'glTF fresh payload');
    assert.equal(await readFile(`${outputPath}.tmp`, 'utf8'), 'stale partial download');
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test('downloadArgusGlb rejects empty or invalid glb responses', async () => {
  const runDir = await mkdtemp(join(tmpdir(), 'argus-downloader-'));
  try {
    for (const body of [Buffer.alloc(0), Buffer.from('not a glb')]) {
      await assert.rejects(
        () => downloadArgusGlb({
          url: 'https://global-public.realsee-cdn.com/a.glb',
          outputPath: join(runDir, 'output.glb'),
          transport: async () => ({
            statusCode: 200,
            headers: {},
            body
          })
        }),
        /empty|GLB/
      );
    }
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

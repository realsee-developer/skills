import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateImageFiles } from '../src/input.mjs';

const examplesRoot = fileURLToPath(new URL('../examples/', import.meta.url));
const manifestPath = join(examplesRoot, 'manifest.json');
const expectedSets = {
  cn: { count: 12, width: 16000, height: 8000, totalBytes: 52930848 },
  global: { count: 14, width: 8000, height: 4000, totalBytes: 85757861 }
};
const allowedSourceHosts = new Set([
  'vr-public.realsee-cdn.cn',
  'global-public.realsee-cdn.com'
]);

test('bundled first-party examples match their manifest and Argus input contract', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.provenance.owner, 'Realsee');
  assert.equal(manifest.provenance.kind, 'first_party_official_samples');
  assert.equal(manifest.provenance.third_party_open_source, false);
  assert.equal(JSON.stringify(manifest).includes(['source', 'page'].join('_')), false);
  assert.equal(JSON.stringify(manifest).includes(['/wander', 'project_id='].join('?')), false);
  assert.deepEqual(Object.keys(manifest.sets).sort(), Object.keys(expectedSets).sort());

  const allDigests = new Set();
  for (const [setName, expected] of Object.entries(expectedSets)) {
    const set = manifest.sets[setName];
    const directory = join(examplesRoot, setName);
    const actualNames = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    const manifestNames = set.files.map((file) => file.name).sort();

    assert.equal(set.region, setName);
    assert.equal(set.count, expected.count);
    assert.equal(set.files.length, expected.count);
    assert.equal(set.width, expected.width);
    assert.equal(set.height, expected.height);
    assert.equal(set.total_bytes, expected.totalBytes);
    assert.deepEqual(actualNames, manifestNames);

    const paths = set.files.map((file) => join(directory, file.name));
    const validated = await validateImageFiles(paths);
    assert.equal(validated.images.length, expected.count);
    assert.deepEqual(validated.warnings, []);
    assert.ok(validated.images.every((image) => image.format === 'jpeg'));
    assert.ok(validated.images.every((image) => image.width === expected.width));
    assert.ok(validated.images.every((image) => image.height === expected.height));
    assert.ok(validated.images.every((image) => image.channels === 3));
    assert.ok(validated.images.every((image) => image.bitDepth === 8));

    let totalBytes = 0;
    for (const file of set.files) {
      assert.match(file.name, /^pano\d{2}\.jpg$/u);
      assert.equal(allowedSourceHosts.has(new URL(file.source_url).hostname), true);

      const path = join(directory, file.name);
      const fileStat = await stat(path);
      assert.equal(fileStat.isFile(), true);
      assert.equal(fileStat.size, file.bytes);
      assert.equal(await sha256File(path), file.sha256);
      assert.equal(allDigests.has(file.sha256), false, `duplicate sample digest: ${file.sha256}`);
      allDigests.add(file.sha256);
      totalBytes += file.bytes;
    }
    assert.equal(totalBytes, expected.totalBytes);
  }

  assert.equal(allDigests.size, 26);
});

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

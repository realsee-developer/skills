import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

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

test('official example manifest is complete without bundling panorama JPEGs', async () => {
  const manifestText = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.provenance.owner, 'Realsee');
  assert.equal(manifest.provenance.kind, 'first_party_official_samples');
  assert.equal(manifest.provenance.third_party_open_source, false);
  assert.equal(manifestText.includes(['source', 'page'].join('_')), false);
  assert.equal(manifestText.includes(['/wander', 'project_id='].join('?')), false);
  assert.deepEqual(Object.keys(manifest.sets).sort(), Object.keys(expectedSets).sort());
  assert.deepEqual(await readdir(examplesRoot), ['manifest.json']);

  const allDigests = new Set();
  for (const [setName, expected] of Object.entries(expectedSets)) {
    const set = manifest.sets[setName];
    assert.equal(set.region, setName);
    assert.equal(set.count, expected.count);
    assert.equal(set.files.length, expected.count);
    assert.equal(set.width, expected.width);
    assert.equal(set.height, expected.height);
    assert.equal(set.total_bytes, expected.totalBytes);

    let totalBytes = 0;
    const names = new Set();
    for (const file of set.files) {
      assert.match(file.name, /^pano\d{2}\.jpg$/u);
      assert.equal(names.has(file.name), false, `duplicate sample name: ${setName}/${file.name}`);
      names.add(file.name);

      const sourceUrl = new URL(file.source_url);
      assert.equal(sourceUrl.protocol, 'https:');
      assert.equal(allowedSourceHosts.has(sourceUrl.hostname), true);
      assert.equal(sourceUrl.search, '');
      assert.equal(sourceUrl.hash, '');
      assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0);
      assert.match(file.sha256, /^[a-f0-9]{64}$/u);
      assert.equal(allDigests.has(file.sha256), false, `duplicate sample digest: ${file.sha256}`);
      allDigests.add(file.sha256);
      totalBytes += file.bytes;
    }
    assert.equal(totalBytes, expected.totalBytes);
  }

  assert.equal(allDigests.size, 26);
});

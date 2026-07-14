import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

const brandRoot = fileURLToPath(new URL('../assets/brand/', import.meta.url));
const manifestPath = join(brandRoot, 'manifest.json');
const cdnBaseUrl = 'https://global-static.realsee-cdn.com/release/web/argus/assets/';
const expectedFiles = [
  'argus-logo-color.png',
  'argus-mark-color.png',
  'argus-paper-teaser.png',
  'product-ai-powered.jpg',
  'product-gimbal.jpg',
  'product-tour-editor.jpg',
  'realsee3d-overview.png'
];

test('bundled Argus brand assets match the official manifest', async () => {
  const manifestText = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.official_site, 'https://argus.realsee.ai/');
  assert.equal(manifest.provenance.owner, 'Realsee');
  assert.equal(manifest.provenance.kind, 'first_party_official_brand_assets');
  assert.equal(manifest.cdn.host, 'global-static.realsee-cdn.com');
  assert.equal(manifest.cdn.base_url, cdnBaseUrl);
  for (const forbidden of [
    ['source', 'page'].join('_'),
    ['mix', 'realsee'].join('.'),
    ['/wan', 'der'].join(''),
    ['project', 'id'].join('_')
  ]) {
    assert.equal(manifestText.includes(forbidden), false);
  }

  const actualFiles = (await readdir(brandRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name !== 'manifest.json')
    .sort();
  const manifestFiles = manifest.files.map((file) => file.name).sort();
  assert.deepEqual(actualFiles, expectedFiles);
  assert.deepEqual(manifestFiles, expectedFiles);

  const digests = new Set();
  for (const file of manifest.files) {
    assert.match(file.name, /\.(?:jpg|png)$/u);
    assert.equal(file.source_url, `${cdnBaseUrl}${file.name}`);

    const sourceUrl = new URL(file.source_url);
    assert.equal(sourceUrl.protocol, 'https:');
    assert.equal(sourceUrl.hostname, 'global-static.realsee-cdn.com');
    assert.equal(sourceUrl.search, '');
    assert.equal(sourceUrl.hash, '');

    const path = join(brandRoot, file.name);
    const fileStat = await stat(path);
    assert.equal(fileStat.isFile(), true);
    assert.equal(fileStat.size, file.bytes);

    const metadata = readImageMetadata(await readFile(path));
    assert.equal(metadata.format, file.format);
    assert.equal(metadata.width, file.width);
    assert.equal(metadata.height, file.height);

    assert.match(file.sha256, /^[a-f0-9]{64}$/u);
    assert.equal(await sha256File(path), file.sha256);
    assert.equal(digests.has(file.sha256), false, `duplicate brand asset digest: ${file.sha256}`);
    digests.add(file.sha256);
  }

  assert.equal(digests.size, expectedFiles.length);
});

function readImageMetadata(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    assert.equal(buffer.subarray(12, 16).toString('ascii'), 'IHDR');
    return {
      format: 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    const dimensions = readJpegDimensions(buffer);
    return { format: 'jpeg', ...dimensions };
  }

  assert.fail('unsupported image magic');
}

function readJpegDimensions(buffer) {
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
  ]);
  let offset = 2;

  while (offset + 4 <= buffer.length) {
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    const segmentLength = buffer.readUInt16BE(offset);
    assert.ok(segmentLength >= 2, 'invalid JPEG segment length');
    if (startOfFrameMarkers.has(marker)) {
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3)
      };
    }

    if (marker === 0xda) break;
    offset += segmentLength;
  }

  assert.fail('JPEG start-of-frame marker not found');
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

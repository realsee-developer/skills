import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInputZip } from '../src/archive.mjs';
import { inspectPanoramaImage, validateImageFiles } from '../src/input.mjs';
import { buildJpegFrame, buildPngHeader, buildWebpVp8x } from './helpers/images.mjs';
import { writeStoredZip } from './helpers/zip.mjs';

test('accepts one JPEG, PNG, and WebP strict 2:1 RGB8 panorama', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-formats-'));
  try {
    const fixtures = [
      ['one.jpg', buildJpegFrame(4096, 2048), 'jpeg'],
      ['two.png', buildPngHeader(4096, 2048), 'png'],
      ['three.webp', buildWebpVp8x(4096, 2048), 'webp']
    ];
    for (const [name, bytes, format] of fixtures) {
      const path = join(root, name);
      await writeFile(path, bytes);
      const image = await inspectPanoramaImage(path);
      assert.equal(image.format, format);
      assert.equal(image.width, 4096);
      assert.equal(image.height, 2048);
      assert.equal(image.channels, 3);
      assert.equal(image.bitDepth, 8);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('accepts 99 images, rejects 100 before reading files, and sorts by NFC UTF-8 bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-count-'));
  try {
    const paths = [];
    for (let index = 98; index >= 0; index -= 1) {
      const path = join(root, `${String(index).padStart(6, '0')}.jpg`);
      await writeFile(path, buildJpegFrame(2048, 1024));
      paths.push(path);
    }
    const validated = await validateImageFiles(paths);
    assert.equal(validated.images.length, 99);
    assert.equal(validated.images[0].filename, '000000.jpg');
    assert.equal(validated.images[98].filename, '000098.jpg');
    await assert.rejects(
      () => validateImageFiles(Array.from({ length: 100 }, (_, index) => `/missing/${index}.jpg`)),
      /1\.\.99 images; got 100/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('strictly rejects square and non-2:1 images, non-RGB channels, alpha, and non-8-bit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-invalid-'));
  const cases = [
    ['square.jpg', buildJpegFrame(1024, 1024), /v1\.0\.2/],
    ['ratio.jpg', buildJpegFrame(4096, 2050), /strict 2:1/],
    ['gray.jpg', buildJpegFrame(4096, 2048, { channels: 1 }), /exactly 3 RGB channels/],
    ['rgba.png', buildPngHeader(4096, 2048, { colorType: 6 }), /exactly 3 RGB channels/],
    ['deep.png', buildPngHeader(4096, 2048, { bitDepth: 16 }), /must be 8-bit/],
    ['alpha.webp', buildWebpVp8x(4096, 2048, { alpha: true }), /exactly 3 RGB channels/]
  ];
  try {
    for (const [name, bytes, pattern] of cases) {
      const path = join(root, name);
      await writeFile(path, bytes);
      await assert.rejects(() => inspectPanoramaImage(path), pattern);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resolution below 2048x1024 is a warning, not a failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-warning-'));
  try {
    const path = join(root, 'small.jpg');
    await writeFile(path, buildJpegFrame(1024, 512));
    const validated = await validateImageFiles([path]);
    assert.equal(validated.images.length, 1);
    assert.equal(validated.warnings[0].code, 'LOW_RESOLUTION');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects duplicate stems and NFC/case-fold filename collisions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-names-'));
  try {
    const jpg = join(root, 'Room.jpg');
    const png = join(root, 'Room.png');
    const folded = join(root, 'room.webp');
    const decomposed = join(root, 'e\u0301.jpg');
    const composed = join(root, 'é.png');
    await writeFile(jpg, buildJpegFrame(2048, 1024));
    await writeFile(png, buildPngHeader(2048, 1024));
    await writeFile(folded, buildWebpVp8x(2048, 1024));
    await writeFile(decomposed, buildJpegFrame(2048, 1024));
    await writeFile(composed, buildPngHeader(2048, 1024));
    await assert.rejects(() => validateImageFiles([jpg, png]), /Duplicate panorama filename stem/);
    await assert.rejects(() => validateImageFiles([jpg, folded]), /Case-folding filename collision/);
    await assert.rejects(() => validateImageFiles([decomposed, composed]), /Duplicate panorama filename stem/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('uses Unicode full case folding for filename stem collisions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-full-case-fold-'));
  try {
    const collisionPairs = [
      ['Straße.jpg', buildJpegFrame(2048, 1024), 'STRASSE.png', buildPngHeader(2048, 1024)],
      ['STRAẞE.webp', buildWebpVp8x(2048, 1024), 'strasse.png', buildPngHeader(2048, 1024)],
      ['ΟΣ.jpg', buildJpegFrame(2048, 1024), 'οσ.png', buildPngHeader(2048, 1024)],
      ['ﬃ.jpg', buildJpegFrame(2048, 1024), 'FFI.png', buildPngHeader(2048, 1024)],
      ['Ꭰ.jpg', buildJpegFrame(2048, 1024), 'ꭰ.png', buildPngHeader(2048, 1024)]
    ];
    for (const [leftName, leftBytes, rightName, rightBytes] of collisionPairs) {
      const left = join(root, leftName);
      const right = join(root, rightName);
      await writeFile(left, leftBytes);
      await writeFile(right, rightBytes);
      await assert.rejects(
        () => validateImageFiles([left, right]),
        /Case-folding filename collision/
      );
    }

    const dotless = join(root, 'ı.webp');
    const dotted = join(root, 'i.jpg');
    await writeFile(dotless, buildWebpVp8x(2048, 1024));
    await writeFile(dotted, buildJpegFrame(2048, 1024));
    assert.equal((await validateImageFiles([dotless, dotted])).images.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ZIP mode rejects nested, traversal, encrypted, duplicate, corrupt CRC, and damaged archives', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-zip-invalid-'));
  const image = buildJpegFrame(2048, 1024);
  const cases = [
    ['nested.zip', [{ name: 'folder/one.jpg', data: image }], /archive root|root-level|root files/i],
    ['traversal.zip', [{ name: '../one.jpg', data: image }], /traversal|unsafe|absolute|relative path/i],
    ['encrypted.zip', [{
      name: 'one.jpg',
      data: image,
      storedData: Buffer.concat([Buffer.alloc(12), image]),
      flags: 0x0801
    }], /encrypted/i],
    ['duplicate.zip', [{ name: 'one.jpg', data: image }, { name: 'ONE.jpg', data: image }], /collision|duplicate/i],
    ['full-fold.zip', [{ name: 'Straße.jpg', data: image }, { name: 'STRASSE.jpg', data: image }], /collision|duplicate/i],
    ['crc.zip', [{ name: 'one.jpg', data: image, crc32: 1 }], /CRC/i]
  ];
  try {
    for (const [name, entries, pattern] of cases) {
      const input = join(root, name);
      await writeStoredZip(input, entries);
      await assert.rejects(
        () => normalizeInputZip(input, join(root, `${name}.stage`), join(root, `${name}.normalized`)),
        pattern
      );
    }
    const damaged = join(root, 'damaged.zip');
    await writeFile(damaged, Buffer.from('not a zip'));
    await assert.rejects(
      () => normalizeInputZip(damaged, join(root, 'damaged-stage'), join(root, 'damaged-normalized')),
      /ZIP|central directory|end of central/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ZIP input is safely normalized and repacked byte-for-byte deterministically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-zip-normalize-'));
  try {
    const input = join(root, 'input.zip');
    await writeStoredZip(input, [
      { name: 'z.webp', data: buildWebpVp8x(2048, 1024) },
      { name: 'a.jpg', data: buildJpegFrame(2048, 1024) }
    ]);
    const first = join(root, 'first.zip');
    const second = join(root, 'second.zip');
    const one = await normalizeInputZip(input, join(root, 'stage-one'), first);
    const two = await normalizeInputZip(input, join(root, 'stage-two'), second);
    assert.deepEqual(one.images.map((image) => image.filename), ['a.jpg', 'z.webp']);
    assert.equal(one.sha256, two.sha256);
    assert.deepEqual(await readFile(first), await readFile(second));
    assert.equal(createHash('sha256').update(await readFile(first)).digest('hex'), one.sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ZIP extraction rejects bomb-like compression ratios and insufficient disk budgets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-zip-bomb-'));
  try {
    const expanded = Buffer.concat([buildJpegFrame(2048, 1024), Buffer.alloc(1024 * 1024)]);
    const bomb = join(root, 'bomb.zip');
    await writeStoredZip(bomb, [{
      name: 'one.jpg',
      data: expanded,
      storedData: deflateRawSync(expanded),
      method: 8
    }]);
    await assert.rejects(
      () => normalizeInputZip(bomb, join(root, 'bomb-stage'), join(root, 'bomb-normalized')),
      /compression-?ratio/i
    );

    const ordinary = join(root, 'ordinary.zip');
    await writeStoredZip(ordinary, [{ name: 'one.jpg', data: buildJpegFrame(2048, 1024) }]);
    await assert.rejects(
      () => normalizeInputZip(
        ordinary,
        join(root, 'disk-stage'),
        join(root, 'disk-normalized'),
        { availableBytes: 0 }
      ),
      /Insufficient disk space/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

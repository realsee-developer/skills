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

test('accepts JPEG, PNG, and WebP RGB8 panoramas and pinhole images', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-formats-'));
  try {
    const fixtures = [
      ['one.jpg', buildJpegFrame(4096, 2048), 'jpeg', 4096, 2048],
      ['two.png', buildPngHeader(4096, 2048), 'png', 4096, 2048],
      ['three.webp', buildWebpVp8x(4096, 2048), 'webp', 4096, 2048],
      ['square.jpg', buildJpegFrame(1024, 1024), 'jpeg', 1024, 1024],
      ['square.png', buildPngHeader(2048, 2048), 'png', 2048, 2048],
      ['square.webp', buildWebpVp8x(1536, 1536), 'webp', 1536, 1536]
    ];
    for (const [name, bytes, format, width, height] of fixtures) {
      const path = join(root, name);
      await writeFile(path, bytes);
      const image = await inspectPanoramaImage(path);
      assert.equal(image.format, format);
      assert.equal(image.width, width);
      assert.equal(image.height, height);
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

test('accepts a homogeneous pinhole batch without applying panorama resolution warnings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-pinhole-batch-'));
  try {
    const files = [
      ['c.webp', buildWebpVp8x(1536, 1536)],
      ['a.jpg', buildJpegFrame(1024, 1024)],
      ['b.png', buildPngHeader(2048, 2048)]
    ];
    for (const [name, bytes] of files) await writeFile(join(root, name), bytes);
    const result = await validateImageFiles(files.map(([name]) => join(root, name)));
    assert.deepEqual(result.images.map((image) => image.filename), ['a.jpg', 'b.png', 'c.webp']);
    assert.ok(result.images.every((image) => image.width === image.height));
    assert.deepEqual(result.warnings, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects mixed panorama/pinhole batches for loose files and ZIP inputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-mixed-batch-'));
  try {
    const pano = join(root, 'pano.jpg');
    const pinhole = join(root, 'pinhole.png');
    await writeFile(pano, buildJpegFrame(2048, 1024));
    await writeFile(pinhole, buildPngHeader(1024, 1024));
    for (const files of [[pano, pinhole], [pinhole, pano]]) {
      await assert.rejects(() => validateImageFiles(files), /Submit mixed image types as separate batches/);
    }
    const input = join(root, 'mixed.zip');
    const normalized = join(root, 'normalized.zip');
    await writeStoredZip(input, [
      { name: 'pano.jpg', data: await readFile(pano) },
      { name: 'pinhole.png', data: await readFile(pinhole) }
    ]);
    await assert.rejects(
      () => normalizeInputZip(input, join(root, 'stage'), normalized),
      /Submit mixed image types as separate batches/
    );
    await assert.rejects(() => readFile(normalized), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects unsupported aspect ratios, non-RGB channels, alpha, and non-8-bit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-invalid-'));
  const cases = [
    ['near-pano.jpg', buildJpegFrame(4096, 2050), /exact 2:1 panorama or 1:1 pinhole/],
    ['near-square.jpg', buildJpegFrame(1024, 1023), /exact 2:1 panorama or 1:1 pinhole/],
    ['portrait.jpg', buildJpegFrame(1024, 2048), /exact 2:1 panorama or 1:1 pinhole/],
    ['gray.jpg', buildJpegFrame(4096, 2048, { channels: 1 }), /exactly 3 RGB channels/],
    ['rgba.png', buildPngHeader(4096, 2048, { colorType: 6 }), /exactly 3 RGB channels/],
    ['deep.png', buildPngHeader(4096, 2048, { bitDepth: 16 }), /must be 8-bit/],
    ['alpha.webp', buildWebpVp8x(4096, 2048, { alpha: true }), /exactly 3 RGB channels/],
    ['square-gray.jpg', buildJpegFrame(1024, 1024, { channels: 1 }), /exactly 3 RGB channels/],
    ['square-rgba.png', buildPngHeader(1024, 1024, { colorType: 6 }), /exactly 3 RGB channels/],
    ['square-deep.png', buildPngHeader(1024, 1024, { bitDepth: 16 }), /must be 8-bit/]
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
    await assert.rejects(() => validateImageFiles([jpg, png]), /Duplicate image filename stem/);
    await assert.rejects(() => validateImageFiles([jpg, folded]), /Case-folding filename collision/);
    await assert.rejects(() => validateImageFiles([decomposed, composed]), /Duplicate image filename stem/);
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

test('normalizes a multi-pinhole ZIP without changing image contents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-pinhole-zip-'));
  try {
    const input = join(root, 'input.zip');
    const firstImage = buildJpegFrame(1024, 1024);
    const secondImage = buildWebpVp8x(2048, 2048);
    await writeStoredZip(input, [
      { name: 'z.webp', data: secondImage },
      { name: 'a.jpg', data: firstImage }
    ]);
    const first = await normalizeInputZip(input, join(root, 'stage-one'), join(root, 'first.zip'));
    const second = await normalizeInputZip(input, join(root, 'stage-two'), join(root, 'second.zip'));
    assert.deepEqual(first.images.map((image) => image.filename), ['a.jpg', 'z.webp']);
    assert.ok(first.images.every((image) => image.width === image.height));
    assert.deepEqual(await readFile(first.images[0].path), firstImage);
    assert.deepEqual(await readFile(first.images[1].path), secondImage);
    assert.equal(first.sha256, second.sha256);
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

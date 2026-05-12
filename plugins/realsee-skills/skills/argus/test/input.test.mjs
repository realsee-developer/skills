import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ASPECT_RATIO_BOUNDS,
  assertInputTypeMatchesDimensions,
  assertJpeg,
  detectInputTypeFromDimensions,
  mapInputType,
  readJpegDimensions
} from '../src/input.mjs';
import { buildJpegWithApp0, buildJpegWithDimensions } from './helpers/jpeg.mjs';

test('maps image input type', () => {
  assert.deepEqual(mapInputType('image'), {
    inputType: 'image',
    vggtType: 'pinhole',
    previewType: 'image'
  });
});

test('maps panorama input type', () => {
  assert.deepEqual(mapInputType('panorama'), {
    inputType: 'panorama',
    vggtType: 'pano',
    previewType: 'panorama'
  });
});

test('rejects invalid input type', () => {
  assert.throws(() => mapInputType('video'), /inputType.*image.*panorama/);
});

test('accepts jpeg magic bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-input-'));
  try {
    const file = join(root, 'image.jpg');
    await writeFile(file, Buffer.from([0xff, 0xd8, 0xff, 0x00]));

    const stat = await assertJpeg(file);

    assert.equal(stat.isFile(), true);
    assert.equal(stat.size, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects non-jpeg magic bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-input-'));
  try {
    const file = join(root, 'not-image.txt');
    await writeFile(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    await assert.rejects(() => assertJpeg(file), /JPEG.*magic/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readJpegDimensions reads width/height from SOF0', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-jpeg-'));
  try {
    const file = join(root, 'photo.jpg');
    await writeFile(file, buildJpegWithDimensions(4096, 2048));
    assert.deepEqual(await readJpegDimensions(file), { width: 4096, height: 2048 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readJpegDimensions skips APP0 and reads SOF0 dimensions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-jpeg-'));
  try {
    const file = join(root, 'photo.jpg');
    await writeFile(file, buildJpegWithApp0(1920, 1080));
    assert.deepEqual(await readJpegDimensions(file), { width: 1920, height: 1080 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readJpegDimensions rejects non-JPEG input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'argus-jpeg-'));
  try {
    const file = join(root, 'not-jpeg.bin');
    await writeFile(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await assert.rejects(() => readJpegDimensions(file), /JPEG/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('aspect-ratio bounds are 2:1 ±0.05 and 1:1 ±0.05', () => {
  assert.equal(ASPECT_RATIO_BOUNDS.panorama.target, 2.0);
  assert.equal(ASPECT_RATIO_BOUNDS.panorama.min, 1.95);
  assert.equal(ASPECT_RATIO_BOUNDS.panorama.max, 2.05);
  assert.equal(ASPECT_RATIO_BOUNDS.image.target, 1.0);
  assert.equal(ASPECT_RATIO_BOUNDS.image.min, 0.95);
  assert.equal(ASPECT_RATIO_BOUNDS.image.max, 1.05);
});

test('detectInputTypeFromDimensions picks panorama for 2:1 within tolerance', () => {
  assert.equal(detectInputTypeFromDimensions({ width: 4096, height: 2048 }), 'panorama');
  assert.equal(detectInputTypeFromDimensions({ width: 8000, height: 4000 }), 'panorama');
  assert.equal(detectInputTypeFromDimensions({ width: 3900, height: 2000 }), 'panorama'); // 1.950 exactly
  assert.equal(detectInputTypeFromDimensions({ width: 4100, height: 2000 }), 'panorama'); // 2.050 exactly
});

test('detectInputTypeFromDimensions picks image for 1:1 within tolerance', () => {
  assert.equal(detectInputTypeFromDimensions({ width: 1024, height: 1024 }), 'image');
  assert.equal(detectInputTypeFromDimensions({ width: 2048, height: 2048 }), 'image');
  assert.equal(detectInputTypeFromDimensions({ width: 1000, height: 1050 }), 'image'); // 0.952
  assert.equal(detectInputTypeFromDimensions({ width: 1050, height: 1000 }), 'image'); // 1.050
});

test('detectInputTypeFromDimensions rejects anything that is neither 2:1 nor 1:1', () => {
  assert.throws(() => detectInputTypeFromDimensions({ width: 1920, height: 1080 }), /Unsupported aspect ratio.*2:1.*1:1/s);  // 16:9
  assert.throws(() => detectInputTypeFromDimensions({ width: 4000, height: 3000 }), /Unsupported aspect ratio/);             // 4:3
  assert.throws(() => detectInputTypeFromDimensions({ width: 3000, height: 2000 }), /Unsupported aspect ratio/);             // 3:2
  assert.throws(() => detectInputTypeFromDimensions({ width: 5000, height: 2000 }), /Unsupported aspect ratio/);             // 2.5:1
  assert.throws(() => detectInputTypeFromDimensions({ width: 1200, height: 1000 }), /Unsupported aspect ratio/);             // 1.2:1 — outside ±0.05
});

test('detectInputTypeFromDimensions rejects invalid input', () => {
  assert.throws(() => detectInputTypeFromDimensions({ width: 0, height: 100 }), /dimensions/);
  assert.throws(() => detectInputTypeFromDimensions({ width: 100, height: -1 }), /dimensions/);
  assert.throws(() => detectInputTypeFromDimensions({ width: NaN, height: 100 }), /dimensions/);
  assert.throws(() => detectInputTypeFromDimensions({}), /dimensions/);
});

test('assertInputTypeMatchesDimensions accepts matching pairs', () => {
  // panorama on 2:1
  assert.doesNotThrow(() => assertInputTypeMatchesDimensions('panorama', { width: 4096, height: 2048 }));
  // image on 1:1
  assert.doesNotThrow(() => assertInputTypeMatchesDimensions('image', { width: 1024, height: 1024 }));
});

test('assertInputTypeMatchesDimensions rejects mismatched pairs', () => {
  assert.throws(
    () => assertInputTypeMatchesDimensions('panorama', { width: 1024, height: 1024 }),
    /--type panorama.*2:1/
  );
  assert.throws(
    () => assertInputTypeMatchesDimensions('image', { width: 4096, height: 2048 }),
    /--type image.*1:1/
  );
  assert.throws(
    () => assertInputTypeMatchesDimensions('panorama', { width: 1920, height: 1080 }),
    /--type panorama.*2:1/
  );
});

test('assertInputTypeMatchesDimensions rejects invalid input type', () => {
  assert.throws(
    () => assertInputTypeMatchesDimensions('video', { width: 100, height: 100 }),
    /inputType.*image.*panorama/
  );
});

import { open } from 'node:fs/promises';
import { basename, extname } from 'node:path';

const SUPPORTED_PANORAMA_EXTENSIONS = new Map([
  ['.jpg', 'jpeg'],
  ['.jpeg', 'jpeg'],
  ['.png', 'png'],
  ['.webp', 'webp']
]);

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

/**
 * Inspect one image that will be placed at the root of an Argus input ZIP.
 * The optional archiveName lets callers validate an extracted ZIP entry while
 * keeping its archive-facing name separate from its temporary local path.
 */
export async function inspectPanoramaImage(path, options = {}) {
  const archiveName = normalizeArchiveFileName(options.archiveName ?? options.name ?? basename(path));
  const extension = extname(archiveName).toLowerCase();
  const expectedFormat = SUPPORTED_PANORAMA_EXTENSIONS.get(extension);
  if (!expectedFormat) {
    throw new Error(
      `Unsupported panorama image extension for "${archiveName}". Expected JPEG, PNG, or WebP.`
    );
  }

  const handle = await open(path, 'r');
  let stat;
  let prefix;
  try {
    stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error(`Expected panorama image but path is not a regular file: ${path}`);
    }
    prefix = Buffer.alloc(Math.min(32, stat.size));
    const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
    prefix = prefix.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }

  const detectedFormat = detectImageFormat(prefix);
  if (!detectedFormat) {
    throw new Error(`Unsupported or invalid image magic for "${archiveName}".`);
  }
  if (detectedFormat !== expectedFormat) {
    throw new Error(
      `Image extension/magic mismatch for "${archiveName}": extension is ${expectedFormat}, bytes are ${detectedFormat}.`
    );
  }

  let metadata;
  if (detectedFormat === 'jpeg') {
    metadata = await readJpegFrameMetadata(path);
  } else if (detectedFormat === 'png') {
    metadata = await readPngMetadata(path);
  } else {
    metadata = await readWebpMetadata(path);
  }

  if (metadata.bitDepth !== 8) {
    throw new Error(
      `Argus panorama images must be 8-bit; "${archiveName}" is ${metadata.bitDepth}-bit.`
    );
  }
  if (metadata.channels !== 3) {
    throw new Error(
      `Argus panorama images must have exactly 3 RGB channels; "${archiveName}" has ${metadata.channels}.`
    );
  }
  if (metadata.width === metadata.height) {
    throw new Error(
      `Square 1:1 image "${archiveName}" belongs to the legacy single-image Argus v1.0.2 flow; ` +
        'the multi-panorama input requires a strict 2:1 image.'
    );
  }
  if (metadata.width !== metadata.height * 2) {
    throw new Error(
      `Argus panorama images require a strict 2:1 aspect ratio; "${archiveName}" is ` +
        `${metadata.width}x${metadata.height}.`
    );
  }

  const stem = archiveName.slice(0, archiveName.length - extension.length);
  if (!stem) {
    throw new Error(`Panorama image filename must have a non-empty stem: "${archiveName}".`);
  }
  const warnings = [];
  if (metadata.width < 2048 || metadata.height < 1024) {
    warnings.push({
      code: 'LOW_RESOLUTION',
      filename: archiveName,
      width: metadata.width,
      height: metadata.height,
      message: `Recommended panorama resolution is at least 2048x1024; got ${metadata.width}x${metadata.height}.`
    });
  }

  return {
    path,
    name: archiveName,
    filename: archiveName,
    stem,
    format: detectedFormat,
    width: metadata.width,
    height: metadata.height,
    channels: metadata.channels,
    bitDepth: metadata.bitDepth,
    bytes: stat.size,
    warnings
  };
}

/**
 * Validate and deterministically order all image files for one Argus input.
 * Entries may be absolute path strings or { path, archiveName } objects.
 */
export async function validateImageFiles(files, options = {}) {
  const minImages = options.minImages ?? 1;
  const maxImages = options.maxImages ?? 99;
  if (!Array.isArray(files)) {
    throw new Error('Argus panorama input files must be an array.');
  }
  if (files.length < minImages || files.length > maxImages) {
    throw new Error(
      `Argus panorama input requires ${minImages}..${maxImages} images; got ${files.length}.`
    );
  }

  const images = [];
  for (const item of files) {
    if (typeof item === 'string') {
      images.push(await inspectPanoramaImage(item));
      continue;
    }
    if (!item || typeof item !== 'object' || typeof item.path !== 'string') {
      throw new Error('Each Argus panorama input must be a path or { path, archiveName } object.');
    }
    images.push(await inspectPanoramaImage(item.path, {
      archiveName: item.archiveName ?? item.name
    }));
  }

  const exactStems = new Map();
  const foldedStems = new Map();
  for (const image of images) {
    const priorExact = exactStems.get(image.stem);
    if (priorExact) {
      throw new Error(
        `Duplicate panorama filename stem "${image.stem}" in "${priorExact}" and "${image.filename}".`
      );
    }
    exactStems.set(image.stem, image.filename);

    const folded = caseFold(image.stem);
    const priorFolded = foldedStems.get(folded);
    if (priorFolded) {
      throw new Error(
        `Case-folding filename collision between "${priorFolded}" and "${image.filename}".`
      );
    }
    foldedStems.set(folded, image.filename);
  }

  images.sort((left, right) => compareUtf8(left.filename, right.filename));
  return {
    images,
    warnings: images.flatMap((image) => image.warnings)
  };
}

function normalizeArchiveFileName(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Panorama image archive name must be a non-empty string.');
  }
  if (value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new Error(`Panorama image must be a root-level file with a safe name: "${value}".`);
  }
  if (CONTROL_CHARACTER.test(value)) {
    throw new Error(`Panorama image filename contains a control character: ${JSON.stringify(value)}.`);
  }
  const normalized = value.normalize('NFC');
  if (Buffer.byteLength(normalized, 'utf8') > 0xffff) {
    throw new Error(`Panorama image filename is too long for ZIP: "${value}".`);
  }
  return normalized;
}

function caseFold(value) {
  return value.normalize('NFC').toLocaleLowerCase('und');
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function detectImageFormat(prefix) {
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) {
    return 'jpeg';
  }
  if (
    prefix.length >= 8 &&
    prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    prefix.length >= 12 &&
    prefix.subarray(0, 4).toString('ascii') === 'RIFF' &&
    prefix.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

async function readJpegFrameMetadata(path) {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error(`Expected JPEG file but path is not a regular file: ${path}`);
    }

    const soi = Buffer.alloc(2);
    const soiRead = await handle.read(soi, 0, 2, 0);
    if (soiRead.bytesRead !== 2 || soi[0] !== 0xff || soi[1] !== 0xd8) {
      throw new Error(`Invalid JPEG magic for file: ${path}`);
    }

    let offset = 2;
    while (offset + 4 <= stat.size) {
      const head = Buffer.alloc(4);
      const headRead = await handle.read(head, 0, 4, offset);
      if (headRead.bytesRead !== 4) break;
      if (head[0] !== 0xff) {
        throw new Error(`Bad JPEG marker at offset ${offset} in ${path}`);
      }
      let markerByteIndex = 1;
      while (head[markerByteIndex] === 0xff && markerByteIndex < head.length) {
        markerByteIndex += 1;
      }
      if (markerByteIndex >= head.length) {
        offset += markerByteIndex;
        continue;
      }
      const marker = head[markerByteIndex];
      const markerOffset = offset + markerByteIndex - 1;

      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset = markerOffset + 2;
        continue;
      }

      const segmentLen = head.readUInt16BE(markerByteIndex + 1);
      if (segmentLen < 2) {
        throw new Error(`Invalid JPEG segment length ${segmentLen} at offset ${markerOffset} in ${path}`);
      }

      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const sof = Buffer.alloc(6);
        const sofRead = await handle.read(sof, 0, sof.length, markerOffset + 4);
        if (sofRead.bytesRead !== sof.length) {
          throw new Error(`Truncated SOF marker at offset ${markerOffset} in ${path}`);
        }
        const bitDepth = sof[0];
        const height = sof.readUInt16BE(1);
        const width = sof.readUInt16BE(3);
        const channels = sof[5];
        if (width <= 0 || height <= 0) {
          throw new Error(`Invalid SOF dimensions ${width}x${height} at offset ${markerOffset} in ${path}`);
        }
        return { width, height, bitDepth, channels };
      }

      offset = markerOffset + 2 + segmentLen;
    }
    throw new Error(`JPEG SOF marker not found in ${path}`);
  } finally {
    await handle.close();
  }
}

async function readPngMetadata(path) {
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(29);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length || !header.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )) {
      throw new Error(`Invalid or truncated PNG header in ${path}`);
    }
    if (header.readUInt32BE(8) !== 13 || header.subarray(12, 16).toString('ascii') !== 'IHDR') {
      throw new Error(`PNG IHDR must be the first chunk in ${path}`);
    }
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    const bitDepth = header[24];
    const colorType = header[25];
    const channelsByColorType = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);
    const channels = channelsByColorType.get(colorType);
    if (!width || !height || channels === undefined) {
      throw new Error(`Invalid PNG IHDR metadata in ${path}`);
    }
    return { width, height, bitDepth, channels };
  } finally {
    await handle.close();
  }
}

async function readWebpMetadata(path) {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    const riff = Buffer.alloc(12);
    const riffRead = await handle.read(riff, 0, riff.length, 0);
    if (
      riffRead.bytesRead !== riff.length ||
      riff.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      riff.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      throw new Error(`Invalid WebP RIFF header in ${path}`);
    }
    const declaredRiffSize = riff.readUInt32LE(4) + 8;
    if (declaredRiffSize > stat.size) {
      throw new Error(`Truncated WebP RIFF payload in ${path}`);
    }

    let offset = 12;
    while (offset + 8 <= declaredRiffSize) {
      const chunkHeader = Buffer.alloc(8);
      const headerRead = await handle.read(chunkHeader, 0, chunkHeader.length, offset);
      if (headerRead.bytesRead !== chunkHeader.length) break;
      const type = chunkHeader.subarray(0, 4).toString('ascii');
      const size = chunkHeader.readUInt32LE(4);
      const dataOffset = offset + 8;
      if (dataOffset + size > declaredRiffSize) {
        throw new Error(`Truncated WebP ${type} chunk in ${path}`);
      }

      if (type === 'VP8X') {
        if (size < 10) throw new Error(`Invalid WebP VP8X chunk in ${path}`);
        const data = Buffer.alloc(10);
        await readExactly(handle, data, dataOffset, `WebP VP8X chunk in ${path}`);
        const hasAlpha = (data[0] & 0x10) !== 0;
        const animated = (data[0] & 0x02) !== 0;
        if (hasAlpha || animated) {
          return {
            width: readUInt24LE(data, 4) + 1,
            height: readUInt24LE(data, 7) + 1,
            bitDepth: 8,
            channels: hasAlpha ? 4 : 0
          };
        }
        return {
          width: readUInt24LE(data, 4) + 1,
          height: readUInt24LE(data, 7) + 1,
          bitDepth: 8,
          channels: 3
        };
      }

      if (type === 'VP8 ') {
        if (size < 10) throw new Error(`Invalid WebP VP8 chunk in ${path}`);
        const data = Buffer.alloc(10);
        await readExactly(handle, data, dataOffset, `WebP VP8 chunk in ${path}`);
        if (data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) {
          throw new Error(`Invalid WebP VP8 frame header in ${path}`);
        }
        return {
          width: data.readUInt16LE(6) & 0x3fff,
          height: data.readUInt16LE(8) & 0x3fff,
          bitDepth: 8,
          channels: 3
        };
      }

      if (type === 'VP8L') {
        if (size < 5) throw new Error(`Invalid WebP VP8L chunk in ${path}`);
        const data = Buffer.alloc(5);
        await readExactly(handle, data, dataOffset, `WebP VP8L chunk in ${path}`);
        if (data[0] !== 0x2f) {
          throw new Error(`Invalid WebP VP8L signature in ${path}`);
        }
        const bits = data.readUInt32LE(1);
        return {
          width: (bits & 0x3fff) + 1,
          height: ((bits >>> 14) & 0x3fff) + 1,
          bitDepth: 8,
          channels: ((bits >>> 28) & 1) === 1 ? 4 : 3
        };
      }

      offset = dataOffset + size + (size & 1);
    }
    throw new Error(`WebP image data chunk not found in ${path}`);
  } finally {
    await handle.close();
  }
}

async function readExactly(handle, buffer, position, label) {
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
  if (bytesRead !== buffer.length) {
    throw new Error(`Truncated ${label}`);
  }
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

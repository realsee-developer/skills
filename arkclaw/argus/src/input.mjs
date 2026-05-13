import { open } from 'node:fs/promises';

const INPUT_TYPE_MAP = {
  image: {
    inputType: 'image',
    vggtType: 'pinhole',
    previewType: 'image'
  },
  panorama: {
    inputType: 'panorama',
    vggtType: 'pano',
    previewType: 'panorama'
  }
};

// Argus enforces strict aspect ratios:
//   panorama  = equirectangular 2:1 (4096×2048, 8192×4096, …)
//   pinhole   = square 1:1 (1024×1024, 2048×2048, …)
// Anything else is rejected up-front rather than uploaded and failed by the
// remote model. The small tolerance below covers minor encoder rounding (e.g.
// 4096×2050) without admitting unrelated aspect ratios like 16:9 or 4:3.
const PANORAMA_ASPECT_TARGET = 2.0;
const PINHOLE_ASPECT_TARGET = 1.0;
const PANORAMA_TOLERANCE = 0.05;  // ±2.5% of 2.0
const PINHOLE_TOLERANCE = 0.05;   // ±5% of 1.0

export const ASPECT_RATIO_BOUNDS = {
  panorama: {
    target: PANORAMA_ASPECT_TARGET,
    min: PANORAMA_ASPECT_TARGET - PANORAMA_TOLERANCE,
    max: PANORAMA_ASPECT_TARGET + PANORAMA_TOLERANCE,
    label: '2:1'
  },
  image: {
    target: PINHOLE_ASPECT_TARGET,
    min: PINHOLE_ASPECT_TARGET - PINHOLE_TOLERANCE,
    max: PINHOLE_ASPECT_TARGET + PINHOLE_TOLERANCE,
    label: '1:1'
  }
};

export function mapInputType(inputType) {
  const mapped = INPUT_TYPE_MAP[inputType];
  if (!mapped) {
    throw new Error(`Unsupported inputType "${inputType}". Expected "image" or "panorama".`);
  }
  return { ...mapped };
}

function ratioOf({ width, height }) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`invalid image dimensions: ${JSON.stringify({ width, height })}`);
  }
  return width / height;
}

function matchesBound(ratio, bound) {
  return ratio >= bound.min && ratio <= bound.max;
}

// Classify the input image strictly. Returns "panorama" for ~2:1 or "image"
// for ~1:1. Throws when the aspect ratio is neither — Argus cannot process
// arbitrary aspect ratios and the remote model would reject the upload.
export function detectInputTypeFromDimensions(dimensions) {
  const ratio = ratioOf(dimensions);
  if (matchesBound(ratio, ASPECT_RATIO_BOUNDS.panorama)) return 'panorama';
  if (matchesBound(ratio, ASPECT_RATIO_BOUNDS.image)) return 'image';
  throw new Error(
    `Unsupported aspect ratio ${ratio.toFixed(3)} (${dimensions.width}x${dimensions.height}). ` +
      'Argus requires 2:1 for panoramas or 1:1 for pinhole images.'
  );
}

// Validate that an explicit --type matches the JPEG dimensions. Lets the user
// override auto-detection only when the override is consistent with the file.
// Saves a remote round-trip when the user accidentally passes --type panorama
// on a square image (or vice versa).
export function assertInputTypeMatchesDimensions(inputType, dimensions) {
  const bound = ASPECT_RATIO_BOUNDS[inputType];
  if (!bound) {
    throw new Error(`Unsupported inputType "${inputType}". Expected "image" or "panorama".`);
  }
  const ratio = ratioOf(dimensions);
  if (!matchesBound(ratio, bound)) {
    throw new Error(
      `--type ${inputType} requires aspect ratio ${bound.label} (within ±${bound.max - bound.target}); ` +
        `got ${ratio.toFixed(3)} (${dimensions.width}x${dimensions.height}).`
    );
  }
}

export async function assertJpeg(path) {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error(`Expected JPEG file but path is not a regular file: ${path}`);
    }

    const magic = Buffer.alloc(3);
    const { bytesRead } = await handle.read(magic, 0, magic.length, 0);
    if (bytesRead !== magic.length || magic[0] !== 0xff || magic[1] !== 0xd8 || magic[2] !== 0xff) {
      throw new Error(`Invalid JPEG magic for file: ${path}`);
    }

    return stat;
  } finally {
    await handle.close();
  }
}

// Parse JPEG segment markers until we hit a Start-of-Frame marker, then read
// width and height from its payload. JPEG SOF layout per ITU-T T.81 §B.2.2:
//   FF Cn  <segment-length:2>  <precision:1>  <height:2>  <width:2>  ...
// where Cn ∈ {C0 baseline, C1 extended seq, C2 progressive, C3 lossless,
//             C5 differential seq, C6 differential progressive, C7 differential lossless,
//             C9–CB, CD–CF}, excluding C4 (DHT), C8 (reserved JPG), CC (DAC).
export async function readJpegDimensions(path) {
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
        const sof = Buffer.alloc(5);
        const sofRead = await handle.read(sof, 0, 5, markerOffset + 4);
        if (sofRead.bytesRead !== 5) {
          throw new Error(`Truncated SOF marker at offset ${markerOffset} in ${path}`);
        }
        const height = sof.readUInt16BE(1);
        const width = sof.readUInt16BE(3);
        if (width <= 0 || height <= 0) {
          throw new Error(`Invalid SOF dimensions ${width}x${height} at offset ${markerOffset} in ${path}`);
        }
        return { width, height };
      }

      offset = markerOffset + 2 + segmentLen;
    }
    throw new Error(`JPEG SOF marker not found in ${path}`);
  } finally {
    await handle.close();
  }
}

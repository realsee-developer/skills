export function buildPngHeader(width, height, { bitDepth = 8, colorType = 2 } = {}) {
  const buffer = Buffer.alloc(29);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = bitDepth;
  buffer[25] = colorType;
  return buffer;
}

export function buildWebpVp8x(width, height, { alpha = false, animated = false } = {}) {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUInt32LE(10, 16);
  buffer[20] = (alpha ? 0x10 : 0) | (animated ? 0x02 : 0);
  writeUInt24LE(buffer, width - 1, 24);
  writeUInt24LE(buffer, height - 1, 27);
  return buffer;
}

export function buildJpegFrame(width, height, { bitDepth = 8, channels = 3 } = {}) {
  const segmentLength = 8 + channels * 3;
  const buffer = Buffer.alloc(2 + 2 + 2 + 1 + 2 + 2 + 1 + channels * 3 + 2);
  let offset = 0;
  buffer[offset++] = 0xff;
  buffer[offset++] = 0xd8;
  buffer[offset++] = 0xff;
  buffer[offset++] = 0xc0;
  buffer.writeUInt16BE(segmentLength, offset);
  offset += 2;
  buffer[offset++] = bitDepth;
  buffer.writeUInt16BE(height, offset);
  offset += 2;
  buffer.writeUInt16BE(width, offset);
  offset += 2;
  buffer[offset++] = channels;
  for (let index = 0; index < channels; index += 1) {
    buffer[offset++] = index + 1;
    buffer[offset++] = 0x11;
    buffer[offset++] = 0;
  }
  buffer[offset++] = 0xff;
  buffer[offset] = 0xd9;
  return buffer;
}

function writeUInt24LE(buffer, value, offset) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
}

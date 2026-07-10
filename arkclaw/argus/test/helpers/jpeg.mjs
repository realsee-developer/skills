// Build a minimal-valid JPEG with a single SOF0 marker carrying the given
// dimensions. Layout per ITU-T T.81 §B.2.2:
//   FF D8                              SOI
//   FF C0 00 11                        SOF0 marker + segment length (17)
//   08                                 sample precision (8-bit)
//   <height:2><width:2>                frame dimensions
//   03                                 number of components (3 for YCbCr)
//   01 22 00 02 11 01 03 11 01         component spec triplets
//   FF D9                              EOI
//
// readJpegDimensions parses these markers without scanning entropy-coded
// data, so the buffer does NOT need a full image stream. 23 bytes is enough.
export function buildJpegWithDimensions(width, height) {
  const buf = Buffer.alloc(23);
  let i = 0;
  buf[i++] = 0xff; buf[i++] = 0xd8;                       // SOI
  buf[i++] = 0xff; buf[i++] = 0xc0;                       // SOF0
  buf.writeUInt16BE(17, i); i += 2;                        // segment length
  buf[i++] = 0x08;                                         // precision
  buf.writeUInt16BE(height, i); i += 2;
  buf.writeUInt16BE(width, i); i += 2;
  buf[i++] = 0x03;                                         // 3 components
  for (const byte of [0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]) buf[i++] = byte;
  buf[i++] = 0xff; buf[i++] = 0xd9;                        // EOI
  return buf;
}

// Same as buildJpegWithDimensions but prepended with an APP0 (JFIF) segment
// so callers can exercise readJpegDimensions' segment-skipping path.
export function buildJpegWithApp0(width, height) {
  const jfif = Buffer.from([
    0xff, 0xd8,                                                 // SOI
    0xff, 0xe0,                                                 // APP0
    0x00, 0x10,                                                 // length 16
    0x4a, 0x46, 0x49, 0x46, 0x00,                               // "JFIF\0"
    0x01, 0x01,                                                 // version
    0x00,                                                       // density units
    0x00, 0x48, 0x00, 0x48,                                     // x/y density
    0x00, 0x00                                                  // thumbnail w/h
  ]);
  const tail = buildJpegWithDimensions(width, height).slice(2); // drop duplicate SOI
  return Buffer.concat([jfif, tail]);
}

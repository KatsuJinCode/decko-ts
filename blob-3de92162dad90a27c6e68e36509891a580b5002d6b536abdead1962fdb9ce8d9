// Minimal, fail-closed PNG codec for the live-walk pixel comparison.
//
//   decodePng(buffer)  -> { width, height, data: Buffer /* RGBA, 4 bytes/px */ }
//   encodePng({ width, height, data }) -> Buffer /* color type 6 RGBA */
//
// Decoder: 8-bit depth, non-interlaced, color types 0 (gray), 2 (RGB),
// 3 (palette, with optional tRNS), 4 (gray+alpha), 6 (RGBA). Anything else —
// 16-bit depth, Adam7 interlace, unknown color type, bad signature, bad CRC,
// truncated file — throws with the exact reason. The pixel verdicts of the
// walk comparison are only as honest as this decode, so an unsupported image
// is a loud structural-difference, never silent garbage.
//
// Encoder: the one shape the diff mask needs (8-bit RGBA, filter 0 rows,
// zlib deflate) — deterministic for identical input, so two identical mask
// images encode to identical bytes.

import { inflateSync, deflateSync, crc32 } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function channelsForColorType(colorType) {
  // 0 gray, 2 RGB, 3 palette (1 index byte), 4 gray+alpha, 6 RGBA.
  return { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType] ?? null;
}

export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < SIGNATURE.length + 8) throw new Error("not a PNG: too short");
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG: bad signature");

  let offset = 8;
  let width = null, height = null, bitDepth = null, colorType = null, interlace = null;
  let palette = null, trns = null;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error(`corrupt PNG: ${type} chunk truncated`);
    const expectedCrc = buffer.readUInt32BE(dataEnd);
    const actualCrc = crc32(buffer.subarray(offset + 4, dataEnd)) >>> 0;
    if (expectedCrc !== actualCrc) throw new Error(`corrupt PNG: ${type} chunk CRC mismatch`);
    const data = buffer.subarray(dataStart, dataEnd);
    switch (type) {
      case "IHDR": {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
        const compression = data[10];
        const filterMethod = data[11];
        interlace = data[12];
        if (width <= 0 || height <= 0) throw new Error(`corrupt PNG: dimensions ${width}x${height}`);
        if (bitDepth !== 8) throw new Error(`unsupported PNG: bit depth ${bitDepth} (only 8 is decoded)`);
        if (channelsForColorType(colorType) === null) throw new Error(`unsupported PNG: color type ${colorType}`);
        if (compression !== 0 || filterMethod !== 0) throw new Error(`unsupported PNG: compression ${compression} filter ${filterMethod}`);
        if (interlace !== 0) throw new Error("unsupported PNG: Adam7 interlace (only non-interlaced is decoded)");
        break;
      }
      case "PLTE":
        palette = Buffer.from(data);
        if (palette.length % 3 !== 0) throw new Error("corrupt PNG: PLTE length not a multiple of 3");
        break;
      case "tRNS":
        trns = Buffer.from(data);
        break;
      case "IDAT":
        idat.push(data);
        break;
      case "IEND":
        offset = buffer.length; // stop reading; trailing bytes after IEND are ignored
        continue;
    }
    offset = dataEnd + 4;
  }
  if (width === null) throw new Error("corrupt PNG: no IHDR");
  if (idat.length === 0) throw new Error("corrupt PNG: no IDAT");

  const channels = channelsForColorType(colorType);
  if (colorType === 3 && !palette) throw new Error("corrupt PNG: palette color type without PLTE");
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const expectedRaw = (stride + 1) * height;
  if (raw.length !== expectedRaw) throw new Error(`corrupt PNG: decompressed ${raw.length} bytes, expected ${expectedRaw}`);

  // Unfilter (PNG spec section 6, filters 0-4) into per-channel rows.
  const unfiltered = Buffer.alloc(stride * height);
  const bpp = channels; // bytes per complete pixel, the filter's "prior unit"
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowIn = y * (stride + 1) + 1;
    const rowOut = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? unfiltered[rowOut + x - bpp] : 0; // left
      const b = y > 0 ? unfiltered[rowOut - stride + x] : 0; // up
      const c = y > 0 && x >= bpp ? unfiltered[rowOut - stride + x - bpp] : 0; // up-left
      let value = raw[rowIn + x];
      switch (filter) {
        case 0: break; // None
        case 1: value += a; break; // Sub
        case 2: value += b; break; // Up
        case 3: value += (a + b) >> 1; break; // Average
        case 4: { // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error(`corrupt PNG: filter type ${filter} on row ${y}`);
      }
      unfiltered[rowOut + x] = value & 0xff;
    }
  }

  // Expand to RGBA.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4, s = i * channels;
    switch (colorType) {
      case 0:
        rgba[o] = rgba[o + 1] = rgba[o + 2] = unfiltered[s];
        rgba[o + 3] = 0xff;
        break;
      case 2:
        rgba[o] = unfiltered[s]; rgba[o + 1] = unfiltered[s + 1]; rgba[o + 2] = unfiltered[s + 2];
        rgba[o + 3] = 0xff;
        break;
      case 3: {
        const index = unfiltered[s];
        if (index * 3 + 2 >= palette.length) throw new Error(`corrupt PNG: palette index ${index} out of range`);
        rgba[o] = palette[index * 3]; rgba[o + 1] = palette[index * 3 + 1]; rgba[o + 2] = palette[index * 3 + 2];
        rgba[o + 3] = trns && index < trns.length ? trns[index] : 0xff;
        break;
      }
      case 4:
        rgba[o] = rgba[o + 1] = rgba[o + 2] = unfiltered[s];
        rgba[o + 3] = unfiltered[s + 1];
        break;
      case 6:
        rgba[o] = unfiltered[s]; rgba[o + 1] = unfiltered[s + 1]; rgba[o + 2] = unfiltered[s + 2]; rgba[o + 3] = unfiltered[s + 3];
        break;
    }
  }
  return { width, height, data: rgba };
}

export function encodePng({ width, height, data }) {
  if (!Buffer.isBuffer(data) || data.length !== width * height * 4) throw new Error("encodePng: data must be width*height RGBA bytes");
  const stride = width * 4;
  // Filter 0 (None) on every row: one filter byte + the row's bytes.
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  const chunks = [];
  const chunk = (type, body) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(body.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, body])) >>> 0, 0);
    chunks.push(head, typeBuf, body, crc);
  };
  chunk("IHDR", ihdr);
  chunk("IDAT", idat);
  chunk("IEND", Buffer.alloc(0));
  return Buffer.concat([SIGNATURE, ...chunks]);
}

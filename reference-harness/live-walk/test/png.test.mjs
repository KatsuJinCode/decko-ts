// Tests for the walk instrument's PNG codec (lib/png.mjs): roundtrip, every
// color type the decoder claims, and the fail-closed refusals.
import test from "node:test";
import assert from "node:assert/strict";
import { decodePng, encodePng } from "../lib/png.mjs";
import { deflateSync, crc32 } from "node:zlib";

function solidImage(width, height, rgba) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}

test("encode -> decode roundtrip preserves pixels", () => {
  const img = { width: 3, height: 2, data: Buffer.from([1, 2, 3, 255, 4, 5, 6, 200, 7, 8, 9, 0, 10, 11, 12, 255, 13, 14, 15, 1, 16, 17, 18, 254]) };
  const png = encodePng(img);
  const out = decodePng(png);
  assert.equal(out.width, 3);
  assert.equal(out.height, 2);
  assert.ok(out.data.equals(img.data));
});

test("identical input encodes to identical bytes (deterministic)", () => {
  const img = solidImage(5, 5, [9, 9, 9, 255]);
  assert.ok(encodePng(img).equals(encodePng(img)));
});

function buildChunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), body])) >>> 0, 0);
  return Buffer.concat([head, Buffer.from(type, "ascii"), body, crc]);
}

/** Builds a PNG of an arbitrary color type/bit depth so the decoder's
 *  expansions and refusals are exercised against real chunk layouts. */
function buildPng({ width, height, bitDepth = 8, colorType, channels, rowBytes, interlace = 0, trns = null, palette = null, pixel }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  ihdr[12] = interlace;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const v = typeof pixel === "function" ? pixel(x, y) : pixel;
      for (let c = 0; c < channels; c++) raw[y * (stride + 1) + 1 + x * channels + c] = v[c] ?? v;
    }
  }
  const chunks = [buildChunk("IHDR", ihdr)];
  if (palette) chunks.push(buildChunk("PLTE", palette));
  if (trns) chunks.push(buildChunk("tRNS", trns));
  chunks.push(buildChunk("IDAT", deflateSync(raw)));
  chunks.push(buildChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);
}

test("decodes gray, RGB, palette (with tRNS), gray+alpha and RGBA", () => {
  const gray = decodePng(buildPng({ width: 2, height: 1, colorType: 0, channels: 1, pixel: [0x80] }));
  assert.deepEqual([...gray.data], [0x80, 0x80, 0x80, 255, 0x80, 0x80, 0x80, 255]);
  const rgb = decodePng(buildPng({ width: 1, height: 1, colorType: 2, channels: 3, pixel: [1, 2, 3] }));
  assert.deepEqual([...rgb.data], [1, 2, 3, 255]);
  const palette = decodePng(buildPng({ width: 1, height: 1, colorType: 3, channels: 1, pixel: [1], palette: Buffer.from([10, 20, 30, 40, 50, 60]), trns: Buffer.from([255, 7]) }));
  assert.deepEqual([...palette.data], [40, 50, 60, 7]);
  const ga = decodePng(buildPng({ width: 1, height: 1, colorType: 4, channels: 2, pixel: [66, 12] }));
  assert.deepEqual([...ga.data], [66, 66, 66, 12]);
  const rgba = decodePng(buildPng({ width: 1, height: 1, colorType: 6, channels: 4, pixel: [1, 2, 3, 4] }));
  assert.deepEqual([...rgba.data], [1, 2, 3, 4]);
});

test("fail-closed: bad signature, bad CRC, 16-bit, interlace, truncated IDAT", () => {
  const good = encodePng(solidImage(2, 2, [1, 2, 3, 255]));
  assert.throws(() => decodePng(Buffer.from("not a png at all")), /bad signature/);
  const badCrc = Buffer.from(good);
  badCrc[badCrc.length - 5] ^= 0xff; // corrupt IEND's CRC
  assert.throws(() => decodePng(badCrc), /CRC mismatch/);
  const sixteen = buildPng({ width: 2, height: 2, colorType: 0, channels: 1, pixel: [0], bitDepth: 16 });
  assert.throws(() => decodePng(sixteen), /bit depth 16/);
  const interlaced = buildPng({ width: 2, height: 2, colorType: 6, channels: 4, pixel: [0, 0, 0, 255], interlace: 1 });
  assert.throws(() => decodePng(interlaced), /Adam7/);
  // An IDAT whose inflated stream is shorter than (stride+1)*height.
  const shortIdat = buildPng({ width: 8, height: 8, colorType: 6, channels: 4, pixel: [0, 0, 0, 255] });
  // Find the IDAT chunk and truncate its declared payload.
  const idatAt = shortIdat.indexOf("IDAT", 8, "ascii");
  const lenAt = idatAt - 4;
  shortIdat.writeUInt32BE(4, lenAt); // declare 4 payload bytes only
  assert.throws(() => decodePng(shortIdat), /corrupt PNG/);
});

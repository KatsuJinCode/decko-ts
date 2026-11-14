// Tests for the walk instrument's pixel verdicts (lib/pixel-diff.mjs):
// byte-identical, exact pixel-delta with measured bounding regions, tolerance,
// and the structural verdicts (dimensions, decode failure, fraction).
import test from "node:test";
import assert from "node:assert/strict";
import { encodePng } from "../lib/png.mjs";
import { diffScreenshots, DEFAULT_STRUCTURAL_FRACTION } from "../lib/pixel-diff.mjs";
import { deflateSync, crc32 } from "node:zlib";

function img(width, height, fill) {
  const data = Buffer.alloc(width * height * 4);
  if (fill) for (let i = 0; i < width * height; i++) data.set(fill, i * 4);
  return { width, height, data };
}

function paint(img, x, y, rgba) {
  img.data.set(rgba, (y * img.width + x) * 4);
}

test("byte-identical files -> identical verdict without decoding", () => {
  const png = encodePng(img(4, 4, [1, 2, 3, 255]));
  const d = diffScreenshots(png, Buffer.from(png));
  assert.equal(d.verdict, "identical");
  assert.equal(d.identicalBytes, true);
});

test("re-encoded identical pixels -> identical (deterministic encoder: the byte-identical path)", () => {
  const a = img(4, 4, [10, 20, 30, 255]);
  const b = img(4, 4, [10, 20, 30, 255]);
  const d = diffScreenshots(encodePng(a), encodePng(b));
  assert.equal(d.verdict, "identical");
  assert.equal(d.deltaCount, 0);
});

test("same pixels through different chunk layouts -> identical via the decode path", () => {
  // One PNG from encodePng (filter 0 rows), one built by hand from the same
  // pixels with filter 2 (Up) rows: the files differ byte-wise, the decoded
  // pixels do not.
  const a = img(8, 4, [7, 8, 9, 255]);
  const d = diffScreenshots(encodePng(a), buildUpFilteredPng(a));
  assert.equal(d.verdict, "identical");
  assert.equal(d.identicalBytes, false);
  assert.equal(d.deltaCount, 0);
});

function buildUpFilteredPng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 2; // filter 2: Up
    for (let x = 0; x < stride; x++) {
      const cur = data[y * stride + x];
      const up = y > 0 ? data[(y - 1) * stride + x] : 0;
      raw[y * (stride + 1) + 1 + x] = (cur - up) & 0xff;
    }
  }
  const chunk = (type, body) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(body.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), body])) >>> 0, 0);
    return Buffer.concat([head, Buffer.from(type, "ascii"), body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
import { createRequire } from "node:module";
function zlibMod() { return createRequire(import.meta.url)("node:zlib"); }

test("one differing pixel: delta count 1, exact bounding region, mask written", () => {
  const a = img(32, 32, [0, 0, 0, 255]);
  const b = img(32, 32, [0, 0, 0, 255]);
  paint(b, 20, 10, [255, 0, 0, 255]);
  const d = diffScreenshots(encodePng(a), encodePng(b));
  assert.equal(d.verdict, "pixel-delta");
  assert.equal(d.deltaCount, 1);
  assert.deepEqual(d.regions, [{ x: 20, y: 10, w: 1, h: 1, count: 1 }]);
  assert.ok(Buffer.isBuffer(d.maskPng));
});

test("two far-apart differences -> two regions with exact bounds", () => {
  const a = img(64, 64, [0, 0, 0, 255]);
  const b = img(64, 64, [0, 0, 0, 255]);
  paint(b, 5, 5, [255, 255, 255, 255]);
  paint(b, 50, 40, [255, 255, 255, 255]);
  paint(b, 51, 41, [255, 255, 255, 255]); // same region as 50,40 (within a block)
  const d = diffScreenshots(encodePng(a), encodePng(b));
  assert.equal(d.verdict, "pixel-delta");
  assert.equal(d.deltaCount, 3);
  assert.equal(d.regions.length, 2);
  const near = d.regions.find((r) => r.x === 5);
  const far = d.regions.find((r) => r.x === 50);
  assert.deepEqual(near, { x: 5, y: 5, w: 1, h: 1, count: 1 });
  assert.deepEqual(far, { x: 50, y: 40, w: 2, h: 2, count: 2 });
});

test("tolerance: within-tolerance channel differences count as equal", () => {
  const a = img(4, 4, [100, 100, 100, 255]);
  const b = img(4, 4, [100, 100, 100, 255]);
  // One pixel three channels off, everything else identical.
  b.data.set([103, 98, 100, 255], 6 * 4);
  const zero = diffScreenshots(encodePng(a), encodePng(b), { pixelTolerance: 0 });
  assert.equal(zero.verdict, "pixel-delta");
  assert.equal(zero.deltaCount, 1);
  const tol = diffScreenshots(encodePng(a), encodePng(b), { pixelTolerance: 3 });
  assert.equal(tol.verdict, "identical");
});

test("different dimensions -> structural-difference", () => {
  const d = diffScreenshots(encodePng(img(10, 10, [0, 0, 0, 255])), encodePng(img(10, 11, [0, 0, 0, 255])));
  assert.equal(d.verdict, "structural-difference");
  assert.match(d.reason, /dimensions differ/);
});

test("corrupt image -> structural-difference naming the decode failure", () => {
  const d = diffScreenshots(encodePng(img(4, 4, [0, 0, 0, 255])), Buffer.from("garbage"));
  assert.equal(d.verdict, "structural-difference");
  assert.match(d.reason, /decode failed/);
});

test("majority-change page -> structural-difference above the fraction, regions kept", () => {
  const a = img(20, 20, [0, 0, 0, 255]);
  const b = img(20, 20, [255, 255, 255, 255]);
  const d = diffScreenshots(encodePng(a), encodePng(b), { structuralFraction: 0.5 });
  assert.equal(d.verdict, "structural-difference");
  assert.ok(d.deltaFraction > DEFAULT_STRUCTURAL_FRACTION);
  assert.equal(d.regions.length, 1);
  assert.deepEqual({ ...d.regions[0], count: d.regions[0].count }, { x: 0, y: 0, w: 20, h: 20, count: 400 });
});

test("exactly at the fraction stays pixel-delta (strictly-above rule)", () => {
  const a = img(10, 10, [0, 0, 0, 255]);
  const b = img(10, 10, [0, 0, 0, 255]);
  for (let x = 0; x < 5; x++) for (let y = 0; y < 10; y++) paint(b, x, y, [255, 255, 255, 255]); // exactly 50%
  const d = diffScreenshots(encodePng(a), encodePng(b), { structuralFraction: 0.5 });
  assert.equal(d.verdict, "pixel-delta");
});

// make-fixtures.mjs -- write the two upload fixtures the scenarios use:
// a short text file and two deterministic RGB PNGs (a 64x48 gradient and a
// 640x400 detailed image), so the image variants are real resizes, both
// enlarging and shrinking.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
mkdirSync(dir, { recursive: true });

writeFileSync(join(dir, "parity-upload.txt"), "parity upload fixture\nline two\n");

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(name, W, H, pixel) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    const row = y * (W * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < W; x++) {
      const [r, g, b] = pixel(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(join(dir, name), png);
}

// 64x48 gradient: every version is a no-op limit or an enlargement.
writePng("parity-image.png", 64, 48, (x, y) => [(x * 4) & 255, (y * 5) & 255, 128]);
// 640x400 with fine detail (gradients plus concentric rings): large and
// medium are real shrinks (to 500x313 and 200x125), so the downscaling
// filter is compared too.
writePng("parity-photo.png", 640, 400, (x, y) => {
  const d = Math.hypot(x - 320, y - 200);
  const ring = Math.round(127.5 + 127.5 * Math.sin(d / 6));
  return [Math.round((x / 639) * 255), ring, Math.round((y / 399) * 255)];
});
// A PNG signature followed by bytes that are not an image: what each
// engine does with an upload it cannot decode.
writeFileSync(join(dir, "parity-corrupt.png"), Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("not an image body", "ascii"),
]));
console.log("fixtures written to", dir);

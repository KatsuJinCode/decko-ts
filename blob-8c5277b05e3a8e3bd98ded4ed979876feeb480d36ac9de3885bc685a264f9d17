// Pixel comparison of two full-page screenshots (see ../walk-and-compare.mjs,
// "Pixel verdicts"). Given two PNG buffers it answers the per-page verdict the
// walk report carries:
//
//   identical              same decoded pixels (or byte-identical files)
//   pixel-delta            same dimensions, N differing pixels; the N are
//                          grouped into bounding regions (x, y, w, h, count)
//   structural-difference  different dimensions, an undecodable image, or a
//                          delta fraction above the structural fraction
//                          (default 0.5 — half the page changed is a layout
//                          change, not a content change); regions still
//                          reported when computable
//
// Every channel (R, G, B, A) must be within --pixel-tolerance (default 0:
// exact) for a pixel to count as equal. The tolerance is a named setting of
// the run, printed in the report's normalization table when non-zero — an
// anti-aliasing allowance the human can see, never a silent one.
//
// The mask image writes every equal pixel white and every differing pixel
// red, so a human sees where the delta lives at a glance.

import { decodePng, encodePng } from "./png.mjs";

export const DEFAULT_STRUCTURAL_FRACTION = 0.5;
const MAX_REGIONS_REPORTED = 12;
// The bounding-region grid: differences are grouped on this block size, then
// each connected block group's exact pixel bounds are measured. 16 px keeps
// neighbouring antialiasing noise in one region without merging two real
// changes a paragraph apart.
const REGION_BLOCK = 16;

export function diffScreenshots(pngA, pngB, { pixelTolerance = 0, structuralFraction = DEFAULT_STRUCTURAL_FRACTION } = {}) {
  const identicalBytes = pngA.equals(pngB);
  if (identicalBytes) {
    return { verdict: "identical", identicalBytes: true, width: null, height: null, deltaCount: 0, deltaFraction: 0, regions: [], maskPng: null };
  }
  let a, b, decodeError = null;
  try {
    a = decodePng(pngA);
    b = decodePng(pngB);
  } catch (err) {
    decodeError = err;
  }
  if (decodeError) return { verdict: "structural-difference", reason: `decode failed: ${decodeError.message}`, identicalBytes: false, width: null, height: null, deltaCount: null, deltaFraction: null, regions: [], maskPng: null };
  if (a.width !== b.width || a.height !== b.height) {
    return {
      verdict: "structural-difference", reason: `dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`,
      identicalBytes: false, width: a.width, height: a.height, widthB: b.width, heightB: b.height,
      deltaCount: null, deltaFraction: null, regions: [], maskPng: null,
    };
  }
  const { width, height } = a;
  const da = a.data, db = b.data;
  const diff = Buffer.alloc(width * height * 4, 0xff); // white background
  let deltaCount = 0;
  const blocks = new Map(); // block key -> has delta
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (
      Math.abs(da[o] - db[o]) > pixelTolerance ||
      Math.abs(da[o + 1] - db[o + 1]) > pixelTolerance ||
      Math.abs(da[o + 2] - db[o + 2]) > pixelTolerance ||
      Math.abs(da[o + 3] - db[o + 3]) > pixelTolerance
    ) {
      deltaCount++;
      diff[o] = 0xff; diff[o + 1] = 0x00; diff[o + 2] = 0x00; diff[o + 3] = 0xff;
      const bx = (i % width) / REGION_BLOCK | 0, by = (i / width | 0) / REGION_BLOCK | 0;
      blocks.set(`${bx},${by}`, true);
    }
  }
  const deltaFraction = deltaCount / (width * height);
  const regions = deltaCount === 0 ? [] : measureRegions(blocks, width, height, diff);
  if (deltaFraction > structuralFraction) {
    return { verdict: "structural-difference", reason: `${(deltaFraction * 100).toFixed(1)}% of pixels differ (above the ${(structuralFraction * 100).toFixed(0)}% structural fraction)`, identicalBytes: false, width, height, deltaCount, deltaFraction, regions, maskPng: encodePng({ width, height, data: diff }) };
  }
  return { verdict: deltaCount === 0 ? "identical" : "pixel-delta", identicalBytes: false, width, height, deltaCount, deltaFraction, regions, maskPng: deltaCount === 0 ? null : encodePng({ width, height, data: diff }) };
}

/** Connected components over the marked 16-px blocks (4-neighbours), each
 *  measured to its exact differing-pixel bounding box. Regions are reported
 *  largest-first; MAX_REGIONS_REPORTED in prose, the rest counted. */
function measureRegions(markedBlocks, width, height, diff) {
  const key = (x, y) => `${x},${y}`;
  const seen = new Set();
  const components = [];
  const blockCols = Math.ceil(width / REGION_BLOCK);
  const blockRows = Math.ceil(height / REGION_BLOCK);
  for (const start of markedBlocks.keys()) {
    if (seen.has(start)) continue;
    // Flood-fill this block component.
    const members = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const cur = queue.pop();
      members.push(cur);
      const [cx, cy] = cur.split(",").map(Number);
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        if (nx < 0 || ny < 0 || nx >= blockCols || ny >= blockRows) continue;
        const k = key(nx, ny);
        if (markedBlocks.has(k) && !seen.has(k)) { seen.add(k); queue.push(k); }
      }
    }
    // Exact bounds over the component's blocks.
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, count = 0;
    for (const member of members) {
      const [bx, by] = member.split(",").map(Number);
      const x0 = bx * REGION_BLOCK, y0 = by * REGION_BLOCK;
      const x1 = Math.min(x0 + REGION_BLOCK, width), y1 = Math.min(y0 + REGION_BLOCK, height);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * width + x) * 4;
          if (diff[o + 1] === 0) { // red channel set: this pixel differed
            count++;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
    }
    components.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, count });
  }
  components.sort((p, q) => q.count - p.count);
  return components;
}

export const PIXEL_REGIONS_CAP = MAX_REGIONS_REPORTED;

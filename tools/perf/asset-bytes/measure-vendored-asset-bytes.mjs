// measure-vendored-asset-bytes.mjs — the byte census of the assets the edge
// carries inline in its deployable bundle, and of which of those bytes a
// browser can actually reach.
//
// WHAT THIS MEASURES. Three vendored base64 asset maps are imported into the
// edge bundle by their route modules (src/server/font-awesome-assets.ts,
// src/server/bootstrap-font-assets.ts,
// src/card/attachments/stock-coded-files.ts). For each one it reports:
//
//   1. DECODED BYTES — the real payload size, so the base64 is undone once.
//   2. GZIP / BROTLI — what a compressing CDN would put on the wire.
//   3. REACHABLE — whether the CSS the edge actually serves names the file.
//      A font the served stylesheet never references is dead weight: it
//      inflates the Bunny script (tools/vendor/edge-bundle-budget.mjs caps it
//      at 7,600,000 bytes) and is never fetched.
//   4. BASE64 IN BUNDLE — the bytes the asset costs inside the script text.
//
// WHY REACHABILITY IS MEASURED, NOT ASSUMED. The served CSS is read out of
// the same sources the engine reads it from (the FontAwesome package's own
// `css/all.min.css`, and the bootstrap mod's vendored
// `bootstrap-icons.css` out of the style snapshot), then scanned for url(...)
// targets. A query string is stripped, because the bootstrap icons CSS
// appends a `?<hash>` cache-buster while the route keys assets by bare name
// (src/server/bootstrap-font-assets.ts:6-8) — matching on the raw target
// would report every font unreachable.
//
// The font-face `format()` fallback ORDER is reported alongside, because that
// order decides which file of a face a browser fetches at all: a client that
// supports woff2 takes the first entry and never asks for the ttf behind it.
//
// Usage: node tools/perf/asset-bytes/measure-vendored-asset-bytes.mjs [--json <out.json>]
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = resolve(import.meta.dirname, "../../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const JSON_OUT = arg("json") ? resolve(arg("json")) : null;

const load = (rel) => import(pathToFileURL(resolve(REPO, rel)).href).then((m) => m.assets);

const [fontAwesome, bootstrapFonts, coded] = await Promise.all([
  load("vendor/fontawesome-free-6.7.2/assets.js"),
  load("vendor/decko-bootstrap-fonts/assets.js"),
  load("vendor/decko-coded-attachments/assets.js"),
]);

/** Every url(...) target inside a CSS body, resolved to a bare filename.
 *  A query string is stripped — see the header note. */
function cssUrlTargets(css) {
  const out = new Set();
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const raw = m[2].trim();
    if (/^(?:data:|https?:|\/\/|#)/i.test(raw)) continue;
    out.add((raw.split("/").pop() ?? raw).split(/[?#]/, 1)[0]);
  }
  return out;
}

/** The @font-face src fallback lists as ordered file -> format pairs. A
 *  browser fetches the first entry whose format() it supports, so the ORDER
 *  — not mere membership — decides which file of a face is ever requested. */
function cssFontFaceSources(css) {
  const out = [];
  for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = block[1];
    const family = /font-family:\s*['"]?([^;'"}]+)/i.exec(body)?.[1]?.trim();
    if (family === undefined) continue;
    const sources = [...body.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)\s*format\(\s*['"]?([^)'\"]+)/gi)]
      .map((m) => ({ file: (m[2].split("/").pop() ?? m[2]).split(/[?#]/, 1)[0], format: m[3].trim().toLowerCase() }));
    out.push({ family, sources });
  }
  return out;
}

const encodings = (bytes) => ({
  decoded: bytes.length,
  gzip: gzipSync(bytes, { level: 9 }).length,
  brotli: brotliCompressSync(bytes, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }).length,
});

// ---------------------------------------------------------------------------
// FontAwesome: one CSS entry plus four font faces x two formats.
// ---------------------------------------------------------------------------
const faCssBytes = Buffer.from(fontAwesome["css/all.min.css"].base64, "base64");
const faCss = faCssBytes.toString("utf8");
const faTargets = cssUrlTargets(faCss);
const faFaces = cssFontFaceSources(faCss);

/** Which file of a face a woff2-capable browser actually fetches: the FIRST
 *  src entry, since every such browser accepts woff2 and stops there. */
const faFirstChoice = new Set(faFaces.map((f) => f.sources[0]?.file).filter(Boolean));

const fontAwesomeRows = Object.entries(fontAwesome)
  .filter(([key]) => key !== "css/all.min.css")
  .map(([key, asset]) => {
    const bytes = Buffer.from(asset.base64, "base64");
    const basename = key.split("/").pop();
    return {
      key,
      ...encodings(bytes),
      base64InBundle: asset.base64.length,
      referencedByServedCss: faTargets.has(basename),
      selectedByWoff2Browser: faFirstChoice.has(basename),
    };
  })
  .sort((a, b) => b.decoded - a.decoded);

// ---------------------------------------------------------------------------
// Bootstrap icons: the CSS is a MOD STYLE FILE, vendored into the style
// snapshot rather than the font route. Read it out of the snapshot so the
// reachability question is asked of the bytes the deck really emits.
// ---------------------------------------------------------------------------
const styleSnapshot = readFileSync(resolve(REPO, "vendor/edge-style-source-snapshot.js"), "utf8");
const iconsCssEntry = /"mod-style-assets\/card-mod-bootstrap\/assets\/style\/bootstrap-icons\.css":\s*"((?:[^"\\]|\\.)*)"/.exec(styleSnapshot);
if (iconsCssEntry === null) {
  throw new Error("bootstrap-icons.css is not present in vendor/edge-style-source-snapshot.js");
}
const iconsCss = JSON.parse(`"${iconsCssEntry[1]}"`);
const iconsTargets = cssUrlTargets(iconsCss);
const iconsFaces = cssFontFaceSources(iconsCss);
const iconsFirstChoice = new Set(iconsFaces.map((f) => f.sources[0]?.file).filter(Boolean));

const bootstrapFontRows = Object.entries(bootstrapFonts).map(([key, asset]) => {
  const bytes = Buffer.from(asset.base64, "base64");
  const basename = key.split("/").pop();
  return {
    key,
    ...encodings(bytes),
    base64InBundle: asset.base64.length,
    referencedByServedCss: iconsTargets.has(basename),
    selectedByWoff2Browser: iconsFirstChoice.has(basename),
  };
});

// ---------------------------------------------------------------------------
// Coded attachments: the logo/favicon images, reached by codename rather than
// by CSS, so reachability is answered structurally and not by the url() scan.
// ---------------------------------------------------------------------------
const codedRows = Object.entries(coded).map(([key, asset]) => {
  const row = { key, codename: asset.codename, extension: asset.extension, versions: {} };
  for (const [variant, file] of Object.entries(asset.versions ?? {})) {
    row.versions[variant] = { ...encodings(Buffer.from(file.base64, "base64")), base64InBundle: file.base64.length };
  }
  return row;
});

// ---------------------------------------------------------------------------
// Duplicate payloads across every vendored asset: identical bytes carried
// twice cost the script twice and serve the same response twice.
// ---------------------------------------------------------------------------
const byHash = new Map();
const record = (key, b64) => {
  const bytes = Buffer.from(b64, "base64");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (!byHash.has(sha256)) byHash.set(sha256, []);
  byHash.get(sha256).push({ key, bytes: bytes.length });
};
for (const [k, v] of Object.entries(fontAwesome)) record(k, v.base64);
for (const [k, v] of Object.entries(bootstrapFonts)) record(k, v.base64);
for (const [k, v] of Object.entries(coded)) {
  for (const [ver, f] of Object.entries(v.versions ?? {})) record(`${k}#${ver}`, f.base64);
}
const duplicateGroups = [...byHash.entries()]
  .filter(([, group]) => group.length > 1)
  .map(([sha256, group]) => ({
    sha256,
    bytesEach: group[0].bytes,
    redundantBytes: group.slice(1).reduce((n, g) => n + g.bytes, 0),
    keys: group.map((g) => g.key),
  }));

const sum = (rows) => rows.reduce(
  (acc, r) => {
    acc.decoded += r.decoded;
    acc.gzip += r.gzip;
    acc.base64InBundle += r.base64InBundle;
    return acc;
  },
  { decoded: 0, gzip: 0, base64InBundle: 0 },
);

const faSum = sum(fontAwesomeRows);
const bsSum = sum(bootstrapFontRows);
const cssEnc = encodings(faCssBytes);

const unreferenced = [...fontAwesomeRows, ...bootstrapFontRows].filter((r) => r.referencedByServedCss === false);
const neverFetched = [...fontAwesomeRows, ...bootstrapFontRows].filter((r) => r.selectedByWoff2Browser === false);

const report = {
  instrument: "tools/perf/asset-bytes/measure-vendored-asset-bytes.mjs",
  note: "decoded/gzip/brotli are per-asset; base64InBundle is what the asset costs inside the Bunny script text",
  fontAwesome: {
    servedCss: { key: "css/all.min.css", ...cssEnc, base64InBundle: fontAwesome["css/all.min.css"].base64.length },
    cssUrlTargets: [...faTargets].sort(),
    fontFaceSrcOrder: faFaces,
    fonts: fontAwesomeRows,
    totals: faSum,
  },
  bootstrapFonts: {
    servedCss: { key: "mod-style-assets/card-mod-bootstrap/assets/style/bootstrap-icons.css", bytes: Buffer.byteLength(iconsCss) },
    cssUrlTargets: [...iconsTargets].sort(),
    fontFaceSrcOrder: iconsFaces,
    fonts: bootstrapFontRows,
    totals: bsSum,
  },
  codedAttachments: { rows: codedRows },
  duplicateGroups,
  unreferencedTotals: {
    count: unreferenced.length,
    decoded: unreferenced.reduce((n, r) => n + r.decoded, 0),
    base64InBundle: unreferenced.reduce((n, r) => n + r.base64InBundle, 0),
    keys: unreferenced.map((r) => r.key),
  },
  neverFetchedByWoff2Browser: {
    count: neverFetched.length,
    decoded: neverFetched.reduce((n, r) => n + r.decoded, 0),
    base64InBundle: neverFetched.reduce((n, r) => n + r.base64InBundle, 0),
    keys: neverFetched.map((r) => r.key),
  },
  servedCssTotals: {
    decoded: cssEnc.decoded + faSum.decoded + bsSum.decoded,
    gzip: cssEnc.gzip + faSum.gzip + bsSum.gzip,
    base64InBundle: fontAwesome["css/all.min.css"].base64.length + faSum.base64InBundle + bsSum.base64InBundle,
  },
};

const k = (n) => `${(n / 1024).toFixed(1)} KiB`;
const p = (s, n) => String(s).padEnd(n);
const r = (s, n) => String(s).padStart(n);

console.log(`fontawesome served css css/all.min.css  decoded ${k(cssEnc.decoded)}  gzip ${k(cssEnc.gzip)}  brotli ${k(cssEnc.brotli)}`);
console.log("fontawesome @font-face src order:");
for (const f of faFaces) console.log(`  ${p(f.family, 18)} ${f.sources.map((s) => `${s.file} (${s.format})`).join(" then ")}`);
for (const row of fontAwesomeRows) {
  console.log(`  ${p(row.key, 34)} decoded ${r(row.decoded, 7)}  gzip ${r(row.gzip, 7)}  b64 ${r(row.base64InBundle, 7)}  referenced=${row.referencedByServedCss}  fetched-by-woff2-browser=${row.selectedByWoff2Browser}`);
}
console.log(`  TOTAL fonts: decoded ${faSum.decoded}  gzip ${faSum.gzip}  base64 ${faSum.base64InBundle}`);
console.log("");
console.log("bootstrap icons @font-face src order:");
for (const f of iconsFaces) console.log(`  ${p(f.family, 18)} ${f.sources.map((s) => `${s.file} (${s.format})`).join(" then ")}`);
for (const row of bootstrapFontRows) {
  console.log(`  ${p(row.key, 34)} decoded ${r(row.decoded, 7)}  gzip ${r(row.gzip, 7)}  b64 ${r(row.base64InBundle, 7)}  referenced=${row.referencedByServedCss}  fetched-by-woff2-browser=${row.selectedByWoff2Browser}`);
}
console.log(`  TOTAL fonts: decoded ${bsSum.decoded}  gzip ${bsSum.gzip}  base64 ${bsSum.base64InBundle}`);
console.log("");
console.log(`UNREFERENCED by served css: ${report.unreferencedTotals.count} files, decoded ${k(report.unreferencedTotals.decoded)}, base64-in-bundle ${k(report.unreferencedTotals.base64InBundle)}`);
for (const key of report.unreferencedTotals.keys) console.log(`  ${key}`);
console.log(`NEVER FETCHED by a woff2 browser (fallback behind woff2): ${report.neverFetchedByWoff2Browser.count} files, decoded ${k(report.neverFetchedByWoff2Browser.decoded)}, base64-in-bundle ${k(report.neverFetchedByWoff2Browser.base64InBundle)}`);
for (const key of report.neverFetchedByWoff2Browser.keys) console.log(`  ${key}`);
console.log("");
console.log(`DUPLICATE payloads: ${duplicateGroups.length} group(s), ${duplicateGroups.reduce((n, g) => n + g.redundantBytes, 0)} redundant bytes`);
for (const g of duplicateGroups) console.log(`  sha ${g.sha256.slice(0, 16)}… ${g.bytesEach} bytes each: ${g.keys.join(" + ")}`);
console.log("");
console.log("CODED attachments:");
for (const row of codedRows) {
  console.log(`  ${p(row.key, 28)} ${Object.entries(row.versions).map(([v, m]) => `${v}=${m.decoded}`).join("  ")}`);
}
console.log("");
console.log(`SERVED-CSS TOTALS: decoded ${k(report.servedCssTotals.decoded)}  gzip ${k(report.servedCssTotals.gzip)}  base64-in-bundle ${k(report.servedCssTotals.base64InBundle)}`);

if (JSON_OUT !== null) {
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nwrote ${JSON_OUT}`);
}
// benchmarks/edge-cold-start/measure-static-vs-dynamic-import-of-gzip-inlined-wasm.mjs
// DOES A DYNAMIC IMPORT MOVE THE GZIP-INLINED WASM INFLATE OFF THE BOOT PATH?
//
// The plugin (tools/vendor/gzip-inline-wasm-blobs-esbuild-plugin.mjs) emits a
// TOP-LEVEL AWAIT that inflates the gzip and re-encodes it to base64 when the
// module body evaluates. That is only on the edge's critical path — before the
// first byte of the first request — if some module reaches it STATICALLY. This
// bench builds the real plugin's output into two outer bundles over the real
// vendored LibSass module, one importing it statically and one dynamically with
// the same esbuild options the Bunny builds use, then times import() of each
// outer bundle in a FRESH child process per repetition.
//
// It asserts the deferred path still yields byte-identical base64, so a faster
// import is never a smaller payload.
//
//   node benchmarks/edge-cold-start/measure-static-vs-dynamic-import-of-gzip-inlined-wasm.mjs \
//     --reps 7 --out tmp/edge-cold-start/static-vs-dynamic.json
//
// WHAT THIS DOES NOT MEASURE: Bunny's own numbers. This runs the same inflate
// on Node 24 / win32 through the same plugin; the Deno-based edge runtime will
// differ in absolute terms. Treat the ratio as evidence for the shape and the
// magnitude as an order-of-size, never as a Bunny latency claim. The Bunny-side
// numbers live in tmp/edge-cold-start/*.json, measured against staging script
// 96895 by measure-staging-edge-cold-vs-warm-ttfb.mjs.

import { build } from "esbuild";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipInlineWasmBlobsPlugin } from "../../tools/vendor/gzip-inline-wasm-blobs-esbuild-plugin.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i === -1 || i === argv.length - 1 ? d : argv[i + 1]; };
const REPS = Number(arg("reps", "7"));
const OUT = arg("out", join("tmp/edge-cold-start", "static-vs-dynamic.json"));
const ROOT = resolve(process.cwd());

const LIBSASS = join(ROOT, "vendor", "libsass-wasm", "libsass-3.6.4-wasm-base64.js");

const dir = join(tmpdir(), "decko-static-vs-dynamic-inflate-bench");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const entry = (name, body) => {
  const file = join(dir, `${name}.entry.mjs`);
  writeFileSync(file, body);
  return file;
};

const ENTRIES = {
  // Today's shape: a static import, which puts the plugin's top-level await on
  // the module graph's evaluation path.
  static: entry("static", `import libsassWasmBase64 from ${JSON.stringify(LIBSASS)};\nexport default libsassWasmBase64;\n`),
  // The proposed shape: the same module, reached only when the importer asks.
  dynamic: entry("dynamic", `export default () => import(${JSON.stringify(LIBSASS)}).then((m) => m.default);\n`),
};

const built = {};
for (const [name, src] of Object.entries(ENTRIES)) {
  const outfile = join(dir, `${name}.bundle.mjs`);
  const result = await build({
    entryPoints: [src],
    outfile,
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    minify: true,
    external: ["node:process", "@bunny.net/edgescript-sdk"],
    conditions: ["deno", "bunny", "import", "default"],
    mainFields: ["module", "main"],
    plugins: [gzipInlineWasmBlobsPlugin()],
    logLevel: "error",
  });
  writeFileSync(outfile, result.outputFiles[0].text);
  built[name] = { file: pathToFileURL(outfile).href, bytes: Buffer.byteLength(result.outputFiles[0].text, "utf8"), code: result.outputFiles[0].text };
}

// The child times ONE import of the outer bundle in a fresh process. The static
// child reads its default during the import (the inflate is part of evaluating
// the graph); the dynamic child resolves the thunk afterwards and reports both
// halves, so the deferred cost is visible rather than hidden. The dynamic entry
// is `() => import(mod).then((m) => m.default)`, so the thunk resolves to the
// base64 string itself — one unwrap, not two.
const child = (href, isDynamic) => `
const t0 = performance.now();
const m = await import(${JSON.stringify(href)});
const t1 = performance.now();
let value = null, t2 = t1;
if (${isDynamic}) { value = await m.default(); t2 = performance.now(); }
else { value = m.default; }
process.stdout.write(JSON.stringify({
  import_ms: +(t1 - t0).toFixed(2),
  deferred_call_ms: +(t2 - t1).toFixed(2),
  kind: typeof value,
  length: typeof value === "string" ? value.length : -1,
}));
`;

const run = (name) => {
  const script = child(built[name].file, name === "dynamic");
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" }));
};

const staticRuns = [];
const dynamicRuns = [];
for (let i = 0; i < REPS; i += 1) {
  staticRuns.push(run("static"));
  dynamicRuns.push(run("dynamic"));
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, min: +s[0].toFixed(2), p50: +s[Math.ceil(s.length * 0.5) - 1].toFixed(2), max: +s[s.length - 1].toFixed(2), mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2) };
};

const staticImport = stats(staticRuns.map((r) => r.import_ms));
const dynamicImport = stats(dynamicRuns.map((r) => r.import_ms));
const dynamicDeferredCall = stats(dynamicRuns.map((r) => r.deferred_call_ms));

const artifact = {
  instrument: "benchmarks/edge-cold-start/measure-static-vs-dynamic-import-of-gzip-inlined-wasm.mjs",
  plugin: "tools/vendor/gzip-inline-wasm-blobs-esbuild-plugin.mjs",
  measured_at: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  reps: REPS,
  libsass_module: LIBSASS,
  outer_bundle_bytes: { static: built.static.bytes, dynamic: built.dynamic.bytes },
  static_import_ms: staticImport,
  dynamic_import_ms: dynamicImport,
  dynamic_deferred_call_ms: dynamicDeferredCall,
  moved_off_boot_path_ms: +(staticImport.p50 - dynamicImport.p50).toFixed(2),
  payload_identical: staticRuns[0].length === dynamicRuns[0].length && dynamicRuns[0].length === staticRuns[0].length,
  shapes: { static: staticRuns[0], dynamic: dynamicRuns[0] },
  caveat: "Node 24 / win32 through the same plugin; NOT a Bunny runtime number. The Bunny-side cold/warm TTFB is measured separately against staging 96895.",
  runs: { static: staticRuns, dynamic: dynamicRuns },
};

mkdirSync(dirname(resolve(ROOT, OUT)), { recursive: true });
writeFileSync(resolve(ROOT, OUT), `${JSON.stringify(artifact, null, 2)}\n`);
const { runs: _r, ...summary } = artifact;
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

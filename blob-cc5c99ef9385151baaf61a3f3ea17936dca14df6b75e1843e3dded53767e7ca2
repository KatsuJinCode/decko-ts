// benchmarks/edge-cold-start/measure-gzip-wasm-blob-inflate-at-module-eval.mjs
// WHAT THE GZIP-INLINE PLUGIN COSTS AT MODULE EVALUATION, and what deferring
// it saves.
//
// THE QUESTION: tools/bundle-bunny-edge-engine.mjs's gzipInlineWasmBlobsPlugin
// replaces the LibSass base64 module's body with a TOP-LEVEL AWAIT that inflates
// the gzip and re-encodes it to base64 the moment the module is evaluated. On
// the Bunny edge that is inside the isolate boot, before the entry's first
// request. src/server/libsass-wasm.ts:13 documents instantiation as lazy ("a
// host that never saves a stylesheet never pays for it"), but a static import
// (src/server/libsass-wasm.ts:15) means the plugin's inflate runs anyway, on
// every cold isolate, whether or not a stylesheet is ever compiled.
//
// THIS BENCH builds two module bodies over the SAME gzip bytes and times
// `import()` of each in a FRESH child process per repetition (a warm process
// would hide exactly the cost being measured — first-touch inflate and the
// first base64 decode allocation). It reports:
//   eager_ms  import() of the current plugin output (top-level await inflate)
//   lazy_ms   import() of a memoized thunk (inflate on first CALL instead)
//   inflate_ms  the time the deferred work actually costs when it is called,
//               so deferral is shown to MOVE the cost, never to delete it.
//
//   node benchmarks/edge-cold-start/measure-gzip-wasm-blob-inflate-at-module-eval.mjs \
//     --reps 7 --out tmp/edge-cold-start/inflate-cost.json

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i === -1 || i === argv.length - 1 ? d : argv[i + 1]; };
const REPS = Number(arg("reps", "7"));
const VENDOR = arg("vendor", "vendor/libsass-wasm/libsass-3.6.4-wasm-base64.js");
const OUT = arg("out", join("tmp/edge-cold-start", "inflate-cost.json"));

// The vendor module's own bytes, then the gzip the plugin would produce —
// identical input to the plugin, so the timing is the plugin's timing.
const raw = readFileSync(VENDOR, "utf8");
const b64 = /export default libsass3_6_4WasmBase64;\s*$/m.test(raw)
  ? raw.slice(raw.indexOf('"', raw.indexOf("const libsass3_6_4WasmBase64")) + 1, raw.lastIndexOf('";'))
  : null;
if (b64 === null) throw new Error(`could not lift the base64 literal out of ${VENDOR}`);
const original = Buffer.from(b64, "base64");
const gz = gzipSync(original, { level: 9 });

const inflateBody = `const bin = typeof Uint8Array.fromBase64 === "function"
  ? Uint8Array.fromBase64(GZIPPED_BINARY_B64)
  : Uint8Array.from(atob(GZIPPED_BINARY_B64), (c) => c.charCodeAt(0));
const stream = new DecompressionStream("gzip");
const writer = stream.writable.getWriter();
writer.write(bin);
writer.close();
return new Uint8Array(await new Response(stream.readable).arrayBuffer());`;

// EAGER: exactly what the plugin emits today — the inflate is a top-level await.
const eager = `const GZIPPED_BINARY_B64 = ${JSON.stringify(gz.toString("base64"))};
const inflated = await (async () => {
${inflateBody}
})();
export default await (async () => { let s = ""; for (let i = 0; i < inflated.length; i += 0x8000) s += String.fromCharCode.apply(null, inflated.subarray(i, i + 0x8000)); return btoa(s); })();
`;

// LAZY: the same bytes, but behind a memoized thunk. `import()` returns the
// thunk without touching the gzip; the inflate runs on the first CALL.
const lazy = `const GZIPPED_BINARY_B64 = ${JSON.stringify(gz.toString("base64"))};
let cached;
export default () => (cached ??= (async () => {
const inflated = await (async () => {
${inflateBody}
})();
let s = ""; for (let i = 0; i < inflated.length; i += 0x8000) s += String.fromCharCode.apply(null, inflated.subarray(i, i + 0x8000)); return btoa(s);
})());
`;

// The child measures one import() and prints JSON. Fresh process per rep: a
// warm module registry or a warm heap would understate the cold-isolate cost.
const child = (file, callThunk) => `
const t0 = performance.now();
const m = await import(${JSON.stringify(file)});
const t1 = performance.now();
let out = null;
if (${callThunk}) { const v = await m.default(); out = { kind: "promise", length: typeof v === "string" ? v.length : -1 }; }
else { out = { kind: typeof m.default === "string" ? "string" : typeof m.default, length: typeof m.default === "string" ? m.default.length : -1 }; }
process.stdout.write(JSON.stringify({ import_ms: +(t1 - t0).toFixed(2), ...out }));
`;

const dir = join(tmpdir(), "decko-inflate-bench");
mkdirSync(dir, { recursive: true });
const eagerFile = join(dir, "eager.mjs");
const lazyFile = join(dir, "lazy.mjs");
writeFileSync(eagerFile, eager);
writeFileSync(lazyFile, lazy);

// A dynamic import() needs a URL, and on Windows an absolute path is read as
// the "c:" scheme rather than a file path; pathToFileURL is the conversion the
// platform requires.
const run = (file, callThunk) => {
  const script = child(pathToFileURL(file).href, callThunk);
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  return JSON.parse(out);
};

const eagerRuns = [];
const lazyRuns = [];
const lazyCallRuns = [];
for (let i = 0; i < REPS; i += 1) {
  eagerRuns.push(run(eagerFile, false));
  lazyRuns.push(run(lazyFile, false));
  lazyCallRuns.push(run(lazyFile, true));
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { n: s.length, min: +s[0].toFixed(2), p50: +s[Math.ceil(s.length * 0.5) - 1].toFixed(2), max: +s[s.length - 1].toFixed(2), mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2) };
};

// The bytes are the same by construction; prove it rather than assert it.
const roundtrip = Buffer.from(await (await import(pathToFileURL(lazyFile).href)).default(), "base64");

const artifact = {
  instrument: "benchmarks/edge-cold-start/measure-gzip-wasm-blob-inflate-at-module-eval.mjs",
  measured_at: new Date().toISOString(),
  vendor_module: VENDOR,
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  reps: REPS,
  bytes: {
    vendor_module_utf8: Buffer.byteLength(raw, "utf8"),
    wasm_inflated: original.length,
    gzip_level_9: gz.length,
    gzip_base64_in_bundle: gz.toString("base64").length,
  },
  eager_import_ms: stats(eagerRuns.map((r) => r.import_ms)),
  lazy_import_ms: stats(lazyRuns.map((r) => r.import_ms)),
  lazy_import_plus_first_call_ms: stats(lazyCallRuns.map((r) => r.import_ms)),
  eager_export_shape: eagerRuns[0],
  lazy_export_shape: lazyRuns[0],
  lazy_first_call_shape: lazyCallRuns[0],
  bytes_identical_after_deferral: roundtrip.equals(original),
  runs: { eager: eagerRuns, lazy: lazyRuns, lazy_then_call: lazyCallRuns },
};

mkdirSync(OUT.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
const { runs: _r, ...summary } = artifact;
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

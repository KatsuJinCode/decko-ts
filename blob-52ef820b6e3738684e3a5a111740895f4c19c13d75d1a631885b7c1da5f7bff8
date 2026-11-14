// tools/bundle-bunny-edge-engine.mjs — build the FULL-ENGINE deployable Bunny
// Edge Script (sibling of tools/bundle-bunny-worker.mjs, which builds the
// lightweight reader).
//
//   node tools/bundle-bunny-edge-engine.mjs --wasm-asset-base <HTTPS directory>
//
// Output:
//   deploy/dist/bunny-edge-engine.bundle.js   the code to upload
//   deploy/dist/bunny-edge-engine.code.json   {"Code": <same text>} — the
//                                              request body for
//                                              POST /compute/script/{id}/code
//   deploy/dist/wasm-assets/                 raw binaries and their licenses
//   deploy/dist/bunny-edge-artifacts.json    hashes; upload nothing automatically
//
// Entry: deploy/bunny-worker-src/bunny-edge-engine-entry.ts — RenderEngine +
// FetchEngine over BunnyDbDriver, routing through the lineage surface's
// parsePath (deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.ts —
// the Bunny lineage's independently-evolved route grammar, not worker.ts's)
// and wrapping renders in the lineage surface's layoutPage. See that file's
// header for the runtime contract and the node: import inventory with each
// import's dependency status.
//
// EXTERNAL BY DESIGN, same as the reader build: "@bunny.net/edgescript-sdk"
// stays a bare import (the platform resolves it at run time; inlining would
// pin the Bunny.v1.serve contract into the artifact). node: builtins stay
// external too — the Deno-based edge runtime provides them (the live reader
// bundle ships node:process and runs).

import { build } from "esbuild";
import { writeFileSync, mkdirSync, lstatSync, statSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { builtinModules } from "node:module";
import { createHash } from "node:crypto";
import { assertStaticUglifierCurrent } from "./vendor/build-uglify-harmony-static.mjs";
import { assertBunnyScriptBudget, BUNNY_SCRIPT_LIMIT_BYTES } from "./vendor/edge-bundle-budget.mjs";
import { assertBunnyRuntimeImports } from "./vendor/bunny-runtime-imports.mjs";
import { coffeescriptNodeBuiltinStubs } from "./vendor/coffeescript-edge-bundler-stubs.mjs";
import { rawWasmAssetsPlugin, writeRawWasmAssets } from "./vendor/raw-wasm-assets-esbuild-plugin.mjs";
import { buildStampDefines, readBuildStamp } from "./hosted-build-guard/build-stamp.mjs";

const here = resolve(process.cwd());
const options = new Map();
const allowedOptions = new Set(["--out-dir", "--wasm-asset-base", "--metafile"]);
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (!allowedOptions.has(name)) throw Error(`Unknown build option: ${name}`);
  if (options.has(name)) throw Error(`Duplicate build option: ${name}`);
  if (!value || value.startsWith("--")) throw Error(`${name} requires a value`);
  options.set(name, value);
}
const outputDirectory = options.get("--out-dir");
const assetBaseUrl = options.get("--wasm-asset-base");
const rawWasm = rawWasmAssetsPlugin({ repoRoot: here, assetBaseUrl });
const scripts = [];
// --metafile <dir> also writes esbuild metafile: the per-module byte
// attribution of what actually lands in the script. The emitted bundle is
// byte-for-byte unchanged; this only answers "what dominates the bytes"
// from the real build instead of from a re-implementation of the build
// options. Byte totals still come from assertBunnyScriptBudget below, not
// from the metafile. See tools/perf/measure-bunny-edge-engine-boot-cost.mjs
// for what those bytes cost.
const metafileDirectory = options.get("--metafile");
for (const name of ["--out-dir", "--metafile"]) {
  const value = options.get(name);
  if (value !== undefined && (/^[t]:/i.test(resolve(value)) || /[\\/]Downloads(?:[\\/]|$)/i.test(resolve(value)))) {
    throw new Error(`${name} requires an allowed output directory`);
  }
}
const packageDirectory = resolve(outputDirectory ?? resolve(here, "deploy/dist"));
if (lstatSync(packageDirectory, { throwIfNoEntry: false }) !== undefined && readdirSync(packageDirectory).length !== 0) {
  throw new Error("Use a new empty --out-dir; an existing reviewed package must not be overwritten");
}
/** The two scripts this tool builds. The full engine script serves every
 *  request; the read-only script serves anonymous page reads and forwards
 *  everything else to the full one (bunny-edge-read-handler.ts). */
const TARGETS = [
  { entry: "deploy/bunny-worker-src/bunny-edge-engine-entry.ts", out: "deploy/dist/bunny-edge-engine.bundle.js", payload: "deploy/dist/bunny-edge-engine.code.json", readOnly: false },
  { entry: "deploy/bunny-worker-src/bunny-edge-read-entry.ts", out: "deploy/dist/bunny-edge-read.bundle.js", payload: "deploy/dist/bunny-edge-read.code.json", readOnly: true },
];

function omitAdminScssSnapshotsPlugin() {
  return {
    name: "omit-admin-scss-snapshots-on-read-worker",
    setup(b) {
      b.onLoad({ filter: /edge-(style-source|bootstrap-scss)-snapshot\.js$/ }, () => ({
        loader: "js",
        contents: "export const edgeAssetSources = {};",
      }));
    },
  };
}
if (metafileDirectory !== undefined) {
  if (lstatSync(metafileDirectory, { throwIfNoEntry: false }) !== undefined && !statSync(metafileDirectory).isDirectory()) {
    throw Error("--metafile requires a directory");
  }
  for (const target of TARGETS) {
    if (lstatSync(resolve(metafileDirectory, basename(target.out) + ".meta.json"), { throwIfNoEntry: false }) !== undefined) {
      throw Error("Existing reviewed metafile must not be overwritten");
    }
  }
}
// Every script this tool builds carries the commit it was built from, so the
// hosted-run guard can prove the deployed build equals the commit under test.
const buildDefines = buildStampDefines(readBuildStamp(here));
assertStaticUglifierCurrent();

/** Left for the edge runtime to resolve; see the header comment. */
const EXTERNAL_RUNTIME_IMPORTS = ["@bunny.net/edgescript-sdk"];

const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((n) => `node:${n}`),
]);

for (const target of TARGETS) {
  const src = resolve(here, target.entry);
  const out = outputDirectory === undefined ? resolve(here, target.out) : resolve(outputDirectory, basename(target.out));
  const payload = outputDirectory === undefined ? resolve(here, target.payload) : resolve(outputDirectory, basename(target.payload));
  mkdirSync(dirname(out), { recursive: true });

  const built = await build({
    entryPoints: [src],
    outfile: out,
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    minify: true,
    external: [...builtins, ...EXTERNAL_RUNTIME_IMPORTS],
    conditions: ["deno", "bunny", "import", "default"],
    mainFields: ["module", "main"],
    // The write surface bundles the npm coffeescript package (the
    // CoffeeScript compiler, coffee-npm-compiler.ts); its entry requires
    // fs/vm/path for file and eval helpers compile() never touches. Stub
    // those three for the coffeescript subtree only — the bundle's
    // no-static-node-imports discipline stays intact.
    plugins: [
      coffeescriptNodeBuiltinStubs(),
      rawWasm.plugin,
      ...(target.readOnly ? [omitAdminScssSnapshotsPlugin()] : []),
    ],
    define: buildDefines,
    logLevel: "info",
    metafile: true,
    // The bundle's first statement stamps when evaluation began, before any
    // module's top level runs; bunny-edge-isolate-probe.ts reports it.
    banner: { js: 'globalThis.__deckoEval0=[typeof performance<"u"?performance.now():-1,Date.now()];' },
  });

  const code = built.outputFiles[0].text;
  const bytes = assertBunnyScriptBudget(code);
  // Bunny documents a 10 MB script cap, but staging script 96895 stopped
  // booting above ~9.25 MB on 2026-10-16; the budget in
  // tools/vendor/edge-bundle-budget.mjs is the boot-safe ceiling and fails the
  // build above it. Warn at 80% of that ceiling.
  const LIMIT_BYTES = BUNNY_SCRIPT_LIMIT_BYTES;
  if (bytes > LIMIT_BYTES * 0.8) {
    console.error(`WARN: bundle ${bytes} bytes is over 80% of the conservative ${LIMIT_BYTES}-byte script limit.`);
  }
  console.log(`bundle validated: ${out} (${bytes} bytes = ${(bytes / 1024).toFixed(1)} KB, limit ${LIMIT_BYTES} bytes)`);

  // Output is written only after budget and import validation pass.

  // Parse module syntax; compiler strings and comments are only data.
  // Actual unsupported dependencies still refuse before package writes.
  const runtimeImports = assertBunnyRuntimeImports(code);
  // Anything importing a node: builtin depends on the Deno-based runtime
  // providing it. Report the exact set — this is the boot-risk inventory the
  // entry file's header documents.
  const nodeImports = runtimeImports.nodeImports;
  if (nodeImports.length > 0) {
    console.log(`note: bundle keeps ${nodeImports.join(", ")} external (the edge runtime must provide them)`);
  }

  writeFileSync(out, code, { flag: "wx" });
  writeFileSync(payload, JSON.stringify({ Code: code }), { flag: "wx" });
  scripts.push({ filename: basename(out), byteLength: bytes, sha256: createHash("sha256").update(code).digest("hex") });
  console.log(`payload written: ${payload} (${code.length} chars)`);
  if (metafileDirectory !== undefined) {
    mkdirSync(metafileDirectory, { recursive: true });
    const metaPath = resolve(metafileDirectory, basename(target.out) + ".meta.json");
    writeFileSync(metaPath, JSON.stringify(built.metafile, null, 1), { flag: "wx" });
    console.log(`metafile written: ${metaPath}`);
  }
}

const assetDirectory = resolve(packageDirectory, "wasm-assets");
mkdirSync(assetDirectory, { recursive: true });
const assets = writeRawWasmAssets({ assets: rawWasm.assets, outputDirectory: assetDirectory });
const manifestFile = resolve(packageDirectory, "bunny-edge-artifacts.json");
writeFileSync(manifestFile, JSON.stringify({ format: "decko-raw-wasm-artifacts/1", compressed: false, scripts, assets }, null, 2) + "\n", { flag: "wx" });
console.log(`raw binary assets and integrity manifest written: ${manifestFile}`);

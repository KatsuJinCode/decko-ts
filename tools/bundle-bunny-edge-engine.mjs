// tools/bundle-bunny-edge-engine.mjs — build the FULL-ENGINE deployable Bunny
// Edge Script (sibling of tools/bundle-bunny-worker.mjs, which builds the
// lightweight reader).
//
//   node tools/bundle-bunny-edge-engine.mjs
//
// Output:
//   deploy/dist/bunny-edge-engine.bundle.js   the code to upload
//   deploy/dist/bunny-edge-engine.code.json   {"Code": <same text>} — the
//                                              request body for
//                                              POST /compute/script/{id}/code
//
// Entry: deploy/bunny-worker-src/bunny-edge-engine-entry.ts — RenderEngine +
// FetchEngine over BunnyDbDriver, routing through worker.ts's parsePath and
// wrapping renders in worker.ts's layoutPage. See that file's header for the
// runtime contract and the node: import inventory with each import's
// dependency status.
//
// EXTERNAL BY DESIGN, same as the reader build: "@bunny.net/edgescript-sdk"
// stays a bare import (the platform resolves it at run time; inlining would
// pin the Bunny.v1.serve contract into the artifact). node: builtins stay
// external too — the Deno-based edge runtime provides them (the live reader
// bundle ships node:process and runs).

import { build } from "esbuild";
import { readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { builtinModules } from "node:module";
import { coffeescriptNodeBuiltinStubs } from "./vendor/coffeescript-edge-bundler-stubs.mjs";

const here = resolve(process.cwd());
/** The two scripts this tool builds. The full engine script serves every
 *  request; the read-only script serves anonymous page reads and forwards
 *  everything else to the full one (bunny-edge-read-handler.ts). */
const TARGETS = [
  { entry: "deploy/bunny-worker-src/bunny-edge-engine-entry.ts", out: "deploy/dist/bunny-edge-engine.bundle.js", payload: "deploy/dist/bunny-edge-engine.code.json" },
  { entry: "deploy/bunny-worker-src/bunny-edge-read-entry.ts", out: "deploy/dist/bunny-edge-read.bundle.js", payload: "deploy/dist/bunny-edge-read.code.json" },
];

/** Left for the edge runtime to resolve; see the header comment. */
const EXTERNAL_RUNTIME_IMPORTS = ["@bunny.net/edgescript-sdk"];

const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((n) => `node:${n}`),
]);

for (const target of TARGETS) {
  const src = resolve(here, target.entry);
  const out = resolve(here, target.out);
  const payload = resolve(here, target.payload);
  mkdirSync(dirname(out), { recursive: true });

  await build({
    entryPoints: [src],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    minify: true,
    external: [...builtins, ...EXTERNAL_RUNTIME_IMPORTS],
    conditions: ["deno", "bunny", "import", "default"],
    mainFields: ["module", "main"],
    // @cf-wasm/photon (the image-version resizer on the write path) has no
    // deno/bunny export condition, and its default entry imports the .wasm
    // file as a workerd module binding, which neither esbuild nor the Bunny
    // runtime provides. Its node entry carries the same WebAssembly module
    // inline (base64) and compiles it with WebAssembly.Module, which the
    // Deno-based edge runtime supports.
    alias: { "@cf-wasm/photon": "@cf-wasm/photon/node" },
    // The write surface bundles the npm coffeescript package (the
    // CoffeeScript compiler, coffee-npm-compiler.ts); its entry requires
    // fs/vm/path for file and eval helpers compile() never touches. Stub
    // those three for the coffeescript subtree only — the bundle's
    // no-static-node-imports discipline stays intact.
    plugins: [coffeescriptNodeBuiltinStubs()],
    logLevel: "info",
    metafile: true,
    // The bundle's first statement stamps when evaluation began, before any
    // module's top level runs; bunny-edge-isolate-probe.ts reports it.
    banner: { js: 'globalThis.__deckoEval0=[typeof performance<"u"?performance.now():-1,Date.now()];' },
  });

  const stat = statSync(out);
  // https://bunny.net/docs/scripting/limits.md: script size limit is 10 MB.
  // Warn at 80%.
  const LIMIT_BYTES = 10 * 1024 * 1024;
  if (stat.size > LIMIT_BYTES * 0.8) {
    console.error(`WARN: bundle ${(stat.size / 1024 / 1024).toFixed(2)}MB is over 80% of the ${LIMIT_BYTES / 1024 / 1024}MB script limit.`);
  }
  console.log(`bundle written: ${out} (${stat.size} bytes = ${(stat.size / 1024).toFixed(1)} KB, limit ${LIMIT_BYTES} bytes)`);

  const code = readFileSync(out, "utf8");

  // The bundle must be a valid ES module: the SDK stays a bare import.
  if (!code.includes('from"@bunny.net/edgescript-sdk"') && !code.includes('from "@bunny.net/edgescript-sdk"')) {
    console.error("FAIL: bundle no longer imports @bunny.net/edgescript-sdk; the deployed script would not start a server.");
    process.exit(1);
  }
  // No bare npm package import other than the SDK may survive: there is no
  // npm registry on the edge. The boundary excludes data strings like
  // `["to","from","cc"]` (an email field list in the notify code) — a real
  // minified import always has a non-quote character before `from`.
  // Anchor on the import/export KEYWORD, not the preceding character: data
  // strings defeat character-class checks. The r6b bundle carried the email
  // mod's manifest rows (`setPath:"right/from",assignsType:"list"`) and the
  // old regex read `from` inside `"right/from"` + the following `,assignsType:`
  // as a phantom bare import (measured 2026-10-06, blocked the r6 publish).
  // `[^;]` bounds the match to one statement so data strings containing
  // semicolons cannot bridge.
  const bareImports = [...new Set(
    [...code.matchAll(/(?:import|export)[^;]{0,400}?from\s*"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((s) => !s.startsWith("node:"))
      .filter((s) => s !== "@bunny.net/edgescript-sdk")
      .filter((s) => /^(\.\/|\.\.\/|\/|[a-zA-Z]:)/.test(s) === false),
  )];
  if (bareImports.length > 0) {
    console.error(`FAIL: bundle carries unresolved bare imports: ${bareImports.join(", ")}`);
    process.exit(1);
  }
  // Anything importing a node: builtin depends on the Deno-based runtime
  // providing it. Report the exact set — this is the boot-risk inventory the
  // entry file's header documents.
  const nodeImports = [...new Set([...code.matchAll(/from\s*"((?:node:)?[a-z_]+)"/g)].map((m) => m[1]).filter((s) => s.startsWith("node:")))];
  if (nodeImports.length > 0) {
    console.log(`note: bundle keeps ${nodeImports.join(", ")} external (the edge runtime must provide them)`);
  }

  writeFileSync(payload, JSON.stringify({ Code: code }));
  console.log(`payload written: ${payload} (${code.length} chars)`);
}

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
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { builtinModules } from "node:module";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { assertStaticUglifierCurrent } from "./vendor/build-uglify-harmony-static.mjs";
import { assertBunnyScriptBudget, BUNNY_SCRIPT_LIMIT_BYTES } from "./vendor/edge-bundle-budget.mjs";
assertStaticUglifierCurrent();
import { coffeescriptNodeBuiltinStubs } from "./vendor/coffeescript-edge-bundler-stubs.mjs";

/** Inline WebAssembly blobs the Bunny builds store gzip-compressed. Each source
 *  module exports one base64-encoded WebAssembly binary; gzip (level 9) cuts the
 *  two of them (LibSass and the photon image resizer) by about 2.9 MB together.
 *  The Deno-based edge runtime inflates them with DecompressionStream (verified
 *  on staging script 96895, 2026-10-16), and the bytes after inflation are
 *  identical to the source module's, so behaviour does not change. Without this
 *  the release bundle (9,998,789 bytes) fails to boot on Bunny: see the budget
 *  in tools/vendor/edge-bundle-budget.mjs. */
const GZIPPED_INLINE_BLOBS = [
  { filter: /libsass-3\.6\.4-wasm-base64\.js$/, exports: "base64" },
  { filter: /photon_rs_bg\.wasm\.inline\.js$/, exports: "arrayBuffer" },
];

function gzipInlineWasmBlobsPlugin() {
  return {
    name: "gzip-inline-wasm-blobs",
    setup(build) {
      for (const blob of GZIPPED_INLINE_BLOBS) {
        build.onLoad({ filter: blob.filter }, async (args) => {
          const source = (await import(pathToFileURL(args.path).href)).default;
          const raw = typeof source === "string" ? Buffer.from(source, "base64") : Buffer.from(source);
          const gzipped = gzipSync(raw, { level: 9 }).toString("base64");
          const inflate = [
            `const GZIPPED_BINARY_B64 = "${gzipped}";`,
            "const inflated = await (async () => {",
            "  const bin = typeof Uint8Array.fromBase64 === \"function\"",
            "    ? Uint8Array.fromBase64(GZIPPED_BINARY_B64)",
            "    : Uint8Array.from(atob(GZIPPED_BINARY_B64), (c) => c.charCodeAt(0));",
            "  const stream = new DecompressionStream(\"gzip\");",
            "  const writer = stream.writable.getWriter();",
            "  writer.write(bin);",
            "  writer.close();",
            "  return new Uint8Array(await new Response(stream.readable).arrayBuffer());",
            "})();",
          ].join("\n");
          const exported = blob.exports === "base64"
            ? "export default await (async () => { let s = \"\"; for (let i = 0; i < inflated.length; i += 0x8000) s += String.fromCharCode.apply(null, inflated.subarray(i, i + 0x8000)); return btoa(s); })();"
            : "export default inflated.buffer;";
          return { contents: inflate + "\n" + exported + "\n", loader: "js" };
        });
      }
    },
  };
}

const here = resolve(process.cwd());
const outArg = process.argv.indexOf("--out-dir");
const outputDirectory = outArg < 0 ? undefined : process.argv[outArg + 1];
if (outArg >= 0 && (!outputDirectory || outputDirectory.startsWith("--") || /^[t]:/i.test(outputDirectory) || /[\\/]Downloads(?:[\\/]|$)/i.test(outputDirectory))) {
  throw new Error("--out-dir requires an allowed output directory");
}
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
    plugins: [coffeescriptNodeBuiltinStubs(), gzipInlineWasmBlobsPlugin()],
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
  // strings defeat character-class checks. The email mod's manifest rows
  // (`setPath:"right/from",assignsType:"list"`) once read as a phantom bare
  // import under the old regex, and the phantom blocked a publish before the
  // rule was fixed. `[^;]` bounds the match to one statement so data strings
  // containing semicolons cannot bridge.
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

  writeFileSync(out, code);
  writeFileSync(payload, JSON.stringify({ Code: code }));
  console.log(`payload written: ${payload} (${code.length} chars)`);
}

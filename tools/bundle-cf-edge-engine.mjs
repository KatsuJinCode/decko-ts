// tools/bundle-cf-edge-engine.mjs — build the Cloudflare Worker that serves
// the Bunny edge engine's handler over D1 (sibling of
// tools/bundle-bunny-edge-engine.mjs, same esbuild settings so the two
// builds differ only in their entry and database seam).
//
//   node tools/bundle-cf-edge-engine.mjs
//
// Output: deploy/dist/cf-edge-engine.bundle.js, uploaded unchanged by
// `wrangler deploy` (deploy/cf-riley/wrangler.toml sets no_bundle).

import { build } from "esbuild";
import { statSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { builtinModules } from "node:module";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { coffeescriptNodeBuiltinStubs } from "./vendor/coffeescript-edge-bundler-stubs.mjs";

// The repository root, from this file's location, so the build works from
// any working directory.
const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(here, "deploy/cf-worker-src/cf-edge-engine-entry.ts");
const out = resolve(here, "deploy/dist/cf-edge-engine.bundle.js");
const builtins = new Set([...builtinModules, ...builtinModules.map((n) => `node:${n}`)]);

mkdirSync(dirname(out), { recursive: true });
await build({
  entryPoints: [src],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  minify: true,
  external: [...builtins],
  conditions: ["deno", "bunny", "import", "default"],
  mainFields: ["module", "main"],
  // @cf-wasm/photon (the image-version resizer on the write path) has no
  // deno/bunny export condition, and its default entry imports the .wasm
  // file as a workerd module binding, which esbuild cannot load. Its node
  // entry carries the same WebAssembly module inline (base64) and compiles
  // it with WebAssembly.Module, which the workerd runtime supports.
  alias: { "@cf-wasm/photon": "@cf-wasm/photon/node" },
  // The write surface bundles the npm coffeescript package (the CoffeeScript
  // compiler, coffee-npm-compiler.ts); its entry requires fs/vm/path for
  // file and eval helpers compile() never touches. Stub those three for the
  // coffeescript subtree only — the bundle's no-static-node-imports
  // discipline stays intact.
  plugins: [coffeescriptNodeBuiltinStubs()],
  logLevel: "warning",
});
const bytes = statSync(out).size;
const sha = createHash("sha256").update(readFileSync(out)).digest("hex");
console.log(JSON.stringify({ out: "deploy/dist/cf-edge-engine.bundle.js", bytes, sha256: sha }));

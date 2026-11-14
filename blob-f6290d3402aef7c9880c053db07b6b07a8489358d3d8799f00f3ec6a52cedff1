// tools/bundle-cf-edge-engine.mjs — build the Cloudflare Worker that serves
// the Bunny edge engine's handler over D1 (sibling of
// tools/bundle-bunny-edge-engine.mjs, same esbuild settings so the two
// builds differ only in their entry and database seam).
//
//   node tools/bundle-cf-edge-engine.mjs
//
// Output: deploy/dist/cf-edge-engine.bundle.js, uploaded unchanged by
// `wrangler deploy` (the deploying wrangler.toml sets no_bundle).

import { build } from "esbuild";
import { statSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { builtinModules } from "node:module";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// The repository root, from this file's location, so the build works from
// any working directory.
const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(here, "deploy/cf-worker-src/cf-edge-engine-entry.ts");
const out = resolve(here, "deploy/dist/cf-edge-engine.bundle.js");
const builtins = new Set([...builtinModules, ...builtinModules.map((n) => `node:${n}`)]);

// Hard ceiling on the lean read-serving Worker bundle so dormant admin
// compilers (LibSass, Photon, CoffeeScript, Uglify, raw SCSS snapshots)
// and unused base64 raster variants (:favicon/carrierwave.png) can never
// be bundled into the hot serving path again.
export const MAX_CF_READ_BUNDLE_BYTES = 1_400_000;
export const FORBIDDEN_CF_READ_BUNDLE_SUBSTRINGS = [
  ":favicon/carrierwave.png",
  "libsass-3.6.4-wasm",
  "photon_rs_bg.wasm",
  "CoffeeScript Compiler",
];

const omitAdminScssSnapshotsPlugin = {
  name: "omit-admin-scss-snapshots-on-read-worker",
  setup(b) {
    b.onLoad({ filter: /edge-(style-source|bootstrap-scss)-snapshot\.js$/ }, () => ({
      loader: "js",
      contents: "export const edgeAssetSources = {};",
    }));
  },
};

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
  plugins: [omitAdminScssSnapshotsPlugin],
  logLevel: "warning",
});
const bundleText = readFileSync(out, "utf8");
const bytes = Buffer.byteLength(bundleText, "utf8");
if (bytes > MAX_CF_READ_BUNDLE_BYTES) {
  throw new Error(
    `cf-edge-engine.bundle.js is ${bytes} bytes, exceeding the ${MAX_CF_READ_BUNDLE_BYTES}-byte lean read-worker budget`,
  );
}
for (const forbidden of FORBIDDEN_CF_READ_BUNDLE_SUBSTRINGS) {
  if (bundleText.includes(forbidden)) {
    throw new Error(
      `cf-edge-engine.bundle.js contains forbidden dormant payload "${forbidden}"`,
    );
  }
}
const sha = createHash("sha256").update(bundleText, "utf8").digest("hex");
console.log(JSON.stringify({ out: "deploy/dist/cf-edge-engine.bundle.js", bytes, sha256: sha }));

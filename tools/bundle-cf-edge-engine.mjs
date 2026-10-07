// tools/bundle-cf-edge-engine.mjs — build the Cloudflare Worker that serves
// the Bunny edge engine's handler over D1 (sibling of
// tools/bundle-bunny-edge-engine.mjs, same esbuild settings so the two
// builds differ only in their entry and database seam).
//
//   node tools/bundle-cf-edge-engine.mjs
//
// Output: deploy/dist/cf-edge-engine.bundle.js, uploaded unchanged by
// `wrangler deploy` (deploy/cf-brandon/wrangler.toml sets no_bundle).

import { build } from "esbuild";
import { statSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { builtinModules } from "node:module";
import { createHash } from "node:crypto";

const here = resolve(process.cwd());
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
  logLevel: "warning",
});
const bytes = statSync(out).size;
const sha = createHash("sha256").update(readFileSync(out)).digest("hex");
console.log(JSON.stringify({ out: "deploy/dist/cf-edge-engine.bundle.js", bytes, sha256: sha }));

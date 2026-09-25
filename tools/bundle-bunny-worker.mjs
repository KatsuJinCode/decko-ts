import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { builtinModules } from "node:module";

const here = resolve(process.cwd());
const src = resolve(here, "deploy/bunny-worker-src/bunny-worker.ts");
const out = resolve(here, "deploy/dist/bunny-worker.bundle.js");

const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((n) => `node:${n}`),
]);

const result = await build({
  entryPoints: [src],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  minify: true,
  external: [...builtins],
  // Resolve "npm:..." specifiers against the npm registry (esbuild needs
  // a node-compatible path). Bunny's runtime re-resolves npm: specifiers
  // on its edge, but for the workstation-side bundle we need a working
  // resolution so esbuild can inline the package body.
  conditions: ["node", "import", "default"],
  mainFields: ["module", "main"],
  logLevel: "info",
  metafile: true,
});

const fs = require("node:fs");
const stat = fs.statSync(out);
console.log(`bundle written: ${out} (${stat.size} bytes = ${(stat.size / 1024).toFixed(1)} KB)`);
if (stat.size > 900 * 1024) {
  console.error(`WARN: bundle > 900KB (limit ~1MB). Inspect metafile.`);
}

// emit a Code.json ready for the API POST
const code = readFileSync(out, "utf8");
writeFileSync(resolve(here, "deploy/dist/bunny-worker.code.json"), JSON.stringify({ Code: code }));
console.log(`payload written: deploy/dist/bunny-worker.code.json (${code.length} chars)`);

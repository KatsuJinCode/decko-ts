// tools/bundle-cold-render-fetch-entry-attribution.mjs — bundle the
// fetch-entry consumer census (same shape as the point-query bundler).
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { builtinModules } from "node:module";
import { resolve } from "node:path";

const here = resolve(process.cwd());
const out = resolve(here, "benchmarks/cold-render/measure-fetch-entry-attribution.mjs");
mkdirSync(resolve(here, "benchmarks/cold-render"), { recursive: true });

const builtins = new Set([...builtinModules, ...builtinModules.map((n) => `node:${n}`)]);

await build({
  entryPoints: [resolve(here, "benchmarks/cold-render/instrument-fetch-entry-attribution.ts")],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: [...builtins, "better-sqlite3", "sass", "coffeescript"],
  metafile: false,
  logLevel: "silent",
});
console.log("bundled", out);

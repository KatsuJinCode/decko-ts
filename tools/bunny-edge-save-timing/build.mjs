// Builds the save-timing entry into one Bunny Edge Script bundle.
//
//   node tools/bunny-edge-save-timing/build.mjs [outFile]
//
// The edge runtime has no file system, so the core schema is inlined as a
// string constant. Bundling options match tools/bundle-bunny-edge-engine.mjs:
// the edgescript SDK and node builtins stay external, everything else is bundled.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { builtinModules } from "node:module";
import { coffeescriptNodeBuiltinStubs } from "../vendor/coffeescript-edge-bundler-stubs.mjs";

const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, "$1"));
const repo = resolve(here, "../..");
const out = resolve(process.argv[2] ?? resolve(repo, "deploy/dist/bunny-edge-save-timing.bundle.js"));
const schema = readFileSync(resolve(repo, "db/schema.sqlite.sql"), "utf8");
if (schema.includes("`") || schema.includes("${")) throw new Error("schema contains a template-literal character");

const staging = resolve(here, "entry.generated.ts");
mkdirSync(dirname(out), { recursive: true });
const entry = readFileSync(resolve(here, "entry.ts"), "utf8").replace(
  'declare const SCHEMA_SQLITE: string;',
  `const SCHEMA_SQLITE: string = \`${schema}\`;`,
);
// The staged entry lives beside the source so its relative imports resolve.
writeFileSync(staging.replace(/\.ts$/, ".ts"), entry);

const builtins = new Set([...builtinModules, ...builtinModules.map((n) => `node:${n}`)]);
try {
await build({
  entryPoints: [staging],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  minify: true,
  external: [...builtins, "@bunny.net/edgescript-sdk"],
  conditions: ["deno", "bunny", "import", "default"],
  mainFields: ["module", "main"],
  alias: { "@cf-wasm/photon": "@cf-wasm/photon/node" },
  plugins: [coffeescriptNodeBuiltinStubs()],
  logLevel: "warning",
  });
} finally {
  rmSync(staging, { force: true });
}
const code = readFileSync(out, "utf8");
const bare = [...new Set([...code.matchAll(/(?:import|export)[^;]{0,400}?from\s*"([^"]+)"/g)].map((m) => m[1]))]
  .filter((s) => !s.startsWith("node:") && s !== "@bunny.net/edgescript-sdk" && !/^(\.\/|\.\.\/|\/|[a-zA-Z]:)/.test(s));
if (bare.length > 0) throw new Error(`bundle has unresolved bare imports: ${bare.join(", ")}`);
console.log(`bundle written: ${out} (${(code.length / 1024).toFixed(0)} KB)`);

// benchmarks/speed/build.mjs — build the two port targets the speed
// benchmark serves:
//   tmp/speed/node-host.mjs     the Node host (node-host.ts)
//   tmp/speed/worker.mjs        the Worker (worker-entry.ts), with the
//                               esbuild settings of the deploy bundle
//                               (tools/bundle-cf-edge-engine.mjs)
//
//   node benchmarks/speed/build.mjs

import { build } from "esbuild";
import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { coffeescriptNodeBuiltinStubs } from "../../tools/vendor/coffeescript-edge-bundler-stubs.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const builtins = [...builtinModules, ...builtinModules.map((n) => `node:${n}`)];

await build({
  entryPoints: [resolve(root, "benchmarks/speed/node-host.ts")],
  outfile: resolve(root, "tmp/speed/node-host.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external: [...builtins, "better-sqlite3", "sass", "coffeescript", "@cf-wasm/photon"],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});
await build({
  entryPoints: [resolve(root, "benchmarks/speed/worker-entry.ts")],
  outfile: resolve(root, "tmp/speed/worker.mjs"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  minify: true,
  external: builtins,
  conditions: ["deno", "bunny", "import", "default"],
  mainFields: ["module", "main"],
  alias: { "@cf-wasm/photon": "@cf-wasm/photon/node" },
  plugins: [coffeescriptNodeBuiltinStubs()],
  logLevel: "warning",
});
console.log(JSON.stringify({ built: ["tmp/speed/node-host.mjs", "tmp/speed/worker.mjs"] }));

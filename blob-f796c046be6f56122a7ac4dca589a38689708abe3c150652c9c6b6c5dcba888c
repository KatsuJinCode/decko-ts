// decko-ts-pods.mjs -- `decko sow` / `decko eat` for the TypeScript engine.
//
//   node tools/pods/decko-ts-pods.mjs sow --deck <deck.sqlite3> -c '{}' -o pod.yml
//   node tools/pods/decko-ts-pods.mjs eat --deck <deck.sqlite3> pod.yml
//
// Bundles src/card/pods/cli.ts with esbuild (the repository's bundler) into
// the repository's tmp directory, runs it, and removes the bundle.
import { build } from "esbuild";
import { builtinModules } from "node:module";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// Inside the repository (tmp/ is ignored) so the bundle resolves node_modules.
mkdirSync(join(repo, "tmp"), { recursive: true });
const dir = mkdtempSync(join(repo, "tmp", "decko-ts-pods-"));
const outfile = join(dir, "cli.mjs");
let code = 1;
try {
  const builtins = new Set([...builtinModules, ...builtinModules.map((n) => `node:${n}`)]);
  await build({
    entryPoints: [join(repo, "src/card/pods/cli.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    external: [...builtins, "better-sqlite3", "sass", "coffeescript"],
    nodePaths: [join(repo, "node_modules")],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    logLevel: "warning",
  });
  const { main } = await import(pathToFileURL(outfile).href);
  code = await main(process.argv.slice(2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exitCode = code;

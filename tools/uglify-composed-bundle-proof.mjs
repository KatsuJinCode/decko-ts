// Read-only composition of a clean integration checkout with this checkout's
// static provider. No source, node_modules, deployment or bundle files change.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { coffeescriptNodeBuiltinStubs } from "./vendor/coffeescript-edge-bundler-stubs.mjs";

const own = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const integration = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
mkdirSync(out);
const git = (...args) => execFileSync("git", args, { cwd: integration, windowsHide: true, encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
assert.equal(git("status", "--porcelain", "--untracked-files=no"), "", "integration tracked source must be clean");
const hash = value => createHash("sha256").update(value).digest("hex");
const builtins = [...new Set([...builtinModules, ...builtinModules.map(name=>`node:${name}`)])];
const options = { absWorkingDir: integration, entryPoints: [path.join(integration,"deploy/bunny-worker-src/bunny-edge-engine-entry.ts")],
  bundle: true, write: false, format: "esm", platform: "neutral", target: "es2022", minify: true,
  external: [...builtins,"@bunny.net/edgescript-sdk"], conditions: ["deno","bunny","import","default"],
  mainFields: ["module","main"], alias: { "@cf-wasm/photon": "@cf-wasm/photon/node" },
  plugins: [coffeescriptNodeBuiltinStubs()], metafile: true, logLevel: "warning",
  banner: { js: 'globalThis.__deckoEval0=[typeof performance<"u"?performance.now():-1,Date.now()];' } };
const baseline = await build(options);
const files = {};
const overlay = { name: "read-only-static-validator-composition", setup(builder) {
  builder.onResolve({filter:/\/uglify-harmony-static\.js$/},()=>({path:path.join(own,"src/card/assets/uglify-harmony-static.ts")}));
  builder.onLoad({filter:/cloudflare-write-routes\.ts$/},args=>{
    let source = readFileSync(args.path,"utf8");
    files["integration-cloudflare-write-routes"] = hash(source);
    assert.ok(!source.includes("staticUglifyHarmonySyntaxError"),"integration already has the provider; use its normal bundle instead");
    const marker='import { coffeeNpmCompiler } from "./coffee-npm-compiler.js";';
    assert.ok(source.includes(marker));
    source=source.replace(marker,marker+'\nimport { staticUglifyHarmonySyntaxError } from "../card/assets/uglify-harmony-static.js";');
    assert.ok(source.includes("coffeeCompiler: edgeCoffeeCompiler,"));
    source=source.replace("coffeeCompiler: edgeCoffeeCompiler,","coffeeCompiler: edgeCoffeeCompiler,\n      javascriptValidator: staticUglifyHarmonySyntaxError,");
    return {loader:"ts",contents:source};
  });
} };
const composed = await build({...options,plugins:[overlay,coffeescriptNodeBuiltinStubs()]});
assert.equal(git("rev-parse","HEAD"),commit,"integration changed during measurement");
assert.equal(git("status","--porcelain","--untracked-files=no"),"");
for(const name of ["uglify-harmony-static.ts","uglify-harmony-static.generated.ts","uglify-harmony-options.ts","uglify-harmony-diagnostics.ts"])
  files[name]=hash(readFileSync(path.join(own,"src/card/assets",name)));
const imports = Object.values(composed.metafile.outputs).flatMap(output=>output.imports);
assert.ok(!Object.keys(composed.metafile.inputs).some(file=>file.endsWith("uglify-harmony-compile-engine.ts")));
const result = {integrationCommit:commit,trackedSourceClean:true,sourceComposition:"integration source plus only static validator import/option, own provider files by hash",files,
  baselineBytes:baseline.outputFiles[0].contents.length,composedBytes:composed.outputFiles[0].contents.length,
  addedBytes:composed.outputFiles[0].contents.length-baseline.outputFiles[0].contents.length,
  composedSha256:hash(composed.outputFiles[0].contents),imports,conservativeDecimalBudgetBytes:10_000_000,
  remainingBytes:10_000_000-composed.outputFiles[0].contents.length,productionRuntimeTested:false};
writeFileSync(path.join(out,"observed.json"),JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result));
assert.ok(result.remainingBytes>=0,"combined artifact exceeds conservative 10 MB decimal budget");

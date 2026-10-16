#!/usr/bin/env node
// Build the complete engine distribution, including checked-in runtime assets.
import { spawnSync, execFileSync } from "node:child_process";
import { assertStaticUglifierCurrent } from "../vendor/build-uglify-harmony-static.mjs";
assertStaticUglifierCurrent();
import { mkdirSync, writeFileSync, existsSync, realpathSync, rmSync } from "node:fs";
import { copyRuntimeAssets } from "./runtime-assets.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { sha256, treeDigest } from "../../reference-harness/browser/lib/journey-provenance.mjs";
const repo = fileURLToPath(new URL("../..", import.meta.url));
const config = process.argv.includes("--browser-hosts") ? "tsconfig.browser-hosts.json" : "tsconfig.dist.json";
const output = path.resolve(repo, "dist");
// Delete only this checkout's resolved build directory; refuse redirection.
if (path.dirname(output) !== path.resolve(repo)) throw new Error("build output escapes checkout");
if (existsSync(output)) {
  if (path.resolve(realpathSync(output)) !== output) throw new Error("refusing redirected dist directory");
  rmSync(output, { recursive: true, force: true });
}
const result = spawnSync(process.execPath, [path.join(repo, "node_modules/typescript/bin/tsc"), "-p", path.join(repo,config)], { cwd: repo, stdio: "inherit", windowsHide: true });
if (result.status !== 0) process.exit(result.status ?? 1);
const runtimeAssets = copyRuntimeAssets(repo);
// Import the real static consumers. Missing runtime assets must fail the build.
await import(new URL("../../dist/src/card/render/bootstrap-code-files.js", import.meta.url));
await import(new URL("../../dist/src/server/libsass-wasm.js", import.meta.url));
await import(new URL("../../dist/src/card/render.js", import.meta.url));
const git = (...args) => execFileSync("git", ["-C",repo,...args], { encoding:"utf8", windowsHide:true }).trim();
mkdirSync(path.join(repo,".runtime"), { recursive:true });
writeFileSync(path.join(repo,".runtime/browser-build.json"), JSON.stringify({ config, runtimeAssets, sourceCommit:git("rev-parse","HEAD"), sourceDiffSha256:sha256(git("diff","HEAD","--binary")), distSha256:treeDigest(path.join(repo,"dist")), builtAt:new Date().toISOString() },null,2)+"\n");
console.log("Engine distribution built; static snapshot and compiler imports verified.");

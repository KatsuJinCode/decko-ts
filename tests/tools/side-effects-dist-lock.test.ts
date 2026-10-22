import { afterEach, expect, test } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchDir, removeScratchDir } from "../support/scratch-dir.mjs";

const directories: string[] = [];
const children = new Set<ChildProcess>();
afterEach(async () => {
  // Release the fixture compiler before waiting for its parent. Killing only
  // the parent would orphan the compiler if an assertion failed at the barrier.
  for (const directory of directories) rmSync(join(directory, "hold-build"), { force: true });
  await Promise.all([...children].map(child => new Promise<void>(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", () => resolve());
  })));
  children.clear();
  for (const directory of directories.splice(0)) removeScratchDir(directory);
});

function fixture() {
  const root = scratchDir("dist-build-lock-"); directories.push(root);
  const put = (file: string, body: string) => {
    const target = join(root, file); mkdirSync(join(target, ".."), { recursive: true }); writeFileSync(target, body);
  };
  put("package.json", '{"type":"module"}');
  put("vm-staging-server.mjs", 'import x from "./dist/src/server/drivers/local-sqlite.js";');
  put("tests/card/auth/staging-server-dist-bootstrap.ts", "");
  copyFileSync(new URL("../card/auth/staging-server-dist-bootstrap.ts", import.meta.url), join(root, "tests/card/auth/staging-server-dist-bootstrap.ts"));
  put("tools/dist/runtime-assets.mjs", `
import fs from 'node:fs'; import path from 'node:path';
export const runtimeAssetReadiness = root => fs.existsSync(path.join(root,'dist/asset')) ? [] : ['asset'];
export function copyRuntimeAssets(root) {
  if(!fs.existsSync(path.join(root,'dist/.tsc-build-lock'))) throw Error('assets copied outside lock');
  fs.appendFileSync(path.join(root,'events'),'copy\\n'); fs.writeFileSync(path.join(root,'dist/asset'),'ready');
}`);
  put("node_modules/typescript/bin/tsc", `
import fs from 'node:fs'; import path from 'node:path';
if(!fs.existsSync('dist/.tsc-build-lock')) throw Error('compile outside lock');
fs.appendFileSync('events','build\\n'); fs.writeFileSync('build-started','');
while(fs.existsSync('hold-build')) await new Promise(r=>setTimeout(r,20));
if(fs.existsSync('fail-build')) throw Error('fixture compilation failed');
for(const name of ['server/drivers/local-sqlite.js','server/write-routes.js','card/render.js','server/libsass-wasm.js']) {
 const file=path.join('dist/src',name); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,'export default {};');
}`);
  put("run.mjs", `
import fs from 'node:fs';
import {ensureStagingServerDist} from './tests/card/auth/staging-server-dist-bootstrap.ts';
fs.writeFileSync('runner-'+process.argv[2],'');
await ensureStagingServerDist(()=>fs.existsSync('force-stale'));
`);
  const run = (id: string) => {
    const child = spawn(process.execPath, ["run.mjs", id], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    children.add(child); let output = "";
    child.stdout!.on("data", data => output += data); child.stderr!.on("data", data => output += data);
    const done = new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      child.once("error", reject); child.once("exit", code => { children.delete(child); resolve({ code, output }); });
    });
    return done;
  };
  const events = () => readFileSync(join(root, "events"), "utf8").trim().split(/\r?\n/);
  return { root, put, run, events };
}

test("cold endpoint and battery builds share one compiler and publish assets under the same lock", async () => {
  const f = fixture(); f.put("hold-build", "");
  const first = f.run("endpoint");
  await expect.poll(() => existsSync(join(f.root, "build-started")), { timeout: 10000 }).toBe(true);
  const second = f.run("battery");
  await expect.poll(() => existsSync(join(f.root, "runner-battery")), { timeout: 10000 }).toBe(true);
  expect(existsSync(join(f.root, "dist/.staging-server-dist-built"))).toBe(false);
  rmSync(join(f.root, "hold-build"));
  const results = await Promise.all([first, second]);
  for (const result of results) expect(result.code, result.output).toBe(0);
  expect(f.events()).toEqual(["build", "copy"]);
  expect(existsSync(join(f.root, "dist/.tsc-build-lock"))).toBe(false);
}, 20000);

test("a battery freshness request rebuilds warm output; a failed rebuild invalidates the sentinel and releases its lock", async () => {
  const f = fixture(); expect((await f.run("initial")).code).toBe(0);
  f.put("force-stale", ""); f.put("fail-build", "");
  const failed = await f.run("failed"); expect(failed.code).not.toBe(0);
  expect(failed.output).toContain("fixture compilation failed");
  expect(existsSync(join(f.root, "dist/.staging-server-dist-built"))).toBe(false);
  expect(existsSync(join(f.root, "dist/.tsc-build-lock"))).toBe(false);
  rmSync(join(f.root, "fail-build"));
  const recovered = await f.run("recovered"); expect(recovered.code, recovered.output).toBe(0);
  expect(f.events()).toEqual(["build", "copy", "build", "build", "copy"]);
}, 20000);

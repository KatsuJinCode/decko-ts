import { afterEach, describe, expect, it } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cachedArtifact, identityKey, materialize, sha256 } from "./native-cache.mjs";

// Cache coordination tests compile a tiny real C program; the production
// LibSass parity tests separately validate the reused LibSass executable.
const owned = [];
afterEach(() => { for (const dir of owned.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "libsass-cache-test-"));
  owned.push(root);
  const source = join(root, "probe.c");
  writeFileSync(source, '#include <stdio.h>\nint main(void){puts("real compiler output");return 0;}\n');
  const filename = process.platform === "win32" ? "probe.exe" : "probe";
  const inputs = { source: sha256(readFileSync(source)), toolchain: execFileSync("gcc", ["-dumpfullversion"], { windowsHide: true, encoding: "utf8" }).trim() };
  let builds = 0;
  const options = {
    root: join(root, "cache"), inputs, filename,
    build: async work => {
      builds++;
      const output = join(work, filename);
      execFileSync("gcc", [source, "-o", output], { windowsHide: true });
      return output;
    },
  };
  return { root, source, filename, inputs, options, builds: () => builds };
}

describe("native artifact cache integrity and ownership", () => {
  it("reuses a verified binary without rebuilding, and copies executable bytes exactly", async () => {
    const f = fixture();
    const first = await cachedArtifact(f.options);
    const second = await cachedArtifact({ ...f.options, build: async () => { throw new Error("unnecessary rebuild"); } });
    expect(second.cacheHit).toBe(true);
    expect(f.builds()).toBe(1);
    const local = join(f.root, "checkout", f.filename);
    materialize(second, local);
    expect(sha256(readFileSync(local))).toBe(first.manifest.sha256);
    expect(execFileSync(local, [], { windowsHide: true, encoding: "utf8" }).replaceAll("\r", "")).toBe("real compiler output\n");
  });

  it("refuses changed artifact bytes and a modified manifest without rebuilding", async () => {
    const f = fixture();
    const first = await cachedArtifact(f.options);
    appendFileSync(first.artifact, "tamper");
    await expect(cachedArtifact(f.options)).rejects.toThrow(/integrity mismatch/);
    expect(f.builds()).toBe(1);
    const receipt = join(f.options.root, identityKey(f.inputs), "manifest.json");
    writeFileSync(receipt, "{}");
    await expect(cachedArtifact(f.options)).rejects.toThrow(/integrity mismatch/);
  });

  it("a source or toolchain identity change selects a different artifact", async () => {
    const f = fixture();
    const one = await cachedArtifact(f.options);
    const changed = { ...f.inputs, toolchain: `${f.inputs.toolchain}-changed` };
    const two = await cachedArtifact({ ...f.options, inputs: changed });
    expect(one.manifest.key).not.toBe(two.manifest.key);
    writeFileSync(f.source, "int main(void){return 0;}\n");
    const three = await cachedArtifact({ ...f.options, inputs: { ...changed, source: sha256(readFileSync(f.source)) } });
    expect(two.manifest.key).not.toBe(three.manifest.key);
    expect(f.builds()).toBe(3);
  });

  it("publishes nothing if compilation fails or inputs change during compilation", async () => {
    const f = fixture();
    await expect(cachedArtifact({ ...f.options, build: async () => { throw new Error("compile failed"); } })).rejects.toThrow("compile failed");
    expect(existsSync(join(f.options.root, identityKey(f.inputs)))).toBe(false);
    await expect(cachedArtifact({ ...f.options, verifyInputs: () => ({ changed: true }) })).rejects.toThrow("inputs changed");
    expect(existsSync(join(f.options.root, identityKey(f.inputs)))).toBe(false);
    expect(existsSync(join(f.options.root, `${identityKey(f.inputs)}.lock`))).toBe(false);
  });

  it("independent processes request one key but compile it only once", async () => {
    const f = fixture();
    const script = join(f.root, "builder.mjs");
    const count = join(f.root, "build-count.txt");
    writeFileSync(script, `import {cachedArtifact} from ${JSON.stringify(new URL("./native-cache.mjs", import.meta.url).href)};
import {execFileSync} from "node:child_process";
import {appendFileSync} from "node:fs";
import {join} from "node:path";
await cachedArtifact({root:${JSON.stringify(f.options.root)},inputs:${JSON.stringify(f.inputs)},filename:${JSON.stringify(f.filename)},build:async work=>{
  appendFileSync(${JSON.stringify(count)},"build\\n");
  const output=join(work,${JSON.stringify(f.filename)});
  execFileSync("gcc",[${JSON.stringify(f.source)},"-o",output],{windowsHide:true});
  return output;
}});
`);
    const run = () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      let errors = "";
      child.stderr.on("data", bytes => { errors += bytes; });
      child.on("error", reject);
      child.on("close", code => code === 0 ? resolve() : reject(new Error(errors)));
    });
    await Promise.all([run(), run(), run(), run()]);
    expect(readFileSync(count, "utf8")).toBe("build\n");
    expect((await cachedArtifact(f.options)).cacheHit).toBe(true);
  }, 20_000);

  it("does not displace a live owner when waiting reaches its diagnostic deadline", async () => {
    const f = fixture();
    mkdirSync(f.options.root);
    const lock = join(f.options.root, `${identityKey(f.inputs)}.lock`);
    const owner = JSON.stringify({ pid: process.pid, token: "another-live-owner" });
    writeFileSync(lock, owner);
    await expect(cachedArtifact({ ...f.options, lockWaitMs: 30 })).rejects.toThrow("owner has not completed");
    expect(readFileSync(lock, "utf8")).toBe(owner);
    expect(f.builds()).toBe(0);
  });
});

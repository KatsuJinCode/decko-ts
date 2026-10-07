import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupScratch, registeredScratch, scratchDir } from "./scratch-dir.mjs";

const helperUrl = new URL("./scratch-dir.mjs", import.meta.url).href;

function leftovers(prefix: string): string[] {
  return readdirSync(tmpdir()).filter((n) => n.startsWith(prefix));
}

// A throwaway script that creates a scratch directory, fills it, prints the
// path, then either exits normally or throws.
function runFixture(prefix: string, mode: "ok" | "throw", env: Record<string, string> = {}) {
  const script =
    `import { scratchDir } from ${JSON.stringify(helperUrl)};` +
    `import { writeFileSync } from "node:fs";` +
    `const d = scratchDir(${JSON.stringify(prefix)});` +
    `writeFileSync(d + "/payload.bin", "x".repeat(1024));` +
    `console.log(d);` +
    (mode === "throw" ? `throw new Error("fixture failure");` : "");
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, ...env },
  });
  return { dir: r.stdout.trim(), status: r.status };
}

describe("scratch-dir helper leaves nothing in the OS temp folder", () => {
  it("removes the directory when the script exits normally", () => {
    const prefix = `scratch-selftest-ok-${process.pid}-`;
    const before = leftovers(prefix);
    const { dir, status } = runFixture(prefix, "ok");
    expect(status).toBe(0);
    expect(dir.startsWith(tmpdir())).toBe(true);
    expect(existsSync(dir)).toBe(false);
    expect(leftovers(prefix)).toEqual(before);
  });

  it("removes the directory when the script fails", () => {
    const prefix = `scratch-selftest-throw-${process.pid}-`;
    const before = leftovers(prefix);
    const { dir, status } = runFixture(prefix, "throw");
    expect(status).not.toBe(0);
    expect(existsSync(dir)).toBe(false);
    expect(leftovers(prefix)).toEqual(before);
  });

  it("keeps the directory when DECKO_KEEP_SCRATCH=1", () => {
    const prefix = `scratch-selftest-keep-${process.pid}-`;
    const { dir } = runFixture(prefix, "ok", { DECKO_KEEP_SCRATCH: "1" });
    try {
      expect(existsSync(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("cleanupScratch removes in-process directories", () => {
    const prefix = `scratch-selftest-inproc-${process.pid}-`;
    const dir = scratchDir(prefix);
    writeFileSync(join(dir, "f"), "x");
    expect(registeredScratch()).toContain(dir);
    cleanupScratch();
    expect(existsSync(dir)).toBe(false);
    expect(fileURLToPath(helperUrl).length).toBeGreaterThan(0);
  });
});

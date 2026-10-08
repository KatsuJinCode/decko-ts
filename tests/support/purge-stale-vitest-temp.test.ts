import { mkdirSync, mkdtempSync, existsSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { purgeStaleVitestTemp } from "./purge-stale-vitest-temp.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function runDir(root: string, name: string, ageMs: number): string {
  const dir = join(root, name);
  mkdirSync(join(dir, "ssr"), { recursive: true });
  const file = join(dir, "ssr", "module");
  writeFileSync(file, "x");
  const t = (Date.now() - ageMs) / 1000;
  for (const p of [file, join(dir, "ssr"), dir]) utimesSync(p, t, t);
  return dir;
}

describe("purgeStaleVitestTemp", () => {
  it("removes stale run folders and keeps recent ones and unrelated folders", () => {
    const root = mkdtempSync(join(tmpdir(), "purge-test-"));
    roots.push(root);
    const stale = runDir(root, "AAAAAAAAAAAAAAAAAAAAA", 3 * 60 * 60 * 1000);
    const fresh = runDir(root, "BBBBBBBBBBBBBBBBBBBBB", 10 * 60 * 1000);
    const other = join(root, "CCCCCCCCCCCCCCCCCCCCC");
    mkdirSync(join(other, "ssr"), { recursive: true });
    writeFileSync(join(other, "keep.txt"), "not a vitest folder");
    utimesSync(other, 0, 0);

    expect(purgeStaleVitestTemp(Date.now(), root)).toBe(1);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(other)).toBe(true);
  });

  it("removes stale decko scratch directories but not other decko folders", () => {
    const root = mkdtempSync(join(tmpdir(), "purge-test-"));
    roots.push(root);
    const age = (p: string, ms: number) => { const t = (Date.now() - ms) / 1000; utimesSync(p, t, t); };
    const stale = join(root, "decko-stream-Ab12Cd");
    const fresh = join(root, "decko-nocache-Zz99Yy");
    const review = join(root, "decko-review-2f432c959eb941c1ae59724b43da685f");
    for (const d of [stale, fresh, review]) { mkdirSync(d); writeFileSync(join(d, "f"), "x"); age(join(d, "f"), 3 * 3600_000); age(d, 3 * 3600_000); }
    age(join(fresh, "f"), 60_000);

    expect(purgeStaleVitestTemp(Date.now(), root)).toBe(1);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(review)).toBe(true);
  });
});

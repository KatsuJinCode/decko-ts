import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { purgeStaleVitestTemp } from "./purge-stale-vitest-temp.js";
import { SCRATCH_OWNERSHIP_FILE, writeScratchOwnershipManifest } from "./scratch-dir.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

const STALE = 3 * 60 * 60 * 1000;

/** A directory in `root` with the exact shape and age of a stale scratch
 *  directory — the purge may remove it only when its ownership manifest names
 *  this checkout of this repo on this machine. */
function staleScratchDir(root: string, name: string, manifest?: "none" | "ours" | "other-repo" | "other-machine" | "corrupt"): string {
  const dir = join(root, name);
  mkdirSync(join(dir, "ssr"), { recursive: true });
  const file = join(dir, "ssr", "module");
  writeFileSync(file, "x");
  if (manifest === "ours" || manifest === undefined) writeScratchOwnershipManifest(dir);
  if (manifest === "other-repo") writeFileSync(join(dir, SCRATCH_OWNERSHIP_FILE), JSON.stringify({ tool: "decko test scratch", repo: "C:\\other\\checkout-of-same-repo", machine: "this-machine" }));
  if (manifest === "other-machine") writeFileSync(join(dir, SCRATCH_OWNERSHIP_FILE), JSON.stringify({ tool: "decko test scratch", repo: "this-repo", machine: "some-other-machine" }));
  if (manifest === "corrupt") writeFileSync(join(dir, SCRATCH_OWNERSHIP_FILE), "{ not json");
  const t = (Date.now() - STALE) / 1000;
  // The manifest is created with the directory, so a stale directory's
  // manifest is stale too; age it like the rest of the tree.
  const manifestFile = join(dir, SCRATCH_OWNERSHIP_FILE);
  for (const p of [file, join(dir, "ssr"), dir, ...(existsSync(manifestFile) ? [manifestFile] : [])]) utimesSync(p, t, t);
  return dir;
}

describe("purgeStaleVitestTemp", () => {
  it("removes a stale directory whose ownership manifest names this repo and machine", () => {
    const root = mkdtempSync(join(tmpdir(), "purge-test-"));
    roots.push(root);
    const stale = staleScratchDir(root, "decko-stream-Ab12Cd", "ours");

    expect(purgeStaleVitestTemp(Date.now(), root)).toBe(1);
    expect(existsSync(stale)).toBe(false);
  });

  it("never touches an unowned directory even when its shape and age match", () => {
    const root = mkdtempSync(join(tmpdir(), "purge-test-"));
    roots.push(root);
    const unowned = staleScratchDir(root, "decko-stream-Ab12Cd", "none");

    expect(purgeStaleVitestTemp(Date.now(), root)).toBe(0);
    expect(existsSync(unowned)).toBe(true);
  });

  it("never touches a directory whose manifest names another checkout or another machine", () => {
    const root = mkdtempSync(join(tmpdir(), "purge-test-"));
    roots.push(root);
    const otherRepo = staleScratchDir(root, "decko-stream-Ab12Cd", "other-repo");
    const otherMachine = staleScratchDir(root, "decko-stream-Ef34Gh", "other-machine");

    expect(purgeStaleVitestTemp(Date.now(), root)).toBe(0);
    expect(existsSync(otherRepo)).toBe(true);
    expect(existsSync(otherMachine)).toBe(true);
  });

  it("never touches a directory whose manifest is corrupt", () => {
    const root = mkdtempSync(join(tmpdir(), "purge-test-"));
    roots.push(root);
    const corrupt = staleScratchDir(root, "decko-stream-Ab12Cd", "corrupt");

    expect(purgeStaleVitestTemp(Date.now(), root)).toBe(0);
    expect(existsSync(corrupt)).toBe(true);
  });

  it("age alone never authorizes deletion: a fresh manifest-owned directory stays", () => {
    const root = mkdtempSync(join(tmpdir(), "purge-test-"));
    roots.push(root);
    const fresh = staleScratchDir(root, "decko-stream-Ab12Cd", "ours");
    const now = (Date.now() - 10 * 60 * 1000) / 1000;
    utimesSync(fresh, now, now);

    expect(purgeStaleVitestTemp(Date.now(), root)).toBe(0);
    expect(existsSync(fresh)).toBe(true);
  });

  it("does not follow a link out of the root, even a manifest-bearing one", () => {
    const root = mkdtempSync(join(tmpdir(), "purge-test-"));
    roots.push(root);
    const outside = mkdtempSync(join(tmpdir(), "purge-outside-"));
    roots.push(outside);
    const payload = join(outside, "payload.txt");
    writeFileSync(payload, "not this repo's data, must survive");
    const link = join(root, "decko-stream-Ab12Cd");
    symlinkSync(outside, link, "junction");
    writeScratchOwnershipManifest(outside); // even a manifest does not make a link out deletable
    const t = (Date.now() - STALE) / 1000;
    utimesSync(outside, t, t);

    expect(purgeStaleVitestTemp(Date.now(), root)).toBe(0);
    expect(existsSync(link)).toBe(true);
    expect(existsSync(payload)).toBe(true);
  });
});

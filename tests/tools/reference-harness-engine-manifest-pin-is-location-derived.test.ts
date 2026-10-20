import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A browser probe measures the tree that ships it. If a probe hardcodes an
// absolute path to some other checkout for its engine manifest, it boots that
// checkout instead - so the probe cannot measure a pinned worktree at all, and
// when the hardcoded tree is deleted the probe can never run again. Every
// top-level probe therefore derives its manifest from its own location, the
// same shape sibling probe-pageonly-ranks91-100.mjs uses.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const browserDir = path.join(repo, "reference-harness", "browser");

const hereDerivation = 'const here = path.dirname(fileURLToPath(import.meta.url));';
const repoDerivation = 'const repo = path.resolve(here, "..", "..");';
const locationDerivedManifest =
  'const engineManifest = path.join(repo, "reference-harness", "browser", "engines", "ts.json");';

function readProbe(name: string): string {
  return readFileSync(path.join(browserDir, name), "utf8");
}

describe("reference-harness browser probes derive their engine manifest from their own location", () => {
  it("discovery-pageonly-ranks101-110-act082-form-control-attributes derives its engine manifest from its own location", () => {
    // smell-discovery-pageonly-ranks101-110-act082-form-control-attributes
    const source = readProbe("discovery-pageonly-ranks101-110-act082-form-control-attributes.mjs");
    expect(source).toContain(hereDerivation);
    expect(source).toContain(repoDerivation);
    expect(source).toContain(locationDerivedManifest);
    expect(source).not.toContain("C:/localProjects/");
  });
});

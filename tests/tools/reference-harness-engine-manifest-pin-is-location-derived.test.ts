import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
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
// The other shape of the same defect: a probe that binds the whole repo to one
// checkout. Every path below it - engine manifest, fixture deck, run directory -
// then comes from that checkout instead of the tree that ships the file.
// A probe that derives the repo in ONE expression, rather than through a
// `here` local, is location-derived too - the sibling block above pins the
// `here` shape, this pins the inline one, and both are accepted here.
const repoFromHere = 'const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");';
const fileUrlImport = 'import { fileURLToPath } from "node:url";';
const absoluteRepoBinding = /const\s+repo\s*=\s*["']C:\//;
const absoluteManifestBinding = /engineManifest\s*=\s*path\.resolve\(\s*["']C:\//;

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

  it("discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields derives its engine manifest from its own location", () => {
    // smell-discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields
    const source = readProbe("discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields.mjs");
    expect(source).toContain(hereDerivation);
    expect(source).toContain(repoDerivation);
    expect(source).toContain(locationDerivedManifest);
    expect(source).not.toContain("C:/localProjects/");
  });

  it("discovery-pageonly-ranks101-110-act082-save-post-body derives its engine manifest from its own location", () => {
    // smell-discovery-pageonly-ranks101-110-act082-save-post-body
    const source = readProbe("discovery-pageonly-ranks101-110-act082-save-post-body.mjs");
    expect(source).toContain(hereDerivation);
    expect(source).toContain(repoDerivation);
    expect(source).toContain(locationDerivedManifest);
    expect(source).not.toContain("C:/localProjects/");
  });

  it("discovery-pageonly-ranks101-110-act082-select-owner-form derives its engine manifest from its own location", () => {
    // smell-discovery-pageonly-ranks101-110-act082-select-owner-form
    const source = readProbe("discovery-pageonly-ranks101-110-act082-select-owner-form.mjs");
    expect(source).toContain(hereDerivation);
    expect(source).toContain(repoDerivation);
    expect(source).toContain(locationDerivedManifest);
    expect(source).not.toContain("C:/localProjects/");
  });

  it("discovery-pageonly-ranks101-110-act082-type-select-all-options derives its engine manifest from its own location", () => {
    // smell-discovery-pageonly-ranks101-110-act082-type-select-all-options
    const source = readProbe("discovery-pageonly-ranks101-110-act082-type-select-all-options.mjs");
    expect(source).toContain(hereDerivation);
    expect(source).toContain(repoDerivation);
    expect(source).toContain(locationDerivedManifest);
    expect(source).not.toContain("C:/localProjects/");
  });

  it("discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create derives its engine manifest from its own location", () => {
    // smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create
    const source = readProbe("discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create.mjs");
    expect(source).toContain(hereDerivation);
    expect(source).toContain(repoDerivation);
    expect(source).toContain(locationDerivedManifest);
    expect(source).not.toContain("C:/localProjects/");
  });
});

describe("reference-harness browser probes that bind a whole repo derive it from their own location", () => {
  it("probe-account-row-edit-slots derives the repo it measures from its own location", () => {
    // smell-probe-account-row-edit-slots
    // This probe factors the derivation through a `here` local rather than
    // inlining path.dirname(fileURLToPath(...)) into `repo`, because it also
    // derives its engine manifest, fixture deck and run directory from `here`
    // and accepts --engine/--fixture/--out overrides. Both are location-derived
    // and neither binds a checkout, which is what this pin exists to catch, so
    // the assertion accepts the `here` shape the sibling block above pins.
    const source = readProbe("probe-account-row-edit-slots.mjs");
    expect(source).toContain(fileUrlImport);
    expect(source).toContain(hereDerivation);
    expect(source).toContain(repoDerivation);
    expect(source).not.toMatch(absoluteRepoBinding);
  });

  it("probe-oracle-edit-page-modal-container-prefill derives the repo it measures from its own location", () => {
    // No roster row owns this probe; it was found by this tranche's class sweep.
    const source = readProbe("probe-oracle-edit-page-modal-container-prefill.mjs");
    expect(source).toContain(fileUrlImport);
    expect(source).toContain(repoFromHere);
    expect(source).not.toMatch(absoluteRepoBinding);
  });
});

describe("no probe under reference-harness binds the tree it measures to an absolute path", () => {
  it("finds zero repo or engine-manifest bindings to a machine path", () => {
    // The class guard for entries 1-7. Scoped to the two shapes that decide
    // WHICH TREE A PROBE BOOTS, not to every absolute path string: provenance
    // citations in comments and metadata (source/design/canonicalList fields,
    // the run-exhaustive usage block) name where evidence came from, and
    // blanking them would destroy the record, so they are deliberately out of
    // scope here.
    const offenders: string[] = [];
    for (const file of walk(path.join(repo, "reference-harness"))) {
      if (!/\.(mjs|js)$/.test(file)) continue;
      const source = readFileSync(file, "utf8");
      if (absoluteRepoBinding.test(source) || absoluteManifestBinding.test(source)) {
        offenders.push(path.relative(repo, file).replaceAll("\\", "/"));
      }
    }
    expect(offenders).toEqual([]);
  });
});

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

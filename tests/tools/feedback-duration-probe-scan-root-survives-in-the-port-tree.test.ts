import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Row: smell-analyze-feedback-duration.
//
// The probe analyze-feedback-duration.mjs lives outside this repo, at
// recovery/release/private-probes/private-tool-repairs-20261018/ in the
// evidence repo. It reads its stage telemetry from a run-scoped capture
// directory and its wait-site figures by listing the .mjs files of one
// tools/edge-signed-in-exercise checkout, named as an absolute machine path
// (C:/localProjects/decko-edge-verification-b00a4503). That checkout was
// deleted, so the probe dies on its second read - but the checks it measures
// were never in that checkout alone. They are tracked here.
//
// What is asserted below is the half of the row that is a property of THIS
// tree: the scan root survives in the port, so the wait-site half of the
// analysis is reproducible from the tree that owns the checks, without
// resurrecting a disposable worktree. The telemetry half reads capture
// directories that live outside this repo; it is verified in the lane record,
// and a dead machine path is named here as a path nothing below depends on.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scanRoot = path.join(repo, "tools", "edge-signed-in-exercise");

// The scan root the probe names, which is not on disk and which this file
// deliberately never reads. Asserted absent so a future restore of that
// disposable worktree does not silently become the thing being measured.
const deadPinnedCheckout = "C:/localProjects/decko-edge-verification-b00a4503";

// Line 14 of the probe, verbatim: a literal wait sum over the top-level .mjs
// files. The probe labels the result "static call sites, not measured executed
// time", so this is a source figure and never claimed as a duration.
function literalWaitSites(): { file: string; callSites: number; literalMs: number }[] {
  const waits: { file: string; callSites: number; literalMs: number }[] = [];
  for (const file of readdirSync(scanRoot).filter((name) => name.endsWith(".mjs"))) {
    const text = readFileSync(path.join(scanRoot, file), "utf8");
    const numbers = [...text.matchAll(/\.waitForTimeout\((\d+)\)/g)].map((m) => Number(m[1]));
    if (numbers.length) {
      waits.push({
        file,
        callSites: numbers.length,
        literalMs: numbers.reduce((a, b) => a + b, 0),
      });
    }
  }
  return waits.sort((a, b) => (a.file < b.file ? -1 : 1));
}

// Measured on this tree at 8aa2de33, by running the probe's own scan over the
// port's copy of the scan root. These are the nine files that carry literal
// waits, and the sum of those waits.
const recordedFiles = [
  "checks-catalog-edit-create.mjs",
  "checks-content-flows.mjs",
  "checks-cover-b.mjs",
  "checks-delete-edit-race.mjs",
  "checks-permission-rules.mjs",
  "checks-role-checkbox-and-plus-right-creation.mjs",
  "checks-upload-image-change.mjs",
  "checks-widget-interactions.mjs",
  "live-mode.mjs",
];
const recordedLiteralMs = 152200;

describe("the scan root analyze-feedback-duration.mjs measures survives in the port tree", () => {
  it("carries the tools/edge-signed-in-exercise .mjs set the probe reads", () => {
    expect(existsSync(scanRoot)).toBe(true);
    const modules = readdirSync(scanRoot).filter((name) => name.endsWith(".mjs"));
    expect(modules.length).toBeGreaterThan(0);
    // An emptied scan root returns an empty list, which the probe would then
    // write out as a zero-wait analysis indistinguishable from a clean one.
    // The checks are the evidence, so their absence must be a red result.
    expect(modules.filter((name) => name.startsWith("checks-")).length).toBeGreaterThanOrEqual(10);
    expect(existsSync(path.join(repo, "tools", "edge-signed-in-exercise", "capabilities.json"))).toBe(true);
  });

  it("reproduces the probe's literal wait-site sum with no dead checkout involved", () => {
    const waits = literalWaitSites();
    expect(waits.length).toBeGreaterThan(0);
    expect(waits.map((wait) => wait.file)).toEqual(recordedFiles);
    for (const wait of waits) {
      expect(wait.literalMs).toBeGreaterThanOrEqual(wait.callSites);
    }
    const total = waits.reduce((sum, wait) => sum + wait.literalMs, 0);
    // A floor, not an equality: a check may legitimately gain waits, and only
    // their removal is evidence loss this row would have to hear about.
    expect(total).toBeGreaterThanOrEqual(recordedLiteralMs);
  });

  it("names the probe's dead machine pin as a path nothing here reads", () => {
    // The row is NOT-RUNNABLE as the probe stands, and this is the reason:
    // the pin is gone. What is asserted is only that the recovery does not
    // quietly depend on it.
    expect(existsSync(deadPinnedCheckout)).toBe(false);
    expect(existsSync(path.join(repo, "tools", "edge-signed-in-exercise"))).toBe(true);
  });
});

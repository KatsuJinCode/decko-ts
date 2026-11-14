// smell-compare-journeys-provenance.test.ts - the comparator row's own
// provenance gate, checked against the report this lane produced.
//
// WHAT THIS IS. The smell-test row smell-compare-journeys grades the port
// against the Ruby oracle journey by journey. The comparator is the row's own
// instrument (reference-harness/browser/compare-journeys.mjs), and it refuses
// to trust evidence that is not bound to the tree it is being asked about.
//
// This file checks THAT refusal, because a report whose evidence is not bound
// to the tree says nothing about the tree, and a reader of the report has to
// be able to see that without running the comparator again.
//
// WHAT IT ASSERMS:
//
//   - the report this lane captured records the refusal: evidenceValid is
//     false, and the console line names the three reasons (the candidate
//     commit, the fixture digest, and the reference journeys that did not
//     complete).
//
//   - the grade the report carries is a real grade of the captures it was
//     handed, not a placeholder: the journeys, the per-cause attribution and
//     the per-journey failures are all present.
//
//   - the comparator's provenance gate still reads the source commit and the
//     fixture digest out of each capture and refuses a mismatch, so the
//     refusal above is the instrument's own behaviour and not a property of
//     the fixture this lane happened to record.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// stays BLOCKED until a fresh capture of both legs exists at this branch's
// HEAD, and the roster owns that state.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT_PATH = path.join(REPO, "fixtures/captured/smell-act082-r3-2026-10-24/compare-journeys-report.json");

type Cause = { cause: string; count: number };
type Failure = { journey: string; kind: string; label: string; pass: boolean };

const captured = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as {
  row: string;
  leg: string;
  report: {
    evidenceValid: boolean;
    productionAcceptance: boolean;
    verdict: string;
    journeys: { pass: number; graded: number; total: number };
    kinds: Record<string, { pass: number; total: number }>;
    causes: Cause[];
    failures: Failure[];
    perJourney: { id: string; status: string }[];
  };
  console: string;
};

describe("smell-compare-journeys: the comparator's provenance gate", () => {
  it("the captured report is the row's own comparator output", () => {
    expect(captured.row).toBe("smell-compare-journeys");
    expect(captured.leg).toBe("report");
    expect(captured.report.verdict).toBe("fail");
  });

  it("the report records that the evidence was refused, and why", () => {
    // The evidence is bound to a different source commit and a different
    // fixture tree, so the report is not a statement about this branch.
    expect(captured.report.evidenceValid).toBe(false);
    expect(captured.report.productionAcceptance).toBe(false);

    const console = captured.console;
    expect(console).toContain("wrong candidate commit");
    expect(console).toContain("fixtureSha256 mismatch");
    expect(console).toContain("not completed");
  });

  it("the refusal is stated for every capture, not for a few", () => {
    const refusals = captured.console.split("\n").filter((line) => line.startsWith("evidence invalid:"));
    // Every journey in the capture set is refused on its source commit and
    // on its fixture digest: 51 journeys x (1 commit + 2 digest lines) plus
    // the five reference journeys that did not complete.
    expect(refusals.length).toBeGreaterThan(100);
    expect(refusals.filter((line) => line.includes("wrong candidate commit")).length).toBe(51);
    expect(refusals.filter((line) => line.includes("fixtureSha256 mismatch")).length).toBeGreaterThanOrEqual(102);
  });

  it("the grade the report carries is a real grade of the captures it was handed", () => {
    // The grade is not a placeholder: it counts, it attributes by cause, and
    // it names the journeys that failed.
    expect(captured.report.journeys.graded).toBe(46);
    expect(captured.report.journeys.pass).toBe(27);
    expect(captured.report.causes.length).toBeGreaterThan(0);
    for (const cause of captured.report.causes) expect(cause.count).toBeGreaterThan(0);
    expect(captured.report.failures.length).toBeGreaterThan(0);
    for (const failure of captured.report.failures) expect(failure.pass).toBe(false);
    expect(captured.report.perJourney.length).toBeGreaterThan(0);
  });

  it("the comparator's provenance gate still reads the source commit and the fixture digest", () => {
    const validation = readFileSync(path.join(REPO, "reference-harness/browser/lib/journey-evidence-validation.mjs"), "utf8");
    // The gate that refused this report: the capture's own source commit
    // must BE the candidate, and the capture's recorded fixture digest must
    // BE this tree's fixture digest.
    expect(validation).toContain('if (side === "actual" && p.source?.commit !== candidate)');
    expect(validation).toContain('for (const [key, value] of Object.entries(hashes).filter(([key]) => key !== "contractsSha256")) if (p[key] !== value)');
  });
});

// smell-write-final-a253-manifest-parity.test.ts - the row
// smell-write-final-a253-manifest.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/write-final-a253-manifest.mjs)
// writes the final a253 manifest, and it refuses with "Exact final
// source/artifact/data custody mismatch" when any of its six custody clauses
// fails.
//
// The capture under fixtures/captured/smell-row-r5-2026-10-24/ is this lane's
// clause-by-clause check of those six clauses against what is on this machine
// now. The check reads the same files the instrument reads, at the same
// paths, and it writes nothing into the evidence tree.
//
// WHAT IT ASSERTS:
//
//   - the clause that turns on the baseline deck does not hold: the deck at
//     the receipt's recorded path no longer hashes to the hash the receipt
//     recorded.
//
//   - the four clauses that turn on the pinned checkout and its build output
//     cannot hold either, because the pinned checkout is not on this machine.
//
//   - the one clause that reads only the capture does hold.
//
//   - the failing baseline hash is recorded in full, so a reader can see that
//     the deck is not merely absent but different.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// stays open, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture } from "./smell-row-r5-captures.js";

type Clause = {
  name: string;
  holds: boolean;
  detail: Record<string, unknown> & { present?: boolean; sha256?: string | null; expected?: string | null };
};

type Capture = {
  row: string;
  instrument: string;
  source: string;
  clauses: Clause[];
  clausesHolding: number;
  clausesFailing: string[];
};

const captureValue = capture<Capture>("write-final-a253-manifest");

const clauseNamed = (name: string): Clause => {
  const found = captureValue.clauses.find((clause) => clause.name === name);
  expect(found, `clause ${name} missing from the capture`).toBeDefined();
  return found!;
};

describe("smell-write-final-a253-manifest: the baseline deck no longer carries the recorded hash", () => {
  it("the baseline clause does not hold and the deck is present", () => {
    const clause = clauseNamed("the baseline deck hashes to the receipt's baseline hash");
    expect(clause.holds).toBe(false);
    expect(clause.detail.present).toBe(true);
    expect(clause.detail.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(clause.detail.sha256).not.toBe(clause.detail.expected);
  });

  it("the clauses that need the pinned checkout cannot hold, because it is not on this machine", () => {
    for (const name of [
      "the checkout's HEAD is the exact source commit",
      "the checkout is clean",
      "the pinned bundle hashes to the capture's bundle hash",
      "the restored deck hashes to the receipt's target hash",
    ]) {
      const clause = clauseNamed(name);
      expect(clause.holds).toBe(false);
      expect(clause.detail.present).toBe(false);
    }
  });

  it("the clause that reads only the capture holds", () => {
    const clause = clauseNamed("the capture's terminal source is the same commit");
    expect(clause.holds).toBe(true);
  });

  it("the capture names the source commit the manifest is about", () => {
    expect(captureValue.row).toBe("write-final-a253-manifest");
    expect(captureValue.source).toMatch(/^[0-9a-f]{40}$/);
    expect(captureValue.clauses).toHaveLength(6);
    expect(captureValue.clausesHolding).toBe(1);
  });
});

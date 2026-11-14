// smell-run-private-index-render-comparison-parity.test.ts - the row
// smell-run-private-index-render-comparison.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/run-private-index-render-comparison.mjs)
// runs the ABBA render comparison of the normalized private index experiment:
// a baseline deck and the built deck, each rendered twice, in four fresh
// processes, with the engine artifact hash verified at boot. The row closes
// when that instrument runs and its own verdict holds.
//
// This lane ran it, after byte-restoring the deck it stages from, and it
// refused at its own exclusive create. The capture under
// fixtures/captured/smell-row-r5b-2026-10-24/ is that run's record.
//
// WHAT IT ASSERTS:
//
//   - the instrument ran in its normalized mode and refused with EEXIST on
//     the environment file it writes with the exclusive-create flag.
//
//   - the exclusive create comes before the four runs and before the write of
//     the comparison file, so the completed output of record is protected by
//     the refusal itself.
//
//   - the output of record is still the one written on 2026-10-18, with its
//     own sizes, so nothing overwrote it.
//
//   - the deck the instrument staged from was byte-restored, with the hash
//     the restoration receipt names, and the experiment's qualified input
//     passed its own guard.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closes on this instrument's own verdict, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture } from "./smell-row-r5b-captures.js";

type Detail = {
  exclusiveCreateSourceLine: number;
  outputOfRecordSourceLine: number;
  outputOfRecordUntouched: Record<string, { bytes: number; writtenAt: string }>;
  sourceDeck: { path: string; restored: boolean; sha256: string; restoredFrom: string; byteRestored: boolean };
  qualifiedInput: { file: string; code: number; canonicalUnchanged: boolean; inputUnchanged: boolean };
  firstRunRefusedEarlier: string;
  whatWouldCloseIt: string;
};

const row = capture("smell-run-private-index-render-comparison");
const detail = row.detail as Detail;

describe("smell-run-private-index-render-comparison: the one-shot create refuses the repeat and the output of record stands", () => {
  it("the instrument ran in its normalized mode and refused with EEXIST", () => {
    expect(row.row).toBe("smell-run-private-index-render-comparison");
    expect(row.outcome).toBe("ran");
    expect(row.exit).toBe(1);
    expect(row.verdict).toBe("open");
    expect(row.refusal).toMatch(/EEXIST/);
    expect(row.refusal).toMatch(/render-env\.json/);
    expect(row.command).toContain("normalized");
  });

  it("the exclusive create comes before the runs and before the write of the output of record", () => {
    expect(detail.exclusiveCreateSourceLine).toBe(7);
    expect(detail.outputOfRecordSourceLine).toBe(16);
    expect(detail.outputOfRecordSourceLine).toBeGreaterThan(detail.exclusiveCreateSourceLine);
    expect(detail.firstRunRefusedEarlier).toMatch(/source deck/);
  });

  it("the output of record is still the one written on 2026-10-18", () => {
    for (const [name, facts] of Object.entries(detail.outputOfRecordUntouched)) {
      expect(facts.bytes, name).toBeGreaterThan(0);
      expect(facts.writtenAt, name).toMatch(/^2026-10-18/);
    }
    expect(detail.outputOfRecordUntouched["render-comparison.json"]?.bytes).toBe(9163);
  });

  it("the deck it staged from was byte-restored, and the qualified input passed its own guard", () => {
    expect(detail.sourceDeck.restored).toBe(true);
    expect(detail.sourceDeck.byteRestored).toBe(true);
    expect(detail.sourceDeck.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(detail.sourceDeck.path).toMatch(/authorized-widget-content-20261018-r2[/\\]deck\.sqlite3$/);
    expect(detail.qualifiedInput.code).toBe(0);
    expect(detail.qualifiedInput.canonicalUnchanged).toBe(true);
    expect(detail.qualifiedInput.inputUnchanged).toBe(true);
    expect(detail.whatWouldCloseIt).toMatch(/fresh experiment directory/);
  });
});

// smell-verify-staging-probe-restoration-parity.test.ts - the row
// smell-verify-staging-probe-restoration.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/verify-staging-probe-restoration.mjs)
// reads the metadata of the two live edge scripts and exports six non-secret
// harness flags each, and it writes its receipt with the exclusive-create
// flag. The instrument states no pass condition of its own.
//
// The capture under fixtures/captured/smell-row-r5-2026-10-24/ is this lane's
// run of that instrument next to the receipt of record it re-measures.
//
// WHAT IT ASSERTS:
//
//   - the instrument ran and measured both scripts, and every one of the six
//     flags it exports is recorded for each of them.
//
//   - the six flags are unchanged from the receipt of record, so the standing
//     reading of the live scripts still holds.
//
//   - the release id of one of the two scripts moved since the receipt of
//     record, so the flags were read again from a redeployed script.
//
//   - the capture carries no credential: the instrument reads the account key
//     and must not write it.
//
//   - the capture says plainly that the instrument states no verdict of its
//     own, so a reader cannot mistake a comparison against the row's own
//     earlier output for a pass condition.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// stays open, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture } from "./smell-row-r5-captures.js";

type Flag = { now: string | null; then: string | null };

type Row = {
  id: number;
  origin: string;
  currentRelease: number;
  earlierRelease: number | null;
  releaseMoved: boolean | null;
  flags: Record<string, Flag>;
  flagsUnchanged: boolean;
};

type Capture = {
  row: string;
  instrument: string;
  receiptOfRecord: string;
  receiptOfRecordAt: string;
  measuredAt: string;
  scope: string;
  instrumentStatesAVerdict: boolean;
  rows: Row[];
  rowsMeasured: number;
  rowsWhoseFlagsAreUnchanged: number;
  rowsWhoseReleaseMoved: number;
  flagsCompared: string[];
};

const captureValue = capture<Capture>("verify-staging-probe-restoration");

describe("smell-verify-staging-probe-restoration: both live scripts carry the same six flags", () => {
  it("the instrument measured both scripts and every flag it exports", () => {
    expect(captureValue.row).toBe("verify-staging-probe-restoration");
    expect(captureValue.rowsMeasured).toBe(2);
    expect(captureValue.flagsCompared).toHaveLength(6);
    for (const row of captureValue.rows) {
      expect(row.origin).toMatch(/^https:\/\/.*\.bunny\.run$/);
      expect(row.currentRelease).toBeGreaterThan(0);
      for (const name of captureValue.flagsCompared) {
        expect(row.flags[name], `${name} missing from script ${row.id}`).toBeDefined();
      }
    }
  });

  it("the six flags are unchanged from the receipt of record", () => {
    expect(captureValue.rowsWhoseFlagsAreUnchanged).toBe(2);
    for (const row of captureValue.rows) {
      expect(row.flagsUnchanged).toBe(true);
      for (const name of captureValue.flagsCompared) {
        expect(row.flags[name].now).toBe(row.flags[name].then);
      }
    }
  });

  it("one of the two scripts was redeployed since the receipt of record", () => {
    expect(captureValue.rowsWhoseReleaseMoved).toBe(1);
    const moved = captureValue.rows.filter((row) => row.releaseMoved);
    expect(moved).toHaveLength(1);
    expect(moved[0].earlierRelease).not.toBe(moved[0].currentRelease);
  });

  it("the capture carries no credential", () => {
    const raw = JSON.stringify(captureValue);
    expect(raw).not.toContain("AccessKey");
    expect(raw).not.toContain("BUNNY_ACCOUNT_API_KEY");
    expect(raw).not.toMatch(/BUNNY_[A-Z_]*KEY/);
  });

  it("the capture says that the instrument states no verdict of its own", () => {
    expect(captureValue.instrumentStatesAVerdict).toBe(false);
    expect(captureValue.scope).toContain("Read-only known script metadata");
    expect(captureValue.scope).toContain("No mutation");
    expect(captureValue.receiptOfRecordAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(captureValue.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

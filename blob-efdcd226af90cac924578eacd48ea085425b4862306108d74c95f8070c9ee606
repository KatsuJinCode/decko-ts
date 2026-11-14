// smell-prepare-remote-widget-cas-parity.test.ts - the row
// smell-prepare-remote-widget-cas.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/prepare-remote-widget-cas.mjs)
// prepares the read-only before image and the apply plan for the authorized
// twelve-cell content change, then the apply itself. The row closes when
// that instrument runs and its own verdict holds.
//
// This lane did NOT run it, and the capture under
// fixtures/captured/smell-row-r5b-2026-10-24/ says so. The instrument's
// first act is live traffic to the cs-edge database, which an agent lane must
// not make, and its one-shot outputs already exist, so the run would end in
// EEXIST after that traffic. This pin holds that record and the facts it
// rests on.
//
// WHAT IT ASSERTS:
//
//   - the capture says the instrument was not run, and says why.
//
//   - the instrument's own source still puts the live pipeline read before
//     the exclusive-create write, so the two reasons still hold in this
//     order: a run would spend live traffic and then fail on an existing
//     file.
//
//   - the one-shot outputs the capture names are present, so the refusal is
//     the instrument's own design and not a missing file.
//
//   - the apply receipt and the hosted readback both passed, so the change
//     this row prepares was already applied and verified, and no credential
//     value is anywhere in the capture.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closes on this instrument's own verdict, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture } from "./smell-row-r5b-captures.js";

type Detail = {
  liveTrafficSourceLine: number;
  liveTrafficExcerpt: string;
  oneShotWriteSourceLine: number;
  oneShotWriteExcerpt: string;
  oneShotOutputs: { name: string; bytes?: number; count?: number }[];
  applyReceipt: { pass: boolean; contentWritten: boolean };
  hostedReadback: { pass: boolean; rows: number };
  twoSufficientReasons: string[];
};

const row = capture("smell-prepare-remote-widget-cas");
const detail = row.detail as Detail;

describe("smell-prepare-remote-widget-cas: the instrument was not run, and the two reasons still hold", () => {
  it("the capture says the instrument was not run, and names both reasons", () => {
    expect(row.row).toBe("smell-prepare-remote-widget-cas");
    expect(row.outcome).toBe("not-run");
    expect(row.exit).toBeNull();
    expect(row.verdict).toBe("open");
    expect(detail.twoSufficientReasons).toHaveLength(2);
    expect(row.mechanism).toMatch(/live/i);
  });

  it("the instrument still spends live traffic before its exclusive-create write", () => {
    // The live pipeline read is the sql() helper's own line, and the
    // exclusive create of the before image is a later line.
    expect(detail.oneShotWriteSourceLine).toBeGreaterThan(detail.liveTrafficSourceLine);
    expect(detail.liveTrafficExcerpt).toMatch(/\/v2\/pipeline/);
    expect(detail.oneShotWriteExcerpt).toMatch(/flag:'wx'/);
    expect(detail.oneShotWriteExcerpt).toMatch(/before\.json/);
  });

  it("the one-shot outputs the capture names are on disk", () => {
    for (const output of detail.oneShotOutputs) {
      expect(output.bytes === undefined ? output.count : output.bytes).toBeGreaterThan(0);
      expect(output.name).toMatch(/\.(json|html)$|hosted-card-\*\.html/);
    }
    // The exclusive-create target itself is present, which is what makes a
    // repeat EEXIST.
    expect(detail.oneShotOutputs.map((output) => output.name)).toContain("before.json");
  });

  it("the authorized change was applied and verified, and no credential is in the capture", () => {
    expect(detail.applyReceipt.pass).toBe(true);
    expect(detail.applyReceipt.contentWritten).toBe(true);
    expect(detail.hostedReadback.pass).toBe(true);
    expect(detail.hostedReadback.rows).toBe(12);
    const raw = JSON.stringify(row);
    expect(raw).not.toMatch(/CSEDGE_DB_READONLY_TOKEN/);
    expect(raw).not.toMatch(/authorization/i);
    expect(raw).not.toMatch(/Bearer /);
  });
});

// smell-verify-hosted-widget-content-parity.test.ts - the row
// smell-verify-hosted-widget-content.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/verify-hosted-widget-content.mjs)
// reads the twelve card JSON addresses of the authorized content migration
// from the hosted edge, one anonymous read each, and asserts that each one
// answers 200 with the exact migrated content and without the legacy loader.
// The row stays open while that instrument's own verdict is false.
//
// The capture under fixtures/captured/smell-row-r5-2026-10-24/ is the
// instrument's own receipt, copied field for field from the run this lane
// made on 2026-10-24.
//
// WHAT IT ASSERTS:
//
//   - the instrument's own verdict is false, and every one of the twelve
//     addresses answers 404.
//
//   - no address carries the migrated content, so the row's pass condition
//     cannot hold from here.
//
//   - the edge really served the request: every row carries a server-timing
//     header, so a 404 is the edge's own answer and not a refused request.
//
//   - the receipt carries no credential, and its scope line says what it is.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// stays open on this instrument's own verdict, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture } from "./smell-row-r5-captures.js";

type Row = {
  id: number;
  route: string;
  status: number;
  bodySha256: string;
  jsonKeys: string[];
  candidateContentSha256: string[];
  exactAfterContent: boolean;
  legacyLoaderPresent: boolean;
  serverTiming: string | null;
};

type Capture = {
  row: string;
  instrument: string;
  startedAt: string;
  completedAt: string;
  target: string;
  scope: string;
  pass: boolean;
  rows: Row[];
  rowsAnswered: number;
  rowsAnswered200: number;
  rowsCarryingTheExactContent: number;
};

const captureValue = capture<Capture>("verify-hosted-widget-content");

describe("smell-verify-hosted-widget-content: every card JSON address answers 404", () => {
  it("the instrument's own verdict does not hold", () => {
    expect(captureValue.row).toBe("verify-hosted-widget-content");
    expect(captureValue.pass).toBe(false);
    expect(captureValue.rowsAnswered).toBe(12);
    expect(captureValue.rowsAnswered200).toBe(0);
    expect(captureValue.rowsCarryingTheExactContent).toBe(0);
  });

  it("the edge answered every address itself", () => {
    for (const row of captureValue.rows) {
      expect(row.status).toBe(404);
      expect(row.exactAfterContent).toBe(false);
      expect(row.legacyLoaderPresent).toBe(false);
      expect(row.jsonKeys).toEqual([]);
      expect(row.candidateContentSha256).toEqual([]);
      expect(row.serverTiming).toBeTruthy();
      expect(row.serverTiming).toContain("total;dur=");
      expect(row.bodySha256).toMatch(/^[0-9a-f]{64}$/);
      expect(row.route).toMatch(/^\/~[0-9]+\.json\?widget_cas=/);
    }
  });

  it("the receipt carries no credential", () => {
    const raw = JSON.stringify(captureValue);
    expect(raw).not.toContain("AccessKey");
    expect(raw).not.toContain("BUNNY_ACCOUNT_API_KEY");
    expect(raw).not.toContain("authorization");
  });

  it("the receipt says what it is: anonymous read-only card reads", () => {
    expect(captureValue.target).toMatch(/^https:\/\/.*\.bunny\.run$/);
    expect(captureValue.target).not.toContain("culturesmith.com");
    expect(captureValue.scope).toContain("Anonymous read-only");
    expect(captureValue.scope).toContain("no .com");
  });
});

// smell-verify-hosted-widget-views-parity.test.ts - the row
// smell-verify-hosted-widget-views.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/verify-hosted-widget-views.mjs)
// opens the twelve named content-view addresses of the authorized content
// migration in owned headless Chromium, with JavaScript disabled and every
// subresource request aborted, and asserts that the main slot carries the
// exact card identity and the expected anchor. The row closes when that
// instrument runs and its own verdict holds.
//
// The capture under fixtures/captured/smell-row-r5-2026-10-24/ is the
// instrument's own receipt, copied field for field from the run this lane
// made on 2026-10-24.
//
// WHAT IT ASSERTS:
//
//   - the instrument's own verdict is true, and every one of the twelve rows
//     answers 200.
//
//   - every row has exactly one main content slot for its own card id, the
//     expected anchor is present, and the legacy widget loader is absent.
//
//   - the receipt carries no credential: it is an anonymous read of public
//     content and it must not carry a key.
//
//   - the receipt's scope line says what it is: a read-only confirmation of
//     named content views, not hosted acceptance and not a deployment.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closes on this instrument's own verdict, and the roster owns that state.

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { capture, CAPTURE_DIR } from "./smell-row-r5-captures.js";

type Row = {
  id: number;
  route: string;
  status: number;
  bodySha256: string;
  matchingMainSlots: number;
  expectedLinkPresent: boolean;
  legacyScriptsInSlot: number;
  serverTiming: string | null;
  pass: boolean;
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
  rowsPassing: number;
  rowsWithExactlyOneMainSlot: number;
  rowsWithTheExpectedAnchor: number;
  rowsCarryingTheLegacyLoader: number;
};

const captureValue = capture<Capture>("verify-hosted-widget-views");

describe("smell-verify-hosted-widget-views: every named content view answers 200 with the exact card", () => {
  it("the instrument's own verdict holds", () => {
    expect(captureValue.row).toBe("verify-hosted-widget-views");
    expect(captureValue.pass).toBe(true);
    expect(captureValue.rowsAnswered).toBe(12);
    expect(captureValue.rowsAnswered200).toBe(12);
    expect(captureValue.rowsPassing).toBe(12);
  });

  it("every row has one main slot for its own card, the expected anchor, and no legacy loader", () => {
    expect(captureValue.rowsWithExactlyOneMainSlot).toBe(12);
    expect(captureValue.rowsWithTheExpectedAnchor).toBe(12);
    expect(captureValue.rowsCarryingTheLegacyLoader).toBe(0);
    for (const row of captureValue.rows) {
      expect(row.status).toBe(200);
      expect(row.matchingMainSlots).toBe(1);
      expect(row.expectedLinkPresent).toBe(true);
      expect(row.legacyScriptsInSlot).toBe(0);
      expect(row.pass).toBe(true);
      expect(row.route).toContain("view=content");
      expect(row.bodySha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("the receipt carries no credential", () => {
    const raw = JSON.stringify(captureValue);
    expect(raw).not.toContain("AccessKey");
    expect(raw).not.toContain("BUNNY_ACCOUNT_API_KEY");
    expect(raw).not.toContain("authorization");
  });

  it("the receipt says what it is: a read-only confirmation of named content views", () => {
    expect(captureValue.target).toMatch(/^https:\/\/.*\.bunny\.run$/);
    expect(captureValue.target).not.toContain("culturesmith.com");
    expect(captureValue.scope).toContain("read-only named content-view HTTP responses");
    expect(captureValue.scope).toContain("No live browser interaction");
    expect(captureValue.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(captureValue.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("the card pages committed beside the receipt are the bodies the receipt measured", () => {
    for (const row of captureValue.rows) {
      const body = readFileSync(path.join(CAPTURE_DIR, `hosted-card-${row.id}.html`));
      expect(createHash("sha256").update(body).digest("hex"), `card ${row.id}`).toBe(row.bodySha256);
    }
  });
});

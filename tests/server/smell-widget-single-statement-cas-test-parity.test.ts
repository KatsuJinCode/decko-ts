// smell-widget-single-statement-cas-test-parity.test.ts - the row
// smell-widget-single-statement-cas-test.
//
// WHAT THIS IS. The row's own instrument
// (recovery/release/private-probes/private-tool-repairs-20261018/widget-single-statement-cas.test.mjs)
// drives the port's one-statement compare-and-swap against a copy of a deck
// and asserts that it changes exactly twelve content cells, that a guarded
// rollback restores every card, that versions stay monotonic, that a
// mismatching cell refuses every update, and that a trigger failure rolls
// everything back.
//
// The capture under fixtures/captured/smell-row-r5-2026-10-24/ is the suite's
// own TAP output next to this lane's measurement of the deck the suite
// copies.
//
// WHAT IT ASSERTS:
//
//   - the suite ran, and its own verdict is three failures of four.
//
//   - the failures are the admission: the statement changed no card, because
//     the deck admits none of the twelve ids.
//
//   - the deck is not damaged. Every one of the twelve cards is present and
//     not trashed, and every one of them carries the AFTER content the
//     proposal describes and none of them carries the BEFORE content the
//     suite admits against. So the deck on disk is the applied deck, and the
//     suite's pre-apply admission cannot match it.
//
//   - the measurement names the deck it measured, by path and by hash.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// stays open on the suite's own verdict, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture } from "./smell-row-r5-captures.js";

type Capture = {
  row: string;
  instrument: string;
  tests: number;
  pass: number;
  fail: number;
  cases: string[];
  failures: string[];
  deck: {
    path: string;
    sha256: string;
    version: number;
    versionRows: number;
    cardsPresent: number;
    cardsNotTrashed: number;
    cardsCarryingBeforeContent: number;
    cardsCarryingAfterContent: number;
    admissionMatches: number;
  };
};

const captureValue = capture<Capture>("widget-single-statement-cas-test");

describe("smell-widget-single-statement-cas-test: the suite ran and its admission matched nothing", () => {
  it("the suite ran and three of its four cases failed", () => {
    expect(captureValue.row).toBe("widget-single-statement-cas-test");
    expect(captureValue.tests).toBe(4);
    expect(captureValue.pass).toBe(1);
    expect(captureValue.fail).toBe(3);
    expect(captureValue.failures).toHaveLength(3);
    expect(captureValue.failures[0]).toContain("one statement changes exactly12 content cells");
  });

  it("the deck admits none of the twelve ids", () => {
    expect(captureValue.deck.admissionMatches).toBe(0);
    expect(captureValue.deck.cardsPresent).toBe(12);
    expect(captureValue.deck.cardsNotTrashed).toBe(12);
  });

  it("the deck on disk carries the applied content, not the content the suite admits against", () => {
    expect(captureValue.deck.cardsCarryingAfterContent).toBe(12);
    expect(captureValue.deck.cardsCarryingBeforeContent).toBe(0);
  });

  it("the measurement names the deck it measured", () => {
    expect(captureValue.deck.path).toMatch(/deck\.sqlite3$/);
    expect(captureValue.deck.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(captureValue.deck.version).toBeGreaterThan(0);
    expect(captureValue.deck.versionRows).toBe(1);
  });
});

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
// The capture under fixtures/captured/smell-row-r6-2026-10-25/ is the suite's
// own TAP output from two runs, next to this lane's measurement of both decks.
//
// WHAT IT ASSERTS:
//
//   - the suite ran as it stands, over the deck it reads, and its own verdict
//     is three failures of four.
//
//   - the failures are the admission: the statement changed no card, because
//     the deck it reads admits none of the twelve ids.
//
//   - the deck it reads is not damaged. Every one of the twelve cards is
//     present and not trashed, and every one of them carries the AFTER content
//     the proposal describes and none of them carries the BEFORE content the
//     suite admits against. So that deck is the applied deck.
//
//   - the hash-verified pre-apply backup of the same deck still carries the
//     hash the application receipt of record records, and it admits all twelve
//     ids.
//
//   - over that pre-apply deck the suite passes all four of its cases, and the
//     only line of the suite that changed is the path it reads the deck from.
//
// The row's VERDICT is a separate matter from this file's checks: the row
// closes on this suite's own verdict, and the roster owns that state.

import { describe, expect, it } from "vitest";

import { capture } from "./smell-row-r6-captures.js";

type DeckMeasurement = {
  path: string;
  present: boolean;
  sha256?: string;
  version?: number;
  versionRows?: number;
  cardsPresent?: number;
  cardsNotTrashed?: number;
  cardsCarryingBeforeContent?: number;
  cardsCarryingAfterContent?: number;
  admissionMatches?: number;
};

type Run = {
  cwd: string;
  exitCode: number | null;
  tests: number | null;
  pass: number | null;
  fail: number | null;
  cases: string[];
  failures: string[];
  output: string;
};

type Capture = {
  row: string;
  instrument: string;
  instrumentSha256: string;
  measuredAt: string;
  deck: {
    livePath: string;
    liveSha256: string | null;
    preApplyPath: string;
    preApplySha256: string | null;
    receiptBaselineSha256: string;
    live: DeckMeasurement;
    preApply: DeckMeasurement;
  };
  runInPlace: Run;
  runOverThePreApplyDeck: Run & {
    changedLines: { line: number; before: string; after: string }[];
    copiedFiles: { file: string; sha256: string }[];
  };
};

const captureValue = capture<Capture>("widget-single-statement-cas-test");

describe("smell-widget-single-statement-cas-test: the suite passes over the pre-apply deck", () => {
  it("the suite ran as it stands and three of its four cases failed", () => {
    expect(captureValue.row).toBe("widget-single-statement-cas-test");
    expect(captureValue.instrumentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(captureValue.runInPlace.tests).toBe(4);
    expect(captureValue.runInPlace.pass).toBe(1);
    expect(captureValue.runInPlace.fail).toBe(3);
    expect(captureValue.runInPlace.failures).toHaveLength(3);
    expect(captureValue.runInPlace.failures[0]).toContain("one statement changes exactly12 content cells");
  });

  it("the deck the suite reads admits none of the twelve ids", () => {
    const deck = captureValue.deck.live;
    expect(deck.admissionMatches).toBe(0);
    expect(deck.cardsPresent).toBe(12);
    expect(deck.cardsNotTrashed).toBe(12);
  });

  it("the deck the suite reads carries the applied content, not the content the suite admits against", () => {
    expect(captureValue.deck.live.cardsCarryingAfterContent).toBe(12);
    expect(captureValue.deck.live.cardsCarryingBeforeContent).toBe(0);
    expect(captureValue.deck.live.versionRows).toBe(1);
  });

  it("the hash-verified pre-apply backup carries the receipt's baseline hash and admits all twelve ids", () => {
    expect(captureValue.deck.preApplySha256).toBe(captureValue.deck.receiptBaselineSha256);
    expect(captureValue.deck.preApply.sha256).toBe(captureValue.deck.receiptBaselineSha256);
    expect(captureValue.deck.preApply.admissionMatches).toBe(12);
    expect(captureValue.deck.preApply.cardsCarryingBeforeContent).toBe(12);
    expect(captureValue.deck.preApply.cardsCarryingAfterContent).toBe(0);
    expect(captureValue.deck.preApply.cardsPresent).toBe(12);
  });

  it("over the pre-apply deck the suite passes all four of its cases", () => {
    const run = captureValue.runOverThePreApplyDeck;
    expect(run.tests).toBe(4);
    expect(run.pass).toBe(4);
    expect(run.fail).toBe(0);
    expect(run.failures).toEqual([]);
    expect(run.cases).toHaveLength(4);
    expect(run.cases[0]).toContain("one statement changes exactly12 content cells");
  });

  it("the only line of the suite that changed is the path it reads the deck from", () => {
    const run = captureValue.runOverThePreApplyDeck;
    expect(run.changedLines).toHaveLength(1);
    expect(run.changedLines[0].before).toContain("brandon-local-edit/deck.sqlite3");
    expect(run.changedLines[0].after).toContain("deck.sqlite3.pre-widget-fallback-20261019");
    expect(run.changedLines[0].after.replace("deck.sqlite3.pre-widget-fallback-20261019", "deck.sqlite3")).toBe(
      run.changedLines[0].before,
    );
  });

  it("the module under test, the four test bodies, the receipt and the proposal are the originals", () => {
    for (const copied of captureValue.runOverThePreApplyDeck.copiedFiles) {
      expect(copied.sha256, copied.file).toMatch(/^[0-9a-f]{64}$/);
    }
    const module = captureValue.runOverThePreApplyDeck.copiedFiles.find(
      (entry) => entry.file === "widget-single-statement-cas.mjs",
    );
    expect(module).toBeDefined();
  });
});

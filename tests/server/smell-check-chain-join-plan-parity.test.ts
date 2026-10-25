// smell-check-chain-join-plan-parity.test.ts - the row
// smell-check-chain-join-plan.
//
// WHAT THIS IS. The row's own instrument is the bounded differential
// tools/perf/check-chain-join-plan.mjs: it copies an approved local deck,
// adds the serving schema's cards indexes on that copy, and measures the
// captured junction-chain statement twice per planner state, once as captured
// and once with the plain joins rewritten to CROSS JOIN, refusing the
// measurement unless both forms answer byte-identical rows.
//
// The row was open because the tool refused its own inputs: the surviving
// capture carries no parameter array, and the deck it measures against is
// gone. This lane rebuilt both inputs (tools/smell-row-r4/build-chain-join-capture.mjs
// and tools/smell-row-r4/prepare-chain-join-deck.mjs) and ran the tool.
//
// The capture under fixtures/captured/smell-row-r4-2026-10-24/ carries the
// tool's own report, the deck preparation, the capture's own digest and this
// lane's set comparison.
//
// WHAT IT ASSERTS:
//
//   - the tool got past BOTH of its own guards: the deck carried the row
//     count it demands and the capture carried its parameter array.
//
//   - the CROSS JOIN rewrite is the repair the tool measures: on this capture
//     the captured form takes minutes and the rewritten form takes tens of
//     milliseconds, and both return the same cards.
//
//   - the tool's own equivalence check is ORDER SENSITIVE: the two forms
//     return the same SET of cards in a different order, so the byte
//     comparison is false on a capture that returns cards, while the committed
//     evidence's capture returned zero cards and therefore passed trivially.
//
//   - the deck this lane measured on is a stated reconstruction, not the deck
//     the committed evidence was produced against.
//
// The row's VERDICT is a separate matter from this file's checks: the row's
// own measurement is now producible, and the tool's own equivalence verdict
// is a fail on a capture that returns cards, which the roster owns.

import { describe, expect, it } from "vitest";

import { singleCapture } from "./smell-row-r4-captures.js";

type Capture = {
  row: string;
  tool: {
    complete: boolean;
    cards: number;
    parameterCount: number;
    sqlite: string;
    schemaIndexesApplied: number;
    schemaIndexesSha256: string;
    sourceSha256: string;
    copiedSha256: string;
    measurements: {
      stats: boolean;
      kind: string;
      ms: number;
      rows: number;
      selectedCards: number;
      byteLength: number;
      rowsSha256: string;
      identicalBytes: boolean;
    }[];
  };
  deck: {
    sourceSha256: string;
    copySha256: string;
    rowsBefore: number;
    distinctIdsBefore: number;
    nullIdRowsDropped: number;
    rowsAfter: number;
    distinctIdsAfter: number;
  };
  capture: { sha256: string; boundKeys: number; tuples: number };
  resultSets: {
    tuples: number;
    originalCards: number;
    fixedCards: number;
    sameSet: boolean;
    sameOrder: boolean;
  };
};

const capture = singleCapture<Capture>("check-chain-join-plan");

describe("smell-check-chain-join-plan: the tool measures, and its byte check is order sensitive", () => {
  it("the tool got past both of its own guards", () => {
    expect(capture.row).toBe("check-chain-join-plan");
    expect(capture.tool.cards).toBe(21670);
    expect(capture.tool.parameterCount).toBe(90);
    expect(capture.capture.boundKeys).toBe(90);
    expect(capture.capture.tuples).toBe(30);
    expect(capture.tool.schemaIndexesApplied).toBe(16);
    expect(capture.tool.copiedSha256).toBe(capture.tool.sourceSha256);
  });

  it("the CROSS JOIN rewrite is the repair the tool measures", () => {
    const original = capture.tool.measurements.find((m) => m.kind === "original")!;
    const fixed = capture.tool.measurements.find((m) => m.kind === "fixed")!;
    expect(original.stats).toBe(false);
    expect(fixed.stats).toBe(false);
    expect(original.ms).toBeGreaterThan(60_000);
    expect(fixed.ms).toBeLessThan(1_000);
    expect(original.selectedCards).toBe(30);
    expect(fixed.selectedCards).toBe(30);
  });

  it("the two forms return the same cards in a different order, so the byte check is false", () => {
    expect(capture.resultSets.sameSet).toBe(true);
    expect(capture.resultSets.sameOrder).toBe(false);
    expect(capture.resultSets.originalCards).toBe(30);
    expect(capture.resultSets.fixedCards).toBe(30);
    const original = capture.tool.measurements.find((m) => m.kind === "original")!;
    const fixed = capture.tool.measurements.find((m) => m.kind === "fixed")!;
    expect(original.identicalBytes).toBe(true);
    expect(fixed.identicalBytes).toBe(false);
    // Same length, different digest: a permutation of the same cards.
    expect(fixed.byteLength).toBe(original.byteLength);
    expect(fixed.rowsSha256).not.toBe(original.rowsSha256);
    // The tool refused the measurement on that difference.
    expect(capture.tool.complete).toBe(false);
  });

  it("the deck this lane measured on is a stated reconstruction", () => {
    expect(capture.deck.rowsBefore).toBe(21676);
    expect(capture.deck.distinctIdsBefore).toBe(21670);
    expect(capture.deck.nullIdRowsDropped).toBe(6);
    expect(capture.deck.rowsAfter).toBe(21670);
    expect(capture.deck.distinctIdsAfter).toBe(21670);
    expect(capture.deck.copySha256).not.toBe(capture.deck.sourceSha256);
  });
});

// smell-check-chain-join-plan-parity.test.ts - the row
// smell-check-chain-join-plan.
//
// WHAT THIS IS. The row's own instrument is the bounded differential
// tools/perf/check-chain-join-plan.mjs: it copies an approved local deck,
// adds the serving schema's cards indexes on that copy, and measures the
// captured junction-chain statement twice per planner state, once as captured
// and once with the plain joins rewritten to CROSS JOIN.
//
// THE ARC THIS PIN HOLDS, in two halves.
//
// Half one, the r4 refusal (fixtures/captured/smell-row-r4-2026-10-24/):
// the tool's pass condition was then a byte comparison, and the round-four
// lane rebuilt both inputs (tools/smell-row-r4/build-chain-join-capture.mjs
// and tools/smell-row-r4/prepare-chain-join-deck.mjs), ran the tool, and
// measured the refusal's mechanism: the two forms returned the same 30 cards
// in a different order, so the byte check failed on a capture that returns
// cards, while the committed differential's own capture (zero cards) had
// passed trivially. The row stayed open on that refusal.
//
// Half two, the completed run (fixtures/captured/working-rows-g-2026-10-25/):
// the pass condition now compares the answer SET, the multiset of per-card
// digests taken from the answer's __decko_compact payload (the statement
// returns one aggregate row whose payload embeds the cards in the plan's own
// order, so a row-level digest would refuse for the same reason the byte
// check did). The raw-byte digests stay in the report so an order change
// stays visible. At this tree the instrument runs to completion and records
// the repair it exists to measure: the captured form takes minutes without
// planner statistics, the rewritten form takes tens of milliseconds, and all
// four measurements answer with the same card set.
//
// The prior refusal capture is read through the r4 round's own reader module
// (tests/server/smell-row-r4-captures.ts), which this file never edits.

import { describe, expect, it } from "vitest";

import { singleCapture as r4Capture } from "./smell-row-r4-captures.js";
import { singleCapture as batchCapture } from "./working-rows-g-2026-10-25-captures.js";

type RefusalCapture = {
  row: string;
  tool: {
    complete: boolean;
    cards: number;
    parameterCount: number;
    schemaIndexesApplied: number;
    copiedSha256: string;
    sourceSha256: string;
    measurements: {
      stats: boolean;
      kind: string;
      ms: number;
      selectedCards: number;
      byteLength: number;
      rowsSha256: string;
      identicalBytes: boolean;
    }[];
  };
  deck: {
    rowsBefore: number;
    distinctIdsBefore: number;
    nullIdRowsDropped: number;
    rowsAfter: number;
    distinctIdsAfter: number;
    copySha256: string;
    sourceSha256: string;
  };
  capture: { boundKeys: number; tuples: number };
  resultSets: {
    originalCards: number;
    fixedCards: number;
    sameSet: boolean;
    sameOrder: boolean;
  };
};

type CompletedCapture = {
  row: string;
  instrument: string;
  passCondition: string;
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
      rowsSetSha256: string;
      identicalSet: boolean;
    }[];
  };
  deck: {
    rowsBefore: number;
    distinctIdsBefore: number;
    nullIdRowsDropped: number;
    rowsAfter: number;
    distinctIdsAfter: number;
    copySha256: string;
    sourceSha256: string;
  };
  capture: { boundKeys: number; sha256: string };
  priorRefusal: { round: string; capture: string };
};

const refusal = r4Capture<RefusalCapture>("check-chain-join-plan");
const completed = batchCapture<CompletedCapture>("check-chain-join-plan");

describe("smell-check-chain-join-plan: the r4 refusal the row stayed open on", () => {
  it("the tool got past both of its own guards, then refused on the byte check", () => {
    expect(refusal.row).toBe("check-chain-join-plan");
    expect(refusal.tool.cards).toBe(21670);
    expect(refusal.tool.parameterCount).toBe(90);
    expect(refusal.capture.boundKeys).toBe(90);
    expect(refusal.capture.tuples).toBe(30);
    expect(refusal.tool.schemaIndexesApplied).toBe(16);
    expect(refusal.tool.copiedSha256).toBe(refusal.tool.sourceSha256);
    expect(refusal.tool.complete).toBe(false);
  });

  it("the CROSS JOIN rewrite is the repair the tool measures", () => {
    const original = refusal.tool.measurements.find((m) => m.kind === "original")!;
    const fixed = refusal.tool.measurements.find((m) => m.kind === "fixed")!;
    expect(original.stats).toBe(false);
    expect(fixed.stats).toBe(false);
    expect(original.ms).toBeGreaterThan(60_000);
    expect(fixed.ms).toBeLessThan(1_000);
    expect(original.selectedCards).toBe(30);
    expect(fixed.selectedCards).toBe(30);
  });

  it("the two forms returned the same cards in a different order, so the byte check was false", () => {
    expect(refusal.resultSets.sameSet).toBe(true);
    expect(refusal.resultSets.sameOrder).toBe(false);
    expect(refusal.resultSets.originalCards).toBe(30);
    expect(refusal.resultSets.fixedCards).toBe(30);
    const original = refusal.tool.measurements.find((m) => m.kind === "original")!;
    const fixed = refusal.tool.measurements.find((m) => m.kind === "fixed")!;
    expect(original.identicalBytes).toBe(true);
    expect(fixed.identicalBytes).toBe(false);
    // Same length, different digest: a permutation of the same cards.
    expect(fixed.byteLength).toBe(original.byteLength);
    expect(fixed.rowsSha256).not.toBe(original.rowsSha256);
  });

  it("the deck that round measured on is a stated reconstruction", () => {
    expect(refusal.deck.rowsBefore).toBe(21676);
    expect(refusal.deck.distinctIdsBefore).toBe(21670);
    expect(refusal.deck.nullIdRowsDropped).toBe(6);
    expect(refusal.deck.rowsAfter).toBe(21670);
    expect(refusal.deck.distinctIdsAfter).toBe(21670);
    expect(refusal.deck.copySha256).not.toBe(refusal.deck.sourceSha256);
  });
});

describe("smell-check-chain-join-plan: the completed run at this tree, on the set pass condition", () => {
  it("the instrument ran to completion past both of its own guards", () => {
    expect(completed.row).toBe("check-chain-join-plan");
    expect(completed.instrument).toBe("tools/perf/check-chain-join-plan.mjs");
    expect(completed.tool.complete).toBe(true);
    expect(completed.tool.cards).toBe(21670);
    expect(completed.tool.parameterCount).toBe(90);
    expect(completed.capture.boundKeys).toBe(90);
    expect(completed.tool.schemaIndexesApplied).toBe(16);
    expect(completed.tool.schemaIndexesSha256).toBeTruthy();
    expect(completed.tool.copiedSha256).toBe(completed.tool.sourceSha256);
    expect(completed.tool.measurements).toHaveLength(4);
  });

  it("every measurement answers with the same card set, and the pass condition names the set", () => {
    expect(completed.passCondition).toContain("same SET");
    for (const measurement of completed.tool.measurements) {
      expect(measurement.selectedCards).toBe(30);
      expect(measurement.identicalSet).toBe(true);
      expect(measurement.rowsSetSha256).toBe(completed.tool.measurements[0].rowsSetSha256);
    }
  });

  it("the repair is measured: minutes without statistics, tens of milliseconds rewritten", () => {
    const original = completed.tool.measurements.find((m) => m.stats === false && m.kind === "original")!;
    const fixed = completed.tool.measurements.find((m) => m.stats === false && m.kind === "fixed")!;
    expect(original.ms).toBeGreaterThan(60_000);
    expect(fixed.ms).toBeLessThan(1_000);
    expect(original.ms / fixed.ms).toBeGreaterThan(1_000);
  });

  it("planner statistics alone avoid the pathological plan, at set equality", () => {
    const analyzedOriginal = completed.tool.measurements.find((m) => m.stats === true && m.kind === "original")!;
    const analyzedFixed = completed.tool.measurements.find((m) => m.stats === true && m.kind === "fixed")!;
    expect(analyzedOriginal.ms).toBeLessThan(1_000);
    expect(analyzedFixed.ms).toBeLessThan(1_000);
    expect(analyzedOriginal.identicalSet).toBe(true);
    expect(analyzedFixed.identicalSet).toBe(true);
  });

  it("the byte layout is not a stable answer identity: every leg after the first differs in bytes, none in set", () => {
    const first = completed.tool.measurements[0];
    expect(first.identicalBytes).toBe(true);
    for (const measurement of completed.tool.measurements.slice(1)) {
      expect(measurement.identicalBytes).toBe(false);
      expect(measurement.byteLength).toBe(first.byteLength);
    }
  });

  it("this run's deck is the same stated reconstruction, and the capture names the round that refused", () => {
    expect(completed.deck.rowsBefore).toBe(21676);
    expect(completed.deck.distinctIdsBefore).toBe(21670);
    expect(completed.deck.nullIdRowsDropped).toBe(6);
    expect(completed.deck.rowsAfter).toBe(21670);
    expect(completed.deck.distinctIdsAfter).toBe(21670);
    expect(completed.deck.copySha256).not.toBe(completed.deck.sourceSha256);
    expect(completed.priorRefusal.round).toBe("smell-row-conversion-r4-2026-10-24");
    expect(completed.priorRefusal.capture).toBe(
      "fixtures/captured/smell-row-r4-2026-10-24/check-chain-join-plan.json",
    );
  });
});

#!/usr/bin/env node
// Distils the junction-chain differential's completed run into one capture,
// so the row's question can be answered by COMPARING the tool's own
// measurement with what it claims to have proved.
//
//   node tools/working-rows-g-2026-10-25/distill-chain-join-plan.mjs <tool-report.json> <deck-preparation.json> <capture-file> <out-file>
//
// The tool's report is tools/perf/check-chain-join-plan.mjs's own output at
// the tree this batch lands on, whose pass condition is the answer SET: the
// multiset of per-row digests, sorted. The deck preparation is what
// tools/smell-row-r4/prepare-chain-join-deck.mjs recorded for this run's deck
// copy, and the capture file is the SQL-plus-parameters file the tool
// measured.
//
// Nothing is re-measured here.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [reportPath, deckPath, capturePath, outFile] = process.argv.slice(2);
if (!reportPath || !deckPath || !capturePath || !outFile) {
  console.error(
    "usage: distill-chain-join-plan.mjs <tool-report.json> <deck-preparation.json> <capture-file> <out-file>",
  );
  process.exit(2);
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const report = readJson(reportPath);
const deck = readJson(deckPath);
const captureRaw = readFileSync(capturePath, "utf8");

const capture = {
  row: "check-chain-join-plan",
  instrument: "tools/perf/check-chain-join-plan.mjs",
  passCondition:
    "the two forms must answer with the same SET of rows (the multiset of per-row digests, sorted); the raw-byte digest and byte comparison stay in the report so an order change stays visible",
  tool: {
    complete: report.complete,
    cards: report.cards,
    parameterCount: report.parameter_count,
    sqlite: report.sqlite,
    schemaIndexesApplied: report.schema_indexes_applied,
    schemaIndexesSha256: report.schema_indexes_sha256,
    sourceSha256: report.source_sha256,
    copiedSha256: report.copied_sha256,
    measurements: (report.measurements ?? []).map((measurement) => ({
      stats: measurement.stats,
      kind: measurement.kind,
      ms: measurement.ms,
      rows: measurement.rows,
      selectedCards: measurement.selected_cards,
      byteLength: measurement.byte_length,
      rowsSha256: measurement.rows_sha256,
      identicalBytes: measurement.identical_bytes,
      rowsSetSha256: measurement.rows_set_sha256,
      identicalSet: measurement.identical_set,
    })),
  },
  deck: {
    source: deck.source,
    sourceSha256: deck.sourceSha256,
    copySha256: deck.copySha256,
    rowsBefore: deck.rowsBefore,
    distinctIdsBefore: deck.distinctIdsBefore,
    nullIdRowsDropped: deck.nullIdRowsDropped,
    rowsAfter: deck.rowsAfter,
    distinctIdsAfter: deck.distinctIdsAfter,
  },
  capture: {
    file: capturePath,
    sha256: createHash("sha256").update(captureRaw).digest("hex"),
    boundKeys: (captureRaw.match(/\?/g) ?? []).length,
    note: "the SQL text of the surviving capture with its CROSS JOINs turned back into plain JOINs, plus a parameter array taken from the deck's own widenable junctions",
  },
  priorRefusal: {
    round: "smell-row-conversion-r4-2026-10-24",
    capture: "fixtures/captured/smell-row-r4-2026-10-24/check-chain-join-plan.json",
    note: "that round's run refused on the byte comparison: the two forms returned the same 30 cards in a different order (same set, same byte length, different bytes), and the byte check was the pass condition",
  },
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `tool complete: ${capture.tool.complete}; measurements: ${capture.tool.measurements.length}; ` +
    `set digests: ${new Set(capture.tool.measurements.map((m) => m.rowsSetSha256)).size}`,
);

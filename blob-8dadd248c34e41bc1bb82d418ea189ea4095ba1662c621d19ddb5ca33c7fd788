#!/usr/bin/env node
// Distils the junction-chain differential into one capture, so the row's
// question can be answered by COMPARING the tool's own measurement with what
// it claims to have proved.
//
//   node tools/smell-row-r4/distill-chain-join-plan.mjs <tool-report.json> <deck-preparation.json> <capture-file> <set-comparison.json> <out-file>
//
// The tool's report is tools/perf/check-chain-join-plan.mjs's own output. The
// deck preparation is what tools/smell-row-r4/prepare-chain-join-deck.mjs
// recorded. The capture is the file the tool measured. The set comparison is
// this lane's own reading of the two forms' results.
//
// Nothing is re-measured here.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [reportPath, deckPath, capturePath, comparisonPath, outFile] = process.argv.slice(2);
if (!reportPath || !deckPath || !capturePath || !comparisonPath || !outFile) {
  console.error(
    "usage: distill-chain-join-plan.mjs <tool-report.json> <deck-preparation.json> <capture-file> <set-comparison.json> <out-file>",
  );
  process.exit(2);
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const report = readJson(reportPath);
const deck = readJson(deckPath);
const comparison = readJson(comparisonPath);
const captureRaw = readFileSync(capturePath, "utf8");

const capture = {
  row: "check-chain-join-plan",
  instrument: "tools/perf/check-chain-join-plan.mjs",
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
    tuples: comparison.tuples,
    note: "the SQL text of the surviving capture with its CROSS JOINs turned back into plain JOINs, plus a parameter array taken from the deck's own widenable junctions",
  },
  resultSets: comparison,
  committedEvidence: {
    file: "docs/junction-chain-join-evidence.json",
    note: "the differential the tool produced on 2026-10-15, whose capture returned zero cards",
  },
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `tool complete: ${capture.tool.complete}; measurements: ${capture.tool.measurements.length}; ` +
    `same set: ${comparison.sameSet}; same order: ${comparison.sameOrder}`,
);

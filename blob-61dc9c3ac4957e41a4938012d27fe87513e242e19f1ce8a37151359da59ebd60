#!/usr/bin/env node
// Distils the hosted content-view probe's own receipt into this round's
// capture, so the row's question can be answered by reading one file.
//
//   node tools/smell-row-r5/distill-hosted-widget-views.mjs <instrument-receipt.json> <out-file>
//
// The instrument is
// recovery/release/private-probes/private-tool-repairs-20261018/verify-hosted-widget-views.mjs.
// Its receipt is its own output. Nothing is re-measured here: every field is
// copied from that receipt, and the only thing added is which row the
// receipt belongs to and where it came from.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [receiptPath, outFile] = process.argv.slice(2);
if (!receiptPath || !outFile) {
  console.error("usage: distill-hosted-widget-views.mjs <instrument-receipt.json> <out-file>");
  process.exit(2);
}

const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));

const capture = {
  row: "verify-hosted-widget-views",
  instrument:
    "recovery/release/private-probes/private-tool-repairs-20261018/verify-hosted-widget-views.mjs",
  instrumentReceipt: path.basename(receiptPath),
  startedAt: receipt.startedAt,
  completedAt: receipt.completedAt,
  target: receipt.target,
  scope: receipt.scope,
  pass: receipt.pass,
  rows: receipt.rows.map((row) => ({
    id: row.id,
    route: row.route,
    status: row.status,
    ms: row.ms,
    bodySha256: row.bodySha256,
    matchingMainSlots: row.matchingMainSlots,
    expectedLinkPresent: row.expectedLinkPresent,
    legacyScriptsInSlot: row.legacyScriptsInSlot,
    serverTiming: row.serverTiming,
    pass: row.pass,
    error: row.error ?? null,
  })),
  rowsAnswered: receipt.rows.length,
  rowsAnswered200: receipt.rows.filter((row) => row.status === 200).length,
  rowsPassing: receipt.rows.filter((row) => row.pass).length,
  rowsWithExactlyOneMainSlot: receipt.rows.filter((row) => row.matchingMainSlots === 1).length,
  rowsWithTheExpectedAnchor: receipt.rows.filter((row) => row.expectedLinkPresent).length,
  rowsCarryingTheLegacyLoader: receipt.rows.filter((row) => row.legacyScriptsInSlot).length,
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `rows ${capture.rowsAnswered}, 200s ${capture.rowsAnswered200}, pass ${capture.rowsPassing}, ` +
    `instrument verdict ${capture.pass}`,
);

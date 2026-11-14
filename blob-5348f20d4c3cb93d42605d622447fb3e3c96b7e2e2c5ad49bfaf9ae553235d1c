#!/usr/bin/env node
// Distils the hosted card-JSON probe's own receipt into this round's capture.
//
//   node tools/smell-row-r5/distill-hosted-widget-content.mjs <instrument-receipt.json> <out-file>
//
// The instrument is
// recovery/release/private-probes/private-tool-repairs-20261018/verify-hosted-widget-content.mjs.
// Its receipt is its own output. Nothing is re-measured here.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [receiptPath, outFile] = process.argv.slice(2);
if (!receiptPath || !outFile) {
  console.error("usage: distill-hosted-widget-content.mjs <instrument-receipt.json> <out-file>");
  process.exit(2);
}

const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));

const capture = {
  row: "verify-hosted-widget-content",
  instrument:
    "recovery/release/private-probes/private-tool-repairs-20261018/verify-hosted-widget-content.mjs",
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
    jsonKeys: row.jsonKeys,
    candidateContentSha256: row.candidateContentSha256,
    exactAfterContent: row.exactAfterContent,
    legacyLoaderPresent: row.legacyLoaderPresent,
    serverTiming: row.serverTiming,
    error: row.error ?? null,
  })),
  rowsAnswered: receipt.rows.length,
  rowsAnswered200: receipt.rows.filter((row) => row.status === 200).length,
  rowsCarryingTheExactContent: receipt.rows.filter((row) => row.exactAfterContent).length,
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `rows ${capture.rowsAnswered}, 200s ${capture.rowsAnswered200}, exact content ` +
    `${capture.rowsCarryingTheExactContent}, instrument verdict ${capture.pass}`,
);

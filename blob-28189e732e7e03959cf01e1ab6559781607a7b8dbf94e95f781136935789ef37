#!/usr/bin/env node
// Distils the staging probe restoration probe's own receipt into this round's
// capture, and compares it with the receipt of record it re-measures.
//
//   node tools/smell-row-r5/distill-staging-probe-restoration.mjs <instrument-receipt.json> <receipt-of-record.json> <out-file>
//
// The instrument is
// recovery/release/private-probes/private-tool-repairs-20261018/verify-staging-probe-restoration.mjs.
// The receipt of record is the instrument's own earlier output,
// staging-probe-restoration-independent-20261019.json.
//
// The comparison is the point of the capture: the instrument states no pass
// condition of its own, so the only thing a run can be compared against is
// the row's own earlier reading. That comparison can be made, and it is
// recorded here, but a comparison against a row's own previous output cannot
// fail, so it is evidence and not a verdict.
//
// Nothing is re-measured here: both files are copied field for field.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [receiptPath, recordPath, outFile] = process.argv.slice(2);
if (!receiptPath || !recordPath || !outFile) {
  console.error(
    "usage: distill-staging-probe-restoration.mjs <instrument-receipt.json> <receipt-of-record.json> <out-file>",
  );
  process.exit(2);
}

const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
const record = JSON.parse(readFileSync(recordPath, "utf8"));

const FLAGS = [
  "DECKO_EDGE_ISOLATE_PROBE",
  "DECKO_EDGE_CACHE",
  "DECKO_CONFLICT_RETRY",
  "DECKO_MATERIAL_ICONS",
  "DECKO_FONT_AWESOME",
  "DECKO_WRITE_PATH",
];

const rows = receipt.rows.map((row) => {
  const earlier = record.rows.find((entry) => entry.id === row.id);
  const flags = Object.fromEntries(
    FLAGS.map((name) => [name, { now: row.flags[name] ?? null, then: earlier ? earlier.flags[name] ?? null : null }]),
  );
  return {
    id: row.id,
    origin: row.origin,
    currentRelease: row.currentRelease,
    earlierRelease: earlier ? earlier.currentRelease : null,
    releaseMoved: earlier ? earlier.currentRelease !== row.currentRelease : null,
    flags,
    flagsUnchanged: FLAGS.every((name) => (flags[name].now ?? null) === (flags[name].then ?? null)),
  };
});

const capture = {
  row: "verify-staging-probe-restoration",
  instrument:
    "recovery/release/private-probes/private-tool-repairs-20261018/verify-staging-probe-restoration.mjs",
  instrumentReceipt: path.basename(receiptPath),
  receiptOfRecord: path.basename(recordPath),
  receiptOfRecordAt: record.at,
  measuredAt: receipt.at,
  scope: receipt.scope,
  instrumentStatesAVerdict: false,
  rows,
  rowsMeasured: rows.length,
  rowsWhoseFlagsAreUnchanged: rows.filter((row) => row.flagsUnchanged).length,
  rowsWhoseReleaseMoved: rows.filter((row) => row.releaseMoved).length,
  flagsCompared: FLAGS,
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `rows ${capture.rowsMeasured}, flags unchanged ${capture.rowsWhoseFlagsAreUnchanged}, ` +
    `releases moved ${capture.rowsWhoseReleaseMoved}`,
);

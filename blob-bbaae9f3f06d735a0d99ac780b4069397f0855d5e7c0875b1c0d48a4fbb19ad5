#!/usr/bin/env node
// Distils the widget compare-and-swap suite's own run into this round's
// capture, next to the measurement of the deck the suite copies.
//
//   node tools/smell-row-r5/distill-widget-cas-suite.mjs <suite-output.txt> <deck-measurement.json> <out-file>
//
// The suite output is the node test runner's own TAP output, copied verbatim
// from the run this lane made. The deck measurement is what
// tools/smell-row-r5/measure-widget-cas-deck.mjs wrote.
//
// Nothing is re-measured here.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [suitePath, deckPath, outFile] = process.argv.slice(2);
if (!suitePath || !deckPath || !outFile) {
  console.error("usage: distill-widget-cas-suite.mjs <suite-output.txt> <deck-measurement.json> <out-file>");
  process.exit(2);
}

const output = readFileSync(suitePath, "utf8");
const deck = JSON.parse(readFileSync(deckPath, "utf8"));

const number = (label) => {
  const match = new RegExp(`^# ${label} (\\d+)$`, "m").exec(output);
  return match ? Number(match[1]) : null;
};
const failures = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim());
const cases = [...output.matchAll(/^ok \d+ - (.+)$/gm)].map((match) => match[1].trim());

const capture = {
  row: "widget-single-statement-cas-test",
  instrument:
    "recovery/release/private-probes/private-tool-repairs-20261018/widget-single-statement-cas.test.mjs",
  suiteOutput: path.basename(suitePath),
  tests: number("tests"),
  pass: number("pass"),
  fail: number("fail"),
  cancelled: number("cancelled"),
  skipped: number("skipped"),
  durationMs: number("duration_ms"),
  cases,
  failures,
  deck: {
    path: deck.deck,
    sha256: deck.deckSha256,
    version: deck.version,
    versionRows: deck.versionRows,
    cardsPresent: deck.cardsPresent,
    cardsNotTrashed: deck.cardsNotTrashed,
    cardsCarryingBeforeContent: deck.cardsCarryingBeforeContent,
    cardsCarryingAfterContent: deck.cardsCarryingAfterContent,
    admissionMatches: deck.admissionMatches,
  },
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `tests ${capture.tests}, pass ${capture.pass}, fail ${capture.fail}; deck admission ` +
    `${capture.deck.admissionMatches} of 12, after-content ${capture.deck.cardsCarryingAfterContent} of 12`,
);

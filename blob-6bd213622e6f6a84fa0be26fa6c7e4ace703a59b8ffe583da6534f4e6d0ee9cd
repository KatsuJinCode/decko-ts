#!/usr/bin/env node
// Prepares the local deck the junction-chain differential measures against.
//
// tools/perf/check-chain-join-plan.mjs guards on the deck's ROW count:
//
//     const cards = db.prepare("SELECT count(*) AS n FROM cards").get().n;
//     if (cards !== 21670) throw new Error(`expected the approved 21670-card deck, found ${cards}`);
//
// The deck this row's approved lineage is built on carries 21670 distinct card
// ids AND six rows whose id is NULL: a local test account (an account card,
// an email, a password hash and two settings) that a local test added to a
// working deck. Those six rows are not in the card id space (their id is
// NULL, so no join on id can reach them), and the deck the committed
// differential was produced against had 21670 rows.
//
// This script copies the deck and drops those six rows, so the copy has the
// row count the tool guards on. The SOURCE deck is never written to: the copy
// is the tool's own input, and the tool copies it again into its own scratch
// directory before measuring.
//
//   node tools/smell-row-r4/prepare-chain-join-deck.mjs <source-deck> <out-deck>
//
// The report it writes beside the copy records the source digest, the copy's
// digest, the rows dropped and the card counts before and after.

import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [source, outDeck] = process.argv.slice(2);
if (!source || !outDeck) {
  console.error("usage: prepare-chain-join-deck.mjs <source-deck> <out-deck>");
  process.exit(2);
}

const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

copyFileSync(source, outDeck);
const db = new DatabaseSync(outDeck);
const before = db.prepare("SELECT count(*) AS n FROM cards").get().n;
const distinctBefore = db.prepare("SELECT count(DISTINCT id) AS n FROM cards").get().n;
const dropped = db.prepare("SELECT count(*) AS n FROM cards WHERE id IS NULL").get().n;
db.exec("DELETE FROM cards WHERE id IS NULL");
const after = db.prepare("SELECT count(*) AS n FROM cards").get().n;
const distinctAfter = db.prepare("SELECT count(DISTINCT id) AS n FROM cards").get().n;
db.close();

const report = {
  source,
  sourceSha256: digest(source),
  copy: outDeck,
  copySha256: digest(outDeck),
  rowsBefore: before,
  distinctIdsBefore: distinctBefore,
  nullIdRowsDropped: dropped,
  rowsAfter: after,
  distinctIdsAfter: distinctAfter,
};
writeFileSync(
  path.join(path.dirname(path.resolve(outDeck)), "deck-preparation.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  `deck copy: ${before} rows (${distinctBefore} distinct ids, ${dropped} null-id rows) -> ${after} rows ` +
    `(${distinctAfter} distinct ids); copy sha256 ${report.copySha256.slice(0, 12)}`,
);

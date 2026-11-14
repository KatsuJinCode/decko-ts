#!/usr/bin/env node
// Measures the deck the widget compare-and-swap suite copies, so the row's
// own admission failure can be attributed to a fact about the deck instead of
// to the suite's own failure message.
//
//   node tools/smell-row-r5/measure-widget-cas-deck.mjs <deck.sqlite3> <application-receipt.json> <proposal.json> <out-file>
//
// The suite's admission predicate is "id = ? AND db_content = ?", and the
// expected content it admits against is the application receipt's BEFORE
// content. The proposal carries the SAME content as its afterSha256 hashes.
// So this measurement answers one question per card: does the deck on disk
// carry the before content the suite admits against, the after content the
// proposal describes, or neither?
//
// Nothing here re-runs the suite and nothing here writes to the deck.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const [deckPath, receiptPath, proposalPath, outFile] = process.argv.slice(2);
if (!deckPath || !receiptPath || !proposalPath || !outFile) {
  console.error("usage: measure-widget-cas-deck.mjs <deck.sqlite3> <application-receipt.json> <proposal.json> <out-file>");
  process.exit(2);
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
const proposal = JSON.parse(readFileSync(proposalPath, "utf8"));

const db = new DatabaseSync(deckPath, { readOnly: true });
const card = db.prepare("SELECT id, trash, db_content FROM cards WHERE id = ?");
const versionRow = db.prepare("SELECT version FROM deck_data_version WHERE id = 1").get();
const versionRows = db.prepare("SELECT COUNT(*) AS n FROM deck_data_version").get();

const cards = proposal.changes.map((change) => {
  const before = receipt.before.find((entry) => entry.id === change.id);
  const row = card.get(change.id);
  const content = row ? row.db_content : null;
  return {
    id: change.id,
    present: row !== undefined,
    trash: row ? row.trash : null,
    deckContentSha256: content === null ? null : sha256(content),
    receiptBeforeContentSha256: sha256(before.content),
    proposalBeforeSha256: change.beforeSha256,
    proposalAfterSha256: change.afterSha256,
    deckCarriesBeforeContent: content !== null && content === before.content,
    deckCarriesAfterContent: content !== null && content === change.replacementHtml,
  };
});
db.close();

const capture = {
  row: "widget-single-statement-cas-test",
  measuredAt: new Date().toISOString(),
  deck: deckPath,
  deckSha256: sha256(readFileSync(deckPath)),
  version: versionRow ? versionRow.version : null,
  versionRows: versionRows ? versionRows.n : null,
  cards,
  cardsPresent: cards.filter((entry) => entry.present).length,
  cardsNotTrashed: cards.filter((entry) => entry.trash === 0).length,
  cardsCarryingBeforeContent: cards.filter((entry) => entry.deckCarriesBeforeContent).length,
  cardsCarryingAfterContent: cards.filter((entry) => entry.deckCarriesAfterContent).length,
  admissionMatches: cards.filter((entry) => entry.present && entry.trash === 0 && entry.deckCarriesBeforeContent).length,
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `cards ${capture.cardsPresent}/${cards.length} present, ${capture.cardsNotTrashed} not trashed, ` +
    `before ${capture.cardsCarryingBeforeContent}, after ${capture.cardsCarryingAfterContent}, ` +
    `admission ${capture.admissionMatches}`,
);

#!/usr/bin/env node
// Runs the widget compare-and-swap suite twice: once as it stands, over the
// deck at the path it reads, and once over a copy of the suite whose one
// changed line reads the hash-verified pre-apply backup of that deck.
//
//   node tools/smell-row-r6/run-widget-cas-against-the-pre-apply-deck.mjs <evidence-tree-dir> <scratch-dir> <out-file>
//
// The suite is
// recovery/release/private-probes/private-tool-repairs-20261018/widget-single-statement-cas.test.mjs.
// It reads the deck at
// C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3
// and copies it into a scratch database for every case. That deck has been
// migrated since the a253 era, so it carries the proposal's AFTER content and
// the suite's admission, "id = ? AND db_content = ?", matches none of the
// twelve ids.
//
// The hash-verified pre-apply backup of the same deck still carries the hash
// the application receipt of record records, and it is the deck the suite's
// admission is written against. This tool copies the suite and changes one
// line, the path it reads the deck from, and nothing else: the module under
// test, the four test bodies, the application receipt and the proposal are
// the originals.
//
// The live deck is not touched, and the suite is not edited where it lives.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const [treeDir, scratchDir, outFile] = process.argv.slice(2);
if (!treeDir || !scratchDir || !outFile) {
  console.error(
    "usage: run-widget-cas-against-the-pre-apply-deck.mjs <evidence-tree-dir> <scratch-dir> <out-file>",
  );
  process.exit(2);
}

const hash = (value) => createHash("sha256").update(value).digest("hex");

const liveDeck = "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3";
const preApplyDeck = "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3.pre-widget-fallback-20261019";
const suiteName = "widget-single-statement-cas.test.mjs";

const originalSuite = readFileSync(path.join(treeDir, suiteName), "utf8");
const changedSuite = originalSuite.replace(liveDeck, preApplyDeck);
if (changedSuite === originalSuite) {
  console.error(`the suite does not read the deck at ${liveDeck}; nothing to repoint`);
  process.exit(2);
}
const changedLines = originalSuite
  .split(/\r?\n/)
  .map((line, index) => ({ index: index + 1, before: line }))
  .filter((entry) => entry.before.includes(liveDeck))
  .map((entry) => ({
    line: entry.index,
    before: entry.before,
    after: changedSuite.split(/\r?\n/)[entry.index - 1],
  }));

// ---- the copy of the suite, with one line repointed ------------------------

const copyDir = path.join(scratchDir, "cas-tree/private-tool-repairs-20261018");
mkdirSync(copyDir, { recursive: true });
const copiedFiles = [];
for (const relative of [suiteName, "widget-single-statement-cas.mjs"]) {
  const to = path.join(copyDir, relative);
  cpSync(path.join(treeDir, relative), to);
  copiedFiles.push({ file: relative, sha256: hash(readFileSync(to)) });
}
writeFileSync(path.join(copyDir, suiteName), changedSuite);
copiedFiles[0] = { file: suiteName, sha256: hash(readFileSync(path.join(copyDir, suiteName))) };

for (const [relative, from] of [
  ["../authorized-widget-content-20261018-r2/application-receipt.json", "../authorized-widget-content-20261018-r2/application-receipt.json"],
  ["../widget-fallback-proposal-20261017/proposal.json", "../widget-fallback-proposal-20261017/proposal.json"],
]) {
  const to = path.join(copyDir, from);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(path.join(treeDir, from), to);
  copiedFiles.push({ file: from, sha256: hash(readFileSync(to)) });
}

// ---- the two runs ----------------------------------------------------------

const runSuite = (dir) => {
  const run = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=tap", suiteName],
    {
      cwd: dir,
      encoding: "utf8",
      windowsHide: true,
      timeout: 900000,
      env: {
        ...process.env,
        NODE_PATH: process.env.NODE_PATH ?? "",
        PATH: "C:/Program Files/Git/usr/bin;" + (process.env.PATH ?? ""),
      },
    },
  );
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const number = (label) => {
    const match = new RegExp(`^# ${label} (\\d+(?:\\.\\d+)?)$`, "m").exec(output);
    return match ? Number(match[1]) : null;
  };
  return {
    cwd: dir,
    exitCode: run.status,
    tests: number("tests"),
    pass: number("pass"),
    fail: number("fail"),
    cases: [...output.matchAll(/^ok \d+ - (.+)$/gm)].map((match) => match[1].trim()),
    failures: [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()),
    output,
  };
};

const inPlaceRun = runSuite(treeDir);
const copyRun = runSuite(copyDir);

// ---- what each deck carries, card by card ----------------------------------

const receipt = JSON.parse(
  readFileSync(path.join(treeDir, "../authorized-widget-content-20261018-r2/application-receipt.json"), "utf8"),
);
const proposal = JSON.parse(
  readFileSync(path.join(treeDir, "../widget-fallback-proposal-20261017/proposal.json"), "utf8"),
);

// The suite's admission predicate is "id = ? AND db_content = ?", and the
// content it admits against is the application receipt's BEFORE content.
const measureDeck = (deckPath) => {
  if (!existsSync(deckPath)) return { path: deckPath, present: false };
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
      deckCarriesBeforeContent: content !== null && content === before.content,
      deckCarriesAfterContent: content !== null && content === change.replacementHtml,
    };
  });
  db.close();
  return {
    path: deckPath,
    present: true,
    sha256: hash(readFileSync(deckPath)),
    version: versionRow ? versionRow.version : null,
    versionRows: versionRows ? versionRows.n : null,
    cardsPresent: cards.filter((entry) => entry.present).length,
    cardsNotTrashed: cards.filter((entry) => entry.trash === 0).length,
    cardsCarryingBeforeContent: cards.filter((entry) => entry.deckCarriesBeforeContent).length,
    cardsCarryingAfterContent: cards.filter((entry) => entry.deckCarriesAfterContent).length,
    admissionMatches: cards.filter(
      (entry) => entry.present && entry.trash === 0 && entry.deckCarriesBeforeContent,
    ).length,
    cards,
  };
};

const capture = {
  row: "widget-single-statement-cas-test",
  instrument:
    "recovery/release/private-probes/private-tool-repairs-20261018/widget-single-statement-cas.test.mjs",
  instrumentSha256: hash(originalSuite),
  measuredAt: new Date().toISOString(),
  deck: {
    livePath: liveDeck,
    liveSha256: existsSync(liveDeck) ? hash(readFileSync(liveDeck)) : null,
    preApplyPath: preApplyDeck,
    preApplySha256: existsSync(preApplyDeck) ? hash(readFileSync(preApplyDeck)) : null,
    receiptBaselineSha256: receipt.baselineSha256,
    live: measureDeck(liveDeck),
    preApply: measureDeck(preApplyDeck),
  },
  runInPlace: inPlaceRun,
  runOverThePreApplyDeck: {
    ...copyRun,
    changedLines,
    copiedFiles,
    note:
      "one line of the suite changed: the path it reads the deck from. The module under test, the four test bodies, the application receipt and the proposal are the originals.",
  },
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `in place: tests ${inPlaceRun.tests}, pass ${inPlaceRun.pass}, fail ${inPlaceRun.fail} (${inPlaceRun.failures.length} failures); ` +
    `over the pre-apply deck: tests ${copyRun.tests}, pass ${copyRun.pass}, fail ${copyRun.fail} ` +
    `(${copyRun.failures.length} failures); changed lines: ${changedLines.map((entry) => entry.line).join(", ")}`,
);

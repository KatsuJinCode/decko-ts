#!/usr/bin/env node
// Builds a capture in the shape tools/perf/check-chain-join-plan.mjs accepts.
//
// The tool takes "a captured SQL plus its parameters": the SQL, then a JSON
// parameter array on its own line. The capture that produced the committed
// differential (docs/junction-chain-join-evidence.json) is not on this
// machine: the surviving file holds the SQL of the CROSS-joined form and no
// parameter array, and the parameter values it carried cannot be read out of
// anything that is left.
//
// This builder therefore rebuilds the capture from the two things that ARE
// here: the SQL text of the surviving capture, with its CROSS JOINs turned
// back into the plain JOINs the tool rewrites (the tool's own rewrite, run
// backwards), and the parameter values taken from the deck's own cards, so
// that the statement selects real rows and the tool measures a real query.
//
//   node tools/smell-row-r4/build-chain-join-capture.mjs <deck.sqlite3> <surviving-sql> <out-file>
//
// The number of tuples the statement asks for is read off its own placeholder
// count: the surviving statement is a three-part lookup, so each tuple binds
// three keys (the left part's key, the right part's key and the child's key).
// The tuples are the deck's own widenable junctions, in id order.

import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const [deckPath, sqlPath, outFile] = process.argv.slice(2);
if (!deckPath || !sqlPath || !outFile) {
  console.error("usage: build-chain-join-capture.mjs <deck.sqlite3> <surviving-sql> <out-file>");
  process.exit(2);
}

const sql = readFileSync(sqlPath, "utf8").trimEnd();
const plain = sql.replace(/CROSS JOIN cards/g, "JOIN cards");
const placeholders = (plain.match(/\?/g) ?? []).length;
if (placeholders === 0 || placeholders % 3 !== 0) {
  console.error(`the SQL carries ${placeholders} placeholders, which is not a whole number of three-part tuples`);
  process.exit(2);
}
const tuples = placeholders / 3;

const db = new DatabaseSync(deckPath, { readOnly: true });
const rows = db
  .prepare(
    `SELECT p0.key AS k0, p1.key AS k1, p2.key AS k2, c2.id AS c2_id, c3.id AS c3_id
     FROM cards c3
     JOIN cards c2 ON c2.id = c3.left_id AND c2.trash = 0
     JOIN cards p0 ON p0.id = c2.left_id AND p0.trash = 0
     JOIN cards p1 ON p1.id = c2.right_id AND p1.trash = 0
     JOIN cards p2 ON p2.id = c3.right_id AND p2.trash = 0
     WHERE c3.trash = 0 AND p0.key IS NOT NULL AND p1.key IS NOT NULL AND p2.key IS NOT NULL
     ORDER BY c3.id`,
  )
  .all();
db.close();

if (rows.length < tuples) {
  console.error(`the deck offers ${rows.length} widenable junctions and the statement asks for ${tuples}`);
  process.exit(2);
}

const args = [];
for (const row of rows.slice(0, tuples)) args.push(row.k0, row.k1, row.k2);

writeFileSync(outFile, `${plain}\n${JSON.stringify(args)}\n`);
console.log(
  `capture written: ${tuples} tuples, ${args.length} bound keys, from the deck's own widenable junctions ` +
    `(${rows.length} available); children ${rows.slice(0, tuples)[0].c3_id} to ${rows.slice(0, tuples)[tuples - 1].c3_id}`,
);

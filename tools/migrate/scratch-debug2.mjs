// scratch debug2 (deleted after use) — synthetic dump row shapes.
import { dumpRows } from "./parse-dump.mjs";
import { readFileSync } from "node:fs";

const dumpPath = process.argv[2];
const ddl = "C:/localProjects/decko-ts/db/schema.sqlite.sql";
const cols = [];
for (const line of readFileSync(ddl, "utf8").split("\n")) {
  const inCards = cols._in ?? false;
  if (line.startsWith('CREATE TABLE "cards"')) cols._in = true;
  else if (cols._in && line.startsWith(");")) cols._in = false;
  else if (cols._in) {
    const m = line.match(/^\s*"([a-z_]+)"/);
    if (m) cols.push(m[1]);
  }
  void inCards;
}
console.log("cards cols:", cols.join(","));
for await (const row of dumpRows(dumpPath, { tables: ["cards"] })) {
  if (row.values.length !== 17) {
    console.log("MISMATCH len", row.values.length, JSON.stringify(row.values));
  }
  const first = row.values[0];
  if (first === 1 || first === 1n) {
    console.log("row1:", JSON.stringify(row.values.map((v) => (typeof v === "string" && v.length > 30 ? v.slice(0, 30) + "…" : v))));
  }
}

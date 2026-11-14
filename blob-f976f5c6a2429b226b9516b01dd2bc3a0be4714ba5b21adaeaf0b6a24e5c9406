// db-roundtrip-elimination lane: read-only table census of the trial deck,
// to size a full local mirror before dumping it (the existing mirror is
// cards-only; local render iteration needs the whole schema).
import { readFileSync } from "node:fs";
import { BunnyDbDriver } from "../../src/card/drivers/bunny-db.js";

function readCreds(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
const creds = readCreds("C:/localProjects/brandonDojoTech/library/data/creds");
const url = creds.BUNNY_TRIAL_DB_URL.replace(/^libsql:\/\//, "https://");
const tok = creds.BUNNY_TRIAL_DB_RO_TOKEN ?? creds.BUNNY_TRIAL_DB_TOKEN;
const driver = new BunnyDbDriver({ url, authToken: tok });
const tables = await driver.query<{ name: string }>(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND substr(name,1,1) <> '_'",
  [],
);
for (const { name } of tables.rows) {
  try {
    const c = await driver.query<{ n: number }>(`SELECT COUNT(*) n FROM "${name}"`, []);
    console.log(name, c.rows[0]?.n);
  } catch (e) {
    console.log(name, "ERR", String((e as Error).message).slice(0, 80));
  }
}

// probe-exemplar-card-rows.mjs — print exemplar card rows from the TRIAL DB
// so a seeded row can carry the same NOT NULL / default shape the corpus
// rows carry (cards.creator_id and cards.updater_id are NOT NULL per
// db/schema.sqlite.sql:59-60, and the first seed attempt failed on exactly
// that constraint).
//
// Read-only. No secrets printed.

import { query, pipelineEndpoint } from "./probe-trial-account-schema.mjs";
import { readFileSync } from "node:fs";

const CREDS_PATH = "C:/localProjects/brandonDojoTech/library/data/creds";
function readCreds(path) {
  const raw = readFileSync(path, "utf8");
  const get = (k) => {
    const m = raw.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, "m"));
    return m ? m[1].trim() : undefined;
  };
  return { url: get("BUNNY_TRIAL_DB_URL"), token: get("BUNNY_TRIAL_DB_TOKEN") };
}

const COLS = `id,name,key,creator_id,updater_id,current_revision_id,read_rule_class,read_rule_id,references_expired,type_id,trash,db_content`;

async function main() {
  const { url, token } = readCreds(CREDS_PATH);
  const ep = pipelineEndpoint(url);
  const qs = [
    ["decko bot", `SELECT ${COLS} FROM cards WHERE name='Decko Bot 1'`],
    ["anonymous", `SELECT ${COLS} FROM cards WHERE name='Anonymous'`],
    ["account codename", `SELECT ${COLS} FROM cards WHERE codename='account'`],
    ["person type rows", `SELECT ${COLS} FROM cards WHERE type_id=4 AND trash=0 AND name IS NOT NULL LIMIT 3`],
    ["field-shaped row (right_id set, type null)", `SELECT ${COLS} FROM cards WHERE type_id IS NULL AND trash=0 LIMIT 3`],
    ["creator distribution", `SELECT creator_id, COUNT(*) AS n FROM cards GROUP BY creator_id ORDER BY n DESC LIMIT 5`],
  ];
  for (const [label, sql] of qs) {
    const r = await query(ep, token, sql);
    console.log(`--- ${label} ---`);
    for (const row of r.rows) {
      const c = { ...row };
      if (c.db_content) c.db_content = String(c.db_content).slice(0, 80);
      console.log(JSON.stringify(c));
    }
  }
}

main().catch((e) => {
  console.error("PROBE FAILED:", e.message);
  process.exit(1);
});

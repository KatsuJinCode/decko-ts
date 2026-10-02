// probe-two-divergence-mechanisms.mjs — trace the MECHANISM of the two
// live divergences the authed parity sample surfaced, against the trial DB.
//
// (1) /Hello World -> HTTP 404 on the edge while the oracle has a capture.
//     Hypothesis: a stored-key miss (the name->id lookup is by key).
// (2) /RichText -> the oracle walks a `{{+*type+by name|content}}` closure the
//     edge does not render. Hypothesis: the trial DB's RichText db_content
//     differs from the corpus row the oracle captured.
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

async function main() {
  const { url, token } = readCreds(CREDS_PATH);
  const ep = pipelineEndpoint(url);

  console.log("=== (1) Hello World — is there a row, and what key does it carry? ===");
  const hw = await query(ep, token, "SELECT id, name, key, trash, type_id FROM cards WHERE name = 'Hello World' OR key = 'hello_world'");
  console.log(JSON.stringify(hw.rows));
  const hwAny = await query(ep, token, "SELECT id, name, key, trash FROM cards WHERE name LIKE '%Hello World%' LIMIT 5");
  console.log("LIKE '%Hello World%':", JSON.stringify(hwAny.rows));

  console.log("\n=== (2) RichText — db_content vs what the oracle captured ===");
  const rt = await query(ep, token, "SELECT id, name, key, type_id, length(db_content) AS content_len, db_content FROM cards WHERE name='RichText'");
  for (const r of rt.rows) {
    console.log(`id=${r.id} name=${r.name} key=${r.key} type_id=${r.type_id} content_len=${r.content_len}`);
    console.log("db_content:", JSON.stringify(r.db_content));
  }

  console.log("\n=== (2b) the +*type+by name closure the oracle renders ===");
  const closure = await query(ep, token, "SELECT id, name, key, length(db_content) AS n FROM cards WHERE name LIKE '%*type+by name%' OR key LIKE '%*type+by_name%' LIMIT 5");
  console.log(JSON.stringify(closure.rows));

  console.log("\n=== (3) the probe holder's key (post-correction) + the union of null-named rows ===");
  const probe = await query(ep, token, "SELECT id, name, key, type_id, trash FROM cards WHERE id BETWEEN 53070 AND 53075 ORDER BY id");
  console.log(JSON.stringify(probe.rows));

  console.log("\n=== (4) deck-wide key sanity: how many named rows have key = derived? ===");
  const named = await query(ep, token, "SELECT COUNT(*) AS named FROM cards WHERE name IS NOT NULL AND name <> ''");
  const nullkey = await query(ep, token, "SELECT COUNT(*) AS named_null_key FROM cards WHERE name IS NOT NULL AND name <> '' AND key IS NULL");
  const nullname = await query(ep, token, "SELECT COUNT(*) AS null_named FROM cards WHERE name IS NULL OR name=''");
  console.log(JSON.stringify({ named: named.rows[0], nullkey: nullkey.rows[0], nullname: nullname.rows[0] }));

  console.log("\n=== (5) 404 shape check for Hello World: key 'hello_world' exists? ===");
  const byKey = await query(ep, token, "SELECT id, name, key FROM cards WHERE key = 'hello_world'");
  console.log(JSON.stringify(byKey.rows));
}

main().catch((e) => { console.error("PROBE FAILED:", e.message); process.exit(1); });

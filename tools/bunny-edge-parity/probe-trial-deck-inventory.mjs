// probe-trial-deck-inventory.mjs — census the TRIAL edge DB: total cards,
// the account-codename substrate by each name, the Decko Bot / Anonymous /
// Anyone cards, and a sample of card names the parity harness can walk.
//
// WHY: the parity sample needs a reachable URL list, and the account
// question ("what does a user card look like here?") needs the same census.
// One round-trip, read-only.
//
// SECRETS: creds read by key name, bearer only, never printed.

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
  const out = {};

  out.total = (await query(ep, token, "SELECT COUNT(*) AS n FROM cards")).rows[0]?.n;
  out.not_trash = (
    await query(ep, token, "SELECT COUNT(*) AS n FROM cards WHERE trash=0")
  ).rows[0]?.n;
  out.null_name = (
    await query(ep, token, "SELECT COUNT(*) AS n FROM cards WHERE name IS NULL OR name=''")
  ).rows[0]?.n;

  // Every distinct name fragment that looks like account machinery.
  out.codenames = (
    await query(
      ep,
      token,
      `SELECT codename AS codename, COUNT(*) AS n FROM cards
        WHERE codename IS NOT NULL AND codename <> ''
        GROUP BY codename ORDER BY codename`,
    )
  ).rows;

  out.named_cards = (
    await query(
      ep,
      token,
      `SELECT id, name, key, codename, type_id FROM cards
        WHERE name IS NOT NULL AND name <> '' ORDER BY id`,
    )
  ).rows;

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("CENSUS FAILED:", e.message);
  process.exit(1);
});

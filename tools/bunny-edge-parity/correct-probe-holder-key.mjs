// correct-probe-holder-key.mjs — fix the `key` of the row THIS LANE created,
// because the first seed used a hand-rolled key derivation that disagreed with
// the engine's.
//
// THE DEFECT IN THE FIRST SEED, stated exactly: I wrote key
// `authedparityprobe`; the engine derives `authed_parity_probe`. Measured, not
// guessed — DeckoName.parse('AuthedParityProbe').key run through the repo's own
// src/card/name.ts:
//   AuthedParityProbe               -> key "authed_parity_probe"
//   AuthedParityProbe+*account      -> key "authed_parity_probe+*account"
// The read path's name->id lookup is by key (src/card/fetch/lexicon.ts:276-279
// SELECT id FROM cards WHERE key = ? AND trash = 0), so the wrong key made the
// seeded account unreachable by URL: GET /AuthedParityProbe -> HTTP 404
// "card not found: AuthedParityProbe" while the row sat in the DB.
//
// SCOPE: exactly one UPDATE, guarded on BOTH the holder id and the holder name,
// so it cannot touch any other row and cannot run twice against a different
// account. Nothing is DELETEd. No other row changes.
//
// SECRETS: DB creds read by key name, bearer only, never printed.

import { readFileSync } from "node:fs";
import { query, pipelineEndpoint } from "./probe-trial-account-schema.mjs";

// The credentials file location is machine-local and arrives through the
// environment; this script never carries a built-in creds path.
const CREDS_PATH = process.env.BUNNY_CREDS;
const HOLDER_ID = 53070; // printed by seed-throwaway-trial-account.mjs as holder_id
const HOLDER_NAME = "AuthedParityProbe";
const CORRECT_KEY = "authed_parity_probe";

function readCreds(path) {
  const raw = readFileSync(path, "utf8");
  const get = (k) => {
    const m = raw.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, "m"));
    return m ? m[1].trim() : undefined;
  };
  const url = get("BUNNY_TRIAL_DB_URL");
  const token = get("BUNNY_TRIAL_DB_TOKEN");
  if (!url || !token) throw new Error("creds missing BUNNY_TRIAL_DB_URL/TOKEN (rw)");
  return { url, token };
}

async function main() {
  if (!CREDS_PATH) {
    console.error("REFUSAL: set BUNNY_CREDS to the credentials file path (no built-in creds location)");
    process.exit(2);
  }
  const { url, token } = readCreds(CREDS_PATH);
  const ep = pipelineEndpoint(url);

  const before = await query(ep, token, "SELECT id, name, key FROM cards WHERE id = ?", [HOLDER_ID]);
  const row = before.rows[0];
  if (!row) throw new Error(`no row with id ${HOLDER_ID}; refusing to update`);
  if (row.name !== HOLDER_NAME) {
    throw new Error(`row ${HOLDER_ID} is named ${JSON.stringify(row.name)}, not the probe holder; refusing`);
  }

  const upd = await query(ep, token, "UPDATE cards SET key = ? WHERE id = ? AND name = ?", [
    CORRECT_KEY,
    HOLDER_ID,
    HOLDER_NAME,
  ]);

  const after = await query(ep, token, "SELECT id, name, key FROM cards WHERE id = ?", [HOLDER_ID]);
  console.log(
    JSON.stringify(
      {
        holder_id: HOLDER_ID,
        key_before: row.key,
        key_after: after.rows[0]?.key,
        rows_changed: upd.affected,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("CORRECTION FAILED:", e.message);
  process.exit(1);
});

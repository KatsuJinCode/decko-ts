// seed-throwaway-trial-account.mjs — create ONE throwaway account on the
// TRIAL edge database so signed-in parity can be measured at all.
//
// WHY IT EXISTS (measured, not assumed):
//   The deployed edge's write surface is DISARMED — POST /update/*signin and
//   POST /_signin both answer 403 {"error":"forbidden: this edge deploy is
//   read-only"} — so the ask's first option ("create the
//   account via the deployed write path") needs a gate re-arming whose last
//   live arming exposed the write surface for 2-3 minutes
//   (edge-redeploy-lane.md:145-152). The ask's second option ("seed one via
//   the trial DB with the RO/rw creds pattern the earlier lanes used") is the
//   path taken here.
//
// WHAT IT WRITES — six card rows + one session row, nothing else:
//   holder  : named Person-typed card "AuthedParityProbe"
//   junction: (name NULL, key NULL) left=holder  right=*account(codename)
//   fields  : (name NULL, key NULL) left=JUNCTION right=<field codename>:
//             +*email    content = the probe email
//             +*password content = sha1(salt--password--)   [signin.ts:88]
//             +*salt     content = the probe salt
//             +*status   content = 'active'
//   session : auth_sessions(token_hash=sha256(raw), account_card_id=holder.id)
//
//   The field/junction shape (name+key NULL, left=junction) is the corpus's
//   own, taken from deploy/migrations/0004-demo-account-substrate.sql:246-302
//   — its +*email row is `left_id 1140` (the junction) and right_id 1122 (the
//   email codename card). It is also what the engine's own auth SQL demands:
//   signin.ts:296 `JOIN cards e ON e.left_id = a.id` (a = junction) and
//   signin.ts:177 `WHERE left_id = ? AND right_id = ?` with junctionId.
//
// SAFETY: refuses to run if any row already carries the probe's holder name
// or its key — so it can never modify an existing account. Every write is a
// single INSERT; nothing is UPDATEd or DELETEd. The raw token is printed
// because the harness must present it as a cookie; it is a token this session
// just minted for an account this session just created.
//
// SECRETS: DB creds read by key name, bearer only, never printed.

import { readFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { query, pipelineEndpoint } from "./probe-trial-account-schema.mjs";

const CREDS_PATH = "C:/localProjects/brandonDojoTech/library/data/creds";
export const HOLDER_NAME = "AuthedParityProbe";
const HOLDER_KEY = "authedparityprobe";
const EMAIL = "authed-parity-probe@riley-dojo.invalid";
const PASSWORD = "AuthedParityProbe-PW-1";
const SALT = "b7f3c1a90d2e4865";
const TTL_SECONDS = 24 * 60 * 60;
const STAMP = "2026-10-02 00:00:00.000";

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

const sha1 = (s) => createHash("sha1").update(s, "utf8").digest("hex");
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const sqlDateTime = (d) => d.toISOString().replace("T", " ").slice(0, 19);

async function main() {
  const { url, token } = readCreds(CREDS_PATH);
  const ep = pipelineEndpoint(url);
  const log = {};

  // --- deck facts the row shape needs ------------------------------------
  const codenameRows = await query(
    ep,
    token,
    "SELECT codename, id FROM cards WHERE codename IN ('account','email','password','salt','status','decko_bot','anonymous') AND trash=0 ORDER BY id",
  );
  const ids = Object.fromEntries(codenameRows.rows.map((r) => [r.codename, Number(r.id)]));
  for (const need of ["account", "email", "password", "salt", "status"]) {
    if (!ids[need]) throw new Error(`deck has no '${need}' codename card; account system absent`);
  }
  log.codename_ids = ids;

  // The system actor that authored every corpus row (creator_id distribution
  // over the trial deck: id 1 authored 5,139 rows, id 393 authored 15,019).
  const bot = await query(ep, token, "SELECT id FROM cards WHERE name='Decko Bot 1' LIMIT 1");
  const botId = bot.rows[0] ? Number(bot.rows[0].id) : 1;
  // Basic type = the deck's RichText card (the corpus's own `basic` codename
  // row; the 0004 migration types every account row 1102 = RichText).
  const basic = await query(ep, token, "SELECT id FROM cards WHERE codename='basic' LIMIT 1");
  const basicType = basic.rows[0] ? Number(basic.rows[0].id) : 3;
  const person = await query(ep, token, "SELECT id FROM cards WHERE codename='user' OR name='Person' LIMIT 1");
  const personType = person.rows[0] ? Number(person.rows[0].id) : 4;
  log.deck_ids = { decko_bot: botId, basic_type: basicType, person_type: personType };

  // --- idempotence guard: never touch an existing account ----------------
  const clash = await query(
    ep,
    token,
    "SELECT id, name FROM cards WHERE name = ? OR key = ? OR name LIKE ? OR key LIKE ?",
    [HOLDER_NAME, HOLDER_KEY, `${HOLDER_NAME}+*%`, `${HOLDER_KEY}+*%`],
  );
  if (clash.rows.length > 0) {
    console.error(
      `REFUSING TO SEED: ${clash.rows.length} row(s) already match the probe holder. ` +
        `The ask forbids modifying an existing account. Rows: ${JSON.stringify(clash.rows)}`,
    );
    process.exit(2);
  }

  // --- holder -------------------------------------------------------------
  const holder = await query(
    ep,
    token,
    `INSERT INTO cards (name, key, codename, left_id, right_id, current_revision_id,
                        created_at, updated_at, creator_id, updater_id,
                        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?, '')`,
    [HOLDER_NAME, HOLDER_KEY, STAMP, STAMP, botId, botId, personType],
  );
  const holderId = holder.lastInsertRowid;
  if (!Number.isInteger(holderId)) throw new Error(`holder insert returned no id: ${JSON.stringify(holder)}`);
  log.holder_id = holderId;

  // --- junction -----------------------------------------------------------
  const junction = await query(
    ep,
    token,
    `INSERT INTO cards (name, key, codename, left_id, right_id, current_revision_id,
                        created_at, updated_at, creator_id, updater_id,
                        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (NULL, NULL, NULL, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?, NULL)`,
    [holderId, ids.account, STAMP, STAMP, botId, botId, basicType],
  );
  const junctionId = junction.lastInsertRowid;
  if (!Number.isInteger(junctionId)) throw new Error("junction insert returned no id");
  log.junction_id = junctionId;

  // --- fields (left_id = JUNCTION, per signin.ts:177 and the 0004 row) ----
  const field = async (codename, content) => {
    const r = await query(
      ep,
      token,
      `INSERT INTO cards (name, key, codename, left_id, right_id, current_revision_id,
                          created_at, updated_at, creator_id, updater_id,
                          read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
       VALUES (NULL, NULL, NULL, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?, ?)`,
      [junctionId, ids[codename], STAMP, STAMP, botId, botId, basicType, content],
    );
    const id = r.lastInsertRowid;
    if (!Number.isInteger(id)) throw new Error(`${codename} insert returned no id`);
    log[`${codename}_id`] = id;
    return id;
  };
  await field("email", EMAIL);
  await field("salt", SALT);
  await field("password", sha1(`${SALT}--${PASSWORD}--`));
  await field("status", "active");

  // --- session row: sha256 digest only ------------------------------------
  const rawToken = randomBytes(32).toString("hex");
  const created = new Date();
  const expires = new Date(created.getTime() + TTL_SECONDS * 1000);
  await query(
    ep,
    token,
    "INSERT INTO auth_sessions (token_hash, account_card_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    [sha256(rawToken), holderId, sqlDateTime(created), sqlDateTime(expires)],
  );
  log.session_created_at = sqlDateTime(created);
  log.session_expires_at = sqlDateTime(expires);

  // --- readback proof: the engine's own SQL, run live --------------------
  const j = await query(
    ep,
    token,
    `SELECT a.id, a.left_id, h.name AS holder_name
       FROM cards a
       JOIN cards e ON e.left_id = a.id AND e.right_id = ? AND e.trash = 0
       JOIN cards h ON h.id = a.left_id
      WHERE a.right_id = ? AND a.trash = 0 AND e.db_content = ?
      ORDER BY a.id LIMIT 1`,
    [ids.email, ids.account, EMAIL.toLowerCase()],
  );
  log.find_account_by_email_resolves = j.rows[0]
    ? { id: Number(j.rows[0].id), holder_name: j.rows[0].holder_name }
    : null;
  const status = await query(
    ep,
    token,
    "SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash=0 LIMIT 1",
    [junctionId, ids.status],
  );
  log.status_content = status.rows[0]?.db_content ?? null;
  const stored = await query(
    ep,
    token,
    "SELECT db_content FROM cards WHERE left_id = ? AND right_id = ? AND trash=0 LIMIT 1",
    [junctionId, ids.password],
  );
  log.stored_digest_matches_engine_formula = stored.rows[0]?.db_content === sha1(`${SALT}--${PASSWORD}--`);
  const sess = await query(ep, token, "SELECT account_card_id, expires_at FROM auth_sessions WHERE token_hash = ?", [
    sha256(rawToken),
  ]);
  log.session_row_present = sess.rows.length === 1;
  log.session_joins_live_account = sess.rows.length === 1 && Number(sess.rows[0].account_card_id) === holderId;

  console.log(JSON.stringify({ ...log, HOLDER_NAME, EMAIL, PASSWORD, SALT, rawToken }, null, 2));
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});

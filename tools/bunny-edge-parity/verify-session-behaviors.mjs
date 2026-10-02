// verify-session-behaviors.mjs — the ask's step (3), three checks, each with
// its own positive/negative control so "the cookie did nothing" is
// distinguishable from "the session was never real".
//
// (A) THE SESSION IS REAL. Resolve the seeded token through the ENGINE'S OWN
//     SessionStore.lookupSession SQL against the live trial DB. If this
//     returns the probe actor, then "the edge ignored the cookie" is a
//     read-path property, not a bad credential.
//
// (B) THE COOKIE IS IGNORED — negative control. The SAME URL fetched with the
//     VALID cookie, with a DELIBERATELY BOGUS 64-hex cookie, and with NO
//     cookie. Three byte-compare bodies. If all three are identical, the read
//     path cannot be distinguishing sessions at all.
//
// (C) DENIED CARDS STILL DENY WHEN AUTHED. The ask's third session behavior.
//     Fetch the deck's known-denied card anon and authed, and assert the
//     denial marker is present in BOTH, and that the two bodies are equal.
//
// REQUEST BUDGET: 6 GETs. Running total this lane: 129 + 6 = 135.
//
// SECRETS: creds read by key name, bearer only, never printed. The session
// token is only ever sent as a Cookie header.

import { readFileSync, writeFileSync } from "node:fs";
import { query, pipelineEndpoint } from "./probe-trial-account-schema.mjs";
import { createHash } from "node:crypto";

const EDGE = "https://decko-edge-wm2um.bunny.run";
const RELEASE_ID = 1125468;
const CREDS_PATH = "C:/localProjects/brandonDojoTech/library/data/creds";
const SEED_OUT = new URL("./throwaway-account-seed-output.json", import.meta.url);
const OUT = new URL("./session-behavior-checks.json", import.meta.url);

const SLOT_ID = /data-slot-id=(["'])[0-9a-fA-F]+\1/g;
const normalize = (s) => s.replace(SLOT_ID, 'data-slot-id="RANDOMIZED"');
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

function readCreds(path) {
  const raw = readFileSync(path, "utf8");
  const get = (k) => {
    const m = raw.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, "m"));
    return m ? m[1].trim() : undefined;
  };
  return { url: get("BUNNY_TRIAL_DB_URL"), token: get("BUNNY_TRIAL_DB_TOKEN") };
}

async function get(path, cookie) {
  const res = await fetch(EDGE + encodeURI(path), {
    headers: cookie === null ? {} : { Cookie: cookie },
    redirect: "manual",
  });
  const headers = {};
  for (const [k, v] of res.headers) headers[k] = v;
  return { status: res.status, body: await res.text(), headers };
}

const DENIAL_MARKER = /class="denied">\s*(<!--[^>]*-->[^<]*)?/;

async function main() {
  const seed = JSON.parse(readFileSync(SEED_OUT, "utf8"));
  const { url, token } = readCreds(CREDS_PATH);
  const ep = pipelineEndpoint(url);
  const out = { target: EDGE, release_id: RELEASE_ID, script_id: 93646, account: "trial", sampled_at: new Date().toISOString() };

  // ---- (A) positive control: is the session row real to the engine? -----
  // The exact lookup SessionStore.lookupSession runs (src/card/auth/session-store.ts:140-149).
  const valid = seed.rawToken;
  const bogus = "f".repeat(64); // same shape, no matching row
  const lookup = async (raw) =>
    (
      await query(
        ep,
        token,
        `SELECT s.token_hash, s.account_card_id, s.expires_at, c.name
           FROM auth_sessions s JOIN cards c ON c.id = s.account_card_id
          WHERE s.token_hash = ?`,
        [sha256(raw)],
      )
    ).rows;
  const validRows = await lookup(valid);
  const bogusRows = await lookup(bogus);
  const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);
  out.A_session_is_real = {
    engine_sql: "src/card/auth/session-store.ts:140-149 (SessionStore.lookupSession)",
    valid_token_resolves_to_actor: validRows[0]?.name ?? null,
    valid_token_account_card_id: validRows[0] ? Number(validRows[0].account_card_id) : null,
    valid_token_digest_matches: validRows.length === 1 && validRows[0].token_hash === sha256(valid),
    not_expired: validRows[0] ? nowStr <= validRows[0].expires_at : null,
    expires_at: validRows[0]?.expires_at ?? null,
    negative_control_bogus_token_rows: bogusRows.length,
    verdict:
      validRows.length === 1 && validRows[0].name === seed.HOLDER_NAME
        ? "PASS — the session resolves to the seeded account through the engine's own SQL"
        : "FAIL — the session does not resolve; an authed measurement would be meaningless",
  };

  // ---- (B) does the read path consume the cookie at all? ----------------
  const anon = await get("/Home", null);
  const authed = await get("/Home", cookieName(valid));
  const bogusAuthed = await get("/Home", cookieName(bogus));
  const anonN = normalize(anon.body), authN = normalize(authed.body), bogusN = normalize(bogusAuthed.body);
  out.B_cookie_is_ignored = {
    url: "/Home",
    anon_status: anon.status, authed_status: authed.status, bogus_status: bogusAuthed.status,
    anon_bytes: anon.body.length, authed_bytes: authed.body.length, bogus_bytes: bogusAuthed.body.length,
    anon_equals_authed: anonN === authN,
    anon_equals_bogus_authed: anonN === bogusN,
    authed_set_cookie: authed.headers["set-cookie"] ?? null,
    anon_set_cookie: anon.headers["set-cookie"] ?? null,
    response_header_keys_anonymous: Object.keys(anon.headers).sort(),
    response_header_keys_authed: Object.keys(authed.headers).sort(),
    nav_anonymous: (/<div class="nav">[\s\S]*?<\/div>/.exec(anonN) ?? [null])[0],
    nav_authed: (/<div class="nav">[\s\S]*?<\/div>/.exec(authN) ?? [null])[0],
    verdict:
      anonN === authN && anonN === bogusN
        ? "MEASURED — a VALID session cookie and a BOGUS cookie of the same shape both return the anonymous bytes; the read path does not read the cookie"
        : "the read path distinguishes the cookies; investigate",
  };

  // ---- (C) denied cards still deny when authed --------------------------
  const deniedAnon = await get("/Taking Stock", null);
  const deniedAuthed = await get("/Taking Stock", cookieName(valid));
  const deniedAnonN = normalize(deniedAnon.body), deniedAuthedN = normalize(deniedAuthed.body);
  out.C_denied_still_denies_authed = {
    url: "/Taking Stock",
    anon_status: deniedAnon.status, authed_status: deniedAuthed.status,
    denial_marker_present_anonymous: DENIAL_MARKER.test(deniedAnonN),
    denial_marker_present_authed: DENIAL_MARKER.test(deniedAuthedN),
    denial_text: (DENIAL_MARKER.exec(deniedAuthedN) ?? [null])[0],
    anon_bytes_identical_to_authed: deniedAnonN === deniedAuthedN,
    api_json_gate: await (async () => {
      const r = await get("/api/card/Taking Stock", cookieName(valid));
      return { status: r.status, body: r.body };
    })(),
    verdict:
      DENIAL_MARKER.test(deniedAnonN) && DENIAL_MARKER.test(deniedAuthedN) && deniedAnonN === deniedAuthedN
        ? "PASS — the denial renders identically anon and authed; the stored read rule still denies"
        : "the denial did NOT hold under authed",
  };

  out.requests_issued_this_stage = 6;
  out.cumulative_requests_this_lane = 157;
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

function cookieName(raw) {
  return `decko_ts_session=${raw}`;
}

main().catch((e) => { console.error("BATTERY FAILED:", e.stack ?? e.message); process.exit(1); });

// ts-drive.mjs -- drive the TypeScript engine with the shared operation list
// (scenarios.json) against a LOCAL COPY of the start deck the Ruby drive
// wrote, and emit the same JSON trace shape as ruby/drive.rb.
//
//   node ts-drive.mjs <start-deck.sqlite3> <work_dir> > ts.json
//
// Writes go through the serving write surface (handleWriteRequest), the
// same entry point the HTTP hosts call. Reads (GET) have no in-process
// equivalent of the host's render surface here, so a GET is answered from
// the fetch layer: 200 when the card resolves, 404 when it does not. Mail
// goes to a capture transport; nothing is delivered. Files land in
// <work_dir>/files.

import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = (p) => new URL(`../../dist/src/${p}`, import.meta.url).href;

const { LocalSqliteDriver } = await import(dist("server/drivers/local-sqlite.js"));
const { handleWriteRequest, readSessionCookie } = await import(dist("server/write-routes.js"));
const { applyDeckInflections } = await import(dist("card/name/inflect.js"));
const { ORACLE_DECK_INFLECTIONS } = await import(dist("card/name/oracle-deck-inflections.js"));
const { FetchEngine } = await import(dist("card/fetch.js"));
const { registerSqliteRegexpFunction } = await import(dist("cql/sqlite-regexp.js"));
const { SessionStore } = await import(dist("card/auth/session-store.js"));
const { LocalAttachmentStore } = await import(dist("card/attachments/attachment-store.js"));
const { CaptureTransport } = await import(dist("card/notify/transport.js"));
const { DeckoName } = await import(dist("card/name.js"));

const START = process.argv[2];
const WORK = process.argv[3];
mkdirSync(WORK, { recursive: true });
const DB = join(WORK, "ts-deck.sqlite3");
copyFileSync(START, DB);
const FILES = join(WORK, "files");
rmSync(FILES, { recursive: true, force: true });
mkdirSync(FILES, { recursive: true });

applyDeckInflections(ORACLE_DECK_INFLECTIONS);
const driver = new LocalSqliteDriver({ path: DB, readonly: false });
try { registerSqliteRegexpFunction(driver); } catch { /* already registered */ }

// The port's own session table (db/migrations/001-auth-sessions.sql) is not
// in the Ruby schema; apply its DDL to the local copy.
await driver.query(
  `CREATE TABLE IF NOT EXISTS "auth_sessions" (
     "token_hash" TEXT NOT NULL PRIMARY KEY,
     "account_card_id" INTEGER NOT NULL,
     "created_at" TEXT NOT NULL,
     "expires_at" TEXT NOT NULL)`, []);
await driver.query(
  `CREATE INDEX IF NOT EXISTS "index_auth_sessions_on_account_card_id"
     ON "auth_sessions" ("account_card_id")`, []);

const fetcher = new FetchEngine(driver);
const sessions = new SessionStore({ driver });
const attachmentStore = new LocalAttachmentStore(FILES);
const transport = new CaptureTransport();
const FROZEN = new Date("2026-10-07T12:00:00.000Z");
const titleRow = await driver.query("select db_content from cards where codename = 'title' and trash = 0", []);
const botEmail = await driver.query(
  "select e.db_content as email from cards e join cards a on a.id = e.left_id join cards b on b.id = a.left_id " +
  "where b.codename = 'decko_bot' and a.right_id = (select id from cards where codename = 'account') " +
  "and e.right_id = (select id from cards where codename = 'email') and e.trash = 0", []);
const accountMail = {
  transport,
  token: { secret: "parity-harness-local-secret", now: () => Math.floor(FROZEN.getTime() / 1000) },
  origin: "http://127.0.0.1",
  siteTitle: String(titleRow.rows[0]?.db_content ?? ""),
  // The deck copy has no Decko Bot+*account+*email row; Ruby then sends from
  // the account mod's seeded bot address (card-mod-account data/real.yml:205).
  deckoBotEmail: String(botEmail.rows[0]?.email ?? "no-reply@decko.org"),
};

const TABLES = ["cards", "card_acts", "card_actions", "card_changes", "card_references",
  "card_revisions", "sessions", "users", "delayed_jobs", "auth_sessions"];

async function counts() {
  const out = {};
  for (const t of TABLES) {
    try {
      const r = await driver.query(`select count(*) as n from ${t}`, []);
      out[t] = Number(r.rows[0]?.n ?? 0);
    } catch { out[t] = 0; }
  }
  return out;
}

async function maxActionId() {
  const r = await driver.query("select coalesce(max(id),0) as m from card_actions", []);
  return Number(r.rows[0].m);
}

async function fullName(id) {
  if (id === null || id === undefined) return null;
  const r = await driver.query("select name, left_id, right_id from cards where id = ?", [id]);
  const row = r.rows[0];
  if (row === undefined) return `?${id}`;
  if (row.name !== null && row.name !== "") return row.name;
  return `${await fullName(row.left_id)}+${await fullName(row.right_id)}`;
}

const ACTION_TYPES = ["create", "update", "delete"];
async function newActions(since) {
  const r = await driver.query(
    "select id, card_id, action_type from card_actions where id > ? order by id", [since]);
  const out = [];
  for (const a of r.rows) {
    const f = await driver.query(
      "select field from card_changes where card_action_id = ? order by id", [a.id]);
    out.push({
      card: await fullName(a.card_id),
      type: ACTION_TYPES[Number(a.action_type)] ?? String(a.action_type),
      fields: f.rows.map((x) => Number(x.field)),
    });
  }
  return out;
}

function filesList() {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push({ path: relative(FILES, p).replace(/\\/g, "/"), size: statSync(p).size });
    }
  };
  walk(FILES);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// ---- request encoding: the nested params hash -> Rails bracket keys.
function flatten(value, prefix, out) {
  if (value !== null && typeof value === "object" && !("upload" in value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.push([prefix, value]);
  }
  return out;
}

function encode(params) {
  const pairs = flatten(params ?? {}, "", []);
  const uploads = pairs.filter(([, v]) => v !== null && typeof v === "object");
  if (uploads.length === 0) {
    const body = new URLSearchParams(pairs.map(([k, v]) => [k, String(v)])).toString();
    return { contentType: "application/x-www-form-urlencoded", body, bodyBytes: undefined };
  }
  const boundary = "----parityBoundary7MA4YWxkTrZu0gW";
  const chunks = [];
  for (const [k, v] of pairs) {
    if (v !== null && typeof v === "object") {
      const bytes = readFileSync(join(here, "fixtures", v.upload));
      chunks.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"; filename="${v.upload}"\r\n` +
        `Content-Type: ${v.mime}\r\n\r\n`));
      chunks.push(bytes);
      chunks.push(Buffer.from("\r\n"));
    } else {
      chunks.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${String(v)}\r\n`));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const bodyBytes = new Uint8Array(Buffer.concat(chunks));
  return { contentType: `multipart/form-data; boundary=${boundary}`, body: "", bodyBytes };
}

let cookie = null;
let mailConsumed = 0;
let events = [];

async function read(path) {
  const mark = decodeURIComponent(path.replace(/^\//, "")).replace(/\.json$/i, "").replace(/_/g, " ");
  if (mark === "") return { status: 200, headers: {}, body: "" };
  const rec = await fetcher.fetchByKey(DeckoName.parse(mark).key);
  return rec === undefined || rec.trash
    ? { status: 404, headers: {}, body: "" }
    : { status: 200, headers: {}, body: "" };
}

async function call(method, path, params) {
  if (method === "get") return read(path);
  const enc = encode(params);
  const headers = { host: "127.0.0.1", "content-type": enc.contentType };
  if (cookie) headers.cookie = cookie;
  const res = await handleWriteRequest(
    {
      driver, fetcher, now: () => FROZEN, attachmentStore, accountMail,
      onModEventReport: (r) => { for (const e of r.fired) events.push([r.stage, e]); },
    },
    { method: method.toUpperCase(), pathname: path, host: "127.0.0.1", scheme: "http",
      headers, body: enc.body, bodyBytes: enc.bodyBytes });
  if (res === null) return { status: 404, headers: {}, body: "(no write route)" };
  const sc = res.headers?.["Set-Cookie"];
  if (typeof sc === "string") {
    const token = readSessionCookie(sc.split(";")[0]);
    cookie = token ? sc.split(";")[0] : null;
  }
  return res;
}

async function signedInAs() {
  const token = cookie ? readSessionCookie(cookie) : null;
  if (!token) return null;
  const actor = await sessions.lookupSession(token);
  return actor?.name ?? null;
}

const scenarios = JSON.parse(readFileSync(join(here, "scenarios.json"), "utf8"));
const steps = [];
for (const s of scenarios.steps) {
  const before = await counts();
  const since = await maxActionId();
  const filesBefore = filesList().map((f) => f.path);
  events = [];
  let res = { status: null, headers: {}, body: "" };
  let extra = null;
  try {
    res = await call(s.method, s.path, s.params);
  } catch (e) {
    extra = { raised: e?.constructor?.name, error: String(e?.message ?? e).slice(0, 300),
      stack: String(e?.stack ?? "").split("\n").slice(1, 6).join(" | ") };
  }
  const after = await counts();
  const delta = {};
  for (const k of Object.keys(after)) delta[k] = after[k] - before[k];
  const all = transport.captured();
  const mail = all.slice(mailConsumed);
  mailConsumed = all.length;
  steps.push({
    step: s.name, status: res.status, headers: res.headers ?? {}, body: String(res.body ?? ""),
    delta, actions: await newActions(since), events,
    files: filesList().filter((f) => !filesBefore.includes(f.path)),
    mail: mail.map((m) => ({
      to: [].concat(m.to ?? []), from: [].concat(m.from ?? []), subject: String(m.subject ?? ""),
      body_excerpt: String(m.textBody ?? m.text ?? "").slice(0, 600),
    })),
    extra, signed_in_as: await signedInAs(),
  });
}
console.log(JSON.stringify({ engine: "decko-ts", steps }, null, 2));

// ts-drive.mjs -- drive the TypeScript engine with the shared operation list
// (scenarios.json) against a LOCAL COPY of the start deck the Ruby drive
// wrote, and emit the same JSON trace shape as ruby/drive.rb.
//
//   node ts-drive.mjs <start-deck.sqlite3> <work_dir> > ts.json
//
// SCSS compiles (the skin asset inputs and the site stylesheet) run through
// LibSass, the compiler the Ruby oracle uses, built by
// tools/libsass/build-native.mjs; PARITY_SASSC overrides the program path.
//
// Writes go through the serving write surface (handleWriteRequest), the
// same entry point the HTTP hosts call. Reads (GET) have no in-process
// equivalent of the host's render surface here, so a GET is answered from
// the fetch layer: 200 when the card resolves, 404 when it does not. Mail
// goes to a capture transport; nothing is delivered. Files land in
// <work_dir>/files.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";

// ---- network block: no outgoing connection of any kind. Every socket
// connect, DNS lookup and fetch is refused before it leaves the process;
// each refusal is recorded, reported in the trace (`network_blocked`), and
// fails the run.
const networkBlocked = [];
const refuse = (what, target) => {
  networkBlocked.push(`${what} ${target}`);
  throw new Error(`parity harness: outgoing network blocked (${what} ${target})`);
};
net.Socket.prototype.connect = function (...a) {
  const o = a[0];
  return refuse("net.connect", typeof o === "object" ? `${o?.host ?? o?.path ?? ""}:${o?.port ?? ""}` : String(o));
};
tls.connect = (...a) => refuse("tls.connect", JSON.stringify(a[0] ?? ""));
dns.lookup = (host) => refuse("dns.lookup", String(host));
dns.promises.lookup = async (host) => refuse("dns.lookup", String(host));
dns.resolve = (host) => refuse("dns.resolve", String(host));
dgram.Socket.prototype.send = function () { return refuse("dgram.send", ""); };
globalThis.fetch = async (input) => refuse("fetch", String(input?.url ?? input));
globalThis.WebSocket = class { constructor(u) { refuse("WebSocket", String(u)); } };

const here = dirname(fileURLToPath(import.meta.url));
const dist = (p) => new URL(`../../dist/src/${p}`, import.meta.url).href;

const { LocalSqliteDriver } = await import(dist("server/drivers/local-sqlite.js"));
const { handleWriteRequest, readSessionCookie } = await import(dist("server/write-routes.js"));
const { applyDeckInflections } = await import(dist("card/name/inflect.js"));
const { CARD_GEM_INITIALIZER_INFLECTIONS } = await import(dist("card/name/oracle-deck-inflections.js"));
const { FetchEngine } = await import(dist("card/fetch.js"));
const { registerSqliteRegexpFunction } = await import(dist("cql/sqlite-regexp.js"));
const { SessionStore } = await import(dist("card/auth/session-store.js"));
const { LocalAttachmentStore } = await import(dist("card/attachments/attachment-store.js"));
const { CaptureTransport } = await import(dist("card/notify/transport.js"));
const { DeckoName } = await import(dist("card/name.js"));
const { pageViewCookie, readVisitorSession, VISITOR_COOKIE_NAME } = await import(dist("card/session/visitor-session.js"));
// A GET renders the page (ruby drive.rb renders the card for every read;
// a 200 with an empty body compared nothing). The render engine reads through
// the same driver and attachment store the writes use, so a page that builds
// and stores its asset inputs writes through them exactly as Ruby does.
const { defaultDeckLoader } = await import(dist("card/mod-loader/default-mod-deck.js"));
const { RenderEngine } = await import(dist("card/render.js"));
const { CardActionEngine } = await import(dist("card/actions/card-action-engine.js"));
const { renderPageBytes } = await import(dist("card/render/page.js"));
const { libsassProcessCompiler } = await import(dist("server/libsass-process.js"));
const { coffeeNpmCompiler } = await import(dist("server/coffee-npm-compiler.js"));

const SASSC = process.env.PARITY_SASSC ??
  join(here, "..", "libsass", "build", process.platform === "win32" ? "sassc-stdin.exe" : "sassc-stdin");
if (!existsSync(SASSC)) {
  console.error(`LibSass program not found at ${SASSC}; build it with tools/libsass/build-native.mjs`);
  process.exit(2);
}
const scssCompiler = libsassProcessCompiler(SASSC);
const coffeeCompiler = coffeeNpmCompiler();

const START = process.argv[2];
const WORK = process.argv[3];
mkdirSync(WORK, { recursive: true });
const DB = join(WORK, "ts-deck.sqlite3");
copyFileSync(START, DB);
const FILES = join(WORK, "files");
rmSync(FILES, { recursive: true, force: true });
mkdirSync(FILES, { recursive: true });

applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
const driver = new LocalSqliteDriver({ path: DB, readonly: false });
try { registerSqliteRegexpFunction(driver); } catch { /* already registered */ }
// PARITY_TIMING=1: count the statements each GET runs against the driver and
// report them with its wall time on stderr (the trace on stdout is unchanged).
let statementCount = 0;
if (process.env.PARITY_TIMING === "1") {
  const query = driver.query.bind(driver);
  driver.query = (...args) => {
    statementCount += 1;
    return query(...args);
  };
}

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
// Same for the render engine's committed-write stamp (db/schema.sqlite.sql
// deck_data_version, the ENGINE-FRESHNESS table): a Ruby-built deck has no
// such table, and the render path reads it once per request. One row at
// version 0 — the fixture's own data is already what it is; no write here
// bumps it, and the after-triggers that bump it on INSERT/UPDATE of cards
// and card_references are the port's schema, not this copy's.
await driver.query(
  `CREATE TABLE IF NOT EXISTS "deck_data_version" (
     "id"      INTEGER PRIMARY KEY CHECK ("id" = 1),
     "version" INTEGER NOT NULL DEFAULT 0)`, []);
await driver.query(`INSERT OR IGNORE INTO "deck_data_version" ("id", "version") VALUES (1, 0)`, []);

// The freshness stamp (db/schema.sqlite.sql:305-309, [ENGINE-FRESHNESS]) is
// also not in the Ruby-built fixture deck: Ruby has no such table, and the
// deck predates it. The RENDER path reads it (render/boot-cache.ts:58,
// render.ts:282) and refuses to render without it — loudly, by design
// (boot-cache.ts:42). Only the local copy is touched; the committed fixture
// is never written. Bumped by the write path as it commits, so the preview
// render sees the draft rows this run just stored.
await driver.query(
  `CREATE TABLE IF NOT EXISTS "deck_data_version" (
     "id" INTEGER NOT NULL PRIMARY KEY,
     "version" INTEGER NOT NULL)`, []);
await driver.query(`INSERT OR IGNORE INTO "deck_data_version" ("id","version") VALUES (1, 0)`, []);

const fetcher = new FetchEngine(driver);
const sessions = new SessionStore({ driver });
const attachmentStore = new LocalAttachmentStore(FILES);
const transport = new CaptureTransport();
// The render engine, for GETs. defaultDeckLoader() must run BEFORE the first
// RenderEngine is constructed: the constructor reads the process-wide default
// loader (the harness adapter's note, reference-harness/adapters/ts/adapter.ts:108-124).
defaultDeckLoader();
const renderEngine = new RenderEngine(fetcher);
// The read path's asset refresh, as Ruby's request setup runs it
// (CardController::Rest#setup). It acts as the deck bot, like the server's
// engine does, so it takes no session actor.
const readEngine = new CardActionEngine(fetcher, {
  actor: null,
  // Ruby's clock is the wall clock: each bundle it stores on this request is
  // named by the second it was written, so writes one after another get
  // distinct names. The read path advances the step clock per read, which
  // keeps the names distinct within the request and clear of the next step's.
  // requestClock is declared below; read it at call time.
  now: () => {
    stepSeconds += 1;
    return requestClock();
  },
  ipAddress: "127.0.0.1",
  attachmentStore,
  scssCompiler,
  coffeeCompiler,
});
renderEngine.renderAbsentCards = true;


// The preview_editor render seam (card-mod-carrierwave set/type/file.rb:127-129
// `view :preview_editor, unknown: true, cache: :never`). The two-step upload's
// first step (00_upload_cache.rb:18-24) answers with this view's html, which
// decko.js's doneFile drops into .chosen-file (upload.js.coffee:48-51); the
// write surface requires a host to supply it and REFUSES the request outright
// without it (write-routes.ts:1931-1936), so a drive that omits the seam never
// runs the step at all and its oracle comparison is vacuous.
//
// preview_editor is a SET-SCOPED view, so it needs the deck's mod loader to
// resolve (render.ts#resolveView walks the card's set chain through it). The
// loader is built lazily, on the first preliminary upload, so the 81 steps
// that never render pay nothing for it. It is bound as the process default
// because RenderEngine captures it in its CONSTRUCTOR (render.ts:466) — the
// same reason the render-test storage binds before building its engine.
let deckLoader;
const FROZEN = new Date("2026-10-07T12:00:00.000Z");
// The request clock: the frozen start plus one second per step, so that
// files named by the clock (a history-less card's file is <epoch seconds>
// .<ext>, as the site stylesheet is) are new files in each step, as they are
// on the Ruby side, whose clock runs. Account tokens keep the frozen time.
let stepSeconds = 0;
const requestClock = () => new Date(FROZEN.getTime() + stepSeconds * 1000);
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
  "card_revisions", "card_virtuals", "sessions", "users", "delayed_jobs", "auth_sessions"];

// The card_virtuals rows by id (see ruby/drive.rb virtuals_snapshot): the
// asset-input card's name, the content's length and sha256.
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
async function virtualsSnapshot() {
  const r = await driver.query("select id, left_id, right_id, content from card_virtuals", []);
  const out = new Map();
  for (const row of r.rows) {
    const content = String(row.content ?? "");
    out.set(Number(row.id), {
      card: `${await fullName(row.left_id)}+${await fullName(row.right_id)}`,
      length: content.length, sha256: sha256(content),
    });
  }
  return out;
}
function virtualsDelta(before, after) {
  const changed = [];
  for (const [id, row] of after) {
    const prev = before.get(id);
    if (prev && prev.sha256 === row.sha256) continue;
    changed.push({ ...row, change: prev ? "updated" : "created" });
  }
  for (const [id, row] of before) if (!after.has(id)) changed.push({ ...row, change: "deleted" });
  return changed.sort((a, b) => (a.card === b.card ? a.change.localeCompare(b.change) : a.card < b.card ? -1 : 1));
}

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
      "select field, value from card_changes where card_action_id = ? order by id", [a.id]);
    const stamp = (await driver.query(
      "select creator_id, updater_id, db_content from cards where id = ?", [a.card_id])).rows[0] ?? {};
    out.push({
      card: await fullName(a.card_id),
      type: ACTION_TYPES[Number(a.action_type)] ?? String(a.action_type),
      fields: f.rows.map((x) => Number(x.field)),
      values: f.rows.map((x) => String(x.value ?? "")),
      creator: stamp.creator_id == null ? "" : await fullName(stamp.creator_id),
      updater: stamp.updater_id == null ? "" : await fullName(stamp.updater_id),
      content: String(stamp.db_content ?? "").slice(0, 200),
    });
  }
  return out;
}

function filesList() {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      // The tmp partition is the two-step upload's cache
      // (00_upload_cache.rb files_base_dir("tmp")): Ruby's drive keeps that
      // cache outside its files scan (the work dir's cache/ sibling), so the
      // TypeScript side's cache partition is not deck files either.
      if (d === FILES && e.name === "tmp") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const entry = { path: relative(FILES, p).replace(/\\/g, "/"), size: statSync(p).size };
        // small image files carry their bytes for the pixel comparison;
        // other files the sha256 of their bytes
        if (/\.(png|jpe?g|webp|gif)$/i.test(e.name)) {
          if (entry.size <= 1048576) entry.b64 = readFileSync(p).toString("base64");
        } else {
          entry.sha256 = sha256(readFileSync(p));
        }
        out.push(entry);
      }
    }
  };
  walk(FILES);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

// ---- request encoding: the nested params hash -> Rails bracket keys.
function flatten(value, prefix, out) {
  if (Array.isArray(value)) {
    for (const v of value) flatten(v, `${prefix}[]`, out);
  } else if (value !== null && typeof value === "object" && !("upload" in value)) {
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

// The bare address of an RFC 5322 mailbox ("Name" <addr> -> addr), as
// Mail::Message#from reports it on the Ruby side.
const addressOf = (h) => { const m = h.match(/<([^>]+)>/); return (m ? m[1] : h).trim(); };

// The cookie jar: the sign-in cookie and the visitor-session cookie.
const jar = new Map();
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") || undefined;
function storeCookie(setCookie) {
  if (typeof setCookie !== "string") return;
  const pair = setCookie.split(";")[0];
  const eq = pair.indexOf("=");
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (value === "" || /Max-Age=0/i.test(setCookie)) jar.delete(name);
  else jar.set(name, value);
}
let lastRevId = null;
let mailConsumed = 0;
let events = [];

// A GET RENDERS the page through the engine (ruby drive.rb renders the card
// for every read; a 200 with an empty body compared nothing). A page view of
// a known card joins the visitor's location history through the port's
// page-view hook, as the host's page route records it.
//
// The read path is also where Ruby's lazy asset-input refresh runs: a page
// render reaches style: mods (head.rb:62), and reading an inputter whose
// `+*asset input` is blank builds and stores it (asset_inputter.rb:44-49).
// refreshReadAssetInputs is that arm; it is a no-op once the inputs exist.
async function read(path) {
  const t0 = performance.now();
  const s0 = statementCount;
  const reply = await readPage(path);
  if (process.env.PARITY_TIMING === "1") {
    console.error(`GET ${path} status ${reply.status} statements ${statementCount - s0} ms ${(performance.now() - t0).toFixed(1)}`);
  }
  return reply;
}

async function readPage(path) {
  const json = /\.json$/i.test(path);
  const mark = decodeURIComponent(path.replace(/^\//, "")).replace(/\.json$/i, "").replace(/_/g, " ");
  const rec = mark === "" ? { trash: false, codename: "home" } : await fetcher.fetchByKey(DeckoName.parse(mark).key);
  const known = rec !== undefined && !rec.trash;
  storeCookie(pageViewCookie(cookieHeader(), `http://127.0.0.1${path.replace(/ /g, "%20")}`,
    { known, html: !json, ajax: false, codename: rec?.codename ?? null }));
  if (!known) return { status: 404, headers: {}, body: "" };
  const cardName = mark === "" ? "Home" : mark;
  await readEngine.refreshReadAssetInputs();
  const body = await renderPageBytes(renderEngine, cardName);
  return { status: 200, headers: {}, body };
}

// preview_editor html for the two-step upload's first step (the seam the
// write surface requires). Rendered as the ACTING account, with the draft
// rows the request just write visible: the render pass seats the card, and
// the seating is what makes the fetcher re-read those rows instead of a
// cached card record. Same sequence as vm-staging-server.mjs:3506-3519 —
// seat with render, take the seated card, renderView with the request opts.
async function renderPreviewEditor({ name, opts }) {
  const token = jar.has("decko_ts_session") ? readSessionCookie(cookieHeader()) : null;
  const actor = token !== null ? await sessions.lookupSession(token) : undefined;
  // The render engine, not the action engine: preview_editor is a VIEW
  // (set/type/file.rb:127-129), so it is rendered by RenderEngine under the
  // acting account's viewer — the same seat vm-staging-server.mjs:2948 wires
  // per actor, so the preview reads under the requester's read rules.
  const { RenderEngine } = await import(dist("card/render.js"));
  const { RenderFormat } = await import(dist("card/render/format.js"));
  const { defaultDeckLoader } = await import(dist("card/mod-loader/default-mod-deck.js"));
  deckLoader ??= defaultDeckLoader();
  // A render FETCH engine of its own over the same driver: seating the cache
  // card must not seat or expire entries on the drive's shared fetcher, which
  // the GET path answers from (read() above). The draft rows the write just
  // stored are in the database, so this fetcher reads them directly.
  const { FetchEngine: RenderFetch } = await import(dist("card/fetch.js"));
  const engine = new RenderEngine(new RenderFetch(driver));
  engine.modLoader = deckLoader;
  if (actor?.id !== undefined) engine.viewer = { signedIn: true, actorId: actor.id };
  engine.expireRenderCard(name);
  try {
    await engine.render(name, "preview_editor");
  } catch {
    // the seating view's own error posture is the renderView's to raise (or not)
  }
  const previewCard = engine.fetchRenderCard(name);
  if (previewCard === undefined) {
    throw new Error(`ts-drive: preview_editor render could not seat the card: ${name}`);
  }
  return new RenderFormat(previewCard, engine, { nestQuietErrors: true }).renderView("preview_editor", opts);
}

async function call(method, path, params) {
  if (method === "get") return read(path);
  const enc = encode(params);
  const headers = { host: "127.0.0.1", "content-type": enc.contentType };
  const c = cookieHeader();
  if (c) headers.cookie = c;
  const res = await handleWriteRequest(
    {
      driver, fetcher, now: requestClock, attachmentStore, scssCompiler, coffeeCompiler, accountMail, notifyTransport: transport,
      onModEventReport: (r) => { for (const e of r.fired) events.push([r.stage, e]); },
      renderPreviewEditor: (input) => renderPreviewEditor(input),
    },
    { method: method.toUpperCase(), pathname: path, host: "127.0.0.1", scheme: "http",
      headers, body: enc.body, bodyBytes: enc.bodyBytes });
  if (res === null) return { status: 404, headers: {}, body: "(no write route)" };
  storeCookie(res.headers?.["Set-Cookie"]);
  storeCookie(res.visitorCookie);
  return res;
}

async function signedInAs() {
  const token = jar.has("decko_ts_session") ? readSessionCookie(cookieHeader()) : null;
  if (!token) return null;
  const actor = await sessions.lookupSession(token);
  return actor?.name ?? null;
}

const sessionCards = () => readVisitorSession(cookieHeader()).cards;

// Placeholders (see ruby/scenarios.rb): "$rev_id" is the rev_id the
// previous response named; "$create_action:<name>" the first action id
// recorded on that card.
async function resolvePlaceholders(value) {
  if (Array.isArray(value)) return Promise.all(value.map(resolvePlaceholders));
  if (value !== null && typeof value === "object" && !("upload" in value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await resolvePlaceholders(v);
    return out;
  }
  if (value === "$rev_id") {
    if (lastRevId === null) throw new Error("no rev_id in the previous response");
    return lastRevId;
  }
  const idMark = typeof value === "string" ? /^\$id:(.+)$/.exec(value) : null;
  if (idMark) {
    const r = await driver.query("select id from cards where key = ? and trash = 0", [DeckoName.parse(idMark[1]).key]);
    if (r.rows[0]?.id == null) throw new Error(`no card ${idMark[1]}`);
    return `~${r.rows[0].id}`;
  }
  const m = typeof value === "string" ? /^\$create_action:(.+)$/.exec(value) : null;
  if (m) {
    const r = await driver.query(
      "select min(a.id) as id from card_actions a join cards c on c.id = a.card_id where c.key = ?",
      [DeckoName.parse(m[1]).key]);
    if (r.rows[0]?.id == null) throw new Error(`no card ${m[1]}`);
    return String(r.rows[0].id);
  }
  return value;
}

function rememberRevId(res) {
  const loc = String(res.headers?.Location ?? res.headers?.location ?? "");
  const m = /rev_id=(\d+)/.exec(loc) ?? /rev_id(?:%5D|\]|")?[=:]\s*"?(\d+)/.exec(String(res.body ?? ""));
  lastRevId = m ? m[1] : null;
}

const scenarios = JSON.parse(readFileSync(join(here, "scenarios.json"), "utf8"));
// The withheld step set (tools/parity-side-effects/withheld/scenarios.json)
// is NOT part of this public run. It drives the same deck in the same order,
// so running it here would corrupt the shared sequence; it is a standalone
// set with its own recordings, run only after disclosure. A release package
// excludes it, and the repository forbids silent skips, so its absence is
// announced loudly and by name.
const withheldPath = join(here, "withheld", "scenarios.json");
let withheldSteps = [];
try {
  withheldSteps = JSON.parse(readFileSync(withheldPath, "utf8")).steps ?? [];
} catch {
  withheldSteps = [];
}
process.stderr.write(
  `[withheld until disclosure] NOT RUN: ${withheldSteps.length} steps (${withheldPath})\n`,
);
const steps = [];
for (const s of scenarios.steps) {
  stepSeconds++;
  const before = await counts();
  const since = await maxActionId();
  const filesBefore = filesList().map((f) => f.path);
  const virtualsBefore = await virtualsSnapshot();
  events = [];
  let res = { status: null, headers: {}, body: "" };
  let extra = null;
  try {
    res = await call(s.method, s.path, s.params ? await resolvePlaceholders(s.params) : undefined);
    rememberRevId(res);
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
    virtuals: virtualsDelta(virtualsBefore, await virtualsSnapshot()),
    mail: mail.map((m) => ({
      to: String(m.to ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      from: [addressOf(String(m.from ?? ""))], from_header: String(m.from ?? ""),
      reply_to: m.replyTo ? [addressOf(String(m.replyTo))] : [],
      subject: String(m.subject ?? ""),
      text_body: String(m.textBody ?? ""), html_body: String(m.htmlBody ?? ""),
    })),
    extra, signed_in_as: await signedInAs(), session_cards: sessionCards(),
  });
}
console.log(JSON.stringify({ engine: "decko-ts", network_blocked: networkBlocked, steps }, null, 2));
if (networkBlocked.length > 0) {
  console.error(`NETWORK BLOCKED ${networkBlocked.length} attempt(s): ${[...new Set(networkBlocked)].join("; ")}`);
  process.exitCode = 3;
}

// measure-search-box-latency.mjs — p50/p95 for the edge search JSON the
// navbar's typeahead fetches on every keystroke:
// `/*search/search_box_complete.json?term=<prefix>`.
//
// WHAT ACTION THIS PINS. The search box is in the navbar on every page
// (src/card/render/navbar-views.ts:267 renders
// `<input ... data-completepath="/*search/search_box_complete.json">`), and its
// autocomplete fetches one of these per keystroke. `/*search` itself answers
// once per SUBMITTED query; this answers once per CHARACTER typed, so it is
// the highest request-rate action the search flow has.
//
// WHAT IT MEASURES. One request per term over the LOCAL harness stack
// (tools/edge-signed-in-exercise/lib/stack.mjs): a local copy of the deck
// served by lib/local-hrana.mjs, with deploy/dist/bunny-edge-engine.bundle.js
// behind HTTPS. Three independent numbers per request, so a slow number can be
// attributed instead of guessed at:
//
//   wallMs       — the client-observed round trip (what a keystroke waits on)
//   serverTiming — the engine's OWN attribution: auth / seat / db(+stmt) /
//                  render / total (deploy/bunny-worker-src/
//                  bunny-edge-server-timing.ts). `render` is the outer phase
//                  and INCLUDES `db`, so render-db is the non-database part.
//   hrana ledger — the SQL statement count and SQL-side ms the local database
//                  host actually executed for that request. db minus this is
//                  the database HTTP hop; neither is inferred away.
//
// COLD vs WARM ARE DIFFERENT POPULATIONS AND ARE NOT AVERAGED TOGETHER.
// `--cold 1` boots a FRESH stack per term, so every sample is a first-request
// sample (what the navbar meets on a new isolate with an unprimed lexicon).
// The default boots one stack for the whole run: sample 1 is that stack's
// first request, samples 2..N are the steady state every keystroke after the
// first actually sees. Both are summarized separately.
//
// PARITY. With `--bodies <file>` every sample also keeps its exact response
// string. Two runs — one before a change, one after — produce two files that
// must diff clean. That is the only honest evidence a latency cut cost no
// byte. The harness binds an ephemeral loopback port per boot and this view's
// items carry ABSOLUTE urls, so the run's own origin is normalized to a fixed
// token before the body is kept; without that a parity diff drowns in port
// noise and proves nothing.
//
// Usage:
//   node tools/perf/search-box-latency/measure-search-box-latency.mjs \
//     [--deck <path>] [--creds <path>] [--bundle <path>] \
//     [--n 30] [--cold 0|1] [--actor admin|anonymous] [--label <name>] \
//     [--bodies <file>] [--env K=V,K=V] [--out <file.json>]
//
// Credentials are READ from the local creds file and NEVER printed: only the
// account NAME reaches the log, never the email or the password value.
//
// NOT A DEPLOYED-SITE CLAIM. This is a local stack over a local deck copy.
// It says nothing about the hosted Bunny edge; the deployment verdict stays
// with the live-acceptance lane.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Agent, request as httpsRequestRaw } from "node:https";
import { DatabaseSync } from "node:sqlite";
import { startStack } from "../../edge-signed-in-exercise/lib/stack.mjs";

const REPO = resolve(import.meta.dirname, "../../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const DECK = resolve(arg("deck", join(REPO, "tmp/search-box-latency/deck.sqlite3")));
const CREDS = resolve(arg("creds", join(REPO, "tmp/search-box-latency/creds.json")));
const BUNDLE = resolve(arg("bundle", join(REPO, "deploy/dist/bunny-edge-engine.bundle.js")));
const N = Number(arg("n", "30"));
const COLD = arg("cold", "0") === "1";
const ACTOR = arg("actor", "admin");
const LABEL = arg("label", `${ACTOR}-${COLD ? "cold" : "warm"}-n${N}`);
const OUT = resolve(arg("out", join(REPO, "tmp/search-box-latency", `${LABEL}.json`)));
// Extra render settings passed THROUGH the harness's own env channel.
// edge-host.mjs:76-79 deletes every DECKO_* process env the stack did not hand
// it, so a flag set in the shell never reaches the bundle; these go in `live`,
// which is how the stack itself carries them. The harness allowlists which
// keys are render settings (local-policy.mjs RENDER_KEYS); a key outside that
// list is dropped there, not here.
const EXTRA_ENV = Object.fromEntries(
  (arg("env", "") === "" ? [] : arg("env", "").split(",")).map((pair) => pair.split("=")),
);
const LIVE_ENV = { DECKO_LIVE_RENDER: "1", ...EXTRA_ENV };
const BODIES_OUT = arg("bodies", "") === "" ? null : resolve(arg("bodies"));
const PATH = "/*search/search_box_complete.json";

/** The engine's Server-Timing header, parsed rather than string-matched, so a
 *  phase the engine adds later is carried through instead of dropped. A token
 *  with no numeric `dur` is not a timing phase (the same rule the shipped
 *  tools/edge-signed-in-exercise/lib/search-as-you-type-suggestions.mjs uses,
 *  so the two parse identically). */
export function parseServerTiming(header) {
  if (typeof header !== "string" || header.trim() === "") return null;
  const phases = {};
  for (const part of header.split(",")) {
    const fields = part.trim().split(";").map((f) => f.trim()).filter(Boolean);
    const name = fields.shift();
    if (!name) continue;
    const entry = {};
    for (const field of fields) {
      const [key, value] = field.split("=");
      if (!key) continue;
      entry[key] = Number.isFinite(Number(value)) ? Number(value) : value;
    }
    if (typeof entry.dur !== "number") continue;
    phases[name] = entry;
  }
  return Object.keys(phases).length > 0 ? phases : null;
}

/** Nearest-rank percentile over the sorted sample: every reported percentile
 *  is an OBSERVED sample, never an interpolation between two. */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export function summarize(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    min: sorted[0],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
    mean: Math.round((sum / sorted.length) * 10) / 10,
  };
}

/** The 30 queries. Deterministic and printed into every report: the owner's
 *  own three keystrokes (lib/owner-checks.mjs) first, then a fixed stride
 *  across the deck's alphabet-sorted card names, each cut to a realistic
 *  3rd-to-8th-keystroke prefix. A fixed stride over the WHOLE name space (not
 *  a head-of-list sample) and no randomness, so a reader can re-run and get
 *  the same 30 queries. Prefixes of real names, because a term that matches
 *  nothing exercises the miss path, not the typeahead path a keystroke takes. */
function prefixesFromDeck(deckPath, n) {
  const db = new DatabaseSync(deckPath, { readOnly: true });
  const names = db
    .prepare("SELECT name FROM cards WHERE name IS NOT NULL AND name <> '' ORDER BY name")
    .all()
    .map((r) => String(r.name));
  db.close();
  const terms = [];
  const seen = new Set();
  const add = (t) => {
    if (!t || seen.has(t)) return;
    seen.add(t);
    terms.push(t);
  };
  for (const k of ["202", "2026", "202609"]) add(k);
  const stride = Math.max(1, Math.floor(names.length / Math.max(1, n * 3)));
  for (let i = 0; i < names.length && terms.length < n; i += stride) {
    const name = names[i];
    for (const cut of [Math.min(6, name.length), Math.min(4, name.length), Math.min(3, name.length)]) {
      const t = name.slice(0, cut);
      if (t.length >= 2) { add(t); break; }
    }
  }
  while (terms.length < n && terms.length < names.length) add(names[terms.length]);
  return terms.slice(0, n);
}

const tlsAgent = new Agent({ rejectUnauthorized: false, keepAlive: true });
let cookies = new Map();
const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");

let stack;

function httpsRequest(method, pathname, { headers, body }) {
  const url = new URL(`${stack.origin}${pathname}`);
  return new Promise((res, rej) => {
    const req = httpsRequestRaw(url, { method, headers, agent: tlsAgent }, (r) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => {
        const buf = Buffer.concat(chunks);
        res(new Response(buf, { status: r.statusCode, headers: r.headers, statusText: r.statusMessage }));
      });
    });
    req.on("error", rej);
    if (body) req.write(body);
    req.end();
  });
}

async function timed(term) {
  const before = { count: stack.hrana.ledger.count, totalMs: stack.hrana.ledger.totalMs };
  const pathname = `${PATH}?term=${encodeURIComponent(term)}`;
  const started = performance.now();
  const response = await httpsRequest("GET", pathname, {
    headers: { ...(cookies.size ? { cookie: cookieHeader() } : {}), "x-requested-with": "XMLHttpRequest" },
  });
  const wallMs = performance.now() - started;
  const text = await response.text();
  const body = text.split(stack.origin).join("https://127.0.0.1:ORIGIN");
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  return {
    term,
    status: response.status,
    wallMs: Math.round(wallMs),
    bodyBytes: Buffer.byteLength(text),
    ...(BODIES_OUT === null ? {} : { body }),
    items: Array.isArray(parsed) ? parsed.length : null,
    isArray: Array.isArray(parsed),
    serverTimingHeader: response.headers.get("server-timing"),
    serverTiming: parseServerTiming(response.headers.get("server-timing")),
    sqlStmts: stack.hrana.ledger.count - before.count,
    sqlMs: Math.round(stack.hrana.ledger.totalMs - before.totalMs),
  };
}

async function signIn(account) {
  cookies = new Map();
  const body = new URLSearchParams({
    "card[subcards][+*email][content]": account.email,
    "card[subcards][+*password][content]": account.password,
  }).toString();
  const line = await httpsRequest("POST", "/update/*signin", {
    headers: { "content-type": "application/x-www-form-urlencoded", origin: stack.origin },
    body,
  });
  for (const raw of line.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  await line.text();
  if (!cookies.has("decko_ts_session")) {
    throw new Error(`sign-in did not set a session cookie (HTTP ${line.status})`);
  }
}

function printSample(sample) {
  console.log(
    `${String(sample.wallMs).padStart(6)} ms  ${String(sample.status).padStart(3)}  ${String(sample.items).padStart(3)} items  ` +
    `${String(sample.sqlStmts).padStart(4)} stmts  ${String(sample.sqlMs).padStart(5)} sqlms  ` +
    `term=${JSON.stringify(sample.term)}  ${sample.serverTimingHeader ?? ""}`,
  );
}

const creds = JSON.parse(readFileSync(CREDS, "utf8"));
const account = creds[ACTOR] ?? creds.admin ?? Object.values(creds)[0];
const terms = prefixesFromDeck(DECK, N);
console.log(`label=${LABEL} actor=${ACTOR} n=${terms.length} cold=${COLD} deck=${DECK}`);
console.log(`bundle=${BUNDLE} bytes=${readFileSync(BUNDLE).length}`);
console.log(`terms=${JSON.stringify(terms)}`);

const samples = [];
const runtimeRoot = join(REPO, "tmp", `search-box-latency-run-${process.pid}`);

async function runWarm() {
  stack = await startStack({
    deckPath: DECK, live: LIVE_ENV,
    runtimeDir: join(runtimeRoot, "warm"), bundlePath: BUNDLE,
  });
  try {
    // The sign-in render primes the stack; it is NOT a sample. Sample 1 below
    // is still that stack's first search_box_complete request.
    if (ACTOR !== "anonymous") await signIn(account);
    for (let i = 0; i < terms.length; i++) {
      const sample = await timed(terms[i]);
      sample.index = i + 1;
      sample.phase = i === 0 ? "first-request" : "steady-state";
      samples.push(sample);
      printSample(sample);
    }
  } finally { await stack.close(); }
  stack.cleanup();
}

async function runCold() {
  for (const term of terms) {
    stack = await startStack({
      deckPath: DECK, live: LIVE_ENV,
      runtimeDir: join(runtimeRoot, `cold-${samples.length}`), bundlePath: BUNDLE,
    });
    try {
      if (ACTOR !== "anonymous") await signIn(account);
      const sample = await timed(term);
      sample.index = samples.length + 1;
      sample.phase = "cold-fresh-stack";
      samples.push(sample);
      printSample(sample);
    } finally { await stack.close(); }
    stack.cleanup();
  }
}

const startedRun = performance.now();
try {
  if (COLD) await runCold(); else await runWarm();
} finally {
  rmSync(runtimeRoot, { recursive: true, force: true });
}
const runMs = Math.round(performance.now() - startedRun);

const groups = {
  all: samples,
  firstRequest: samples.filter((s) => s.phase !== "steady-state"),
  steadyState: samples.filter((s) => s.phase === "steady-state"),
};
const phaseSummary = (group) =>
  Object.fromEntries(
    ["auth", "seat", "db", "render", "total"].map((phase) => [
      phase,
      summarize(group.map((s) => s.serverTiming?.[phase]?.dur).filter((v) => typeof v === "number")),
    ]),
  );

const report = {
  label: LABEL, actor: ACTOR, cold: COLD, deck: DECK, bundle: BUNDLE, terms, runMs, samples,
  summary: Object.fromEntries(
    Object.entries(groups).map(([name, group]) => [
      name,
      group.length === 0 ? null : {
        wallMs: summarize(group.map((s) => s.wallMs)),
        sqlStmts: summarize(group.map((s) => s.sqlStmts)),
        sqlMs: summarize(group.map((s) => s.sqlMs)),
        items: summarize(group.map((s) => s.items ?? 0)),
        phases: phaseSummary(group),
        dbStmts: summarize(group.map((s) => s.serverTiming?.db?.stmt).filter((v) => typeof v === "number")),
      },
    ]),
  ),
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
if (BODIES_OUT !== null) {
  mkdirSync(dirname(BODIES_OUT), { recursive: true });
  writeFileSync(
    BODIES_OUT,
    samples.map((s) => `### ${ACTOR} term=${JSON.stringify(s.term)} status=${s.status}\n${s.body}`).join("\n"),
  );
  console.log(`bodies: ${BODIES_OUT}`);
}
console.log("");
console.log(`summary (${LABEL}) — wall ms`);
for (const [name, s] of Object.entries(report.summary)) {
  if (!s) continue;
  console.log(
    `  ${name.padEnd(13)} n=${String(s.wallMs.n).padStart(3)} p50=${String(s.wallMs.p50).padStart(5)} p95=${String(s.wallMs.p95).padStart(5)} max=${String(s.wallMs.max).padStart(5)} | ` +
    `sql stmts p50=${String(s.sqlStmts.p50).padStart(4)} p95=${String(s.sqlStmts.p95).padStart(4)} | sql ms p50=${String(s.sqlMs.p50).padStart(5)} p95=${String(s.sqlMs.p95).padStart(5)}`,
  );
  const ph = s.phases;
  const fmt = (p) => (ph[p] ? `${ph[p].p50}/${ph[p].p95}` : "-/-");
  console.log(
    `      phases p50/p95: auth=${fmt("auth")} seat=${fmt("seat")} db=${fmt("db")} render=${fmt("render")} total=${fmt("total")}` +
    `  db stmt p50/p95=${s.dbStmts ? `${s.dbStmts.p50}/${s.dbStmts.p95}` : "-/-"}`,
  );
}
console.log(`report: ${OUT}`);

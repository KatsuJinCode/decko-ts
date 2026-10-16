// probe.mjs — measure the signed-in edge paths against the LOCAL stack: boots
// deploy/dist/bunny-edge-engine.bundle.js on a local copy of Brandon's deck,
// signs in through the deck's own sign-in form over HTTP, then times each
// scenario (anonymous board, signed-in board, edit page, save, repeat) and
// records the Server-Timing header, wall ms and body size.
//
// Usage: node tools/perf/speedprobe/probe.mjs [--deck <deck.sqlite3>] [--bundle <bundle.js>]
//        [--repeat N] [--json <out.json>] [--only <scenario,scenario>]
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Agent } from "node:https";
import { startStack } from "../../edge-signed-in-exercise/lib/stack.mjs";

const REPO = resolve(import.meta.dirname, "../../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const DECK = resolve(arg("deck", join(REPO, "tmp/speedprobe/deck.sqlite3")));
const BUNDLE = resolve(arg("bundle", join(REPO, "deploy/dist/bunny-edge-engine.bundle.js")));
const REPEAT = Number(arg("repeat", "2"));
const ONLY = arg("only") ? new Set(arg("only").split(",")) : null;
const JSON_OUT = arg("json") ? resolve(arg("json")) : null;
const RUNTIME = join(REPO, "tmp", `speedprobe-run-${process.pid}`);

const creds = JSON.parse(readFileSync(join(REPO, "tmp/speedprobe/creds.json"), "utf8"));
const admin = creds.admin ?? Object.values(creds)[0];

const tlsAgent = new Agent({ rejectUnauthorized: false, keepAlive: true });
let cookies = new Map();
const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");

async function timed(name, method, pathname, { body, headers = {}, redirect = "manual", captureBody = false } = {}) {
  const started = performance.now();
  const response = await fetch(`${stack.origin}${pathname}`, {
    method,
    headers: { ...(cookies.size ? { cookie: cookieHeader() } : {}), ...headers },
    body,
    redirect,
    dispatcher: undefined,
    agent: tlsAgent,
  }).catch(async (error) => {
    // Node fetch ignores `agent`; fall back to https.request with the CA-less agent.
    return httpsRequest(method, pathname, { headers: { ...(cookies.size ? { cookie: cookieHeader() } : {}), ...headers }, body, redirect });
  });
  const wallMs = performance.now() - started;
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  const set = (k, v) => { if (v === undefined || v === "") cookies.delete(k); else cookies.set(k, v); };
  const loc = response.headers.get("location"); if (loc && /session=deleted|-session/i.test(loc)) set("decko_ts_session", "");
  const text = captureBody ? await response.text() : "";
  const line = {
    name, method, path: pathname, status: response.status, wallMs: Math.round(wallMs),
    serverTiming: response.headers.get("server-timing"),
    bytes: Number(/content-length=([\d.]+)/.exec(response.headers.get("server-timing") ?? "")?.[1] ?? 0) || undefined,
    location: loc ?? undefined,
    bodyHead: text ? text.slice(0, 160).replace(/\s+/g, " ") : undefined,
  };
  line.hrana = { trips: stack.hrana.ledger.trips, stmts: stack.hrana.ledger.count, ms: Math.round(stack.hrana.ledger.totalMs) };
  line.hrana = { trips: stack.hrana.ledger.trips, stmts: stack.hrana.ledger.count, ms: Math.round(stack.hrana.ledger.totalMs) };
  console.log(`${line.wallMs.toString().padStart(6)} ms  ${String(line.status).padStart(3)}  ${method} ${pathname}  [${name}] trips=${line.hrana.trips} stmts=${line.hrana.stmts} sqlms=${line.hrana.ms}  ${line.serverTiming ?? ""}`);
  results.push(line);
  return line;
}

// https.request path (self-signed local TLS).
import { request as httpsRequestRaw } from "node:https";
function httpsRequest(method, pathname, { headers, body, redirect }) {
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

async function signIn(account) {
  cookies = new Map();
  const body = new URLSearchParams({
    "card[subcards][+*email][content]": account.email,
    "card[subcards][+*password][content]": account.password,
  }).toString();
  const line = await timed("signin", "POST", "/update/*signin", {
    body, headers: { "content-type": "application/x-www-form-urlencoded", origin: stack.origin }, captureBody: true,
  });
  if (!cookies.has("decko_ts_session")) throw new Error(`sign-in did not set a session cookie: ${line.bodyHead ?? line.status}`);
}

const results = [];
const stack = await startStack({ deckPath: DECK, live: { DECKO_LIVE_RENDER: "1" }, runtimeDir: RUNTIME, bundlePath: BUNDLE });
console.log(`stack: ${stack.origin}  deck: ${DECK}  bundle: ${(readFileSync(BUNDLE).length / 1048576).toFixed(2)} MB`);
if (process.env.PROBE_LIVE_TRACE) { process.env.DECKO_LIVE_TRACE = "1"; process.env.DECKO_LIVE_TRACE_STACK = process.env.PROBE_LIVE_TRACE; }
const want = (name) => !ONLY || ONLY.has(name);
try {
  if (want("anon-board")) { await timed("anon-board", "GET", "/Latest_News/board"); }
  if (want("anon-home")) { await timed("anon-home", "GET", "/"); }
  await signIn(admin);
  console.log("signed in");
  if (want("signed-board")) { await timed("signed-board", "GET", "/Latest_News/board"); }
  if (want("signed-home")) { await timed("signed-home", "GET", "/"); }
  for (const c of ["Brandon_WilliamsCraig", "*signin", "Home", "Brandon+WillamsCraig"]) if (want("edit-" + c)) { await timed("edit-" + c, "GET", "/" + c + "/edit"); }
  if (want("save")) {
    const form = new URLSearchParams({
      _method: "patch",
      "card[content]": "speed probe save",
      "success[redirect]": "true",
    }).toString();
    for (let i = 0; i < REPEAT; i++) await timed(`save#${i + 1}`, "POST", "/update/Brandon_WilliamsCraig", { body: form, headers: { "content-type": "application/x-www-form-urlencoded", origin: stack.origin }, captureBody: true });
  }
  if (want("signed-board")) for (let i = 0; i < REPEAT; i++) await timed(`signed-board#${i + 1}`, "GET", "/Latest_News/board");

} finally {
  await stack.close();
  stack.cleanup();
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ deck: DECK, bundle: BUNDLE, results }, null, 2));
// tools/diagnose-compound-create-ladder.mjs — WHERE DOES A COMPOUND CREATE FORM'S
// SERVER TIME GO?
//
// The signed-in exercise's "9. timings" budget leg fails on the create forms
// for COMPOUND names and the compound edit pages: the held-mx ledger recorded
// /new/Pointer?card[name]=<card>+<role> at 11.9 s over 866 statements and
// /<card>+<role>/edit at 9.5 s over 511 statements.
//
// This probe boots the SAME local stack the harness boots (same deck copy, same
// bundle, same keep-alive loopback transport), signs the seeded administrator
// in over plain HTTP, and drives the compound-create shapes plus their simple
// controls, recording for every request: pipeline POSTs, statements, db wall,
// and the statement shapes by count and wall.
//
//   node tools/diagnose-compound-create-ladder.mjs [--out tmp/....json]
//
// Statement walls come from local-hrana's own HRANA_TRACE lines (this process
// owns stderr; the trace is captured and re-emitted, never suppressed).

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { startLocalHrana } from "./edge-signed-in-exercise/lib/local-hrana.mjs";
import { startEdgeHost } from "./edge-signed-in-exercise/lib/edge-host.mjs";
import { createDeterministicLoopbackFetch } from "./edge-signed-in-exercise/lib/deterministic-loopback-fetch.mjs";
import { localEnv } from "./edge-signed-in-exercise/lib/stack.mjs";
import { buildLocalDeck } from "./edge-signed-in-exercise/lib/build-local-deck.mjs";
import { seedLocalAccounts } from "./edge-signed-in-exercise/lib/seed-local-accounts.mjs";
import { startMockBunnyStorage } from "../tests/server/mock-bunny-storage.mjs";

const argOf = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DECK = resolve(argOf("deck") ?? "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3");
const SECRETS = resolve(argOf("secrets") ?? "C:/localProjects/brandonDojoTech/library/data/secrets.env");
const OUT = resolve(argOf("out") ?? join(REPO, "tmp", `compound-ladder-${Date.now()}.json`));
const RUN_DIR = join(REPO, "tmp", `compound-ladder-run-${Date.now()}-${process.pid}`);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

// ------------------------------------------------------------- trace capture

const realStderrWrite = process.stderr.write.bind(process.stderr);
let traceLines = [];
process.stderr.write = (chunk, ...rest) => {
  const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  for (const line of text.split("\n")) {
    if (line.startsWith("hrana   -> ")) {
      const open = traceLines.findLast((t) => !t.done);
      if (open !== undefined) { open.done = true; open.ms = Number(/(\d+)ms$/.exec(line)?.[1] ?? 0); }
    } else if (line.startsWith("hrana ")) {
      traceLines.push({ line, done: false });
    }
  }
  return realStderrWrite(chunk, ...rest);
};
process.env.HRANA_TRACE = "1";

// ------------------------------------------------------- recorded stack boot

let currentSegment = null;
const segments = new Map();
function segment(name) {
  currentSegment = name;
  traceLines = [];
  if (!segments.has(name)) segments.set(name, { posts: 0, stmts: 0, wallMs: 0, stmtWallMs: 0, shapes: new Map(), slow: [], sequence: [] });
}

function recordPipelinePost(statements, wallMs, statementsWithArgs) {
  if (currentSegment === null) return;
  const seg = segments.get(currentSegment);
  seg.posts += 1;
  seg.stmts += statements.length;
  seg.wallMs += wallMs;
  const trace = traceLines.splice(0);
  for (let i = 0; i < statements.length; i += 1) {
    // The FULL SQL comes from the pipeline request body; the hrana trace line
    // is truncated, so it is used only for the wall and the argument text.
    const sql = statements[i].replace(/\s+/g, " ").trim();
    const ms = trace[i]?.ms ?? 0;
    const args = statementsWithArgs?.[i] ?? "";
    seg.stmtWallMs += ms;
    const shape = seg.shapes.get(sql) ?? { count: 0, wallMs: 0 };
    shape.count += 1;
    shape.wallMs += ms;
    seg.shapes.set(sql, shape);
    if (ms >= 25) seg.slow.push({ ms, sql: sql.slice(0, 300) });
    if (seg.sequence.length < 4000) seg.sequence.push({ sql: sql.slice(0, 600), ms, args: String(args).slice(0, 2000) });
  }
}

// The live env is only read for its RENDER_KEYS; the local stack needs no
// credential. A Bunny script read that fails must not block the measurement.
let liveEnv = {};
try {
  const { readLiveScriptEnv } = await import("./edge-signed-in-exercise/lib/stack.mjs");
  liveEnv = (await readLiveScriptEnv(SECRETS)).env;
  console.log("live env: read");
} catch (error) {
  console.log(`live env: NOT read (${String(error).slice(0, 120)})`);
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

execFileSync(process.execPath, [join(REPO, 'tools/dist/build-engine.mjs'), '--browser-hosts'], { cwd: REPO, stdio: 'inherit', windowsHide: true, timeout: 300_000 });
const bundlePath = join(REPO, "deploy/dist/bunny-edge-engine.bundle.js");
execFileSync(process.execPath, [join(REPO, "tools/bundle-bunny-edge-engine.mjs")], { cwd: REPO, stdio: "ignore", timeout: 600_000 });
console.log(`bundle: ${bundlePath} (${(readFileSync(bundlePath).length / 1048576).toFixed(1)} MB)`);

mkdirSync(RUN_DIR, { recursive: true });
const localDeck = join(RUN_DIR, "deck.sqlite3");
await buildLocalDeck({ source: SOURCE_DECK, out: localDeck });
console.log("local deck built");
try {
  execFileSync(process.execPath, [join(REPO, "tools/deploy/build-nest-index.mjs"), "--db", localDeck], { cwd: REPO, stdio: 'ignore', timeout: 900_000 });
  console.log("nest index: built");
} catch (error) {
  console.log(`nest index: NOT built (${String(error).slice(0, 100)})`);
}
const credentialsPath = join(RUN_DIR, "credentials.json");
await seedLocalAccounts({ deck: localDeck, credentialsOut: credentialsPath });
const creds = JSON.parse(readFileSync(credentialsPath, "utf8"));
console.log(`seeded: ${creds.admin.name} (admin)`);

const hrana = await startLocalHrana({ dbPath: localDeck });
const storage = await startMockBunnyStorage({ filesRoot: join(RUN_DIR, "storage-files") });
const storagePrefix = `https://${storage.host}/`;
const loopbackFetch = createDeterministicLoopbackFetch({ fallback: globalThis.fetch });
globalThis.fetch = async (input, init) => {
  const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!value.startsWith(storagePrefix) && value === `${hrana.url}/v2/pipeline`) {
    let statements = [];
    let statementsWithArgs = [];
    try {
      const requests = (JSON.parse(String(init?.body)).requests ?? []).filter((r) => r?.type === "execute");
      statements = requests.map((r) => r.stmt?.sql ?? "");
      statementsWithArgs = requests.map((r) => JSON.stringify(r.stmt?.args ?? []));
    } catch { /* a malformed pipeline is the engine's error to surface */ }
    const t0 = performance.now();
    try {
      return await loopbackFetch(input, init);
    }
    finally { recordPipelinePost(statements, performance.now() - t0, statementsWithArgs); }
  }
  return loopbackFetch(value.startsWith(storagePrefix) ? `http://${storage.host}/${value.slice(storagePrefix.length)}` : input, init);
};

const runtimeDir = join(RUN_DIR, "runtime");
mkdirSync(runtimeDir, { recursive: true });
let host;
const envBase = { ...localEnv({ live: liveEnv, dbUrl: `${hrana.url}/v2/pipeline`, origin: "https://127.0.0.1" }),
  DECKO_STORAGE_ZONE: storage.zone, DECKO_STORAGE_PASSWORD: storage.password, DECKO_STORAGE_HOST: storage.host };
try {
  host = await startEdgeHost({ bundlePath, runtimeDir, env: envBase });
  const origin = host.url;
  process.env.DECKO_TRUSTED_ORIGINS = origin;
  process.env.DECKO_ORIGIN = origin;
  process.env.DECKO_DECK_ORIGIN = origin;
  process.env.DECKO_SERVED_ROOT_URL = origin;

  let sessionCookie = null;
  const httpFetch = (path, { method = "GET", body, redirect = "manual" } = {}) => {
    const headers = { "content-type": "application/x-www-form-urlencoded" };
    if (sessionCookie !== null) headers.cookie = sessionCookie;
    if (body !== undefined) headers["content-length"] = String(Buffer.byteLength(body));
    return fetch(`${origin}${path}`, { method, body, redirect, headers });
  };
  const setCookieOf = (response) => response.headers.getSetCookie?.().map((c) => c.split(";")[0]).join("; ") ?? null;
  const serverTimingOf = (response) => response.headers.get("Server-Timing");

  segment("POST /update/*signin");
  const signinBody = new URLSearchParams({
    "card[subcards][+*email][content]": creds.admin.email,
    "card[subcards][+*password][content]": creds.admin.password,
  }).toString();
  const signin = await httpFetch("/update/*signin", { method: "POST", body: signinBody });
  sessionCookie = setCookieOf(signin);
  console.log(`sign-in: ${signin.status} cookie=${sessionCookie !== null} timing=${serverTimingOf(signin)}`);
  await signin.arrayBuffer().catch(() => undefined);

  // The shapes: the compound-create forms the budget leg names, plus the
  // simple-name controls that separate "the compound name" from "the type".
  const shapes = [
    { label: "control simple RichText form", path: "/new/RichText?card%5Bname%5D=Brandon%20WilliamsCraig" },
    { label: "control simple Pointer form (existing name)", path: "/new/Pointer?card%5Bname%5D=Brandon%20WilliamsCraig" },
    { label: "compound Pointer form (two real cards)", path: "/new/Pointer?card%5Bname%5D=Brandon%20WilliamsCraig%2BDecko%20Bot%201" },
    { label: "compound Pointer form (left only, right missing)", path: "/new/Pointer?card%5Bname%5D=Brandon%20WilliamsCraig%2BNo%20Such%20Card" },
    { label: "plus-card Search form", path: "/new/Search?card%5Bname%5D=Brandon%20WilliamsCraig%2B*right%2B*content%2Boptions" },
    { label: "compound edit page (existing compound card)", path: "/Dream%20Team%2BAssociations/edit" },
    { label: "control simple edit page", path: "/Brandon_WilliamsCraig/edit" },
  ];
  for (const shape of shapes) {
    segment(shape.label);
    console.log(`>>> REQUEST ${shape.label} ${shape.path}`);
    const t0 = performance.now();
    const response = await httpFetch(shape.path, { redirect: "follow" });
    const text = await response.text().catch(() => "");
    const wall = Math.round(performance.now() - t0);
    const timing = serverTimingOf(response);
    const total = Number(/total;dur=([\d.]+)/.exec(timing ?? "")?.[1] ?? NaN);
    const stmt = Number(/stmt=(\d+)/.exec(timing ?? "")?.[1] ?? NaN);
    const dbDur = Number(/db;dur=([\d.]+)/.exec(timing ?? "")?.[1] ?? NaN);
    console.log(`\n== ${shape.label}\n   ${shape.path}\n   status ${response.status} bytes ${text.length} wall ${wall} ms  server-timing ${timing ?? "(none)"}`);
    console.log(`   server total ${total} ms, db ${dbDur} ms, driver statements ${stmt}`);
  }

  // The harness cover-b leg's own edit-page shape: the fixture cards it
  // creates (a custom cardtype, two options, the content-options Search rule,
  // the input-type rule, a Basic host with a Pointer +Role junction), created
  // through the same POST /card/create route, then the junction's /edit page
  // (the ledger's /<card>+<role>/edit rows).
  const post = async (label, name, type, content = "") => {
    const fields = { "card[name]": name, "card[content]": content, "success[redirect]": "true" };
    if (type !== undefined) fields["card[type]"] = type;
    const response = await httpFetch("/card/create", { method: "POST", body: new URLSearchParams(fields).toString() });
    const body = await response.text().catch(() => "");
    console.log(`create ${label}: HTTP ${response.status} timing=${serverTimingOf(response) ?? "(none)"}`);
    if (response.status >= 400) console.log(`   body: ${body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 300)}`);
    return response.status;
  };
  segment("harness fixture creates");
  await post("option cardtype", "Probe Time Option", "Cardtype");
  await post("pick one", "Probe Time Pick One", "Probe Time Option");
  await post("pick two", "Probe Time Pick Two", "Probe Time Option");
  await post("content options rule", "Probe Time Role+*right+*content options", "Search", JSON.stringify({ type: "Probe Time Option", sort: "name" }));
  await post("input type rule", "Probe Time Role+*right+*input type", "Phrase", "checkbox");
  await post("host", "Probe Time Boxy", "Basic");
  await post("pointer junction", "Probe Time Boxy+Probe Time Role", "Pointer", "");

  for (const shape of [
    { label: "pointer junction edit page (the ledger's /edit row)", path: "/Probe%20Time%20Boxy%2BProbe%20Time%20Role/edit" },
    { label: "pointer junction edit page (second, warm)", path: "/Probe%20Time%20Boxy%2BProbe%20Time%20Role/edit" },
    { label: "pointer junction page", path: "/Probe%20Time%20Boxy%2BProbe%20Time%20Role" },
  ]) {
    segment(shape.label);
    console.log(`>>> REQUEST ${shape.label} ${shape.path}`);
    const t0 = performance.now();
    const response = await httpFetch(shape.path, { redirect: "follow" });
    const text = await response.text().catch(() => "");
    const wall = Math.round(performance.now() - t0);
    const timing = serverTimingOf(response);
    const total = Number(/total;dur=([\d.]+)/.exec(timing ?? "")?.[1] ?? NaN);
    const stmt = Number(/stmt=(\d+)/.exec(timing ?? "")?.[1] ?? NaN);
    const dbDur = Number(/db;dur=([\d.]+)/.exec(timing ?? "")?.[1] ?? NaN);
    console.log(`\n== ${shape.label}\n   ${shape.path}\n   status ${response.status} bytes ${text.length} wall ${wall} ms  server-timing ${timing ?? "(none)"}`);
    console.log(`   server total ${total} ms, db ${dbDur} ms, driver statements ${stmt}`);
  }

  const report = { source: execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), segments: {} };
  for (const [name, seg] of segments) {
    const firstArgs = new Map();
    for (const entry of seg.sequence) if (!firstArgs.has(entry.sql)) firstArgs.set(entry.sql, entry.args);
    const shapesOut = [...seg.shapes.entries()].map(([sql, { count, wallMs }]) => ({ count, wallMs, sql, firstArgs: firstArgs.get(sql) }))
      .sort((a, b) => b.count - a.count || b.wallMs - a.wallMs);
    report.segments[name] = {
      posts: seg.posts, stmts: seg.stmts, dbWallMs: Math.round(seg.wallMs), stmtWallMs: Math.round(seg.stmtWallMs),
      slowStatements: seg.slow.sort((a, b) => b.ms - a.ms).slice(0, 20),
      shapesByCount: shapesOut.slice(0, 30),
      distinctShapes: shapesOut.length,
      sequence: seg.sequence,
    };
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nreport: ${OUT}`);
  for (const [name, seg] of Object.entries(report.segments)) {
    console.log(`\n== ${name}: ${seg.posts} POSTs, ${seg.stmts} stmts, db wall ${seg.dbWallMs} ms`);
    for (const shape of seg.shapesByCount.slice(0, 10)) console.log(`   ${String(shape.count).padStart(4)}x ${String(shape.wallMs).padStart(6)}ms  ${shape.sql.slice(0, 140)}`);
  }
} finally {
  currentSegment = null;
  try { if (host) await host.close(); } finally {
    try { await hrana.close(); } finally {
      try { await storage.stop(); } finally {
        try { rmSync(RUN_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* keep the diagnosis even if cleanup is interrupted */ }
      }
    }
  }
}

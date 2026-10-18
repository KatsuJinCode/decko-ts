// tmp/diagnose-owner-save-statement-ladder.mjs — WHERE DOES A SAVE'S db TIME GO?
//
// Lives in tmp/ (gitignored): the release-lead tree is shared by several
// fixer agents running clean pre-fix repros, and their sweeps removed the
// tools/-housed copy twice. Outputs also land in tmp/.
//
// The whole-harness timing check (edge-signed-in-exercise.mjs "9. timings")
// failed the graded nights on POST /update/Brandon_WilliamsCraig at ~5.5 s
// with db;dur≈5,020;stmt=368, and the live deployment failed the same save at
// 5,130 ms with db;dur=4,809;stmt=367. This diagnostic answers, per request,
// WHAT the statement ladder is made of: it boots the SAME local stack the
// harness boots (same build-local-deck copy, same nest index, same seed
// accounts, same bundle, same keep-alive loopback transport — stack.mjs's
// shipped transport pin stays in place), inserts ONLY a recorder between the
// engine and the local-hrana pipeline, signs in as the seeded administrator
// over plain HTTP, and drives the graded request shapes:
//
//   POST /update/*signin                     (the sign-in write)
//   GET  /Brandon_WilliamsCraig/edit         (the owner-card edit page render)
//   POST /update/Brandon_WilliamsCraig?...   (the owner-card save, the form's
//                                             own fields re-posted verbatim —
//                                             the graded save was a no-edit save)
//   GET  /Brandon_WilliamsCraig              (the saved card page render)
//
// For every request segment it reports: pipeline POSTs, statements, db wall,
// statement shapes by count and wall, every statement ≥ 25 ms, and the first
// 1200 statements in order (sequence) so a hot query attributes to its caller.
// Statement walls come from local-hrana's own HRANA_TRACE lines (this process
// owns stderr; the trace is captured and re-emitted, never suppressed).
//
//   node tools/diagnose-owner-save-statement-ladder.mjs [--out tmp/...json]
//        [--capture-results]
//
// --capture-results additionally records, per statement, the scalars the
// execute result produced (every integer cell of every row plus
// last_insert_rowid), parsed off the critical path from a response clone. It
// is what lets a consumer PROVE which statements consume an earlier
// statement's result value, instead of inferring dependency from SQL shape.
// It costs a body parse per POST, so a --capture-results run's wall numbers
// are not a transport measurement; its POST and statement counts must match
// the plain run's, which is the check that the capture changed nothing.
//
// This is a diagnostic, not the graded instrument: pass/fail for the budget
// is decided by tools/edge-signed-in-exercise.mjs's "9. timings" section.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { startLocalHrana } from "./edge-signed-in-exercise/lib/local-hrana.mjs";
import { startEdgeHost } from "./edge-signed-in-exercise/lib/edge-host.mjs";
import { createDeterministicLoopbackFetch } from "./edge-signed-in-exercise/lib/deterministic-loopback-fetch.mjs";
import { localEnv, readLiveScriptEnv } from "./edge-signed-in-exercise/lib/stack.mjs";
import { buildLocalDeck } from "./edge-signed-in-exercise/lib/build-local-deck.mjs";
import { seedLocalAccounts } from "./edge-signed-in-exercise/lib/seed-local-accounts.mjs";
import { startMockBunnyStorage } from "../tests/server/mock-bunny-storage.mjs";

const argOf = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DECK = resolve(argOf("deck") ?? "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3");
const SECRETS = resolve(argOf("secrets") ?? "C:/localProjects/brandonDojoTech/library/data/secrets.env");
const OUT = resolve(argOf("out") ?? join(REPO, "tmp", `save-ladder-diagnosis-${Date.now()}.json`));
const RUN_DIR = join(REPO, "tmp", `save-ladder-diagnosis-run-${Date.now()}-${process.pid}`);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

// ------------------------------------------------------------- trace capture

/** Pair local-hrana's HRANA_TRACE lines into {sql, ms} per statement, in
 *  order, while re-emitting them to the real stderr untouched. */
const realStderrWrite = process.stderr.write.bind(process.stderr);
let traceLines = [];
process.stderr.write = (chunk, ...rest) => {
  const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  for (const line of text.split("\n")) {
    // The closer prefix ("hrana   -> ") also matches the opener prefix
    // ("hrana "), so the closer test runs FIRST.
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

/** Statement tallies per named segment. The probe is the stack's only HTTP
 *  client and awaits each request, so everything recorded between setting
 *  `currentSegment` belongs to that segment. */
let currentSegment = null;
/** @type {Map<string, {posts: number, stmts: number, wallMs: number, stmtWallMs: number, shapes: Map<string, {count: number, wallMs: number}>, slow: Array<{ms: number, sql: string}>, sequence: Array<{sql: string, ms: number}>}>} */
const segments = new Map();
function segment(name) {
  currentSegment = name;
  traceLines = [];
  if (!segments.has(name)) segments.set(name, { posts: 0, stmts: 0, wallMs: 0, stmtWallMs: 0, shapes: new Map(), slow: [], sequence: [] });
}

/** --capture-results (opt-in): which integers each statement PRODUCED, so a
 *  consumer can prove statement-by-statement which later statements consume
 *  an earlier statement's result VALUE (the only dependency that forbids
 *  packing two statements into one ordered batch) instead of inferring it
 *  from SQL shape. OFF by default: the default run's wall numbers are the
 *  transport receipt, and parsing a body per POST would inflate them. With
 *  --capture-results the statement ladder itself must be identical
 *  (same POST and statement counts); only the wall numbers are inflated.
 *  The clone is read without awaiting, so the engine is never blocked on it;
 *  every capture is awaited before the report is written. */
const CAPTURE_RESULTS = process.argv.includes("--capture-results");
/** postKey -> the parsed per-statement results of that pipeline POST. */
const postResults = new Map();
/** postKey -> the response clone whose body carries those results. */
const postResponses = new Map();
/** postKey -> how many statements that POST carried, in POST order. */
const postStatementCounts = new Map();
/** postKey -> the event-loop TURN the pipeline POST was issued on. Two POSTs
 *  on one turn are two statements the engine issued WITHOUT waiting for the
 *  other's answer — the only group a DataLoader-style coalescing endpoint can
 *  carry without predicting what comes next. A ladder that awaits every
 *  answer lands one POST per turn, and no transport can help it. Always on:
 *  it costs one number per POST. */
let currentTick = 0;
const bumpTick = () => { currentTick += 1; setImmediate(bumpTick); };
setImmediate(bumpTick);
const postTicks = new Map();
const postCapturePromises = [];
/** Per-segment POST counter, so a post key is stable and ordered. */
const segmentPostCounter = new Map();
/** Every scalar an execute result hands back: the integer cells of every row,
 *  the TEXT cells too (the engine binds a row's key/codename back into later
 *  statements just as it does an id), and last_insert_rowid. The transport
 *  design's dependency test asks whether a later statement's bound argument
 *  is one of these. Long text and blobs are skipped: they are card content,
 *  which no statement binds back as an argument, and carrying them would
 *  bloat the receipt. */
function producedScalars(entry) {
  const produced = [];
  if (entry === null || typeof entry !== "object") return produced;
  const result = entry.response?.result ?? entry.result;
  if (result === null || typeof result !== "object") return produced;
  if (typeof result.last_insert_rowid === "string") produced.push(Number(result.last_insert_rowid));
  else if (typeof result.last_insert_rowid === "number") produced.push(result.last_insert_rowid);
  for (const row of result.rows ?? []) {
    for (const cell of row ?? []) {
      if (cell?.type === "integer") produced.push(Number(cell.value));
      else if (cell?.type === "text" && cell.value !== undefined && cell.value.length <= 64 && !cell.value.includes("\n")) produced.push(cell.value);
    }
  }
  return produced;
}
function capturePostResults(key, statements) {
  postStatementCounts.set(key, statements.length);
  const promise = (async () => {
    const response = await postResponses.get(key);
    if (response === undefined) return;
    let body;
    try { body = await response.json(); } catch { return; }
    const results = Array.isArray(body?.results) ? body.results : [];
    postResults.set(key, results.map((entry) => ({
      produced: producedScalars(entry),
      rows: entry?.response?.result?.rows?.length ?? 0,
      lastInsertRowId: entry?.response?.result?.last_insert_rowid ?? null,
      error: entry?.type === "error" ? entry.error?.message ?? "error" : null,
    })));
  })();
  postCapturePromises.push(promise);
}
function recordPipelinePost(statements, wallMs) {
  if (currentSegment === null) return;
  const seg = segments.get(currentSegment);
  seg.posts += 1;
  seg.stmts += statements.length;
  seg.wallMs += wallMs;
  for (const { line, ms } of traceLines.splice(0)) {
    const sql = line.replace(/^hrana /, "").replace(/\s+args=.*$/, "").replace(/\s+/g, " ").trim();
    const args = /args=(.*)$/.exec(line)?.[1] ?? "";
    seg.stmtWallMs += ms;
    const shape = seg.shapes.get(sql) ?? { count: 0, wallMs: 0 };
    shape.count += 1;
    shape.wallMs += ms;
    seg.shapes.set(sql, shape);
    if (ms >= 25) seg.slow.push({ ms, sql: sql.slice(0, 300) });
    if (seg.sequence.length < 1200) seg.sequence.push({ sql: sql.slice(0, 200), ms, args: args.slice(0, 4000) });
  }
}

const { env: liveEnv } = await readLiveScriptEnv(SECRETS);
// The edge host serves the origin over HTTPS with the harness's self-signed
// certificate (Chromium is launched ignore-certs). From here on this process
// only talks to the local host and the loopback stack, so verification is off
// for the probe's own requests; the Bunny API read above already ran verified.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

execFileSync(process.execPath, [join(REPO, 'tools/dist/build-engine.mjs'), '--browser-hosts'], { cwd: REPO, stdio: 'inherit', windowsHide: true, timeout: 120_000 });
const bundlePath = join(REPO, "deploy/dist/bunny-edge-engine.bundle.js");
execFileSync(process.execPath, [join(REPO, "tools/bundle-bunny-edge-engine.mjs")], { cwd: REPO, stdio: "ignore", timeout: 300_000 });
console.log(`bundle: ${bundlePath} (${(readFileSync(bundlePath).length / 1048576).toFixed(1)} MB)`);

mkdirSync(RUN_DIR, { recursive: true });
const localDeck = join(RUN_DIR, "deck.sqlite3");
await buildLocalDeck({ source: SOURCE_DECK, out: localDeck });
console.log("local deck built");
try {
  execFileSync(process.execPath, [join(REPO, "tools/deploy/build-nest-index.mjs"), "--db", localDeck], { cwd: REPO, stdio: "ignore", timeout: 600_000 });
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
// The engine's db/storage fetches ride the SHIPPED keep-alive loopback
// transport (stack.mjs's fix), recorded here statement-by-statement.
const loopbackFetch = createDeterministicLoopbackFetch({ fallback: globalThis.fetch });
globalThis.fetch = async (input, init) => {
  const value = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!value.startsWith(storagePrefix) && value === `${hrana.url}/v2/pipeline`) {
    let statements = [];
    try { statements = (JSON.parse(String(init?.body)).requests ?? []).filter((r) => r?.type === "execute").map((r) => r.stmt?.sql ?? ""); } catch { /* a malformed pipeline is the engine's error to surface */ }
    const postNumber = currentSegment === null ? undefined : (segmentPostCounter.get(currentSegment) ?? 0) + 1;
    const key = currentSegment === null ? undefined : `${currentSegment}#${postNumber}`;
    if (postNumber !== undefined) segmentPostCounter.set(currentSegment, postNumber);
    if (key !== undefined) postTicks.set(key, currentTick);
    const t0 = performance.now();
    try {
      const response = await loopbackFetch(input, init);
      // Clone BEFORE the engine reads the body; the clone is parsed off the
      // critical path (capturePostResults awaits it later, never here).
      if (CAPTURE_RESULTS && key !== undefined) {
        postResponses.set(key, response.clone());
        capturePostResults(key, statements);
      }
      return response;
    }
    finally { recordPipelinePost(statements, performance.now() - t0); }
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

  // ------------------------------------------------------------- the journey

  let sessionCookie = null;
  const httpFetch = (path, { method = "GET", body, redirect = "manual" } = {}) => {
    const headers = { "content-type": "application/x-www-form-urlencoded" };
    if (sessionCookie !== null) headers.cookie = sessionCookie;
    if (body !== undefined) headers["content-length"] = String(Buffer.byteLength(body));
    return fetch(`${origin}${path}`, { method, body, redirect, headers });
  };
  const setCookieOf = (response) => response.headers.getSetCookie?.().map((c) => c.split(";")[0]).join("; ") ?? null;
  const serverTimingOf = (response) => response.headers.get("Server-Timing");

  // The sign-in write, the runner signIn()'s own fields (write-routes' *signin branch).
  segment("POST /update/*signin");
  const signinBody = new URLSearchParams({
    "card[subcards][+*email][content]": creds.admin.email,
    "card[subcards][+*password][content]": creds.admin.password,
  }).toString();
  const signin = await httpFetch("/update/*signin", { method: "POST", body: signinBody });
  sessionCookie = setCookieOf(signin);
  console.log(`sign-in: ${signin.status} cookie=${sessionCookie !== null} timing=${serverTimingOf(signin)}`);
  await signin.arrayBuffer().catch(() => undefined);

  // The owner-card edit page (the graded slow page).
  segment("GET /Brandon_WilliamsCraig/edit");
  const edit = await httpFetch("/Brandon_WilliamsCraig/edit", { redirect: "follow" });
  const editHtml = await edit.text();
  console.log(`edit page: ${edit.status} bytes=${editHtml.length} timing=${serverTimingOf(edit)}`);

  // The owner-card save: re-post the edit form's own fields verbatim (the
  // graded live save was a no-edit save of this form).
  const formMatch = /<form[^>]*action="([^"]*update\/Brandon_WilliamsCraig[^"]*)"[^>]*>/i.exec(editHtml);
  if (formMatch === null) throw new Error("no /update/Brandon_WilliamsCraig form on the edit page");
  const action = formMatch[1].replace(/&amp;/g, "&");
  const formHtml = editHtml.slice(formMatch.index, editHtml.indexOf("</form>", formMatch.index));
  const body = new URLSearchParams();
  // The browser hands the form's values ENTITY-DECODED (textarea text and
  // value="..." attributes both); the raw HTML carries &quot;/&amp;/&lt;/&gt;,
  // and sending them encoded corrupted the JSON-structured subcard field
  // (Problems with Brandon WilliamsCraig+Project(s) Participating INVALID
  // JSON). Decode what was extracted, exactly as the DOM would.
  const decodeEntities = (s) => s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const inputRe = /<(?:input|textarea)[^>]*>/g;
  for (const tag of formHtml.match(inputRe) ?? []) {
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    if (name === undefined) continue;
    let value = /value="([^"]*)"/.exec(tag)?.[1] ?? "";
    if (tag.startsWith("<textarea")) {
      const m = new RegExp(`<textarea[^>]*name="${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>([\\s\\S]*?)</textarea>`).exec(formHtml);
      value = m?.[1] ?? "";
    }
    if (tag.includes('type="file"')) continue; // no upload in this save
    if (body.has(name)) continue; // repeated names (radio/checkbox sets): first wins, the browser's own pick
    body.set(name, decodeEntities(value));
  }
  if (!body.has("card[content]")) {
    const m = /<textarea[^>]*name="card\[content\]"[^>]*>([\s\S]*?)<\/textarea>/.exec(formHtml);
    if (m !== null) body.set("card[content]", decodeEntities(m[1]));
  }
  segment("POST /update/Brandon_WilliamsCraig (the graded save)");
  const save = await httpFetch(action.startsWith("http") ? action.slice(origin.length) : action, { method: "POST", body: body.toString() });
  const saveText = await save.text().catch(() => "");
  console.log(`save: ${save.status} bytes=${saveText.length} timing=${serverTimingOf(save)}`);
  if (save.status >= 400) console.log(`save body: ${saveText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 500)}`);

  segment("GET /Brandon_WilliamsCraig (fresh view)");
  const fresh = await httpFetch("/Brandon_WilliamsCraig", { redirect: "follow" });
  await fresh.arrayBuffer().catch(() => undefined);
  console.log(`fresh view: ${fresh.status} timing=${serverTimingOf(fresh)}`);

  // ----------------------------------------------------------------- report

  if (CAPTURE_RESULTS) {
    // Every capture is awaited HERE, never on the engine's critical path.
    await Promise.all(postCapturePromises);
    // Attach each statement's produced values to its sequence entry: the
    // statements of a segment were pushed in POST order, and the results of a
    // POST are index-aligned with its execute requests (the same alignment
    // libsql-http.ts's decoder asserts).
    for (const [name, seg] of segments) {
      const cursor = { at: 0 };
      for (const [key, count] of postStatementCounts) {
        if (!key.startsWith(`${name}#`)) continue;
        const results = postResults.get(key) ?? [];
        for (let i = 0; i < count; i += 1) {
          const entry = seg.sequence[cursor.at + i];
          if (entry === undefined) break;
          const produced = results[i] ?? { produced: [], rows: 0, lastInsertRowId: null, error: null };
          entry.produced = produced.produced;
          entry.rows = produced.rows;
          entry.lastInsertRowId = produced.lastInsertRowId;
          entry.error = produced.error;
        }
        cursor.at += count;
      }
    }
    const captured = [...postResults.values()].reduce((n, r) => n + r.length, 0);
    console.log(`captured results for ${captured} statements across ${postResults.size} POSTs`);
  }

  const report = { bundleSha256: digest(readFileSync(bundlePath)), source: execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), captureResults: CAPTURE_RESULTS, segments: {} };
  for (const [name, seg] of segments) {
    const shapes = [...seg.shapes.entries()].map(([sql, { count, wallMs }]) => ({ count, wallMs, sql: sql.slice(0, 400) }))
      .sort((a, b) => b.wallMs - a.wallMs || b.count - a.count);
    // How many POSTs share an event-loop turn: the group a coalescing
    // endpoint can carry without predicting the next statement.
    const ticks = [...postTicks.entries()].filter(([key]) => key.startsWith(`${name}#`)).map(([, tick]) => tick);
    const perTick = new Map();
    for (const tick of ticks) perTick.set(tick, (perTick.get(tick) ?? 0) + 1);
    const largest = [...perTick.values()].sort((a, b) => b - a).slice(0, 5);
    report.segments[name] = {
      posts: seg.posts, stmts: seg.stmts, dbWallMs: Math.round(seg.wallMs), stmtWallMs: Math.round(seg.stmtWallMs),
      distinct_ticks: perTick.size, posts_per_tick_max: largest[0] ?? 0, largest_ticks: largest,
      slowStatements: seg.slow.sort((a, b) => b.ms - a.ms).slice(0, 20),
      shapesByWall: shapes.slice(0, 25),
      distinctShapes: shapes.length,
      sequence: seg.sequence,
    };
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`report: ${OUT}`);
  for (const [name, seg] of Object.entries(report.segments)) {
    console.log(`\n== ${name}: ${seg.posts} POSTs, ${seg.stmts} stmts, db wall ${seg.dbWallMs} ms (stmt-exec ${seg.stmtWallMs} ms)`);
    for (const shape of seg.shapesByWall.slice(0, 8)) console.log(`   ${String(shape.count).padStart(4)}x ${String(shape.wallMs).padStart(6)}ms  ${shape.sql.slice(0, 120)}`);
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

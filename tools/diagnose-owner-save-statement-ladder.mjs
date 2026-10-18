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
    if (seg.sequence.length < 1200) seg.sequence.push({ sql: sql.slice(0, 200), ms, args: args.slice(0, 120) });
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
    const t0 = performance.now();
    try { return await loopbackFetch(input, init); }
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

  const report = { bundleSha256: digest(readFileSync(bundlePath)), source: execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), segments: {} };
  for (const [name, seg] of segments) {
    const shapes = [...seg.shapes.entries()].map(([sql, { count, wallMs }]) => ({ count, wallMs, sql: sql.slice(0, 400) }))
      .sort((a, b) => b.wallMs - a.wallMs || b.count - a.count);
    report.segments[name] = {
      posts: seg.posts, stmts: seg.stmts, dbWallMs: Math.round(seg.wallMs), stmtWallMs: Math.round(seg.stmtWallMs),
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

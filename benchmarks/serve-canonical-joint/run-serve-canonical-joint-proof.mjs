// run-serve-canonical-joint-proof.mjs — the driver for the JOINT measurement
// (serve-canonical-joint lane, 2026-10-04): the REAL serving-line worker
// (deploy/bunny-worker-src/bunny-edge-engine-handler.ts behind node:http via
// the committed benchmarks/one-trip-render/one-trip-serving-line-worker.ts
// bundle) against the CANONICAL-SHAPE DB copy, both postures (one-trip OFF /
// ON), cache stack unarmed + requests cookieless (cache BYPASSED).
//
// Measures per page, OFF vs ON: byte-identity (modulo normalizeSlotIds),
// wire round trips (one stub POST = one BunnyDbDriver query/batch = ONE round
// trip — the serving-line lane's counting boundary), and LOCAL wall ms
// (labeled LOCAL; never compared to the wire visitor bar).
//
// Page set: the 5 one-trip probe pages PLUS a 17-page spread — the
// cold-latency-rig lane's 12-page spread (direct comparability with the
// canonical-vs-dump table) + 5 new pages chosen by the same content-weight
// rule (heaviest live page in deck, next skin page, two mid, one light-mid),
// each verified live (trash=0) in the canonical copy before the run.
//
// The ON store is PRECOMPUTED for all 22 pages (a page the store cannot
// describe degrades to the normal path per render-gate.ts §graceful — the
// joint question needs the full-strength ON posture).
//
// Usage: node run-serve-canonical-joint-proof.mjs [outdir]
// Prerequisites: node_modules junction; committed worker bundle
// one-trip-render/one-trip-serving-line-worker.mjs; canonical DB copy verified
// by verify-canonical-db-copy.mjs (run that first).
//
// POSITION-STRATIFIED EXTENSION (position-stratified-trips lane, 2026-10-04):
// the joint-measurement auditor proved trip counts are plan-position-dependent,
// not page-intrinsic (the layout warm-up chase, MAX_WARMUP_ROUNDS=60,
// prefetch.ts:75/:1448). This driver now runs TWO phases per posture:
//   - IN-PLAN: the original 45-GET plan (/_status + 22 cold + 22 warm) — the
//     per-page numbers are plan-sequence RECORDS (each page at its plan
//     ordinal, warm-up state inherited from every earlier request), not
//     page-intrinsic constants.
//   - FIRST-POSITION: one FRESH worker process PER PAGE (single-path plan),
//     so each page is also measured as the first render of a fresh engine —
//     a real visitor's first hit. That column is the visitor-bar number.
// The report lands in position-stratified-posture-report.json; the joint
// lane's committed serve-canonical-joint-posture-report.json is a record of
// THAT lane's run and is never overwritten here.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MIRROR = join(HERE, "canonical-production-order.sqlite3");
const OUT_ROOT = process.argv[2] ?? join(HERE, "proof-run");
const PROBE_PAGES = ["Home", "Aikido", "About", "Eagle", "Taking_Stock"];
const SPREAD_PAGES = [
  // the cold-latency-rig lane's 12-page spread (same names, same corpus rows)
  "Laundry", "Aikido Oak Cliff", "1145", "Academic CV BW",
  "slate skin customized", "kombucha", "peace", "NorthBayAikidoGlossary",
  "UCOoPHTML", "Gopher Tuna", "AAR 2011 SF Schedule", "Aiki Peace Week 2010 Results",
  // 5 new, content-weight rule (see file header): heaviest, 2nd skin, mid x2, light-mid
  "The_Dojo_The_layout_and_structure_of_a_place_of_training",
  "litera skin customized",
  "Dave_Lowry_What_Puts_the_Tao_in_the_Dojo",
  "PLflier",
  "Jumonville Randori Handout 201002v1",
];
const PAGES = [...PROBE_PAGES, ...SPREAD_PAGES];
const PORT_OFF = 3191;
const PORT_ON = 3192;
const WORKER_MJS = join(REPO, "benchmarks", "one-trip-render", "one-trip-serving-line-worker.mjs");
const BUILDER_ENTRY_TS = join(HERE, "build-store-for-serve-canonical-joint.entry.ts");
const BUILDER_MJS = join(HERE, "build-store-for-serve-canonical-joint.entry.mjs");
const STORE_PATH = join(OUT_ROOT, "one-trip-store.serve-canonical-joint.sqlite3");
// Position-stratified report (this lane). The joint lane's committed
// serve-canonical-joint-posture-report.json is that run's record — never
// overwritten by this driver.
const REPORT_PATH = join(HERE, "position-stratified-posture-report.json");
// First-position runs: one fresh worker per page per posture; distinct ports
// per run so no listener ever races a predecessor's socket teardown.
const FIRST_POSITION_PORT_BASE = { off: 3195, on: 3295 };

const PLAN_PATHS = [
  "/_status",
  ...PAGES.map((name) => `/${encodeURI(name)}`),
  ...PAGES.map((name) => `/${encodeURI(name)}`),
];

const die = (message) => {
  console.error(`PROOF FAILED: ${message}`);
  process.exit(1);
};

// --- bundle the 22-page builder entry when its .mjs output is absent --------
async function ensureBundles() {
  if (existsSync(BUILDER_MJS)) return;
  const require = createRequire(import.meta.url);
  const esbuild = require("esbuild");
  await esbuild.build({
    entryPoints: [BUILDER_ENTRY_TS],
    outfile: BUILDER_MJS,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    external: ["better-sqlite3"],
    sourcemap: false,
    logLevel: "silent",
  });
  console.log("bundled 22-page store builder with esbuild");
}

function runNode(script, args, { cwd = REPO, timeoutMs = 20 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`timeout waiting for ${script} ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/** Spawn the worker for one posture, wait for its SERVING line, run the GET
 *  plan, then wait for its self-exit. Returns per-request records. `paths` is
 *  the full request plan for THIS worker process (the 45-GET in-plan plan, or
 *  a single-page plan for a first-position run). */
async function runPosture({ label, port, posture, storePath, planFile, runDir, paths }) {
  mkdirSync(runDir, { recursive: true });
  const child = spawn(process.execPath, [
    WORKER_MJS,
    "--port", String(port),
    "--posture", posture,
    "--mirror", MIRROR,
    "--plan", planFile,
    "--out-dir", runDir,
    ...(storePath ? ["--store", storePath] : []),
  ], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const serving = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`worker ${label} never reported SERVING; stderr: ${stderr}`)), 120_000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("SERVING")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`worker ${label} exited early code=${code}; stderr: ${stderr}`)); });
  });
  await serving;

  const requests = [];
  for (const [planIndex, path] of paths.entries()) {
    const startedAt = Date.now();
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = Buffer.from(await response.arrayBuffer());
    // Instrument-honesty cross-check: the worker's own position header must
    // name exactly the plan slot this loop iteration is serving.
    const workerPlanIndex = Number(response.headers.get("x-decko-serve-plan-index") ?? "-1");
    if (workerPlanIndex !== planIndex) {
      die(`worker ${label} plan-index drift: worker says ${workerPlanIndex}, driver served slot ${planIndex} (${path})`);
    }
    requests.push({
      path,
      planIndex,
      planPosition: response.headers.get("x-decko-serve-plan-position") ?? "",
      status: response.status,
      wallMs: Date.now() - startedAt,
      trips: Number(response.headers.get("x-decko-serve-trips") ?? "-1"),
      statements: Number(response.headers.get("x-decko-serve-statements") ?? "-1"),
      bytes: body.byteLength,
      contentType: response.headers.get("content-type") ?? "",
    });
    writeFileSync(join(runDir, `${requests.length - 1}-${path.replace(/[^A-Za-z0-9]+/g, "_")}.body`), body);
  }
  const exit = await new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  if (exit.code !== 0) {
    die(`worker ${label} exited code=${exit.code} signal=${exit.signal}; stderr: ${stderr}`);
  }
  return requests;
}

// --- main --------------------------------------------------------------------
rmSync(OUT_ROOT, { recursive: true, force: true });
mkdirSync(OUT_ROOT, { recursive: true });
await ensureBundles();

if (!existsSync(MIRROR)) die(`canonical copy missing: ${MIRROR} (run verify-canonical-db-copy.mjs first)`);
if (!existsSync(WORKER_MJS)) die(`committed worker bundle missing: ${WORKER_MJS}`);

// The plan file both workers serve (identical sequence = like-for-like).
const planFile = join(OUT_ROOT, "plan.json");
writeFileSync(planFile, JSON.stringify({ paths: PLAN_PATHS }, null, 2));
const pagesFile = join(OUT_ROOT, "pages.json");
writeFileSync(pagesFile, JSON.stringify(PAGES, null, 2));

// Phase 1 — the PRECOMPUTE (the store is never built at render time), for
// ALL 22 pages (full-strength ON posture).
console.log("building one-trip store for 22 pages from the canonical copy (precompute)...");
const build = await runNode(BUILDER_MJS, [STORE_PATH, MIRROR, pagesFile], { timeoutMs: 10 * 60_000 });
if (build.code !== 0) die(`store builder exited code=${build.code}; stderr: ${build.stderr}`);
const buildReport = JSON.parse(build.stdout.trim().split("\n").pop());
console.log(`store built in ${buildReport.buildMs} ms`);
writeFileSync(join(OUT_ROOT, "store-build-report.json"), JSON.stringify(buildReport, null, 2));

// Phase 2 — posture OFF (the deployed default; gate env absent), IN-PLAN.
console.log("booting serving-line worker posture=OFF (in-plan 45-GET sequence)...");
const offRequests = await runPosture({
  label: "OFF", port: PORT_OFF, posture: "off", storePath: undefined,
  planFile, runDir: join(OUT_ROOT, "off"), paths: PLAN_PATHS,
});
console.log("OFF posture complete");

// Phase 3 — posture ON (DECKO_ONE_TRIP=1 + the 22-page store), IN-PLAN.
console.log("booting serving-line worker posture=ON (in-plan 45-GET sequence)...");
const onRequests = await runPosture({
  label: "ON", port: PORT_ON, posture: "on", storePath: STORE_PATH,
  planFile, runDir: join(OUT_ROOT, "on"), paths: PLAN_PATHS,
});
console.log("ON posture complete");

// Phase 4 — FIRST-POSITION: one FRESH worker process PER PAGE per posture
// (single-path plan), so each page is also measured as the first render of a
// fresh engine — a real visitor's first hit. Each worker boots its own deck,
// serves exactly one GET, and self-exits (no process ever killed).
const firstPosition = { off: {}, on: {} };
for (const posture of ["off", "on"]) {
  for (let i = 0; i < PAGES.length; i++) {
    const name = PAGES[i];
    const path = `/${encodeURI(name)}`;
    const planFile1 = join(OUT_ROOT, `plan-first-position-${posture}-${i}.json`);
    writeFileSync(planFile1, JSON.stringify({ paths: [path] }));
    const requests = await runPosture({
      label: `${posture.toUpperCase()} first-position "${name}"`,
      port: FIRST_POSITION_PORT_BASE[posture] + i,
      posture,
      storePath: posture === "on" ? STORE_PATH : undefined,
      planFile: planFile1,
      runDir: join(OUT_ROOT, `first-position-${posture}`, String(i)),
      paths: [path],
    });
    firstPosition[posture][name] = requests[0];
    console.log(`first-position ${posture} "${name}": position=${requests[0].planPosition} trips=${requests[0].trips} statements=${requests[0].statements} wall=${requests[0].wallMs}ms`);
  }
}
console.log("FIRST-POSITION phase complete (44 fresh-engine single-page runs)");

// --- grade --------------------------------------------------------------------
const normalizeSlotIds = (html) => html
  .replace(/data-slot-id=&quot;[0-9a-f]{20}&quot;/g, "data-slot-id=SLOTID")
  .replace(/data-slot-id=(["'])[0-9a-f]{20}\1/g, 'data-slot-id="SLOTID"');

const slug = (path) => path.replace(/[^A-Za-z0-9]+/g, "_");
// Request layout: [0]=/_status, [1..22]=cold pass, [23..44]=warm pass.
const pages = PAGES.map((name, i) => {
  const path = `/${encodeURI(name)}`;
  const offCold = offRequests[1 + i];
  const onCold = onRequests[1 + i];
  const offWarm = offRequests[23 + i];
  const onWarm = onRequests[23 + i];
  const offBytes = readFileSync(join(OUT_ROOT, "off", `${1 + i}-${slug(path)}.body`), "utf8");
  const onBytes = readFileSync(join(OUT_ROOT, "on", `${1 + i}-${slug(path)}.body`), "utf8");
  return {
    name,
    kind: i < PROBE_PAGES.length ? "probe" : "spread",
    path,
    offStatus: offCold.status,
    onStatus: onCold.status,
    offBytes: offCold.bytes,
    onBytes: onCold.bytes,
    byteIdentical: normalizeSlotIds(offBytes) === normalizeSlotIds(onBytes),
    offColdTrips: offCold.trips,
    onColdTrips: onCold.trips,
    offWarmTrips: offWarm.trips,
    onWarmTrips: onWarm.trips,
    offColdWallMs: offCold.wallMs,
    onColdWallMs: onCold.wallMs,
    offWarmWallMs: offWarm.wallMs,
    onWarmWallMs: onWarm.wallMs,
    gate: {
      coldOnLeColdOff: onCold.trips <= offCold.trips,
      warmOnLeWarmOff: onWarm.trips <= offWarm.trips,
      statusOk: offCold.status === 200 && onCold.status === 200,
    },
  };
});

const statusEntry = { off: offRequests[0], on: onRequests[0] };

// ON/OFF cold composition (attach + one-trip data fetch + residue) from the
// workers' own per-request statement logs (requests.jsonl, written by each
// worker; one line per planned request, in plan order).
const readLog = (runDir) => readFileSync(join(runDir, "requests.jsonl"), "utf8")
  .trim().split("\n").map((line) => JSON.parse(line));
const onLog = readLog(join(OUT_ROOT, "on"));
const offLog = readLog(join(OUT_ROOT, "off"));
for (let i = 0; i < PAGES.length; i++) {
  const onColdLog = onLog[1 + i];
  pages[i].onColdAttach = onColdLog.attach;
  pages[i].onColdDataFetch = onColdLog.dataFetch;
  pages[i].onColdResidue = onColdLog.other;
  pages[i].offColdAttach = offLog[1 + i].attach;
  pages[i].offColdDataFetch = offLog[1 + i].dataFetch;
  pages[i].offColdResidue = offLog[1 + i].other;
}

const allStatusOk = pages.every((p) => p.gate.statusOk);
const identityCount = pages.filter((p) => p.byteIdentical).length;
const comparativeGate = pages.every((p) =>
  p.gate.coldOnLeColdOff && p.gate.warmOnLeWarmOff && p.gate.statusOk);

// --- position-stratified grading ----------------------------------------------
// The auditor's proof: trip counts are plan-position-dependent, not
// page-intrinsic. FIRST-POSITION (fresh engine, page is the very first render,
// engine boot + full warm-up chase inside the request) is a real visitor's
// first hit — that column is the visitor-bar number. IN-PLAN (the 45-GET
// sequence: /_status boots, then each page at its ordinal with the warm-up
// state of every earlier request inherited) is a plan-sequence RECORD.
const stratified = PAGES.map((name, i) => {
  const offFirst = firstPosition.off[name];
  const onFirst = firstPosition.on[name];
  const offFirstBody = readFileSync(join(OUT_ROOT, "first-position-off", String(i), `0-${slug(`/${encodeURI(name)}`)}.body`), "utf8");
  const onFirstBody = readFileSync(join(OUT_ROOT, "first-position-on", String(i), `0-${slug(`/${encodeURI(name)}`)}.body`), "utf8");
  // Ledger visitor-bar arithmetic, PREDICTED only: measured trips x 66 ms/trip
  // (the ledger's own ruler; LOCAL ms never used; zero live requests made).
  return {
    name,
    kind: i < PROBE_PAGES.length ? "probe" : "spread",
    inPlanOrdinal: i + 1, // page ordinal within the cold pass; overall plan slot = 1 + i (after /_status)
    off: {
      firstPosition: { planPosition: offFirst.planPosition, status: offFirst.status, trips: offFirst.trips, statements: offFirst.statements, wallMs: offFirst.wallMs },
      inPlan: { coldTrips: pages[i].offColdTrips, coldStatements: pages[i].offColdResidue + pages[i].offColdDataFetch + pages[i].offColdAttach, coldWallMs: pages[i].offColdWallMs, warmTrips: pages[i].offWarmTrips },
    },
    on: {
      firstPosition: { planPosition: onFirst.planPosition, status: onFirst.status, trips: onFirst.trips, statements: onFirst.statements, wallMs: onFirst.wallMs },
      inPlan: { coldTrips: pages[i].onColdTrips, coldStatements: pages[i].onColdResidue + pages[i].onColdDataFetch + pages[i].onColdAttach, coldWallMs: pages[i].onColdWallMs, warmTrips: pages[i].onWarmTrips },
    },
    firstPositionByteIdentical: normalizeSlotIds(offFirstBody) === normalizeSlotIds(onFirstBody),
    visitorBarPredicted: {
      // PREDICTED wire at the ledger's 66 ms/trip ruler ONLY.
      offFirstPositionTrips: offFirst.trips,
      offFirstPositionPredictedWireMs: offFirst.trips * 66,
      onFirstPositionTrips: onFirst.trips,
      onFirstPositionPredictedWireMs: onFirst.trips * 66,
      onMeets22TripBarFirstPosition: onFirst.trips <= 22,
    },
  };
});
const firstPositionIdentityCount = stratified.filter((p) => p.firstPositionByteIdentical).length;
const firstPositionAllStatusOk = stratified.every((p) => p.off.firstPosition.status === 200 && p.on.firstPosition.status === 200);

const report = {
  lane: "position-stratified-trips (extends the serve-canonical-joint driver; same worker, same corpus, same boundary)",
  generatedAt: new Date().toISOString(),
  servingSurface: "deploy/bunny-worker-src/bunny-edge-engine-handler.ts @ 921906fa (via committed benchmarks/one-trip-render/one-trip-serving-line-worker.ts bundle, position-instrumented)",
  localBoot: "node:http on 127.0.0.1; BunnyDbDriver Hrana seam stubbed over LocalSqliteDriver on the CANONICAL-SHAPE DB copy (canonical-production-order.sqlite3, verified by verify-canonical-db-copy.mjs: 12 user tables / 33 index objects, 21,670 cards + 48,525 refs, row digests match the build lane's cross-lane values); one posture per PROCESS; FIRST-POSITION runs are additionally one PROCESS PER PAGE (fresh engine each); cache stack UNARMED (DECKO_EDGE_CACHE absent) and requests cookieless = cache BYPASSED",
  tripsBoundary: "one stub POST = one BunnyDbDriver query/batch call = ONE wire round trip (the serving-line lane's counting boundary)",
  positionSemantics: {
    firstPosition: "the page is the FIRST render of a FRESH engine process (engine boot + layout warm-up chase, MAX_WARMUP_ROUNDS=60, land inside the request) — a real visitor's first hit; the visitor-bar column",
    inPlan: "the page at its ordinal in the 45-GET plan (/_status first — it boots the deck per handler.ts statusResponse getDeck; every page hit inherits the warm-up state of all earlier requests) — a plan-sequence RECORD, not a page-intrinsic constant",
    why: "the joint-measurement auditor proved trip counts are plan-position-dependent (slate OFF: 24 trips as the 10th in-plan request vs 567 as a fresh engine's first render); per-page tables without position lie by omission",
  },
  corpus: "21,670-card serving deck (backup dump-postscrub.sqlite3 sha 623f5fcb..., imported schema-first into the canonical shape by the canonical-shape build lane; rows verified by digest)",
  probePages: PROBE_PAGES,
  spreadPages: SPREAD_PAGES,
  requestPlan: PLAN_PATHS,
  statusRequests: statusEntry,
  store: {
    path: STORE_PATH,
    buildMs: buildReport.buildMs,
    liveCards: buildReport.report?.liveCards ?? null,
    edges: buildReport.report?.edges ?? null,
    pageClosures: buildReport.report?.pages ?? null,
  },
  pages,
  positionStratified: stratified,
  verdict: {
    allStatusOk: allStatusOk && firstPositionAllStatusOk,
    inPlanByteIdentity: `${identityCount}/${pages.length}`,
    inPlanByteIdenticalPages: pages.filter((p) => !p.byteIdentical).map((p) => p.name),
    firstPositionByteIdentity: `${firstPositionIdentityCount}/${stratified.length}`,
    firstPositionByteIdenticalPages: stratified.filter((p) => !p.firstPositionByteIdentical).map((p) => p.name),
    servingLineComparativeGate: comparativeGate,
    note: "LOCAL wall ms is a stub-seam local number, never comparable to the wire visitor bar. " +
      "The visitor-bar arithmetic in positionStratified[].visitorBarPredicted is PREDICTED at the ledger's " +
      "66 ms/trip ruler only (trips x 66). Per-page IN-PLAN numbers are plan-sequence records, not " +
      "page-intrinsic constants; the visitor-bar column is FIRST-POSITION.",
  },
};
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.verdict));
console.log(`report: ${REPORT_PATH}`);
if (!allStatusOk || !firstPositionAllStatusOk) {
  process.exit(1);
}
console.log("RUN COMPLETE (all pages 200 in both postures, in-plan AND first-position; verdict booleans recorded above)");

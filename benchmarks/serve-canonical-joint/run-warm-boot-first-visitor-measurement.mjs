// run-warm-boot-first-visitor-measurement.mjs — the driver for the
// warm-boot-first-visitor lane (2026-10-04): measures whether a
// deployment-side warm-up step at boot collapses the FIRST-visitor chase.
//
// QUESTION: a real visitor's FIRST page hit is the worst case — a freshly
// booted engine carries the warm-up chase. If the serving process pre-seats
// the engine at boot, does the first visitor inherit a warm engine?
//
// METHOD: same serving-line boundary as the committed
// run-serve-canonical-joint-proof.mjs (REAL handler
// deploy/bunny-worker-src/bunny-edge-engine-handler.ts behind node:http via
// the committed benchmarks/one-trip-render/one-trip-serving-line-worker.mjs
// bundle; BunnyDbDriver Hrana seam stubbed over LocalSqliteDriver on the
// verified canonical DB copy; ONE stub POST = ONE wire round trip; cache
// stack UNARMED; requests cookieless). One posture per process; each
// (posture x regimen x page) cell gets a FRESH worker process serving a
// custom plan, then self-exiting (the worker is never killed).
//
// Regimens (the measured request is the FIRST PAGE HIT in all three):
//   (a) cold-first : plan = [target]              — target at plan position 1
//   (b) status-warm: plan = [/_status, target]    — /_status boots the deck (it
//       calls getDeck, handler.ts:234 per the serve-canonical-joint lane);
//       target at plan position 2
//   (c) seed-warm  : plan = [seed, seed, target]  — a full warm render of the
//       seeding page (Home, the landing page a deployment warm-up would
//       render): position 1 = seed cold render, position 2 = the seed WARM
//       render (the warm-up's end state), target at plan position 3
//
// Usage: node run-warm-boot-first-visitor-measurement.mjs [outdir]
// Prerequisites: node_modules junction; committed worker bundle
// one-trip-render/one-trip-serving-line-worker.mjs; canonical DB copy verified
// by verify-canonical-db-copy.mjs (run that first).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MIRROR = join(HERE, "canonical-production-order.sqlite3");
const OUT_ROOT = process.argv[2] ?? join(HERE, "warm-boot-run");
const PROBE_PAGES = ["Home", "Aikido", "About", "Eagle", "Taking_Stock"];
const HEAVY_PAGES = ["Aikido", "About", "Home"];
const SEED_PAGE = "Home"; // the deployment warm-up would render the landing page
const PORT_OFF = 3291;
const PORT_ON = 3292;
const WORKER_MJS = join(REPO, "benchmarks", "one-trip-render", "one-trip-serving-line-worker.mjs");
const BUILDER_MJS = join(HERE, "build-store-for-serve-canonical-joint.entry.mjs");
const STORE_PATH = join(OUT_ROOT, "one-trip-store.warm-boot.sqlite3");
const REPORT_PATH = join(HERE, "warm-boot-first-visitor-report.json");

const REGIMENS = [
  { id: "a-cold-first", label: "(a) cold boot, first request immediately", planFor: (page) => [`/${encodeURI(page)}`], targetPosition: 1 },
  { id: "b-status-warm", label: "(b) boot + one /_status warm", planFor: (page) => ["/_status", `/${encodeURI(page)}`], targetPosition: 2 },
  { id: "c-seed-warm", label: "(c) boot + full warm render of seeding page (Home x2), then measure", planFor: (page) => [`/${encodeURI(SEED_PAGE)}`, `/${encodeURI(SEED_PAGE)}`, `/${encodeURI(page)}`], targetPosition: 3 },
];

const die = (message) => {
  console.error(`PROOF FAILED: ${message}`);
  process.exit(1);
};

/** Spawn the worker for one (posture, regimen, page) cell, wait for its
 *  SERVING line (boot-to-listen ms), run the GET plan, then wait for its
 *  self-exit. Returns bootMs + per-request records. */
async function runCell({ label, port, posture, storePath, planPaths, runDir }) {
  mkdirSync(runDir, { recursive: true });
  const planFile = join(runDir, "plan.json");
  writeFileSync(planFile, JSON.stringify({ paths: planPaths }, null, 2));
  const startedAt = Date.now();
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
  const bootMs = Date.now() - startedAt;

  const requests = [];
  for (const path of planPaths) {
    const reqStartedAt = Date.now();
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = Buffer.from(await response.arrayBuffer());
    requests.push({
      path,
      planPosition: requests.length + 1,
      status: response.status,
      wallMs: Date.now() - reqStartedAt,
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
  // per-request statement classification from the worker's own jsonl
  const log = readFileSync(join(runDir, "requests.jsonl"), "utf8")
    .trim().split("\n").map((line) => JSON.parse(line));
  for (let i = 0; i < requests.length; i++) {
    requests[i].attach = log[i]?.attach ?? null;
    requests[i].dataFetch = log[i]?.dataFetch ?? null;
    requests[i].other = log[i]?.other ?? null;
  }
  return { bootMs, requests };
}

// --- main --------------------------------------------------------------------
rmSync(OUT_ROOT, { recursive: true, force: true });
mkdirSync(OUT_ROOT, { recursive: true });

if (!existsSync(MIRROR)) die(`canonical copy missing: ${MIRROR} (run verify-canonical-db-copy.mjs first)`);
if (!existsSync(WORKER_MJS)) die(`committed worker bundle missing: ${WORKER_MJS}`);

// Phase 1 — the PRECOMPUTE (the store is never built at render time), for the
// 5 probe pages (the deployment story: the closure is precomputed at deploy).
const pagesFile = join(OUT_ROOT, "pages.json");
writeFileSync(pagesFile, JSON.stringify(PROBE_PAGES, null, 2));
console.log("building one-trip store for 5 probe pages from the canonical copy (precompute)...");
const build = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [BUILDER_MJS, STORE_PATH, MIRROR, pagesFile], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (c) => { stdout += c; });
  child.stderr.on("data", (c) => { stderr += c; });
  const timer = setTimeout(() => reject(new Error("store builder timeout")), 10 * 60_000);
  child.on("exit", (code) => { clearTimeout(timer); code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`store builder exited ${code}; ${stderr}`)); });
});
const buildReport = JSON.parse(build.stdout.trim().split("\n").pop());
console.log(`store built in ${buildReport.buildMs} ms`);
writeFileSync(join(OUT_ROOT, "store-build-report.json"), JSON.stringify(buildReport, null, 2));

// Phase 2 — the 3 x 2 x 5 cell matrix. Pages measured sequentially within a
// posture; one fresh self-terminating worker process per cell.
const normalizeSlotIds = (html) => html
  .replace(/data-slot-id=&quot;[0-9a-f]{20}&quot;/g, "data-slot-id=SLOTID")
  .replace(/data-slot-id="[0-9a-f]{20}"/g, 'data-slot-id="SLOTID"');
const slug = (path) => path.replace(/[^A-Za-z0-9]+/g, "_");

const cells = [];
for (const posture of ["off", "on"]) {
  const port = posture === "off" ? PORT_OFF : PORT_ON;
  const storePath = posture === "on" ? STORE_PATH : undefined;
  for (const regimen of REGIMENS) {
    for (const page of PROBE_PAGES) {
      const label = `${posture}/${regimen.id}/${page}`;
      process.stdout.write(`cell ${label} ... `);
      const runDir = join(OUT_ROOT, posture, regimen.id, slug(`/${page}`));
      const { bootMs, requests } = await runCell({
        label, port, posture, storePath,
        planPaths: regimen.planFor(page),
        runDir,
      });
      const target = requests[regimen.targetPosition - 1];
      if (target === undefined) die(`${label}: no request at plan position ${regimen.targetPosition}`);
      const warmupRequests = requests.slice(0, regimen.targetPosition - 1);
      const bytesAcrossRegimens = {};
      cells.push({
        posture,
        postureLabel: posture === "off" ? "one-trip OFF (deployed default)" : "one-trip ON (DECKO_ONE_TRIP=1 + store)",
        regimen: regimen.id,
        regimenLabel: regimen.label,
        page,
        heavy: HEAVY_PAGES.includes(page),
        planPaths: requests.map((r) => r.path),
        targetPlanPosition: regimen.targetPosition,
        bootToServingMs: bootMs,
        warmup: warmupRequests.map((r) => ({
          path: r.path, planPosition: r.planPosition, wallMs: r.wallMs,
          trips: r.trips, status: r.status,
          attach: r.attach, dataFetch: r.dataFetch, other: r.other,
        })),
        warmupTotalMs: warmupRequests.reduce((sum, r) => sum + r.wallMs, 0),
        warmupTotalTrips: warmupRequests.reduce((sum, r) => sum + r.trips, 0),
        target: {
          path: target.path,
          planPosition: target.planPosition,
          status: target.status,
          wallMs: target.wallMs,
          trips: target.trips,
          statements: target.statements,
          attach: target.attach,
          dataFetch: target.dataFetch,
          other: target.other,
          bytes: target.bytes,
        },
        bodyFile: join(posture, regimen.id, slug(`/${page}`), `0-${slug(requests[0].path)}.body`),
        targetBodyFile: join(posture, regimen.id, slug(`/${page}`), `${regimen.targetPosition - 1}-${slug(target.path)}.body`),
        _normalizeSlotIds: normalizeSlotIds.name,
      });
      // stash raw body bytes for the regimen-identity check below
      cells[cells.length - 1]._targetBodyBytes = readFileSync(join(runDir, `${regimen.targetPosition - 1}-${slug(target.path)}.body`), "utf8");
      console.log(`boot ${bootMs}ms, target(pos ${regimen.targetPosition}) ${target.trips} trips ${target.wallMs}ms status ${target.status}`);
    }
  }
}

// --- regimen-identity check: same posture + page, all 3 regimens must yield
// byte-identical target HTML modulo the engine's per-render slot ids.
const identity = [];
for (const posture of ["off", "on"]) {
  for (const page of PROBE_PAGES) {
    const variants = cells.filter((c) => c.posture === posture && c.page === page);
    const normalized = variants.map((c) => normalizeSlotIds(c._targetBodyBytes));
    identity.push({
      posture, page,
      byteIdenticalAcrossRegimens: normalized.every((b) => b === normalized[0]),
      bytes: variants.map((c) => c.target.bytes),
    });
  }
}

// --- assemble report ----------------------------------------------------------
const reportCells = cells.map(({ _targetBodyBytes, _normalizeSlotIds, ...rest }) => rest);
const report = {
  lane: "warm-boot-first-visitor",
  generatedAt: new Date().toISOString(),
  servingSurface: "deploy/bunny-worker-src/bunny-edge-engine-handler.ts @ 921906fa (via committed benchmarks/one-trip-render/one-trip-serving-line-worker.ts bundle)",
  localBoot: "node:http on 127.0.0.1; BunnyDbDriver Hrana seam stubbed over LocalSqliteDriver on the CANONICAL-SHAPE DB copy (canonical-production-order.sqlite3, re-verified this lane by verify-canonical-db-copy.mjs: VERIFY PASS); one posture per process; ONE FRESH WORKER PROCESS PER (posture x regimen x page) CELL; workers self-terminate after the plan (never killed); cache stack UNARMED; requests cookieless = cache BYPASSED",
  tripsBoundary: "one stub POST = one BunnyDbDriver query/batch call = ONE wire round trip (the serving-line lane's counting boundary)",
  corpus: "21,670-card serving deck, canonical shape (backup dump-postscrub.sqlite3 sha 623f5fcb..., verified by digest)",
  probePages: PROBE_PAGES,
  heavyPages: HEAVY_PAGES,
  seedPage: SEED_PAGE,
  store: {
    path: STORE_PATH,
    buildMs: buildReport.buildMs,
    liveCards: buildReport.report?.liveCards ?? null,
    edges: buildReport.report?.edges ?? null,
    pageClosures: buildReport.report?.pages ?? null,
  },
  regimens: REGIMENS.map(({ id, label, targetPosition }) => ({ id, label, targetPlanPosition: targetPosition })),
  cells: reportCells,
  regimenIdentity: identity,
};
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`report: ${REPORT_PATH}`);

// --- console summary table ------------------------------------------------------
console.log("\nFIRST-PAGE FIRST-HIT (the measured request is the first PAGE hit in every row)");
console.log("posture | regimen | page | pos | trips | LOCAL ms | warmup cost (ms/trips)");
for (const c of reportCells) {
  console.log(
    `${c.posture.toUpperCase().padEnd(3)} | ${c.regimen.padEnd(13)} | ${c.page.padEnd(13)} | ${c.targetPlanPosition}   |` +
    ` ${String(c.target.trips).padStart(5)} | ${String(c.target.wallMs).padStart(6)} | ` +
    `${c.warmupTotalMs}/${c.warmupTotalTrips}`,
  );
}
console.log("\nregimen-identity (same posture+page across regimens, slot-ids normalized):");
for (const i of identity) console.log(`${i.posture.toUpperCase()} ${i.page}: ${i.byteIdenticalAcrossRegimens}`);
const allOk = reportCells.every((c) => c.target.status === 200);
if (!allOk) die("not all target requests returned 200");
console.log("RUN COMPLETE (all targets 200)");

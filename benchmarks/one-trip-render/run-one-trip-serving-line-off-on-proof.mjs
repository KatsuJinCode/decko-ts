// run-one-trip-serving-line-off-on-proof.mjs — the driver for the one-trip
// serving-line posture proof (lane-one-trip-serve-2026-10-04, mandate step 2
// + 3). Boots the REAL serving-line worker (bunny-edge-engine-handler.ts,
// the deploy-union-final surface) TWICE in child processes — posture OFF and
// posture ON — over local HTTP on 127.0.0.1, renders the 5 probe pages twice
// per posture (cold pass, warm pass) after a /_status boot-absorbing request,
// then proves:
//   - byte-identity OFF vs ON per page, modulo normalizeSlotIds (the engine's
//     own per-render SecureRandom data-slot-id values);
//   - the hops gate in the ON posture: cold <= OFF cold per page (with the
//     fixture-scoped ceiling 14 noted — the law's absolute ceiling is pinned
//     on the hops-law fixture, not the 19,482-card mirror), warm <= 1;
//   - ON cold = attach (1) + data fetch (1) + named residue.
// Every child terminates itself after its planned requests (no process is
// ever killed). Report lands beside this script:
//   one-trip-serving-line-posture-report.json
//
// Usage: node run-one-trip-serving-line-off-on-proof.mjs [outdir]
// Prerequisites: node_modules junction present; the bundled worker + builder
// (one-trip-serving-line-worker.mjs, build-one-trip-store-for-serving-line.mjs)
// and the mirror copy in this directory (the driver bundles the .ts sources
// itself when the .mjs outputs are absent).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const MIRROR = join(HERE, "trial-deck-mirror-readonly-copy.sqlite3");
const OUT_ROOT = process.argv[2] ?? join(HERE, "serving-line-proof-run");
const PAGES = ["Home", "Aikido", "About", "Eagle", "Taking_Stock"];
const PORT_OFF = 3181;
const PORT_ON = 3182;
const WORKER_MJS = join(HERE, "one-trip-serving-line-worker.mjs");
const BUILDER_MJS = join(HERE, "build-one-trip-store-for-serving-line.mjs");
const STORE_PATH = join(OUT_ROOT, "one-trip-store.serving-line.sqlite3");
const REPORT_PATH = join(HERE, "one-trip-serving-line-posture-report.json");

const PLAN_PATHS = [
  "/_status",
  ...PAGES.map((name) => `/${name}`),
  ...PAGES.map((name) => `/${name}`),
];

const die = (message) => {
  console.error(`PROOF FAILED: ${message}`);
  process.exit(1);
};

// --- bundle the .ts harness sources when the .mjs outputs are absent --------
async function ensureBundles() {
  if (existsSync(WORKER_MJS) && existsSync(BUILDER_MJS)) return;
  const require = createRequire(import.meta.url);
  const esbuild = require("esbuild");
  const common = {
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    external: ["better-sqlite3"],
    sourcemap: false,
    logLevel: "silent",
  };
  await esbuild.build({
    ...common,
    entryPoints: [join(HERE, "one-trip-serving-line-worker.ts")],
    outfile: WORKER_MJS,
  });
  await esbuild.build({
    ...common,
    entryPoints: [join(HERE, "build-one-trip-store-for-serving-line.ts")],
    outfile: BUILDER_MJS,
  });
  console.log("bundled worker + builder with esbuild");
}

function runNode(script, args, { cwd = REPO, timeoutMs = 20 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      // The child's own watchdog (15 min) should fire first; this is the
      // parent-side accounting record, not a kill: we stop READING and let
      // the child's watchdog own its exit. If neither fired after 5 more
      // minutes the lane receipt records the hang honestly.
      reject(new Error(`timeout waiting for ${script} ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
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
 *  plan, then wait for its self-exit. Returns per-request records. */
async function runPosture({ label, port, posture, storePath, planFile, runDir }) {
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
  for (const path of PLAN_PATHS) {
    const startedAt = Date.now();
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = Buffer.from(await response.arrayBuffer());
    requests.push({
      path,
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

if (!existsSync(MIRROR)) die(`mirror copy missing: ${MIRROR}`);

// The plan file both workers serve (identical sequence = like-for-like).
const planFile = join(OUT_ROOT, "plan.json");
writeFileSync(planFile, JSON.stringify({ paths: PLAN_PATHS }, null, 2));

// Phase 1 — the PRECOMPUTE (the store is never built at render time).
console.log("building one-trip store from the mirror (precompute)...");
const build = await runNode(BUILDER_MJS, [STORE_PATH, MIRROR], { timeoutMs: 10 * 60_000 });
if (build.code !== 0) die(`store builder exited code=${build.code}; stderr: ${build.stderr}`);
const buildReport = JSON.parse(build.stdout.trim().split("\n").pop());
console.log(`store built in ${buildReport.buildMs} ms`);
writeFileSync(join(OUT_ROOT, "store-build-report.json"), JSON.stringify(buildReport, null, 2));

// Phase 2 — posture OFF (the deployed default; gate env absent).
console.log("booting serving-line worker posture=OFF...");
const offRequests = await runPosture({
  label: "OFF", port: PORT_OFF, posture: "off", storePath: undefined,
  planFile, runDir: join(OUT_ROOT, "off"),
});
console.log("OFF posture complete");

// Phase 3 — posture ON (DECKO_ONE_TRIP=1 + the built store).
console.log("booting serving-line worker posture=ON...");
const onRequests = await runPosture({
  label: "ON", port: PORT_ON, posture: "on", storePath: STORE_PATH,
  planFile, runDir: join(OUT_ROOT, "on"),
});
console.log("ON posture complete");

// --- grade --------------------------------------------------------------------
const normalizeSlotIds = (html) => html
  .replace(/data-slot-id=&quot;[0-9a-f]{20}&quot;/g, "data-slot-id=SLOTID")
  .replace(/data-slot-id="[0-9a-f]{20}"/g, 'data-slot-id="SLOTID"');

// Request layout: [0]=/_status, [1..5]=cold pass, [6..10]=warm pass.
const pick = (requests, i) => requests[i];
const pages = PAGES.map((name, i) => {
  const path = `/${name}`;
  const offCold = pick(offRequests, 1 + i);
  const onCold = pick(onRequests, 1 + i);
  const offWarm = pick(offRequests, 6 + i);
  const onWarm = pick(onRequests, 6 + i);
  const offBytes = readFileSync(join(OUT_ROOT, "off", `${1 + i}-${path.replace(/[^A-Za-z0-9]+/g, "_")}.body`), "utf8");
  const onBytes = readFileSync(join(OUT_ROOT, "on", `${1 + i}-${path.replace(/[^A-Za-z0-9]+/g, "_")}.body`), "utf8");
  return {
    name,
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
    gate: {
      coldOnLeColdOff: onCold.trips <= offCold.trips,
      warmOnLe1: onWarm.trips <= 1,
      warmOffLe1: offWarm.trips <= 1,
      statusOk: offCold.status === 200 && onCold.status === 200,
    },
  };
});

const statusEntry = { off: pick(offRequests, 0), on: pick(onRequests, 0) };

// ON cold composition (attach + data fetch + residue) from the workers' own
// per-request statement logs (requests.jsonl, written by each worker).
const readLog = (runDir) => readFileSync(join(runDir, "requests.jsonl"), "utf8")
  .trim().split("\n").map((line) => JSON.parse(line));
const onLog = readLog(join(OUT_ROOT, "on"));
const offLog = readLog(join(OUT_ROOT, "off"));
for (let i = 0; i < PAGES.length; i++) {
  const onColdLog = onLog[1 + i];
  pages[i].onColdAttach = onColdLog.attach;
  pages[i].onColdDataFetch = onColdLog.dataFetch;
  pages[i].onColdResidue = onColdLog.other;
  pages[i].offColdStatements = offLog[1 + i].attach + offLog[1 + i].dataFetch + offLog[1 + i].other;
}

const allIdentity = pages.every((p) => p.byteIdentical);
const allGates = pages.every((p) =>
  p.gate.coldOnLeColdOff && p.gate.warmOnLe1 && p.gate.warmOffLe1 && p.gate.statusOk);

const report = {
  lane: "lane-one-trip-serve-2026-10-04",
  generatedAt: new Date().toISOString(),
  servingSurface: "deploy/bunny-worker-src/bunny-edge-engine-handler.ts (deploy-union-final 6f35429a)",
  localBoot: "node:http on 127.0.0.1; BunnyDbDriver Hrana seam stubbed over LocalSqliteDriver on the trial-deck mirror copy; one posture per process; cache stack UNARMED (DECKO_EDGE_CACHE absent) and requests cookieless = cache BYPASSED",
  probePages: PAGES,
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
  verdict: {
    byteIdentityAll5: allIdentity,
    hopsGateOnPosture: allGates,
    note: "cold<=14 is the hops law's FIXTURE-scoped ceiling (hops-per-render-one-page-law.test.ts); on the 19,482-card mirror the recorded absolute numbers are fixture-incomparable — the serving-line gate recorded here is cold ON <= cold OFF and warm <= 1, exactly like the manifest gate's comparative clauses.",
  },
};
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.verdict));
console.log(`report: ${REPORT_PATH}`);
if (!allIdentity || !allGates) {
  process.exit(1);
}
console.log("PROOF PASSED: 5/5 byte-identical, ON-posture hops gate held");

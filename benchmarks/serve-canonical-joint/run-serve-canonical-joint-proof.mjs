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
const REPORT_PATH = join(HERE, "serve-canonical-joint-posture-report.json");

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

// Phase 2 — posture OFF (the deployed default; gate env absent).
console.log("booting serving-line worker posture=OFF...");
const offRequests = await runPosture({
  label: "OFF", port: PORT_OFF, posture: "off", storePath: undefined,
  planFile, runDir: join(OUT_ROOT, "off"),
});
console.log("OFF posture complete");

// Phase 3 — posture ON (DECKO_ONE_TRIP=1 + the 22-page store).
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

const report = {
  lane: "serve-canonical-joint",
  generatedAt: new Date().toISOString(),
  servingSurface: "deploy/bunny-worker-src/bunny-edge-engine-handler.ts @ ebc98b32 (via committed benchmarks/one-trip-render/one-trip-serving-line-worker.ts bundle)",
  localBoot: "node:http on 127.0.0.1; BunnyDbDriver Hrana seam stubbed over LocalSqliteDriver on the CANONICAL-SHAPE DB copy (canonical-production-order.sqlite3, verified by verify-canonical-db-copy.mjs: 12 user tables / 33 index objects, 21,670 cards + 48,525 refs, row digests match the build lane's cross-lane values); one posture per process; cache stack UNARMED (DECKO_EDGE_CACHE absent) and requests cookieless = cache BYPASSED",
  tripsBoundary: "one stub POST = one BunnyDbDriver query/batch call = ONE wire round trip (the serving-line lane's counting boundary)",
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
  verdict: {
    allStatusOk,
    byteIdentity: `${identityCount}/${pages.length}`,
    byteIdenticalPages: pages.filter((p) => !p.byteIdentical).map((p) => p.name),
    servingLineComparativeGate: comparativeGate,
    note: "LOCAL wall ms is a stub-seam local number, never comparable to the wire visitor bar. " +
      "The serving-line gate this run records is COMPARATIVE (cold ON <= cold OFF, warm ON <= warm OFF, " +
      "byte-identity count) plus the ON composition (attach + 1 data fetch + residue) per page.",
  },
};
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.verdict));
console.log(`report: ${REPORT_PATH}`);
if (!allStatusOk) {
  process.exit(1);
}
console.log("RUN COMPLETE (all pages 200 in both postures; verdict booleans recorded above)");

#!/usr/bin/env node
// walk-and-compare.mjs — the byte-for-byte / pixel-for-pixel walk comparison
// for the single live walk (reference-harness/live-walk, the walk instrument).
//
// Given two base URLs (ours + theirs) and a journey list, it walks every
// journey on both hosts and produces, per journey:
//   1. a byte-level response diff. Every normalization is a NAMED rule
//      (lib/normalize-exchange.mjs WALK_RULES: W1 session cookies, W2 csrf
//      tokens, W3 nonces, W4 timestamps, W5 http-dates, W6 etags, W7 url
//      tokens, plus the corpus instrument's html rules borrowed as N*, and
//      R1 capture redaction which always runs) — the report prints the whole
//      table with per-side application counts and how many raw differences
//      each rule absorbed. Nothing is normalized silently; the raw evidence
//      (full bodies, headers, screenshots) stays on disk beside every
//      verdict.
//   2. full-page screenshots of every journey page on both hosts with a
//      pixel diff: identical / pixel-delta (count + bounding regions) /
//      structural-difference — lib/pixel-diff.mjs, lib/png.mjs (own codec,
//      fail-closed).
// Output: <out>/report.md (human-readable verdict lines linking the
// evidence), <out>/report.json, and <out>/{a,b}/<journey>/... evidence trees.
//
// Usage:
//   node reference-harness/live-walk/walk-and-compare.mjs \
//     --journeys reference-harness/live-walk/prove/journeys.example.json \
//     (--engine-a reference-harness/browser/engines/ts.json --fixture-a reference-harness/fixtures/synthetic-v1 \
//      [--engine-b ... --fixture-b ...]           # LOCAL engine mode: boot both engines here
//      | --base-a http://127.0.0.1:PORT --base-b http://127.0.0.1:PORT) \
//     --out tmp/live-walk/<run-name> \
//     [--label-a ours --label-b theirs] [--filter <regex>] \
//     [--actors-json <file>] [--structural-fraction 0.5] [--pixel-tolerance 0] \
//     [--disable W6] [--session-cookie-name <name>]... [--include-third-party] \
//     [--allow-live-walk <hostname>]... [--offline]
//
// SAFETY CONTRACT (read before any live use):
//   - Engine mode only ever listens on 127.0.0.1 ports it picks itself.
//   - Base-URL mode refuses every non-loopback host unless that exact
//     hostname is passed as --allow-live-walk on the command line. The flag
//     is the operator's explicit, per-host, in-the-open yes; there is no
//     config file, environment variable or default that arms live traffic.
//   - The walked browser carries a route guard: only the loopback, the two
//     named hosts and the stock layout CDNs are reachable (--offline refuses
//     the CDNs too), so a walked page cannot wander to a third host.
//   - R1: passwords and session-cookie values are redacted at capture, before
//     anything is written to disk.
//
// The proof this instrument was developed against lives in prove/: two local
// ts-engine instances on slightly different deck states (the positive
// control), and two local mock hosts (the arbitrary-base-URL path). Nothing
// in this repository's proof sends a request to any live host.

import path from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEngine, startEngine } from "../browser/lib/engines.mjs";
import { walkJourney, launchWalkBrowser, assertWalkableBase } from "./lib/walker.mjs";
import { compareExchanges, compareShots } from "./lib/compare-walks.mjs";
import { walkRulesEnabled, WALK_RULES } from "./lib/normalize-exchange.mjs";
import { renderReport, buildJsonReport, journeyVerdict } from "./lib/report.mjs";
import { DEFAULT_STRUCTURAL_FRACTION } from "./lib/pixel-diff.mjs";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) {
        (args[name] ??= []).push(true);
      } else {
        (args[name] ??= []).push(argv[i + 1]);
        i++;
      }
    } else args._.push(a);
  }
  return { get: (k) => args[k]?.[0], list: (k) => args[k] ?? [], has: (k) => Array.isArray(args[k]), raw: args };
}

const PROG = "walk-and-compare";
function fail(msg) {
  console.error(`${PROG}: ${msg}`);
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));
const out = args.get("out");
const journeysPath = args.get("journeys");
if (!out) fail("--out <dir> is required");
if (!journeysPath) fail("--journeys <file> is required");

const engineA = args.get("engine-a");
const engineB = args.get("engine-b");
const baseA = args.get("base-a");
const baseB = args.get("base-b");
const mode = engineA || engineB ? "engine" : baseA || baseB ? "base" : null;
if (!mode) fail("give either --engine-a/--fixture-a (and optionally --engine-b/--fixture-b), or --base-a and --base-b");
if (mode === "engine" && (baseA || baseB)) fail("--engine-* and --base-* are two different modes; give one or the other");
if (mode === "base" && !(baseA && baseB)) fail("--base-a and --base-b are both required in base mode");
if (mode === "engine" && !engineA) fail("--engine-a is required in engine mode");

const fixtureA = args.get("fixture-a");
const fixtureB = args.get("fixture-b");
if (mode === "engine" && !fixtureA) fail("--fixture-a <fixtureDir> is required in engine mode");

// THE TRAFFIC GATE, before anything else — before output dirs, before engines,
// before any byte leaves this process. Every base URL passes here.
const allowLiveWalk = args.list("allow-live-walk").filter(Boolean).map(String);
let originA = null, originB = null;
if (mode === "base") {
  originA = assertWalkableBase(baseA, allowLiveWalk, "--base-a");
  originB = assertWalkableBase(baseB, allowLiveWalk, "--base-b");
}

if (existsSync(path.join(out, "report.md"))) fail(`refusing to overwrite prior evidence: ${path.join(out, "report.md")} exists; use a new output directory`);
mkdirSync(out, { recursive: true });

const disabled = args.list("disable").filter(Boolean).map(String);
const rules = walkRulesEnabled(disabled);
const sessionCookieNames = args.list("session-cookie-name").filter(Boolean).map(String);
const pixelTolerance = Number(args.get("pixel-tolerance") ?? 0);
const structuralFraction = args.get("structural-fraction") === undefined ? DEFAULT_STRUCTURAL_FRACTION : Number(args.get("structural-fraction"));
if (!(pixelTolerance >= 0)) fail("--pixel-tolerance must be >= 0");
if (!(structuralFraction > 0 && structuralFraction <= 1)) fail("--structural-fraction must be in (0, 1]");
const offline = args.has("offline") || process.env.HARNESS_OFFLINE === "1";
const includeThirdParty = args.has("include-third-party");
const filter = args.get("filter") ? new RegExp(args.get("filter")) : null;

const labelA = args.get("label-a") ?? (mode === "engine" ? "engine A" : "base A");
const labelB = args.get("label-b") ?? (mode === "engine" ? "engine B" : "base B");

// Journeys (decko-browser-journeys/1) and actors.
const journeysDoc = JSON.parse(readFileSync(journeysPath, "utf8"));
if (journeysDoc.format !== "decko-browser-journeys/1") fail(`--journeys: expected format decko-browser-journeys/1, got ${JSON.stringify(journeysDoc.format)}`);
const allJourneys = journeysDoc.journeys ?? [];
const journeys = allJourneys.filter((j) => !filter || filter.test(j.id));

let actors = journeysDoc.actors ?? {};
const actorsJson = args.get("actors-json");
if (actorsJson) actors = { ...actors, ...JSON.parse(readFileSync(actorsJson, "utf8")) };

const repo = fileURLToPath(new URL("../..", import.meta.url));
const gitRev = (() => {
  try { return execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { windowsHide: true, encoding: "utf8" }).trim(); } catch { return null; }
})();
// The tree state behind this run: a dirty tree means the walk ran on top of
// uncommitted work (this repository is shared by several lanes), which the
// receipt must say rather than imply a clean checkout.
const gitDirty = (() => {
  try { return execFileSync("git", ["-C", repo, "status", "--porcelain", "--untracked-files=normal"], { windowsHide: true, encoding: "utf8" }); } catch { return null; }
})();

const provenance = {
  format: "decko-live-walk/1",
  runId: randomUUID(),
  startedAt: new Date().toISOString(),
  tool: "reference-harness/live-walk/walk-and-compare.mjs",
  gitCommit: gitRev,
  gitDirty: !!gitDirty,
  gitDirtySha256: gitDirty !== null ? createHash("sha256").update(gitDirty).digest("hex") : null,
  node: process.version,
  platform: process.platform,
  journeysSha256: sha256File(journeysPath),
  mode,
  engineA: engineA ?? null,
  engineB: engineB ?? null,
  fixtureA: fixtureA ?? null,
  fixtureB: fixtureB ?? fixtureA ?? null,
  baseA: baseA ?? null,
  baseB: baseB ?? null,
  allowLiveWalk,
  offline,
  journeysSelected: journeys.map((j) => j.id),
};
function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** The walker's per-side plan: engine mode boots the engine fresh per journey
 *  (a fresh deck copy each time, like the browser-journeys instrument); base
 *  mode points at the pre-running host. */
function sidePlan(side) {
  if (mode === "base") {
    const base = side === "a" ? baseA : baseB;
    const otherHostname = new URL(side === "a" ? baseB : baseA).hostname;
    return {
      base,
      walk: async (journey) => walkJourney({
        base, journey, actors, outDir: out, side,
        label: side === "a" ? labelA : labelB,
        browserFactory: () => launchWalkBrowser({ allowedHostnames: [new URL(base).hostname, otherHostname], offline }),
        filesDir: args.get("files-dir") ? path.resolve(args.get("files-dir")) : null,
      }),
    };
  }
  const engineManifest = side === "a" ? engineA : (engineB ?? engineA);
  const fixtureDir = side === "a" ? fixtureA : (fixtureB ?? fixtureA);
  const engine = loadEngine(engineManifest);
  return {
    engine, fixtureDir, base: null,
    walk: async (journey) => {
      const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, `server-${side}.log`) });
      try {
        return await walkJourney({
          base: server.base, journey, actors: Object.keys(actors).length ? actors : fixtureActors(fixtureDir), outDir: out, side,
          label: side === "a" ? labelA : labelB,
          browserFactory: () => launchWalkBrowser({ allowedHostnames: [new URL(server.base).hostname], offline }),
          mailFn: server.mail,
          restartFn: server.restart,
          filesDir: args.get("files-dir") ? path.resolve(args.get("files-dir")) : path.join(path.dirname(path.resolve(journeysPath)), "..", "files"),
        });
      } finally {
        await server.stop();
      }
    },
  };
}

function fixtureActors(fixtureDir) {
  try {
    return JSON.parse(readFileSync(path.join(fixtureDir, "deck.json"), "utf8")).actors ?? {};
  } catch {
    return {};
  }
}

const planA = sidePlan("a");
const planB = sidePlan("b");

const results = [];
for (const journey of journeys) {
  process.stdout.write(`${PROG}: journey ${journey.id}: walking A (${labelA})... `);
  const a = await planA.walk(journey);
  process.stdout.write(`${a.completed ? "ok" : "FAILED"}; walking B (${labelB})... `);
  const b = await planB.walk(journey);
  process.stdout.write(`${b.completed ? "ok" : "FAILED"}; comparing... `);
  // The comparison consumes the in-memory records (bodies included). By
  // default only same-origin exchanges are compared; --include-third-party
  // brings the CDN exchanges in (they are the same bytes for both sides in
  // principle — including them is the run's stated choice).
  const bytes = compareExchanges(a.exchangesInMemory, b.exchangesInMemory, { rules, sessionCookieNames, includeThirdParty, originA: originA ?? null, originB: originB ?? null });
  const pixels = compareShots(a.screenshots, b.screenshots, path.join(out, "a", journey.id, "shots"), path.join(out, "b", journey.id, "shots"), out, journey.id, { pixelTolerance, structuralFraction });
  // Per-side step records (sans bodies) as the durable evidence.
  writeFileSync(path.join(out, "a", `${journey.id}.json`), JSON.stringify({ ...a, exchangesInMemory: undefined, exchanges: a.exchanges }, null, 1));
  writeFileSync(path.join(out, "b", `${journey.id}.json`), JSON.stringify({ ...b, exchangesInMemory: undefined, exchanges: b.exchanges }, null, 1));
  results.push({ id: journey.id, a, b, bytes, pixels });
  process.stdout.write("done\n");
}

const options = { out, filter: args.get("filter") ?? null, pixelTolerance, structuralFraction, disabled, allowLiveWalk, offline, includeThirdParty };
// Aggregate per-journey applied ledgers for the report's table.
for (const r of results) {
  r.bytes.appliedA = aggregateApplied(r.bytes.pairs, "appliedA");
  r.bytes.appliedB = aggregateApplied(r.bytes.pairs, "appliedB");
}
function aggregateApplied(pairs, key) {
  const totals = {};
  for (const p of pairs) {
    const snapshot = p[key];
    for (const [id, n] of Object.entries(snapshot ?? {})) {
      totals[id] ??= { applied: 0, explained: 0 };
      totals[id].applied += n.applied ?? 0;
      totals[id].explained += n.explained ?? 0;
    }
  }
  return totals;
}

const reportMd = renderReport({ provenance, labelA, labelB, baseA: baseA ?? `${labelA} (engine: ${engineA})`, baseB: baseB ?? `${labelB} (engine: ${engineB ?? engineA})`, journeys, results, rules, options });
writeFileSync(path.join(out, "report.md"), reportMd);
writeFileSync(path.join(out, "report.json"), JSON.stringify(buildJsonReport({ provenance, labelA, labelB, baseA: baseA ?? `${labelA} (engine: ${engineA})`, baseB: baseB ?? `${labelB} (engine: ${engineB ?? engineA})`, rules, options, results }), null, 1));

console.log(`${PROG}: report at ${path.join(out, "report.md")}`);
for (const j of results) console.log(`  ${j.id}: ${journeyVerdict(j)}`);

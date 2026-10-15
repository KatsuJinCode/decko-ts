#!/usr/bin/env node
// Runs a fixture's operations through one engine's adapter and records what
// the engine answered, one JSON line per operation.
//
//   node reference-harness/runner/run.mjs --adapter <adapter.json> \
//        --fixture <fixtureDir> --out <resultsDir> \
//        [--kinds render,semantics,scenarios] [--filter <regex>] [--limit <n>]
//
// Run with the Ruby oracle's adapter and --out <fixtureDir>/expected to
// (re)capture the reference outputs; run with any other adapter and grade the
// results with grade.mjs. A run with --filter or --limit is recorded as a
// partial selection, which the grader does not accept as a grade.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeForRecord } from "./normalize.mjs";
import { AdapterSession, loadAdapterManifest } from "./adapter-process.mjs";
import { rawDelta, snapshot, splitDelta } from "./deck-state.mjs";
import { WITHHELD_DIR, verifyFixture, withheldLine, withheldOpsOf, withheldScenariosOf, withheldStatus } from "./manifest.mjs";

export const RESULTS_FORMAT = 2;

const args = parseArgs(process.argv.slice(2));
const manifest = loadAdapterManifest(args.adapter);
const fixture = path.resolve(args.fixture);
const outDir = path.resolve(args.out);
const kinds = (args.kinds ?? "render,semantics,scenarios").split(",");
const scenarioWorkers = Number(args["scenario-workers"] ?? 1);
if (!Number.isSafeInteger(scenarioWorkers) || scenarioWorkers < 1) throw new Error("--scenario-workers must be a positive integer");
for (const k of kinds) if (!["render", "semantics", "scenarios"].includes(k)) throw new Error(`unknown kind ${k}`);
const filter = args.filter ? new RegExp(args.filter) : null;
const limit = args.limit ? Number(args.limit) : Infinity;
const selection = filter || Number.isFinite(limit) ? { filter: args.filter ?? null, limit: Number.isFinite(limit) ? limit : null } : null;
const deckJson = path.join(fixture, "deck.json");
const deckDb = path.join(fixture, "deck", "deck.sqlite3");
const deckFiles = path.join(fixture, "deck", "files");
if (!existsSync(deckDb)) throw new Error(`no built deck at ${deckDb}; run oracle/build-deck.sh first`);
mkdirSync(outDir, { recursive: true });

const log = (line) => process.stderr.write(`[run] ${line}\n`);
const readLines = (file) =>
  readFileSync(file, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));

// The fixture identity the results are pinned to. A fixture that does not
// match its manifest still runs (a new fixture is built this way), but the
// disagreement is recorded and the grader refuses the results.
const fixtureCheck = verifyFixture(fixture);
for (const p of fixtureCheck.problems) log(`fixture: ${p}`);
// A declared withheld set runs after the public operations of each kind when
// it is present; absent, its operations are not run and the line says so.
const withheld = withheldStatus(fixture);
if (withheld) process.stderr.write(`${withheldLine(withheld, path.join(args.fixture, WITHHELD_DIR))}\n`);
const checkout = gitCheckout(manifest.dir);

/** A private copy of the deck and its files for one adapter session. */
function stageDeck(root) {
  const work = mkdtempSync(path.join(root, "session-"));
  cpSync(deckDb, path.join(work, "deck.sqlite3"));
  // The fixture deck's journal mode is WAL (the Ruby build leaves it in the
  // file header), and every sqlite handle on a WAL database - even a
  // read-only one - leaves -shm/-wal sidecars beside the file it opens,
  // which a fixture-manifest check correctly reads as corruption. A staged
  // copy is private scratch: convert it to the rollback journal so neither
  // the engine's handles nor the state snapshots can leave residue.
  convertToRollbackJournal(path.join(work, "deck.sqlite3"));
  if (existsSync(deckFiles)) cpSync(deckFiles, path.join(work, "files"), { recursive: true });
  else mkdirSync(path.join(work, "files"));
  mkdirSync(path.join(work, "adapter"));
  // Forward slashes: every adapter runtime (and a database URL) reads them.
  const slash = (p) => p.replaceAll("\\", "/");
  return {
    work,
    db: path.join(work, "deck.sqlite3"),
    env: {
      HARNESS_DECK: slash(path.join(work, "deck.sqlite3")),
      HARNESS_FILES: slash(path.join(work, "files")),
      HARNESS_DECK_JSON: slash(deckJson),
      HARNESS_WORK: slash(path.join(work, "adapter")),
    },
  };
}

/** Checkpoint the copy's WAL into the main file (the copy carries no -wal,
 *  so the state is already checkpointed) and switch the header to the
 *  rollback journal. One short-lived connection on the private copy. */
function convertToRollbackJournal(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA journal_mode = DELETE");
  } finally {
    db.close();
  }
}

async function withSession(root, fn) {
  const started = Date.now();
  const stage = stageDeck(root);
  stage.timings = { stage_ms: Date.now() - started };
  const session = new AdapterSession(manifest, stage.env, { log });
  try {
    const bootStarted = Date.now();
    const hello = await session.start();
    stage.timings.boot_ms = Date.now() - bootStarted;
    const operationsStarted = Date.now();
    const result = await fn(session, stage, hello);
    stage.timings.operations_ms = Date.now() - operationsStarted;
    return result;
  } finally {
    const closeStarted = Date.now();
    await session.close();
    stage.timings.close_ms = Date.now() - closeStarted;
    removeQuietly(stage.work);
  }
}

// ---- run metadata: written before each kind starts (as incomplete) and after
// it ends, so an interrupted run never leaves a record that claims completion.
const metaPath = path.join(outDir, "run-meta.json");
const earlier = existsSync(metaPath) ? safeJson(readFileSync(metaPath, "utf8")) : null;
// A run of some kinds keeps the records of the others only when they are in
// this results format and on this fixture; anything else starts afresh.
const keep = earlier && earlier.results_format === RESULTS_FORMAT && earlier.fixture === path.basename(fixture) ? earlier.runs ?? {} : {};
const meta = { results_format: RESULTS_FORMAT, fixture: path.basename(fixture), runs: { ...keep } };
const saveMeta = () => writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");

function beginKind(kind, opsTotal, extra = {}) {
  const run = {
    started: new Date().toISOString(),
    finished: null,
    complete: false,
    selection,
    ops_total: opsTotal,
    ops_run: 0,
    adapter: manifest.name,
    adapter_checkout: checkout,
    engine: null,
    fixture_digest: fixtureCheck.digest,
    fixture_problems: fixtureCheck.problems,
    ...extra,
  };
  meta.runs[kind] = run;
  saveMeta();
  return run;
}

const root = mkdtempSync(path.join(os.tmpdir(), "decko-harness-"));
try {
  // ---- read sessions: rendering and semantics, one deck copy each ----------
  for (const kind of ["render", "semantics"]) {
    if (!kinds.includes(kind)) continue;
    const all = [...readLines(path.join(fixture, "ops", `${kind}.jsonl`)), ...(withheldOpsOf(fixture, kind) ?? [])];
    const ops = all.filter((o) => !filter || filter.test(o.id)).slice(0, limit);
    const run = beginKind(kind, all.length);
    const outFile = path.join(outDir, `${kind}.jsonl`);
    writeFileSync(outFile, "");
    await withSession(root, async (session, stage, hello) => {
      run.engine = hello;
      const startState = snapshot(stage.db);
      const t0 = Date.now();
      for (const op of ops) {
        const { id, ...body } = op;
        const answer = await session.request(body);
        appendFileSync(outFile, JSON.stringify({ id, ...(answer.ok ? { result: normalizeForRecord(answer.result) } : { error: answer.error }) }) + "\n");
        if (++run.ops_run % 100 === 0) log(`${kind} ${run.ops_run}/${ops.length} ${((Date.now() - t0) / run.ops_run).toFixed(0)} ms/op`);
      }
      run.ms_per_op = ops.length ? Math.round((Date.now() - t0) / ops.length) : 0;
      // Reads must not write: every row of every table the session changed,
      // raw, is recorded, and the grader fails the run on any.
      run.session_writes = rawDelta(startState, snapshot(stage.db));
    });
    run.finished = new Date().toISOString();
    run.complete = run.ops_run === ops.length;
    saveMeta();
    log(`${kind} done: ${run.ops_run} ops`);
  }

  // ---- write scenarios: a fresh deck copy and adapter session each --------
  if (kinds.includes("scenarios")) {
    const all = [...JSON.parse(readFileSync(path.join(fixture, "ops", "scenarios.json"), "utf8")).scenarios, ...(withheldScenariosOf(fixture) ?? [])];
    const scenarios = all.filter((s) => !filter || filter.test(s.id)).slice(0, limit);
    const run = beginKind("scenarios", all.length, { steps_total: all.reduce((n, s) => n + s.steps.length, 0), steps_run: 0, session_timings: [] });
    const outFile = path.join(outDir, "scenarios.jsonl");
    writeFileSync(outFile, "");
    if (scenarios.length === 0) {
      // A fixture with no scenarios (the seconds corpus renders only) still
      // runs one session, so the kind's record names the engine that WOULD
      // have answered it - the same shape render and semantics records
      // always carry.
      await withSession(root, async (_session, _stage, hello) => {
        run.engine = hello;
      });
    }
    let nextScenario = 0;
    let nextOutput = 0;
    let firstError;
    const completed = new Map();
    run.scenario_workers = Math.min(scenarioWorkers, scenarios.length);
    const worker = async () => {
    while (!firstError && nextScenario < scenarios.length) {
      const index = nextScenario++;
      const scenario = scenarios[index];
      const steps = await withSession(root, async (session, stage, hello) => {
        run.session_timings.push({ id: scenario.id, timings: stage.timings });
        run.engine ??= hello;
        if (JSON.stringify(run.engine) !== JSON.stringify(hello)) run.engine_changed = true;
        const results = [];
        for (const step of scenario.steps) {
          const before = snapshot(stage.db);
          const answer = await session.request(step);
          const { rows, other } = splitDelta(rawDelta(before, snapshot(stage.db)));
          results.push({
            ...(answer.ok ? { result: normalizeForRecord(answer.result) } : { error: answer.error }),
            // Raw row delta in Decko's card tables (graded as persistence),
            // and any other table the step changed (graded too: a write's
            // must equal the oracle's, a read's the oracle's empty).
            rows,
            ...(Object.keys(other).length ? { other_tables: other } : {}),
          });
          run.steps_run++;
        }
        return results;
      });
      completed.set(index, { id: scenario.id, steps });
      while (completed.has(nextOutput)) {
        appendFileSync(outFile, JSON.stringify(completed.get(nextOutput)) + "\n");
        completed.delete(nextOutput++);
      }
      run.ops_run++;
      log(`scenario ${scenario.id}: ${steps.length} steps`);
      saveMeta();
    }
    };
    // All workers own fresh deck/files/processes. On failure, stop assigning
    // work and await every owned session's cleanup before removing the root.
    await Promise.all(Array.from({ length: run.scenario_workers }, () => worker().catch((error) => { firstError ??= error; })));
    if (firstError) throw firstError;
    run.finished = new Date().toISOString();
    run.complete = run.ops_run === scenarios.length;
    saveMeta();
  }
} finally {
  saveMeta();
  removeQuietly(root);
}

/** The adapter's source checkout: commit and whether it has uncommitted
 *  changes, so a result names the code that produced it. Null outside git. */
function gitCheckout(dir) {
  const git = (...a) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8", windowsHide: true });
  const head = git("rev-parse", "HEAD");
  if (head.status !== 0) return null;
  const status = git("status", "--porcelain", "--untracked-files=no");
  return { commit: head.stdout.trim(), dirty: status.status === 0 ? status.stdout.trim() !== "" : null };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Removes a scratch directory; a failure is reported, never allowed to hide
 *  the error that ended the run. */
function removeQuietly(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch (error) {
    log(`could not remove ${dir}: ${error.message}`);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--")) throw new Error(`unexpected argument ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  for (const required of ["adapter", "fixture", "out"]) {
    if (!out[required]) throw new Error(`--${required} is required`);
  }
  return out;
}

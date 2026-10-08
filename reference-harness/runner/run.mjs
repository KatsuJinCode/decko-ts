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
// results with grade.mjs.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AdapterSession, loadAdapterManifest } from "./adapter-process.mjs";
import { delta, snapshot } from "./deck-state.mjs";

const args = parseArgs(process.argv.slice(2));
const manifest = loadAdapterManifest(args.adapter);
const fixture = path.resolve(args.fixture);
const outDir = path.resolve(args.out);
const kinds = new Set((args.kinds ?? "render,semantics,scenarios").split(","));
const filter = args.filter ? new RegExp(args.filter) : null;
const limit = args.limit ? Number(args.limit) : Infinity;
const deckJson = path.join(fixture, "deck.json");
const deckDb = path.join(fixture, "deck", "deck.sqlite3");
const deckFiles = path.join(fixture, "deck", "files");
if (!existsSync(deckDb)) throw new Error(`no built deck at ${deckDb}; run oracle/build-deck.sh first`);
mkdirSync(outDir, { recursive: true });

const log = (line) => process.stderr.write(`[run] ${line}\n`);
const readLines = (file) =>
  readFileSync(file, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));

/** A private copy of the deck and its files for one adapter session. */
function stageDeck(root) {
  const work = mkdtempSync(path.join(root, "session-"));
  cpSync(deckDb, path.join(work, "deck.sqlite3"));
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

async function withSession(root, fn) {
  const stage = stageDeck(root);
  const session = new AdapterSession(manifest, stage.env, { log });
  try {
    const hello = await session.start();
    return await fn(session, stage, hello);
  } finally {
    await session.close();
    rmSync(stage.work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

const root = mkdtempSync(path.join(os.tmpdir(), "decko-harness-"));
const meta = { adapter: manifest.name, fixture: path.basename(fixture), started: new Date().toISOString(), kinds: [...kinds] };
try {
  // ---- read sessions: rendering and semantics share one deck copy ----------
  for (const kind of ["render", "semantics"]) {
    if (!kinds.has(kind)) continue;
    const ops = readLines(path.join(fixture, "ops", `${kind}.jsonl`)).filter((o) => !filter || filter.test(o.id)).slice(0, limit);
    const outFile = path.join(outDir, `${kind}.jsonl`);
    writeFileSync(outFile, "");
    await withSession(root, async (session, _stage, hello) => {
      meta.engine = hello;
      const t0 = Date.now();
      let n = 0;
      for (const op of ops) {
        const { id, ...body } = op;
        const answer = await session.request(body);
        appendFileSync(outFile, JSON.stringify({ id, ...(answer.ok ? { result: answer.result } : { error: answer.error }) }) + "\n");
        if (++n % 100 === 0) log(`${kind} ${n}/${ops.length} ${((Date.now() - t0) / n).toFixed(0)} ms/op`);
      }
      meta[`${kind}_ms_per_op`] = ops.length ? Math.round((Date.now() - t0) / ops.length) : 0;
      log(`${kind} done: ${ops.length} ops`);
    });
  }

  // ---- write scenarios: a fresh deck copy and adapter session each --------
  if (kinds.has("scenarios")) {
    const { scenarios } = JSON.parse(readFileSync(path.join(fixture, "ops", "scenarios.json"), "utf8"));
    const outFile = path.join(outDir, "scenarios.jsonl");
    writeFileSync(outFile, "");
    for (const scenario of scenarios.filter((s) => !filter || filter.test(s.id)).slice(0, limit)) {
      const steps = await withSession(root, async (session, stage) => {
        const results = [];
        for (const step of scenario.steps) {
          const before = snapshot(stage.db);
          const answer = await session.request(step);
          const after = snapshot(stage.db);
          results.push({
            ...(answer.ok ? { result: answer.result } : { error: answer.error }),
            rows: delta(before, after),
          });
        }
        return results;
      });
      appendFileSync(outFile, JSON.stringify({ id: scenario.id, steps }) + "\n");
      log(`scenario ${scenario.id}: ${steps.length} steps`);
    }
  }
} finally {
  meta.finished = new Date().toISOString();
  writeFileSync(path.join(outDir, "run-meta.json"), JSON.stringify(meta, null, 2) + "\n");
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
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

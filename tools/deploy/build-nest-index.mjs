#!/usr/bin/env node
// build-nest-index.mjs — the one-shot stored-nest-index build.
//
// WHY A SEPARATE STEP. A cold render costs three round trips whatever a deck
// nests only when the stored nest index (the card_references 'I' rows) is
// current. Building it means parsing every card's content, which is a
// whole-deck operation: far too much work for a request to do, and the D1
// subrequest and CPU budgets would not survive it. So the edge hosts only
// READ the marker at boot (deploy/worker.ts, bunny-edge-deck-boot.ts) and say
// loudly when the deck is served by walking; this step is what brings the
// index current, and it runs from the deploy chain and the import tool, not
// from a request.
//
// It calls bootDeck, which primes the name lexicon and then calls
// ensureNestIndex (src/card/nest-index.ts): the same build a Node host does at
// boot, on the same deck file. Idempotent — a deck already at this build
// version costs one marker read and writes nothing.
//
// Usage:
//   node tools/deploy/build-nest-index.mjs --db <deck.sqlite3> [--json]
//   node tools/deploy/build-nest-index.mjs --db <deck.sqlite3> --json > report.json
//
// --db is a local SQLite file (a D1 export or a local deck). For a deployed
// D1 database, run it against an export of the deck and re-upload, or call
// ensureNestIndex through the same build with a D1 driver; this script does
// not reach into a remote database by itself.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

function fail(message) {
  process.stderr.write(`[build-nest-index] ${message}\n`);
  process.exit(2);
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const dbIndex = args.indexOf("--db");
const db = dbIndex === -1 ? undefined : args[dbIndex + 1];
if (db === undefined) fail("usage: node tools/deploy/build-nest-index.mjs --db <deck.sqlite3> [--json]");
const dbPath = path.resolve(db);

// The engine ships as compiled JS (dist/); the deploy chain builds it
// (`npx tsc -p tsconfig.engine.json`) before this step runs.
const require = createRequire(import.meta.url);
let bootDeck;
try {
  ({ bootDeck } = require(path.join(REPO, "dist/src/card/pods/deck.js")));
} catch (err) {
  fail(
    `cannot load the compiled engine at dist/src/card/pods/deck.js - build it first (npx tsc -p tsconfig.engine.json): ${err.message}`,
  );
}

const started = Date.now();
let result;
try {
  const deck = await bootDeck(dbPath);
  try {
    const { readNestIndexMarker } = require(path.join(REPO, "dist/src/card/nest-index.js"));
    result = await readNestIndexMarker(deck.driver);
  } finally {
    deck.close();
  }
} catch (err) {
  fail(`${dbPath}: ${err?.stack ?? err}`);
}

const report = { database: dbPath, ...result, elapsed_ms: Date.now() - started };
if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  const { database, ...rest } = report;
  process.stdout.write(
    `[build-nest-index] ${database}: ${rest.state ?? "unknown"}${rest.version === undefined ? "" : ` (version ${rest.version})`} in ${rest.elapsed_ms} ms\n`,
  );
}
if (report.state !== "current") process.exitCode = 1;

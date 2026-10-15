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
// THE SAME BUILD, THREE DATABASES.
//   --db <file.sqlite3>            a local SQLite deck (bootDeck, the Node host's path)
//   --d1-account A --d1-database D a deployed Cloudflare D1, over the REST API;
//                                  CLOUDFLARE_API_TOKEN must carry D1 edit rights
//   --d1-local <dir> [--d1-name N] a local Miniflare D1 under <dir> (tests, rehearsal)
// Each reaches the database through the engine's own adapter and runs the same
// ensureNestIndex (src/card/nest-index.ts). Idempotent: a deck already at this
// build version costs one marker read and writes nothing.
//
// The compiled engine ships as dist/. Build it first: `npm run build:engine`
// (npx tsc -p tsconfig.json --outDir dist ...), or the deploy chain's build.
//
// Exit status: 0 when the marker says current after the run, 1 otherwise,
// 2 for a usage or load error.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { d1HttpBinding, miniflareBinding, buildNestIndexOnBinding } from "./d1-binding.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const DIST = path.join(REPO, "dist");

function fail(message, code = 2) {
  process.stderr.write(`[build-nest-index] ${message}\n`);
  process.exit(code);
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

const USAGE =
  "usage: node tools/deploy/build-nest-index.mjs (--db <deck.sqlite3> | --d1-account <id> --d1-database <id> | --d1-local <dir> [--d1-name <name>]) [--json]";

/** Runs one build and returns the report. Exported for the tests. */
export async function runBuild(target) {
  const started = Date.now();
  if (target.kind === "sqlite") {
    const require = createRequire(import.meta.url);
    let bootDeck;
    let readNestIndexMarker;
    try {
      ({ bootDeck } = require(path.join(DIST, "src/card/pods/deck.js")));
      ({ readNestIndexMarker } = require(path.join(DIST, "src/card/nest-index.js")));
    } catch (err) {
      throw Object.assign(new Error(`cannot load the compiled engine from ${DIST}: ${err.message}`), { usage: true });
    }
    const deck = await bootDeck(target.path);
    try {
      const marker = await readNestIndexMarker(deck.driver);
      return { database: target.path, ...marker, elapsed_ms: Date.now() - started };
    } finally {
      deck.close();
    }
  }
  if (target.kind === "d1") {
    const { binding, dispose, label } = target.open();
    try {
      const { install, marker } = await buildNestIndexOnBinding(await binding, DIST);
      return { database: label, ...marker, build: install, elapsed_ms: Date.now() - started };
    } finally {
      if (dispose) await dispose();
    }
  }
  throw new Error(`unknown target ${target.kind}`);
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  let target;
  if (argValue(args, "--db") !== undefined) {
    target = { kind: "sqlite", path: path.resolve(argValue(args, "--db")) };
  } else if (argValue(args, "--d1-account") !== undefined) {
    const accountId = argValue(args, "--d1-account");
    const databaseId = argValue(args, "--d1-database");
    if (databaseId === undefined) fail(USAGE);
    target = {
      kind: "d1",
      label: `d1:${databaseId}`,
      open: () => ({ binding: d1HttpBinding({ accountId, databaseId }), label: `d1:${databaseId}` }),
    };
  } else if (argValue(args, "--d1-local") !== undefined) {
    const persistDir = path.resolve(argValue(args, "--d1-local"));
    const dbName = argValue(args, "--d1-name") ?? "decko-nest-index";
    target = {
      kind: "d1",
      label: `miniflare:${dbName}`,
      open: () => {
        const opened = miniflareBinding({ persistDir, dbName });
        return {
          binding: opened.then((m) => m.binding),
          dispose: () => opened.then((m) => m.dispose()),
          label: `miniflare:${dbName}`,
        };
      },
    };
  } else {
    fail(USAGE);
  }

  let report;
  try {
    report = await runBuild(target);
  } catch (err) {
    fail(`${target.label ?? target.path}: ${err?.stack ?? err}`, err?.usage ? 2 : 1);
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const version = report.version === undefined ? "" : ` (version ${report.version})`;
    process.stdout.write(`[build-nest-index] ${report.database}: ${report.state ?? "unknown"}${version} in ${report.elapsed_ms} ms\n`);
  }
  if (report.state !== "current") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

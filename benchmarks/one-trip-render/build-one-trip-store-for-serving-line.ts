// build-one-trip-store-for-serving-line.ts — the PRECOMPUTE step of the
// one-trip serving-line proof (lane-one-trip-serve-2026-10-04): builds the
// derived store (closure-builder.ts buildOneTripClosure) for the 5 probe
// pages from the trial-deck mirror copy into an explicit store file. The
// store is NEVER built at render time (render-gate.ts's contract); the
// serving worker consumes it read-only through DECKO_ONE_TRIP_STORE.
//
// Bundle with esbuild and run:
//   node build-one-trip-store-for-serving-line.mjs <store.sqlite3> [mirror.sqlite3]
// Prints the build report JSON on stdout and exits 0.

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { buildOneTripClosure } from "../../src/card/one-trip/closure-builder.js";

const storePath = process.argv[2];
if (storePath === undefined || storePath === "") {
  console.error(
    "usage: node build-one-trip-store-for-serving-line.mjs <store.sqlite3> [mirror.sqlite3]",
  );
  process.exit(2);
}
const mirrorPath =
  process.argv[3] ?? "benchmarks/one-trip-render/trial-deck-mirror-readonly-copy.sqlite3";

const corpus = new LocalSqliteDriver({ path: mirrorPath, readonly: true });
const side = new LocalSqliteDriver({ path: storePath });
const startedAt = Date.now();
try {
  const report = await buildOneTripClosure({
    corpus,
    side,
    pageNames: ["Home", "Aikido", "About", "Eagle", "Taking_Stock"],
  });
  console.log(JSON.stringify({ storePath, mirrorPath, buildMs: Date.now() - startedAt, report }));
} finally {
  corpus.close();
  side.close();
}

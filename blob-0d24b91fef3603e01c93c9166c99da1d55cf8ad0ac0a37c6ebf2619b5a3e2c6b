// build-store-for-serve-canonical-joint.entry.ts — the PRECOMPUTE step of the
// serve-canonical-joint lane: buildOneTripClosure (the committed one-trip
// closure builder, unchanged) for THIS lane's full 22-page plan (5 probes +
// 17-page spread) against the canonical-shape DB copy. The committed
// benchmarks/one-trip-render/build-one-trip-store-for-serving-line.ts is
// probe-scoped (5 pageNames hardcoded); this entry only widens the page list
// and points the corpus at the canonical copy. The store is NEVER built at
// render time (render-gate.ts's contract); the serving worker consumes it
// read-only through DECKO_ONE_TRIP_STORE.
//
// Bundle with esbuild (external: better-sqlite3) and run:
//   node build-store-for-serve-canonical-joint.entry.mjs <store.sqlite3> <corpus.sqlite3> <pages.json>

import { readFileSync } from "node:fs";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { buildOneTripClosure } from "../../src/card/one-trip/closure-builder.js";

const storePath = process.argv[2];
const corpusPath = process.argv[3];
const pagesPath = process.argv[4];
if (!storePath || !corpusPath || !pagesPath) {
  console.error(
    "usage: node build-store-for-serve-canonical-joint.entry.mjs <store.sqlite3> <corpus.sqlite3> <pages.json>",
  );
  process.exit(2);
}
const pageNames = JSON.parse(readFileSync(pagesPath, "utf8")) as string[];

const corpus = new LocalSqliteDriver({ path: corpusPath, readonly: true });
const side = new LocalSqliteDriver({ path: storePath });
const startedAt = Date.now();
try {
  const report = await buildOneTripClosure({ corpus, side, pageNames });
  console.log(JSON.stringify({ storePath, corpusPath, pages: pageNames.length, buildMs: Date.now() - startedAt, report }));
} finally {
  corpus.close();
  side.close();
}

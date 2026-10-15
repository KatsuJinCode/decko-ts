// Focused render-only validation harness for profile-once.mjs. Mirrors the
// warm-entry-probe test's prewarm + render path but strips everything that
// is not the render (no closureWarm audit, no repeats, no lastRenderStats
// formatting) so the V8 .cpuprofile surfaces the actual hot spot instead
// of vitest / sqlite / closure overhead.
//
// Usage under the CPU profiler wrapper:
//   node benchmarks/perf/profile-once.mjs \
//     ./node_modules/vitest/vitest.mjs run --root . \
//     benchmarks/perf/render-only.test.ts

import { expect } from "vitest";
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import {
  createStructureSeededStorageFor,
  readShardLines,
} from "../../tests/card/render/structure-corpus-seeding.js";
import { prewarmStaticDeck } from "../corpus-v2/prewarm-static-deck.js";
import { itOrSkipLoud } from "../../tests/support/describe-with-corpus.js";

const CORPUS_DB = "benchmarks/corpus-v2/bench-corpus-v2.sqlite3";

itOrSkipLoud(
  !existsSync(CORPUS_DB),
  "benchmarks/perf/render-only.test.ts",
  `the rich corpus database ${CORPUS_DB} is absent (not redistributed; see docs/TESTING.md)`,
)("renders the shard-0 huge-content :closed view once", { timeout: 600_000 }, async () => {
  const corpus = new Database(
    CORPUS_DB,
    { readonly: true },
  );
  const ids = (corpus
    .prepare("SELECT id FROM cards WHERE trash = 0")
    .all() as Array<{ id: number }>)
    .map((r) => r.id);
  corpus.close();

  const storage = await createStructureSeededStorageFor(new Set(ids));
  const t0 = Date.now();
  await prewarmStaticDeck(storage);
  const prewarmMs = Date.now() - t0;

  const lines = readShardLines().slice(0, 20);
  const target =
    lines
      .flatMap((line) =>
        line.views
          ? Object.entries(line.views).map(([view, html]) => ({
              name: line.name,
              view,
              expected: html as string,
            }))
          : [],
      )
      .find((e) => e.view === "closed") ?? null;
  expect(target).not.toBeNull();

  const t1 = Date.now();
  try {
    await storage.engine.render(target!.name, target!.view);
  } catch {
    /* render failures are diagnostic - the wall-ms is the metric */
  }
  const renderMs = Date.now() - t1;
  console.log(
    `[render-only] ${target!.name}:${target!.view} prewarmMs=${prewarmMs} renderMs=${renderMs}`,
  );

  storage.close();
});
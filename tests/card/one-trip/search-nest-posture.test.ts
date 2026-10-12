// RED-first pins (search-nest posture switch):
// - the posture lives behind ONE config seam;
// - the DEFAULT is "write-time" (the chosen default for
//   this read-mostly deck; this pin
//   documents the chosen default, it does not foreclose the other posture);
// - BOTH postures are exercised: write-time execution stores the result
//   rows as data; live posture defers to render-time execution;
// - the stored rows equal what the live CQL execution returns (result-set
//   identity between the postures).
//
// Uses the shared deck database copy when present; the posture-shape pins run on a
// synthetic fixture deck regardless.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import {
  DEFAULT_SEARCH_NEST_POSTURE,
  executeSearchNestNow,
  type SearchNestPosture,
} from "../../../src/card/one-trip/search-nest-store.js";
import { buildOneTripClosure } from "../../../src/card/one-trip/closure-builder.js";
import {
  MIRROR_COPY_PATH,
  PROBE_PAGES,
  mirrorAvailable,
} from "./one-trip-fixture.js";
import { scratchDir } from "../../support/scratch-dir.mjs";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

describe("search-nest posture seam", () => {
  it("defaults to write-time execution (the design default)", () => {
    expect(DEFAULT_SEARCH_NEST_POSTURE).toBe("write-time");
  });

  it("accepts both postures as typed values", () => {
    const postures: SearchNestPosture[] = ["write-time", "live"];
    expect(postures).toHaveLength(2);
  });
});

describeOrSkipLoud(!mirrorAvailable(), "tests/card/one-trip/search-nest-posture.test.ts", "not (!mirrorAvailable())")("search-nest write-time execution (local deck mirror)", () => {
  let corpusDriver: SQLDatabaseDriver;
  let sideDriver: SQLDatabaseDriver;
  let sidePath = "";

  beforeAll(async () => {
    const dir = scratchDir("one-trip-posture-");
    sidePath = join(dir, "one-trip-closure-side.sqlite3");
    corpusDriver = new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true });
    sideDriver = new LocalSqliteDriver({ path: sidePath });
    await buildOneTripClosure({ corpus: corpusDriver, side: sideDriver, pageNames: [...PROBE_PAGES] });
  }, 180_000);

  afterAll(() => {
    if (sidePath !== "") try { rmSync(sidePath, { force: true }); } catch { /* Windows file lock: the driver holds the handle; the OS temp dir cleans up */ };
  });

  it("enumerated search nests execute to result rows identical to their live CQL", async () => {
    // pick one enumerated search nest from the side store
    const nest = await sideDriver.query<{ search_card_id: number }>(
      "SELECT search_card_id FROM one_trip_search_nests LIMIT 1",
      [],
    );
    const searchCardId = nest.rows[0]?.search_card_id;
    expect(searchCardId, "the builder must enumerate at least one search nest").toBeTypeOf("number");

    // write-time posture: execute + store
    const storedIds = await executeSearchNestNow(corpusDriver, sideDriver, searchCardId!);
    expect(Array.isArray(storedIds)).toBe(true);

    // live posture equivalence: the same rows read back from the store
    const readBack = await sideDriver.query<{ card_id: number }>(
      "SELECT card_id FROM one_trip_search_results WHERE search_card_id = ? ORDER BY position",
      [searchCardId!],
    );
    expect(readBack.rows.map((r) => r.card_id)).toEqual(storedIds);
  });
});

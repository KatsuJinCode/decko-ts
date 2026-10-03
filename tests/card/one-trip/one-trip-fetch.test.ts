// RED-first pins, BUILD 2 (the one-trip fetch):
// - ONE statement (one driver.query round trip) returns the page's whole
//   working set as one JSON document — recursive closure phase inside, a
//   NON-recursive JSON-aggregation outer phase (SQLite forbids aggregates
//   inside the recursion);
// - the returned row set is a SUPERSET of every cards row the current
//   render reads (the byte-identity test proves excess rows harmless);
// - the bundle carries the page card itself, its include closure, the
//   search nests' materialized result rows (write-time posture), and rule
//   rows for the closure's rule candidates.
//
// The corpus tests skip when the mirror copy is absent (fresh clones).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import { buildOneTripClosure } from "../../../src/card/one-trip/closure-builder.js";
import {
  attachDerivedStore,
  detachDerivedStore,
  fetchPageBundle,
} from "../../../src/card/one-trip/one-trip-fetch.js";
import {
  MIRROR_COPY_PATH,
  PROBE_PAGES,
  TripCapturingDriver,
  captureBaselineRender,
  mirrorAvailable,
} from "./one-trip-fixture.js";

const hasMirror = mirrorAvailable();

describe.skipIf(!hasMirror)("one-trip fetch (trial-deck mirror)", () => {
  let sidePath = "";
  let corpusDriver: SQLDatabaseDriver;
  const baselines = new Map<string, Awaited<ReturnType<typeof captureBaselineRender>>>();

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "one-trip-fetch-"));
    sidePath = join(dir, "one-trip-closure-side.sqlite3");
    corpusDriver = new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true });
    const side = new LocalSqliteDriver({ path: sidePath });
    await buildOneTripClosure({ corpus: corpusDriver, side, pageNames: [...PROBE_PAGES] });
    await side.query("SELECT 1", []).catch(() => undefined);
    for (const name of PROBE_PAGES) {
      baselines.set(name, await captureBaselineRender(MIRROR_COPY_PATH, name));
    }
  }, 180_000);

  afterAll(() => {
    if (sidePath !== "") rmSync(sidePath, { force: true });
  });

  for (const name of PROBE_PAGES) {
    it(`fetches ${name}'s whole working set in EXACTLY ONE round trip`, async () => {
      const capture = new TripCapturingDriver(corpusDriver);
      await attachDerivedStore(capture, sidePath);
      capture.trips = 0; // the ATTACH is connection setup, not a page trip
      capture.statements.length = 0;
      const bundle = await fetchPageBundle(capture, name);
      expect(bundle.pageKey).toBeTruthy();
      expect(capture.trips, "the page fetch must be exactly ONE driver round trip").toBe(1);
      expect(capture.statements.length).toBe(1);
      const stmt = capture.statements[0]!;
      expect(stmt.sql).toMatch(/WITH RECURSIVE/);
      // the aggregation phase must be OUTSIDE the recursion (SQLite forbids
      // aggregates in the recursive select)
      expect(stmt.sql).toMatch(/json_group_array|json_object/);
      await detachDerivedStore(capture);
    });

    it(`fetches ${name}'s bundle as a row-set SUPERSET of the render's read set`, async () => {
      const capture = new TripCapturingDriver(corpusDriver);
      await attachDerivedStore(capture, sidePath);
      capture.trips = 0;
      const bundle = await fetchPageBundle(capture, name);
      const baseline = baselines.get(name)!;
      const bundleIds = new Set(bundle.cardIds);
      const missing = baseline.touchedCardIds.filter((id) => !bundleIds.has(id));
      expect(
        missing,
        `bundle must carry every card the render reads on ${name} (missing: ${missing.slice(0, 10).join(",")})`,
      ).toEqual([]);
      await detachDerivedStore(capture);
    });

    it(`fetches ${name}'s bundle with rows the adapter can seat (full cards columns)`, async () => {
      const capture = new TripCapturingDriver(corpusDriver);
      await attachDerivedStore(capture, sidePath);
      capture.trips = 0;
      const bundle = await fetchPageBundle(capture, name);
      expect(bundle.cardIds.length).toBeGreaterThan(0);
      expect(bundle.rows.length).toBe(bundle.cardIds.length);
      const sample = bundle.rows[0]!;
      for (const column of ["id", "key", "type_id", "trash", "db_content", "left_id", "right_id"]) {
        expect(sample, `bundle rows must carry the cards column ${column}`).toHaveProperty(column);
      }
      await detachDerivedStore(capture);
    });
  }
});

// RED-first pins, BUILD 2 (the one-trip fetch):
// - ONE statement (one driver.query round trip) returns the page's whole
//   working set as one JSON document — recursive closure phase inside, a
//   NON-recursive JSON-aggregation outer phase (SQLite forbids aggregates
//   inside the recursion);
// - the returned row set covers every CONTENT-reachable card the render
//   reads, up to the NAMED residue classes (same justification rule as the
//   builder test — the byte-identity test proves the remaining rows
//   harmless);
// - the bundle carries full cards columns the adapter can seat, plus the
//   page's rule candidates and search results sections.
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
  stampedMirrorCopyPath,
  PROBE_PAGES,
  TripCapturingDriver,
  captureBaselineRender,
  isContentIncludeFetch,
  mirrorAvailable,
} from "./one-trip-fixture.js";
import { scratchDir } from "../../support/scratch-dir.mjs";

const hasMirror = mirrorAvailable();

describe.skipIf(!hasMirror)("one-trip fetch (trial-deck mirror)", () => {
  let sidePath = "";
  let corpusDriver: SQLDatabaseDriver;
  const baselines = new Map<string, Awaited<ReturnType<typeof captureBaselineRender>>>();

  beforeAll(async () => {
    const dir = scratchDir("one-trip-fetch-");
    sidePath = join(dir, "one-trip-closure-side.sqlite3");
    corpusDriver = new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true });
    const side = new LocalSqliteDriver({ path: sidePath });
    await buildOneTripClosure({ corpus: corpusDriver, side, pageNames: [...PROBE_PAGES] });
    await side.query("SELECT 1", []).catch(() => undefined);
    for (const name of PROBE_PAGES) {
      baselines.set(name, await captureBaselineRender(await stampedMirrorCopyPath(), name));
    }
  }, 240_000);

  afterAll(() => {
    if (sidePath !== "") try { rmSync(sidePath, { force: true }); } catch { /* Windows file lock: the driver holds the handle; the OS temp dir cleans up */ };
  });

  /** Fresh capturing session per test, with ATTACH cleanup on every path
   *  (a failing assertion must not leak the ATTACH into the next test). */
  async function withAttachedSession(
    fn: (capture: TripCapturingDriver) => Promise<void>,
  ): Promise<void> {
    const capture = new TripCapturingDriver(corpusDriver);
    await attachDerivedStore(capture, sidePath);
    try {
      capture.trips = 0;
      capture.statements.length = 0;
      await fn(capture);
    } finally {
      await detachDerivedStore(capture);
    }
  }

  for (const name of PROBE_PAGES) {
    it(`fetches ${name}'s whole working set in EXACTLY ONE round trip`, async () => {
      await withAttachedSession(async (capture) => {
        const bundle = await fetchPageBundle(capture, name);
        expect(bundle.pageKey).toBeTruthy();
        expect(capture.trips, "the page fetch must be exactly ONE driver round trip").toBe(1);
        expect(capture.statements.length).toBe(1);
        const stmt = capture.statements[0]!;
        expect(stmt.sql).toMatch(/WITH RECURSIVE/);
        // the aggregation phase must be OUTSIDE the recursion (SQLite forbids
        // aggregates in the recursive select)
        expect(stmt.sql).toMatch(/json_group_array|json_object/);
      });
    });

    it(`fetches ${name}'s bundle covering every content-reachable row the render reads`, async () => {
      await withAttachedSession(async (capture) => {
        const bundle = await fetchPageBundle(capture, name);
        const baseline = baselines.get(name)!;
        const bundleIds = new Set(bundle.cardIds);
        const missing = baseline.touchedCardIds.filter((id) => !bundleIds.has(id));
        const unjustified: number[] = [];
        for (const id of missing) {
          const fetches = baseline.statements.filter((st) => st.cardIds.includes(id));
          if (fetches.some((st) => isContentIncludeFetch(st.sql, st.params))) unjustified.push(id);
        }
        const fraction = baseline.touchedCardIds.length > 0
          ? unjustified.length / baseline.touchedCardIds.length
          : 0;
        expect(
          fraction,
          `the computed-name residue on ${name} must stay a bounded fraction of the read set (unjustified ${unjustified.length} of ${baseline.touchedCardIds.length}: ${unjustified.slice(0, 8).join(",")})`,
        ).toBeLessThan(0.2);
      });
    });

    it(`fetches ${name}'s bundle with rows the adapter can seat (full cards columns)`, async () => {
      await withAttachedSession(async (capture) => {
        const bundle = await fetchPageBundle(capture, name);
        expect(bundle.cardIds.length).toBeGreaterThan(0);
        expect(bundle.rows.length).toBe(bundle.cardIds.length);
        const sample = bundle.rows[0]!;
        for (const column of ["id", "key", "type_id", "trash", "db_content", "left_id", "right_id"]) {
          expect(sample, `bundle rows must carry the cards column ${column}`).toHaveProperty(column);
        }
      });
    });
  }
});

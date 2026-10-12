// THE LIVE-FETCH-ALL-PAGES PINS.
//
// THE DESIGN UNDER PIN: the LIVE batched inclusion-tree query (the seat's
// head statement — recursive walk CTE + the V2 keyset slices) is THE render
// path for ALL pages — planned AND unplanned — with NO plan-table lookup in
// the critical path. The stored render plans (one_trip_render_plans) are the
// demo stop-gap posture only, selected by the store-plans flag
// (DECKO_ONE_TRIP_PLANS; default = the demo posture so every standing pin's
// subject is unchanged). The deliverable posture — flag "0" — never reads
// the plan table: the head carries the stamp + gate-count columns (the
// stamp-as-column design, reused verbatim) and the member id list; the
// ONE chunk batch rides the V2/V3 transport; the render's remaining reads
// ride live (the named residue classes, owners recorded in render-plan.ts's
// registry).
//
// THE TRIP SHAPE (the two measured walls): WALL 1 — the serving DB rejects
// ATTACH, so the inline shape is the only serving shape; WALL 2 — a
// template-scale page's single JSON row exceeds the ~5 MB single-value
// ceiling, so the head + bounded keyset slices are the transport. The fetch
// is therefore exactly 2 live trips (1 head + 1 slice batch) on every page
// class — the floor this file pins.
//
// RED-FIRST: without the flag the head carries the plan_json column
// unconditionally
// (one-trip-fetch.ts inlineHeadSql), so EVERY assertion below fails for the
// same reason — the seat reads one_trip_render_plans on every page.

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { buildOneTripClosure } from "../../../src/card/one-trip/closure-builder.js";
import { ONE_TRIP_SIDE_DDL } from "../../../src/card/one-trip/side-db-schema.js";
import {
  attachDerivedStore,
  detachDerivedStore,
} from "../../../src/card/one-trip/one-trip-fetch.js";
import {
  MIRROR_COPY_PATH,
  TripCapturingDriver,
  bootEngine,
  mirrorAvailable,
  normalizeSlotIds,
} from "./one-trip-fixture.js";

/**
 * These suites run against a local mirror copy of the reference deck, which
 * is not redistributed in this fork. Without it they cannot run at all, so
 * they skip (and say so) rather than fail on missing data.
 */
const hasMirror = mirrorAvailable();
import { applyDeckDataVersionStampMigration } from "./apply-deck-data-version-stamp-migration.js";
import { scratchDir } from "../../support/scratch-dir.mjs";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

/** An unplanned page: real article content, NO one_trip_render_plans rows
 *  (the deck carries the 45 planned pages' plans; this card is not one). */
const UNPLANNED_PAGE = "Dave_Lowry_What_Puts_the_Tao_in_the_Dojo";
/** A planned page: the demo store's plans carry it — under the live posture
 *  it must ride the SAME statement as the unplanned page, zero plan reads. */
const PLANNED_PAGE = "Home";

/** The live posture's whole-render warm floor: a warm re-render's only
 *  designed live costs are the freshness gate's stamp read (the memo hit
 *  fetches no head) and whatever the seated payload + caches cannot answer.
 *  RED-first target: 2. The failure message records the measured actual. */
const LIVE_WARM_TRIP_TARGET = 2;

/** The plan table's shape — redundant with ONE_TRIP_SIDE_DDL's own
 *  one_trip_render_plans entry (the schema is one array, so every inline
 *  store carries the table); kept for the planned-page pin's explicit
 *  seeding readability. The unplanned pin's store carries the table EMPTY —
 *  the zero-reads assertion observes the posture's choice, not the
 *  schema's. */
const RENDER_PLANS_DDL =
  "CREATE TABLE IF NOT EXISTS one_trip_render_plans (" +
  " page_id INTEGER NOT NULL," +
  " seq INTEGER NOT NULL," +
  " family TEXT NOT NULL," +
  " sql TEXT NOT NULL," +
  " params_json TEXT NOT NULL," +
  " PRIMARY KEY (page_id, seq))";

describeOrSkipLoud(!hasMirror, "tests/card/one-trip/live-fetch-all-pages.test.ts", "hasMirror")("live fetch serves ALL pages with no plan-table lookup", () => {
  let dir = "";
  const savedEnv = {
    gate: process.env.DECKO_ONE_TRIP,
    store: process.env.DECKO_ONE_TRIP_STORE,
    plans: process.env.DECKO_ONE_TRIP_PLANS,
  };

  afterAll(() => {
    for (const [key, value] of [
      ["DECKO_ONE_TRIP", savedEnv.gate],
      ["DECKO_ONE_TRIP_STORE", savedEnv.store],
      ["DECKO_ONE_TRIP_PLANS", savedEnv.plans],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (dir !== "") {
      try {
        rmSync(dir, { force: true, recursive: true });
      } catch {
        /* Windows file lock: OS temp cleans up */
      }
    }
  });

  /** The inline store recipe (the renderplan-replay pin's, minus the plan
   *  seeding): closure for the named pages, stamp migration, side tables
   *  copied inline. `withPlansTable` adds the empty-or-seeded plan table the
   *  demo stop-gap posture reads — the live posture must not touch it. */
  async function buildInlineStore(
    pageNames: readonly string[],
    withPlansTable: boolean,
  ): Promise<string> {
    if (dir === "") dir = scratchDir("live-fetch-all-pages-");
    const sidePath = join(dir, `one-trip-side-${pageNames.join("-")}.sqlite3`);
    const inlineDbPath = join(dir, `deck-inline-${pageNames.join("-")}.sqlite3`);
    const mirror = new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true });
    const side = new LocalSqliteDriver({ path: sidePath });
    await buildOneTripClosure({ corpus: mirror, side, pageNames: [...pageNames] });
    side.close();
    copyFileSync(MIRROR_COPY_PATH, inlineDbPath);
    const loadDb = new LocalSqliteDriver({ path: inlineDbPath });
    // The composed freshness gate fails LOUDLY on an unmigrated database by
    // design, so this deck copy is migrated the way a provisioned database
    // is (0003, order-safe). The shared mirror is never touched.
    await applyDeckDataVersionStampMigration(loadDb);
    for (const statement of ONE_TRIP_SIDE_DDL) {
      await loadDb.query(statement, []);
    }
    if (withPlansTable) await loadDb.query(RENDER_PLANS_DDL, []);
    await attachDerivedStore(loadDb, sidePath, "side_load");
    try {
      for (const table of [
        "one_trip_meta",
        "one_trip_edges",
        "one_trip_page_closure",
        "one_trip_search_nests",
        "one_trip_search_results",
        "one_trip_page_rules",
      ]) {
        await loadDb.query(`INSERT INTO ${table} SELECT * FROM side_load.${table}`, []);
      }
    } finally {
      await detachDerivedStore(loadDb, "side_load");
    }
    loadDb.close();
    return inlineDbPath;
  }

  function setLivePostureEnv(): void {
    process.env.DECKO_ONE_TRIP = "1";
    process.env.DECKO_ONE_TRIP_STORE = "inline";
    // THE DELIVERABLE POSTURE: stored plans are the demo stop-gap only —
    // the live path never consults the plan table.
    process.env.DECKO_ONE_TRIP_PLANS = "0";
  }

  function clearGateEnv(): void {
    delete process.env.DECKO_ONE_TRIP;
    delete process.env.DECKO_ONE_TRIP_STORE;
    delete process.env.DECKO_ONE_TRIP_PLANS;
  }

  /** The plan-table reads in a trip log: every captured statement whose SQL
   *  names the demo stop-gap's table. The live posture's contract is ZERO. */
  function planTableReads(driver: TripCapturingDriver): { sql: string; params: unknown[] }[] {
    return driver.statements
      .filter((s) => /one_trip_render_plans/i.test(s.sql))
      .map((s) => ({ sql: s.sql, params: s.params }));
  }

  /** The fetch's shape as CALLED (not as recorded): the head round trip is
   *  one driver.query (the walk CTE names the derived edge store) and the
   *  keyset slices ride ONE driver.batch call (the V3 transport). The walls
   *  make the whole fetch exactly 2 live trips. Layer this UNDER the
   *  TripCapturingDriver so every call passes through it. */
  class FetchCallCountingDriver implements SQLDatabaseDriver {
    heads = 0;
    sliceBatchCalls = 0;
    constructor(private readonly inner: SQLDatabaseDriver) {}
    async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
      if (/one_trip_edges/i.test(sql)) this.heads += 1;
      return this.inner.query<T>(sql, params);
    }
    async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
      if (
        statements.length > 0 &&
        statements.every((s) => /json_each\(\?\)/i.test(s.sql)) &&
        statements.some((s) => /FROM \(SELECT DISTINCT co\.\* FROM cards/i.test(s.sql))
      ) {
        this.sliceBatchCalls += 1;
      }
      return this.inner.batch(statements);
    }
  }

  it(
    `LIVE-1: the UNPLANNED page ${UNPLANNED_PAGE} renders through the live fetch — ` +
      "zero plan-table reads, head + 1 slice batch, bytes equal to OFF",
    async () => {
      dir = scratchDir("live-fetch-all-pages-");
      // The unplanned store carries the side DDL's plan table EMPTY — the
      // zero-reads assertion below observes the live posture's choice
      // against a table it could have read.
      const inlineDbPath = await buildInlineStore([UNPLANNED_PAGE], false);

      // ---- the OFF baseline (unchanged path, the byte reference) ---------
      const baselinePath = join(dir, "deck-baseline-stamped.sqlite3");
      copyFileSync(MIRROR_COPY_PATH, baselinePath);
      const baselineLoad = new LocalSqliteDriver({ path: baselinePath });
      await applyDeckDataVersionStampMigration(baselineLoad);
      baselineLoad.close();
      const baseline = new TripCapturingDriver(
        new LocalSqliteDriver({ path: baselinePath, readonly: true }),
      );
      const baselineBoot = await bootEngine(baseline);
      const baselineHtml = await baselineBoot.render.render(UNPLANNED_PAGE, "open", {});

      // ---- the LIVE posture render ---------------------------------------
      setLivePostureEnv();
      const callCounts = new FetchCallCountingDriver(
        new LocalSqliteDriver({ path: inlineDbPath, readonly: true }),
      );
      const live = new TripCapturingDriver(callCounts);
      const liveBoot = await bootEngine(live);
      const liveHtml = await liveBoot.render.render(UNPLANNED_PAGE, "open", {});

      // THE NO-PLAN-TABLE PIN: the plan table is not even present in this
      // store — a lookup would throw; the assertion makes the zero an
      // observed property of the trip log, not an inference.
      expect(
        planTableReads(live),
        "the live posture must not read one_trip_render_plans (stored plans are the demo stop-gap)",
      ).toHaveLength(0);

      // THE FETCH-SHAPE PIN (the two walls): the whole fetch is exactly 2
      // live trips — ONE head query (the walk CTE over the derived edge
      // store, carrying the stamp column) + ONE keyset slice batch (WALL 2's
      // bounded-value transport, the V3 single-batch POST).
      expect(
        callCounts.heads,
        "exactly one head round trip (the live inclusion-tree fetch)",
      ).toBe(1);
      expect(
        callCounts.sliceBatchCalls,
        "exactly one keyset slice batch call (WALL 2's bounded-value transport)",
      ).toBe(1);

      // THE STAMP-RIDES-THE-STATEMENT PIN: the head is the same statement
      // that carries deck_data_version — a moved version is visible
      // in the same read, by construction.
      const head = live.statements.find((s) => /one_trip_edges/i.test(s.sql));
      expect(head, "the head statement exists").toBeDefined();
      expect(
        /deck_data_version/i.test(head?.sql ?? ""),
        "the head statement carries the freshness stamp as a column",
      ).toBe(true);

      // THE BYTE PIN: the live-posture render is the OFF render, byte for
      // byte (modulo the per-render slot ids).
      expect(
        normalizeSlotIds(liveHtml),
        "the live-posture render must be byte-identical (modulo slot ids) to the OFF baseline",
      ).toBe(normalizeSlotIds(baselineHtml));

      clearGateEnv();
    },
    600_000,
  );

  it(
    `LIVE-2: the PLANNED page ${PLANNED_PAGE} rides the SAME live fetch when the ` +
      "store-plans flag is off — zero plan-table reads, bytes equal to OFF",
    async () => {
      // The planned-page store CARRIES the plan table with seeded rows (the
      // demo stop-gap's data) — the live posture must leave it unread.
      const inlineDbPath = await buildInlineStore([PLANNED_PAGE], true);
      const seedDb = new LocalSqliteDriver({ path: inlineDbPath });
      const pageId = (
        await seedDb.query<{ id: number }>(
          'SELECT id FROM cards WHERE "key" = ? AND trash = 0 LIMIT 1',
          ["home"],
        )
      ).rows[0]?.id;
      expect(pageId, "the page card must resolve").toBeTypeOf("number");
      await seedDb.query(
        "INSERT INTO one_trip_render_plans (page_id, seq, family, sql, params_json) VALUES (?, 0, 'plan', ?, ?)",
        [
          pageId,
          "SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1",
          JSON.stringify(["never-read-under-the-live-posture"]),
        ],
      );
      seedDb.close();

      // ---- the OFF baseline ----------------------------------------------
      const baselinePath = join(dir, "deck-baseline-planned-stamped.sqlite3");
      copyFileSync(MIRROR_COPY_PATH, baselinePath);
      const baselineLoad = new LocalSqliteDriver({ path: baselinePath });
      await applyDeckDataVersionStampMigration(baselineLoad);
      baselineLoad.close();
      const baseline = new TripCapturingDriver(
        new LocalSqliteDriver({ path: baselinePath, readonly: true }),
      );
      const baselineBoot = await bootEngine(baseline);
      const baselineHtml = await baselineBoot.render.render(PLANNED_PAGE, "open", {});

      // ---- the LIVE posture render ---------------------------------------
      setLivePostureEnv();
      const callCounts = new FetchCallCountingDriver(
        new LocalSqliteDriver({ path: inlineDbPath, readonly: true }),
      );
      const live = new TripCapturingDriver(callCounts);
      const liveBoot = await bootEngine(live);
      const liveHtml = await liveBoot.render.render(PLANNED_PAGE, "open", {});

      expect(
        planTableReads(live),
        "a planned page under the live posture must not read one_trip_render_plans either — planned AND unplanned ride the same live statement",
      ).toHaveLength(0);
      expect(
        callCounts.heads,
        "exactly one head round trip (the live inclusion-tree fetch)",
      ).toBe(1);
      expect(
        callCounts.sliceBatchCalls,
        "exactly one keyset slice batch call",
      ).toBe(1);
      expect(
        normalizeSlotIds(liveHtml),
        "the planned page's live-posture render must be byte-identical (modulo slot ids) to the OFF baseline",
      ).toBe(normalizeSlotIds(baselineHtml));

      clearGateEnv();
    },
    600_000,
  );

  it(
    `LIVE-3: a WARM re-render of ${UNPLANNED_PAGE} on the live posture stays at the ` +
      `${LIVE_WARM_TRIP_TARGET}-trip floor with zero plan-table reads and stable bytes`,
    async () => {
      const inlineDbPath = await buildInlineStore([UNPLANNED_PAGE], false);
      setLivePostureEnv();
      const live = new TripCapturingDriver(
        new LocalSqliteDriver({ path: inlineDbPath, readonly: true }),
      );
      const liveBoot = await bootEngine(live);
      const coldHtml = await liveBoot.render.render(UNPLANNED_PAGE, "open", {});
      const tripsBeforeWarm = live.trips;
      const statementsBeforeWarm = live.statements.length;

      // The warm render rides the SAME engine (the seat memo is per engine),
      // so the same driver keeps counting and the delta is the warm render's
      // own trip cost.
      const warmHtml = await liveBoot.render.render(UNPLANNED_PAGE, "open", {});
      const warmTrips = live.trips - tripsBeforeWarm;
      const warmStatements = live.statements.slice(statementsBeforeWarm);

      expect(
        warmStatements.filter((s) => /one_trip_render_plans/i.test(s.sql)),
        "the warm render must not read the plan table either",
      ).toHaveLength(0);
      expect(
        normalizeSlotIds(warmHtml),
        "the warm render must be byte-identical (modulo slot ids) to the cold live render",
      ).toBe(normalizeSlotIds(coldHtml));
      expect(
        warmTrips,
        `the warm live-posture render spent ${warmTrips} round trips; the retarget's floor is ` +
          `${LIVE_WARM_TRIP_TARGET} (the freshness gate's stamp read + at most one residual batch)`,
      ).toBeLessThanOrEqual(LIVE_WARM_TRIP_TARGET);

      clearGateEnv();
    },
    600_000,
  );
});

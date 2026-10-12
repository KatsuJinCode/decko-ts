// THE RENDERPLAN-REPLAY TRIP-PROFILE PIN.
//
// THE MECHANISM UNDER PIN: with DECKO_ONE_TRIP=1 and DECKO_ONE_TRIP_STORE=
// inline, the render path consults a PRE-COMPUTED RENDER PLAN (per page: the
// exact pipeline-able statements + params, recorded at store-build time from
// the same closure the one_trip_* tables carry, stored in
// one_trip_render_plans, delivered to the gate inside the seat's head
// statement). The gate replays the plan as ONE driver.batch and arms a
// replay layer at the engine's driver seam; every render statement whose
// (sql, params) matches a plan entry is answered from the plan's result set
// with ZERO round trips. Only genuinely order-dependent statements
// (search-count) and the boot phase still reach the driver.
//
// THE TRIP FLOOR (the trip census's theoretical floor, ON posture): 5 round
// trips per cold page = 1 boot batch + 2 seat (head + slice batch) + 1
// replay batch + 1 order-dependent search-count.
//
// SELF-CONTAINED SEEDING so the pin RUNS at base and FAILS there on the
// trip profile: the pin records its own plan (a capture render through the
// gate, filtered to the pipeline-able families) and seeds
// one_trip_render_plans with raw SQL. At base the gate ignores the table
// and the render re-issues every solo read (RED: ~109 trips, ~130 covered
// live reads); after the build the serve path replays them (GREEN: 5).
//
// Byte-equality is asserted on every run: the replay render must produce
// the same HTML as the OFF baseline (normalizeSlotIds — the established
// per-render slot-id normalization).

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import { buildOneTripClosure } from "../../../src/card/one-trip/closure-builder.js";
import { ONE_TRIP_SIDE_DDL } from "../../../src/card/one-trip/side-db-schema.js";
import {
  attachDerivedStore,
  detachDerivedStore,
} from "../../../src/card/one-trip/one-trip-fetch.js";
import {
  classifyResidueStatement,
  recordRenderPlan,
} from "../../../src/card/one-trip/render-plan.js";
import { foldRenderPlanEntries } from "../../../src/card/one-trip/replay-fold.js";
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

const PAGE = "Home";
/** The trip census's floor: 1 boot batch + 2 seat + 1 replay batch. The
 *  census's original floor was 5 — its fifth member was the cold batch's
 *  live count+stamp discharge (the two statements plans never absorb). Both
 *  were folded into the seat head as zero-bind columns: the discharge is
 *  empty, the trip is
 *  gone, and the search-count rides the replay batch as an unfolded live
 *  member. */
const FLOOR_TRIPS = 4;

/** The pipeline-able statement filter: SELECT/WITH-shaped corpus reads in a
 *  NAMED residue class (render-plan.ts's registry), excluding the seat's
 *  own reads and the two order-dependent search classes. Mirrors the
 *  census's classifier; kept local so the pin runs at base. */
function isPipelineAbleRenderStatement(sql: string): boolean {
  const t = sql.trim();
  if (!/^(SELECT|WITH)\b/i.test(t)) return false;
  if (/one_trip_/i.test(t)) return false;
  const family = classifyResidueStatement(sql);
  if (family === undefined) {
    // the census's one registry gap: the simple-name point read
    return /^SELECT id FROM cards WHERE name = \? AND trash = 0 LIMIT 1$/i.test(t);
  }
  // The freshness gate's stamp read is render-entry gate state, not page
  // data — a plan records neither it nor any per-request gate statement
  // (mirrors render-plan.ts's
  // production filter; one registry entry, one shape predicate).
  if (family === "freshness-stamp") return false;
  return family !== "search-count" && family !== "search-cql";
}

/** The plan table's shape (identical to the engine's side-db-schema entry —
 *  the pin seeds the same table the serve path reads). */
const RENDER_PLANS_DDL =
  "CREATE TABLE IF NOT EXISTS one_trip_render_plans (" +
  " page_id INTEGER NOT NULL," +
  " seq INTEGER NOT NULL," +
  " family TEXT NOT NULL," +
  " sql TEXT NOT NULL," +
  " params_json TEXT NOT NULL," +
  " PRIMARY KEY (page_id, seq))";

describeOrSkipLoud(!hasMirror, "tests/card/one-trip/renderplan-replay-trip-profile.test.ts", "hasMirror")("renderplan replay: the cold render's trip profile is plan-driven", () => {
  let dir = "";
  let inlineDbPath = "";
  const savedEnv = {
    gate: process.env.DECKO_ONE_TRIP,
    store: process.env.DECKO_ONE_TRIP_STORE,
  };

  afterAll(() => {
    if (savedEnv.gate === undefined) delete process.env.DECKO_ONE_TRIP;
    else process.env.DECKO_ONE_TRIP = savedEnv.gate;
    if (savedEnv.store === undefined) delete process.env.DECKO_ONE_TRIP_STORE;
    else process.env.DECKO_ONE_TRIP_STORE = savedEnv.store;
    if (dir !== "") {
      try {
        rmSync(dir, { force: true, recursive: true });
      } catch {
        /* Windows file lock: OS temp cleans up */
      }
    }
  });

  it(
    `replays ${PAGE} to the 5-trip floor, zero covered-family live reads, bytes equal to OFF`,
    async () => {
      dir = scratchDir("renderplan-replay-pin-");
      inlineDbPath = join(dir, "deck-inline-materialized.sqlite3");

      // ---- the inline store (the chunked-fetch recipe, verbatim) ----------
      const sidePath = join(dir, "one-trip-side.sqlite3");
      const mirror = new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true });
      const side = new LocalSqliteDriver({ path: sidePath });
      await buildOneTripClosure({ corpus: mirror, side, pageNames: [PAGE] });
      side.close();
      copyFileSync(MIRROR_COPY_PATH, inlineDbPath);
      const loadDb = new LocalSqliteDriver({ path: inlineDbPath });
      // The composed freshness gate reads deck_data_version at every render
      // entry and fails LOUDLY on an unmigrated database by design — so this
      // deck copy is migrated exactly the way a provisioned database is
      // (0003, order-safe). The shared mirror itself is never touched.
      await applyDeckDataVersionStampMigration(loadDb);
      for (const statement of ONE_TRIP_SIDE_DDL) {
        await loadDb.query(statement, []);
      }
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

      // ---- RECORD: a capture render through the gate (ON posture) ---------
      process.env.DECKO_ONE_TRIP = "1";
      process.env.DECKO_ONE_TRIP_STORE = "inline";
      const recorder = new TripCapturingDriver(
        new LocalSqliteDriver({ path: inlineDbPath, readonly: true }),
      );
      const recorderBoot = await bootEngine(recorder);
      await recorderBoot.render.render(PAGE, "open", {});
      const planEntries = recordRenderPlan(
        PAGE,
        recorder.statements
          .filter((s) => isPipelineAbleRenderStatement(s.sql))
          .map((s) => ({ sql: s.sql, params: s.params })),
      ).entries;
      expect(planEntries.length, "the recorded plan must be non-trivial").toBeGreaterThan(20);

      // ---- SEED: the plan rows, raw SQL (the store-build artifact) --------
      const seedDb = new LocalSqliteDriver({ path: inlineDbPath });
      await seedDb.query(RENDER_PLANS_DDL, []);
      const pageId = (
        await seedDb.query<{ id: number }>(
          'SELECT id FROM cards WHERE "key" = ? AND trash = 0 LIMIT 1',
          ["home"],
        )
      ).rows[0]?.id;
      expect(pageId, "the page card must resolve").toBeTypeOf("number");
      for (let i = 0; i < planEntries.length; i += 100) {
        const chunk = planEntries.slice(i, i + 100);
        const placeholders = chunk.map(() => "(?, ?, ?, ?, ?)").join(", ");
        await seedDb.query(
          `INSERT OR REPLACE INTO one_trip_render_plans (page_id, seq, family, sql, params_json) VALUES ${placeholders}`,
          chunk.flatMap((entry, k) => [
            pageId,
            i + k,
            "plan",
            entry.sql,
            JSON.stringify(entry.params),
          ]),
        );
      }
      seedDb.close();

      // ---- REPLAY: a fresh engine renders through the seeded plan ---------
      const replay = new TripCapturingDriver(
        new LocalSqliteDriver({ path: inlineDbPath, readonly: true }),
      );
      const replayBoot = await bootEngine(replay);
      const replayHtml = await replayBoot.render.render(PAGE, "open", {});

      // ---- the OFF baseline (unchanged path, the byte reference) ----------
      delete process.env.DECKO_ONE_TRIP;
      delete process.env.DECKO_ONE_TRIP_STORE;
      // The baseline renders through the composed engine too, so its deck
      // must carry the stamp as well (migrated temp copy; the shared mirror
      // is never touched). The stamp adds no render bytes, so the byte pin
      // below keeps comparing like with like.
      const baselinePath = join(dir, "deck-baseline-stamped.sqlite3");
      copyFileSync(MIRROR_COPY_PATH, baselinePath);
      const baselineLoad = new LocalSqliteDriver({ path: baselinePath });
      await applyDeckDataVersionStampMigration(baselineLoad);
      baselineLoad.close();
      const baseline = new TripCapturingDriver(
        new LocalSqliteDriver({ path: baselinePath, readonly: true }),
      );
      const baselineBoot = await bootEngine(baseline);
      const baselineHtml = await baselineBoot.render.render(PAGE, "open", {});

      // THE BYTE PIN: the replay render is the OFF render, byte for byte.
      expect(
        normalizeSlotIds(replayHtml),
        "the replay-path render must be byte-identical (modulo slot ids) to the OFF baseline",
      ).toBe(normalizeSlotIds(baselineHtml));

      // THE FLOOR PIN: 1 boot batch + 2 seat + 1 replay batch (the
      // count+stamp trip died into the head's zero-bind columns; the
      // search-count rides the replay batch as an unfolded live member).
      expect(
        replay.trips,
        `the replay-path cold render spent ${replay.trips} round trips; the census floor is ${FLOOR_TRIPS} ` +
          `(1 boot batch + 2 seat + 1 replay batch) — every pipeline-able ` +
          `family must be answered from the plan result set, never live`,
      ).toBe(FLOOR_TRIPS);

      // THE NO-SOLO-READS PIN: the capture's covered-family statements are
      // exactly the plan's own batch — the ONE replay batch delivering the
      // plan, in either posture — and nothing beyond it. Any covered read
      // the plan did not answer would be a SOLO live trip, which the 5-trip
      // floor above already forbids; this pins the statement side of the
      // same contract.
      //
      // "The plan's own batch" is the ladder's entry list when the fold is
      // off (DECKO_REPLAY_FOLD=0) and the FOLDED statement list when it is
      // on (replay-fold.ts merges the plan's read classes into per-class
      // json_each statements). Deriving the allowed set from the plan rather
      // than hard-coding either shape keeps the pin's intent — nothing
      // covered travels live beyond the replay batch — while letting the
      // batch's statement SHAPE change, which is what the fold is.
      const folded = foldRenderPlanEntries(planEntries);
      const keyOf = (s: { sql: string; params: unknown[] }): string =>
        `${s.sql}::${JSON.stringify(s.params)}`;
      // Allowed = the plan's own entries (the seat's card slices are plan
      // entries too — that is what the pin has always allowed) PLUS the
      // folded batch's statements, which carry no entry text of their own.
      const planKeys = new Set(planEntries.map(keyOf));
      const foldedKeys = new Set(folded.statements.map(keyOf));
      for (const key of foldedKeys) planKeys.add(key);
      const captureCovered = replay.statements.filter(
        (s) => isPipelineAbleRenderStatement(s.sql) || planKeys.has(keyOf(s)),
      );
      const excess = captureCovered.filter((s) => !planKeys.has(keyOf(s)));
      expect(
        excess.length,
        `covered-family statements beyond the plan: ${excess.length} ` +
          `(capture covered ${captureCovered.length}, plan batch ${folded.statements.length} ` +
          `from ${planEntries.length} entries). ` +
          `Excess samples: ${excess
            .slice(0, 4)
            .map((s) => `[${s.sql.slice(0, 100)}] params=${JSON.stringify(s.params).slice(0, 60)}`)
            .join(" | ")}`,
      ).toBe(0);

      // THE FOLD-SHAPE PIN: with the fold ON the
      // replay batch must be STRICTLY SMALLER than the plan's entry count —
      // the statement-count collapse is the measurement this pin exists
      // for, and a pin that only counted trips would not see it.
      if (process.env.DECKO_REPLAY_FOLD !== "0") {
        expect(
          folded.statements.length,
          `the folded batch must carry fewer statements than the plan has entries ` +
            `(folded ${folded.statements.length} vs plan ${planEntries.length})`,
        ).toBeLessThan(planEntries.length);
        // Distinct folded keys delivered: a folded statement's (sql, params) can
        // coincide with a seat card-slice's, so the raw capture can count the
        // same statement twice — the distinct count is the batch's size.
        const delivered = new Set(
          replay.statements.filter((s) => foldedKeys.has(keyOf(s))).map(keyOf),
        );
        expect(
          delivered.size,
          "the replay batch must deliver every folded statement",
        ).toBe(folded.statements.length);
      }

      // THE ORDER-DEPENDENT PIN: no order-dependent statement reaches the
      // driver. The registry's /COUNT\(\*\)/ tail would misclassify the
      // PERMISSION gate-count as "search-count" — Home's search nests never
      // fill their limit, so no real search-count exists here. The gate-count
      // rides the seat head as a zero-bind column, so zero
      // COUNT-shaped statements reach the driver; the plan-swallowing guard
      // for genuinely order-dependent shapes lives in the recorder filter
      // (ORDER_DEPENDENT_CLASSES), which this pin's local filter mirrors.
      const searchCounts = replay.statements.filter(
        (s) => classifyResidueStatement(s.sql) === "search-count",
      );
      expect(
        searchCounts,
        "no COUNT-shaped statement may reach the driver on this page (the gate-count rides the head column; a real search-count would name a registry gap)",
      ).toHaveLength(0);
    },
    600_000,
  );
});

// THE RENDERPLAN-REPLAY TRIP-PROFILE PIN (renderplan-replay lane, 2026-10-05).
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
import {
  MIRROR_COPY_PATH,
  TripCapturingDriver,
  bootEngine,
  mirrorAvailable,
  normalizeSlotIds,
} from "./one-trip-fixture.js";

const PAGE = "Home";
/** The trip census's theoretical floor: 1 boot batch + 2 seat + 1 replay
 *  batch + 1 order-dependent search-count. */
const FLOOR_TRIPS = 5;

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

describe("renderplan replay: the cold render's trip profile is plan-driven", () => {
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
      expect(mirrorAvailable(), "the trial-deck mirror copy must exist").toBe(true);
      dir = mkdtempSync(join(tmpdir(), "renderplan-replay-pin-"));
      inlineDbPath = join(dir, "deck-inline-materialized.sqlite3");

      // ---- the inline store (the chunked-fetch recipe, verbatim) ----------
      const sidePath = join(dir, "one-trip-side.sqlite3");
      const mirror = new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true });
      const side = new LocalSqliteDriver({ path: sidePath });
      await buildOneTripClosure({ corpus: mirror, side, pageNames: [PAGE] });
      side.close();
      copyFileSync(MIRROR_COPY_PATH, inlineDbPath);
      const loadDb = new LocalSqliteDriver({ path: inlineDbPath });
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
      const baseline = new TripCapturingDriver(
        new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true }),
      );
      const baselineBoot = await bootEngine(baseline);
      const baselineHtml = await baselineBoot.render.render(PAGE, "open", {});

      // THE BYTE PIN: the replay render is the OFF render, byte for byte.
      expect(
        normalizeSlotIds(replayHtml),
        "the replay-path render must be byte-identical (modulo slot ids) to the OFF baseline",
      ).toBe(normalizeSlotIds(baselineHtml));

      // THE FLOOR PIN: 1 boot batch + 2 seat + 1 replay batch + 1 search-count.
      expect(
        replay.trips,
        `the replay-path cold render spent ${replay.trips} round trips; the census floor is ${FLOOR_TRIPS} ` +
          `(1 boot batch + 2 seat + 1 replay batch + 1 search-count) — every pipeline-able ` +
          `family must be answered from the plan result set, never live`,
      ).toBe(FLOOR_TRIPS);

      // THE NO-SOLO-READS PIN: the capture's covered-family statements are
      // exactly the plan's entries — the ONE replay batch delivering the
      // plan — and nothing beyond it. Any covered read the plan did not
      // answer would be a SOLO live trip, which the 5-trip floor above
      // already forbids; this pins the statement side of the same contract.
      const captureCovered = replay.statements.filter((s) =>
        isPipelineAbleRenderStatement(s.sql),
      );
      const planKeys = new Set(
        planEntries.map((e) => `${e.sql}::${JSON.stringify(e.params)}`),
      );
      const excess = captureCovered.filter(
        (s) => !planKeys.has(`${s.sql}::${JSON.stringify(s.params)}`),
      );
      expect(
        excess.length,
        `covered-family statements beyond the plan: ${excess.length} ` +
          `(capture covered ${captureCovered.length}, plan ${planEntries.length}). ` +
          `Excess samples: ${excess
            .slice(0, 4)
            .map((s) => `[${s.sql.slice(0, 100)}] params=${JSON.stringify(s.params).slice(0, 60)}`)
            .join(" | ")}`,
      ).toBe(0);

      // THE ORDER-DEPENDENT PIN: the search-count still travels live (the
      // one genuinely sequential trip the floor keeps).
      const searchCounts = replay.statements.filter(
        (s) => classifyResidueStatement(s.sql) === "search-count",
      );
      expect(
        searchCounts.length,
        "the order-dependent search-count must still reach the driver (the plan must not swallow it)",
      ).toBe(1);
    },
    600_000,
  );
});

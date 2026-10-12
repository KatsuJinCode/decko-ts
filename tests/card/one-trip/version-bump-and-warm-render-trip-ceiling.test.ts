// THE TRIP-CEILING PINS for the recomposition trip-flood.
//
// WHAT THIS PINS: the ROUND-TRIP CEILING of the two postures the warm-render
// trip-flood lives in —
//
//   PIN 1 (fixture guard, GREEN at base): a fresh signed-in engine's seated
//     render of a planned page costs ≤ 12 trips and arms the recorded plan.
//     The fast path WORKS on render 1 — the defect is not the seat. A RED
//     here is fixture accident: pins 2-3 must not be interpreted.
//   PIN 2 (recomposition ceiling): after a committed-write version bump (the
//     triggers' exact effect), the SAME warm engine's next render costs
//     ≤ 25 trips with ≤ 12 live pair-exists probes, bytes stable. The flood
//     mechanism: resetCaches() wipes the fetcher's caches
//     and the render-card map but leaves the wave's ENGINE-LIFETIME ask
//     memory set, so the wave muzzles itself ("already asked") over wiped
//     answers and the walk falls to solo point reads — the plan cannot help
//     (its entries are a cold anonymous recording; the flood's probes are
//     warm signed-in questions with ~0% membership).
//   PIN 3 (warm-render ceiling, no bump anywhere): two more renders of the
//     same page on the same engine, NO version move anywhere, cost ≤ 25
//     trips each and NON-WORSENING. This pin exists because the flood is NOT
//     bump-caused (the reset in a bump actually LOWERS the
//     next render's cost); a reset-completeness patch alone turns pin 2
//     green while the user-visible disease — every warm render of a planned
//     page on a warm signed-in engine — persists and escalates. Pin 3 is the
//     pin that keeps a partial fix from shipping as "the flood is fixed".
//
// MEASURED CONSTANTS this pin was calibrated against (same fixture recipe):
//   render 1 fresh seated ............ 7 trips, plan armed
//   render 1b warm, no bump ......... 398 trips, 185 live pair probes, 0/185 plan members
//   render 1c warm, no bump ......... 576 trips
//   bump → render 2 ................. 341 trips, 295 live pair probes (325 issued, 30 plan members)
//   render 3/4 warm, no bump ........ 1262 / 3510 trips (escalating)
// On the composed trunk the absolute numbers may shift (later fixes and
// the replay fold change some arms) — the GUARD (pin 1) re-derives the floor
// and the BOUNDS (25 / 12) are absolute, ~3.5x the measured floor and ~14x
// under the smallest measured flood arm. If the trunk's render-1 floor
// differs from the guard, re-derive before loosening anything: the bound is
// derived from the measured floor, never inherited.
//
// INSTRUMENT: TripCapturingDriver.trips (one driver.query or driver.batch =
// one round trip) — the same instrument every constant above was measured
// with. No new accounting.
//
// BYTE GUARDS: every pair of same-page renders in this suite must agree
// modulo slot ids (normalizeSlotIds) — bytes are stable at every measured
// cost level, which is what makes this a COST pin; if a future fix drifts
// the bytes, these assertions must be the red ones, not the trip ones.
//
// Fixture: the signed-in seat posture's recipe — a writable tmp copy of the
// shared deck database, the deck_data_version stamp migration applied, the side
// store built for ["Home"] and materialized INLINE (DECKO_ONE_TRIP=1,
// DECKO_ONE_TRIP_STORE=inline, no ATTACH), the plan recorded at the exact
// serving posture with an anonymous capture render (freshness-stamp excluded
// — plans never record the invalidation probe) and seeded raw into
// one_trip_render_plans.

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import {
  attachDerivedStore,
  detachDerivedStore,
} from "../../../src/card/one-trip/one-trip-fetch.js";
import { ONE_TRIP_SIDE_DDL } from "../../../src/card/one-trip/side-db-schema.js";
import { buildOneTripClosure } from "../../../src/card/one-trip/closure-builder.js";
import { classifyResidueStatement, recordRenderPlan } from "../../../src/card/one-trip/render-plan.js";
import { RenderEngine } from "../../../src/card/render.js";
import type { ReadViewer } from "../../../src/card/permissions/index.js";
import { applyDeckDataVersionStampMigration } from "./apply-deck-data-version-stamp-migration.js";
import {
  MIRROR_COPY_PATH,
  TripCapturingDriver,
  bootEngine,
  mirrorAvailable,
  normalizeSlotIds,
  type EngineBoot,
  type CapturedStatement,
} from "./one-trip-fixture.js";
import { scratchDir } from "../../support/scratch-dir.mjs";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

const hasMirror = mirrorAvailable();

interface RenderMeasurement {
  label: string;
  trips: number;
  stmts: number;
  pairProbes: number;
  seatFetches: number;
}

const measurements: RenderMeasurement[] = [];

/** The signed-in posture the edge builds per actor (deckFor): a NEW
 *  RenderEngine over the shared fetcher, viewer + pageSession set BEFORE
 *  the first render, deployment config copied off the base engine. */
function actorEngineOver(base: EngineBoot, actorId: number): RenderEngine {
  const render = new RenderEngine(base.fetcher);
  render.imageCdnHost = base.render.imageCdnHost;
  render.tokenConfig = base.render.tokenConfig;
  render.fileStorage = base.render.fileStorage;
  const viewer: ReadViewer = { signedIn: true, actorId };
  render.viewer = viewer;
  render.pageSession = viewer;
  return render;
}

/** Statement-window stats for one render: the capture slice between two
 *  marks. Pair probes are the (left_id, right_id) junction existence
 *  questions the solo point path issues when the wave is muzzled — the
 *  flood's signature read class. Seat fetches (the WITH RECURSIVE walk
 *  shape) prove a re-seat ran. */
function windowStats(statements: CapturedStatement[]): { pairProbes: number; seatFetches: number } {
  let pairProbes = 0;
  let seatFetches = 0;
  for (const stmt of statements) {
    const t = stmt.sql.trim();
    if (/one_trip_/i.test(t)) continue;
    if (classifyResidueStatement(t) === "pair-exists-probe") pairProbes++;
    if (/WITH RECURSIVE walk\(id\)/i.test(t)) seatFetches++;
  }
  return { pairProbes, seatFetches };
}

async function renderAndMeasure(
  label: string,
  render: RenderEngine,
  capture: TripCapturingDriver,
): Promise<{ html: string; trips: number; stats: { pairProbes: number; seatFetches: number } }> {
  const tripsBefore = capture.trips;
  const stmtsBefore = capture.statements.length;
  const html = await render.render("Home", "open", {});
  const trips = capture.trips - tripsBefore;
  const slice = capture.statements.slice(stmtsBefore);
  const stats = windowStats(slice);
  measurements.push({ label, trips, stmts: slice.length, pairProbes: stats.pairProbes, seatFetches: stats.seatFetches });
  return { html, trips, stats };
}

describeOrSkipLoud(!hasMirror, "tests/card/one-trip/version-bump-and-warm-render-trip-ceiling.test.ts", "hasMirror")("version-bump and warm-render trip ceiling (the recomposition trip-flood pins)", () => {
  let sideDir = "";
  let workDbPath = "";
  let rawDb: InstanceType<typeof Database> | undefined;
  let actorId = 0;
  const savedEnv = { gate: process.env.DECKO_ONE_TRIP, store: process.env.DECKO_ONE_TRIP_STORE };

  beforeAll(async () => {
    sideDir = scratchDir("warmflood-ceiling-");
    workDbPath = join(sideDir, "mirror-migrated-inline.sqlite3");
    copyFileSync(MIRROR_COPY_PATH, workDbPath);
    // The deck_data_version stamp: the render path fails loudly
    // without it. Applied to the writable copy (order-safe, additive).
    {
      const migrate = new LocalSqliteDriver({ path: workDbPath });
      await applyDeckDataVersionStampMigration(migrate);
      migrate.close();
    }
    rawDb = new Database(workDbPath);
    const stamp = rawDb.prepare('SELECT "version" FROM "deck_data_version" WHERE "id" = 1').get() as
      | { version: number }
      | undefined;
    expect(typeof stamp?.version).toBe("number");

    // The side store: built from the migrated copy, one page, then
    // materialized INLINE into the working copy (the serving posture).
    const corpus = new LocalSqliteDriver({ path: workDbPath, readonly: true });
    const sidePath = join(sideDir, "one-trip-closure-side.sqlite3");
    const side = new LocalSqliteDriver({ path: sidePath });
    await buildOneTripClosure({ corpus, side, pageNames: ["Home"] });
    side.close();
    {
      const loadDb = new LocalSqliteDriver({ path: workDbPath });
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
    }

    // A real signed-in actor of the corpus (the edge's signed-in viewers
    // are actors of exactly this kind).
    const person = await corpus.query<{ id: number }>(
      "SELECT id FROM cards WHERE \"key\" = 'rowan_ellery' AND trash = 0 LIMIT 1",
      [],
    );
    actorId = person.rows[0]!.id;

    // RECORD the plan at the exact serving posture (gate ON, inline): an
    // anonymous capture render, filtered to the shipped pipeline-able
    // families (the freshness stamp NEVER rides a plan — it is the
    // invalidation probe, live by design), seeded raw.
    process.env.DECKO_ONE_TRIP = "1";
    process.env.DECKO_ONE_TRIP_STORE = "inline";
    const recorder = new TripCapturingDriver(
      new LocalSqliteDriver({ path: workDbPath, readonly: true }),
    );
    const recorderBoot = await bootEngine(recorder);
    await recorderBoot.render.render("Home", "open", {});
    const planEntries = recordRenderPlan(
      "Home",
      recorder.statements
        .filter((s) => {
          const t = s.sql.trim();
          if (!/^(SELECT|WITH)\b/i.test(t)) return false;
          if (/one_trip_/i.test(t)) return false;
          const family = classifyResidueStatement(s.sql);
          if (family === undefined) {
            return /^SELECT id FROM cards WHERE name = \? AND trash = 0 LIMIT 1$/i.test(t);
          }
          if (family === "freshness-stamp") return false;
          return family !== "search-count" && family !== "search-cql";
        })
        .map((s) => ({ sql: s.sql, params: s.params })),
    ).entries;
    expect(planEntries.length, "the recorded plan must be non-trivial").toBeGreaterThan(20);

    // SEED the plan rows into the inline store (the store-build artifact).
    const seedDb = new LocalSqliteDriver({ path: workDbPath });
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
          pageId!,
          i + k,
          "plan",
          entry.sql,
          JSON.stringify(entry.params),
        ]),
      );
    }
    seedDb.close();
    await corpus.close();
  }, 420_000);

  afterAll(() => {
    if (savedEnv.gate === undefined) delete process.env.DECKO_ONE_TRIP;
    else process.env.DECKO_ONE_TRIP = savedEnv.gate;
    if (savedEnv.store === undefined) delete process.env.DECKO_ONE_TRIP_STORE;
    else process.env.DECKO_ONE_TRIP_STORE = savedEnv.store;
    try { rawDb?.close(); } catch { /* OS temp cleans up */ }
    try { rmSync(sideDir, { recursive: true, force: true }); } catch { /* driver may hold the handle */ }
  });

  it("PIN 1 fixture guard: a fresh signed-in render of the planned page seats at ≤ 12 trips and arms the plan", async () => {
    const capture = new TripCapturingDriver(
      new LocalSqliteDriver({ path: workDbPath, readonly: true }),
    );
    const boot = await bootEngine(capture);
    const render = actorEngineOver(boot, actorId);
    const { trips } = await renderAndMeasure("pin1 render1 fresh seated", render, capture);
    expect(
      boot.fetcher.replayRouter.armed,
      "the recorded plan must be armed after the seated render",
    ).toBe(true);
    expect(
      trips,
      `PIN 1 FIXTURE GUARD: the fresh seated render must cost ≤ 12 trips (measured floor at the calibration tree: 7); got ${trips}. ` +
        "A RED here is fixture accident — pins 2 and 3 must not be interpreted.",
    ).toBeLessThanOrEqual(12);
  }, 300_000);

  it("PIN 3 warm-render ceiling: two no-bump warm renders cost ≤ 25 trips each and do not worsen", async () => {
    // One engine, three renders, NO version move anywhere. Render 1 is the
    // warm-up (and the byte reference); 1b and 1c are the pin's arms.
    const capture = new TripCapturingDriver(
      new LocalSqliteDriver({ path: workDbPath, readonly: true }),
    );
    const boot = await bootEngine(capture);
    const render = actorEngineOver(boot, actorId);
    const r1 = await renderAndMeasure("pin3 render1 fresh seated (warm-up)", render, capture);
    const r1b = await renderAndMeasure("pin3 render1b warm NO-BUMP", render, capture);
    const r1c = await renderAndMeasure("pin3 render1c warm NO-BUMP", render, capture);

    // Byte guard first: bytes are stable at every measured cost level —
    // a bytes drift means an output defect, and THOSE must be the red
    // assertions, not the trip ones.
    expect(normalizeSlotIds(r1b.html), "bytes must not drift warm render 1b vs render 1").toBe(
      normalizeSlotIds(r1.html),
    );
    expect(normalizeSlotIds(r1c.html), "bytes must not drift warm render 1c vs render 1").toBe(
      normalizeSlotIds(r1.html),
    );

    expect(
      r1b.trips,
      `PIN 3: the warm no-bump re-render must cost ≤ 25 trips (measured flood at the calibration tree: 398); got ${r1b.trips}. ` +
        "The flood mechanism: the warm walk diverges — each render resolves more names than the last (design doc F1).",
    ).toBeLessThanOrEqual(25);
    expect(
      r1c.trips,
      `PIN 3: the second warm no-bump render must cost ≤ 25 trips (measured flood: 576, escalating 1262 → 3510 by renders 3-4); got ${r1c.trips}.`,
    ).toBeLessThanOrEqual(25);
    expect(
      r1c.trips,
      `PIN 3 NON-WORSENING: trips(1c) ${r1c.trips} must be ≤ trips(1b) ${r1b.trips} — an escalating warm walk is the defect itself.`,
    ).toBeLessThanOrEqual(r1b.trips);
  }, 600_000);

  it("PIN 2 recomposition ceiling: after a version bump the same warm engine re-renders at ≤ 25 trips with ≤ 12 live pair probes", async () => {
    // The measurement harness's exact sequence (probe.render3-one-time-check.mts):
    // render 1, two warm no-bump renders (state depth), THEN the bump, then
    // the measured arm. The bump is the triggers' exact effect: version+1 on
    // ANOTHER connection (the edge isolate holds no write path).
    const capture = new TripCapturingDriver(
      new LocalSqliteDriver({ path: workDbPath, readonly: true }),
    );
    const boot = await bootEngine(capture);
    const render = actorEngineOver(boot, actorId);
    const r1 = await renderAndMeasure("pin2 render1 fresh seated", render, capture);
    await renderAndMeasure("pin2 render1b warm (state depth)", render, capture);
    await renderAndMeasure("pin2 render1c warm (state depth)", render, capture);
    expect(boot.fetcher.replayRouter.armed).toBe(true);

    const before = (rawDb!.prepare('SELECT "version" FROM "deck_data_version" WHERE "id" = 1').get() as { version: number }).version;
    rawDb!.prepare('UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1').run();
    const after = (rawDb!.prepare('SELECT "version" FROM "deck_data_version" WHERE "id" = 1').get() as { version: number }).version;
    expect(after).toBe(before + 1);

    const r2 = await renderAndMeasure("pin2 render2 POST-BUMP", render, capture);

    // Byte guard: a version-only bump changes no content — stable bytes at
    // any cost level.
    expect(normalizeSlotIds(r2.html), "bytes must not drift across the version-only bump").toBe(
      normalizeSlotIds(r1.html),
    );

    expect(
      r2.trips,
      `PIN 2: the post-bump recomposition render must cost ≤ 25 trips (measured flood at the calibration tree: 341); got ${r2.trips}. ` +
        "The flood mechanism (design doc F2/F3): resetCaches() wipes the lexicon and the render-card map but NOT the wave's engine-lifetime ask memory — the wave muzzles itself over wiped answers and the walk falls to solo point reads the plan cannot answer.",
    ).toBeLessThanOrEqual(25);
    expect(
      r2.stats.pairProbes,
      `PIN 2: the post-bump render's live pair-exists probes must be ≤ 12 (measured flood: 295 live of 325 issued); got ${r2.stats.pairProbes}. ` +
        "Solo (left_id, right_id) point reads are the muzzled wave's leak — each its own round trip.",
    ).toBeLessThanOrEqual(12);
  }, 600_000);

  it("logs the lane's measurement lines", async () => {
    // Measured values printed for the run log; vitest prints stdout verbatim.
    for (const m of measurements) {
      console.log(
        `TRIP-CEILING ${m.label}: trips=${m.trips} stmts=${m.stmts} pairProbes=${m.pairProbes} seatFetches=${m.seatFetches}`,
      );
    }
    expect(measurements.length).toBeGreaterThanOrEqual(6);
  });
});

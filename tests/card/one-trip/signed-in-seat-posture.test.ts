// THE SIGNED-IN SEAT POSTURE (per-viewer-seat lane, 2026-10-06): does the
// one-trip fast path hold when the viewer is SIGNED IN?
//
// The deployed edge serves signed-in requests through a per-actor
// RenderEngine over the SHARED FetchEngine (bunny-edge-session-viewer.ts
// ActorRenderEngines.deckFor). The seat gate (render-gate.ts
// seatOneTripPayloadForRender) is viewer-blind — it lives inside
// RenderEngine.render — so the pins here are the ones the lane must prove
// or refute ON THIS LINEAGE:
//
//   1. SEAT + PLAN PIN — a signed-in render of a planned page seats the
//      bundle AND arms the recorded plan (fetcher.replayRouter.armed), in
//      the INLINE serving posture (the deployed shape; the serving SQL
//      parser rejects ATTACH), byte-identical to the signed-in ladder
//      (gate OFF), and plan-replay class (strictly fewer trips).
//   2. VERSION-MOVE RECOMPOSITION — after a committed-write version bump
//      (the freshness stamp moving underneath a warm engine), the NEXT
//      signed-in render must RE-SEAT (a fresh bundle fetch, the armed plan
//      rebuilt from the store as it now stands) and stay byte-stable.
//      At base the seat memo and the armed plan both survive the freshness
//      gate's resetCaches() — the render recomposes by re-running the live
//      ladder over emptied caches with NO seat fetch (measured: 86 trips,
//      0 data-fetch trips) and would answer matched reads from the stale
//      armed map. This pin is the lane's RED.
//
// Fixture: a WRITABLE tmp copy of the trial-deck mirror with the freshness
// migration (deploy/migrations/0003-deck-data-version-stamp.sql — the
// assembly's canonical stamp migration; the seat lineage's copy was numbered
// 0007 with a byte-identical body, unified to 0003 in the r5 merge) applied —
// the circulating mirror copies predate the stamp and this lineage's render
// path fails loudly without it. The store is materialized INLINE into that
// copy (the chunked-fetch recipe) and the plan is recorded at the exact
// serving posture, seeded raw into one_trip_render_plans (the
// renderplan-replay-trip-profile recipe, signed-in variant).
//
// SCOPE NOTE (the honest boundary this test does NOT pin): a raw SQL edit
// without the write path's store recompute (invalidation.ts) leaves the
// STORE's snapshot rows stale by contract — the serving-side duty this
// lane owns is that a moved stamp invalidates the SEAT STATE (memo + armed
// plan); the store rebuild belongs to the write-path integration.

import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
import {
  MIRROR_COPY_PATH,
  TripCapturingDriver,
  bootEngine,
  mirrorAvailable,
  normalizeSlotIds,
  type EngineBoot,
} from "./one-trip-fixture.js";
import { scratchDir } from "../../support/scratch-dir.mjs";

const hasMirror = mirrorAvailable();
const MIGRATION_PATH = fileURLToPath(
  new URL("../../../deploy/migrations/0003-deck-data-version-stamp.sql", import.meta.url),
);

interface SeatMeasurement {
  label: string;
  trips: number;
  seatFetchStmts: number;
  planEntries: number;
  coveredFamilyLiveReads: number;
}

const measurements: SeatMeasurement[] = [];

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

/** The seat's own statement shapes (inline posture: no ATTACH — the head
 *  query and every keyset slice carry the WITH RECURSIVE walk shape; the
 *  slices ride ONE driver.batch whose members are recorded individually,
 *  so this classifier proves the fetch RAN; the trip-level cost is the
 *  capture's trip counter delta). */
function seatFetchStatements(statements: { sql: string }[]): number {
  let count = 0;
  for (const stmt of statements) {
    if (/WITH RECURSIVE walk\(id\)/i.test(stmt.sql)) count++;
  }
  return count;
}

/** Covered-family live reads: statements the render ISSUED LIVE (they
 *  reached the capture, so the armed plan did not answer them) whose
 *  family the plan is supposed to cover. The plan-hit ratio is
 *  1 - coveredFamilyLiveReads / planEntries (entries the render's own
 *  sequence never asks are legitimately absent). The freshness-stamp read
 *  is EXCLUDED from this count by the same reasoning the engine's plan
 *  filter excludes it from plans (render-plan.ts): it is the invalidation
 *  probe — live by design, never a plan miss. */
function coveredFamilyLiveReads(statements: { sql: string }[]): number {
  let count = 0;
  for (const stmt of statements) {
    const family = classifyResidueStatement(stmt.sql);
    if (family === undefined) continue;
    if (family === "search-count" || family === "search-cql") continue;
    if (family === "freshness-stamp") continue;
    if (/one_trip_/i.test(stmt.sql)) continue;
    count++;
  }
  return count;
}

describe.skipIf(!hasMirror)("signed-in viewer's one-trip seat posture (inline serving posture)", () => {
  let sideDir = "";
  let sidePath = "";
  let workDbPath = "";
  let rawDb: InstanceType<typeof Database> | undefined;
  let actorId = 0;
  let planEntries: { sql: string; params: unknown[] }[] = [];
  const savedEnv = { gate: process.env.DECKO_ONE_TRIP, store: process.env.DECKO_ONE_TRIP_STORE };

  beforeAll(async () => {
    sideDir = scratchDir("perviewer-seat-");
    workDbPath = join(sideDir, "mirror-migrated-inline.sqlite3");
    copyFileSync(MIRROR_COPY_PATH, workDbPath);
    // The freshness stamp (this lineage's render path fails loudly without
    // it), applied to the writable copy — the migration is additive and
    // order-safe by design (IF NOT EXISTS / INSERT OR IGNORE).
    rawDb = new Database(workDbPath);
    rawDb.exec(readFileSync(MIGRATION_PATH, "utf8"));
    const stamp = rawDb.prepare('SELECT "version" FROM "deck_data_version" WHERE "id" = 1').get() as
      | { version: number }
      | undefined;
    expect(typeof stamp?.version).toBe("number");

    // The side store: built from the MIGRATED copy (this lineage's own
    // truth), one page (the pin's scope), then materialized INLINE into
    // the working copy (the chunked-fetch recipe, verbatim).
    const corpus = new LocalSqliteDriver({ path: workDbPath, readonly: true });
    sidePath = join(sideDir, "one-trip-closure-side.sqlite3");
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

    // A real signed-in actor: a person card of the corpus (the edge's
    // signed-in viewers are actors of exactly this kind).
    const person = await corpus.query<{ id: number }>(
      "SELECT id FROM cards WHERE \"key\" = 'lisa_william_craig' AND trash = 0 LIMIT 1",
      [],
    );
    actorId = person.rows[0]!.id;

    // RECORD the plan at the exact serving posture (gate ON, inline), the
    // renderplan-replay-trip-profile recipe: a capture render through the
    // gate, filtered to the pipeline-able families, seeded raw.
    process.env.DECKO_ONE_TRIP = "1";
    process.env.DECKO_ONE_TRIP_STORE = "inline";
    const recorder = new TripCapturingDriver(
      new LocalSqliteDriver({ path: workDbPath, readonly: true }),
    );
    const recorderBoot = await bootEngine(recorder);
    await recorderBoot.render.render("Home", "open", {});
    planEntries = recordRenderPlan(
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
          // The engine's shipped filter (render-plan.ts
          // isPipelineAbleRenderStatement) excludes the freshness stamp —
          // the invalidation probe never rides a plan. The seeded plan must
          // be the SHIPPED shape.
          if (family === "freshness-stamp") return false;
          return family !== "search-count" && family !== "search-cql";
        })
        .map((s) => ({ sql: s.sql, params: s.params })),
    ).entries;
    expect(planEntries.length, "the recorded plan must be non-trivial").toBeGreaterThan(20);

    // SEED: the plan rows into the inline store (the store-build artifact).
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
          pageId,
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

  const PAGE = "Home";

  it("a signed-in render of a planned page seats, arms the plan, is byte-identical to the ladder, and is plan-replay class", async () => {
    // --- LADDER arm: gate off, fresh engine, the signed-in posture -------
    const savedGate = process.env.DECKO_ONE_TRIP;
    delete process.env.DECKO_ONE_TRIP;
    let ladderHtml = "";
    let ladderTrips = 0;
    try {
      const ladderCapture = new TripCapturingDriver(
        new LocalSqliteDriver({ path: workDbPath, readonly: true }),
      );
      const ladderBoot = await bootEngine(ladderCapture);
      const ladderRender = actorEngineOver(ladderBoot, actorId);
      ladderHtml = await ladderRender.render(PAGE, "open", {});
      ladderTrips = ladderCapture.trips;
    } finally {
      process.env.DECKO_ONE_TRIP = savedGate;
    }

    // --- SEAT arm: gate on, fresh engine, the same signed-in posture -----
    const seatCapture = new TripCapturingDriver(
      new LocalSqliteDriver({ path: workDbPath, readonly: true }),
    );
    const seatBoot = await bootEngine(seatCapture);
    const seatRender = actorEngineOver(seatBoot, actorId);
    const statementsBeforeRender = seatCapture.statements.length;
    const tripsBeforeRender = seatCapture.trips;
    const seatHtml = await seatRender.render(PAGE, "open", {});
    const seatTrips = seatCapture.trips - tripsBeforeRender;
    const renderStatements = seatCapture.statements.slice(statementsBeforeRender);
    const seatFetches = seatFetchStatements(renderStatements);
    const liveCovered = coveredFamilyLiveReads(renderStatements);

    measurements.push({
      label: "signed-in seat (fresh engine, plan armed)",
      trips: seatTrips,
      seatFetchStmts: seatFetches,
      planEntries: planEntries.length,
      coveredFamilyLiveReads: liveCovered,
    });
    measurements.push({
      label: "signed-in ladder (gate off)",
      trips: ladderTrips,
      seatFetchStmts: 0,
      planEntries: 0,
      coveredFamilyLiveReads: 0,
    });

    // THE SERVING-POSTURE PIN: inline — no ATTACH anywhere in the render.
    expect(
      renderStatements.some((s) => /^ATTACH DATABASE/i.test(s.sql)),
      "the inline serving posture must never ATTACH",
    ).toBe(false);
    // THE SEAT PIN: the bundle fetch ran (head + slices), and the plan is
    // armed on the SHARED fetcher's router — the exact seam a signed-in
    // render's reads flow through.
    expect(seatFetches, "the seat's bundle fetch must run (inline head + slice statements)").toBeGreaterThan(0);
    expect(seatBoot.fetcher.replayRouter.armed, "the recorded plan must be armed after the seat").toBe(true);
    // THE BYTE PIN: the seated signed-in render is the ladder's signed-in
    // render, byte for byte (modulo per-render slot ids).
    expect(normalizeSlotIds(seatHtml)).toBe(normalizeSlotIds(ladderHtml));
    // THE CLASS PIN: plan-replay class, not ladder class.
    expect(seatTrips).toBeLessThan(ladderTrips);
  }, 300_000);

  it("after a committed-write version bump the next signed-in render RE-SEATS and re-arms (recomposition, not stale-arm, not ladder collapse)", async () => {
    // Render 1 on a fresh engine: seats, arms the plan, sets the stamp.
    const capture = new TripCapturingDriver(
      new LocalSqliteDriver({ path: workDbPath, readonly: true }),
    );
    const boot = await bootEngine(capture);
    const render = actorEngineOver(boot, actorId);
    const statementsBeforeFirst = capture.statements.length;
    const tripsBeforeFirst = capture.trips;
    const html1 = await render.render(PAGE, "open", {});
    const trips1 = capture.trips - tripsBeforeFirst;
    expect(boot.fetcher.replayRouter.armed).toBe(true);

    // A committed write on ANOTHER connection moves the storage-layer stamp
    // (the triggers' exact effect; the edge isolate holds no write path).
    const before = (rawDb!.prepare('SELECT "version" FROM "deck_data_version" WHERE "id" = 1').get() as { version: number }).version;
    rawDb!.prepare('UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1').run();
    const after = (rawDb!.prepare('SELECT "version" FROM "deck_data_version" WHERE "id" = 1').get() as { version: number }).version;
    expect(after).toBe(before + 1);

    // Render 2, same warm engine: the freshness gate reads the moved stamp,
    // resets caches — and the seat STATE must recompose: the memo may not
    // survive (the re-seat must fetch the bundle again) and the armed plan
    // may not survive (stale in-memory results). A version-only bump
    // changes no content, so the bytes must stay stable too.
    const statementsBeforeSecond = capture.statements.length;
    const tripsBeforeSecond = capture.trips;
    const html2 = await render.render(PAGE, "open", {});
    const trips2 = capture.trips - tripsBeforeSecond;
    const secondStatements = capture.statements.slice(statementsBeforeSecond);
    const secondSeatFetches = seatFetchStatements(secondStatements);

    measurements.push({
      label: "signed-in render after version bump (same engine)",
      trips: trips2,
      seatFetchStmts: secondSeatFetches,
      planEntries: planEntries.length,
      coveredFamilyLiveReads: coveredFamilyLiveReads(secondStatements),
    });

    // THE RECOMPOSITION PIN (RED at base — measured: 0 seat fetches, the
    // render re-running its reads over emptied caches): the seat must
    // fetch the bundle again after the stamp moved.
    expect(
      secondSeatFetches,
      "the post-bump render must RE-SEAT (fresh bundle fetch); a surviving seat memo serves pre-bump state",
    ).toBeGreaterThan(0);
    // THE RE-ARM PIN: the plan rebuilt from the store as it now stands.
    expect(boot.fetcher.replayRouter.armed).toBe(true);
    // THE BYTE PIN: a version-only bump changes no content — stable bytes.
    expect(normalizeSlotIds(html2)).toBe(normalizeSlotIds(html1));
    // THE CLASS PIN: recomposition is plan-replay class, not ladder class.
    expect(trips2).toBeLessThan(trips1 * 2);
  }, 300_000);

  it("logs the lane's measurement lines", async () => {
    // The receipt quotes these; vitest prints stdout verbatim.
    for (const m of measurements) {
      console.log(
        `SIGNED-IN-SEAT ${m.label}: trips=${m.trips} seatFetchStmts=${m.seatFetchStmts} ` +
          `planEntries=${m.planEntries} coveredFamilyLiveReads=${m.coveredFamilyLiveReads}`,
      );
    }
    expect(measurements.length).toBeGreaterThanOrEqual(3);
  });
});

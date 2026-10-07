// THE PER-VIEWER-SEAT LANE'S PIN (lane-perviewer-seat-2026-10-06):
// a SIGNED-IN render of a PLANNED page must seat and complete in the
// plan-replay shape, byte-identical to the signed-in ladder.
//
// WHY THIS PIN EXISTS (the live measurement it answers, edge release
// 1137028): anonymous prepared pages serve in 0.04-0.6 s; the signed-in
// HOME seat serves in 0.18 s; but a signed-in member page measured 9.0 s —
// the unseated-ladder class. The dispatch hypothesis was that the edge's
// per-viewer branch (bunny-edge-engine-handler.ts:465-474, perViewer:true)
// skips the one-trip gate. The code trace says it cannot: the seat runs
// INSIDE RenderEngine.render (render.ts:793-795) and the signed-in actor
// engine SHARES the base deck's FetchEngine
// (bunny-edge-session-viewer.ts:181,183), so the seat memo and the armed
// replay plan are viewer-independent. This pin HOLDS THAT TRACE TO THE
// MEASURED CONTRACT: the anonymous-derived plan (the store-build posture,
// render-plan-recorder.ts:144-148 — fresh engine, no viewer) must cover a
// signed-in render of the same page — every viewer-independent statement
// answered from the plan, the per-viewer residue NAMED and measured (the
// role-party statement is the one structurally per-viewer SQL the engine
// issues — read-rules.ts:205-207,236-252), and the bytes identical to the
// signed-in render that ran the full ladder.
//
// The harness is the renderplan-replay trip-profile pin's shape
// (same build → record → seed → render recipe), with the REPLAY and the
// OFF-baseline renders both carrying the signed-in viewer (actor 583, the
// deck's no-role member — the same actor the live battery used).

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { buildOneTripClosure } from "../../../src/card/one-trip/closure-builder.js";
import { ONE_TRIP_SIDE_DDL } from "../../../src/card/one-trip/side-db-schema.js";
import {
  attachDerivedStore,
  detachDerivedStore,
} from "../../../src/card/one-trip/one-trip-fetch.js";
import {
  classifyResidueStatement,
  recordRenderPlan,
  type RenderPlanEntry,
} from "../../../src/card/one-trip/render-plan.js";
import { foldRenderPlanEntries } from "../../../src/card/one-trip/replay-fold.js";
import { DECK_DATA_VERSION_STATEMENT } from "../../../src/card/render.js";
import {
  MIRROR_COPY_PATH,
  TripCapturingDriver,
  bootEngine,
  mirrorAvailable,
  normalizeSlotIds,
  type EngineBoot,
} from "./one-trip-fixture.js";
import { applyDeckDataVersionStampMigration } from "./apply-deck-data-version-stamp-migration.js";
import { scratchDir } from "../../support/scratch-dir.mjs";

const PAGE = "Home";
/** The signed-in viewer the pin renders as: actor 583, the deck's no-role
 *  member (card-mod-edit-forms.test.ts:395's "no role membership") — the
 *  live battery's own account class. */
const ACTOR_ID = 583;
/** The composed signed-in ceiling, MEASURED on this lineage (this pin never
 *  completed pre-fixture-fix — the 8 it speculated was never observed). The
 *  anonymous core is 4 since the stamp-as-column lane (boot + seat head +
 *  chunk batch + replay batch; the count+stamp trip died into the head's
 *  zero-bind columns); the signed-in render adds the MEASURED per-viewer
 *  residue, every statement of it structurally per-viewer SQL: the
 *  party-bound prefetch batches (read_rule_id IN (<the viewer's readable-
 *  rule set>) — a different viewer binds a different list and MUST go live;
 *  a plan serving them cross-viewer would leak another viewer's readable
 *  rows) + the help resolver's per-setting count batch (the signed-in
 *  popover surface). Measured ledger (2026-10-06, this file's log lines):
 *  9 trips, plan hit ratio 0.988, unexplained 0, bytes identical to the
 *  signed-in ladder. */
const SIGNED_IN_FLOOR_TRIPS = 9;

/** A statement whose parameter list is BY SHAPE the viewer's readable-rule
 *  set: the read_rule_id IN-list prefetch family. The bind set is derived
 *  from the viewer's parties (readPermissionStateFromResults), so two
 *  viewers issue different params for the same SQL text and the exact-match
 *  router correctly sends both live. */
function isPartyBoundStatement(sql: string): boolean {
  return /read_rule_id IN \(/i.test(sql);
}

/** The pipeline-able statement filter — the recorder's own membership rule
 *  (render-plan.ts isPipelineAbleRenderStatement), kept local exactly as
 *  the trip-profile pin keeps its copy. */
function isPipelineAbleRenderStatement(sql: string): boolean {
  const t = sql.trim();
  if (!/^(SELECT|WITH)\b/i.test(t)) return false;
  if (/one_trip_/i.test(t)) return false;
  const family = classifyResidueStatement(sql);
  if (family === undefined) {
    return /^SELECT id FROM cards WHERE name = \? AND trash = 0 LIMIT 1$/i.test(t);
  }
  return family !== "search-count" && family !== "search-cql";
}

/** The role-party statement's shape (read-rules.ts:236-252): the ONE
 *  structurally per-viewer statement the engine issues for a signed-in
 *  viewer. Matched by its distinctive SQL text; params must be [actorId]. */
function isRolePartyStatement(sql: string, params: unknown[]): boolean {
  return (
    /refs\.referee_id = \?/.test(sql) &&
    /codename = 'members'/.test(sql) &&
    params.length === 1 &&
    params[0] === ACTOR_ID
  );
}

const RENDER_PLANS_DDL =
  "CREATE TABLE IF NOT EXISTS one_trip_render_plans (" +
  " page_id INTEGER NOT NULL," +
  " seq INTEGER NOT NULL," +
  " family TEXT NOT NULL," +
  " sql TEXT NOT NULL," +
  " params_json TEXT NOT NULL," +
  " PRIMARY KEY (page_id, seq))";

/** The inline store build + plan seed (the renderplan-replay trip-profile
 *  pin's recipe, verbatim): the closure built from the mirror into a side
 *  DB, the side tables loaded INLINE into a copy of the mirror, the plan
 *  recorded at the store-build posture (render-plan-recorder.ts:144-148 —
 *  fresh anonymous engine) and seeded raw into one_trip_render_plans.
 *  Each pin builds in its OWN temp subdir: the freshness pin mutates its
 *  store, and no test may pass on another's state. */
async function buildAndSeedInlineStore(
  workDir: string,
  corpusPath: string = MIRROR_COPY_PATH,
): Promise<string> {
  const sidePath = join(workDir, "one-trip-side.sqlite3");
  const inlineDbPath = join(workDir, "deck-inline-materialized.sqlite3");
  const mirror = new LocalSqliteDriver({ path: corpusPath, readonly: true });
  const side = new LocalSqliteDriver({ path: sidePath });
  await buildOneTripClosure({ corpus: mirror, side, pageNames: [PAGE] });
  side.close();
  mirror.close();
  copyFileSync(corpusPath, inlineDbPath);
  const loadDb = new LocalSqliteDriver({ path: inlineDbPath });
  // The freshness stamp (this lineage's render entry fails loudly without
  // it, and the stamp-move pin below UPDATEs the version row): applied to
  // the working copy the way a provisioned database is — migration 0003,
  // additive and order-safe (the seat posture fixture's own recipe;
  // 5023337f unified the seat lineage's 0007 reference onto this file).
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
  return inlineDbPath;
}

/** The store-build posture's plan: a capture render through the gate
 *  (fresh anonymous engine — the recorder's own posture), filtered to the
 *  pipeline-able families, seeded into the store's one_trip_render_plans.
 *  Returns the seeded entries (the pins consult them as the plan key set). */
async function recordAndSeedPlan(inlineDbPath: string): Promise<RenderPlanEntry[]> {
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
  // THE DELIBERATE LEGACY MEMBER (the router-guard pin's posture): a store
  // built by a recorder predating the acfb1977 exclusion carries the
  // freshness-stamp read as a plan row. The current filter can no longer
  // harvest it from a live capture (the gate's stamp statement rides zero
  // live trips since the stamp-as-column lane — the head column replaced
  // it), so the legacy member is seeded EXPLICITLY, as the exact (sql,
  // params) a pre-fix store carried, and the pin proves the router never
  // serves it.
  const seededEntries: RenderPlanEntry[] = [
    ...planEntries,
    { sql: DECK_DATA_VERSION_STATEMENT, params: [] },
  ];

  const seedDb = new LocalSqliteDriver({ path: inlineDbPath });
  await seedDb.query(RENDER_PLANS_DDL, []);
  const pageId = (
    await seedDb.query<{ id: number }>(
      'SELECT id FROM cards WHERE "key" = ? AND trash = 0 LIMIT 1',
      ["home"],
    )
  ).rows[0]?.id;
  expect(pageId, "the page card must resolve").toBeTypeOf("number");
  for (let i = 0; i < seededEntries.length; i += 100) {
    const chunk = seededEntries.slice(i, i + 100);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?)").join(", ");
    await seedDb.query(
      `INSERT OR REPLACE INTO one_trip_render_plans (page_id, seq, family, sql, params_json) VALUES ${placeholders}`,
      chunk.flatMap((entry, k) => [pageId, i + k, "plan", entry.sql, JSON.stringify(entry.params)]),
    );
  }
  seedDb.close();
  return seededEntries;
}

/** A signed-in boot over one store file, the edge's own per-actor shape
 *  (bunny-edge-session-viewer.ts:183,193-195): fresh RenderEngine over the
 *  shared fetcher, viewer + pageSession set BEFORE the first render.
 *  Returns the capture driver EXPLICITLY — FetchEngine.driver is the replay
 *  router (b28e82fe), so the trip ledger lives on the capture the engine
 *  was booted over, not on fetcher.driver. */
async function bootSignedInEngine(
  inlineDbPath: string,
): Promise<EngineBoot & { capture: TripCapturingDriver }> {
  const driver = new TripCapturingDriver(
    new LocalSqliteDriver({ path: inlineDbPath, readonly: true }),
  );
  const boot = await bootEngine(driver);
  boot.render.viewer = { signedIn: true, actorId: ACTOR_ID };
  boot.render.pageSession = { signedIn: true, actorId: ACTOR_ID };
  return { ...boot, capture: driver };
}

describe("per-viewer seat: a signed-in render of a planned page rides the plan", () => {
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
    `seats ${PAGE} for actor ${ACTOR_ID} at the plan-replay trip floor, ` +
      "bytes identical to the signed-in ladder; the per-viewer residue is only the party-bound shapes",
    async () => {
      expect(mirrorAvailable(), "the trial-deck mirror copy must exist").toBe(true);
      dir = scratchDir("perviewer-seat-pin-");

      // ---- the inline store + the plan, at the store-build posture -------
      const inlineDbPath = await buildAndSeedInlineStore(dir);
      const planEntries = await recordAndSeedPlan(inlineDbPath);

      // ---- the SIGNED-IN LADDER (the BEFORE measurement: gate OFF) -------
      // A fresh engine, no payload, full cold closure — the 9.0 s live
      // class. Both viewer fields set exactly as the edge sets them
      // (bunny-edge-session-viewer.ts:193-195).
      delete process.env.DECKO_ONE_TRIP;
      delete process.env.DECKO_ONE_TRIP_STORE;
      const ladderBoot = await bootSignedInEngine(inlineDbPath);
      const ladder = ladderBoot.capture;
      const ladderHtml = await ladderBoot.render.render(PAGE, "open", {});

      // Posture guard: the ladder render must actually be signed-in — the
      // role-party statement (params [actorId]) must have run, or this pin
      // would be comparing two anonymous renders.
      const ladderRoleParties = ladder.statements.filter((s) =>
        isRolePartyStatement(s.sql, s.params),
      );
      expect(
        ladderRoleParties.length,
        "the ladder render must carry the role-party statement (the signed-in posture guard)",
      ).toBeGreaterThan(0);

      // ---- the SEATED SIGNED-IN render (the AFTER measurement) -----------
      process.env.DECKO_ONE_TRIP = "1";
      process.env.DECKO_ONE_TRIP_STORE = "inline";
      const seatedBoot = await bootSignedInEngine(inlineDbPath);
      const seated = seatedBoot.capture;
      const seatedHtml = await seatedBoot.render.render(PAGE, "open", {});

      // THE BYTE PIN: the seated signed-in render is the ladder's bytes.
      expect(
        normalizeSlotIds(seatedHtml),
        "the seated signed-in render must be byte-identical (modulo slot ids) to the signed-in ladder",
      ).toBe(normalizeSlotIds(ladderHtml));

      // THE PER-VIEWER RESIDUE MEASUREMENT (the hit ratio): every
      // covered-family live read beyond the plan, classified. Logged ALWAYS
      // (the receipt's measurement), then pinned. The plan fold's OWN merged
      // statements (replay-fold's per-class json_each shapes) are allowed
      // alongside the plan entries: they execute inside the replay batch and
      // decompose back to per-entry rows — plan transport, not live residue
      // (the same allowance the renderplan-replay trip-profile pin makes;
      // this pin predates the fold and never ran on this lineage until the
      // fixture fix, so the allowance lands with its first real run).
      const planKeys = new Set(
        planEntries.map((e) => `${e.sql}::${JSON.stringify(e.params)}`),
      );
      const foldedKeys = new Set(
        foldRenderPlanEntries(planEntries).statements.map(
          (s) => `${s.sql}::${JSON.stringify(s.params)}`,
        ),
      );
      for (const k of foldedKeys) planKeys.add(k);
      const coveredLive = seated.statements.filter(
        (s) => isPipelineAbleRenderStatement(s.sql) && !planKeys.has(`${s.sql}::${JSON.stringify(s.params)}`),
      );
      const rolePartyLive = coveredLive.filter((s) => isRolePartyStatement(s.sql, s.params));

      // THE PER-VIEWER RESIDUE PIN: the only allowed live reads beyond the
      // plan are the STRUCTURALLY per-viewer shapes — the role-party read
      // and the party-bound read_rule_id IN-list batches. A plan serving
      // either cross-viewer would be a permission leak; anything ELSE live
      // is an unexplained signed-in divergence (the per-role plan variant's
      // evidence, which must be named, never silently absorbed).
      const residueAllowed = coveredLive.filter(
        (s) => isRolePartyStatement(s.sql, s.params) || isPartyBoundStatement(s.sql),
      );
      const unexplained = coveredLive.filter(
        (s) => !isRolePartyStatement(s.sql, s.params) && !isPartyBoundStatement(s.sql),
      );
      console.log(
        `[perviewer-seat] plan entries: ${planEntries.length}; seated trips: ${seated.trips}; ` +
          `ladder trips: ${ladder.trips}; covered-family live reads beyond plan: ${coveredLive.length} ` +
          `(party-bound: ${coveredLive.filter((s) => isPartyBoundStatement(s.sql)).length}, ` +
          `role-party: ${rolePartyLive.length}, unexplained: ${unexplained.length}); ` +
          `plan-family hit ratio: ${1 - coveredLive.length / Math.max(1, planEntries.length)}`,
      );
      for (const s of coveredLive) {
        console.log(
          `[perviewer-seat] live-beyond-plan [${classifyResidueStatement(s.sql) ?? "unclassified"}] ` +
            `${s.sql.slice(0, 140)} | params=${JSON.stringify(s.params).slice(0, 80)}`,
        );
      }
      // The live (non-covered-family) statements too — the full trip ledger
      // for the receipt's before/after accounting.
      const liveNotCovered = seated.statements.filter(
        (s) => !isPipelineAbleRenderStatement(s.sql),
      );
      console.log(
        `[perviewer-seat] non-covered-family live statements: ${liveNotCovered.length} ` +
          `(${liveNotCovered
            .slice(0, 12)
            .map((s) => `[${classifyResidueStatement(s.sql) ?? "other"}] ${s.sql.slice(0, 60)}`)
            .join(" | ")})`,
      );
      expect(
        unexplained.length,
        `covered-family live reads beyond plan/party-bound/role-party: ${unexplained.length} ` +
          `of ${coveredLive.length}. Samples: ${unexplained
            .slice(0, 4)
            .map((s) => `[${s.sql.slice(0, 100)}] params=${JSON.stringify(s.params).slice(0, 60)}`)
            .join(" | ")}`,
      ).toBe(0);
      expect(
        residueAllowed.length,
        "the named per-viewer residue must be non-empty (the signed-in posture must actually diverge somewhere)",
      ).toBeGreaterThan(0);

      // THE FLOOR PIN (after the measurement so a RED carries the ledger):
      // the seated signed-in render rides the plan, not the ladder.
      expect(
        seated.trips,
        `the seated signed-in render spent ${seated.trips} round trips ` +
          `(the signed-in ladder spent ${ladder.trips}); the measured composed ceiling is ` +
          `${SIGNED_IN_FLOOR_TRIPS} (anonymous core 4 + the party-bound batches + the help ` +
          `resolver's count batch — the file's ledger comment names every member) — a higher ` +
          `count means the plan does not cover the signed-in render`,
      ).toBeLessThanOrEqual(SIGNED_IN_FLOOR_TRIPS);
    },
    600_000,
  );

  it("a stamp-carrying seeded plan never absorbs the freshness stamp read: a version move is detected and the engine recomposes", async () => {
    // THE ROUTER-GUARD PIN (per-viewer-seat lane, 2026-10-06): the plan
    // seeded above DELIBERATELY carries the freshness-stamp member (its
    // local filter predates the acfb1977 exclusion — the legacy-store
    // posture). The record-time filter cannot retroactively fix such a
    // store; the property must hold at the ONE seam every posture flows
    // through: ReplayPlanRouter never serves a stamp read from the armed
    // map. Measured failure this guards (base numbers, 2026-10-06): with
    // the stamp absorbed, the gate reads the recorded version forever — no
    // move detected, no reset, no re-seat, and the map serves pre-edit rows
    // indefinitely (397-trip live residue on the next render).
    expect(mirrorAvailable(), "the trial-deck mirror copy must exist").toBe(true);
    dir = scratchDir("perviewer-seat-stamp-guard-");
    const inlineDbPath = await buildAndSeedInlineStore(dir);
    const planEntries = await recordAndSeedPlan(inlineDbPath);
    const stampMembers = planEntries.filter((e) => /deck_data_version/i.test(e.sql));
    expect(
      stampMembers.length,
      "this pin's seeded plan must actually carry the stamp member (the legacy-store posture)",
    ).toBeGreaterThan(0);

    process.env.DECKO_ONE_TRIP = "1";
    process.env.DECKO_ONE_TRIP_STORE = "inline";
    const boot = await bootSignedInEngine(inlineDbPath);
    const capture = boot.capture;
    const html1 = await boot.render.render(PAGE, "open", {});
    expect(boot.fetcher.replayRouter.armed).toBe(true);

    // A committed write on another connection moves the stamp.
    const writeDb = new LocalSqliteDriver({ path: inlineDbPath });
    const before = (
      await writeDb.query<{ version: number }>(
        'SELECT "version" FROM "deck_data_version" WHERE "id" = 1',
        [],
      )
    ).rows[0]!.version;
    await writeDb.query(
      'UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1',
      [],
    );
    await writeDb.close();

    // Render 2: the gate must SEE the move (the stamp read ran LIVE, never
    // from the map), reset, re-seat, and re-arm. A version-only bump
    // changes no content, so the bytes stay stable.
    const statementsBeforeSecond = capture.statements.length;
    const html2 = await boot.render.render(PAGE, "open", {});
    const secondStatements = capture.statements.slice(statementsBeforeSecond);
    const liveStampReads = secondStatements.filter((s) =>
      /deck_data_version/i.test(s.sql),
    );
    expect(
      liveStampReads.length,
      "the post-bump render's stamp read must be LIVE — an armed stamp member served from the map would hide the move",
    ).toBeGreaterThanOrEqual(1);
    expect(boot.fetcher.replayRouter.armed).toBe(true); // re-armed from the current store
    expect(normalizeSlotIds(html2)).toBe(normalizeSlotIds(html1));
  }, 600_000);
});

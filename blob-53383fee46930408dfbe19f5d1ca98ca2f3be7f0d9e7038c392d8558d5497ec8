// THE STAMP-AS-COLUMN PIN.
//
// THE PROPERTY UNDER PIN. The one-trip posture's per-render gate cost is
// zero ROUND TRIPS: the seat's HEAD statement reads deck_data_version in the
// SAME statement that carries the page's plan payload and member list, so
// the render's freshness check consumes a column of a trip the render pays
// anyway. The stamp read and the payload rows are consistent BY
// CONSTRUCTION (one statement, one snapshot); a committed write between
// renders moves the version the NEXT head read sees, and the seat's own
// move branch recomposes before seating anything (a moved stamp
// returns a moved-stamp marker, never stale rows).
//
// THE COUNT HALF. The floor's fifth trip was ONE batch carrying the
// permission gate-count (read-rules.ts statement 3, the hasReadRules
// counter) + the freshness stamp — the two statements plans never absorb.
// The head carries BOTH as columns (the gate-count is a zero-bind one-off,
// the "settings count" arm), so that trip drops
// 1 -> 0: with the stamp consumed from the head, the cold closure batch's
// live discharge (the replay router forwards only unmatched members, and
// skips the wire entirely at zero misses) carries nothing.
//
// COEXISTENCE (read, don't break): the three stamp-read-vs-plan layers are
// untouched — the recorder still excludes the gate's exact statement
// (isPipelineAbleRenderStatement), the fold still cannot merge it, the
// router still never serves it. The head is a NEW consumer of the same row:
// it executes on the router's BASE connection (never through the armed
// map), and its aliased column shape is deliberately NOT the gate
// statement's text, so isFreshnessStampRead — the one shape predicate all
// three layers test — keeps matching exactly the gate's own read.
//
// RED at the pre-fix tree: the ON render's trip log carries the gate's
// stamp statement (the cold batch's discharge) and the gate-count — both
// assertions fail. GREEN after the head carries the columns and the render
// consumes them.

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { buildOneTripClosure } from "../../../src/card/one-trip/closure-builder.js";
import { ONE_TRIP_SIDE_DDL } from "../../../src/card/one-trip/side-db-schema.js";
import {
  attachDerivedStore,
  detachDerivedStore,
} from "../../../src/card/one-trip/one-trip-fetch.js";
import {
  recordRenderPlan,
  isPipelineAbleRenderStatement,
} from "../../../src/card/one-trip/render-plan.js";
import { DECK_DATA_VERSION_STATEMENT } from "../../../src/card/render.js";
import {
  PERMISSION_GATE_COUNT_STATEMENT_INDEX,
  readPermissionStatements,
} from "../../../src/card/permissions/index.js";
import {
  MIRROR_COPY_PATH,
  TripCapturingDriver,
  bootEngine,
  mirrorAvailable,
  normalizeSlotIds,
} from "./one-trip-fixture.js";
import { applyDeckDataVersionStampMigration } from "./apply-deck-data-version-stamp-migration.js";
import { scratchDir } from "../../support/scratch-dir.mjs";
import { describeOrSkipLoud } from "../../support/describe-with-corpus.js";

const PAGE = "Home";

const require = createRequire(new URL("../../../package.json", import.meta.url));
const Database = require("better-sqlite3");

const RENDER_PLANS_DDL =
  "CREATE TABLE IF NOT EXISTS one_trip_render_plans (" +
  " page_id INTEGER NOT NULL," +
  " seq INTEGER NOT NULL," +
  " family TEXT NOT NULL," +
  " sql TEXT NOT NULL," +
  " params_json TEXT NOT NULL," +
  " PRIMARY KEY (page_id, seq))";

/** The GATE's exact statements — not any mention of the same rows. After
 *  the stamp-as-column change the seat head's text legitimately contains
 *  the aliased stamp column and the gate-count arm (the designed zero-trip
 *  reads); the pin asserts the GATE statements — the ones that were live
 *  trips at base — are gone, compared by exact text so the head's own
 *  columns can never satisfy (or fail) these assertions. */
const GATE_STAMP_SQL = DECK_DATA_VERSION_STATEMENT;
const GATE_COUNT_SQL =
  readPermissionStatements()[PERMISSION_GATE_COUNT_STATEMENT_INDEX].sql;

/** The inline store recipe (the renderplan-replay pin's, verbatim) plus the
 *  one thing this pin's posture needs and the store build gives no other
 *  test: the stamp migration, applied exactly the way a provisioned
 *  database is. The shared mirror is never touched. */
async function buildStampedInlineStore(dir: string): Promise<string> {
  const sidePath = join(dir, "one-trip-side.sqlite3");
  const inlineDbPath = join(dir, "deck-inline-materialized.sqlite3");
  const mirror = new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true });
  const side = new LocalSqliteDriver({ path: sidePath });
  await buildOneTripClosure({ corpus: mirror, side, pageNames: [PAGE] });
  side.close();
  mirror.close();
  copyFileSync(MIRROR_COPY_PATH, inlineDbPath);
  const loadDb = new LocalSqliteDriver({ path: inlineDbPath });
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

  // Seed the plan (the store-build posture's capture render, filtered to the
  // pipeline-able families — the recorder's own filter).
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
      chunk.flatMap((entry, k) => [pageId, i + k, "plan", entry.sql, JSON.stringify(entry.params)]),
    );
  }
  seedDb.close();
  return inlineDbPath;
}

describeOrSkipLoud(!mirrorAvailable(), "tests/card/one-trip/stamp-as-column-seat-head.test.ts", "a local copy of the deck mirror database (mirrorAvailable())")("the seat head carries the freshness stamp and the gate count (stamp-as-column)", () => {
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

  it("a planned cold render pays zero trips for the stamp read and the gate count, and a moved stamp is still detected", async () => {
    expect(mirrorAvailable(), "the trial-deck mirror copy must exist").toBe(true);
    dir = scratchDir("stamp-as-column-pin-");
    inlineDbPath = await buildStampedInlineStore(dir);

    // ---- render 1: the cold planned render -------------------------------
    process.env.DECKO_ONE_TRIP = "1";
    process.env.DECKO_ONE_TRIP_STORE = "inline";
    const capture = new TripCapturingDriver(
      new LocalSqliteDriver({ path: inlineDbPath, readonly: true }),
    );
    const boot = await bootEngine(capture);
    const html1 = await boot.render.render(PAGE, "open", {});
    expect(boot.fetcher.replayRouter.armed, "precondition: the plan armed").toBe(true);

    // THE STAMP PIN: the render's trip log carries the gate's stamp statement
    // ZERO times — the freshness check consumed the head's column instead of
    // a trip of its own.
    const stampReads = capture.statements.filter((s) => s.sql === GATE_STAMP_SQL);
    expect(
      stampReads,
      `the freshness stamp rode ${stampReads.length} statement(s); the seat head's ` +
        `column must carry it (the count+stamp trip drops 1 -> 0)`,
    ).toHaveLength(0);

    // THE COUNT PIN: same for the permission gate-count — the head's second
    // zero-bind column replaces the cold batch's live discharge member.
    const gateCounts = capture.statements.filter((s) => s.sql === GATE_COUNT_SQL);
    expect(
      gateCounts,
      `the permission gate-count rode ${gateCounts.length} statement(s); the seat head's ` +
        `column must carry it`,
    ).toHaveLength(0);

    // The gate state itself must be REAL: the render cannot have skipped the
    // freshness gate — an unmigrated database must throw, and a migrated one
    // must have armed the baseline (a silent skip is the staleness window the
    // freshness gate exists to close).
    // (The baseline is private engine state; the observable proxy is that the
    // render SUCCEEDED on a stamped deck — the gate throws on an unstamped
    // one — plus the move detection below, which only works with a baseline.)

    // ---- the move: a committed write on ANOTHER connection ---------------
    const rawDb = new Database(inlineDbPath);
    const before = (rawDb.prepare(DECK_DATA_VERSION_STATEMENT).get() as { version: number }).version;
    rawDb.prepare('UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1').run();
    const after = (rawDb.prepare(DECK_DATA_VERSION_STATEMENT).get() as { version: number }).version;
    expect(after).toBe(before + 1);

    // ---- render 2, same warm engine: the move MUST be detected -----------
    const html2 = await boot.render.render(PAGE, "open", {});
    // The armed plan was disarmed by the move branch and re-armed by the
    // re-seat (the recomposition contract — the seat lane's pin).
    expect(
      boot.fetcher.replayRouter.armed,
      "the post-bump render must recompose: disarm then re-seat and re-arm",
    ).toBe(true);
    // The post-bump render's OWN stamp column reported the moved version —
    // the live read the freshness contract demands (current-at-read).
    // A version-only bump changes no content: bytes stay stable.
    expect(normalizeSlotIds(html2)).toBe(normalizeSlotIds(html1));
    // And the post-bump render's stamp story, honestly bounded: render 2 is
    // a WARM memo-hit render — the seat memo fetches no head, so no column
    // exists to consume, and the gate reads the stamp live (the freshness
    // contract's designed one-statement cost, never answered from the armed
    // map). The move was detected through that live read and the payload
    // recomposed in-render. Exactly ONE gate stamp statement spans both
    // renders (render 2's; render 1 consumed the column — zero). Killing
    // this last one is the full bundle statement's job, not this pin's.
    const stampReads2 = capture.statements.filter((s) => s.sql === GATE_STAMP_SQL);
    expect(
      stampReads2.map((s) => s.sql),
      "the post-bump memo-hit render reads the stamp live exactly once (the gate's designed cost)",
    ).toEqual([GATE_STAMP_SQL]);
  }, 600_000);
});

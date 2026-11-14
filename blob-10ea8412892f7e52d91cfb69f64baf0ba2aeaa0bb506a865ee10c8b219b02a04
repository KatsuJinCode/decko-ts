// THE STAMP-READ-VS-PLAN PIN.
//
// THE PROPERTY UNDER PIN. The freshness gate's deck_data_version stamp read
// is per-request render-ENTRY gate state, never page data. If an armed
// render plan could answer it, a committed write's version move would be
// invisible to the gate and a post-write render could serve pre-write rows
// forever (the gate is the trigger for every other invalidation). Three
// layers must each hold for the composition to be safe:
//
//   1. THE RECORDER (already pinned): isPipelineAbleRenderStatement excludes
//      the freshness-stamp class — the shared isFreshnessStampRead shape
//      (render-plan.ts),
//      so a recorded plan never CONTAINS the stamp read.
//   2. THE FOLD (pinned here, test 1): replay-fold.ts's nine registered
//      classes match only cards/closure shapes, so even a SEEDED plan that
//      did carry the stamp entry is never merged — it rides the ladder. This
//      test fails if a future fold class ever grows a shape that matches the
//      stamp statement.
//   3. THE ROUTER (pinned here, tests 2-3): armRenderPlan arms whatever a
//      plan carries, and the router serves entries by exact (sql, params)
//      match — so defense at layers 1-2 alone leaves the router one
//      hand-seeded plan away from intercepting the gate. The router must
//      NEVER serve the stamp class from its armed map (it delegates live),
//      and a version-triggered resetCaches must DISARM the armed map (the
//      armed rows are derived state like every other cache resetCaches
//      clears; a map that survives the reset keeps answering post-write
//      renders with pre-write rows).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLStatement } from "../../../src/server/driver.js";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine, DECK_DATA_VERSION_STATEMENT } from "../../../src/card/render.js";
import { ReplayPlanRouter } from "../../../src/card/one-trip/replay-plan-router.js";
import { foldRenderPlanEntries } from "../../../src/card/one-trip/replay-fold.js";
import type { RenderPlanEntry } from "../../../src/card/one-trip/render-plan.js";

const DDL = readFileSync(
  fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)),
  "utf8",
);

/** The gate's own stamp read, as a plan entry — the exact (sql, params) the
 *  freshness gate issues at every render entry (render.ts readDeckDataVersion). */
const STAMP_ENTRY: RenderPlanEntry = { sql: DECK_DATA_VERSION_STATEMENT, params: [] };

/** One ordinary data read, as a plan entry — the shape of a recorded plan's
 *  page-data entries (here: the seeded card's row by id). */
async function dataEntryFor(deck: SQLDatabaseDriver): Promise<RenderPlanEntry> {
  const row = await deck.query<{ id: number }>(
    'SELECT id FROM cards WHERE key = ? AND trash = 0 LIMIT 1',
    ["page_a"],
  );
  const id = Number(row.rows[0].id);
  return { sql: "SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1", params: [id] };
}

async function makeDeck(): Promise<{ deck: LocalSqliteDriver; cardId: number }> {
  const deck = new LocalSqliteDriver({ path: ":memory:" });
  for (const statement of splitSqlStatements(DDL)) {
    await deck.query(statement, []);
  }
  // The merged schema carries the freshness stamp's own AFTER triggers, so
  // this content write bumps deck_data_version for real — the pin moves the
  // version the way production writes do, not by hand-editing the row.
  const inserted = await deck.query(
    `INSERT INTO cards (name, "key", codename, type_id, created_at, updated_at, creator_id, updater_id, trash, db_content)
     VALUES ('Page A', 'page_a', NULL, 0, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000', 1, 1, 0, 'content')`,
    [],
  );
  return { deck, cardId: Number(inserted.lastInsertRowId) };
}

const stampedVersion = async (deck: SQLDatabaseDriver): Promise<number> =>
  Number(
    (await deck.query<{ version: number }>(DECK_DATA_VERSION_STATEMENT, [])).rows[0].version,
  );

describe("the freshness stamp read is never answered from an armed render plan", () => {
  let deck: LocalSqliteDriver;
  let cardId: number;
  let dataEntry: RenderPlanEntry;

  beforeAll(async () => {
    const made = await makeDeck();
    deck = made.deck;
    cardId = made.cardId;
    dataEntry = await dataEntryFor(deck);
  });

  it("layer 2 — the fold cannot merge the stamp read, even from a seeded plan", () => {
    const folded = foldRenderPlanEntries([STAMP_ENTRY, dataEntry]);
    // The stamp entry must ride the ladder: no registered class matches its
    // shape, so it is executed LIVE inside the replay batch and its result
    // cannot be a merged-statement product. (The data entry legitimately
    // folds — cards-id-point — so the assertion is scoped to the stamp
    // entry's coverage, not to the batch's merged-statement count.)
    expect(
      folded.unfolded.map((slice) => slice.entryIndex),
      "the stamp entry must stay on the ladder",
    ).toContain(0);
    expect(
      folded.merged.flatMap((slice) => slice.entryIndexes),
      "no merged statement may answer the stamp entry",
    ).not.toContain(0);
  });

  it("layer 3a — the router delegates the stamp read live, never from the armed map", async () => {
    const router = new ReplayPlanRouter(deck);
    // Arm the router with a SEEDED plan that carries the stamp entry — the
    // posture layers 1-2 are supposed to make unreachable, and exactly the
    // one this pin must prove harmless at the router itself.
    const entries = [STAMP_ENTRY, dataEntry];
    const results = await deck.batch(entries as SQLStatement[]);
    router.armRenderPlan(entries, results);

    // A committed write through ANOTHER connection (the freshness suite's
    // edit-then-reread shape): moves the stamp, never touches the router.
    await deck.query("UPDATE cards SET db_content = ? WHERE id = ?", [
      "content (edited)",
      cardId,
    ]);
    const liveVersion = await stampedVersion(deck);

    const served = await router.query<{ version: number }>(DECK_DATA_VERSION_STATEMENT, []);
    expect(
      Number(served.rows[0].version),
      "the gate's stamp read must see the MOVED version — an armed plan must not intercept it",
    ).toBe(liveVersion);
  });

  it("layer 3b — a version-triggered resetCaches disarms the armed plan rows", async () => {
    const engine = new RenderEngine(new FetchEngine(deck));
    const router = engine.fetcher.replayRouter;
    const entries = [STAMP_ENTRY, dataEntry];
    const results = await deck.batch(entries as SQLStatement[]);
    router.armRenderPlan(entries, results);
    expect(router.armed, "precondition: the plan is armed").toBe(true);

    // The external committed write moves the stamp; nothing through THIS
    // engine's router disarms it (the write never traversed the router).
    await deck.query("UPDATE cards SET db_content = ? WHERE id = ?", [
      "content (edited again)",
      cardId,
    ]);
    expect(router.armed, "an external write alone cannot disarm the map").toBe(true);

    // The gate observes the move (layer 3a) and resets: the armed rows are
    // derived state and must die with the rest of the caches — otherwise the
    // very next render is answered from pre-write rows at full plan speed.
    engine.resetCaches();
    expect(
      router.armed,
      "resetCaches must drop the armed plan rows (a version move falsified them)",
    ).toBe(false);
  });
});

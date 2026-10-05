// RED-FIRST PINS, plan-invalidation lane (2026-10-05).
//
// THE MECHANISM UNDER PIN. A recorded render plan
// (one_trip_render_plans, keyed (page_id, seq)) is a transcript of the
// statements ONE page's cold render issued, captured at store-build time.
// The serve path reads it back inside the seat head (one-trip-fetch.ts:264-269)
// and replays it as one batch, so every render read whose (sql, params)
// matches an entry is answered from the RECORDED RESULT SET with zero round
// trips (render-gate.ts:135-139). The plan is therefore true only as of the
// moment it was recorded. Before this lane, NOTHING bound a content write to
// a plan's death: invalidation.ts re-derived the closure tables and left the
// plan rows describing the pre-write world, so an edit to an included card
// left the page replaying a transcript of stale state at full speed.
//
// THE COST THAT DECIDED THE SHAPE. Re-recording inline is correct but the
// recorder renders each page once through the whole engine in the exact
// serving posture (render-plan-recorder.ts:117-186) — the L2 lane measured
// 896,269 ms for 38 pages (~23.6 s/page) against the serving database. A
// write that reaches N pages would block for N x 23.6 s. So this lane DELETES
// the affected plans instead: the page falls back to the ladder until it is
// re-recorded. That is the pre-plan posture, which the L2 lane proved is
// byte-identical (§4.2: bytes OFF == AFTER on 5/5 pages) — so the cost of
// this mechanism is trips, never bytes.
//
// THE CLAUSE THAT MAKES IT TOTAL. The drop is NOT closure-only. 38 of the 45
// plan-bearing pages were recorded for pages the store never materialized
// (l2-plan-recording-lane.md §1: "the plan lookup is keyed by card id, not by
// the materialized store ... a page the one_trip_* store never materialized
// still gets a plan"). The reverse-closure lookup cannot NAME such a page —
// it has no one_trip_page_closure row — so a closure-only drop would leave
// the majority of the corpus stale forever, silently. Hence the conservative
// second clause: a page that CARRIES A PLAN but has NO CLOSURE ROW cannot be
// proven unaffected by any write, so it is dropped too. Over-invalidation is
// the correct bias here: it costs trips, and the alternative is stale bytes.
//
// WHY A TRIGGER. The same argument the freshness lane made for
// deck_data_version (d19ec179): a committed write is authoritative regardless
// of which stream, process or connection issued it. There is no application
// write path to hook — invalidation.ts has zero production callers today
// (grep over src/ + tests/: only its own test) — so an application-level drop
// would be a mechanism that never fires.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";
import {
  ONE_TRIP_SIDE_DDL,
  ONE_TRIP_PLAN_INVALIDATION_TRIGGER_DDL,
} from "../../../src/card/one-trip/side-db-schema.js";
import { invalidateRenderPlansForPages } from "../../../src/card/one-trip/invalidation.js";

interface Row {
  [column: string]: unknown;
}

/** The freshness lane's committed-write stamp, BYTE-VERBATIM from
 *  d19ec179:db/schema.sqlite.sql (extracted to
 *  tests/card/one-trip/fixtures-deck-data-version-d19ec179.sql, not
 *  re-typed, so this suite pins the REAL trigger text rather than my
 *  reproduction of it).
 *
 *  It is installed here so this suite pins the COMPOSITION the ask asks for:
 *  both mechanisms live on the same two tables, and neither may displace the
 *  other. Note the split-DDL hazard this avoids: this fixture is applied
 *  statement-by-statement, because the shared test DDL splitter
 *  (fetch-test-storage.ts splitSqlStatements) splits on every ";" outside a
 *  quote and would tear a trigger body in half. */
const DECK_DATA_VERSION_DDL = splitSqlStatements(
  readFileSync(
    fileURLToPath(new URL("./fixtures-deck-data-version-d19ec179.sql", import.meta.url)),
    "utf8",
  ),
);

/**
 * The INLINE store deck: cards + card_references + the one_trip_* tables in
 * ONE database — the only posture where plans are served from
 * (DECKO_ONE_TRIP_STORE=inline) and therefore the only one where the
 * invalidation triggers can be installed (a trigger is scoped to the database
 * that holds both the changed table and the plans table).
 *
 * Seeded page classes:
 *   Page A (id a) — MATERIALIZED, closure reaches C (transitively, via B)
 *   Page B (id b) — MATERIALIZED, closure reaches C (directly)
 *   Page C (id c) — MATERIALIZED, the edited leaf
 *   Page D (id d) — MATERIALIZED, closure reaches E only -> UNAFFECTED
 *   Page U (id u) — UNMATERIALIZED: carries a plan, has NO closure row
 *                    (the L2 lane's 38-page class)
 */
async function makeInlineDeck(): Promise<{ deck: SQLDatabaseDriver; ids: Record<string, number> }> {
  const deck = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(
    fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)),
    "utf8",
  );
  for (const statement of splitSqlStatements(ddl)) {
    await deck.query(statement, []);
  }
  // The freshness lane's stamp — installed BEFORE the plan triggers so the
  // composition is exercised by the same writes the plan pins assert on.
  for (const statement of DECK_DATA_VERSION_DDL) {
    await deck.query(statement, []);
  }
  // The inline store's own tables, then this lane's triggers (which need
  // BOTH cards and one_trip_render_plans to exist).
  for (const statement of ONE_TRIP_SIDE_DDL) {
    await deck.query(statement, []);
  }

  const ids: Record<string, number> = {};
  const insertCard = async (name: string, content: string): Promise<number> => {
    // A real TYPE card first: every content card's type_id points at it, and
    // a type edge to a CONTENT card would make reachability universal.
    const result = await deck.query(
      `INSERT INTO cards (name, "key", codename, type_id, created_at, updated_at, creator_id, updater_id, trash, db_content)
       VALUES (?, ?, ?, 0, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000', 1, 1, 0, ?)`,
      [name, name.toLowerCase().replace(/[^a-z0-9_]+/g, "_"), null, content],
    );
    return result.lastInsertRowId as number;
  };
  ids["type"] = await insertCard("Basic", "");
  ids["Page A"] = await insertCard("Page A", "intro {{Page B}}");
  ids["Page B"] = await insertCard("Page B", "body {{Page C}}");
  ids["Page C"] = await insertCard("Page C", "leaf");
  ids["Page D"] = await insertCard("Page D", "standalone {{Page E}}");
  ids["Page E"] = await insertCard("Page E", "other leaf");
  ids["Page U"] = await insertCard("Page U", "unmaterialized {{Page C}}");

  // Closures, written directly (the builder's output shape): A and B reach C
  // (A transitively), D reaches E, and U is DELIBERATELY absent.
  const closure = [
    [ids["Page A"], ids["Page A"]],
    [ids["Page A"], ids["Page B"]],
    [ids["Page A"], ids["Page C"]],
    [ids["Page B"], ids["Page B"]],
    [ids["Page B"], ids["Page C"]],
    [ids["Page C"], ids["Page C"]],
    [ids["Page D"], ids["Page D"]],
    [ids["Page D"], ids["Page E"]],
    [ids["Page E"], ids["Page E"]],
  ];
  for (const [pageId, cardId] of closure) {
    await deck.query(
      "INSERT INTO one_trip_page_closure (page_id, card_id, depth, views) VALUES (?, ?, 1, '[]')",
      [pageId, cardId],
    );
  }

  // One recorded plan per page — including the unmaterialized Page U.
  for (const key of ["Page A", "Page B", "Page C", "Page D", "Page U"]) {
    await deck.query(
      `INSERT INTO one_trip_render_plans (page_id, seq, family, sql, params_json)
       VALUES (?, 0, 'point-row-by-name', 'SELECT id FROM cards WHERE id = ?', ?)`,
      [ids[key], JSON.stringify([ids[key]])],
    );
  }

  // The triggers go on LAST: they need cards AND one_trip_render_plans.
  for (const statement of ONE_TRIP_PLAN_INVALIDATION_TRIGGER_DDL) {
    await deck.query(statement, []);
  }
  return { deck, ids };
}

const planPages = async (deck: SQLDatabaseDriver): Promise<number[]> =>
  (await deck.query<Row>("SELECT DISTINCT page_id FROM one_trip_render_plans ORDER BY page_id", []))
    .rows.map((r) => Number(r.page_id));

const deckVersion = async (deck: SQLDatabaseDriver): Promise<number> =>
  Number(
    (await deck.query<Row>('SELECT "version" FROM "deck_data_version" WHERE "id" = 1', []))
      .rows[0].version,
  );

describe("plan invalidation: a committed content write drops the plans it can falsify", () => {
  let deck: SQLDatabaseDriver;
  let ids: Record<string, number>;

  beforeAll(async () => {
    const fixture = await makeInlineDeck();
    deck = fixture.deck;
    ids = fixture.ids;
  });

  it("seeds all five plan-bearing pages, including the unmaterialized one", async () => {
    expect(await planPages(deck)).toEqual(
      [ids["Page A"], ids["Page B"], ids["Page C"], ids["Page D"], ids["Page U"]].sort((a, b) => a - b),
    );
  });

  it("a DIRECT edit to an included card drops the including page's plan rows", async () => {
    // Page B's content changes. B's plan describes B's render, which read the
    // old content — the plan is now false and must go.
    await deck.query("UPDATE cards SET db_content = ? WHERE id = ?", [
      "body {{Page C}} (edited)",
      ids["Page B"],
    ]);
    const surviving = await planPages(deck);
    expect(surviving, "Page B's plan must be dropped by an edit to Page B").not.toContain(ids["Page B"]);
  });

  it("a NESTED edit drops the plan of the page that INCLUDES the edited card", async () => {
    // Page A's plan is the exposure this lane exists to close: A does not
    // include C directly (its content names B), but C is in A's closure, so
    // editing C falsifies A's recorded transcript too. A's plan must not
    // survive — this is the "the including page's plan invalidated" pin.
    await deck.query("UPDATE cards SET db_content = ? WHERE id = ?", [
      "leaf (edited)",
      ids["Page C"],
    ]);
    const surviving = await planPages(deck);
    expect(
      surviving,
      "Page A includes Page C transitively; its plan must be dropped too",
    ).not.toContain(ids["Page A"]);
  });

  it("drops the UNMATERIALIZED page's plan — the class a closure lookup cannot name", async () => {
    // Page U carries a plan but has NO one_trip_page_closure row (the L2
    // lane's 38-page class). No reverse-closure query can reach it, so it is
    // only dropped by the conservative clause.
    const surviving = await planPages(deck);
    expect(
      surviving,
      "a plan-bearing page with no closure row must be dropped by any content write",
    ).not.toContain(ids["Page U"]);
  });

  it("keeps the plan of a MATERIALIZED page whose closure does NOT reach the write", async () => {
    // Page D's closure is {D, E}; the writes above touched B and C. D's
    // recorded transcript is still true, so it survives — the mechanism is
    // not a blanket table wipe.
    expect(
      await planPages(deck),
      "Page D is unaffected by edits to B and C and must keep its plan",
    ).toContain(ids["Page D"]);
  });

  it("a plan-less page has no rows to replay — the ladder fallback is the safe posture", async () => {
    const rows = await deck.query<Row>(
      "SELECT COUNT(*) AS c FROM one_trip_render_plans WHERE page_id = ?",
      [ids["Page A"]],
    );
    expect(Number(rows.rows[0].c)).toBe(0);
  });

  it("COMPOSITION: the freshness stamp still moves on the same writes", async () => {
    // The ask's third RED pin. Both mechanisms are installed on the same two
    // tables; neither may displace the other. deck_data_version bumped on the
    // writes above; a further write must bump it again while ALSO dropping
    // the plans.
    const before = await deckVersion(deck);
    await deck.query("UPDATE cards SET db_content = ? WHERE id = ?", [
      "other leaf (edited)",
      ids["Page E"],
    ]);
    expect(
      await deckVersion(deck),
      "deck_data_version must still bump when the plan triggers are installed",
    ).toBeGreaterThan(before);
    expect(
      await planPages(deck),
      "Page D's closure reaches E, so that edit must drop Page D's plan",
    ).not.toContain(ids["Page D"]);
  });

  it("a reference INSERT drops the referer's plan (nested edit through card_references)", async () => {
    // Re-seed D's plan, then change the graph through card_references — the
    // same table the freshness stamp watches, reached by a different write
    // kind (the render caches' other half of their read surface).
    await deck.query(
      `INSERT INTO one_trip_render_plans (page_id, seq, family, sql, params_json)
       VALUES (?, 0, 'point-row-by-name', 'SELECT id FROM cards WHERE id = ?', ?)`,
      [ids["Page D"], JSON.stringify([ids["Page D"]])],
    );
    expect(await planPages(deck)).toContain(ids["Page D"]);

    await deck.query(
      "INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present) VALUES (?, ?, ?, 'L', 1)",
      [ids["Page D"], "page_e", ids["Page E"]],
    );
    expect(
      await planPages(deck),
      "a card_references write naming Page D must drop Page D's plan",
    ).not.toContain(ids["Page D"]);
  });

  it("the module-level drop deletes exactly the named pages", async () => {
    // The explicit API the write path will call (invalidation.ts has no
    // production caller today). It takes an ALREADY-DERIVED page set — the
    // caller's own fan-out via affectedPagesForCardWrite — and deletes those
    // pages' rows. The trigger computes the page set itself from storage and
    // is deliberately MORE conservative (it also drops unmaterialized plan
    // pages it cannot prove unaffected). Both agree on the action given a
    // page set; neither is a silent second opinion on the other.
    for (const key of ["Page A", "Page B", "Page C", "Page D", "Page U"]) {
      await deck.query(
        `INSERT INTO one_trip_render_plans (page_id, seq, family, sql, params_json)
         VALUES (?, 0, 'point-row-by-name', 'SELECT id FROM cards WHERE id = ?', ?)`,
        [ids[key], JSON.stringify([ids[key]])],
      );
    }
    expect((await planPages(deck)).length).toBe(5);

    // Name one page; the other four must be untouched.
    const dropped = await invalidateRenderPlansForPages({ side: deck, pageIds: [ids["Page D"]] });
    expect(dropped, "the row count of what was deleted is reported back").toBe(1);

    const surviving = await planPages(deck);
    expect(surviving, "only the named page's rows are deleted").toEqual(
      [ids["Page A"], ids["Page B"], ids["Page C"], ids["Page U"]].sort((a, b) => a - b),
    );
    expect(surviving).not.toContain(ids["Page D"]);
  });
});
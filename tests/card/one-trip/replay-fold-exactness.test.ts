// THE PLAN-REPLAY FOLD'S EXACTNESS PIN (fold-plan-replay lane, 2026-10-06).
//
// WHAT IS UNDER PIN: the merged per-class statements replay-fold.ts builds
// decompose back into EXACTLY the rows the database returns for each source
// plan entry's own (sql, params) — same rows, same order, same columns.
// The fold is a cache-warming transformation: if it changed a single row,
// the armed router would serve the render different bytes than the ladder's
// execution would have, and the plan replay's central promise ("a hit
// returns the rows the database itself returned for that exact statement")
// would be false.
//
// TWO PINS:
//   1. EXACTNESS — every folded entry's decomposed rows compare equal,
//      order-sensitive, to the ladder's own execution of that entry.
//   2. THE COLLAPSE — the folded batch carries strictly fewer statements
//      than the plan has entries. A fold that were exact but did not reduce
//      the count would pass (1) and cost a round trip's worth of nothing.
//
// The corpus is the committed trial-deck mirror (one-trip-fixture's
// MIRROR_COPY_PATH); the test SKIPS when it is absent, like its siblings.

import { describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLQueryResult } from "../../../src/server/driver.js";
import type { RenderPlanEntry } from "../../../src/card/one-trip/render-plan.js";
import {
  decomposeMergedRows,
  foldRenderPlanEntries,
} from "../../../src/card/one-trip/replay-fold.js";
import { MIRROR_COPY_PATH, mirrorAvailable } from "./one-trip-fixture.js";

/** The engine's own corpus shapes, transcribed with the binds each carries
 *  in a real render (WORK_DIR/
 *  fold-plan-replay-work/11-fold-exactness-check-report.json, Aikido +
 *  Aikido_in_Education). Each entry is one plan statement the recorder
 *  produced for those pages. */
const PLAN_ENTRIES: RenderPlanEntry[] = [
  // cards-key-multi: three binds (folded), two binds (ladder — SQLite's
  // two-way IN order is bind order, which the class refuses to reproduce).
  {
    sql: 'SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (?, ?, ?) AND trash = 0',
    params: ["*self", "right", "*type"],
  },
  {
    sql: 'SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (?, ?) AND trash = 0',
    params: ["*self", "*right"],
  },
  // cards-id-multi
  {
    sql: "SELECT * FROM cards WHERE id IN (?, ?, ?, ?) AND trash = 0",
    params: [3, 5, 18, 19],
  },
  // cards-key-point (LIMIT 1) and cards-id-point
  {
    sql: "SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1",
    params: ["*type"],
  },
  { sql: "SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1", params: [4] },
  { sql: "SELECT * FROM cards WHERE id = ? AND trash = 0", params: [5] },
  // pair-exists (LIMIT 1 on the unique (left_id, right_id) pair)
  { sql: "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1", params: [266, 86] },
  { sql: "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1", params: [266, 999_999] },
  // or-chain-pairs (four pair terms)
  {
    sql: "SELECT j.* FROM cards j WHERE j.trash = 0 AND ((j.left_id = ? AND j.right_id = ?) OR (j.left_id = ? AND j.right_id = ?) OR (j.left_id = ? AND j.right_id = ?) OR (j.left_id = ? AND j.right_id = ?))",
    params: [5, 266, 52, 266, 47, 266, 18, 266],
  },
  // template-link-ids (three binds) and the lexicon's two fallbacks
  { sql: "SELECT id, db_content FROM cards WHERE id IN (?, ?, ?)", params: [6568, 6584, 9586] },
  { sql: "SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1", params: [4] },
  { sql: "SELECT id FROM cards WHERE key = ? AND trash = 0 LIMIT 1", params: ["*open"] },
  // a shape the registry does NOT know: it must ride the ladder untouched
  { sql: "SELECT * FROM cards WHERE key = 'basic' AND trash = 0", params: [] },
];

/** Row equality with ORDER SENSITIVE comparison and column-name equality —
 *  the property the armed router depends on. */
function rowsEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => JSON.stringify(row) === JSON.stringify(b[i]));
}

describe("plan-replay fold", () => {
  it("decomposes every merged class back to the ladder's exact rows", async () => {
    if (!mirrorAvailable()) return;
    const driver = new LocalSqliteDriver({ path: MIRROR_COPY_PATH, readonly: true });
    const folded = foldRenderPlanEntries(PLAN_ENTRIES);

    // THE COLLAPSE PIN: fewer statements than entries.
    expect(
      folded.statements.length,
      `folded ${folded.statements.length} statements for ${PLAN_ENTRIES.length} entries`,
    ).toBeLessThan(PLAN_ENTRIES.length);

    const ladder = (await driver.batch(
      PLAN_ENTRIES.map((e) => ({ sql: e.sql, params: e.params })),
    )) as SQLQueryResult[];
    const mergedResults = (await driver.batch(folded.statements)) as SQLQueryResult[];

    // THE EXACTNESS PIN, entry by entry.
    const perEntry = new Map<number, unknown[]>();
    for (const slice of folded.merged) {
      for (const [entryIndex, rows] of decomposeMergedRows(
        slice,
        mergedResults[slice.statementIndex],
      )) {
        perEntry.set(entryIndex, rows);
      }
    }
    for (const u of folded.unfolded) {
      perEntry.set(u.entryIndex, mergedResults[u.statementIndex]?.rows ?? []);
    }

    const foldedEntryIndexes = new Set(folded.merged.flatMap((s) => s.entryIndexes));
    expect(foldedEntryIndexes.size, "at least the big classes must fold").toBeGreaterThan(8);

    PLAN_ENTRIES.forEach((entry, entryIndex) => {
      const want = ladder[entryIndex]?.rows ?? [];
      const got = perEntry.get(entryIndex) ?? [];
      expect(
        rowsEqual(want, got),
        `entry ${entryIndex} [${folded.merged.find((s) => s.entryIndexes.includes(entryIndex))?.family ?? "ladder"}] ` +
          `${entry.sql.slice(0, 70)} rows=${want.length}/${got.length}`,
      ).toBe(true);
    });
    driver.close();
  });

  it("leaves an unknown statement shape on the ladder", () => {
    const folded = foldRenderPlanEntries([
      { sql: "SELECT * FROM cards WHERE key = 'basic' AND trash = 0", params: [] },
    ]);
    expect(folded.merged.length, "nothing foldable means nothing merged").toBe(0);
    expect(folded.unfolded.length).toBe(1);
    expect(folded.statements[0]?.sql).toBe("SELECT * FROM cards WHERE key = 'basic' AND trash = 0");
  });

  it("refuses a key-IN-list entry whose binds are not canonical lowercase", () => {
    // COLLATE NOCASE against a NON-lowercase bind would match a card the
    // merged BINARY join cannot see — the class must refuse it.
    const folded = foldRenderPlanEntries([
      {
        sql: 'SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (?, ?, ?) AND trash = 0',
        params: ["*Self", "*right", "*type"],
      },
    ]);
    expect(folded.merged.length, "a non-canonical key must not fold").toBe(0);
    expect(folded.unfolded.length).toBe(1);
  });
});
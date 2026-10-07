// The request store holds ring neighbours as identity rows. It must never
// answer a statement that projects more than the identity columns from such
// a row: the row is named missing (fullIds) and fetched whole.
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { RequestStore, IDENTITY_COLUMNS, type Widening } from "../../../src/card/live/request-store.js";
import { CARDS_COLUMNS } from "../../../src/card/live/store-row-evaluator.js";

function deck(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE cards (${CARDS_COLUMNS.join(", ")})`);
  const ins = db.prepare(`INSERT INTO cards (id, name, key, left_id, right_id, trash, type_id, db_content) VALUES (?, ?, ?, ?, ?, 0, 9, ?)`);
  ins.run(1, "About", "about", null, null, "{{+image}} [[Home]]");
  ins.run(2, "image", "image", null, null, "");
  ins.run(3, null, null, 1, 2, "about.png");
  ins.run(4, "Home", "home", null, null, "welcome");
  ins.run(5, "*self", "*self", null, null, "");
  ins.run(6, null, null, 1, 5, "");
  ins.run(9, "Basic", "basic", null, null, "");
  return db;
}

function run(db: DatabaseSync, s: { sql: string; params?: unknown[] }): Record<string, unknown>[] {
  return db.prepare(s.sql).all(...((s.params ?? []) as never[])) as Record<string, unknown>[];
}

const empty: Widening = { fullKeys: [], idKeys: [], fullIds: [], idIds: [], lefts: [], leftKeys: [], pairs: [], sideL: [], sideR: [] };

describe("request store: identity rows", () => {
  it("fetches a left side's junctions as identity rows and answers only what they can answer", () => {
    const db = deck();
    const st = new RequestStore();
    const w: Widening = { ...empty, fullKeys: ["about"], lefts: [1] };
    const stmts = st.wideningStatements(w)!;
    const full = run(db, stmts.full);
    const ident = run(db, stmts.identity);
    expect(Object.keys(ident[0]!)).toEqual([...IDENTITY_COLUMNS]);
    st.absorb(w, full, ident);
    expect(st.full.has(1)).toBe(true);
    expect(st.present.has(3) && !st.full.has(3)).toBe(true);

    // existence by pair: the identity row answers it
    const pairId = "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1";
    const m1 = st.missing(pairId, [1, 2])!;
    expect(m1.fullIds).toEqual([]);
    expect(st.answer(pairId, [1, 2]).rows).toEqual([{ id: 3 }]);

    // the whole junction: not until it is held whole
    const pairStar = "SELECT j.* FROM cards j WHERE j.trash = 0 AND ((j.left_id = ? AND j.right_id = ?))";
    expect(st.missing(pairStar, [1, 2])!.fullIds).toEqual([3]);
    // an absent pair is answerable from the identity rows alone
    expect(st.missing(pairStar, [1, 4])!.fullIds).toEqual([]);
    expect(st.answer(pairStar, [1, 4]).rows).toEqual([]);

    // upgrade: fetch it whole, then the local answer equals storage's
    const w2: Widening = { ...empty, fullIds: [3] };
    const s2 = st.wideningStatements(w2)!;
    st.absorb(w2, run(db, s2.full), run(db, s2.identity));
    expect(st.missing(pairStar, [1, 2])!.fullIds).toEqual([]);
    expect(st.answer(pairStar, [1, 2]).rows).toEqual(run(db, { sql: pairStar, params: [1, 2] }));
  });

  it("brings the parts of whole rows whole, and skips rows it already holds", () => {
    const db = deck();
    const st = new RequestStore();
    const w: Widening = { ...empty, fullIds: [3] };
    const s = st.wideningStatements(w)!;
    const full = run(db, s.full);
    // the junction and its left / right / type parts
    expect(full.map((r) => r.id).sort()).toEqual([1, 2, 3, 9]);
    st.absorb(w, full, run(db, s.identity));
    const again = st.wideningStatements({ ...empty, fullIds: [3], lefts: [1] })!;
    expect(run(db, again.full).map((r) => r.id)).toEqual([]);
    // 1+*self and its right part, as identity rows
    expect(run(db, again.identity).map((r) => r.id).sort()).toEqual([5, 6]);
  });

  it("names a key fetched as identity missing for a full statement", () => {
    const db = deck();
    const st = new RequestStore();
    const w: Widening = { ...empty, idKeys: ["home"] };
    const s = st.wideningStatements(w)!;
    st.absorb(w, run(db, s.full), run(db, s.identity));
    expect(st.answer("SELECT id FROM cards WHERE key = ? AND trash = 0 LIMIT 1", ["home"]).rows).toEqual([{ id: 4 }]);
    expect(st.missing("SELECT * FROM cards WHERE key = ? AND trash = 0 LIMIT 1", ["home"])!.fullIds).toEqual([4]);
  });
});

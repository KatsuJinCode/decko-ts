// The live render's compact result encoding must decode to exactly the rows
// the plain statement returns, or refuse (and the plain statement is sent).
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  COMPACT_COLUMN,
  compactStatement,
  compactWrap,
  decodeCompact,
  projectionNames,
} from "../../../src/card/live/compact-rows.js";
import { CARDS_COLUMNS } from "../../../src/card/live/store-row-evaluator.js";

function deck(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE cards (${CARDS_COLUMNS.map((c) => `${c} ${/_id$|^id$|^trash$|references_expired/.test(c) ? "INTEGER" : "TEXT"}`).join(", ")})`);
  const ins = db.prepare(`INSERT INTO cards (id, name, key, left_id, right_id, trash, type_id, db_content, created_at) VALUES (?, ?, ?, ?, ?, 0, 3, ?, '2020-01-01')`);
  ins.run(1, "About", "about", null, null, 'say "hi"\n\\ ok');
  ins.run(2, "*self", "*self", null, null, "");
  ins.run(3, null, null, 1, 2, "{{+image}} é 平和");
  ins.run(4, "Zed", "zed", null, null, null);
  return db;
}

/** Rows as the bunny driver builds them: an object per row, duplicate names
 *  collapsing last-wins. */
function plainRows(db: DatabaseSync, sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const st = db.prepare(sql);
  st.setReturnArrays(true);
  const names = st.columns().map((c) => c.name);
  return (st.all(...(params as never[])) as unknown as unknown[][]).map((cells) => {
    const o: Record<string, unknown> = {};
    names.forEach((n, i) => (o[n] = cells[i]));
    return o;
  });
}

describe("compact rows", () => {
  const shapes: [string, unknown[]][] = [
    ["SELECT id, codename, name, left_id, right_id FROM cards WHERE id > ?", [0]],
    ["SELECT c0.*, c0.updated_at, c0.id FROM cards c0 WHERE c0.trash = 0", []],
    ["SELECT j.* FROM cards j WHERE j.left_id = ?", [1]],
    ["SELECT DISTINCT c.type_id AS type_id, t.name AS name FROM cards c LEFT JOIN cards t ON t.id = c.type_id", []],
    ["WITH RECURSIVE up(id) AS (SELECT 3 UNION SELECT left_id FROM cards JOIN up USING (id) WHERE left_id IS NOT NULL) SELECT cards.id AS id, cards.\"key\" AS k FROM cards JOIN up USING (id) ORDER BY cards.id DESC", []],
    ["SELECT COUNT(*) AS c FROM cards WHERE trash = 0", []],
  ];
  for (const [sql, params] of shapes) {
    it(`decodes to the plain rows: ${sql.slice(0, 60)}`, () => {
      const db = deck();
      const c = compactStatement({ sql, params });
      expect(c).toBeDefined();
      const wire = plainRows(db, c!.stmt.sql, c!.stmt.params as unknown[]);
      expect(Object.keys(wire[0] ?? {})).toEqual([COMPACT_COLUMN]);
      const rows = decodeCompact(wire, c!.names, c!.form);
      expect(JSON.stringify(rows)).toBe(JSON.stringify(plainRows(db, sql, params)));
    });
  }

  it("keeps a statement's own ORDER BY row order (one output row per row)", () => {
    const c = compactStatement({ sql: "SELECT id AS id FROM cards ORDER BY id DESC", params: [] });
    expect(c?.form).toBe("per-row");
    expect(compactStatement({ sql: "SELECT id AS id FROM cards WHERE id IN (SELECT id FROM cards ORDER BY id)", params: [] })?.form).toBe(
      "aggregate",
    );
  });

  it("never names a column it cannot be sure of", () => {
    expect(projectionNames("SELECT * FROM cards")).toBeUndefined();
    expect(projectionNames("SELECT id + 1 FROM cards")).toBeUndefined();
    expect(projectionNames("SELECT x.* FROM other x")).toBeUndefined();
    expect(projectionNames("SELECT ID FROM cards")).toBeUndefined();
    expect(projectionNames("SELECT json_extract(db_content, '$.a') AS a FROM cards")).toBeUndefined();
    expect(projectionNames("SELECT a AS \"weird name\", b FROM t")?.names).toEqual(["weird name", "b"]);
  });

  it("refuses values whose JSON form would not decode to the plain value", () => {
    const db = deck();
    // a JSON-subtyped value does not keep its subtype through the CTE here;
    // where it would, the nested array is refused (projectionNames also
    // refuses any statement that uses a JSON function)
    const j = compactWrap({ sql: "SELECT json('[1]') AS v", params: [] }, ["v"], "aggregate");
    const dj = decodeCompact(plainRows(db, j.sql), ["v"], "aggregate");
    expect(dj === undefined || JSON.stringify(dj) === JSON.stringify(plainRows(db, "SELECT json('[1]') AS v"))).toBe(true);
    for (const expr of ["1.5", "9007199254740993"]) {
      const s = compactWrap({ sql: `SELECT ${expr} AS v`, params: [] }, ["v"], "aggregate");
      expect(decodeCompact(plainRows(db, s.sql), ["v"], "aggregate")).toBeUndefined();
    }
    // a BLOB is refused, including one that is valid JSONB (x'00' reads as null)
    for (const blob of ["x'00'", "x'48656c6c6f'", "x'13'"]) {
      const b = compactWrap({ sql: `SELECT ${blob} AS v`, params: [] }, ["v"], "aggregate");
      expect(decodeCompact(plainRows(db, b.sql), ["v"], "aggregate")).toBeUndefined();
    }
    // an integral REAL decodes to the same JS number the plain cell gives
    const s = compactWrap({ sql: "SELECT 2.0 AS v", params: [] }, ["v"], "per-row");
    expect(decodeCompact(plainRows(db, s.sql), ["v"], "per-row")).toEqual([{ v: 2 }]);
  });

  it("decodes an empty aggregate to no rows", () => {
    const db = deck();
    const s = compactWrap({ sql: "SELECT id AS id FROM cards WHERE id < 0", params: [] }, ["id"], "aggregate");
    expect(decodeCompact(plainRows(db, s.sql), ["id"], "aggregate")).toEqual([]);
  });
});

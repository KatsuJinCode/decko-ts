// TEMPORARY probe: prints generated SQL for the execution-test statements.
// Deleted once tests/cql/execution.test.ts expectations are grounded.
import { describe, it } from "vitest";
import { parseCql } from "../../src/cql/parser.js";
import { generateSql } from "../../src/cql/sql.js";

const resolveCardId = (name: string): number => {
  const map: Record<string, number> = {
    "Joe Admin": 10,
    "Sara Sample": 11,
    Home: 20,
    About: 21,
    User: 2,
    editor_notes: 31,
  };
  const id = map[name];
  return id === undefined ? -999 : id;
};

const statements: Record<string, unknown>[] = [
  { type: "User" },
  { part: "Home" },
  { content: ["~", "stripes"] },
  { match: "~~Joe (Admin|Sample)" },
  { created_at: ["gt", "2026-01-02"] },
  { refer_to: "Home" },
  { linked_to_by: "Home" },
  { right_plus: { name: "editor_notes" } },
  { left_plus: { name: "editor_notes" } },
  { name: ["~", "a"] },
  { updated_by: "Sara Sample" },
  { creator_of: "Home" },
  { refer_to: "_none" },
  { name: "Joe Admin" },
  { type_id: 1, sort: "name", sort_dir: "asc", limit: 3 },
  { type_id: 1, sort: "update" },
  { return: "count", type_id: 2 },
  { not: { type: "User" } },
  { any: [{ creator_id: 10 }, { updater_id: 11 }] },
  { complete: "alp" },
  { content: ["~", "~~a.*"] },
];

describe("probe", () => {
  it("prints SQL", () => {
    for (const stmt of statements) {
      const { sql, params } = generateSql(parseCql(stmt, { resolveCardId }));
      console.log(JSON.stringify(stmt), "\n  =>", sql, "\n  params:", JSON.stringify(params));
    }
  });
});

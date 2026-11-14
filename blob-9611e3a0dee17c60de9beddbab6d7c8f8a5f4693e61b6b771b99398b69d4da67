// The declared parity surface of the port's CQL SQL text, pinned.
//
// docs/decisions/0010-cql-sql-text-parity-surface.md declares the
// parameterized canonical shape as the parity surface and names the complete
// list of textual divergences from card-1.110.0's SqlStatement text. This
// file pins that list mechanically, so a future change that inlines a user
// literal, emits the comment slot, re-widens the whitespace, or rewrites the
// count field fails here first, before any oracle pin does.
//
// Ruby shapes quoted below are read in the pinned gemset
// (card-1.110.0 lib/card/query/sql_statement.rb and lib/card/query/value.rb).

import { describe, expect, it } from "vitest";
import { parseCql } from "../../src/cql/parser.js";
import { generateSql } from "../../src/cql/sql.js";

/** Statements whose values cover the value shapes the compiler renders:
 *  scalars, in-lists, name keys, match terms, negation, a tie join, sort,
 *  group, limit and offset. */
const STATEMENTS: Array<Record<string, unknown>> = [
  { id: 5 },
  { id: [1, 2, 3] },
  { name: "Joe Admin" },
  { name: ["in", ["A", "B"]] },
  { content: "match term" },
  { match: "search text" },
  { not: { id: 7 } },
  { type: { codename: "type" }, return: "name" },
  { id: 5, name: "A", content: "body" },
  { sort: "name", limit: 10, offset: 5 },
  { group: "type_id", return: "count" },
];

function generated(cql: Record<string, unknown>): { sql: string; params: unknown[] } {
  return generateSql(parseCql(cql));
}

describe("the declared SQL text parity surface (decision 0010)", () => {
  it("every statement's text carries the declared divergences and nothing else", () => {
    expect(STATEMENTS.length).toBeGreaterThanOrEqual(10);
    for (const cql of STATEMENTS) {
      const { sql } = generated(cql);
      // Whitespace is canonical: single spaces, no trailing space, no
      // newline, no depth indentation (Ruby's "LIMIT  10 " shape and its
      // depth*2 leading spaces, sql_statement.rb:48-50, 99-107, stay out).
      expect(sql).not.toMatch(/ {2}|\t|\n|\r/);
      expect(sql.endsWith(" ")).toBe(false);
      // No comment slot in any configuration (Ruby renders one only with
      // config.sql_comments on, railtie.rb:26's non-default;
      // card_query.rb:41-45).
      expect(sql).not.toContain("/*");
    }
  });

  it("every user value is a bound parameter, never an inlined literal", () => {
    // Value#sqlize (value.rb:69-77) inlines quoted literals; the declared
    // surface replaces each with a `?` bound parameter. A literal that
    // reappears in the text means a value was interpolated, which is the
    // injection shape decision 0010 refuses outright.
    for (const cql of STATEMENTS) {
      const { sql, params } = generated(cql);
      const placeholders = (sql.match(/\?/g) ?? []).length;
      expect(placeholders).toBe(params.length);
      for (const value of params) {
        if (typeof value === "string" && value.length > 0) {
          expect(sql).not.toContain(`'${value}'`);
        }
      }
    }
  });

  it("the count field renders the port's coalesce shape, not Ruby's spacing", () => {
    // Ruby: coalesce(count( distinct c0.id),0) as count
    // (sql_statement.rb:77, space after the paren). The port:
    const { sql } = generated({ return: "count" });
    expect(sql).toContain("coalesce(count(distinct c0.id),0) as count");
    expect(sql).not.toContain("count( distinct");
  });

  it("DISTINCT rides a non-empty join list, and offset needs its limit", () => {
    // The behavioral half the register's B21 entry notes next to the text:
    // SELECT DISTINCT exactly when the join list is non-empty
    // (sql_statement.rb:44-46), LIMIT only when positive and OFFSET only
    // with a LIMIT (sql_statement.rb:99-107; offset alone renders nothing).
    expect(generated({ type: { codename: "type" } }).sql).toContain("SELECT DISTINCT");
    expect(generated({ id: 5 }).sql).not.toContain("DISTINCT");
    expect(generated({ id: 5, offset: 3 }).sql).not.toContain("OFFSET");
    expect(generated({ id: 5, limit: 2, offset: 1 }).sql).toContain("LIMIT 2 OFFSET 1");
  });
});

// The live store's widening statements must stay within D1's five-term limit
// on a compound SELECT, and splitting a union across CTEs must not change
// the set it names.

import { describe, expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { unionCtes, MAX_COMPOUND_TERMS } from "../../../src/card/live/request-store.js";

/** Largest number of terms in any one compound SELECT of a CTE list. */
function maxTerms(ctes: string[]): number {
  return Math.max(...ctes.map((c) => c.split(" UNION ").length));
}

describe("unionCtes", () => {
  test("five or fewer parts stay one CTE, unchanged", () => {
    expect(unionCtes("s", ["SELECT 1", "SELECT 2"])).toEqual(["s(id) AS (SELECT 1 UNION SELECT 2)"]);
  });

  test("property: any length keeps every compound at or under five terms and names the same set", () => {
    const db = new DatabaseSync(":memory:");
    for (let n = 1; n <= 40; n++) {
      const parts = Array.from({ length: n }, (_, i) => `SELECT ${i % 7}`);
      const ctes = unionCtes("s", parts);
      expect(maxTerms(ctes)).toBeLessThanOrEqual(MAX_COMPOUND_TERMS);
      const got = db.prepare(`WITH ${ctes.join(", ")} SELECT id FROM s ORDER BY id`).all().map((r: any) => r.id);
      expect(got).toEqual([...new Set(parts.map((_, i) => i % 7))].sort((a, b) => a - b));
    }
  });
});

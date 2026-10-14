// The JS post-filter must reproduce Ruby's result SET, not a capped prefix
// of it.
//
// Provenance of the requirement: Ruby runs the match as a predicate in the
// same WHERE clause as every other condition
// (card/lib/card/query/value/match_value.rb:17-20 ->
// `#{match_field field} #{connection.match match_value}`; the per-adapter
// operators are card/config/initializers/02_patches/active_record.rb:81-118
// — `REGEXP '...'` for Mysql2Adapter:100-102 and SQLiteAdapter:114-118,
// `~* '...'` for PostgreSQLAdapter:94-98). No adapter imposes a bound, so
// a match over a large deck returns every matching row.
//
// The edge post-filter path (drivers that cannot host the REGEXP UDF —
// D1, libSQL) therefore fetches the COMPLETE match-free candidate set and
// filters in JS. An earlier revision capped that superset, which made the
// port return fewer rows than Ruby with no error at all; the deck below is
// built past that former cap (10,000) so the regression cannot come back.

import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { registerSqliteRegexpFunction } from "../../src/cql/sqlite-regexp.js";
import { executeQuery } from "../../src/cql/execute.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import { readFileSync } from "node:fs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** The former silent cap, recorded so a re-introduced bound fails here. */
const FORMER_POSTFILTER_ROW_CAP = 10_000;

async function freshDriver(registerUdf: boolean): Promise<LocalSqliteDriver> {
  const local = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8");
  for (const statement of splitSqlStatements(ddl)) {
    await local.query(statement, []);
  }
  if (registerUdf) registerSqliteRegexpFunction(local);
  return local;
}

/** The deck: MATCHING cards (every one carrying the token in db_content)
 *  past the former cap, plus NON-matching cards interleaved so the superset
 *  is strictly larger than the matching set — that is the case a cap breaks:
 *  the dropped rows are not the tail, they are whatever the ORDER BY left
 *  past the bound. */
const MATCHING = FORMER_POSTFILTER_ROW_CAP + 250;
const NON_MATCHING = 300;

async function seedLargeDeck(driver: LocalSqliteDriver): Promise<void> {
  await driver.query(
    "INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, " +
      "created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, " +
      "references_expired, trash, type_id, db_content) " +
      "VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, 2, ?)",
    [1, "Basic", "basic", "Basic", "2026-01-01 00:00:00.000", "2026-01-01 00:00:00.000", null],
  );
  // One recursive CTE: 10k+ prepared INSERTs would dominate the suite's
  // runtime, and the deck is generated, not modelled.
  await driver.query(
    "WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ?)" +
      " INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id," +
      " created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id," +
      " references_expired, trash, type_id, db_content)" +
      " SELECT 100 + n, 'Item ' || n, 'item_' || n, NULL, NULL, NULL, NULL," +
      " '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000', 1, 1, NULL, NULL, NULL, 0, 2," +
      " CASE WHEN n <= ? THEN 'filler body carrying the needle token' ELSE 'filler body' END" +
      " FROM seq",
    [MATCHING + NON_MATCHING, MATCHING],
  );
}

describe("CQL match post-filter: the complete candidate set, never a capped prefix", () => {
  it("returns EVERY match past the former 10,000-row cap (rows, and count)", async () => {
    const bare = await freshDriver(false);
    try {
      await seedLargeDeck(bare);
      const result = await executeQuery(bare, { match: "needle" });
      if ("count" in result) throw new Error("expected a rows result");
      expect(result.rows).toHaveLength(MATCHING);
      // No LIMIT of any shape in the SQL that ran: the superset is complete.
      expect(result.sql).not.toContain("LIMIT");

      const counted = await executeQuery(bare, { match: "needle", return: "count" });
      if (!("count" in counted)) throw new Error("expected a count result");
      expect(counted.count).toBe(MATCHING);
    } finally {
      bare.close();
    }
  });

  it("agrees with the REGEXP-UDF path row for row on the same deck", async () => {
    // The post-filter is not a second, looser matcher: it is the same
    // compileMatchPattern the UDF runs, so the two paths must return the
    // identical ordered set.
    const bare = await freshDriver(false);
    const withUdf = await freshDriver(true);
    try {
      await seedLargeDeck(bare);
      await seedLargeDeck(withUdf);
      const statement = { match: "needle", sort: "name" };
      const postFiltered = await executeQuery(bare, statement);
      const viaUdf = await executeQuery(withUdf, statement);
      if ("count" in postFiltered || "count" in viaUdf) throw new Error("expected rows results");
      expect(postFiltered.rows).toHaveLength(MATCHING);
      expect(postFiltered.rows.map((row) => row.id)).toEqual(
        viaUdf.rows.map((row) => row.id),
      );
    } finally {
      bare.close();
      withUdf.close();
    }
  });

  it("still honours limit and offset, taken over the FILTERED set", async () => {
    const bare = await freshDriver(false);
    try {
      await seedLargeDeck(bare);
      const all = await executeQuery(bare, { match: "needle", sort: "name" });
      const window = await executeQuery(bare, {
        match: "needle",
        sort: "name",
        limit: 5,
        offset: MATCHING - 3,
      });
      if ("count" in all || "count" in window) throw new Error("expected rows results");
      expect(window.rows).toHaveLength(3);
      expect(window.rows.map((row) => row.id)).toEqual(
        all.rows.slice(MATCHING - 3).map((row) => row.id),
      );
    } finally {
      bare.close();
    }
  });
});
// The post-filter must give Ruby's rows for the statement shapes around the
// match, not only for the plain card select.
describe("CQL match post-filter: statement shapes around the match", () => {
  const CARD_SQL =
    "INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, " +
    "created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, " +
    "references_expired, trash, type_id, db_content) " +
    "VALUES (?, ?, ?, NULL, NULL, NULL, NULL, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000', 1, 1, NULL, NULL, NULL, 0, 2, ?)";

  async function smallDeck(registerUdf: boolean): Promise<LocalSqliteDriver> {
    const driver = await freshDriver(registerUdf);
    const rows: Array<[number, string, string, string | null]> = [
      [11, "Alpha", "alpha", "has the needle inside"],
      [12, "Beta", "beta", "nothing here"],
      [13, "Needle Gamma", "needle_gamma", "plain"],
      [14, "Delta", "delta", "another needle"],
      [15, "Epsilon", "epsilon", null],
    ];
    for (const [id, name, key, content] of rows) {
      await driver.query(CARD_SQL, [id, name, key, content]);
    }
    return driver;
  }

  it("a non-card return still sees the matched columns, and returns only its own", async () => {
    // `return: id` selects only cards.id; the post-filter needs name and
    // db_content, so it selects them under helper aliases and strips them.
    const bare = await smallDeck(false);
    const withUdf = await smallDeck(true);
    try {
      for (const ret of ["id", "name", "content"]) {
        const statement = { match: "needle", sort: "name", return: ret };
        const a = await executeQuery(bare, statement);
        const b = await executeQuery(withUdf, statement);
        if ("count" in a || "count" in b) throw new Error("expected rows results");
        expect(a.rows).toHaveLength(3);
        expect(a.rows).toEqual(b.rows);
        for (const row of a.rows) {
          expect(Object.keys(row).some((key) => key.startsWith("__cql_match_"))).toBe(false);
        }
      }
    } finally {
      bare.close();
      withUdf.close();
    }
  });

  it("an offset without a limit is ignored, as Ruby renders no OFFSET alone", async () => {
    // sql_statement.rb:96-103: OFFSET is appended only inside `if limit.to_i.positive?`.
    const bare = await smallDeck(false);
    const withUdf = await smallDeck(true);
    try {
      const statement = { match: "needle", sort: "name", offset: 1 };
      const a = await executeQuery(bare, statement);
      const b = await executeQuery(withUdf, statement);
      if ("count" in a || "count" in b) throw new Error("expected rows results");
      expect(a.rows.map((row) => row.id)).toEqual([11, 14, 13]);
      expect(b.rows.map((row) => row.id)).toEqual([11, 14, 13]);
    } finally {
      bare.close();
      withUdf.close();
    }
  });

  it("match combined with group refuses loudly instead of grouping unfiltered rows", async () => {
    const bare = await smallDeck(false);
    try {
      await expect(
        executeQuery(bare, { match: "needle", group: "type_id" }),
      ).rejects.toThrow(/group/);
    } finally {
      bare.close();
    }
  });
});

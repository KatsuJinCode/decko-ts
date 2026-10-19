// Register B14 (decko-completeness-register-2026-10-18.md:793): the count
// sort — "Count sorts raise 'sorting by #count/<item> not yet implemented'
// BY DESIGN ... Ruby ships exactly one experimental count sort
// (sort_by_count_referred_to, sorting.rb:44-58)".
//
// RUBY ORACLE (read this session):
// - sorting.rb:24-30 sort_by: sort_field "count" -> sort_by_count(val,
//   item) -> sort_by_count_<item> (sorting.rb:52-55); only referred_to
//   responds — any other item raises "sorting by #count/<item> not yet
//   implemented" (:57-59).
// - sorting.rb:57-69 sort_by_count_referred_to: the order field becomes
//   "coalesce(count,0)" ("needed for postgres"); the val clause runs as an
//   id subselect (count_subselect :79-81, return "id", superquery self);
//   the sort query groups (cards LEFT JOIN card_references wr ON
//   id = referee_id, WHERE wr.referee_id in (<val sql>), GROUP BY id,
//   count(*)) and joins as [sort_query, "srtbl", "sort_join_field"].
// - Net order: cards sort by their inbound-reference count restricted to
//   referers the val subselect returns; cards outside that referer set
//   (or unreferenced) coalesce to 0.
//
// The port renders the same rows as a grouped card_references derived
// table (sql.ts renderJoin's countSortSubquery case): a val-set card's
// count reads ALL its inbound card_references rows — the identical number
// Ruby's cards-hop grouping produces, because the WHERE pins every joined
// row to wr.referee_id IN (val) before the count.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { executeQuery } from "../../src/cql/execute.js";
import { CqlBadQuery } from "../../src/cql/ast.js";
import type { CardsRow } from "../../src/server/schema.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const T = (date: string): string => `${date} 00:00:00.000`;

function card(seed: Partial<CardsRow> & { id: number; name: string; key: string }): CardsRow {
  return {
    codename: null,
    left_id: null,
    right_id: null,
    current_revision_id: null,
    read_rule_class: null,
    read_rule_id: null,
    references_expired: null,
    db_content: null,
    trash: 0,
    type_id: 1,
    creator_id: 10,
    updater_id: 10,
    created_at: T("2026-01-01"),
    updated_at: T("2026-01-01"),
    ...seed,
  } as CardsRow;
}

let driver: LocalSqliteDriver;

beforeAll(async () => {
  driver = new LocalSqliteDriver();
  const ddl = readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8");
  for (const statement of splitSqlStatements(ddl)) {
    await driver.query(statement, []);
  }
  const seeds: CardsRow[] = [
    card({ id: 1, name: "Basic", key: "basic" }),
    card({ id: 2, name: "User", key: "user" }),
    // users (the val subselect's referers)
    card({ id: 10, name: "U One", key: "u_one", type_id: 2 }),
    card({ id: 11, name: "U Two", key: "u_two", type_id: 2 }),
    // targets with DISTINCT inbound counts from User cards:
    // T One <- U One (1 row), T Two <- U One + U Two (2 rows), T Three: none
    card({ id: 20, name: "T One", key: "t_one" }),
    card({ id: 21, name: "T Two", key: "t_two" }),
    card({ id: 22, name: "T Three", key: "t_three" }),
    // a non-User referer whose rows must NOT count (the val filter)
    card({ id: 30, name: "Script", key: "script" }),
  ];
  for (const row of seeds) {
    await driver.query(
      `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id,
         read_rule_class, read_rule_id, references_expired, db_content, trash, type_id,
         creator_id, updater_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id, row.name, row.key, row.codename, row.left_id, row.right_id,
        row.current_revision_id, row.read_rule_class, row.read_rule_id,
        row.references_expired, row.db_content, row.trash, row.type_id,
        row.creator_id, row.updater_id, row.created_at, row.updated_at,
      ],
    );
  }
  // (referer_id, referee_id, referee_key, ref_type) — one row per pair,
  // the shape reference_values_array writes
  const refs: Array<[number, number, string]> = [
    [10, 20, "t_one"], // U One -> T One
    [10, 21, "t_two"], // U One -> T Two
    [11, 21, "t_two"], // U Two -> T Two
    [30, 22, "t_three"], // Script -> T Three: NOT a User referer
  ];
  for (const [refererId, refereeId, refereeKey] of refs) {
    await driver.query(
      "INSERT INTO card_references (referer_id, referee_id, referee_key, ref_type) VALUES (?, ?, ?, 'L')",
      [refererId, refereeId, refereeKey],
    );
  }
}, 30_000);

afterAll(() => {
  driver.close();
});

/** Name -> id resolver standing in for Card::Lexicon.id (ParseOptions) —
 *  the same stand-in shape the sibling suites use. */
const RESOLVER = (name: string): number =>
  ({ Basic: 1, User: 2, Script: 30 } as Record<string, number>)[name] ?? -999;

async function names(statement: Record<string, unknown>): Promise<string[]> {
  const result = await executeQuery(driver, statement, {
    parse: { resolveCardId: RESOLVER },
  });
  const rows = "rows" in result ? (result.rows as unknown as { name: string }[]) : [];
  return rows.map((r) => r.name);
}

describe("B14: the experimental count sort (Sorting#sort_by_count_referred_to)", () => {
  it("orders by inbound reference count from the val's referers, coalescing to 0", async () => {
    // val {type: User}: only User cards count as referers — T Two (2),
    // T One (1), T Three (0: its only referer is a Script card, so the
    // derived table has no row and the join's NULL coalesces to 0)
    // T Two (2 inbound from Users) > T One (1) > everything else coalesces
    // to 0: T Three's only referer is a Script card (outside the val set)
    // and the type cards + Script are unreferenced — four tied 0-count rows
    // whose relative order Ruby leaves unspecified (no secondary sort)
    const ordered = await names({
      type: "Basic",
      sort: { item: "referred_to", return: "count", type: "User" },
    });
    expect(ordered.slice(-2)).toEqual(["T One", "T Two"]);
    expect([...ordered.slice(0, -2)].sort()).toEqual([
      "Basic",
      "Script",
      "T Three",
      "User",
    ]);
  });

  it("sort_dir rides the count field", async () => {
    const ordered = await names({
      type: "Basic",
      sort: { item: "referred_to", return: "count", type: "User" },
      sort_dir: "desc",
    });
    expect(ordered.slice(0, 2)).toEqual(["T Two", "T One"]);
    expect([...ordered.slice(2)].sort()).toEqual([
      "Basic",
      "Script",
      "T Three",
      "User",
    ]);
  });

  it("any item other than referred_to still raises (sorting.rb:57-59)", async () => {
    await expect(
      names({ sort: { item: "left", return: "count" } }),
    ).rejects.toThrow("sorting by #count/left not yet implemented");
    const error = await names({ sort: { item: "left", return: "count" } }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(CqlBadQuery);
  });

  it("the count sort composes with a content condition on the outer query", async () => {
    // the outer filter runs first (SQL WHERE), the count only orders
    expect(
      await names({
        type: "Basic",
        key: ["in", "t_one", "t_two"],
        sort: { item: "referred_to", return: "count", type: "User" },
      }),
    ).toEqual(["T One", "T Two"]);
  });
});

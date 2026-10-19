// Register B13 (decko-completeness-register-2026-10-18.md:792): found_by's
// Hash-value shape — "hash values (Ruby: Query.run then one subquery per
// result card) are REFUSED by name" in the register; this file pins the
// ported shape (execute.ts resolveHashFoundBy).
//
// RUBY ORACLE (read this session):
// - found_by.rb:7-13 `found_by val` -> found_by_cards(val).compact.each
//   { |card| subquery found_by_subquery(card) }; found_by_statement:
//   `card&.try(:cql_hash) || invalid_found_by_card!`.
// - :15-18 found_by_cards, Hash arm: `Query.run val` — the hash's OWN
//   statement runs; Query.run's default return is the CARD
//   (run.rb:10-12 -> card_result :77-83).
// - :20-23 found_by_subquery: the result card's cql_hash becomes a
//   :direct subquery with context: card.name — each found card ANDs its
//   id set into the outer query (the same intersect the name shape pins).
// - :26-29 invalid_found_by_card!: BadQuery '"found_by" value must be
//   valid Search, but #{name} is a #{type_name}'.
// - cql_hash answerers (Abstract::CqlSearch includes): search_type.rb:2,
//   cardtype.rb:1 — and Set rides along through set/type/set.rb:1
//   `include_set Type::SearchType`.
// - Zero result cards: `each` over an empty array adds NO subquery — the
//   outer query runs unrestricted (unlike an existing target whose search
//   returns nothing, the name shape's empty sentinel).

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
  // the trigger-aware splitter (the deck_data_version triggers carry a
  // `;` before their END) — kept in lockstep with execution.test.ts's
  // loadCoreSchema
  for (const statement of splitSqlStatements(ddl)) {
    await driver.query(statement, []);
  }
  const seeds: CardsRow[] = [
    // types
    card({ id: 1, name: "Basic", key: "basic" }),
    card({ id: 2, name: "User", key: "user" }),
    card({ id: 3, name: "Search", key: "search", codename: "search_type" }),
    // users
    card({ id: 10, name: "Joe Admin", key: "joe_admin", type_id: 2 }),
    card({ id: 11, name: "Tova Sample", key: "tova_sample", type_id: 2 }),
    // content
    card({ id: 20, name: "Home", key: "home", db_content: "welcome" }),
    // search cards
    card({
      id: 30,
      name: "User Finder",
      key: "user_finder",
      type_id: 3,
      db_content: '{"type":"User"}',
    }),
    card({
      id: 31,
      name: "Home Finder",
      key: "home_finder",
      type_id: 3,
      db_content: '{"name":"Home"}',
    }),
    // a non-Search card the hash queries can return
    card({ id: 40, name: "Plain", key: "plain" }),
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
}, 30_000);

afterAll(() => {
  driver.close();
});

/** Name -> id resolver standing in for Card::Lexicon.id (ParseOptions) —
 *  the same stand-in shape execution.test.ts's RESOLVER uses. */
const RESOLVER = (name: string): number =>
  (
    {
      Basic: 1,
      User: 2,
      Search: 3,
      "Joe Admin": 10,
      "Tova Sample": 11,
      Home: 20,
      "User Finder": 30,
      "Home Finder": 31,
      Plain: 40,
    } as Record<string, number>
  )[name] ?? -999;

const EXEC_OPTS = { parse: { resolveCardId: RESOLVER } };

async function names(statement: Record<string, unknown>): Promise<string[]> {
  const result = await executeQuery(driver, statement, EXEC_OPTS);
  const rows = "rows" in result ? (result.rows as unknown as { name: string }[]) : [];
  return rows.map((r) => r.name);
}

describe("B13: found_by Hash values run Query.run over result cards' statements", () => {
  it("a single-result hash resolves through that card's own statement", async () => {
    // { name: "User Finder" } finds the Search card; its cql_hash
    // {"type":"User"} becomes the subquery -> the outer query matches the
    // users, sorted by the outer's default (update desc)
    // the found statement's rows ride the outer query's default order; the
    // seeds share one timestamp, so the id order stands
    expect(await names({ found_by: { name: "User Finder" } })).toEqual([
      "Joe Admin",
      "Tova Sample",
    ]);
  });

  it("multiple result cards AND their statements (the intersect)", async () => {
    // { type: "Search" } finds BOTH search cards; User Finder's users ∩
    // Home Finder's [Home] = the empty set
    expect(await names({ found_by: { type: "Search" } })).toEqual([]);
  });

  it("a non-Search result card raises Ruby's exact BadQuery (found_by.rb:26-29)", async () => {
    // { name: "Plain" } finds the Basic-typed Plain card; Basic carries no
    // cql_hash (Abstract::CqlSearch is only on Search/Cardtype/Set)
    await expect(names({ found_by: { name: "Plain" } })).rejects.toThrow(
      '"found_by" value must be valid Search, but Plain is a Basic',
    );
    // and the error is the 400-mappable CqlBadQuery
    const error = await names({ found_by: { name: "Plain" } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CqlBadQuery);
  });

  it("zero result cards add no constraint — the outer query runs unrestricted", async () => {
    // found_by.rb:7-9: `found_by_cards(val).compact.each` over an empty
    // result array adds no subquery
    const all = await names({ found_by: { name: "No Such Card Anywhere" } });
    expect(all).toContain("Home");
    expect(all).toContain("Joe Admin");
    expect(all).toContain("User Finder");
    expect(all).toContain("Plain");
  });

  it("the hash's own conditions bind the inner query (a keyed hash narrows its results)", async () => {
    // two clauses: type Search narrows the result cards to the two finders,
    // key user_finder narrows to ONE — the found card's statement then
    // decides the outer set (the users)
    expect(await names({ found_by: { type: "Search", key: "user_finder" } })).toEqual([
      "Joe Admin",
      "Tova Sample",
    ]);
  });
});

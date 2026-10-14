// CQL `match` semantics, pinned from Ruby's SOURCE.
//
// Every expectation below is derived from the reference implementation in
// C:/localProjects/decko-ruby-reference and cited by file:line, so the
// assertions cannot be satisfied by whatever this port happens to emit
// today. Each test names the Ruby rule it pins.
//
// The two files that define the whole of `match`:
//
//  card/lib/card/query/value/match_value.rb
//    :6      match_prefices == %w[= ~]
//    :9-12   match_term_and_prefix_re == /^(?<prefix>[=~]*)\s*(?<term>.*)$/
//    :17-20  match_sql(field) ==
//              exact_name_match(field) ||
//              "#{match_field field} #{connection.match match_value}"
//    :22-26  exact_name_match: prefix "=" AND field == :name ->
//              "#{field_sql field} = #{quote match_term.to_name.key}"
//    :28-31  match_field: :name -> the name column, else standardize_field
//    :33-36  match_value: escape_regexp_characters unless match_prefix == "~~",
//            then quote
//    :46-51  a "~~" prefix means a MySQL regexp, passed through
//    :48     "A '~' prefix is ignored."
//    :60-62  escape_regexp_characters: match_term.gsub!(/(\W)/, '\\\\\1')
//
//  card/config/initializers/02_patches/active_record.rb
//    :81-83  AbstractAdapter#match raises (no default)
//    :94-98  PostgreSQLAdapter#match -> "~* #{string}"   (case-insensitive)
//    :100-102 Mysql2Adapter#match   -> "REGEXP #{string}"
//    :114-118 SQLiteAdapter#match   -> "REGEXP #{string}"

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { registerSqliteRegexpFunction } from "../../src/cql/sqlite-regexp.js";
import { executeQuery } from "../../src/cql/execute.js";
import { splitSqlStatements } from "../card/render/render-test-storage.js";
import type { CardsRow } from "../../src/server/schema.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** The deck every assertion below runs against. Names/contents are chosen so
 *  that each Ruby rule above has at least one positive and one negative:
 *  case variants, an embedded substring, a dot that must stay literal, each
 *  regex metacharacter, a NULL name and a NULL content. */
const DECK: CardsRow[] = [
  {
    id: 1,
    name: "Basic",
    key: "basic",
    codename: "Basic",
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
    created_at: "2026-01-01 00:00:00.000",
    updated_at: "2026-01-01 00:00:00.000",
  },
  ...[
    { id: 10, name: "Home", key: "home", content: "the front page" },
    { id: 11, name: "HOME", key: "home_2", content: "shouting header" },
    { id: 12, name: "Home Page", key: "home_page", content: "a longer title" },
    { id: 13, name: "About Us", key: "about_us", content: null },
    { id: 14, name: null, key: null, content: "the home compound body" },
    { id: 15, name: "Dotted", key: "dotted", content: "a.c literal" },
    { id: 16, name: "Dots", key: "dots", content: "abc no dot here" },
    { id: 17, name: "Meta", key: "meta", content: "a+b (c) [d] e|f ^g $h * \\ {1}" },
    { id: 18, name: "Anchor", key: "anchor", content: "xHomex suffix" },
    { id: 19, name: "home page extra", key: "home_page_extra", content: "trailing words" },
  ].map((row) => ({
    id: row.id,
    name: row.name,
    key: row.key,
    codename: null,
    left_id: null,
    right_id: null,
    current_revision_id: null,
    read_rule_class: null,
    read_rule_id: null,
    references_expired: null,
    db_content: row.content,
    trash: 0 as const,
    type_id: 2,
    creator_id: 10,
    updater_id: 10,
    created_at: "2026-01-01 00:00:00.000",
    updated_at: "2026-01-01 00:00:00.000",
  })),
];

async function freshDeck(registerUdf: boolean): Promise<LocalSqliteDriver> {
  const driver = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8");
  for (const statement of splitSqlStatements(ddl)) {
    await driver.query(statement, []);
  }
  for (const row of DECK) {
    await driver.query(
      "INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, " +
        "created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, " +
        "references_expired, trash, type_id, db_content) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 10, 10, NULL, NULL, NULL, 0, ?, ?)",
      [
        row.id,
        row.name,
        row.key,
        row.codename,
        row.left_id,
        row.right_id,
        row.current_revision_id,
        row.created_at,
        row.updated_at,
        row.type_id,
        row.db_content,
      ],
    );
  }
  if (registerUdf) registerSqliteRegexpFunction(driver);
  return driver;
}

/** Ids matching `statement`, on the pinned deck. */
async function matched(driver: LocalSqliteDriver, statement: unknown): Promise<number[]> {
  const result = await executeQuery(driver, statement);
  if ("count" in result) throw new Error("expected a rows result");
  return result.rows.map((row) => row.id).sort((a, b) => a - b);
}

// Both execution paths must return Ruby's result set: the REGEXP UDF
// (local SQLite) and the JS post-filter (drivers that cannot host a UDF:
// libSQL, D1 — a UDF-less LocalSqliteDriver takes the identical code path).
describe.each([
  ["REGEXP UDF (local SQLite)", true],
  ["JS post-filter (libSQL / D1 shape)", false],
])("CQL match: semantics pinned from Ruby's source — %s", (_label, registerUdf) => {
  it("case-folds: PostgreSQL ~* and MySQL REGEXP are both case-insensitive", async () => {
    // active_record.rb:96 "~* #{string}" is PostGIS-style case-INSENSITIVE
    // match; :101 MySQL REGEXP runs under the server's ci collation. The
    // escaped-literal shape therefore matches any case variant.
    const driver = await freshDeck(registerUdf);
    try {
      // By name (substring, any case): Home 10, HOME 11, Home Page 12,
      // home page extra 19. By content: "the home compound body" 14,
      // "xHomex suffix" 18.
      const expected = [10, 11, 12, 14, 18, 19];
      expect(await matched(driver, { match: "home" })).toEqual(expected);
      expect(await matched(driver, { match: "HOME" })).toEqual(expected);
      expect(await matched(driver, { match: "hOmE" })).toEqual(expected);
    } finally {
      driver.close();
    }
  });

  it("matches a SUBSTRING, not the whole value (REGEXP is unanchored)", async () => {
    // Neither adapter anchors the pattern (active_record.rb:96/101/116 emit
    // the bare operator), so a term anywhere in the value matches.
    const driver = await freshDeck(registerUdf);
    try {
      // "ome" sits inside every name/content that holds "home", so the set
      // is the same six cards as the whole-word term (id 18 is reachable
      // ONLY as a substring: its content is "xHomex suffix").
      expect(await matched(driver, { match: "ome" })).toEqual([10, 11, 12, 14, 18, 19]);
      expect(await matched(driver, { match: "xhomex" })).toEqual([18]);
    } finally {
      driver.close();
    }
  });

  it("treats regex metacharacters as LITERALS unless the term is ~~-prefixed", async () => {
    // match_value.rb:60-62 escape_regexp_characters backslash-escapes every
    // non-word character, so "." cannot match any character but itself.
    const driver = await freshDeck(registerUdf);
    try {
      // "a.c" is in id 15's content ("a.c literal"); id 16 has "abc", which
      // an UNESCAPED "." would also match. It must not.
      expect(await matched(driver, { match: "a.c" })).toEqual([15]);
    } finally {
      driver.close();
    }
  });

  it("escapes every regex metacharacter in the literal path", async () => {
    // Same rule (match_value.rb:60-62), across the metacharacters the
    // escaped-literal shape has to neutralise. id 17 carries all of them.
    const driver = await freshDeck(registerUdf);
    try {
      for (const term of ["a+b", "(c)", "[d]", "e|f", "^g", "*", "\\", "{1}"]) {
        expect([term, await matched(driver, { match: term })]).toEqual([term, [17]]);
      }
      // Negative: no row carries the literal "zzz+".
      expect(await matched(driver, { match: "zzz+" })).toEqual([]);
    } finally {
      driver.close();
    }
  });

  it("passes a ~~-prefixed term through as a raw regex (match_value.rb:46-51)", async () => {
    // The "~~" prefix bypasses escape_regexp_characters, so the pattern
    // reaches the server as written: "^Home" anchors at the start of the
    // name OR the content. Names starting with "home": 10, 11, 12 (Home
    // Page), 19 (home page extra). No content starts with it (14 begins
    // "the home", 18 "xHomex"), so those two are excluded by the anchor.
    const driver = await freshDeck(registerUdf);
    try {
      expect(await matched(driver, { match: "~~^Home" })).toEqual([10, 11, 12, 19]);
      expect(await matched(driver, { match: "~~^home" })).toEqual([10, 11, 12, 19]);
      // an unescaped dot is a wildcard: "a.c" now also reaches id 16 ("abc")
      // and id 18 (the name "Anchor": a-n-c)
      expect(await matched(driver, { match: "~~a.c" })).toEqual([15, 16, 18]);
    } finally {
      driver.close();
    }
  });

  it("ignores a ~ prefix (match_value.rb:48: \"A '~' prefix is ignored.\")", async () => {
    const driver = await freshDeck(registerUdf);
    try {
      expect(await matched(driver, { match: "~home" })).toEqual(
        await matched(driver, { match: "home" }),
      );
      // ...and skips whitespace between the prefix and the term
      // (match_term_and_prefix_re, match_value.rb:11).
      expect(await matched(driver, { match: "~ home" })).toEqual([10, 11, 12, 14, 18, 19]);
    } finally {
      driver.close();
    }
  });

  it("= on name is exact KEY equality, not a substring (match_value.rb:22-26)", async () => {
    // exact_name_match returns "<field> = quote match_term.to_name.key" — the
    // canonical key, so equality only. "Home" must not reach "Home Page"
    // (key home_page) or "home page extra" (key home_page_extra).
    const driver = await freshDeck(registerUdf);
    try {
      expect(await matched(driver, { name: ["~", "=Home"] })).toEqual([10]);
      // The key is canonical, so the spelling of the term does not matter
      // for its KEY characters: to_name.key downcases and joins with "_".
      expect(await matched(driver, { name: ["~", "=home"] })).toEqual([10]);
      expect(await matched(driver, { name: ["~", "=Home Page"] })).toEqual([12]);
    } finally {
      driver.close();
    }
  });

  it("= on a NON-name field is not exact — it falls through to the regex path", async () => {
    // match_value.rb:23 guards exact_name_match with `field.to_sym == :name`;
    // for any other field it returns false and match_sql (`:19`) emits the
    // REGEXP form. `match` is an OR over name and content
    // (parser: matchAttribute), so only its name half is exact and its
    // content half is still a substring search.
    const driver = await freshDeck(registerUdf);
    try {
      // name half -> key = 'home' -> id 10 only.
      // content half -> db_content REGEXP 'home' -> id 14 ("the home
      // compound body") and id 18 ("xHomex suffix": substring, not exact).
      expect(await matched(driver, { match: "=home" })).toEqual([10, 14, 18]);
    } finally {
      driver.close();
    }
  });

  it("a NULL name or NULL content never matches (SQL NULL propagation)", async () => {
    // match_field (match_value.rb:28-31) emits the raw column with no
    // COALESCE, so `NULL REGEXP '...'` is NULL and a WHERE keeps no row.
    // The deck: id 14 has a NULL name and a matching content; id 13 has a
    // name but a NULL content.
    const driver = await freshDeck(registerUdf);
    try {
      // "About Us" (13) matches by name; its NULL content must not drop it.
      expect(await matched(driver, { match: "About" })).toEqual([13]);
      // A content-only term cannot reach a row whose content is NULL.
      expect(await matched(driver, { match: "longer title" })).toEqual([12]);
      // And the NULL name of the compound row can never be the hit.
      expect(await matched(driver, { match: "home compound" })).toEqual([14]);
    } finally {
      driver.close();
    }
  });

  it("renders the operator Ruby renders: `field REGEXP ?` for MySQL/SQLite", async () => {
    // active_record.rb:114-118 (SQLiteAdapter) and :100-102 (Mysql2Adapter)
    // both return "REGEXP #{string}". The port parameterizes the pattern, so
    // the shape is `field REGEXP ?` with the pattern in params.
    const driver = await freshDeck(registerUdf);
    try {
      const result = await executeQuery(driver, { match: "home" });
      if ("count" in result) throw new Error("expected a rows result");
      if (registerUdf) {
        expect(result.sql).toContain("c0.name REGEXP ?");
        expect(result.sql).toContain("c0.db_content REGEXP ?");
        // match_value.rb:60-62: the non-raw term is escaped before quoting.
        expect(result.params).toContain("home");
      } else {
        // the post-filter drops the predicate from the SQL and applies it
        // in JS; it must never add a LIMIT (Ruby has none for this shape)
        expect(result.sql).not.toContain("REGEXP");
        expect(result.sql).not.toContain("LIMIT");
      }
    } finally {
      driver.close();
    }
  });
});
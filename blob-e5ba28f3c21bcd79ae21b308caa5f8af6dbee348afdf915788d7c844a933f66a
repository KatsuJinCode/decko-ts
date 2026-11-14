// Every recursive CTE the engine issues, run through PostgresDriver on PGlite.
//
// PostgreSQL checks a recursive CTE when it analyses the statement, so each
// query fails on an empty schema exactly as it fails on a full deck when its
// column types disagree (the anchor-parameter case below). The statements are
// the engine's own builders and constants, not copies. Each site is listed
// with its source so a new recursive query is added here when it is written.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PostgresDriver, translateSqliteToPostgres, type SchemaTypes } from "../../../src/server/drivers/postgres.js";
import type { SQLDatabaseDriver, SQLStatement } from "../../../src/server/driver.js";
import { nestIndexStatement } from "../../../src/card/render/prefetch.js";
import { ruleSidesStatement } from "../../../src/card/mod-loader/mods/card-mod-rules.js";
import { ruleSidesStatement as warmRuleSidesStatement } from "../../../src/card/mod-loader/mods/rule-card-warm.js";
import { scriptRuleSidesStatement } from "../../../src/card/mod-loader/mods/card-mod-script.js";
import { searchCardsSidesStatement } from "../../../src/card/mod-loader/mods/card-mod-search.js";
import { helpRuleSidesStatement } from "../../../src/card/render/help-popover.js";
import { legacyRuleUniverseStatement, ruleUniverseStatementBySetting } from "../../../src/card/rules/structure.js";
import { inlineStoreCteSql } from "../../../src/card/one-trip/one-trip-fetch.js";
import { ONE_TRIP_SIDE_DDL } from "../../../src/card/one-trip/side-db-schema.js";
import {
  LEGACY_RULE_KEY_RULE_CLOSURE_STATEMENT,
  RULE_KEY_RULE_CLOSURE_STATEMENT,
  RULE_KEY_UNIVERSE_STATEMENT,
} from "../../../src/card/permissions/read-rules.js";
import { STAR_PREFIXED_MEMBERS_STATEMENT } from "../../../src/card/permissions/set-read-rule.js";
import { splitSqlStatements } from "../../card/fetch/fetch-test-storage.js";

const SCHEMA = readFileSync(fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)), "utf8");

/** The column types of the engine's schema, as the driver reads them from the
 *  catalog: built from a real PGlite database so the test uses the same
 *  information the driver does. */
async function schemaTypesOf(driver: PostgresDriver): Promise<SchemaTypes> {
  // The driver loads its catalog snapshot for any recursive statement; the
  // snapshot is read here through a recursive probe so no test-only hook is
  // needed.
  await driver.query(`WITH RECURSIVE probe(n) AS (SELECT 1 UNION SELECT n FROM probe WHERE n < 1) SELECT n FROM probe`, []);
  const cache = (driver as unknown as { schemaTypeCache?: SchemaTypes }).schemaTypeCache;
  if (cache === undefined) throw new Error("the driver did not load its schema types");
  return cache;
}

async function loadSchema(driver: SQLDatabaseDriver): Promise<void> {
  for (const statement of splitSqlStatements(SCHEMA)) {
    if (/^\s*PRAGMA\b/i.test(statement)) {
      await driver.query(statement, []).catch(() => undefined);
      continue;
    }
    await driver.query(statement, []);
  }
}

/** Placeholder values for a statement that does not return its own params:
 *  one value per `?`. */
function placeholdersFor(sql: string): unknown[] {
  return Array.from({ length: (sql.match(/\?/g) ?? []).length }, () => 1);
}

interface Site {
  name: string;
  source: string;
  statement: () => SQLStatement;
}

const RECURSIVE_SITES: Site[] = [
  { name: "inclusion nest index (prefetch reach)", source: "src/card/render/prefetch.ts", statement: () => nestIndexStatement(1) },
  {
    name: "rule sides, all settings",
    source: "src/card/mod-loader/mods/card-mod-rules.ts",
    statement: () => ruleSidesStatement(1, 2) as SQLStatement,
  },
  {
    name: "rule sides, codename set",
    source: "src/card/mod-loader/mods/rule-card-warm.ts",
    statement: () => warmRuleSidesStatement(1, 2, ["input_type"]) as SQLStatement,
  },
  {
    name: "rule sides, script and style",
    source: "src/card/mod-loader/mods/card-mod-script.ts",
    statement: () => scriptRuleSidesStatement(1) as SQLStatement,
  },
  {
    name: "search cards sides",
    source: "src/card/mod-loader/mods/card-mod-search.ts",
    statement: () => searchCardsSidesStatement(1) as SQLStatement,
  },
  { name: "help rule sides", source: "src/card/render/help-popover.ts", statement: () => helpRuleSidesStatement(1, 2) },
  {
    name: "rule universe by setting (upward walk)",
    source: "src/card/rules/structure.ts",
    statement: () => ruleUniverseStatementBySetting("*all"),
  },
  {
    name: "rule universe by setting (legacy name walk)",
    source: "src/card/rules/structure.ts",
    statement: () => legacyRuleUniverseStatement("*all"),
  },
  {
    name: "one-trip inline page walk (discovery phase)",
    source: "src/card/one-trip/one-trip-fetch.ts",
    statement: () => ({ sql: `${inlineStoreCteSql()} SELECT id FROM members`, params: ["home", "home"] }),
  },
  {
    name: "rule key universe",
    source: "src/card/permissions/read-rules.ts",
    statement: () => ({ sql: RULE_KEY_UNIVERSE_STATEMENT, params: placeholdersFor(RULE_KEY_UNIVERSE_STATEMENT) }),
  },
  {
    name: "rule key rule closure",
    source: "src/card/permissions/read-rules.ts",
    statement: () => ({ sql: RULE_KEY_RULE_CLOSURE_STATEMENT, params: placeholdersFor(RULE_KEY_RULE_CLOSURE_STATEMENT) }),
  },
  {
    name: "legacy rule key rule closure",
    source: "src/card/permissions/read-rules.ts",
    statement: () => ({
      sql: LEGACY_RULE_KEY_RULE_CLOSURE_STATEMENT,
      params: placeholdersFor(LEGACY_RULE_KEY_RULE_CLOSURE_STATEMENT),
    }),
  },
  {
    name: "rstar set members",
    source: "src/card/permissions/set-read-rule.ts",
    statement: () => ({ sql: STAR_PREFIXED_MEMBERS_STATEMENT, params: [] }),
  },
];

describe("recursive CTEs the engine issues, on PostgreSQL (PGlite)", () => {
  let driver: PostgresDriver;

  beforeEach(async () => {
    driver = new PostgresDriver({ client: await PGlite.create() });
    await loadSchema(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  // The one-trip inline store keeps its tables in the serving database.
  beforeEach(async () => {
    for (const ddl of ONE_TRIP_SIDE_DDL) await driver.query(ddl, []);
  });

  it.each(RECURSIVE_SITES)("runs: $name ($source)", async ({ statement }) => {
    const s = statement();
    const params = s.params.length > 0 ? s.params : placeholdersFor(s.sql);
    await expect(driver.query(s.sql, params)).resolves.toBeDefined();
  });

  it("the inclusion nest index returns the root and the cards its references reach", async () => {
    await driver.query(
      `INSERT INTO cards (id, name, key, codename, created_at, updated_at, creator_id, updater_id, trash, type_id) VALUES
         (1, 'Home', 'home', NULL, '', '', 0, 0, 0, 0),
         (2, 'Child', 'child', NULL, '', '', 0, 0, 0, 0),
         (3, 'Grandchild', 'grandchild', NULL, '', '', 0, 0, 0, 0),
         (4, 'Unreferenced', 'unreferenced', NULL, '', '', 0, 0, 0, 0)`,
      [],
    );
    await driver.query(
      `INSERT INTO card_references (referer_id, referee_id, referee_key, ref_type, is_present) VALUES
         (1, 2, 'child', 'I', 1), (2, 3, 'grandchild', 'I', 1), (1, 4, 'unreferenced', 'L', 1)`,
      [],
    );
    const s = nestIndexStatement(1);
    const rows = (await driver.query<{ id: number }>(s.sql, s.params)).rows.map((r) => r.id).sort();
    expect(rows).toEqual([1, 2, 3]);
  });

  it("the anchor parameter of the nest index is typed from the recursive term's column", async () => {
    const types = await schemaTypesOf(driver);
    expect(types.get("card_references")?.get("referee_id")).toBe("integer");
    const t = translateSqliteToPostgres(nestIndexStatement(1).sql, types);
    expect(t.sql).toContain("SELECT CAST($1 AS integer), 'n'");
  });
});

describe("translateSqliteToPostgres: recursive anchor parameters", () => {
  const types: SchemaTypes = new Map([
    ["edges", new Map([["from_id", "integer"], ["label", "text"]])],
  ]);

  it("types a bare parameter from the recursive term's integer column", () => {
    const sql = `WITH RECURSIVE walk(id, tag) AS (SELECT ?, 'x' UNION SELECT e.from_id, 'y' FROM edges e JOIN walk w ON e.from_id = w.id) SELECT * FROM walk`;
    expect(translateSqliteToPostgres(sql, types).sql).toContain("SELECT CAST($1 AS integer), 'x'");
  });

  it("types an aliased bare parameter and keeps its alias", () => {
    const sql = `WITH RECURSIVE walk(id) AS (SELECT ? AS id UNION SELECT e.from_id FROM edges e JOIN walk w ON e.from_id = w.id) SELECT * FROM walk`;
    expect(translateSqliteToPostgres(sql, types).sql).toContain("SELECT CAST($1 AS integer) AS id");
  });

  it("types a bare parameter from a text literal in the recursive term", () => {
    const sql = `WITH RECURSIVE walk(id, tag) AS (SELECT 1, ? UNION SELECT e.from_id, 'y' FROM edges e JOIN walk w ON e.from_id = w.id) SELECT * FROM walk`;
    expect(translateSqliteToPostgres(sql, types).sql).toContain("SELECT 1, CAST($1 AS text)");
  });

  it("leaves an anchor alone when the recursive term's column is not in the schema", () => {
    const sql = `WITH RECURSIVE walk(id) AS (SELECT ? UNION SELECT u.id FROM unknown_table u JOIN walk w ON u.id = w.id) SELECT * FROM walk`;
    expect(translateSqliteToPostgres(sql, types).sql).toContain("SELECT $1 UNION");
  });

  it("leaves an anchor alone without a schema", () => {
    const sql = `WITH RECURSIVE walk(id) AS (SELECT ? UNION SELECT e.from_id FROM edges e JOIN walk w ON e.from_id = w.id) SELECT * FROM walk`;
    expect(translateSqliteToPostgres(sql).sql).toContain("SELECT $1 UNION");
  });

  it("leaves an anchor alone when the seed is not a plain select list", () => {
    const sql = `WITH RECURSIVE walk(id) AS (SELECT DISTINCT ? UNION SELECT e.from_id FROM edges e JOIN walk w ON e.from_id = w.id) SELECT * FROM walk`;
    expect(translateSqliteToPostgres(sql, types).sql).toContain("SELECT DISTINCT $1 UNION");
  });
});

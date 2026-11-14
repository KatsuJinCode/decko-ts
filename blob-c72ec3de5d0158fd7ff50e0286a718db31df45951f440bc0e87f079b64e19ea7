// Every schema and import path must land the serving-path indexes and leave
// out cards_trash_index. A database that reaches the edge otherwise is not
// slow for a reason anyone will find later: on a planner without statistics
// (Bunny Database rejects ANALYZE) every "AND trash = 0" lookup reads the
// whole live deck through cards_trash_index.
//
// This guard fails when:
//   - the canonical DDL stops declaring a required index, or changes its shape;
//   - the DDL, 0001, 0008 or the canonical statements create a retired index,
//     0008 stops dropping it, or the Bunny import stops skipping it;
//   - the generated 0001 migration or the 0008 backfill drifts from the DDL;
//   - an import path stops applying the canonical indexes (or, for local
//     SQLite paths, stops running ANALYZE);
//   - the Bunny import starts sending ANALYZE, which Bunny rejects;
//   - on SQLite 3.45.1 (the libsql build Bunny runs) with no statistics, one
//     of the engine's serving statements plans through cards_trash_index, or
//     stops using the index it was given.

import Database from "better-sqlite3";
import Libsql from "libsql";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { RETIRED_INDEXES, canonicalIndexStatements, isRetiredIndex } from "../../tools/migrate/serving-indexes.mjs";
import { DEPLOY_MIGRATION_ORDER } from "../../src/server/deploy-migrations.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");
const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

// [index name, table, definition after the table name]. The definition is
// compared exactly (whitespace-normalised), so a changed column list,
// collation, expression or WHERE clause fails here rather than at the first
// slow page.
export const REQUIRED_INDEXES: ReadonlyArray<readonly [string, string, string]> = [
  ["cards_key_index", "cards", '("key" COLLATE NOCASE)'],
  ["cards_key_binary_index", "cards", '("key")'],
  ["cards_codename_index", "cards", '("codename" COLLATE NOCASE)'],
  ["cards_codename_binary_index", "cards", '("codename")'],
  ["cards_right_id_index", "cards", '("right_id")'],
  ["cards_type_id_index", "cards", '("type_id")'],
  ["card_references_referer_id_index", "card_references", '("referer_id")'],
  ["card_references_referee_id_index", "card_references", '("referee_id")'],
  // Serving-path indexes for the no-statistics planner.
  ["cards_name_trash_index", "cards", '("name", "trash")'],
  ["cards_right_id_trash_index", "cards", '("right_id", "trash")'],
  ["cards_codename_present_index", "cards", '("codename", "id", "name", "left_id", "right_id") WHERE "codename" IS NOT NULL'],
  ["cards_key_last_char_index", "cards", '(substr("key", -1))'],
];
const SERVING = REQUIRED_INDEXES.slice(8);

function declared(sql: string, name: string, table: string): string | null {
  const re = new RegExp(
    `CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"${name}"\\s+ON\\s+"${table}"\\s*(\\(.*?);\\s*$`,
    "im",
  );
  const m = sql.match(re);
  return m ? squash(m[1]) : null;
}

describe("canonical schema declares the serving-path indexes", () => {
  const ddl = read("db/schema.sqlite.sql");
  for (const [name, table, def] of REQUIRED_INDEXES) {
    it(`declares ${name} on ${table} ${def}`, () => {
      expect(declared(ddl, name, table), `${name} is not declared in db/schema.sqlite.sql`).toBe(squash(def));
    });
  }
});

describe("retired indexes stay retired", () => {
  it("cards_trash_index is on the retired list", () => {
    expect(RETIRED_INDEXES).toContain("cards_trash_index");
    expect(isRetiredIndex("cards_trash_index")).toBe(true);
    expect(isRetiredIndex("cards_name_trash_index")).toBe(false);
  });

  for (const name of RETIRED_INDEXES) {
    it(`${name} is created by neither the DDL, 0001, nor canonicalIndexStatements`, () => {
      // Statements start a line; comments ("-- Reversible: CREATE INDEX ...") do not.
      const create = new RegExp(`^\\s*CREATE\\s+(UNIQUE\\s+)?INDEX\\s+(IF\\s+NOT\\s+EXISTS\\s+)?"${name}"`, "im");
      expect(read("db/schema.sqlite.sql")).not.toMatch(create);
      expect(read("deploy/migrations/0001-schema.sql")).not.toMatch(create);
      expect(read("deploy/migrations/0008-cards-serving-path-indexes.sql")).not.toMatch(create);
      expect(canonicalIndexStatements().map((s) => s.name)).not.toContain(name);
    });

    it(`0008 drops ${name} on provisioned databases`, () => {
      expect(read("deploy/migrations/0008-cards-serving-path-indexes.sql")).toMatch(
        new RegExp(`^DROP INDEX IF EXISTS "${name}";`, "m"),
      );
    });
  }

  it("the Bunny import skips retired indexes when it copies a source's indexes", () => {
    const src = read("scripts/import-to-bunny-db.mjs");
    expect(src).toMatch(/import \{[^}]*\bisRetiredIndex\b[^}]*\} from '..\/tools\/migrate\/serving-indexes\.mjs'/);
    expect(src).toMatch(/\.filter\(\(i\) => !isRetiredIndex\(i\.name\)\)/);
  });
});

describe("deploy migrations carry the same indexes", () => {
  it("0001-schema.sql is regenerated from the canonical DDL", () => {
    const m0001 = read("deploy/migrations/0001-schema.sql");
    for (const [name, table, def] of REQUIRED_INDEXES) {
      expect(declared(m0001, name, table), `${name} missing from 0001 (run node deploy/sync-migrations.mjs)`).toBe(squash(def));
    }
  });

  it("0008 backfills every serving-path index with IF NOT EXISTS, and is in the manifest", () => {
    const m0008 = read("deploy/migrations/0008-cards-serving-path-indexes.sql");
    for (const [name, table, def] of SERVING) {
      expect(m0008).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS "${name}"`));
      expect(declared(m0008, name, table)).toBe(squash(def));
    }
    expect(DEPLOY_MIGRATION_ORDER.map((m) => m.filename)).toContain("0008-cards-serving-path-indexes.sql");
  });
});

describe("import paths create the indexes", () => {
  it("canonicalIndexStatements yields every required index, idempotently", () => {
    const stmts = canonicalIndexStatements();
    for (const [name, table, def] of REQUIRED_INDEXES) {
      const s = stmts.find((x) => x.name === name);
      expect(s, `${name} missing from canonicalIndexStatements()`).toBeTruthy();
      expect(s!.sql).toMatch(/^CREATE (UNIQUE )?INDEX IF NOT EXISTS /);
      expect(declared(s!.sql + ";", name, table)).toBe(squash(def));
    }
  });

  it("the canonical statements build the serving indexes on a table that lacks them", () => {
    const db = new Database(":memory:");
    try {
      const ddl = read("db/schema.sqlite.sql");
      const cardsTable = ddl.match(/CREATE TABLE "cards"[\s\S]*?\n\);/)![0];
      db.exec(cardsTable);
      for (const s of canonicalIndexStatements({ tables: ["cards"] })) db.exec(s.sql);
      // Applying twice is a no-op, which is what lets import paths run them
      // after copying a source's own indexes.
      for (const s of canonicalIndexStatements({ tables: ["cards"] })) db.exec(s.sql);
      const names = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='cards'").all().map((r: any) => r.name);
      for (const [name, table] of REQUIRED_INDEXES) if (table === "cards") expect(names).toContain(name);
    } finally {
      db.close();
    }
  });

  it("scripts/import-to-bunny-db.mjs copies source indexes, applies the canonical set, and sends no ANALYZE", () => {
    const src = read("scripts/import-to-bunny-db.mjs");
    // The original defect: selecting only type='table' from sqlite_master.
    expect(src).toMatch(/type\s*=\s*'index'/i);
    expect(src).toMatch(/sql IS NOT NULL/i);
    expect(src).toMatch(/canonicalIndexStatements\(/);
    // Bunny answers ANALYZE with SQL_PARSE_ERROR; sending it would abort the
    // import after the data phase.
    expect(src).not.toMatch(/sql:\s*['"`]\s*ANALYZE/i);
  });

  for (const rel of ["tools/migrate/import.mjs", "tools/migrate/import-deck.mjs", "tools/migrate/generalized-import.mjs"]) {
    it(`${rel} creates the DDL's indexes and runs ANALYZE (local SQLite target)`, () => {
      const src = read(rel);
      expect(src).toMatch(/schema\.createIndexes/);
      expect(src.search(/["'`]\s*ANALYZE\s*["'`]/i), `${rel} never runs ANALYZE`).toBeGreaterThan(-1);
    });
  }
});

// The serving statements this guard pins. Each is planned on an empty
// database built from the canonical DDL with the libsql native module,
// whose SQLite (3.45.1) is the build Bunny Database runs. An empty
// database has no sqlite_stat1, which is exactly Bunny's situation.
type Fixture = { label: string; sql: string; args: (string | number | null)[] };
const FIXTURES: Fixture[] = JSON.parse(read("tests/migrate/fixtures/serving-path-statements.json"));
const EXPECTED_INDEX: Record<string, string> = {
  "name point read": "cards_name_trash_index",
  "type by name": "cards_name_trash_index",
  "layout names": "cards_name_trash_index",
  "read-rule party join": "cards_right_id_trash_index",
  "rule counts by right part": "cards_right_id_trash_index",
  "type names in use": "cards_right_id_trash_index",
  "coded cards": "cards_codename_present_index",
  "permission rule resolver": "cards_key_last_char_index",
};

function planAll(ddl: string): Map<string, string> {
  const db = new Libsql(":memory:");
  try {
    db.exec(ddl);
    const version = (db.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v;
    expect(version, "the planner check must run on Bunny's SQLite build").toBe("3.45.1");
    const plans = new Map<string, string>();
    for (const f of FIXTURES) {
      const rows = db.prepare("EXPLAIN QUERY PLAN " + f.sql).all(...f.args) as { detail: string }[];
      plans.set(f.label, rows.map((r) => r.detail).join(" | "));
    }
    return plans;
  } finally {
    db.close();
  }
}

describe("with no planner statistics, the serving statements avoid cards_trash_index", () => {
  const ddl = read("db/schema.sqlite.sql");
  const plans = planAll(ddl);

  it("the fixture covers every serving statement this guard names", () => {
    expect(FIXTURES.map((f) => f.label).sort()).toEqual(Object.keys(EXPECTED_INDEX).sort());
  });

  for (const [label, index] of Object.entries(EXPECTED_INDEX)) {
    it(`${label}: uses ${index}, never cards_trash_index`, () => {
      const plan = plans.get(label)!;
      expect(plan, plan).not.toMatch(/cards_trash_index/);
      expect(plan, plan).toMatch(new RegExp(`\\b${index}\\b`));
    });
  }

  for (const [name] of SERVING) {
    it(`removing ${name} sends at least one serving statement back to a worse plan`, () => {
      const without = ddl.replace(new RegExp(`^CREATE INDEX "${name}".*$`, "m"), "");
      expect(without).not.toBe(ddl);
      const degraded = planAll(without);
      const worse = [...degraded].filter(([label, plan]) => plan !== plans.get(label));
      expect(worse.length, `${name} changes no plan: it is not earning its write cost`).toBeGreaterThan(0);
    });
  }
});

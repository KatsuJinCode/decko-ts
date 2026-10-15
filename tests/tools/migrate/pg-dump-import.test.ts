// Importing a Ruby Decko PostgreSQL database from a plain-format pg_dump into
// a PostgreSQL deck (PGlite). The dump below is synthetic: the shape pg_dump
// writes for Ruby Decko's tables, with made-up rows.

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PostgresDriver } from "../../../src/server/drivers/postgres.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { convertValue, decodeCopyField, importPgDump, portTimestamp } from "../../../tools/migrate/pg-dump.mjs";

const SCHEMA = fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url));

const DUMP = [
  "--",
  "-- PostgreSQL database dump",
  "--",
  "SET statement_timeout = 0;",
  "CREATE TABLE public.cards (",
  "    id integer NOT NULL,",
  "    name character varying,",
  "    key character varying,",
  "    codename character varying,",
  "    left_id integer,",
  "    right_id integer,",
  "    current_revision_id integer,",
  "    created_at timestamp without time zone NOT NULL,",
  "    updated_at timestamp without time zone NOT NULL,",
  "    creator_id integer NOT NULL,",
  "    updater_id integer NOT NULL,",
  "    read_rule_class character varying,",
  "    read_rule_id integer,",
  "    references_expired integer,",
  "    trash boolean NOT NULL,",
  "    type_id integer NOT NULL,",
  "    db_content text",
  ");",
  "CREATE TABLE public.legacy_widgets (",
  "    id integer NOT NULL",
  ");",
  "COPY public.cards (id, name, key, codename, left_id, right_id, current_revision_id, created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, references_expired, trash, type_id, db_content) FROM stdin;",
  "1\tHome\thome\t\\N\t\\N\t\\N\t\\N\t2020-01-02 03:04:05\t2020-01-02 03:04:05.5\t1\t1\t\\N\t\\N\t\\N\tf\t3\tline one\\nline\\ttwo",
  "2\tOld\told\t\\N\t\\N\t\\N\t\\N\t2020-01-02 03:04:05.000000\t2020-01-02 03:04:05.123456\t1\t1\t\\N\t\\N\t\\N\tt\t3\t\\N",
  "\\.",
  "COPY public.legacy_widgets (id) FROM stdin;",
  "7",
  "\\.",
  "",
].join("\n");

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("pg_dump import", () => {
  it("decodes COPY text-format fields", () => {
    expect(decodeCopyField("\\N")).toBeNull();
    expect(decodeCopyField("a\\tb\\nc\\\\d")).toBe("a\tb\nc\\d");
    expect(decodeCopyField("\\101\\x42")).toBe("AB");
  });

  it("converts Ruby-on-PostgreSQL values to the port's storage", () => {
    expect(convertValue("boolean", "t")).toBe(1);
    expect(convertValue("boolean", "f")).toBe(0);
    expect(convertValue("integer", "42")).toBe(42);
    expect(portTimestamp("2020-01-02 03:04:05")).toBe("2020-01-02 03:04:05");
    expect(portTimestamp("2020-01-02 03:04:05.5")).toBe("2020-01-02 03:04:05.500000");
    expect(portTimestamp("2020-01-02 03:04:05.000000")).toBe("2020-01-02 03:04:05");
  });

  it("imports the port's tables into PostgreSQL and reports what it skipped", async () => {
    const dir = mkdtempSync(join(tmpdir(), "decko-pgdump-"));
    dirs.push(dir);
    const dumpPath = join(dir, "deck.sql");
    writeFileSync(dumpPath, DUMP);
    const driver = new PostgresDriver({ client: await PGlite.create() });
    try {
      const report = await importPgDump({ dumpPath, driver, schemaPath: SCHEMA });
      expect(report.imported).toEqual({ cards: 2 });
      expect(report.skippedTables).toEqual(["legacy_widgets"]);

      const rows = (await driver.query<Record<string, unknown>>("SELECT id, name, trash, created_at, updated_at, db_content FROM cards ORDER BY id", [])).rows;
      expect(rows).toEqual([
        { id: 1, name: "Home", trash: 0, created_at: "2020-01-02 03:04:05", updated_at: "2020-01-02 03:04:05.500000", db_content: "line one\nline\ttwo" },
        { id: 2, name: "Old", trash: 1, created_at: "2020-01-02 03:04:05", updated_at: "2020-01-02 03:04:05.123456", db_content: null },
      ]);

      // The engine reads the imported deck, and new cards take ids past it.
      const fetched = await new FetchEngine(driver).fetchByName("Home");
      expect(fetched?.id).toBe(1);
      const next = await driver.query(
        "INSERT INTO cards (name, key, created_at, updated_at, creator_id, updater_id, trash, type_id) VALUES ('New', 'new', 'x', 'x', 1, 1, 0, 3)",
        [],
      );
      expect(Number(next.lastInsertRowId)).toBe(3);
    } finally {
      await driver.close();
    }
  });
});

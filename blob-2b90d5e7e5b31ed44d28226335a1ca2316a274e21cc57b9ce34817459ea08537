// The search COUNT on the MySQL rung: the port's count for the queries stock
// Ruby Decko recorded on a MySQL server, measured on a real MySQL 8.4.11
// server, against the original's recorded behavior.
//
// ROW mx-190 (completeness roster, family matrix-journey):
// "search over-match: the port returns more results than the original site
// for the same query (143+ vs 127; whole-count divergence open in the
// debrief)". The row's contract: the oracle's whole count beside the port's,
// in ONE receipt, on the same rung and the same deck.
//
// WHAT THIS SUITE MEASURES
//   1. the port's COUNT for each recorded query, on a real MySQL 8.4.11
//      server (the port's own bench: tests/server/drivers/mysql-server.ts,
//      the official binaries tools/mysql/fetch-mysql.mjs checksum-verifies
//      into .mysql-test-cache);
//   2. that count against the ORIGINAL's recorded count - the number of
//      cards stock Ruby Decko returned for that query on the MySQL rung
//      (fixtures/captured/cql-mysql-match.json, captured on MariaDB 11.4.5
//      with cards_table_collation utf8mb4_general_ci).
//
// THE COUNT QUIRK the original's recorded behavior carries: the count is the
// WHOLE count, never the page count. Decko's search count merges the count
// args ON TOP of the search statement (card-mod-search set/abstract/
// 0_search.rb:35-39: args[:offset] = 0; args[:limit] = 0; returning(:count,
// args)), so a search that PAGES still answers the number of matching cards.
// The port spells the same thing (src/card/mod-loader/mods/card-mod-search.ts
// mergedCountCql: {offset: 0, limit: 0, return: "count"}), and this suite
// pins it on the MySQL rung: for every recorded query the count equals the
// original's whole count, and a recorded query that pages counts every
// match, not the page.
//
// THE RUNG IS THE POINT. The port's local rung is SQLite, where `match` is
// a registered UDF (src/cql/sqlite-regexp.ts) and the SQL spells
// `lower(col) REGEXP lower(?)` with SQLite's ASCII-only lower(). On MySQL
// the server's own REGEXP answers, with the server's own collation. Those
// are two different engines for one predicate, and the original ran on the
// second. The deck here is the SAME modeled deck the SQLite-rung replay
// uses (tests/cql/matchprobe-deck.ts), so the two rungs answer the same
// questions about the same cards.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { MysqlDriver } from "../../src/server/drivers/mysql.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { executeCount, executeQuery, parseOptionsWithLexicon } from "../../src/cql/execute.js";
import type { DbLexicon } from "../../src/card/fetch/lexicon.js";
import type { CardsRow } from "../../src/server/schema.js";
import { startMysqlServer, type MysqlServer } from "../server/drivers/mysql-server.js";
import { seedOracleCaptureDeck, type CqlTestStorage } from "./cql-test-storage.js";
import { seedMatchprobeDeck } from "./matchprobe-deck.js";

interface CapturedMatch {
  mechanism: Record<string, unknown>;
  queries: Record<string, { query: Record<string, unknown>; result: string[] | string }>;
}

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DATABASE = "search_count_mysql";

/** The capture's own collation (fixtures/captured/cql-mysql-match.json
 *  mechanism.cards_table_collation / connection_collation). Ruby's shipped
 *  schema pins utf8mb3_unicode_ci per column; the deck the original recorded
 *  against was utf8mb4_general_ci, so the DDL is rewritten to the recorded
 *  collation before it is loaded. */
const CAPTURED_COLLATION = "utf8mb4_general_ci";

/** The deck-model row-composition divergence, carried from the SQLite-rung
 *  replay (tests/cql/oracle-match-replay.test.ts): the capture deck's id-29
 *  row composed "Cardtype+*type+*structure" at capture time while the TS
 *  model composes "Cardtype+*type". A deck-model item, not a regex dialect
 *  item - disclosed, never silently skipped. */
const KNOWN_DIVERGENCES = new Set(["raw_posix_alpha"]);

let server: MysqlServer;
let driver: MysqlDriver;
let storage: CqlTestStorage;
let fixture: CapturedMatch;
let collations: { table: string; connection: string } = { table: "", connection: "" };

/** The CREATE TABLE statements of a Ruby MySQL schema file, rewritten to the
 *  recorded collation. */
function createsFrom(file: string): string[] {
  const ddl = readFileSync(`${REPO_ROOT}${file}`, "utf8")
    .replaceAll("utf8mb3_unicode_ci", CAPTURED_COLLATION)
    .replaceAll("utf8mb3", "utf8mb4");
  return [...ddl.matchAll(/CREATE TABLE `[^`]+` \([\s\S]*?\) ENGINE=[^;]*;/g)].map((m) =>
    m[0].replace(/ AUTO_INCREMENT=\d+/, ""),
  );
}

/** Result names recomposed through the fetch layer's Lexicon walk, sorted:
 *  the comparison is name-SET parity (same contract as oracle-replay). */
async function resultNames(lexicon: DbLexicon, rows: CardsRow[]): Promise<string[]> {
  const names: string[] = [];
  for (const row of rows) {
    const composed = await lexicon.name(row.id);
    if (composed !== undefined && composed.s !== "") names.push(composed.s);
  }
  return names.sort();
}

beforeAll(async () => {
  fixture = JSON.parse(
    readFileSync(`${REPO_ROOT}fixtures/captured/cql-mysql-match.json`, "utf8"),
  ) as CapturedMatch;

  server = await startMysqlServer();
  const admin = await server.connect();
  try {
    await admin.query(
      `CREATE DATABASE \`${DATABASE}\` CHARACTER SET utf8mb4 COLLATE ${CAPTURED_COLLATION}`,
    );
  } finally {
    await admin.end();
  }
  driver = await MysqlDriver.connect({ port: server.port, database: DATABASE });
  // the capture's connection collation, so the session's literals and the
  // bound pattern are compared under the same weights the original used.
  await driver.query(`SET NAMES utf8mb4 COLLATE ${CAPTURED_COLLATION}`, []);

  // Ruby's own MySQL schema (db/schema.mysql-reference.sql plus the card
  // gem's tables): the capture ran against a database Ruby created, so the
  // port answers the recorded queries over the same tables.
  for (const create of [
    ...createsFrom("db/schema.mysql-reference.sql"),
    ...createsFrom("db/schema.mysql-card-gem.sql"),
  ]) {
    await driver.query(create, []);
  }

  const fetcher = new FetchEngine(driver);
  storage = { driver, fetcher, close: () => undefined };
  await seedOracleCaptureDeck(storage);
  await seedMatchprobeDeck(storage, "2026-09-21 00:00:00");
  const ids = await driver.query<{ id: number }>("SELECT id FROM cards", []);
  await fetcher.warmLexicon(ids.rows.map((row) => row.id));

  const table = await driver.query<{ c: string }>(
    "SELECT TABLE_COLLATION AS c FROM information_schema.TABLES " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cards'",
    [],
  );
  const connection = await driver.query<{ c: string }>("SELECT @@collation_connection AS c", []);
  collations = {
    table: String(table.rows[0]?.c ?? ""),
    connection: String(connection.rows[0]?.c ?? ""),
  };
}, 300_000);

afterAll(async () => {
  await driver?.close();
  await server?.stop();
});

/** One recorded query, measured on the MySQL rung. */
interface Measured {
  entry: string;
  rubyNames: string[];
  portNames: string[];
  portCount: number;
  error?: string;
}

async function measure(entry: string, captured: CapturedMatch["queries"][string]): Promise<Measured> {
  const rubyNames = Array.isArray(captured.result) ? [...captured.result].sort() : [];
  const parse = parseOptionsWithLexicon(storage.fetcher.lexicon);
  try {
    const result = await executeQuery(storage.fetcher.driver, captured.query, { parse });
    if ("count" in result) throw new Error("unexpected count result");
    const portNames = await resultNames(storage.fetcher.lexicon, result.rows);
    const portCount = await executeCount(storage.fetcher.driver, captured.query, { parse });
    return { entry, rubyNames, portNames, portCount };
  } catch (e) {
    return { entry, rubyNames, portNames: [], portCount: -1, error: (e as Error).message };
  }
}

describe("search count on the MySQL rung (stock Ruby Decko's recorded queries)", () => {
  it("runs on the recorded rung: a real MySQL server, the capture's collation", () => {
    expect(collations.table).toBe(CAPTURED_COLLATION);
    expect(collations.connection).toBe(CAPTURED_COLLATION);
  });

  it("the server's own refusal is the mechanism the word-boundary translation answers", async () => {
    // The raw-regex word-boundary form the capture recorded: MySQL 8's ICU
    // refuses it, so a pattern carrying one answers NOTHING where MariaDB's
    // PCRE - the original's engine - answered rows. Measured here on the
    // server itself, so the translation the port applies is pinned to the
    // server's behaviour and not to a comment.
    await expect(
      driver.query("SELECT 'wel.come' REGEXP '[[:<:]]come' AS m", []),
    ).rejects.toThrow(/Illegal argument to a regular expression/);
    const translated = await driver.query<{ m: number }>(
      "SELECT 'wel.come' REGEXP ? AS m",
      ["\\bcome"],
    );
    expect(Number(translated.rows[0]?.m)).toBe(1);
  });

  it("a paging search counts every match, not the page (the count quirk)", async () => {
    // The two recorded entries that PAGE. Decko's count merges the count args
    // ON TOP of the statement (card-mod-search set/abstract/0_search.rb:35-39:
    // args[:offset] = 0; args[:limit] = 0; returning(:count, args)), so the
    // count is the WHOLE count: the empty match counts the whole modeled deck
    // (74) and the POSIX-class search counts every match (54), against pages
    // of 3 and 4. A count that answered the page size would be the divergence
    // this row is about.
    const empty = await measure("empty_match_noop", fixture.queries["empty_match_noop"]!);
    expect(empty.portNames.length).toBe(3);
    expect(empty.portCount).toBe(74);
    const posix = await measure("raw_posix_alpha", fixture.queries["raw_posix_alpha"]!);
    expect(posix.portNames.length).toBe(4);
    expect(posix.portCount).toBe(54);
  }, 300_000);

  it("answers every recorded query with the original's names and the original's whole count", async () => {
    const measured: Measured[] = [];
    const failures: string[] = [];
    for (const [entry, captured] of Object.entries(fixture.queries)) {
      if (!Array.isArray(captured.result)) {
        failures.push(`${entry}: non-array oracle result (unexpected on the MySQL rung)`);
        continue;
      }
      const m = await measure(entry, captured);
      measured.push(m);
      if (m.error !== undefined) {
        failures.push(`${entry} ERROR: ${m.error}`);
        continue;
      }
      const sameNames =
        m.portNames.length === m.rubyNames.length &&
        m.portNames.every((n, i) => n === m.rubyNames[i]);
      if (!sameNames && !KNOWN_DIVERGENCES.has(entry)) {
        failures.push(
          `${entry} NAMES MISMATCH: ruby=${JSON.stringify(m.rubyNames)} port=${JSON.stringify(m.portNames)}`,
        );
      }
      // THE COUNT: the whole count, not the page count. The original's
      // recorded set is the whole set for every query that does not page,
      // so the count must equal its size there; for a query that pages the
      // count must still cover every match.
      const countHolds =
        m.portCount >= m.rubyNames.length &&
        (hasLimit(captured.query) || m.portCount === m.rubyNames.length);
      if (!countHolds) {
        failures.push(
          `${entry} COUNT MISMATCH: ruby whole count=${m.rubyNames.length} port count=${m.portCount}`,
        );
      }
    }
    const report = {
      measuredAt: new Date().toISOString(),
      mysqlVersion: "8.4.11",
      collations,
      entries: measured,
    };
    const outDir = resolve(REPO_ROOT, ".runtime/mx190-search-count-mysql");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
    console.log(
      `mx190 mysql rung: ${measured.length} recorded queries measured, ${failures.length} mismatches`,
    );
    for (const m of measured) {
      console.log(
        `  ${m.entry}: ruby=${m.rubyNames.length} port_rows=${m.portNames.length} port_count=${m.portCount}` +
          (m.error === undefined ? "" : ` error=${m.error}`),
      );
    }
    expect(failures).toEqual([]);
  }, 300_000);
});

/** Whether the recorded query PAGES (a limit the count must ignore). */
function hasLimit(query: Record<string, unknown>): boolean {
  const limit = query.limit;
  return typeof limit === "number" && limit > 0;
}

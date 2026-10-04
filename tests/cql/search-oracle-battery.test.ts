// tests/cql/search-oracle-battery.test.ts — the SEMANTICS-parity search
// oracle pin (row8-parity-gaps). fixtures/captured/search-oracle-battery.json
// holds the frozen 11-query battery's result sets from the REAL Ruby CQL
// engine (Card.search, card 1.110.0 / decko 0.20.0, ruby 3.3.12, the booted
// oracle app) over a seeded "Search Oracle" corpus — plus the corpus rows
// themselves, captured by tools/oracle/search_oracle_capture.rb (the
// determinism contract lives there; two capture runs are sha256-identical).
//
// This closes the hole the four-parity inventory named (§B Missing #1:
// "no valid-JSON search result sets" — which cards a query matches, the
// core semantic, proven only on small captured batteries, never as a
// replayable JSON oracle). The replay path is the REAL execution entry —
// executeQuery (parseCql -> generateSql -> LocalSqliteDriver) — the same
// one tests/cql/oracle-replay.test.ts runs for the cql-basic battery.
//
// Normalization (both sides, documented in the capture): every query sorts
// by name; the comparison is name-SET parity with the sort/dir/limit shapes
// pinned through the sets they select (sort_desc_limit's two names are the
// desc-first pair; and_combo/not_name/left/right sets pin the junction and
// boolean semantics). `match` is excluded by capture (SQLite raises; the
// sentinel lives in cql-basic.json + the cql-mysql-match rung).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { executeQuery, parseOptionsWithLexicon } from "../../src/cql/execute.js";
import type { DbLexicon } from "../../src/card/fetch/lexicon.js";
import type { CardsRow } from "../../src/server/schema.js";
import { DeckoName } from "../../src/card/name.js";
import {
  createCqlTestStorage,
  type CqlTestStorage,
} from "./cql-test-storage.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

interface BatteryFixture {
  corpus: Array<{ name: string; type: string; content: string; created_by?: string }>;
  queries: Record<string, { query: Record<string, unknown>; result: string[] | string }>;
}

const FIXTURE = JSON.parse(
  readFileSync(`${REPO_ROOT}/fixtures/captured/search-oracle-battery.json`, "utf8"),
) as BatteryFixture;

/** Seed the fixture's corpus rows into a fresh in-memory storage. Ids are
 *  assigned deterministically; compound names get left/right rows (the
 *  right-part cards the Ruby deck materializes implicitly are seeded as
 *  Basic rows so right_id ties resolve). */
async function seedCorpus(storage: CqlTestStorage): Promise<void> {
  const rows: Array<{
    id: number;
    name: string;
    key: string | null;
    leftId: number | null;
    rightId: number | null;
    typeId: number;
    dbContent: string | null;
    creatorId: number;
  }> = [];
  const idByName = new Map<string, number>();
  let nextId = 7600;
  const KIND_ID = 7599; // the "Search Oracle Kind" cardtype card
  const typeIdByName = new Map<string, number>([
    ["Search Oracle Kind", KIND_ID],
    ["Basic", 1],
    ["User", 10],
  ]);

  // the cardtype card itself
  rows.push({
    id: KIND_ID,
    name: "Search Oracle Kind",
    key: "search_oracle_kind",
    leftId: null,
    rightId: null,
    typeId: 3,
    dbContent: null,
    creatorId: 1,
  });
  idByName.set("Search Oracle Kind", KIND_ID);

  for (const entry of FIXTURE.corpus) {
    if (idByName.has(entry.name)) continue;
    const id = nextId++;
    idByName.set(entry.name, id);
    const compound = entry.name.includes("+");
    const typeId = typeIdByName.get(entry.type) ?? 2;
    rows.push({
      id,
      name: entry.name,
      key: compound ? null : DeckoName.parse(entry.name).key,
      leftId: null,
      rightId: null,
      typeId,
      dbContent: entry.content === "" ? null : entry.content,
      creatorId: entry.created_by !== undefined ? -1 : 1, // patched below
    });
  }
  // right-part cards the junction names imply (Basic, as Ruby materializes)
  for (const entry of FIXTURE.corpus) {
    if (!entry.name.includes("+")) continue;
    const [leftName, rightName] = entry.name.split("+");
    if (!idByName.has(rightName)) {
      const id = nextId++;
      idByName.set(rightName, id);
      rows.push({
        id,
        name: rightName,
        key: DeckoName.parse(rightName).key,
        leftId: null,
        rightId: null,
        typeId: 1,
        dbContent: null,
        creatorId: 1,
      });
    }
    const row = rows.find((r) => r.name === entry.name);
    row!.leftId = idByName.get(leftName)!;
    row!.rightId = idByName.get(rightName)!;
  }
  // creator patch: the created_by target ("Search Oracle Author")
  const authorId = idByName.get("Search Oracle Author");
  for (const row of rows) {
    const corpusEntry = FIXTURE.corpus.find((c) => c.name === row.name);
    if (corpusEntry?.created_by !== undefined && authorId !== undefined) {
      row.creatorId = authorId;
    }
  }

  const insert =
    "INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, " +
    "created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, " +
    "references_expired, trash, type_id, db_content) " +
    "VALUES (?, ?, ?, NULL, ?, ?, NULL, '2026-10-03 00:00:00.000', '2026-10-03 00:00:00.000', " +
    "?, 1, NULL, NULL, NULL, 0, ?, ?)";
  for (const row of rows.sort((a, b) => a.id - b.id)) {
    await storage.driver.query(insert, [
      row.id,
      row.name,
      row.key,
      row.leftId,
      row.rightId,
      row.creatorId,
      row.typeId,
      row.dbContent,
    ]);
  }
}

/** Result names recomposed through the fetch layer's Lexicon walk (the
 *  compound rows come back with NULL name columns), sorted — the same
 *  normalization the oracle-replay replay pins. */
async function resultNames(lexicon: DbLexicon, rows: CardsRow[]): Promise<string[]> {
  const names: string[] = [];
  for (const row of rows) {
    const composed = await lexicon.name(row.id);
    if (composed !== undefined && composed.s !== "") names.push(composed.s);
  }
  return names.sort();
}

async function warmDeckLexicon(storage: CqlTestStorage): Promise<void> {
  const result = await storage.driver.query<{ id: number }>("SELECT id FROM cards", []);
  await storage.fetcher.warmLexicon(result.rows.map((row) => row.id));
}

describe("search oracle battery: semantics parity (11/11 vs the Ruby CQL engine)", () => {
  it("byte-compares every battery query's result set against the Ruby recording", async () => {
    const storage = await createCqlTestStorage();
    try {
      await seedCorpus(storage);
      await warmDeckLexicon(storage);
      const parse = parseOptionsWithLexicon(storage.fetcher.lexicon);

      const failures: string[] = [];
      for (const [label, captured] of Object.entries(FIXTURE.queries)) {
        expect(Array.isArray(captured.result)).toBe(true); // every battery entry carries a real result set
        const result = await executeQuery(storage.fetcher.driver, captured.query, { parse });
        if (!("rows" in result)) {
          failures.push(`${label}: unexpected count return`);
          continue;
        }
        const actual = await resultNames(storage.fetcher.lexicon, result.rows as CardsRow[]);
        const expected = [...(captured.result as string[])].sort();
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          failures.push(
            `${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`,
          );
        }
      }
      expect(failures).toEqual([]);
    } finally {
      storage.close();
    }
  });
});

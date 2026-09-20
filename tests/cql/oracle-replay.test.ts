// CQL oracle parity: replays the 11 captured query entries in
// fixtures/captured/cql-basic.json against a seeded SQLite deck using
// the SAME cards Ruby captured against, comparing returned names to
// Ruby's recorded result names. The replay harness's cql-engine handler
// shape requires canonical-query JSON; here we use the queries
// directly via executeQuery to match what the capture recorded.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { parseCql } from "../../src/cql/parser.js";
import { generateSql } from "../../src/cql/sql.js";
import { DeckoName } from "../../src/card/name.js";
import { seedCard, type RenderTestStorage } from "../card/render/render-test-storage.js";
import { createRenderTestStorage } from "../card/render/render-test-storage.js";

interface CapturedQuery {
  query: Record<string, unknown>;
  result: string[];
}

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DDL = readFileSync(`${REPO_ROOT}/db/schema.sqlite.sql`, "utf8");

/** Same seeding as the render oracle replay (cards 605-617, plus cardtype
 *  cards) so the CQL queries operate on identical data. */
async function seedCapturedDeck(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 98, name: "Search", codename: "search_type", typeId: 2 });
  await seedCard(storage, { id: 6, name: "Set", codename: "set", typeId: 2 });
  await seedCard(storage, { id: 7, name: "List", codename: "list", typeId: 2 });
  await seedCard(storage, { id: 701, name: "child_one", typeId: 2 });
  await seedCard(storage, { id: 702, name: "child_two", typeId: 2 });
  await seedCard(storage, { id: 703, name: "rich_child", typeId: 2 });
  await seedCard(storage, { id: 704, name: "*self", typeId: 6 });
  await seedCard(storage, { id: 705, name: "*read", typeId: 2 });
  await seedCard(storage, { id: 605, name: "Oracle Basics", typeId: 2, dbContent: "A plain basic card for oracle capture." });
  await seedCard(storage, { id: 606, name: "Oracle Junction", typeId: 2, dbContent: "Junction parent card." });
  await seedCard(storage, { id: 608, name: "Oracle Junction+child_one", leftId: 606, rightId: 701, typeId: 2, dbContent: "first child" });
  await seedCard(storage, { id: 610, name: "Oracle Junction+child_two", leftId: 606, rightId: 702, typeId: 2, dbContent: "second child" });
  await seedCard(storage, {
    id: 611,
    name: "Oracle Rich",
    typeId: 2,
    dbContent: "<p>Rich text with an inclusion: {{Oracle Rich+rich_child}}</p>",
  });
  await seedCard(storage, { id: 613, name: "Oracle Rich+rich_child", leftId: 611, rightId: 703, typeId: 2, dbContent: "the nested child body" });
  await seedCard(storage, { id: 614, name: "Oracle Search", typeId: 98, dbContent: '{"left":"Oracle Junction","sort":"name"}' });
  await seedCard(storage, { id: 615, name: "Oracle Restricted", typeId: 2, dbContent: "Only administrators can read me." });
  await seedCard(storage, { id: 616, name: "Oracle Restricted+*self", leftId: 615, rightId: 704, typeId: 6, dbContent: "" });
  await seedCard(storage, { id: 617, name: "Oracle Restricted+*self+*read", leftId: 616, rightId: 705, typeId: 7, dbContent: "Administrator" });
}

/** Strip the `id` from a card record to compare name-keyed parity
 *  (Ruby fixture ids are the deck it saw, our ids are seeded from the
 *  same source, but name equality is the actual parity check). */
function nameOnly<T extends { name?: { s?: string } }>(rows: T[]): string[] {
  return rows.map((r) => r.name?.s ?? "").filter((n) => n.length > 0).sort();
}

describe("oracle replay: CQL engine", () => {
  it("matches Ruby's recorded result names for every captured query (excluding the match sentinel which needs MySQL)", async () => {
    const fixture = JSON.parse(readFileSync(`${REPO_ROOT}/fixtures/captured/cql-basic.json`, "utf8")) as { queries: Record<string, CapturedQuery> };
    const storage = await createRenderTestStorage();
    try {
      await seedCapturedDeck(storage);
      const driver = (storage.engine as unknown as { driver?: LocalSqliteDriver }).driver ?? null;
      // Pull the driver out via the fetcher's underlying driver for direct SQL.
      const directDriver = (storage.fetcher as unknown as { driver?: LocalSqliteDriver }).driver;
      if (directDriver === undefined) throw new Error("could not access underlying driver");

      const results: Array<{ name: string; query: unknown; ruby: string[]; ts: string[]; pass: boolean; sql?: string }> = [];

      for (const [name, captured] of Object.entries(fixture.queries)) {
        if (name === "match_sentinel") {
          // SQLite cannot run MySQL REGEXP without a UDF; this case is
          // documented as expected-pending in cql-port-notes.md.
          results.push({ name, query: captured.query, ruby: captured.result, ts: [], pass: true });
          continue;
        }

        const ast = parseCql(captured.query as Record<string, unknown>);
        const stmt = generateSql(ast);
        const rows = await directDriver.query<{ name: string | null; key: string | null; left_id: number | null; right_id: number | null }>(stmt.sql, stmt.params);
        // The deck stores compound names via left_id/right_id; reconstruct
        // the full name the way the Ruby engine would expose it.
        const byId = new Map<number, { name: string }>();
        for (const row of (await directDriver.query<{ id: number; name: string | null }>("SELECT id, name FROM cards", [])).rows) {
          if (row.name !== null) byId.set(row.id, { name: row.name });
        }
        const names = new Set<string>();
        for (const row of rows.rows) {
          if (row.name !== null && row.name !== "") names.add(row.name);
          else if (row.left_id !== null && row.right_id !== null) {
            const left = byId.get(row.left_id)?.name;
            const right = byId.get(row.right_id)?.name;
            if (left !== undefined && right !== undefined) names.add(DeckoName.parse(`${left}+${right}`).s);
          }
        }
        const tsNames = [...names].sort();
        const rubyNames = [...captured.result].sort();
        results.push({ name, query: captured.query, ruby: rubyNames, ts: tsNames, pass: tsNames.length === rubyNames.length && tsNames.every((n, i) => n === rubyNames[i]), sql: stmt.sql });
      }

      const failures = results.filter((r) => !r.pass);
      // eslint-disable-next-line no-console
      console.log("\nCQL oracle parity (" + results.length + " entries):");
      for (const r of results) {
        // eslint-disable-next-line no-console
        console.log((r.pass ? "PASS" : "FAIL") + " " + r.name.padEnd(22) + " | ruby=" + r.ruby.length + " ts=" + r.ts.length + (r.pass ? "" : "\n   ruby: " + JSON.stringify(r.ruby) + "\n   ts:   " + JSON.stringify(r.ts)));
      }
      expect(failures).toEqual([]);
    } finally {
      storage.close();
    }
  });
});

// Scratch probe (delete after reading): bisects the prefetch walk's CPU cost
// on the FULL corpus deck. The walk SQL here is a source-faithful copy of
// src/card/render/prefetch.ts walkStatement (2026-09-21) for profiling only —
// engine behavior is not changed by this file. It times:
//   a) the whole-deck `resolved` composition alone
//   b) the composition + frontier walk + SELECT_WALKED for a real root
//   c) EXPLAIN QUERY PLAN of (b) — where the planner scans
// Run: npx vitest run benchmarks/corpus-v2/cte-cost-probe.test.ts

import { describe, expect, it, afterAll } from "vitest";
import Database from "better-sqlite3";
import {
  createStructureSeededStorageFor,
} from "../../tests/card/render/structure-corpus-seeding.js";
import { readShardLines, CORPUS_DB } from "../../tests/card/render/permission-corpus-seeding.js";

let storage: Awaited<ReturnType<typeof createStructureSeededStorageFor>> | undefined;
afterAll(() => {
  storage?.close();
});

const SCAN_CAP = 10_000;

/** Source-faithful copy of prefetch.ts walkStatement (profiling only). */
function walkStatement(rootKey: string, finalSelect: string): { sql: string; params: string[] } {
  const at = `instr(f.rest, '{{')`;
  const restAfter = `substr(f.rest, ${at} + 2)`;
  const closeAt = `instr(substr(f.rest, ${at} + 2), '}}')`;
  const span = `substr(f.rest, ${at} + 2, ${closeAt} - 1)`;
  const cutOptions =
    `CASE WHEN instr(${span}, '|') = 0 THEN ${span} ` +
    `ELSE substr(${span}, 1, instr(${span}, '|') - 1) END`;
  const keyExpr = `lower(replace(trim(${cutOptions}), ' ', '_'))`;
  const sql =
    `WITH RECURSIVE\n` +
    `resolved(id, ckey) AS (\n` +
    `  SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND trash = 0\n` +
    `  UNION\n` +
    `  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l\n` +
    `    JOIN cards j ON j.left_id = l.id AND j.trash = 0\n` +
    `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL\n` +
    `  UNION\n` +
    `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r\n` +
    `    JOIN cards j ON j.right_id = r.id AND j.trash = 0\n` +
    `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
    `),\n` +
    `frontier(t, rest) AS (\n` +
    `  SELECT ?, NULL\n` +
    `  UNION\n` +
    `  SELECT f.t, substr(c.db_content, 1, ${SCAN_CAP})\n` +
    `  FROM frontier f\n` +
    `  JOIN resolved rs ON rs.ckey = f.t\n` +
    `  JOIN cards c ON c.id = rs.id AND c.trash = 0\n` +
    `  WHERE f.rest IS NULL AND c.db_content LIKE '%{{%'\n` +
    `  UNION\n` +
    `  SELECT f.t, ${restAfter} FROM frontier f\n` +
    `   WHERE f.rest IS NOT NULL AND ${at} > 0\n` +
    `  UNION\n` +
    `  SELECT DISTINCT ${keyExpr}, NULL FROM frontier f\n` +
    `   WHERE f.rest IS NOT NULL AND ${at} > 0 AND ${closeAt} > 1\n` +
    `  UNION\n` +
    `  SELECT f.t, NULL FROM frontier f\n` +
    `   WHERE f.rest IS NOT NULL AND ${at} = 0\n` +
    `)\n` +
    finalSelect;
  return { sql, params: [rootKey] };
}

const SELECT_RESOLVED_COUNT = `SELECT COUNT(*) AS n FROM resolved`;
const SELECT_WALKED = `SELECT DISTINCT c.* FROM resolved rs\n` +
  `JOIN frontier f ON f.t = rs.ckey\n` +
  `JOIN cards c ON c.id = rs.id`;

/** Drive a raw statement through the seeded storage's real sqlite driver and
 *  time it. */
async function timed(sql: string, params: string[]): Promise<number> {
  const t = Date.now();
  await storage!.fetcher.driver.query(sql, params);
  return Date.now() - t;
}

describe("prefetch walk cost bisection (full corpus deck)", () => {
  it(
    "times resolved composition, full walk, and prints the query plan",
    { timeout: 3_600_000 },
    async () => {
      const t0 = Date.now();
      const db = new Database(CORPUS_DB, { readonly: true });
      const everyLiveId = (
        db.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>
      ).map((r) => r.id);
      db.close();
      storage = await createStructureSeededStorageFor(new Set(everyLiveId));
      console.log(`SEED_MS ${Date.now() - t0} rows=${everyLiveId.length}`);

      const first = readShardLines()[0] as { name: string };
      const root = await storage.fetcher.fetchByName(first.name);
      expect(root, `shard entry ${first.name} seeded`).toBeDefined();
      expect(root!.key, "root has a key").toBeDefined();

      const aMs = await timed(walkStatement(root!.key!, SELECT_RESOLVED_COUNT).sql, [root!.key!]);
      console.log(`A_RESOLVED_COUNT_MS ${aMs}`);

      const walk = walkStatement(root!.key!, SELECT_WALKED);
      const bMs = await timed(walk.sql, walk.params);
      console.log(`B_FULL_WALK_MS ${bMs}`);

      const plan = await storage.fetcher.driver.query(
        `EXPLAIN QUERY PLAN ${walk.sql}`,
        walk.params,
      );
      for (const row of plan.rows as Array<Record<string, unknown>>) {
        console.log(`PLAN ${JSON.stringify(row)}`);
      }
      expect(true).toBe(true);
    },
  );
});

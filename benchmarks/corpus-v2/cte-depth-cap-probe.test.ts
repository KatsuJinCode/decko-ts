// Scratch probe (delete after reading): times the prefetch walk's `resolved`
// composition at bounded composition DEPTHS on the full corpus deck. The
// unbounded composition is the measured CPU bomb (the pair lattice of dense
// rule/taxonomy junctions); a depth cap bounds the materialized (row, key)
// pairs while the JS fallback rounds keep correctness past the cap
// (prefetch.ts mechanism 3: "Correctness never depends on the SQL
// extraction"). Times each cap's composition + the full walk for a real
// corpus root, and counts composed rows per cap.
//
// Run: npx vitest run benchmarks/corpus-v2/cte-depth-cap-probe.test.ts

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

/** walkStatement with a depth-bounded resolved closure (source-faithful to
 *  prefetch.ts apart from the depth column + cap — the profiling variant). */
function boundedWalk(
  rootKey: string,
  maxDepth: number,
  finalSelect: string,
): { sql: string; params: string[] } {
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
    `resolved(id, ckey, d) AS (\n` +
    `  SELECT id, "key", 1 FROM cards WHERE "key" IS NOT NULL AND trash = 0\n` +
    `  UNION\n` +
    `  SELECT j.id, l.ckey || '+' || r."key", l.d + 1 FROM resolved l\n` +
    `    JOIN cards j ON j.left_id = l.id AND j.trash = 0\n` +
    `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL\n` +
    `   WHERE l.d < ${maxDepth}\n` +
    `  UNION\n` +
    `  SELECT j.id, l."key" || '+' || r.ckey, r.d + 1 FROM resolved r\n` +
    `    JOIN cards j ON j.right_id = r.id AND j.trash = 0\n` +
    `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
    `   WHERE r.d < ${maxDepth}\n` +
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

async function timed(sql: string, params: string[]): Promise<number> {
  const t = Date.now();
  await storage!.fetcher.driver.query(sql, params);
  return Date.now() - t;
}

describe("depth-capped resolved composition cost (full corpus deck)", () => {
  it(
    "times bounded compositions and walks per depth cap",
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

      for (const cap of [2, 3, 4, 6, 8]) {
        const countStmt = boundedWalk(root!.key!, cap, SELECT_RESOLVED_COUNT);
        const countMs = await timed(countStmt.sql, countStmt.params);
        const walkStmt = boundedWalk(root!.key!, cap, SELECT_WALKED);
        const walkMs = await timed(walkStmt.sql, walkStmt.params);
        console.log(
          `CAP ${cap}: composed-count ${countMs} ms, full walk ${walkMs} ms`,
        );
      }
      expect(true).toBe(true);
    },
  );
});

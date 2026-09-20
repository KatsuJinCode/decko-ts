// TEMPORARY profiling harness for the uniform-slow-corpus-render defect
// (render-fix stream). Not a landing gate; deleted once the mechanism is
// named and fixed. READ-ONLY on fixtures; mirrors the seeding of
// benchmarks/corpus-v2/diagnose-slow-entry.test.ts but renders a SUBSET and
// attributes time to SQL vs JS, per statement, and detects prefetch re-runs.
//
// Run: npx vitest run tests/card/render/slow-entry-profiling.test.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { splitSqlStatements, seedCard } from "./render-test-storage.js";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine, UnsupportedViewError } from "../../../src/card/render.js";
import type { CardsRow } from "../../../src/server/schema.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const CORPUS_DB = path.join(REPO_ROOT, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3");
const SHARD_DIR = path.join(REPO_ROOT, "fixtures", "corpus");

interface ShardLine {
  id: number;
  name: string;
  views?: Record<string, string>;
  error?: unknown;
}

/** Driver wrapper: counts + times every query/batch (SQL ms), keeps a
 *  statement log with durations for the slowest-statement report. */
class TimingDriver implements SQLDatabaseDriver {
  sqlMs = 0;
  queries = 0;
  readonly log: Array<{ sql: string; ms: number; params: string }> = [];
  constructor(private readonly inner: SQLDatabaseDriver) {}
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const t0 = performance.now();
    const result = await this.inner.query<T>(sql, params);
    const ms = performance.now() - t0;
    this.sqlMs += ms;
    this.queries += 1;
    this.log.push({ sql, ms, params: JSON.stringify(params).slice(0, 120) });
    return result;
  }
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    const t0 = performance.now();
    const result = await this.inner.batch(statements);
    const ms = performance.now() - t0;
    this.sqlMs += ms;
    this.queries += 1;
    for (const s of statements) {
      this.log.push({ sql: s.sql, ms, params: JSON.stringify(s.params).slice(0, 120) });
    }
    return result;
  }
  reset(): void {
    this.sqlMs = 0;
    this.queries = 0;
    this.log.length = 0;
  }
}

async function buildSeededEngine(seedLimit: number | undefined): Promise<{
  engine: RenderEngine;
  timing: TimingDriver;
  lines: ShardLine[];
  close: () => void;
  contentChars: number;
  contentCount: number;
}> {
  const shardName = "shard-000000.jsonl";
  const lines: ShardLine[] = readFileSync(path.join(SHARD_DIR, shardName), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as ShardLine);
  const effective = seedLimit === undefined ? lines : lines.slice(0, seedLimit);

  const sqlite = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(`${REPO_ROOT}/db/schema.sqlite.sql`, "utf8");
  for (const statement of splitSqlStatements(ddl)) await sqlite.query(statement, []);
  const timing = new TimingDriver(sqlite);
  const fetcher = new FetchEngine(timing);
  const engine = new RenderEngine(fetcher);

  const corpus = new Database(CORPUS_DB, { readonly: true });
  const ids = effective.map((l) => l.id);
  const rows: Array<{
    id: number; name: string | null; codename: string | null;
    left_id: number | null; right_id: number | null; trash: number;
    type_id: number; content: string | null;
  }> = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    rows.push(...(corpus.prepare(
      `SELECT id, name, codename, left_id, right_id, trash, type_id, content FROM cards WHERE id IN (${chunk.map(() => "?").join(",")})`
    ).all(...chunk) as typeof rows));
  }
  const typeIds = [...new Set(rows.map((r) => r.type_id))];
  const missing = typeIds.filter((t) => !ids.includes(t));
  if (missing.length > 0) {
    rows.push(...(corpus.prepare(
      `SELECT id, name, codename, left_id, right_id, trash, type_id, content FROM cards WHERE id IN (${missing.map(() => "?").join(",")})`
    ).all(...missing) as typeof rows));
  }
  corpus.close();
  for (const row of rows) {
    await seedCard(
      { engine, fetcher, counting: timing, close: () => sqlite.close() } as unknown as Parameters<typeof seedCard>[0],
      {
        id: row.id, name: row.name ?? undefined, codename: row.codename,
        leftId: row.left_id ?? undefined, rightId: row.right_id ?? undefined,
        trash: row.trash === 1, typeId: row.type_id, dbContent: row.content,
      },
    );
  }
  const contentRows = rows.filter((r) => typeof r.content === "string");
  return {
    engine,
    timing,
    lines: effective,
    close: () => sqlite.close(),
    contentChars: contentRows.reduce((a, r) => a + (r.content as string).length, 0),
    contentCount: contentRows.length,
  };
}

function topStatements(timing: TimingDriver, n: number): string {
  // collapse identical SQL shapes by first 60 chars of the text
  const shapes = new Map<string, { count: number; totalMs: number; sample: string }>();
  for (const entry of timing.log) {
    const key = entry.sql.slice(0, 80).replace(/\s+/g, " ");
    const current = shapes.get(key) ?? { count: 0, totalMs: 0, sample: entry.sql.slice(0, 300) };
    current.count += 1;
    current.totalMs += entry.ms;
    shapes.set(key, current);
  }
  return [...shapes.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, n)
    .map((s) => `    x${s.count} total=${s.totalMs.toFixed(1)}ms :: ${s.sample.replace(/\s+/g, " ").slice(0, 200)}`)
    .join("\n");
}

describe("profile: uniform slow corpus renders", () => {
  it(
    "attributes per-entry time on shard 0 subset (SQL vs JS, prefetch re-runs, slowest statements)",
    { timeout: 900_000 },
    async () => {
      const seeded = await buildSeededEngine(undefined); // full shard 0, like the diagnostic
      const { engine, timing, lines, close, contentChars, contentCount } = seeded;
      try {
        const withViews = lines.filter((l) => l.views);
        console.log(`seeded ${contentCount} content rows, ${contentChars} content chars total`);
        const viewEntries: Array<{ name: string; view: string }> = [];
        for (const line of withViews) {
          for (const view of Object.keys(line.views as Record<string, string>)) {
            viewEntries.push({ name: line.name, view });
          }
        }
        console.log(`total view entries on shard: ${viewEntries.length}`);
        // SUBSET: every 27th entry -> ~120 renders, spread across the shard.
        const subset = viewEntries.filter((_, i) => i % 27 === 0).slice(0, 120);
        console.log(`rendering subset of ${subset.length} entries...`);

        const timings: Array<{ id: string; ms: number; sqlMs: number; stats: string; err?: string }> = [];
        for (const { name, view } of subset) {
          timing.reset();
          const t0 = performance.now();
          let err: string | undefined;
          try {
            await engine.render(name, view);
          } catch (e) {
            err = e instanceof UnsupportedViewError ? "unsupported-view" : (e as Error).message.slice(0, 80);
          }
          const ms = performance.now() - t0;
          const stats = engine.lastRenderStats;
          timings.push({
            id: `${name}:${view}`,
            ms,
            sqlMs: timing.sqlMs,
            stats: stats ? `b=${stats.batches} st=${stats.statements} fb=${stats.fallbackRounds} cards=${stats.cards}` : "none",
            err,
          });
        }
        const ok = timings.filter((t) => !t.err);
        const avg = ok.reduce((a, t) => a + t.ms, 0) / Math.max(ok.length, 1);
        const avgSql = ok.reduce((a, t) => a + t.sqlMs, 0) / Math.max(ok.length, 1);
        const sorted = [...timings].sort((a, b) => b.ms - a.ms);
        console.log(`\n=== SUBSET RESULT: ${timings.length} entries, errs=${timings.length - ok.length}`);
        console.log(`avg=${avg.toFixed(1)}ms  avgSQL=${avgSql.toFixed(1)}ms  (JS share ~${(100 - (100 * avgSql) / Math.max(avg, 0.01)).toFixed(0)}%)`);
        console.log("TOP 8 SLOWEST:");
        for (const t of sorted.slice(0, 8)) {
          console.log(`  ${t.ms.toFixed(1)}ms (sql ${t.sqlMs.toFixed(1)}ms) [${t.stats}] ${JSON.stringify(t.id.slice(0, 90))}${t.err ? " ERR:" + t.err : ""}`);
        }
        console.log("FASTEST 3:");
        for (const t of [...timings].sort((a, b) => a.ms - b.ms).slice(0, 3)) {
          console.log(`  ${t.ms.toFixed(1)}ms (sql ${t.sqlMs.toFixed(1)}ms) [${t.stats}] ${JSON.stringify(t.id.slice(0, 90))}`);
        }

        // ---- warm behavior: re-render the FIRST entry --------------------
        const first = subset[0] as { name: string; view: string };
        timing.reset();
        const w0 = performance.now();
        let warmStats = "none";
        try {
          await engine.render(first.name, first.view);
          const stats = engine.lastRenderStats;
          warmStats = stats ? `b=${stats.batches} st=${stats.statements} fb=${stats.fallbackRounds} cards=${stats.cards}` : "none";
        } catch (e) {
          warmStats = "ERR " + (e as Error).message.slice(0, 80);
        }
        const warmMs = performance.now() - w0;
        console.log(`\n=== WARM RE-RENDER of ${JSON.stringify(first)}: ${warmMs.toFixed(1)}ms, driver calls=${timing.queries}, sql=${timing.sqlMs.toFixed(1)}ms, stats=${warmStats}`);

        // ---- slowest individual SQL shapes across the run ----------------
        // Re-run the slowest entry once more with the statement log intact.
        const slowest = sorted[0];
        const slowestEntry = subset.find(({ name, view }) => `${name}:${view}` === slowest.id);
        if (slowestEntry !== undefined) {
          timing.reset();
          try {
            await engine.render(slowestEntry.name, slowestEntry.view);
          } catch { /* ignore */ }
          console.log(`\n=== STATEMENT SHAPES for re-run of ${JSON.stringify(slowest.id)} (driver total ${timing.sqlMs.toFixed(1)}ms):`);
          console.log(topStatements(timing, 12));
        }

        // ---- EXPLAIN QUERY PLAN of the walk for a representative root ----
        const root = withViews[0];
        if (root !== undefined) {
          const record = await engine.fetcher.fetchByName(root.name);
          if (record?.key !== undefined) {
            const rootKey = record.key;
            // Rebuild the walk SQL exactly as prefetch.ts does (kept in sync by
            // copy; this is a temporary diagnostic).
            const CAP = 10_000;
            const rawSpan = `substr(c.db_content, n.n + 2, instr(substr(c.db_content, n.n + 2), '}}') - 1)`;
            const cutOptions = `CASE WHEN instr(${rawSpan}, '|') = 0 THEN ${rawSpan} ELSE substr(${rawSpan}, 1, instr(${rawSpan}, '|') - 1) END`;
            const keyExpr = `lower(replace(trim(${cutOptions}), ' ', '_'))`;
            const walkSql =
              `WITH RECURSIVE\nnums(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM nums WHERE n < ${CAP}),\n` +
              `frontier(key) AS (\n  SELECT ?\n  UNION\n  SELECT DISTINCT ${keyExpr}\n  FROM frontier f\n  JOIN cards c ON c.\"key\" = f.key AND c.trash = 0\n  JOIN nums n\n    ON n.n + 3 <= length(c.db_content)\n   AND substr(c.db_content, n.n, 2) = '{{'\n   AND instr(substr(c.db_content, n.n + 2), '}}') > 1\n)\n` +
              `SELECT c.* FROM cards c JOIN frontier f ON c.\"key\" = f.\"key\" AND c.trash = 0`;
            const t0 = performance.now();
            const walked = await timing.query(walkSql, [rootKey]);
            const walkMs = performance.now() - t0;
            console.log(`\n=== WALK-1 direct timing for root key ${JSON.stringify(rootKey)}: ${walkMs.toFixed(1)}ms, rows=${walked.rows.length}`);
            const plan = await timing.query(`EXPLAIN QUERY PLAN ${walkSql}`, [rootKey]);
            console.log("EXPLAIN QUERY PLAN (walk):");
            for (const row of plan.rows as Array<Record<string, unknown>>) {
              console.log(`   ${JSON.stringify(row)}`);
            }
            // how many cards did the frontier reach? (count rows of frontier)
            const frontierCount = await timing.query(
              `WITH RECURSIVE\nnums(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM nums WHERE n < ${CAP}),\n` +
              `frontier(key) AS (\n  SELECT ?\n  UNION\n  SELECT DISTINCT ${keyExpr}\n  FROM frontier f\n  JOIN cards c ON c.\"key\" = f.key AND c.trash = 0\n  JOIN nums n\n    ON n.n + 3 <= length(c.db_content)\n   AND substr(c.db_content, n.n, 2) = '{{'\n   AND instr(substr(c.db_content, n.n + 2), '}}') > 1\n)\nSELECT COUNT(*) AS n FROM frontier`,
              [rootKey],
            );
            console.log(`frontier size for ${JSON.stringify(rootKey)}: ${JSON.stringify((frontierCount.rows[0] as { n: number }).n)}`);
            // content-length distribution of walked rows
            const lens = (walked.rows as CardsRow[])
              .map((r) => (r.db_content ?? "").length)
              .sort((a, b) => b - a);
            if (lens.length > 0) {
              const total = lens.reduce((a, b) => a + b, 0);
              console.log(`walked rows content: max=${lens[0]} p90=${lens[Math.floor(lens.length * 0.1)]} median=${lens[Math.floor(lens.length / 2)]} total=${total}`);
            }
          }
        }
        expect(timings.length).toBeGreaterThan(0);
      } finally {
        close();
      }
    },
  );
});

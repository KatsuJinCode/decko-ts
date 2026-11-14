// keymap-lane DIAGNOSIS probe (2026-09-23): rows-read accounting for the
// full-universe compound-key CTE ("WITH RECURSIVE resolved").
//
// Measures, per deck, per render — nothing here edits engine or schema:
//   A) cf-scale deck (deploy/cf-scale-deck/seed.sql, 2,279 cards — the deck
//      the D1 re-test numbers came from), booted exactly like the tests
//      (db/schema.sqlite.sql + LocalSqliteDriver + CountingRenderDriver):
//        - cold-engine render of the depth-32 junction chain root,
//          a plain page, a pointer page, a denied page
//        - warm re-render on the same engine instance
//        for each: statements issued, WITH RECURSIVE statements, rows
//        returned, wall ms — plus the SQL head of every CTE statement so
//        the call path is visible in the output.
//   B) exact universe sizes: COUNT(*) over a source-faithful copy of the
//      `resolved` closure (the cte-cost-probe precedent) on BOTH decks,
//      plus EXPLAIN QUERY PLAN of the walk. better-sqlite3 exposes no
//      scan-status, so local rows-READ is reported as its exact
//      components: (CTE executions per render) x (universe rows per
//      execution) + returned rows; the D1-exact meta.rows_read before/after
//      is the lead's remote re-test window (X-Render-Metrics rowsRead=).
//
// Run: npx vitest run benchmarks/corpus-v2/keymap-lane-probes-2026-09/cte-rows-read-probe.test.ts

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { splitSqlStatements } from "../../../tests/card/render/render-test-storage.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const SCALE_SEED = path.join(REPO_ROOT, "deploy", "cf-scale-deck", "seed.sql");
const CORPUS_DB = path.join(REPO_ROOT, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3");

// --- counting driver (statement text capture + rows returned) -------------

interface Call {
  sql: string;
  rows: number;
  viaBatch: boolean;
}

class KeymapProbeDriver implements SQLDatabaseDriver {
  readonly calls: Call[] = [];
  constructor(private readonly inner: SQLDatabaseDriver) {}
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const result = await this.inner.query<T>(sql, params);
    this.calls.push({ sql, rows: result.rows.length, viaBatch: false });
    return result;
  }
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    const results = await this.inner.batch(statements);
    statements.forEach((s, i) =>
      this.calls.push({ sql: s.sql, rows: results[i]?.rows.length ?? 0, viaBatch: true }),
    );
    return results;
  }
  snapshot(sinceIndex = 0): {
    statements: number;
    recursiveCte: number;
    rowsReturned: number;
    batchCalls: number;
  } {
    let statements = 0;
    let recursiveCte = 0;
    let rowsReturned = 0;
    let batchCalls = 0;
    for (let i = sinceIndex; i < this.calls.length; i++) {
      const call = this.calls[i]!;
      statements += 1;
      if (call.sql.includes("WITH RECURSIVE")) recursiveCte += 1;
      rowsReturned += call.rows;
      if (call.viaBatch) batchCalls += 1;
    }
    return { statements, recursiveCte, rowsReturned, batchCalls };
  }
  mark(): number {
    return this.calls.length;
  }
  cteHeads(sinceIndex: number): string[] {
    return this.calls
      .slice(sinceIndex)
      .filter((c) => c.sql.includes("WITH RECURSIVE"))
      .map((c) => `${c.rows} rows | ${c.sql.slice(0, 72).replace(/\s+/g, " ")}`);
  }
}

// --- source-faithful `resolved` universe (prefetch.ts:168-178 copy) --------

const RESOLVED_UNIVERSE_SQL =
  `WITH RECURSIVE resolved(id, ckey) AS (\n` +
  `  SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND trash = 0\n` +
  `  UNION\n` +
  `  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l\n` +
  `    JOIN cards j ON j.left_id = l.id AND +j.trash = 0\n` +
  `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL\n` +
  `  UNION\n` +
  `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r\n` +
  `    JOIN cards j ON j.right_id = r.id AND +j.trash = 0\n` +
  `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
  `)\n` +
  `SELECT COUNT(*) AS n FROM resolved`;

// --- source-faithful NEW resolver (read-rules.ts resolveRuleIdsByKeys) ------

function segments_join(segs: string[], i: number, j: number): string {
  return segs.slice(i, j + 1).join("+");
}

function fragmentResolverSql(fragmentCount: number, keyCount: number): string {
  const fragParams = Array.from({ length: fragmentCount }, () => "?").join(", ");
  const keyParams = Array.from({ length: keyCount }, () => "?").join(", ");
  return (
    `WITH RECURSIVE resolved(id, ckey) AS (
` +
    `  SELECT id, "key" FROM cards WHERE "key" COLLATE NOCASE IN (${fragParams}) AND +trash = 0
` +
    `  UNION
` +
    `  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l
` +
    `    JOIN cards j ON j.left_id = l.id AND +j.trash = 0
` +
    `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL
` +
    `   WHERE (l.ckey || '+' || r."key") IN (${fragParams})
` +
    `  UNION
` +
    `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r
` +
    `    JOIN cards j ON j.right_id = r.id AND +j.trash = 0
` +
    `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL
` +
    `   WHERE (l."key" || '+' || r.ckey) IN (${fragParams})
` +
    `)
` +
    `SELECT rs.ckey, rs.id FROM resolved rs WHERE rs.ckey IN (${keyParams})`
  );
}

/** Source-faithful walkStatement root for EQP (prefetch.ts walkStatement,
 *  rootKey param inlined as ?). Only the SELECT_WALKED shape is needed. */
function walkSqlForEqp(): string {
  return (
    `WITH RECURSIVE\n` +
    `resolved(id, ckey) AS (\n` +
    `  SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND trash = 0\n` +
    `  UNION\n` +
    `  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l\n` +
    `    JOIN cards j ON j.left_id = l.id AND +j.trash = 0\n` +
    `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL\n` +
    `  UNION\n` +
    `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r\n` +
    `    JOIN cards j ON j.right_id = r.id AND +j.trash = 0\n` +
    `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
    `),\n` +
    `frontier(t, rest) AS (\n` +
    `  SELECT ?, NULL\n` +
    `  UNION ALL\n` +
    `  SELECT f.t, substr(c.db_content, 1, 10000)\n` +
    `  FROM frontier f\n` +
    `  JOIN resolved rs ON rs.ckey = f.t\n` +
    `  JOIN cards c ON c.id = rs.id AND c.trash = 0\n` +
    `  WHERE f.rest IS NULL AND c.db_content LIKE '%{{%'\n` +
    `)\n` +
    `SELECT COUNT(*) AS n FROM frontier`
  );
}

interface DeckFacts {
  cards: number;
  liveCards: number;
  junctions: number;
  universeRows: number;
  universeMs: number;
  missingStoredReadRule: number;
  readRuleCards: number;
}

async function deckFacts(driver: SQLDatabaseDriver): Promise<DeckFacts> {
  const one = async (sql: string): Promise<number> => {
    const r = await driver.query<{ n: number }>(sql, []);
    return Number((r.rows[0] as { n: number } | undefined)?.n ?? 0);
  };
  const t0 = Date.now();
  const universeRows = await one(RESOLVED_UNIVERSE_SQL);
  const universeMs = Date.now() - t0;
  return {
    cards: await one(`SELECT COUNT(*) AS n FROM cards`),
    liveCards: await one(`SELECT COUNT(*) AS n FROM cards WHERE trash = 0`),
    junctions: await one(
      `SELECT COUNT(*) AS n FROM cards WHERE trash = 0 AND name IS NULL AND left_id IS NOT NULL AND right_id IS NOT NULL`,
    ),
    universeRows,
    universeMs,
    missingStoredReadRule: await one(
      `SELECT COUNT(*) AS n FROM cards WHERE trash = 0 AND read_rule_id IS NULL`,
    ),
    readRuleCards: await one(
      `SELECT COUNT(*) AS n FROM cards WHERE trash = 0 AND right_id = (SELECT id FROM cards WHERE codename = 'read' AND trash = 0 ORDER BY id LIMIT 1)`,
    ),
  };
}

// --- Part A: the cf-scale deck ---------------------------------------------

let scaleDriver: LocalSqliteDriver | undefined;
let scaleProbe: KeymapProbeDriver | undefined;
let scaleEngine: RenderEngine | undefined;
afterAll(() => {
  scaleDriver?.close();
});

async function bootScaleDeck(): Promise<void> {
  scaleDriver = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(path.join(REPO_ROOT, "db", "schema.sqlite.sql"), "utf8");
  for (const statement of splitSqlStatements(ddl)) await scaleDriver.query(statement, []);
  const seed = readFileSync(SCALE_SEED, "utf8");
  for (const statement of splitSqlStatements(seed)) await scaleDriver.query(statement, []);
  scaleProbe = new KeymapProbeDriver(scaleDriver);
  const fetcher = new FetchEngine(scaleProbe);
  scaleEngine = new RenderEngine(fetcher);
}

/** Cold engine = fresh RenderEngine over the SAME probe driver (fresh
 *  per-request engine semantics; the driver keeps all calls for accounting). */
function freshEngine(): RenderEngine {
  const fetcher = new FetchEngine(scaleProbe!);
  return new RenderEngine(fetcher);
}

describe("keymap-lane: full-universe resolved CTE rows-read accounting", () => {
  it(
    "A) cf-scale deck renders: statements, recursive CTEs, returned rows",
    { timeout: 600_000 },
    async () => {
      await bootScaleDeck();
      const facts = await deckFacts(scaleDriver!);
      console.log(
        `[scale-deck] cards=${facts.cards} live=${facts.liveCards} junctions=${facts.junctions}` +
          ` universeRows=${facts.universeRows} (universeMs=${facts.universeMs})` +
          ` missingStoredReadRule=${facts.missingStoredReadRule} readRuleCards=${facts.readRuleCards}`,
      );

      const plainEngine = scaleEngine!;
      const chainEngine = freshEngine();
      const pointerEngine = freshEngine();
      const deniedEngine = freshEngine();
      const renderCase = async (label: string, name: string, view: string, engine: RenderEngine) => {
        const t0 = Date.now();
        const mark = scaleProbe!.mark();
        let error: string | undefined;
        try {
          await engine.render(name, view);
        } catch (e) {
          error = (e as Error).message;
        }
        const snap = scaleProbe!.snapshot(mark);
        console.log(
          `[render ${label}] ${name}:${view} wallMs=${Date.now() - t0}` +
            ` statements=${snap.statements} recursiveCte=${snap.recursiveCte}` +
            ` rowsReturned=${snap.rowsReturned} batches=${snap.batchCalls}` +
            (error !== undefined ? ` ERROR=${error.slice(0, 120)}` : ""),
        );
        if (label === "chain-root-cold") {
          for (const head of scaleProbe!.cteHeads(mark)) console.log(`  CTE ${head}`);
        }
      };

      await renderCase("plain-cold", "Scale Page 1x", "open", plainEngine);
      await renderCase("plain-warm", "Scale Page 1x", "open", plainEngine);
      await renderCase("chain-root-cold", "Depth Root", "open", chainEngine);
      await renderCase("chain-root-warm", "Depth Root", "open", chainEngine);
      await renderCase("pointer-cold", "Big Pointer", "open", pointerEngine);
      await renderCase("denied-cold", "Restricted Page 1", "open", deniedEngine);
      expect(true).toBe(true);
    },
  );

  it(
    "B) cf-scale walk EQP + corpus deck universe facts",
    { timeout: 600_000 },
    async () => {
      // EQP of the walk on the scale deck (fresh driver, DDL only + seed).
      const driver = new LocalSqliteDriver({ path: ":memory:" });
      try {
        const ddl = readFileSync(path.join(REPO_ROOT, "db", "schema.sqlite.sql"), "utf8");
        for (const statement of splitSqlStatements(ddl)) await driver.query(statement, []);
        const seed = readFileSync(SCALE_SEED, "utf8");
        for (const statement of splitSqlStatements(seed)) await driver.query(statement, []);
        const eqp = await driver.query(
          `EXPLAIN QUERY PLAN ${walkSqlForEqp()}`,
          ["depth_root"],
        );
        for (const row of eqp.rows as Array<Record<string, unknown>>) {
          console.log(`[scale-eqp] ${JSON.stringify(row)}`);
        }
        const universe = await driver.query<{ n: number }>(RESOLVED_UNIVERSE_SQL, []);
        console.log(`[scale-universe] rows=${universe.rows[0]?.n}`);

        // AFTER: the fragment-restricted resolver (read-rules.ts copy) -
        // functional check on rule-style keys of the depth chain + EQP.
        const fragKeys = ["chain_depth+*type+*read", "depth_root+*self+*read"];
        const fragSet = new Set<string>();
        for (const key of fragKeys) {
          const segs = key.split("+");
          for (let i = 0; i < segs.length; i++) {
            for (let j = i; j < segs.length; j++) {
              fragSet.add(segments_join(segs, i, j));
            }
          }
        }
        const fragList = [...fragSet];
        const resolverSql = fragmentResolverSql(fragList.length, fragKeys.length);
        const t1 = Date.now();
        const resolved = await driver.query<{ ckey: string; id: number }>(
          resolverSql,
          [...fragList, ...fragList, ...fragList, ...fragKeys],
        );
        console.log(
          `[resolver-after] keys=${fragKeys.length} fragments=${fragList.length}` +
            ` rowsOut=${resolved.rows.length} ms=${Date.now() - t1}`,
        );
        const eqpAfter = await driver.query(`EXPLAIN QUERY PLAN ${resolverSql}`, [
          ...fragList,
          ...fragList,
          ...fragList,
          ...fragKeys,
        ]);
        for (const row of eqpAfter.rows as Array<Record<string, unknown>>) {
          console.log(`[resolver-eqp] ${JSON.stringify(row)}`);
        }
      } finally {
        driver.close();
      }

      // Corpus deck facts (read-only file; the replay-seeded working deck
      // mirrors this shape).
      const corpus = new Database(CORPUS_DB, { readonly: true });
      try {
        const raw = (sql: string): unknown[] => corpus.prepare(sql).all() as unknown[];
        const n = (sql: string): number =>
          Number((corpus.prepare(sql).get() as { n: number } | undefined)?.n ?? 0);
        const live = n(`SELECT COUNT(*) AS n FROM cards WHERE trash = 0`);
        const junctions = n(
          `SELECT COUNT(*) AS n FROM cards WHERE trash = 0 AND name IS NULL AND left_id IS NOT NULL AND right_id IS NOT NULL`,
        );
        const missingStored = n(
          `SELECT COUNT(*) AS n FROM cards WHERE trash = 0 AND read_rule_id IS NULL`,
        );
        const readRules = n(
          `SELECT COUNT(*) AS n FROM cards WHERE trash = 0 AND right_id = (SELECT id FROM cards WHERE codename = 'read' AND trash = 0 ORDER BY id LIMIT 1)`,
        );
        const t0 = Date.now();
        const universeRows = raw(RESOLVED_UNIVERSE_SQL).length;
        console.log(
          `[corpus-deck] live=${live} junctions=${junctions}` +
            ` missingStoredReadRule=${missingStored} readRuleCards=${readRules}` +
            ` universeRows=${universeRows} (universeMs=${Date.now() - t0})`,
        );
        expect(live).toBeGreaterThan(0);
      } finally {
        corpus.close();
      }
    },
  );
});

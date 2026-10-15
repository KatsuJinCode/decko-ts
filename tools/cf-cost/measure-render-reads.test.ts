// measure-render-reads.test.ts — D1 read-cost proof harness for the
// BINARY key/codename lookup indexes (cards_key_binary_index,
// cards_codename_binary_index; diagnosis in db/schema.sqlite.sql cards block
// and deploy/migrations/0002-card-text-binary-lookup-indexes.sql).
//
// Run:  npx vitest run tools/cf-cost/measure-render-reads.test.ts
//
// WHAT IT DOES — boots the REAL engine over the Cloudflare targeted deck
// exactly like the verify-targeted-deck suite (not in the public package)
// (LocalSqliteDriver -> splitSqlStatements(db/schema.sqlite.sql) ->
// deploy/cf-scale-deck/seed.sql -> FetchEngine -> RenderEngine), in THREE
// phases on separate scratch databases:
//   BEFORE            — current schema MINUS the two new binary indexes
//                       (statements filtered by name; the only delta).
//   AFTER-IDX         — current schema verbatim (what a fresh D1 gets).
//   AFTER-IDX+ANALYZE — same, plus ANALYZE after seed (planner stats on).
//
// MEASUREMENT HONESTY (stated plainly): LocalSqliteDriver/better-sqlite3
// expose NO rows-examined counter (no sqlite3_stmt_scanstatus binding —
// verified absent in better-sqlite3 13.0.3), so every rows-read number here
// is EXPLAIN QUERY PLAN plan-shape PLUS documented upper-bound accounting —
// NOT telemetry. Validation against real rows_read happens outside this
// harness, over a live deployment's metrics. Accounting convention: rows-matched per plan
// component, x1, aligned to D1 rows_read (the live insight "key=? read
// 2,279" equals COUNT(trash=0)=2,279 on this deck). Components: rowid PK
// seek = 1; unique-index equality = 1; non-unique index probe = measured
// COUNT(predicate) on the seeded deck; SCAN = table row count. Known
// approximation: a few tiny join probes (left_id/right_id/referer_id, <=2
// matched rows on this deck, one ~51-row referer probe) have ambiguous
// parameter positions and are estimated, never the dominant term.
//
// BYTE-PARITY GUARD: indexes can change row visitation order (this repo has
// an index-induced planner incident on record in prefetch.ts), so every
// phase renders the battery PLUS all compound-junction pages PLUS the large
// content card and asserts SHA-256-identical output across phases.
//
// WRITE-SIDE ACCOUNTING: after the read phases, the harness measures the
// 0002 backfill cost on a COPY of the corpus deck (the shared
// benchmarks/corpus-v2 sqlite is never opened for writing): cards row count,
// CREATE INDEX duration per index, and per-index entry counts via dbstat
// when the build exposes it. Ongoing import cost is arithmetic from the
// schema: each cards INSERT maintains 2 extra index b-trees (+2 rows_written
// per card on the d1-chunker import path; SQLite indexes NULL keys too).
//
// Artifacts: tools/cf-cost/measure-render-reads-results.json (numbers only;
// no corpus content — the data rule is absolute).

import { existsSync, readFileSync, rmSync, copyFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { FetchEngine } from "../../src/card/fetch.js";
import { RenderEngine } from "../../src/card/render.js";
import { splitSqlStatements } from "../../tools/migrate/import.mjs";
import { registerSqliteRegexpFunction } from "../../src/cql/sqlite-regexp.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SEED = readFileSync(join(REPO, "deploy", "cf-scale-deck", "seed.sql"), "utf8");
const SCHEMA = readFileSync(join(REPO, "db", "schema.sqlite.sql"), "utf8");
const CORPUS_DB = join(REPO, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3");
const CORPUS_COPY = join(REPO, "tmp", "corpus-copy-for-backfill-measure.sqlite3");

// The exact DDL added to db/schema.sqlite.sql (+ 0002 for already-
// provisioned D1 databases). BEFORE-phase = schema with these filtered out.
const NEW_INDEX_NAMES = ["cards_key_binary_index", "cards_codename_binary_index"];

interface Captured { sql: string; params: unknown[] }

class CountingDriver extends LocalSqliteDriver {
  log: Captured[] = [];
  recording = false;
  async query<T = unknown>(sql: string, params: unknown[]): Promise<{ rows: T[]; rowsAffected: number }> {
    if (this.recording) this.log.push({ sql, params });
    return super.query<T>(sql, params);
  }
  async batch(statements: { sql: string; params: unknown[] }[]) {
    if (this.recording) for (const s of statements) this.log.push({ sql: s.sql, params: s.params });
    return super.batch(statements);
  }
}

const BATTERY: { label: string; card: string; expect: string }[] = [
  { label: "home", card: "Home", expect: "Cloudflare targeted-test deck home" },
  { label: "point-read (Scale Page 173x)", card: "Scale Page 173x", expect: "Scale page 173." },
  // The seeded chain runs 32 levels; Ruby's subformat limit (max_depth 20,
  // card-1.110.0 format/error.rb:33-40, pinned by nest-depth-limit.test.ts)
  // ends rendering mid-chain, and under load the exact cut varies — so the
  // assertion anchors on the root's own bytes, which always render, while the
  // deep levels still exercise the nesting in the read accounting.
  { label: "depth-32 chain (Depth Root)", card: "Depth Root", expect: "Depth level 0 nests its child:" },
  { label: "500-item pointer (Big Pointer)", card: "Big Pointer", expect: "Scale Page 500x" },
  { label: "CQL list (All Scale Page Probe)", card: "All Scale Page Probe", expect: "Scale Page" },
  { label: "denied (Restricted Page 7)", card: "Restricted Page 7", expect: "denied" },
  { label: "large content (Large Doc 1)", card: "Large Doc 1", expect: "Large content card 1." },
];

function schemaForPhase(withNewIndexes: boolean): string {
  if (withNewIndexes) return SCHEMA;
  // drop exactly the new CREATE INDEX statements — the ONLY before/after delta
  return SCHEMA.split("\n")
    .filter((line) => !NEW_INDEX_NAMES.some((n) => line.includes(`"${n}"`)))
    .join("\n");
}

async function boot(dbPath: string, withNewIndexes: boolean, runAnalyze: boolean) {
  rmSync(dbPath, { force: true });
  const driver = new CountingDriver({ path: dbPath });
  for (const statement of splitSqlStatements(schemaForPhase(withNewIndexes))) {
    await driver.query(statement, []);
  }
  for (const statement of SEED.split(";\n").map((s) => s.trim()).filter(Boolean)) {
    await driver.query(statement, []);
  }
  if (withNewIndexes) for (const n of NEW_INDEX_NAMES) {
    const present = (await driver.query(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='index' AND name = ?", [n])).rows[0].c;
    expect(Number(present)).toBe(1); // the phase's schema really carries (or lacks) the DDL
  }
  if (runAnalyze) await driver.query("ANALYZE", []);
  // production parity: CQL statements reference REGEXP; the CQL execution
  // stream registers this UDF on the local driver before first prepare.
  registerSqliteRegexpFunction(driver);
  const fetcher = new FetchEngine(driver);
  const render = new RenderEngine(fetcher);
  return { driver, render };
}

interface StatementAccount {
  sql: string; plan: string; execs: number;
  estRowsEach: number; estRowsTotal: number; basis: string;
}

async function accountRender(driver: CountingDriver, html: string, label: string, expected: string) {
  expect(html).toContain(expected);
  const captured = driver.log;
  driver.log = [];
  const bySql = new Map<string, { execs: number; params: unknown[] }>();
  for (const c of captured) {
    const e = bySql.get(c.sql);
    if (e) e.execs++;
    else bySql.set(c.sql, { execs: 1, params: c.params });
  }
  const tableSizes = new Map<string, number>();
  for (const t of ["cards", "card_references", "card_actions", "card_changes", "card_acts"]) {
    tableSizes.set(t, Number(
      (await driver.query(`SELECT COUNT(*) AS c FROM ${t}`, [])).rows[0].c));
  }
  const uniqueIndexes = new Map<string, boolean>();
  const idxTables = new Map<string, string>();
  const leadingCol = new Map<string, string>();
  for (const t of ["cards", "card_references"]) {
    for (const r of (await driver.query(
      `SELECT name, "unique" AS u FROM pragma_index_list('${t}')`, [])).rows) {
      uniqueIndexes.set(r.name as string, Boolean(r.u));
      idxTables.set(r.name as string, t);
      const col = (await driver.query(
        `SELECT name FROM pragma_index_info('${String(r.name)}') ORDER BY seqno LIMIT 1`, [])).rows[0]?.name;
      // An expression index has no named leading column (pragma_index_info
      // reports NULL); it is accounted below as an upper bound, not probed.
      if (col !== null && col !== undefined) leadingCol.set(r.name as string, String(col));
    }
  }
  const countCache = new Map<string, number>();
  const probeCount = async (table: string, col: string, value: unknown): Promise<number> => {
    const key = `${table}.${col}=${String(value)}`;
    let c = countCache.get(key);
    if (c === undefined) {
      c = Number((await driver.query(
        `SELECT COUNT(*) AS c FROM ${table} WHERE "${col}" = ?`, [value])).rows[0].c);
      countCache.set(key, c);
    }
    return c;
  };
  const accounts: StatementAccount[] = [];
  let totalRows = 0;
  for (const [sql, info] of bySql) {
    const planRows = (await driver.query(`EXPLAIN QUERY PLAN ${sql}`, info.params)).rows;
    const detail = planRows.map((r) => r.detail).join(" | ");
    const parts: string[] = [];
    let estEach = 0;
    if (/USING INTEGER PRIMARY KEY/.test(detail)) { estEach += 1; parts.push("pk=1"); }
    for (const m of detail.matchAll(/USING (?:COVERING )?INDEX (\S+?) \((.+?)\)/g)) {
      const idx = m[1].replace(/"/g, "");
      if (uniqueIndexes.get(idx) && !detail.includes(" AS ")) {
        estEach += 1; parts.push(`uniq(${idx})=1`);
      } else {
        const table = idxTables.get(idx) ?? "cards";
        if (idxTables.has(idx) && !leadingCol.has(idx)) {
          const size = tableSizes.get(table) ?? 0;
          estEach += size; parts.push(`${idx}(expression)<=${size}`);
          continue;
        }
        const col = leadingCol.get(idx) ?? "id";
        // trash is a LITERAL in engine SQL (" AND trash = 0"); bound params feed
        // the seek columns, which take params[0] in every inventoried shape.
        let value: unknown;
        const lit = new RegExp(`${col}\\s*(?:=|is)\\s*(false|true|\\d+)`, "i").exec(sql);
        if (lit) value = lit[1] === "false" ? 0 : lit[1] === "true" ? 1 : Number(lit[1]);
        else value = info.params[0];
        const count = await probeCount(table, col, value);
        estEach += count; parts.push(`${idx}.${col}=${String(value)}=${count}`);
      }
    }
    for (const s of detail.matchAll(/SCAN ("?\w+"?)\b/g)) {
      const t = s[1].replace(/"/g, "");
      const size = tableSizes.get(t) ?? 0;
      estEach += size; parts.push(`SCAN(${t})=${size}`);
    }
    const basis = parts.join(" + ") || `no table access: ${detail.slice(0, 60)}`;
    accounts.push({ sql, plan: detail, execs: info.execs, estRowsEach: estEach, estRowsTotal: estEach * info.execs, basis });
    totalRows += estEach * info.execs;
  }
  accounts.sort((a, b) => b.estRowsTotal - a.estRowsTotal);
  return { label, statements: captured.length, estRows: totalRows, top: accounts.slice(0, 6) };
}

// data-slot-id is SecureRandom.hex(10) PER RENDER (src/card/render/slot-html.ts:36;
// pointer-list.ts:280 documents the oracle's "RANDOMIZED" normalization) — it
// differs between any two renders regardless of indexes, and it appears with
// BOTH double quotes (content views) and single quotes (CQL bar items).
// Parity hashing normalizes it; every other byte must match.
function normalizeForParity(html: string): string {
  return html.replace(/data-slot-id=["'][0-9a-f]*["']/g, 'data-slot-id=NORMALIZED');
}

interface PhaseResult {
  phase: string;
  statsPresent: boolean;
  results: Awaited<ReturnType<typeof accountRender>>[];
  hashes: Record<string, string>;
  stmtCounts: Record<string, number>;
  sizes: { cards: number; refs: number };
  indexes: string[];
}

async function runPhase(dbPath: string, phase: string, withNewIndexes: boolean, runAnalyze: boolean): Promise<PhaseResult> {
  const { driver, render } = await boot(dbPath, withNewIndexes, runAnalyze);
  const statsPresent = Number((await driver.query(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='sqlite_stat1'", [])).rows[0].c) > 0;
  const hashes: Record<string, string> = {};
  const stmtCounts: Record<string, number> = {};
  const results: Awaited<ReturnType<typeof accountRender>>[] = [];
  // fixed render order, identical across phases: battery, then every compound
  // junction page, resolved from the deck itself (same seed -> same pages)
  for (const item of BATTERY) {
    driver.log = [];
    driver.recording = true;
    const html = await render.render(item.card, "content");
    driver.recording = false;
    hashes[item.label] = createHash("sha256").update(normalizeForParity(html)).digest("hex");
    const acc = await accountRender(driver, html, item.label, item.expect);
    stmtCounts[item.label] = acc.statements;
    results.push(acc);
  }
  const compounds = (await driver.query(
    `SELECT l.name AS ln, r.name AS rn FROM cards c ` +
    `JOIN cards l ON l.id = c.left_id JOIN cards r ON r.id = c.right_id ` +
    `WHERE c.name IS NULL AND c.left_id IS NOT NULL AND c.right_id IS NOT NULL`, [])).rows;
  for (const row of compounds) {
    const page = `junction ${row.ln}+${row.rn}`;
    const html = await render.render(`${row.ln}+${row.rn}`, "content");
    hashes[page] = createHash("sha256").update(normalizeForParity(html)).digest("hex");
    stmtCounts[page] = -1; // junction pages: byte-parity is the assertion, not accounting
  }
  const sizes = {
    cards: Number((await driver.query("SELECT COUNT(*) AS c FROM cards", [])).rows[0].c),
    refs: Number((await driver.query("SELECT COUNT(*) AS c FROM card_references", [])).rows[0].c),
  };
  const indexes = (await driver.query(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='cards' ORDER BY name", [])).rows.map((r) => r.name);
  driver.close();
  return { phase, statsPresent, results, hashes, stmtCounts, sizes, indexes };
}

async function measureBackfillOnCorpusCopy() {
  // the shared corpus sqlite is NEVER opened for writing: copy first
  rmSync(CORPUS_COPY, { force: true });
  copyFileSync(CORPUS_DB, CORPUS_COPY);
  const { createRequire } = await import("node:module");
  const req = createRequire(join(REPO, "package.json"));
  const Database = req("better-sqlite3");
  const db = new Database(CORPUS_COPY);
  const cards = Number(db.prepare("SELECT COUNT(*) AS c FROM cards").get().c);
  const refs = Number(db.prepare("SELECT COUNT(*) AS c FROM card_references").get().c);
  const alreadyThere = db.prepare(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='index' AND name IN ('cards_key_binary_index','cards_codename_binary_index')").get().c;
  const timings: { index: string; ms: number; entries: number | null }[] = [];
  let dbstatUsable = true;
  try { db.prepare("SELECT 1 FROM dbstat LIMIT 1").get(); } catch { dbstatUsable = false; }
  for (const [name, ddl] of [
    ["cards_key_binary_index", `CREATE UNIQUE INDEX IF NOT EXISTS "cards_key_binary_index" ON "cards" ("key")`],
    ["cards_codename_binary_index", `CREATE UNIQUE INDEX IF NOT EXISTS "cards_codename_binary_index" ON "cards" ("codename")`],
  ] as const) {
    if (Number(alreadyThere) > 0 && db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = ?").get(name).c > 0) {
      timings.push({ index: name, ms: 0, entries: null }); // copy already carried it
      continue;
    }
    const t0 = performance.now();
    db.exec(ddl);
    const ms = Math.round(performance.now() - t0);
    let entries: number | null = null;
    if (dbstatUsable) {
      try {
        entries = Number(db.prepare(
          "SELECT SUM(ncell) AS n FROM dbstat WHERE name = ?").get(name).n);
      } catch { dbstatUsable = false; }
    }
    timings.push({ index: name, ms, entries });
  }
  db.close();
  return { cards, refs, timings, dbstatUsable, copyBytes: statSync(CORPUS_COPY).size };
}

describe("cf-cost measure-render-reads (D1 index fix proof)", () => {
  it("before vs after: read accounting, byte parity, write accounting", async () => {
    const before = await runPhase(join(REPO, "tmp", "cf-cost-before.sqlite3"), "BEFORE", false, false);
    const afterIdx = await runPhase(join(REPO, "tmp", "cf-cost-after-idx.sqlite3"), "AFTER-IDX", true, false);
    const afterAnalyze = await runPhase(join(REPO, "tmp", "cf-cost-after-analyze.sqlite3"), "AFTER-IDX+ANALYZE", true, true);

    const table = BATTERY.map((b, i) => ({
      render: b.label,
      stmts: before.results[i].statements,
      rows_BEFORE: before.results[i].estRows,
      rows_AFTER_IDX: afterIdx.results[i].estRows,
      rows_AFTER_IDX_ANALYZE: afterAnalyze.results[i].estRows,
    }));
    console.log("\n=== ROWS-READ PER RENDER — EQP plan-shape + upper-bound accounting (NOT telemetry) ===");
    console.log(`deck: cards=${before.sizes.cards} card_references=${before.sizes.refs}`);
    console.log(`planner stats: BEFORE sqlite_stat1=${before.statsPresent ? "present" : "absent"}, ` +
      `AFTER-IDX=${afterIdx.statsPresent ? "present" : "absent"}, ` +
      `AFTER-IDX+ANALYZE=${afterAnalyze.statsPresent ? "present" : "absent"}`);
    console.log("BEFORE plans chosen WITHOUT stats; AFTER-IDX plans chosen WITHOUT stats (indexes only); " +
      "AFTER-IDX+ANALYZE plans chosen WITH stats. Remote validation of real rows_read happens against the deployed D1 database, outside this tree.");
    console.table(table);
    for (const [phase, run] of [["BEFORE", before], ["AFTER-IDX", afterIdx], ["AFTER-IDX+ANALYZE", afterAnalyze]] as const) {
      for (const r of run.results) {
        console.log(`\n--- ${phase}: ${r.label} (stmts=${r.statements}, est rows=${r.estRows})`);
        for (const s of r.top) console.log(`  x${s.execs} [${s.basis}] ${s.sql.slice(0, 100)}`);
      }
    }

    // ADDENDUM (1): byte parity across phases — indexes must not change a byte
    const pages = Object.keys(before.hashes);
    let parityChecked = 0;
    for (const page of pages) {
      expect(afterIdx.hashes[page], `byte parity AFTER-IDX: ${page}`).toBe(before.hashes[page]);
      expect(afterAnalyze.hashes[page], `byte parity AFTER-IDX+ANALYZE: ${page}`).toBe(before.hashes[page]);
      parityChecked++;
    }
    console.log(`\nBYTE PARITY: ${parityChecked}/${pages.length} pages (battery + ${parityChecked - BATTERY.length} junction compounds) byte-identical across all 3 phases`);

    // statement-count invariance on the battery
    for (let i = 0; i < BATTERY.length; i++) {
      expect(afterIdx.results[i].statements).toBe(before.results[i].statements);
      expect(afterAnalyze.results[i].statements).toBe(before.results[i].statements);
    }

    // ADDENDUM (2): write-side accounting — 0002 backfill at corpus scale.
    // The corpus sqlite is machine-local (never committed — the public package
    // excludes it), so this addendum runs only where the operator supplied the
    // corpus; a clean clone runs the full read-side battery and reports the
    // skip loudly rather than failing on an absent file.
    const corpusDeckPresent = existsSync(CORPUS_DB);
    const backfill = corpusDeckPresent ? await measureBackfillOnCorpusCopy() : null;
    const importDeltaTargeted = 2 * before.sizes.cards;
    console.log("\n=== WRITE-SIDE ACCOUNTING (rows_written, SQLite entry arithmetic) ===");
    console.log(`targeted deck import: cards=${before.sizes.cards} -> ongoing +${importDeltaTargeted} index entries (2/card)`);
    if (backfill) {
      const importDeltaCorpus = 2 * backfill.cards;
      console.log(`corpus deck (bench-corpus-v2 copy): cards=${backfill.cards} refs=${backfill.refs}`);
      console.log(`corpus import path (d1-chunker INSERTs): +${importDeltaCorpus} index entries (2/card, NULL keys included)`);
      for (const timing of backfill.timings) {
        console.log(`0002 backfill ${timing.index}: ${timing.ms} ms, ${timing.entries === null ? "entry count unavailable" : `${timing.entries} index entries (rows_written-equivalent)`}`);
      }
      console.log(`dbstat entry counts usable: ${backfill.dbstatUsable}`);
    } else {
      console.log("corpus deck absent (machine-local, not committed): backfill accounting skipped");
    }
    console.log("How D1's rows_written meter attributes CREATE INDEX backfill is verifiable only against the deployed D1 database; the entry arithmetic above is the SQLite-side bound.");

    // The results are the measurement, and they are compared with the
    // committed copy, never written over it: cost-model.test.ts reads that
    // copy, and a test that rewrites a tracked input makes whichever test
    // reads it second see different numbers. Regenerating the committed copy
    // is an explicit act: DECKO_WRITE_CF_COST_RESULTS=1.
    const committedPath = join(REPO, "tools", "cf-cost", "measure-render-reads-results.json");
    const results = JSON.parse(JSON.stringify({
      convention: "EQP plan-shape + rows-matched upper-bound accounting, x1, D1 rows_read-aligned; NOT rows-examined telemetry",
      phases: [before, afterIdx, afterAnalyze].map((p) => ({
        phase: p.phase, statsPresent: p.statsPresent, sizes: p.sizes, indexes: p.indexes,
        battery: p.results.map((r) => ({ label: r.label, statements: r.statements, estRows: r.estRows, top: r.top })),
        hashes: p.hashes,
      })),
      table,
      byteParityPages: parityChecked,
      writeAccounting: {
        targetedDeck: { cards: before.sizes.cards, ongoingInsertDelta: importDeltaTargeted },
        corpusCopy: backfill,
      },
    }));
    if (process.env.DECKO_WRITE_CF_COST_RESULTS === "1") {
      writeFileSync(committedPath, JSON.stringify(results, null, 2) + "\n");
    } else {
      // Machine-local timings (the corpus copy's index builds) are not part of
      // the comparison; everything else is deterministic on the committed deck.
      const stable = (o: Record<string, unknown>) => {
        const { writeAccounting, ...rest } = o as { writeAccounting: { targetedDeck: unknown } };
        return { ...rest, writeAccounting: { targetedDeck: writeAccounting.targetedDeck } };
      };
      const committed = JSON.parse(readFileSync(committedPath, "utf8")) as Record<string, unknown>;
      expect(
        stable(results),
        "tools/cf-cost/measure-render-reads-results.json is stale against the engine; " +
          "regenerate it with DECKO_WRITE_CF_COST_RESULTS=1 npx vitest run tools/cf-cost/measure-render-reads.test.ts, " +
          "then review the changed figures and regenerate docs/cost-model.md",
      ).toEqual(stable(committed));
    }
    // cleanup: scratch DBs are rebuildable
    for (const f of ["cf-cost-before.sqlite3", "cf-cost-after-idx.sqlite3", "cf-cost-after-analyze.sqlite3"]) {
      rmSync(join(REPO, "tmp", f), { force: true });
    }
    if (corpusDeckPresent) rmSync(CORPUS_COPY, { force: true });
  }, 600_000);
});

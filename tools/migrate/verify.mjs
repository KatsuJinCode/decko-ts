// verify.mjs — post-import verification and the JSON migration report.
//
// M4 migration tool (port-tracker stream 14, decko-commons/decko#1282).
//
// What is verified, in order:
//   1. COUNT PARITY per table: source (counted during the import pass) vs
//      target (SELECT COUNT(*)).
//   2. ROW PARITY: order-independent per-table checksums (sum of per-row
//      FNV-1a over a canonical serialization) + id extremes, computed over
//      the source stream at import time and re-computed over the target DB
//      via keyset pagination (portable: works through any SQLDatabaseDriver,
//      including D1/libsql; no full-table materialization).
//   3. JUNCTION WALK: sample compound cards (left_id NOT NULL) and resolve
//      their names by walking the left_id/right_id junctions in SQL — the
//      same walk the Lexicon performs (src/card/fetch/lexicon.ts).
//   4. ENGINE CHECKS (optional, via an injected hook): spot-render N random
//      cards through the decko-ts RenderEngine and byte-compare against
//      Ruby-captured fixtures when fixture cards exist in the migrated
//      deck. The hook lives in engine-bridge.ts (TypeScript — imports
//      src/); the CLI reaches it through the vitest runner path (see
//      migrate.mjs), tests import it directly.
//
// THE REPORT IS CONTENT-FREE BY CONSTRUCTION (DATA RULE): card names,
// content, and rendered HTML never enter the report — only ids, counts,
// hashes, booleans, and metadata. The engine bridge hashes rendered HTML;
// it does not copy it.
//
// SHAPE of the return (also the JSON report written to reportPath):
//   { tool, timestamp, dump: {file, bytes}, import: {elapsedMs,
//   rowsEmitted, keyRepair, errors, skippedTables}, cards: {sourceCount,
//   targetCount, parity}, tables: {name: {sourceCount, targetCount,
//   countParity, checksumSource, checksumTarget, checksumParity, minId*,
//   maxId*}}, junction: {sampled, resolved, unresolvedIds}, engine:
//   {...bridge-specific..., status}, outOfScope: [...], allParity,
//   warnings, verifyElapsedMs }

import { basename } from "node:path";
import { writeFileSync } from "node:fs";
import {
  checksumTargetTable,
  countAllTables,
  parseTargetSchema,
} from "./import.mjs";

/** Sampling RNG (deterministic given seed) so reports are reproducible. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/**
 * Resolve a compound card's name by walking junctions in SQL.
 * Returns { name, resolved } where resolved=false means an unresolvable
 * side or a depth-cap hit (a corrupt junction cycle must surface as
 * unresolved, not as a hang).
 */
export async function walkJunctionName(driver, id, depth = 0, maxDepth = 64) {
  const result = await driver.query(
    "SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1",
    [id],
  );
  const row = result.rows[0];
  if (row === undefined) return { name: null, resolved: false, depth };
  if (depth > maxDepth) return { name: row.name ?? null, resolved: false, depth };
  if (row.left_id === null || row.left_id === undefined) {
    return { name: row.name ?? "", resolved: row.name !== null, depth };
  }
  const left = await walkJunctionName(driver, row.left_id, depth + 1, maxDepth);
  const right =
    row.right_id === null || row.right_id === undefined
      ? { name: "", resolved: true, depth }
      : await walkJunctionName(driver, row.right_id, depth + 1, maxDepth);
  if (!left.resolved || !right.resolved) {
    return { name: null, resolved: false, depth };
  }
  return { name: `${left.name}+${right.name}`, resolved: true, depth };
}

/**
 * Sample compound-card ids WITHOUT loading them all (a 47k-card deck is
 * fine; a 6M-row deck is not). Walks the id space with keyset strides:
 * spotCount evenly spaced thresholds, one row per threshold.
 */
async function sampleCompoundIds(driver, spotCount, seed) {
  const rand = mulberry32(seed);
  const range = await driver.query(
    `SELECT MIN(id) AS lo, MAX(id) AS hi, COUNT(*) AS n FROM cards
     WHERE left_id IS NOT NULL AND trash = 0`,
    [],
  );
  const stats = range.rows[0] ?? {};
  const lo = Number(stats.lo);
  const hi = Number(stats.hi);
  const n = Number(stats.n ?? 0);
  if (n === 0 || Number.isNaN(lo) || Number.isNaN(hi)) return [];
  const wanted = Math.min(spotCount, n);
  const ids = [];
  let threshold = lo + Math.floor(rand() * Math.max(1, Math.floor((hi - lo) / wanted)));
  const stride = Math.max(1, Math.floor((hi - lo) / wanted));
  while (ids.length < wanted && threshold <= hi) {
    const hit = await driver.query(
      `SELECT id FROM cards WHERE left_id IS NOT NULL AND trash = 0 AND id >= ?
       ORDER BY id LIMIT 1`,
      [threshold],
    );
    const id = hit.rows[0]?.id;
    if (id === undefined) break;
    if (ids[ids.length - 1] !== id) ids.push(id);
    threshold = Number(id) + stride;
  }
  return ids;
}

/**
 * Run all checks and assemble the migration report. Never throws on
 * parity failures — the report carries them; only infrastructure errors
 * (unreadable DB, missing tables) propagate.
 *
 * opts: { dumpPath, driver, ddlPath, importStats, engineChecks?, 
 *         spotCount?, seed?, reportPath? }
 */
export async function verifyMigration(opts) {
  const started = Date.now();
  const seed = opts.seed ?? 0xdec000;
  const spotCount = opts.spotCount ?? 25;
  const { driver, importStats } = opts;

  const schema = parseTargetSchema(opts.ddlPath);
  const targetCounts = await countAllTables(driver, schema.tableColumns);

  // 1+2. per-table parity
  const tables = {};
  for (const table of Object.keys(schema.tableColumns)) {
    const source = importStats.checksums[table] ?? null;
    const target = await checksumTargetTable(
      driver,
      table,
      schema.tableColumns[table],
    );
    const sourceCount = source === null ? 0 : source.count;
    tables[table] = {
      sourceCount,
      targetCount: target.count,
      countParity: sourceCount === target.count,
      checksumSource: source === null ? null : source.sum,
      checksumTarget: target.sum,
      checksumParity: source === null ? null : source.sum === target.sum,
      minIdSource: source === null ? null : source.minId,
      minIdTarget: target.minId,
      maxIdSource: source === null ? null : source.maxId,
      maxIdTarget: target.maxId,
    };
  }

  // 3. junction walk samples (compound cards only)
  const junction = { sampled: 0, resolved: 0, unresolvedIds: [] };
  const sampleIds = await sampleCompoundIds(driver, spotCount, seed);
  for (const id of sampleIds) {
    const walked = await walkJunctionName(driver, id);
    junction.sampled += 1;
    if (walked.resolved && (walked.name ?? "") !== "") junction.resolved += 1;
    else if (junction.unresolvedIds.length < 20) junction.unresolvedIds.push(id);
  }
  void targetCounts;

  // 4. engine checks (spot-render + fixtures), when a bridge is injected
  let engine = { status: "skipped", reason: "no engine checks provider" };
  if (opts.engineChecks !== undefined) {
    try {
      const result = await opts.engineChecks({ driver, spotCount, seed });
      engine = { ...result, status: "ok" };
    } catch (err) {
      engine = { status: "error", reason: String(err?.message ?? err).slice(0, 300) };
    }
  }

  const cards = tables["cards"] ?? null;
  const report = {
    tool: "decko-ts migrate (M4)",
    timestamp: new Date().toISOString(),
    dump: { file: basename(opts.dumpPath), bytes: importStats.bytesRead },
    import: {
      elapsedMs: importStats.elapsedMs,
      rowsEmitted: importStats.rowsEmitted,
      keyRepair: importStats.keyRepair,
      errors: importStats.errors,
      skippedTables: importStats.skippedTables,
    },
    cards:
      cards === null
        ? null
        : { sourceCount: cards.sourceCount, targetCount: cards.targetCount, parity: cards.countParity },
    tables,
    junction,
    engine,
    outOfScope: OUT_OF_SCOPE,
    allParity: Object.values(tables).every((t) => t.countParity && t.checksumParity !== false),
    warnings: importStats.warnings,
    verifyElapsedMs: Date.now() - started,
  };
  if (opts.reportPath !== undefined) {
    writeFileSync(opts.reportPath, JSON.stringify(report, null, 2), "utf8");
  }
  return report;
}

/** Everything the tool deliberately does NOT migrate (the honest list). */
export const OUT_OF_SCOPE = [
  "attachments/files: uploaded files live on disk/object storage, never inside a mysqldump - re-attach them separately",
  "user credentials/accounts: there is no users table in modern decko (user data became cards in the 2014 transform migration); account cards import as data but password/login behavior belongs to the decko-ts account layer (future wave)",
  "rails sessions: the sessions table imports as-is if present but is inert in decko-ts (no Rails session store)",
  "background jobs: delayed_jobs rows import as-is but are stale queue state, not source of truth",
  "site-custom tables: any table outside the 12 core tables is skipped and reported in skippedTables",
  "ruby code assets: set modules, HAML views, and mod files are code, not data; behavior parity is the decko-ts mod layer's job (wave 3)",
  "search/caches: card_virtuals is a materialized cache and imports only for id fidelity; treat it as stale",
];

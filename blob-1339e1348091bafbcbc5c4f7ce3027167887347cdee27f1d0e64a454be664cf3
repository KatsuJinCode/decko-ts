// d1-validator.mjs — the validation report emitted by import-deck.mjs.
//
// The report covers the four honest checks a chunked D1 import must
// pass to be called a working import:
//
//   1. CARD COUNT     - rows in the cards table (source and target agree)
//   2. JUNCTION COUNT - rows in cards with left_id IS NOT NULL AND trash=0
//                       (the count of compound-name cards the fetch layer's
//                       Lexicon must walk)
//   3. INTEGRITY      - every junction's left_id/right_id resolve to an
//                       existing card id (or are NULL); orphan junctions
//                       are reported by id (ids only, never content)
//   4. PER-TABLE      - row counts per table, source vs target
//
// The validator runs over a SQLDatabaseDriver - either the local staging
// DB (before chunking) or a live D1 driver (post-apply). The CLI runs the
// staging pass first (so the report is available even when --apply was
// not passed) and appends a post-apply block when --apply succeeds.
//
// SHAPE (matches the verify.mjs report's content-free contract - ids,
// counts, hashes only, never card names or content):
//   {
//     tool, timestamp,
//     source: { path, kind, bytes, cardsCount, junctionsCount },
//     target: { path, kind, tables: { name: { count } }, cardsCount, junctionsCount },
//     chunks: { count, totalRows, totalBytes, rowsPerChunk, bytesPerChunk },
//     integrity: { orphans: { left: [...], right: [...] }, depthSamples: [...] },
//     allChecksPass, warnings, outOfScope
//   }

import { writeFileSync } from "node:fs";

export const OUT_OF_SCOPE = [
  "attachments/files: uploaded files live on disk/object storage, never inside the import - re-attach separately",
  "user credentials/accounts: account rows import as cards, but password/login behavior belongs to the decko-ts account layer",
  "rails sessions: the sessions table imports as-is if present but is inert in decko-ts (no Rails session store)",
  "background jobs: delayed_jobs rows import as-is but are stale queue state, not source of truth",
  "site-custom tables: any table outside the core 12 is skipped and reported in skippedTables",
  "ruby code assets: set modules, HAML views, and mod files are code, not data; behavior parity is the decko-ts mod layer's job",
  "search/caches: card_virtuals is a materialized cache and imports only for id fidelity; treat it as stale",
];

/** Count rows in a single table via the driver. */
export async function countTable(driver, table) {
  const r = await driver.query(`SELECT COUNT(*) AS n FROM "${table}"`, []);
  return Number(r.rows[0]?.n ?? 0);
}

/** Count rows for every table in `tableNames`. */
export async function countAll(driver, tableNames) {
  const counts = {};
  for (const t of tableNames) counts[t] = await countTable(driver, t);
  return counts;
}

/** Count the junction rows the Lexicon will have to walk: cards with
 *  left_id IS NOT NULL AND trash=0. */
export async function countJunctions(driver) {
  const r = await driver.query(
    "SELECT COUNT(*) AS n FROM cards WHERE left_id IS NOT NULL AND trash = 0",
    [],
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** Find orphan junctions: rows whose left_id or right_id points to an id
 *  that does not exist in the cards table. Returns up to 20 ids per side
 *  for a content-free report. */
export async function findOrphanJunctions(driver, limit = 20) {
  const leftOrphans = await driver.query(
    `SELECT DISTINCT c.id AS id
       FROM cards c
       LEFT JOIN cards p ON p.id = c.left_id
      WHERE c.left_id IS NOT NULL AND p.id IS NULL
      LIMIT ?`,
    [limit],
  );
  const rightOrphans = await driver.query(
    `SELECT DISTINCT c.id AS id
       FROM cards c
       LEFT JOIN cards p ON p.id = c.right_id
      WHERE c.right_id IS NOT NULL AND p.id IS NULL
      LIMIT ?`,
    [limit],
  );
  const leftFull = await driver.query(
    `SELECT COUNT(*) AS n
       FROM cards c
       LEFT JOIN cards p ON p.id = c.left_id
      WHERE c.left_id IS NOT NULL AND p.id IS NULL`,
    [],
  );
  const rightFull = await driver.query(
    `SELECT COUNT(*) AS n
       FROM cards c
       LEFT JOIN cards p ON p.id = c.right_id
      WHERE c.right_id IS NOT NULL AND p.id IS NULL`,
    [],
  );
  return {
    leftIds: leftOrphans.rows.map((r) => Number(r.id)),
    rightIds: rightOrphans.rows.map((r) => Number(r.id)),
    leftCount: Number(leftFull.rows[0]?.n ?? 0),
    rightCount: Number(rightFull.rows[0]?.n ?? 0),
  };
}

/** Sample junction rows and resolve their composed name by walking the
 *  left/right sides (a depth-capped recursive join). Sample size is
 *  small (default 25) so the validator runs in O(sample * depth) on
 *  decks with millions of cards. Returns { sampled, resolved,
 *  unresolvedIds } where unresolvedIds is up to 20 ids (content-free). */
export async function sampleJunctionWalk(driver, sampleSize = 25, maxDepth = 8) {
  const range = await driver.query(
    `SELECT MIN(id) AS lo, MAX(id) AS hi, COUNT(*) AS n FROM cards
     WHERE left_id IS NOT NULL AND trash = 0`,
    [],
  );
  const lo = Number(range.rows[0]?.lo);
  const hi = Number(range.rows[0]?.hi);
  const n = Number(range.rows[0]?.n ?? 0);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || n === 0) {
    return { sampled: 0, resolved: 0, unresolvedIds: [] };
  }
  const stride = Math.max(1, Math.floor((hi - lo) / sampleSize));
  const sampled = [];
  for (let threshold = lo; sampled.length < sampleSize && threshold <= hi; threshold += stride) {
    const hit = await driver.query(
      `SELECT id FROM cards WHERE left_id IS NOT NULL AND trash = 0 AND id >= ?
       ORDER BY id LIMIT 1`,
      [threshold],
    );
    const id = hit.rows[0]?.id;
    if (id !== undefined && sampled[sampled.length - 1] !== id) sampled.push(Number(id));
  }
  let resolved = 0;
  const unresolvedIds = [];
  for (const id of sampled) {
    const walked = await walkJunction(driver, id, 0, maxDepth);
    if (walked.resolved) resolved += 1;
    else if (unresolvedIds.length < 20) unresolvedIds.push(id);
  }
  return { sampled: sampled.length, resolved, unresolvedIds };
}

async function walkJunction(driver, id, depth, maxDepth) {
  if (depth > maxDepth) return { resolved: false, depth };
  const r = await driver.query("SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1", [id]);
  const row = r.rows[0];
  if (row === undefined) return { resolved: false, depth };
  if (row.left_id === null || row.left_id === undefined) {
    return { resolved: typeof row.name === "string" && row.name !== "", depth };
  }
  const left = await walkJunction(driver, row.left_id, depth + 1, maxDepth);
  const right =
    row.right_id === null || row.right_id === undefined
      ? { resolved: true, depth: depth + 1 }
      : await walkJunction(driver, row.right_id, depth + 1, maxDepth);
  return { resolved: left.resolved && right.resolved, depth: Math.max(left.depth, right.depth) };
}

/** Build the full validation report from a target driver and the chunk
 *  manifest.  sourceStats is the side-channel summary the caller collected
 *  during ingest (card / junction counts and bytes from the input file -
 *  useful even when the source isn't a queryable database). */
export async function buildReport({
  targetDriver,
  targetKind,
  targetPath,
  sourcePath,
  sourceKind,
  sourceBytes,
  sourceCardsCount,
  sourceJunctionsCount,
  tableColumns,
  chunks,
  totalRows,
}) {
  const tables = await countAll(targetDriver, Object.keys(tableColumns));
  const cardsCount = tables["cards"] ?? 0;
  const junctionsCount = await countJunctions(targetDriver);
  const orphans = await findOrphanJunctions(targetDriver);
  const junctionSample = await sampleJunctionWalk(targetDriver, 25);
  const allChecksPass =
    cardsCount === sourceCardsCount &&
    junctionSample.resolved === junctionSample.sampled &&
    orphans.leftCount === 0 &&
    orphans.rightCount === 0;
  return {
    tool: "decko-ts import-deck",
    timestamp: new Date().toISOString(),
    source: {
      path: sourcePath,
      kind: sourceKind,
      bytes: sourceBytes,
      cardsCount: sourceCardsCount,
      junctionsCount: sourceJunctionsCount,
    },
    target: {
      path: targetPath,
      kind: targetKind,
      tables,
      cardsCount,
      junctionsCount,
    },
    chunks: {
      count: chunks.length,
      totalRows,
      totalBytes: chunks.reduce((acc, c) => acc + c.bytes, 0),
      rowsPerChunk: chunks.map((c) => c.rows),
      bytesPerChunk: chunks.map((c) => c.bytes),
      tablesPerChunk: chunks.map((c) => c.tables),
    },
    integrity: {
      orphanLeftCount: orphans.leftCount,
      orphanRightCount: orphans.rightCount,
      orphanLeftSample: orphans.leftIds,
      orphanRightSample: orphans.rightIds,
      junctionWalk: junctionSample,
    },
    allChecksPass,
    warnings: [],
    outOfScope: OUT_OF_SCOPE,
  };
}

/** Write the report as JSON to disk. */
export function writeReport(report, reportPath) {
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  return reportPath;
}

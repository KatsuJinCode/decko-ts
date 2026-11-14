// The render prefetch cache is port-owned derived data. It must never
// rebuild canonical card_references at boot: those rows include structured
// and actor-dependent Ruby references and drive history, search and mail.
// The reader combines this optional cache with canonical inclusion edges;
// its existing parser verification/fallback remains authoritative.

import type { SQLDatabaseDriver } from "../server/driver.js";
import { DeckoName } from "./name.js";
import { referenceRowsOut, type ReferenceLexicon } from "./actions/refresh-references-out.js";

/** Bump when the interpretation of content into 'I' rows changes: every
 *  deck then rebuilds its index on its next open or build step. */
export const NEST_INDEX_BUILD_VERSION = 2;

/** The marker table. Its statements are the same on SQLite (D1 included),
 *  MySQL and PostgreSQL; the columns are not `key`/`value`, which MySQL
 *  reserves. Migration 0013-nest-index-meta.sql creates it on D1. */
export const NEST_INDEX_META_TABLE = "nest_index_meta";

export const NEST_INDEX_META_DDL =
  `CREATE TABLE IF NOT EXISTS ${NEST_INDEX_META_TABLE} (` +
  `meta_key VARCHAR(64) NOT NULL PRIMARY KEY, ` +
  `meta_value VARCHAR(255) NOT NULL)`;

import {NEST_EDGE_CACHE_TABLE,NEST_EDGE_CACHE_DDL,hasNestEdgeCache,noteNestEdgeCacheInstalled,nestIndexTableExists as tableExists} from "./nest-index-cache.js";
const BUILD_VERSION_KEY = "build_version";

/** The subset of DbLexicon the rebuild needs: the referee resolution of the
 *  write path (ReferenceLexicon#id) plus the referer's own name, which a
 *  compound card's content is scanned under. */
export interface NestIndexLexicon extends ReferenceLexicon {
  name(id: number | undefined): Promise<DeckoName | undefined>;
}

export interface NestIndexInstall {
  /** 'current': the marker already named this build version, nothing ran.
   *  'built': the index was dropped and re-derived from the content. */
  readonly state: "current" | "built";
  /** Port-owned cached edges replaced by this rebuild (0 when current). */
  readonly dropped: number;
  /** Cards whose content carries a nest, re-parsed by this call. */
  readonly scanned: number;
}

/** What a boot can say about a deck's index without writing anything. */
export interface NestIndexMarker {
  /** 'current': built by this version. 'stale': built by an older version.
   *  'missing': no marker table, or no marker row (never built). */
  readonly state: "current" | "stale" | "missing";
  /** The recorded build version, when there is one. */
  readonly version?: number;
}

/** Cards read per batch. The scan is one WHERE over cards; the read is cut
 *  into batches so a 50k-card deck never holds every content in memory. */
const SCAN_BATCH = 2000;

async function readBuildVersion(driver: SQLDatabaseDriver): Promise<number | undefined> {
  const row = await driver.query<{ meta_value: string }>(
    `SELECT meta_value FROM ${NEST_INDEX_META_TABLE} WHERE meta_key = ?`,
    [BUILD_VERSION_KEY],
  );
  const value = row.rows[0]?.meta_value;
  return value === undefined ? undefined : Number(value);
}

/**
 * The boot's cheap check. Reads the marker and writes nothing, so a read-only
 * host, and a worker that must not build inside a request, can both call it.
 * A 'missing' or 'stale' answer means the deck is served by walking the
 * closure (correct bytes, more round trips) until the build step brings the
 * index current; the caller is expected to say so loudly.
 */
export async function readNestIndexMarker(driver: SQLDatabaseDriver): Promise<NestIndexMarker> {
  if (!(await tableExists(driver, NEST_INDEX_META_TABLE))) return { state: "missing" };
  const version = await readBuildVersion(driver);
  if (version === undefined) return { state: "missing" };
  if (version === NEST_INDEX_BUILD_VERSION && !(await hasNestEdgeCache(driver))) return { state: "missing", version };
  return version === NEST_INDEX_BUILD_VERSION ? { state: "current", version } : { state: "stale", version };
}

/** Rebuild only the optional prefetch cache. No card-table row is modified.
 *  Cache edges are hints, never semantic reference or complete-result facts.
 *  Stale hints may cost extra prefetch work; missing hints use the existing
 *  closure walk. Canonical save-time references remain the semantic graph. */
export async function ensureNestIndex(
  driver: SQLDatabaseDriver,
  lexicon: NestIndexLexicon,
): Promise<NestIndexInstall> {
  await driver.query(NEST_INDEX_META_DDL, []);
  const hadCache = await hasNestEdgeCache(driver);
  if ((await readBuildVersion(driver)) === NEST_INDEX_BUILD_VERSION && hadCache) {
    return { state: "current", dropped: 0, scanned: 0 };
  }
  await driver.query(NEST_EDGE_CACHE_DDL, []);
  noteNestEdgeCacheInstalled(driver);
  const before = await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${NEST_EDGE_CACHE_TABLE}`, []);
  const dropped = Number(before.rows[0]?.n ?? 0);
  await driver.query(`DELETE FROM ${NEST_EDGE_CACHE_TABLE}`, []);
  const cards = await driver.query<{ id: number; db_content: string | null }>(
    `SELECT id, db_content FROM cards WHERE trash = 0 AND db_content LIKE '%{{%' ORDER BY id`, []);
  const rows = cards.rows ?? [];
  for (let start = 0; start < rows.length; start += SCAN_BATCH) {
    for (const row of rows.slice(start, start + SCAN_BATCH)) {
      const id = Number(row.id), name = await lexicon.name(id);
      if (name === undefined) continue;
      const included = (await referenceRowsOut(driver, lexicon, id, name, row.db_content))
        .filter(ref => ref.refType === "I");
      for (const ref of included) {
        if (ref.refereeKey === null) throw new Error("nest cache inclusion has no key");
        await driver.query(`INSERT INTO ${NEST_EDGE_CACHE_TABLE} (referer_id, referee_key, referee_id) VALUES (?, ?, ?)`,
          [ref.refererId, ref.refereeKey, ref.refereeId]);
      }
    }
  }
  await writeBuildVersion(driver, NEST_INDEX_BUILD_VERSION);
  return { state: "built", dropped, scanned: rows.length };
}

async function writeBuildVersion(driver: SQLDatabaseDriver, version: number): Promise<void> {
  await driver.query(`DELETE FROM ${NEST_INDEX_META_TABLE} WHERE meta_key = ?`, [BUILD_VERSION_KEY]);
  await driver.query(`INSERT INTO ${NEST_INDEX_META_TABLE} (meta_key, meta_value) VALUES (?, ?)`, [
    BUILD_VERSION_KEY,
    String(version),
  ]);
}

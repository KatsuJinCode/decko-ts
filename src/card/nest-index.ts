// The stored nest index is always present and current: one place that
// installs it on a deck that lacks it, and the same rows the save path keeps.
//
// WHAT THE INDEX IS. card_references holds one ref_type 'I' row per nest
// the write path parsed out of a card's content (refresh-references-out.ts;
// Ruby card-mod-content set/all/references.rb). The cold render reads the
// whole nest closure from those rows in one prelude statement
// (src/card/render/prefetch.ts, the recursive walk from the root), so a cold
// render costs three round trips at any depth and any width - provided the
// rows describe the nests.
//
// WHO KEEPS THE ROWS CURRENT. Two arms:
//
//   1. The save path (card-action-engine.ts maybeRefreshReferencesOut, the
//      :finalize `changed: :content` event body) rewrites a card's rows on
//      every save whose db_content actually changed, and the referee side
//      (refresh-references-in.ts) fills referee_id once the referee exists.
//   2. A deck that arrived by another road - a Ruby-built deck whose rows
//      are older than its content, a deck imported straight into its
//      database, a database provisioned before the events ran, content
//      written by a migration or a seed - has content the rows do not
//      describe. Its render then walks the closure level by level, one round
//      trip per level.
//
// So ensureNestIndex rebuilds the 'I' index from the stored content when the
// deck's marker is missing or stale. WHO CALLS IT, AND WHERE:
//   - Node hosts and the pods tools: at boot, on a writable connection.
//   - Cloudflare D1 and Bunny: from the one-shot build step (tools/deploy/
//     build-nest-index.mjs, run by the deploy chain and by the import tool),
//     NEVER inside a request. A request-serving boot calls only
//     readNestIndexMarker, which reads and writes nothing, and logs loudly
//     when the marker says the index is not current.
//
// The rebuild runs the SAME interpretation the save path runs
// (refreshReferencesOut), so the rows it writes are the rows a save would have
// written. It can change what a render costs, never what it renders.
//
// THE MARKER. nest_index_meta (meta_key, meta_value) is a port-added table,
// installed additively and idempotently on every dialect this module runs on
// (SQLite and D1, MySQL, PostgreSQL). It records the index build version.
// Bump NEST_INDEX_BUILD_VERSION when the interpretation above changes and
// every deck rebuilds on its next open or build.

import type { SQLDatabaseDriver } from "../server/driver.js";
import { PostgresDriver } from "../server/drivers/postgres.js";
import { driverDialect } from "../server/same-database.js";
import { DeckoName } from "./name.js";
import { refreshReferencesOut, type ReferenceLexicon } from "./actions/refresh-references-out.js";

/** Bump when the interpretation of content into 'I' rows changes: every
 *  deck then rebuilds its index on its next open or build step. */
export const NEST_INDEX_BUILD_VERSION = 1;

/** The marker table. Its statements are the same on SQLite (D1 included),
 *  MySQL and PostgreSQL; the columns are not `key`/`value`, which MySQL
 *  reserves. Migration 0013-nest-index-meta.sql creates it on D1. */
export const NEST_INDEX_META_TABLE = "nest_index_meta";

export const NEST_INDEX_META_DDL =
  `CREATE TABLE IF NOT EXISTS ${NEST_INDEX_META_TABLE} (` +
  `meta_key VARCHAR(64) NOT NULL PRIMARY KEY, ` +
  `meta_value VARCHAR(255) NOT NULL)`;

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
  /** 'I' rows the rebuild dropped before re-deriving (0 when current). */
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

type MetaDialect = "sqlite" | "mysql" | "postgres";

function metaDialect(driver: SQLDatabaseDriver): MetaDialect {
  if (driver instanceof PostgresDriver) return "postgres";
  return driverDialect(driver);
}

async function tableExists(driver: SQLDatabaseDriver, table: string): Promise<boolean> {
  const dialect = metaDialect(driver);
  const sql =
    dialect === "sqlite"
      ? `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`
      : dialect === "mysql"
        ? `SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`
        : `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?`;
  const row = await driver.query<{ n: number }>(sql, [table]);
  return Number(row.rows[0]?.n ?? 0) > 0;
}

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
  return version === NEST_INDEX_BUILD_VERSION ? { state: "current", version } : { state: "stale", version };
}

/**
 * Ensures the stored nest index describes the deck's content. Idempotent and
 * cheap when it already does: one marker read, and nothing else. Rebuilds
 * when the marker is missing or names an older build version - a deck built
 * by Ruby, imported, provisioned before the reference events, or written
 * behind the write path.
 *
 * Only 'I' rows are touched. Link and partial rows are other readers' tables
 * (the read-rule cache, follow rules); the write path's per-save maintenance
 * keeps them, and this rebuild neither reads nor writes them.
 */
export async function ensureNestIndex(
  driver: SQLDatabaseDriver,
  lexicon: NestIndexLexicon,
): Promise<NestIndexInstall> {
  await driver.query(NEST_INDEX_META_DDL, []);
  if ((await readBuildVersion(driver)) === NEST_INDEX_BUILD_VERSION) {
    return { state: "current", dropped: 0, scanned: 0 };
  }

  // The index is derived data: the whole 'I' set is dropped, then every card
  // whose content carries a nest is re-parsed exactly as a save parses it.
  // Dropping first sweeps the rows of cards that no longer nest; reading only
  // the cards that can hold a nest keeps the scan to the nesters.
  const before = await driver.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM card_references WHERE ref_type = 'I'`,
    [],
  );
  const dropped = Number(before.rows[0]?.n ?? 0);
  await driver.query(`DELETE FROM card_references WHERE ref_type = 'I'`, []);

  const cards = await driver.query<{ id: number; db_content: string | null }>(
    `SELECT id, db_content FROM cards WHERE db_content LIKE '%{{%' ORDER BY id`,
    [],
  );
  const rows = cards.rows ?? [];
  for (let start = 0; start < rows.length; start += SCAN_BATCH) {
    for (const row of rows.slice(start, start + SCAN_BATCH)) {
      const id = Number(row.id);
      const name = await lexicon.name(id);
      // A card the lexicon cannot name has no referer name to parse under.
      // It is skipped, not guessed at: its content stays un-indexed and a
      // render that reaches it walks that one level, as before the index.
      if (name === undefined) continue;
      await refreshReferencesOut(driver, lexicon, id, name, row.db_content);
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

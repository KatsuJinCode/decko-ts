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
// WHO KEEPS THE ROWS CURRENT. Two arms, and a gap this module closes:
//
//   1. The save path (card-action-engine.ts maybeRefreshReferencesOut, the
//      :finalize `changed: :content` event body) rewrites a card's rows on
//      every save whose db_content actually changed, and the referee side
//      (refresh-references-in.ts) fills referee_id once the referee exists.
//      That arm is the write path's, and it is not what this module adds.
//   2. A deck that arrived by another road - a Ruby-built deck whose rows
//      are older than its content, a deck imported straight into its
//      database, a database provisioned before the events ran, a deck whose
//      content was written by a migration or a seed - has content the rows
//      do not describe. Then the render walks the closure level by level and
//      costs one round trip per level, whatever its width.
//
// So: ensureNestIndex rebuilds the whole 'I' index from the stored content
// when the deck has not been built by this version, and the hosts call it at
// boot (src/card/pods/deck.ts, the Node host, deploy/worker.ts, the Bunny
// edge boot). It runs the SAME interpretation the save path runs
// (refreshReferencesOut), so the rows it writes are the rows a save would
// have written; it never writes a row the write path would not write, and a
// rebuild therefore cannot change a render's bytes - it only changes how many
// round trips that render costs.
//
// THE MARKER. nest_index_meta is a port-added table in the same spirit as
// deck_data_version (src/server/freshness-stamp.ts): additive, idempotent,
// installed on a deck that lacks it, never read by the render path. It
// records the index BUILD VERSION - bump it when the interpretation above
// changes and every deck rebuilds on its next open. It is not a trust
// signal: a deck whose content is written behind the write path keeps the
// version it had, exactly as a deck's freshness stamp keeps moving only
// through the triggers.

import type { SQLDatabaseDriver } from "../server/driver.js";
import { DeckoName } from "./name.js";
import { refreshReferencesOut, type ReferenceLexicon } from "./actions/refresh-references-out.js";

/** Bump when the interpretation of content into 'I' rows changes: every
 *  deck then rebuilds its index on its next open. */
export const NEST_INDEX_BUILD_VERSION = 1;

export const NEST_INDEX_META_TABLE = "nest_index_meta";

export const NEST_INDEX_META_DDL = `CREATE TABLE IF NOT EXISTS ${NEST_INDEX_META_TABLE} (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`;

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

/** Cards read per batch. The scan is one WHERE over cards; the read is cut
 *  into batches so a 50k-card deck never holds every content in memory. */
const SCAN_BATCH = 2000;

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
  const version = await ensureMetaTable(driver);
  if (version === NEST_INDEX_BUILD_VERSION) return { state: "current", dropped: 0, scanned: 0 };

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
  await writeMetaVersion(driver, NEST_INDEX_BUILD_VERSION);
  return { state: "built", dropped, scanned: rows.length };
}

async function ensureMetaTable(driver: SQLDatabaseDriver): Promise<number> {
  const exists = await driver.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [NEST_INDEX_META_TABLE],
  );
  const present = Number(exists.rows[0]?.n ?? 0) > 0;
  if (present) {
    const row = await driver.query<{ value: string }>(
      `SELECT value FROM ${NEST_INDEX_META_TABLE} WHERE key = 'build_version'`,
      [],
    );
    return Number(row.rows[0]?.value ?? 0);
  }
  await driver.query(NEST_INDEX_META_DDL, []);
  return 0;
}

async function writeMetaVersion(driver: SQLDatabaseDriver, version: number): Promise<void> {
  await driver.query(`DELETE FROM ${NEST_INDEX_META_TABLE} WHERE key = 'build_version'`, []);
  await driver.query(`INSERT INTO ${NEST_INDEX_META_TABLE} (key, value) VALUES ('build_version', ?)`, [
    String(version),
  ]);
}

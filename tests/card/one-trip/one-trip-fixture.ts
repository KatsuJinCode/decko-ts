// Test fixture for the one-trip implementation lane: the shared boot for
// every test that needs the trial-deck mirror (the 19,482-card corpus) or a
// trip-counting driver.
//
// WHAT THIS IS: the same boot the db-roundtrip elimination lane's probes use
// (LocalSqliteDriver -> FetchEngine -> RenderEngine, render(name, "open",
// {})) plus a capturing driver that counts ROUND TRIPS (one driver.query or
// one driver.batch call each) and records every statement's result rows so
// the render's true cards-row read set is observable.
//
// The mirror COPY lives at benchmarks/one-trip-render/
// trial-deck-mirror-readonly-copy.sqlite3 (gitignored; built once from the
// db-roundtrip worktree's mirror via the backup API — the original is never
// opened writable). Tests that need it skip when the copy is absent so a
// fresh clone without the corpus still runs the rest of the suite.

import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { applyDeckDataVersionStampMigration } from "./apply-deck-data-version-stamp-migration.js";

/** The 5 probe pages the lane receipt and the mission name. */
export const PROBE_PAGES = ["Home", "Aikido", "About", "Eagle", "Taking_Stock"] as const;

export const MIRROR_COPY_PATH = fileURLToPath(
  new URL("../../../benchmarks/one-trip-render/trial-deck-mirror-readonly-copy.sqlite3", import.meta.url),
);

export const mirrorAvailable = (): boolean => existsSync(MIRROR_COPY_PATH);

let stampedMirrorCopy: string | undefined;

/** A stamp-migrated copy of the trial-deck mirror, created once per test
 *  process (lineage-reconciliation lane, 2026-10-06).
 *
 *  WHY: the composed render engine reads deck_data_version at every render
 *  entry and fails LOUDLY on an unmigrated database BY DESIGN (delivery
 *  contract:79 — a silently skipped check is a silent staleness window; the
 *  throw lives in RenderEngine#readDeckDataVersion). The shared mirror
 *  predates the stamp schema and is NEVER opened writable, so any engine
 *  booted for a render must run against this migrated copy (migration 0003,
 *  order-safe; adds no render bytes, so byte-identity pins compare like
 *  with like). Corpus/builder reads that never boot a render engine may keep
 *  using MIRROR_COPY_PATH directly. */
export async function stampedMirrorCopyPath(): Promise<string> {
  if (stampedMirrorCopy === undefined) {
    const dir = mkdtempSync(join(tmpdir(), "one-trip-stamped-mirror-"));
    stampedMirrorCopy = join(dir, "trial-deck-mirror-stamped.sqlite3");
    copyFileSync(MIRROR_COPY_PATH, stampedMirrorCopy);
    const loader = new LocalSqliteDriver({ path: stampedMirrorCopy });
    await applyDeckDataVersionStampMigration(loader);
    loader.close();
  }
  return stampedMirrorCopy;
}

/** A row "looks like a cards row" when it carries an integer id plus at
 *  least one cards-shaped column — reads card rows from every statement
 *  shape that returns them (point reads, aliased closure walks, search
 *  chunked reads, rule rows) without classifying SQL text. */
export function cardIdsFromRows(rows: unknown[]): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const rec = row as Record<string, unknown>;
    const id = rec["id"];
    if (typeof id !== "number" || !Number.isSafeInteger(id)) continue;
    const cardish =
      "key" in rec || "type_id" in rec || "db_content" in rec || "trash" in rec || "left_id" in rec;
    if (cardish) ids.push(id);
  }
  return ids;
}

export interface CapturedStatement {
  sql: string;
  params: unknown[];
  rowCount: number;
  cardIds: number[];
}

/** Driver wrapper that counts round trips (query OR batch = one trip) and
 *  records every statement with its result rows. */
export class TripCapturingDriver implements SQLDatabaseDriver {
  trips = 0;
  readonly statements: CapturedStatement[] = [];
  constructor(private readonly inner: SQLDatabaseDriver) {}
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.trips += 1;
    const result = await this.inner.query<T>(sql, params);
    this.statements.push({
      sql,
      params,
      rowCount: result.rows.length,
      cardIds: cardIdsFromRows(result.rows as unknown[]),
    });
    return result;
  }
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    this.trips += 1;
    const results = await this.inner.batch(statements);
    results.forEach((result, i) => {
      const stmt = statements[i] as { sql: string; params?: unknown[] };
      this.statements.push({
        sql: stmt?.sql ?? "",
        params: stmt?.params ?? [],
        rowCount: result.rows.length,
        cardIds: cardIdsFromRows(result.rows as unknown[]),
      });
    });
    return results;
  }
}

export interface EngineBoot {
  fetcher: FetchEngine;
  render: RenderEngine;
}

/** Boot the SAME object graph the probes use, with the codename registry
 *  loaded and the name environment installed (DeckoName.parse needs it for
 *  ":codename" marks).
 *
 *  maxTemporaryCacheKeys is raised for the one-trip arms (default 200_000):
 *  the Ruby-mirrored 10k-key Temporary reset wipes primed lexicon entries
 *  MID-SEATING at corpus scale (measured: the 3,526-member Eagle payload's
 *  composition re-issued 1,668 id-to-name queries purely because the reset
 *  evicted entries the batch itself had written moments earlier). The cap
 *  is an engine boot parameter (FetchEngine's own option), not an engine
 *  change; a production one-trip deployment boots with the raised cap the
 *  same way. The baseline arms use the same boot so both sides run
 *  identical engine configuration. */
export async function bootEngine(driver: SQLDatabaseDriver): Promise<EngineBoot> {
  const fetcher = new FetchEngine(driver, { maxTemporaryCacheKeys: 200_000 });
  await fetcher.codenames.ensureLoaded();
  fetcher.installNameEnvironment();
  return { fetcher, render: new RenderEngine(fetcher) };
}

/** Normalize the per-render session randomness the engine itself emits:
 *  data-slot-id is SecureRandom.hex(10) per rendered slot (slot-html.ts,
 *  wrap.rb wrap_data parity) — two renders of the SAME page by the SAME
 *  engine state never agree on it (measured). Byte-identity is asserted
 *  modulo these ids: every data-slot-id value is replaced with a fixed
 *  token on both sides before comparison. */
export function normalizeSlotIds(html: string): string {
  return html.replace(/data-slot-id=&quot;[0-9a-f]{20}&quot;/g, "data-slot-id=SLOTID").replace(
    /data-slot-id="[0-9a-f]{20}"/g,
    'data-slot-id="SLOTID"',
  );
}

export interface BaselineRender {
  html: string;
  trips: number;
  statements: CapturedStatement[];
  /** The union of every cards-row id any statement returned — the render's
   *  true read set (the closure-superset validation's reference). */
  touchedCardIds: number[];
}

/** Render one page through a fresh engine on a capturing driver: the
 *  current engine's output and its round-trip cost, measured together.
 *
 *  touchedCardIds EXCLUDES the two ENGINE-BOOT folds (named residue classes
 *  in render-plan.ts, excluded here with the same justification): the
 *  codename registry load and the dangling-side canonical map. Both are
 *  engine-LIFETIME state (memoized per engine, computed once regardless of
 *  page), both return card-shaped rows in bulk, and no page payload can or
 *  should carry them — they are not page dependencies. Every OTHER
 *  statement's card rows count: content includes, rule candidates, search
 *  results, shell reads — the closure must cover all of them or name the
 *  gap. */
export async function captureBaselineRender(
  mirrorPath: string,
  name: string,
): Promise<BaselineRender> {
  const capture = new TripCapturingDriver(new LocalSqliteDriver({ path: mirrorPath, readonly: true }));
  const { render } = await bootEngine(capture);
  const html = await render.render(name, "open", {});
  const touched = new Set<number>();
  for (const stmt of capture.statements) {
    if (isEngineBootStatement(stmt.sql)) continue;
    for (const id of stmt.cardIds) touched.add(id);
  }
  return {
    html,
    trips: capture.trips,
    statements: capture.statements,
    touchedCardIds: [...touched].sort((a, b) => a - b),
  };
}

/** The engine-boot fold statements (see captureBaselineRender). Two codename
 *  loaders exist in the engine (the registry's and the admin runtime's) and
 *  both are boot state, not page data; the dangling-side canonical map is
 *  engine-lifetime memoized. The same classes live in render-plan.ts's
 *  residue registry. */
export function isEngineBootStatement(sql: string): boolean {
  return (
    /codename IS NOT NULL/i.test(sql) ||
    /SELECT c\.\* FROM cards c WHERE c\.trash = 0 AND c\.left_id IS NOT NULL AND \(NOT EXISTS/i.test(sql)
  );
}

/** Rule-lattice probe heuristic: a key parameter shaped like a rule
 *  candidate ("*all+*layout", "rich_text+*type+*content") or a setting
 *  card. Distinguishes the rule lattice's name probes from content-include
 *  fetches (whose keys never carry the star-mark shape) — the lattice is
 *  the named residue class the record-and-replay plan covers, not a
 *  closure gap. */
export function isRuleLatticeKey(key: unknown): boolean {
  return typeof key === "string" && (key.startsWith("*") || key.includes("+*"));
}

/** The NAMED residue classes a closure-missing card may be fetched through
 *  without failing the superset pin. JUSTIFICATION RULE (mechanical): a
 *  missing id is justified when NONE of its fetching statements is a
 *  content-include fetch — i.e. a key read or key IN-list carrying a
 *  NON-rule-shaped key. Content includes always arrive through key reads
 *  (retrieve.ts's simple-name path) or key IN-lists; if no such statement
 *  with a content key touched the id, it entered the read set only through
 *  the rule lattice / boot folds / id-follow-on machinery — the named
 *  residue the record-and-replay plan covers. (Known limitation, accepted:
 *  an id-mark content include — {{~861}} — fetches by id and would be
 *  misclassified as residue; the byte-identity pin catches any resulting
 *  correctness issue and the harness report makes the composition
 *  visible.) */
export function isContentIncludeFetch(sql: string, params: unknown[]): boolean {
  const keyRead =
    /SELECT \* FROM cards WHERE key = \?( AND trash = 0)?( LIMIT 1)?/i.test(sql) ||
    /key( COLLATE NOCASE)? IN \(/i.test(sql);
  if (!keyRead) return false;
  if (!Array.isArray(params)) return false;
  return params.some((p) => !isRuleLatticeKey(p));
}

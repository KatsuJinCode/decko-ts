// Test storage for the render-engine tests: an in-memory better-sqlite3
// database (the REAL LocalSqliteDriver) loaded with db/schema.sqlite.sql,
// plus a counting driver that measures BOTH count axes the #1282 claim is
// judged on:
//   - statements: individual SQL statements (a batch's statements count one
//     each)
//   - roundTrips: driver calls (driver.batch = ONE round trip - on the edge
//     drivers, e.g. D1, that is literally one HTTP request; this is the
//     axis the constant-queries promise is about)
// Lives INSIDE tests/card/render per the stream boundaries; seeded cards are
// written DIRECTLY as rows because the write path is another stream.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import type { CardsRow } from "../../../src/server/schema.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { DeckoName } from "../../../src/card/name.js";
import { ModLoader, setDefaultModLoader } from "../../../src/card/mod-loader.js";
import { expireRuleResolutionCache } from "../../../src/card/permissions/read-rules.js";
import type { Lex } from "../../../src/card/fetch/lexicon.js";

/** Quote-aware `--` comment stripping + ";" split (the DDL carries no
 *  ";" inside literals - same splitter contract as the fetch stream's
 *  storage; see tests/card/fetch/fetch-test-storage.ts for the rationale). */
export function splitSqlStatements(ddl: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < ddl.length; i++) {
    const ch = ddl[i];
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "-" && ddl[i + 1] === "-") {
      while (i < ddl.length && ddl[i] !== "\n") i++;
      current += " ";
      continue;
    }
    if (ch === ";") {
      statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") statements.push(current.trim());
  return statements.filter((statement) => statement !== "");
}

export interface CountSnapshot {
  /** SQL statements issued (batch statements count one each). */
  statements: number;
  /** Driver calls: query() + batch() each count ONE round trip. */
  roundTrips: number;
}

/** The render-stream counting wrapper: tracks statements AND round trips. */
export class CountingRenderDriver implements SQLDatabaseDriver {
  private counts: CountSnapshot = { statements: 0, roundTrips: 0 };
  readonly statements: string[] = [];

  constructor(private readonly inner: SQLDatabaseDriver) {}

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.counts = { statements: this.counts.statements + 1, roundTrips: this.counts.roundTrips + 1 };
    this.statements.push(sql);
    return this.inner.query<T>(sql, params);
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    // ONE round trip, N statements.
    this.counts = {
      statements: this.counts.statements + statements.length,
      roundTrips: this.counts.roundTrips + 1,
    };
    for (const statement of statements) this.statements.push(statement.sql);
    return this.inner.batch(statements);
  }

  snapshot(): CountSnapshot {
    return { ...this.counts };
  }

  reset(): void {
    this.counts = { statements: 0, roundTrips: 0 };
    this.statements.length = 0;
  }
}

export interface RenderTestStorage {
  engine: RenderEngine;
  fetcher: FetchEngine;
  counting: CountingRenderDriver;
  close(): void;
}

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** Fresh in-memory database + FetchEngine + RenderEngine over the counting
 *  driver. */
export async function createRenderTestStorage(): Promise<RenderTestStorage> {
  const driver = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8");
  for (const statement of splitSqlStatements(ddl)) {
    await driver.query(statement, []);
  }
  const counting = new CountingRenderDriver(driver);
  const fetcher = new FetchEngine(counting);
  return { engine: new RenderEngine(fetcher), fetcher, counting, close: () => driver.close() };
}

/** Bind a loaded ModLoader to the engine so the render path resolves views
 *  through Ruby's per-card MRO walk (RenderEngine#computeResolvedView ->
 *  `loader.viewChain(card.setKeys, view, format)`, src/card/render.ts).
 *
 *  NEEDED, not optional: RenderEngine captures `getDefaultModLoader()` in
 *  its CONSTRUCTOR (render.ts:466), which runs inside
 *  createRenderTestStorage — long before a test file's beforeAll creates
 *  and loads its loader. A test that renders a SET-SCOPED view without
 *  this line silently reached it through the flat base-format record
 *  instead, which is exactly the deck-wide masking this seam's absence
 *  used to hide: a `set/right/*` or `set/type/*` view answered for cards
 *  that are not in the set at all. The flat record now carries only the
 *  universally-applicable (set/all/*) registrations, so an unbound
 *  engine cannot see a set-scoped view — correctly.
 *
 *  Pass the loader the test already built; this does not construct or
 *  load one. `storage` may be undefined: a manifest-structure test
 *  inspects the loader without ever constructing a render engine, and
 *  there is nothing to bind in that case - the process-wide default is
 *  still set, because superView (mod-view-helpers.ts) and the modView*
 *  config accessors read it. */
export function bindModLoaderToEngine(
  storage: RenderTestStorage | undefined,
  loader: ModLoader,
): void {
  if (storage !== undefined) storage.engine.modLoader = loader;
  setDefaultModLoader(loader);
}

const DEFAULT_TYPE_ID = 2;

export interface SeedOptions {
  id?: number;
  /** Junction rows carry their corpus name/key too (see seedCard) — the
   *  corpus v2 dump stores them; only callers seeding a bare junction by
   *  sides alone omit the name. */
  name?: string;
  key?: string;
  codename?: string | null;
  leftId?: number;
  rightId?: number;
  typeId?: number;
  /** The type name (string), separate from typeId. Used by the *type
   *  pattern's `pattern_applies?` check. */
  typeName?: string;
  dbContent?: string | null;
  trash?: boolean;
  /** cards.read_rule_id — the DATA side of the read rule (Ruby derives it
   *  on save via the set_read_rule store event, card-mod-permissions
   *  set/all/permissions.rb:1-5; the read-permission stream reads it at
   *  render time). Null/unset = the engine falls back to the live rule
   *  walk. */
  readRuleId?: number | null;
  /** cards.read_rule_class (the set pattern tag, e.g. "*type"). */
  readRuleClass?: string | null;
  /** cards.created_at — the corpus row's literal SQL datetime. R17: the
   *  Sign up core view renders "signed up on #{format_date card.created_at}"
   *  from this column (card-mod-account set/type/signup/views.rb:35-37), so
   *  the raw-corpus seeding passes the corpus value through; unset keeps
   *  the historical seed default (2026-09-19 00:00:00.000). */
  createdAt?: string;
  /** cards.updated_at — the corpus row's literal SQL datetime (the json
   *  molecule's updated_at pin reads this column; unset keeps the
   *  historical seed default). */
  updatedAt?: string;
  /** cards.creator_id — the self_signup?/invited? input
   *  (views.rb:39-45 compares against AnonymousID). Unset keeps the
   *  historical seed default (1). */
  creatorId?: number;
  /** cards.current_revision_id — the card's last action id. The edit-form
   *  surface renders it in the conflict tracker hidden field
   *  (card.last_action_id, card-mod-edit set/all/form.rb:27-31); unset
   *  keeps the NULL default (the edit-form oracle capture normalizes the
   *  value anyway - it is seed state, not form semantics). */
  currentRevisionId?: number;
}

/** Direct INSERT (write path is another stream). Every row with a known
 *  name stores its CANONICAL key; SIDE-BACKED junction rows store the key
 *  and keep name NULL (lead option (b), 2026-09-23, refined by the R4 lane
 *  proof): the *structure rule universe statement
 *  (src/card/rules/structure.ts:82-86) composes 2-junction set anchors from
 *  the STORED key columns — with junction keys forced NULL the seeded
 *  universe measured 115 vs the corpus truth 139 (24 *structure rule sets
 *  unresolved, 17 of them type_plus_right). The KEY is stored and the NAME
 *  deliberately is not: DbLexicon.idToLex (src/card/fetch/lexicon.ts:127-144)
 *  branches on name presence — a named junction row yields a STRING lex
 *  whose cache entry the synchronous peekLex id-pair path
 *  ("L-<left>-<right>") never sees, breaking junction-chain resolution (the
 *  R3 records lane restored name+key together and regressed exactly the
 *  junction-heavy surfaces).
 *
 *  SIDE-LESS junction rows keep their stored NAME (census M3,
 *  serializer-followup2 2026-10-03): the corpus carries 23 compound-named
 *  rows with left_id/right_id NULL (all 23 named compound rows in the deck
 *  — e.g. 3265 "BW 20101222+Associations", whose +tags child 3266 the
 *  live Family+*referred_to_by search renders as a result bar). For these
 *  rows the pair-lex path the R4 proof protects cannot even form (no sides
 *  -> idToLex's pair arm would write the garbage [undefined, undefined]
 *  lex it writes today), the search-item walk (render.ts runSearch ->
 *  composeAndCacheSqlRows) can compose their names from NOTHING once the
 *  name is dropped (tryComposeSqlRowName: name null -> sides null ->
 *  unresolvable -> the row's record never composes -> the item silently
 *  vanishes from every search listing), and the live capture NAMED every
 *  card. The name is the row's only lawful source; keeping it restores
 *  exactly the corpus bytes (key === name verbatim for these rows, so the
 *  canonical key column is unchanged).
 *  the *structure rule universe statement (src/card/rules/structure.ts:82-86)
 *  composes 2-junction set anchors from the STORED key columns — with
 *  junction keys forced NULL the seeded universe measured 115 vs the corpus
 *  truth 139 (24 *structure rule sets unresolved, 17 of them
 *  type_plus_right). The KEY is stored and the NAME deliberately is not:
 *  DbLexicon.idToLex (src/card/fetch/lexicon.ts:127-144) branches on
 *  name presence — a named junction row yields a STRING lex whose cache
 *  entry the synchronous peekLex id-pair path ("L-<left>-<right>") never
 *  sees, breaking junction-chain resolution (the R3 records lane restored
 *  name+key together and regressed exactly the junction-heavy surfaces).
 *  The canonical key equals the corpus's junction key for every anonymized
 *  name (key === name verbatim there, probe-verified on all 49,809 named
 *  rows); it intentionally deviates where the corpus is uncanonical
 *  ("*type plus right" -> "*type_plu_right") because the canonical spelling
 *  is what the candidate walk (resolveStructuredContent) looks up. Fetch
 *  resolution itself is unaffected: compound marks resolve through
 *  left_id/right_id (src/card/fetch/retrieve.ts:272 + the Lexicon), never
 *  through the junction row's own key column. */
export async function seedCard(
  storage: RenderTestStorage,
  opts: SeedOptions,
): Promise<void> {
  const hasName = typeof opts.name === "string" && opts.name.length > 0;
  const isCompound = hasName && opts.name!.includes("+");
  const hasSides = opts.leftId !== undefined || opts.rightId !== undefined;
  // The name-NULL convention covers SIDE-BACKED junctions only; a side-less
  // compound row keeps its stored name (see the doc block above).
  const nameColumn = isCompound && hasSides ? null : (opts.name ?? null);
  const keyColumn = hasName
    ? (opts.key ?? DeckoName.parse(opts.name as string).key)
    : null;
  await storage.counting.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id, read_rule_class,
        read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.id ?? null,
      nameColumn,
      keyColumn,
      opts.codename ?? null,
      opts.leftId ?? null,
      opts.rightId ?? null,
      opts.currentRevisionId ?? null,
      // created_at: the corpus row's literal SQL datetime when provided
      // (the Sign up core renders "signed up on #{format_date
      // card.created_at}" from this column); the historical seed default
      // otherwise.
      opts.createdAt ?? "2026-09-19 00:00:00.000",
      opts.updatedAt ?? "2026-09-19 00:00:00.000",
      // creator_id: the invited?/self_signup? input (views.rb:39-45
      // compares against AnonymousID); historical default otherwise.
      opts.creatorId ?? 1,
      1,
      opts.readRuleClass ?? null,
      opts.readRuleId ?? null,
      null,
      opts.trash === true ? 1 : 0,
      opts.typeId ?? DEFAULT_TYPE_ID,
      opts.dbContent ?? null,
    ],
  );
  // Fixture rows land OUTSIDE the write engine, so the post-save seam
  // (CardActionEngine.expireAfterWrite) never sees them; the rule-key
  // universe cache (read-rules.ts) is per driver and would otherwise
  // answer stale for keys seeded after a first resolution. Expire here —
  // the same invalidation a committed save performs, applied at the
  // fixture seam. The staleness CONTRACT for truly raw writes is pinned
  // separately (rule-resolution-memo.test.ts uses driver.query directly).
  expireRuleResolutionCache(storage.fetcher.driver);
  // Same seam, lexicon half. A committed create runs the update_lexicon
  // store event (Ruby: mod/core/set/all/name_events.rb:76-78 -> Lexicon.add
  // -> lexicon.rb:79-82 write), which OVERWRITES both lex cache keys the
  // row now owns. A fixture INSERT cannot, so a db-confirmed negative
  // cached earlier for this id — id_to_lex caches the miss via cache.fetch
  // (lexicon.rb:101-102; src/card/fetch/lexicon.ts cacheFetch: "a stored
  // nil is a hit") — outlives the row and answers "unknown" forever. The
  // live trigger: render.ts#preloadSetRules fetches every corpus-pinned
  // RULE_TYPE_IDS_FOR_PRELOAD id (virtual-rule-card.ts:126 — the deck's
  // List=47 / Toggle=51 / HTML=50 rule-type cards) on any set-card render,
  // and a fixture that later seeds those ids (search-permission-filter's
  // twin junction 47 / "Doc Beta" 51) resolved through the stale nils.
  // Drop both keys (deleteFor = lexicon.rb:38-41 delete); the next async
  // read re-caches positives from the stored row — the same end state
  // Lexicon.add produces, reached by re-read because the side cards a
  // junction's composed name needs may not be seeded yet at this seam.
  if (opts.id !== undefined) {
    const lex: Lex | undefined =
      isCompound
        ? [opts.leftId ?? undefined, opts.rightId ?? undefined]
        : hasName
          ? opts.name!
          : undefined;
    storage.fetcher.lexicon.deleteFor(opts.id, lex);
  }
}

/** Seed one card_references row (the reference graph the read-rule cache
 *  reads; the write path builds these in another stream). Mirrors the
 *  columns the ReadRuleCache SQL selects (src/card/permissions/read-rules.ts,
 *  lib/card/rule/read_rule_cache.rb). */
export async function seedReference(
  storage: RenderTestStorage,
  refererId: number,
  refereeId: number | null,
  refereeKey: string | null,
  refType = "L",
): Promise<void> {
  await storage.counting.query(
    `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
     VALUES (?, ?, ?, ?, NULL)`,
    [refererId, refereeKey, refereeId, refType],
  );
}

/** Seed one card_acts row (lib/card/act.rb:19-23 - a group of recorded
 *  actions; `card_id` is the act's PRIMARY card, which is NOT necessarily
 *  the card any of its actions touched - the deck's act 105328 has
 *  card_id 1 while carrying the create actions for both Home (521) and
 *  the Decko logo (291)). */
export async function seedAct(
  storage: RenderTestStorage,
  opts: { id?: number; cardId?: number | null; actorId?: number | null; actedAt?: string },
): Promise<void> {
  await storage.counting.query(
    `INSERT INTO card_acts (id, card_id, actor_id, acted_at, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [
      opts.id ?? null,
      opts.cardId ?? null,
      opts.actorId ?? null,
      opts.actedAt ?? "2026-09-19 00:00:00.000",
      null,
    ],
  );
}

/** Seed one card_actions row (lib/card/action.rb:23-35 - a group of
 *  changes to ONE card within an act). `actionType` takes the STORED
 *  integer, not the Ruby symbol: TYPE_OPTIONS = %i[create update delete]
 *  (action.rb:42) and `action_type=` writes TYPE_OPTIONS.index(value)
 *  (action.rb:89-91), so create=0, update=1, delete=2 - the same codes
 *  ActionQuery#add_update_condition matches as 1 (action_query.rb:31-33). */
export async function seedAction(
  storage: RenderTestStorage,
  opts: {
    id?: number;
    cardId?: number | null;
    actId?: number | null;
    actionType?: 0 | 1 | 2;
    draft?: boolean;
    comment?: string | null;
  },
): Promise<void> {
  await storage.counting.query(
    `INSERT INTO card_actions (id, card_id, card_act_id, super_action_id, action_type, draft, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.id ?? null,
      opts.cardId ?? null,
      opts.actId ?? null,
      null,
      opts.actionType ?? 0,
      opts.draft === true ? 1 : 0,
      opts.comment ?? null,
    ],
  );
}

export type { CardsRow };

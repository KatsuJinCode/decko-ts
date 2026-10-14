// Test storage for the render-engine tests: an in-memory better-sqlite3
// database (the REAL LocalSqliteDriver) loaded with db/schema.sqlite.sql,
// plus a counting driver that measures BOTH count axes decko#1282 is
// about:
//   - statements: individual SQL statements (a batch's statements count one
//     each)
//   - roundTrips: driver calls (driver.batch = ONE round trip - on the edge
//     drivers, e.g. D1, that is literally one HTTP request; this is the
//     axis the constant-queries promise is about)
// Lives INSIDE tests/card/render. Seeded cards are written DIRECTLY as
// rows: the save/write path is out of scope here.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type {
  SQLDatabaseDriver,
  SQLQueryResult,
  SQLStatement,
  SQLTransactionGuarantee,
} from "../../../src/server/driver.js";
import type { CardsRow } from "../../../src/server/schema.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { DeckoName } from "../../../src/card/name.js";
import { ModLoader, setDefaultModLoader } from "../../../src/card/mod-loader.js";
import { expireRuleResolutionCache } from "../../../src/card/permissions/read-rules.js";
import type { Lex } from "../../../src/card/fetch/lexicon.js";

/** Quote-aware `--` comment stripping + ";" split (the DDL carries no
 *  ";" inside literals - same splitter contract as
 *  tests/card/fetch/fetch-test-storage.ts; see that file for the
 *  rationale). Trigger-aware since the deck_data_version freshness stamp
 *  (db/schema.sqlite.sql): a CREATE TRIGGER body carries ";" before its
 *  closing "END;" — while inside a body, ";" does not terminate the
 *  statement and the body ends at the bare word END. This schema's trigger
 *  bodies are single UPDATE statements with no nested BEGIN/CASE..END; the
 *  splitter deliberately does not parse deeper. */
export function splitSqlStatements(ddl: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
  let inTriggerBody = false;
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
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < ddl.length && /[A-Za-z0-9_]/.test(ddl[j])) j++;
      const word = ddl.slice(i, j).toUpperCase();
      if (!inTriggerBody && word === "BEGIN" && /CREATE\s+TRIGGER/i.test(current)) {
        inTriggerBody = true;
      } else if (inTriggerBody && word === "END") {
        inTriggerBody = false;
      }
      current += ddl.slice(i, j);
      i = j - 1;
      continue;
    }
    if (ch === ";") {
      if (inTriggerBody) {
        current += ch;
        continue;
      }
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

/** The render tests' counting wrapper: tracks statements AND round trips. */
export class CountingRenderDriver implements SQLDatabaseDriver {
  private counts: CountSnapshot = { statements: 0, roundTrips: 0 };
  readonly statements: string[] = [];

  constructor(private readonly inner: SQLDatabaseDriver) {}

  /** The wrapped driver's guarantee: saves through this wrapper are as
   *  atomic as saves through the driver it counts. */
  get transactionGuarantee(): SQLTransactionGuarantee | undefined {
    return this.inner.transactionGuarantee;
  }

  /** Present exactly when the wrapped driver's is. Statements inside the
   *  unit of work still pass through query()/batch() and are counted. */
  get transaction(): (<R>(work: () => Promise<R>) => Promise<R>) | undefined {
    const inner = this.inner;
    if (inner.transaction === undefined) return undefined;
    return <R>(work: () => Promise<R>) => inner.transaction!(work);
  }

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
  /** The stock read substrate's cards while the bootstrap still stands. A
   *  suite that seeds its own card under one of these codenames or keys
   *  supersedes the stock card (see seedCard) and the entry is removed. Undefined
   *  on a deck built with `bootstrapReadRules: false`. */
  bootstrap?: StockCard[];
  /** The stock `*all+*read` rule card's id while it stands. Dropped as soon as
   *  a deck takes over `*all` or `*read`: a deck that carries its own
   *  catch-all SET card and read SETTING brings its own rule with them, and
   *  the corpus decks do exactly that. Left standing it would be a second row
   *  on the same sides once that rule lands — the corpus seeds it after the
   *  takeover, so no collision check at takeover time can see it. */
  bootstrapRule?: number;
}

/** One card of the stock read substrate: the unique columns it occupies
 *  (codename, key, or a junction's side pair) and the id every reference to it
 *  names. The schema makes all three unique
 *  (`cards_codename_index`, `cards_key_index`, and the side pair), and a real
 *  deck has exactly one of each — so a suite that seeds its own takes the
 *  place over. */
interface StockCard {
  readonly id: number;
  readonly codename?: string;
  /** The card's stored NAME. The key column is what a seed writes, and it is
   *  the CANONICAL key, not the codename: `DeckoName.parse("Anonymous").key`
   *  is "anonymou", so a suite that seeds the same card matches on that
   *  rather than on "anonymous". */
  readonly name?: string;
  readonly leftId?: number;
  readonly rightId?: number;
}

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** The ids the bootstrap read substrate occupies. Chosen ABOVE every id the
 *  seeded decks hand out — hand-written decks use 1..~100, and the corpus
 *  decks reach 919,066 (fixtures/test-corpus) with the party codenames
 *  themselves in the 900,000s — so a suite that layers its own permission
 *  cards on this deck keeps its own ids and its own semantics: the
 *  bootstrap's `all` / `read` / `set` codename cards then sit ABOVE the
 *  suite's, and every codename lookup — statements 1..3 of
 *  readPermissionStatements — resolves `ORDER BY id LIMIT 1` to the SUITE's
 *  card, exactly as if the bootstrap were not there. */
export const BOOTSTRAP_READ_SUBSTRATE_IDS = {
  all: 10_000_001,
  set: 10_000_002,
  read: 10_000_003,
  anyone: 10_000_004,
  anonymous: 10_000_005,
  rule: 10_000_006,
} as const;

/** The stock Decko read substrate: `*all+*read` -> `[[Anyone]]`, the rule
 *  every real deck carries.
 *
 *  WHY THE SEED CARRIES IT. Ruby's `ok_to_read?` (card-mod-permissions
 *  set/all/permissions.rb:139-146) has no allowance for a deck with no read
 *  rule card: `permission_rule_id :read` resolves to nil and
 *  `Auth.as_card.read_rules_hash[nil]` is nil, so the check denies. Every
 *  real deck therefore bootstraps `*all+*read` — card/auth/setup.rb:44 does
 *  exactly this — and the anonymous viewer reads the whole deck through it.
 *  A test deck that omits it is not a shape Ruby has, and the port denies
 *  every card of it, which is correct and useless as a test bed: the 250
 *  suites below are about VIEWS, not about the absence of permission data.
 *
 *  So the shared helper seeds what Decko's setup seeds, at ids above the
 *  seeded range, and a suite that wants a different permission shape
 *  (a denial deck, a rule-less deck, a deck with `*type plus right` rules)
 *  still gets it by seeding its own cards on top — see
 *  tests/card/permissions/read-permission.test.ts for a deck that does both.
 *
 *  The rows, in Ruby's shape:
 *    *all, *read        codename cards (real.yml:55, :70)
 *    Set               the Set TYPE card, which the read-rule cache join
 *                      filters on (`sets.type_id = SetID`)
 *    Anyone/Anonymous  the two parties the anonymous viewer resolves to
 *                      (account_holder.rb:27-29, :40)
 *    *all+*read        the rule card: a junction (NULL name/key, sides only,
 *                      the 2020 Lexicon migration) whose left is the *all set
 *                      card and whose right is the *read setting, with a
 *                      card_references row naming the Anyone party — which is
 *                      what makes read_rules_hash carry it
 *                      (read_rule_cache.rb's join).
 */
/** The stock Decko read substrate: `*all+*read` -> `[[Anyone]]`, the rule
 *  every real deck carries.
 *
 *  WHY THE SEED CARRIES IT. Ruby's `ok_to_read?` (card-mod-permissions
 *  set/all/permissions.rb:139-146) has no allowance for a deck with no read
 *  rule card: `permission_rule_id :read` resolves to nil and
 *  `Auth.as_card.read_rules_hash[nil]` is nil, so the check denies. Every
 *  real deck therefore bootstraps `*all+*read` (card/auth/setup.rb:44), and
 *  the anonymous viewer reads through it. A test deck without it is not a
 *  shape Ruby has; the port denies every card of it, which is correct
 *  behaviour and useless as a test bed for views.
 *
 *  The rows, in Ruby's shape:
 *    *all, *read        codename cards (real.yml:55, :70)
 *    Set               the Set TYPE card, which the read-rule cache join
 *                      filters on (`sets.type_id = SetID`); *all is typed
 *                      with it, as a Set card is
 *    Anyone/Anonymous  the two parties the anonymous viewer resolves to
 *                      (account_holder.rb:27-29, :40)
 *    *all+*read        the rule card: a junction (NULL name/key, sides only,
 *                      the 2020 Lexicon migration) whose left is the *all set
 *                      card and whose right is the *read setting, with a
 *                      card_references row naming the Anyone party — which is
 *                      what makes read_rules_hash carry it
 *                      (read_rule_cache.rb's join).
 *
 *  A suite that wants a different permission shape still seeds its own cards
 *  on top: a rule for a specific type or set is an ordinary card, and the
 *  candidate walk resolves it before the catch-all. */
async function seedBootstrapReadSubstrate(storage: RenderTestStorage): Promise<StockCard[]> {
  const ids = BOOTSTRAP_READ_SUBSTRATE_IDS;
  // A Set card whose type is the Set TYPE card, so statement 2's
  // `sets.type_id = SetID` filter admits the rule card below.
  await seedCard(storage, { id: ids.all, name: "*all", codename: "all", typeId: ids.set });
  await seedCard(storage, { id: ids.set, name: "Set", codename: "set" });
  await seedCard(storage, { id: ids.read, name: "*read", codename: "read" });
  await seedCard(storage, { id: ids.anyone, name: "Anyone", codename: "anyone" });
  await seedCard(storage, { id: ids.anonymous, name: "Anonymous", codename: "anonymous" });
  // The rule card itself: a junction, so seedCard leaves name and key NULL
  // and the sides carry the name (*all+*read). Its own read_rule_id points at
  // itself, as a real rule card's does.
  await seedCard(storage, {
    id: ids.rule,
    leftId: ids.all,
    rightId: ids.read,
    dbContent: "[[Anyone]]",
    readRuleId: ids.rule,
    readRuleClass: "*all",
  });
  // The reference that puts the rule in read_rules_hash for Anyone: the cache
  // join reads card_references, not the rule text (read_rule_cache.rb).
  await seedReference(storage, ids.rule, ids.anyone, "anyone");
  return [
    { id: ids.all, codename: "all", name: "*all" },
    { id: ids.set, codename: "set", name: "Set" },
    { id: ids.read, codename: "read", name: "*read" },
    { id: ids.anyone, codename: "anyone", name: "Anyone" },
    { id: ids.anonymous, codename: "anonymous", name: "Anonymous" },
    // The rule card is a junction, so what it occupies is its SIDE PAIR, not
    // a codename or key: a suite seeding its own `*all+*read` is seeding the
    // deck's one such row and the stock one steps aside.
    { id: ids.rule, leftId: ids.all, rightId: ids.read },
  ];
}

/** The key a seeded row would carry: the explicit key when the suite gives
 *  one, otherwise the canonical key of the name (what seedCard writes). */
function stockKeyOf(opts: SeedOptions): string | undefined {
  if (typeof opts.key === "string") return opts.key;
  if (typeof opts.name === "string" && opts.name.length > 0) return DeckoName.parse(opts.name).key;
  return undefined;
}

/** Release the stock card's codename and key so a suite's card can take
 *  either. The schema makes both unique (`cards_codename_index`,
 *  `cards_key_index`), and a real deck has exactly one of each — so a suite
 *  that seeds its own `*all` IS the deck's `*all` card, and the stock one
 *  steps aside.
 *
 *  The stock ROW is kept until repointStockReferences has moved everything
 *  that names it onto the suite's card; only the unique columns are cleared,
 *  which is what the indexes are about. Returns the displaced stock id, or
 *  undefined when there is nothing to displace. */
async function releaseStockCard(
  storage: RenderTestStorage,
  opts: SeedOptions,
): Promise<number | undefined> {
  const stock = storage.bootstrap;
  if (stock === undefined) return undefined;
  // A junction's stock sides are NOT the ones the suite is about to name: the
  // suite takes the `*all` and `*read` codenames over first, which repoints
  // the stock rule onto ITS cards, so by the time the suite seeds its own
  // rule the stock row's sides are the suite's. Read them back rather than
  // matching the ids the bootstrap was built with.
  let junctionStock: { index: number; leftId: number | null; rightId: number | null } | undefined;
  if (opts.leftId !== undefined && opts.rightId !== undefined) {
    const junctionIndex = stock.findIndex((card) => card.leftId !== undefined && card.rightId !== undefined);
    if (junctionIndex >= 0) {
      const rows = await storage.counting.query<{ left_id: number | null; right_id: number | null }>(
        `SELECT left_id, right_id FROM cards WHERE id = ?`,
        [stock[junctionIndex]!.id],
      );
      junctionStock = { index: junctionIndex, leftId: rows.rows[0]?.left_id ?? null, rightId: rows.rows[0]?.right_id ?? null };
    }
  }
  const index = stock.findIndex(
    (card) =>
      (opts.codename !== undefined && opts.codename !== null && card.codename === opts.codename) ||
      (card.name !== undefined && stockKeyOf(opts) !== undefined && stockKeyOf(opts) === DeckoName.parse(card.name).key) ||
      (junctionStock !== undefined &&
        junctionStock.index === stock.indexOf(card) &&
        junctionStock.leftId === opts.leftId &&
        junctionStock.rightId === opts.rightId),
  );
  if (index < 0) return undefined;
  const [displaced] = stock.splice(index, 1);
  // Clear every unique column the displaced card occupies, and only those the
  // suite's card takes over: a codename card holds a codename and a key, a
  // junction holds its side pair. The match above may have been on EITHER
  // (a codename card is also matched by the key of the name a suite seeds, so
  // seeding `*read` alone displaces the stock `*read` codename card), and
  // clearing a column the suite does not take would strand the live rule on
  // it: the permission statements resolve the rule's setting through the
  // 'read' codename (read-rules.ts readPermissionStatements, statement 2) and
  // its set through the 'set' codename, so a codename released without a
  // replacement makes the catch-all unresolvable and the deck denies every
  // card, as Ruby does on a deck with no read rule (permissions.rb:139-146).
  // The ROW stays until repointStockReferences has moved what names it.
  const columns: Array<string | undefined> = ["codename = NULL", "key = NULL", "left_id = NULL", "right_id = NULL"];
  if (stockKeyOf(opts) === undefined) columns[1] = undefined;
  if (junctionStock === undefined) {
    columns[2] = undefined;
    columns[3] = undefined;
  } else {
    if (opts.leftId !== junctionStock.leftId) columns[2] = undefined;
    if (opts.rightId !== junctionStock.rightId) columns[3] = undefined;
  }
  const sets = columns.filter((column): column is string => column !== undefined).join(", ");
  if (sets !== "") {
    await storage.counting.query(`UPDATE cards SET ${sets} WHERE id = ?`, [displaced!.id]);
  }
  return displaced!.id;
}

/** Move every reference to a displaced stock card onto the card that replaced
 *  it, then remove the stock row. Runs after the suite's row is inserted, so
 *  its id is known.
 *
 *  A repoint that would land a row on sides another row already occupies is
 *  NOT applied — the whole stock subtree goes instead. That is not a loss: the
 *  corpus decks carry their own `*all+*read`, and taking their `*all` and
 *  `*read` over moves the stock rule onto the sides their own rule already
 *  occupies, so that deck already has the rule the stock one stood in for.
 *  The check is made BEFORE any write, so nothing is left half-moved. */
async function repointStockReferences(
  storage: RenderTestStorage,
  stockId: number,
  replacementId: number,
): Promise<void> {
  const drop = async (): Promise<void> => {
    await storage.counting.query(`DELETE FROM cards WHERE id = ?`, [stockId]);
    if (storage.bootstrapRule !== undefined) {
      await storage.counting.query(`DELETE FROM cards WHERE id = ?`, [storage.bootstrapRule]);
      storage.bootstrapRule = undefined;
    }
    storage.fetcher.lexicon.deleteFor(stockId, undefined);
  };
  // Every row that names the displaced card on either side would move onto the
  // replacement's id; check each one's target pair for an occupant first.
  const dependents = await storage.counting.query<{ id: number; left_id: number | null; right_id: number | null }>(
    `SELECT id, left_id, right_id FROM cards
     WHERE (left_id = ? OR right_id = ?) AND id <> ?`,
    [stockId, stockId, stockId],
  );
  for (const row of dependents.rows) {
    const newLeft = row.left_id === stockId ? replacementId : row.left_id;
    const newRight = row.right_id === stockId ? replacementId : row.right_id;
    if (newLeft === null || newRight === null) continue;
    const occupant = await storage.counting.query<{ id: number }>(
      `SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND id <> ?`,
      [newLeft, newRight, row.id],
    );
    if (occupant.rows.length > 0) {
      await drop();
      return;
    }
  }
  await storage.counting.query(`UPDATE cards SET left_id = ? WHERE left_id = ?`, [replacementId, stockId]);
  await storage.counting.query(`UPDATE cards SET right_id = ? WHERE right_id = ?`, [replacementId, stockId]);
  await storage.counting.query(`UPDATE cards SET type_id = ? WHERE type_id = ?`, [replacementId, stockId]);
  await storage.counting.query(
    `UPDATE card_references SET referee_id = ? WHERE referee_id = ?`,
    [replacementId, stockId],
  );
  await storage.counting.query(`DELETE FROM cards WHERE id = ?`, [stockId]);
  storage.fetcher.lexicon.deleteFor(stockId, undefined);
}

/** Seed the stock Decko read substrate onto a deck this module did not
 *  build. For the suites that construct their own driver — because they
 *  record statements, or count round trips, or wrap the driver — and so
 *  cannot go through createRenderTestStorage: without a catch-all read rule
 *  every card of their deck denies, which no real deck does. The same rows
 *  the factory seeds, through the same seedCard seam, so a suite that seeds
 *  its own `*all` still takes the codename over. */
export async function seedStockReadSubstrate(
  storage: Pick<RenderTestStorage, "counting" | "fetcher">,
): Promise<void> {
  await seedBootstrapReadSubstrate(storage as RenderTestStorage);
}

/** Fresh in-memory database + FetchEngine + RenderEngine over the counting
 *  driver, carrying the stock Decko read substrate.
 *
 *  `bootstrapReadRules: false` builds the deck a real Decko never is: one with
 *  no read rule card at all. Ruby denies every card of it, and the port does
 *  too; the tests that pin that denial ask for this deck explicitly. */
export async function createRenderTestStorage(
  opts: { bootstrapReadRules?: boolean } = {},
): Promise<RenderTestStorage> {
  const driver = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8");
  for (const statement of splitSqlStatements(ddl)) {
    await driver.query(statement, []);
  }
  const counting = new CountingRenderDriver(driver);
  const fetcher = new FetchEngine(counting);
  // The engine is constructed BEFORE the bootstrap seed, not after: the
  // original order left `storage.engine` undefined while seedCard ran, and
  // a suite whose seed touches the engine (a mod loader registering, a
  // prefetch warm-up) read that undefined. Constructing it first changes
  // nothing about the deck — RenderEngine reads storage lazily.
  const engine = new RenderEngine(fetcher);
  const storage: RenderTestStorage = {
    engine,
    fetcher,
    counting,
    close: () => driver.close(),
  };
  if (opts.bootstrapReadRules !== false) {
    storage.bootstrap = await seedBootstrapReadSubstrate(storage);
    storage.bootstrapRule = BOOTSTRAP_READ_SUBSTRATE_IDS.rule;
  }
  expireRuleResolutionCache(fetcher.driver);
  return storage;
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

/** Render one view through the loader-less dispatch: the shared view
 *  record, which carries a loaded mod's all-set and abstract-set
 *  registrations. For probe cards that stand in for a card of an including
 *  set without being in one: a chain-bound engine gives an abstract
 *  module's views only to the sets that include it (include_set, resolved
 *  by ModLoader#viewChain), and falls back to the compiled base table. */
export async function renderThroughRecord(
  storage: RenderTestStorage,
  name: string,
  view: string,
): Promise<string> {
  const bound = storage.engine.modLoader;
  storage.engine.modLoader = undefined;
  try {
    return await storage.engine.render(name, view);
  } finally {
    storage.engine.modLoader = bound;
  }
}

const DEFAULT_TYPE_ID = 2;

export interface SeedOptions {
  id?: number;
  /** Junction rows carry their name/key too (see seedCard) — the seeded
   *  reference rows store them; only callers seeding a bare junction by
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
   *  set/all/permissions.rb:1-5; the permission check reads it at render
   *  time). Null/unset = the engine falls back to the live rule walk. */
  readRuleId?: number | null;
  /** cards.read_rule_class (the set pattern tag, e.g. "*type"). */
  readRuleClass?: string | null;
  /** cards.created_at — the seeded row's literal SQL datetime. The Sign up
   *  core view renders "signed up on #{format_date card.created_at}"
   *  from this column (card-mod-account set/type/signup/views.rb:35-37),
   *  so callers seeding real datetimes pass them through; unset keeps
   *  the historical seed default (2026-09-19 00:00:00.000). */
  createdAt?: string;
  /** cards.updated_at — the seeded row's literal SQL datetime (the json
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
   *  keeps the NULL default (the edit-form comparison normalizes the
   *  value anyway - it is seed state, not form semantics). */
  currentRevisionId?: number;
}

/** Direct INSERT (write path is out of scope here). Every row with a known
 *  name stores its CANONICAL key; SIDE-BACKED junction rows store the key
 *  and keep name NULL: the *structure rule universe statement
 *  (src/card/rules/structure.ts:82-86) composes 2-junction set anchors from
 *  the STORED key columns, so those keys must be present. The KEY is
 *  stored and the NAME deliberately is not for these rows:
 *  DbLexicon.idToLex (src/card/fetch/lexicon.ts:127-144) branches on name
 *  presence — a named junction row yields a STRING lex whose cache entry
 *  the synchronous peekLex id-pair path ("L-<left>-<right>") never sees,
 *  breaking junction-chain resolution.
 *
 *  SIDE-LESS junction rows keep their stored NAME: with no sides, the
 *  pair-lex path cannot even form (idToLex's pair arm would write the
 *  garbage [undefined, undefined] lex), and the search-item walk
 *  (render.ts runSearch -> composeAndCacheSqlRows) can compose such a
 *  row's name from NOTHING once the name is dropped
 *  (tryComposeSqlRowName: name null -> sides null -> unresolvable -> the
 *  row's record never composes -> the item silently vanishes from every
 *  search listing). The name is the row's only source; for these rows
 *  key === name verbatim, so the canonical key column is unchanged. The
 *  canonical spelling is what the candidate walk (resolveStructuredContent)
 *  looks up, so it intentionally deviates where source data spells a name
 *  uncanonically. Fetch resolution itself is unaffected: compound marks
 *  resolve through left_id/right_id (src/card/fetch/retrieve.ts:272 + the
 *  Lexicon), never through the junction row's own key column. */
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
  // A codename or key the stock read substrate holds: the stock card steps
  // aside first (its references move once this row has its id — see below).
  const displacedStockId = await releaseStockCard(storage, opts);
  // A deck that brings its own `*all+*read` is the deck's catch-all rule, and
  // the stock rule — repointed onto those sides when the deck took over `*all`
  // and `*read` — is now a second row on them. The suite's rule lands after
  // the takeover, so the only moment to see the pair is here. The stock row
  // goes; the deck keeps the rule it brought.
  if (
    storage.bootstrapRule !== undefined &&
    opts.leftId !== undefined &&
    opts.rightId !== undefined
  ) {
    const stockRule = await storage.counting.query<{ left_id: number | null; right_id: number | null }>(
      `SELECT left_id, right_id FROM cards WHERE id = ?`,
      [storage.bootstrapRule],
    );
    if (stockRule.rows[0]?.left_id === opts.leftId && stockRule.rows[0]?.right_id === opts.rightId) {
      await storage.counting.query(`DELETE FROM cards WHERE id = ?`, [storage.bootstrapRule]);
      storage.bootstrapRule = undefined;
    }
  }
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
      // created_at: the seeded row's literal SQL datetime when provided
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
  if (displacedStockId !== undefined) {
    const inserted = await storage.counting.query<{ id: number }>(
      `SELECT last_insert_rowid() AS id`,
      [],
    );
    const replacementId = opts.id ?? inserted.rows[0]?.id;
    if (typeof replacementId === "number") {
      // A suite's `*all` is the deck's catch-all SET card, and a set card is
      // typed with the deck's Set TYPE card — that type is what the read-rule
      // cache join filters on (`sets.type_id = SetID`). When the suite brings
      // its own `*all` but no `set`, the stock Set TYPE card is still this
      // deck's, so the takeover carries its id across; the suite's own type
      // convention is not a Set type and would silently drop the catch-all
      // out of read_rules_hash. When the suite brings its own `set` too, both
      // cards are its own and this does not apply.
      if (
        opts.codename === "all" &&
        storage.bootstrap !== undefined &&
        storage.bootstrap.some((card) => card.codename === "set")
      ) {
        await storage.counting.query(
          `UPDATE cards SET type_id = ? WHERE id = ?`,
          [BOOTSTRAP_READ_SUBSTRATE_IDS.set, replacementId],
        );
      }
      await repointStockReferences(storage, displacedStockId, replacementId);
    }
  }
  expireRuleResolutionCache(storage.fetcher.driver);
  // The render engine's deck-wide rule lookup hash (Ruby's Rule::Cache,
  // cache.rb) is the same kind of per-deck memo: a committed save clears it
  // (Card::Rule.clear_rule_cache), so a fixture row inserted after the first
  // rule walk must clear it here too.
  storage.engine.expireRuleCache();
  // Same seam, lexicon half. A committed create runs the update_lexicon
  // store event (Ruby: mod/core/set/all/name_events.rb:76-78 -> Lexicon.add
  // -> lexicon.rb:79-82 write), which OVERWRITES both lex cache keys the
  // row now owns. A fixture INSERT cannot, so a db-confirmed negative
  // cached earlier for this id — id_to_lex caches the miss via cache.fetch
  // (lexicon.rb:101-102; src/card/fetch/lexicon.ts cacheFetch: "a stored
  // nil is a hit") — outlives the row and answers "unknown" forever. The
  // live trigger: render.ts#preloadSetRules fetches the
  // RULE_TYPE_IDS_FOR_PRELOAD ids (virtual-rule-card.ts:126 — the List /
  // Toggle / HTML rule-type cards) on any set-card render, and a fixture
  // that later seeds one of those ids resolved through the stale nils.
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
 *  reads; the write path builds these in the save flow). Mirrors the
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
 *  the card any of its actions touched - a single act can carry the create
 *  actions of several different cards while pointing its own card_id at
 *  none of them). */
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

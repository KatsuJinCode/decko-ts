// The fetch/cache layer: TypeScript port of card-1.110.0's Card.fetch.
//
// Ruby module -> file map (every method cites its source; the full trail
// with semantics lives in docs/fetch-port-notes.md):
// - lib/card/fetch.rb                 -> FetchEngine.fetch / option handling
// - lib/card/fetch/retrieve.rb        -> src/card/fetch/retrieve.ts
// - lib/card/fetch/store.rb           -> updateCache / newForCache below
// - lib/card/fetch/results.rb         -> results / newResultCard below
// - lib/card/fetch/card_class.rb      -> fetchById/ByName/ByKey, quickFetch,
//                                        cardId, fetchTypeId, expireName
// - lib/card/fetch/all.rb             -> Card#fetch field traversal (deferred:
//                                        needs real card instances)
// - lib/card/cache.rb + temporary.rb
//   + shared.rb + class_methods.rb     -> src/card/fetch/cache.ts
// - lib/card/cache/card_class.rb      -> retrieveFromCache*/writeToCache* below
// - lib/card/cache/all.rb             -> expireCard below
// - lib/card/lexicon.rb               -> src/card/fetch/lexicon.ts
// - lib/card/codename.rb              -> src/card/fetch/codename.ts
//
// Scoping of the fetch cache (the question this port had to answer from the
// source): Card.fetch reads and writes Card::Cache[Card], which is TWO
// levels (lib/card/cache.rb module doc):
// - Temporary: a per-process (per-request/script) Hash, often "ahead" of
//   the db (unsaved alterations survive a fetch round-trip).
// - Shared: cross-process, mirrors the db, stamp-prefixed keys.
// Reads go temp-first then shared (cache.rb#read); writes hit both
// (cache.rb#write) except :local_only fetches, which write temp only
// (cache/card_class.rb#write_to_cache). The cache is keyed by card KEY
// (cache/card_class.rb#write_to_cache: `cache.write card.key, card`); id
// lookups go through the Lexicon (cache/card_class.rb#retrieve_from_cache_by_id).
// Invalidation is event-driven: saves expire via Card#expire
// (lib/card/cache/all.rb) - key versions (name + name_before_act), the
// legacy "~id" key, view caches (render wave) and the left card of compound
// names. There is no TTL; reset rotates the shared stamp / clears temp.

import { CardCache, type SharedCacheStore } from "./fetch/cache.js";
import { DbLexicon, cacheKey as lexiconCacheKey } from "./fetch/lexicon.js";
import { DbCodenameRegistry, CODENAMES_CACHE_KEY } from "./fetch/codename.js";
import {
  composeCardRecord,
  newCardRecord,
  isKnownCard,
  isNewCard,
  idString,
  type CardRecord,
} from "./fetch/card-record.js";
import {
  normalizeMark,
  retrieveFromDb,
  type FetchArg,
  type FetchMark,
} from "./fetch/retrieve.js";
import type { SQLDatabaseDriver } from "../server/driver.js";
import { DeckoName, type Nameish } from "./name.js";
import { setNameEnvironment, type NameEnvironment } from "./name/environment.js";

/** The fetch options (fetch/card_class.rb:21-29 doc + option readers in
 *  fetch.rb). `new` opts cross into the write path; only the parts fetch
 *  itself needs are modeled here (see the deferral notes). */
export interface FetchOptions {
  /** Real cards only (Card[mark] uses this, card_class.rb:42-44). */
  skipVirtual?: boolean;
  /** Don't load Set modules - a no-op in this port until the rules wave
   *  lands set modules; accepted for API parity. */
  skipModules?: boolean;
  /** Return trashed card objects (fetch.rb:49-51). */
  lookInTrash?: boolean;
  /** Use only the local (temporary) cache for lookup and storing. */
  localOnly?: boolean;
  /** fetch.rb:53-55 - also skips the new_for_cache type lookup. */
  skipTypeLookup?: boolean;
  /** store.rb:30-32 eager_caching? - merge type attrs into placeholders. */
  eagerCache?: boolean;
  /** Return a new card when not found (the fetch-side of fetch-or-new;
   *  actually SAVING is write-path). */
  new?: NewCardOptions;
}

export interface NewCardOptions {
  /** fetch.rb:36-41 normalize_mark absolutizes name marks against it. */
  supercard?: Nameish;
  /** store.rb:26 eager_cache type merge / results.rb type handling. */
  typeId?: number;
  /** Ruby's :type / :type_code new-opts (results.rb:80, 112). */
  typeCode?: string;
  typeName?: Nameish;
  /** results.rb:85-87 assignable_content. */
  content?: string;
  defaultContent?: string;
  /** results.rb:57-60 quick_renew name override. */
  name?: Nameish;
}

const DEFAULT_DATABASE_NAME = "decko";

export class FetchEngine {
  readonly driver: SQLDatabaseDriver;
  /** Card::Cache[Card] */
  readonly cardCache: CardCache;
  /** Card::Cache[Lexicon] - a separate cache instance per Ruby class
   *  (cache/class_methods.rb#[] cache_by_class). */
  readonly lexiconCache: CardCache;
  readonly lexicon: DbLexicon;
  readonly codenames: DbCodenameRegistry;

  constructor(
    driver: SQLDatabaseDriver,
    opts: {
      sharedStore?: SharedCacheStore;
      database?: string;
      maxTemporaryCacheKeys?: number;
    } = {},
  ) {
    this.driver = driver;
    this.cardCache = new CardCache({
      className: "Card",
      sharedStore: opts.sharedStore,
      database: opts.database ?? DEFAULT_DATABASE_NAME,
      maxTemporaryKeys: opts.maxTemporaryCacheKeys,
    });
    this.lexiconCache = new CardCache({
      className: "Lexicon",
      sharedStore: opts.sharedStore,
      database: opts.database ?? DEFAULT_DATABASE_NAME,
      maxTemporaryKeys: opts.maxTemporaryCacheKeys,
    });
    this.lexicon = new DbLexicon(driver, this.lexiconCache);
    this.codenames = new DbCodenameRegistry(driver, this.cardCache, this.lexicon);
    // Cache::CardClass#after_write_to_temp_cache (cache/card_class.rb:9-11):
    // every temp-cache write of a CARD also writes the lexicon
    // (Cache::All#write_lexicon, cache/all.rb:5-15).
    this.cardCache.afterWriteToTempCache = (value) => {
      if (isCardValue(value)) this.writeLexiconTemp(value);
    };
  }

  // ---------------------------------------------------------------------
  // fetch.rb#retrieve_or_new
  // ---------------------------------------------------------------------

  /**
   * Card.fetch(*marks, opts?) - look for a card in cache, then database,
   * then (virtual/new) results. A trailing plain object is the options
   * hash, exactly as Ruby pops it (fetch.rb#normalize_args). Returns
   * undefined for unknown cards without `new:` opts (Ruby nil); raises
   * NameNotFoundError / CodenameNotFoundError for bad marks.
   */
  async fetch(...args: readonly (FetchArg | FetchOptions)[]): Promise<CardRecord | undefined> {
    const { marks, opts } = splitArgs(args);
    return this.fetchWithOptions(marks, opts);
  }

  /** fetch with explicit options (the form callers should prefer in TS). */
  async fetchWithOptions(
    marks: readonly FetchArg[],
    opts: FetchOptions = {},
  ): Promise<CardRecord | undefined> {
    // fetch.rb:43-47 validate_opts!
    if (opts.new !== undefined && opts.skipVirtual === true) {
      throw new Error("fetch called with new args and skip_virtual");
    }

    const mark = await normalizeMark(
      marks,
      { newSupercardName: opts.new?.supercard },
      this.lexicon,
      this.codenames,
    );
    if (mark === undefined) return undefined;

    // fetch.rb:34-36 rescue ActiveModel::RangeError -> Card.new(name:
    // "card id out of range: ...") - returned directly, without passing
    // through results (Ruby's rescue RETURNS the new card). Ruby's f.mark
    // here is the integer itself, so the name carries bare digits.
    if (mark.kind === "outOfRange") {
      return newCardRecord(DeckoName.parse(`card id out of range: ${mark.digits}`));
    }

    const retrieved = await this.retrieveExisting(mark, opts); // fetch.rb:17
    return this.updateCache(mark, retrieved, opts); // fetch.rb:18-19
  }

  // ---------------------------------------------------------------------
  // fetch/retrieve.rb
  // ---------------------------------------------------------------------

  /** retrieve.rb#retrieve_existing: cache first, then db; a blank mark
   *  retrieves nothing (retrieve.rb:7-9 `return unless mark.present?`). */
  private async retrieveExisting(
    mark: FetchMark,
    opts: FetchOptions,
  ): Promise<{ card: CardRecord | undefined; freshFromDb: boolean }> {
    if (mark.kind === "name" && mark.name.s === "") return { card: undefined, freshFromDb: false };
    const fromCache = await this.retrieveFromCache(mark, opts);
    if (fromCache !== undefined) return { card: fromCache, freshFromDb: false };
    const { row, freshFromDb } = await retrieveFromDb(
      this.driver,
      mark,
      { lookInTrash: opts.lookInTrash === true },
      this.lexicon,
    );
    if (row === undefined) return { card: undefined, freshFromDb: false };
    // retrieve.rb:24: @fresh_from_db = true if card.present? && !card.trash
    return { card: await composeCardRecord(row, this.lexicon), freshFromDb };
  }

  /** retrieve.rb#retrieve_from_cache. look_in_trash drops cached new?
   *  cards so the db version is fetched (retrieve.rb:15-17 and its
   *  comment: "don't return cached cards if looking in trash - we want
   *  the db version"). */
  private async retrieveFromCache(
    mark: FetchMark,
    opts: FetchOptions,
  ): Promise<CardRecord | undefined> {
    const localOnly = opts.localOnly === true;
    let card: CardRecord | undefined;
    if (mark.kind === "id") {
      card = await this.retrieveFromCacheById(mark.id, localOnly);
    } else if (mark.kind === "name") {
      card = this.retrieveFromCacheByKey(mark.name.key, localOnly);
    }
    if (card !== undefined && isNewCard(card) && opts.lookInTrash === true) {
      return undefined;
    }
    return card;
  }

  /** cache/card_class.rb#retrieve_from_cache (13-15) + #retrieve_from_cache_by_key (24-26). */
  retrieveFromCacheByKey(key: string, localOnly = false): CardRecord | undefined {
    const value = localOnly ? this.cardCache.temp.read(key) : this.cardCache.read(key);
    return isCardValue(value) ? value : undefined;
  }

  /** cache/card_class.rb#retrieve_from_cache_by_id (17-22): ids resolve to
   *  names through the Lexicon, then read by key. `key.present?` guards. */
  async retrieveFromCacheById(id: number, localOnly = false): Promise<CardRecord | undefined> {
    const name = await this.lexicon.name(id);
    if (name === undefined || name.key === "") return undefined;
    return this.retrieveFromCacheByKey(name.key, localOnly);
  }

  // ---------------------------------------------------------------------
  // fetch/store.rb
  // ---------------------------------------------------------------------

  /** fetch.rb:18-19 update_cache + results, with store.rb#new_for_cache
   *  running inside update_cache?'s evaluation (Ruby's update_cache?
   *  calls new_for_cache, which ASSIGNS @card when it instantiates a
   *  placeholder). needs_prep? (store.rb:38-42) exists to pre-compute
   *  set-pattern modules before caching; with set modules deferred to the
   *  rules wave every TS card is already "prepped", so that branch is
   *  observable-behavior-equivalent to false (a cached real card and a
   *  freshly prepped one are indistinguishable without modules). */
  private updateCache(
    mark: FetchMark,
    retrieved: { card: CardRecord | undefined; freshFromDb: boolean },
    opts: FetchOptions,
  ): CardRecord | undefined {
    let card = retrieved.card;
    let createdPlaceholder = false;
    if (this.newForCacheApplies(mark, card, opts)) {
      card = this.instantiatePlaceholder(mark as MarkWithName, opts);
      createdPlaceholder = true;
    }
    // store.rb#update_cache? (12-14): (fresh_from_db? || new_for_cache ||
    // needs_prep?) && !card&.uncacheable?
    if ((retrieved.freshFromDb || createdPlaceholder) && card !== undefined && !card.uncacheable) {
      this.storeCard(card, opts); // store.rb:8-9 Card.write_to_cache card, local_only?
    }
    return this.results(card, mark, opts); // fetch.rb:19
  }

  /** store.rb#reusable? (48-50): !(mark.is_a?(Integer) || (mark.blank? && !opts[:new])). */
  private reusable(mark: FetchMark, opts: FetchOptions): boolean {
    if (mark.kind !== "name") return false;
    return !(mark.name.s === "" && opts.new === undefined);
  }

  /** store.rb#new_card_needed? (44-46):
   *  !(card.present? && (card.type_id.present? || skip_type_lookup?)). */
  private newCardNeeded(card: CardRecord | undefined, opts: FetchOptions): boolean {
    return !(card !== undefined && (card.typeId !== undefined || opts.skipTypeLookup === true));
  }

  /** store.rb#new_for_cache? (34-36). */
  private newForCacheApplies(
    mark: FetchMark,
    card: CardRecord | undefined,
    opts: FetchOptions,
  ): boolean {
    return this.reusable(mark, opts) && this.newCardNeeded(card, opts);
  }

  /** store.rb#new_for_cache (21-28): `Card.new name: mark, skip_modules:
   *  true`, with the type attrs merged only when eager_caching? (30-32:
   *  eager_cache + name mark + absolute + new opts present). The
   *  placeholder is cached by key, which is how the Ruby shared cache ends
   *  up holding "missing" cards (lib/card/cache/shared.rb module doc). */
  private instantiatePlaceholder(mark: MarkWithName, opts: FetchOptions): CardRecord {
    const newOpts = opts.new;
    const eager =
      opts.eagerCache === true && newOpts !== undefined && mark.name.isAbsolute;
    return newCardRecord(
      mark.name,
      eager ? { typeId: newOpts?.typeId, content: newOpts?.content } : {},
    );
  }

  /** store.rb:8-9 via cache/card_class.rb#write_to_cache. */
  private storeCard(card: CardRecord, opts: FetchOptions): void {
    if (card.uncacheable) return; // store.rb:13 !card&.uncacheable?
    this.writeToCache(card, opts.localOnly === true);
  }

  // ---------------------------------------------------------------------
  // fetch/results.rb
  // ---------------------------------------------------------------------

  /** results.rb#results. */
  private results(
    card: CardRecord | undefined,
    mark: FetchMark,
    opts: FetchOptions,
  ): CardRecord | undefined {
    if (card === undefined) return undefined;
    return isNewCard(card) ? this.newResultCard(card, mark, opts) : this.finalizeResultCard(card);
  }

  /** results.rb#finalize_result_card: include_set_modules unless
   *  skip_modules? - set modules do not exist in this port yet (rules
   *  wave); the step is an identity function here. */
  private finalizeResultCard(card: CardRecord): CardRecord {
    return card;
  }

  /** results.rb#new_result_card (16-23). */
  private newResultCard(
    card: CardRecord,
    mark: FetchMark,
    opts: FetchOptions,
  ): CardRecord | undefined {
    const newOpts = opts.new;
    let effective = card;
    if (newOpts !== undefined) {
      // results.rb#with_new_card (25-34): quick_renew || renew
      const markName = mark.kind === "name" ? mark.name : DeckoName.parse("");
      if (!this.quickRenew(effective, markName, newOpts, opts)) {
        effective = this.renew(effective, markName, newOpts);
      }
    } else if (opts.skipVirtual === true) {
      return undefined; // results.rb:28-30
    } else {
      this.assignName(effective, mark, opts); // results.rb:30-32
    }
    this.finalizeResultCard(effective);
    // results.rb:19-21: card if new_opts || card.known?
    return newOpts !== undefined || isKnownCard(effective) ? effective : undefined;
  }

  /** results.rb#quick_renew (53-60) + #quick_renew? (69-76): blank new
   *  opts (the `new: {}` idiom) just assign the name; otherwise decline
   *  when the type or name changes or when fancy (unhandled) opts appear -
   *  those need renew. */
  private quickRenew(
    card: CardRecord,
    mark: DeckoName,
    newOpts: NewCardOptions,
    opts: FetchOptions,
  ): boolean {
    if (Object.keys(newOpts).length === 0) {
      // results.rb:70-71 `return true if new_opts.blank?` ->
      // update_supercard (write-path; no-op without one) + assign_name
      const requested = newOpts.name !== undefined ? DeckoName.parse(newOpts.name) : undefined;
      this.assignName(
        card,
        { kind: "name", name: requested !== undefined && requested.s !== "" ? requested : mark },
        opts,
      );
      return true;
    }
    if (this.typeChange(card, newOpts)) return false; // results.rb:71
    if (this.nameChange(card, newOpts, mark)) return false; // results.rb:72
    if (this.fancyRenew(newOpts)) return false; // results.rb:73
    this.quickContent(card, newOpts); // results.rb:74
    return true;
  }

  /** results.rb#renew (37-43) + #newish_opts (44-50): dup the card and
   *  apply the new-opts attributes. The cached placeholder (already
   *  written by update_cache) is left pristine - Ruby dups for the same
   *  reason. Port scope: name/type/content; the full Card.new machinery
   *  (handle_type validation, supercard wiring, subcards) is write-path. */
  private renew(card: CardRecord, mark: DeckoName, newOpts: NewCardOptions): CardRecord {
    const requestedName =
      newOpts.name !== undefined ? DeckoName.parse(newOpts.name) : mark; // reverse_merge name: mark
    const renewed: CardRecord = { ...card };
    if (requestedName.s !== (card.name?.s ?? "")) {
      renewed.name = requestedName;
      renewed.key = requestedName.key;
    }
    const content = this.assignableContent(card, newOpts);
    if (content !== undefined) renewed.dbContent = content;
    // type attrs (results.rb:80,112) - resolved like extract_type_id
    // (mod/core/set/all/type.rb:96-107): type_id first, then type_code via
    // the codename registry, then type name via the lexicon. Unknown types
    // leave typeId nil; validation is write-path.
    if (newOpts.typeId !== undefined) {
      renewed.typeId = newOpts.typeId;
    }
    return renewed;
  }

  /** results.rb#type_change? (101-109): a nil type_id is always a type
   *  change; otherwise compare against new opts. supercard-dependent type
   *  changes (supercard_might_change_type?, 116-120) need the rules wave. */
  private typeChange(card: CardRecord, newOpts: NewCardOptions): boolean {
    if (card.typeId === undefined) return true;
    return newOpts.typeId !== undefined && newOpts.typeId !== card.typeId;
  }

  /** results.rb#name_change? (95-100): relative new names don't count as
   *  changes against absolute marks. */
  private nameChange(card: CardRecord, newOpts: NewCardOptions, mark: DeckoName): boolean {
    if (newOpts.name === undefined) return false;
    const newName = DeckoName.parse(newOpts.name);
    if (newName.isRelative && mark.isAbsolute) return false;
    return newName.s !== (card.name?.s ?? "");
  }

  /** results.rb#fancy_renew? (79-83): opts beyond the handled set need the
   *  full renew. The handled set here is the TS NewCardOptions surface
   *  (Ruby's: supercard, name, type_id, type, type_code, content,
   *  default_content). */
  private fancyRenew(newOpts: NewCardOptions): boolean {
    const handled = new Set(["supercard", "name", "typeId", "typeCode", "typeName", "content", "defaultContent"]);
    return Object.keys(newOpts).some((key) => !handled.has(key));
  }

  /** results.rb#assignable_content (85-87) + #quick_content (89-93). */
  private assignableContent(card: CardRecord, newOpts: NewCardOptions): string | undefined {
    if (newOpts.content !== undefined) return newOpts.content;
    const dbContent = card.dbContent ?? "";
    if (dbContent === "" && newOpts.defaultContent !== undefined) return newOpts.defaultContent;
    return undefined;
  }

  private quickContent(card: CardRecord, newOpts: NewCardOptions): void {
    const content = this.assignableContent(card, newOpts);
    if (content !== undefined) card.dbContent = content;
  }

  /** results.rb#assign_name (126-131). */
  private assignName(card: CardRecord, mark: FetchMark, opts: FetchOptions): void {
    if (opts.localOnly === true) return;
    const requested = mark.kind === "name" ? mark.name : undefined;
    if (requested === undefined) return;
    if (requested.s === (card.name?.s ?? "")) return;
    card.name = requested;
    card.key = requested.key;
  }

  // ---------------------------------------------------------------------
  // fetch/card_class.rb - attribute fetchers
  // ---------------------------------------------------------------------

  /** Fetch by integer id (the {id:} retrieval path). */
  async fetchById(id: number, opts: FetchOptions = {}): Promise<CardRecord | undefined> {
    return this.fetchWithOptions([id], opts);
  }

  /** Fetch by canonical key string (a name mark whose key is it; a key
   *  round-trips through to_name.key, so this is Ruby's name-mark path). */
  async fetchByKey(key: string, opts: FetchOptions = {}): Promise<CardRecord | undefined> {
    return this.fetchWithOptions([DeckoName.parse(key)], opts);
  }

  /** Fetch by name (string or DeckoName). Full name algebra stays in
   *  src/card/name.ts; this only goes as far as key lookup. */
  async fetchByName(
    name: string | DeckoName,
    opts: FetchOptions = {},
  ): Promise<CardRecord | undefined> {
    return this.fetchWithOptions([typeof name === "string" ? DeckoName.parse(name) : name], opts);
  }

  /** Card[](*mark) (card_class.rb:42-44): fetch real cards only. */
  async bracket(...marks: readonly FetchArg[]): Promise<CardRecord | undefined> {
    return this.fetchWithOptions(marks, { skipVirtual: true });
  }

  /** quick_fetch (card_class.rb:54-56): skip_virtual + skip_modules. */
  async quickFetch(...marks: readonly FetchArg[]): Promise<CardRecord | undefined> {
    return this.fetchWithOptions(marks, { skipVirtual: true, skipModules: true });
  }

  /** Card.id (card_class.rb:71-79): integers pass through, cards give
   *  their id, names resolve through the lexicon, anything else through
   *  quick_fetch. (Ruby's Symbol branch is the CodenameMark form.) */
  async cardId(
    cardish: number | CardRecord | string | DeckoName | { codename: string },
  ): Promise<number | undefined> {
    if (typeof cardish === "number") return cardish;
    if (cardish instanceof DeckoName) return this.lexicon.id(cardish);
    if (typeof cardish === "string") {
      const id = await this.lexicon.id(cardish);
      if (id !== undefined) return id;
      return (await this.quickFetch(cardish))?.id;
    }
    if ("typeId" in cardish) return cardish.id;
    return this.codenames.id((cardish as { codename: string }).codename);
  }

  /** Card.fetch_type_id (card_class.rb:92-94). */
  async fetchTypeId(...marks: readonly FetchArg[]): Promise<number | undefined> {
    return (await this.fetchWithOptions(marks, { skipModules: true }))?.typeId;
  }

  // ---------------------------------------------------------------------
  // cache/card_class.rb + cache/all.rb - cache writes and expiry
  // ---------------------------------------------------------------------

  /** cache/card_class.rb#write_to_cache (28-34). */
  writeToCache(card: CardRecord, localOnly = false): void {
    if (card.key === undefined) return;
    if (localOnly) {
      this.writeToTempCache(card);
    } else if (this.cardCache) {
      this.cardCache.write(card.key, card);
    }
  }

  /** cache/card_class.rb#write_to_temp_cache (36-40): temp only, with
   *  `callback: false` - no lexicon hook. */
  writeToTempCache(card: CardRecord): void {
    if (card.key === undefined) return;
    this.cardCache.temp.write(card.key, card);
  }

  /** cache/card_class.rb#expire (42-47): expire the cached card with this name. */
  expireName(name: Nameish): void {
    const key = DeckoName.parse(name ?? "").key;
    const card = this.cardCache.read(key);
    if (isCardValue(card)) this.expireCard(card);
  }

  /** Cache::All#expire (cache/all.rb:17-24) - the invalidation a save
   *  triggers. expire_views is deferred to the render wave (view cache
   *  keys do not exist yet); expire_names covers both key versions
   *  (current name + name_before_act, cache/all.rb:104-108); expire_id
   *  deletes the legacy "~id" key (cache/all.rb:92-96 - nothing writes it
   *  anymore, write_to_cache only writes card.key, but expire clears it
   *  anyway); expire_left recurses into the left card of compound names
   *  (cache/all.rb:39-43). */
  expireCard(card: CardRecord): void {
    // expire_views - render wave
    this.expireNames(card);
    this.expireId(card);
    this.expireLeft(card);
  }

  /** cache/all.rb#expire_names (66-70) via #each_key_version (104-108). */
  private expireNames(card: CardRecord): void {
    const versions = [card.name, card.nameBeforeAct];
    const seen = new Set<string>();
    for (const version of versions) {
      if (version === undefined) continue;
      const key = version.key;
      if (key === "" || seen.has(key)) continue; // expire_name's present? guard
      seen.add(key);
      this.cardCache.delete(key);
    }
  }

  /** cache/all.rb#expire_id (92-96): cache.delete id_string ("~<id>"). */
  private expireId(card: CardRecord): void {
    const idStr = idString(card);
    if (idStr !== undefined) this.cardCache.delete(idStr);
  }

  /** cache/all.rb#expire_left (39-43): compound names expire their left
   *  card's entry recursively (expire_left? is hardwired true, 45-47). */
  private expireLeft(card: CardRecord): void {
    if (card.name === undefined || !card.name.isCompound) return;
    const leftKey = card.name.leftName?.key;
    if (leftKey === undefined) return;
    const left = this.cardCache.read(leftKey);
    if (isCardValue(left)) this.expireCard(left);
  }

  /** cache/class_methods.rb#reset (42-46): reset every cache instance. */
  resetCaches(): void {
    this.cardCache.reset();
    this.lexiconCache.reset();
    this.codenames.resetCache();
  }

  /** Cache::CardClass#after_write_to_temp_cache -> Cache::All#write_lexicon
   *  (cache/all.rb:5-15): temp-cache writes of cards mirror the card into
   *  the Lexicon cache (id -> name and lex -> id; lex = the name for
   *  simple cards, [left_id, right_id] for compound ones). */
  private writeLexiconTemp(card: CardRecord): void {
    if (card.id === undefined) return;
    let lex: string | [number, number] | undefined;
    if (card.leftId !== undefined && card.rightId !== undefined) {
      lex = [card.leftId, card.rightId];
    } else if (card.name !== undefined) {
      lex = card.name.s;
    }
    this.lexicon.writeTemp(card.id, card.name ?? undefined, lex);
  }

  // ---------------------------------------------------------------------
  // name-environment bridge (src/card/name/environment.ts)
  // ---------------------------------------------------------------------

  /**
   * Install this engine's lexicon and codename registry as the global name
   * environment, so DeckoName mark strings ("~75", ":codename"),
   * #standard and #cardId resolve the way Card::Name does in Ruby.
   *
   * The NameLexicon contract is SYNCHRONOUS while the driver is async, so
   * the adapters serve cache-warm entries only (Ruby's lexicon is also
   * cache-first; the db fallback is the only difference). Await
   * `engine.warmLexicon(...)` to prime entries before synchronous use.
   */
  installNameEnvironment(): void {
    const engine = this;
    const environment: NameEnvironment = {
      lexicon: {
        name(id: number): string | undefined {
          return engine.peekLexiconName(id);
        },
        id(key: string): number | undefined {
          return engine.peekLexiconId(key);
        },
      },
      codename: {
        id(codename: string): number | undefined {
          return engine.codenames.peekId(codename);
        },
        name(codename: string): string | undefined {
          return engine.codenames.peekName(codename);
        },
        nameForId(id: number): string | undefined {
          return engine.codenames.peekNameForId(id);
        },
      },
    };
    setNameEnvironment(environment);
  }

  /** Prime the lexicon (and codename) caches for the sync name-environment
   *  adapters. */
  async warmLexicon(ids: readonly number[]): Promise<void> {
    for (const id of ids) await this.lexicon.name(id);
    await this.codenames.ensureLoaded();
  }

  private peekLexiconName(id: number): string | undefined {
    const lex = this.peekLex(id);
    if (lex === undefined) return undefined;
    if (typeof lex === "string") {
      const name = DeckoName.parse(lex);
      return name.s === "" ? undefined : name.s;
    }
    const sides: string[] = [];
    for (const sideId of lex) {
      if (sideId === undefined) return undefined;
      const side = this.peekLexiconName(sideId);
      if (side === undefined) return undefined;
      sides.push(side);
    }
    return sides.join(DeckoName.JOINT);
  }

  private peekLexiconId(key: string): number | undefined {
    const value = this.readLexiconCache(lexiconCacheKey(DeckoName.parse(key).s));
    return typeof value === "number" ? value : undefined;
  }

  private peekLex(id: number): string | [number, number] | undefined {
    const value = this.readLexiconCache(String(id));
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length === 2) return value as [number, number];
    return undefined;
  }

  private readLexiconCache(key: string): unknown {
    if (this.lexiconCache.temp.exist(key)) return this.lexiconCache.temp.read(key);
    return this.lexiconCache.shared ? this.lexiconCache.shared.read(key) : undefined;
  }

  /** The codename codehash kept in the Card cache under CODENAMES. */
  peekCodehash(): { c2i: Map<string, number>; i2c: Map<number, string> } | undefined {
    return this.cardCache.read(CODENAMES_CACHE_KEY) as
      | { c2i: Map<string, number>; i2c: Map<number, string> }
      | undefined;
  }
}

interface MarkWithName extends Extract<FetchMark, { kind: "name" }> {}

/** Type guard for values that may be cached card records (the cache is
 *  untyped, like Ruby's). */
export function isCardValue(value: unknown): value is CardRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "key" in value &&
    "typeId" in value &&
    "trash" in value &&
    !(value instanceof DeckoName)
  );
}

/** fetch.rb#normalize_args (30-34): a trailing Hash is the options. */
function splitArgs(args: readonly (FetchArg | FetchOptions)[]): {
  marks: FetchArg[];
  opts: FetchOptions;
} {
  if (args.length > 0) {
    const last = args[args.length - 1];
    if (isOptionsObject(last)) {
      return { marks: args.slice(0, -1) as FetchArg[], opts: last as FetchOptions };
    }
  }
  return { marks: args as FetchArg[], opts: {} };
}

function isOptionsObject(value: unknown): value is FetchOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof DeckoName) &&
    !("codename" in value) &&
    !("key" in value)
  );
}

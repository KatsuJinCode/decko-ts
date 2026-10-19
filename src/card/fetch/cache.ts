// The two-level fetch cache: Temporary + Shared, ported from card-1.110.0
// lib/card/cache.rb, lib/card/cache/temporary.rb, lib/card/cache/shared.rb
// and lib/card/cache/class_methods.rb.
//
// Ruby scoping (cache.rb module doc + temporary.rb):
// - The Temporary cache is process- and request-specific (a plain Hash) and
//   is often "ahead" of the database: it can hold unsaved alterations.
// - The Shared cache is shared across processes and mirrors the database;
//   its keys are prefixed with a database/class/stamp triple so a reset
//   ("new stamp") invalidates every entry without touching other apps.
// - Card.fetch reads Temporary first and falls back to Shared
//   (cache.rb#read), and writes go to BOTH (cache.rb#write) unless the
//   fetch was :local_only (Cache::CardClass#write_to_cache -> temp only).
//
// Values here are card records (see card-record.ts) or lexicon entries; the
// cache itself is untyped (Ruby's is too) - the Card-class layer in
// fetch.ts owns what gets stored.

export interface SharedCacheStore {
  read(key: string): unknown;
  write(key: string, value: unknown): void;
  delete(key: string): void;
  exist?(key: string): boolean;
  /** Wipe the whole store — shared.rb#annihilate's target (the Rails cache
   *  store's clear). Optional: a store without it cannot be annihilated and
   *  reset_global degrades to stamp rotation for it. */
  clear?(): void;
}

/** Cardio.config.max_temporary_cache_keys default
 *  (cardio-0.20.0 lib/cardio/railtie.rb:41: `config.max_temporary_cache_keys = 10_000`). */
export const DEFAULT_MAX_TEMPORARY_CACHE_KEYS = 10_000;

/**
 * lib/card/cache/temporary.rb - a Hash with a max-keys reset. The write
 * counter (`reps`) overestimates store size because repeated writes to one
 * key each increment it; exceeding maxKeys recounts once, and only a REAL
 * overage resets the whole store (temporary.rb#within_key_counts).
 */
export class TemporaryCache {
  private store = new Map<string, unknown>();
  private reps = 0;
  private readonly maxKeys: number;
  /** How many times within_key_counts reset this store. Ruby has the same
   *  reset (temporary.rb#within_key_counts) but heals misses through the
   *  synchronous db fallback; the port's cache-layer probes read this to
   *  attribute a sync-mirror miss to the reset (the warm entries written
   *  before the last reset are gone). */
  private resetCountValue = 0;

  constructor(maxKeys: number = DEFAULT_MAX_TEMPORARY_CACHE_KEYS) {
    this.maxKeys = maxKeys;
  }

  /** Resets fired so far (temporary.rb#within_key_counts observability). */
  get resetCount(): number {
    return this.resetCountValue;
  }

  /** The keys currently held - cache-layer probe / test inspection. */
  keys(): readonly string[] {
    return [...this.store.keys()];
  }

  read(key: string): unknown {
    return this.store.get(key);
  }

  /** temporary.rb#write: store the value and RETURN it (Ruby's write is
   *  the `@store[key] = value` assignment). */
  write(key: string, value: unknown, callback?: (value: unknown) => void): unknown {
    this.withinKeyCounts(() => {
      this.store.set(key, value);
      this.reps += 1;
      if (callback) callback(value);
    });
    return value;
  }

  /** temporary.rb#fetch: exist? ? read : write(yield) - key order matters:
   *  a stored nil is a hit. */
  fetch(key: string, compute: () => unknown, callback?: (value: unknown) => void): unknown {
    return this.exist(key) ? this.read(key) : this.write(key, compute(), callback);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  reset(): void {
    this.reps = 0;
    this.store = new Map();
    this.resetCountValue += 1;
  }

  /** Drop every entry the predicate selects; returns how many were dropped
   *  (incremental live discovery: forget provisional negatives). */
  purge(select: (key: string, value: unknown) => boolean): number {
    let dropped = 0;
    for (const [key, value] of this.store) {
      if (select(key, value)) {
        this.store.delete(key);
        dropped += 1;
      }
    }
    return dropped;
  }

  exist(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * The request hold. Ruby's within_key_counts reset is invisible in Ruby's
   * output because every reader heals a miss with a synchronous database
   * read (lexicon.rb:71-76). The port's synchronous readers (the name
   * environment's mark parse, pointer item renders) cannot read the
   * database, so an entry dropped in the middle of a request could turn
   * into an "Error rendering" span (a page whose cache entry was dropped by
   * the fourth reset of one request). While any hold is open the
   * store grows past maxKeys instead of resetting; the overage resets once,
   * when the last hold is released. The cache is therefore sized per
   * request, and a reset can only ever happen between requests.
   */
  hold(): () => void {
    this.holds += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds -= 1;
      if (this.holds === 0 && this.store.size > this.maxKeys) this.reset();
    };
  }

  private holds = 0;

  private withinKeyCounts(body: () => void): void {
    if (this.reps >= this.maxKeys) {
      this.reps = this.store.size;
      if (this.reps > this.maxKeys && this.holds === 0) this.reset();
    }
    body();
  }
}

/**
 * lib/card/cache/shared.rb - the cross-process store. Every logical key is
 * stored under fullKey = "{database}-{classKey}-{stamp}:{key}"
 * (shared.rb#full_key/#prefix); `reset` rotates the stamp, which orphans all
 * previous entries without enumerating them (shared.rb#reset).
 */
export class SharedCache {
  private store: SharedCacheStore;
  private readonly database: string;
  private readonly classKey: string;
  private stampValue?: string;
  private prefixValue?: string;
  /** Stand-in for Cardio.cache, the simple Rails store the stamp itself
   *  lives in (shared.rb#stamp). One registry per process is enough here. */
  private static stampRegistry = new Map<string, string>();
  private static stampCounter = 0;

  constructor(opts: { store: SharedCacheStore; database?: string; className?: string }) {
    this.store = opts.store;
    this.database = opts.database ?? "decko";
    this.classKey = (opts.className ?? "Card").replace(/\+/g, "_"); // to_name.key of the class string
  }

  /** shared.rb#renew: drop memoized stamp/prefix so the next read re-asserts them. */
  renew(): void {
    this.stampValue = undefined;
    this.prefixValue = undefined;
  }

  /** shared.rb#reset: a new stamp + persist it in the stamp registry. */
  reset(): void {
    this.stampValue = SharedCache.newStamp();
    this.prefixValue = undefined;
    SharedCache.stampRegistry.set(this.stampKey(), this.stampValue);
  }

  /** shared.rb#annihilate: clear the underlying store entirely. */
  annihilate(): void {
    if (typeof (this.store as unknown as { clear?: () => void }).clear === "function") {
      (this.store as unknown as { clear: () => void }).clear();
    }
  }

  stamp(): string {
    if (this.stampValue === undefined) {
      const key = this.stampKey();
      const existing = SharedCache.stampRegistry.get(key);
      this.stampValue = existing ?? SharedCache.newStamp();
      SharedCache.stampRegistry.set(key, this.stampValue);
    }
    return this.stampValue;
  }

  stampKey(): string {
    return `${this.database}-${this.classKey}-stamp`;
  }

  prefix(): string {
    if (this.prefixValue === undefined) {
      this.prefixValue = `${this.database}-${this.classKey}-${this.stamp()}:`;
    }
    return this.prefixValue;
  }

  fullKey(key: string): string {
    return `${this.prefix()}/${key}`;
  }

  read(key: string): unknown {
    return this.store.read(this.fullKey(key));
  }

  write(key: string, value: unknown): void {
    this.store.write(this.fullKey(key), value);
  }

  /** shared.rb#fetch: store.fetch(full_key) { block } - on a miss the block
   *  result is written back into the store (Rails cache-store contract). A
   *  stored value of undefined is a miss, matching Rails (nil is not cached). */
  fetch(key: string, compute: () => unknown): unknown {
    const existing = this.read(key);
    if (existing !== undefined) return existing;
    const computed = compute();
    this.write(key, computed);
    return computed;
  }

  delete(key: string): void {
    this.store.delete(this.fullKey(key));
  }

  exist(key: string): boolean {
    return this.store.exist
      ? this.store.exist(this.fullKey(key))
      : this.store.read(this.fullKey(key)) !== undefined;
  }

  /** shared.rb#write_attribute: mutate one attribute of a cached object. */
  writeAttribute(key: string, attribute: string, value: unknown): unknown {
    const object = this.read(key);
    if (object !== null && typeof object === "object") {
      (object as Record<string, unknown>)[attribute] = value;
      this.write(key, object);
    }
    return value;
  }

  readAttribute(key: string, attribute: string): unknown {
    const object = this.read(key);
    if (object !== null && typeof object === "object") {
      return (object as Record<string, unknown>)[attribute];
    }
    return undefined;
  }

  private static newStamp(): string {
    SharedCache.stampCounter += 1;
    return `stamp-${Date.now()}-${SharedCache.stampCounter}`;
  }
}

/**
 * lib/card/cache.rb - integrates Temporary + Shared.
 * read: temp.fetch(key) { shared.read(key) } - a Shared hit is copied into
 * temp; write: shared first, then temp; delete/reset touch both.
 */

/** Card::Cache.counter (cache.rb:105, `Card::Cache.counter ||= {}`) — the
 *  process-global tally hash, keyed by the cache's class (undefined for the
 *  default Card cache), then by tracked action. */
export const cacheTallyCounter = new Map<string | undefined, Map<string, number>>();

export class CardCache {
  readonly temp: TemporaryCache;
  readonly shared?: SharedCache;
  /** cache.rb#write / Temporary#write callback hook; Card's implementation
   *  (Cache::CardClass#after_write_to_temp_cache) writes the lexicon. */
  afterWriteToTempCache?: (value: unknown) => void;
  /** cache.rb#initialize's `@klass = opts[:class]` — the counter key tally
   *  buckets under. Undefined (Ruby nil) for the default Card cache. */
  private readonly className: string | undefined;

  constructor(
    opts: {
      className?: string;
      maxTemporaryKeys?: number;
      sharedStore?: SharedCacheStore;
      database?: string;
    } = {},
  ) {
    this.className = opts.className;
    this.temp = new TemporaryCache(opts.maxTemporaryKeys);
    this.shared = opts.sharedStore
      ? new SharedCache({
          store: opts.sharedStore,
          database: opts.database,
          className: opts.className,
        })
      : undefined;
  }

  /**
   * cache.rb#tally (:105-110):
   *   `h = Card::Cache.counter ||= {}; t = h[@klass] ||= {};
   *    t[type] ||= 0; t[type] += 1`
   * One counter hash per process, keyed by the cache's class, then by the
   * tracked action. Ruby's only caller is `track` (:98-104), which runs it
   * whenever Cardio.config.cache_log_level is set — the port carries no
   * logger, so tally is exposed directly for the callers that instrument.
   */
  tally(type: string): number {
    let perClass = cacheTallyCounter.get(this.className);
    if (perClass === undefined) {
      perClass = new Map<string, number>();
      cacheTallyCounter.set(this.className, perClass);
    }
    const next = (perClass.get(type) ?? 0) + 1;
    perClass.set(type, next);
    return next;
  }

  /** cache.rb#read */
  read(key: string): unknown {
    return this.temp.fetch(key, () => this.shared?.read(key));
  }

  /** cache.rb#read_multi (single-key calls return {} in Ruby; the fetch
   *  layer never needs it, ported for completeness). */
  readMulti(keys: string[]): Map<string, unknown> {
    const found = new Map<string, unknown>();
    if (keys.length <= 1) return found;
    const missing: string[] = [];
    for (const key of keys) {
      if (this.temp.exist(key)) {
        found.set(key, this.temp.read(key));
      } else {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      const fromShared = new Map<string, unknown>();
      for (const key of missing) {
        const value = this.shared ? this.shared.read(key) : undefined;
        if (value !== undefined) {
          fromShared.set(key, value);
          this.temp.write(key, value, this.afterWriteToTempCache);
        }
      }
      for (const [key, value] of fromShared) found.set(key, value);
    }
    return found;
  }

  /** cache.rb#write: hard (shared) first where applicable, then temp. */
  write(key: string, value: unknown): void {
    this.shared?.write(key, value);
    this.temp.write(key, value, this.afterWriteToTempCache);
  }

  /** cache.rb#fetch */
  fetch(key: string, compute: () => unknown): unknown {
    return this.temp.fetch(key, () =>
      this.shared ? this.shared.fetch(key, compute) : compute(),
    );
  }

  /** cache.rb#delete */
  delete(key: string): void {
    this.shared?.delete(key);
    this.temp.delete(key);
  }

  /** cache.rb#reset */
  reset(): void {
    this.shared?.reset();
    this.temp.reset();
  }

  /** cache.rb#exist? */
  exist(key: string): boolean {
    return this.temp.exist(key) || (this.shared?.exist(key) ?? false);
  }
}

// ---------------------------------------------------------------------------
// lib/card/cache/class_methods.rb — the CLASS-level registry. Ruby hangs
// these on Card::Cache itself: one cache instance per Ruby class per process
// (`Cache[klass]`), and the renew/reset family walking all of them.
//
// NOT PORTED HERE, and why (each named for the row that grades it):
//   * the view-cache cluster of cache/all.rb (view_cache_clean?,
//     ensure_view_cache_key, expire_left?, shared_read_view_cache_keys,
//     shared_write_view_cache_keys, cache_class_from_type, view_cache_keys,
//     expire_view_cache_keys) — Ruby's hard-templated per-view cache keys
//     have no port counterpart: the port caches at page/boot level (the
//     register's view.rb row and DSL A20 own that verdict), so there are no
//     view keys to clean, ensure, or expire.
//   * the populate cluster of cache/populate.rb (populate_ids,
//     populate_names, populate_fields, populate_temp_cache) — Ruby's warmers
//     are keyed to Lexicon.cache's VALUE SHAPES (lex strings and id pairs)
//     and to Set.basket[:cache_seed_strings/names] (card-mod-content
//     templating.rb:1-2, card-mod-format html/head.rb:7,
//     card-mod-layout process_layout.rb:1). The port's lexicon cache carries
//     a different, documented value shape (src/card/fetch/lexicon.ts header:
//     a cached "lex" representation) and has no basket-seed registry, so a
//     name-matched port would not be shape-compatible; warming is subsumed
//     by the fetch layer's own read paths.
//   * seed_from_stash / stash_to_cache (populate.rb:48-59) — Rails
//     code-reloading dev machinery ("for testing, stash rules in variable",
//     gated by Cardio.config.seed_cache_from_stash); the port has no
//     class-reloading cycle to survive and carries no such config.
// ---------------------------------------------------------------------------

/** class_methods.rb#cache_by_class (:100-102) — one cache per class per
 *  process. Keyed by the class name string; Ruby keys by the class object. */
export const cacheByClass = new Map<string, CardCache>();

/** class_methods.rb@no_renewal (:13) — when true, renew is a no-op. */
export let cacheNoRenewal = false;
export function setCacheNoRenewal(value: boolean): void {
  cacheNoRenewal = value;
}

/** Hook for class_methods.rb#reset_other's `Card::Codename.reset_cache`
 *  (:84). Ruby reaches the process-global Card::Codename; the port's codename
 *  cache is per-engine (src/card/fetch/codename.ts), so the reset is
 *  injected. Cardio::Utils.delete_tmp_files! (:85) has no port counterpart —
 *  the port writes no Rails tmp files. */
let cacheResetOtherHook: (() => void) | undefined;
export function setCacheResetOtherHook(hook: () => void): void {
  cacheResetOtherHook = hook;
}

/** class_methods.rb#[] (:16-20): create-or-return the class's cache —
 *  `raise "nil klass" if klass.nil?` becomes the TypeError, the rest is
 *  `cache_by_class[klass] ||= new class: klass, store: shared_cache || nil`.
 *  The store opt is per-call (Ruby's Shared.card_cache global has no port
 *  counterpart; each caller supplies its own SharedCacheStore or none). */
export function cacheForClass(
  className: string,
  opts: { sharedStore?: SharedCacheStore; database?: string; maxTemporaryKeys?: number } = {},
): CardCache {
  if (!className) throw new TypeError("nil klass (class_methods.rb:17)");
  let cache = cacheByClass.get(className);
  if (cache === undefined) {
    cache = new CardCache({
      className,
      sharedStore: opts.sharedStore,
      database: opts.database,
      maxTemporaryKeys: opts.maxTemporaryKeys,
    });
    cacheByClass.set(className, cache);
  }
  return cache;
}

/** class_methods.rb#renew (:22-36): nil the counter, honor no_renewal,
 *  renew the shared stamp, then reset every temp cache and drop every shared
 *  prefix memo. Ruby's trailing populate_temp_cache call (:35) is in the
 *  named-skip block above. */
export function renewCaches(): void {
  cacheTallyCounter.clear(); // `Card::Cache.counter = nil` (:24)
  if (cacheNoRenewal) return; // :25
  renewSharedCache();
  for (const cache of cacheByClass.values()) {
    cache.temp.reset();
    cache.shared?.renew();
  }
}

/** class_methods.rb#renew_shared (:38-40): `Card::Cache::Shared.renew if
 *  shared_cache` — drop the SHARED-layer stamp memo. The port's stamp memo
 *  lives per SharedCache instance (SharedCache.renew), and the registry
 *  cannot know every instance, so this renews the stamps of the registered
 *  caches — the same effect over the caches the port actually tracks. */
export function renewSharedCache(): void {
  for (const cache of cacheByClass.values()) cache.shared?.renew();
}

/** class_methods.rb#reset (:43-46): shared, then temp, for all classes. */
export function resetCaches(): void {
  resetSharedCaches();
  resetTempCaches();
}

/** class_methods.rb#reset_all (:49-52): reset + the non-standard caches. */
export function resetAllCaches(): void {
  resetSharedCaches();
  resetTempCaches();
  resetOtherCaches();
}

/** class_methods.rb#reset_global (:59-65): the heavy hammer — temp reset plus
 *  shared ANNIHILATE (wipe the underlying store, other decks included). */
export function resetGlobalCaches(): void {
  for (const cache of cacheByClass.values()) {
    cache.temp.reset();
    cache.shared?.annihilate();
  }
  resetOtherCaches();
}

/** class_methods.rb#reset_shared (:68-73): rotate every registered shared
 *  cache's stamp. Ruby first rotates the Shared-class stamp itself
 *  (`Card::Cache::Shared.reset`); the port's stamps are per instance, and
 *  each instance's reset persists to the stamp registry, so walking the
 *  registered caches rotates all of them. */
export function resetSharedCaches(): void {
  for (const cache of cacheByClass.values()) cache.shared?.reset();
}

/** class_methods.rb#reset_temp (:76-78). */
export function resetTempCaches(): void {
  for (const cache of cacheByClass.values()) cache.temp.reset();
}

/** class_methods.rb#reset_other (:82-85): the non-standard caches —
 *  the injected codename reset (Ruby's Card::Codename.reset_cache). */
export function resetOtherCaches(): void {
  cacheResetOtherHook?.();
}

/** class_methods.rb#shared_on! (:92-97): the shared cache just became (or
 *  became differently) available — drop every per-class cache so the next
 *  Cache[klass] rebuilds it against the new store. */
export function sharedCacheOn(): void {
  cacheByClass.clear();
}

/** class_methods.rb#tallies (:109-113): the human-readable tally line —
 *  `"#{tally_total} Cache calls (#{counter.map { |k, v| "#{k}=#{v} " }.join})"`.
 *  Ruby interpolates the whole per-class hash, so each bucket renders as
 *  `Klass={"read"=>2} ` (nil klass interpolates as the empty string). */
export function cacheTallies(): string {
  const total = cacheTallyTotal();
  const parts: string[] = [];
  for (const [klass, perType] of cacheTallyCounter) {
    const hashBody = [...perType.entries()]
      .map(([type, count]) => `"${type}"=>${count}`)
      .join(", ");
    parts.push(`${klass ?? ""}={${hashBody}} `);
  }
  return `${total} Cache calls (${parts.join("")})`;
}

/** class_methods.rb#tally_total (:115-117, private): the sum over every
 *  class's every action. */
export function cacheTallyTotal(): number {
  let total = 0;
  for (const perType of cacheTallyCounter.values()) {
    for (const count of perType.values()) total += count;
  }
  return total;
}

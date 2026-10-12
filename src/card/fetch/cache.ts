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
export class CardCache {
  readonly temp: TemporaryCache;
  readonly shared?: SharedCache;
  /** cache.rb#write / Temporary#write callback hook; Card's implementation
   *  (Cache::CardClass#after_write_to_temp_cache) writes the lexicon. */
  afterWriteToTempCache?: (value: unknown) => void;

  constructor(
    opts: {
      className?: string;
      maxTemporaryKeys?: number;
      sharedStore?: SharedCacheStore;
      database?: string;
    } = {},
  ) {
    this.temp = new TemporaryCache(opts.maxTemporaryKeys);
    this.shared = opts.sharedStore
      ? new SharedCache({
          store: opts.sharedStore,
          database: opts.database,
          className: opts.className,
        })
      : undefined;
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

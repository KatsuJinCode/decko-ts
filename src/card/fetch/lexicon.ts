// Card::Lexicon port (card-1.110.0 lib/card/lexicon.rb) - the id <-> name
// index. Translates through a cached "lex" representation: the name string
// for simple cards, [left_id, right_id] for compound cards.
//
// Storage semantics ported exactly:
// - name(id) reads cards WITHOUT a trash filter (lexicon.rb#id_to_lex) -
//   trashed cards' names stay resolvable by id.
// - id(name) resolves through lex_to_id with trash: false
//   (lexicon.rb#lex_to_id/#lex_query) - trashed cards' ids are NOT returned
//   for names.
// - Compound names resolve recursively through their side cards' ids
//   (lexicon.rb#name_to_lex); an unresolvable side means "unknown".
// - For compound lexes the resolved id is cached under the id string so
//   name(id) avoids a query (lexicon.rb#lex_to_id tap); for simple lexes
//   the name is NOT cached there "because lex might not be the canonical
//   name" (lexicon.rb comment).
//
// Unlike Ruby (synchronous ActiveRecord), the driver is async: every
// DB-touching method returns a Promise. The Card::Cache[Lexicon] two-level
// cache is synchronous memory, exactly like Ruby's.

import { DeckoName } from "../name.js";
import type { SQLDatabaseDriver, PrefetchOutcome, SQLStatement } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import { CardCache } from "./cache.js";

/** lib/card/name.rb:16-17 Name.joint; Card::Name.joint delegates to it. */
const JOINT = DeckoName.JOINT;
type NameRow = Pick<CardsRow, "name" | "left_id" | "right_id">;

/** The id a prefetched lookup returned, when the prefetch vouched for it.
 *  An unverified outcome is a MISS: the caller falls back to the blocking
 *  path, so it must not read an id out of one. */
function idOfOutcome(outcome: PrefetchOutcome | undefined): number | undefined {
  if (outcome === undefined || outcome.unverified || outcome.result === undefined) return undefined;
  const id = (outcome.result.rows[0] as { id?: unknown } | undefined)?.id;
  return typeof id === "number" && Number.isInteger(id) ? id : undefined;
}

export class DbLexicon {
  private readonly driver: SQLDatabaseDriver;
  /** Card::Cache[Lexicon] (lexicon.rb#cache) - separate cache instance per class. */
  readonly cache: CardCache;
  /**
   * The durable id->name record of every ASYNC name(id) read - the port's
   * substitute for Ruby's SYNCHRONOUS db fallback (lexicon.rb:71-76) at the
   * machine's synchronous boundaries (the name-environment adapters in
   * fetch.ts#installNameEnvironment; DeckoName.parse's id-mark resolution).
   *
   * Why it exists: Ruby's Lexicon.name(id) is cache-first WITH a
   * synchronous SQL fallback, so "~393" resolves for every id the deck
   * holds no matter what the Temporary cache did (temporary.rb
   * #within_key_counts resets the whole store at 10,000 keys - a 47k-card
   * deck resets it repeatedly while warmLexicon pours it through). The
   * driver here is async, so the sync adapters can only serve warm cache
   * entries - after the reset, an id-mark whose entry was evicted raised
   * NameNotFoundError where Ruby resolved (the 21 `X+*members` page raises
   * of pass15's engine-raise-divergence class: those List cards store
   * `~id` item lines). Every async name(id) read lands the resolved name
   * here, so the sync adapters answer what Ruby's db fallback would:
   * misses are ids never warmed (which Ruby's db would also not answer),
   * never wrong names.
   *
   * Order at the consumer: live caches first (temp/shared - they hold the
   * rename/trash state the write path maintains), then this map, then the
   * codename registry. Cap: the map holds one short string per deck card
   * (47k entries for the census deck); a runaway deck clears rather than
   * grows without bound.
   */
  private durableIdNames = new Map<number, string>();
  private static readonly DURABLE_ID_NAMES_CAP = 200_000;

  /** Drop both durable records (incremental live discovery: an engine kept
   *  across passes must re-read what a fresh engine would read). */
  forgetDurableRecords(): void {
    this.durableIdNames.clear();
    this.durableLexIds.clear();
  }

  /**
   * The durable lex->id record - the MIRROR of durableIdNames above, for the
   * same reason and with the same contract, one direction over.
   *
   * Ruby resolves a name's codename synchronously against the db
   * (PatternInstance#anchor_codenames, pattern/base.rb:40-44, reads
   * Card::Lexicon + Card::Codename), so `base.rb:41 || break` only fires
   * for an anchor card the DECK does not have. The port's sync mirror reads
   * the TEMPORARY cache, which within_key_counts throws away wholesale every
   * 10,000 writes (temporary.rb), so the mirror went nil on an anchor the
   * deck DOES have and the codename-keyed consumers of DeckoName#cardId /
   * #codename silently lost their answer.
   *
   * The measured casualty (row 8, `welcome email`): the set-type-assignment
   * walk keys each virtual field card's module key on its anchor parts'
   * codenames, so a wiped `L-*to` prime emptied the walk
   * (moduleKeys ["TypePlusRight::Basic::To","Right::To"] -> []) and
   * newCardDefaultType's type_id_from_code arm missed where Ruby answers
   * List - the page rendered RichText (21,702 B) instead of List
   * (21,686 B) depending on how many pages the boot had rendered first.
   *
   * READ SCOPE: peekDurableId is consulted by the NAME-ENVIRONMENT adapter
   * only (fetch.ts #peekLexiconId, the sync `lexicon.id(key)` that
   * DeckoName#cardId uses). DbLexicon#peekId below is deliberately NOT
   * widened - it stays the pure cache-only mirror its two committed pins
   * require (tests/card/fetch/lexicon-id-fallback-survives-sync-peek-after-
   * temp-reset.test.ts, tests/card/render/lexicon-peek-id-false-negative-
   * crash.test.ts). It also never records a NEGATIVE: entries are written
   * only where the row (or the batched prime's row) was actually read, so a
   * durable miss stays an UNKNOWN name and can never become a wrong id.
   */
  private durableLexIds = new Map<string, number>();
  private static readonly DURABLE_LEX_IDS_CAP = 200_000;

  /** The sync name-environment boundary's read of the durable map. */
  peekDurableId(lex: Lex): number | undefined {
    return this.durableLexIds.get(cacheKey(lex));
  }

  private recordDurableId(lex: Lex, id: number | undefined): void {
    if (id === undefined) return; // never materialize a negative
    const key = cacheKey(lex);
    if (this.durableLexIds.has(key)) return;
    if (this.durableLexIds.size >= DbLexicon.DURABLE_LEX_IDS_CAP) {
      this.durableLexIds.clear();
    }
    this.durableLexIds.set(key, id);
  }

  /**
   * Deployment option, off by default (Ruby's lex_to_id has no such step).
   * A deck whose stored `key` column was written under different inflection
   * rules than this engine applies holds rows that `key = ?` cannot find
   * (the cf-scale deck's "Anonymous" is stored as `anonymou`). When set, a
   * simple-name miss asks once more by the stored name and accepts the row
   * only if that name's computed key equals the requested key. The worker
   * entry enables it so on-demand lookups answer what its former full-deck
   * key index answered.
   */
  storedKeyFallback = false;

  constructor(driver: SQLDatabaseDriver, cache: CardCache) {
    this.driver = driver;
    this.cache = cache;
  }

  /** lexicon.rb#name(id): registered name, or the empty name when unknown
   *  (Ruby `(name || "").to_name`; blankness is the unknown signal at every
   *  consumer - retrieve_from_cache_by_id, id_from_string validation).
   *  This port returns undefined instead of the empty name; see
   *   ("empty-name fallback"). */
  async name(id: number | undefined): Promise<DeckoName | undefined> {
    return this.nameFromRows(id);
  }

  private async nameFromRows(id: number | undefined, rows?: ReadonlyMap<number, NameRow | undefined>): Promise<DeckoName | undefined> {
    if (id === undefined || id === null) return undefined; // lexicon.rb#name guard
    const lex = await this.idToLex(id, rows);
    const name = lex === undefined ? undefined : await this.lexToName(lex, rows);
    if (name === undefined) return undefined;
    // lexToName's non-array branch returns the LEX verbatim, and the write
    // path caches DeckoName objects under ids (lexicon.rb:74-82
    // write_to_temp_cache) — so `name` can be a DeckoName, not a string.
    // The durable record is a string map (the sync parse boundary consumes
    // it raw); storing the object leaked a non-string into
    // DeckoName.parse's rubyStrip (the codename-mark wipe pin's
    // TypeError). Normalize to the display string here.
    const nameStr = typeof name === "string" ? name : name.s;
    this.recordDurableName(id, nameStr);
    return DeckoName.parse(nameStr);
  }

  /** The same cache-first name reads, acquired in bounded driver batches.
   * Rows stay local until the original composition asks for them: reverse
   * cache writes retain serial name() order, including aliases. */
  async names(ids: readonly number[]): Promise<Map<number, DeckoName | undefined>> {
    const release=this.cache.temp.hold();
    try {
      const rows=new Map<number,NameRow|undefined>(),asked=new Set<number>(),pending=new Set(ids);
      const sides=(lex:unknown)=>{
        if(!Array.isArray(lex))return;
        for(const side of lex){
          if(side===undefined)break;
          if(typeof side==='number'&&!asked.has(side))pending.add(side);
        }
      };
      while(pending.size){
        const wave=[...pending],missing:number[]=[];pending.clear();
        for(const id of wave){
          if(asked.has(id))continue;
          asked.add(id);
          const held=this.cache.temp.exist(String(id)),lex=this.peekStored(String(id));
          if(held||lex!==undefined)sides(lex);
          else missing.push(id);
        }
        for(let start=0;start<missing.length;start+=500){
          const chunk=missing.slice(start,start+500);
          const results=await this.driver.batch(chunk.map(id=>({sql:"SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1",params:[id]})));
          if(results.length!==chunk.length)throw Error('Lexicon name batch returned incomplete results');
          results.forEach((result,index)=>{
            const row=(result.rows as NameRow[])[0];rows.set(chunk[index]!,row);
            if(row!==undefined)sides(row.name??[row.left_id??undefined,row.right_id??undefined]);
          });
        }
      }
      const result=new Map<number,DeckoName|undefined>();
      for(const id of ids)result.set(id,await this.nameFromRows(id,rows));
      return result;
    }finally{release()}
  }

  /** The sync boundary's read of the durable map (see the field comment).
   *  Live caches first is the CALLER's contract (fetch.ts's adapter walks
   *  peekLexiconName -> this peek -> codenames); this method only answers
   *  what an async name(id) read already proved the db holds. */
  peekDurableName(id: number): string | undefined {
    return this.durableIdNames.get(id);
  }

  /** db round-trip elimination: record a durable id->name entry for
   *  a row the caller HOLDS (a batched warm/closure read, not an async
   *  name(id) read). Same invariant as the field doc: the entry is db truth
   *  (the row was just fetched), so the sync fallback can only gain answers
   *  Ruby's synchronous db fallback would also give, never wrong ones. The
   *  removed per-row fetchById ladder populated this map implicitly through
   *  lexicon.name(id); the own-rows composer calls this instead so its
   *  durable coverage is not smaller than the ladder's. */
  noteDurableName(id: number, name: string): void {
    this.recordDurableName(id, name);
  }

  private recordDurableName(id: number, name: string): void {
    if (this.durableIdNames.has(id)) return;
    if (this.durableIdNames.size >= DbLexicon.DURABLE_ID_NAMES_CAP) {
      this.durableIdNames.clear();
    }
    this.durableIdNames.set(id, name);
  }

  /** lexicon.rb#id(name): registered id, undefined when unknown. Accepts a
   *  name or an already-canonical key string (key -> name -> key is
   *  idempotent, matching Ruby's name.to_name round-trip). */
  async id(nameish: string | DeckoName): Promise<number | undefined> {
    const name = typeof nameish === "string" ? DeckoName.parse(nameish) : nameish;
    if (name.s === "") return undefined; // lexicon.rb:21 `return if name.blank?`
    if (name.isRelativeFragment) return undefined; // lexicon.rb:24 relative_fragment?
    const lex = await this.nameToLex(name);
    return lex === undefined ? undefined : this.lexToId(lex);
  }

  /**
   * Synchronous mirror of id() over CACHE-WARM entries only - the sync-read
   * contract the name-environment adapters and the CQL name->id resolver
   * (ParseOptions.resolveCardId via cql/execute.ts#parseOptionsWithLexicon)
   * need. The driver is async while those consumers are sync; Ruby's
   * Lexicon is cache-first synchronous too - the db fallback is the only
   * difference, and this mirror deliberately has none.
   *
   * Walks the SAME name_to_lex/lex_to_id path id() walks, reading only what
   * id()/name() already cached: name -> lex (the name for simple cards,
   * [left_id, right_id] for compound, side ids resolved recursively through
   * peekLex) -> id (the "L-..." reverse entry idToLex/lexToId write).
   * Warm first (await lexicon.name(id)/id(name), e.g. FetchEngine#
   * warmLexicon over the deck's ids); a cold or unresolvable entry returns
   * undefined - an UNKNOWN name, never a wrong id.
   */
  peekId(nameish: string | DeckoName): number | undefined {
    const name = typeof nameish === "string" ? DeckoName.parse(nameish) : nameish;
    if (name.s === "") return undefined; // lexicon.rb:21 `return if name.blank?`
    if (name.isRelativeFragment) return undefined; // lexicon.rb:24 relative_fragment?
    const lex = this.peekLex(name);
    if (lex === undefined) return undefined;
    const id = this.peekStored(cacheKey(lex));
    return typeof id === "number" ? id : undefined;
  }

  /**
   * Reads a lexicon cache entry that a layer actually HOLDS, without
   * materializing a miss. CardCache.read (cache.rb#read) is
   * `temp.fetch(key) { shared.read(key) }` - a shared miss writes a stored
   * nil into temp. Every Ruby reader of the Lexicon cache is
   * cache.fetch-shaped (lexicon.rb#lex_to_id/#id_to_lex), so in Ruby a
   * stored nil always means "the db said no"; this sync peek is an extra
   * reader Ruby does not have, and its misses are EVICTIONS (the Temporary
   * max-keys reset, temporary.rb#within_key_counts) or cold entries, not
   * answers. Materializing one would poison the async fallback:
   * lexToId's cacheFetch would see the key exist and answer the stored nil
   * WITHOUT the SQL query - "unknown" for a card the db has, exactly what
   * Ruby's synchronous SQL fallback never answers (the hazard behind the
   * 10 empty <host>+*referred_to_by / +*type+by_name census pages). The
   * read order mirrors CardCache.read's (temp first, shared second).
   */
  private peekStored(key: string): unknown {
    if (this.cache.temp.exist(key)) return this.cache.temp.read(key);
    return this.cache.shared?.read(key);
  }

  /** name_to_lex over warm entries only (mirrors nameToLex line for line;
   *  keep the two in step). */
  private peekLex(name: DeckoName): Lex | undefined {
    if (name.isSimple) return name.s;
    const leftId = this.peekId(name.leftName ?? DeckoName.parse(""));
    if (leftId === undefined) return undefined;
    const rightId = this.peekId(name.rightName ?? DeckoName.parse(""));
    if (rightId === undefined) return undefined;
    return [leftId, rightId];
  }

  /** Lexicon.lex_to_name([left_id, right_id]) - the compound-name
   *  composition Card#name uses (lib/card/name/all.rb#name). */
  async composeName(leftId: number, rightId: number | undefined | null): Promise<DeckoName | undefined> {
    const name = await this.lexToName([leftId, rightId ?? undefined]);
    return name === undefined ? undefined : DeckoName.parse(name);
  }

  /** lexicon.rb#write_to_temp_cache - the after_write_to_temp_cache hook body. */
  writeTemp(id: number | undefined, name: DeckoName | undefined, lex: Lex | undefined): void {
    if (id !== undefined) this.cache.temp.write(String(id), name);
    if (lex !== undefined) {
      this.cache.temp.write(cacheKey(lex), id);
      // The write path's own answer is db truth; keep the durable mirror in
      // step with a rename so the sync boundary never serves the old id.
      this.recordDurableId(lex, id);
    }
  }

  /** lexicon.rb#write */
  write(id: number, name: DeckoName, lex: Lex): void {
    this.cache.write(String(id), name);
    this.cache.write(cacheKey(lex), id);
    this.recordDurableId(lex, id);
  }

  /** Prime lex_to_id entries from a batched key lookup (the cold render's
   *  prelude batch: the set-pattern anchor names the render's rule walk
   *  resolves). Writes EXACTLY what lexToId's cacheFetch would write for
   *  the same keys - positive ids and the negative (undefined) entries a
   *  miss caches too (cache.rb#fetch: "a stored nil is a hit") - so the
   *  later name->id resolutions stay zero-query without changing what they
   *  resolve to. The `key` strings are card names; the cache key is the
   *  canonical key, the same transform lexToId applies. */
  primeIdsByKey(entries: ReadonlyArray<{ key: string; id: number | undefined }>): void {
    for (const entry of entries) {
      this.cache.write(cacheKey(entry.key), entry.id);
      // The row was just read by the batched prime, so the pair is db truth -
      // the durable mirror of what the temporary write above holds, past the
      // next within_key_counts reset.
      this.recordDurableId(entry.key, entry.id);
    }
  }

  /**
   * THE REQUEST-LOCAL DEAD SET, simple-key arm. Whether the cache HOLDS an
   * entry for this key whose value is not an id - i.e. a negative the
   * database already gave.
   *
   * WHY THIS IS A QUESTION AND NOT A CACHE READ. The temp/shared pair is
   * asked directly, in the order `cacheFetch` uses and WITHOUT its
   * write-back: `lexEntryKnown` (the wave's own skip gate) does the same,
   * and the hazard its doc names (lexicon.ts above) is exactly a miss that
   * gets MATERIALIZED into the entry this method reads. A held entry is an
   * answer somebody asked for; an eviction or a cold key is NOT held, and
   * this returns false for it - the caller then asks the database, which is
   * the correct thing to do for a key nobody has answered.
   *
   * WHO WRITES THE NEGATIVES. `primeIdsByKey` (seatNamesByWave's asked-and-
   * missed derivation, render.ts:2861-2867) writes `undefined` for every
   * simple key no row of any round answered; `lexToId`'s own cacheFetch
   * writes the same for a key its point query missed. Both are database
   * answers, and both are scoped to the engine lifetime, which is the
   * lifetime the render's other caches already assume (seatNamesByWave's
   * own ask-memory doc: "the deck is static per engine lifetime").
   *
   * A `L-` cache key holds an id or `undefined` and nothing else, so
   * "not a number" IS "negative".
   */
  heldKeyNegative(key: string): boolean {
    const cacheKeyValue = cacheKey(key);
    if (this.cache.temp.exist(cacheKeyValue)) {
      return typeof this.cache.temp.read(cacheKeyValue) !== "number";
    }
    // The shared level cannot distinguish a written negative from an absent
    // key (read() answers undefined for both - cacheFetch and lexEntryKnown
    // share this convention), so an absent key must NOT read as held:
    // the safe direction asks.
    return false;
  }

  /** db round-trip elimination: prime one lex_to_id entry by LEX -
   *  the pair form (or the key form via primeIdsByKey). Writes exactly what
   *  lexToId's cacheFetch would write for the same lex - the id, or the
   *  negative (undefined) entry a junction that does not exist caches - so
   *  a later lexToId(lex) is a cache hit (zero queries) answering what the
   *  point query would have answered. Callers hold the pair ids from a
   *  batched existence check; the negative is only written when the caller
   *  KNOWS the pair was asked and absent (never speculatively). */
  primeIdByLex(lex: Lex, id: number | undefined): void {
    this.cache.write(cacheKey(lex), id);
    this.recordDurableId(lex, id);
  }

  /** the batched fetch composer: record the entries
   *  idToLex's cacheFetch would have written, from a cards ROW the caller
   *  HOLDS (a batched wave read, not an async name(id) read). The write
   *  shape is idToLex's own (lexicon.rb#id_to_lex): String(id) -> lex (the
   *  cacheFetch write-back), cacheKey(lex) -> id (the tap), the durable
   *  pair. The rows come from statements the wave already ran, so every
   *  entry is db truth asked-and-answered - the same invariant
   *  noteDurableName documents - and the later per-row
   *  composeCardRecord/enrichAndStore name reads stay byte-identical
   *  while dropping their one-point-read-per-row cost. */
  noteIdToLexRow(row: Pick<CardsRow, "id" | "name" | "left_id" | "right_id">): void {
    if (row.id === undefined || row.id === null) return;
    const resolved: Lex =
      row.name !== null && row.name !== undefined
        ? row.name
        : [row.left_id ?? undefined, row.right_id ?? undefined];
    this.cache.write(String(row.id), resolved);
    this.cache.write(cacheKey(resolved), row.id);
    this.recordDurableId(resolved, row.id);
  }

  /** the batched fetch composer: mirror idToLex's empty-result
   *  write-back for a side id the batched read proved ABSENT - cacheFetch
   *  caches `undefined` under String(id) on a miss (cache.rb#fetch: "a
   *  stored nil is a hit"), so the later name(id) answers unknown with
   *  zero queries exactly as the point read would have. The durable maps
   *  never materialize the negative (their records say only what the db
   *  proved present). */
  noteIdToLexMiss(id: number): void {
    this.cache.write(String(id), undefined);
  }

  /** lexicon.rb#delete - used by the write path (act integration). */
  deleteFor(id: number | undefined, lexBeforeAct: Lex | undefined): void {
    if (id !== undefined) this.cache.delete(String(id));
    if (lexBeforeAct !== undefined) {
      this.cache.delete(cacheKey(lexBeforeAct));
      // A trash/rename drops the row the durable record claims is there, so
      // the record has to drop with it - otherwise the sync mirror would
      // answer an id for a card that no longer exists.
      this.durableLexIds.delete(cacheKey(lexBeforeAct));
    }
  }

  /** lexicon.rb#id_to_lex. NOTE: no trash filter here - the row is read by
   *  id whatever its trash state. */
  private async idToLex(id: number, rows?: ReadonlyMap<number, NameRow | undefined>): Promise<Lex | undefined> {
    const lex = (await this.cacheFetch(String(id), async () => {
      const row = rows?.has(id) ? rows.get(id) : (await this.driver.query<NameRow>(
        "SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1",
        [id],
      )).rows[0];
      if (row === undefined) return undefined; // `return unless result`
      const resolved: Lex =
        row.name !== null && row.name !== undefined
          ? row.name
          : [row.left_id ?? undefined, row.right_id ?? undefined];
      // tap { cache.write cache_key(lex), id }
      await this.cacheWrite(cacheKey(resolved), id);
      // The same db-truth pair, recorded durably: this read is what proves
      // the id, so the sync name-environment mirror can answer it after the
      // next Temporary reset (see the durableLexIds field comment).
      this.recordDurableId(resolved, id);
      return resolved;
    })) as Lex | undefined;
    return lex;
  }

  /** lexicon.rb#name_to_lex */
  private async nameToLex(name: DeckoName): Promise<Lex | undefined> {
    if (name.isSimple) return name.s;
    const leftId = await this.id(name.leftName ?? DeckoName.parse(""));
    if (leftId === undefined) return undefined;
    const rightId = await this.id(name.rightName ?? DeckoName.parse(""));
    if (rightId === undefined) return undefined;
    return [leftId, rightId];
  }

  /** lexicon.rb#lex_to_name: array lexes join their side names. The guard
   *  `name side_id or return` evaluates the PUBLIC Lexicon.name, which is
   *  never falsy for a present id argument: a side id whose cards row is
   *  MISSING answers the EMPTY name (lexicon.rb:11-15, `(name || "").to_name`)
   *  — truthy — so the join CONTINUES with the empty part and a junction
   *  whose side row is gone composes a "+*default"-shaped name (a compound
   *  card over absent sides composes "+*default"). Only a NIL side id
   *  bails: lexicon.rb#name answers
   *  nil for `id.present? == false` (lexicon.rb:12), making the whole
   *  composition nil. */
  /** Returns the name STRING for array lexes; for simple lexes the LEX
   *  VERBATIM — which can be a DeckoName (the write path caches DeckoName
   *  objects under ids, lexicon.rb:74-82 write_to_temp_cache). Callers
   *  must normalize with the typeof check DbLexicon#name applies. */
  private async lexToName(lex: Lex, rows?: ReadonlyMap<number, NameRow | undefined>): Promise<string | DeckoName | undefined> {
    if (!Array.isArray(lex)) return lex;
    const sides: string[] = [];
    for (const sideId of lex) {
      if (sideId === undefined) return undefined;
      const side = rows===undefined ? await this.name(sideId) : await this.nameFromRows(sideId,rows);
      // Ruby's public Lexicon.name is "" (truthy) for a missing row, so the
      // `or return` guard passes and the empty part joins (lexicon.rb:43-47
      // through lexicon.rb:11-15).
      sides.push(side === undefined ? "" : side.s);
    }
    return sides.join(JOINT);
  }

  /** db round-trip elimination: whether a lex_to_id entry EXISTS
   *  for this lex - a positive id OR a stored negative ("a stored nil is a
   *  hit"). The seatNamesByWave waves use this to skip re-asking a pair or
   *  key whose answer the engine already holds - from an earlier wave OR
   *  from the fetch ladder's own point query (lexToId caches both). The
   *  entry IS the answer; re-asking would only spend a round trip to
   *  re-learn it. Temp first, then shared - the read order cacheFetch
   *  uses, minus the write-back. */
  lexEntryKnown(lex: Lex): boolean {
    const key = cacheKey(lex);
    if (this.cache.temp.exist(key)) return true;
    if (this.cache.shared !== undefined) {
      return this.cache.shared.read(key) !== undefined;
    }
    return false;
  }

  /** Synchronous pair-form mirror of lexToId over CACHE-WARM entries only:
   *  the stored id when the entry is a held POSITIVE, undefined for a held
   *  negative or a cold key — and it never materializes a miss (the same
   *  hazard peekId's doc names: a materialized nil would answer the async
   *  cacheFetch "unknown" for a card the db has). The wave's pair-gate seam
   *  (render.ts seatNamesByWave): "the entry is known" and "the record is
   *  held" are different facts — a primed-positive entry whose row nobody
   *  composed still needs its row asked; a held NEGATIVE keeps the skip. */
  peekIdByLex(lex: Lex): number | undefined {
    const id = this.peekStored(cacheKey(lex));
    return typeof id === "number" ? id : undefined;
  }

  /** db round-trip elimination: whether an id -> lex entry EXISTS for this
   *  id — the String(id) key idToLex's cacheFetch reads, same read order,
   *  without the write-back. The save path's batched side seating uses this
   *  to skip rows the cache already holds (a held entry is an answer
   *  somebody asked for; re-fetching it would spend a round trip to re-learn
   *  it). A held NEGATIVE (a proven-absent id, the undefined entry a point
   *  read cached) counts as held: the later name(id) answers unknown from it,
   *  exactly as the batched read's noteIdToLexMiss would have. */
  heldIdEntry(id: number): boolean {
    const key = String(id);
    if (this.cache.temp.exist(key)) return true;
    if (this.cache.shared !== undefined) {
      return this.cache.shared.read(key) !== undefined;
    }
    return false;
  }

  /**
   * Resolve a SET of names' ids in one round trip, speculatively.
   *
   * THE TRANSPORT PACKING (docs/reports/live-save-transport-design-2026-10-18.md,
   * sections 3 and 5). The save's ladder is 439 pipeline POSTs for 666
   * statements, and 384 of those POSTs carry exactly ONE statement: the
   * engine awaits every answer before it issues the next, so no two
   * statements are ever in flight together and nothing can coalesce them.
   * A card block's constant-id reads are a property of the deck, not of the
   * previous answer, so they can be fetched BEFORE the engine asks for
   * them — and the engine's own lookups then cost no round trip.
   *
   * THE PHASES, and why there are two. A simple name's lookup binds a key
   * (a literal), so every simple name's lookup is independent and they all
   * ride ONE batch. A compound name's lookup binds the ids of its two
   * sides — values an EARLIER lookup produces — so the compound lookups
   * cannot ride with the simple ones; they ride a SECOND batch, after the
   * first batch's answers are in the driver's memo. That is the design's
   * admission rule doing its work: a statement joins the open batch iff it
   * binds no value produced inside that batch.
   *
   * THE ANSWERS. The prefetched lookups are remembered by the DRIVER, under
   * the same key this Lexicon's own lookup uses, so lexToId's read is a
   * memo hit and reaches no wire. A lookup the prefetch could not vouch
   * for is a MISS: lexToId's own read then takes the blocking path, at the
   * same sequence point, and answers the same.
   *
   * @returns the ids the prefetch resolved, in the order the names were
   *   given. A name the prefetch could not resolve is absent.
   */
  async prefetchIds(names: readonly DeckoName[]): Promise<number[]> {
    const driver = this.driver;
    if (driver.prefetchReads === undefined || names.length === 0) return [];
    const resolved = new Map<string, number>();
    // PHASE 1: the simple names' key lookups. Their bound values are
    // literals, so they are mutually independent.
    const simple = names.filter((name) => name.isSimple);
    if (simple.length > 0) {
      const outcomes = await driver.prefetchReads(
        simple.map((name) => this.lookupStatement(name.s as Lex)),
      );
      simple.forEach((name, index) => {
        const id = idOfOutcome(outcomes[index]);
        if (id !== undefined) resolved.set(name.s, id);
      });
    }
    // PHASE 2: the compound names' junction lookups. The sides' ids are
    // known by now: phase 1's prefetch put the simple sides' ids in the
    // driver's memo, so the side lookups below are memo hits.
    const compound = names.filter((name) => !name.isSimple);
    const statements: SQLStatement[] = [];
    const keys: string[] = [];
    for (const name of compound) {
      const lex = await this.nameToLex(name);
      if (lex === undefined) continue;
      statements.push(this.lookupStatement(lex));
      keys.push(name.s);
    }
    if (statements.length > 0) {
      const outcomes = await driver.prefetchReads(statements);
      outcomes.forEach((outcome, index) => {
        const id = idOfOutcome(outcome);
        if (id !== undefined) resolved.set(keys[index] as string, id);
      });
    }
    return [...resolved.values()];
  }

  /** The statement lexToId would issue for this lex, verbatim: the same SQL
   *  string and the same bound values, so the driver's memo key matches the
   *  one lexToId's own read would use. */
  private lookupStatement(lex: Lex): SQLStatement {
    const { sql, params } = lexQuery(lex);
    return { sql: `SELECT id FROM cards WHERE ${sql} AND trash = 0 LIMIT 1`, params };
  }

  /** lexicon.rb#lex_to_id - trash: false filter (lex_query merge). */  private async lexToId(lex: Lex): Promise<number | undefined> {
    const found = (await this.cacheFetch(cacheKey(lex), async () => {
      const { sql, params } = lexQuery(lex);
      const result = await this.driver.query<{ id: number }>(
        `SELECT id FROM cards WHERE ${sql} AND trash = 0 LIMIT 1`,
        params,
      );
      let id: number | undefined = result.rows[0]?.id;
      if (id === undefined && this.storedKeyFallback && !Array.isArray(lex)) {
        id = await this.idByStoredName(lex);
      }
      // `cache.write id.to_s, lex if lex.is_a?(Array)` - compound lexes get
      // the reverse (id -> lex) entry so name(id) avoids a query; simple
      // lexes deliberately do not (lex might not be the canonical name).
      if (id !== undefined && Array.isArray(lex)) {
        await this.cacheWrite(String(id), lex);
      }
      // The point query ran, so a positive id is db truth - record it
      // durably for the same reason idToLex's tap records its pair.
      this.recordDurableId(lex, id);
      return id;
    })) as number | undefined;
    return found;
  }

  /** The storedKeyFallback lookup: rows stored under the requested name
   *  text (as given and standardized), kept only when the stored name's
   *  computed key is the requested key. */
  private async idByStoredName(lex: string): Promise<number | undefined> {
    const requested = DeckoName.parse(lex);
    const texts = lex === requested.s ? [lex] : [lex, requested.s];
    const result = await this.driver.query<{ id: number; name: string | null }>(
      `SELECT id, name FROM cards WHERE name IN (${texts.map(() => "?").join(", ")}) AND trash = 0`,
      texts,
    );
    for (const row of result.rows) {
      if (row.name !== null && DeckoName.parse(row.name).key === requested.key) return row.id;
    }
    return undefined;
  }

  /** cache.fetch with async compute (cache.rb#fetch semantics: temp first,
   *  compute+write-back on miss). */
  private async cacheFetch(key: string, compute: () => Promise<unknown>): Promise<unknown> {
    if (this.cache.temp.exist(key)) return this.cache.temp.read(key);
    if (this.cache.shared !== undefined) {
      const shared = this.cache.shared.read(key);
      if (shared !== undefined) {
        this.cache.temp.write(key, shared, this.cache.afterWriteToTempCache);
        return shared;
      }
    }
    const computed = await compute();
    this.cache.write(key, computed);
    return computed;
  }

  private async cacheWrite(key: string, value: unknown): Promise<void> {
    this.cache.write(key, value);
  }
}

/** A lex entry: name string for simple cards, [left_id, right_id] for
 *  compound cards (lexicon.rb module doc). */
export type Lex = string | [number | undefined, number | undefined];

/** lexicon.rb#cache_key: "L-<joined ids>" for compound, "L-<key>" for simple. */
export function cacheKey(lex: Lex): string {
  return `L-${Array.isArray(lex) ? lex.map((side) => side ?? "").join("-") : DeckoName.parse(lex).key}`;
}

/** lexicon.rb#lex_query: { left_id:, right_id: } for arrays, { key: } for strings.
 *  A nil side queries `IS NULL`, exactly as ActiveRecord renders
 *  where(left_id: nil) - `= NULL` would never match in SQLite.
 *
 *  The string arm folds case (`COLLATE NOCASE`), matching the ci collation
 *  the cards.key column carries on the MySQL reference: Ruby's Lexicon.id
 *  resolves through that collation, so a stored key differing from the
 *  computed key by CASE still resolved there, while libSQL's binary
 *  comparison answers "unknown" and lets validate_uniqueness_of_name
 *  (name_events.rb:19-26) pass — the case-duplicate-creation bug. Keys are
 *  stored downcased at write (the engine writes the computed key), so the
 *  fold only widens matches onto drifted stored keys — the rows MySQL
 *  masked. The Postgres driver translates COLLATE NOCASE to
 *  lower(x) = lower($n) (drivers/postgres.ts), so the one SQL string is
 *  dual-path by construction. */
export function lexQuery(lex: Lex): { sql: string; params: unknown[] } {
  if (Array.isArray(lex)) {
    return {
      sql: `${lex[0] === undefined ? "left_id IS NULL" : "left_id = ?"} AND ${
        lex[1] === undefined ? "right_id IS NULL" : "right_id = ?"
      }`,
      params: [lex[0], lex[1]].filter((side) => side !== undefined),
    };
  }
  return { sql: "key COLLATE NOCASE = ?", params: [DeckoName.parse(lex).key] };
}

// Card::Codename port (card-1.110.0 lib/card/codename.rb) - the fast,
// slow-changing cache mapping codenames to ids and back.
//
// Ruby loads a "codehash" ({ c2i: codename->id, i2c: id->codename }) from
// the database ONCE and caches it in the Card cache under the "CODENAMES"
// key (codename.rb#load_codehash/#codehash); loading also seeds the Lexicon
// with every simple codenamed card (codename.rb#seed_caches).

import { DeckoName } from "../name.js";
import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import { CardCache } from "./cache.js";
import type { DbLexicon, Lex } from "./lexicon.js";

/** codename.rb:150 - the cache key the codehash lives under. */
export const CODENAMES_CACHE_KEY = "CODENAMES";

interface Codehash {
  c2i: Map<string, number>;
  i2c: Map<number, string>;
}

export class DbCodenameRegistry {
  private readonly driver: SQLDatabaseDriver;
  /** Card::Cache[Card] - the codehash is stored in the CARD cache
   *  (codename.rb#load_codehash), not a Codename-class cache. */
  private readonly cache: CardCache;
  private readonly lexicon: DbLexicon;
  private codehashValue: Codehash | undefined;

  constructor(driver: SQLDatabaseDriver, cache: CardCache, lexicon: DbLexicon) {
    this.driver = driver;
    this.cache = cache;
    this.lexicon = lexicon;
  }

  /** codename.rb#id (String/Symbol branch): codename -> id. */
  async id(codename: string): Promise<number | undefined> {
    const codehash = await this.codehash();
    return codehash.c2i.get(codename);
  }

  /** codename.rb#[] (Integer branch): id -> codename. */
  async nameForId(id: number): Promise<string | undefined> {
    const codehash = await this.codehash();
    return codehash.i2c.get(id);
  }

  /** codename.rb#name(codename): (card_id = id codename) && Lexicon.name(card_id). */
  async name(codename: string): Promise<DeckoName | undefined> {
    const cardId = await this.id(codename);
    return cardId === undefined ? undefined : this.lexicon.name(cardId);
  }

  /** codename.rb#reset_cache: clear the memo, drop the cache entry. */
  resetCache(): void {
    this.codehashValue = undefined;
    this.cache.delete(CODENAMES_CACHE_KEY);
  }

  /** Force the codehash load; the sync NameCodenameRegistry adapter handed
   *  to the name environment can only read the memoized hash, so callers
   *  that need it synchronously await this first. */
  async ensureLoaded(): Promise<void> {
    await this.codehash();
  }

  // ---- sync peeks (memo only; undefined until the codehash is loaded) -----

  peekId(codename: string): number | undefined {
    return this.codehashValue?.c2i.get(codename);
  }

  peekNameForId(id: number): string | undefined {
    return this.codehashValue?.i2c.get(id);
  }

  peekName(codename: string): string | undefined {
    const id = this.peekId(codename);
    return id === undefined ? undefined : this.codehashValue?.i2c.get(id);
  }

  /** codename.rb#codehash / #load_codehash: Card.cache.fetch("CODENAMES")
   *  { process_codenames }. The fetch value is the codehash; the in-memory
   *  memo avoids re-parsing Maps out of the cache on every call. */
  private async codehash(): Promise<Codehash> {
    if (this.codehashValue !== undefined) return this.codehashValue;
    const cached = this.cache.fetch(CODENAMES_CACHE_KEY, () => null) as Codehash | null;
    if (cached && cached.c2i instanceof Map && cached.i2c instanceof Map) {
      this.codehashValue = cached;
      return cached;
    }
    const fresh = await this.processCodenames();
    this.cache.write(CODENAMES_CACHE_KEY, fresh);
    this.codehashValue = fresh;
    return fresh;
  }

  /** codename.rb#process_codenames: query all codenamed cards, build both
   *  maps, and seed the lexicon with each SIMPLE codenamed card
   *  (#seed_caches: `return if card.left_id`). */
  private async processCodenames(): Promise<Codehash> {
    const result = await this.driver.query<Pick<CardsRow, "id" | "codename" | "name" | "left_id" | "right_id">>(
      "SELECT id, codename, name, left_id, right_id FROM cards WHERE codename IS NOT NULL",
      [],
    );
    const codehash: Codehash = { c2i: new Map(), i2c: new Map() };
    for (const row of result.rows) {
      if (row.codename === null || row.codename === undefined) continue;
      codehash.c2i.set(row.codename, row.id);
      codehash.i2c.set(row.id, row.codename);
      if (row.left_id === null || row.left_id === undefined) {
        const name = row.name !== null && row.name !== undefined ? DeckoName.parse(row.name) : undefined;
        if (name !== undefined) {
          const lex: Lex = name.isSimple ? name.s : [row.left_id ?? undefined, row.right_id ?? undefined];
          this.lexicon.write(row.id, name, lex);
        }
      }
    }
    return codehash;
  }
}

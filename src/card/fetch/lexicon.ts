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
import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import { CardCache } from "./cache.js";

/** lib/card/name.rb:16-17 Name.joint; Card::Name.joint delegates to it. */
const JOINT = DeckoName.JOINT;

export class DbLexicon {
  private readonly driver: SQLDatabaseDriver;
  /** Card::Cache[Lexicon] (lexicon.rb#cache) - separate cache instance per class. */
  readonly cache: CardCache;

  constructor(driver: SQLDatabaseDriver, cache: CardCache) {
    this.driver = driver;
    this.cache = cache;
  }

  /** lexicon.rb#name(id): registered name, or the empty name when unknown
   *  (Ruby `(name || "").to_name`; blankness is the unknown signal at every
   *  consumer - retrieve_from_cache_by_id, id_from_string validation).
   *  This port returns undefined instead of the empty name; see
   *  docs/fetch-port-notes.md ("empty-name fallback"). */
  async name(id: number | undefined): Promise<DeckoName | undefined> {
    if (id === undefined || id === null) return undefined; // lexicon.rb#name guard
    const lex = await this.idToLex(id);
    const name = lex === undefined ? undefined : await this.lexToName(lex);
    return name === undefined ? undefined : DeckoName.parse(name);
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
    const id = this.cache.read(cacheKey(lex));
    return typeof id === "number" ? id : undefined;
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
    if (lex !== undefined) this.cache.temp.write(cacheKey(lex), id);
  }

  /** lexicon.rb#write */
  write(id: number, name: DeckoName, lex: Lex): void {
    this.cache.write(String(id), name);
    this.cache.write(cacheKey(lex), id);
  }

  /** lexicon.rb#delete - used by the write path (act integration). */
  deleteFor(id: number | undefined, lexBeforeAct: Lex | undefined): void {
    if (id !== undefined) this.cache.delete(String(id));
    if (lexBeforeAct !== undefined) this.cache.delete(cacheKey(lexBeforeAct));
  }

  /** lexicon.rb#id_to_lex. NOTE: no trash filter here - the row is read by
   *  id whatever its trash state. */
  private async idToLex(id: number): Promise<Lex | undefined> {
    const lex = (await this.cacheFetch(String(id), async () => {
      const result = await this.driver.query<Pick<CardsRow, "name" | "left_id" | "right_id">>(
        "SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1",
        [id],
      );
      const row = result.rows[0];
      if (row === undefined) return undefined; // `return unless result`
      const resolved: Lex =
        row.name !== null && row.name !== undefined
          ? row.name
          : [row.left_id ?? undefined, row.right_id ?? undefined];
      // tap { cache.write cache_key(lex), id }
      await this.cacheWrite(cacheKey(resolved), id);
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

  /** lexicon.rb#lex_to_name: array lexes join their side names; a missing
   *  side (`name side_id or return`) makes the whole name unknown. */
  private async lexToName(lex: Lex): Promise<string | undefined> {
    if (!Array.isArray(lex)) return lex;
    const sides: string[] = [];
    for (const sideId of lex) {
      if (sideId === undefined) return undefined;
      const side = await this.name(sideId);
      if (side === undefined) return undefined;
      sides.push(side.s);
    }
    return sides.join(JOINT);
  }

  /** lexicon.rb#lex_to_id - trash: false filter (lex_query merge). */
  private async lexToId(lex: Lex): Promise<number | undefined> {
    const found = (await this.cacheFetch(cacheKey(lex), async () => {
      const { sql, params } = lexQuery(lex);
      const result = await this.driver.query<{ id: number }>(
        `SELECT id FROM cards WHERE ${sql} AND trash = 0 LIMIT 1`,
        params,
      );
      const id = result.rows[0]?.id;
      // `cache.write id.to_s, lex if lex.is_a?(Array)` - compound lexes get
      // the reverse (id -> lex) entry so name(id) avoids a query; simple
      // lexes deliberately do not (lex might not be the canonical name).
      if (id !== undefined && Array.isArray(lex)) {
        await this.cacheWrite(String(id), lex);
      }
      return id;
    })) as number | undefined;
    return found;
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
 *  where(left_id: nil) - `= NULL` would never match in SQLite. */
export function lexQuery(lex: Lex): { sql: string; params: unknown[] } {
  if (Array.isArray(lex)) {
    return {
      sql: `${lex[0] === undefined ? "left_id IS NULL" : "left_id = ?"} AND ${
        lex[1] === undefined ? "right_id IS NULL" : "right_id = ?"
      }`,
      params: [lex[0], lex[1]].filter((side) => side !== undefined),
    };
  }
  return { sql: "key = ?", params: [DeckoName.parse(lex).key] };
}

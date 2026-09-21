// The render engine: TypeScript port of the Decko card renderer's public
// surface, with the decko-commons/decko#1282 batched inclusion prefetch.
//
//   const engine = new RenderEngine(fetchEngine);
//   const html = await engine.render("Home", "open");
//
// Render pipeline (see docs/render-port-notes.md for the full trail):
//   1. fetch the root through the FetchEngine ladder (cache -> db)
//   2. prefetch the inclusion closure (src/card/render/prefetch.ts - one
//      batched round trip for any depth; per-level fallback only on CTE
//      misses), enrich type/set-key data, pre-execute Search cores
//   3. render from memory: the view tree walks cached records only; a warm
//      render issues zero queries
//
// Ruby surface ports:
// - format/render.rb#render!: voo lifecycle + view dispatch (format.ts)
// - render.rb#view_method + card-mod-format error.rb#unsupported_view_error_
//   message: unknown views raise with "view (X) not supported for NAME"
// - format/nesting.rb + nest.rb: subformats, implicit nest view, home_view
// - Search cores dispatch by type NAME ("Search", set/all/type.rb#type_name);
//   Ruby dispatches by set module (type_code :search_type). The codename
//   registry lookup would cost a (cacheable) query on the render path; the
//   divergence is recorded in docs/render-port-notes.md.

import { DeckoName } from "./name.js";
import { FetchEngine } from "./fetch.js";
import { cardContent, type CardRecord } from "./fetch/card-record.js";
import { executeQuery } from "../cql/execute.js";
import { findRule } from "./rules/lookup.js";
import { applyViewOverride, resolveViewOverride } from "./rules/apply.js";
import type { CardsRow } from "../server/schema.js";
import {
  RenderFormat,
  UnsupportedViewError,
  type RenderCard,
  type RenderEngineLike,
  type ViewFn,
} from "./render/format.js";
import { HTML_VIEWS } from "./render/views.js";
import {
  prefetchInclusionClosure,
  type PrefetchStats,
} from "./render/prefetch.js";
import { safeSetKeys } from "./render/set-keys.js";
import { referencedNames } from "./render/nest-syntax.js";
import {
  readPermissionStatements,
  readPermissionStateFromResults,
  anonymousIdFromResults,
  canReadByStoredRule,
  canReadByRuleLookup,
  type ReadPermissionState,
} from "./permissions/index.js";
import type { SQLQueryResult } from "../server/driver.js";

export { UnsupportedViewError };
export type { RenderCard, PrefetchStats };
export { HTML_VIEWS };

const SEARCH_TYPE_NAME = "Search";

export class RenderEngine implements RenderEngineLike {
  readonly fetcher: FetchEngine;
  readonly views: Record<string, ViewFn>;

  /** Enriched render cards by key - the render path reads this map
   *  synchronously (everything in it was prefetched/enriched). */
  private renderCards = new Map<string, RenderCard>();
  /** Rule lookup cache: `<card_key>|<view>` -> the resolved ViewOverride
   *  (or undefined if no rule applies). Filled during the first render of
   *  a (card, view) pair; subsequent renders skip the rule walk entirely.
   *  This is what keeps the #1282 constant-queries promise: a warm render
   *  issues ZERO queries for rule application. Cleared on resetCaches(). */
  private ruleCache = new Map<string, ReturnType<typeof resolveViewOverride> | undefined>();
  /** key -> id for prefetched cards - the SYNC resolver CQL's name-to-id
   *  conditions need (parse options take a sync callback; the async lexicon
   *  cannot serve it, so the prefetch primes this map instead). */
  private idsByKey = new Map<string, number>();
  /** Pre-executed search results by search card key. */
  private searchResults = new Map<string, RenderCard[]>();
  /** Read-permission state for the engine's viewer (the Anonymous corpus
   *  actor) — the port of Auth.as_card.read_rules_hash. Resolved lazily on
   *  the first render, folded into the prefetch batch so a cold render
   *  stays ONE round trip; undefined until then. Cleared on resetCaches(). */
  private readPermission: ReadPermissionState | undefined;
  /** card id -> denied verdict (the pure half of ok_to_read?). Computed in
   *  the prepare phase so the synchronous render path never queries.
   *  Cleared on resetCaches(). */
  private deniedVerdicts = new Map<number, boolean>();
  /** Codename ids the rule? predicate compares against (SettingID/SetID/
   *  UserID, resolved from the codename codehash). Folded into the cold
   *  render's closure batch (zero extra round trips); undefined until
   *  then. Cleared on resetCaches(). */
  private ruleTypeIds:
    | { setting: number | undefined; set: number | undefined; user: number | undefined }
    | undefined;
  private lastPrefetch: PrefetchStats | undefined;

  constructor(fetcher: FetchEngine) {
    this.fetcher = fetcher;
    this.views = HTML_VIEWS;
  }

  /** Query-cost stats of the most recent render (diagnostics; the tests
   *  measure through a counting driver instead). */
  get lastRenderStats(): PrefetchStats | undefined {
    return this.lastPrefetch;
  }

  /**
   * Render one view of one card to HTML bytes. Throws UnsupportedViewError
   * for views outside the ported registry (the captured sentinel contract).
   */
  async render(cardName: string, view: string): Promise<string> {
    const record = await this.fetcher.fetchByName(cardName);
    if (record === undefined || record.name === undefined) {
      throw new Error(`card not found: ${cardName}`);
    }
    const name = record.name;

    // Read-permission preparation (see src/card/permissions/). On a cold
    // render the state resolution rides the prefetch batch (one round trip
    // stays one round trip); on a warm closure it runs as its own batch —
    // once per engine, never per warm render. The codename codehash (the
    // rule? predicate's type-id source) folds into the same batch.
    const permissionCold = this.readPermission === undefined;
    const ruleTypesCold = this.ruleTypeIds === undefined;
    const permissionStatementCount = permissionCold ? readPermissionStatements().length : 0;
    let foldedResults: SQLQueryResult[] | undefined;
    if (!this.closureWarm(record)) {
      const coldStatements = [
        ...readPermissionStatements().slice(0, permissionStatementCount),
        ...(ruleTypesCold ? [this.fetcher.codenames.codehashStatement()] : []),
      ];
      const stats = await prefetchInclusionClosure(record, {
        driver: this.fetcher.driver,
        lexicon: this.fetcher.lexicon,
        cacheRecord: (cached) => this.cacheFetchedRecord(cached),
        ...(coldStatements.length > 0 ? { additionalStatements: coldStatements } : {}),
      });
      this.lastPrefetch = stats;
      foldedResults = stats.additionalResults;
      // The rule ids must be memoized BEFORE enrichment: enrichAndStore
      // computes set keys (the RULE pattern's applies?) synchronously from
      // them. Sliced past the permission statements the batch also carried.
      if (ruleTypesCold) this.parseRuleTypeIds(foldedResults, permissionStatementCount);
      // The root itself may not be in the walked set (already cached).
      await this.enrichAndStore(record);
    }
    if (permissionCold) await this.ensureReadPermission(foldedResults);
    await this.prepareSearches(record);
    await this.ensureVerdicts();

    const rootCard = this.renderCards.get(name.key);
    if (rootCard === undefined) {
      throw new Error(`render card not prepared: ${name.s}`);
    }
    const format = new RenderFormat(rootCard, this, { maxDepth: 42 });
    const baseHtml = format.renderView(view, {});

    // A denied render never reaches view dispatch (the denial span REPLACES
    // the view in renderView), so view-override rules cannot apply to it —
    // Ruby's denial happens before any view body runs.
    if (this.isDenied(rootCard)) return baseHtml;

    // Rule-application hook: cached lookup so warm re-renders cost zero
    // queries. The cache key encodes the (card, view) pair so different
    // views of the same card get independent override resolution.
    const cacheKey = `${name.key}|${view}`;
    let override = this.ruleCache.get(cacheKey);
    if (override === undefined && !this.ruleCache.has(cacheKey)) {
      // Miss: walk the rule chain. Cache both the hit AND the miss (the
      // undefined in `override` could mean "no rule" — we distinguish via
      // `has`, but the cache stores undefined for misses too).
      const rule = await findRule(
        this.fetcher,
        { name, id: rootCard.id, typeId: rootCard.record.typeId, typeName: rootCard.typeName },
        `*${view}`,
      );
      override = rule === undefined ? undefined : resolveViewOverride(view, [rule.rule]);
      this.ruleCache.set(cacheKey, override);
    }
    if (override !== undefined) return applyViewOverride(baseHtml, override);
    return baseHtml;
  }

  /** Drop every derived cache (the fetch engine's caches + the render-side
   *  maps). Mirrors FetchEngine#resetCaches for whole-engine resets. */
  resetCaches(): void {
    this.fetcher.resetCaches();
    this.renderCards.clear();
    this.idsByKey.clear();
    this.searchResults.clear();
    this.ruleCache.clear();
    this.readPermission = undefined;
    this.deniedVerdicts.clear();
    this.lastPrefetch = undefined;
  }

  // -------------------------------------------------------------------------
  // read-permission resolution (prepare phase; never during the render)
  // -------------------------------------------------------------------------

  /** Complete the permission state from folded batch results, or run the
   *  standalone batch (warm-closure first render). Once per engine. */
  private async ensureReadPermission(folded?: SQLQueryResult[]): Promise<ReadPermissionState> {
    if (this.readPermission !== undefined) return this.readPermission;
    const results =
      folded ?? (await this.fetcher.driver.batch(readPermissionStatements()));
    this.readPermission = readPermissionStateFromResults(
      results,
      anonymousIdFromResults(results),
      false, // signed_in: the corpus viewer is Anonymous (no roles to join)
    );
    return this.readPermission;
  }

  /**
   * Verdicts for every card the render can touch — the sync render path
   * reads only this map. Stored read_rule_id cards resolve purely
   * (permissions.rb:142-143); cards without one fall back to the live rule
   * walk (permission_rule_id, permissions.rb:55-61) — bounded by the
   * hasReadRules gate, so rule-less seeds cost zero queries and stay
   * allowed (the documented divergence).
   */
  private async ensureVerdicts(): Promise<void> {
    const state = this.readPermission;
    if (state === undefined) return;
    for (const card of this.renderCards.values()) {
      if (card.id === undefined || this.deniedVerdicts.has(card.id)) continue;
      const stored = card.record.readRuleId;
      if (stored !== undefined) {
        this.deniedVerdicts.set(card.id, !canReadByStoredRule(stored, state));
        continue;
      }
      const byRule = await canReadByRuleLookup(
        this.fetcher,
        { name: card.name, id: card.id, typeId: card.record.typeId, typeName: card.typeName },
        state,
      );
      this.deniedVerdicts.set(card.id, byRule === false); // undefined = rule-less: allowed
    }
  }

  // -------------------------------------------------------------------------
  // RenderEngineLike - the synchronous render-path surface
  // -------------------------------------------------------------------------

  /** Cache-first card resolution for the render path. Returns undefined for
   *  anything the prefetch did not prepare (the nest machinery reports). */
  fetchRenderCard(name: string): RenderCard | undefined {
    const key = DeckoName.parse(name).key;
    return this.renderCards.get(key);
  }

  /** The read-permission verdict for a prepared card (ok_to_read?'s set
   *  membership, precomputed in the prepare phase — never a query here). */
  isDenied(card: RenderCard): boolean {
    return card.id !== undefined && this.deniedVerdicts.get(card.id) === true;
  }

  /** Pre-executed results for a Search core (card_list view). */
  executeSearch(fmt: RenderFormat): RenderCard[] {
    return this.searchResults.get(fmt.card.key) ?? [];
  }

  // -------------------------------------------------------------------------
  // prepare phase (all async work happens here, never during the render)
  // -------------------------------------------------------------------------

  /**
   * The closure is warm when every reference reachable from `record` is
   * already in the render-card map. A synchronous parse + map walk - no
   * queries (this is what makes warm re-renders free).
   */
  private closureWarm(record: CardRecord): boolean {
    if (record.key === undefined || record.key === "") return false;
    if (!this.renderCards.has(record.key)) return false;
    const seen = new Set<string>();
    const queue: string[] = [record.key];
    while (queue.length > 0) {
      const key = queue.pop() as string;
      if (seen.has(key)) continue;
      seen.add(key);
      const card = this.renderCards.get(key);
      if (card === undefined) return false;
      for (const ref of this.cardReferenceKeys(card)) {
        if (!this.renderCards.has(ref)) return false;
        if (!seen.has(ref)) queue.push(ref);
      }
      if (card.typeName === SEARCH_TYPE_NAME && !this.searchResults.has(card.key)) {
        return false;
      }
    }
    return true;
  }

  /** Absolute reference keys inside one render card's content (the real
   *  parser - the same one the render uses). */
  private cardReferenceKeys(card: RenderCard): string[] {
    const keys: string[] = [];
    for (const ref of referencedNames(card.dbContent)) {
      if (ref.relative) continue;
      const key = DeckoName.parse(ref.name).key;
      if (key !== "") keys.push(key);
    }
    return keys;
  }

  /** Cache a prefetched record (prefetch callback) + enrich it. The record
   *  also enters the FETCH engine's cache (store.rb#update_cache? would
   *  cache it in Ruby: fresh_from_db) so the fetch ladder stays coherent
   *  and later fetchById/fetchByName calls are cache hits. */
  private async cacheFetchedRecord(record: CardRecord): Promise<void> {
    if (record.key === undefined || record.key === "") return;
    this.fetcher.writeToCache(record);
    await this.enrichAndStore(record);
  }

  /** Enrich a record (type name, set keys) and store the render card. Type
   *  and side cards were prefetched - these fetches are cache hits. */
  private async enrichAndStore(record: CardRecord): Promise<RenderCard> {
    const key = record.key as string;
    const existing = this.renderCards.get(key);
    if (existing !== undefined) return existing;

    const name = record.name ?? DeckoName.parse("");
    const typeId = record.typeId;
    let typeName: string | undefined;
    if (typeId !== undefined) {
      const typeRecord =
        (await this.fetcher.retrieveFromCacheById(typeId)) ??
        (await this.fetcher.fetchById(typeId));
      typeName = typeRecord?.name?.s;
    }
    let leftTypeName: string | undefined;
    if (name.isCompound) {
      const leftKey = name.leftName?.key;
      const leftRecord =
        leftKey !== undefined
          ? (await this.fetcher.fetchByName(leftKey)) ?? undefined
          : undefined;
      if (leftRecord !== undefined) {
        const leftCard = await this.enrichAndStore(leftRecord);
        leftTypeName = leftCard.typeName;
      }
    }
    const card: RenderCard = {
      record,
      name,
      key,
      typeName,
      typeId,
      id: record.id,
      dbContent: cardContent(record),
      setKeys: safeSetKeys({ name, typeId, typeName, leftTypeName }),
    };
    this.renderCards.set(key, card);
    if (record.id !== undefined) this.idsByKey.set(key, record.id);
    return card;
  }

  /**
   * Pre-execute Search-type cores reachable from the root (their results are
   * read synchronously by the card_list view). Items join the render-card
   * map, and item content participates in the walk (nested searches inside
   * results resolve too).
   */
  private async prepareSearches(root: CardRecord): Promise<void> {
    const visited = new Set<string>();
    const queue: CardRecord[] = [root];
    while (queue.length > 0) {
      const current = queue.shift() as CardRecord;
      const key = current.key;
      if (key === undefined || visited.has(key)) continue;
      visited.add(key);
      const card = this.renderCards.get(key);
      if (card === undefined) continue;
      // walk content references first (a search card nested via {{}})
      for (const refKey of this.cardReferenceKeys(card)) {
        const refCard = this.renderCards.get(refKey);
        if (refCard !== undefined && !visited.has(refKey)) queue.push(refCard.record);
      }
      if (card.typeName !== SEARCH_TYPE_NAME) continue;
      if (this.searchResults.has(key)) continue;
      const items = await this.runSearch(card);
      this.searchResults.set(key, items);
      for (const item of items) {
        if (!visited.has(item.key)) queue.push(item.record);
      }
    }
  }

  /** card-mod-search set/abstract/cql_search.rb shape: the Search card's
   *  content is a CQL statement; execute it through the CQL engine. */
  private async runSearch(card: RenderCard): Promise<RenderCard[]> {
    let statement: unknown;
    try {
      statement = JSON.parse(card.dbContent);
    } catch {
      return []; // search error views are wave 3 (search_error)
    }
    if (statement === null || typeof statement !== "object" || Array.isArray(statement)) {
      return [];
    }
    let rows: CardsRow[];
    try {
      const result = await executeQuery(this.fetcher.driver, statement as Record<string, unknown>, {
        parse: {
          // sync resolver over the prefetched id map (module doc)
          resolveCardId: (nameish: string) => this.idsByKey.get(DeckoName.parse(nameish).key),
        },
      });
      rows = "rows" in result ? result.rows : [];
    } catch {
      return []; // search_error view is wave 3
    }
    const items: RenderCard[] = [];
    for (const row of rows) {
      const record = await this.fetcher.fetchById(row.id);
      if (record === undefined || record.name === undefined) continue;
      const enriched = await this.enrichAndStore(record);
      items.push(enriched);
    }
    return items;
  }
}

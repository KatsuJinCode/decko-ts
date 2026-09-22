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
import { cardContent, composeCardRecord, type CardRecord } from "./fetch/card-record.js";
import { executeQuery } from "../cql/execute.js";
import { findRule } from "./rules/lookup.js";
import { applyViewOverride, resolveViewOverride } from "./rules/apply.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  resolveStructuredContent,
  templateReferenceNames,
} from "./rules/structure.js";
import type { CardsRow } from "../server/schema.js";
import {
  RenderFormat,
  UnsupportedViewError,
  type RenderCard,
  type RenderEngineLike,
  type ViewFn,
} from "./render/format.js";
import { HTML_VIEWS } from "./render/views.js";
import { badQuery, emptyQueryError } from "./render/errors.js";
import {
  prefetchInclusionClosure,
  type PrefetchStats,
} from "./render/prefetch.js";
import { safeSetKeys } from "./render/set-keys.js";
import { referencedNames } from "./render/nest-syntax.js";
import type { PatternCardInput } from "./set-patterns/types.js";
import {
  readPermissionStatements,
  readPermissionStateFromViewerResults,
  canReadByStoredRule,
  canReadByRuleLookup,
  ANONYMOUS_VIEWER,
  type ReadViewer,
  type ReadPermissionState,
} from "./permissions/index.js";
import {
  allTaskVerdictsForCard,
  viewTaskPermissionStatements,
  viewTaskStateFromResults,
  type ViewTaskState,
  type WriteTask,
} from "./permissions/view-task-rules.js";
import { viewRequiresTask, type CrudTask } from "./permissions/view-perms.js";
import { installHelpRules, type HelpRulesApi } from "./render/help-popover.js";
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
  /** The viewer whose readable set the permission engine enforces —
   *  Anonymous by default; a signed-in session's actor carries its role
   *  parties (see ReadViewer in src/card/permissions/read-rules.ts). Set
   *  before the first render, or together with resetCaches() after. */
  viewer: ReadViewer = ANONYMOUS_VIEWER;
  /** Codename ids the rule? predicate compares against (SettingID/SetID/
   *  UserID, resolved from the codename codehash). Folded into the cold
   *  render's closure batch (zero extra round trips); undefined until
   *  then. Cleared on resetCaches(). */
  private ruleTypeIds:
    | { setting: number | undefined; set: number | undefined; user: number | undefined }
    | undefined;
  /** *structure rule templates by rule-card composed key -> the rule card's
   *  db_content (null = NULL content). The bulk universe rides the cold
   *  render's closure batch (one statement, zero extra round trips — the
   *  #1282 shape); structured content (content/all.rb:8-10:
   *  structured_content || standard_content) is then pure memory. Undefined
   *  until the first parse. Cleared on resetCaches(). */
  private structureContents: Map<string, string | null> | undefined;
  /** Render-card keys whose dbContent already went through the structured
   *  pass (idempotence: the pass re-runs after search enrichment without
   *  re-processing the closure). Cleared on resetCaches(). */
  private structureProcessed = new Set<string>();
  /** Absolute template reference keys that missed fetch (nest targets that
   *  are not cards — e.g. the corpus's {{xxxx}} fixtures). Never re-fetched
   *  on later renders, so warm renders stay zero-query. Cleared on
   *  resetCaches(). */
  private structureRefMisses = new Set<string>();
  /** ok_to_<task>? state for the non-read view tasks — loaded once per
   *  engine, on the first render whose ROOT view demands a non-read task
   *  (docs/view-perms-notes.md). Cleared on resetCaches(). */
  private taskState: ViewTaskState | undefined;
  /** card key -> allowed verdicts per write task (the ensureVerdicts
   *  model; undefined entries mean unverifiable). Cleared on resetCaches(). */
  private taskVerdicts = new Map<string, Record<WriteTask, boolean | undefined>>();
  /** The help-rule resolver (menu popover content) — attached once per
   *  engine by installHelpRules; its deck-wide batch runs once in the
   *  prepare phase. format.ts reads engine.helpRules. Cleared on
   *  resetCaches(). */
  helpRules?: HelpRulesApi;
  private helpResolver: ReturnType<typeof installHelpRules> | undefined;
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
    const structureCold = this.structureContents === undefined;
    const permissionStatements = permissionCold ? readPermissionStatements(this.viewer) : [];
    let foldedResults: SQLQueryResult[] | undefined;
    if (!this.closureWarm(record)) {
      const coldStatements = [
        ...permissionStatements,
        ...(ruleTypesCold ? [this.fetcher.codenames.codehashStatement()] : []),
        // The *structure rule universe (one statement; the structured-content
        // resolution reads it as pure memory afterwards). Appended LAST: the
        // permission state parser reads folded results by fixed index.
        ...(structureCold ? [structureRuleUniverseStatement()] : []),
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
      if (ruleTypesCold) this.parseRuleTypeIds(foldedResults, permissionStatements.length);
      this.parseStructureContents(
        foldedResults,
        permissionStatements.length + (ruleTypesCold ? 1 : 0),
      );
      // The root itself may not be in the walked set (already cached).
      await this.enrichAndStore(record);
    }
    if (permissionCold) await this.ensureReadPermission(foldedResults);
    // Structured content pass #1: the prefetched closure (Ruby resolves the
    // template at Card#content time — every view reads the substituted
    // accessor; templating.rb#structure).
    await this.applyStructureContent();
    await this.prepareSearches(record);
    // Pass #2: cards enrichAndStore'd during search preparation (their
    // records joined after pass #1). Idempotent — processed keys skip.
    await this.applyStructureContent();
    await this.ensureVerdicts();
    await this.ensureTaskVerdicts(view);
    if (this.helpResolver === undefined) {
      this.helpResolver = installHelpRules(this, this.fetcher);
      await this.helpResolver.prepare();
    }

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
    this.ruleTypeIds = undefined;
    this.structureContents = undefined;
    this.structureProcessed.clear();
    this.structureRefMisses.clear();
    this.taskState = undefined;
    this.taskVerdicts.clear();
    this.helpRules = undefined;
    this.helpResolver = undefined;
    this.lastPrefetch = undefined;
  }

  // -------------------------------------------------------------------------
  // structured content (content/all.rb:8-10 — the *structure rule template)
  // -------------------------------------------------------------------------

  /** Parse the folded universe statement result (sliced past the permission
   *  + codename statements). Falls back to one standalone batch on the
   *  defensive warm-closure-first-render path (once per engine). */
  private async parseStructureContents(
    folded: SQLQueryResult[] | undefined,
    structureStatementIndex: number,
  ): Promise<void> {
    if (this.structureContents !== undefined) return;
    let result = folded !== undefined ? folded[structureStatementIndex] : undefined;
    if (result === undefined) {
      // No folded batch to read (defensive: a warm-closure first render).
      const batch = await this.fetcher.driver.batch([structureRuleUniverseStatement()]);
      result = batch[0];
    }
    this.structureContents = structureUniverseFromResults(result);
  }

  /**
   * Substitute structured content into every prepared render card that an
   * applicable *structure rule governs (content/all.rb:8-10:
   * structured_content || standard_content). Mutates RenderCard.dbContent in
   * place — the single content accessor the views read (format.ts#renderRaw,
   * the port of base.rb:75-77's structure_card&.content) — so no view code
   * changes. Then completes the closure: absolute references inside
   * templates are fetched + enriched (prepare phase; per-render caches make
   * repeats free), so warm renders stay warm and zero-query.
   *
   * Idempotent and incremental: cards already processed skip via
   * structureProcessed; names that already missed fetch skip via
   * structureRefMisses (the corpus's {{xxxx}} targets are not cards — Ruby
   * renders them as unknown-card views; we must not re-query them ever).
   */
  private async applyStructureContent(): Promise<void> {
    const universe = this.structureContents;
    if (universe === undefined) return;
    for (let round = 0; round < 8; round++) {
      const toFetch = new Map<string, string>(); // ref name -> key
      for (const [key, card] of this.renderCards) {
        if (this.structureProcessed.has(key)) continue;
        this.structureProcessed.add(key);
        const resolved = resolveStructuredContent(
          await this.structurePatternInputFor(card),
          universe,
        );
        if (resolved === undefined) continue;
        if (resolved.templateContent !== card.dbContent) card.dbContent = resolved.templateContent;
        for (const refName of templateReferenceNames(resolved.templateContent)) {
          const refKey = DeckoName.parse(refName).key;
          if (
            refKey === "" ||
            this.renderCards.has(refKey) ||
            this.structureRefMisses.has(refKey) ||
            toFetch.has(refKey)
          ) {
            continue;
          }
          toFetch.set(refKey, refName);
        }
      }
      if (toFetch.size === 0) return;
      // Simple refs: ONE batched IN-query per round (the prefetch fallback's
      // verifyClosure shape — never one query per name). Compound refs ride
      // the fetch ladder individually (corpus templates carry simple and
      // relative refs; junction template refs are rare). Genuinely missing
      // names land in structureRefMisses — unknown nest targets render as
      // unknown-card views (Ruby parity) and are never re-queried.
      const simpleKeys: string[] = [];
      const compoundNames: string[] = [];
      for (const [refKey, refName] of toFetch) {
        if (DeckoName.parse(refName).isCompound) compoundNames.push(refName);
        else simpleKeys.push(refKey);
      }
      let enrichedAny = false;
      if (simpleKeys.length > 0) {
        const placeholders = simpleKeys.map(() => "?").join(", ");
        const result = await this.fetcher.driver.query<CardsRow>(
          // COLLATE NOCASE matches the cards_key_index collation (see
          // prefetch.ts's fallback rounds).
          `SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (${placeholders}) AND trash = 0`,
          simpleKeys,
        );
        const rows = result.rows as CardsRow[];
        for (const row of rows) {
          const record = await composeCardRecord(row, this.fetcher.lexicon);
          if (record.name === undefined) continue;
          await this.cacheFetchedRecord(record);
          enrichedAny = true;
        }
        const foundKeys = new Set(rows.map((row) => row.key));
        for (const missKey of simpleKeys) {
          if (!foundKeys.has(missKey)) this.structureRefMisses.add(missKey);
        }
      }
      for (const refName of compoundNames) {
        const fetched = await this.fetcher.fetchByName(refName);
        const refKey = DeckoName.parse(refName).key;
        if (fetched === undefined || fetched.name === undefined) {
          this.structureRefMisses.add(refKey); // unknown nest target: render decides
          continue;
        }
        await this.enrichAndStore(fetched);
        enrichedAny = true;
      }
      if (!enrichedAny) return; // all misses recorded; nothing new to process
    }
  }

  /** The pattern input for one card's structure-candidate walk — the SAME
   *  fields enrichAndStore feeds safeSetKeys (leftTypeName for the *type
   *  plus right anchor, isRule for the *rule pattern), so candidate
   *  derivation is identical on both consumption sites. All fetches are
   *  cache hits (the prefetch walked the sides). */
  private async structurePatternInputFor(card: RenderCard): Promise<PatternCardInput> {
    let leftTypeName: string | undefined;
    let leftRecord: CardRecord | undefined;
    if (card.name.isCompound) {
      const leftKey = card.name.leftName?.key;
      leftRecord =
        leftKey !== undefined
          ? ((await this.fetcher.fetchByName(leftKey)) ?? undefined)
          : undefined;
      if (leftRecord !== undefined) {
        leftTypeName = (await this.enrichAndStore(leftRecord)).typeName;
      }
    }
    const isRule = card.name.isCompound ? await this.computeIsRule(card.name, leftRecord) : false;
    return {
      name: card.name,
      id: card.id,
      typeId: card.typeId,
      typeName: card.typeName,
      ...(leftTypeName !== undefined ? { leftTypeName } : {}),
      ...(isRule !== undefined ? { isRule } : {}),
    };
  }

  // -------------------------------------------------------------------------
  // read-permission resolution (prepare phase; never during the render)
  // -------------------------------------------------------------------------

  /** Complete the permission state from folded batch results, or run the
   *  standalone batch (warm-closure first render). Once per engine. */
  private async ensureReadPermission(folded?: SQLQueryResult[]): Promise<ReadPermissionState> {
    if (this.readPermission !== undefined) return this.readPermission;
    const results =
      folded ?? (await this.fetcher.driver.batch(readPermissionStatements(this.viewer)));
    this.readPermission = readPermissionStateFromViewerResults(results, this.viewer);
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

  /** ok_to_<task>? for the non-read view tasks (docs/view-perms-notes.md). */
  taskAllowed(card: RenderCard, task: Exclude<CrudTask, "read">): boolean | undefined {
    if (this.readPermission?.alwaysOk) return true;
    return this.taskVerdicts.get(card.key)?.[task];
  }

  /** Prepares the non-read task verdicts when the requested view needs
   *  them: one batch for the who_can universe, then one candidate
   *  resolution per prepared card (memoized — warm renders stay at zero
   *  queries). Read/none-only renders skip entirely. */
  private async ensureTaskVerdicts(view: string): Promise<void> {
    if (this.readPermission === undefined) return;
    if (!viewRequiresTask(view)) return;
    if (this.taskState === undefined) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    for (const card of this.renderCards.values()) {
      if (card.id === undefined || this.taskVerdicts.has(card.key)) continue;
      this.taskVerdicts.set(
        card.key,
        await allTaskVerdictsForCard(
          this.fetcher,
          { name: card.name, id: card.id, typeId: card.record.typeId, typeName: card.typeName },
          this.taskState,
        ),
      );
    }
  }

  /** Pre-executed results for a Search core (card_list view). */
  executeSearch(fmt: RenderFormat): RenderCard[] {
    return this.searchResults.get(fmt.card.key) ?? [];
  }

  // -------------------------------------------------------------------------
  // rule? predicate (lib/card/rule/all.rb:32-51) — the RULE set-key input
  // -------------------------------------------------------------------------

  /** Parse the folded codehash result (sliced past the permission
   *  statements) into memoized codename ids. Runs once per engine, before
   *  enrichment, so set-key derivation never queries. */
  private parseRuleTypeIds(
    folded: SQLQueryResult[] | undefined,
    permissionStatementCount: number,
  ): void {
    const result = folded !== undefined ? folded[permissionStatementCount] : undefined;
    if (result !== undefined) {
      this.fetcher.codenames.foldCodehashResults(result);
    } else {
      // No folded batch to read (defensive: a warm-closure first render).
      // One standalone load, still once per engine.
      void this.fetcher.codenames.ensureLoaded();
    }
    this.ruleTypeIds = {
      setting: this.fetcher.codenames.peekId("setting"),
      set: this.fetcher.codenames.peekId("set"),
      user: this.fetcher.codenames.peekId("user"),
    };
  }

  /** Card#rule? — the 06_rule.rb pattern_applies? (standard_rule? ||
   *  preference?, card-1.110.0 lib/card/rule/all.rb:32-51). Type
   *  comparisons mirror Ruby's fetch_type_id exactly: resolve each name
   *  part's card through storage and compare its type_id. Undefined when
   *  the seed lacks the codename cards — the pattern cannot apply either
   *  way (same degradation as a rule-less deck).
   *
   *  ORDER PARITY (corpus:253): Ruby evaluates `standard_rule? ||
   *  preference?` (all.rb:33) — standard_rule? runs FIRST for EVERY name
   *  shape (all.rb:37-40: name.right type == SettingID && name.left type
   *  == SetID, where name.left of a 3-part name is its first two parts).
   *  preference? (all.rb:42-48) only adds the user-part rules for >2-part
   *  names; routing 3-part names straight into it (the previous shape)
   *  dropped the RULE set key for names like "SET+*right+SETTING" that
   *  Ruby classifies via standard_rule?. */
  private async computeIsRule(
    name: DeckoName,
    leftRecord: CardRecord | undefined,
  ): Promise<boolean | undefined> {
    const ids = this.ruleTypeIds;
    if (ids === undefined || ids.setting === undefined || ids.set === undefined) {
      return undefined;
    }
    // name.right fetched type == SettingID gates BOTH shapes (all.rb:39,44)
    const rightTypeId = await this.fetchTypeIdForPart(name.rightName);
    if (rightTypeId === undefined || rightTypeId !== ids.setting) return false;
    // standard_rule? (all.rb:37-40): name.left fetched type == SetID — for
    // any part count (name.left of "A+B+C" is "A+B"). Two-part names have
    // the left record in hand (enrichment fetched it for the *type plus
    // right anchor); deeper names fetch it cache-first.
    if (name.parts.length > 2) {
      const standardLeftTypeId = await this.fetchTypeIdForPart(name.leftName);
      if (standardLeftTypeId === ids.set) return true;
    } else if (leftRecord !== undefined && leftRecord.typeId === ids.set) {
      return true;
    }
    if (name.parts.length > 2) {
      // preference? (all.rb:42-48): name[0..-3] fetched type == SetID, then
      // valid_preferer? (all.rb:50-53): the [-2] part's type is User, or
      // that part's codename is "all".
      const trunkTypeId = await this.fetchTypeIdForPart(
        DeckoName.parse(name.parts.slice(0, -2).join("+")),
      );
      if (trunkTypeId !== ids.set) return false;
      const prefererPart = name.parts[name.parts.length - 2] ?? "";
      const prefererTypeId = await this.fetchTypeIdForPart(DeckoName.parse(prefererPart));
      if (ids.user !== undefined && prefererTypeId === ids.user) return true;
      const prefererKey = DeckoName.parse(prefererPart).key;
      const prefererRecord =
        prefererKey !== "" ? ((await this.fetcher.fetchByName(prefererKey)) ?? undefined) : undefined;
      return prefererRecord?.codename === "all";
    }
    return false;
  }

  /** Card.fetch_type_id(name-part): the part card's fetched type_id
   *  (cache-first via the fetch ladder; undefined for unresolvable parts —
   *  Ruby's fetch-returns-nil path). */
  private async fetchTypeIdForPart(part: DeckoName | undefined): Promise<number | undefined> {
    if (part === undefined) return undefined;
    const key = part.key;
    if (key === "") return undefined;
    const record = (await this.fetcher.fetchByName(key)) ?? undefined;
    return record?.typeId;
  }

  // -------------------------------------------------------------------------
  // prepare phase (all async work happens here, never during the render)
  // -------------------------------------------------------------------------

  /**
   * The closure is warm when every reference reachable from `record` is
   * already in the render-card map. A synchronous parse + map walk - no
   * queries (this is what makes warm re-renders free).
   *
   * Template references recorded in structureRefMisses are skipped: they
   * name cards that do not exist (the corpus's {{xxxx}} nest targets), so
   * waiting for them would keep structured cards permanently cold — Ruby
   * renders those nests as unknown-card views, and so does the port's nest
   * path.
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
        if (this.structureRefMisses.has(ref)) continue;
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
    let leftRecord: CardRecord | undefined;
    if (name.isCompound) {
      const leftKey = name.leftName?.key;
      leftRecord =
        leftKey !== undefined
          ? (await this.fetcher.fetchByName(leftKey)) ?? undefined
          : undefined;
      if (leftRecord !== undefined) {
        const leftCard = await this.enrichAndStore(leftRecord);
        leftTypeName = leftCard.typeName;
      }
    }
    const isRule = name.isCompound ? await this.computeIsRule(name, leftRecord) : false;
    const card: RenderCard = {
      record,
      name,
      key,
      typeName,
      typeId,
      id: record.id,
      dbContent: cardContent(record),
      setKeys: safeSetKeys({ name, typeId, typeName, leftTypeName, isRule }),
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

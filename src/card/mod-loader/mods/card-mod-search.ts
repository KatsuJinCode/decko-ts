import type { ViewResult } from "../../render/format.js";
// The card-mod-search gem (card-mod-search-0.20.0), ported through the mod
// loader - the search surface: the CQL-backed search semantics behind the
// count views, the search-family one_line_content override, and the
// autocomplete item views.
//
// The gem's tree (the installed
// card-mod-search-0.20.0/): 29 set files (6 abstract, 1 all, 17 right,
// 2 self, 2 type), 1 lib file, 5 haml templates, no set_pattern/, no events.
// Already ported in the RENDER layer before this mod (compat report:
// htmlViewsCovered = bar, card_list, core, no_search_results, title - the
// html :card_list / :no_search_results in src/card/render/views.ts
// #cardListView/#noSearchResultsView, the :core/:bar search dispatch in
// src/card/render/views.ts + the before(:bar) hide in format.ts#runBeforeHook,
// and the card-level CQL search execution in src/card/render.ts#runSearch
// which cites cql_search.rb). This mod port adds the seven missing views that
// are headlessly renderable (see the manifest's setModules):
//   - count          (set/abstract/0_search.rb:56,86 - super() chains ending
//                     at card-mod-collection set/all/item.rb:118-120
//                     `try(:count)` base / :180-182 `number_with_delimiter
//                     try(:count)` html) over the prepareEngine count warm;
//                     non-Search cards delegate down the loader's view chain
//                     (Ruby's MRO: set/format.rb:146-150) to the
//                     card-mod-collection count view
//   - search_count   (set/abstract/0_search/views.rb:2-4) - the
//                     count-returning Integer branch, and the Exception
//                     branch (rescuing_bad_query RETURNS the BadQuery, so
//                     .to_s renders its message)
//   - search_error   (set/abstract/0_search/views.rb:6-8) - the rescued-
//                     BadQuery bytes `Card::Error::BadQuery :: message ::
//                     content` (card-1.110.0 lib/card/error.rb:78), read
//                     off the warm's failure channel
//   - one_line_content (set/abstract/search_views.rb:40-48)
//   - goto_autocomplete_item / add_autocomplete_item
//                      (set/all/autocomplete.rb:6-8,10-12)
//   - select2_option (set/all/autocomplete.rb:52-56, json format)
//
// NOT yet ported (honest remainder, one word per reason):
// - body (0_search/views.rb:102-106) - csv-format: the engine has no csv
//   format dispatch
// - feed_body (search_views.rb:16-23) / feed_item_description
//   (self/recent.rb:36-39) - rss-format (+ recent needs the Act history
//   tables)
// - molecule (0_search/views.rb:33-35) - json-core: needs the json format's
//   molecule/paging_urls machinery
// - name_complete / name_match (0_search/views.rb:38-44) - request-term: they
//   run ad-hoc CQL against params[:term] at view time
// - complete (self/search.rb:74-78) - request-term (the sibling
//   search_box_complete IS ported: the self/search setModule's json arm
//   below, its request-term data riding the render.ts search seat)
// - search_box (self/search.rb:37 + haml) - request-dependent form bytes
//   (form_tag path, query params)
// - method-only set modules (no manifest surface - the DeckoModManifest
//   registers views/settings/patterns, not card methods):
//   set/abstract/0_search/search_params.rb, set/abstract/cql_search.rb (its
//   search semantics already live in render.ts#runSearch),
//   set/abstract/type_index.rb, set/abstract/virtual_search.rb,
//   all 17 set/right/*.rb virtual searches (cql_content/raw_help_text
//   methods), set/self/recent.rb, set/type/cardtype.rb,
//   set/type/search_type.rb
//
// Ported without per-view oracle pins (the oracle's ground truth holds
// whole-PAGE renders only):
//   - checkbox_list       (0_search/views.rb:118-124 + checkbox_item.haml)
//   - results_for_keyword (self/search.rb:48 + results_for_keyword.haml)
// The two SET-OVERRIDE views the coverage doc also lists as missing are NOT
// registered, deliberately and with the same reasoning
// card-mod-permissions.ts's header gives for its :core override: both are
// overrides of a base view name, and the TS view table is global (one name,
// one fn -  "View dispatch is global, not
// set-scoped"). Registering them would replace the base :bar / :title for
// EVERY card.
//   - bar  (search_views.rb:35-37) - `voo.hide :one_line_content; super()` -
//     the base is card-mod-bar_and_box set/all/bar.rb's :bar.
//   - title (self/search.rb:39-42) - `voo.title ||= t(:search_results_title);
//     super()` - the base is card-mod-format set/all/title.rb's :title;
//     replacing it would move
//     every card's title onto the search string.
// Both bodies are ported-and-exported the way permissionCoreView is (see
// searchBarOverrideView below, exported unregistered). The :title override
// has NO export: its body is `voo.title ||= t(:search_results_title)` and
// `voo.title` is one of the un-ported Voo heir keys (format.ts:110 lists
// `title` among the heir keys that stay un-ported), so the port would have
// to invent Voo API to exist at all. Documented, not faked.

import type { RenderCard, ViewContext, ViewFn } from "../../render/format.js";
import { NoMethodError, RenderFormat, str, UnsupportedViewError } from "../../render/format.js";
import { formEscape } from "../../follow/follow-form-shapes.js";
import { DeckoName } from "../../name.js";
import { emitAttrs, h, newSlotId, slotOptionsJson } from "../../render/slot-html.js";
import { CqlBadQuery } from "../../../cql/ast.js";
import { parseCql } from "../../../cql/parser.js";
import { generateSql } from "../../../cql/sql.js";
import { getDefaultModLoader } from "../../mod-loader.js";
import type {
  DeckoModManifest,
  ModEngineHost,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// the search-typed check (the codename-registry idiom format.ts#runBeforeHook
// uses for the search :bar hide)
// ---------------------------------------------------------------------------

/** Ruby dispatches the Abstract::SearchViews / Abstract::Search format
 *  methods by SearchTypeID (virtual_search.rb:7-9 assigns_type :search_type).
 *  In this port the codename registry is the source of truth for that match
 *  (the reference deck's search_type card has a non-"Search" NAME, so a
 *  typeName check alone misses - same shape as format.ts:377). */
function searchTypeCard(fmt: RenderFormat): boolean {
  if (fmt.card.typeName === "Search") return true;
  const typeId = fmt.card.record.typeId;
  return (
    typeId !== undefined && fmt.engine.peekCodenameById?.(typeId) === "search_type"
  );
}

/** The count bytes (card-mod-collection set/all/item.rb:180-182
 *  `number_with_delimiter try(:count)`); Rails number helper groups the
 *  integer part with "," every three digits
 *  (actionview-7.2.3.2 number_helper.rb#number_with_delimiter, default
 *  delimiter ","). Counts are never negative or fractional here
 *  (0_search.rb:35-39 returns Query counts). */
function numberWithDelimiter(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ---------------------------------------------------------------------------
// the prepareEngine count warm (the boot-time Rule::Cache analog) - the
// search-count channel between the mod's one-time preparation and the
// synchronous view fns
// ---------------------------------------------------------------------------

// The count views need the count of a card's CQL at RENDER time, but views
// are synchronous and the engine's executeSearch only carries the item list
// (collapsed to [] for count-returning CQL). Ruby computes the count lazily
// per render (0_search.rb:35-39); the port pre-executes every Search-typed
// card's count ONCE per engine in the mod's prepareEngine - the same
// deck-wide warm shape prepareHelpRules uses for the *help rule cache.
// STATE CAVEAT: these module-level maps are per-process, last-warm-wins
// (the same pattern as mod-loader.ts#setDefaultModLoader). Tests that use
// several engines read counts only from the engine whose warm ran last
// unless card keys are disjoint.
// Card key -> the count per stored read rule (NULL rows under null). The warm
// runs once per engine with no viewer; each view applies the viewer's read
// scope to these groups (warmedCount), which is Card::Query's relation-level
// filter (where.rb:79-84) split by rule rather than re-run per viewer.
const searchCounts = new Map<string, Map<number | null, number>>();
/** Card key -> the Ruby reason no count could be computed (BadQuery shapes
 *  from cql_search.rb:29-38 / query/card_query/found_by.rb:23-25). */
const searchCountFailures = new Map<string, string>();

/** One raw batch row (cards columns; the driver returns snake_case). */
interface SearchRow {
  id: number;
  left_id: number | null;
  right_id: number | null;
  name: string | null;
  type_id: number;
  db_content: string | null;
}

/** cql_search.rb:8-12 cql_content (:10 parse_json_cql unless Hash) +
 *  :29-38 parse_json_cql/empty_query_error!: parse the card's content as
 *  the cql hash. The two BadQuery shapes raise CqlBadQuery with Ruby's
 *  exact messages ("" -> "can't run search with empty content";
 *  unparseable -> "Invalid JSON search query: <content>"); a non-Hash
 *  parse RESULT (null/array/scalar - valid JSON) crashes Ruby unrescued at
 *  :11 symbolize_keys (NoMethodError) -> plain Error here. */
function rubyCqlContent(content: string | null): Record<string, unknown> {
  const query = content ?? "";
  if (query === "") {
    throw new CqlBadQuery("can't run search with empty content");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(query);
  } catch {
    throw new CqlBadQuery(`Invalid JSON search query: ${query}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    // cql_search.rb:11 symbolize_keys - NoMethodError, NOT a BadQuery
    throw new Error(`cql content is not a Hash: ${query}`);
  }
  return parsed as Record<string, unknown>;
}

/** Every Search-typed card PLUS every transitive side card needed to compose
 *  their junction names - the same reached-CTE shape the help mod's rule
 *  warm uses (a rule card reached by id has no name mark to seed name
 *  composition). */
export function searchCardsSidesStatement(searchTypeId: number): {
  sql: string;
  params: unknown[];
} {
  return {
    sql:
      "WITH RECURSIVE reached(id) AS (\n" +
      "  SELECT c.id FROM cards c WHERE c.type_id = ? AND c.trash = 0\n" +
      "  UNION\n" +
      "  SELECT s.id FROM reached r\n" +
      "    JOIN cards j ON j.id = r.id AND j.trash = 0\n" +
      "    JOIN cards s ON s.id IN (j.left_id, j.right_id) AND s.id IS NOT NULL\n" +
      "  UNION\n" +
      "  SELECT j.type_id FROM reached r JOIN cards j ON j.id = r.id\n" +
      "    WHERE j.type_id IS NOT NULL\n" +
      ")\n" +
      "SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (SELECT id FROM reached)",
    params: [searchTypeId],
  };
}

/** The deck's simple-card key->id map (cards.key; junction rows store NULL
 *  key - their names compose from sides, which the CTE above already pulls).
 *  Ruby resolves CQL name values through Card::Lexicon.id; this is that
 *  resolver's warm: the cql restrict values (type: "Basic", created_by:
 *  "Joe User", ...) resolve against the whole deck, not just the search
 *  cards' sides. */
function deckKeysStatement(): { sql: string; params: unknown[] } {
  return {
    sql: "SELECT id, key FROM cards WHERE trash = 0 AND key IS NOT NULL",
    params: [],
  };
}

/** 0_search.rb:35-39 count: `args[:offset] = 0; args[:limit] = 0;
 *  returning(:count, args) { search args }` - cql_search.rb:70-74
 *  standardized_query_args merges the card's cql_hash with the count args ON
 *  TOP. Returns the merged count CQL statement, or undefined when the
 *  statement cannot execute through the CQL engine (found_by shapes beyond
 *  the mod's "_left" shape); throws the Ruby error messages for the shapes
 *  Ruby itself raises on (cql_search.rb:29-38,
 *  query/card_query/found_by.rb:23-25). */
function mergedCountCql(
  cqlText: string | null,
  cardName: string,
  rowsByName: Map<string, SearchRow>,
  searchTypeId: number,
  typeNames: Map<number, string>,
  depth: number,
): Record<string, unknown> | undefined {
  if (depth > 5) return undefined;
  // cql_search.rb:8-12 cql_content: parse_json_cql unless Hash; :29-38
  // raises BadQuery for empty/invalid JSON (rubyCqlContent = those exact
  // messages); a non-Hash parse result crashes Ruby unrescued at :11
  // symbolize_keys (NoMethodError) - plain Error here.
  const cqlHash = { ...rubyCqlContent(cqlText) };
  const foundBy = cqlHash["found_by"];
  delete cqlHash["found_by"];
  // The count args ride ON TOP of the cql hash (cql_search.rb:70-74).
  const countArgs: Record<string, unknown> = { offset: 0, limit: 0, return: "count" };
  if (foundBy !== undefined && foundBy !== null) {
    // found_by.rb:7-10: the value resolves to card(s) whose cql_hash becomes
    // the statement (fasten: :direct). Only the mod's own shape is portable:
    // found_by: "_left" (found_by.rb:21-27 raises BadQuery
    // '"found_by" value must be valid Search' when the found card carries no
    // cql_hash). A hash found_by runs Query.run (found_by.rb:12-14) - out of
    // scope for the warm.
    if (foundBy !== "_left") return undefined;
    const parsed = DeckoName.parse(cardName);
    const leftName =
      parsed.leftName === undefined ? parsed.s : parsed.leftName.s;
    const leftRow = rowsByName.get(DeckoName.parse(leftName).key);
    // found_by.rb:21-27: `card&.try(:cql_hash) || invalid_found_by_card!(card)`
    // - the CARD check runs FIRST (a non-Search card answers nil cql_hash),
    // before any cql parsing; :23-25 raises with the card's type name.
    const leftTypeName =
      leftRow === undefined
        ? "unknown"
        : (typeNames.get(leftRow.type_id) ?? "unknown");
    if (leftRow === undefined || leftRow.type_id !== searchTypeId) {
      throw new Error(
        `"found_by" value must be valid Search, but ${leftName} is a ${leftTypeName}`,
      );
    }
    // Validate the left statement recursively (raises the Ruby BadQuery
    // shapes for broken left cql; undefined = unexecutable left shape).
    const leftMerged = mergedCountCql(
      leftRow.db_content,
      leftName,
      rowsByName,
      searchTypeId,
      typeNames,
      depth + 1,
    );
    if (leftMerged === undefined) return undefined;
    // found_by.rb:16-19 found_by_subquery: the found statement is the base;
    // the outer query's own restrictions merge on top. For the bare shapes
    // the mod's virtual searches declare (found_by + sort_by + paging),
    // that merge is a plain object merge; an outer hash carrying OTHER
    // restrictions would need the subquery AND - unsupported, undefined.
    const extraRestrictions = Object.keys(cqlHash).filter(
      (k) => !["return", "limit", "offset", "sort_by", "dir", "context"].includes(k),
    );
    if (extraRestrictions.length > 0) return undefined;
    let leftCql: Record<string, unknown>;
    try {
      leftCql = JSON.parse(leftRow.db_content ?? "") as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid JSON search query: ${leftRow.db_content ?? ""}`);
    }
    delete leftCql["found_by"];
    return { ...leftCql, ...cqlHash, ...countArgs };
  }
  return { ...cqlHash, ...countArgs };
}

/** One batch to fetch every Search-typed card (+ its transitive sides for
 *  junction name composition), one batch to run every count SQL - two round
 *  trips, once per engine (the ModEngineHost.batch contract). */
async function prepareSearchCounts(host: ModEngineHost): Promise<void> {
  searchCounts.clear();
  searchCountFailures.clear();
  await host.codenames.ensureLoaded(); // memoized; first call only
  const searchTypeId = host.codenames.peekId("search_type");
  if (searchTypeId === undefined) return; // degenerate deck: no Search type
  // ONE round trip, two statements: the search-card closure + the deck's
  // key map (the Lexicon.id resolver's warm).
  const results = await host.batch([
    searchCardsSidesStatement(searchTypeId),
    deckKeysStatement(),
  ]);
  const rows = (results[0] as { rows: SearchRow[] } | undefined)?.rows ?? [];
  if (rows.length === 0) return;
  const nameToId = new Map<string, number>();
  for (const row of (results[1] as { rows: { id: number; key: string }[] } | undefined)
    ?.rows ?? []) {
    nameToId.set(row.key, row.id);
  }

  // db round-trip elimination: the records compose from the batch's
  // OWN rows through ModEngineHost#composeAndCacheRows - value-identical to
  // the per-row host.fetchById storm this replaces (one idToLex + one id-row
  // point query per uncached row). The composed records carry exactly the
  // key/display-name pair the hand-rolled multi-pass below used to derive.
  interface ComposedRecord {
    id?: number;
    name?: { s: string };
    key?: string;
  }
  const composedRecords = (await host.composeAndCacheRows(rows)) as ComposedRecord[];
  const rowById = new Map<number, SearchRow>();
  for (const row of rows) {
    if (!rowById.has(row.id)) rowById.set(row.id, row);
  }
  // name-key -> row (for found_by "_left" resolution) and key -> row
  const rowByName = new Map<string, SearchRow>();
  const rowByKey = new Map<string, SearchRow>();
  // id -> display composed name (the found_by error-message source)
  const typeNames = new Map<number, string>();
  for (const record of composedRecords) {
    const id = record.id;
    const key = record.key;
    if (id === undefined || key === undefined || key === "") continue;
    const row = rowById.get(id);
    if (row === undefined) continue;
    rowByName.set(key, row);
    rowByKey.set(key, row);
    const display = record.name?.s;
    if (display !== undefined) typeNames.set(id, display);
  }
  const entries: { key: string }[] = [];
  const statements: { sql: string; params: unknown[] }[] = [];
  for (const [key, row] of rowByKey) {
    if (row.type_id !== searchTypeId) continue;
    const composed = typeNames.get(row.id) ?? "";
    let merged: Record<string, unknown> | undefined;
    try {
      merged = mergedCountCql(row.db_content, composed, rowByName, searchTypeId, typeNames, 0);
    } catch (e) {
      searchCountFailures.set(key, e instanceof Error ? e.message : String(e));
      continue;
    }
    if (merged === undefined) continue; // unexecutable shape: no entry
    try {
      const root = parseCql(merged, {
        context: composed, // cql_search.rb:72 args[:context] ||= name
        resolveCardId: (nameish: string) => nameToId.get(DeckoName.parse(nameish).key),
      });
      root.mods.return = "count"; // the count path ignores limit/order
      statements.push(generateSql(root, { countByReadRule: true }));
      entries.push({ key });
    } catch {
      // e.g. sql.ts:215 found_by refusal - Ruby would compute the count;
      // the warm leaves no entry instead of claiming one.
      continue;
    }
  }
  if (statements.length === 0) return;
  const countResults = await host.batch(statements);
  for (let i = 0; i < entries.length; i++) {
    const result = countResults[i] as
      | { rows: { read_rule_id: number | null; count: number | null }[] }
      | undefined;
    const byRule = new Map<number | null, number>();
    for (const row of result?.rows ?? []) {
      const rule = row.read_rule_id === null || row.read_rule_id === undefined ? null : Number(row.read_rule_id);
      const n = row.count === null || row.count === undefined ? 0 : Number(row.count);
      byRule.set(rule, (byRule.get(rule) ?? 0) + (Number.isNaN(n) ? 0 : n));
    }
    searchCounts.set(entries[i]!.key, byRule);
  }
}

/** The warmed count for a search card (undefined = the warm could not
 *  compute it - see searchCountFailures for the Ruby-side reasons). */
function warmedCount(
  ctx: ViewContext,
): { count: number } | { failure: string } | undefined {
  const key = ctx.fmt.card.key;
  const failure = searchCountFailures.get(key);
  if (failure !== undefined) return { failure };
  const byRule = searchCounts.get(key);
  if (byRule === undefined) return undefined;
  // The viewer's read scope, as cqlPermissionOptions answers it. Always-ok
  // (Auth.always_ok?) takes every group; otherwise the groups whose rule the
  // viewer reads through. A NULL rule is never admitted by IN (...), and the
  // empty rule list renders Ruby's IN (1) sentinel (where.rb:79-84).
  const scope = ctx.fmt.engine.cqlReadScope?.();
  if (scope === undefined) return undefined; // read state not folded: no viewer to count for
  const admitted = scope.readRuleIds.length > 0 ? scope.readRuleIds : [1];
  let count = 0;
  for (const [rule, n] of byRule) {
    if (scope.alwaysOk || (rule !== null && admitted.includes(rule))) count += n;
  }
  return { count };
}

// ---------------------------------------------------------------------------
// set/abstract/0_search.rb - view :count (base :56 + html :86, both
// `super()`): the super chain ends at card-mod-collection set/all/item.rb -
// :118-120 base `try(:count)` (plain digits) / :180-182 html
// `number_with_delimiter try(:count)`. The loader flattens both format
// blocks into one view table (html registered after base = html wins, as
// Ruby's html format overrides the base method for html renders).
// For non-Search cards Ruby's MRO (set/format.rb:146-150) dispatches
// straight to the All::Item count; the loader's viewChain walk reproduces
// that delegation (the flat last-wins seam otherwise binds this module's
// fn to every card when the search mod registers after card-mod-collection).
// ---------------------------------------------------------------------------

/** The next set module's :count for a non-Search card - Ruby's All::Item
 *  dispatch (item.rb:118-120/:180-182, card-mod-collection). Unregistered
 *  chain = the view does not exist for the card (render.rb#view_method's
 *  "view ... not supported" error, exactly the search-mod-only deck). */
function delegateCount(ctx: ViewContext): ViewResult {
  const chain = getDefaultModLoader()?.viewChain(ctx.fmt.card.setKeys, "count") ?? [];
  const next = chain.find((entry) => entry.setModule !== "Abstract::Search");
  if (next === undefined) {
    throw new UnsupportedViewError("count", ctx.fmt.card.name.s);
  }
  return next.viewFn(ctx);
}

/** The count bytes once warmed, or the raise: the :count view's super()
 *  chain (item.rb try(:count) -> Card#count -> cql_search.rb:41-50 search
 *  -> query.run) carries NO BadQuery rescue - that lives in the format's
 *  search_with_rescue (0_search.rb:66-77), which this view never passes
 *  through - so the Ruby error propagates (Card::Error::BadQuery,
 *  card-1.110.0 lib/card/error.rb:78; CqlBadQuery is this engine's
 *  declared equivalent, cql/ast.ts:156-157). "not warmed" = the warm could
 *  not execute a VALID cql through this engine - no Ruby state raises
 *  there, so it stays a plain engine-limitation error. */
function warmedCountBytes(ctx: ViewContext, delimiter: (n: number) => string): string {
  const warmed = warmedCount(ctx);
  if (warmed === undefined) {
    throw new Error(
      "search count not warmed (cql not executable through the CQL engine)",
    );
  }
  if ("failure" in warmed) throw new CqlBadQuery(warmed.failure);
  return delimiter(warmed.count);
}

/** The base-format count bytes (item.rb:118-120 `try(:count)` - the search
 *  count Integer, plain digits). */
const countBaseView: ViewFn = (ctx) => {
  if (!searchTypeCard(ctx.fmt)) return delegateCount(ctx);
  return warmedCountBytes(ctx, (n) => String(n));
};

/** The html-format count bytes (item.rb:180-182). */
const countHtmlView: ViewFn = (ctx) => {
  if (!searchTypeCard(ctx.fmt)) return delegateCount(ctx);
  return warmedCountBytes(ctx, numberWithDelimiter);
};

// ---------------------------------------------------------------------------
// set/abstract/0_search/views.rb:2-4 - view :search_count, cache: :never
// (`search_with_params.to_s`). Ruby's search_with_params RESCUES BadQuery
// and returns the exception object (0_search.rb:66-77 rescuing_bad_query),
// so the dispatch is: Exception result -> Exception#to_s = the BadQuery
// MESSAGE as bytes; Integer result (count-returning cql) -> digits; Array
// result (a plain search's list of card objects) -> ActiveRecord#inspect
// bytes this engine does not reproduce - and Ruby's own dispatch
// (search_views.rb:6-13 search_result_view) only ever sends
// Integers/Exceptions here, so a non-count cql raises.
// ---------------------------------------------------------------------------

const searchCountView: ViewFn = (ctx) => {
  if (!searchTypeCard(ctx.fmt)) {
    throw new UnsupportedViewError("search_count", ctx.fmt.card.name.s);
  }
  // Exception branch: the warm records exactly the rescued BadQuery
  // messages (searchCountFailures) - .to_s renders the message.
  const warmed = warmedCount(ctx);
  if (warmed !== undefined && "failure" in warmed) return warmed.failure;
  // Exception branch without a warm record (deck the warm never ran on):
  // reproduce parse_json_cql's BadQuery messages from the card content.
  const content = ctx.fmt.card.dbContent;
  try {
    rubyCqlContent(content);
  } catch (e) {
    if (e instanceof CqlBadQuery) return e.message;
    throw e; // non-Hash cql crashes Ruby unrescued (cql_search.rb:11)
  }
  // Integer branch: the card's own cql declares return: "count"
  // (cql_search.rb:3-5 cql_hash; the count collapse is Ruby's
  // Run#alter_result). Integer#to_s - no delimiter.
  let cqlReturnCount = false;
  try {
    cqlReturnCount = rubyCqlContent(content)["return"] === "count";
  } catch {
    // unreachable: rubyCqlContent's throws were converted above
  }
  if (cqlReturnCount) {
    if (warmed === undefined) {
      throw new Error(
        "search count not warmed (cql not executable through the CQL engine)",
      );
    }
    return String(warmed.count);
  }
  // Array branch: search_with_params is the executed result window (the
  // card list's own items, 0_search.rb:43-45), and Array#to_s is
  // Array#inspect - "[" + each element's #inspect joined by ", " + "]".
  // The empty list is "[]" (the warm's count is 0 exactly when the
  // statement returns no rows - same statement, return mode aside).
  if (warmed !== undefined && warmed.count === 0) return "[]";
  const items = ctx.fmt.engine.executeSearch(ctx.fmt);
  if (items.length === 0 && ctx.fmt.engine.searchItemCount?.(ctx.fmt) === undefined) {
    throw new Error("search results not warmed (cql not executable through the CQL engine)");
  }
  return `[${items.map(cardInspect).join(", ")}]`;
};

/** card-1.110.0 mod/core/set/all/debug.rb:5-19 Card#inspect:
 *  `"#<Card##{id}[#{debug_type}](#{name})#{error_messages}{#{inspect_tags *
 *  ','}}"` - no closing `>` (Ruby's own format string ends at the brace).
 *  debug_type is `"#{type_code || ''}:#{type_id}"` (the type card's
 *  codename, empty for a codename-less type). error_messages is "" for a
 *  fetched card (no validation ran). inspect_tags selects, in order, the
 *  predicates trash? new? frozen? readonly? virtual? set_mods_loaded?; a
 *  search result is a real, live, non-virtual row fetched through
 *  Card.fetch, whose include_set_modules (initialize.rb:61-69) sets
 *  @set_mods_loaded - so its one tag is set_mods_loaded. */
function cardInspect(card: RenderCard): string {
  const tags: string[] = [];
  if (card.record.trash === true) tags.push("trash");
  if (card.id === undefined) tags.push("new");
  tags.push("set_mods_loaded");
  const debugType = `${card.typeCode ?? ""}:${card.typeId ?? ""}`;
  return `#<Card#${card.id ?? ""}[${debugType}](${card.name.s}){${tags.join(",")}}`;
}

// ---------------------------------------------------------------------------
// set/abstract/0_search/views.rb:6-8 - view :search_error, cache: :never
// (`"#{search_with_params.class} :: #{search_with_params.message} ::
// #{card.content}"`). Two postures:
//
// - Rescued BadQuery (rescuing_bad_query RETURNS the exception, 0_search.rb:
//   72-77): class = Card::Error::BadQuery (card-1.110.0 lib/card/error.rb:78),
//   message = the raised BadQuery message, content = the card's db_content.
//   The interpolation completes and those bytes exist.
// - Integer/Array result (a valid query whose cql is not a count collapse
//   returns the result Array; a count cql returns the Integer): `.class`
//   answers, then `.message` RAISES NoMethodError - "undefined method
//   `message' for an instance of Array" (Ruby 3.3's receiver phrasing).
//   That is the reproduced-upstream-failure decision: the oracle's answer
//   for a search_error render of a valid non-count query is the quiet
//   render-error span carrying that debug page (0_search/views.rb:7 raise
//   site), so the port raises the same class with the same message. The
//   debug page's backtrace is the engine's own stack. The view's own
//   interpolation bytes never exist in either engine.
//
// A deck the warm never ran on still has no warmed result to dispatch on;
// that arm keeps its loud refusal (no oracle bytes exist for it).
// ---------------------------------------------------------------------------

const searchErrorView: ViewFn = (ctx) => {
  if (!searchTypeCard(ctx.fmt)) {
    throw new UnsupportedViewError("search_error", ctx.fmt.card.name.s);
  }
  const warmed = warmedCount(ctx);
  if (warmed === undefined) {
    throw new Error(
      "search_error bytes exist only for a warmed search result (Ruby's Integer/Array results crash .message with NoMethodError)",
    );
  }
  if ("failure" in warmed) {
    return `Card::Error::BadQuery :: ${warmed.failure} :: ${ctx.fmt.card.dbContent ?? ""}`;
  }
  // The receiver's class is the search's result shape: a count cql collapses
  // to Integer (cql_search.rb:3-5 cql_hash + Run#alter_result, the same
  // verdict search_count's cqlReturnCount walk computes), anything else is
  // the result Array. `.message` is missing on both.
  let cqlReturnCount = false;
  try {
    cqlReturnCount = rubyCqlContent(ctx.fmt.card.dbContent ?? "")["return"] === "count";
  } catch {
    // unreachable: a BadQuery cql warms as a failure (the branch above)
  }
  throw new NoMethodError(
    `undefined method \`message' for an instance of ${cqlReturnCount ? "Integer" : "Array"}`,
  );
};

// ---------------------------------------------------------------------------
// set/abstract/search_views.rb:40-48 - view :one_line_content, cache: :never
// (`depth > max_depth ? "..." : render_core hide: "paging", items:
// {view: :link}`). The html :core -> :card_list path with the item view
// switched to :link: the list bytes follow 0_search/views.rb:108-116
// (klasses "card-list card-list-#{item_view} search-result-list") and
// :132-136 (card_list_item wrap), with :22-24 with_results routing empty
// results to the html :no_search_results view.
// ---------------------------------------------------------------------------

const oneLineContentView: ViewFn = ({ fmt }) => {
  // Ruby scopes this view to Search cards (Abstract::SearchViews); the base
  // one_line_content other cards get (card-mod-format set/all/base.rb:97,
  // with_nest_mode(:compact)) is deferred in this engine - compact nest
  // mode is not supported here.
  if (!searchTypeCard(fmt)) {
    throw new UnsupportedViewError("one_line_content", fmt.card.name.s);
  }
  if (fmt.depth > fmt.maxDepth) return "...";
  const items = fmt.engine.executeSearch(fmt);
  if (items.length === 0) return fmt.renderView("no_search_results");
  const rendered = items.map(
    (item) =>
      `<div class="search-result-item item-link">${fmt.nestRecord(item, "link", { size: null })}</div>`,
  );
  // trailing newline: the card_list path closes its list div on its own
  // line (views.ts#cardListView, fixture byte-pinned)
  return `<div class="card-list card-list-link search-result-list">${rendered.join("\n")}</div>\n`;
};

// ---------------------------------------------------------------------------
// set/all/autocomplete.rb - the html autocomplete item views + the json
// :select2_option
// ---------------------------------------------------------------------------

/** autocomplete_item.haml:1-6 - Haml's single-quoted attributes; the icon is
 *  a Rails helper string (html_safe, unescaped), the label a plain name
 *  (escaped). Haml merges the hash class BEFORE the literal one
 *  (`class: "autocomplete-item-#{type}"` on `.autocomplete-item` renders
 *  `autocomplete-item-<type> autocomplete-item`, the oracle bytes)
 *  and emits the template's lines flush-left (no pretty indentation). */
function autocompleteItem(type: string, icon: string, label: string): string {
  return (
    `<div class='autocomplete-item-${type} autocomplete-item'>\n` +
    `<div class='autocomplete-icon'>\n${icon}\n</div>\n` +
    `<div class='autocomplete-label'>\n${h(label)}\n</div>\n` +
    `</div>\n`
  );
}

/** icon_tag for the default material library
 *  (card-mod-bootstrap lib/card/mod/bootstrap.rb:2 icon_libraries = [:material]):
 *  universal_icon_tag adds "notranslate" (icon.rb:129-133), material_icon_tag
 *  appends "material-icons" and wraps the icon name in an <i> (icon.rb:115-118;
 *  Rails content_tag double quotes). */
function materialIconTag(icon: string): string {
  return `<i class="notranslate material-icons">${h(icon)}</i>`;
}

/** autocomplete.rb:39-45 goto_autocomplete_icon: card.fetch(:image) present
 *  renders the image field's :core (field_nest, size: :small); a fetch miss
 *  (no +image card, or not prefetched) falls to icon_tag(:forward) - the
 *  basket maps forward: :arrow_forward (card-mod-bootstrap icon.rb:26). */
function gotoAutocompleteIcon(fmt: RenderFormat): string {
  const image = fmt.engine.fetchRenderCard(`${fmt.card.name.s}+image`);
  if (image !== undefined) {
    return fmt.nestRecord(image, "core", { size: "small" });
  }
  return materialIconTag("arrow_forward");
}

/** autocomplete.rb:6-8 view :goto_autocomplete_item: `autocomplete_item
 *  :goto, goto_autocomplete_icon, autocomplete_label` (:47-49 label =
 *  card.name). */
const gotoAutocompleteItemView: ViewFn = ({ fmt }) =>
  autocompleteItem("goto", gotoAutocompleteIcon(fmt), fmt.card.name.s);

/** autocomplete.rb:10-12 view :add_autocomplete_item, unknown: true:
 *  `autocomplete_item :add, icon_tag(:add), autocomplete_label`. :add is NOT
 *  in basket[:icons][:material] (icon.rb:1-9), so icon_lookup's fallback
 *  (icon.rb:143-151) yields the literal name "add". */
const addAutocompleteItemView: ViewFn = ({ fmt }) =>
  autocompleteItem("add", materialIconTag("add"), fmt.card.name.s);

/** autocomplete.rb:52-56 format :json view :select2_option, perms: :none:
 *  `{ id: "~#{card.id}", text: card.name }` - the json format serializes the
 *  returned Hash (Name < String, so text is the name bytes; nil id
 *  interpolates to "~" like Ruby's "\~#{nil}"). */
const select2OptionView: ViewFn = ({ fmt }) => {
  const id = `~${fmt.card.id ?? ""}`;
  return JSON.stringify({ id, text: fmt.card.name.s });
};

// ---------------------------------------------------------------------------
// set/self/search.rb:70-72 - view :search_box_complete, cache: :never,
// perms: :none (`search_box_items :search_item, :add_item, :goto_items`)
//
// The navbox typeahead's JSON: the navbar search box's data-completepath
// (search.rb:30-33 complete_path = path mark: :search, view:
// :search_box_complete, format: :json — the codename mark resolves to the
// *search name, so the pinned navbar bytes read /*search/
// search_box_complete.json) is the deck script's jQuery UI autocomplete
// source, fetched on every page for signed-in and anonymous visitors alike.
//
//   def search_box_items *methods
//     [].tap do |items|
//       each_search_box_item methods do |action, value, label, data|
//         items << data.merge(action: action, value: value, label: label)
//       end
//     end
//   end
//
// Three item families in order (:104-126), each hash {url, action, value,
// label} (data = {url: ...} merges under the three keys):
//   - :search  (:104-106) ALWAYS - url = card_url(results_path(term))
//              (:38-40 path mark: :search, query: {keyword: term}; to_param
//              Rack-escapes the nested key, empty term -> no query string),
//              value = term (nil -> JSON null), label = the *search card's
//              html search_item (:47-49 autocomplete_item :search,
//              icon_tag(:search), term).
//   - :add     (:108-115) only when exact.add_autocomplete_ok?
//              (autocomplete.rb:39 new_card? && name.valid? && !virtual?
//              && ok?(:create)) - url = card_url(exact's own path), value =
//              term, label = the exact card's html :add_autocomplete_item.
//   - :goto    (:117-126) one per complete-search name - url =
//              card_url(path(mark: name)) (:36-37 - the json format's
//              contextualize_path is card_url, path.rb:52-55, so BOTH url
//              arms are ABSOLUTE; the html format's relative arm never
//              runs here), value = the name, label = the item card's html
//              :goto_autocomplete_item (autocomplete.rb:6-8).
// map_goto_items (:118-126): the names are complete_or_match_search
// start_only: match_start_only? (railtie default TRUE - the match half
// never fires), unshift exact.name when go_to_exact_match? (exact.known?),
// uniq. The search seat (render.ts #prepareSearchBoxComplete) carries the
// term, the exact card, and the read-filtered goto cards; this fn does the
// Ruby assembly. Serialization: JsonFormat#show's string_with_page_details
// (:37-44) - the Array result is not a String, so page_details (a no-op on
// arrays) passes through and stringify runs JSON.pretty_generate (the
// params[:compress] default) - folded into this fn exactly the way
// select2_option folds its Hash serialization above (the view fns' byte
// contract in this engine).
// ---------------------------------------------------------------------------

const searchBoxCompleteView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  // set/self/search.rb is the SELF set (Card::Set::Self::Search) - the
  // resultsForKeywordView gate's own shape: every other card raises the
  // unsupported-view UserError.
  if (fmt.card.key !== "*search") {
    throw new UnsupportedViewError("search_box_complete", fmt.card.name.s);
  }
  const seat = fmt.engine.searchBoxCompleteSeat?.(fmt.card);
  if (seat === undefined) {
    throw new Error(
      "search_box_complete rendered without its prepare seat (the engine's view-keyed prepare hook never ran for this render)",
    );
  }
  // The raise site is the VIEW body in Ruby (each_search_box_item ->
  // map_goto_items -> complete_or_match_search -> card.search ->
  // parse_json_cql), so the BadQuery lands inside wrap_and_render's rescue
  // - the quiet render-error span on the bare view lane.
  if (seat.failure !== undefined) throw new CqlBadQuery(seat.failure);
  // goto_item_label / the add item's label render through the item card's
  // OWN format (search.rb:52-54 `item.card.format.render_goto_autocomplete_item`,
  // :113 `fmt.render_add_autocomplete_item`) — `card.format` is the card's
  // DEFAULT format (html), a FRESH format regardless of the json context
  // this view runs in, so the subformat pins formatName "html" (the
  // card-mod-account subformat seam's shape; the json format's chain walk
  // would never resolve the html-format autocomplete views).
  const renderHtmlView = (card: RenderCard, view: string): string => {
    const sub = new RenderFormat(card, fmt.engine, {
      parent: fmt,
      maxDepth: fmt.maxDepth,
      nestQuietErrors: fmt.nestQuietErrors,
      formatName: "html",
    });
    return str(sub.renderView(view, {}));
  };
  const term = seat.term;
  interface CompleteItem {
    url: string;
    action: string;
    value: string | null;
    label: string;
  }
  const items: CompleteItem[] = [];
  // :search_item (:104-106) - always. results_path (:38-40): the query
  // pair rides to_param's Rack escape (follow-form-shapes formEscape;
  // space -> "+"), and an absent/empty term leaves NO query string
  // (Rails String#to_query answers nil for "" - the pair drops).
  items.push({
    url: fmt.cardUrl(
      term === undefined || term === ""
        ? "*search"
        : `*search?query%5Bkeyword%5D=${formEscape(term)}`,
    ),
    action: "search",
    value: term ?? null,
    label: autocompleteItem("search", materialIconTag("search"), term ?? ""),
  });
  // :add_item (:108-115) - exact.add_autocomplete_ok?; the seat's exact is
  // the fabricated new card only when the term names NO row and NO virtual
  // card (the !virtual? guard), so presence + !exactKnown is new_card?.
  if (seat.exact !== undefined && !seat.exactKnown) {
    const creatable =
      fmt.engine.unknownCardCreatable?.(seat.exact) ??
      fmt.engine.taskAllowed?.(seat.exact, "create") === true;
    if (seat.exact.name.isValid && creatable) {
      items.push({
        // add_autocomplete_item_path (:42-44) = the new card's own path;
        // card_url makes it absolute in the json format.
        url: fmt.cardUrl(seat.exact.name.urlKey),
        action: "add",
        value: term ?? null,
        label: renderHtmlView(seat.exact, "add_autocomplete_item"),
      });
    }
  }
  // :goto_items (:117-126) - map_goto_items: unshift the exact name when
  // the card is known (:120-121 — position 0, BEFORE the completes), uniq
  // keeps first occurrences (:122), and each name renders its own card's
  // :goto_autocomplete_item label (:52-54 goto_item_label =
  // item.card.format.render_goto_autocomplete_item — the item's own FRESH
  // html format, renderHtmlView above).
  const emitted = new Set<string>();
  const pushGoto = (card: RenderCard): void => {
    if (emitted.has(card.name.key)) return;
    emitted.add(card.name.key);
    items.push({
      url: fmt.cardUrl(card.name.urlKey),
      action: "goto",
      value: card.name.s,
      label: renderHtmlView(card, "goto_autocomplete_item"),
    });
  };
  if (seat.exactKnown && seat.exact !== undefined) pushGoto(seat.exact);
  for (const card of seat.goto) pushGoto(card);
  // JsonFormat#show's stringify (JSON.pretty_generate) - 2-space indent,
  // no trailing newline, exactly JSON.stringify(, null, 2) for the ASCII
  // deck names and escaped-label strings this surface carries.
  return JSON.stringify(items, null, 2);
};

// ---------------------------------------------------------------------------
// set/abstract/0_search/views.rb:118-124 - view :checkbox_list, cache: :never
//
//   view :checkbox_list, cache: :never do
//     search_result_list "_search-checkbox-list pe-2" do
//       search_with_params.map { |item_card| checkbox_item item_card }
//     end
//   end
//
// search_result_list (views.rb:138-140) is
// `with_results { with_paging { wrap_with :div, class: klass, &block } }`:
//   - with_results (views.rb:22-24): `search_with_params.empty? ?
//     render_no_search_results : yield` - the html no_search_results view
//     (views.rb:126-128) is `<div class="search-no-results"></div>` and it
//     short-circuits BEFORE the wrapper div, so an empty result is the
//     bare no-results div (same shape the landed cardListView,
//     views.ts:1501, already returns).
//   - with_paging: NOT DEFINED in any pinned source - grepped the
//     installed gems (242 of them) and the oracle app
//     for "def with_paging" and found no definition; the landed cardListView
//     (views.ts:1535) follows the same path and emits no paging markup.
//     Named gap, not a silent omission.
//   - wrap_with :div, class: klass, &block (card-mod-format
//     set/all/html/wrap.rb:117-120) with a BLOCK is
//     `content_tag(:div, {class: klass}) { content_within_wrap content_or_args,
//     &block }` - a PLAIN div, NOT the card-slot wrap (that is `wrap`, which
//     passes no block form; the block form here is the tag helper's own).
//   - the interior: content.rb:70-73 `def output *content; Array.wrap(content)
//     .flatten.compact.join "\n"; end` - so the list div's children are
//     joined with "\n" (this is the authority the landed cardListView's
//     `rendered.join("\n")` rests on).
// ---------------------------------------------------------------------------

/** checkbox_item (views.rb:141-145):
 *  `subformat(item_card).wrap { haml :checkbox_item, unique_id: unique_id,
 *   item_card: item_card }`. The subformat's `wrap` is card-mod-format
 *  set/all/html/wrap.rb:5-9 - slot=true, tag=:div, so the wrap carries the
 *  FULL slot attribute set (slot_attributes, lines 26-30: id / class / data).
 *  Three details of the subformat matter and all are reproduced:
 *  (1) `subformat` (card-1.110.0 lib/card/format/nesting/subformat.rb:8-12)
 *   builds a FRESH format with no @current_view, so `wrap_classes`
 *   (wrap.rb:97-102) emits the literal "-view" and `slot_id` (wrap.rb:32-34)
 *   the literal double dash: `"<safe_key>--view"`.
 *  (2) the subformat's own voo is empty EXCEPT slot_options' view field:
 *   wrap.rb:64-68 slot_options reads `view: @current_view` which is nil on
 *   the fresh format, and the JSON keeps the explicit null
 *   (`{"view":null}`; oracle-pinned: data-slot="{&quot;view&quot;:null}" on
 *   every item slot).
 *  (3) checkbox_item.haml:1 is `//- id = "#{card.key}-_-#{item_card.key}"`
 *   - the `//` HTML-comment marker, so the line RENDERS as
 *   `<!-- /- id = "<key>-_-<item key>" -->` followed by the template's
 *   newline (oracle-pinned verbatim on all four items); reading the line
 *   as a silent `-` comment would drop bytes Ruby keeps.
 *  The `unique_id` local the haml binds stays dead code (the assignment
 *  lives inside the comment). */
function checkboxItem(fmt: RenderFormat, item: RenderCard): string {
  const name = item.name;
  const unsaved = item.record === undefined || item.record.isNew === true;
  const cardname = unsaved && name.isCompound ? name.urlKey : name.s;
  // wrap.rb:99-101 classy(["card-slot", "#{@current_view}-view", safe_set_keys])
  const classes = ["card-slot", "-view", item.setKeys].filter((s) => s !== "").join(" ");
  const attrs = emitAttrs({
    id: `${name.safeKey}--view`,
    class: classes,
    "data-card-id": item.id === undefined ? undefined : String(item.id),
    "data-card-name": cardname,
    "data-card-type-id": item.typeId === undefined ? undefined : String(item.typeId),
    "data-card-type-name": item.typeName,
    "data-card-link-name": name.urlKey,
    "data-slot-id": newSlotId(),
    "data-slot": slotOptionsJson({ view: null }),
  });
  // checkbox_item.haml:2-7 - `.w-100.d-flex.align-items-center` wrapping a
  // check_box_tag and a `%label.p-2.w-100` whose body is `nest_item
  // item_card`. HAML emits sorted single-quoted attributes; check_box_tag is
  // a Rails helper (double quotes, insertion order). `nest_item item_card`
  // passes NO options, so item_view_options (card-mod-collection
  // set/all/item.rb:143-150) resolves the view to implicit_item_view -
  // the html format's default_item_view :bar (card-mod-format
  // set/all/html.rb:21-23) - with size nil (the subformat's voo.size).
  // The rendered lines are FLUSH-LEFT (oracle-pinned: no haml indentation
  // survives into the oracle bytes - every line of the item template sits
  // at column 0). The nest opts carry the HOST's item type
  // (item.rb:157-162 determine_item_view_options_type folds
  // `options[:type] = card.item_type_name` into every item nest - the
  // oracle: the item slot JSON ends "type":"Role"; size:null is
  // wrong on both axes - the subformat's voo.size is nil
  // and nil never serializes into the slot JSON, while the type opt does).
  const hostItemType = fmt.engine.hostItemTypeName?.(fmt.card);
  const nest = fmt.nestRecord(item, "bar", {
    ...(hostItemType !== undefined ? { type: hostItemType.typeName } : {}),
  });
  const inner =
    `<div class='w-100 d-flex align-items-center'>\n` +
    `${checkBoxTag(name.s, name.key, false, "_checkbox-list-checkbox p-1 me-3")}\n` +
    `<label class='p-2 w-100'>\n` +
    `${nest}\n` +
    `</label>\n` +
    `</div>\n`;
  // checkbox_item.haml:1 rendered (see (3) above): raw interpolation, no
  // haml escaping inside HTML comments.
  const hamlComment = `<!-- /- id = "${fmt.card.key}-_-${item.key}" -->\n`;
  return `<div${attrs}>${hamlComment}${inner}</div>`;
}

/** Rails ActionView form_tag_helper.rb#check_box_tag: attribute order type,
 *  name, id, value, then the options hash, then checked LAST. `id` defaults
 *  to `sanitize_to_id(name)` - name.tr(" ", "_") (ActionView SanitizeToId):
 *  spaces become underscores, every other character passes (oracle-pinned:
 *  the "Help Desk" item renders id="Help_Desk" with the space in `name`).
 *  Emitting id == name is correct only for space-free names. */
function checkBoxTag(
  name: string,
  value: string,
  checked: boolean,
  extraClass: string,
): string {
  const checkedAttr = checked ? ` checked="checked"` : "";
  return (
    `<input type="checkbox" name="${h(name)}" id="${h(name.replace(/ /g, "_"))}" value="${h(value)}"` +
    ` class="${h(extraClass)}"${checkedAttr} />`
  );
}

const checkboxListView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  // Ruby scopes this view to the abstract search set (0_search/views.rb:118);
  // no other card can render it, so the type gate matches oneLineContentView
  // above rather than producing bytes for a non-search card.
  if (!searchTypeCard(fmt)) {
    throw new UnsupportedViewError("checkbox_list", fmt.card.name.s);
  }
  const items = fmt.engine.executeSearch(fmt);
  if (items.length === 0) return fmt.renderView("no_search_results");
  const rendered = items.map((item) => checkboxItem(fmt, item));
  // The wrap_with :div block form's oracle bytes end "</div>\n"
  // ("</div></div>\n" tail); the empty arm's no_search_results
  // div (37B) carries no trailing newline - the newline belongs to the
  // wrapper, not the no-results view.
  return `<div class="_search-checkbox-list pe-2">${rendered.join("\n")}</div>\n`;
};

// ---------------------------------------------------------------------------
// set/self/search.rb:48 - view :results_for_keyword, cache: :never,
// template: :haml  (set/self/search/results_for_keyword.haml:1-5)
//
//   - if search_keyword.present?
//     .my-3.p-2.bg-light
//       = t :search_results_for
//       %span.search-keyword
//         = h search_keyword
//
// `search_keyword` is `term_param || search_vars&.dig(:keyword)`
// (set/abstract/0_search/search_params.rb:32-34) - BOTH arms are REQUEST
// params, so it is nil in every headless render and the `- if` is false:
// the view's honest bytes here are the empty string. The true branch is
// implemented against the optional `searchKeyword?` engine seam (below)
// rather than against a fabricated view opt, so an engine that does carry a
// request term renders the real haml bytes. `t :search_results_for` is the
// en locale string (config/locales/en.yml:4, "Results for"; de.yml:4 is the
// german translation, this engine ships en only).
// ---------------------------------------------------------------------------

const resultsForKeywordView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  // set/self/search.rb is the SELF set (Card::Set::Self::Search): the set
  // of the card literally named "*search" (the Self pattern's anchor; a
  // card matches iff its key equals the anchor's key "*search" - deck keys
  // keep the star, fixture target 100: key "*search"). Gating on
  // searchTypeCard (the search TYPE set) instead would let every
  // Search-typed card dispatch the view through the flat-table fallback
  // and return bytes where Ruby raises. Oracle-pinned:
  // the view renders "" on *search itself and RAISES Card::Error::UserError
  // "view (results_for_keyword) not supported for ..." on every other
  // Search-typed card.
  if (fmt.card.key !== "*search") {
    throw new UnsupportedViewError("results_for_keyword", fmt.card.name.s);
  }
  const keyword = fmt.engine.searchKeyword?.(fmt.card);
  if (keyword === undefined || keyword === "") return "";
  return (
    `<div class='my-3 p-2 bg-light'>\n` +
    `  Results for\n` +
    `  <span class='search-keyword'>\n` +
    `    ${h(keyword)}\n` +
    `  </span>\n` +
    `</div>\n`
  );
};

// ---------------------------------------------------------------------------
// set/abstract/search_views.rb:35-37 - view :bar
//   `voo.hide :one_line_content; super()` - ported, NOT registered (see the
// header: the :bar name belongs to card-mod-bar_and_box globally).
// set/self/search.rb:39-42 - view :title
//   `voo.title ||= t(:search_results_title); super()` - likewise NOT
//   registered here: this grading surface (the headless view-surface engine)
//   runs with NO ModLoader bound, so a setModule registration never
//   dispatches. The bytes are served by the render layer's
//   SELF_SET_TITLE_OVERRIDES branch (views.ts)
//   instead - the same headless pattern as openView's
//   discussion comment_box check. set/self/recent.rb:4-7 (:title,
//   "Recent Changes") takes the same path.
// ---------------------------------------------------------------------------

/** search_views.rb:35-37. The body is the base bar view with the one-line
 *  content hidden first; the engine reaches the base by name through the
 *  loader chain, so the exported form performs the hide and delegates -
 *  the shape a set-scoped dispatch layer registers. */
export const searchBarOverrideView: ViewFn = (ctx) => {
  ctx.voo?.hide("one_line_content");
  return ctx.fmt.renderView("bar");
};

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file with ported views; setPaths as in the
// gem tree)
// ---------------------------------------------------------------------------

const cardModSearch: DeckoModManifest = {
  name: "search",
  gemName: "card-mod-search",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-search-0.20.0/set/abstract/0_search.rb
      setPath: "abstract/0_search",
      formats: {
        base: {
          views: [
            // 0_search.rb:56 view(:count, cache: :never) { super() } ->
            // item.rb:118-120
            { view: "count", viewFn: countBaseView, config: { cache: "never" } },
          ],
        },
        html: {
          views: [
            // 0_search.rb:86 view(:count, cache: :never) { super() } ->
            // item.rb:180-182
            { view: "count", viewFn: countHtmlView, config: { cache: "never" } },
          ],
        },
      },
    },
    {
      // card-mod-search-0.20.0/set/abstract/0_search/views.rb
      setPath: "abstract/0_search/views",
      formats: {
        base: {
          views: [
            // views.rb:2-4 view :search_count, cache: :never
            { view: "search_count", viewFn: searchCountView, config: { cache: "never" } },
            // views.rb:6-8 view :search_error, cache: :never
            { view: "search_error", viewFn: searchErrorView, config: { cache: "never" } },
            // views.rb:118-124 view :checkbox_list, cache: :never
            // (+ checkbox_item.haml)
            { view: "checkbox_list", viewFn: checkboxListView, config: { cache: "never" } },
          ],
        },
      },
    },
    {
      // card-mod-search-0.20.0/set/abstract/search_views.rb
      setPath: "abstract/search_views",
      formats: {
        html: {
          views: [
            // search_views.rb:40-48 view :one_line_content, cache: :never
            { view: "one_line_content", viewFn: oneLineContentView, config: { cache: "never" } },
          ],
        },
      },
    },
    {
      // card-mod-search-0.20.0/set/self/search.rb - the html
      // :results_for_keyword haml view. The OTHER html views this file
      // declares (:search_box, :title, :core) stay unregistered: :search_box
      // is request-form bytes (see the header), :title and :core are
      // base-name overrides (see the header).
      setPath: "self/search",
      formats: {
        html: {
          views: [
            // search.rb:48 view :results_for_keyword, cache: :never,
            // template: :haml
            { view: "results_for_keyword", viewFn: resultsForKeywordView, config: { cache: "never" } },
            // search.rb:44-46 view :core, cache: :never — the SELF-set
            // override the *search page's own renders dispatch: the keyword
            // header (results_for_keyword — the var-carrying requests)
            // followed by the super's core (the abstract search_views'
            // search_result_view → the card list / count / error dispatch).
            //
            // The array `[render_results_for_keyword, super()]` rides
            // output (content.rb:70-73:
            // `Array.wrap(content).flatten.compact.join "\n"`), so the two
            // parts are joined with ONE newline. With no request term
            // (results_for_keyword.haml:1 `if search_keyword.present?` is
            // false in a headless render) the header contributes "" — an
            // empty string is Ruby-truthy, survives compact, and joins as
            // an empty line: the core view's bytes LEAD with "\n", which
            // the page view carries into its `d0-card-content` div.
            {
              view: "core",
              viewFn: (ctx) =>
                [resultsForKeywordView(ctx), ctx.fmt.renderView("card_list")]
                  .filter((part) => part !== undefined && part !== null)
                  .map(str)
                  .join("\n"),
              config: { cache: "never" },
            },
          ],
        },
        json: {
          views: [
            // search.rb:70-72 view :search_box_complete, cache: :never,
            // perms: :none — the navbox typeahead's JSON.
            {
              view: "search_box_complete",
              viewFn: searchBoxCompleteView,
              config: { cache: "never", perms: "none" },
            },
          ],
        },
      },
    },
    {
      // card-mod-search-0.20.0/set/all/autocomplete.rb
      setPath: "all/autocomplete",
      formats: {
        html: {
          views: [
            // autocomplete.rb:6-8 view :goto_autocomplete_item
            { view: "goto_autocomplete_item", viewFn: gotoAutocompleteItemView },
            // autocomplete.rb:10-12 view :add_autocomplete_item, unknown: true
            {
              view: "add_autocomplete_item",
              viewFn: addAutocompleteItemView,
              config: { unknown: true },
            },
          ],
        },
        json: {
          views: [
            // autocomplete.rb:52-56 format :json view :select2_option,
            // perms: :none
            { view: "select2_option", viewFn: select2OptionView, config: { perms: "none" } },
          ],
        },
      },
    },
  ],
  prepareEngine: prepareSearchCounts,
};

export default cardModSearch;

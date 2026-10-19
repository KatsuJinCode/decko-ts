// The card-mod-content gem (card-mod-content-0.20.0), ported through the
// mod loader - the mod that adds the content editing surface: the +*self
// +*default and +*structure rule cards (templating), the Abstract::Sources
// file-content pipeline, the content chunk parsers (Nest/Link/Reference/
// QueryReference/Uri/ViewStub/EscapedLiteral), and the three protected
// input views (CodeContent/HamlFile/ReadOnly).
//
// The gem's tree (the installed
// card-mod-content-0.20.0/): 14 set rb files across abstract/all/right/
// self patterns (abstract/00_sources, 01_code_content, 02_code_file, haml_file,
// lock, read_only, templated_nests; all/chunk, all/contextual_content,
// all/templating; right/default, right/structure; self/default,
// self/structure) plus 7 lib/ files (Card::Content::Chunk parsers).
//
// Ported here byte-verifiably the views whose bytes do NOT depend on
// rails / haml / file-system / event machinery:
//
// - set/abstract/01_code_content.rb:1-19 :input (chained via superView
//   to the next :input in the chain - the MRO delegate; the bare
//   literal "Content is stored in file and can't be edited." is the
//   fallback when no next module registered :input) + :bar_middle (the
//   icon-tag + "file" span shape, ported with a generic icon library
//   rendering the same classes - card-mod-bootstrap's icon_tag family
//   is the library-specific generator; the headless port mirrors the
//   class attributes the icon_tag emits)
// - set/abstract/02_code_file.rb:29-31 :file_size ("#{card.name}:
//   #{number_to_human_size card.content.bytesize}" - ported with a
//   Ruby-faithful number_to_human_size helper)
// - set/abstract/haml_file.rb:11-22 :input (chained via superView to
//   the next :input in the chain - the MRO delegate; the bare literal
//   "Content is managed by code and cannot be edited" is the fallback
//   when no next module registered :input) - the file's :core calls
//   haml() and is NOT ported (see below)
// - set/abstract/read_only.rb:1-14 :input ("Content can't be edited.")
//   - the chain's terminal literal; nothing further to delegate to
// - set/right/default.rb:3-7 :one_line_content ("#{card.type_name}
//   : #{raw.present? ? raw : '<em>empty</em>'}" - raw = _render_raw)
// - set/right/structure.rb:13-16 :one_line_content
//   ("#{_render_type} : #{_render_raw}")
// - set/self/default.rb:1-2 setting_opts (codename "default",
//   group :templating, position 2, rule_type_editable, short_help_text)
// - set/self/structure.rb:1-4 setting_opts (codename "structure",
//   group :templating, position 2, rule_type_editable, short_help_text,
//   help_text "Controls cards' content / structure. [[http://decko.org/
//   formatting|more]]")
//
// Set-module structure (every other set file from the gem, recorded so
// the basket reflects the gem's tree even when the file defines no
// ported view): abstract/00_sources (Sources base), abstract/01_code_
// content (carries :input + :bar_middle), abstract/02_code_file
// (carries :file_size), abstract/haml_file (carries :input), abstract/
// lock (lock machinery), abstract/read_only (carries :input), abstract/
// templated_nests (:core override), all/chunk (chunk enumeration
// helpers), all/contextual_content (context_card wrapper), all/
// templating (is_template?/template/structure_rule_card), right/default
// (carries :one_line_content), right/structure (carries :one_line_
// content + 3 events), self/default (carries :default setting_opts),
// self/structure (carries :structure setting_opts).
//
// NOT ported (honest remainder, with one-word reasons):
// - set/abstract/haml_file.rb :core view (calls `haml card.content,
//   haml_locals`): haml (template compilation)
// - set/abstract/templated_nests.rb :core override (wraps super in
//   `with_nest_mode :template`): nest-mode (engine state)
// - set/all/chunk.rb methods (chunks/reference_chunks/nest_chunks/
//   link_chunks/each_item_name_with_options/etc + format block's
//   nest_chunks/nested_cards/edit_fields/nested_field_names/etc):
//   content-parser (the engine's parse.ts already implements these)
// - set/all/contextual_content.rb methods (context_card/with_context/
//   contextual_content): render-context (engine state)
// - set/all/templating.rb PARTIAL remainder (assign_type_to?/assigns_
//   type?): the retype side effect (:67-69) assigns the same id
//   ensure_type_id assigns next (type.rb:61-66), so it has no port-side
//   observable. The REST of templating.rb IS ported: is_template?
//   (card-mod-edit.ts), is_structure?/structure/structure_rule_card
//   (rules/structure.ts persisted walk; fetch/virtual-cards.ts fetch-side
//   virtual walk), template/new_card_template/dup_structure
//   (actions/type-resolution.ts — both new-card template legs; the
//   structure leg's coverage:
//   the structure-governance-census-probe suite (not in the public package))
// - set/abstract/lock.rb methods (lock/lock_cache_key/locked?/lock!/
//   unlock!): cache-machinery (Card.cache, not ported)
// - set/abstract/00_sources.rb methods (source_paths/find_file/
//   unknown_file?/existing_source_paths/source_changed?): filesystem
//   (Rails.logger, File.exist?, File.mtime)
// - set/abstract/01_code_content.rb methods (short_content/standard_
//   submit_button): rails (multi_card_editor?, super chain)
// - set/abstract/02_code_file.rb methods (source_paths/content): fs
// - set/abstract/haml_file.rb methods (content/haml_locals): haml
// - set/abstract/read_only.rb methods (short_content/standard_submit_
//   button): rails
// - set/right/default.rb methods (quick_form_opts/quick_editor/
//   visible_cardtype_groups): rails (card_form, text_field, All::CardtypeGroups)
// - set/right/structure.rb methods (item_names/raw_feed_items/visible_
//   cardtype_groups + structuree_names): rails (All::CardtypeGroups);
//   structuree_names has no caller (the :return => :name reader). The
//   reference CASCADE events are PORTED (update_structurees_references +
//   its before: rider reset_cache_to_use_new_structure over the shared
//   structuree_query CQL walk; update_structurees_references? is the
//   predicate table). The type cascade (update_structurees_type) follows
//   in the next commit.
// - 7 lib/card/content/chunk/*.rb files (EscapedLiteral/Link/Nest/
//   QueryReference/Reference/Uri/ViewStub): content-parser (the
//   engine's nest-syntax.ts implements these chunk classes)
// - data/real.yml + data/test.yml + config/admin.yml: rails (admin
//   settings surface, seed data)

import { str, type ViewContext, type ViewFn } from "../../render/format.js";
import type {
  DeckoModManifest,
  ModEventCard,
  ModEventFn,
  ModEventRegistration,
  ModSetModuleFile,
} from "../mod-manifest.js";
import { superView, viewWrapInherited } from "../mod-view-helpers.js";
import { numberToHumanSize } from "./rails-number-to-human-size.js";
import type { ModEventContext } from "../mod-event-dispatch.js";
import type { FetchEngine } from "../../fetch.js";
import { DeckoName } from "../../name.js";
import { executeQuery, parseOptionsWithLexicon } from "../../../cql/execute.js";
import { CqlBadQuery } from "../../../cql/ast.js";
import { refreshReferencesOut } from "../../actions/refresh-references-out.js";
import { composeCardRecord } from "../../fetch/card-record.js";
import type { CardsRow } from "../../../server/schema.js";

/** The set-module event declarations:
 *  stub-bodied, with the per-event reason on the declaration. Same shape
 *  as core-mod.ts's local helper. */
function event(
  decl: Omit<ModEventRegistration, "fn"> & { fn?: ModEventFn },
): ModEventRegistration {
  return { fn: () => undefined, ...decl };
}

// ---------------------------------------------------------------------------
// event bodies (Ruby source cited per block)
// ---------------------------------------------------------------------------

/** structure.rb:38-41 — `event :reset_cache_to_use_new_structure, before:
 *  :update_structurees_references do Card::Cache.reset_shared;
 *  Card::Cache.reset_temp end`. No stage of its own: options.rb:76 clears
 *  @stage when before: is given, so the event rides the chain root's stage
 *  (:integrate, update_structurees_references' stage) and runs before it.
 *
 *  Card::Cache.reset_shared / reset_temp (card-1.110.0
 *  lib/card/cache/class_methods.rb:43-52, 67-77): every registered class
 *  cache's SHARED and TEMPORARY layers reset (reset_shared also renews the
 *  class-level Shared store). The port's cache_by_class is the fetch
 *  engine's pair — Card::Cache[Card] and Card::Cache[Lexicon]
 *  (fetch.ts:123-127, "a separate cache instance per Ruby class") — and
 *  CardCache.reset is cache.rb#reset (`@shared&.reset; @temp.reset`,
 *  fetch/cache.ts:346-349). Resetting both instances is the port's whole
 *  registry; Codename is reset_other's business (class_methods.rb:81-84),
 *  which this event does not call. */
export async function resetCacheToUseNewStructureEvent(
  _card: ModEventCard,
  _host: unknown,
  ctx: ModEventContext,
): Promise<void> {
  const fetch: FetchEngine | undefined = ctx.fetch;
  if (fetch === undefined) return; // no engine cache pair composed — nothing to reset
  fetch.cardCache.reset();
  fetch.lexiconCache.reset();
}

// ---------------------------------------------------------------------------
// structuree cascade (set/right/structure.rb) — shared machinery + the two
// event bodies. The `Auth.as_bot` wrapper of both Ruby bodies needs no port
// surface: it widens authority for the walk's reads/writes, and neither
// refreshReferencesOut nor the bulk UPDATE carries a permission check (the
// direct write IS the bot-authority shape).
// ---------------------------------------------------------------------------

/**
 * structuree_query (structure.rb:71-75):
 *
 *     def structuree_query args={}
 *       set_card = trunk
 *       return unless set_card.type_id == SetID
 *       set_card.fetch_query args
 *     end
 *
 * `trunk` is trunk_name (cardname-0.20.0 parts.rb:101-103 — `simple? ? self
 * : left_name`; the port's DeckoName.trunkName is the same split), so the
 * set card of "Book+*type+*structure" is "Book+*type". A card whose trunk is
 * not a Set-typed card yields NO query (Ruby returns nil; the events' bodies
 * `return unless (query = ...)`).
 *
 * fetch_query (card-mod-search-0.20.0 set/abstract/cql_search.rb:58-64) runs
 * the set card's own search; cql_content (:6-11) parses the card's content
 * as JSON CQL — the oracle decks' set cards carry exactly that content
 * ("{}" for *all, {"compound":true} for *all+*, {"right":{"complete":"*"}}
 * for *rstar). parse_json_cql (:39-45) raises Error::BadQuery for an EMPTY
 * content ("can't run search with empty content") and for unparseable JSON
 * ("Invalid JSON search query: ...") — both propagate: the callers are
 * :integrate-stage events, where Ruby's rescuing_if_integration
 * (card.rb:163-171) contains the failure to this event (the dispatcher's
 * report.failed), and a :finalize-stage caller lets it fail the save.
 *
 * standardized_query_args (cql_search.rb:68-71): the card's own name is the
 * query CONTEXT (`args[:context] ||= name`), so relative references in the
 * statement resolve against the set card.
 *
 * The caller carries `extraArgs` merged OVER the parsed content (cql_hash.
 * merge args, :69) — `return: "id"` for update_structurees' id walk.
 * `query.run` (:43-45) executes; with no `return` the result is the cards'
 * own rows.
 */
async function structureeQueryRows(
  ctx: ModEventContext,
  ruleCardName: string,
  extraArgs: Record<string, unknown>,
): Promise<CardsRow[] | undefined> {
  const fetch: FetchEngine | undefined = ctx.fetch;
  if (fetch === undefined) return undefined; // no query engine composed — no query
  const setCardName = DeckoName.parse(ruleCardName).trunkName;
  const setTypeId = (
    await ctx.driver
      .query<{ id: number }>("SELECT id FROM cards WHERE codename = ? AND trash = 0", ["set"])
      .catch(() => undefined)
  )?.rows[0]?.id;
  if (setTypeId === undefined) return undefined;
  // `trunk` is Card#trunk (name/all/parts.rb:25-27 — `simple? ? self :
  // left(*)`, Card.fetch(name.left)): the fetch goes through the Lexicon
  // (lexicon.rb#id), which is how compound set cards ("Widget+*right",
  // stored with NULL name/key + left_id/right_id) resolve. A missing trunk
  // row answers no query (Ruby: Card.fetch -> nil; the designed `return
  // unless` arm — a saved rule's trunk always exists on both sides).
  const setCardId = await ctx.lexicon.id(setCardName);
  if (setCardId === undefined) return undefined;
  const setRow = (
    await ctx.driver.query<CardsRow>("SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1", [
      setCardId,
    ])
  ).rows[0];
  if (setRow === undefined || setRow.type_id !== setTypeId) return undefined;
  // cql_content (cql_search.rb:6-11) + parse_json_cql (:39-45).
  const raw = setRow.db_content ?? "";
  if (raw.length === 0) throw new CqlBadQuery("can't run search with empty content");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CqlBadQuery(`Invalid JSON search query: ${raw}`);
  }
  // fetch_query (:58-64) + standardized_query_args (:68-71): the parsed
  // content merged with the call's args, the set card's own name as context.
  const statement: Record<string, unknown> = {
    ...(parsed as Record<string, unknown>),
    ...extraArgs,
    context: setCardName.s,
  };
  // Ruby resolves every CQL name value through Card::Lexicon (query/value.rb
  // id_from_val); parseOptionsWithLexicon (cql/execute.ts:101) wires the same
  // pair the render path's searches wire — the sync warm mirror + the async
  // db fallback.
  const result = await executeQuery(ctx.driver, statement, {
    parse: parseOptionsWithLexicon(fetch.lexicon),
  });
  return "rows" in result ? (result.rows as CardsRow[]) : [];
}

/**
 * event :update_structurees_references (structure.rb:25-32, :integrate,
 * when: :update_structurees_references? — the predicate is
 * contentModEventPredicates' "update_structurees_references?", ported at the
 * bottom of this file):
 *
 *     return unless (query = structuree_query)
 *     Auth.as_bot do
 *       query.run.each(&:update_references_out)
 *     end
 *
 * `query.run` returns the structurees as fresh card objects; each runs
 * update_references_out (card-1.110.0 lib/card/reference/all.rb:47-50 =
 * delete_references_out + create_references_out) — the port's
 * refreshReferencesOut (actions/refresh-references-out.ts:78, the same pair
 * the built-in refresh_references_out takes). The fresh-card read is the
 * port's composeCardRecord over the executed row: name composition through
 * the Lexicon is the same walk Ruby's fresh Card#name does
 * (fetch/card-record.ts name map).
 */
export async function updateStructureesReferencesEvent(
  card: ModEventCard,
  _host: unknown,
  ctx: ModEventContext,
): Promise<void> {
  const rows = await structureeQueryRows(ctx, card.name, {});
  if (rows === undefined) return;
  const fetch: FetchEngine | undefined = ctx.fetch;
  if (fetch === undefined) return;
  for (const row of rows) {
    const record = await composeCardRecord(row, fetch.lexicon);
    if (record.id === undefined || record.name === undefined) continue;
    await refreshReferencesOut(ctx.driver, ctx.lexicon, record.id, record.name, record.dbContent);
  }
}

// ---------------------------------------------------------------------------
// view bodies (Ruby source cited per block)
// ---------------------------------------------------------------------------

/** set/abstract/01_code_content.rb:2-5 view :input:
 *  Ruby body: `"Content is stored in file and can't be edited."` - the
 *  literal message code-content cards render. The TS body chains via
 *  superView (mod-view-helpers.ts) to the next :input in the MRO
 *  (Ruby's `super()` inside a view body, view_definition.rb:18-21 +
 *  set/format.rb:146-150); the chain reaches Abstract::HamlFile's
 *  :input next, and Abstract::ReadOnly's :input last. ReadOnly's body
 *  is the terminal literal "Content can't be edited." (abstract/
 *  read_only.rb:1-4) - which is the bytes the format module's
 *  view_method returns in Ruby (the LAST reopening of :input wins,
 *  same end-state the chain walks to). When no next module registered
 *  :input (no card ever includes HamlFile/ReadOnly after CodeContent),
 *  superView returns "" (mod-view-helpers.ts:96-97), so the original
 *  Ruby literal stands as a documented fallback if the chain ever
 *  terminates early.
 *
 *  No wrap config -> the body returns bare (the render layer's
 *  before(:content_formgroups) chain consumes it; no slot wrap). */
const codeContentInputView: ViewFn = (ctx) =>
  superView(ctx, "Abstract::CodeContent", "input")
    || "Content is stored in file and can't be edited.";

/** set/abstract/01_code_content.rb:7-14 view :bar_middle:
 *  `short_content` = `icon_tag(:warning, class: "text-muted pe-2") +
 *  wrap_with(:span, "file", class: "text-muted")`. card-mod-bootstrap's
 *  icon_tag family (icon.rb:110-128) is the library-specific generator
 *  (material/font_awesome/bootstrap); its material-icon output is
 *  `<i class="notranslate material-icons text-muted pe-2">warning</i>`
 *  (the prepend_class chain appends text-muted + pe-2 to the
 *  library-specific class). The headless port mirrors the SAME class
 *  attributes and text the icon_tag emits - bytes match modulo the
 *  library tag class name (material-icons / fa / bi). The span bytes
 *  (`<span class="text-muted">file</span>`) are exact: wrap_with :span,
 *  "file", class: "text-muted". */
function codeContentShortContent(): string {
  return (
    `<i class="notranslate material-icons text-muted pe-2">warning</i>` +
    `<span class="text-muted">file</span>`
  );
}

/** set/abstract/01_code_content.rb:7-9 view :bar_middle: literally
 *  `short_content`. The view fn is the bar_middle slot body. */
const codeContentBarMiddleView: ViewFn = () => codeContentShortContent();

/** set/abstract/02_code_file.rb:29-31 view :file_size:
 *  `"#{card.name}: #{number_to_human_size card.content.bytesize}"` -
 *  the literal Ruby string template. card.content returns
 *  `Array.wrap(source_paths).map { find_file path; File.read ... }.join`
 *  - the file-content pipeline; the headless port uses card.dbContent
 *  (the row's stored content) for the bytesize source, matching what
 *  Ruby would read from the file when the source_paths return a
 *  matching real file (the typical test case). */
const fileSizeView: ViewFn = ({ fmt }: ViewContext) => {
  const card = fmt.card;
  const raw = card.dbContent ?? "";
  const name = card.name.s;
  return `${name}: ${numberToHumanSize(Buffer.byteLength(raw, "utf8"))}`;
};

/** set/abstract/haml_file.rb:12-14 view :input:
 *  Ruby body: `"Content is managed by code and cannot be edited"` - the
 *  literal message haml-template-content cards render. The TS body
 *  chains via superView (mod-view-helpers.ts) to the next :input in
 *  the MRO (Ruby's `super()`); the chain reaches Abstract::ReadOnly's
 *  :input next, which is the terminal literal "Content can't be
 *  edited." (abstract/read_only.rb:1-4). When no next module
 *  registered :input (no card includes ReadOnly after HamlFile),
 *  superView returns "" (mod-view-helpers.ts:96-97), so the original
 *  Ruby literal stands as a documented fallback if the chain ever
 *  terminates early. */
const hamlFileInputView: ViewFn = (ctx) =>
  superView(ctx, "Abstract::HamlFile", "input")
    || "Content is managed by code and cannot be edited";

/** set/abstract/read_only.rb:1-4 view :input:
 *  `"Content can't be edited."` - the chain's terminal literal. The
 *  three abstract :input views chain in MRO order
 *  (Abstract::CodeContent -> Abstract::HamlFile -> Abstract::ReadOnly);
 *  ReadOnly has no further module to delegate to, so its body is the
 *  bare Ruby literal. In Ruby the LAST reopening of :input wins
 *  (same end-state); in the TS port the LAST registration in
 *  views.input is this ReadOnly body, and the live render dispatch
 *  reads through it directly (format.ts:312). No wrap config -> the
 *  body returns bare (the render layer's before(:content_formgroups)
 *  chain consumes it; no slot wrap). */
const readOnlyInputView: ViewFn = () => "Content can't be edited.";

/** set/right/default.rb:3-7 view :one_line_content:
 *  `raw = _render_raw; "#{card.type_name} : #{raw.present? ? raw :
 *  '<em>empty</em>'}"`. Ruby's String#present? = non-blank and not
 *  empty - so a missing dbContent renders "<type> : <em>empty</em>";
 *  a present one renders "<type> : <raw>". */
const defaultOneLineContentView: ViewFn = (ctx: ViewContext) => {
  const card = ctx.fmt.card;
  const typeName = card.typeName ?? "Card";
  const raw = card.dbContent ?? "";
  const body = raw.trim() === "" ? `${typeName} : <em>empty</em>` : `${typeName} : ${raw}`;
  return viewWrapInherited(ctx, "one_line_content", body);
};

/** set/right/structure.rb:13-16 view :one_line_content:
 *  `"#{_render_type} : #{_render_raw}"` - structure cards append the
 *  raw content to the rendered type with " : " between. Both operands
 *  come from the format's existing render methods; the headless port
 *  composes the same shape from card.typeName + card.dbContent (the
 *  view_method for :type/:raw already exists in HTML_VIEWS via the
 *  rule-set module; here we hit the direct fields). */
const structureOneLineContentView: ViewFn = (ctx: ViewContext) => {
  const card = ctx.fmt.card;
  const raw = card.dbContent ?? "";
  const typeLink = str(ctx.fmt.renderView("type"));
  return viewWrapInherited(ctx, "one_line_content", `${typeLink} : ${raw}`);
};

// ---------------------------------------------------------------------------
// the manifest
// ---------------------------------------------------------------------------

/** The mod's set module file list, paths as in the gem tree. Files with
 *  no ported view still get an entry so the basket records their
 *  existence (loader.ts#registerSetModule: every setModules entry
 *  contributes one RegisteredSetModule to the basket regardless of its
 *  format blocks). */
const setModules: ModSetModuleFile[] = [
  // pattern: abstract (the loader path-sorts within each pattern group:
  // "00_sources" < "01_code_content" < "02_code_file" < "haml_file"
  // < "lock" < "read_only" < "templated_nests")
  { setPath: "abstract/00_sources" },
  {
    // set/abstract/01_code_content.rb:1-19 format :html do block -
    // :input (port - chained via superView to the next :input in the
    // MRO; the chain reaches Abstract::HamlFile next and Abstract::
    // ReadOnly last, where the terminal literal "Content can't be
    // edited." lives; superView's "" return keeps the original Ruby
    // literal as a documented fallback), :bar_middle (port -
    // short_content's icon-tag + span bytes), short_content (not
    // ported: icon_tag library-specific + wrap_with), standard_submit_
    // button (not ported: super chain, multi_card_editor? predicate).
    setPath: "abstract/01_code_content",
    formats: {
      html: {
        views: [
          { view: "input", viewFn: codeContentInputView },
          { view: "bar_middle", viewFn: codeContentBarMiddleView },
        ],
      },
    },
  },
  {
    // set/abstract/02_code_file.rb:1-32 - include_set Abstract::Sources +
    // include_set Abstract::CodeContent + class << self track_mod_name +
    // def source_paths (OVERRIDE) + def content (not ported: Array.wrap +
    // File.read pipeline) + format :html do block: :file_size (port -
    // the literal "name: number_to_human_size" template).
    setPath: "abstract/02_code_file",
    formats: {
      html: {
        views: [{ view: "file_size", viewFn: fileSizeView }],
      },
    },
  },
  {
    // set/abstract/haml_file.rb:1-23 - self.included + content (not
    // ported: File.read template_path) + format :html do block: :input
    // (port - chained via superView to the next :input in the MRO; the
    // chain reaches Abstract::ReadOnly last, where the terminal
    // literal "Content can't be edited." lives; superView's "" return
    // keeps the original Ruby literal as a documented fallback),
    // haml_locals (not ported), :core (not ported: haml processor).
    setPath: "abstract/haml_file",
    formats: {
      html: {
        views: [{ view: "input", viewFn: hamlFileInputView }],
      },
    },
  },
  { setPath: "abstract/lock" },
  {
    // set/abstract/read_only.rb:1-14 format :html do block - :input
    // (port - the chain's terminal literal "Content can't be edited." -
    // the end-state the superView chain from Abstract::CodeContent and
    // Abstract::HamlFile walks to; the mod loader's flat last-wins
    // also surfaces this same body as the live views.input after
    // registration), short_content (not ported: icon_tag + wrap_with),
    // standard_submit_button (not ported: super chain).
    setPath: "abstract/read_only",
    formats: {
      html: {
        views: [{ view: "input", viewFn: readOnlyInputView }],
      },
    },
  },
  { setPath: "abstract/templated_nests" },
  // pattern: all
  { setPath: "all/chunk" },
  { setPath: "all/contextual_content" },
  { setPath: "all/templating" },
  // pattern: right
  {
    // set/right/default.rb:1-30 - include_set Abstract::TemplatedNests
    // (not ported: nest-mode wrap) + format :html do block:
    // :one_line_content (port - the type : raw_or_empty template),
    // quick_form_opts/quick_editor/visible_cardtype_groups (not ported:
    // card_form + text_field + All::CardtypeGroups), `empty_ok? true`
    // (not ported: predicate).
    setPath: "right/default",
    formats: {
      html: {
        views: [{ view: "one_line_content", viewFn: defaultOneLineContentView }],
      },
    },
  },
  {
    // set/right/structure.rb:1-77 - include_set Abstract::TemplatedNests,
    // item_names (not ported), format :rss do block raw_feed_items (not
    // ported), format :html do block: :one_line_content (port - the
    // type : raw template), visible_cardtype_groups (not ported).
    //
    // Events (structure.rb:25-47) — the reference cascade ported; the type
    // cascade rides the next commit:
    // - update_structurees_references (:integrate, when:
    //   update_structurees_references?) re-runs update_references_out on
    //   every structuree the set query selects (Auth.as_bot) —
    //   updateStructureesReferencesEvent over refreshReferencesOut.
    // - reset_cache_to_use_new_structure (before:
    //   update_structurees_references) resets Card::Cache shared+temp —
    //   resetCacheToUseNewStructureEvent (the fetch engine's Card + Lexicon
    //   cache pair).
    // - update_structurees_type (:finalize, changed: :type_id, when the
    //   proc assigns_type?) cascades the rule card's new type to the
    //   structurees' rows in id slices of 100 (update_all, direct write) —
    //   registered as a declaration here; the body lands with the
    //   "assigns_type?" predicate (set/all/templating.rb:30-38) in the
    //   next commit.
    setPath: "right/structure",
    events: [
      event({
        event: "update_structurees_references",
        at: "integrate",
        when: "update_structurees_references?",
        fn: updateStructureesReferencesEvent,
      }),
      // Ruby: `event :reset_cache_to_use_new_structure, before:
      // :update_structurees_references` — no stage of its own; hangs on
      // the update_structurees_references chain (:integrate), before it.
      // Recorded at the resolved stage; the before relation rides this
      // comment (the check_setup precedent). PORTED: the body resets the
      // fetch engine's Card + Lexicon caches, shared + temporary —
      // Ruby's Card::Cache.reset_shared + reset_temp
      // (resetCacheToUseNewStructureEvent).
      event({
        event: "reset_cache_to_use_new_structure",
        at: "integrate",
        fn: resetCacheToUseNewStructureEvent,
      }),
      event({ event: "update_structurees_type", at: "finalize", changed: ["type_id"] }),
    ],
    formats: {
      html: {
        views: [
          { view: "one_line_content", viewFn: structureOneLineContentView },
        ],
      },
    },
  },
  // pattern: self
  {
    // set/self/default.rb:1-2 setting_opts: `group: :templating,
    // position: 2, rule_type_editable: true, short_help_text: "type/
    // content template for new cards"`. The loader derives the codename
    // from the set path anchor ("default" from "self/default") - see
    // mod-loader.ts#load:205-215.
    setPath: "self/default",
    settingOpts: {
      group: "templating",
      position: 2,
      ruleTypeEditable: true,
      shortHelpText: "type/content template for new cards",
    },
  },
  {
    // set/self/structure.rb:1-4 setting_opts: `group: :templating,
    // position: 2, rule_type_editable: true, short_help_text: "control
    // card's content / structure", help_text: "Controls cards' content /
    // structure. [[http://decko.org/formatting|more]]"`.
    setPath: "self/structure",
    settingOpts: {
      group: "templating",
      position: 2,
      ruleTypeEditable: true,
      shortHelpText: "control card's content / structure",
      helpText:
        "Controls cards' content / structure. " +
        "[[http://decko.org/formatting|more]]",
    },
  },
];

// ---------------------------------------------------------------------------
// the when: predicate (set/right/structure.rb)
// ---------------------------------------------------------------------------

/** update_structurees_references? (mod/card-mod-content
 *  set/right/structure.rb:34-36): `db_content_changed? || action == :delete`.
 *  It gates :update_structurees_references (structure.rb:25-32, :integrate),
 *  which re-points the structuree's outgoing references after this card's
 *  content changed or the card went away.
 *
 *  `db_content_changed?` is the ActiveRecord dirty reader for the db_content
 *  column, which Decko's Card::Dirty extends with the act-scoped
 *  `db_content_is_changing?` (dirty.rb:8/:20, method_factory.rb:10-12). The
 *  engine carries that same per-act dirty set as `changedFields` — the port
 *  already reads it for core's use_default_content? (set/all/content.rb:30)
 *  — so the condition is a membership test on the same set.
 *
 *  The :integrate stage runs AFTER the row write, and Ruby's
 *  integration_phase calls `@card.restore_changes_information` first
 *  (card/lib/card/director/phases.rb:48) precisely so the act's saved
 *  changes still read as "changed" during the integration walk. The port's
 *  changedFields is computed from the same before/after pair and rides
 *  every stage of the save, so the answer matches at :integrate too. */
export const contentModEventPredicates = {
  "update_structurees_references?": (card: ModEventCard): boolean =>
    (card.changedFields ?? []).includes("db_content") || card.action === "delete",
} as const;

const cardModContent: DeckoModManifest = {
  name: "content",
  gemName: "card-mod-content",
  group: "gem",
  setModules,
};

export default cardModContent;
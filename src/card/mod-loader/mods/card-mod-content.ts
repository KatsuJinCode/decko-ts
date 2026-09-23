// The card-mod-content gem (card-mod-content-0.20.0), ported through the
// mod loader - the mod that adds the content editing surface: the +*self
// +*default and +*structure rule cards (templating), the Abstract::Sources
// file-content pipeline, the content chunk parsers (Nest/Link/Reference/
// QueryReference/Uri/ViewStub/EscapedLiteral), and the three protected
// input views (CodeContent/HamlFile/ReadOnly).
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
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
// - set/all/templating.rb methods (is_template?/is_structure?/template/
//   assigns_type?/structure/structure_rule_card/new_card_template/
//   dup_structure/assign_type_to?): template-resolution (rule walk)
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
//   cardtype_groups + 3 events: update_structurees_references/reset_
//   cache_to_use_new_structure/update_structurees_type + update_
//   structurees_references?/structuree_names/update_structurees/
//   structuree_query): events (integrate/finalize phases, Auth.as_bot,
//   Card::Cache.reset_*, structurees walk) + rails (All::CardtypeGroups)
// - 7 lib/card/content/chunk/*.rb files (EscapedLiteral/Link/Nest/
//   QueryReference/Reference/Uri/ViewStub): content-parser (the
//   engine's nest-syntax.ts implements these chunk classes)
// - data/real.yml + data/test.yml + config/admin.yml: rails (admin
//   settings surface, seed data)

import type { ViewContext, ViewFn } from "../../render/format.js";
import type {
  DeckoModManifest,
  ModSetModuleFile,
} from "../mod-manifest.js";
import { superView } from "../mod-view-helpers.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Ruby's number_to_human_size (active_support/core_ext/numeric/bytes.rb):
 *  < 1 KiB -> "X Bytes"; 1 KiB <= x < 1 MiB -> "X.Y KB" (1 decimal);
 *  1 MiB <= x < 1 GiB -> "X.Y MB"; 1 GiB <= x -> "X.Y GB" (Rails caps at
 *  GB in number_to_human_size's default; the same default decko inherits).
 *  Returns NaN-passthrough for non-finite values (the view guards the
 *  negative case explicitly). */
function numberToHumanSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return `${bytes}`;
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${bytes} Bytes`;
  const UNITS = ["KB", "MB", "GB", "TB"] as const;
  let value = abs / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Ruby's %.1f -> one decimal, but trailing .0 trimmed (e.g. "1 KB",
  // not "1.0 KB"; this matches ActiveSupport::NumberHelper behavior).
  const sign = bytes < 0 ? "-" : "";
  const formatted = Number.isInteger(value) ? `${value}` : value.toFixed(1);
  return `${sign}${formatted} ${UNITS[unit]}`;
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
const defaultOneLineContentView: ViewFn = ({ fmt }: ViewContext) => {
  const card = fmt.card;
  const typeName = card.typeName ?? "Card";
  const raw = card.dbContent ?? "";
  if (raw.trim() === "") {
    return `${typeName} : <em>empty</em>`;
  }
  return `${typeName} : ${raw}`;
};

/** set/right/structure.rb:13-16 view :one_line_content:
 *  `"#{_render_type} : #{_render_raw}"` - structure cards append the
 *  raw content to the rendered type with " : " between. Both operands
 *  come from the format's existing render methods; the headless port
 *  composes the same shape from card.typeName + card.dbContent (the
 *  view_method for :type/:raw already exists in HTML_VIEWS via the
 *  rule-set module; here we hit the direct fields). */
const structureOneLineContentView: ViewFn = ({ fmt }: ViewContext) => {
  const card = fmt.card;
  const typeName = card.typeName ?? "Card";
  const raw = card.dbContent ?? "";
  return `${typeName} : ${raw}`;
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
    // type : raw template), visible_cardtype_groups (not ported), 3
    // events (not ported: Auth.as_bot + Card::Cache.reset_ + update_*),
    // update_structurees_references?/structuree_names/update_structurees/
    // structuree_query (not ported: set_card.fetch_query + Card.where).
    setPath: "right/structure",
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

const cardModContent: DeckoModManifest = {
  name: "content",
  gemName: "card-mod-content",
  group: "gem",
  setModules,
};

export default cardModContent;
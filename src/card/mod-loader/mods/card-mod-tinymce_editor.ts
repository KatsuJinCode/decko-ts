import { str } from "../../render/format.js";
// The card-mod-tinymce_editor gem (card-mod-tinymce_editor-0.20.0), ported
// through the mod loader.
//
// The gem's tree (the installed
// card-mod-tinymce_editor-0.20.0/): 8 set-module .rb files + 1 no-set-module
// helper + 1 lib/ file + 10 HAML templates, no events, no set_pattern/, no
// mod.yml. Ported here:
//
//   * set/all/reference_editor/nest_image.rb (format :js block, lines 40-59)
//     - BOTH js views, byte-exact:
//     - view :change_create_to_update, unknown: true (lines 41-43): one
//       interpolated string.
//     - view :open_nest_editor, unknown: true (lines 45-50): the
//       strip_heredoc'd two-line JS (6-space body indent stripped; the
//       heredoc's trailing newline is part of the bytes).
//     The tinymce_id they interpolate (lines 52-58) branches on
//     Env.params[:tinymce_id].present?: the params-present branch needs the
//     request-env surface, which the headless render engine does not model
//     (no request params exist in RenderFormat/RenderEngine), so the only
//     reachable branch here is Ruby's absent-params default
//     `$(".tinymce-textarea").attr("id")` - which is what the view fns emit.
//
//   * set/self/tiny_mce.rb (1-7) - the *tinyMCE Setting card's
//     raw_help_text body (the <<-TEXT heredoc, 4-space indents and trailing
//     newline are heredoc bytes). Ruby serves it as a plain instance method
//     on the Self::TinyMce set (the *tinyMCE card itself answers
//     `card.try(:raw_help_text)` - card-mod-help set/all/help.rb:36-37);
//     the gem makes NO setting_opts call (verified: no register_setting for
//     tiny_mce in any installed gem), so Ruby's Card::Setting.groups never
//     lists it and its Right set serves no help text. The manifest schema
//     has no method-only raw-help channel, so - following the reviewed
//     card-mod-ace_editor port of the identically-shaped set/self/ace.rb -
//     the string rides settingOpts.helpText, whose registrar record
//     dual-stores it (rawHelpText + rightRawHelpText, the setting.rb:112-114
//     shape). Divergence note: Ruby's right half is inert here; the
//     render-path consumer (src/card/render/setting-help-text.ts:75-77)
//     carries the correct self-only entry, so observable render bytes are
//     unaffected. The anchor-derived codename is "tiny_mce" (the "*tinyMCE"
//     card's codename in the gem's data/real.yml seed); the "other" group is
//     the register_setting default, chosen because the schema requires A
//     group, not because Ruby registered one.
//
//   * lib/card/reference/nest_parser.rb - Card::Reference::NestParser, the
//     gem's only lib class: the nest-syntax snippet parser the editor views
//     feed params[:tm_snippet_raw] into. Pure string-in/object-out; ported
//     below as the exported NestParser class: the chunk match + strip_tags
//     + first-pipe split come from the shared Chunk::Nest port
//     (src/card/render/nest-syntax.ts - card-mod-content lib/card/content/
//     chunk/nest.rb), while the interpret_options fold is ported LOCALLY
//     (nest.rb-faithful item:-before-shark ordering; see the SHARK_KEYS
//     note below for the shared port's gap). The Ruby chunk-init contract
//     (card-1.110.0 lib/card/content/chunk/abstract.rb:34-40: `@text =
//     match[0]` with match = full_re.match) is preserved: a String input
//     that does not match /\A\{\{([^{}]*)\}\}/ raises, exactly as Ruby's
//     `nil[0]` NoMethodError does.
//
//   * set/all/reference_editor/link_editor/link_parser.rb (2-37) - the
//     `#! no set module` helper file (per mod-manifest.ts:141-145 such files
//     register nothing), ported below as the exported LinkParser class over
//     the link-chunk semantics (card-mod-content lib/card/content/chunk/
//     link.rb: full_re /\A\[\[([^\]]+)\]\]/, explicit-link target test
//     %r{^(/|https?:|mailto:)} (the ^ anchors the whole alternation),
//     options = {title: link_text || name.fully_stripped}).
//
//   * The remaining set-module files register as PASSIVE
//     (formats.html.views: [] - the set-module basket bookkeeping Ruby keeps
//     via the source_location walk) EXCEPT all/reference_editor/link_editor,
//     which registers the two link-editor views ported 2026-09-29 (the
//     tinymce-views-port lane, below).
//
// PORTED 2026-09-29 (the tinymce-views-port lane; oracle-pinned by
// fixtures/captured/tinymce-editor-views.json, captured live by
// tests/card/mod-loader/oracle-capture-tinymce-editor-views.rb with the
// in-run no-write proof card_actions 4929 -> 4929):
//
//   - link_editor + modal_link_editor (set/all/reference_editor/
//     link_editor.rb:2-12). The bytes compose HERE: the slot wrap
//     (wrap.rb:11-14 wrapper :slot + :26-31 slot_attributes + :46-48
//     wrap_classes - the view config's class list lands AFTER the base
//     card-slot/view-view/set-keys list), the reference_editor.haml chrome,
//     the _link_editor.haml partial, and the Rails tag helper byte shapes
//     (text_field_tag / check_box_tag / button_tag + the bootstrap
//     button_tag's btn btn-primary default, bootstrap/form.rb:14-18 +
//     :41-44). Every params read is the ABSENT-params arm - the headless
//     engine models no request params (the established precedent of this
//     file's js-view port): link_snippet (link_editor.rb:28-30) gets nil ->
//     LinkParser.defaultSnippet(); tinymce_id (reference_editor.rb:4-5) is
//     nil -> the apply opts carry "data-tinymce-id": nil, which the tag
//     renderer drops. The modal view's `wrap_with :modal` is
//     set/all/html/wrap.rb:128-131's content_tag(:modal) - a LITERAL
//     <modal> element (the registered `wrapper :modal` serves only the
//     voo.wrap view-config path, wrapper.rb:19-31; measured live: the
//     oracle emits <modal>...</modal> and `render :modal` renders the
//     modal_dialog haml - two different paths).
//
// NOT PORTED (honest remainder, each with a named blocker; all nine views'
// live bytes are on record in the capture fixture for the next increment):
//
//   - nest_editor + modal_nest_editor (set/all/reference_editor/
//     nest_editor.rb:10-20): ~17.5KB each, and the OPTIONS tab is the
//     blocker - _options.haml's ._templates.d-none block ALWAYS renders
//     nest_show_and_hide_select_template (nest_editor_options.rb:83-85) =
//     options_for_select(all_views), where all_views (card-mod-format
//     set/all/demo.rb:40-43) is ViewDefinition.views.slice(*self.class
//     .ancestors) - the per-card format-class ancestor slice of the LIVE
//     Ruby view registry: 191 sorted names for the probe card, recorded in
//     the fixture's helper_facts.all_views. The headless engine's flat
//     last-wins render table is a different universe; embedding the
//     captured list as a constant would fabricate deck-specific data.
//     Everything else in the view (header, nest-name field, the bootstrap
//     tab machinery, the view/options/rules panes with the blank-name
//     placeholder arms - the rules tab NEVER nests :nest_rules when the
//     snippet name is blank, nest_editor.rb:41-50 + 70-77) is reproducible.
//
//   - nest_content (set/all/reference_editor/nest_editor.rb:22-28, perms:
//     :create): the known branch is known_nest_content -> render_edit_inline
//     (nest_editor.rb:92-100) and the unknown branch create_form (:102-110)
//     - the card-mod-edit form machinery (card_form / edit_inline
//     rails-runtime) is unported. The capture pins the double-slot-wrap +
//     edit_inline form bytes on a known card.
//
//   - nest_image + modal_nest_image (set/all/reference_editor/nest_image.rb:
//     2-11): adapt_reference_editor_for_images (:32-37) eagerly nests view
//     :new_image on the autonamed image card in the upload tab
//     (nest_editor_tabs.rb:23-25) - create_form again - on top of the same
//     all_views blocker in the options tab.
//
//   - new_image (nest_image.rb:13-19): body is create_form - the
//     create-form machinery is not ported. Captured on a fresh-new image
//     card (5,992 bytes, fixture "new:image01#new_image").
//
//   - new_image_buttons (nest_image.rb:21-24): button_formgroup +
//     standard_save_button - the bootstrap button-form machinery is not
//     ported. NOTE the capture's arm: on a NON-EXISTENT card the render is
//     the UNKNOWN-view substitution (the view has no `unknown: true`, so
//     view/permission.rb's alter_unknown replaces it; the fixture carries
//     the unknown-link slot bytes) - the view body itself only fires on a
//     known card.
//
// FORMAT-NOTE (documented divergence): Ruby scopes both ported views to
// format :js. The mod loader's registration is format-agnostic - it walks
// every format block into the ONE live view table (mod-loader.ts flattens
// Object.values(file.formats), src/card/mod-loader.ts:198-204) - so the js
// views are reachable through the engine's single render surface. The
// manifest keys them under formats.js to keep the gem-tree shape.
//
// Also without a TS consumer (same treatment as the ace_editor port's
// basket ops): set/all/tinymce_editor.rb:1-2 - basket[:script_calls]
// ["setTinyMCEConfig"] = :tinymce_config and basket[:list_input_options]
// << "tinymce editor" (the JS asset pipeline + the admin input-type menu
// are outside the headless engine), and the format :html helper methods
// tinymce_config / tinymce_editor_input (lines 5-12) consumed by the
// input-type renderer defined in card-mod-format, which is not ported.
// config/admin.yml (editor configuration: :tiny_mce) and assets/script/* +
// public/** (the TinyMCE library + CoffeeScript glue) are likewise outside
// the headless engine. data/real.yml (the *tinyMCE JSON seed card) enters
// through the standard seed path, outside this stream.

import type { ViewFn, ViewContext } from "../../render/format.js";
import { DeckoName } from "../../name.js";
import { stripTags } from "../../render/nest-syntax.js";
import { h } from "../../render/slot-html.js";
import { modViewSlotWrap } from "../../render/views.js";
import { modSlotWrap } from "../mod-view-helpers.js";
import {
  buttonFormGroup,
  standardSaveButtonBody,
} from "../mod-form-substrate.js";
import { createFormDataShell } from "./card-mod-edit.js";
import type { DeckoModManifest } from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// lib/card/reference/nest_parser.rb - Card::Reference::NestParser
// ---------------------------------------------------------------------------

/** nest_parser.rb:6 NEST_OPTIONS - the option keys the parser extracts, in
 *  declaration order (the order extract_options iterates). */
export const NEST_OPTIONS = [
  "view",
  "title",
  "show",
  "hide",
  "wrap",
  "help",
  "variant",
  "size",
  "params",
] as const;

export type NestOptionKey = (typeof NEST_OPTIONS)[number];
/** One extracted [key, value] pair (nest_parser.rb's pair arrays). */
export type NestOptionPair = [string, string];

/** The parse error for inputs Ruby crashes on: a String that does not match
 *  the chunk's full_re (Chunk::Abstract#initialize does `@text = match[0]`
 *  where match = full_re.match(string) - nil[0] raises NoMethodError,
 *  card-1.110.0 lib/card/content/chunk/abstract.rb:34-39) and a comment
 *  nest, whose chunk carries no options (nil[:items] in
 *  nest_parser.rb#extract_item_options). */
export class NestSyntaxError extends Error {
  constructor(reason: string, raw: string) {
    super(`${reason}: ${JSON.stringify(raw)}`);
    this.name = "NestSyntaxError";
  }
}

/** One per-level flat option hash (nest.rb#interpret_piped_options's
 *  options_hash shape: the level's own key/value pairs, possibly carrying
 *  `items` for the next piped level). Values stay strings (view/options.rb:
 *  "option values are strings unless otherwise noted"); `undefined` marks
 *  absence - Ruby Hash#[] nil vs present-but-blank matters because
 *  applicable_options' truthiness check keeps Ruby-blank strings. The
 *  `items` slot carries the next level's hash (a shark-key `items:` STRING
 *  value would crash Ruby's extract_item_options - String#[](:items) -
 *  and is unreachable from the editor snippets this parser serves). */
interface OptionLevel {
  [key: string]: string | OptionLevel | undefined;
}

/**
 * Card::Reference::NestParser (lib/card/reference/nest_parser.rb) - extracts
 * the information the nest editor form needs from a nest syntax string.
 */
export class NestParser {
  /** nest_parser.rb:8,44 @raw. Mutable: field! mutates it (sub!). */
  raw: string;
  /** nest_parser.rb:31-32 field? (the leading-+ flag). */
  field: boolean;
  /** nest_parser.rb:8,54-57 name (the +-stripped form when field). */
  name: string | undefined;
  /** nest_parser.rb:8,63-64 view (top-level view option only). */
  view: string | undefined;
  /** nest_parser.rb:8,59-69 options - the extracted pairs in NEST_OPTIONS
   *  order; show/hide expand to one pair per list entry (viz_values). */
  options: NestOptionPair[];
  /** nest_parser.rb:9,79-88 item_options - one pair list per piped items
   *  level, outermost first. */
  itemOptions: NestOptionPair[][];

  private constructor(
    raw: string,
    field: boolean,
    name: string | undefined,
    view: string | undefined,
    options: NestOptionPair[],
    itemOptions: NestOptionPair[][],
  ) {
    this.raw = raw;
    this.field = field;
    this.name = name;
    this.view = view;
    this.options = options;
    this.itemOptions = itemOptions;
  }

  /** nest_parser.rb:12-16 self.new: a non-String input (params[:tm_snippet_raw]
   *  absent) yields the empty Nest struct: name "", field? true, options [],
   *  item_options [], raw "{{+ }}". */
  static defaultSnippet(): NestParser {
    return new NestParser("{{+ }}", true, "", undefined, [], []);
  }

  /** nest_parser.rb:18-24 self.new_image: the pre-built snippet the image
   *  editor starts from. options is Ruby's [%i[size medium]] - the pair
   *  value is the :medium symbol, stringified here the way every consumer
   *  (Rails tag helpers, HAML interpolation) stringifies it. */
  static newImage(name: string): NestParser {
    return new NestParser(
      `{{${name}|view: content; size: medium}}`,
      false,
      name,
      "content",
      [["size", "medium"]],
      [],
    );
  }

  /** nest_parser.rb:12-14 + 43-50 self.new for a String: parse through the
   *  nest chunk semantics (Chunk::Nest.new nest_string, nil, lines 46-49)
   *  - the chunk match/strip_tags/name split, then the local
   *  nest.rb-faithful option fold. */
  static parse(nestString: string): NestParser {
    const match = /^\{\{([^{}]*)\}\}/.exec(nestString); // nest.rb full_re, \A-anchored
    if (match === null) {
      throw new NestSyntaxError(
        "undefined method '[]' for nil: the nest chunk full_re does not match",
        nestString,
      );
    }
    // nest.rb#interpret: strip_tags, split at the FIRST "|"
    const inBrackets = stripTags(match[1] ?? "");
    const pipe = inBrackets.indexOf("|");
    const name = (pipe === -1 ? inBrackets : inBrackets.slice(0, pipe)).trim();
    if (name.startsWith("#")) {
      // nest.rb:20-22: comment nests set NO @options (and no @name), so
      // nest_parser.rb:48 `extract_item_options nest.options` reads
      // nil[:items] - Ruby raises NoMethodError; mirror the crash.
      throw new NestSyntaxError(
        "undefined method '[]' for nil: the comment-nest chunk has no options",
        nestString,
      );
    }
    const optLists = pipe === -1 ? undefined : inBrackets.slice(pipe + 1);
    return NestParser.buildFromParts(nestString, name, parseOptionChain(optLists));
  }

  /** The init_name/extract half of initialize (nest_parser.rb:47-49, 54-57),
   *  factored so defaultSnippet/newImage share the shape. */
  private static buildFromParts(
    raw: string,
    chunkName: string,
    top: OptionLevel,
  ): NestParser {
    // init_name: field = name.to_name.simple_relative?; the +-stripped name
    const fieldName = DeckoName.parse(chunkName);
    const field = fieldName.isSimpleRelative;
    const name = field ? chunkName.slice(1) : chunkName;
    const parser = new NestParser(raw, field, name, undefined, [], []);
    parser.options = parser.extractOptions(top, false);
    // extract_item_options: walk the piped items chain (lines 79-88). A
    // shark-key `items:` STRING value crashes Ruby's walk (String#[:items]
    // -> TypeError, nest_parser.rb:81-85 evaluates item_options[:items]
    // before pushing the level) - mirror the crash; editor snippets never
    // carry one.
    let cursor: string | OptionLevel | undefined = top.items;
    while (cursor !== undefined) {
      if (typeof cursor === "string") {
        throw new NestSyntaxError(
          "TypeError: no implicit conversion of Symbol into Integer (a string items: value)",
          raw,
        );
      }
      parser.itemOptions.push(parser.extractOptions(cursor, true));
      cursor = cursor.items;
    }
    return parser;
  }

  /** nest_parser.rb:75-77 applicable_options: NEST_OPTIONS keys present in
   *  the level hash, in NEST_OPTIONS declaration order. Presence is
   *  Hash#[]-nil semantics (undefined = absent), NOT blankness: Ruby's ""
   *  value is truthy and stays applicable. */
  private static applicableOptions(level: OptionLevel): NestOptionKey[] {
    return NEST_OPTIONS.filter((key) => level[key] !== undefined);
  }

  /** nest_parser.rb:71-73 viz_values: Card::View.normalize_list (card-1.110.0
   *  lib/card/view.rb:39-45 - String -> split(/[\s,]+/)) expands a
   *  comma/space list into one pair per entry. */
  private static vizValues(key: string, value: string): NestOptionPair[] {
    return value.split(/[\s,]+/).map((val) => [key, val]);
  }

  /** nest_parser.rb:59-69 extract_options: iterate applicable keys; show/
   *  hide expand via viz_values; a top-level view sets @view instead of a
   *  pair; everything else appends [key, value]. */
  private extractOptions(level: OptionLevel, itemOptions: boolean): NestOptionPair[] {
    const res: NestOptionPair[] = [];
    for (const key of NestParser.applicableOptions(level)) {
      const value = level[key] as string;
      if (key === "show" || key === "hide") {
        res.push(...NestParser.vizValues(key, value));
      } else if (key === "view" && !itemOptions) {
        this.view = value;
      } else {
        res.push([key, value]);
      }
    }
    return res;
  }

/** nest_parser.rb:26-28 empty?: raw empty, or the bare-empty-nest shape
 *  /\{\{+?\s*\|?\s*\}\}/. Ruby's `+?` is a LAZY QUANTIFIER on the literal
 *  brace (one-or-more additional "{"), not an optional "+". Verified
 *  against the target Ruby 3.3:
 *    "{{+ }}" => nil      "{{ }}" => match
 *    "{{foo}}" => nil     "{{{}}" => match
 *  i.e. the gem's own default snippet "{{+ }}" is NOT empty? by this
 *  regex, while the pipe-less "{{ }}" IS. The port carries the identical
 *  regex and therefore the identical verdicts. */
  isEmpty(): boolean {
    return this.raw === "" || /\{\{+?\s*\|?\s*\}\}/.test(this.raw);
  }

  /** nest_parser.rb:34-36 field!: rewrite the opening "{{" (optionally
   *  "+") to "{{+" in place and set field. */
  fieldBang(): void {
    this.raw = this.raw.replace(/\{\{\s*\+?/, "{{+");
    this.field = true;
  }

  /** nest_parser.rb:39-41 option_value: the first pair's value for the key
   *  (view is not among the pairs at the top level - it lives in @view). */
  optionValue(name: string): string | undefined {
    return this.options.find(([key]) => key === name)?.[1];
  }
}

// ---------------------------------------------------------------------------
// nest.rb#interpret_options - the piped option-level fold the parser walks
// ---------------------------------------------------------------------------

/** nest.rb:38-41 DEFAULT_OPTION: "a value without a key is interpreted as
 *  view". Card::View::Options.shark_keys (card-1.110.0 lib/card/view/
 *  options.rb:27-64) - the keys option_string_to_hash keeps; NOTE `:item`
 *  is NOT a shark key (Ruby checks `key == :item` BEFORE the shark filter,
 *  nest.rb#option_string_to_hash). This file ports the fold locally rather
 *  than delegating to render/nest-syntax.ts#parseNestOptions: the shared
 *  port tests the shark set BEFORE its item branch, so `item:` options
 *  (Ruby: options_hash[:items][:view] = value) are dropped there. The
 *  NestParser's Chunk::Nest contract keeps them. */
const SHARK_KEYS: ReadonlySet<string> = new Set([
  // shark
  "view", "nest_name", "nest_syntax", "wrap", "show", "hide", "unknown",
  // both
  "help", "structure", "title", "variant", "joint", "input_type", "type",
  "size", "header", "items", "cache", "edit", "separator", "filter", "params",
]);
const DEFAULT_OPTION = "view";

/** nest.rb#each_option: `attr_string.strip.split(";")`; Ruby assigns
 *  `value, key = pair.split(":", 2).reverse` (the part BEFORE the colon is
 *  the key; a colon-less pair defaults the key to view); blank string ->
 *  no pairs (blank?). */
function* eachOption(attrString: string | undefined): Generator<[string, string]> {
  if (attrString === undefined || attrString.trim() === "") return;
  for (const pair of attrString.trim().split(";")) {
    const colon = pair.indexOf(":");
    const value = (colon === -1 ? pair : pair.slice(colon + 1)).trim();
    const key = colon === -1 ? DEFAULT_OPTION : pair.slice(0, colon).trim();
    yield [key, value];
  }
}

/** nest.rb#option_string_to_hash: `key == :item` first (options_hash[:items]
 *  ||= {}; [:items][:view] = value), elsif shark_keys include? key. Other
 *  keys silently dropped. */
function optionStringToHash(listString: string | undefined, hash: OptionLevel): void {
  for (const [key, value] of eachOption(listString)) {
    if (key === "item") {
      const items = (hash.items ?? {}) as OptionLevel;
      items.view = value;
      hash.items = items;
    } else if (SHARK_KEYS.has(key)) {
      hash[key] = value;
    }
  }
}

/** nest.rb#interpret_piped_options: `items.nil? ? {} : { items: items }`
 *  plus this level's own pairs. */
function interpretPipedOptions(listString: string, items: OptionLevel | undefined): OptionLevel {
  const hash: OptionLevel = items === undefined ? {} : { items };
  optionStringToHash(listString, hash);
  return hash;
}

/** nest.rb#interpret_options (38-46): `@opt_lists.to_s.split("|").reverse`
 *  folded right-to-left, each level becoming the :items of the level before
 *  it; no opt_lists (no pipe) -> `nil || {}` -> {}. */
function interpretOptions(optLists: string | undefined): OptionLevel {
  if (optLists === undefined) return {};
  const rawOptions = optLists.split("|").reverse();
  let level: OptionLevel | undefined;
  for (const levelOptions of rawOptions) {
    level = interpretPipedOptions(levelOptions, level);
  }
  return level ?? {};
}

/** The chunk's option hash as the OptionLevel shape extract_options /
 *  extract_item_options walk (nest_parser.rb:48-49): per-level string
 *  values with `items` carrying the next piped level. */
function parseOptionChain(optLists: string | undefined): OptionLevel {
  return interpretOptions(optLists);
}

// ---------------------------------------------------------------------------
// set/all/reference_editor/link_editor/link_parser.rb - LinkParser
// ---------------------------------------------------------------------------

/**
 * LinkParser (set/all/reference_editor/link_editor/link_parser.rb) - extracts
 * the information the link editor form needs from a link syntax string. The
 * file's first line is `#! no set module` (helper file, registers nothing).
 */
export class LinkParser {
  /** link_parser.rb:7 raw. */
  readonly raw: string;
  /** link_parser.rb:27-29 field? (simple_relative? of the chunk name). */
  field: boolean;
  /** link_parser.rb:7 name (the +-stripped form when field; nil for
   *  explicit-resource links, where the chunk set no name). */
  name: string | undefined;
  /** link_parser.rb:8,18-20 options - the chunk's options hash
   *  (link.rb#options: {title: link_text || name.fully_stripped}). */
  readonly options: { title?: string };

  private constructor(
    raw: string,
    field: boolean,
    name: string | undefined,
    options: { title?: string },
  ) {
    this.raw = raw;
    this.field = field;
    this.name = name;
    this.options = options;
  }

  /** link_parser.rb:10-14 self.new: a non-String input yields the Link
   *  struct Link.new("", {}, "[[ ]]") - title and field? nil (falsy). */
  static defaultSnippet(): LinkParser {
    return new LinkParser("[[ ]]", false, "", {});
  }

  /** link_parser.rb:10-14 + 16-21 self.new for a String: parse through the
   *  link chunk semantics (Chunk::Link.new link_string, nil, line 18). */
  static parse(linkString: string): LinkParser {
    const match = /^\[\[([^\]]+)\]\]/.exec(linkString); // link.rb full_re, \A-anchored
    if (match === null) {
      throw new NestSyntaxError(
        "undefined method '[]' for nil: the link chunk full_re does not match",
        linkString,
      );
    }
    // link.rb#target_and_link_text + #divider_index: split at the first "|"
    // that is not inside a {{nest}}
    const rawSyntax = match[1] ?? "";
    let target: string | undefined = rawSyntax;
    let linkText: string | undefined;
    const masked = rawSyntax.replace(/\{\{[^}]*\}\}/g, (incl) => "x".repeat(incl.length));
    const pipe = masked.indexOf("|");
    if (pipe !== -1) {
      target = rawSyntax.slice(0, pipe);
      linkText = rawSyntax.slice(pipe + 1);
    }
    // link.rb#objectify: strip; nests inside would wrap a Content object,
    // whose #to_s is the same text this parser reads
    const strip = (s: string | undefined): string | undefined =>
      s === undefined ? undefined : s.trim();
    const targetStr = strip(target);
    // link.rb#interpret: `target.match? %r{^(/|https?:|mailto:)}` - the
    // ^ anchors the WHOLE alternation (an explicit resource target starts
    // with "/", "http(s):", or "mailto:"); a target merely CONTAINING
    // "http:" ("seehttp://x") is a name. The port groups the alternation
    // under the anchor to keep Ruby's precedence.
    const isExplicit =
      targetStr !== undefined && /^(?:\/|https?:|mailto:)/.test(targetStr);
    const chunkName = isExplicit ? undefined : targetStr;
    // link.rb#options: { title: link_text || @name.to_name.fully_stripped }
    // (nil.to_name is the empty name - cardname core_ext.rb:2-4)
    const title =
      strip(linkText) ?? DeckoName.parse(chunkName ?? "").fullyStripped.s;
    const parser = new LinkParser(linkString, false, chunkName, { title });
    // init_name (link_parser.rb:33-36)
    parser.field = DeckoName.parse(chunkName ?? "").isSimpleRelative;
    parser.name = parser.field ? (chunkName ?? "").slice(1) : chunkName;
    return parser;
  }

  /** link_parser.rb:23-25 title: options[:title]. */
  get title(): string | undefined {
    return this.options.title;
  }
}

// ---------------------------------------------------------------------------
// set/all/reference_editor/link_editor.rb - the :link_editor html views
// (ported 2026-09-29, the tinymce-views-port lane; oracle-pinned by
// fixtures/captured/tinymce-editor-views.json)
// ---------------------------------------------------------------------------

/** icon.rb:120-135 icon_tag :close: icon_lookup(:close) resolves the
 *  material library first ("close" per the ICON_BASKET material map) and
 *  universal_icon_tag prefixes the notranslate class - the captured bytes,
 *  identical shape to the bootstrap port's popoverIcon. */
const CLOSE_ICON = '<i class="notranslate material-icons">close</i>';

/** reference_editor.rb:10-16 modal_tm_snippet_editor?:
 *  `@tm_snippet_editor_mode != :overlay`. */
function isModalEditorMode(editorMode: "overlay" | "modal"): boolean {
  return editorMode !== "overlay";
}

/** The _link_editor.haml partial (link_editor.haml:1-19), byte-shaped from
 *  the capture. The snippet drives exactly the three reads the template
 *  makes - field? (the show/hide-prefix class), name (the link_name value;
 *  "" renders value="", nil would omit), title (the link_title value; the
 *  default snippet's nil omits the attribute) - and every one of them is
 *  the DEFAULT-struct arm here: link_snippet (link_editor.rb:28-30) feeds
 *  LinkParser.new params[:tm_snippet_raw], and the headless engine models
 *  no request params, so Ruby's nil -> default-Link struct arm is the only
 *  reachable one. Haml renders tag attributes single-quoted and SORTED
 *  (haml attribute_builder.rb:59 rendered.sort!); the Rails tag helpers
 *  inside `=` output keep double quotes and call order. */
function linkEditorPartial(snippet: LinkParser): string {
  // link_editor.haml:3 `class: [snippet.field? ? "show-prefix" : "hide-prefix"]`
  const prefixClass = snippet.field ? "show-prefix" : "hide-prefix";
  // link_editor.haml:6-9 text_field_tag "link_name", snippet.name, ...
  // - snippet.name is "" (present) for the default struct -> value=""
  const linkNameValue =
    snippet.name !== undefined ? ` value="${h(snippet.name)}"` : "";
  // link_editor.haml:12-13 check_box_tag :field, "field", snippet.field?,
  // class: "_link-field-toggle", id: "link-editor-field" - checked false
  // renders no checked attribute; the id comes from the explicit opt
  // (Rails sanitizes the NAME into the id when no :id is given - here the
  // opt wins, so id="link-editor-field", not id="field").
  const fieldChecked = snippet.field ? " checked=\"checked\"" : "";
  // link_editor.haml:19 text_field_tag "link_title", snippet.title, ... -
  // the default snippet's title is nil -> NO value attribute
  const linkTitleValue =
    snippet.title !== undefined ? ` value="${h(snippet.title)}"` : "";
  return (
    `<div class='row align-items-center mb-4 ms-1'>\n` +
    `<div class='col-9'>\n` +
    `<div class='${prefixClass} input-group'>\n` +
    `<div class='input-group-text text-muted _field-indicator'>\n` +
    `+\n` +
    `</div>\n` +
    `<input type="text" name="link_name" id="link_name"${linkNameValue} class="form-control _link-target _autocomplete" placeholder="URL or Card name" data-options-card="*all+by name" />\n` +
    `</div>\n` +
    `</div>\n` +
    `<div class='col-3'>\n` +
    `<input type="checkbox" name="field" id="link-editor-field" value="field"${fieldChecked} class="_link-field-toggle" />\n` +
    `<label class='form-check-label' for='link-editor-field'>field</label>\n` +
    `</div>\n` +
    `</div>\n` +
    `<div class='row align-items-center mb-4 ms-1 me-1'>\n` +
    `<div class='col-12'>\n` +
    `<label class='form-check-label' for='link_title'>Text to display</label>\n` +
    `<input type="text" name="link_title" id="link_title"${linkTitleValue} class="form-control _link-title" />\n` +
    `</div>\n` +
    `</div>\n`
  );
}

/** The reference_editor.haml chrome (title: "Link", editor: :link,
 *  ref_type: :link - link_editor.rb:14-20's method with editor_mode from
 *  the view). Byte-shaped from the capture:
 *  - Haml tag attributes single-quoted and sorted (the footer cancel
 *    anchor's `class data-bs-dismiss href` order is Haml's rendered.sort!);
 *  - link_to (card-mod-format set/all/links.rb) runs content_tag :a with
 *    the opts hash in insertion order: data-bs-dismiss, class, then href
 *    (the path: "#" entry resolves last);
 *  - button_tag (bootstrap form.rb:14-18) bootstrapify_button appends
 *    "btn btn-primary" AFTER the caller's class list (situation defaults
 *    to primary) and Rails adds name="button" type="submit" first;
 *  - apply_tm_snippet_data (reference_editor.rb:18-24) contributes
 *    "data-tinymce-id": tinymce_id (nil with params absent - dropped by
 *    the tag renderer) and, in the modal mode, data-bs-dismiss="modal"
 *    (:26-28); the apply_tm_snippet_var arms (:34-37) and
 *    apply_tm_data_index (:30-32) all key on absent params and skip.
 *  The trailing blank line before </div>\n</div> is the Haml source's own
 *  blank line between the partial call and .card-footer (Haml keeps it as
 *  a bare newline). */
function linkEditorChrome(_ctx: ViewContext, editorMode: "overlay" | "modal"): string {
  const modal = isModalEditorMode(editorMode);
  // link_editor.rb:28-30 - the absent-params arm (see linkEditorPartial)
  const snippet = LinkParser.defaultSnippet();
  const applyLabel = modal ? "Apply and Close" : "Apply";
  const cancelLabel = modal ? "Cancel" : "Close";
  const applyDismiss = modal ? ` data-bs-dismiss="modal"` : "";
  return (
    `<div class='_nest-editor'>\n` +
    `<div class='card-header d-flex'>\n` +
    `<h5 class='mt-1'>\n` +
    `Link\n` +
    `</h5>\n` +
    `<div class='ms-auto'>\n` +
    `<a data-bs-dismiss="${editorMode}" class="text-dark p-1 ms-1" href="#">${CLOSE_ICON}</a>\n` +
    `</div>\n` +
    `</div>\n` +
    `<div class='card-body'>\n` +
    `<div class='form'>\n` +
    linkEditorPartial(snippet) +
    `\n</div>\n` +
    `</div>\n` +
    `<div class='card-footer p-0'>\n` +
    `<div class='preview mx-1 my-1 form-control-feedback'>\n` +
    `Syntax preview\n` +
    `<input type="text" name="preview" id="preview" value="${h(snippet.raw)}" class="_link-preview w-100 text-muted" readonly="readonly" />\n` +
    `</div>\n` +
    `<hr class='mt-1 mb-1'>\n` +
    `<div class='form-group-inline d-flex justify-content-center py-3'>\n` +
    `<button name="button" type="submit"${applyDismiss} class="_link-apply btn-sm me-3 btn btn-primary">${applyLabel}</button>\n` +
    `<a class='border-light text-dark btn btn-sm btn-secondary' data-bs-dismiss='${editorMode}' href='#'>\n` +
    `${cancelLabel}\n` +
    `</a>\n` +
    `</div>\n` +
    `</div>\n` +
    `</div>\n`
  );
}

/** link_editor.rb:2-7 view :link_editor, cache: :never, unknown: true,
 *  wrap: { slot: { class: "_overlay d0-card-overlay card nodblclick" } } do
 *    link_editor :overlay
 *  end. The wrap hash rides the viewFn (the manifest schema's wrap field
 *  takes only the string forms): the slot wrapper (wrap.rb:11-14) emits the
 *  card-slot div with the config's class list appended after the base
 *  classes (views.ts modViewSlotWrap, wrap.rb:26-31 add_class). */
const linkEditorView: ViewFn = (ctx) =>
  modViewSlotWrap(
    ctx,
    "link_editor",
    "_overlay d0-card-overlay card nodblclick",
    linkEditorChrome(ctx, "overlay"),
  );

/** link_editor.rb:9-12 view :modal_link_editor, cache: :never,
 *  unknown: true, wrap: { slot: { class: "nodblclick" } } do
 *    modal_link_editor
 *  end, where the modal_link_editor METHOD (:22-26) is
 *  `wrap_with :modal { link_editor :modal }` - and wrap_with
 *  (card-mod-format set/all/html/wrap.rb:128-131) is content_tag(:modal):
 *  a LITERAL <modal> element. The registered `wrapper :modal`
 *  (card-mod-layout set/all/modal.rb:7-13) serves only the voo.wrap
 *  view-config path (lib/card/format/wrapper.rb:19-31 try
 *  "wrap_with_#{wrapper}") - measured live: the oracle renders
 *  <modal>...</modal> here while `render :modal` renders the
 *  modal_dialog haml. The bytes below are the gem's own behavior. */
const modalLinkEditorView: ViewFn = (ctx) =>
  modViewSlotWrap(
    ctx,
    "modal_link_editor",
    "nodblclick",
    `<modal>${linkEditorChrome(ctx, "modal")}</modal>`,
  );

// ---------------------------------------------------------------------------
// set/all/reference_editor/nest_image.rb - the format :js views
// ---------------------------------------------------------------------------

/** nest_image.rb:52-58 tinymce_id (format :js): the params-present branch
 *  interpolates the request's tinymce_id; the headless render engine models
 *  no request params, so the absent-params default branch is the only
 *  reachable one - Ruby's exact default bytes. */
function tinymceId(): string {
  return '$(".tinymce-textarea").attr("id")';
}

/** nest_image.rb:41-43 view :change_create_to_update, unknown: true: the
 *  single interpolated line (no trailing newline). */
const changeCreateToUpdateView: ViewFn = () =>
  `nest.changeCreateToUpdate(${tinymceId()});`;

/** nest_image.rb:45-50 view :open_nest_editor, unknown: true: the
 *  strip_heredoc'd JS - the heredoc body's 6-space indent is stripped, the
 *  trailing newline is heredoc content. `card.name.tag` is the rightmost
 *  name part (cardname parts.rb #tag - the shared DeckoName.tag). */
const openNestEditorView: ViewFn = (ctx) =>
  `tm = tinymce.get(${tinymceId()});\n` +
  `nest.insertNest(tm, "{{+${ctx.fmt.card.name.tag}|view: content; size: medium}}");\n`;

// ---------------------------------------------------------------------------
// set/self/tiny_mce.rb - the *tinyMCE setting's raw_help_text
// ---------------------------------------------------------------------------

/** tiny_mce.rb:2-6 - the <<-TEXT heredoc body, byte-exact: each line keeps
 *  its 4-space heredoc indent, the string ends with the newline before the
 *  terminator. [[link]] chunks are rendered by the help/popover layer when
 *  displayed (the source-form string is what raw_help_text returns). */
const TINYMCE_HELP_TEXT =
  "    Configure [[http://tinymce.com|TinyMCE]], Decko's default\n" +
  "    [[http://en.wikipedia.org/wiki/Wysiwyg|wysiwyg]] editor.\n" +
  "    [[http://decko.org/TinyMCE|more]]\n";

// ---------------------------------------------------------------------------
// set/all/reference_editor/nest_image.rb - :new_image_buttons (the
// form-substrate lane)
// ---------------------------------------------------------------------------

/** nest_image.rb:21-24 view :new_image_buttons:
 *  `button_formgroup do [standard_save_button(no_origin_update: true)] end`
 *  - the shared mod-form-substrate emitters: all/form.rb:38-40
 *  button_formgroup + all/form_buttons.rb:15-22 standard_save_button, whose
 *  no_origin_update: true caller attr rides the captured attr order
 *  (data-disable-with, no_origin_update, class + bootstrapify's btn
 *  btn-primary, data-cy - the reverse_merge mechanism documented in
 *  mod-form-substrate.ts). The view body only fires on a KNOWN card (the
 *  view has no unknown: true, so a new-card render is the unknown-view
 *  substitution); the oracle pin renders it on a real Image card. */
const newImageButtonsView: ViewFn = (ctx) =>
  buttonFormGroup(
    ctx,
    standardSaveButtonBody(ctx, [["no_origin_update", "true"]]) ?? "",
  );

// ---------------------------------------------------------------------------
// mod-completion-100 lane (2026-10-03): the census chrome views
// :nest_editor/:modal_nest_editor/:nest_image/:modal_nest_image plus the
// :nest_content/:new_image dispatches - PORTED through the harness with the
// LIVE-VERIFIED static-ruby oracle
// (ruby-oracles/card-mod-tinymce_editor/reference-editor-chrome-views.rb:
// the gems' verbatim source + real Haml 5.2.2 + real ActionView 7.2.4 + real
// cardname + real Card::Tab under ruby.exe 3.3.12; the params-ABSENT arms are
// byte-exact substrings of the prior lane's live capture
// fixtures/captured/tinymce-editor-views.json, no_write_proof actions
// 4929 -> 4929). The probe: card-mod-tinymce-editor-harness-probe.test.ts.
//
// THE PARAMS SEAM (named in the lane receipt): the chrome's snippet state is
// request-param driven (tm_snippet_raw / tinymce_id / tm_snippet_start /
// index). The headless render engine models no request params (the
// documented convention), so the REGISTERED views below render the
// absent-params arm - NestParser.defaultSnippet() - the arm the live capture
// pinned. The SEEDED arms are the composition cores
// (tinymceProbeSurface.nestEditorChrome with an explicit params record):
// the oracle feeds the gem's own js-insert example shape
// (nest_image.rb:47) and pins the pass-through contracts; the probe replays
// them through these same functions with the seeded record.
// ---------------------------------------------------------------------------

/** The _nest_editor.haml tab select list (card-mod-format set/all/demo.rb:
 *  14-16 verbatim): the fixed literal the basics tab's view select offers. */
const NEST_VIEW_LIST = [
  "content",
  "titled",
  "labeled",
  "bar",
  "box",
  "open",
  "closed",
] as const;

/** all_views (card-mod-format set/all/demo.rb:40-42): the union of the view
 *  names declared across the html format class's ancestor format modules -
 *  the LIVE Ruby view registry read, uniq, sorted. THE RECORDED FACT: the
 *  prior lane's live capture helper_facts.all_views (191 names,
 *  no_write_proof actions 4929 -> 4929), the same recorded-capture-constant
 *  basis as head-views.ts's REMOTE_STYLE_TAG; the oracle cross-checks the
 *  list against helper_facts.all_views_count before every capture. The
 *  show/hide template select (_options.haml's ._templates.d-none block,
 *  nest_editor_options.rb:83-85) offers exactly these. */
const NEST_ALL_VIEWS: readonly string[] = [
  "accordion_bar", "act", "act_legend", "acted_at", "action_expanded", "action_summary",
  "add_autocomplete_item", "bad_address", "bar", "bar_body", "bar_bottom", "bar_left",
  "bar_menu", "bar_middle", "bar_right", "blank", "board", "board_act", "board_link",
  "board_type_formgroup", "box", "box_bottom", "box_middle", "box_top", "card_select",
  "cardboard", "carousel", "change", "close_modal_link", "closed", "closed_bar",
  "closed_content", "codename", "comment_box", "compact_missing", "conflict",
  "conflict_tracker", "content", "content_formgroup", "content_formgroups",
  "content_panel", "content_with_title", "core", "count", "created_at",
  "creator_credit", "debug_server_error", "demo", "denial", "draft_legend", "edit",
  "edit_button", "edit_buttons", "edit_form", "edit_in_form", "edit_inline",
  "edit_inline_buttons", "edit_link", "edit_name", "edit_name_row", "edit_nests",
  "edit_row", "edit_rules", "edit_structure", "edit_type", "edit_type_form",
  "edit_type_row", "email_page", "engage_tab", "errors", "expanded_bar",
  "favicon_tag", "flash", "follow_button", "follow_section", "followed",
  "follower", "full_bar", "full_page_link", "goto_autocomplete_item", "guide",
  "guide_tab", "head", "header", "header_title", "help", "help_link", "help_text",
  "hidden_content_field", "history", "history_tab", "icons", "id", "id_url",
  "input", "javascript_include_tag", "javascript_tags", "just_deleted", "key",
  "label", "labeled", "labeled_content", "last_action", "last_action_verb",
  "lead", "link", "link_editor", "linkname", "list_of_changes", "menu",
  "menu_block", "meta_tags", "mini_bar", "mini_unknown", "modal", "modal_footer",
  "modal_link", "modal_link_editor", "modal_menu", "modal_nest_editor",
  "modal_nest_image", "modal_title", "name", "name_form", "name_formgroup",
  "nav_item", "nav_link", "nav_link_in_dropdown", "navbar_links", "nest_content",
  "nest_editor", "nest_image", "new", "new_buttons", "new_fields", "new_image",
  "new_image_buttons", "new_in_modal", "new_in_modal_buttons",
  "new_type_formgroup", "not_found", "one_line_content", "open", "open_bar",
  "open_content", "overlay_guide", "overlay_header", "overlay_help_link",
  "overlay_menu", "overlay_title", "page_title", "page_title_tag", "pills",
  "pills_static", "pop_out_modal_link", "raw", "raw_one_line_content",
  "read_form", "read_formgroup", "related_tab", "rss_links", "rules_tab",
  "script_calls", "script_variables", "server_error", "short_content",
  "simple_new", "smart_label", "stylesheet_tags", "subedit_notice", "subedits",
  "tabs", "tabs_static", "template_nest", "text_without_nests", "title",
  "title_link", "title_no_link", "titled", "titled_content", "type",
  "type_formgroup", "type_info", "unfollow_url", "universal_edit_button",
  "unknown", "updated_at", "updated_by", "url", "url_link", "view_list",
];

/** The material icon basket (card-mod-bootstrap icon.rb:1-11): the keys the
 *  chrome reads - close (the header dismiss + the options-row delete), help
 *  (the help_link popovers). icon_libraries = [:material]
 *  (lib/card/mod/bootstrap.rb:2). */
const MATERIAL_ICONS: Record<string, string> = {
  close: "close",
  help: "help",
  remove: "close",
};

function materialIcon(key: string): string {
  return `<i class="notranslate material-icons">${MATERIAL_ICONS[key] ?? key}</i>`;
}

/** The chrome composition context: the card facts the templates read plus
 *  the two ENGINE SEAMS. The id counter drives the option-select names and
 *  the tab ids in Ruby's evaluation order (the tab CONTENT renders before
 *  the tab BUTTONS - the pinned counter sequence). */
export interface ChromeContext {
  /** the card's name (data-left-name). */
  cardName: string;
  /** the card's safe key (the unique_id prefix + the tab ids). */
  cardKey: string;
  /** left_type_for_nest_editor_set_selection (nest_editor.rb:2-4 = the
   *  card's type name). */
  leftType: string;
  /** id_counter (card core format/content.rb:50-53) - fresh per format. */
  idCounter: { n: number };
  /** THE NEST SEAM: the deep engine render (the rules tab's nest_rules
   *  view, the image tabs' new_image view). */
  nest: (target: string, view: string) => string;
  /** THE SLOT-WRAP SEAM (image_preview_tab's wrap true): the engine's slot
   *  wrapper around the nested core view - the live capture randomizes the
   *  wrapper's ids. */
  wrap: () => string;
}

/** Rails content_tag emission (the `=` helper outputs): double-quoted,
 *  insertion-ordered attributes; nil values drop. */
function railsTag(
  tag: string,
  attrs: Array<[string, string | undefined]>,
  content: string,
): string {
  const rendered = attrs
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${v}"`);
  return `<${tag}${rendered.join("")}>${content}</${tag}>`;
}

/** Rails text_field_tag (form_tag_helper.rb:255-271): type, name, id
 *  (the name verbatim), value (nil omits the attribute), then the caller
 *  opts in their hash order. */
function railsTextFieldTag(
  name: string,
  value: string | undefined,
  opts: Array<[string, string | undefined]>,
): string {
  const attrs: Array<[string, string | undefined]> = [
    ["type", "text"],
    ["name", name],
    ["id", name],
  ];
  if (value !== undefined) attrs.push(["value", value]);
  attrs.push(...opts);
  return railsTag("input", attrs, "").replace("></input>", " />");
}

/** Rails select_tag (form_tag_helper.rb:830-845): name, id, then the caller
 *  opts; options_for_select's body joins "\n", blank first when the list
 *  leads nil, selected="selected" on the match (selected nil = none). */
function railsSelectTag(
  name: string,
  optionList: ReadonlyArray<string | undefined>,
  opts: Array<[string, string | undefined]>,
  selected?: string | undefined,
): string {
  const attrs: Array<[string, string | undefined]> = [
    ["name", name],
    ["id", name],
    ...opts,
  ];
  const attrStr = attrs
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join("");
  const options = optionList
    .map((v) =>
      v === undefined
        ? `<option value=""></option>`
        : `<option${v === selected ? ` selected="selected"` : ""} value="${h(v)}">${h(v)}</option>`,
    )
    .join("\n");
  return `<select${attrStr}>${options}</select>`;
}

/** decko help_link (card-mod-format menu.rb:97-100) + bootstrap popover_opts
 *  (helper.rb:46-58) + link_to (links.rb:101-106, href appended LAST): the
 *  pinned attr order - tabindex, data-bs-toggle, data-bs-trigger,
 *  data-bs-content, data-bs-placement, class, data-bs-title, href. */
function helpLink(text: string, title: string): string {
  const cls = "help-link ps-1 _popover_link _card-menu-popover";
  return (
    `<a tabindex="0" data-bs-toggle="popover" data-bs-trigger="hover focus"` +
    ` data-bs-content="${h(text)}" data-bs-placement="left" class="${cls}"` +
    ` data-bs-title="${h(title)}" href="#">${materialIcon("help")}</a>`
  );
}

/** decko button_tag (bootstrap form.rb:14-17 bootstrapify_button appends
 *  "btn btn-#{situation}" AFTER the caller class; Rails button_tag leads
 *  name="button" type="submit") over apply_tm_snippet_data's attrs
 *  (reference_editor.rb:18-37 write order: data-tinymce-id, the snippet
 *  vars - start, size - then data-index, the modal data-bs-dismiss, class
 *  from the merge LAST). */
function applyButton(
  applyOpts: Array<[string, string | undefined]>,
  refType: string,
  modal: boolean,
): string {
  const label = modal ? "Apply and Close" : "Apply";
  const attrs: Array<[string, string | undefined]> = [
    ["name", "button"],
    ["type", "submit"],
    ...applyOpts,
  ];
  if (modal) attrs.push(["data-bs-dismiss", "modal"]);
  attrs.push(["class", `_${refType}-apply btn-sm me-3 btn btn-primary`]);
  return `<button${attrs
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join("")}>${label}</button>`;
}

/** reference_editor.haml (verbatim template): the chrome both editors share.
 *  Haml renders the static tags single-quoted SORTED; the `=` helper outputs
 *  keep double quotes and Rails insertion order. The blank line before the
 *  footer is the template's own blank line. */
function referenceEditorChrome(
  args: {
    title: string;
    editorMode: "overlay" | "modal";
    refType: string;
    partial: string;
    applyOpts: Array<[string, string | undefined]>;
    snippetRaw: string;
    /** the closes between the partial and the footer (the haml blank-line
     *  structure the capture pins: the nest partial closes its own groups,
     *  one close follows; the image tabs are bare content, two follow). */
    closesAfterPartial: 1 | 2;
  },
): string {
  const modal = args.editorMode !== "overlay";
  const out: string[] = [];
  out.push(`<div class='_nest-editor'>`);
  out.push(`<div class='card-header d-flex'>`);
  out.push(`<h5 class='mt-1'>`);
  out.push(h(args.title));
  out.push(`</h5>`);
  out.push(`<div class='ms-auto'>`);
  out.push(
    `<a data-bs-dismiss="${args.editorMode}" class="text-dark p-1 ms-1" href="#">${materialIcon("close")}</a>`,
  );
  out.push(`</div>`);
  out.push(`</div>`);
  out.push(`<div class='card-body'>`);
  out.push(`<div class='form'>`);
  out.push(args.partial);
  for (let i = 0; i < args.closesAfterPartial; i += 1) out.push(`</div>`);
  out.push(`<div class='card-footer p-0'>`);
  out.push(`<div class='preview mx-1 my-1 form-control-feedback'>`);
  out.push(`Syntax preview`);
  out.push(
    railsTextFieldTag("preview", args.snippetRaw, [
      ["class", `_${args.refType}-preview w-100 text-muted`],
      ["readonly", "readonly"],
    ]),
  );
  out.push(`</div>`);
  out.push(`<hr class='mt-1 mb-1'>`);
  out.push(`<div class='form-group-inline d-flex justify-content-center py-3'>`);
  out.push(applyButton(args.applyOpts, args.refType, modal));
  out.push(
    `<a class='border-light text-dark btn btn-sm btn-secondary' data-bs-dismiss='${args.editorMode}' href='#'>`,
  );
  out.push(modal ? "Cancel" : "Close");
  out.push(`</a>`);
  out.push(`</div>`);
  out.push(`</div>`);
  out.push(`</div>`);
  return out.join("\n") + "\n";
}

/** nest_editor_options.rb:3-5 + :8-19 nest_option_name_select: select over
 *  "" + NEST_OPTIONS (view dropped unless include_view_option), class
 *  "form-control _nest-option-name" + " _new-row" unless selected +
 *  " _no-select2" if template; the name carries unique_id; id nil. */
function nestOptionNameSelect(
  ctx: ChromeContext,
  opts: {
    selected?: string;
    level: number;
    includeViewOption: boolean;
    template: boolean;
    snippet: NestParser;
  },
): string {
  let cls = "form-control _nest-option-name";
  if (opts.selected === undefined) cls += " _new-row";
  if (opts.template) cls += " _no-select2";
  const uid = `${ctx.cardKey}-${(ctx.idCounter.n += 1)}`;
  const names = [
    "",
    ...(opts.includeViewOption ? ["view" as const] : []),
    ...NEST_OPTION_NAMES,
  ];
  // nest_option_name_disabled (nest_editor_options.rb:33-51): the disabled
  // candidates are the snippet's OWN option keys at this level (level 0 ->
  // options, deeper -> item_options[level-1], else []); the selected name is
  // removed (Ruby's pairs carry the keys as the same objects the select
  // compares, so the delete hits). The remaining candidates disable their
  // options (options_for_select's disabled list).
  const disabled = (opts.level === 0
    ? opts.snippet.options
    : (opts.snippet.itemOptions[opts.level - 1] ?? [])
  ).map(([k]) => k).filter((k) => k !== opts.selected);
  const attrStr = ` name="nest_option_name_${uid}" id="nest_option_name_${uid}"`.replace(
    / id="[^"]*"/,
    "",
  );
  const options = names
    .map((v) =>
      v === ""
        ? `<option value=""></option>`
        : `<option${v === opts.selected ? ` selected="selected"` : ""}${disabled.includes(v) ? ` disabled="disabled"` : ""} value="${v}">${v}</option>`,
    )
    .join("\n");
  return `<select${attrStr} class="${cls}" data-placeholder="Select option">${options}</select>`;
}

/** nest_parser.rb:6 NEST_OPTIONS minus :view (the name-select list order). */
const NEST_OPTION_NAMES = [
  "title",
  "show",
  "hide",
  "wrap",
  "help",
  "variant",
  "size",
  "params",
] as const;

/** nest_editor_options.rb:71-75 nest_option_value_select: text :value,
 *  class "_nest-option-value form-control", disabled when no value, id nil. */
function nestOptionValueSelect(value: string | undefined): string {
  const attrs: Array<[string, string | undefined]> = [
    ["type", "text"],
    ["name", "value"],
    ["value", value],
    ["class", "_nest-option-value form-control"],
    ["disabled", value ? undefined : "disabled"],
  ];
  return `<input${attrs
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join("")} />`;
}

/** _options_select_row.haml (verbatim): the option row; the array-class
 *  values lead ([template && "_template"], [!name && "d-none"]). */
function optionsSelectRow(
  ctx: ChromeContext,
  opts: {
    template: boolean;
    name?: string;
    level: number;
    value?: string;
    viewSelectable: boolean;
    snippet: NestParser;
  },
): string {
  const rowCls = `${opts.template ? "_template " : ""}row _nest-option-row`;
  const btnCls = `${opts.name === undefined ? "d-none " : ""}btn btn-secondary input-group-text p-1 _nest-delete-option`;
  const out: string[] = [];
  out.push(`<div class='${rowCls}'>`);
  out.push(`<div class='col-6'>`);
  out.push(`<div class='input-group mb-2 me-2 d-flex flex-nowrap'>`);
  out.push(`<button class='${btnCls}' type='button'>`);
  out.push(`<small class='text-muted'>`);
  out.push(materialIcon("remove"));
  out.push(`</small>`);
  out.push(`</button>`);
  out.push(
    nestOptionNameSelect(ctx, {
      selected: opts.name,
      level: opts.level,
      includeViewOption: opts.viewSelectable,
      template: opts.template,
      snippet: opts.snippet,
    }),
  );
  out.push(`</div>`);
  out.push(`</div>`);
  out.push(`<div class='col-6 _nest-option-value-col'>`);
  out.push(nestOptionValueSelect(opts.value));
  out.push(`</div>`);
  out.push(`</div>`);
return out.join("\n");
}

/** _options_select.haml (verbatim): the data rows, the blank row, the
 *  template row when !template; the haml whitespace keeps one blank line
 *  after the last row (before the partial's own close). */
function optionsSelect(
  ctx: ChromeContext,
  opts: {
    template: boolean;
    level: number;
    data: ReadonlyArray<readonly [string, string]>;
    viewSelectable: boolean;
    snippet: NestParser;
  },
): string {
  const rows: string[] = [];
  for (const [name, value] of opts.data) {
    rows.push(
      optionsSelectRow(ctx, {
        template: false,
        name,
        level: opts.level,
        value,
        viewSelectable: opts.viewSelectable,
        snippet: opts.snippet,
      }),
    );
  }
  rows.push(
    optionsSelectRow(ctx, {
      template: opts.template,
      level: opts.level,
      viewSelectable: opts.viewSelectable,
      snippet: opts.snippet,
    }),
  );
  if (!opts.template) {
    rows.push(
      optionsSelectRow(ctx, {
        template: true,
        level: opts.level,
        viewSelectable: opts.viewSelectable,
        snippet: opts.snippet,
      }),
    );
  }
  return `<div class='${opts.template ? "_template " : ""}_options-select'>\n${rows.join("\n\n")}\n\n</div>`;
}

/** nest_editor_options.rb:77-79 size_select_options (default :medium). */
function sizeSelectOptions(selected = "medium"): string {
  return railsSelectTag(
    "size",
    ["icon", "small", "medium", "large", "original"],
    [],
    selected,
  );
}

/** nest_editor_options.rb:87-103: the ._templates.d-none block's four
 *  templates (default value; size; view over view_list; show+hide over
 *  all_views - the recorded registry fact). */
function templatesBlock(): string {
  const out: string[] = [];
  out.push(`<div class='_templates d-none'>`);
  out.push(
    `<input type="text" name="value" class="_nest-option-template-default _nest-option-value form-control" />`,
  );
  out.push(
    railsTag(
      "div",
      [["class", "_nest-option-template-size"]],
      railsSelectTag("size", ["icon", "small", "medium", "large", "original"], [
        ["class", "_no-select2 _nest-option-value form-control"],
      ], "medium"),
    ),
  );
  out.push(
    railsTag(
      "div",
      [["class", "_nest-option-template-view"]],
      railsSelectTag("size", [...NEST_VIEW_LIST], [
        ["class", "_no-select2 _nest-option-value form-control"],
      ]),
    ),
  );
  out.push(
    railsTag(
      "div",
      [["class", "_nest-option-template-show _nest-option-template-hide"]],
      railsSelectTag("size", [...NEST_ALL_VIEWS], [
        ["class", "_no-select2 _nest-option-value form-control"],
      ]),
    ),
  );
  out.push(`</div>`);
  return out.join("\n");
}

/** _options.haml (verbatim): the options containers over the snippet's
 *  options + item options + the template container + the templates block;
 *  the container closes carry the haml blank lines the capture pins. */
function optionsPartial(ctx: ChromeContext, snippet: NestParser): string {
  const out: string[] = [];
  out.push(`<div class='_nest-options'>`);
  out.push(`<div class='options-container'>`);
  out.push(`<label>Options</label>`);
  out.push(
    optionsSelect(ctx, {
      template: false,
      level: 0,
      data: snippet.options,
      viewSelectable: false,
      snippet,
    }),
  );
  out.push("");
  out.push(`</div>`);
  snippet.itemOptions.forEach((options, i) => {
    out.push(`<div class='options-container _configure-items'>`);
    out.push(`<label>`);
    out.push(cap(`${"sub".repeat(i)} item options`));
    out.push(`</label>`);
    out.push(
      optionsSelect(ctx, {
        template: false,
        level: i + 1,
        data: options,
        viewSelectable: true,
        snippet,
      }),
    );
    out.push("");
    out.push(`</div>`);
  });
  out.push(`<div class='options-container _configure-items'>`);
  out.push(
    `<button name="button" type="submit" class="_configure-items-button btn-sm btn btn-secondary">Add ${"sub".repeat(snippet.itemOptions.length)}item options</button>`,
  );
  out.push(
    optionsSelect(ctx, {
      template: true,
      level: snippet.itemOptions.length + 1,
      data: [],
      viewSelectable: true,
      snippet,
    }),
  );
  out.push("");
  out.push(`</div>`);
  out.push(templatesBlock());
  out.push(`</div>`);
  return out.join("\n") + "\n";
}

/** Ruby String#capitalize (first char upcase, REST downcase). */
function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1).toLowerCase();
}

/** _image_find.haml (verbatim; the commented autocomplete line keeps its
 *  blank line): the image name select group. */
function imageFindPartial(): string {
  const out: string[] = [];
  out.push(`<div class='form-group'>`);
  out.push(`<label for='nest_name'>Name</label>`);
  // t(:tinymce_editor_image_nest_editor_name_help_text/_title): "Hello"/"World"
  out.push(helpLink("Hello", "World"));
  out.push("");
  out.push(
    `<select name="image-name-select" id="image-name-select" class="_image-card-select _image-name _no-select2-init" data-dropdown-parent="true"></select>`,
  );
  out.push(`</div>`);
  return out.join("\n") + "\n";
}

/** nest_editor_options.rb:61-65 image_view_select + :67-69
 *  image_size_select (the seeded image snippet's view "content" selects). */
function imageViewSelect(selected: string | undefined): string {
  return railsSelectTag(
    "view",
    [undefined, ...NEST_VIEW_LIST],
    [["class", "tags _image-view-select"], ["data-placeholder", "Select view"]],
    selected,
  );
}

function imageSizeSelect(): string {
  return railsSelectTag(
    "size",
    ["icon", "small", "medium", "large", "original"],
    [["class", "_image-size-select"]],
    "medium",
  );
}

/** _image_options.haml (verbatim): the View + Size groups. */
function imageOptionsPartial(snippet: NestParser): string {
  const out: string[] = [];
  out.push(`<div class='form-group'>`);
  out.push(`<label>View</label>`);
  // t(:tinymce_editor_image_nest_editor_view_help_text/_title): "World"/"Hello"
  out.push(helpLink("World", "Hello"));
  out.push(imageViewSelect(snippet.view));
  out.push(`</div>`);
  out.push(`<div class='form-group'>`);
  out.push(`<label>Size</label>`);
  out.push(imageSizeSelect());
  out.push(`</div>`);
  return out.join("\n") + "\n";
}

/** name.to_name.safe_key (cardname generate_key: underscore + singularize)
 *  for the fixed tab-name set the two editors use. */
function tabSafeKey(name: string): string {
  const table: Record<string, string> = { options: "option", rules: "rule" };
  return table[name] ?? name;
}

/** Card::Tab (card-mod-tabs lib/tab.rb) + tab_panel.haml: the tab machinery.
 *  Tab ids "tab-#{unique_id}-#{safe_key}": the CONTENT renders before the
 *  BUTTONS (the tab hash evaluates first), pinning the counter order. The
 *  active tab: the requested name when among the keys, else the FIRST key. */
function tabsPanel(
  ctx: ChromeContext,
  tabHash: ReadonlyArray<readonly [string, string]>,
  activeName: string | undefined,
  args: { tabType: string; panelClass?: string; navClasses?: string },
): string {
  const entries = tabHash.map(([name, content]) => ({
    name,
    content,
    id: `tab-${ctx.cardKey}-${(ctx.idCounter.n += 1)}-${tabSafeKey(name)}`,
  }));
  const active = entries.some((e) => e.name === activeName)
    ? (activeName as string)
    : entries[0].name;
  const buttons = entries
    .map((e) =>
      railsTag(
        "li",
        [
          ["role", "presentation"],
          // Card::Tab#tab_button: the li's class comes from the wrap_with args
          // (no active marker - button_attrib feeds the <a> only)
          ["class", `nav-item tab-li-${tabSafeKey(e.name)}`],
        ],
        `<a class="${e.name === active ? "active " : ""}nav-link" role="tab" data-bs-toggle="tab" data-tab-name="${e.name}" href="#${e.id}">${e.name}</a>`,
      ),
    )
    .join("\n");
  const panes = entries
    .map((e) =>
      railsTag(
        "div",
        [
          ["role", "tabpanel"],
          ["id", e.id],
          ["class", `tab-pane tab-pane-${e.name}${e.name === active ? " active" : ""}`],
        ],
        e.content,
      ),
    )
    .join("\n");
  const panelAttrs = args.panelClass
    ? ` class='tabbable tab-panel ${args.panelClass}' role='tabpanel'`
    : ` class='tabbable tab-panel' role='tabpanel'`;
  return (
    `<div${panelAttrs}>\n` +
    `<ul class='${args.navClasses ?? "nav"} nav-${args.tabType}' role='tablist'>\n` +
    `${buttons}\n</ul>\n` +
    `<div class='tab-content'>\n` +
    `${panes}\n</div>\n` +
    `</div>`
  );
}

/** nest_editor_tabs.rb:7-18 nest_editor_tabs + :60-77 (the blank-name arms
 *  of name_dependent_slot: the visible alert + the placeholder div; the
 *  named arm yields the nest_rules SEAM with no wrapper). */
function nestEditorTabs(ctx: ChromeContext, snippet: NestParser): string {
  const rulesTab =
    snippet.name === ""
      ? `<div class="mb-0 _empty-nest-name-alert  alert alert-warning" role="alert">nest name required</div>\n<div class="card-slot"></div>`
      : `<div class="mb-0 _empty-nest-name-alert d-none alert alert-warning" role="alert">nest name required</div>\n${ctx.nest(`${ctx.leftType}+${snippet.name}+type_plus_right`, "nest_rules")}`;
  const tabHash: ReadonlyArray<readonly [string, string]> = [
    ["view", basicsPartial(ctx, snippet)],
    ["options", optionsPartial(ctx, snippet)],
    ["rules", rulesTab],
  ];
  return tabsPanel(ctx, tabHash, "basics", {
    tabType: "tabs",
    panelClass: "nest-options",
  });
}

/** nest_editor_options.rb:56-58 nest_view_select (the basics tab). */
function nestViewSelect(selected: string | undefined): string {
  return railsSelectTag(
    "view",
    [undefined, ...NEST_VIEW_LIST],
    [
      ["class", "tags _view-select _nest-option-value"],
      ["data-placeholder", "Select view"],
    ],
    selected,
  );
}

/** _basics.haml (verbatim): the view select group. */
function basicsPartial(_ctx: ChromeContext, snippet: NestParser): string {
  const out: string[] = [];
  out.push(`<div class='form-group'>`);
  out.push(`<label>View</label>`);
  // t(:tinymce_editor_nest_editor_view_help_text/_title): "World" / "Hello"
  out.push(helpLink("World", "Hello"));
  out.push(nestViewSelect(snippet.view));
  out.push(`</div>`);
  return out.join("\n") + "\n";
}

/** The _nest_editor.haml partial (verbatim): the card name field group +
 *  the tabs; the field?'s array class leads. The mt-4/form-group closes
 *  carry the haml blank lines the capture pins. */
function nestEditorPartial(ctx: ChromeContext, snippet: NestParser): string {
  const prefixClass = snippet.field ? "show-prefix" : "hide-prefix";
  const out: string[] = [];
  out.push(`<div class='form-group'>`);
  out.push(`<label for='nest_name'>Card</label>`);
  // t(:tinymce_editor_nest_editor_card_help_text/_title) - the gem's own
  // en.yml: "Hello" / "Title"
  out.push(helpLink("Hello", "Title"));
  out.push(`<div class='${prefixClass} input-group'>`);
  out.push(`<div class='input-group-text text-muted _field-indicator'>`);
  out.push(`+`);
  out.push(`</div>`);
  out.push(
    railsTextFieldTag("nest_name", snippet.name ?? "", [
      ["class", "form-control _nest-name _autocomplete "],
      ["data-left-name", ctx.cardName],
      ["data-left-type", ctx.leftType],
      ["data-options-card", "*all+by name"],
    ]),
  );
  out.push(`<div class='input-group-text btn btn-secondary _nest-field-toggle'>`);
  out.push(`+`);
  out.push(`</div>`);
  out.push(`</div>`);
  out.push(`</div>`);
  out.push(`<div class='mt-4'>`);
  out.push(nestEditorTabs(ctx, snippet));
  out.push("");
  out.push(`</div>`);
  out.push("");
  out.push(`</div>`);
  return out.join("\n");
}

/** reference_editor.rb:18-37 apply_tm_snippet_data over the params record:
 *  data-tinymce-id always (nil drops), the snippet vars (start from
 *  tm_snippet_start, size from raw.size) when present, data-index when
 *  present. The modal data-bs-dismiss appends LAST in the button builder. */
function tmApplyOpts(
  params: Record<string, string | undefined>,
  snippet: NestParser,
): Array<[string, string | undefined]> {
  const opts: Array<[string, string | undefined]> = [
    ["data-tinymce-id", params.tinymce_id],
  ];
  if (params.tm_snippet_start !== undefined) {
    opts.push(["data-tm-snippet-start", params.tm_snippet_start]);
  }
  // apply_tm_snippet_var's guard reads the PARAM (tm_param :raw), not the
  // computed size - the size var only writes when tm_snippet_raw is present
  if (params.tm_snippet_raw !== undefined) {
    opts.push(["data-tm-snippet-size", String(snippet.raw.length)]);
  }
  return opts;
}

/** The snippet the view renders: NestParser.new params[:tm_snippet_raw]
 *  (nest_editor.rb:55-57) - the String arm for a seeded param, the default
 *  Nest struct for the absent arm. */
function snippetFromParams(
  params: Record<string, string | undefined>,
): NestParser {
  const raw = params.tm_snippet_raw;
  return typeof raw === "string"
    ? NestParser.parse(raw)
    : NestParser.defaultSnippet();
}

/** view :nest_editor (nest_editor.rb:10-16 + 29-38) + :modal_nest_editor
 *  (:17-20 + 60-63): the editor-mode arg picks the footer copy and the
 *  modal wrapper (modal_nest_editor = wrap_with :modal = content_tag(:modal),
 *  wrap.rb:128-131 - a LITERAL <modal> element, the basis the committed
 *  link editors pin). */
export function nestEditorChrome(
  ctx: ChromeContext,
  editorMode: "overlay" | "modal",
  params: Record<string, string | undefined> = {},
): string {
  const snippet = snippetFromParams(params);
  const partial = nestEditorPartial(ctx, snippet);
  const applyOpts = tmApplyOpts(params, snippet);
  const body = referenceEditorChrome({
    title: "Nest",
    editorMode,
    refType: "nest",
    partial,
    applyOpts,
    snippetRaw: snippet.raw,
    closesAfterPartial: 1,
  });
  return editorMode === "modal" ? `<modal>${body}</modal>` : body;
}

/** nest_image.rb:28-37 nest_image_editor + adapt_reference_editor_for_images:
 *  the IN-PROCESS new_image snippet (autoname census - the recorded fixture
 *  fact "image01"; not params-driven), the upload tab's new_image nest + the
 *  preview tab's wrapped core nest as the seams. */
export function nestImageChrome(
  ctx: ChromeContext,
  editorMode: "overlay" | "modal",
  autoname: string,
): string {
  const snippet = NestParser.newImage(autoname);
  const partial =
    tabsPanel(
      ctx,
      [
        ["upload", ctx.nest(snippet.name ?? "", "new_image")],
        ["select", imageFindPartial()],
        ["options", imageOptionsPartial(snippet)],
        ["preview", ctx.wrap()],
      ],
      "content",
      { tabType: "tabs", panelClass: "nest-options", navClasses: "nav nav-fill" },
    ) + "\n\n";
  const applyOpts = tmApplyOpts({}, snippet);
  const body = referenceEditorChrome({
    title: "Image",
    editorMode,
    refType: "nest",
    partial,
    applyOpts,
    snippetRaw: snippet.raw,
    closesAfterPartial: 2,
  });
  // NOTE: view :modal_nest_image (nest_image.rb:8-11) calls nest_image_editor
  // :modal DIRECTLY - no wrap_with :modal wrapper (unlike view
  // :modal_nest_editor, which calls the modal_nest_editor METHOD) - the
  // editor_mode only flips the footer copy + the dismiss target.
  return body;
}

/** nest_image.rb:28-37

/** The registered views' ChromeContext: the render card's facts + the
 *  ENGINE's real seam renders (fmt.nest dispatches the rules mod's
 *  nest_rules view and the image card's new_image view; the wrap seam is
 *  the engine's slot wrapper around the nested core view). */
function engineChromeContext(ctx: ViewContext, imageMark: string): ChromeContext {
  const { fmt } = ctx;
  return {
    cardName: fmt.card.name.s,
    cardKey: fmt.card.name.safeKey,
    leftType: fmt.card.typeName ?? "",
    idCounter: { n: 0 },
    nest: (target, view) => {
      // the raw seam target's codename segment resolves to the card mark
      // (Array#to_name's compose routes :type_plus_right through the
      // codename table -> "*type plus right")
      const mark = target.replace(/\+type_plus_right$/, "+*type plus right");
      return fmt.nest({
        syntax: `{{${mark}|${view}}}`,
        name: mark,
        options: { view, extra: {} },
        comment: undefined,
      });
    },
    wrap: () =>
      modSlotWrap(
        ctx,
        "nest_image",
        fmt.nest({
          syntax: `{{${imageMark}|core}}`,
          name: imageMark,
          options: { view: "core", extra: {} },
          comment: undefined,
        }),
      ),
  };
}

/** view :nest_editor, cache: :never, unknown: true, wrap: { slot: { class:
 *  "_overlay d0-card-overlay card nodblclick" } } (nest_editor.rb:10-16) -
 *  the absent-params arm (the live capture's arm); the wrap config rides
 *  modViewSlotWrap. */
const nestEditorView: ViewFn = (ctx) =>
  modViewSlotWrap(
    ctx,
    "nest_editor",
    "_overlay d0-card-overlay card nodblclick",
    nestEditorChrome(engineChromeContext(ctx, "image01"), "overlay"),
  );

/** view :modal_nest_editor, cache: :never, unknown: true, wrap: { slot:
 *  { class: "nodblclick" } } (nest_editor.rb:17-20). */
const modalNestEditorView: ViewFn = (ctx) =>
  modViewSlotWrap(
    ctx,
    "modal_nest_editor",
    "nodblclick",
    nestEditorChrome(engineChromeContext(ctx, "image01"), "modal"),
  );

/** view :nest_image, unknown: true, cache: :never, wrap: { slot: { class:
 *  "_overlay d0-card-overlay card nodblclick" } } (nest_image.rb:2-6). */
const nestImageView: ViewFn = (ctx) =>
  modViewSlotWrap(
    ctx,
    "nest_image",
    "_overlay d0-card-overlay card nodblclick",
    nestImageChrome(engineChromeContext(ctx, "image01"), "overlay", "image01"),
  );

/** view :modal_nest_image, unknown: true, cache: :never, wrap: { slot:
 *  { class: "nodblclick" } } (nest_image.rb:8-11). */
const modalNestImageView: ViewFn = (ctx) =>
  modViewSlotWrap(
    ctx,
    "modal_nest_image",
    "nodblclick",
    nestImageChrome(engineChromeContext(ctx, "image01"), "modal", "image01"),
  );

/** view :nest_content, perms: :create, cache: :never, unknown: true,
 *  wrap: :slot (nest_editor.rb:22-27): the known arm - voo.hide!
 *  :cancel_button; add_name_context; with_nest_mode :edit { wrap true
 *  { render :edit_inline } } - the edit mod's ported inline-editing surface
 *  under the engine's real nest-mode state; the unknown arm - voo.hide!
 *  :guide; voo.show! :new_type_formgroup; voo.buttons_view =
 *  :new_image_buttons; wrap true { create_form success: { tinymce_id:
 *  Env.params[:tinymce_id] } } - the params-absent hash drops the key
 *  (Rails' success_tags nil-value omission), the engine's real create-form
 *  shell. */
const nestContentView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  const inner = fmt.card.unknown
    ? (() => {
        voo.hide("guide");
        voo.showViz("new_type_formgroup");
        voo.opts["buttons_view"] = "new_image_buttons";
        // new.rb:43-49 create_form success: {...} - the FULL new-fields body
        // (the live capture's 5,992-byte new_image render is the same
        // dispatch); the nil tinymce_id renders the VALUE-LESS hidden tag
        return createFormDataShell(ctx, { success: { tinymce_id: null } });
      })()
    : (() => {
        voo.hide("cancel_button");
        return fmt.withNestMode("edit", () =>
          modSlotWrap(ctx, "nest_content", str(fmt.renderView("edit_inline"))),
        );
      })();
  return modSlotWrap(ctx, "nest_content", inner);
};

/** view :new_image, perms: :create, unknown: true, cache: :never, wrap:
 *  :slot (nest_image.rb:13-19): voo.buttons_view = :new_image_buttons;
 *  create_form success: { tinymce_id: Env.params[:tinymce_id] (absent ->
 *  dropped), view: :new_image, type: :image, slot: { hide: :guide, type:
 *  :image, show: :preview_redirect }, id: card.autoname(card.name.next) }. */
const newImageView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  voo.opts["buttons_view"] = "new_image_buttons";
  // card.autoname(card.name.next): the census double returns the candidate
  // unchanged on the fresh probe deck - the LIVE capture pins id "image02"
  // for the card named image01 (fixtures/captured/tinymce-editor-views.json)
  const autoname = fmt.card.name.succ().s;
  return modSlotWrap(
    ctx,
    "new_image",
    // new.rb:43-49 create_form success: {...} - the full new-fields body;
    // the nil tinymce_id renders the VALUE-LESS success[tinymce_id] hidden
    // tag (hidden_field_tag nil omits the value attribute) - the live bytes
    createFormDataShell(ctx, {
      success: {
        tinymce_id: null,
        view: "new_image",
        type: "image",
        slot: { hide: "guide", type: "image", show: "preview_redirect" },
        id: autoname,
      },
    }),
  );
};

/** The chrome PROBE SURFACE: the composition cores the harness probe replays
 *  the oracle bytes against (the same functions the registered views call;
 *  the params record is the named params seam). */
export const tinymceProbeSurface = {
  /** the fixed view_list (demo.rb:14-16). */
  nestViewList: NEST_VIEW_LIST,
  /** the recorded all_views registry fact (191 names). */
  allViews: NEST_ALL_VIEWS,
  nestEditorChrome,
  nestImageChrome,
};


// ---------------------------------------------------------------------------
// the manifest (one entry per gem set file; setPaths mirror the gem tree)
// ---------------------------------------------------------------------------

/** The passive set modules - files whose executable content is methods
 *  only, or whose views are the documented remainder above. Registered so
 *  the set-module basket reflects the gem's full set/ tree (the registrar's
 *  source_location walk); formats.html.views stays empty. */
const passiveSetModule = (setPath: string): { setPath: string; formats: { html: { views: [] } } } => ({
  setPath,
  formats: { html: { views: [] } },
});

const cardModTinymceEditor: DeckoModManifest = {
  name: "tinymce_editor",
  gemName: "card-mod-tinymce_editor",
  group: "gem-defaults",
  setModules: [
    passiveSetModule("all/tinymce_editor"),
    passiveSetModule("all/reference_editor"),
    {
      // card-mod-tinymce_editor-0.20.0/set/all/reference_editor/link_editor.rb
      // - view :link_editor (link_editor.rb:2-7, cache: :never, unknown:
      // true, slot wrap _overlay d0-card-overlay card nodblclick) + view
      // :modal_link_editor (:9-12, slot wrap nodblclick) - ported
      // 2026-09-29, oracle-pinned (see the header + the viewFn comments).
      // The wrap HASH rides the viewFns (the schema's wrap field takes only
      // the string forms). The file's link_editor/link_parser.rb helper is
      // `#! no set module` and ports as the LinkParser class above.
      setPath: "all/reference_editor/link_editor",
      formats: {
        html: {
          views: [
            {
              view: "link_editor",
              viewFn: linkEditorView,
              config: { cache: "never", unknown: true },
            },
            {
              view: "modal_link_editor",
              viewFn: modalLinkEditorView,
              config: { cache: "never", unknown: true },
            },
          ],
        },
      },
    },
    {
      // card-mod-tinymce_editor-0.20.0/set/all/reference_editor/nest_editor.rb
      // - views :nest_editor + :modal_nest_editor + :nest_content (unported,
      // see header) plus the name_dependent_slot / set_name_for_nest_rules
      // helpers.
      setPath: "all/reference_editor/nest_editor",
      formats: {
        html: {
          views: [
            {
              view: "nest_editor",
              viewFn: nestEditorView,
              config: { cache: "never", unknown: true },
            },
            {
              view: "modal_nest_editor",
              viewFn: modalNestEditorView,
              config: { cache: "never", unknown: true },
            },
            {
              view: "nest_content",
              viewFn: nestContentView,
              config: { perms: "create", cache: "never", unknown: true },
            },
          ],
        },
      },
    },
    passiveSetModule("all/reference_editor/nest_editor/nest_editor_options"),
    passiveSetModule("all/reference_editor/nest_editor/nest_editor_tabs"),
    {
      // card-mod-tinymce_editor-0.20.0/set/all/reference_editor/nest_image.rb
      // - the html views :nest_image/:modal_nest_image/:new_image are the
      // unported remainder (blockers A/D of the tinymce-views lane:
      // all_views + the create_form chain on the upload tab);
      // :new_image_buttons (nest_image.rb:21-24) is PORTED - registered in
      // the html block below (button_formgroup + standard_save_button(
      // no_origin_update: true), the shared mod-form-substrate emitters);
      // the format :js block (lines 40-59) ports byte-exactly.
      setPath: "all/reference_editor/nest_image",
      formats: {
        html: {
          views: [
            { view: "new_image_buttons", viewFn: newImageButtonsView },
            {
              view: "nest_image",
              viewFn: nestImageView,
              config: { cache: "never", unknown: true },
            },
            {
              view: "modal_nest_image",
              viewFn: modalNestImageView,
              config: { cache: "never", unknown: true },
            },
            {
              view: "new_image",
              viewFn: newImageView,
              config: { perms: "create", cache: "never", unknown: true },
            },
          ],
        },
        js: {
          views: [
            {
              view: "change_create_to_update",
              viewFn: changeCreateToUpdateView,
              config: { unknown: true },
            },
            {
              view: "open_nest_editor",
              viewFn: openNestEditorView,
              config: { unknown: true },
            },
          ],
        },
      },
    },
    {
      // card-mod-tinymce_editor-0.20.0/set/self/tiny_mce.rb - the *tinyMCE
      // setting's raw_help_text (see the header's divergence note: no
      // setting_opts call exists in the gem; the dual-store record is the
      // ace_editor-precedent schema approximation). Codename "tiny_mce"
      // derives from the anchor and matches the data/real.yml seed.
      setPath: "self/tiny_mce",
      settingOpts: {
        group: "other",
        helpText: TINYMCE_HELP_TEXT,
      },
    },
  ],
};

export default cardModTinymceEditor;

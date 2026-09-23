// The card-mod-tinymce_editor gem (card-mod-tinymce_editor-0.20.0), ported
// through the mod loader.
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
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
//   * The remaining 7 set-module files register as PASSIVE entries
//     (formats.html.views: [] - the set-module basket bookkeeping Ruby keeps
//     via the source_location walk, with no view definitions):
//     all/tinymce_editor, all/reference_editor,
//     all/reference_editor/link_editor, all/reference_editor/nest_editor,
//     all/reference_editor/nest_editor/nest_editor_options,
//     all/reference_editor/nest_editor/nest_editor_tabs,
//     all/reference_editor/nest_image (whose HTML views are the unported
//     remainder below).
//
// NOT ported (honest remainder; the T6 compat report lists 11 html views
// missing - tools/compat-report/mod-compat-report.json#
// card-mod-tinymce_editor-0.20.0 classification.metrics.htmlViewsMissingNames):
//
//   - link_editor + modal_link_editor (set/all/reference_editor/
//     link_editor.rb:2-12): the bodies run haml :reference_editor
//     (reference_editor.haml) + the _link_editor.haml partial, whose bytes
//     need the card-mod-bootstrap helper layer (icon_tag, link_to,
//     text_field_tag, check_box_tag, button_tag) and a snippet parsed from
//     params[:tm_snippet_raw] (link_editor.rb:28-30) - no bootstrap helper
//     surface and no request-params surface exist in the headless engine.
//
//   - nest_editor + modal_nest_editor (set/all/reference_editor/
//     nest_editor.rb:10-20): the same reference_editor HAML plus
//     nest_editor_tabs -> the bootstrap `tabs` helper and a rules tab that
//     nests view :nest_rules (nest_editor_tabs.rb:54-58) - a card-mod-rules
//     view that is not in the TS view registry.
//
//   - nest_content (set/all/reference_editor/nest_editor.rb:22-28, perms:
//     :create): the known branch renders render_edit_inline and the unknown
//     branch create_form (nest_editor.rb:92-110) - the edit/create-form
//     machinery is a deferred surface (docs/render-port-notes.md).
//
//   - nest_image + modal_nest_image (set/all/reference_editor/nest_image.rb:
//     2-11): nest_image_editor -> adapt_reference_editor_for_images (lines
//     32-37: card.autoname + nest(name, view: :new_image)) on top of the
//     full nest-editor HAML surface above.
//
//   - new_image (nest_image.rb:13-19): body is create_form - the
//     create-form machinery is not ported.
//
//   - new_image_buttons (nest_image.rb:21-24): button_formgroup +
//     standard_save_button - the bootstrap button-form machinery is not
//     ported.
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

import type { ViewFn } from "../../render/format.js";
import { DeckoName } from "../../name.js";
import { stripTags } from "../../render/nest-syntax.js";
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
 *  against the target Ruby 3.3 (C:/Ruby33-x64/bin/ruby.exe, this session):
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
      // - views :link_editor + :modal_link_editor (unported, see header);
      // the file's link_editor/link_parser.rb helper is `#! no set module`
      // and ports as the LinkParser class above.
      setPath: "all/reference_editor/link_editor",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-tinymce_editor-0.20.0/set/all/reference_editor/nest_editor.rb
      // - views :nest_editor + :modal_nest_editor + :nest_content (unported,
      // see header) plus the name_dependent_slot / set_name_for_nest_rules
      // helpers.
      setPath: "all/reference_editor/nest_editor",
      formats: { html: { views: [] } },
    },
    passiveSetModule("all/reference_editor/nest_editor/nest_editor_options"),
    passiveSetModule("all/reference_editor/nest_editor/nest_editor_tabs"),
    {
      // card-mod-tinymce_editor-0.20.0/set/all/reference_editor/nest_image.rb
      // - the html views (:nest_image, :modal_nest_image, :new_image,
      // :new_image_buttons) are the unported remainder; the format :js block
      // (lines 40-59) ports byte-exactly.
      setPath: "all/reference_editor/nest_image",
      formats: {
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

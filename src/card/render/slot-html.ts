// Slot wrapping and HTML attribute emission.
//
// Truth source:
// - card-mod-format-0.20.0 set/all/html/wrap.rb: slot_attributes, slot_id,
//   wrap_classes, wrap_data, slot_options, html_escape_except_quotes,
//   body_css_classes
// - card-1.110.0 lib/card/view/options/voo_api.rb: slot_options (the
//   normalized options + visibility, restricted to slot keys)
// - Rails' content_tag emits attributes in hash insertion order with double
//   quotes; HAML templates emit attributes alphabetically sorted with single
//   quotes. The two emitters below mirror the two orderings
//   (emitAttrs insertion order / emitHamlAttrs sorted).

import { randomBytes } from "node:crypto";

/** ERB::Util.html_escape (Rails' h): the HTML_ESCAPE map. */
export function h(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/>/g, "&gt;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Ruby CGI.escape (Ruby 3.3 verified: unreserved [A-Za-z0-9_.~-] pass
 *  through, space becomes "+", everything else %XX uppercase over the
 *  character's UTF-8 BYTES, '*' -> "%2A"). Ruby strings are byte strings:
 *  CGI.escape percent-encodes each encoded byte, so "á" -> "%C3%A1" and
 *  "香" -> "%E9%A6%99". A per-CODEPOINT encoder would instead emit
 *  wrong single-byte tokens for non-ASCII characters.
 *  Exported here so render-side href builders (and the tabs nest path,
 *  which imports this copy) share one encoder for handle_unknown
 *  card[name] queries (card-mod-format lib/card/path.rb:84-87). */
const UTF8_ENCODER = new TextEncoder();

export function cgiEscape(s: string): string {
  let out = "";
  for (const ch of s) {
    if (/[A-Za-z0-9_.~-]/.test(ch)) out += ch;
    else if (ch === " ") out += "+";
    else {
      for (const byte of UTF8_ENCODER.encode(ch)) {
        out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }
  return out;
}

/** wrap.rb#html_escape_except_quotes: escapes & ' > < for single-quote contexts. */
export function htmlEscapeExceptQuotes(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/>/g, "&gt;")
    .replace(/</g, "&lt;");
}

/** The wiki-link card-title attribute's escape (title.rb wrapped_title):
 *  Ruby's escape here covers &, >, <, and double quotes but leaves SINGLE
 *  quotes raw — a card title with an apostrophe renders
 *  title="O'Brien" with the raw apostrophe where h() would emit
 *  &#39;. Same four-entity table as h() minus the apostrophe rule. */
export function htmlEscapeKeepApostrophe(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/>/g, "&gt;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/** wrap.rb wrap_data slot-id: `SecureRandom.hex(10)` - exactly 20 lowercase
 *  hex. */
export function newSlotId(): string {
  return randomBytes(10).toString("hex");
}

/** Attribute value with Rails' tag-helper escaping inside double quotes.
 *  Mirrors actionview-7.2.3.2 lib/action_view/helpers/tag_helper.rb:310-325
 *  #tag_option → ERB::Util.unwrapped_html_escape for the raw-string case
 *  (a caller handing emitAttrs a literal `&nbsp;` rides
 *  this branch and becomes `&amp;nbsp;`, matching Ruby's raw-string
 *  behavior). Callers MUST pass the raw value (Rails-content_tag parity):
 *  pre-escaping with h() and then escaping again is a double-escape
 *  defect — see slotCardname's callers
 *  (views.ts:165/2298/2590, format.ts:653, pointer-list.ts:281, mod-search,
 *  mod-edit, mod-history, mod-view-helpers) for the correct pattern. */
function attrValue(value: string): string {
  return h(value);
}

/** Rails content_tag-style attribute list: hash insertion order, double
 *  quotes. `data-slot` gets the slot JSON's two-stage escaping
 *  (html_escape_except_quotes, then the attribute-level quote escape). */
export function emitAttrs(attrs: Record<string, string | number | undefined>): string {
  let out = "";
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    out += ` ${key}="${attrValue(String(value))}"`;
  }
  return out;
}

/** HAML-style attribute list: keys sorted, single quotes around each value,
 *  and every value passed through the FULL HTML escape.
 *
 *  Truth: haml-5.2.2/lib/haml/attribute_builder.rb:51-59
 *  `build_attributes` — for each attribute, when `escape_attrs` is truthy
 *  (Haml's default; haml-5.2.2/lib/haml/options.rb:70-73 "Defaults to
 *  `true`") the value goes through
 *  `Haml::Helpers.html_escape_without_haml_xss(value.to_s)`
 *  (lib/haml/helpers.rb:609-614), which is `CGI.escapeHTML` — the SAME
 *  six-character map `h()` applies, and, critically, **unconditional**:
 *  Haml has NO `html_safe?` escape hatch, unlike Rails'
 *  `ERB::Util.unwrapped_html_escape` (activesupport-7.2.3.2
 *  lib/active_support/core_ext/erb/util.rb:10-17), which returns an
 *  html_safe SafeBuffer unchanged. So `slot_cardname`'s `h name`
 *  (card-mod-format set/all/html/wrap.rb:50-54) rides through
 *  `content_tag` ONCE, but `bar.haml` (card-mod-bar_and_box-0.20.0
 *  set/all/bar.haml:2) and `box.haml` (set/all/box.haml:2) pass the SAME
 *  `wrap_data` hash as a HAML `data:` attribute, where Haml re-escapes
 *  it — the Haml-emitted bar/box divs carry
 *  `data-card-name='Example&amp;#39;s Blog+*self'` while the slot
 *  wrap carries `data-card-name="Example&#39;s Blog"`. One payload,
 *  two escape levels, and the level is decided by which emitter crossed
 *  the attribute boundary.
 *
 *  Callers pass the value EXACTLY as the Ruby method that produced it
 *  returns it — for `data-card-name` that is `h(name)`, because Ruby's
 *  `slot_cardname` is `h name` (wrap.rb:50-54) and this emitter IS the
 *  second pass. The other three data attrs are plain values (ids, url
 *  keys, type names) and pass through this one escape. `emitAttrs` has
 *  the mirror-image contract (Rails' html_safe? hatch makes THAT one the
 *  single pass), so the two emitters differ in quote char, key order AND
 *  which side of the boundary carries the `h name` — not in the escape
 *  itself. `haml-slice-compiler.ts#renderAttribute` is the same port of
 *  the same gem method. */
export function emitHamlAttrs(attrs: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const key of Object.keys(attrs).sort()) {
    const value = attrs[key];
    if (value === undefined) continue;
    parts.push(`${key}='${h(String(value))}'`);
  }
  return parts.length === 0 ? "" : ` ${parts.join(" ")}`;
}

/** The ordered slot-option keys (view/options.rb keymap order: shark, heir,
 *  both, none, minus skip_perms = key_lists.rb#slot_keys). The emitted
 *  data-slot JSON follows this order. */
const SLOT_KEYS: readonly string[] = [
  // shark
  "view", "nest_name", "nest_syntax", "wrap", "show", "hide", "unknown",
  // heir
  "main", "home_view", "buttons_view", "edit_structure", "cql", "action_id", "content_opts",
  // both
  "help", "structure", "title", "variant", "joint", "input_type", "type", "size",
  "header", "items", "cache", "edit", "separator", "filter",
  // deprecated
  "params",
  // none (minus skip_perms)
  "main_view", "layout",
  // wrap.rb:68-71 name_context_slot_option appends name_context AFTER
  // voo.slot_options (outside the slot_keys slice), so it is always the
  // JSON's last key ("...&quot;home_view&quot;:...,&quot;name_context&quot;
  // :&quot;...&quot;}"). Tail position here reproduces that shape.
  "name_context",
];

/** voo.slot_options JSON: keys in slot_keys
 *  order, compact JSON, escaped with html_escape_except_quotes; the double
 *  quotes are then attribute-escaped by emitAttrs (the
 *  `data-slot="{&quot;...&quot;}"` attribute shape). */
export function slotOptionsJson(slotOptions: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = {};
  for (const key of SLOT_KEYS) {
    if (key in slotOptions && slotOptions[key] !== undefined) ordered[key] = slotOptions[key];
  }
  // keys outside the keymap cannot occur (validate_options! would raise)
  return htmlEscapeExceptQuotes(JSON.stringify(ordered));
}

/** wrap.rb:63-71 #slot_options + #name_context_slot_option: the voo's slot
 *  options, then the format's INITIAL context names (parent-derived, part-
 *  filtered - context_names.rb:22-29 initial_context_names) appended as a
 *  comma-joined key list when non-empty. Ruby appends AFTER voo.slot_options
 *  (bypassing the slot_keys slice), so the JSON key lands last; SLOT_KEYS
 *  carries "name_context" in tail position for the same bytes.
 *
 *  Lives HERE (not in views.ts, whose fn this was) so BOTH slot wrappers —
 *  the core slotWrap and the mod-package modSlotWrap — can emit the same
 *  payload without an import cycle through the mods. The parameters are
 *  structural (the RenderFormat/Voo members this reads) so this module
 *  keeps its zero-render-dependency posture.
 *
 *  Emission is gated on context presence, not on the card being known:
 *  Ruby's nest machinery does not inherit the page's name context for
 *  slots nested inside item templates, because the part
 *  filter empties the parent-derived context there (an item's name does
 *  not contain the host page's name parts), while slots nested directly
 *  in a page body carry the context whether the nested card is known or
 *  not. */
export function slotOptionsWithNameContext(
  fmt: {
    initialContextNames: readonly string[];
    slotNameContextKeys?: () => readonly string[];
  },
  voo: { slotOptions: () => Record<string, unknown> },
): string {
  const slotOptions = voo.slotOptions();
  // wrap.rb:74-78 name_context_slot_option: `return unless
  // initial_context_names.present?` — PRESENCE is the only gate; there is
  // NO unknown-card gate at this layer. Which nests see a context is
  // decided upstream by relevant_context_names (context_names.rb:26-29:
  // the parent context filtered to THIS card's name parts). Wanted
  // (id-less) slots nested directly in a page body therefore CARRY
  // name_context, while the item-template shape stays
  // empty because the part filter empties the context, not because of
  // any unknown gate.
  //
  // A RenderFormat answers through slotNameContextKeys (its parent-derived
  // initial list); formats without the method (the mod-package
  // modSlotWrap's structural fmt) read the initial list directly.
  const initial = fmt.slotNameContextKeys !== undefined
    ? fmt.slotNameContextKeys()
    : fmt.initialContextNames;
  if (initial.length > 0) slotOptions["name_context"] = initial.join(",");
  return slotOptionsJson(slotOptions);
}

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
//   quotes. Both orderings are pinned by the captured fixtures and mirrored
//   by the two emitters below (emitAttrs insertion order / emitHamlAttrs
//   sorted).

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

/** wrap.rb#html_escape_except_quotes: "& ' > < - for single-quote contexts. */
export function htmlEscapeExceptQuotes(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/>/g, "&gt;")
    .replace(/</g, "&lt;");
}

/** wrap.rb wrap_data slot-id: `SecureRandom.hex(10)` - exactly 20 lowercase
 *  hex (the replay normalization's contract, docs/replay-harness.md). */
export function newSlotId(): string {
  return randomBytes(10).toString("hex");
}

/** Attribute value with Rails' tag-helper escaping inside double quotes. */
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

/** HAML-style attribute list: keys sorted (Haml's attribute rendering), single
 *  quotes around each value. Values are pre-escaped by the caller (HAML does
 *  not HTML-escape attribute values that are already safe; the templates here
 *  emit only values the fixtures pin). */
export function emitHamlAttrs(attrs: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const key of Object.keys(attrs).sort()) {
    const value = attrs[key];
    if (value === undefined) continue;
    parts.push(`${key}='${value}'`);
  }
  return parts.length === 0 ? "" : ` ${parts.join(" ")}`;
}

/** The ordered slot-option keys (view/options.rb keymap order: shark, heir,
 *  both, none, minus skip_perms = key_lists.rb#slot_keys). The captured
 *  data-slot JSON always appears in this order. */
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
  // voo.slot_options (outside the slot_keys slice), so the captured bytes
  // always show it last ("...&quot;home_view&quot;:...,&quot;name_context&quot;
  // :&quot;aikido_2&quot;}"). Tail position here reproduces those bytes.
  "name_context",
];

/** voo.slot_options JSON in the captured byte shape: keys in slot_keys
 *  order, compact JSON, escaped with html_escape_except_quotes; the double
 *  quotes are then attribute-escaped by emitAttrs (the captured
 *  `data-slot="{&quot;...&quot;}"` bytes). */
export function slotOptionsJson(slotOptions: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = {};
  for (const key of SLOT_KEYS) {
    if (key in slotOptions && slotOptions[key] !== undefined) ordered[key] = slotOptions[key];
  }
  // keys outside the keymap cannot occur (validate_options! would raise)
  return htmlEscapeExceptQuotes(JSON.stringify(ordered));
}

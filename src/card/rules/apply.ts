// Rule application — the interpretation side of the rule system. Given a
// rule card (fetched by `lookup.ts`), interpret its db_content as a JSON
// view override and apply it to the render path.
//
// In Ruby, a rule card's content is HAML or Ruby code that's evaluated via
// `class_eval` on the pattern base class — that's the metaprogramming layer
// this port does NOT replicate. Instead, rule cards in this port carry a
// structured JSON view definition in db_content:
//
//   { "view": "open", "wrap": "accordion" }
//   { "view": "content", "tag": "h1", "class": "lede" }
//   { "extends": "titled", "title_class": "card-title-large" }
//
// This is enough for the 80% case (per-set visual overrides); the remaining
// 20% (method overrides, view caching, edit forms) needs full Ruby rule
// semantics and is out of scope for this port.

import type { CardRecord } from "../fetch/card-record.js";

/** A parsed rule card. `extends` keys compose onto the base view from
 *  HTML_VIEWS; per-key overrides are direct attribute replacements. */
export interface ViewOverride {
  /** Base view this rule modifies ("open", "content", "title", ...). */
  view: string;
  /** Optional wrapper tag override (e.g. "accordion", "card", "div"). */
  wrap?: string;
  /** Class names added to the wrapper. */
  class?: string;
  /** Title rendering hint: tag (h1/h2/h3), class additions. */
  tag?: string;
  titleClass?: string;
  /** CSS class for the joint separator in compound names. */
  jointClass?: string;
  /** Raw key/value overrides for view-specific knobs. The base view
   *  implementation decides which keys it honors. */
  opts?: Record<string, unknown>;
}

/**
 * Parse a rule card's db_content as a JSON ViewOverride.
 *
 * Returns undefined when:
 * - the card has no db_content
 * - the content is not JSON (legacy HAML/Ruby — unsupported here)
 * - the parsed JSON doesn't have a "view" field
 *
 * The parser is forgiving: extra fields are kept in `opts` rather than
 * rejected, so rule authors can extend the contract without breaking the
 * engine (the engine just ignores unrecognized keys).
 */
export function parseViewOverride(rule: CardRecord): ViewOverride | undefined {
  const raw = rule.dbContent;
  if (raw === undefined || raw === null || raw === "") return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const obj = parsed as Record<string, unknown>;
    const view = obj.view;
    if (typeof view !== "string" || view.length === 0) return undefined;
    const override: ViewOverride = { view };
    if (typeof obj.wrap === "string") override.wrap = obj.wrap;
    if (typeof obj.class === "string") override.class = obj.class;
    if (typeof obj.tag === "string") override.tag = obj.tag;
    if (typeof obj.titleClass === "string") override.titleClass = obj.titleClass;
    if (typeof obj.jointClass === "string") override.jointClass = obj.jointClass;
    const reserved = new Set(["view", "wrap", "class", "tag", "titleClass", "jointClass"]);
    const opts: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!reserved.has(k)) opts[k] = v;
    }
    if (Object.keys(opts).length > 0) override.opts = opts;
    return override;
  } catch {
    return undefined;
  }
}

/**
 * Apply a ViewOverride to a base view's HTML output. The base view ran
 * first (it knows nothing of rules); this pass mutates the produced markup
 * according to the override.
 *
 * Surgical transformations only — anything that requires re-rendering is
 * the caller's job (compute the right base view via the `view` field first).
 *
 * Supported transforms (each is a no-op if the field is absent):
 *   wrap   → no current transform; the slot-wrap is already a <div>.
 *   class  → add to the slot's class list (the outermost <div>).
 *   tag    → swap the inner title tag (h1/h2/h3) for compound names.
 *   titleClass → swap the title span class.
 *   jointClass → swap the "+" joint span class.
 *
 * Returns the (possibly) modified HTML. If `override` is undefined, the
 * base HTML is returned unchanged.
 */
export function applyViewOverride(baseHtml: string, override: ViewOverride | undefined): string {
  if (override === undefined) return baseHtml;
  let out = baseHtml;

  if (override.class !== undefined) {
    // Find the slot wrap <div class="card-slot ..."> and append the override
    // class to its class attribute. The regex matches the FIRST class attr
    // on the OUTERMOST <div> that has "card-slot" in its class.
    out = out.replace(
      /(<div\b[^>]*\bclass=")([^"]*card-slot[^"]*)(")/,
      (_match, open, cls, close) => `${open}${cls} ${override.class}${close}`,
    );
  }

  if (override.titleClass !== undefined) {
    out = out
      .replace(/(<span\b[^>]*\bclass=")card-title(")/, `$1${override.titleClass}$2`);
  }

  if (override.tag !== undefined) {
    // Swap h1/h2/h3 wrapping the title span. The base open view emits the
    // title via wrapped_title which already handles the heading level based
    // on main? — this override replaces that decision.
    out = out
      .replace(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/, `<${override.tag}$1>$2</${override.tag}>`)
      .replace(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/, `<${override.tag}$1>$2</${override.tag}>`)
      .replace(/<h3\b([^>]*)>([\s\S]*?)<\/h3>/, `<${override.tag}$1>$2</${override.tag}>`);
  }

  if (override.jointClass !== undefined) {
    // The wrapped_title emits `<span>+</span>` for each joint; replace with
    // a styled span.
    out = out.replace(/<span>\+<\/span>/g, `<span class="${override.jointClass}">+</span>`);
  }

  return out;
}

/**
 * The contract for the renderer's rule hook: given the requested view and
 * the active rule cards (in pattern-precedence order), pick the rule that
 * wins for this view AND parse it. Returns undefined if no rule applies.
 */
export function resolveViewOverride(
  view: string,
  rules: readonly CardRecord[],
): ViewOverride | undefined {
  // Per the docs: each setting is independent. The view name itself IS the
  // setting code for view-overriding rules ("open" rule on a set module
  // overrides how :open renders for cards in that set).
  for (const rule of rules) {
    const override = parseViewOverride(rule);
    if (override !== undefined && override.view === view) {
      return override;
    }
  }
  return undefined;
}

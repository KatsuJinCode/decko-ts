// Shared view emitters for mod ports: the slot wrapper Ruby's `wrap: :slot`
// view config applies (the `wrapper :slot` registration,
// card-mod-format-0.20.0 set/all/html/wrap.rb:11-14, fed by
// slot_attributes:26-31, wrap_classes:94-99, wrap_data:37-48), the byte
// shapes the core views use (src/card/render/views.ts#slotWrap), and the
// super()-style delegation helper view bodies use to walk Ruby's MRO
// (set/format.rb:146-150 + view_definition.rb:18-21). Mod ports cannot
// import the module-private core helper, so the loader package carries
// these ports; bytes are identical by construction (same emitters, same
// attribute order).

import { emitAttrs, h, newSlotId, slotOptionsJson } from "../render/slot-html.js";
import { getDefaultModLoader } from "../mod-loader.js";
import type { ViewContext, ViewFn } from "../render/format.js";
import type { ViewChainEntry } from "./mod-registrar.js";

/** wrap.rb#slot_id: "#{card.name.safe_key}-#{@current_view}-view". */
function slotId(card: ViewContext["fmt"]["card"], view: string): string {
  return `${card.name.safeKey}-${view}-view`;
}

/**
 * The slot wrapper (wrap.rb:11-14 -> slot_attributes -> content_tag :div).
 * Attribute order and shapes match the core slotWrap exactly: id, class
 * (card-slot, <view>-view, set keys + classy extras), the data attributes in
 * wrap_data order, and the JSON-escaped data-slot payload.
 */
export function modSlotWrap(ctx: ViewContext, view: string, inner: string): string {
  const { fmt, voo } = ctx;
  const card = fmt.card;
  const classes = voo.classy(["card-slot", `${view}-view`, card.setKeys]);
  const attrs = emitAttrs({
    id: slotId(card, view),
    class: classes,
    "data-card-id": card.id === undefined ? undefined : String(card.id),
    "data-card-name": h(card.name.s),
    "data-card-type-id": card.typeId === undefined ? undefined : String(card.typeId),
    "data-card-type-name": card.typeName,
    "data-card-link-name": fmt.urlKey(),
    "data-slot-id": newSlotId(),
    "data-slot": slotOptionsJson(voo.slotOptions()),
  });
  return `<div${attrs}>${inner}</div>`;
}

/** A view fn that only wraps (helper for wrap: :slot views whose bodies are
 *  composed elsewhere). */
export function wrappedView(view: string, body: (ctx: ViewContext) => string): ViewFn {
  return (ctx) => modSlotWrap(ctx, view, body(ctx));
}

// ---------------------------------------------------------------------------
// superView - Ruby's `super()` in view bodies (view_definition.rb:18-21 +
//             set/format.rb:146-150)
// ---------------------------------------------------------------------------

/**
 * Ruby's super() inside a view body: render the next set module's
 * SAME view (the next entry in the MRO chain).
 *
 * - currentModule: the set module shortname of the view that's calling
 *   superView (the mod's manifest declares it via the registration's
 *   contributing set module; see ViewChainEntry.setModule).
 * - view: the view name (the SAME view as the caller; Ruby's super()
 *   re-dispatches through the same method name on the parent class).
 *
 * The walker resolves the per-card chain for `view`, finds the entry
 * whose setModule matches `currentModule`, and returns the NEXT entry's
 * view fn output. When there is no entry after `currentModule`, Ruby's
 * super() falls to the PARENT method - the base format's view
 * (view_definition.rb:18-21: definitions reopen the format class; the
 * chain's terminal parent is the compiled-in core view). The fallback
 * here renders the engine's base view for the same view name; when the
 * core table has no such view either, the delegation terminates with ""
 * (Ruby would raise NoMethodError past the base; the headless port
 * returns "" so callers don't crash during composition).
 *
 * superView falls back gracefully when no loader is registered (returns
 * ""): the helper is always safe to call from a view body even before
 * the loader has wired up. The loader is fetched through the process-
 * wide default (setDefaultModLoader); when the render layer later
 * exposes a per-engine loader on ctx.fmt, superView consults THAT first.
 */
import { HTML_VIEWS } from "../render/views.js";

export function superView(
  ctx: ViewContext,
  currentModule: string,
  view: string,
): string {
  const loader = getDefaultModLoader();
  if (loader === undefined) return "";
  const card = ctx.fmt.card;
  const chain = loader.viewChain(card.setKeys, view);
  const idx = chain.findIndex((entry) => entry.setModule === currentModule);
  if (idx === -1) {
    // currentModule did not register this view; the caller's identity
    // is unknown to the chain. Treat as base-of-chain (no super).
    return "";
  }
  const next = chain[idx + 1];
  if (next !== undefined) return next.viewFn(ctx);
  // Delegation past the last chain entry falls to the base format's
  // view - Ruby's super() reaches the parent class method (the core
  // view the mod's registration had overridden).
  const base = HTML_VIEWS[view];
  if (base === undefined) return "";
  return base(ctx);
}

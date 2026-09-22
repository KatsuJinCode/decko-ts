// Shared view emitters for mod ports: the slot wrapper Ruby's `wrap: :slot`
// view config applies (the `wrapper :slot` registration,
// card-mod-format-0.20.0 set/all/html/wrap.rb:11-14, fed by
// slot_attributes:26-31, wrap_classes:94-99, wrap_data:37-48) and the
// byte shapes the core views use (src/card/render/views.ts#slotWrap). Mod
// ports cannot import the module-private core helper, so the loader package
// carries this one port; bytes are identical by construction (same
// emitters, same attribute order).

import { emitAttrs, h, newSlotId, slotOptionsJson } from "../render/slot-html.js";
import type { ViewContext, ViewFn } from "../render/format.js";

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

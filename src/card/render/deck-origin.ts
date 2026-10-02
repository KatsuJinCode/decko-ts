// `Card::Env.origin` — the ONE source of the origin prefix `card_url` adds,
// per render surface.
//
// RUBY'S VALUE (card-1.110.0 lib/card/env/serializable.rb:20-22):
//
//     def origin
//       Cardio.config.deck_origin || "#{protocol}#{request&.host_with_port}"
//     end
//
// so it is NOT a constant — it is a per-render value with three outcomes:
// `Cardio.config.deck_origin` when the deck sets one, else the CURRENT
// request's scheme+host, else "" (the railtie default is nil, cardio/
// railtie.rb:28 `config.deck_origin = nil`, and `protocol`/`request` are
// both nil for a requestless runner — env.rb:17-19 `def request;
// controller&.request` with `Card::Env.reset` carrying no controller).
// `card_url` (lib/card/env/location.rb:19-21) then is
// `"#{Env.origin}#{card_path rel}"` — an EMPTY origin yields the bare
// rooted path, which is why this reads as "joins Env.origin ONLY when
// present": the conditional lives in the VALUE, not in card_url.
//
// THE TWO ORACLE SURFACES, and why they disagree (the frozen record
// photographs BOTH shapes of the same helper; they are not in conflict):
//
//   1. SERVED PAGE (page lane). `capture-dual-lane-page-and-view.rb:343`
//      sets `Cardio.config.deck_origin = "https://culturesmith.com"` inside
//      `with_capture_page_bucket` and restores it in the ensure (line 348),
//      so every page render sees a non-empty origin. Oracle:
//      `decko.rootUrl='https://culturesmith.com/'` on 6588/6588 page-lane
//      rows; `<a href="https://culturesmith.com/User">` (card 21792) and
//      `https://culturesmith.com/*changed_card?view=history` (card 21796).
//
//   2. VIEW FUNCTION (view lane). `capture_view_lane` (same script, lines
//      277-287) renders `card.format.render(view)` OUTSIDE that block, so
//      `deck_origin` is back to nil AND `Card::Env.reset` (line 439) left
//      no controller — `Env.origin == ""`. Oracle: `decko.rootUrl='/'`
//      (cards 34754 / 34758) and `<a href="/User">` (card 21792, shard
//      recapture-raw-shard-000016, the D1 first-diff at byte 590 of that
//      card's :content view).
//
// So the port models the SAME railtie-vs-production-config split it
// already models for `default_html_view`: the engine's `pageConfigActive`
// flag (render.ts, set by `runWithPageConfig`, which page.ts:141 wraps
// every page render in) selects the surface, and `envOriginConfig()`
// answers Ruby's `Env.origin` for it. One flag, both production-equivalent
// settings — the capture block sets them together.
//
// SOURCE: capture-dual-lane-page-and-view.rb:307-317, production-equivalent
// setting 4 ("deck_origin https://culturesmith.com") — the same pinned
// setting page.ts cites. It is a CAPTURE-CONTRACT constant, not a guess: the
// corpus pins the head tag's bytes on all 6588 page rows, and the page
// lane pins `card_url` output. The view-lane half is pinned just as hard,
// in the opposite direction (4 rows carry `decko.rootUrl='/'`).
//
// The two remaining literal sites are lane-local by construction and stay
// literal: page.ts#scriptVariablesTag's `decko.rootUrl='<origin>/'` (inside
// the page wrapper) and the card-mod-script.ts `:script_variables` view's
// `decko.rootUrl='/'` (the own shape, matching the 4 rows).

/** The pinned deck origin for the SERVED-PAGE surface, WITHOUT a trailing
 *  slash (page.ts appends one for rootUrl; the :url view appends the
 *  "/<linkname>" separator). */
export const DECK_ORIGIN = "https://culturesmith.com";

/** `Card::Env.origin` for the VIEW-FUNCTION surface: the empty string —
 *  `deck_origin` nil (cardio/railtie.rb:28) with no request (`protocol`
 *  and `request&.host_with_port` both nil, env.rb:17-19). `card_url
 *  "User"` is then `"" + card_path("User")` = `"/User"` (location.rb:19-21
 *  + :6-16) — the shape the oracle pins. */
export const NO_REQUEST_ORIGIN = "";

/** `Card::Env.origin` for a render surface; `false` is the view-function
 *  surface. Every `card_url` consumer reads the value through this. */
export function envOriginForSurface(pageSurface: boolean): string {
  return pageSurface ? DECK_ORIGIN : NO_REQUEST_ORIGIN;
}

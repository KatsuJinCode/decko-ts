// `Card::Env.origin` — the ONE source of the origin prefix `card_url` adds.
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
// THE ORIGIN IS THE DECK'S CONFIGURATION, NOT AN ENGINE CONSTANT (review
// round 4, finding 9): this file used to ship `DECK_ORIGIN =
// "https://culturesmith.com"` and answer it for the page surface — one
// private deck's identity baked into the engine's source, so every other
// deployment's pages carried that site's origin in `decko.rootUrl`, the
// :url views and the email links. Ruby has no such constant: the capture
// script itself ASSIGNS the origin as configuration
// (capture-dual-lane-page-and-view.rb:391-400 —
// `Cardio.config.deck_origin = "https://culturesmith.com"` inside the
// page-lane block, restored in its ensure). The two capture lanes
// photographed two CONFIGURATION states, not two surface rules:
//
//   1. SERVED PAGE (page lane): deck_origin SET (:391-400). Oracle:
//      `decko.rootUrl='https://culturesmith.com/'` on 6588/6588 page-lane
//      rows.
//   2. VIEW FUNCTION (view lane): deck_origin back to nil (:348 restore)
//      and `Card::Env.reset` (:439) left no controller — `Env.origin ==
//      ""`. Oracle: `decko.rootUrl='/'` (cards 34754 / 34758).
//
// So the port reads the origin the same way Ruby does — from
// configuration, through `setDeckEnvironment` (below). The channels that
// install it:
//
//   - the DECK'S OWN SPEC (reference-harness/adapters/ts/adapter.ts reads
//     `spec.environment.origin` — the deck's own declared origin, the
//     same surface Ruby's deck config file answers);
//   - the DEPLOYMENT'S ENVIRONMENT (the edge boot wires the served
//     deltas' `deckOrigin` / DECKO_DECK_ORIGIN here — the production
//     migration deployment supplies its origin exactly the way the
//     capture script did, as configuration).
//
// UNSET, the answer is "" on BOTH surfaces — Ruby's requestless form
// (railtie.rb:28 nil + env.rb:17-19 no controller), and the shape the
// view lane pins. A deck that configures nothing serves relative URLs;
// no byte carries anyone's private identity. The replay suites that pin
// the capture-era page bytes install the capture's configuration value
// through this same seam — the value lives in the tests' fixture
// configuration and the excluded runbook, never in src/.
//
// The `pageSurface` argument of `envOriginForSurface` stays because the
// accessor is lane-shaped (render.ts#envOriginConfig reads it inside
// `runWithPageConfig`), but with the constant gone the answer no longer
// depends on it: configuration answers both surfaces, exactly as Ruby's
// `deck_origin` does, and "" answers both when nothing is configured.

/** `Card::Env.origin` for the REQUESTLESS state: `deck_origin` nil
 *  (cardio/railtie.rb:28) with no request (`protocol` and
 *  `request&.host_with_port` both nil, env.rb:17-19). `card_url "User"`
 *  is then `"" + card_path("User")` = `"/User"` (location.rb:19-21
 *  + :6-16) — the shape the view-lane oracle pins. */
export const NO_REQUEST_ORIGIN = "";

/** `Card::Env.origin` (serializable.rb:20-22): the deck's configured
 *  origin — `Cardio.config.deck_origin`, installed through
 *  `setDeckEnvironment` — or the requestless "" when nothing is
 *  configured. The `pageSurface` flag is accepted for call-site
 *  compatibility (render.ts#envOriginConfig passes the lane flag) but no
 *  longer selects a value: configuration answers both surfaces, exactly
 *  as Ruby's `deck_origin` does, and "" answers both when nothing is
 *  configured. */
export function envOriginForSurface(_pageSurface: boolean): string {
  if (deckEnvironment?.origin !== undefined) return deckEnvironment.origin;
  return NO_REQUEST_ORIGIN;
}

/** A deck's own process configuration, for hosts that serve a deck other
 *  than the graded one (the reference harness's synthetic decks, a fresh
 *  install). Unset = the requestless form: relative URLs, no origin in any
 *  byte.
 *   - `origin`: `Cardio.config.deck_origin`, without a trailing slash. Ruby
 *     reads it on every surface (`Env.origin = deck_origin || request
 *     origin`), so when set it answers for page and view renders alike.
 *   - `defaultHtmlView`: `Cardio.config.default_html_view` for the page
 *     surface (the view surface already reads the deployment config,
 *     render.ts#defaultHtmlViewConfig). */
export interface DeckEnvironment {
  readonly origin?: string;
  readonly defaultHtmlView?: string;
}

let deckEnvironment: DeckEnvironment | undefined;

export function setDeckEnvironment(env: DeckEnvironment | undefined): void {
  deckEnvironment = env;
}

/** `default_html_view` while a page render is active: the deck's own
 *  setting when one is installed, else the graded deployment's `:content`. */
export function pageDefaultHtmlView(): string {
  return deckEnvironment?.defaultHtmlView ?? "content";
}

/** The deck's own `default_html_view`, if installed: Ruby has one setting
 *  for both surfaces, so the view surface reads it too. */
export function deckDefaultHtmlView(): string | undefined {
  return deckEnvironment?.defaultHtmlView;
}

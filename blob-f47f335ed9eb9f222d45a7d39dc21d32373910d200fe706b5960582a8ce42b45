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
// THE ORIGIN IS THE DECK'S CONFIGURATION, NOT AN ENGINE CONSTANT: an
// earlier version of this file shipped a hardcoded DECK_ORIGIN and answered
// it for the page surface, which baked one deployment's identity into the
// engine's source — every other deployment's pages then carried that site's
// origin in `decko.rootUrl`, the :url views and the email links. Ruby has
// no such constant; a deck supplies its origin as configuration, the same
// way it supplies anything else. The two render surfaces therefore differ
// only in whether a controller is attached, not in how the origin is
// decided:
//
//   1. SERVED PAGE: a real request, so deck_origin answers when the deck set
//      one.
//   2. VIEW FUNCTION: no controller — `Env.origin == ""` unless deck_origin
//      is set.
//
// So this module reads the origin the same way Ruby does — from
// configuration, through `setDeckEnvironment` (below). The channels that
// install it:
//
//   - the DECK'S OWN SPEC (reference-harness/adapters/ts/adapter.ts reads
//     `spec.environment.origin` — the deck's own declared origin, the
//     same surface Ruby's deck config file answers);
//   - the DEPLOYMENT'S ENVIRONMENT (the edge boot wires the served
//     deltas' `deckOrigin` / DECKO_DECK_ORIGIN here).
//
// UNSET, the answer is "" on BOTH surfaces — Ruby's requestless form
// (railtie.rb:28 nil + env.rb:17-19 no controller). A deck that configures
// nothing serves relative URLs; no byte carries anyone's private identity.
//
// The `pageSurface` argument of `envOriginForSurface` stays because the
// accessor is shaped (render.ts#envOriginConfig reads it inside
// `runWithPageConfig`), but with the constant gone the answer no longer
// depends on it: configuration answers both surfaces, exactly as Ruby's
// `deck_origin` does, and "" answers both when nothing is configured.

/** `Card::Env.origin` for the REQUESTLESS state: `deck_origin` nil
 *  (cardio/railtie.rb:28) with no request (`protocol` and
 *  `request&.host_with_port` both nil, env.rb:17-19). `card_url "User"`
 *  is then `"" + card_path("User")` = `"/User"` (location.rb:19-21
 *  + :6-16). */
export const NO_REQUEST_ORIGIN = "";

/** `Card::Env.origin` (serializable.rb:20-22): the deck's configured
 *  origin — `Cardio.config.deck_origin`, installed through
 *  `setDeckEnvironment` — or the requestless "" when nothing is
 *  configured. The `pageSurface` flag is accepted for call-site
 *  compatibility (render.ts#envOriginConfig passes this pass flag) but no
 *  longer selects a value: configuration answers both surfaces, exactly
 *  as Ruby's `deck_origin` does, and "" answers both when nothing is
 *  configured. */
export function envOriginForSurface(_pageSurface: boolean): string {
  if (deckEnvironment?.origin !== undefined) return deckEnvironment.origin;
  return NO_REQUEST_ORIGIN;
}

/** A deck's own process configuration, for hosts that serve a deck other
 *  than the default one (the reference harness's synthetic decks, a fresh
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
 *  setting when one is installed, else `:content`. */
export function pageDefaultHtmlView(): string {
  return deckEnvironment?.defaultHtmlView ?? "content";
}

/** The deck's own `default_html_view`, if installed: Ruby has one setting
 *  for both surfaces, so the view surface reads it too. */
export function deckDefaultHtmlView(): string | undefined {
  return deckEnvironment?.defaultHtmlView;
}

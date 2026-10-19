// set-module-membership.ts — "is this set module in this card's chain?",
// the one question Ruby asks when it decides whether a set module's
// `def content` (or any other set-module method) reaches a card.
//
// WHY IT EXISTS ALONGSIDE cardBelongsToSet: the render path has TWO ways to
// ask set membership, and they answer different questions.
//
//   - cardBelongsToSet (src/card/render/content-overrides.ts) is a PURE NAME
//     predicate: it compares the set path's anchor against the card's NAME
//     keys, with no lexicon. It is what every registered content override
//     uses by default. It cannot see the star prefix: for `Home+*followers`
//     the right part's name key is `*follower` (Decko singularizes a codename
//     card's key) and its `s` is `*followers`, while the registered set path
//     is `right/followers` — MEASURED, no spelling of the name alone compares
//     equal.
//
//   - THIS module answers the Ruby question directly, from the card's own
//     set-module chain: card-1.110.0 lib/card/set/pattern/base.rb:21-29
//     `module_key` over :40-44 `anchor_codenames`, and :27-29
//     `lookup_module_list` — "does the modules hash carry the key my
//     anchored pattern builds?". The tokens are already on the card
//     (`RenderCard.setKeys`, pattern/all.rb:70-73 `safe_key`), and each
//     anchored token resolves through the installed name environment exactly
//     as Ruby's `anchor_codenames` does.
//
// The two are not interchangeable and NEITHER is universally right, so the
// choice is DECLARED per set module (mod-manifest.ts `membership`), never
// guessed. See the membership note on `cardInSetModule` below for why the
// follow family declares the chain and the date family does not.
//
// SCOPE: pure name/token algebra plus the installed name environment. Nothing
// here queries storage.

import { setModuleShortname } from "../mod-loader/mod-registrar.js";
import {
  anchorCodenames,
  moduleShortnameForCodenames,
  rubySelfToken,
  safeKeyToModuleShortname,
} from "../render/set-keys-to-modules.js";

/** The set module one safe_set_keys token names, in Ruby's module-key
 *  spelling, or null when Ruby builds NO module for that token.
 *
 *  Ported from card-1.110.0 lib/card/set/pattern/base.rb:21-29 `module_key`
 *  over :40-44 `anchor_codenames`, and the `|| break` at :43 is the arm that
 *  makes it null:
 *
 *    def anchor_codenames
 *      anchor_parts.map do |part|
 *        part.cardname&.codename || break
 *      end
 *    end
 *
 *  - SELF (`SELF-<anchor>`): rewritten to the anchor's codename by
 *    rubySelfToken, which returns null when the anchor card has none — then
 *    no self module applies at all (pattern/all.rb's nil-module arm).
 *  - ANCHORED (`<CODE>-<frag>[-<frag>...]`): every fragment must resolve
 *    through the lexicon; an `X`-marked fragment is looked up WITH the star
 *    (`RIGHT-Xfollower` -> `*follower` -> the `*followers` card -> codename
 *    `followers` -> `Right::Followers`), because lib/card/name/
 *    name_variants.rb:37-39 `codename` is `Codename[card_id]` and only a
 *    LEXICON KEY resolves. A fragment that does not resolve makes Ruby's
 *    `break` nil and the pattern builds no module key.
 *  - ANCHORLESS (`ALL`, `RSTAR`, ...): `camelize_code`, the bare module name.
 *
 *  The lexicon dependency is load-bearing and matches
 *  virtual-set-modules.ts's own note: an UNRESOLVED anchor really does mean
 *  "no module". Before the name environment is installed every anchored token
 *  returns null, which is why the page-seating walk recomputes set keys from
 *  the name (virtual-set-modules.ts#isVirtualSetCardName) while the render
 *  walk here reads the tokens the engine already put on the card. */
export function setModuleShortnameForToken(token: string): string | null {
  const selfToken = rubySelfToken(token);
  if (selfToken === null) return null;
  if (selfToken !== token && selfToken.startsWith("SELF-")) {
    return safeKeyToModuleShortname(selfToken);
  }
  const resolved = anchorCodenames(selfToken ?? token);
  if (resolved === undefined || resolved === null) return null;
  const anchored = selfToken ?? token;
  const code = anchored.slice(0, anchored.indexOf("-")).toLowerCase();
  return moduleShortnameForCodenames(code, resolved.codenames);
}

/** Every set module in the card's chain, most-general-first (the input
 *  token order, pattern/all.rb:40-42 `patterns.map(&:safe_key).reverse * " "`).
 *  Tokens that build no module contribute nothing. */
export function setModuleShortnamesForSetKeys(setKeys: string): string[] {
  const out: string[] = [];
  for (const token of setKeys.split(/\s+/)) {
    if (token === "") continue;
    const shortname = setModuleShortnameForToken(token);
    if (shortname !== null) out.push(shortname);
  }
  return out;
}

/** Is the set module the set PATH names in this card's chain?
 *
 *  `setKeys` is the card's own `safe_set_keys` (RenderCard.setKeys). An EMPTY
 *  chain is the "no set applies" answer and yields false: the engine has not
 *  computed the card's tokens (a synthetic rig, or a card rendered before the
 *  name environment is installed), so Ruby could not have built a module key
 *  either.
 *
 *  WHY THE FOLLOW FAMILY DECLARES THIS AND THE DATE FAMILY DOES NOT — the
 *  measured reason, not a preference:
 *
 *  Both shapes answer `Right::<Anchor>` here. MEASURED on the synthetic-v1
 *  fixture with the name environment installed:
 *
 *    Home+*followers      -> Right::Followers
 *    Home+*when created   -> Right::WhenCreated
 *    Home+*when last edited -> Right::WhenLastEdited
 *
 *  So switching a registration to this predicate turns its override ON for
 *  every real starred card whose anchor codename matches — for the date
 *  family that is every real `+*when created` / `+*when last edited` card,
 *  which no lane has measured against the oracle. Worse, the two families
 *  register in the order date-then-follow (MEASURED: the loader's
 *  contentOverrideRegistry().paths() is
 *  ["right/when_created","right/when_last_edited","self/now","right/followers","type_plus_right/user/follow"])
 *  and resolveContentOverrideEntry keeps the LAST match, so a predicate loose
 *  enough to match BOTH families silently SHADOWS the date overrides rather
 *  than failing loudly.
 *
 *  That is why this is opt-in per set module and why the follow route read is
 *  the only caller. The date surface keeps its present verdict — including
 *  the fact that a real `+*when created` card does not currently reach
 *  `right/when_created` — which is the date lane's surface to measure, not
 *  this one's to change. */
export function cardInSetModule(setPath: string, setKeys: string): boolean {
  if (setKeys.trim() === "") return false;
  const wanted = setModuleShortname(setPath);
  for (const shortname of setModuleShortnamesForSetKeys(setKeys)) {
    if (shortname === wanted) return true;
  }
  return false;
}
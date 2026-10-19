// virtual-set-modules.ts — the set-module `virtual?` registry: the set files
// that declare `def virtual?; new?; end` make every UNSAVED card in their
// set-module chain a VIRTUAL card, and a virtual card is KNOWN
// (card-1.110.0 mod/core/set/all/states.rb:44-50 `known? : real? || virtual?`),
// so the page renders it through its OWN views instead of substituting the
// create form.
//
// The mechanism this ports:
//   - `virtual?` (states.rb:44-50) reads `structure.present?` for the ordinary
//     case; the follow gem OVERRIDES it per set module (right/followers.rb:22-24
//     `def virtual?; new?; end`, right/following.rb:4-6, type_plus_right/
//     user/follow.rb:8-10, type_plus_right/user/email.rb:1-3). states.rb's own
//     comment calls the override "established practice".
//   - `unknown?` (states.rb, the next method) is `!known?`.
//   - card-mod-format set/all/html/error.rb:82-84 `page_view_for_unknown:
//     ok?(:create) ? :new : super` — the create-form substitution fires ONLY
//     for an unknown card, so a virtual card never reaches it.
//
// WITHOUT this registry the port renders the create form for
// `/<card>+*followers` and `/<User>+*follow`; MEASURED against the stock Ruby
// oracle (decko 0.20.0 / card 1.110.0 / card-mod-follow-0.20.0) on the
// synthetic-v1 fixture, the oracle answers those two addresses with their own
// views (`Ada Admin+*followers` -> the followers list naming "Mira Member";
// `Ada Admin+*follow` -> the Follow/Ignore tabs) while
// `/Ada_Admin+*follow/content` renders the create form — because that card is
// a `<RichText>+*follow` junction, whose set module (Right::Follow) does NOT
// declare `virtual?`.
//
// The registry holds SET MODULE SHORTNAMES (the module-key spelling Ruby's
// module lookup compares — `Right::Followers`, `TypePlusRight::User::Follow`),
// NOT set paths: a card's set keys are converted to shortnames by the same
// `safeKeyToModuleShortname` the view-chain walk uses, so the two sides
// compare the same strings.
//
// SCOPE: the registry is populated by the mod loader from the manifest's
// `virtual` flag, and read synchronously by the name predicate below. Nothing
// here queries storage — the answer is a pure function of the name, the
// installed name environment, and the set paths that declared the override.

import { DeckoName } from "../name.js";
import { setModuleShortname } from "../mod-loader/mod-registrar.js";
import { safeSetKeys } from "../render/set-keys.js";
import { setModuleShortnameForToken } from "./set-module-membership.js";

/** The set-module shortnames whose Ruby file declares `virtual?`. Insertion
 *  order is load order; membership is what the predicate reads, so a later
 *  re-registration of the same shortname is idempotent (Set semantics). */
const virtualSetModuleShortnames = new Set<string>();

/** Record one set module as virtual-by-newness. `setPath` is the manifest's
 *  path under `set/` ("right/followers"); the registry keys the module-key
 *  spelling Ruby's `Pattern::Base#module_key` builds, which is what a card's
 *  safe_set_keys token converts to. */
export function registerVirtualSetModule(setPath: string): void {
  virtualSetModuleShortnames.add(setModuleShortname(setPath));
}

/** The registered virtual set-module shortnames (snapshot order = load order). */
export function virtualSetModuleShortnameList(): readonly string[] {
  return [...virtualSetModuleShortnames];
}

/** Drop every registration (the loader's load-generation reset; mirrors
 *  ContentOverrideRegistry#clear and SetModuleViewTable#clear). */
export function clearVirtualSetModules(): void {
  virtualSetModuleShortnames.clear();
}

/** What the predicate needs to know about the card beyond its NAME: the
 *  TYPE_PLUS_RIGHT pattern anchors on the LEFT card's type
 *  (mod/core/set_pattern/08_type_plus_right.rb:30-32
 *  `anchor_name card: "#{left_type(card)}+#{card.name.tag}"`), and
 *  quick_type's new-card fallback ("RichText") applies when the left cannot be
 *  resolved (set/pattern/class_methods.rb:59-71). */
export interface VirtualSetCardInput {
  /** the card's own type name (03_type.rb#anchor_name `card.type_name`); a
   *  NEW compound card has none until the *default/structure walk types it. */
  readonly typeName?: string;
  /** the left part's type name; undefined when the left could not be
   *  resolved, in which case set-keys.ts falls back to RichText. */
  readonly leftTypeName?: string;
}

/** Is this name VIRTUAL by the set-module override — i.e. does any set module
 *  in its chain declare `def virtual?; new?; end`?
 *
 *  Ruby's own answer is the singleton-chain lookup
 *  (`include_set_modules` -> `set_modules` -> each module's `virtual?`, the
 *  last-included winning; pattern/all.rb:44-47). The port walks the SAME chain
 *  the view dispatcher walks — `safeSetKeys` (set/pattern/all.rb:40-42
 *  `patterns.map(&:safe_key).reverse * " "`) then
 *  `setKeysToModuleChain` — and asks the registry, so a card is virtual exactly
 *  when a registered module is in its chain.
 *
 *  False for every simple name (a simple name has no junction, and Ruby's
 *  `virtual?` short-circuits `name.simple?` to false BEFORE the module chain is
 *  consulted — states.rb:47), and for a compound name whose chain holds no
 *  registered virtual module. */
export function isVirtualSetCardName(
  name: DeckoName,
  input: VirtualSetCardInput = {},
): boolean {
  if (!name.isCompound) return false; // states.rb:47 name.simple? -> false
  if (virtualSetModuleShortnames.size === 0) return false;
  const setKeys = safeSetKeys({
    name,
    typeId: undefined,
    typeName: input.typeName,
    leftTypeName: input.leftTypeName,
    isNew: true, // the fetch placeholder is a new card (pattern/all.rb:28)
  });
  if (setKeys.trim() === "") return false;
  for (const token of setKeys.split(/\s+/)) {
    if (token === "") continue;
    // Ruby's module lookup, exactly: setModuleShortnameForToken is the
    // shared token->module resolution (base.rb:21-29 module_key over :40-44
    // anchor_codenames, with the `|| break` nil arm).
    //
    // That nil is the arm that separates the STARRED address from the
    // UNSTARRED one: `*follow`'s lexicon key is `*follow`, so
    // `Ada Admin+*follow` resolves `Right::Follow` + `TypePlusRight::User::Follow`
    // (both in chain, the latter virtual); the plain card named "follow" is
    // not a lexicon key, so `Ada Admin+follow` resolves NOTHING and the card
    // stays unknown. MEASURED against the stock Ruby oracle: `Ada Admin+*follow`
    // answers the Follow/Ignore tabs, `Ada Admin+follow` answers the create
    // form.
    //
    // This is deliberately STRICTER than the view-chain walk's
    // `anchoredModuleCandidates`, whose name-spelling fallback exists for an
    // UNLOADED name environment (mod-registrar.ts DIVERGENCE 1); by render
    // time the environment is installed, so an unresolved anchor really does
    // mean "no module" here.
    const shortname = setModuleShortnameForToken(token);
    if (shortname !== null && virtualSetModuleShortnames.has(shortname)) {
      return true;
    }
  }
  return false;
}
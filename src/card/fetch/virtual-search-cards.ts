// Virtual-search-card resolution — the VirtualSearch family's `virtual?`
// override for the fetch/view pipeline.
//
// Ruby mechanism: card-mod-search-0.20.0 set/abstract/virtual_search.rb
// :11-12 overrides the states machine for every set that includes it —
//   def virtual?
//     new?
//   end
// — so a COMPOUND name whose right part is one of the family rights is
// KNOWN (virtual) whenever no row backs it, regardless of the *structure
// walk (mod/core set/all/states.rb:44-50, the base virtual? this engine's
// src/card/fetch/virtual-cards.ts ports; the Right-pattern module is more
// specific than the All-pattern base, so its override wins). The include
// also assigns the type: virtual_search.rb:14-16
//   def self.included klass
//     klass.assign_type :search_type
//   end
// so the virtual card is Search-typed, and the search it runs comes from
// the including file's `cql_content` method argument (a METHOD, not stored
// content — cql_search.rb:8-12 parses db_content as JSON only when the
// method is not overridden).
//
// The family (every set/right/*.rb file in card-mod-search-0.20.0 that
// includes Abstract::VirtualSearch — 15 parameterized files + count.rb,
// which carries the same three methods inline; mates.rb is FULLY COMMENTED
// OUT in the gem ("too slow on large databases") and is NOT a member):
//
//   by_create        {found_by: "_left", sort_by: "create"}
//   by_name          {found_by: "_left", sort_by: "name"}
//   by_update        {found_by: "_left", sort_by: "update"}
//   children         {part: "_left", sort_by: "name"}
//   count            {found_by: "_left", return: "count"}
//   created          {created_by: "_left", sort_by: "create", dir: "desc"}
//   creator          {creator_of: "_left"}
//   edited           {edited_by: "_left", sort_by: "name"}
//   editors          {editor_of: "_left", sort_by: "name"}
//   last_edited      {last_edited_by: "_left"}
//   linked_to_by     {link_to: "_left", sort_by: "name"}
//   links_to         {linked_to_by: "_left", sort_by: "name"}
//   nested_by        {nest: "_left", sort_by: "name"}
//   nests            {nested_by: "_left", sort_by: "name"}
//   referred_to_by   {refer_to: "_left", sort_by: "name"}
//   refers_to        {referred_to_by: "_left", sort_by: "name"}
//
// Membership is keyed on the right part's KEY in this engine's spelling
// (DeckoName.key keeps the leading "*", src/card/name.ts:68 NOT_OK_FOR_KEY).
// Ruby's Right-pattern applicability keys on the right card's CODENAME
// (pattern/base.rb:21-29); in the corpus deck the two coincide — each family
// setting is the starred codename card seeded from card-mod-search
// data/real.yml (e.g. `- :name: "*referred to by" / :codename: referred_to_by`,
// real.yml:101-106), so the starred name key is the codename card's own key.
//
// The serialized CQL is the virtual card's db_content: the engine's search
// dispatch (render.ts#runSearch over the card's content) reads it exactly
// where Ruby's cql_content method would answer the hash. The corpus's
// captured surface renders the family with ZERO results (the GIV page's
// `{{_self+*referred to by}}` nest: nothing refers to that tag), so the
// pre-executed search map is empty for it and the card_list view falls to
// the no_search_results bytes the oracle pins
// (`<div class="search-no-results"></div>`); a results-carrying member of
// this family would need the view-time CQL execution the sync view layer
// does not have (the same sync/async seam prepareNestClosureSearches
// documents in render.ts:2802-2808).

import { DeckoName } from "../name.js";

/**
 * right-part key (this engine's starred key spelling) -> the CQL the
 * virtual card's content carries, serialized in the gem file's own hash
 * order (the order is cosmetic for the engine's CQL parser but kept for
 * byte-honesty with the Ruby literal).
 */
export const VIRTUAL_SEARCH_CQL_BY_RIGHT_KEY: ReadonlyMap<string, string> =
  new Map([
    ["*by_create", '{"found_by":"_left","sort_by":"create"}'],
    ["*by_name", '{"found_by":"_left","sort_by":"name"}'],
    ["*by_update", '{"found_by":"_left","sort_by":"update"}'],
    ["*children", '{"part":"_left","sort_by":"name"}'],
    ["*count", '{"found_by":"_left","return":"count"}'],
    ["*created", '{"created_by":"_left","sort_by":"create","dir":"desc"}'],
    ["*creator", '{"creator_of":"_left"}'],
    ["*edited", '{"edited_by":"_left","sort_by":"name"}'],
    ["*editors", '{"editor_of":"_left","sort_by":"name"}'],
    ["*last_edited", '{"last_edited_by":"_left"}'],
    ["*linked_to_by", '{"link_to":"_left","sort_by":"name"}'],
    ["*links_to", '{"linked_to_by":"_left","sort_by":"name"}'],
    ["*nested_by", '{"nest":"_left","sort_by":"name"}'],
    ["*nests", '{"nested_by":"_left","sort_by":"name"}'],
    ["*referred_to_by", '{"refer_to":"_left","sort_by":"name"}'],
    ["*refers_to", '{"referred_to_by":"_left","sort_by":"name"}'],
  ]);

/**
 * The VirtualSearch family's virtual? decision for one name
 * (virtual_search.rb:11-12): a COMPOUND name whose right part is a family
 * right answers the cql_content serialization; everything else answers
 * undefined (the base states.rb walk — src/card/fetch/virtual-cards.ts —
 * stays the authority).
 */
export function virtualSearchCqlFor(name: DeckoName): string | undefined {
  if (!name.isCompound) return undefined; // virtual_search virtual? needs the Right set
  const rightKey = name.rightName?.key;
  if (rightKey === undefined) return undefined;
  return VIRTUAL_SEARCH_CQL_BY_RIGHT_KEY.get(rightKey);
}

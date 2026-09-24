// Virtual-card resolution for the fetch layer — the port of the Ruby state
// machine that lets `Card.fetch` return a card for a compound name that has
// NO database row reachable by name.
//
// Why compound names are unreachable by name (the corpus-proven mechanism):
// Ruby resolves a compound name mark through the Lexicon
// (lib/card/fetch/retrieve.rb:43-45 `id_from_mark` -> Lexicon.id), and the
// Lexicon's compound path (lib/card/lexicon.rb#name_to_lex) resolves
// [id(left), id(right)] then queries `cards` by left_id/right_id — NEVER by
// the junction's own key. A junction row whose left_id/right_id are NULL (an
// orphan row: name+key stored, sides absent) is therefore invisible to
// name-based fetch in Ruby. The recaptured corpus deck contains 9,739 such
// orphan junction rows, and the 25 id:null disputed records are exactly names
// whose rows are orphans: Ruby fetches them as VIRTUAL cards
// (capture-disputed-corpus.rb records card.id == null), while the TS port
// returned "card not in seeded deck".
//
// The Ruby chain this module ports, for a compound name mark with no db row:
//
// 1. fetch/store.rb#new_for_cache (21-28): a placeholder `Card.new(name:
//    mark)` is instantiated (the TS FetchEngine already does this).
// 2. fetch/results.rb#new_result_card (16-23): the placeholder is returned
//    only when `card.known?` — mod/core/set/all/states.rb:52-55:
//    `real? || virtual?`.
// 3. states.rb:44-50 `virtual?`: `real? || name.simple? ? false :
//    structure.present?` — compound + a structure rule decides.
// 4. card-mod-content set/all/templating.rb:40-42 `structure` ->
//    #template -> #new_card_template (:19-33): the applicable *structure
//    rule card (`structure_rule_card`, :44-48 — the FIRST existing
//    <set>+*structure candidate in pattern-precedence order, NIL-ed when its
//    content strips to "_self"; the walk does not continue). A NULL-content
//    rule still counts as structure (structure.present? is about the rule
//    CARD; only structured_content falls through nil).
// 5. mod/core/set/all/type.rb:60-79 `ensure_type_id`: for a compound name
//    whose right part is not a type-assigning set anchor (the only core
//    registration is right/*autoname -> :phrase, set/right/autoname.rb:1;
//    the account/email/date/edit mods register a handful more), the type
//    falls to `type_id_from_template` (:78-80) — the rule card's own
//    type_id. The corpus disputed set exercises exactly this branch:
//    `<left>+ytyovdhppytn` cards take the `ytyovdhppytn+*right+*structure`
//    rule card's type (Basic), `X+*self` / `X+*right` cards take the
//    `*self|*right+*right+*structure` rule card's type (Set).
//
// The lookup is wired by the storage factory (the corpus seeding), not by
// FetchEngine itself: the structure universe is a deck-wide statement the
// engine loads lazily for renders; the fetch layer stays storage-shaped and
// takes the resolution as an injected hook (FetchEngine.virtualCardLookup).
// `skip_virtual` fetches (Card[] / quick_fetch) never consult the hook —
// results.rb:28-30 returns before known? is evaluated.

import { DeckoName } from "../name.js";
import { ruleNamesForCard } from "../set-patterns/rule-names.js";
import type { PatternCardInput } from "../set-patterns/types.js";
import { STRUCTURE_SETTING_NAME } from "../rules/structure.js";
import type { FetchEngine } from "../fetch.js";

/** What a successful virtual resolution contributes to the placeholder
 *  record: the applicable structure rule card's db_content (the template —
 *  content/all.rb:8-10 `structured_content || standard_content`, where the
 *  virtual card's standard_content is empty) and the rule card's type_id
 *  (type.rb:78-80 type_id_from_template). */
export interface VirtualCardResolution {
  /** The winning *structure rule card's composed key (diagnostics). */
  ruleKey: string;
  /** The rule template: the rule card's db_content verbatim; a NULL-content
   *  rule resolves to "" (content/all.rb:17-19 — Ruby content nil -> ""). */
  templateContent: string;
  /** type.rb:78-80 — the rule card's type_id (undefined when the universe
   *  row predates the type column; the placeholder then keeps its nil). */
  typeId?: number;
}

export interface StructureUniverseMaps {
  /** composed rule key -> the rule card's db_content (null = NULL). */
  contents: Map<string, string | null>;
  /** composed rule key -> the rule card's own type_id. */
  ruleTypeIds: Map<string, number>;
}

/**
 * The virtual? walk for one name (states.rb:44-50 + templating.rb:40-48):
 * compound names only; the candidate rule names in pattern-precedence order
 * for a NEW card (pattern/all.rb#patterns drops the SELF pattern for new
 * cards — the placeholder is new); the FIRST candidate that exists in the
 * universe decides. "_self" content (Ruby strip) nils the structure exactly
 * like structure_rule_card's ternary — without continuing the walk. NULL
 * content keeps the structure (content falls to "" per content/all.rb).
 *
 * `leftTypeName`, when the caller resolved the name's left card, feeds the
 * *type plus right candidates' anchor (the same field the render engine's
 * structurePatternInputFor passes). *type candidates are NOT derivable here:
 * the card's own type is what this walk is computing (Ruby evaluates them
 * against the dup's provisional type — templating.rb:25-27 — a shape no
 * corpus rule exercises; see the module doc's type note).
 */
export function resolveVirtualCardStructure(
  name: DeckoName,
  universe: StructureUniverseMaps,
  leftTypeName?: string,
): VirtualCardResolution | undefined {
  if (!name.isCompound) return undefined; // states.rb:45 virtual? needs a junction
  if (universe.contents.size === 0) return undefined;
  const patternInput: PatternCardInput = {
    name,
    isNew: true, // the fetch placeholder is a new card (pattern/all.rb#patterns)
    ...(leftTypeName !== undefined ? { leftTypeName } : {}),
  };
  const candidates = ruleNamesForCard(patternInput, STRUCTURE_SETTING_NAME);
  for (const candidate of candidates) {
    const key = DeckoName.parse(candidate).key;
    if (!universe.contents.has(key)) continue;
    const content = universe.contents.get(key) ?? null;
    if (content !== null && content.trim() === "_self") return undefined; // :48 ternary
    return {
      ruleKey: key,
      templateContent: content ?? "", // structured_content nil -> standard ""
      typeId: universe.ruleTypeIds.get(key),
    };
  }
  return undefined;
}

/**
 * The FetchEngine.virtualCardLookup hook over a loaded universe: resolves
 * the left card's type name through the fetcher (cache-first; the left of a
 * virtual name is usually a seeded real card — and when it is itself
 * virtual, the fetch hook recursion answers it, the chain strictly
 * shrinking) and runs the walk above.
 */
export function createVirtualCardLookup(
  fetcher: FetchEngine,
  universe: StructureUniverseMaps,
): (name: DeckoName) => Promise<VirtualCardResolution | undefined> {
  return async (name: DeckoName): Promise<VirtualCardResolution | undefined> => {
    let leftTypeName: string | undefined;
    if (name.isCompound) {
      const leftKey = name.leftName?.key;
      if (leftKey !== undefined && leftKey !== "") {
        const left = await fetcher.fetchByName(leftKey);
        if (left?.typeId !== undefined) {
          // type.rb:34-36 type_name: quick_fetch(type_id)&.name — cache-first
          const typeCard = await fetcher.fetchById(left.typeId);
          leftTypeName = typeCard?.name?.s;
        }
      }
    }
    return resolveVirtualCardStructure(name, universe, leftTypeName);
  };
}

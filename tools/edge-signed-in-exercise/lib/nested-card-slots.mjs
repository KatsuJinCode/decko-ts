// nested-card-slots.mjs — "did this page render a slot for THIS card?",
// answered the way the ENGINE answers it.
//
// THE DEFECT THIS PINS. A card's KEY is not its name. Ruby's
// `Cardname#simple_key` (cardname-1.110.0 lib/cardname.rb:106-118) is
//
//     decoded.underscore.gsub(/[^#{OK4KEY_RE}]+/, "_").split(/_+/)
//       .reject(&:empty?).map { |key| stable_key(key) }.join("_")
//
// and `Variants#stable_key` (lib/cardname/variants.rb:56-62) applies the
// deck's uninflect method - `:singularize` by default
// (lib/cardname.rb:34) - once, keeping the original word when the result is
// not idempotent. ActiveSupport's default singular rules include
// `inflect.singular(/s$/i, "")` (active_support/inflections.rb:35), so a
// card named "Harness_CF_Chain_A_mviramas" has the KEY
// "harness_cf_chain_a_mvirama": the name's last word, singularized.
//
// A rendered nest slot carries that KEY in its `SELF-` class token
// ("card-slot content-view ALL TYPE-rich_text SELF-harness_cf_chain_a_...")
// and the card's NAME beside it (`data-card-name="Harness_CF_Chain_A_..."`).
// An instrument that graded the token against the name therefore failed on
// a page the engine had rendered correctly - and it failed only when the
// name ended in a letter the singularize rule changes, so it was a
// once-in-a-36-runs flake, not a red the battery could be trusted about.
//
// THE RULE. A slot says which card it is in `data-card-name`, the name the
// engine itself states. Grade that, and never the derived key.

/**
 * The cards a rendered page's slots say they are, as the engine states them.
 * @param {{ name?: string|null, token?: string|null }[]} slots
 * @returns {string[]} the card names, in the order the slots carry them
 */
export function slotCardNames(slots) {
  return (Array.isArray(slots) ? slots : [])
    .map((slot) => slot?.name)
    .filter((name) => typeof name === "string" && name !== "");
}

/**
 * True when the page rendered a slot for this card.
 * @param {{ name?: string|null }[]} slots
 * @param {string} cardName the card's own name
 */
export function rendersNestedCard(slots, cardName) {
  if (typeof cardName !== "string" || cardName === "") return false;
  const wanted = cardName.toLowerCase();
  return slotCardNames(slots).some((name) => name.toLowerCase() === wanted);
}

/**
 * The same question for a list of cards, in the list's order.
 * @param {{ name?: string|null }[]} slots
 * @param {string[]} cardNames
 */
export function nestedCardsRendered(slots, cardNames) {
  return (Array.isArray(cardNames) ? cardNames : []).map((name) => rendersNestedCard(slots, name));
}

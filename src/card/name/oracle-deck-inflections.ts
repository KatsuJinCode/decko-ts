/**
 * THE CARD GEM'S OWN INFLECTION INITIALIZER (neither an engine default nor any
 * one deck's configuration).
 *
 * The table below is a port of `card-1.110.0 config/initializers/inflections.rb`
 * — the card gem's own initializer, which EVERY Decko deck loads. It is not
 * configuration particular to a single deck; the constant is named for where
 * the rules come from, and the PROVENANCE section below carries the upstream
 * lines verbatim.
 *
 * Every deck-serving origin MUST apply this table at boot, BEFORE any name is
 * parsed or any row is primed — the same moment a Rails deck's
 * config/initializers/inflections.rb runs — via
 *
 *   applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);   // src/card/name/inflect.ts
 *
 * Origins that skip the boot call key parenthesized and possessive names
 * differently from the stored keys: the CQL name resolver then substitutes
 * Ruby's unresolvable-name sentinel (-999), and every plus-join against those
 * junctions returns zero rows — which is what a nest section renders as
 * "0 results". A deck whose stored keys were written WITHOUT this table is
 * unreachable by name in Ruby as well: Card.fetch(name) and Card.exist?(name)
 * miss every such row, fetch by id still finds it, and a new card of the same
 * name can be created beside it.
 *
 * PROVENANCE. This is the card gem's own initializer, which every Decko deck
 * loads: card-1.110.0 config/initializers/inflections.rb
 *
 *   inflect.irregular "grave", "graveyard"
 *   inflect.uncountable "this"
 *   inflect.uncountable "anonymous"
 *   inflect.uncountable "s"
 *   inflect.singular(/(ss)$/i, '\1')
 *   inflect.plural(/(ss)$/i, '\1')
 *
 * The three uncountables are the words that show up uncounted in stored deck
 * keys (lone "s": "Father's Day" -> father_s_day; "this": delete_this;
 * "anonymous").
 * The irregular is what keys "Graveyard" as "grave" (and leaves "Graveyards"
 * unchanged, because cardname's stable-key rule refuses a key whose own key
 * differs). Inflections#irregular expands to the rules below, in definition
 * order (activesupport-7.2 inflections.rb#irregular, same first letter case):
 * plural /(g)rave$/ and /(g)raveyard$/ -> "\1raveyard", singular /(g)rave$/
 * and /(g)raveyard$/ -> "\1rave". The ss rules repeat ActiveSupport's own
 * defaults at higher priority, which changes no key; they are carried so the
 * table reads like its source.
 *
 * Verification: tests/card/name/oracle-deck-inflections.test.ts.
 */

import type { DeckInflectionConfig } from "./inflect.js";

export const CARD_GEM_INITIALIZER_INFLECTIONS: DeckInflectionConfig = {
  uncountables: ["s", "this", "anonymous"],
  singular: [
    [/(g)rave$/i, "$1rave"],
    [/(g)raveyard$/i, "$1rave"],
    [/(ss)$/i, "$1"],
  ],
  plural: [
    [/(g)rave$/i, "$1raveyard"],
    [/(g)raveyard$/i, "$1raveyard"],
    [/(ss)$/i, "$1"],
  ],
};

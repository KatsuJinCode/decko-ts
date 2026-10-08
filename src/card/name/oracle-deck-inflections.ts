/**
 * THE DECK'S INFLECTION TABLE (deck-boot data, not engine defaults).
 *
 * Every deck-serving origin MUST apply this table at boot, BEFORE any name is
 * parsed or any row is primed — the same moment a Rails deck's
 * config/initializers/inflections.rb runs — via
 *
 *   applyDeckInflections(ORACLE_DECK_INFLECTIONS);   // src/card/name/inflect.ts
 *
 * Origins that skip the boot call key parenthesized and possessive names
 * differently from the stored corpus keys: the CQL name resolver then
 * substitutes Ruby's unresolvable-name sentinel (-999) and every plus-join
 * against those junctions returns zero rows (2026-09-25 staging defect:
 * Person+Project(s) Participating sections rendered "0 results" site-wide).
 * A deck whose stored keys were written WITHOUT this table is unreachable by
 * name in Ruby as well: Card.fetch(name) and Card.exist?(name) miss every such
 * row, fetch by id still finds it, and a new card of the same name can be
 * created beside it.
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
 * The three uncountables are what a census of the capture deck's stored keys
 * shows (lone "s": "Father's Day" -> father_s_day; "this": delete_this;
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
 * Verification: tests/card/name/oracle-deck-inflections.test.ts, and the
 * semantics parity probe (tools/oracle/semantics-answer*.{rb,ts}).
 */

import type { DeckInflectionConfig } from "./inflect.js";

export const ORACLE_DECK_INFLECTIONS: DeckInflectionConfig = {
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

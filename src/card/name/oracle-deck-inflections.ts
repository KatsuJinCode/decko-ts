/**
 * THE DEPLOYED DECK'S INFLECTION TABLE (deck-boot data, not engine defaults).
 *
 * This is the production home of the inflection amendments the deployed deck
 * (the Culturesmith production corpus this repo serves) computes card keys
 * under. Every deck-serving origin MUST apply this table at boot, BEFORE any
 * name is parsed or any row is primed — the same moment a Rails deck's
 * config/initializers/inflections.rb runs — via
 *
 *   applyDeckInflections(ORACLE_DECK_INFLECTIONS);   // src/card/name/inflect.ts
 *
 * Origins that skip the boot call key parenthesized and possessive names
 * differently from the stored corpus keys: the CQL name resolver then
 * substitutes Ruby's unresolvable-name sentinel (-999) and every plus-join
 * against those junctions returns zero rows (2026-09-25 staging defect:
 * Person+Project(s) Participating sections rendered "0 results" site-wide).
 *
 * PROVENANCE. The deck's Rails initializer is not on disk (the oracle app
 * tools/oracle/decko-oracle-app ships stock cardname 0.20.0 / card 1.110.0
 * from rubygems, no config/initializers/, no inflecting mod), so the table
 * was RECOVERED FROM THE STORED KEYS: a census of all 9,466 simple-key rows
 * in the dual-lane capture db (tmp/raw-ground-truth/capture-db-corpus-v2.sqlite3)
 * against the engine's gem-faithful default algorithm diverges on exactly 105
 * rows, and every divergence is explained by three words surviving
 * singularization that the default /s$/ rule strips:
 *
 *   lone "s"      "Brandon's" -> brandon_s   (default: brandon_ - the
 *                 apostrophe split leaves an "s" part; singularize("s") = "")
 *   "this"        "delete this" -> delete_this (default: delete_thi)
 *   "anonymous"   Anonymous -> anonymous     (default: anonymou)
 *
 * Default ActiveSupport singularization is unchanged everywhere else in the
 * corpus: musings->musing, participants->participant, is->i, lies->ly,
 * does->do, children->child all agree row-for-row. The minimal config that
 * reproduces all 9,466 stored keys is the default English table plus these
 * three uncountables - expressible in Rails as
 *
 *   ActiveSupport::Inflector.inflections { |i| i.uncountable %w(s this anonymous) }
 *
 * Verification: re-running the census with this config applied reports ZERO
 * divergent keys (tmp/raw-ground-truth scripts,
 * inflect-census-key-divergence.test.ts; the productionized pins live in
 * tests/card/name/oracle-deck-inflections.test.ts).
 */

import type { DeckInflectionConfig } from "./inflect.js";

export const ORACLE_DECK_INFLECTIONS: DeckInflectionConfig = {
  uncountables: ["s", "this", "anonymous"],
};

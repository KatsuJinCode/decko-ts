// oracle-deck-inflection-config.ts -- the ORACLE DECK's inflection amendments
// as DECK DATA (the deck-data counterpart of src/card/name/inflect.ts's
// applyDeckInflections seam; never import this file from src/).
//
// PROVENANCE. The deck that produced the recorded ground truth
// computed card keys under a non-default inflection config. Its Rails
// initializer is not on disk (tools/oracle/decko-oracle-app ships stock
// cardname 0.20.0 / card 1.110.0 from rubygems, no config/initializers/, no
// inflecting mod), so the table below was RECOVERED FROM THE STORED KEYS: a
// census of all 9,466 simple-key rows in the recorded deck database (the db
// the oracle app rendered the recorded captures from) against the engine's
// gem-faithful default algorithm diverges on exactly 105 rows, and every
// divergence is explained by three words surviving singularization that the
// default /s$/ rule strips:
//
//   lone "s"      a possessive form ("<name>'s" -> <name>_s; default:
//                 <name>_ — the apostrophe split leaves an "s" part;
//                 singularize("s") = "")
//   "this"        "delete this" -> delete_this (default: delete_thi)
//   "anonymous"   Anonymous -> anonymous     (default: anonymou)
//
// Default ActiveSupport singularization is unchanged everywhere else in the
// corpus: musings->musing, participants->participant, is->i, lies->ly,
// does->do, children->child all agree row-for-row. The minimal config that
// reproduces all 9,466 stored keys is the default English table plus these
// three uncountables - expressible in Rails as
//
//   ActiveSupport::Inflector.inflections { |i| i.uncountable %w(s this anonymous) }
//
// Verification: re-running the census with this config applied must report
// ZERO divergent keys (see inflect-census-key-divergence.test.ts).

import type { DeckInflectionConfig } from "../../src/card/name/inflect.js";
import { applyDeckInflections } from "../../src/card/name/inflect.js";

export const CARD_GEM_INITIALIZER_INFLECTIONS: DeckInflectionConfig = {
  uncountables: ["s", "this", "anonymous"],
};

/** Deck-boot moment for oracle-ground-truth tooling: idempotent, safe to call
 * before seeding (a Rails initializer runs before any request, and the
 * seam drops all memoized DeckoName keys when applied). */
export function bootOracleDeckInflections(): void {
  applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
}

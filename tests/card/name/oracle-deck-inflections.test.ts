/**
 * The deck's inflection table (src/card/name/oracle-deck-inflections.ts).
 *
 * The deck-serving origins apply CARD_GEM_INITIALIZER_INFLECTIONS at boot (the Rails
 * config/initializers/inflections.rb moment) so the engine keys names exactly
 * as the deck's stored keys spell them. The stakes, concretely: WITHOUT the
 * boot call the engine computes
 * `participant_` for "Participant(s)" (the default /s$/ singularization
 * strips the lone "s" segment), while the deck stores `participant_s` —
 * the CQL plus-join resolved through DeckoName keying then falls back to
 * Ruby's -999 sentinel and every "+Item(s) Listing" section
 * renders "0 results".
 *
 * These pins hold the REAL deck table (not a synthetic one — the seam
 * mechanics with synthetic tables live in deck-inflection-config.test.ts).
 */

import { afterEach, describe, expect, it } from "vitest";
import { DeckoName } from "../../../src/card/name.js";
import {
  applyDeckInflections,
  resetDeckInflections,
} from "../../../src/card/name/inflect.js";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../../../src/card/name/oracle-deck-inflections.js";

afterEach(() => {
  resetDeckInflections();
});

describe("oracle deck inflection table (deployed deck boot data)", () => {
  it("default tables diverge from the corpus exactly on the recovered words", () => {
    resetDeckInflections();
    // the DEFAULT-engine keys — the byte shapes that make plus-joins
    // return zero rows
    expect(DeckoName.parse("Participant(s)").key).toBe("participant_");
    expect(DeckoName.parse("Item(s) Listing").key).toBe("item__listing");
    expect(DeckoName.parse("Page's").key).toBe("page_");
  });

  it("keys parenthesized junction names exactly as the corpus stores them", () => {
    applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
    // the deck-stored keys
    expect(DeckoName.parse("Participant(s)").key).toBe("participant_s");
    expect(DeckoName.parse("Item(s) Listing").key).toBe("item_s_listing");
    // A trailing-s surname segment: the default Ruby rules singularize it
    // ("Sims" -> "sim"), and the deck table changes nothing outside the
    // three deck uncountables — this pin proves the table is not
    // over-broad. The surname is synthetic, in the same trailing-s
    // inflection class the rule under test handles.
    expect(DeckoName.parse("Row Sims").key).toBe("row_sim");
    expect(
      DeckoName.parse("Row Sims+Item(s) Listing").key,
    ).toBe("row_sim+item_s_listing");
    // the possessive family (Page's -> page_s)
    expect(DeckoName.parse("Page's").key).toBe("page_s");
  });

  it("protects the other two recovered uncountables and nothing else", () => {
    applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
    expect(DeckoName.parse("delete this").key).toBe("delete_this");
    expect(DeckoName.parse("Anonymous").key).toBe("anonymous");
    // every other default singularization still fires under the deck table
    expect(DeckoName.parse("Participants").key).toBe("participant");
    expect(DeckoName.parse("musings").key).toBe("musing");
  });

  it("carries the card gem's irregular grave/graveyard (Ruby keys pinned)", () => {
    // card-1.110.0 config/initializers/inflections.rb `inflect.irregular
    // "grave", "graveyard"`; expected keys are cardname 0.20.0's output with
    // that initializer loaded. "Graveyards" stays whole: singularizing twice
    // gives graveyard -> grave, an unstable key, which cardname refuses.
    applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
    expect(DeckoName.parse("Graveyard").key).toBe("grave");
    expect(DeckoName.parse("Graveyards").key).toBe("graveyards");
    expect(DeckoName.parse("Grave").key).toBe("grave");
    expect(DeckoName.parse("Graves").key).toBe("grafe");
    expect(DeckoName.parse("Glass").key).toBe("glass");
    expect(DeckoName.parse("Classes").key).toBe("class");
  });
});

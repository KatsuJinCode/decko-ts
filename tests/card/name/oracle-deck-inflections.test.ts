/**
 * The deployed deck's inflection table (src/card/name/oracle-deck-inflections.ts).
 *
 * The deck-serving origins apply CARD_GEM_INITIALIZER_INFLECTIONS at boot (the Rails
 * config/initializers/inflections.rb moment) so the engine keys names exactly
 * as the corpus's live Ruby stored them. The 2026-09-25 staging defect made
 * the stakes concrete: WITHOUT the boot call the engine computes
 * `participant_` for "Participant(s)" (the default /s$/ singularization
 * strips the lone "s" segment), while the corpus stores `participant_s` —
 * the CQL plus-join resolved through DeckoName keying then fell back to
 * Ruby's -999 sentinel and every "+Project(s) Participating" section
 * rendered "0 results" site-wide.
 *
 * These pins hold the PRODUCTION table (not a synthetic one — the seam
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
    // the DEFAULT-engine keys — the byte shapes that made the staging
    // plus-joins return zero rows (projects-data-fix.md defect 1)
    expect(DeckoName.parse("Participant(s)").key).toBe("participant_");
    expect(DeckoName.parse("Project(s) Participating").key).toBe("project__participating");
    expect(DeckoName.parse("Casey's").key).toBe("casey_");
  });

  it("keys parenthesized junction names exactly as the corpus stores them", () => {
    applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
    // the corpus-stored keys (live Ruby's bytes, cards 406 / 420 / Casey's
    // virtual participating section)
    expect(DeckoName.parse("Participant(s)").key).toBe("participant_s");
    expect(DeckoName.parse("Project(s) Participating").key).toBe("project_s_participating");
    // card 393's stored key (dual-lane capture db): live Ruby singularizes a
    // trailing-s surname segment under the SAME default rules — the deck table
    // changes nothing outside the three recovered uncountables. The corpus
    // owner's own name is masked, so the pin carries a synthetic surname in
    // the same inflection class ("Simmons" -> "simmon", the shape the corpus
    // row exercised); the rule under test is unchanged.
    expect(DeckoName.parse("Casey Simmons").key).toBe("casey_simmon");
    expect(
      DeckoName.parse("Casey Simmons+Project(s) Participating").key,
    ).toBe("casey_simmon+project_s_participating");
    // the possessive family (Casey's -> casey_s) site-wide
    expect(DeckoName.parse("Casey's").key).toBe("casey_s");
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

// virtual-search-family-virtual-decision.test.ts -- the gem-anchored-closure
// port's regression net for the VirtualSearch family (FIX A): a nest whose
// target compound name has NO row still renders when the right part is one
// of the 16 card-mod-search virtual-search rights.
//
// MECHANISM (gem-cited): card-mod-search-0.20.0 set/abstract/virtual_search.rb
// :11-12 overrides the states machine for every set that includes it --
//   def virtual?
//     new?
//   end
// -- so `X+*referred to by`-shaped names are virtual-KNOWN on a fetch miss
// (the Right-pattern override beats the base states.rb walk this engine's
// src/card/fetch/virtual-cards.ts ports), Search-typed (:14-16
// assign_type :search_type), carrying the including file's cql_content.
// alter_unknown never fires (view/permission.rb:37 `return if card.known?`)
// and the requested view renders normally: for :content that is the search
// card_list, whose zero-result branch is the no_search_results bytes
// (`<div class="search-no-results"></div>`).
//
// ORACLE the corpus pins (expected-v2 page-lane, GIV-the god of intimate
// violence): the engine used to substitute the nest to the :unknown view
// (renders ""), dropping the slot entirely; the fixed render is
// BYTE-IDENTICAL to the oracle page (the env-gated corpus suite
// gem-anchored-residual-pages-byte-parity.test.ts pins the whole page).
//
// The fixture-less blocks here run in the ordinary net (no corpus, no env
// gate): the family table against the gem files' own cql_content literals,
// and the live nest-render mechanism on a seeded mini-deck.

import { describe, expect, it } from "vitest";
import {
  VIRTUAL_SEARCH_CQL_BY_RIGHT_KEY,
  virtualSearchCqlFor,
} from "../../../src/card/fetch/virtual-search-cards.js";
import { DeckoName } from "../../../src/card/name.js";
import { createRenderTestStorage, seedCard } from "./render-test-storage.js";

describe("VirtualSearch family table (card-mod-search-0.20.0 set/right/*.rb)", () => {
  it("carries exactly the 16 gem members with each file's own cql_content", () => {
    // Every include_set Abstract::VirtualSearch file's literal + count.rb's
    // inline cql_content; mates.rb is fully commented out in the gem
    // ("too slow on large databases") and must NOT appear.
    expect([...VIRTUAL_SEARCH_CQL_BY_RIGHT_KEY.entries()].sort()).toEqual(
      [
        ["by_create", '{"found_by":"_left","sort_by":"create"}'],
        ["by_name", '{"found_by":"_left","sort_by":"name"}'],
        ["by_update", '{"found_by":"_left","sort_by":"update"}'],
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
      ].sort(),
    );
  });

  it("decides virtual? per virtual_search.rb:11-12 (compound + family right only)", () => {
    // The GIV corpus nest: compound, family right -> the cql serialization.
    expect(
      virtualSearchCqlFor(
        DeckoName.parse("GIV_the_god_of_intimate_violence+*referred_to_by"),
      ),
    ).toBe('{"refer_to":"_left","sort_by":"name"}');
    // Simple names never match (the Right set needs a left part).
    expect(virtualSearchCqlFor(DeckoName.parse("*referred_to_by"))).toBeUndefined();
    // Compound names outside the family stay with the base states walk.
    expect(virtualSearchCqlFor(DeckoName.parse("X+discussion"))).toBeUndefined();
    expect(virtualSearchCqlFor(DeckoName.parse("X+*mates"))).toBeUndefined(); // commented out in the gem
    expect(virtualSearchCqlFor(DeckoName.parse("X+*head"))).toBeUndefined();
  });
});

describe("VirtualSearch family nest render (seeded mini-deck)", () => {
  it("renders the family nest as a Search-typed content view with no results", async () => {
    const storage = await createRenderTestStorage();
    try {
      // The type card (codename search_type -> peekIdByCodename) and the
      // setting card (codename referred_to_by) - the corpus seeds both from
      // card-mod-search data/real.yml; the fixture deck mirrors the shape.
      await seedCard(storage, {
        id: 901,
        name: "Search",
        codename: "search_type",
        typeId: 2,
      });
      await seedCard(storage, {
        id: 902,
        name: "*referred to by",
        codename: "referred_to_by",
        typeId: 2,
      });
      // The left card the nest relativizes against + the host whose content
      // carries the nest (the GIV page shape: "Used as a tag for:" then the
      // bare `{{_self+*referred to by}}`).
      await seedCard(storage, {
        id: 903,
        name: "tag target",
        typeId: 2,
        dbContent: "tag body",
      });
      await seedCard(storage, {
        id: 904,
        name: "tag host",
        typeId: 2,
        // The GIV page's authored form is the bare `{{_self+*referred to by}}`
        // (the corpus's default_html_view :content then names the slot
        // content-view); the fixture deck's default nest view is :titled, so
        // the pin uses the explicit |content opt — the same view, named.
        dbContent: "Used as a tag for:\n{{_self+*referred to by|content}}",
      });
      const html = await storage.engine.render("tag host", "content");
      // The slot exists (the pre-fix engine dropped it to the unknown
      // substitution), the family nest renders the search zero-result
      // branch, and the virtual card carries the family type + set chain.
      expect(html).toContain("tag_host-Xreferred_to_by-content-view");
      expect(html).toContain('class="card-slot content-view');
      expect(html).toContain("TYPE-search");
      expect(html).toContain("RSTAR");
      expect(html).toContain("RIGHT-Xreferred_to_by");
      expect(html).toContain('<div class="search-no-results"></div>');
      expect(html).toContain('data-card-type-name="Search"');
      // The nest never substituted to the unknown view (which renders "").
      expect(html).not.toContain("unknown-view");
    } finally {
      storage.close();
    }
  });
});

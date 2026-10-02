// Unit pin for the blank nest reference (`{{}}`): Ruby's fetch layer returns
// NIL for a blank mark (lib/card/fetch.rb#retrieve_existing `return unless
// mark.present?` -> results.rb#results `return if card.nil?`). The nil card
// takes view/permission.rb:36-39's unknown arm, where alter_unknown
// (states.rb:52-58,65-67) returns the truthy :unknown view, so altered_view
// (format/error.rb:27-33) never reaches the :denial arm - the nest renders
// the empty-string view result, not a denial span.
//
// The frozen oracle SPLITS on this input and Ruby's own source trace decides
// it: shard-000006 entry 10488 renders its `{{}}` as nothing on both its
// content and open surfaces (source-truthful), while shard-000000 entry 636
// carries a denial span on open/page - the anomalous capture, per the wave-20
// denied-nest lane (tmp/wrong-goal-hunt/fix-denied-nest-bare-dot-lane.md),
// which measured the swap: this behavior takes 10488 to full byte equality
// and moves 636's open surface by exactly the one 76-byte denial region.
// (636's full entry is still not replayed in unknown-nest-corpus-replay
// because its slot classes carry the RULE set-key - observed-not-mine.)

import { describe, expect, it } from "vitest";
import { createRenderTestStorage, seedCard } from "./render-test-storage.js";

describe("blank nest reference ({{}})", () => {
  it("consumes the blank reference to nothing (Ruby's nil-card nest renders empty)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
      await seedCard(storage, {
        id: 900,
        name: "blank ref source",
        typeId: 2,
        dbContent: "<p>before{{}}after</p>",
      });
      const html = await storage.engine.render("blank_ref_source", "content");
      expect(html).toContain("<p>beforeafter</p>");
    } finally {
      storage.close();
    }
  });
});

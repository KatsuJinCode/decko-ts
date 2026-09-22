// Pointer / List cardtype content-view byte parity (stream M3).
//
// Pins the captured corpus:77 content-view bytes verbatim, plus a
// sister list-type entry (corpus:275, *all+*layout). Failing this test
// means the port's pointer/list rendering diverged from Ruby's
// standard_pointer_core + standard_pointer_items + listing_list
// + nest_item chain (card-mod-list-0.20.0 set/abstract/01_list/
// html_views.rb:6-30; card-mod-list set/all/item.rb#raw_item_strings,
// #listing_list; card-mod-format set/all/html.rb#default_item_view).
//
// The shape pinned here:
//   * outer content-view slot (captured Xhome-content-view)
//   * `<div class="card-list card-list-bar pointer-list">` wrapper
//     (standard_pointer_core's wrap_with :div, class: "card-list
//      card-list-#{item_view} pointer-list")
//   * per item: `<div class="pointer-item item-bar">…</div>` wrap
//     (html_views.rb#wrap_item with html default_item_view = :bar)
//   * inner item slot: `name-mini_bar-view`, slot class `mini_bar-view`
//     + data-slot's view field `bar` (the captured divergence Ruby's
//     bar-and-box rendering produces for items nested from inside a
//     pointer/list content view)
//
// Seeding: the v2 corpus's shard (fixtures/corpus/shard-000000.jsonl)
// does NOT include id=22281 (yzzw) — the yzzw card is in the oracle DB
// (the live corpus) but not in the captured shard this stream owns.
// This test seeds the minimum set needed for the byte parity: *home,
// the pointer cardtype, yzzw, the *all+*read rule card, and the
// transitive side/type closure. The structure-corpus-seeding covers
// the rest of the deck (every shard id + the rule universes + the
// closure).

import { describe, it, expect, afterAll } from "vitest";
import {
  createStructureSeededStorageFor,
  readShardLines,
} from "./structure-corpus-seeding.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { normalizeSlotIds } from "../../../src/testing/diff.js";
import { DeckoName } from "../../../src/card/name.js";

// The expected byte shape (pinned from
// fixtures/corpus/shard-000000.jsonl:77:views.content, with slot-ids
// normalized to the literal "RANDOMIZED" placeholder the harness
// substitutes). Matches the corpus EXACTLY minus slot-id randomness.
const EXPECTED_CORPUS_77 = `<div id="Xhome-content-view" class="card-slot content-view ALL TYPE-hfvpssv STAR SELF-Xhome d0-card-content" data-card-id="77" data-card-name="*home" data-card-type-id="34843" data-card-type-name="hfvpssv" data-card-link-name="*home" data-slot-id="RANDOMIZED" data-slot="{&quot;view&quot;:&quot;content&quot;,&quot;show&quot;:[&quot;content&quot;]}"><div class="card-list card-list-bar pointer-list"><div class="pointer-item item-bar"><div id="yzzw-mini_bar-view" class="card-slot mini_bar-view ALL TYPE-swtktey" data-card-name="yzzw" data-card-type-id="22281" data-card-type-name="swtktey" data-card-link-name="yzzw" data-slot-id="RANDOMIZED" data-slot="{&quot;view&quot;:&quot;bar&quot;,&quot;nest_name&quot;:&quot;yzzw&quot;,&quot;show&quot;:[&quot;bar&quot;],&quot;hide&quot;:[&quot;bar_middle&quot;],&quot;home_view&quot;:&quot;bar&quot;}"><div class='bar ALL TYPE-swtktey with-bar-menu nodblclick d-flex _card-link' data-card-link-name='yzzw' data-card-name='yzzw' data-card-type-id='22281' data-card-type-name='swtktey' data-slot-id="RANDOMIZED">
<span class="denied"><!-- Sorry, you don't have permission (read) --></span>
<span class="denied"><!-- Sorry, you don't have permission (read) --></span>
</div>
</div></div></div>
</div>`;

// The expected byte shape for the list-type sister entry (corpus:275,
// *all+*layout). The list cardtype matches the same render path
// (Abstract::List#standard_pointer_core); this proves the port
// dispatches both pointer and list cardtypes to the new core view.
const EXPECTED_CORPUS_275 = `<div id="Xall-Xlayout-content-view" class="card-slot content-view ALL ALL_PLUS TYPE-xhor RSTAR RULE RIGHT-Xlayout TYPE_PLUS_RIGHT-exi-Xlayout SELF-Xall-Xlayout d0-card-content" data-card-id="275" data-card-name="*all+*layout" data-card-type-id="47" data-card-type-name="xhor" data-card-link-name="*all+*layout" data-slot-id="RANDOMIZED" data-slot="{&quot;view&quot;:&quot;content&quot;,&quot;show&quot;:[&quot;content&quot;]}"><div class="card-list card-list-bar pointer-list"><div class="pointer-item item-bar"><div id="bifaarykabanhm-mini_bar-view" class="card-slot mini_bar-view ALL TYPE-swtktey" data-card-name="bifaarykabanhm" data-card-type-id="22281" data-card-type-name="swtktey" data-card-link-name="bifaarykabanhm" data-slot-id="RANDOMIZED" data-slot="{&quot;view&quot;:&quot;bar&quot;,&quot;nest_name&quot;:&quot;bifaarykabanhm&quot;,&quot;show&quot;:[&quot;bar&quot;],&quot;hide&quot;:[&quot;bar_middle&quot;],&quot;home_view&quot;:&quot;bar&quot;}"><div class='bar ALL TYPE-swtktey with-bar-menu nodblclick d-flex _card-link' data-card-link-name='bifaarykabanhm' data-card-name='bifaarykabanhm' data-card-type-id='22281' data-card-type-name='swtktey' data-slot-id="RANDOMIZED">
<span class="denied"><!-- Sorry, you don't have permission (read) --></span>
<span class="denied"><!-- Sorry, you don't have permission (read) --></span>
</div>
</div></div></div>
</div>`;

// The corpus:77 + corpus:275 rendering needs these extra cards the
// shard doesn't include (yzzw's read-rule chain in particular): the
// stored read_rule_id on yzzw points at *all+*read rule card id=6568
// (a "+*read" rule whose content "Administrator" is the party the
// Anonymous viewer is NOT a member of — this is why bar_left / bar_right
// produce the denied spans the captured bytes pin).
const EXTRA_IDS = new Set<number>([
  77, // *home
  22281, // yzzw (the pointer item; in the live corpus but not the shard)
  34843, // pointer cardtype (codename "pointer")
  5, // cardtype cardtype (the yzzw type_id)
  47, // *all+*layout type_id and the *all+*read right id (47)
  6568, // *all+*read rule card
  277, // *all+*content option view (used by the *all+*layout set; not strictly needed but harmless)
]);

let storage: RenderTestStorage | undefined;

afterAll(() => {
  storage?.close();
});

describe("pointer/list content view byte parity (corpus:77, corpus:275)", () => {
  it(
    "*home pointer content view renders the captured card-list pointer-list wrapper with mini_bar slot items",
    async () => {
      // The shard ids (union with the extra corpus ids yzzw's read-rule
      // chain touches). createStructureSeededStorageFor takes an id set
      // and runs the same closure walk the structure replay uses.
      const baseIds = new Set(readShardLines().map((l) => l.id));
      for (const id of EXTRA_IDS) baseIds.add(id);
      storage = await createStructureSeededStorageFor(baseIds);
      // Seed yzzw itself (NOT in the captured shard - only id=77's
      // content references it; the closure walk doesn't fetch a card
      // whose name appears only as plain text). The captured bytes
      // pin yzzw's slot WITHOUT a data-card-id attribute (Ruby renders
      // id-less cards with the data-card-id slot-data field omitted);
      // we leave id undefined here so the attribute is suppressed.
      // The denied spans the captured bytes pin come from the
      // read-rule verdict (yzzw's read_rule_id points at *all+*read,
      // rule id=6568 — "Role_A1" party — and the Anonymous viewer
      // is not a Role_A1 member, so ok_to_read? returns false).
      await seedCard(storage, {
        id: undefined,
        name: "yzzw",
        typeId: 22281,
        readRuleId: 6568,
        readRuleClass: "*all",
      });
      const html = await storage.engine.render("*home", "content");
      const normalized = normalizeSlotIds(html);
      // Dump the first byte that differs (if any) for diagnosis.
      if (normalized !== EXPECTED_CORPUS_77) {
        const expectedBytes = Buffer.from(EXPECTED_CORPUS_77, "utf8");
        const actualBytes = Buffer.from(normalized, "utf8");
        let firstDiff = -1;
        const minLen = Math.min(expectedBytes.length, actualBytes.length);
        for (let i = 0; i < minLen; i++) {
          if (expectedBytes[i] !== actualBytes[i]) {
            firstDiff = i;
            break;
          }
        }
        if (firstDiff < 0) firstDiff = minLen;
        const ctxStart = Math.max(0, firstDiff - 60);
        const ctxEnd = Math.min(Math.max(expectedBytes.length, actualBytes.length), firstDiff + 60);
        expect(
          normalized,
          `first diff at byte ${firstDiff}: expected excerpt ${JSON.stringify(
            EXPECTED_CORPUS_77.slice(ctxStart, ctxEnd),
          )} but actual excerpt ${JSON.stringify(normalized.slice(ctxStart, ctxEnd))}; sizes expected=${expectedBytes.length} actual=${actualBytes.length}`,
        ).toBe(EXPECTED_CORPUS_77);
      }
      expect(normalized).toBe(EXPECTED_CORPUS_77);
    },
  );

  it(
    "*all+*layout list content view renders the captured card-list pointer-list wrapper with mini_bar slot items",
    async () => {
      const baseIds = new Set(readShardLines().map((l) => l.id));
      for (const id of EXTRA_IDS) baseIds.add(id);
      storage = await createStructureSeededStorageFor(baseIds);
      // Seed bifaarykabanhm (NOT in the captured shard). The captured
      // bytes pin the slot id `bifaarykabanhm-mini_bar-view` (name-
      // based, so the row id is arbitrary) with type_id=22281 +
      // type_name="swtktey". Like yzzw, no data-card-id on the
      // captured slot — id-less rendering.
      await seedCard(storage, {
        id: undefined,
        name: "bifaarykabanhm",
        typeId: 22281,
        readRuleId: 6568,
        readRuleClass: "*all",
      });
      const html = await storage.engine.render("*all+*layout", "content");
      const normalized = normalizeSlotIds(html);
      expect(normalized).toBe(EXPECTED_CORPUS_275);
    },
  );
});

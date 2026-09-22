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
// Seeding: structure-corpus-seeding.ts — same proven seed the
// structure replay uses (the read-rule universe + *structure universe +
// closure), since corpus:77 needs its read rule (id=6568, *all+*type+
// *default) to render the denied spans the bar_left / bar_right views
// produce.

import { describe, it, expect, afterAll } from "vitest";
import { createStructureSeededStorage } from "./structure-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";
import { normalizeSlotIds } from "../../../src/testing/diff.js";

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

const EXPECTED_CORPUS_275 = `<div id="Xall-Xlayout-content-view" class="card-slot content-view ALL ALL_PLUS TYPE-xmhve STAR SELF-Xall-Xlayout d0-card-content" data-card-id="275" data-card-name="*all+*layout" data-card-type-id="7" data-card-type-name="xmhve" data-card-link-name="*all+*layout" data-slot-id="RANDOMIZED" data-slot="{&quot;view&quot;:&quot;content&quot;,&quot;show&quot;:[&quot;content&quot;]}"><div class="card-list card-list-bar pointer-list"><div class="pointer-item item-bar"><div id="bifaarykabanhm-mini_bar-view" class="card-slot mini_bar-view ALL TYPE-xvoeoky" data-card-name="bifaarykabanhm" data-card-type-id="45283" data-card-type-name="xvoeoky" data-card-link-name="bifaarykabanhm" data-slot-id="RANDOMIZED" data-slot="{&quot;view&quot;:&quot;bar&quot;,&quot;nest_name&quot;:&quot;bifaarykabanhm&quot;,&quot;show&quot;:[&quot;bar&quot;],&quot;hide&quot;:[&quot;bar_middle&quot;],&quot;home_view&quot;:&quot;bar&quot;}"><div class='bar ALL TYPE-xvoeoky with-bar-menu nodblclick d-flex _card-link' data-card-link-name='bifaarykabanhm' data-card-name='bifaarykabanhm' data-card-type-id='45283' data-card-type-name='xvoeoky' data-slot-id="RANDOMIZED">
<span class="denied"><!-- Sorry, you don't have permission (read) --></span>
<span class="denied"><!-- Sorry, you don't have permission (read) --></span>
</div>
</div></div></div>
</div>`;

let storage: RenderTestStorage | undefined;

afterAll(() => {
  storage?.close();
});

describe("pointer/list content view byte parity (corpus:77, corpus:275)", () => {
  it(
    "*home pointer content view renders the captured card-list pointer-list wrapper with mini_bar slot items",
    async () => {
      storage = await createStructureSeededStorage();
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
        // Diagnostic: assert with a message that names the divergence so the
        // failure points at the byte shape, not at "expected ... but got ..."
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
      storage = await createStructureSeededStorage();
      const html = await storage.engine.render("*all+*layout", "content");
      const normalized = normalizeSlotIds(html);
      expect(normalized).toBe(EXPECTED_CORPUS_275);
    },
  );
});

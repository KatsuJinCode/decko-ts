// pointer-list-item-rescue-scope-pins.test.ts — each pointer/list ITEM
// nest is its own rescue scope: one item whose view raises yields ITS
// error span inside ITS wrap_item and the LIST COMPLETES with its
// card-list wrapper intact.
//
// MECHANISM (gem source, C:/localProjects/archive/decko-fork-study/decko/):
//
//   mod/list/set/abstract/01_list/html_views.rb:4-13
//       view :core do
//         standard_pointer_core
//       end
//       def standard_pointer_core
//         with_paging do |paging_args|
//           wrap_with :div,
//                     class: "card-list card-list-#{item_view_options[:view]} pointer-list" do
//             standard_pointer_items(paging_args)
//           end
//         end
//       end
//   html_views.rb:15-17 standard_pointer_items -> pointer_items
//   (other_views.rb:11-14 `listing_list card.item_cards(page_args), args`)
//   — one NEST per item, and every nest's render! is independently
//   rescued (card/lib/card/format/render.rb:7-14, :96-100
//   `wrap_and_render ... rescue StandardError => e; rescue_view e, view`).
//   The per-item wrap is html_views.rb:28-30
//       def wrap_item _item_card, rendered, item_view
//         %(<div class="pointer-item item-#{item_view}">#{rendered}</div>)
//       end
//   and the rescue span is labelled with the view wrap_and_render was
//   called with (format/error.rb:80-86) — the ITEM view. The item
//   subformat is never focal (depth >= 1, subformat.rb:41-43), so the
//   rescue is always quiet (error.rb:65-73).
//
// THE DEFECT. The engine's renderPointerListItem dispatched the item view
// through fmt.nestRecord with NO rescue: one item whose view is
// unsupported (UnsupportedViewError) propagated up through
// pointerListCoreHtml and aborted the WHOLE core, which the parent view's
// renderDelegated then caught — the list's wrapper divs and every earlier
// item vanished. Corpus bytes this fixes: HDW BW 20131229 0264+tags
// (`+tags|titled;item:taglink`, page recapture-raw-shard-000013) — the
// engine emitted ONLY `<span class="render-error alert alert-danger">view
// (taglink) not supported for BW</span>` in the titled body where the
// capture carries
//     <div class="card-list card-list-taglink pointer-list">
//       <div class="pointer-item item-taglink"><span class="denied">…</span></div>
//       <div class="pointer-item item-taglink"><span class="render-error …">
//         view (taglink) not supported for BW</span></div>
//     </div>
// (item 1 is read-denied — its quiet denial span is the item gate's, not
// this rescue's; item 2's taglink view is unsupported IN RUBY TOO — the
// capture itself carries the identical error message, error.rb:52-54
// keeps UnsupportedViewError's message verbatim). Solo byte probe at this
// lane: FAIL -228 with the aborting shape, PASS byte-identical with the
// per-item rescue (same-tree revert = file overwrite, no git).
//
// FIXTURE. `taglink` is unregistered in the engine's view table (as in
// the captured deck — Ruby raised the same error), so ANY readable item
// raises, which makes the mechanism cheap to pin: a two-item list whose
// EVERY item raises must still render both wrapped spans plus the
// wrapper, not a single unwrapped one.

import { describe, it, expect } from "vitest";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

const LIST_CARD = "tag list raises per item";
const HOST_CARD = "host nests the raising tag list";

async function seed(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 3, name: "List", codename: "list", typeId: 2 });
  // Two READABLE items, both of whose `taglink` item view raises.
  await seedCard(storage, { id: 520, name: "tag one", typeId: 2, dbContent: "one" });
  await seedCard(storage, { id: 521, name: "tag two", typeId: 2, dbContent: "two" });
  await seedCard(storage, {
    id: 522,
    name: LIST_CARD,
    typeId: 3,
    dbContent: "[[tag one]]\n[[tag two]]",
  });
  await seedCard(storage, {
    id: 523,
    name: HOST_CARD,
    typeId: 2,
    dbContent: `{{${LIST_CARD}|titled;item:taglink}}`,
  });
  storage.fetcher.installNameEnvironment();
  return storage;
}

describe("a pointer/list item's raise is its own rescue scope (render.rb:7-14, :96-100)", () => {
  it("both items keep their wrap_item divs and the card-list wrapper survives", async () => {
    const storage = await seed();
    try {
      const html = await storage.engine.render(HOST_CARD, "content");
      // html_views.rb:9 — the wrapper class names the ITEM view.
      expect(html, "the card-list wrapper must survive a raising item").toContain(
        '<div class="card-list card-list-taglink pointer-list">',
      );
      // html_views.rb:28-30 — one wrap_item PER item, in list order.
      const firstAt = html.indexOf('<div class="pointer-item item-taglink">');
      const secondAt = html.indexOf('<div class="pointer-item item-taglink">', firstAt + 1);
      expect(firstAt, "item 1's wrap_item div").toBeGreaterThanOrEqual(0);
      expect(secondAt, "item 2's wrap_item div").toBeGreaterThan(firstAt);
      // Each item's span labels the ITEM view (error.rb:80-86); the
      // UnsupportedViewError message is verbatim (error.rb:52-54).
      expect((html.match(/view \(taglink\) not supported for tag one/g) ?? []).length).toBe(1);
      expect((html.match(/view \(taglink\) not supported for tag two/g) ?? []).length).toBe(1);
      // The aborted-core shape: a render-error span with NO wrap_item and
      // NO card-list wrapper. Asserted absent so a regression back to the
      // abort is a named failure.
      expect(html).not.toContain("(titled view)");
    } finally {
      storage.close();
    }
  });
});

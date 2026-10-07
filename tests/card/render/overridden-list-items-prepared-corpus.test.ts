// A list card whose set module overrides `def content` has its OVERRIDDEN
// items prepared — corpus replay.
//
// `*input type+*right+*content options` stores a placeholder; card-mod-list
// set/self/input_type/right/content_options.rb replaces its content with the
// basket's list-input catalog. One catalog item, `calendar`, is a real card
// (id 14254, read rule BasicCs+*type+*read, "Anyone Signed In"). The other
// items have no card.
//
// Ruby fetches each item (card-mod-collection item.rb all_item_cards), so
// `calendar` is the real card and, denied to Anonymous, its nest renders as
// a bare denial: `<div class="pointer-item item-bar"><span class="denied">`.
// The engine's prepare walk read the items from db_content, never fetched
// `calendar`, and rendered it as an unknown new card (a mini_bar frame).
// Neither shows content; the difference is in the frame.
//
// Gate: opt-in via OVERRIDDEN_LIST_ITEMS_REPLAY=1 (raw bench corpus).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const REPLAY_REQUESTED = process.env.OVERRIDDEN_LIST_ITEMS_REPLAY === "1";
const describeIfCorpus = REPLAY_REQUESTED ? describe : describe.skip;

describeIfCorpus("overridden list content: items are prepared from the override", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
    const ids = (
      idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{ id: number }>
    ).map((r) => r.id);
    idLister.close();
    storage = await createRawStructureSeededStorage(new Set(ids));
    storage.fetcher.installNameEnvironment();
    await storage.fetcher.warmLexicon(ids);
  }, 600_000);

  afterAll(() => {
    storage?.close();
  });

  it("*input type+*right+*content options content: calendar is the real card, denied", async () => {
    const html = await storage!.engine.render("*input type+*right+*content options", "content");
    expect(html).not.toContain('data-card-name="calendar"');
    expect(html).toContain(
      '</div></div>\n<div class="pointer-item item-bar"><span class="denied"><!-- Sorry, you don\'t have permission (read) --></span></div>\n<div class="pointer-item item-bar"><div id="tinymce_editor-mini_bar-view"',
    );
  }, 300_000);
});

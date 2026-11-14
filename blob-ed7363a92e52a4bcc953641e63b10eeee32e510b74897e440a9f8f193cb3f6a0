// List/search hosts seated on a WARM engine still pass their item type to
// their item nests — corpus replay.
//
// Ruby folds `options[:type] = card.item_type_name` into every item nest
// (card-mod-collection set/all/item.rb:157-162), so each item slot's
// data-slot JSON carries `"type":"<Type>"` when the host has an item type.
//
// enrichPointerListItemsClosure (which resolves each host's item type and
// walks its items) returned early whenever the render map had not grown
// since its last pass. On an engine that has rendered other pages, a host
// card can already be in the map (stored by an earlier render outside that
// render's seats) and be seated by this render without the map growing; the
// pass was skipped and the host's item nests lost `"type"`. Same class as
// the read-verdict size shortcut. This is the bench-paired grade's E4
// cluster: each page passes alone and fails after other pages.
//
// Reproducer: the 14 E4 pages that precede Beverly Bonneville-Heckler in the
// cluster, then Beverly Bonneville-Heckler: its Related Project list item
// "Aiki Extensions" must carry "type":"Project".
//
// Gate: opt-in via WARM_ITEM_HOST_REPLAY=1 (raw bench corpus).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { describeWithCorpus } from "../../support/describe-with-corpus.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const REPLAY_REQUESTED = process.env.WARM_ITEM_HOST_REPLAY === "1";
const describeIfCorpus = describeWithCorpus(REPLAY_REQUESTED, "tests/card/render/warm-engine-item-host-walk-corpus.test.ts", "corpus replay was not requested (set DECKO_TS_CORPUS_REPLAY=1)");

const WARMUP_PAGES = [
  "Bridget Castellan",
  "Iris McGinnis",
  "Meghan Williams Kerrigan",
  "Masato O",
  "aikido",
  "Shen and Legum on Mandella",
  "Shen and Legum on Mandella+Associates",
  "David L Miller",
  "Kirsten Cadwell",
  "Kirsten Cadwell+musings",
  "Iris McGinnis+Project(s) Organizing",
  "Iris McGinnis+Related Project",
  "Francisco Pontual",
  "Francisco Pontual+Related Project",
];

describeIfCorpus("warm engine: seated item hosts are walked even when the map did not grow", () => {
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

  it("Beverly Bonneville-Heckler after 14 pages: Related Project items carry type Project", async () => {
    for (const page of WARMUP_PAGES) await storage!.engine.renderPage(page);
    const html = await storage!.engine.renderPage("Beverly Bonneville-Heckler");
    const at = html.indexOf('id="aiki_extension-bar-view"');
    expect(at).toBeGreaterThan(-1);
    const slot = html.slice(at, html.indexOf(">", at));
    expect(slot).toContain("&quot;home_view&quot;:&quot;bar&quot;,&quot;type&quot;:&quot;Project&quot;");
  }, 300_000);
});

// Bar-menu page links of VIRTUAL cards — corpus replay.
//
// Ruby: bar_menu's full_page_link classes its anchor through
// add_known_or_wanted_class (card-mod-format set/all/links.rb:140-144):
// Card.known?(name) = fetch(name).present? (card-1.110.0 mod/core/set/all/
// states.rb:24-26), and fetch returns VIRTUAL cards (states.rb:52-57
// virtual? = compound && structure.present?). A new compound card under an
// applicable *structure rule is therefore known-card.
//
// The engine classed every id-less bar card wanted-card (only star-right
// compounds were special-cased), so media+HBQ+YouTube Browser's 30
// `<video>+HBQ YTlinkControl` / `<video>+HBQ YTlinkView` bars (virtual
// through their *right+*structure rules) read wanted-card where Ruby reads
// known-card.
//
// Gate: opt-in via BAR_VIRTUAL_KNOWN_REPLAY=1 (raw bench corpus).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { describeWithCorpus } from "../../support/describe-with-corpus.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const REPLAY_REQUESTED = process.env.BAR_VIRTUAL_KNOWN_REPLAY === "1";
const describeIfCorpus = describeWithCorpus(REPLAY_REQUESTED, "tests/card/render/bar-menu-virtual-known-corpus.test.ts", "corpus replay was not requested (set DECKO_TS_CORPUS_REPLAY=1)");

describeIfCorpus("bar-menu page links of virtual cards are known-card", () => {
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

  it("media+HBQ+YouTube Browser: every +HBQ YTlinkControl / +HBQ YTlinkView page link is known-card", async () => {
    const html = await storage!.engine.renderPage("media+HBQ+YouTube Browser");
    const links = [
      ...html.matchAll(/class="full-page-link (known|wanted)-card" href="\/[^"]*\+HBQ_YTlink(?:Control|View)[^"]*"/g),
    ];
    expect(links.length).toBe(30);
    expect(links.filter((m) => m[1] === "wanted").length).toBe(0);
  }, 300_000);
});

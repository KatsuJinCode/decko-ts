// Virtual-search fields serve their set module's help text — corpus replay.
//
// card-mod-search set/right/referred_to_by.rb (and nine siblings) include
// Abstract::VirtualSearch with a `raw_help_text:` option; include_set turns
// each option into a cattr_accessor on the set module (card lib/card/set/
// inheritance.rb:32-36), so `card.try(:raw_help_text)` answers for every
// `X+*referred to by` card (card-mod-help set/all/help.rb:36-38). The engine
// had no entry for these and fell back to the *help rule card, which on this
// deck Anonymous may not read, so the popover rendered "&nbsp;" where Ruby
// renders "Cards that refer to <X>."
//
// Gate: opt-in via VIRTUAL_SEARCH_HELP_REPLAY=1 (raw bench corpus).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const REPLAY_REQUESTED = process.env.VIRTUAL_SEARCH_HELP_REPLAY === "1";
const describeIfCorpus = REPLAY_REQUESTED ? describe : describe.skip;

describeIfCorpus("virtual-search fields: set-module raw_help_text", () => {
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

  it("children open: the +*referred to by popover reads 'Cards that refer to children.'", async () => {
    const html = await storage!.engine.render("children", "open");
    expect(html).toContain('data-bs-content="Cards that refer to children."');
  }, 300_000);
});

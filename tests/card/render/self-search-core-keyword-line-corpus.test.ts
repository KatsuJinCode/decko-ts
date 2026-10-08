// The *search card's core leads with its (empty) results_for_keyword line —
// corpus replay.
//
// card-mod-search set/self/search.rb:44-46 overrides :core as
// `[render_results_for_keyword, super()]`; Card::Format#output joins the
// parts with "\n" (card lib/card/format/content.rb:70-73). Without a
// keyword the results_for_keyword haml renders "", so the core starts with
// a newline before the result list. The engine rendered the list alone.
//
// Gate: opt-in via SELF_SEARCH_CORE_REPLAY=1 (raw bench corpus).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import { describeWithCorpus } from "../../support/describe-with-corpus.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const REPLAY_REQUESTED = process.env.SELF_SEARCH_CORE_REPLAY === "1";
const describeIfCorpus = describeWithCorpus(REPLAY_REQUESTED, "tests/card/render/self-search-core-keyword-line-corpus.test.ts", "corpus replay was not requested (set DECKO_TS_CORPUS_REPLAY=1)");

describeIfCorpus("*search core: the keyword line precedes the result list", () => {
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

  it("*search page: a newline separates the card body from the result list", async () => {
    const html = await storage!.engine.renderPage("*search");
    expect(html).toContain('ALL TYPE-search STAR SELF-Xsearch">\n<div class="card-list card-list-bar search-result-list">');
  }, 300_000);
});

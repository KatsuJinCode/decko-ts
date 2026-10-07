// Real cards that reach a view without a seated read verdict — corpus replay.
//
// Ruby's ok_to_read? (card-mod-permissions set/all/permissions.rb:139-146)
// reads the card's STORED read_rule_id first. The engine judges cards in
// its prepare-phase verdict pass, but several prepare paths add cards to
// the render map outside the page's seats (the *help rule prefetch, the
// admin runtime's codename cards, ...). A card with no verdict read as
// ALLOWED, so its content rendered to readers Ruby denies.
//
// Reproducer: `Trumpery+tags`. The tags field's help popover reads
// tags+*right+*help (card 455), whose stored read rule is
// BasicCs+*type+*read ("Anyone Signed In"); Ruby renders the empty
// popover (`&amp;nbsp;`) for the anonymous reader, the engine rendered the
// rule's text. 30 pages of the bench-paired grade's E3 cluster share it.
//
// Gate: opt-in via PERM_UNSEATED_REPLAY=1 (raw bench corpus).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  RAW_CORPUS_DB,
  createRawStructureSeededStorage,
} from "../render/raw-corpus-seeding.js";
import { describeWithCorpus } from "../../support/describe-with-corpus.js";
import type { RenderTestStorage } from "../render/render-test-storage.js";

const REPLAY_REQUESTED = process.env.PERM_UNSEATED_REPLAY === "1";
const describeIfCorpus = describeWithCorpus(REPLAY_REQUESTED, "tests/card/permissions/read-verdict-unseated-real-card-corpus.test.ts", "corpus replay was not requested (set DECKO_TS_CORPUS_REPLAY=1)");

describeIfCorpus("an unseated real card falls back to its stored read rule", () => {
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

  it("Trumpery+tags: the read-denied tags+*right+*help text stays out of the popover", async () => {
    const html = await storage!.engine.renderPage("Trumpery+tags");
    expect(html).not.toContain("Select an existing tag or add your own");
  }, 300_000);
});

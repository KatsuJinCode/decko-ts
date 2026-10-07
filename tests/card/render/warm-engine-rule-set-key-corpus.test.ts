// Rule cards enriched before the rule-type ids are folded keep the RULE set
// key once the engine is warm — corpus replay on the key-repaired deck.
//
// enrichAndStore computes a card's set keys once; the map's existing-key
// guard never recomputes them. On an engine's first render the prefetch walk
// enriches cards before parseRuleTypeIds runs, so the rule predicate is
// unanswerable and the RULE token is dropped. The one-time repair pass after
// the fold re-derived it from the render map alone, and the map does not
// always hold the rule's right part yet: `*TinyMCE+*self`'s rules board
// reaches `*all+*style` by its stored key, but not `*style`. The repair read
// "not a rule", and every later render of `*all+*style` (bar, closed, open,
// page) lost `RULE` and the `_rule-item` bar classes. Ruby's rule? predicate
// (card lib/card/rule/all.rb) fetches the parts, so it always answers.
//
// It shows only on a deck whose compound cards carry their stored keys (the
// bench stores them NULL, so the walk never reached the rule there), which
// is what a live database holds.
//
// Gate: opt-in via WARM_RULE_SET_KEY_REPLAY=1 (needs the key-repaired bench,
// sha 305caac1, staged at tmp/raw-ground-truth).
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";

const REPLAY_REQUESTED = process.env.WARM_RULE_SET_KEY_REPLAY === "1";
const describeIfCorpus = REPLAY_REQUESTED ? describe : describe.skip;

describeIfCorpus("warm engine: rule cards reached before the rule-type fold keep RULE", () => {
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

  it("*all+*style closed after *TinyMCE+*self content carries RSTAR RULE", async () => {
    await storage!.engine.render("*TinyMCE+*self", "content");
    const html = await storage!.engine.render("*all+*style", "closed");
    const slotClass = html.slice(0, html.indexOf(">"));
    expect(slotClass).toContain("TYPE-list RSTAR RULE RIGHT-Xstyle");
  }, 300_000);
});

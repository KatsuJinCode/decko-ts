// A preference rule renders the rule bar — corpus replay on the key-repaired
// deck.
//
// rule? is standard_rule? OR preference? (card lib/card/rule/all.rb:32-53).
// `*all+*all+*follow` is a preference (trunk `*all` is a Set, the preferer
// part is `*all`), so set/rule's bar_view applies: the slot carries
// `_rule-item` and its category classes, and bar_middle is not hidden. The
// engine's rule-set gate checked only the standard shape (left part a Set)
// and rendered a plain bar on the List page.
//
// Gate: opt-in via PREFERENCE_RULE_BAR_REPLAY=1 (needs the key-repaired
// bench, sha 305caac1, staged at tmp/raw-ground-truth).
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";
import type { RenderTestStorage } from "./render-test-storage.js";
import { compareNormalized } from "../../../src/testing/diff.js";
import { setDeploymentCloudAssetHost } from "../../../src/card/render/views.js";

const REPLAY_REQUESTED = process.env.PREFERENCE_RULE_BAR_REPLAY === "1";
const describeIfCorpus = REPLAY_REQUESTED ? describe : describe.skip;

function expectedPage(name: string): string {
  const dir = path.join(path.dirname(RAW_CORPUS_DB), "expected-v2", "page-lane");
  for (const f of fs.readdirSync(dir)) {
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      if (!line) continue;
      const row = JSON.parse(line) as { name: string; page_html: string };
      if (row.name === name) return row.page_html;
    }
  }
  throw new Error(`no page-lane row for ${name}`);
}

describeIfCorpus("preference rule bar", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    setDeploymentCloudAssetHost("https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com");
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

  it("List page: *all+*all+*follow renders as a rule item", async () => {
    const html = await storage!.engine.renderPage("List");
    expect(html).toContain("SELF-Xall-Xall-Xfollow _rule-item _category-all _category-recent");
    expect(compareNormalized(expectedPage("List"), html).equal).toBe(true);
  }, 300_000);
});

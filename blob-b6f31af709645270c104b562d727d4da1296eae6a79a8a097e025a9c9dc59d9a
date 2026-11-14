// The event :update_rule_cache finalize stage (card-mod-permissions
// set/all/update_read_rules.rb:4-6), ported engine-owned:
//
//   event :update_rule_cache, :finalize, when: :rule? do
//     Card::Rule.clear_rule_cache
//   end
//
// Ruby's clear_rule_cache (rule.rb:37-39 -> Rule::Cache.clear,
// cache.rb:36-38) drops the deck-wide rule lookup hash so the next rule
// walk reloads post-save state. The port's rule-resolution memo lives on
// the driver (read-rules.ts RuleResolutionDriverCache), and its ONE
// invalidation path is the engine's post-save seam: EVERY committed save
// runs expireRuleResolutionCache (CardActionEngine.expireAfterWrite —
// read-rules.ts:749-753 documents the seam). The render engines' rule-
// derived universes drop through the same seam's host gate
// (RenderEngine#expireRuleCache — extended this lane to also drop the
// *structure/*default universe memos, this cache's other consumers).
//
// The observable contract under test: after a committed save (ANY save —
// the port drops the memo unconditionally where Ruby gates on :rule?,
// which is behaviorally identical for a cache whose only observable is
// freshness), a rule resolution that was serving a stale out-of-band
// mutation answers fresh.

import { describe, it, expect } from "vitest";
import { resolveRuleRowsByKeys } from "../../../src/card/permissions/read-rules.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import {
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  seedReference,
  JOE,
  type ActionsTestStorage,
} from "../actions/actions-test-storage.js";

async function seedRuleCacheDeck(): Promise<ActionsTestStorage> {
  const storage = await createActionsTestStorage();
  await seedStandardDeck(storage);
  const readSetting = await seedCard(storage, { id: 400, name: "*read", codename: "read" });
  const rule = await seedCard(storage, {
    id: 440,
    name: "*all+*read",
    leftId: 7,
    rightId: readSetting.id,
    dbContent: "anyone",
  });
  await seedReference(storage, rule.id, 304, "anyone");
  return storage;
}

describe("event :update_rule_cache — a committed save drops the deck rule cache", () => {
  it("a save invalidates a memo serving an out-of-band rule mutation", async () => {
    const storage = await seedRuleCacheDeck();
    try {
      const keys = ["*all+*read"];
      const before = await resolveRuleRowsByKeys(storage.engine.driver, keys, true);
      expect(before.get("*all+*read")?.content).toBe("anyone");

      // Out-of-band rule content mutation (no engine seam — exactly the
      // stale-memo shape the memo test pins).
      await storage.engine.driver.query(
        "UPDATE cards SET db_content = 'anyone edited' WHERE id = 440",
        [],
      );
      const cached = await resolveRuleRowsByKeys(storage.engine.driver, keys, true);
      expect(cached.get("*all+*read")?.content).toBe("anyone"); // memo still live

      // THE SAVE: one committed card save through the engine — the
      // expireAfterWrite seam runs clear_rule_cache's port.
      const engine = new CardActionEngine(storage.engine, { actor: JOE, ipAddress: "192.0.2.7" });
      await engine.createCard({ name: "Cache Probe", content: "body" });

      const fresh = await resolveRuleRowsByKeys(storage.engine.driver, keys, true);
      expect(fresh.get("*all+*read")?.content).toBe("anyone edited");
    } finally {
      storage.close();
    }
  });
});

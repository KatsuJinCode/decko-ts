// Trace test for cluster 7 (read-rule-grant-vs-deny) — narrow id set.
// Just enough ids to test read rule resolution for *all+*default.

import { describe, it } from "vitest";
import { ANONYMOUS_VIEWER } from "../../../src/card/permissions/read-rules.js";
import { createRawStructureSeededStorage } from "../../../tmp/raw-ground-truth/scripts/raw-corpus-seeding.js";

describe("cluster7 trace: narrow read-rule walk", () => {
  it(
    "read-rule cache state for narrow id set",
    { timeout: 300_000 },
    async () => {
      // Card 28 = *all+*default. Need: its read rule (22283), the *read
      // setting (6547), the *all set card (274), the *all+*read rule
      // (6568), the *all+*type set card (22282), the *all+*type+*read
      // rule (22283), the BasicCs+*type set card (22282's left = 22281),
      // and the codenames (anyone=8, anonymous=15).
      const ids = new Set([28, 274, 318, 6547, 6568, 22282, 22283, 6543, 6569, 259, 8, 9, 15, 22281, 266]);
      const storage = await createRawStructureSeededStorage(ids);
      try {
        storage.engine.viewer = ANONYMOUS_VIEWER;

        type InnerEngine = {
          ensureReadPermission(): Promise<{ readableRuleIds: Set<number>; alwaysOk: boolean; hasReadRules: boolean; hasCatchAllReadRule: boolean; parties: number[] }>;
          render(name: string, view: string): Promise<string>;
        };
        const inner = storage.engine as unknown as InnerEngine;
        const state = await inner.ensureReadPermission();
        // eslint-disable-next-line no-console
        console.log("STATE:", JSON.stringify({
          readableRuleIds: [...state.readableRuleIds],
          alwaysOk: state.alwaysOk,
          hasReadRules: state.hasReadRules,
          hasCatchAllReadRule: state.hasCatchAllReadRule,
          parties: state.parties,
        }));

        // Direct query in seeded engine deck
        const cacheRows = await storage.fetcher.driver.query<{ partyId: number; readRuleId: number }>(
          `SELECT refs.referee_id AS partyId, read_rules.id AS readRuleId FROM cards read_rules ` +
          `JOIN card_references refs ON refs.referer_id = read_rules.id ` +
          `WHERE read_rules.right_id = (SELECT id FROM cards WHERE codename = 'read' AND trash = 0 ORDER BY id LIMIT 1)`,
        );
        // eslint-disable-next-line no-console
        console.log("Cache rows (engine deck):", JSON.stringify(cacheRows.rows.slice(0, 50)));
        // eslint-disable-next-line no-console
        console.log(`Total cache rows: ${cacheRows.rows.length}`);

        // Look up card 28's stored read_rule_id
        const card28 = await storage.fetcher.driver.query<{ id: number; read_rule_id: number | null; read_rule_class: string | null }>(
          `SELECT id, read_rule_id, read_rule_class FROM cards WHERE id = 28`,
        );
        // eslint-disable-next-line no-console
        console.log("Card 28:", JSON.stringify(card28.rows));

        // Render *all+*default with view=content
        try {
          const out = await inner.render("*all+*default", "content");
          // eslint-disable-next-line no-console
          console.log(`RENDER *all+*default: bytes=${out.length}, first300=${JSON.stringify(out.slice(0, 300))}`);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.log("RENDER *all+*default RAISED:", err);
        }
      } finally {
        storage.close();
      }
    },
  );
});

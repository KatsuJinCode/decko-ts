// Trace test for cluster 7 (read-rule-grant-vs-deny) on the RAW ground truth.
// Uses the raw-corpus seeding (NOT sanitized) and prints what the engine
// renders for the 5 sample entries, plus the verdict state (readableRuleIds,
// alwaysOk, hasReadRules, hasCatchAllReadRule, parties).
//
// Run: npx vitest run tests/card/render/trace-cluster7-read-rule.test.ts

import { describe, it } from "vitest";
import { ANONYMOUS_VIEWER } from "../../../src/card/permissions/read-rules.js";
import { createRawStructureSeededStorage } from "../../../tmp/raw-ground-truth/scripts/raw-corpus-seeding.js";

const SAMPLE_ENTRIES = [
  { id: "1", name: "*all", view: "content" },
  { id: "2", name: "*all", view: "open" },
  { id: "3", name: "m_nv-instructor_training-mini", view: "content" },
  { id: "4", name: "ai_berk_at_asc_sum_ret2010_group_03-Xself", view: "open" },
  { id: "5", name: "ai_berk_at_asc_sum_ret2010_group_07-Xself", view: "open" },
];

describe("cluster7 trace: read-rule-grant-vs-deny", () => {
  it(
    "prints engine outputs and verdict state for the 5 sample entries",
    { timeout: 300_000 },
    async () => {
      const storage = await createRawStructureSeededStorage(new Set());
      try {
        storage.engine.viewer = ANONYMOUS_VIEWER;
        // Force the read-permission resolution
        const state = await (storage.engine as unknown as {
          ensureReadPermission: () => Promise<unknown>;
        }).ensureReadPermission();
        // eslint-disable-next-line no-console
        console.log("READ PERMISSION STATE:", JSON.stringify(state, null, 2));

        for (const entry of SAMPLE_ENTRIES) {
          try {
            const out = await storage.engine.render(entry.name, entry.view);
            // eslint-disable-next-line no-console
            console.log(
              `ENTRY ${entry.id} (${entry.name}:${entry.view}): bytes=${out.length}, first300=${JSON.stringify(out.slice(0, 300))}`,
            );
          } catch (err) {
            // eslint-disable-next-line no-console
            console.log(`ENTRY ${entry.id} (${entry.name}:${entry.view}): RAISED`, err);
          }
        }
      } finally {
        storage.close();
      }
    },
  );
});

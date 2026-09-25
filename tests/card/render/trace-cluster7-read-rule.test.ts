// Trace test for cluster 7 (read-rule-grant-vs-deny) on the RAW ground truth.
// Loads every live id (mirror the verify-recapture-raw driver) so the
// closure has the full deck. Prints engine verdict state and storage contents
// for the 5 sample entries plus rule card 6568 (Anyone) reference health.

import { describe, it } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { ANONYMOUS_VIEWER } from "../../../src/card/permissions/read-rules.js";
import { createRawStructureSeededStorage, RAW_CORPUS_DB } from "../../../tmp/raw-ground-truth/scripts/raw-corpus-seeding.js";

const SAMPLE_NAMES = [
  { name: "*all", view: "content" },
  { name: "*all", view: "open" },
];

describe("cluster7 trace: read-rule-grant-vs-deny", () => {
  it(
    "prints engine outputs and storage state",
    { timeout: 300_000 },
    async () => {
      const allIds = (() => {
        const db = new Database(RAW_CORPUS_DB, { readonly: true });
        const ids = (db.prepare("SELECT id FROM cards WHERE trash = 0").all() as Array<{ id: number }>).map((r) => r.id);
        db.close();
        return new Set(ids);
      })();

      const storage = await createRawStructureSeededStorage(allIds);
      try {
        storage.engine.viewer = ANONYMOUS_VIEWER;
        // eslint-disable-next-line no-console
        console.log(`Seeded with ${allIds.size} ids`);
        // Look up the read-rule cache state directly via the seeded driver
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

        // Direct query: does rule 6568 have a reference to Anyone?
        const cacheRows = await storage.fetcher.driver.query<{ partyId: number; readRuleId: number }>(
          `SELECT refs.referee_id AS partyId, read_rules.id AS readRuleId FROM cards read_rules ` +
          `JOIN card_references refs ON refs.referer_id = read_rules.id ` +
          `WHERE read_rules.right_id = (SELECT id FROM cards WHERE codename = 'read' AND trash = 0 ORDER BY id LIMIT 1) ` +
          `AND read_rules.id = 6568`,
        );
        // eslint-disable-next-line no-console
        console.log("Rule 6568 refs in seeded engine deck:", JSON.stringify(cacheRows.rows));

        // Check the seedReference flow: did 6568 references actually seed?
        const allRefs = await storage.fetcher.driver.query<{ referer_id: number; referee_id: number | null }>(
          `SELECT referer_id, referee_id FROM card_references WHERE referer_id = 6568`,
        );
        // eslint-disable-next-line no-console
        console.log("All refs of 6568 in seeded engine deck:", JSON.stringify(allRefs.rows));

        // Check what cards got seeded
        const cardCount = await storage.fetcher.driver.query<{ c: number }>(
          `SELECT COUNT(*) as c FROM cards WHERE trash = 0`,
        );
        // eslint-disable-next-line no-console
        console.log("Card count in seeded engine deck:", JSON.stringify(cardCount.rows));

        for (const entry of SAMPLE_NAMES) {
          try {
            const out = await inner.render(entry.name, entry.view);
            // eslint-disable-next-line no-console
            console.log(`ENTRY (${entry.name}:${entry.view}): bytes=${out.length}, first300=${JSON.stringify(out.slice(0, 300))}`);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.log(`ENTRY (${entry.name}:${entry.view}): RAISED`, err);
          }
        }
      } finally {
        storage.close();
      }
    },
  );
});

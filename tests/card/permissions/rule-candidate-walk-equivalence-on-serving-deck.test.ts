// The rule-candidate swap, measured on the SERVING DECK: is
// resolveRuleIdsByComposedKeys equivalent to the whole-deck walk it replaces,
// over the population firstApplicableReadRule actually asks about, and what
// does it cost?
//
// This is the measurement the fixture contract cannot make. The fixture is a
// representative rule set with hand-chosen shapes; the deck is the thing the
// save runs against, and the swap is only safe if it holds there too. The
// fixture pins the SEMANTICS; this pins the CLAIM.
//
// It SKIPS when the serving deck is not on this machine, and says so, rather
// than passing on an empty population. The deck is a local artifact of the
// deck owner's worktree, not something a checkout can assume:
//   C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3
// Override with DECKO_SERVING_DECK. The numbers in the lane report were taken
// from exactly this path with bundle bbd08b61 (source a94561e1).
//
// SEPARATE DRIVERS, deliberately. Both resolvers memoize per driver, so
// measuring them through one driver would let the first answer warm the second
// and report a cost that no save ever experiences — a save drops the memo at
// every write, so each walk is paid cold. One driver per shape is the only
// honest comparison, and it is also the shape the ladder measures.

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RULE_KEY_UNIVERSE_STATEMENT,
  expireRuleResolutionCache,
  resolveRuleIdsByComposedKeys,
  resolveRuleIdsByKeys,
} from "../../../src/card/permissions/read-rules.js";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";

const DEFAULT_DECK =
  "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3";
const DECK = process.env["DECKO_SERVING_DECK"] ?? DEFAULT_DECK;

/** read-rules.ts's own four task setting names — the suffix that makes a
 *  composed key a rule candidate's key (TASK_RULE_SETTING_NAMES). */
const SETTINGS = ["*read", "*create", "*update", "*delete"];

function isRuleShaped(ckey: string): boolean {
  return SETTINGS.some((setting) => ckey.endsWith(`+${setting}`));
}

async function census(driver: SQLDatabaseDriver): Promise<Record<string, number>> {
  const rows = await driver.query<{ live: number; keyed: number }>(
    `SELECT
       (SELECT COUNT(*) FROM cards WHERE +trash = 0) AS live,
       (SELECT COUNT(*) FROM cards WHERE +trash = 0 AND "key" IS NOT NULL) AS keyed`,
    [],
  );
  const row = rows.rows[0];
  return { live: row?.live ?? 0, keyed: row?.keyed ?? 0 };
}

/** ckey -> the ids the WHOLE-DECK walk yields, as a Map collapsed by output
 *  order — the reference answers resolveRuleIdsByKeys serves. Computed with the
 *  shipped SQL directly so the reference does not share the resolver's memo. */
async function referenceUniverse(
  driver: SQLDatabaseDriver,
): Promise<Map<string, number>> {
  const rows = await driver.query<{ ckey: string; id: number }>(
    RULE_KEY_UNIVERSE_STATEMENT,
    [],
  );
  const out = new Map<string, number>();
  for (const row of rows.rows) out.set(row.ckey, row.id);
  return out;
}

function ms(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

const deckAvailable = existsSync(DECK);
const skip = deckAvailable
  ? false
  : `serving deck not present at ${DECK} (override with DECKO_SERVING_DECK)`;

describe.skipIf(!deckAvailable)("the rule-candidate swap, measured on the serving deck", () => {
  it.skipIf(!deckAvailable)(skip || "equivalence and cost over the rule-shaped population", async () => {
    const wholeDriver = new LocalSqliteDriver({ path: DECK, readonly: true });
    const narrowDriver = new LocalSqliteDriver({ path: DECK, readonly: true });
    try {
      const deck = await census(wholeDriver);
      const reference = await referenceUniverse(wholeDriver);
      const allCkeys = [...reference.keys()];
      const ruleShaped = allCkeys.filter(isRuleShaped).sort();

      // Ambiguity census: a ckey the walk yields for more than one card. This
      // is the population the narrow walk hands BACK to the whole-deck walk, so
      // the honest cost number has to state how big it is.
      const rows = await wholeDriver.query<{ ckey: string; id: number }>(
        RULE_KEY_UNIVERSE_STATEMENT,
        [],
      );
      const perKey = new Map<string, number>();
      for (const row of rows.rows) perKey.set(row.ckey, (perKey.get(row.ckey) ?? 0) + 1);
      const ambiguous = [...perKey.entries()].filter(([, n]) => n > 1);
      const ambiguousRuleShaped = ambiguous.filter(([ckey]) => isRuleShaped(ckey));

      console.log(
        `deck ${DECK}: ${deck.live} live cards, ${deck.keyed} keyed, ` +
          `${allCkeys.length} composed keys, ${ruleShaped.length} rule-shaped, ` +
          `${ambiguous.length} ambiguous (${ambiguousRuleShaped.length} rule-shaped)`,
      );

      // EQUIVALENCE, over the whole composed-name population — a superset of
      // what the call site asks for, so a shape the call site never reaches
      // today but might tomorrow is covered too.
      expireRuleResolutionCache(narrowDriver);
      const narrowAll = await resolveRuleIdsByComposedKeys(narrowDriver, allCkeys);
      let wrong = 0;
      let missing = 0;
      let invented = 0;
      const wrongExamples: string[] = [];
      for (const ckey of allCkeys) {
        const want = reference.get(ckey);
        const got = narrowAll.get(ckey);
        if (want === undefined) {
          if (got !== undefined) {
            invented += 1;
            wrongExamples.push(`invented ${ckey}`);
          }
          continue;
        }
        if (got === undefined) {
          missing += 1;
          if (wrongExamples.length < 10) wrongExamples.push(`missing ${ckey}`);
          continue;
        }
        if (got !== want && wrongExamples.length < 10) wrongExamples.push(`wrong ${ckey}: ${got} != ${want}`);
        if (got !== want) wrong += 1;
      }
      console.log(
        `equivalence over ALL composed keys: ${allCkeys.length} checked, ` +
          `${wrong} wrong, ${missing} missing, ${invented} invented`,
      );
      expect(wrongExamples.slice(0, 10)).toEqual([]);
      expect(wrong).toBe(0);
      expect(missing).toBe(0);
      expect(invented).toBe(0);

      // EQUIVALENCE, over the rule-shaped population specifically — the one
      // this change moves.
      expireRuleResolutionCache(narrowDriver);
      const narrowRuleShaped = await resolveRuleIdsByComposedKeys(narrowDriver, ruleShaped);
      let ruleWrong = 0;
      for (const ckey of ruleShaped) {
        if (narrowRuleShaped.get(ckey) !== reference.get(ckey)) ruleWrong += 1;
      }
      console.log(
        `equivalence over RULE-SHAPED keys: ${ruleShaped.length} checked, ${ruleWrong} wrong`,
      );
      expect(ruleWrong).toBe(0);

      // COST, in the shape the save pays: five candidate lists, each a fresh
      // memo generation, because expireAfterWrite drops it at every write.
      const saveShapeLists: string[][] = [
        ["person+company+*type_plu_right+*read", "person+skill+*type_plu_right+*read",
         "person+project_s_participating+*type_plu_right+*read", "basic_c+*type+*read",
         "person+related_person+*type_plu_right+*read"],
        ["person+company+*type_plu_right+*read", "person+skill+*type_plu_right+*read",
         "person+project_s_participating+*type_plu_right+*read", "basic_c+*type+*read",
         "person+related_person+*type_plu_right+*read"],
        ["person+company+*type_plu_right+*read", "person+skill+*type_plu_right+*read",
         "person+project_s_participating+*type_plu_right+*read", "basic_c+*type+*read",
         "person+related_person+*type_plu_right+*read"],
        ["person+company+*type_plu_right+*read", "person+skill+*type_plu_right+*read",
         "person+project_s_participating+*type_plu_right+*read", "basic_c+*type+*read",
         "person+related_person+*type_plu_right+*read"],
        ["person+company+*type_plu_right+*read", "person+skill+*type_plu_right+*read",
         "person+project_s_participating+*type_plu_right+*read", "basic_c+*type+*read",
         "person+related_person+*type_plu_right+*read"],
      ];

      // Whole-deck walk, cold memo each call (the shape a save pays).
      const wholeTimes: number[] = [];
      for (const keys of saveShapeLists) {
        const cold = new LocalSqliteDriver({ path: DECK, readonly: true });
        const t0 = process.hrtime.bigint();
        const got = await resolveRuleIdsByKeys(cold, keys);
        wholeTimes.push(ms(t0));
        expect(got.size).toBeGreaterThan(0);
        cold.close();
      }

      const narrowTimes: number[] = [];
      for (const keys of saveShapeLists) {
        const cold = new LocalSqliteDriver({ path: DECK, readonly: true });
        const t0 = process.hrtime.bigint();
        const got = await resolveRuleIdsByComposedKeys(cold, keys);
        narrowTimes.push(ms(t0));
        expect(got.size).toBeGreaterThan(0);
        cold.close();
      }

      const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
      console.log(
        `save-shape cost, 5 cold calls of 5 candidates each:\n` +
          `  whole-deck walk: ${wholeTimes.map((t) => t.toFixed(1)).join(", ")} ms  (total ${sum(wholeTimes).toFixed(1)} ms)\n` +
          `  per-key walk:    ${narrowTimes.map((t) => t.toFixed(1)).join(", ")} ms  (total ${sum(narrowTimes).toFixed(1)} ms)\n` +
          `  ratio:           ${(sum(wholeTimes) / sum(narrowTimes)).toFixed(1)}x`,
      );
      expect(sum(narrowTimes)).toBeLessThan(sum(wholeTimes));
    } finally {
      wholeDriver.close?.();
      narrowDriver.close?.();
    }
  }, 600000);
});

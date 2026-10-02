// raw-corpus-searchfix-prototype-probe.test.ts -- the p22 search-regression-fix
// port's mechanism probe. Boots the engine over the raw ground-truth corpus,
// renders the Search page FIRST (no isolated renders before it -- the pass-13
// first-render-wins lesson, job-1790820154566 / job-1790822005721), THEN
// introspects, for the six *content options rule bars on that page, which leg
// of ruleSetPrototypeTypeCode fails when the `_category-recent` class is
// dropped: trunk warmth, set-card id, the warm-map collectRules walk, or the
// *default rule's presence in the PRELOADED default-rule universe that
// newCardDefaultType reads (the Ruby-faithful cold resolution this suite
// installs as the fallback).
//
// Report-only (never asserts page parity, never re-runs a grader): records to
//   tmp/p22-searchfix-prototype-probe/report.jsonl   one line per rule item
//
// RUN (explicitly; needs the machine-local raw corpus via tmp/raw-ground-truth):
//   P22_SEARCHFIX_PROBE=1 npx vitest run \
//     tests/card/render/raw-corpus-searchfix-prototype-probe.test.ts \
//     --no-file-parallelism --maxWorkers=2
//
// Outside a census machine (no corpus, or the env gate unset) the spec skips.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { DeckoName } from "../../../src/card/name.js";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "./raw-corpus-seeding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "p22-searchfix-prototype-probe");

const PROBE_REQUESTED = process.env.P22_SEARCHFIX_PROBE === "1";
const CORPUS_PRESENT = existsSync(RAW_CORPUS_DB);

/** The six *content options rule bars on the Search cardtype page: three
 *  lose `_category-recent` at the fold tip (Family 571, *style 17454,
 *  Collection 17829) and three keep it (*layout 316, *read 9610,
 *  Exhibit+Item TPR 17743). prototypeName per the gems' prototype_args:
 *  right pattern -> "*dummy+#{anchor}" (07_right.rb:18-20);
 *  type_plus_right -> "+#{anchor.tag}" under the *dummy supercard
 *  (08_type_plus_right.rb:23-28) -> "*dummy+Item". */
const ITEMS: Array<{
  ruleName: string;
  setName: string;
  prototypeName: string;
  losesRecentAtFold: boolean;
}> = [
  { ruleName: "*layout+*right+*content options", setName: "*layout+*right", prototypeName: "*dummy+*layout", losesRecentAtFold: false },
  { ruleName: "Family+*right+*content options", setName: "Family+*right", prototypeName: "*dummy+Family", losesRecentAtFold: true },
  { ruleName: "*read+*right+*content options", setName: "*read+*right", prototypeName: "*dummy+*read", losesRecentAtFold: false },
  { ruleName: "*style+*right+*content options", setName: "*style+*right", prototypeName: "*dummy+*style", losesRecentAtFold: true },
  { ruleName: "Exhibit+Item+*type plus right+*content options", setName: "Exhibit+Item+*type plus right", prototypeName: "*dummy+Item", losesRecentAtFold: false },
  { ruleName: "Collection+*right+*content options", setName: "Collection+*right", prototypeName: "*dummy+Collection", losesRecentAtFold: true },
];

describe("raw-corpus searchfix prototype leg probe (Search page)", () => {
  it(
    "renders Search first, then reports each rule item's prototype-resolution legs",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!PROBE_REQUESTED) {
        ctx.skip();
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);

      mkdirSync(OUT_DIR, { recursive: true });

      const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId = (
        idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
          id: number;
        }>
      ).map((r) => r.id);
      idLister.close();
      const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
      storage.fetcher.installNameEnvironment();
      await storage.fetcher.warmLexicon(everyLiveId);

      // The page render goes FIRST -- no isolated renders before it.
      const page = await storage.engine.renderPage("Search");
      console.log(`P22-SEARCHFIX-PROBE page bytes=${page.length}`);

      const engine = storage.engine;
      const results: Array<Record<string, unknown>> = [];
      for (const item of ITEMS) {
        const ruleCard = engine.fetchRenderCard(item.ruleName);
        const setCard = engine.fetchRenderCard(item.setName);
        const collected = setCard !== undefined ? engine.collectRules(setCard) : [];
        const defaultRuleName = `${item.setName}+*default`;
        const defaultWarm = engine.fetchRenderCard(defaultRuleName);
        // The Ruby-faithful cold walk this suite installs as fallback:
        // ensure_type over the preloaded *default universe.
        const cold = engine.newCardDefaultType(DeckoName.parse(item.prototypeName));
        const coldCode = cold !== undefined ? engine.peekCodenameById(cold.typeId) : undefined;
        const warmVerdict =
          ruleCard !== undefined ? engine.ruleSetPrototypeTypeCode(ruleCard) : "rule-card-cold";
        const record = {
          ruleName: item.ruleName,
          losesRecentAtFold: item.losesRecentAtFold,
          ruleCardWarm: ruleCard !== undefined,
          setCardWarm: setCard !== undefined,
          setCardId: setCard?.id ?? null,
          collectRulesCount: collected.length,
          collectRulesHasDefault: collected.some(
            (c) => c.name.rightName?.key === "default" || c.name.rightName?.key === "*default",
          ),
          defaultRuleWarm: defaultWarm !== undefined,
          defaultRuleId: defaultWarm?.id ?? null,
          warmPrototypeCode: warmVerdict ?? null,
          coldPrototypeCode: coldCode ?? null,
          coldTypeId: cold?.typeId ?? null,
        };
        results.push(record);
        console.log(`P22-SEARCHFIX-ITEM ${JSON.stringify(record)}`);
      }

      writeFileSync(
        path.join(OUT_DIR, "report.jsonl"),
        results.map((r) => JSON.stringify(r)).join("\n") + "\n",
      );
      console.log(`P22-SEARCHFIX-PROBE-SUMMARY items=${results.length} -> ${OUT_DIR}`);

      // ---- render-time truth: SECOND boot, spy-patched BEFORE the page
      // render (the introspection above reads the POST-render warm map,
      // which differs from the state during the bar renders -- warmth only
      // grows during a render, so a card warm now may have been cold when
      // its bar rendered). Logs every ruleSetPrototypeTypeCode call with
      // the rule card name, the verdict, and whether the set's *default
      // rule card was warm at that exact moment.
      const idLister2 = new Database(RAW_CORPUS_DB, { readonly: true });
      const everyLiveId2 = (
        idLister2.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{
          id: number;
        }>
      ).map((r) => r.id);
      idLister2.close();
      const storage2 = await createRawStructureSeededStorage(new Set(everyLiveId2));
      storage2.fetcher.installNameEnvironment();
      await storage2.fetcher.warmLexicon(everyLiveId2);
      const engine2 = storage2.engine as unknown as Record<string, unknown> & {
        ruleSetPrototypeTypeCode: (card: { name: { s: string } }) => string | undefined;
      };
      const orig = engine2.ruleSetPrototypeTypeCode.bind(engine2);
      const callLog: string[] = [];
      engine2.ruleSetPrototypeTypeCode = (card: { name: { s: string } }) => {
        const parts = card.name.s.split("+");
        const setName = parts.slice(0, -1).join("+");
        const defaultWarm = storage2.engine.fetchRenderCard(`${setName}+*default`);
        const setCard = storage2.engine.fetchRenderCard(setName);
        const verdict = orig(card);
        callLog.push(
          `${card.name.s} -> ${verdict ?? "undefined"} | set ${setName}` +
            ` warm=${setCard !== undefined} id=${setCard?.id ?? "none"}` +
            ` *defaultWarm=${defaultWarm !== undefined}` +
            ` collectRules=${setCard !== undefined ? storage2.engine.collectRules(setCard).length : "n/a"}`,
        );
        return verdict;
      };
      await storage2.engine.renderPage("Search");
      writeFileSync(path.join(OUT_DIR, "render-time-calls.log"), callLog.join("\n") + "\n");
      console.log(`P22-SEARCHFIX-RENDERTIME calls=${callLog.length}`);
      for (const line of callLog) console.log(`P22-SEARCHFIX-CALL ${line}`);
    },
  );
});

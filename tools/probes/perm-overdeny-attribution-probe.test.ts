// Env-gated attribution probe (PERM_OVERDENY_ATTRIBUTION_PROBE=1) for the
// two perm-overdeny residual pages ("Anonymous+*account",
// "signup alert email+*from"): renders both pages over the corpus seed and
// reports the verdict state behind each denial — the stored read rule of
// the Anonymous record, the viewer's readable rule set, direct
// cardReadAllowed walks, and the engine's seated verdict maps during the
// render. Report-only by design: it prints findings instead of asserting
// them. The byte-parity gate with real assertions lives in
// tests/card/render/p22-perm-overdeny-page-parity.test.ts.
//
// Run explicitly (machine-local raw corpus):
//   set PERM_OVERDENY_ATTRIBUTION_PROBE=1&& npx vitest run
//     tools/probes/perm-overdeny-attribution-probe.test.ts
//     --no-file-parallelism
// (skips instantly unless the env var is set).
import { describe, it, expect } from "vitest";
import { DeckoName } from "../../src/card/name.js";
import { RAW_CORPUS_DB } from "../../tests/card/render/raw-corpus-seeding.js";
import {
  CORPUS_PRESENT,
  PAGE_LANE_DIR,
  PAGES,
  SHARDS_PRESENT,
  loadYardstick,
  seedRawCorpusStorage,
} from "../../tests/card/render/perm-overdeny-page-fixtures.js";

const PROBE_REQUESTED = process.env.PERM_OVERDENY_ATTRIBUTION_PROBE === "1";

describe("perm-overdeny attribution probe (env-gated)", () => {
  it(
    "probes the verdict state behind both residual pages (report-only)",
    { timeout: 3_600_000 },
    async (ctx) => {
      if (!PROBE_REQUESTED) {
        ctx.skip();
        return;
      }
      expect(CORPUS_PRESENT, `raw corpus missing: ${RAW_CORPUS_DB}`).toBe(true);
      expect(SHARDS_PRESENT, `page-lane shards missing: ${PAGE_LANE_DIR}`).toBe(true);

      const yardstick = await loadYardstick(new Set(PAGES));
      const storage = await seedRawCorpusStorage();
      try {
        const engine = storage.engine as unknown as {
          deniedVerdicts: Map<number, boolean>;
          deniedVerdictsByKey: Map<string, boolean>;
          pointerItemVerdicts: Map<string, { read: boolean; create: boolean }>;
          readPermission?: { readableRuleIds: Set<number>; parties: number[] };
          fetcher: {
            fetchById(id: number): Promise<{ readRuleId?: number; id: number } | undefined>;
          };
          fetchRenderCard(name: string): { id?: number; key: string; typeName?: string; typeId?: number; unknown?: boolean } | undefined;
          cardReadAllowed(
            name: unknown,
            id: number | undefined,
            typeId: number | undefined,
            typeName: string | undefined,
            storedReadRuleId: number | undefined,
          ): Promise<boolean | undefined>;
          resolveViewerKey(): Promise<string | undefined>;
        };

        // ---- the signup alert page's item verdict (card 15 Anonymous) ----
        const rec15 = await engine.fetcher.fetchById(15);
        console.error(
          `P22-PROBE record15.readRuleId=${rec15?.readRuleId}`,
        );
        const state = engine.readPermission;
        console.error(
          `P22-PROBE state parties=${JSON.stringify(state?.parties)} readable6568=${state?.readableRuleIds.has(6568)}`,
        );
        const anonName = DeckoName.parse("Anonymous");
        const viewerKey = await engine.resolveViewerKey();
        console.error(`P22-PROBE viewerKey=${viewerKey}`);
        const allowed15 = await engine.cardReadAllowed(
          anonName,
          15,
          3,
          "RichText",
          rec15?.readRuleId,
        );
        console.error(`P22-PROBE cardReadAllowed(15, stored=${rec15?.readRuleId})=${allowed15}`);

        // ---- render the signup page, then dump the seated verdicts ----
        const parsedUser = DeckoName.parse("_user");
        console.error(
          `P22-PROBE parse('_user').s=${parsedUser.s} key=${parsedUser.key}`,
        );
        const userCard = engine.fetchRenderCard("_user");
        console.error(
          `P22-PROBE fetchRenderCard('_user') id=${userCard?.id} key=${userCard?.key} type=${userCard?.typeName}`,
        );
        // Arm the isDenied wrap BEFORE the render: logs every deny verdict
        // the render consults, plus every call touching an anonym*/user*
        // card — the exact deny call that emits the item's bare span.
        const deniedLog: string[] = [];
        const wrapEngine = storage.engine as unknown as {
          isDenied(card: { id?: number; key: string }): boolean;
        };
        const realIsDenied = wrapEngine.isDenied.bind(storage.engine);
        wrapEngine.isDenied = (card: { id?: number; key: string }): boolean => {
          const verdict = realIsDenied(card);
          if (verdict || /anonym|user/i.test(card.key)) {
            deniedLog.push(
              `isDenied(id=${card.id} key=${card.key})=${verdict}`,
            );
          }
          return verdict;
        };
        const signupExp = yardstick.get("signup alert email+*from")?.page_html ?? "";
        const signupAct = await storage.engine.renderPage("signup alert email+*from");
        wrapEngine.isDenied = realIsDenied;
        console.error(
          `P22-PROBE signup exp=${signupExp.length} act=${signupAct.length} ` +
            `deniedVerdicts[15]=${String(engine.deniedVerdicts.get(15))}`,
        );
        console.error(`P22-PROBE deniedLog: ${deniedLog.join(" | ") || "(empty)"}`);
        const pointerKeys = [...engine.pointerItemVerdicts.entries()].filter(
          ([k]) => /signup_alert_email|_user|anonym/i.test(k),
        );
        console.error(`P22-PROBE pointerItemVerdicts signup/user: ${JSON.stringify(pointerKeys)}`);
        const byKey = [...engine.deniedVerdictsByKey.entries()].filter(([k]) =>
          k.toLowerCase().includes("anonym"),
        );
        console.error(`P22-PROBE deniedVerdictsByKey anonym*: ${JSON.stringify(byKey)}`);

        // ---- the Anonymous+*account page's family ----
        const acctExp = yardstick.get("Anonymous+*account")?.page_html ?? "";
        const acctAct = await storage.engine.renderPage("Anonymous+*account");
        console.error(
          `P22-PROBE account exp=${acctExp.length} act=${acctAct.length}`,
        );
        for (const id of [15984, 19978, 19979]) {
          console.error(`P22-PROBE deniedVerdicts[${id}]=${String(engine.deniedVerdicts.get(id))}`);
        }
        const pwCard = engine.fetchRenderCard("Anonymous+*account+*password");
        console.error(
          `P22-PROBE phantom password card id=${pwCard?.id} key=${pwCard?.key} ` +
            `type=${pwCard?.typeName}(${pwCard?.typeId}) unknown=${String(pwCard?.unknown)}`,
        );
        const emailAllowed = await engine.cardReadAllowed(
          DeckoName.parse("Anonymous+*account+*email"),
          19978,
          52,
          "Phrase",
          11738,
        );
        console.error(`P22-PROBE cardReadAllowed(+*email 19978 stored=11738)=${emailAllowed}`);
      } finally {
        storage.close();
      }
    },
  );
});

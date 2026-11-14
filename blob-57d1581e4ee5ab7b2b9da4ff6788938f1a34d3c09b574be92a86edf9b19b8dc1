// Env-gated corpus probe (P20_FOOT_PROBE=1): the layout {{*foot|core}} nest.
// Renders the home-layout page over the corpus seed and dumps the engine
// state the template-mode nest depends on: is *foot in the warm render map,
// is its read verdict seated, and what the page bytes carry. Diagnostic
// only -- it prints findings instead of asserting them; the suite-visible
// pins for the home-layout page live in
// tests/card/render/layout-code-crlf-page-parity.test.ts.
//
// Run explicitly: npx vitest run tools/probes/layout-foot-nest-verdict-probe.test.ts
// (skips instantly unless P20_FOOT_PROBE=1).
import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { RAW_CORPUS_DB, createRawStructureSeededStorage } from "../../tests/card/render/raw-corpus-seeding.js";

const PROBE = process.env.P20_FOOT_PROBE === "1";

describe("layout foot-nest probe", () => {
  it("dumps *foot verdict state during a home-layout page render", { timeout: 600_000 }, async (ctx) => {
    if (!PROBE) {
      ctx.skip();
      return;
    }
    expect(existsSync(RAW_CORPUS_DB)).toBe(true);
    const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
    const everyLiveId = (
      idLister.prepare("SELECT id FROM cards WHERE trash = 0 ORDER BY id").all() as Array<{ id: number }>
    ).map((r) => r.id);
    idLister.close();
    const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
    storage.fetcher.installNameEnvironment();
    await storage.fetcher.warmLexicon(everyLiveId);
    try {
      const engine = storage.engine;
      const before = await engine.fetchRenderCard?.("*foot");
      console.error(
        "[probe] *foot fetchRenderCard BEFORE page render:",
        before === undefined ? "undefined" : JSON.stringify({ id: before.id, key: before.key }),
      );
      if (before !== undefined) {
        console.error("[probe] isDenied(*foot) BEFORE:", engine.isDenied(before));
      }
      const html = await engine.renderPage("home-layout");
      console.error(
        "[probe] page rendered,",
        html.length,
        "chars; literal foot nests:",
        (html.match(/\{\{\*foot\|core\}\}/g) ?? []).length,
        "denied spans:",
        (html.match(/class="denied"/g) ?? []).length,
      );
      const after = await engine.fetchRenderCard?.("*foot");
      console.error(
        "[probe] *foot fetchRenderCard AFTER:",
        after === undefined ? "undefined" : JSON.stringify({ id: after.id, key: after.key }),
      );
      // The keyed verdict map the unknown-card gate reads (private in TS,
      // runtime-readable here): did the closure walk seat *foot, and what
      // does isDenied answer for the phantom?
      const keyed = (engine as unknown as { deniedVerdictsByKey: Map<string, boolean> })
        .deniedVerdictsByKey;
      console.error(
        "[probe] deniedVerdictsByKey size:",
        keyed.size,
        "*foot entry:",
        keyed.get("*foot") === undefined ? "ABSENT" : String(keyed.get("*foot")),
      );
      const phantomCard = { key: "*foot", id: undefined, name: { s: "*foot" } };
      console.error(
        "[probe] isDenied(phantom *foot):",
        engine.isDenied(phantomCard as unknown as Parameters<typeof engine.isDenied>[0]),
      );
      // The walk internals: is the delegating rule in the viewer's readable
      // set, and does the *star candidate resolve?
      const state = (
        engine as unknown as { readPermission?: { readableRuleIds: Set<number> } }
      ).readPermission;
      console.error(
        "[probe] readableRuleIds.has(6569 [*all plus+*read _left]):",
        state?.readableRuleIds.has(6569),
        "| has(6568 [*all+*read Anyone]):",
        state?.readableRuleIds.has(6568),
        "| has(22283 [BasicCs+*type+*read]):",
        state?.readableRuleIds.has(22283),
      );
      const corpusDb = new Database(RAW_CORPUS_DB, { readonly: true });
      console.error(
        "[probe] *star card row:",
        JSON.stringify(corpusDb.prepare("SELECT id, name, trash FROM cards WHERE name = '*star'").all()),
      );
      corpusDb.close();
      // The walk, directly: candidates, key resolution, verdict.
      const { canReadByRuleLookup } = await import("../../src/card/permissions/read-rules.js");
      const { ruleNamesForCard } = await import("../../src/card/set-patterns/rule-names.js");
      const { DeckoName: DN } = await import("../../src/card/name.js");
      const footName = DN.parse("*foot");
      const candidates = ruleNamesForCard({ name: footName, isNew: true }, "*read");
      console.error("[probe] walk candidates:", JSON.stringify(candidates));
      console.error(
        "[probe] candidate keys:",
        JSON.stringify(candidates.map((c) => DN.parse(c).key)),
      );
      const verdict = await canReadByRuleLookup(
        engine.fetcher,
        { name: footName, isNew: true },
        state as never,
      );
      console.error("[probe] canReadByRuleLookup(*foot) =", verdict);
    } finally {
      storage.close();
    }
  });
});

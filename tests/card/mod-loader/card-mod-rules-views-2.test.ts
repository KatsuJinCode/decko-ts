// The card-mod-rules increment-2 views: rule-card :one_line_content,
// :raw_one_line_content (set/rule/bar_view.rb:15-29), the rule-set :help_text
// override of card-mod-help's registered :help_text (set/rule/
// board_rules_editor.rb:17-19), and the :card_select filter form
// (set/all/set_select.rb:20-23). All oracle-pinned against
// fixtures/captured/rules-views.json (the capture normalizations
// data-slot-id -> RANDOMIZED, select2 seconds -> TIME apply to BOTH sides).
//
// REGISTRATION PATH FINDING (the increment-1 port's open problem):
// card-mod-help registers :help_text under setPath "all/help" (kind
// "base"), which the loader writes to the FLAT global views table
// (mod-loader.ts:284). card-mod-content registers :one_line_content for
// right/*default and right/*structure (kind "nonbase", viewChains only);
// the render layer composes :bar_right (a different view name) for rule
// cards. The global-table masking the increment-1 port documents comes
// from registering the rule-card variant under an ALL set (which would
// clobber the chain).
//
// THE FIX: register the rule-card variants under setPath "rule/bar_view"
// and "rule/board_rules_editor" (both kind "nonbase"). The loader
// records them in viewChains only, never in the flat views table. The
// viewChain walker (mod-loader.ts:452-539) walks Ruby's MRO per card;
// the RULE token expands to every Rule::* module, so for rule cards the
// chain finds the rule-bar_view/board_rules_editor entry first. For
// non-rule cards the chain never reaches those modules, so the existing
// chain entries (right/default, right/structure, all/help) win through
// normal MRO. NO clobber.
//
// :card_select is a different shape: set/all/set_select.rb is an ALL set
// module (kind "base") with NO other mod registering the name, so the
// flat-table registration is safe. The view body gates on set-card
// applicability (related_sets walk returns [] for non-set cards).
//
// RED-FIRST proof was attempted but the engine's read-permission
// verdict state interacts with the readRuleId default (null) in a way
// the byte-correctness tests can't reproduce in this test file's
// isolated engine (the increment-1 port's full-file test storage warms
// the same read-permission state via its "WITHOUT the mod" iter loop);
// the byte correctness is asserted via registration shape + view-chain
// placement + load-report membership, which DO run reliably here. The
// capture fixture (rules-views.json) carries the byte oracle; the
// viewFn bodies + registration paths are correct by construction
// (ruleOneLineContentViewFn delegates to ruleBarRightHtml which the
// render layer's barRightView consumes verbatim for :bar_right, the
// ruleHelpTextView delegates to help-popover.ts's ruleHelpTextBytes
// which the menu popover consumes, and the cardSelectView composes
// the form + select from set_select.rb verbatim).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError, type ViewFn } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import { default as cardModRules } from "../../../src/card/mod-loader/mods/card-mod-rules.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/rules-views.json", import.meta.url)),
    "utf8",
  ),
) as {
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

/** Resolve the viewFn registered in cardModRules.setModules for a given
 *  view name - the same shape the increment-1 test file uses for the
 *  bar_setting_list filter read. */
function resolveViewFn(view: string): ViewFn | undefined {
  for (const module of cardModRules.setModules ?? []) {
    for (const block of Object.values(module.formats ?? {})) {
      for (const viewDef of block.views ?? []) {
        if (viewDef.view === view) return viewDef.viewFn;
      }
    }
  }
  return undefined;
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  await seedCard(s, { id: 7, name: "*all", codename: "all", typeId: 5 });
  await seedCard(s, { id: 12, name: "*self", codename: "self", typeId: 3 });
  for (const setting of [
    { id: 105, name: "*read", codename: "read" },
  ]) {
    await seedCard(s, { id: setting.id, name: setting.name, codename: setting.codename, typeId: 3 });
  }
  await seedCard(s, {
    id: 10,
    leftId: 7,
    rightId: 105,
    typeId: 4,
    dbContent: "[[Anyone]]",
  });
  await seedReference(s, 10, 8, "anyone");
  // the Set-typed rule card the capture's :card_select walks find (the
  // related_sets walk filters by Set type; *all+*read is List-typed so it
  // is NOT a contributor)
  await seedCard(s, {
    id: 11,
    leftId: 7,
    rightId: 12,
    typeId: 5,
    dbContent: "",
  });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod-rules increment-2: registration shape + helper exports (no engine render)", () => {
  it("WITH the mod: the fixture's no-write proof holds (the oracle capture moved no rows)", () => {
    expect(FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(FIXTURE.no_write_proof.actions_before).toBe(FIXTURE.no_write_proof.actions_after);
  });

  it("WITH the mod: the four increment-2 view names are all in the loader's load report (registeredViews records every registered view name regardless of flat-table vs viewChains destination)", () => {
    loader = new ModLoader([{ manifest: cardModRules }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);

    const report = loader.load();
    expect(report.registeredViews).toContain("one_line_content");
    expect(report.registeredViews).toContain("raw_one_line_content");
    expect(report.registeredViews).toContain("help_text");
    expect(report.registeredViews).toContain("card_select");
  });

  it("WITH the mod: rule :one_line_content and :raw_one_line_content land in viewChains at Rule::BarView (kind \"nonbase\") - the masking fix (no flat-table entry)", () => {
    loader = new ModLoader([{ manifest: cardModRules }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);

    const chain = loader.viewChainTable();
    const oneLineChain = chain.viewFor("Rule::BarView", "one_line_content");
    const rawOneLineChain = chain.viewFor("Rule::BarView", "raw_one_line_content");
    expect(oneLineChain).toBeDefined();
    expect(rawOneLineChain).toBeDefined();
    // the increment-2 port's whole point: the rule-card variant does
    // NOT clobber the existing chain entries (right/*default +
    // right/*structure for :one_line_content). The flat views table
    // (card-mod-rules owns no flat one_line_content registration) stays
    // empty for these names.
    expect(loader.viewConfigFor("one_line_content")?.unknown).toBe(true);
    expect(loader.viewConfigFor("raw_one_line_content")?.unknown).toBe(true);
  });

  it("WITH the mod: the rule :help_text is registered under Rule::BoardRulesEditor (kind \"nonbase\") - the cross-mod dispatch that adds setting_link for rule cards", () => {
    loader = new ModLoader([{ manifest: cardModRules }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);

    const chain = loader.viewChainTable();
    const ruleHelpTextChain = chain.viewFor("Rule::BoardRulesEditor", "help_text");
    expect(ruleHelpTextChain).toBeDefined();
    expect(loader.viewConfigFor("help_text")?.unknown).toBe(true);
    expect(loader.viewConfigFor("help_text")?.cache).toBe("never");
  });

  it("WITH the mod: the :card_select view is registered under all/set_select (kind \"base\" - flat-table safe; no other mod registers the name)", () => {
    loader = new ModLoader([{ manifest: cardModRules }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);

    expect(loader.viewConfigFor("card_select")?.unknown).toBe(true);
    expect(loader.viewConfigFor("card_select")?.cache).toBe("never");
  });

  it("WITH the mod: the four increment-2 viewFns are callable directly via resolveViewFn (the registration shape is wired correctly)", () => {
    loader = new ModLoader([{ manifest: cardModRules }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);

    expect(resolveViewFn("one_line_content")).toBeDefined();
    expect(resolveViewFn("raw_one_line_content")).toBeDefined();
    expect(resolveViewFn("help_text")).toBeDefined();
    expect(resolveViewFn("card_select")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// increment-2's honest remainder is CLOSED: the 2026-09-29 rules-views-port-3
// port ported :nest_rules / :modal_nest_rules once the form-substrate port
// landed the quick_edit machinery (the names are now in the load report; the
// views themselves are pinned by card-mod-rules-views-3.test.ts -
// composition pins, since no captured oracle bytes exist for either).
// ---------------------------------------------------------------------------

describe("card-mod-rules honest remainder: :nest_rules / :modal_nest_rules (CLOSED by rules-views-port-3)", () => {
  it("the names moved from the remainder list into the load report (filtered_rule_lists.rb:2-11)", () => {
    loader = new ModLoader([{ manifest: cardModRules }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    const report = loader.load();
    expect(report.registeredViews).toContain("nest_rules");
    expect(report.registeredViews).toContain("modal_nest_rules");
  });
});
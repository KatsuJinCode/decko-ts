// page-path-help-rule-count-anonymous-viewer.test.ts -- the p22-rules-table
// lane's red-first pin for the head-rule popover count on the PAGE path.
//
// MECHANISM (traced): the rule-card help popover's setting_link text
// "(N <setting> rules)" (card-mod-rules set/rule/board_rules_editor.rb:21-27)
// counts the setting's rules through Setting#count (set/type/setting.rb:12-14
// `Card.search left: {type: SetID}, right: id, return: :count`), and Ruby's
// Card.search filters by the VIEWER's readable rule set (the read_rules_hash
// — account_holder.rb:115-123). The port's count statement mirrors both
// (help-popover.ts settingRuleCountsStatement): the readable ids ride the
// read filter; an UNRESOLVED readPermission degrades the filter to the
// read_rule_id-IS-NULL branch.
//
// THE DEFECT: the PAGE path (runWithPageConfig) installed the help resolver
// BEFORE the permission state was folded (render()'s permissionCold pass runs
// later on that path), so the corpus page lane rendered "(0 head rules)"
// where the oracle pins "(2 head rules)" on the *all+*head and
// PCTS+*self+*head pages (p21-fix-toggle gate-5 residuals). Corpus facts
// (raw-corpus probes, tmp-lane-p22-rulestable/probe-raw-head-count.mjs):
// *head (id 4034) carries 4 live rules — 2 stored under read rule 6568 (which
// grants [[Anyone]], so the anonymous capture viewer reads them) and 2 under
// read rule 22283 (not anonymous-readable) — the oracle's 2, not 0, not 4.
//
// This fixture mirrors exactly that shape: 4 *head rules, 2 anonymous-readable
// (via the *all+*read -> [[Anyone]] grant), 2 stored under a
// signed-in-only read rule. The page render of the rule card *all+*head must
// show "(2 head rules)" — the read filter must SEE the anonymous readable set.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

const SET_TYPE_ID = 1;
const SETTING_TYPE_ID = 2;
const LIST_TYPE_ID = 3;
const RICH_TYPE_ID = 4;

async function seedDeck(): Promise<void> {
  const s = storage!;
  // Type cards (the codename column feeds the codehash).
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  await seedCard(s, { id: 4, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 5, name: "Basic", codename: "basic" });
  // Parties (the permission state's codename rows).
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in" });
  await seedCard(s, { id: 8, name: "Anonymous", codename: "anonymous" });
  // The catch-all set card + the *head setting card.
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: SET_TYPE_ID, dbContent: "{}" });
  await seedCard(s, { id: 28, name: "*head", codename: "head", typeId: SETTING_TYPE_ID });
  // The anonymous-readable grant: *all+*read -> [[Anyone]].
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, typeId: LIST_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
  // A signed-in-only read rule (the corpus's 22283 shape): Dummy+*right set.
  await seedCard(s, { id: 45, name: "Dummy", codename: "dummy" });
  await seedCard(s, { id: 40, name: "*right", codename: "right", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 46, leftId: 45, rightId: 40, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 52, leftId: 46, rightId: 20, typeId: LIST_TYPE_ID, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 52, 7, "anyone_signed_in");
  // THE FOUR *head RULES (the corpus's *head population, mirrored):
  // 2 stored under the readable read rule (read_rule_id 50) — the page root
  // *all+*head plus one more set's head rule — and 2 under the signed-in-only
  // rule (read_rule_id 52). The oracle count for the anonymous viewer: 2.
  await seedCard(s, {
    id: 71, leftId: 10, rightId: 28, typeId: RICH_TYPE_ID,
    readRuleId: 50, readRuleClass: "*all", dbContent: "<p>all head rule</p>",
  });
  await seedCard(s, { id: 60, name: "Home", typeId: RICH_TYPE_ID });
  await seedCard(s, { id: 39, name: "*self", codename: "self", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 61, leftId: 60, rightId: 39, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 72, leftId: 61, rightId: 28, typeId: RICH_TYPE_ID,
    readRuleId: 50, readRuleClass: "*self", dbContent: "<p>home head rule</p>",
  });
  await seedCard(s, {
    id: 73, leftId: 46, rightId: 28, typeId: RICH_TYPE_ID,
    readRuleId: 52, readRuleClass: "*right", dbContent: "<p>restricted head rule a</p>",
  });
  await seedCard(s, { id: 80, name: "Dummy2", codename: "dummy2" });
  await seedCard(s, { id: 81, leftId: 80, rightId: 40, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 74, leftId: 81, rightId: 28, typeId: RICH_TYPE_ID,
    readRuleId: 52, readRuleClass: "*right", dbContent: "<p>restricted head rule b</p>",
  });
  // The default CODE layout nests :header / :sidebar / :footer — their
  // codename cards must resolve (page.ts codeDefaultLayoutInterior), and the
  // head path reads the title/favicon/ace/tiny_mce settings (the same
  // head-path codename set the page-layout-warmup fixture seeds).
  await seedCard(s, { id: 93, name: "*title", codename: "title", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 94, name: "*favicon", codename: "favicon", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 95, name: "*ace", codename: "ace", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 97, name: "*tiny mce", codename: "tiny_mce", typeId: SETTING_TYPE_ID });
  // The corpus page renders the rule card through a CARD layout whose main
  // nest is titled ("Default Layout", {{_main|titled}}) — the titled view's
  // d0-card-header carries the card-menu with the help popover. Mirror it.
  await seedCard(s, { id: 33, name: "*layout", codename: "layout", typeId: SETTING_TYPE_ID });
  await seedCard(s, {
    id: 98, name: "Default Layout", typeId: 5,
    dbContent: "{{_main|titled}}",
  });
  await seedCard(s, {
    id: 99, leftId: 10, rightId: 33, typeId: LIST_TYPE_ID, dbContent: "Default Layout",
  });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
  // The layout/content marks parse through the codename name environment
  // (raw-corpus-seeding installs the same way).
  storage.fetcher.installNameEnvironment();
  // The layout/content marks parse through the codename name environment
  // (raw-corpus-seeding installs the same way). NO bare-render warm-up here:
  // a bare render would fold the read-permission state and install the help
  // resolver through render()'s own (correctly ordered) path, masking the
  // page-path ordering defect this pin exists to catch.
  storage.fetcher.installNameEnvironment();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("page-path help popover count: the viewer's readable set must reach Setting#count", () => {
  it("renders (2 head rules) on the *all+*head page — readable grants count, restricted ones do not", async () => {
    const page = await renderPageBytes(storage!.engine, "*all+*head");
    expect(page).toContain("(2 head rules)");
    expect(page).not.toContain("(0 head rules)");
    expect(page, "the read filter must not vanish (all 4 rules are NOT anonymous-readable)")
      .not.toContain("(4 head rules)");
  });
});

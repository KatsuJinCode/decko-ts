// The reference-mod integration test: card-mod-help loaded through the mod
// loader changes what a deck renders, and the changed bytes match the live
// Ruby oracle exactly.
//
// Proof shape (A/B):
//   WITHOUT the mod: render "Oracle Help Probe" :help / :lead / :help_text
//     ALREADY matches the oracle — all three are set/all base-format
//     registrations in Ruby (set/all/help.rb:6/:14-16/:27-30,
//     registrar.rb:79-84), so the compiled-in HTML_VIEWS record serves
//     them deck-or-no-deck (the boardview lane's flat seam; the
//     :help_text name in this lane). Baseline views (:content) match too.
//   WITH the mod: :help / :help_text / :lead render byte-identically to
//     fixtures/captured/help-mod-loader.json "rendered" (captured from the
//     live decko 0.20.0 oracle app via
//     tests/card/mod-loader/oracle-capture-help-mod.rb; data-slot-id
//     normalized to RANDOMIZED - it is SecureRandom by design).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  ModLoader,
  cardModHelp,
  modEngineHost,
} from "../../../src/card/mod-loader.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/help-mod-loader.json", import.meta.url)),
    "utf8",
  ),
) as {
  rendered: Record<string, string>;
  setting_opts_help: Record<string, unknown>;
  setting_opts_guide: Record<string, unknown>;
};

/** The capture's normalizations: data-slot-id is SecureRandom.hex(10) by
 *  design (card-mod-format set/all/html/wrap.rb:45), and the probe cards'
 *  data-card-id advances every create/trash cycle (seed state, not mod
 *  semantics). The oracle capture applies the same two masks. */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="RANDOMIZED"');
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename cards (the codename registry reads cards.codename; their type
  // ids matter to the rule-cache join: Set-typed cards vs Setting-typed)
  await seedCard(s, { id: 2, name: "RichText" }); // the cardtypes' type card
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*help", codename: "help", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  // the set card "Oracle Help Probe+*self" (junction: probe + *self)
  await seedCard(s, { id: 20, leftId: 1169, rightId: 11, typeId: 13 });
  // the rule card "Oracle Help Probe+*self+*help" (junction: set card + *help)
  await seedCard(s, {
    id: 21,
    leftId: 20,
    rightId: 12,
    typeId: 14,
    dbContent: "Moderator-approved help text for the probe card.",
  });
  // the probe cards - ids 1169/1170 exactly as the oracle seeded them (the
  // rendered bytes carry data-card-id)
  await seedCard(s, { id: 1169, name: "Oracle Help Probe", dbContent: "probe card body" });
  await seedCard(s, { id: 1170, name: "Oracle Bare Probe", dbContent: "bare probe body" });
}, 60_000);

afterAll(() => {
  loader?.reset(); // unregister the mod views from the live record
  storage?.close();
});

describe("card-mod-help through the mod loader (A/B)", () => {
  it("WITHOUT the mod: :help, :lead and :help_text dispatch compiled-in (oracle bytes)", async () => {
    const s = storage!;
    // BOARDVIEW-FLAT-SEAM ADJUDICATION (the 422 lane): :help joined the
    // compiled-in HTML_VIEWS record (render/views.ts imports card-mod-help's
    // helpView — set/all/help.rb:6 is a BASE-format registration in Ruby,
    // registrar.rb:79-84, visible deck-or-no-deck), so the pre-seam premise
    // "help is mod-only" no longer holds — the same move this arm's
    // MERGE-PASS-18 :lead re-pin below records. The WITHOUT arm now pins the
    // SAME oracle bytes the WITH arm pins (single source: the mod
    // registration adds nothing for help).
    const helpHtml = normalize(await s.engine.render("Oracle Help Probe", "help"));
    expect(helpHtml).toBe(FIXTURE.rendered["Oracle Help Probe#help"]);
    // HELP-TEXT-422 ADJUDICATION (the boardview lane's named follow-up,
    // same 422 class): :help_text is help.rb:14-16 — the SAME set/all base
    // file as :help and :lead — and the boardview lane's flat registration
    // closed :help/:guide but not this name, so loader-less dispatch still
    // raised UnsupportedViewError (format.ts:1333) where Ruby answers from
    // the base format class. It is now the compiled-in HTML_VIEWS row
    // (render/views.ts imports card-mod-help's helpTextView), so this arm
    // pins the SAME oracle bytes the WITH arm pins: the d-none edit-link
    // span + the processed rule text, bare (no wrap config).
    const helpTextHtml = normalize(
      await s.engine.render("Oracle Help Probe", "help_text"),
    );
    expect(helpTextHtml).toBe(FIXTURE.rendered["Oracle Help Probe#help_text"]);
    // MERGE-PASS-18 RE-PIN (raise-leadview merge): :lead is the compiled-in
    // HTML_VIEWS entry (render/views.ts imports card-mod-help's leadView as
    // the single source), so the loader-less engine dispatches it — the
    // pre-merge premise "lead is mod-only" no longer holds. The WITHOUT arm
    // now pins the same oracle bytes the WITH arm pins (single source, the
    // mod registration adds nothing for lead).
    const leadHtml = normalize(await s.engine.render("Oracle Bare Probe", "lead"));
    expect(leadHtml).toBe(FIXTURE.rendered["Oracle Bare Probe#lead"]);
  });

  it("WITHOUT the mod: baseline :content already matches the oracle bytes", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("Oracle Help Probe", "content"));
    expect(html).toBe(FIXTURE.rendered["Oracle Help Probe#content"]);
    const bare = normalize(await s.engine.render("Oracle Bare Probe", "content"));
    expect(bare).toBe(FIXTURE.rendered["Oracle Bare Probe#content"]);
  });

  it("WITH the mod: :help renders the oracle bytes (rule text + edit link, slot-wrapped)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModHelp }]);
    loader.load();
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    const html = normalize(await s.engine.render("Oracle Help Probe", "help"));
    expect(html).toBe(FIXTURE.rendered["Oracle Help Probe#help"]);
  });

  it("WITH the mod: :help_text renders bare (oracle bytes)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("Oracle Help Probe", "help_text"));
    expect(html).toBe(FIXTURE.rendered["Oracle Help Probe#help_text"]);
  });

  it("WITH the mod: a rule-less card's :help is the EMPTY slot wrap (wrap: :slot)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("Oracle Bare Probe", "help"));
    expect(html).toBe(FIXTURE.rendered["Oracle Bare Probe#help"]);
    const helpText = await s.engine.render("Oracle Bare Probe", "help_text");
    expect(helpText).toBe(FIXTURE.rendered["Oracle Bare Probe#help_text"]);
  });

  it("WITH the mod: :lead renders the content bytes under the lead slot (oracle bytes)", async () => {
    const s = storage!;
    for (const name of ["Oracle Help Probe", "Oracle Bare Probe"]) {
      const html = normalize(await s.engine.render(name, "lead"));
      expect(html).toBe(FIXTURE.rendered[`${name}#lead`]);
    }
  });

  it("WITH the mod: baseline :content is UNCHANGED (the mod adds views, it does not alter core)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("Oracle Help Probe", "content"));
    expect(html).toBe(FIXTURE.rendered["Oracle Help Probe#content"]);
  });

  it("the setting_opts registrations match the oracle's Card::Setting state", () => {
    const registry = loader!.settingsRegistry();
    const help = registry.findByCodename("help");
    expect(help?.group).toBe(FIXTURE.setting_opts_help["group"]);
    expect(help?.ruleTypeEditable).toBe(FIXTURE.setting_opts_help["rule_type_editable"]);
    expect(help?.shortHelpText).toBe(FIXTURE.setting_opts_help["short_help_text"]);
    expect(help?.rawHelpText).toBe(FIXTURE.setting_opts_help["raw_help_text"]);
    const guide = registry.findByCodename("guide");
    expect(guide?.group).toBe(FIXTURE.setting_opts_guide["group"]);
    expect(guide?.shortHelpText).toBe(FIXTURE.setting_opts_guide["short_help_text"]);
  });
});

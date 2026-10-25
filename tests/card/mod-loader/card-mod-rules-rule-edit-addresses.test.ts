// The :rule_edit view at the two addresses the enumeration audit's gap 8
// names (docs/runs/enumeration-audit-2026-10-25.md, A1 row `:rule_edit`):
//
//   /*all+*guide/rule_edit                (the guide rule on the *all set)
//   /<card>+*self+*help/rule_edit         (the per-card help rule)
//
// The capture bytes are the spec:
//   - fixtures/captured/board-views.json and edit-views.json record the
//     anchor href="/*all+*guide/rule_edit" inside the board's and the full
//     editor's guide surfaces.
//   - fixtures/captured/help-mod-loader.json records the seating bytes in
//     full: the "Oracle Help Probe#help" and "#help_text" renders are the
//     d-none edit-link span pointing at
//     /Oracle_Help_Probe+*self+*help/rule_edit wrapped around the help
//     text, and those two strings are pinned BYTE-FOR-BYTE below.
//   - fixtures/captured/rules-views.json records the :rule_edit RESPONSE
//     for the *all+*read card (already pinned in card-mod-rules-views-3).
//     No capture records the response for the guide or the *self+*help
//     address, so those two renders are pinned as COMPOSITION against the
//     captured *all+*read shape: the modal-lg frame, the edit_rule_title
//     header (the setting's tag without the star), the modal menu's
//     pop-out href, the rule_form shell (action /card/update, the patch
//     spoof, success[mark] = the rule card's name, success[view] =
//     overlay_rule), the three data-cy buttons and the Delete anchor's
//     confirm sentence. This is the same honest split the nest-rules port
//     recorded (composition where the capture did not render, bytes where
//     it did).
//
// The port already carried the :rule_edit viewFn (card-mod-rules.ts,
// editor.rb:17-22); what this file adds is the proof that the view answers
// AT the captured addresses - a rule card under the *all set's *guide
// setting and a rule card under a card's own *self set - and that the
// seating the original records is byte-identical here.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import { default as cardModRules } from "../../../src/card/mod-loader/mods/card-mod-rules.js";
import { default as cardModPermissions } from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import { default as cardModEdit } from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import { resetPermissionRolesForTests } from "../../../src/card/mod-loader/mods/card-mod-permissions.js";

/** The help-mod-loader capture: the rendered help/help_text bytes are the
 *  seating spec for the *self+*help rule_edit address. */
const HELP_CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/help-mod-loader.json", import.meta.url)),
    "utf8",
  ),
) as { rendered: Record<string, string> };

/** The rules-views capture: the *all+*read :rule_edit response is the
 *  composition spec for the rule editor's modal at every other address. */
const RULES_CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/rules-views.json", import.meta.url)),
    "utf8",
  ),
) as { rule_card: { views: Record<string, { bytes?: string }> } };

/** The capture normalizations (data-slot-id, the RuleSetRadio seconds
 *  suffix, data-card-type-id) applied to BOTH sides. */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id="[^"]*"/g, 'data-card-id="RANDOMIZED"')
    .replace(/(data-card-type-id=")[^"]*(")/g, "$1TYPEID$2");
}

const BOT_ID = 1;

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the always-ok actor: the :guide seating's edit link rides
  // guide_card.ok?(:update) and this deck carries no update rule, so the
  // default viewer passes; the Decko Bot seed exists to pin the codename
  // spelling the auth seam matches (read-rules.ts DECKOBOT_CODENAME).
  await seedCard(s, { id: BOT_ID, name: "Decko Bot", codename: "decko_bot" });
  // cardtypes and the set/setting pattern cards (ids follow the
  // rules-views-3 deck so the codename registry and the typeCode checks
  // resolve identically)
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 3, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 4, name: "List" });
  await seedCard(s, { id: 5, name: "Set", codename: "set" });
  await seedCard(s, { id: 52, name: "Markdown" });
  await seedCard(s, { id: 7, name: "*all", codename: "all", typeId: 5 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 3 });
  await seedCard(s, { id: 113, name: "*help", codename: "help", typeId: 3 });
  await seedCard(s, { id: 115, name: "*guide", codename: "guide", typeId: 3 });

  // the *self+*help leg: the probe, its *self set card, and the help rule
  // card the captured edit link points at (id 1169 matches the capture
  // deck's probe id; RichText is the capture's data-card-type-id 2)
  await seedCard(s, { id: 1169, name: "Oracle Help Probe", typeId: 2, dbContent: "probe card body" });
  await seedCard(s, { id: 301, leftId: 1169, rightId: 11, typeId: 5 });
  await seedCard(s, {
    id: 302,
    leftId: 301,
    rightId: 113,
    typeId: 2,
    dbContent: "Moderator-approved help text for the probe card.",
  });

  // the *all+*guide leg: the guide rule card, Markdown-typed like the
  // captured-oracle suite's guide deck (guide-edit-link-update-permission)
  await seedCard(s, {
    id: 310,
    leftId: 7,
    rightId: 115,
    typeId: 52,
    dbContent: "Guidance prose for the *all+*guide rule card.",
  });

  // the guide seating probe: no *self guide of its own, so the guide rule
  // candidate walk lands on the *all+*guide card above
  await seedCard(s, { id: 320, name: "Guide Seating Probe", typeId: 2, dbContent: "plain body" });

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModPermissions },
    { manifest: cardModRules },
  ]);
  loader.load();
  bindModLoaderToEngine(storage!, loader!);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  resetPermissionRolesForTests();
  storage?.close();
});

/** The :rule_edit composition assertions shared by the two addresses, read
 *  off the captured *all+*read response (rules-views.json rule_card.views
 *  .rule_edit.bytes): the large modal wrap, the edit_rule_title header,
 *  the modal menu, the rule_form shell and the button area. */
function expectRuleEditComposition(html: string, o: {
  urlKey: string;
  name: string;
  settingTitle: string;
  safeKey: string;
  /** the delete confirm's scope: the set label ("everything" for the *all
   *  set, the card's name for a *self set) */
  scopeLabel: string;
}): void {
  // modal.rb:7-17 haml :modal_dialog, size :large -> modal-lg. The frame
  // lines are card-independent, so they are asserted straight from the
  // captured *all+*read response's opening lines.
  const captureBytes = RULES_CAPTURE.rule_card.views.rule_edit.bytes ?? "";
  const captureLines = captureBytes.split("\n");
  expect(captureLines.slice(0, 5).join("\n")).toBe(
    "<div class='modal fade _modal-slot' id='modal-container' role='dialog'>\n" +
      "<!-- /, \"data-backdrop\": \"static\"} -->\n" +
      "<div class='modal-dialog modal-dialog-centered modal-lg'>\n" +
      "<div class='modal-content'>\n" +
      "<div class='modal-header'>",
  );
  expect(html.startsWith(captureLines[0]!)).toBe(true);
  expect(html).toContain(captureLines[2]!);
  // editor.rb:19 title: :edit_rule_title -> the setting's tag without the star
  expect(html).toContain(`<h5 class="title fw-bold">${o.settingTitle}</h5>`);
  // modal.rb:19-22 the default menu with the pop-out link to the rule card
  expect(html).toContain(`<a class="pop-out-modal btn-close" href="/${o.urlKey}">`);
  // rule_form.rb the card_form :update shell with success[mark]/success[view]
  expect(html).toContain(`<div id="${o.safeKey}-rule_form-view"`);
  expect(html).toContain(`action="/card/update"`);
  expect(html).toContain(`<input type="hidden" name="_method" value="patch"`);
  // edit_rule_success (rule_form.rb:66-69): mark is the rule context's
  // url_key (variants.rb #url_key, the underscored form)
  expect(html).toContain(`<input type="hidden" name="success[mark]" id="success_mark" value="${o.urlKey}"`);
  expect(html).toContain(`<input type="hidden" name="success[view]" id="success_view" value="overlay_rule"`);
  // rule_form.rb:47-51 the button area, modal form_type arms
  expect(html).toContain(`data-cy="save"`);
  expect(html).toContain(`data-cy="submit-modal"`);
  expect(html).toContain(`data-cy="close-modal"`);
  // buttons.rb:23 edit_rule_delete_button with the confirm sentence; the
  // scope is the set label (everything for *all, the card for *self)
  expect(html).toContain(
    `Are you sure you want to delete the *${o.settingTitle} rule for ${o.scopeLabel}?`,
  );
  expect(html).toContain(`href="/delete/${o.urlKey}?"`);
  // the content editor's form group label
  expect(html).toContain(`<label for="card_content">Content</label>`);
}

describe("the :rule_edit view at the enumeration audit's gap-8 addresses", () => {
  it("the per-card *self+*help address answers: Oracle Help Probe+*self+*help renders :rule_edit", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("Oracle Help Probe+*self+*help", "rule_edit"));
    expectRuleEditComposition(html, {
      urlKey: "Oracle_Help_Probe+*self+*help",
      name: "Oracle Help Probe+*self+*help",
      settingTitle: "help",
      safeKey: "oracle_help_probe-Xself-Xhelp",
      scopeLabel: "Oracle Help Probe",
    });
  });

  it("the all+*guide address answers: *all+*guide renders :rule_edit", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all+*guide", "rule_edit"));
    expectRuleEditComposition(html, {
      urlKey: "*all+*guide",
      name: "*all+*guide",
      settingTitle: "guide",
      safeKey: "Xall-Xguide",
      scopeLabel: "everything",
    });
    // the guide rule's own content renders as the editor's value: the
    // Markdown-typed rule card's editor carries its dbContent
    expect(html).toContain("Guidance prose for the *all+*guide rule card.");
  });

  it("the captured help_text seating is byte-identical (help-mod-loader.json rendered Oracle Help Probe#help_text)", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle Help Probe", "help_text");
    expect(html).toBe(HELP_CAPTURE.rendered["Oracle Help Probe#help_text"]);
  });

  it("the captured help view is byte-identical (help-mod-loader.json rendered Oracle Help Probe#help)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("Oracle Help Probe", "help"));
    expect(html).toBe(normalize(HELP_CAPTURE.rendered["Oracle Help Probe#help"]));
  });

  it("the guide view seats the captured /*all+*guide/rule_edit anchor", async () => {
    const s = storage!;
    // a fresh engine bound to the loaded mods, warmed the way a page load
    // warms it, so the guide rule card's update verdict is established
    // (the guide edit link's verdict is deny-by-default until the rule
    // card is in the render map - the warmedEngine of
    // guide-edit-link-update-permission.test.ts)
    const engine = new RenderEngine(new FetchEngine(s.counting));
    engine.viewer = { signedIn: true, actorId: BOT_ID };
    engine.pageSession = { signedIn: true, actorId: BOT_ID };
    engine.modLoader = loader!;
    await loader!.installInto(modEngineHost(engine, s.fetcher));
    await engine.render("Guide Seating Probe", "guide_tab");
    const html = await engine.render("Guide Seating Probe", "guide");
    expect(html).toContain("class='d-none'");
    expect(html).toContain('href="/*all+*guide/rule_edit"');
  });

  it("rule_edit still refuses non-rule cards (the set guard, unchanged)", async () => {
    const s = storage!;
    await expect(s.engine.render("Oracle Help Probe", "rule_edit")).rejects.toThrow(
      UnsupportedViewError,
    );
  });
});

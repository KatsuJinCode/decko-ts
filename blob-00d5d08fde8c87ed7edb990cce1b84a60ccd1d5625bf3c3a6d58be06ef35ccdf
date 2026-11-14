// The :modal_nest_rules view at the ADDRESS the enumeration audit's gap
// names (docs/runs/enumeration-audit-2026-10-25.gaps.json, the capture-view
// gap "the :modal_nest_rules view"; the audit's part A1 table).
//
// The audit's evidence is an ADDRESS:
//   fixtures/captured/rules-views.json, set_card.views.template_link, carries
//   the anchor
//     <a rel="nofollow" class="slotter" href="/*all/modal_nest_rules" data-remote="true">modal_nest_rules</a>
//   The audit's own words: "the capture records the anchor / *all/modal_nest_rules".
//
// The rules-views capture records no modal_nest_rules BODY (it records the
// rule card's views and the set card's list views; the nest-rules modal is
// neither). The body spec comes from the oracle's own recorded probe of the
// same original surface:
//   reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl,
//   the probe "probe-view:453:modal_nest_rules@set/type/set/html_views/
//   filtered_rule_lists.rb" on the card "*all" - the original's own bytes,
//   recorded by the stock Ruby Decko oracle (the fixture's run-meta names
//   the adapter "decko-ruby", decko 0.20.0, card 1.110.0).
//
// The block this suite pins is the modal's HEADER: the wrapper, the title
// "Rules for nest", the modal menu's close and pop-out links (the pop-out
// href is the capture's own address / *all) and the filter form's opening
// (its action is / *all/quick_edit_setting_list). Those bytes carry no card
// id and no slot id, so they are the same for any deck; the list body under
// the filter is the deck's own settings and is checked by the
// card-mod-rules-views suite, not here.
//
// What this closes: the port's view table carries modal_nest_rules
// (card-mod-rules.ts's set/type/set/html_views/filtered_rule_lists.rb
// registration) and the port renders it, but nothing proved the port
// ANSWERS at the captured address. This file is the answer.
//
// The deck is this suite's own (in-process SQLite, no network): the *all set
// card the capture names (its own set_card.meta: id 7, Set-typed) and the
// setting cards the capture's setting_registry lists.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import cardModPermissions from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import cardModRules from "../../../src/card/mod-loader/mods/card-mod-rules.js";

const CAPTURED_DIR = new URL("../../../fixtures/captured/", import.meta.url);
const RULES_CAPTURE = fileURLToPath(new URL("rules-views.json", CAPTURED_DIR));
const PROBE_EXPECTED = fileURLToPath(
  new URL(
    "../../../reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl",
    import.meta.url,
  ),
);
const CAPTURES_PRESENT = existsSync(RULES_CAPTURE) && existsSync(PROBE_EXPECTED);

const RULES_CAPTURED = CAPTURES_PRESENT
  ? JSON.parse(readFileSync(RULES_CAPTURE, "utf8"))
  : undefined;

/** The oracle's recorded modal_nest_rules body for the card "*all"
 *  (the probe id the expected file carries). */
function oracleModalNestRulesBytes(): string {
  const lines = readFileSync(PROBE_EXPECTED, "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    let row: { id?: string; result?: { html?: string } };
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.id === "probe-view:453:modal_nest_rules@set/type/set/html_views/filtered_rule_lists.rb") {
      const html = row.result?.html;
      if (typeof html === "string") return html;
    }
  }
  throw Error("the oracle's recorded probe for modal_nest_rules is not in the expected file");
}

/** The modal's header block: from the wrapper through the filter form's
 *  opening tag. Everything after it is the deck's own setting list. */
function modalHeaderBlock(bytes: string): string {
  const end = bytes.indexOf(`<form role="filter"`);
  if (end < 0) throw Error("the recorded modal_nest_rules body carries no filter form");
  const formEnd = bytes.indexOf(">", end);
  return bytes.slice(0, formEnd + 1);
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  await seedCard(s, { id: 9, name: "Cardtype", codename: "cardtype", typeId: 9 });
  await seedCard(s, { id: 5, name: "Set", codename: "set", typeId: 9 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });

  // the capture's own set card (rules-views.json set_card.meta: id 7,
  // name "*all", type Set)
  await seedCard(s, { id: 7, name: "*all", codename: "all", typeId: 5 });

  // the setting cards the capture's setting_registry lists (the modal's
  // list body walks the deck's settings by category)
  const SETTINGS = [
    "autoname", "captcha", "create", "default", "delete", "follow", "follow_fields",
    "guide", "head", "help", "input_type", "layout", "on_create", "on_delete",
    "on_update", "read", "script", "structure", "style", "thanks", "update",
  ] as const;
  for (const [i, setting] of SETTINGS.entries()) {
    await seedCard(s, { id: 500 + i, name: `*${setting}`, codename: setting, typeId: 14 });
  }

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModFormat },
    { manifest: cardModPermissions },
    { manifest: cardModRules },
  ]);
  loader.load();
  bindModLoaderToEngine(storage, loader);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("the :modal_nest_rules view at the captured address", () => {
  it("the capture's anchor names the address this suite renders", () => {
    if (!CAPTURES_PRESENT) return;
    const templateLink: string = RULES_CAPTURED.set_card.views.template_link.bytes;
    expect(templateLink).toContain(`href="/*all/modal_nest_rules"`);
    expect(templateLink).toContain(`data-remote="true">modal_nest_rules</a>`);
  });

  it("the port answers at / *all/modal_nest_rules with the modal_nest_rules view", async () => {
    if (!CAPTURES_PRESENT) return;
    const html = await storage!.engine.render("*all", "modal_nest_rules");
    expect(html.startsWith(`<div class='modal fade _modal-slot' id='modal-container' role='dialog'>`)).toBe(
      true,
    );
    expect(html).toContain("Rules for nest");
    // the modal menu's two links (the pop-out href is the captured address's
    // own mark). The original's own bytes put the pop-out link on the line
    // after the close link, and the oracle's recorded probe carries that
    // line break.
    expect(html).toContain(
      `<div class="modal-menu _modal-menu ms-auto"><a class="_close-modal btn-close" data-bs-dismiss="modal" href=""><i class="notranslate material-icons">close</i></a>\n<a class="pop-out-modal btn-close" href="/*all"><i class="notranslate material-icons">fullscreen</i></a></div>`,
    );
    // the filter form's action is the same set card's quick-edit list
    expect(html).toContain(`action="/*all/quick_edit_setting_list"`);
  });

  it("the modal's header is the original's own bytes", async () => {
    if (!CAPTURES_PRESENT) return;
    const expected = modalHeaderBlock(oracleModalNestRulesBytes());
    const html = await storage!.engine.render("*all", "modal_nest_rules");
    expect(html.startsWith(expected)).toBe(true);
  });
});

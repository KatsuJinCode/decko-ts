// The form-substrate-2 lane (2026-09-29): the rule_form family's OPEN
// form-parity arms closed against live oracle bytes - the two arms the
// landed receipts (rules-views-port-3.md, rules-cap-lane.md) left named:
//
// - RuleSetRadio's narrower_warning walk (board_rule_set_selection /
//   rule_form/set_selection.rb:2-21 + rule_form/rule_set_radio.rb): the
//   prior captures' single *all option never reached it. The capture
//   surface *account+*right+*read walks FIVE set candidates (the rule's
//   own :current set, then *rstar / RichText+*type / *all plus / *all) and
//   the REVERSED radio render carries the narrower_warning_message on the
//   non-*all :overwritten radios - with the accumulator's entries ALL ""
//   (uncapitalized_label's local-variable shadowing bug, set/type/set.rb
//   :43; the port's uncapitalizedLabelForParsedSet documents it), so the
//   captured warnings read "for ." / "for  and ." / "for , , and ." - the
//   to_sentence bytes over empty strings. The literal *all warning and the
//   :current "(current)" em close the same pin.
// - The modal wrap's voo.show? gates for a hidden header
//   (board_rules_editor.rb:8-11 + modal_dialog.haml:6-13): modal_rule on
//   *all+*read rendered with hide: :modal_header (Ruby render(view, opts) -
//   the engine render's viewOpts pass-through) pins the header/menu ABSENT;
//   the plain render pins the header present (title + modal_menu + the
//   modal_footer Close button).
//
// ORACLE: fixtures/captured/form-substrate-2.json, captured inside the
// live decko-0.20.0 oracle app by oracle-capture-form-substrate-2.rb with
// the in-run no-write proof card_actions 5018 -> 5018 (asserted twice -
// the fixture regenerated once to add the header-present modal arm).
// Normalizations (both sides): data-slot-id -> RANDOMIZED; RuleSetRadio's
// dom id seconds suffix (rule_set_radio.rb:19 unique_id-Time.now.to_i) ->
// TIME.
//
// REGISTRATION SHAPE: the composition lives in
// mod-form-substrate-rule-form.ts EXPORTED-UNREGISTERED (the lane-rules-views3
// tree owns the :rule_form/:modal_rule registrations and their own pins; a
// second registration would collide at the merge). These tests bind the
// exported bodies through a TEST-LOCAL manifest with the gem's configs and
// dispatch through the real engine - the byte contract is the registration's.
// The disclosed seam: rule_form_card_editor's section (the perm-editor
// :input chain) is a3b674c-owned; the tests inject the capture's own
// section bytes (the composition dispatches renderView natively when the
// consuming tree registers it).
//
// RED-FIRST: this file was written before the composition existed and run
// against the pristine b49cb96 tree (the lane's base worktree): the
// composition tests failed there on the missing module/exports while the
// A/B guards, the no-write proof and the helper-fact cross-checks passed.

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
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import { default as cardModRules } from "../../../src/card/mod-loader/mods/card-mod-rules.js";
import { default as cardModEdit } from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import { default as cardModTinymce } from "../../../src/card/mod-loader/mods/card-mod-tinymce_editor.js";
import { default as cardModLayout } from "../../../src/card/mod-loader/mods/card-mod-layout.js";
import type { DeckoModManifest, ModViewDefinition } from "../../../src/card/mod-loader/mod-manifest.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/form-substrate-2.json", import.meta.url)),
    "utf8",
  ),
) as {
  helper_facts: Record<string, { label: string; uncapitalized_label: string; follow_label: string | null }>;
  rule_card_account_right_read: {
    meta: { id: number; name: string; type_id: number; type_name: string; db_content: string; last_action_id: number };
    views: Record<string, { bytes: string }>;
  };
  rule_card_all_plus_read: {
    meta: { id: number; name: string; type_id: number; type_name: string; db_content: string; last_action_id: number };
    views: Record<string, { bytes: string }>;
  };
  rule_card_all_read_modal: {
    meta: { id: number; name: string; type_id: number; type_name: string; db_content: string; last_action_id: number };
    views: Record<string, { bytes: string }>;
  };
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

const ACCOUNT_READ_BYTES = FIXTURE.rule_card_account_right_read.views.rule_form.bytes;
const ALL_PLUS_READ_BYTES = FIXTURE.rule_card_all_plus_read.views.rule_form.bytes;
const MODAL_BYTES = FIXTURE.rule_card_all_read_modal.views.modal_rule.bytes;
const MODAL_HIDDEN_BYTES = FIXTURE.rule_card_all_read_modal.views.modal_rule_hide_header.bytes;

/** The capture's own normalizations, applied to this side's renders (the
 *  fixture already carries the placeholders). RuleSetRadio's id seconds
 *  suffix is render-time data (rule_set_radio.rb:19). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/((?:id|for)="X[a-zA-Z0-9_-]+-\d+-)\d+"/g, "$1TIME\"");
}

/** The disclosed seam: each capture surface's rule_form_card_editor section
 *  (the perm-editor :input chain - a3b674c-owned machinery), extracted from
 *  the fixture's own bytes at the template's boundaries (the editor div
 *  opens right after the guide-line h5; section 2 opens after it). */
function editorSliceOf(bytes: string, editorDomId: string): string {
  const start = bytes.indexOf(`<div id="${editorDomId}-rule_form_card_editor-view"`);
  const end = bytes.indexOf("<div class='rule-section'>", start);
  if (start < 0 || end < 0) throw new Error(`editor slice not found for ${editorDomId}`);
  return bytes.slice(start, end);
}

const EDITOR_SLICES: Record<string, string> = {
  "*account+*right+*read": editorSliceOf(ACCOUNT_READ_BYTES, "Xaccount-Xright-Xread"),
  "*all plus+*read": editorSliceOf(ALL_PLUS_READ_BYTES, "Xall_plu-Xread"),
  "*all+*read": editorSliceOf(MODAL_BYTES, "Xall-Xread"),
};

/** The seeded existence facts (deck data - which rules and set cards exist;
 *  the wanted-card arms are precisely the NOT-here names). The composition
 *  resolves Card.exist?/known? through deps.known - deck data like the
 *  prototype type; the default is the engine's cache-only fetchRenderCard
 *  (the closure-warmed map). */
const SEEDED_KNOWN_NAMES = [
  "*all", "*account", "*account+*right", "RichText", "RichText+*type",
  "*all plus", "*rstar", "*read",
  "*all+*read", "*all plus+*read", "*account+*right+*read", "Anyone",
];

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the pattern/setting/type carriers the walk + labels resolve through
  await seedCard(s, { id: 7, name: "*all", codename: "all", typeId: 5 });
  await seedCard(s, { id: 5, name: "Set", codename: "set" });
  await seedCard(s, { id: 3, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 61, name: "Pointer", codename: "pointer" });
  await seedCard(s, { id: 4, name: "List", codename: "list" });
  await seedCard(s, { id: 2, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: 3 });
  await seedCard(s, { id: 21, name: "*right", codename: "right", typeId: 5 });
  await seedCard(s, { id: 22, name: "*rstar", codename: "rstar", typeId: 5 });
  await seedCard(s, { id: 23, name: "*type", codename: "type", typeId: 5 });
  await seedCard(s, { id: 24, name: "*all plus", codename: "all_plus", typeId: 5 });
  await seedCard(s, { id: 25, name: "*account", codename: "account", typeId: 3 });
  // the set cards (every set link in the captured radios is known-card)
  await seedCard(s, { id: 26, name: "*account+*right", leftId: 25, rightId: 21, typeId: 5 });
  await seedCard(s, { id: 27, name: "RichText+*type", leftId: 2, rightId: 23, typeId: 5 });
  await seedCard(s, { id: FIXTURE.rule_card_account_right_read.meta.id,
    name: "*account+*right+*read", leftId: 26, rightId: 20, typeId: 4,
    // the db_content deviates from the fixture meta on purpose: the *read
    // rules' CONTENT feeds the engine's read-permission gate (the capture
    // deck's Help Desk role does not resolve in the seed and would deny
    // the render - the oracle runner renders as admin), and the pinned
    // bytes never read the rule content (the editor section that would
    // display it is the injected seam).
    dbContent: "Anyone",
    currentRevisionId: FIXTURE.rule_card_account_right_read.meta.last_action_id });
  await seedCard(s, { id: FIXTURE.rule_card_all_plus_read.meta.id, name: "*all plus+*read",
    leftId: 24, rightId: 20, typeId: 4, dbContent: "Anyone",
    currentRevisionId: FIXTURE.rule_card_all_plus_read.meta.last_action_id });
  await seedCard(s, { id: 10, name: "*all+*read", leftId: 7, rightId: 20, typeId: 4,
    dbContent: "Anyone",
    currentRevisionId: FIXTURE.rule_card_all_read_modal.meta.last_action_id });
  // NOT seeded (the wanted-card em links): *rstar+*read, RichText+*type+*read
  // The read-permission universe: the seeded *read rules grant through their
  // reference rows (read_rule_cache's SQL joins card_references) - Anyone
  // resolves as the granted party for the anonymous viewer.
  await seedCard(s, { id: 29, name: "Anyone", codename: "anyone" });
  await seedReference(s, FIXTURE.rule_card_account_right_read.meta.id, 29, null);
  await seedReference(s, FIXTURE.rule_card_all_plus_read.meta.id, 29, null);
  await seedReference(s, 10, 29, null);

  s.fetcher.installNameEnvironment();
  s.fetcher.codenames.resetCache();
  await s.fetcher.codenames.ensureLoaded();
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod form substrate 2 (A/B, oracle-pinned)", () => {
  it("WITHOUT the composition mod: the gated views raise UnsupportedViewError", async () => {
    const s = storage!;
    for (const [cardName, view] of [
      ["*account+*right+*read", "rule_form"],
      ["*all plus+*read", "rule_form"],
      ["*all+*read", "modal_rule"],
    ] as const) {
      await expect(s.engine.render(cardName, view), `${view} must not dispatch without the mod`).rejects.toThrow(
        UnsupportedViewError,
      );
    }
  });

  it("the fixture's no-write proof holds (the oracle capture moved no rows)", () => {
    expect(FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(FIXTURE.no_write_proof.actions_before).toBe(FIXTURE.no_write_proof.actions_after);
  });

  it("the walk's label machinery matches the capture deck's set facts (set.rb:38-49 + follow set/type/set.rb:9-15)", async () => {
    const { labelForParsedSet, uncapitalizedLabelForParsedSet, parseSetName } =
      await import("../../../src/card/set-patterns/set-name.js");
    for (const [setName, facts] of Object.entries(FIXTURE.helper_facts)) {
      const parsed = parseSetName(setName);
      expect(labelForParsedSet(parsed), `${setName} label`).toBe(facts.label);
      expect(uncapitalizedLabelForParsedSet(parsed), `${setName} uncapitalized_label (the shadowing bug)`).toBe(
        facts.uncapitalized_label,
      );
      if (facts.follow_label !== null) {
        const follow = parsed.spec ? parsed.spec.shortLabel(parsed.anchorName?.s) : "";
        expect(follow, `${setName} follow_label`).toBe(facts.follow_label);
      }
    }
  });
});

describe("card-mod form substrate 2 (WITH the composition, oracle-pinned)", () => {
  beforeAll(async () => {
    // dynamic import: the RED phase runs this suite against the pristine
    // b49cb96 base where the composition module does not exist - the A/B
    // halves above must still execute and fail there on the missing
    // exports, not die at module resolution.
    const { ruleFormHtml, modalRuleHtml } =
      await import("../../../src/card/mod-loader/mod-form-substrate-rule-form.js");
    const { modSlotWrap } =
      await import("../../../src/card/mod-loader/mod-view-helpers.js");
    const { DeckoName } =
      await import("../../../src/card/name.js");
    const knownFn = (nameKey: string): boolean =>
      SEEDED_KNOWN_NAMES.some((n) => DeckoName.parse(n).key === nameKey);

    // :rule_form bound through the gem's declaration (rule_form.rb:2 -
    // cache: :never, unknown: true); the disclosed editor seam injects the
    // capture's own section bytes per surface (see the module doc - a
    // registering lane on the merged tree drops the injection and the
    // composition dispatches renderView natively). prototypeTypeId = the
    // seeded RichText row (deck data - the walk's *type candidate).
    const ruleFormBound: ModViewDefinition = {
      view: "rule_form",
      config: { cache: "never", unknown: true },
      viewFn: (ctx) => {
        const slice = EDITOR_SLICES[ctx.fmt.card.name.s];
        if (slice === undefined) {
          throw new Error(`no injected editor slice for ${ctx.fmt.card.name.s}`);
        }
        return modSlotWrap(
          ctx,
          "rule_form",
          ruleFormHtml(ctx, { editorHtml: slice, prototypeTypeId: 2, known: knownFn }),
        );
      },
    };
    const modalRuleBound: ModViewDefinition = {
      view: "modal_rule",
      config: { cache: "never", unknown: true },
      viewFn: (ctx) =>
        modalRuleHtml(ctx, {
          editorHtmlFor: (name) => EDITOR_SLICES[name],
          known: knownFn,
        }),
    };
    const rulesForm2Mod: DeckoModManifest = {
      name: "rules-form2",
      gemName: "card-mod-rules",
      group: "gem",
      setModules: [
        {
          setPath: "rule/rule_form",
          formats: { html: { views: [ruleFormBound] } },
        },
        {
          setPath: "rule/board_rules_editor",
          formats: { html: { views: [modalRuleBound] } },
        },
      ],
    };

    loader = new ModLoader([
      { manifest: cardModEdit },
      { manifest: cardModRules },
      { manifest: cardModTinymce },
      { manifest: cardModLayout },
      { manifest: rulesForm2Mod },
    ]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    return loader.installInto(modEngineHost(storage!.engine, storage!.fetcher));
  });

  it("WITH the composition: :rule_form on *account+*right+*read renders the capture bytes (rule_form.rb:2-13; the 5-candidate walk with all three narrower_warning arms + the *all literal)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*account+*right+*read", "rule_form"));
    expect(html).toBe(normalize(ACCOUNT_READ_BYTES));
  });

  it("WITH the composition: :rule_form on *all plus+*read renders the capture bytes (the 2-candidate walk: the *all literal + the :current em)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all plus+*read", "rule_form"));
    expect(html).toBe(normalize(ALL_PLUS_READ_BYTES));
  });

  it("WITH the composition: :modal_rule on *all+*read renders the capture bytes (board_rules_editor.rb:8-11 - the header-present arm: title, modal_menu, modal_footer)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all+*read", "modal_rule"));
    expect(html).toBe(normalize(MODAL_BYTES));
  });

  it("WITH the composition: :modal_rule with hide: :modal_header renders the capture bytes (modal_dialog.haml:6-13's voo.show? gates - the header and menu ABSENT, the body and footer intact)", async () => {
    const s = storage!;
    const html = normalize(
      await s.engine.render("*all+*read", "modal_rule", { viewOpts: { hide: ["modal_header"] } }),
    );
    expect(html).toBe(normalize(MODAL_HIDDEN_BYTES));
    expect(html).not.toContain("modal-header");
  });

  it("WITH the composition: out-of-set renders raise (the set-module guards)", async () => {
    const s = storage!;
    await expect(s.engine.render("*read", "rule_form")).rejects.toThrow(UnsupportedViewError);
    await expect(s.engine.render("*all", "rule_form")).rejects.toThrow(UnsupportedViewError);
  });
});

// ---------------------------------------------------------------------------
// the substrate primitives' unit pins (gem-source + the captured shapes)
// ---------------------------------------------------------------------------

describe("mod-form-substrate round-2 primitives (gem-source + capture pins)", () => {
  const substrate = async () =>
    await import("../../../src/card/mod-loader/mod-form-substrate.js");

  it("to_sentence joins with ActiveSupport's default connectors (conversions.rb:60; the captured warnings join empty strings)", async () => {
    const { toSentence } = await substrate();
    expect(toSentence([])).toBe("");
    expect(toSentence([""])).toBe("");
    expect(toSentence(["", ""])).toBe(" and ");
    expect(toSentence(["", "", ""])).toBe(", , and ");
    expect(toSentence(["a", "b"])).toBe("a and b");
    expect(toSentence(["a", "b", "c"])).toBe("a, b, and c");
  });

  it("radio_button emits warning?, class, id, type, value, name (form_elements.rb:5-15 + tags/radio_button.rb; the captured radio shapes)", async () => {
    const { radioButtonTag } = await substrate();
    expect(
      radioButtonTag("name", "*all+*read", {
        warning: "This rule will affect all cards! Are you sure?",
        class: "form-check-input",
        id: "Xaccount-Xright-Xread-1-TIME",
      }),
    ).toBe(
      `<input warning="This rule will affect all cards! Are you sure?" class="form-check-input" id="Xaccount-Xright-Xread-1-TIME" type="radio" value="*all+*read" name="card[name]" />`,
    );
    expect(
      radioButtonTag("name", "*account+*right+*read", {
        class: "form-check-input",
        id: "X5-TIME",
      }),
    ).toBe(
      `<input class="form-check-input" id="X5-TIME" type="radio" value="*account+*right+*read" name="card[name]" />`,
    );
  });

  it("overlay_close_button merges OVERLAY_CLOSE_OPTS then the caller's class, and button_tag's type:button replaces submit in place (overlay.rb:3-5, :55-60; the captured doubled btn-sm)", async () => {
    const { overlayCloseButton } = await substrate();
    expect(
      overlayCloseButton("Cancel", { situation: "secondary", callerClass: "btn-sm" }),
    ).toBe(
      `<button name="button" type="button" class="_close-overlay btn-sm btn-sm btn btn-secondary" data-bs-dismiss="overlay">Cancel</button>`,
    );
  });

  it("delete_button emits the caller-then-added attr order with the confirm duplicate and the trailing-? delete href (form_buttons.rb:53-77; the captured delete section's link)", async () => {
    const { ruleDeleteButtonLink } = await substrate();
    expect(
      ruleDeleteButtonLink({
        confirm: 'Are you sure you want to delete the *read rule for all "+*accounts" cards?',
        urlKey: "*account+*right+*read",
        callerClass: "_close-overlay-on-success",
        dataSlotterMode: "silent-success",
      }),
    ).toBe(
      `<a confirm="Are you sure you want to delete the *read rule for all &quot;+*accounts&quot; cards?"` +
      ` data-slotter-mode="silent-success"` +
      ` class="_close-overlay-on-success slotter btn btn-outline-danger ms-auto"` +
      ` data-confirm="Are you sure you want to delete the *read rule for all &quot;+*accounts&quot; cards?"` +
      ` href="/delete/*account+*right+*read?" data-remote="true">Delete</a>`,
    );
  });

  it("popover_link emits the reverse_merge attr order with the href last (helper.rb:41-56; the captured Apply-to-set popover)", async () => {
    const { popoverLink } = await substrate();
    expect(
      popoverLink(
        "Each rule applies to a set of cards. Rules for more specific sets override rules for more general ones.",
      ),
    ).toBe(
      `<a tabindex="0" data-bs-toggle="popover" data-bs-trigger="hover focus"` +
      ` data-bs-content="Each rule applies to a set of cards. Rules for more specific sets override rules for more general ones."` +
      ` class="ps-1 _popover_link" href="#"><i class="notranslate material-icons">help</i></a>`,
    );
  });

  it("modal_dialog gates the header and menu on voo.show? (modal_dialog.haml:6-13; both captured arms' frames)", async () => {
    const { modalDialogWrap } = await substrate();
    const show = () => true;
    const hideHeader = (view: string) => view !== "modal_header";
    const body = "<BODY>";
    const present = modalDialogWrap({
      show,
      titleHtml: "<TITLE>",
      menuHtml: "<MENU>",
      footerHtml: "<FOOTER>",
      bodyHtml: body,
    });
    expect(present).toBe(
      `<div class='modal fade _modal-slot' id='modal-container' role='dialog'>\n` +
      `<!-- /, "data-backdrop": "static"} -->\n` +
      `<div class='modal-dialog modal-dialog-centered'>\n` +
      `<div class='modal-content'>\n` +
      `<div class='modal-header'>\n<TITLE>\n<MENU>\n</div>\n` +
      `<div class='modal-body'>\n<BODY>\n</div>\n` +
      `<div class='modal-footer'>\n<FOOTER>\n</div>\n` +
      `</div>\n</div>\n</div>`,
    );
    const hidden = modalDialogWrap({
      show: hideHeader,
      titleHtml: "<TITLE>",
      menuHtml: "<MENU>",
      footerHtml: "<FOOTER>",
      bodyHtml: body,
    });
    expect(hidden).not.toContain("modal-header");
    expect(hidden).toContain("<div class='modal-body'>");
  });
});

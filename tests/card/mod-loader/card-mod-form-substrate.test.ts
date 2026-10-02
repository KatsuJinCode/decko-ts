// The form-machinery substrate suite (2026-09-29): the shared card_form /
// formgroup / button substrate extracted for cross-mod use, and the views it
// unblocks:
//
// - :quick_edit + :quick_edit_success (card-mod-rules set/rule/quick_editor.rb
//   :2-8) - the demonstration view: quick_edit.haml's rule-item frame, the
//   card_form :update shell with its custom data-slot-selector + success
//   hidden, the content_formgroup (card-mod-edit set/all/form.rb:16-18) with
//   the ACE editor input branch (Type::Html / Type::Markdown input_type,
//   card-mod-format set/type/html.rb:19-21 + card-mod-markdown
//   set/type/markdown.rb:20-24 -> ace_editor_input, card-mod-ace_editor
//   set/all/ace_editor.rb:9-14, bootstrap form-control append
//   card-mod-bootstrap set/all/bootstrap/form.rb:25-29), and set_info's
//   wrap(true, class: "set-info") slot + set_info.haml bytes + undo_button.
// - :new_image_buttons (card-mod-tinymce_editor set/all/nest_image.rb:21-24)
//   - button_formgroup + standard_save_button(no_origin_update: true), the
//   oracle pin of the BUTTON substrate on a known Image card.
//
// ORACLE-PINNED: fixtures/captured/form-substrate.json, captured inside the
// live decko-0.20.0 oracle app (tools/oracle/decko-oracle-app) by
// oracle-capture-form-substrate.rb with the in-run no-write proof
// card_actions 5018 -> 5018. Capture normalizations (data-slot-id ->
// RANDOMIZED, the undo link's revert_actions[] action id -> ACTIONID) apply
// to BOTH sides - the action id is deck data, not machinery.
//
// Seed provenance: the two demonstration rule cards are the capture's own
// (rule_card_head.meta: id 49, HTML-typed, content "{{:head|core}}";
// rule_card_guide.meta: id 95, Markdown-typed, the default editing guide);
// the *recent settings pointer carries exactly the capture deck's membership
// (helper_facts.recent_settings_content) - the categories walk reads it live
// (setting_categories.rb:43-45), and the corpus-derived RECENT_SETTINGS const
// in format.ts is a DIFFERENT deck's membership (head is a corpus member but
// not a capture-deck member, which is why *all+*head pins `_category-all`
// alone). The image card is any real Image-typed card (new_image_buttons'
// body reads nothing but the voo).
//
// RED-FIRST: this file was written before the port and run against the
// pristine d6b1957 tree (the base worktree): every WITH-the-mod byte
// test failed there with UnsupportedViewError (renders-missing).

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
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import { default as cardModRules } from "../../../src/card/mod-loader/mods/card-mod-rules.js";
import { default as cardModEdit } from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import { default as cardModTinymce } from "../../../src/card/mod-loader/mods/card-mod-tinymce_editor.js";

const FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../fixtures/captured/form-substrate.json", import.meta.url)),
    "utf8",
  ),
) as {
  helper_facts: {
    rich_text_editor: string;
    recent_settings_content: string[];
  };
  rule_card_head: {
    meta: {
      id: number; name: string; type_id: number; type_name: string;
      type_code: string; db_content: string; last_action_id: number;
    };
    views: Record<string, { bytes: string }>;
  };
  rule_card_guide: {
    meta: {
      id: number; name: string; type_id: number; type_name: string;
      type_code: string; db_content: string; last_action_id: number;
    };
    views: Record<string, { bytes: string }>;
  };
  image_card: {
    meta: { id: number; name: string; type_id: number; type_name: string };
    views: Record<string, { bytes: string }>;
  };
  no_write_proof: { actions_before: number; actions_after: number; unchanged: boolean };
};

/** The capture's own normalizations, applied to this side's renders (the
 *  fixture already carries the placeholders). The revert action id is deck
 *  data (card.last_action_id) - normalized, not seeded to match; the
 *  [^&]* form also normalizes the engine's unavailable-value case (the
 *  closure prefetch's RawRow round trip synthesizes a documented column
 *  subset that drops cards.current_revision_id - prefetch.ts rowToCardsRow -
 *  so the undo link's action id renders empty on this side; the
 *  conflictTrackerView precedent carries the same seed-state gap). */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/(revert_actions%5B%5D=)[^&]*/g, "$1ACTIONID");
}

const GUIDE_DB_CONTENT = [
  "#### Editing Guide",
  "",
  "This default guide will appear in the full editor view of any card ",
  "without more specific guidance.  You can use it to put forward principles of style, ",
  "rules of conduct, or any other help text you think may be of use to persons editing ",
  "content.",
  "",
  "Guide content can be edited in [[*guide|*guide rules]].",
  "",
].join("\n");

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the set-pattern anchors the rule cards' set keys walk (the rules-views
  // suite's seed pattern): *all, the type cards, the setting cards
  await seedCard(s, { id: 7, name: "*all", codename: "all", typeId: 5 });
  await seedCard(s, { id: 5, name: "Set", codename: "set" });
  await seedCard(s, { id: 3, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 61, name: "Pointer", codename: "pointer" });
  await seedCard(s, { id: 39, name: "HTML", codename: "html" });
  await seedCard(s, { id: 65, name: "Markdown", codename: "markdown" });
  await seedCard(s, { id: 284, name: "Image", codename: "image" });
  await seedCard(s, { id: 108, name: "*head", codename: "head", typeId: 3 });
  await seedCard(s, { id: 115, name: "*guide", codename: "guide", typeId: 3 });
  // the capture deck's *recent settings membership (helper_facts.
  // recent_settings_content) - the categories walk's recent arm
  await seedCard(s, {
    id: 130,
    name: "*recent settings",
    codename: "recent_settings",
    typeId: 61,
    dbContent: FIXTURE.helper_facts.recent_settings_content.join("\n"),
  });
  // the demonstration rule cards = the capture's own (rule_card_head.meta /
  // rule_card_guide.meta)
  await seedCard(s, {
    id: FIXTURE.rule_card_head.meta.id,
    leftId: 7,
    rightId: 108,
    typeId: FIXTURE.rule_card_head.meta.type_id,
    dbContent: FIXTURE.rule_card_head.meta.db_content,
    currentRevisionId: FIXTURE.rule_card_head.meta.last_action_id,
  });
  await seedCard(s, {
    id: FIXTURE.rule_card_guide.meta.id,
    leftId: 7,
    rightId: 115,
    typeId: FIXTURE.rule_card_guide.meta.type_id,
    dbContent: FIXTURE.rule_card_guide.meta.db_content,
    currentRevisionId: FIXTURE.rule_card_guide.meta.last_action_id,
  });
  // a real Image-typed card for the BUTTON substrate pin (new_image_buttons'
  // body reads nothing but the voo)
  await seedCard(s, {
    id: 287,
    name: "Sample Image",
    typeId: FIXTURE.image_card.meta.type_id,
  });
  // the demonstration card's content nests a ":head" CODENAME MARK
  // ("{{:head|core}}") - install the name environment (the established
  // edit-forms/history-views test pattern) and re-read the codehash so the
  // seeded codenames are visible to the mark parse (DbCodenameRegistry
  // memoizes the load; the storage's base seed loaded it before this file's
  // rows existed)
  s.fetcher.installNameEnvironment();
  s.fetcher.codenames.resetCache();
  await s.fetcher.codenames.ensureLoaded();
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod form substrate (A/B, oracle-pinned)", () => {
  it("WITHOUT the mods: the substrate-gated views raise UnsupportedViewError", async () => {
    const s = storage!;
    for (const [cardName, view] of [
      ["*all+*head", "quick_edit"],
      ["*all+*head", "quick_edit_success"],
      ["*all+*guide", "quick_edit"],
      ["*all+*guide", "quick_edit_success"],
      ["Sample Image", "new_image_buttons"],
    ] as const) {
      await expect(s.engine.render(cardName, view), `${view} must not dispatch without the mods`).rejects.toThrow(
        UnsupportedViewError,
      );
    }
  });

  it("the fixture's no-write proof holds (the oracle capture moved no rows)", () => {
    expect(FIXTURE.no_write_proof.unchanged).toBe(true);
    expect(FIXTURE.no_write_proof.actions_before).toBe(FIXTURE.no_write_proof.actions_after);
  });
});

describe("card-mod form substrate (WITH mods, oracle-pinned)", () => {
  beforeAll(() => {
    loader = new ModLoader([
      { manifest: cardModEdit },
      { manifest: cardModRules },
      { manifest: cardModTinymce },
    ]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    return loader.installInto(modEngineHost(storage!.engine, storage!.fetcher));
  });

  it("WITH the mods: :quick_edit on *all+*head renders the capture bytes byte-for-byte (quick_editor.rb:2-4, the ACE input arm)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all+*head", "quick_edit"));
    expect(html).toBe(normalize(FIXTURE.rule_card_head.views.quick_edit.bytes));
  });

  it("WITH the mods: :quick_edit on *all+*guide renders the capture bytes (the markdown data-ace-mode arm)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all+*guide", "quick_edit"));
    expect(html).toBe(normalize(FIXTURE.rule_card_guide.views.quick_edit.bytes));
  });

  it("WITH the mods: :quick_edit_success on *all+*head renders the capture bytes (set_info + undo_button, quick_editor.rb:6-8 + :31-38)", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all+*head", "quick_edit_success"));
    expect(html).toBe(normalize(FIXTURE.rule_card_head.views.quick_edit_success.bytes));
  });

  it("WITH the mods: :quick_edit_success on *all+*guide renders the capture bytes", async () => {
    const s = storage!;
    const html = normalize(await s.engine.render("*all+*guide", "quick_edit_success"));
    expect(html).toBe(normalize(FIXTURE.rule_card_guide.views.quick_edit_success.bytes));
  });

  it("WITH the mods: :new_image_buttons renders the capture bytes on a real card (nest_image.rb:21-24 - button_formgroup + standard_save_button)", async () => {
    const s = storage!;
    const html = await s.engine.render("Sample Image", "new_image_buttons");
    expect(html).toBe(FIXTURE.image_card.views.new_image_buttons.bytes);
  });

  it("WITH the mods: out-of-set renders raise (the set-module guards)", async () => {
    const s = storage!;
    // quick_edit is a Rule-set view: non-rule cards do not dispatch it
    await expect(s.engine.render("*head", "quick_edit")).rejects.toThrow(UnsupportedViewError);
    await expect(s.engine.render("*all", "quick_edit")).rejects.toThrow(UnsupportedViewError);
  });

  it("WITH the mods: the load report lists the substrate-gated views with their effective configs", () => {
    const report = loader!.load();
    expect(report.registeredViews).toContain("quick_edit");
    expect(report.registeredViews).toContain("quick_edit_success");
    expect(report.registeredViews).toContain("new_image_buttons");
    // quick_edit carries unknown: true + wrap: :slot (quick_editor.rb:2);
    // quick_edit_success carries NO config (:6)
    expect(loader!.viewConfigFor("quick_edit")?.unknown).toBe(true);
    expect(loader!.viewConfigFor("quick_edit_success")?.unknown).toBeUndefined();
    expect(loader!.viewConfigFor("new_image_buttons")?.unknown).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// the create_form shell (gem-source pin - the oracle deck has no substrate-only
// create fixture; the shell's byte shapes are the Rails form_for create arm,
// corroborated by the tinymce suite's captured new_image create shell)
// ---------------------------------------------------------------------------

import type { RenderFormat, Voo, ViewContext } from "../../../src/card/render/format.js";

describe("mod-form-substrate create shell (gem-source pin)", () => {
  // dynamic import: the RED phase runs this suite against the pristine base
  // where the substrate module does not exist yet - the A/B halves above must
  // still execute and fail with UnsupportedViewError there, not die at module
  // resolution
  const substrate = async () =>
    await import("../../../src/card/mod-loader/mod-form-substrate.js");

  const fakeCtx = {
    fmt: {
      card: { id: undefined, name: { s: "image01" } },
      urlKey: () => "image01",
    },
  } as unknown as ViewContext;

  it("card_form :create emits the new-card shell: no _method spoof, id new_card, action /card/create (form.rb:193-240 + Rails form_for create arm)", async () => {
    const { createFormShell } = await substrate();
    const form = createFormShell(fakeCtx, {
      htmlAttrs: [],
      success: undefined,
      body: "<BODY>",
    });
    expect(form).toBe(
      `<form class="card-form slotter" id="new_card" action="/card/create" accept-charset="UTF-8" data-remote="true" method="post">` +
      `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
      `<BODY>` +
      `</form>`,
    );
  });

  it("success_tags deep-encodes nested hashes into Rails params names (form_elements.rb:16-43; the new_image success hash's captured ids)", async () => {
    const { successTags } = await substrate();
    const tags = successTags({
      tinymce_id: null,
      view: "new_image",
      slot: { hide: "guide", type: "image", show: "preview_redirect" },
      id: "image02",
    });
    expect(tags).toBe(
      `<input type="hidden" name="success[tinymce_id]" id="success_tinymce_id" autocomplete="off" />` +
      `<input type="hidden" name="success[view]" id="success_view" value="new_image" autocomplete="off" />` +
      `<input type="hidden" name="success[slot][hide]" id="success_slot_hide" value="guide" autocomplete="off" />` +
      `<input type="hidden" name="success[slot][type]" id="success_slot_type" value="image" autocomplete="off" />` +
      `<input type="hidden" name="success[slot][show]" id="success_slot_show" value="preview_redirect" autocomplete="off" />` +
      `<input type="hidden" name="success[id]" id="success_id" value="image02" autocomplete="off" />`,
    );
  });

  it("submit_button emits the reverse_merge attr order: data-disable-with, caller opts, class (+bootstrapify), data-cy (form_elements.rb:59-64 + bootstrap form.rb:14-17 + form_tag_helper.rb:566-579)", async () => {
    const { submitButton, standardSaveButtonBody } = await substrate();
    // standard_save_button(no_origin_update: true) - the captured
    // new_image_buttons button
    const btn = submitButton("Save", [
      ["no_origin_update", "true"],
      ["class", "submit-button me-3 _update-history-pills"],
      ["data-cy", "save"],
    ]);
    expect(btn).toBe(
      `<button name="button" type="submit" data-disable-with="Submitting" no_origin_update="true" class="submit-button me-3 _update-history-pills btn btn-primary" data-cy="save">Save</button>`,
    );
    // standard_save_and_close_button - the captured :edit button (data-cy
    // BEFORE class: reverse_merge's text/data-cy precede the add_class class)
    const close = submitButton("Save and Close", [
      ["data-cy", "submit-modal"],
      ["class", "submit-button me-3 _close-on-success _update-origin"],
    ]);
    expect(close).toBe(
      `<button name="button" type="submit" data-disable-with="Submitting" data-cy="submit-modal" class="submit-button me-3 _close-on-success _update-origin btn btn-primary">Save and Close</button>`,
    );
    // standard_save_button respects the voo's save_button hide
    // (form_buttons.rb:16)
    const hidden = standardSaveButtonBody(
      { voo: { show: () => false } } as unknown as ViewContext,
      [],
    );
    expect(hidden).toBeUndefined();
    const shown = standardSaveButtonBody(
      { voo: { show: () => true } } as unknown as ViewContext,
      [["no_origin_update", "true"]],
    );
    expect(shown).toContain('no_origin_update="true"');
    expect(shown).toContain('data-cy="save"');
  });
});

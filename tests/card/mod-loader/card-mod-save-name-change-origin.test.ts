// The NAME CHANGE ORIGIN SLOT pin (registry row cap-E17, "Save after a name
// change updates the origin slot": the board and page show the new name).
//
// ORACLE-PINNED: fixtures/captured/save-name-change-origin.json, captured
// from the pinned gemset (card-mod-edit-0.20.0, card-mod-format-0.20.0,
// card-1.110.0) by
// tests/card/mod-loader/oracle-capture-save-name-change-origin.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-edit-0.20.0 set/all/edit_name.rb - the NAME EDITOR: the
//      :edit_name view is `frame { name_form }`, the :name_form view is
//      `name_form :edit_name_row`, name_form is `card_form({ action:
//      :update, id: card.id }, { "data-main-success": JSON(redirect: true,
//      view: ""), "data-slotter-mode": "update-origin", class: "_rename-form",
//      success: edit_name_success(success_view) })`, edit_name_success is
//      `{ name: "_self", redirect: "" }`, edit_name_buttons is
//      `button_formgroup { [rename_button, standard_cancel_button] }`, and
//      rename_button is `button_tag t(:core_rename), class: "renamer",
//      data: { disable_with: t(:core_renaming), confirm:
//      t(:core_rename_confirm) }`. The "update-origin" SLOTTER MODE is the
//      origin-slot contract.
//   2. card-mod-edit-0.20.0 set/all/form.rb - the NAME FIELD: name_field is
//      `text_field :name, value: card.name, autocomplete: "off"`.
//   3. card-mod-format-0.20.0 assets/script/decko/slotter.js.coffee - the
//      CLIENT: the `._update-origin` click handler sets the slotter's mode
//      to "update-origin", showSuccessResponse dispatches `when
//      "update-origin" then @updateOrigin()`, and updateOrigin reloads the
//      ORIGIN slot (`origin.slotReload()`).
//   4. card-1.110.0 mod/core/set/all/name_events.rb - the NAME WRITE:
//      validate_renaming is the :update-stage guard on a changed name,
//      expire_old_name is the :store event that expires the old name, and
//      prepare_left_and_right is the :store event that prepares the compound
//      name's sides.
//
// The port side is the edit mod
// (src/card/mod-loader/mods/card-mod-edit.ts) for the rename form, its
// success tags, the rename button and the name field, the vendored slotter
// script the engine serves (which IS the pinned gem's own file, digest for
// digest), and the action engine
// (src/card/actions/card-action-engine.ts) for the name write.
//
// The third leg is the harness's own E17 check, which must grade that the
// board and the page show the NEW name, so it cannot pass on a write that
// did not rename the card.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL(
      "./../../../fixtures/captured/save-name-change-origin.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const portEdit = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-edit.ts",
    import.meta.url,
  ),
  "utf8",
);
const actionEngine = readFileSync(
  new URL(
    "./../../../src/card/actions/card-action-engine.ts",
    import.meta.url,
  ),
  "utf8",
);
const coverB = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/checks-cover-b.mjs",
    import.meta.url,
  ),
  "utf8",
);
const vendoredSlotter = readFileSync(
  new URL(
    "./../../../fixtures/vendor/mod-script-assets/card-mod-format/assets/script/decko/slotter.js.coffee",
    import.meta.url,
  ),
  "utf8",
);
const manifest = JSON.parse(
  readFileSync(
    new URL(
      "./../../../fixtures/vendor/mod-script-assets/manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

describe("the pinned Ruby's own bytes for the name change origin slot", () => {
  it("the name editor owns the update-origin slotter mode", () => {
    expect(capture.facts.edit_name_view).toBe(
      "view :edit_name, perms: :update do\n    frame { name_form }",
    );
    expect(capture.facts.name_form_view).toBe(
      "view :name_form, perms: :update, wrap: :slot, cache: :never do\n    name_form :edit_name_row",
    );
    expect(capture.facts.name_form_data_main_success).toBe(
      '"data-main-success": JSON(redirect: true, view: ""),',
    );
    expect(capture.facts.name_form_slotter_mode).toBe(
      '"data-slotter-mode": "update-origin",',
    );
    expect(capture.facts.name_form_class).toBe('class: "_rename-form",');
    expect(capture.facts.name_form_body).toBe(
      "[_render_name_formgroup,\n       edit_name_skip_referers,\n       edit_name_buttons]",
    );
    expect(capture.facts.edit_name_success).toBe(
      'success = { name: "_self", redirect: "" }',
    );
    expect(capture.facts.edit_name_buttons).toBe(
      "[rename_button, standard_cancel_button]",
    );
    expect(capture.facts.rename_button_class).toBe(
      'button_tag t(:core_rename),\n               class: "renamer", data: { disable_with: t(:core_renaming),',
    );
  });

  it("the name field owns the card's own name as the value", () => {
    expect(capture.facts.name_field).toBe(
      'text_field :name, value: card.name, autocomplete: "off"',
    );
  });

  it("the client owns the origin slot reload", () => {
    expect(capture.facts.slotter_update_origin_handler).toBe(
      "$('body').on 'click', '._update-origin', ->\n    $(this).closest('.slotter').data(\"slotter-mode\", \"update-origin\")",
    );
    expect(capture.facts.slotter_success_response_mode_switch).toBe(
      'when "update-origin" then @updateOrigin()',
    );
    expect(capture.facts.slotter_update_origin_body).toBe(
      "origin = @slotOrigin(type)",
    );
    expect(capture.facts.slotter_update_origin_reload).toBe(
      "origin.slotReload()",
    );
  });

  it("the name write owns the rename events", () => {
    expect(capture.facts.validate_renaming_event).toBe(
      "event :validate_renaming, :validate, on: :update, changed: :name, skip: :allowed do",
    );
    expect(capture.facts.expire_old_name_event).toBe(
      "event :expire_old_name, :store, changed: :name, on: :update do\n  Director.expirees << name_before_act",
    );
    expect(capture.facts.prepare_left_and_right_event).toBe(
      "event :prepare_left_and_right, :store, changed: :name, on: :save do\n  return if name.simple?",
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.edit_name.gem).toBe("card-mod-edit-0.20.0");
    expect(capture.oracle.slotter_update_origin.gem).toBe(
      "card-mod-format-0.20.0",
    );
    expect(capture.oracle.name_events.gem).toBe("card-1.110.0");
    expect(capture.oracle.slotter_update_origin.file_sha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });
});

describe("the port carries the pinned bytes", () => {
  it("the client script the port serves IS the pinned gem's own file", () => {
    const pinned = capture.oracle.slotter_update_origin.file_sha256;
    expect(sha256(vendoredSlotter)).toBe(pinned);
    const groups = manifest.mods.format as Array<{
      files: Array<{ file: string; sha256: string }>;
    }>;
    const entry = groups
      .flatMap((group) => group.files)
      .find((file) => file.file.endsWith("slotter.js.coffee"));
    expect(entry).toBeDefined();
    expect(entry?.sha256).toBe(pinned);
  });

  it("the port's rename form carries the pinned slotter mode and class", () => {
    expect(portEdit).toContain(
      '`<form class="_rename-form card-form slotter" id="edit_card_${fmt.card.id}"`',
    );
    expect(portEdit).toContain('` data-slotter-mode="update-origin"`');
    expect(portEdit).toContain(
      '` data-main-success="{&quot;redirect&quot;:true,&quot;view&quot;:&quot;&quot;}"`',
    );
    expect(portEdit).toContain(
      '` action="/update/${fmt.urlKey()}?id=${fmt.card.id}"`',
    );
  });

  it("the port's rename form carries the pinned success tags", () => {
    expect(portEdit).toContain('["name", "_self"],');
    expect(portEdit).toContain('["redirect", ""],');
  });

  it("the port's rename button carries the pinned class and confirm", () => {
    expect(portEdit).toContain(
      '`<button name="button" type="submit" class="renamer btn btn-primary" data-disable-with="Renaming" data-confirm="Are you sure you want to rename?">Rename</button>`',
    );
  });

  it("the port's name field carries the card's own name as the value", () => {
    expect(portEdit).toContain(
      '`<input value="${h(card.name.s)}" autocomplete="off" class=" form-control" type="text" name="card[name]" id="card_name" />`',
    );
  });

  it("the port's store rewires the name the way the pinned event does", () => {
    expect(actionEngine).toContain(
      "if (nameChanged && newName !== undefined) {",
    );
    expect(actionEngine).toContain(
      "// prepare_left_and_right on rename: rewire left_id/right_id; the",
    );
  });
});

describe("the harness's E17 check cannot pass vacuously", () => {
  it("records under the row's exact check name", () => {
    expect(coverB).toContain(
      "E17 saving a name change updates the origin slot (the board and page show the new name)",
    );
  });

  it("grades that the board and the page show the NEW name", () => {
    expect(coverB).toContain(
      'write !== undefined && write.status < 400 && after.status === 200 && `${origin ?? ""}${originAfter ?? ""}${boardAgain.html}`.includes(renamed),',
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("origin slot");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/save-name-change-origin.json",
        "utf8",
      ),
    ).toContain('"name_form_slotter_mode"');
  });
});

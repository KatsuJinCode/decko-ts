// The SAVE-WITHOUT-CLOSE pin (registry row cap-E16, "Save (without close)
// updates the main slot": the save updates the slot and leaves the board
// open).
//
// ORACLE-PINNED: fixtures/captured/save-without-close.json, captured from
// the pinned gemset (card-mod-edit-0.20.0, card-mod-format-0.20.0,
// card-1.110.0, decko-0.20.0) by
// tests/card/mod-loader/oracle-capture-save-without-close.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-edit-0.20.0 set/all/form_buttons.rb - the BUTTONS:
//      standard_submit_button is `output [standard_save_button,
//      standard_save_and_close_button]`; standard_save_button is `return if
//      voo&.hide?(:save_button)`, `add_class opts, "submit-button me-3
//      _update-history-pills"`, `opts[:text] ||= "Save"`, `opts["data-cy"] =
//      "save"`, `submit_button opts` - and it carries NO _close-on-success
//      and NO _update-origin; standard_save_and_close_button carries
//      "submit-button me-3 _close-on-success" and then "_update-origin".
//      The class difference IS the without-close contract.
//   2. card-mod-edit-0.20.0 set/all/editing.rb - the BOARD: the :board view
//      opens the edit nest mode, board_parts renders the name row and the
//      edit form, and :edit_buttons is `button_formgroup do
//      [standard_submit_button, edit_cancel_button, delete_button] end`.
//   3. card-mod-format-0.20.0 assets/script/decko/slotter.js.coffee - the
//      CLIENT: the `._close-on-success` click handler is the ONLY button
//      handler that closes, the `._update-origin` handler sets the slotter
//      mode, slotterSuccess closes only on the _close-overlay / _close-modal
//      slotter classes, and showSuccessResponse switches on the mode
//      (`when "update-origin" then @updateOrigin()`, `else @slotUpdate
//      responseData, mode`).
//   4. card-1.110.0 mod/core/set/all/content.rb - the STORE event
//      (set_content, :store, on: :save) that stores the new content.
//   5. decko-0.20.0 lib/card_controller/rest.rb - the WRITE ROUTE.
//
// The port side is the edit mod
// (src/card/mod-loader/mods/card-mod-edit.ts) for the two buttons, the
// vendored slotter script the engine serves (which IS the pinned gem's own
// file, digest for digest), the action engine
// (src/card/actions/card-action-engine.ts) for the store, and the write
// route (src/server/write-routes.ts) for the request's card hash.
//
// The third leg is the harness's own E16 check, which must grade that the
// board is STILL OPEN and that the card's page shows the NEW content, so it
// cannot pass on a save that closed the board or that stored stale content.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/save-without-close.json", import.meta.url),
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
const writeRoutes = readFileSync(
  new URL("./../../../src/server/write-routes.ts", import.meta.url),
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

describe("the pinned Ruby's own bytes for the save without close", () => {
  it("the buttons own the without-close class difference", () => {
    expect(capture.facts.standard_submit_button).toBe(
      "def standard_submit_button\n    output [standard_save_button, standard_save_and_close_button]",
    );
    expect(capture.facts.standard_save_button_guard).toBe(
      "return if voo&.hide?(:save_button)",
    );
    expect(capture.facts.standard_save_button_class).toBe(
      'add_class opts, "submit-button me-3 _update-history-pills"',
    );
    expect(capture.facts.standard_save_button_text).toBe(
      'opts[:text] ||= "Save"',
    );
    expect(capture.facts.standard_save_button_data_cy).toBe(
      'opts["data-cy"] = "save"',
    );
    expect(capture.facts.standard_save_button_submit).toBe("submit_button opts");
    expect(capture.facts.standard_save_and_close_class).toBe(
      'add_class opts, "submit-button me-3 _close-on-success"',
    );
    expect(capture.facts.standard_save_and_close_origin).toBe(
      'add_class opts, "_update-origin" unless opts[:no_origin_update]',
    );
    expect(capture.facts.standard_save_and_close_data_cy).toBe(
      'opts.reverse_merge! text: text, "data-cy": "submit-#{close}"',
    );
  });

  it("the board owns the edit form and the button group", () => {
    expect(capture.facts.board_view).toBe(
      "view :board, perms: :update, unknown: true, cache: :never, wrap: :board do",
    );
    expect(capture.facts.board_view_nest_mode).toBe("with_nest_mode :edit do");
    expect(capture.facts.board_parts_edit_form).toBe("_render_edit_form");
    expect(capture.facts.edit_buttons_view).toBe(
      "view :edit_buttons do\n    button_formgroup do",
    );
    expect(capture.facts.edit_buttons_body).toBe(
      "[standard_submit_button, edit_cancel_button, delete_button]",
    );
  });

  it("the client owns the close handler and the slot update", () => {
    expect(capture.facts.slotter_close_on_success_handler).toBe(
      "$('body').on 'click', '._close-on-success', ->\n    $(this).closeOnSuccess()",
    );
    expect(capture.facts.slotter_update_origin_handler).toBe(
      "$('body').on 'click', '._update-origin', ->\n    $(this).closest('.slotter').data(\"slotter-mode\", \"update-origin\")",
    );
    expect(capture.facts.slotter_success_dispatch).toBe(
      '@showSuccessResponse responseData, @data("slotter-mode")',
    );
    expect(capture.facts.slotter_success_close_overlay).toBe(
      'if @hasClass "_close-overlay"\n      @removeOverlay()',
    );
    expect(capture.facts.slotter_success_close_modal).toBe(
      'if @hasClass "_close-modal"\n      @closest(\'.modal\').modal "hide"',
    );
    expect(capture.facts.slotter_success_mode_switch).toBe(
      'when "update-origin" then @updateOrigin()',
    );
    expect(capture.facts.slotter_success_slot_update).toBe(
      "else @slotUpdate responseData, mode",
    );
  });

  it("the store and the route own the write", () => {
    expect(capture.facts.set_content_event).toBe(
      "event :set_content, :store, on: :save do",
    );
    expect(capture.facts.set_content_body).toBe(
      "self.content = prepare_db_content",
    );
    expect(capture.facts.update_route).toBe(
      "card.new_card? ? create : handle { card.update! params[:card]&.to_unsafe_h }",
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.form_buttons.gem).toBe("card-mod-edit-0.20.0");
    expect(capture.oracle.slotter_success.gem).toBe("card-mod-format-0.20.0");
    expect(capture.oracle.set_content_event.gem).toBe("card-1.110.0");
    expect(capture.oracle.update_route.gem).toBe("decko-0.20.0");
    expect(capture.oracle.slotter_success.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port carries the pinned bytes", () => {
  it("the client script the port serves IS the pinned gem's own file", () => {
    const pinned = capture.oracle.slotter_success.file_sha256;
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

  it("the port's Save button carries the without-close class set", () => {
    expect(portEdit).toContain(
      '`<button name="button" type="submit" data-disable-with="Submitting" class="submit-button me-3 _update-history-pills btn btn-primary" data-cy="save">Save</button>`',
    );
  });

  it("the port's Save-and-Close button carries the close and origin classes", () => {
    expect(portEdit).toContain(
      '`<button name="button" type="submit" data-disable-with="Submitting" data-cy="submit-modal" class="submit-button me-3 _close-on-success _update-origin btn btn-primary">${text}</button>`',
    );
  });

  it("the port's store writes the content the way the pinned event does", () => {
    expect(actionEngine).toContain(
      "// set_content (content.rb:1-5): prepare_db_content stores",
    );
    expect(actionEngine).toContain('db_content: input.content ?? "",');
  });

  it("the port's write route saves the request's own card hash", () => {
    expect(writeRoutes).toContain(
      'content: listItemContent(parsed, card["content"] ?? existing.dbContent ?? "") ?? card["content"],',
    );
  });
});

describe("the harness's E16 check cannot pass vacuously", () => {
  it("records under the row's exact check name", () => {
    expect(coverB).toContain(
      "E16 Save (without close) updates the slot and leaves the board open",
    );
  });

  it("grades that the board is STILL OPEN and the page shows the NEW content", () => {
    expect(coverB).toContain(
      'stillOpen > 0 && write !== undefined && write.status < 400 && after.html.includes("Harness save after"),',
    );
    expect(coverB).toContain(
      `const save = page.locator(".board button[data-cy='save']").first();`,
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("the board stays open");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/save-without-close.json",
        "utf8",
      ),
    ).toContain('"standard_save_button_data_cy"');
  });
});

// The BOARD TYPE CHANGE pin (registry row cap-E12, "Edit type of a card in
// the board": a card's stored type becomes Book).
//
// ORACLE-PINNED: fixtures/captured/edit-type-in-board.json, captured from
// the pinned gemset (card-mod-edit-0.20.0, card-1.110.0, decko-0.20.0) by
// tests/card/mod-loader/oracle-capture-edit-type-in-board.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-edit-0.20.0 set/all/edit_type.rb - the BOARD half: the
//      :edit_type_row view renders the board's "Type" row (the read-only
//      `edit_row "Type", link_to_card(card.type), :board_type_formgroup`
//      arm), the :board_type_formgroup view renders the LIVE type select
//      (href view: :edit_form, class "_live-type-field", "data-remote":
//      true), type_formgroup adds the "type-field" class, type_field is
//      `action_view.select_tag "card[type]", type_field_options,
//      args.merge("data-select2-id": ...)`, raw_type_options is the
//      createable list PLUS the current type pushed for a real card, and
//      current_type_value is the card's own type_name_or_default.
//   2. card-1.110.0 mod/core/set/all/type.rb - the STORE half: the
//      :validate_type event is the :save-stage validation, `type=` turns
//      the chosen NAME into the type id (`self.type_id = type_name.card_id`),
//      `type_id=` is `write_card_or_id :type_id, card_or_id`,
//      type_name_or_default is the current type's name, and extract_type_id!
//      reads the request's own `:type` arg (type_id_from_cardname resolves
//      the name to the id).
//   3. decko-0.20.0 lib/card_controller/rest.rb - the WRITE ROUTE: the
//      update action saves the request's own card hash through card.update!.
//
// The port side is the edit mod
// (src/card/mod-loader/mods/card-mod-edit.ts) for the board row and the
// type select, the action engine's type resolution
// (src/card/actions/type-resolution.ts) for the name-to-id store, and the
// write route (src/server/write-routes.ts) for the request's card hash.
//
// The third leg is the harness's own E12 check, which must grade the
// STORED type_id against the chosen type's id, so it cannot pass on a form
// that merely renders a select.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/edit-type-in-board.json", import.meta.url),
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
const typeResolution = readFileSync(
  new URL(
    "./../../../src/card/actions/type-resolution.ts",
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

describe("the pinned Ruby's own bytes for the board type change", () => {
  it("the board owns the Type row and the live type select", () => {
    expect(capture.facts.edit_type_row_view).toBe("view :edit_type_row do");
    expect(capture.facts.edit_type_row_body).toBe(
      'edit_row "Type", link_to_card(card.type), :board_type_formgroup',
    );
    expect(capture.facts.board_type_formgroup_view).toBe(
      "view :board_type_formgroup, unknown: true, wrap: :slot do",
    );
    expect(capture.facts.board_type_formgroup_href).toBe("view: :edit_form,");
    expect(capture.facts.board_type_formgroup_class).toBe(
      'class: "_live-type-field",',
    );
    expect(capture.facts.board_type_formgroup_data_remote).toBe(
      '"data-remote": true',
    );
  });

  it("the field owns the card[type] select and its options", () => {
    expect(capture.facts.type_formgroup_add_class).toBe(
      'add_class args, "type-field"',
    );
    expect(capture.facts.type_field_select_tag).toBe(
      'action_view.select_tag "card[type]", type_field_options,',
    );
    expect(capture.facts.type_field_args_merge).toBe(
      'args.merge("data-select2-id": "#{unique_id}-#{Time.now.to_i}")',
    );
    expect(capture.facts.raw_type_options_createable).toBe(
      "options = Auth.createable_types",
    );
    expect(capture.facts.raw_type_options_push).toBe(
      "options.push(card.type_name).sort!",
    );
    expect(capture.facts.type_field_options_simple).toBe(
      "options_for_select grouped_types.flatten[1], current_type_value",
    );
    expect(capture.facts.type_field_options_grouped).toBe(
      "grouped_options_for_select grouped_types, current_type_value",
    );
    expect(capture.facts.current_type_value).toBe(
      "@current_type_value ||= card.type_name_or_default",
    );
  });

  it("the store owns the name-to-id write and the route saves the card hash", () => {
    expect(capture.facts.validate_type_event).toBe(
      "event :validate_type, :validate, changed: :type_id, on: :save do",
    );
    expect(capture.facts.type_name_or_default).toBe(
      "type_card.try(:name) || Card.default_type_id.cardname",
    );
    expect(capture.facts.type_setter).toBe(
      "self.type_id = type_name.card_id",
    );
    expect(capture.facts.type_id_setter).toBe(
      "write_card_or_id :type_id, card_or_id",
    );
    expect(capture.facts.extract_type_id_type_arm).toBe(
      "when (type_name = args.delete :type)",
    );
    expect(capture.facts.type_id_from_cardname).toBe(
      "type_id_or_error(type_name) { type_name.card_id }",
    );
    expect(capture.facts.type_id_or_error).toBe(
      'errors.add :type, "#{val} is not a known type."',
    );
    expect(capture.facts.update_route).toBe(
      "card.new_card? ? create : handle { card.update! params[:card]&.to_unsafe_h }",
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.edit_type_views.gem).toBe("card-mod-edit-0.20.0");
    expect(capture.oracle.type_store.gem).toBe("card-1.110.0");
    expect(capture.oracle.update_route.gem).toBe("decko-0.20.0");
    expect(capture.oracle.edit_type_views.file_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port renders the board's type select the way the pinned field does", () => {
    expect(portEdit).toContain(
      '`<select name="card[type]" id="card_type"${href} class="${classBase} form-control"`',
    );
    expect(portEdit).toContain('` data-select2-id="${select2Id}">`');
    expect(portEdit).toContain("? `_live-type-field type-field`");
    expect(portEdit).toContain(
      '`<option${t === current ? ` selected="selected"` : ""} value="${t}">${t}</option>`',
    );
  });

  it("the port's board row carries the pinned type row and its edit link", () => {
    expect(portEdit).toContain(
      '` href="/${fmt.urlKey()}/board_type_formgroup" data-remote="true">${icon("edit")}</a>`;',
    );
    expect(portEdit).toContain(
      "const href = `/${ctx.fmt.urlKey()}/edit_form?assign=true&slot%5Bshow%5D%5B%5D=type_form`;",
    );
  });

  it("the port's basket carries the current type the way the pinned basket does", () => {
    expect(portEdit).toContain("const current = fmt.card.typeName ?? \"\";");
    expect(portEdit).toContain("createableSet.add(current);");
  });

  it("the port's store turns the chosen type name into the type id", () => {
    expect(typeResolution).toContain(
      "const id = await fetcher.lexicon.id(DeckoName.parse(spec.typeName as Nameish).key);",
    );
    expect(typeResolution).toContain(
      'throw new CardActionError("type-unknown", `${String(spec.typeName)} is not a known type.`);',
    );
  });

  it("the port's write route passes the request's own card[type]", () => {
    expect(writeRoutes).toContain('typeName: card["type"],');
  });
});

describe("the harness's E12 check cannot pass vacuously", () => {
  it("records under the row's exact check name", () => {
    expect(coverB).toContain(
      "E12 a card's type can be changed in the board (the card's stored type becomes Book)",
    );
  });

  it("grades the STORED type_id against the chosen type's id", () => {
    expect(coverB).toContain(
      "write !== undefined && write.status < 400 && bookId !== undefined && Number(storedTypeId) === Number(bookId),",
    );
    expect(coverB).toContain(
      'const storedTypeId = ctx.database().prepare("SELECT type_id FROM cards WHERE name = ? AND trash = 0").get(name)?.type_id;',
    );
    expect(coverB).toContain(
      'const bookId = ctx.database().prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(bookType)?.id;',
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("stored type becomes");
    expect(
      readFileSync(repoRoot + "fixtures/captured/edit-type-in-board.json", "utf8"),
    ).toContain('"type_field_select_tag"');
  });
});

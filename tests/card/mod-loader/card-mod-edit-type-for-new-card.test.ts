// The NEW-CARD TYPE SELECTOR pin (registry row cap-E13, "Edit type for a
// new card": a /new form serves a card[type] selector the user can change).
//
// ORACLE-PINNED: fixtures/captured/edit-type-for-new-card.json, captured
// from the pinned gemset (card-mod-edit-0.20.0, card-1.110.0) by
// tests/card/mod-loader/oracle-capture-edit-type-for-new-card.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-edit-0.20.0 set/all/new.rb - the NEW half: new_view_type
//      renders the type formgroup when the prompt is on and the hidden
//      card[type_id] otherwise, new_type_prompt? is
//      `voo.visible? :new_type_formgroup do !new_type_preset? &&
//      new_type_prompt_context? && new_type_permitted? end`,
//      new_type_preset? is `params[:type] || voo.type` (the TYPED route
//      presets the type, so a typed /new/:type carries no selector),
//      new_type_prompt_context? is `main? || card.simple? ||
//      card.is_template?`, new_type_permitted? is `Card.new(type_id:
//      card.type_id).ok? :create`, and the :new_type_formgroup view is
//      `wrap_type_formgroup do type_field class: "type-field
//      _live-type-field slotter", href: path(view: :new_fields),
//      "data-remote" => true end`.
//   2. card-mod-edit-0.20.0 set/all/edit_type.rb - the SHARED FIELD:
//      type_field is `action_view.select_tag "card[type]",
//      type_field_options, args.merge("data-select2-id": ...)`,
//      type_field_options picks the simple or the grouped arm, and
//      current_type_value is the card's own type_name_or_default.
//   3. card-1.110.0 lib/card/fetch/card_class.rb - the FETCH: uri_fetch_opts
//      is `opts[:type] ||= params[:type] if params[:type]` (the /new/:type
//      shortcut).
//   4. card-1.110.0 mod/core/set/all/type.rb - the STORE: `type=` turns the
//      chosen NAME into the type id, `type_id=` writes it, and
//      extract_type_id! reads the request's own `:type` arg.
//
// The port side is the edit mod
// (src/card/mod-loader/mods/card-mod-edit.ts) for the new-card type
// formgroup, the write route (src/server/write-routes.ts) for the typed
// shortcut and the request's own card[type], and the action engine's type
// resolution (src/card/actions/type-resolution.ts) for the name-to-id store.
//
// The third leg is the harness's own E13 check, which must grade the STORED
// type_id of the new card against the chosen type's id AND the typed
// route's own preset, so it cannot pass on a form that merely renders a
// select.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/edit-type-for-new-card.json", import.meta.url),
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
const catalogChecks = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/checks-catalog-edit-create.mjs",
    import.meta.url,
  ),
  "utf8",
);

describe("the pinned Ruby's own bytes for the new-card type selector", () => {
  it("the new form owns the type prompt and the preset arm", () => {
    expect(capture.facts.new_view_type).toBe(
      'def new_view_type\n    if new_type_prompt?\n      _render_new_type_formgroup\n    else\n      hidden_field_tag "card[type_id]", card.type_id',
    );
    expect(capture.facts.new_type_prompt).toBe(
      "voo.visible? :new_type_formgroup do\n      !new_type_preset? && new_type_prompt_context? && new_type_permitted?",
    );
    expect(capture.facts.new_type_preset).toBe(
      "def new_type_preset?\n    params[:type] || voo.type",
    );
    expect(capture.facts.new_type_prompt_context).toBe(
      "def new_type_prompt_context?\n    main? || card.simple? || card.is_template?",
    );
    expect(capture.facts.new_type_permitted).toBe(
      "def new_type_permitted?\n    Card.new(type_id: card.type_id).ok? :create",
    );
  });

  it("the new formgroup owns the card[type] select", () => {
    expect(capture.facts.new_type_formgroup_view).toBe(
      "view :new_type_formgroup do",
    );
    expect(capture.facts.new_type_formgroup_field).toBe(
      'type_field class: "type-field _live-type-field slotter",',
    );
    expect(capture.facts.new_type_formgroup_href).toBe(
      "href: path(view: :new_fields),",
    );
    expect(capture.facts.new_type_formgroup_data_remote).toBe(
      '"data-remote" => true',
    );
    expect(capture.facts.type_field_select_tag).toBe(
      'action_view.select_tag "card[type]", type_field_options,',
    );
    expect(capture.facts.type_field_args_merge).toBe(
      'args.merge("data-select2-id": "#{unique_id}-#{Time.now.to_i}")',
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

  it("the fetch owns the typed shortcut and the store owns the type write", () => {
    expect(capture.facts.uri_fetch_type_shortcut).toBe(
      "opts[:type] ||= params[:type] if params[:type] # for /new/:type shortcut.",
    );
    expect(capture.facts.uri_fetch_name).toBe(
      'opts[:name] ||= Name[params[:mark]]&.tr "_", " "',
    );
    expect(capture.facts.type_setter).toBe(
      "self.type_id = type_name.card_id",
    );
    expect(capture.facts.type_id_setter).toBe(
      "write_card_or_id :type_id, card_or_id",
    );
    expect(capture.facts.type_name_or_default).toBe(
      "type_card.try(:name) || Card.default_type_id.cardname",
    );
    expect(capture.facts.extract_type_id_type_arm).toBe(
      "when (type_name = args.delete :type)",
    );
    expect(capture.facts.type_id_from_cardname).toBe(
      "type_id_or_error(type_name) { type_name.card_id }",
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.new_type_handling.gem).toBe("card-mod-edit-0.20.0");
    expect(capture.oracle.uri_fetch_opts.gem).toBe("card-1.110.0");
    expect(capture.oracle.type_store.gem).toBe("card-1.110.0");
    expect(capture.oracle.new_type_handling.file_sha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port's new form answers the type prompt the way the pinned one does", () => {
    expect(portEdit).toContain(
      'const preset = voo.opts["type"] !== undefined || (request?.typePreset ?? (request?.typeId !== undefined));',
    );
    expect(portEdit).toContain(
      "const context = fmt.isMain || isSimpleCard(fmt) || isTemplateCard(fmt);",
    );
    expect(portEdit).toContain(
      'return visibleWrite(voo, "new_type_formgroup", !preset && context && permitted);',
    );
    expect(portEdit).toContain(
      'if (newTypePrompt(ctx)) return str(ctx.fmt.renderView("new_type_formgroup", { skip_perms: true }));',
    );
  });

  it("the port's new-card formgroup renders the pinned select", () => {
    expect(portEdit).toContain(
      'href: `/${ctx.fmt.urlKey()}/new_fields`,',
    );
    expect(portEdit).toContain('cls: "type-field _live-type-field slotter",');
    expect(portEdit).toContain(
      '`<select name="card[type]" id="card_type" class="${classBase} form-control"${href}`',
    );
  });

  it("the port's write route carries the typed shortcut and the request's card[type]", () => {
    expect(writeRoutes).toContain(
      'if (typed !== null) return { verb: "create", typeShortcut: markToName(typed[1]), json: false };',
    );
    expect(writeRoutes).toContain(
      'const typeName = card["type"] ?? route.typeShortcut;',
    );
  });

  it("the port's store turns the chosen type name into the type id", () => {
    expect(typeResolution).toContain(
      "const id = await fetcher.lexicon.id(DeckoName.parse(spec.typeName as Nameish).key);",
    );
  });
});

describe("the harness's E13 check cannot pass vacuously", () => {
  it("records under the row's exact check name", () => {
    expect(catalogChecks).toContain(
      'name: "E13 a /new form serves a card[type] selector the user can change",',
    );
    expect(catalogChecks).toContain(
      'record("E13 a /new form serves a card[type] selector the user can change",',
    );
  });

  it("grades the STORED type_id of the new card and the typed route's preset", () => {
    expect(catalogChecks).toContain(
      "!typedHasChooser&&typedTypeId===startType.id&&seen.response.status()<400&&stored?.type_id===chosenType.id&&stored.db_content===marker",
    );
    expect(catalogChecks).toContain(
      "const typedHasChooser=await typed.locator('select[name=\"card[type]\"],select[name=\"card[type_id]\"]').count()>0;",
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("card[type] selector");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/edit-type-for-new-card.json",
        "utf8",
      ),
    ).toContain('"new_type_formgroup_field"');
  });
});

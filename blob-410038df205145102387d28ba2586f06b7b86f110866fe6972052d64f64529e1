// The RULES TAB pin (registry row cap-E22, "Edit board: rules tab (no set
// selected; warns when set 'all' selected)").
//
// ORACLE-PINNED: fixtures/captured/rules-tab.json, captured from the pinned
// gemset (card-mod-edit-0.20.0, card-mod-rules-0.20.0) by
// tests/card/mod-loader/oracle-capture-rules-tab.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-edit-0.20.0 set/all/board/tab_views.rb - the TAB VIEW: view
//      :rules_tab, unknown: true is `set_list_type = :related`,
//      `class_up "card-slot", "flex-column"` and
//      `wrap do [ set_select(set_list_type) # set_alert(set_list_type) ] end`.
//      The ALERT IS COMMENTED OUT in the pinned view, so the pinned Ruby does
//      NOT warn in this tab.
//   2. card-mod-edit-0.20.0 set/all/board.rb - the TAB NAME: BOARD_TABS is
//      the frozen map whose "Rules" arm is :rules_tab.
//   3. card-mod-rules-0.20.0 set/all/set_select.rb - the SET SELECTOR:
//      set_select is `card_select card.set_list(set_list_type),
//      setting_list_view, path_opts, "Select set"` with
//      setting_list_view=:filtered_accordion_rule_list; card_select is the
//      form_tag with remote: true, method: "get", role: "filter", the
//      "data-slot-selector" and the "nodblclick slotter" class, over
//      set_select_tag and the `card-slot _fixed-slot` div; set_select_tag is
//      `options = cards.map(&:label_and_url_key)`, `options.unshift("") if
//      placeholder` (the BLANK first option: no set selected) and the
//      select_tag(:mark, ...) with the "Select set" placeholder.
//
// The port side is the edit mod (src/card/mod-loader/mods/card-mod-edit.ts)
// for the board's tab map and the rules_tab view, and the rules mod
// (src/card/mod-loader/mods/card-mod-rules.ts) for the mod-level twin of the
// set selector.
//
// The third leg is the harness's own E22 check, whose grade cannot pass on a
// tab that merely renders: the Rules pane must carry the set selector
// controls and the "Select set" placeholder text.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/rules-tab.json", import.meta.url),
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
const portRules = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-rules.ts",
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
const capabilities = JSON.parse(
  readFileSync(
    new URL(
      "./../../../tools/edge-signed-in-exercise/capabilities.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("the pinned Ruby's own bytes for the rules tab", () => {
  it("the tab view owns the related set list and the commented-out alert", () => {
    expect(capture.facts.rules_tab_view).toBe(
      "view :rules_tab, unknown: true do",
    );
    expect(capture.facts.rules_tab_list_type).toBe(
      "set_list_type = :related",
    );
    expect(capture.facts.rules_tab_class_up).toBe(
      'class_up "card-slot", "flex-column"',
    );
    expect(capture.facts.rules_tab_set_select_call).toBe(
      "set_select(set_list_type)",
    );
    expect(capture.facts.rules_tab_alert_is_commented_out).toBe(
      "# set_alert(set_list_type)",
    );
  });

  it("the board's own tab map names the Rules tab", () => {
    expect(capture.facts.board_tabs_rules).toBe('"Rules" => :rules_tab');
    expect(capture.facts.board_tabs_frozen).toBe(
      'BOARD_TABS = { "Account" => :account_tab,',
    );
  });

  it("the set selector owns the filter form and the blank first option", () => {
    expect(capture.facts.set_select_view).toBe(
      "setting_list_view=:filtered_accordion_rule_list",
    );
    expect(capture.facts.set_select_call).toBe(
      'card_select card.set_list(set_list_type), setting_list_view, path_opts, "Select set"',
    );
    expect(capture.facts.card_select_form).toBe(
      'form_tag path(path_opts.merge(view: view, mark: "")),',
    );
    expect(capture.facts.card_select_remote).toBe(
      'remote: true, method: "get", role: "filter",',
    );
    expect(capture.facts.card_select_slot_selector).toBe(
      '"data-slot-selector": ".card-slot._fixed-slot",',
    );
    expect(capture.facts.card_select_class).toBe(
      'class: "nodblclick slotter" do',
    );
    expect(capture.facts.card_select_fixed_slot).toBe(
      'content_tag(:div, "", class: "card-slot _fixed-slot")',
    );
    expect(capture.facts.set_select_tag_options).toBe(
      "options = cards.map(&:label_and_url_key)",
    );
    expect(capture.facts.set_select_tag_blank_first_option).toBe(
      'options.unshift("") if placeholder',
    );
    expect(capture.facts.set_select_tag_select).toBe(
      "select_tag(:mark, options_for_select(options),",
    );
    expect(capture.facts.set_select_tag_class).toBe(
      'class: "_submit-on-select form-control _close-rule-overlay-on-select",',
    );
    expect(capture.facts.set_select_tag_search).toBe(
      '"data-minimum-results-for-search": "Infinity",',
    );
    expect(capture.facts.set_select_tag_placeholder).toBe(
      '"data-placeholder": "Select set",',
    );
  });

  it("the set alert exists in the gem and the tab does not call it", () => {
    expect(capture.facts.set_alert_wrap).toBe(
      'wrap_with :div, class: "alert alert-info" do',
    );
    expect(capture.facts.set_alert_text).toBe('"Rules apply to:",');
    expect(capture.facts.set_alert_more_sets).toBe(
      'link_to_card(card, "More sets and settings",',
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.rules_tab_view.gem).toBe("card-mod-edit-0.20.0");
    expect(capture.oracle.board_tabs.gem).toBe("card-mod-edit-0.20.0");
    expect(capture.oracle.set_select.gem).toBe("card-mod-rules-0.20.0");
    expect(capture.oracle.card_select.gem).toBe("card-mod-rules-0.20.0");
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port's board map names the Rules tab", () => {
    expect(portEdit).toContain('["Rules", "rules_tab"],');
  });

  it("the port's rules tab renders the pinned set selector", () => {
    expect(portEdit).toContain(
      "export const rulesTabView: ViewFn = ({ fmt, voo }) => {",
    );
    expect(portEdit).toContain(
      'voo.classUp("card-slot", "flex-column");',
    );
    expect(portEdit).toContain(
      '`<form role="filter" data-slot-selector=".card-slot._fixed-slot"` +',
    );
    expect(portEdit).toContain(
      '` class="nodblclick slotter" action="/?view=filtered_accordion_rule_list"` +',
    );
    expect(portEdit).toContain(
      '` accept-charset="UTF-8" data-remote="true" method="get">` +',
    );
    expect(portEdit).toContain(
      '`<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +',
    );
    expect(portEdit).toContain('`<select name="mark" id="mark"` +');
    expect(portEdit).toContain(
      '` class="_submit-on-select form-control _close-rule-overlay-on-select"` +',
    );
    expect(portEdit).toContain(
      '` data-minimum-results-for-search="Infinity" data-placeholder="Select set"` +',
    );
    expect(portEdit).toContain(
      '`<div class="card-slot _fixed-slot"></div></form>`;',
    );
  });

  it("the port's selector opens with the blank option, so no set is selected", () => {
    expect(portEdit).toContain(
      "const options = [`<option value=\"\"></option>`]",
    );
    expect(portRules).toContain(
      "const options = [`<option value=\"\"></option>`, ...setOptions].join(\"\\n\");",
    );
  });

  it("the port does not render the alert the pinned tab comments out", () => {
    // The pinned Ruby carries the set_alert helper but the :rules_tab view
    // calls it commented out, so the pinned tab renders no alert. The port
    // must match: the alert's own text appears nowhere in the port's bytes.
    expect(portEdit).not.toContain("Rules apply to:");
    expect(portRules).not.toContain("Rules apply to:");
    expect(portEdit).not.toContain("More sets and settings");
    expect(portRules).not.toContain("More sets and settings");
  });
});

describe("the harness's E22 check cannot pass vacuously", () => {
  it("the row declares exactly the instrument's check name", () => {
    const row = capabilities.capabilities.find(
      (c: { id: string }) => c.id === "E22",
    );
    expect(row).toBeDefined();
    expect(row.checks).toEqual([
      "E22 Edit board: rules tab (no set selected; warns when set 'all' selected)",
    ]);
    expect(coverB).toContain(
      'await attempt("E22 Edit board: rules tab (no set selected; warns when set \'all\' selected)", async () => {',
    );
  });

  it("the grade needs the controls and the placeholder text", () => {
    expect(coverB).toContain(
      "tab.selects > 0 && tab.mentionsSelect, { tab, raw: ctx.captureEvidence(await page.content(), { check: \"e22-rules-tab\", name: \"Home\" }) });",
    );
    expect(coverB).toContain(
      'const pane = document.querySelector("#tab-home-8-rule, .board .tab-pane.active, .board [id*=\'rule\']");',
    );
  });

  it("the check reads the set selector the port renders", () => {
    expect(coverB).toContain(
      'await page.locator(".board .nav-link", { hasText: "Rules" }).first().click().catch(() => undefined);',
    );
    expect(coverB).toContain(
      'tag: el.tagName.toLowerCase(),',
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("no set selected");
    expect(
      readFileSync(repoRoot + "fixtures/captured/rules-tab.json", "utf8"),
    ).toContain('"rules_tab_view"');
  });
});

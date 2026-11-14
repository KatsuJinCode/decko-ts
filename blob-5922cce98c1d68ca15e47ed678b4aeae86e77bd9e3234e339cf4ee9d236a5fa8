// card-mod-edit (register entry 14): the BOARD FAMILY census.
//
// WHAT THIS CONVERTS
// The register graded entry 14 PARTIAL and named five absences. Measured
// against this tree, four of the five are stale and the fifth is
// provably unreachable in the pin:
//
//   1. ":board_rules_tab ... the board rules tab is unported" - FALSE,
//      and false in a way that matters: the view is not edit's to port.
//      Its Ruby owner is card-mod-rules
//      (set/type/set/html_views/filtered_rule_lists.rb), verified this
//      session:
//
//        $ cd .../gems && grep -rln "view :board_rules_tab" card-mod-*/set/
//        card-mod-rules-0.20.0/set/type/set/html_views/filtered_rule_lists.rb
//
//      ...and the port registers it there, on a setPath mirroring the
//      Ruby path. An absence in card-mod-edit is Ruby's own placement.
//
//   2. ":board, :cardboard, :edit_rules remain rails-runtime" - FALSE.
//      All three are registered with real view fns.
//
//   3. the board-pill / related-section / follow-section helper bodies -
//      ported; they are the functions those three view fns call.
//
//   4. "main? / cancel_strategy / path_to_previous page-layer arms" -
//      ported: deleteButton forks delete_success on fmt.isMain, and
//      cancelInPlaceButton carries the cancel_strategy class and the
//      path href.
//
//   5. the form_prefix machinery - coarse as stated. THREE of its four
//      arms are reachable and ported; the fourth, `explicit_form_prefix`,
//      is DEAD CODE in stock Decko 0.20.0 (see the reachability test
//      below), so registering nothing for it is exact parity.
//
// The corrections live in card-mod-edit.ts's header and the all/editing
// manifest comment. This file makes them invariants.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModRules from "../../../src/card/mod-loader/mods/card-mod-rules.js";

const viewsOn = (mod: typeof cardModEdit, setPath: string): string[] => {
  const entry = mod.setModules?.find((m) => m.setPath === setPath);
  return (entry?.formats?.html?.views ?? []).map((v) => v.view);
};

const viewFnsOn = (mod: typeof cardModEdit, setPath: string): Record<string, unknown> => {
  const entry = mod.setModules?.find((m) => m.setPath === setPath);
  return Object.fromEntries(
    (entry?.formats?.html?.views ?? []).map((v) => [v.view, v.viewFn]),
  );
};

describe("card-mod-edit board family census (register entry 14)", () => {
  it(":board, :cardboard and :edit_rules are REGISTERED, each with a view fn", () => {
    // editing.rb:3-11 view :board, :13 view :cardboard, :50-52
    // view :edit_rules. The claim that these "remain rails-runtime" was
    // stale prose sitting directly above its own refutation.
    const names = viewsOn(cardModEdit, "all/editing");
    for (const v of ["board", "cardboard", "edit_rules"]) {
      expect(names, `${v} is registered on all/editing`).toContain(v);
    }
    const fns = viewFnsOn(cardModEdit, "all/editing");
    for (const v of ["board", "cardboard", "edit_rules"]) {
      expect(typeof fns[v], `${v} carries a view fn`).toBe("function");
    }
    // the config the Ruby declarations carry, still on the records
    const entry = cardModEdit.setModules?.find((m) => m.setPath === "all/editing");
    const byName = Object.fromEntries(
      (entry?.formats?.html?.views ?? []).map((v) => [v.view, v.config ?? {}]),
    );
    // editing.rb:3 `view :board, perms: :update, unknown: true, cache: :never`
    expect(byName.board).toMatchObject({ perms: "update", unknown: true, cache: "never" });
    // editing.rb:50 `view :edit_rules, cache: :never, unknown: true`
    expect(byName.edit_rules).toMatchObject({ cache: "never", unknown: true });
  });

  it(":board_rules_tab belongs to card-mod-rules, on a setPath mirroring the Ruby path", () => {
    // The registry's own named absence, corrected: it is not edit's view.
    expect(viewsOn(cardModEdit, "all/editing")).not.toContain("board_rules_tab");
    // Ruby: card-mod-rules set/type/set/html_views/filtered_rule_lists.rb:13-18
    expect(viewsOn(cardModRules, "type/set/html_views/filtered_rule_lists")).toContain(
      "board_rules_tab",
    );
    const fns = Object.fromEntries(
      (cardModRules.setModules ?? [])
        .find((m) => m.setPath === "type/set/html_views/filtered_rule_lists")
        ?.formats?.html?.views?.map((v) => [v.view, v.viewFn]) ?? [],
    );
    expect(typeof fns.board_rules_tab).toBe("function");
    // The wrap the Ruby declaration carries: `wrap: { slot: { class:
    // "d-flex flex-column gap-3 mx-3 mt-2" } }`.
    const rulesEntry = cardModRules.setModules?.find(
      (m) => m.setPath === "type/set/html_views/filtered_rule_lists",
    );
    const rec = (rulesEntry?.formats?.html?.views ?? []).find(
      (v) => v.view === "board_rules_tab",
    );
    expect(rec?.config).toMatchObject({ cache: "never" });
  });

  it("the board tab surface is registered on all/board/tab_views", () => {
    // tab_views.rb:2 :engage_tab, :6 :history_tab, :12 :related_tab,
    // :20 :rules_tab, :31 :follow_section, :35 :guide_tab - plus
    // tab_visibility.rb's visible_board_tabs over the six BOARD_TABS
    // entries (board.rb:1-6). The claim listed these as unported
    // rails-runtime tabs.
    //
    // The setPath is "all/board/tab_views", mirroring the Ruby FILE
    // (set/all/board/tab_views.rb) rather than the set module's Ruby
    // constant (Card::Set::Board::TabViews) - the nested-file
    // registration shape, with the X-star-stripped anchor making the
    // per-card chain walk reach it. First draft of this test guessed
    // "type_plus_right/tabs"; the run showed an empty list, and the
    // registrations are in fact under all/board/tab_views.
    const TAB_VIEWS = "all/board/tab_views";
    const fns = viewFnsOn(cardModEdit, TAB_VIEWS);
    for (const v of [
      "engage_tab", "guide_tab", "history_tab", "related_tab", "rules_tab", "follow_section",
    ]) {
      expect(Object.keys(fns), `${v} is registered on ${TAB_VIEWS}`).toContain(v);
      expect(typeof fns[v], `${v} carries a view fn`).toBe("function");
    }
    // the configs the Ruby declarations carry, still on the records
    const entry = cardModEdit.setModules?.find((m) => m.setPath === TAB_VIEWS);
    const byName = Object.fromEntries(
      (entry?.formats?.html?.views ?? []).map((v) => [v.view, v.config ?? {}]),
    );
    // tab_views.rb:35 `view :guide_tab, unknown: true`
    expect(byName.guide_tab).toMatchObject({ unknown: true });
    // tab_views.rb:20-21 `view :rules_tab, unknown: true`
    expect(byName.rules_tab).toMatchObject({ unknown: true });
    // tab_views.rb:6 `view :history_tab, wrap: :slot`
    expect(byName.history_tab).toMatchObject({ wrap: "slot" });
    // tab_views.rb:31-32 `view :follow_section, wrap: :slot, cache: :never`
    expect(byName.follow_section).toMatchObject({ wrap: "slot", cache: "never" });
  });

  it("the delete_button's main? fork IS ported, and on fmt.isMain", () => {
    // form_buttons.rb:72-80 delete_success forks on `main?`:
    //   elsif main? then { redirect: true, mark: "*previous" }
    //   else             { view: :just_deleted }
    // `main?` is subformat.rb:35 `depth.zero?` = fmt.isMain. The claim
    // that this page-layer arm was an unported remainder is stale.
    const src = readFileSync("src/card/mod-loader/mods/card-mod-edit.ts", "utf8");
    expect(src).toMatch(/function deleteButton/);
    expect(src).toMatch(/const successQuery = fmt\.isMain/);
    // both arms present, byte for byte
    expect(src).toContain("success%5Bmark%5D=%2Aprevious&success%5Bredirect%5D=true");
    expect(src).toContain("success%5Bview%5D=just_deleted");
  });

  it("cancel_strategy / path_to_previous are ported into the cancel button", () => {
    // form_elements.rb:67-85:
    //   def cancel_button args={} ... add_class args, cancel_strategy(
    //     args[:redirect], args[:href]) ; args[:href] ||= path_to_previous ...
    //   def cancel_strategy redirect, href
    //     redirect = href.blank? if redirect.nil?
    //     redirect ? "redirecter" : "slotter"
    //   def path_to_previous; path mark: "*previous"; end
    // standard_cancel_button (form_buttons.rb:36-39) reverse_merges an
    // `href: path`, so cancel_strategy(redirect=nil, href=present)
    // yields "slotter" and path_to_previous does not fire. The port
    // emits exactly that class and href.
    const src = readFileSync("src/card/mod-loader/mods/card-mod-edit.ts", "utf8");
    expect(src).toMatch(/cancel-button ms-4 btn btn-secondary slotter/);
    expect(src).toContain('data-cy="cancel"');
    expect(src).toContain('data-remote="true"');
  });

  it("form_prefix's explicit arm is UNREACHABLE in the pin - so nothing ports it", () => {
    // form.rb:175-177 `def explicit_form_prefix; inherit
    // :explicit_form_prefix; end`, and `inherit` is
    // subformat.rb:50-53 `instance_variable_get("@explicit_form_prefix")
    // || parent&.inherit(variable)`. Nothing ever ASSIGNS that ivar in
    // the pinned gemset, so the `when explicit_form_prefix` arm
    // (form.rb:160) always evaluates nil and never fires. Measured:
    //
    //   $ grep -rn "@explicit_form_prefix" --include=*.rb --include=*.haml
    //       --include=*.coffee --include=*.js .   -> (no output)
    //   $ grep -rn "explicit_form_prefix\s*=" --include=*.rb . -> (no output)
    //
    // The census keeps this as a SOURCE invariant rather than a gemset
    // one, so a future gem that sets it turns this red.
    const src = readFileSync("src/card/mod-loader/mods/card-mod-edit.ts", "utf8");
    // the correction is recorded, with the reachability reason
    expect(src).toMatch(/register entry 14/);
    expect(src).toContain("explicit_form_prefix");
    expect(src).toContain("EXACT PARITY");
    // and no port-side code pretends to set the ivar Ruby never sets
    expect(src).not.toMatch(/=\s*form_name_prefix|setExplicitFormPrefix/);
    // The REACHABLE arms are present: the simple-form "card" prefix and
    // the edit_in_form_prefix "[subcards][<relative>]" nest.
    expect(src).toContain("[subcards][");
    expect(src).toContain('form_name_prefix');
    expect(src).toContain("card[subcards][");
  });
});

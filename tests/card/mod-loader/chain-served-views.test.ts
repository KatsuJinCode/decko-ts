// Views the edge serves through the mod deck's chain: where the chain's
// registrations and the base table had drifted, they now share the same
// bodies, and views that were absent from the chain are registered on
// their Ruby sets.

import { describe, expect, it } from "vitest";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { modBarRightSections } from "../../../src/card/mod-loader/mods/core-admin-runtime.js";
import { flatViewDefinedFor } from "../../../src/card/render/views.js";
import type { ViewContext } from "../../../src/card/render/format.js";

const loader = defaultDeckLoader();
const head = (keys: string, view: string) => loader.viewChain(keys, view)[0];

describe("chain registrations the edge serves", () => {
  it("a Mod card's bar_right lists the oracle-pinned sections", () => {
    const entry = head("ALL TYPE-mod SELF-mod_style", "bar_right");
    expect(entry?.setModule).toBe("Type::Mod");
    for (const codename of ["mod_style", "mod_list", "mod_api_key", "mod_format"]) {
      const ctx = { fmt: { card: { record: { codename } } } } as unknown as ViewContext;
      expect(entry!.viewFn(ctx)).toBe(modBarRightSections(codename.replace(/^mod_/, "")));
    }
  });

  it("the +*account token views exist only on Right::Account", () => {
    for (const view of ["verify_url", "reset_password_url", "verify_days", "reset_password_days"]) {
      expect(head("ALL ALL_PLUS TYPE-rich_text RIGHT-Xaccount SELF-jane-Xaccount", view)?.setModule).toBe("Right::Account::Views");
      expect(head("ALL TYPE-rich_text SELF-pancake", view)).toBeUndefined();
      expect(flatViewDefinedFor(view, "ALL ALL_PLUS TYPE-rich_text RIGHT-Xaccount SELF-jane-Xaccount")).toBe(true);
      expect(flatViewDefinedFor(view, "ALL TYPE-rich_text SELF-pancake")).toBe(false);
    }
  });

  it(":one_line_content resolves to Ruby's modules for Set, Setting and Toggle cards", () => {
    expect(head("ALL TYPE-set SELF-x", "one_line_content")?.setModule).toBe("Type::Set::HtmlViews");
    expect(head("ALL TYPE-setting SELF-x", "one_line_content")?.setModule).toBe("Type::Setting");
    // toggle.rb overrides the one_line_content METHOD only.
    expect(head("ALL TYPE-toggle SELF-x", "one_line_content")?.setModule).toBe("All::Html::Views");
    const ctx = { fmt: { card: { typeCode: "set", name: { s: "x" } } } } as unknown as ViewContext;
    expect(head("ALL TYPE-set SELF-x", "one_line_content")!.viewFn(ctx)).toBe("");
  });

});

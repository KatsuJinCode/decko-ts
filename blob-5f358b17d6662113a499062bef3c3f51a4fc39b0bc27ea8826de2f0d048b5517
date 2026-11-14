// :my_card (set/self/account_links.rb:56-58) and
// :edit_inline (set/right/enabled_roles.rb:26-43) — the last two
// unregistered layout views — are REGISTERED, and their bytes compose from
// the same byte-backed builder the signed-in navbar renders.
//
// Byte provenance: the account_dropdown arm and the :edit_inline
// pointer-checkbox-list wrapper compose the SAME btn-group the signed-in
// navbar renders. The ROLES interior (can_disable_roles?'s
// interactive_roles_dropdown arm and the account_dropdown_role_items
// checkboxes) is the named remainder on the views — the port's page
// session carries no roles runtime, and no pinned page exercises it.
//
// Render-level dispatch of the Self-set views rides the codename-key
// chain-walk divergence (known-divergences-from-ruby.md; the inverted
// test lives in card-mod-layout.test.ts), so these tests
// pin the REGISTRATIONS and the COMPOSER bytes directly.

import { describe, expect, it } from "vitest";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModLayout from "../../../src/card/mod-loader/mods/card-mod-layout.js";
import {
  myCardDropdownInnerHtml,
  signedInAccountLinksInnerHtml,
} from "../../../src/card/render/navbar-views.js";

describe(":my_card and :edit_inline are registered layout views", () => {
  it("self/account_links registers my_card; right/enabled_roles registers edit_inline", () => {
    const loader = new ModLoader([{ manifest: cardModLayout }]);
    loader.resolveOrder({ gemMods: ["layout"] });
    const paths = (cardModLayout.setModules ?? []).map((m) => m.setPath);
    expect(paths).toContain("self/account_links");
    expect(paths).toContain("right/enabled_roles");
    const accountLinks = cardModLayout.setModules?.find(
      (m) => m.setPath === "self/account_links",
    );
    const myCard = accountLinks?.formats?.html?.views?.find((v) => v.view === "my_card");
    expect(myCard, "the :my_card registration").toBeDefined();
    expect(myCard?.config).toMatchObject({ cache: "never", denial: "blank" });
    const enabledRoles = cardModLayout.setModules?.find(
      (m) => m.setPath === "right/enabled_roles",
    );
    const editInline = enabledRoles?.formats?.html?.views?.find(
      (v) => v.view === "edit_inline",
    );
    expect(editInline, "the :edit_inline registration").toBeDefined();
    expect(editInline?.config).toMatchObject({ cache: "never", unknown: true });
  });

  it("the composer loads into the registry without error", () => {
    const loader = new ModLoader([{ manifest: cardModLayout }]);
    loader.resolveOrder({ gemMods: ["layout"] });
    loader.load();
    const registered = loader
      .eventRegistry()
      .all()
      .map((e) => e.event);
    expect(Array.isArray(registered)).toBe(true);
  });
});

describe("the account_dropdown composer bytes (the views' shared builder)", () => {
  const KNOWN = { actor: true, accountSettings: true, signin: true };

  it("myCardDropdownInnerHtml is the raw btn-group (no navbar <li>)", () => {
    const dropdown = myCardDropdownInnerHtml("Decko Bot", KNOWN, []);
    expect(dropdown.startsWith('<div class="btn-group">')).toBe(true);
    expect(dropdown.endsWith("</ul></div>")).toBe(true);
    expect(dropdown).toContain(
      '<a id="my-card-link" class="nav-link my-card known-card" href="/Decko_Bot">Decko Bot</a>',
    );
    expect(dropdown).toContain(
      '<li><a class="dropdown-item known-card" href="/Decko_Bot+*account_settings">Account</a></li>',
    );
    expect(dropdown).toContain(
      '<li><a class="dropdown-item known-card" href="/delete/*signin">Sign out</a></li>',
    );
    // the roles block is absent for the no-roles session (the remainder)
    expect(dropdown).not.toContain("Roles");
  });

  it("signedInAccountLinksInnerHtml wraps the SAME dropdown in the navbar <li>", () => {
    const inner = signedInAccountLinksInnerHtml("Decko Bot", KNOWN);
    const dropdown = myCardDropdownInnerHtml("Decko Bot", KNOWN, []);
    // the li-wrapped my-card block is exactly <li class="nav-item"> + dropdown + </li>
    expect(inner).toContain(`<li class="nav-item">${dropdown}</li>`);
    // and the refactor changed nothing about the golden bytes
    expect(inner).toBe(
      `<li class="nav-item">${dropdown}</li>\n` +
        `<li class="nav-item"><a class="nav-link signout-link known-card" href="/delete/*signin">Sign out</a></li>`,
    );
  });

  it("the wanted-card arms render wanted classes (the unseeded-deck arm)", () => {
    const dropdown = myCardDropdownInnerHtml(
      "Joe User",
      { actor: true, accountSettings: false, signin: false },
      [],
    );
    expect(dropdown).toContain('class="nav-link my-card known-card"');
    expect(dropdown).toContain('class="dropdown-item wanted-card" href="/Joe_User+*account_settings"');
    expect(dropdown).toContain('class="dropdown-item wanted-card" href="/delete/*signin"');
  });
});

// The ACCOUNT SETTINGS PAGE pin (registry row cap-A1, "Open the account
// settings page").
//
// ORACLE-PINNED: fixtures/captured/account-settings-page.json, captured
// from the pinned gemset (card-mod-account-0.20.0) by
// tests/card/mod-loader/oracle-capture-account-settings-page.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-account-0.20.0 set/abstract/account_holder.rb - the ACCOUNT
//      TAB AND ITS SETTINGS SECTION: default_board_tab is `card.
//      current_account? ? :account_tab : super` and view :account_tab is
//      `board_pill_sections "Account" do [["Settings",
//      account_details_items], ["Content", account_content_items]] end` -
//      the two sections the tab's pills live in; account_details_items opens
//      with the ["Email and Password", :account, ...] pill, the SETTINGS ROW
//      the person clicks; account_content_items carries the ["Created",
//      :created], ["Edited", :edited] rows.
//   2. card-mod-account-0.20.0 set/right/account/views.rb - the LABELLED
//      FIELD NESTS: view :core is `[account_field_nest(:email, "email"),
//      account_field_nest(:password, "password")]` and account_field_nest is
//      `field_nest field, title: title, view: :labeled` - the LABELED view
//      that renders the field's own content.
//   3. card-mod-account-0.20.0 set/right/email.rb - the ADDRESS AS TEXT: the
//      email right is `assign_type :phrase`, which is why the labeled row
//      carries the address as text rather than as a link.
//   4. card-mod-account-0.20.0 set/right/account.rb - THE OWNER'S READ
//      PERMISSION: ok_to_read? is `own_account? || super`, and
//      set/abstract/account_field.rb owns own_account? as `account_card&.
//      own_account?` - the account holder reads their own address.
//
// The port side is the account mod
// (src/card/mod-loader/mods/card-mod-account.ts) for the Account tab, the
// two sections and the two labeled field nests, and the read-override chain
// (src/card/permissions/read-override.ts) for the owner's own-address read.
//
// The third leg is the harness's own account instrument: its three legs must
// all pass for both actors - the board must carry an Account tab, the tab
// must expose the email and password fields, and the settings page must
// SHOW the signed-in account's own email address.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/account-settings-page.json", import.meta.url),
    "utf8",
  ),
);
const portAccount = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-account.ts",
    import.meta.url,
  ),
  "utf8",
);
const portReadOverride = readFileSync(
  new URL(
    "./../../../src/card/permissions/read-override.ts",
    import.meta.url,
  ),
  "utf8",
);
const harness = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise.mjs",
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

describe("the pinned Ruby's own bytes for the account settings page", () => {
  it("the account holder owns the Account tab and its two sections", () => {
    expect(capture.facts.default_board_tab).toBe(
      "card.current_account? ? :account_tab : super",
    );
    expect(capture.facts.account_tab_view).toBe("view :account_tab do");
    expect(capture.facts.account_tab_board_pill_sections).toBe(
      'board_pill_sections "Account" do',
    );
    expect(capture.facts.account_tab_settings_section).toBe(
      '[["Settings", account_details_items],\n       ["Content", account_content_items]]',
    );
    expect(capture.facts.show_account_tab).toBe("card.account?");
  });

  it("the account tab's Settings section opens with the Email and Password row", () => {
    expect(capture.facts.account_details_items_method).toBe(
      "def account_details_items",
    );
    expect(capture.facts.account_details_email_and_password).toBe(
      '["Email and Password", :account,\n       { path: { slot: { hide: %i[help_link board_link] } } }]',
    );
    expect(capture.facts.account_content_items_method).toBe(
      "def account_content_items",
    );
    expect(capture.facts.account_content_created_edited).toBe(
      '[["Created", :created],\n     ["Edited", :edited]]',
    );
  });

  it("the account right owns the two labeled field nests", () => {
    expect(capture.facts.account_core_view).toBe("view :core do");
    expect(capture.facts.account_core_fields).toBe(
      '[account_field_nest(:email, "email"),\n     account_field_nest(:password, "password")]',
    );
    expect(capture.facts.account_field_nest).toBe(
      "field_nest field, title: title, view: :labeled",
    );
  });

  it("the email right is a phrase, so the labeled row carries the address as text", () => {
    expect(capture.facts.email_assign_type).toBe("assign_type :phrase");
  });

  it("the account holder reads their own address", () => {
    expect(capture.facts.account_ok_to_read).toBe("own_account? || super");
    expect(capture.facts.account_own_account).toBe("account_card&.own_account?");
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.account_tab.gem).toBe("card-mod-account-0.20.0");
    expect(capture.oracle.account_core_view.gem).toBe(
      "card-mod-account-0.20.0",
    );
    expect(capture.oracle.email_assign_type.gem).toBe(
      "card-mod-account-0.20.0",
    );
    expect(capture.oracle.account_ok_to_read.gem).toBe(
      "card-mod-account-0.20.0",
    );
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port's account tab renders the two pinned sections over the pill list", () => {
    expect(portAccount).toContain(
      "const accountTabHtml = (cardName: string, isKnown: (name: string) => boolean = () => true): string => {",
    );
    expect(portAccount).toContain(
      '`<ul class="${BOARD_PILL_UL_CLASSES}">` +',
    );
    expect(portAccount).toContain('section("Settings", settings) +');
    expect(portAccount).toContain('section("Content", content) +');
    expect(portAccount).toContain(
      '{ view: "account_tab", viewFn: accountTabView },',
    );
  });

  it("the port's Settings section opens with the Email and Password row", () => {
    expect(portAccount).toContain(
      '    "Email and Password",\n    "*account",\n    { path: { slot: { hide: ["help_link", "board_link"] } } },',
    );
    expect(portAccount).toContain('["Created", "*created"],');
    expect(portAccount).toContain('["Edited", "*edited"]');
  });

  it("the port's account core nests the email and the password with the labeled view", () => {
    expect(portAccount).toContain(
      'syntax: `${ctx.fmt.card.name.s}+*${field}|view:labeled|title:${title}`,',
    );
    expect(portAccount).toContain(
      'options: { view: "labeled", title, extra: {} },',
    );
    expect(portAccount).toContain(
      'return [fieldNest("email", "email"), fieldNest("password", "password")].join(',
    );
  });

  it("the port's read override lets the holder read their own address", () => {
    expect(portReadOverride).toContain(
      "async function ownAccountVerdict(",
    );
    expect(portReadOverride).toContain(
      "return leftCard.key === deps.viewerKey ? true : undefined;",
    );
    expect(portReadOverride).toContain(
      'account: DeckoName.parse("*account").key,',
    );
  });
});

describe("the harness's A1 legs cannot pass vacuously", () => {
  it("the row declares exactly the instrument's three check names", () => {
    const row = capabilities.capabilities.find((c: { id: string }) => c.id === "A1");
    expect(row).toBeDefined();
    expect(row.checks).toEqual([
      "the account card's board has an Account tab",
      "the Account tab exposes the account's email and password fields",
      "A1 the account settings page shows the signed-in account's email",
    ]);
    expect(row.requiredActors).toEqual(["Harness Admin", "Harness Member"]);
    for (const name of row.checks) {
      const recorded = [
        `record('${name}'`,
        `record("${name}"`,
      ].some((shape) => harness.includes(shape));
      expect(recorded, `the harness records the check "${name}"`).toBe(true);
    }
  });

  it("the instrument runs the account journey for BOTH actors", () => {
    expect(harness).toContain(
      "for (const account of [creds.admin, creds.member]) await accountSettings(account);",
    );
  });

  it("the settings leg grades the ADDRESS A PERSON READS, not an input's presence", () => {
    expect(harness).toContain(
      "const row = document.querySelector('.RIGHT-Xemail.labeled-view');",
    );
    expect(harness).toContain(
      'record("A1 the account settings page shows the signed-in account\'s email",\n        shownEmail !== null && shownEmail.includes(account.email),',
    );
  });

  it("the settings leg opens the pinned Settings row before it reads the address", () => {
    expect(harness).toContain(
      "const pill = page.locator('[data-cy=\"email_and_password-pill\"]').first();",
    );
    expect(harness).toContain(
      "await page.locator('.RIGHT-Xemail.labeled-view').first().waitFor({ state: 'visible', timeout: 60_000 });",
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("Account tab");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/account-settings-page.json",
        "utf8",
      ),
    ).toContain('"account_details_email_and_password"');
  });
});

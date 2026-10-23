// The ACCOUNT TAB AND THE EMAIL CHANGE pin (registry row cap-E19, "Edit
// board: account tab, change email").
//
// ORACLE-PINNED: fixtures/captured/account-tab-email-change.json, captured
// from the pinned gemset (card-mod-account-0.20.0) by
// tests/card/mod-loader/oracle-capture-account-tab-email-change.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-account-0.20.0 set/abstract/account_holder.rb - the ACCOUNT
//      TAB: default_board_tab is `card.current_account? ? :account_tab :
//      super` and view :account_tab is `board_pill_sections "Account" do
//      [["Settings", account_details_items], ["Content",
//      account_content_items]] end` - the two sections the tab's pills live
//      in; show_account_tab? is `card.account?`.
//   2. card-mod-account-0.20.0 set/right/account/views.rb - the EMAIL AND
//      PASSWORD FIELDS: view :core is `[account_field_nest(:email, "email"),
//      account_field_nest(:password, "password")]` and account_field_nest is
//      `field_nest field, title: title, view: :labeled` - the LABELED view
//      the person reads the address off.
//   3. card-mod-account-0.20.0 set/right/email.rb - the EMAIL WRITE: the
//      :validate_email event strips the content and applies the address
//      grammar, :validate_unique_email refuses a duplicate address, and
//      :downcase_email lowercases the address before validation. The email
//      right is `assign_type :phrase`, which is why the labeled row carries
//      the address as text.
//   4. card-mod-account-0.20.0 set/right/password.rb - the PASSWORD FIELD:
//      view :core, wrap: :em renders the raw value and the :encrypt_password
//      event stores the encrypted content.
//
// The port side is the account mod
// (src/card/mod-loader/mods/card-mod-account.ts) for the Account tab and the
// two labeled field nests, the account-field module
// (src/card/auth/account-fields.ts) for the address grammar, the strip and
// the downcase, and the action engine
// (src/card/actions/card-action-engine.ts) for the duplicate-address refusal.
//
// The third leg is the harness's own account instrument: its three legs must
// all pass for both actors - the board must carry an Account tab, the tab
// must expose the email and password fields, and the email must be changed
// so the NEW address signs in and the OLD one does not.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/account-tab-email-change.json", import.meta.url),
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
const portAccountFields = readFileSync(
  new URL("./../../../src/card/auth/account-fields.ts", import.meta.url),
  "utf8",
);
const actionEngine = readFileSync(
  new URL(
    "./../../../src/card/actions/card-action-engine.ts",
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

describe("the pinned Ruby's own bytes for the account tab and the email change", () => {
  it("the account holder owns the Account tab and its two sections", () => {
    expect(capture.facts.account_tab_view).toBe("view :account_tab do");
    expect(capture.facts.account_tab_board_pill_sections).toBe(
      'board_pill_sections "Account" do',
    );
    expect(capture.facts.account_tab_sections).toBe(
      '[["Settings", account_details_items],\n       ["Content", account_content_items]]',
    );
    expect(capture.facts.default_board_tab).toBe(
      "card.current_account? ? :account_tab : super",
    );
    expect(capture.facts.show_account_tab).toBe("card.account?");
  });

  it("the account right owns the two labeled field nests", () => {
    expect(capture.facts.account_core_view).toBe("view :core do");
    expect(capture.facts.account_core_fields).toBe(
      '[account_field_nest(:email, "email"),\n     account_field_nest(:password, "password")]',
    );
    expect(capture.facts.account_field_nest).toBe(
      "field_nest field, title: title, view: :labeled",
    );
    expect(capture.facts.email_assign_type).toBe("assign_type :phrase");
  });

  it("the email right owns the address grammar, the duplicate refusal and the downcase", () => {
    expect(capture.facts.validate_email_event).toBe(
      "event :validate_email, :validate, on: :save do",
    );
    expect(capture.facts.validate_email_strip).toBe(
      "self.content = content.strip",
    );
    expect(capture.facts.validate_email_grammar).toBe(
      "return if content.match?(/^([^@\\s]+)@((?:[-a-z0-9]+\\.)+[a-z]{2,})$/i)",
    );
    expect(capture.facts.validate_email_error).toBe(
      "errors.add :content, t(:account_error_invalid_address)",
    );
    expect(capture.facts.validate_unique_email_event).toBe(
      "event :validate_unique_email, after: :validate_email, on: :save do",
    );
    expect(capture.facts.validate_unique_email_cql).toBe(
      "cql = { right_id: EmailID, eq: content, return: :id }",
    );
    expect(capture.facts.validate_unique_email_error).toBe(
      "errors.add :content, t(:account_error_not_unique)",
    );
    expect(capture.facts.downcase_email_event).toBe(
      "event :downcase_email, :prepare_to_validate, on: :save do",
    );
    expect(capture.facts.downcase_email_body).toBe(
      "self.content = content.downcase",
    );
  });

  it("the password right owns the raw view and the encryption", () => {
    expect(capture.facts.password_core_view).toBe("view :core, wrap: :em do");
    expect(capture.facts.encrypt_password_event).toBe(
      "event :encrypt_password, :store, on: :save, changed: :content do",
    );
    expect(capture.facts.encrypt_password_body).toBe(
      "self.content = Auth.encrypt content, salt",
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.account_tab.gem).toBe("card-mod-account-0.20.0");
    expect(capture.oracle.account_core_view.gem).toBe(
      "card-mod-account-0.20.0",
    );
    expect(capture.oracle.validate_email_event.gem).toBe(
      "card-mod-account-0.20.0",
    );
    expect(capture.oracle.password_core_view.gem).toBe(
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

  it("the port's address grammar, strip and downcase are the pinned ones", () => {
    expect(portAccountFields).toContain(
      "const EMAIL_REGEX = /^([^@\\s]+)@((?:[-a-z0-9]+\\.)+[a-z]{2,})$/i;",
    );
    expect(portAccountFields).toContain(
      "export function normalizeEmail(raw: string): string {",
    );
    expect(portAccountFields).toContain("return raw.toLowerCase().trim();");
    expect(portAccountFields).toContain(
      "export function emailIsValid(email: string): boolean {",
    );
  });

  it("the port's engine refuses a duplicate address and stores the new one", () => {
    expect(actionEngine).toContain(
      "private async validatedEmailContent(raw: string, rightId: number, selfId: number | null): Promise<string> {",
    );
    expect(actionEngine).toContain('if (!emailIsValid(content)) message = "must be valid address";');
    expect(actionEngine).toContain('if (taken.length > 0) message = "must be unique";');
    expect(actionEngine).toContain(
      '"SELECT id FROM cards WHERE right_id = ? AND db_content = ? AND trash = 0 AND id IS NOT ? LIMIT 1",',
    );
  });

  it("the port never renders the password hash", () => {
    expect(portAccount).toContain(
      "const passwordRawView: ViewFn = () => \"encrypted\";",
    );
  });
});

describe("the harness's E19 legs cannot pass vacuously", () => {
  it("the row declares exactly the instrument's three check names", () => {
    const row = capabilities.capabilities.find((c: { id: string }) => c.id === "E19");
    expect(row).toBeDefined();
    expect(row.checks).toEqual([
      "the account card's board has an Account tab",
      "the Account tab exposes the account's email and password fields",
      "the account email can be changed and the new one signs in",
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

  it("the email leg grades the stored address and the OLD credential's refusal", () => {
    expect(harness).toContain(
      "emailWrite.status < 400 && emailRow?.db_content === newEmail && !oldEmailLogin.hasSessionCookie && newEmailLogin.hasSessionCookie === true",
    );
    expect(harness).toContain(
      "const emailRow = database().prepare(\"SELECT f.db_content FROM cards f JOIN cards a ON a.id=f.left_id JOIN cards r ON r.id=f.right_id WHERE a.left_id=? AND r.codename='email' AND f.trash=0\").get(account.id);",
    );
  });

  it("the fields leg grades a real email input and a real password input", () => {
    expect(harness).toContain(
      "const emailField = fields.find((f) => f.right === 'email' && f.name && f.type !== 'hidden');",
    );
    expect(harness).toContain(
      "const passwordField = fields.find((f) => f.right === 'password' && f.name && f.type === 'password');",
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("Account tab");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/account-tab-email-change.json",
        "utf8",
      ),
    ).toContain('"validate_email_event"');
  });
});

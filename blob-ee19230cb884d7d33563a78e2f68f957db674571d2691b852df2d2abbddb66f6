// The ACCOUNT EMAIL CHANGE pin (registry row cap-A3, "Change email").
//
// ORACLE-PINNED: fixtures/captured/account-email-change.json, captured
// from the pinned gemset (card-mod-account-0.20.0 and card-1.110.0) by
// tests/card/mod-loader/oracle-capture-account-email-change.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-account-0.20.0 set/right/email.rb - THE WRITE: the
//      :downcase_email event is `event :downcase_email, :prepare_to_validate,
//      on: :save do` and its body is `self.content = content.downcase`; the
//      :validate_email event strips the content and applies the address
//      grammar `return if content.match?(/^([^@\s]+)@((?:[-a-z0-9]+\.)+
//      [a-z]{2,})$/i)`, with the failure `errors.add :content,
//      t(:account_error_invalid_address)`; the :validate_unique_email event
//      REFUSES A DUPLICATE ADDRESS through `cql = { right_id: EmailID, eq:
//      content, return: :id }` and `errors.add :content,
//      t(:account_error_not_unique)`. The right is `assign_type :phrase`,
//      which is why the labeled row carries the address as text.
//   2. card-mod-account-0.20.0 set/right/account/views.rb - THE ADDRESS ON
//      THE ACCOUNT PAGE: view :core nests the email and the password with
//      account_field_nest, which is `field_nest field, title: title, view:
//      :labeled` - the LABELED view that renders the field's own content, so
//      the NEW address is what the page shows.
//   3. card-mod-account-0.20.0 set/abstract/account_field.rb - THE OWNER'S
//      WRITE PERMISSION: ok_to_update? is `(own_account? && !name_changed?
//      && !type_id_changed?) || super`.
//   4. card-1.110.0 lib/card/auth.rb and lib/card/auth/current.rb - THE
//      SIGN-IN BY THE NEW ADDRESS: `authenticate` finds the account with
//      `Auth.find_account_by_email email`, and find_account_by_email is
//      `find_account_by :email, email.strip.downcase` - the lookup
//      NORMALIZES the typed address, so the new address signs in.
//
// The port side is the account-field module
// (src/card/auth/account-fields.ts) for the address grammar and the
// downcase-then-strip normalization, the action engine
// (src/card/actions/card-action-engine.ts) for the duplicate-address refusal
// and the store, and the account mod
// (src/card/mod-loader/mods/card-mod-account.ts) for the labeled nest that
// shows the address on the account page.
//
// The third leg reads the harness's own account instrument and requires it
// to grade both of the row's legs: the email leg grades the STORED row's
// content plus the fresh credential verdicts (the old address must stop
// signing in and the new one must sign in), and the page leg grades the NEW
// address as it is rendered on the account page. The journey runs for BOTH
// actors, so the row's requiredActors are satisfied by the results
// themselves and not by the declared status.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/account-email-change.json", import.meta.url),
    "utf8",
  ),
);
const portAccountFields = readFileSync(
  new URL(
    "./../../../src/card/auth/account-fields.ts",
    import.meta.url,
  ),
  "utf8",
);
const portActionEngine = readFileSync(
  new URL(
    "./../../../src/card/actions/card-action-engine.ts",
    import.meta.url,
  ),
  "utf8",
);
const portAccount = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-account.ts",
    import.meta.url,
  ),
  "utf8",
);
const portSignin = readFileSync(
  new URL(
    "./../../../src/card/auth/signin.ts",
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

describe("the pinned Ruby's own bytes for the account email change", () => {
  it("the email right owns the downcase, the strip and the address grammar", () => {
    expect(capture.facts.downcase_email_event).toBe(
      "event :downcase_email, :prepare_to_validate, on: :save do",
    );
    expect(capture.facts.downcase_email_body).toBe(
      "self.content = content.downcase",
    );
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
  });

  it("the email right refuses a duplicate address", () => {
    expect(capture.facts.validate_unique_email_event).toBe(
      "event :validate_unique_email, after: :validate_email, on: :save do",
    );
    expect(capture.facts.validate_unique_email_cql).toBe(
      "cql = { right_id: EmailID, eq: content, return: :id }",
    );
    expect(capture.facts.validate_unique_email_error).toBe(
      "errors.add :content, t(:account_error_not_unique)",
    );
  });

  it("the account page shows the address through the labeled view", () => {
    expect(capture.facts.account_core_view).toBe("view :core do");
    expect(capture.facts.account_core_fields).toBe(
      '[account_field_nest(:email, "email"),\n     account_field_nest(:password, "password")]',
    );
    expect(capture.facts.account_field_nest).toBe(
      "field_nest field, title: title, view: :labeled",
    );
    expect(capture.facts.email_assign_type).toBe("assign_type :phrase");
  });

  it("the account holder updates their own field", () => {
    expect(capture.facts.account_field_ok_to_update).toBe(
      "(own_account? && !name_changed? && !type_id_changed?) || super",
    );
  });

  it("the sign-in looks the account up by the NORMALIZED address", () => {
    expect(capture.facts.authenticate).toBe(
      "def authenticate email, password",
    );
    expect(capture.facts.authenticate_account).toBe(
      "account = Auth.find_account_by_email email",
    );
    expect(capture.facts.find_account_by_email).toBe(
      "def find_account_by_email email",
    );
    expect(capture.facts.find_account_by_email_body).toBe(
      "find_account_by :email, email.strip.downcase",
    );
  });

  it("the capture names the gemsets it photographed", () => {
    expect(capture.oracle.validate_email_event.gem).toBe(
      "card-mod-account-0.20.0",
    );
    expect(capture.oracle.account_core_view.gem).toBe(
      "card-mod-account-0.20.0",
    );
    expect(capture.oracle.authenticate.gem).toBe("card-1.110.0");
    expect(capture.oracle.find_account_by_email.gem).toBe("card-1.110.0");
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port's address grammar and normalization are the pinned ones", () => {
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
    expect(portActionEngine).toContain(
      "private async validatedEmailContent(raw: string, rightId: number, selfId: number | null): Promise<string> {",
    );
    expect(portActionEngine).toContain(
      'if (!emailIsValid(content)) message = "must be valid address";',
    );
    expect(portActionEngine).toContain('if (taken.length > 0) message = "must be unique";');
    expect(portActionEngine).toContain(
      '"SELECT id FROM cards WHERE right_id = ? AND db_content = ? AND trash = 0 AND id IS NOT ? LIMIT 1",',
    );
  });

  it("the port's sign-in normalizes the typed address", () => {
    expect(portSignin).toContain("const email = rubyStrip(identifier).toLowerCase();");
  });

  it("the port's account page shows the address through the labeled view", () => {
    expect(portAccount).toContain(
      'syntax: `${ctx.fmt.card.name.s}+*${field}|view:labeled|title:${title}`,',
    );
    expect(portAccount).toContain(
      'options: { view: "labeled", title, extra: {} },',
    );
  });
});

describe("the harness's A3 legs cannot pass vacuously", () => {
  it("the row declares exactly the instrument's two check names", () => {
    const row = capabilities.capabilities.find((c: { id: string }) => c.id === "A3");
    expect(row).toBeDefined();
    expect(row.checks).toEqual([
      "the account email can be changed and the new one signs in",
      "A3 the account's new email address shows on the account page",
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

  it("the email leg grades the STORED row's content and the OLD credential's refusal", () => {
    expect(harness).toContain(
      "record('the account email can be changed and the new one signs in', emailWrite.status < 400 && emailRow?.db_content === newEmail && !oldEmailLogin.hasSessionCookie && newEmailLogin.hasSessionCookie === true,",
    );
    expect(harness).toContain(
      "const emailRow = database().prepare(\"SELECT f.db_content FROM cards f JOIN cards a ON a.id=f.left_id JOIN cards r ON r.id=f.right_id WHERE a.left_id=? AND r.codename='email' AND f.trash=0\").get(account.id);",
    );
  });

  it("the page leg grades the NEW address as it is RENDERED, not the stored row", () => {
    expect(harness).toContain(
      "record(\"A3 the account's new email address shows on the account page\",\n          shownAfterChange !== null && shownAfterChange.includes(newEmail),",
    );
    expect(harness).toContain(
      "const shownAfterChange = await page.evaluate(() => {",
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("email can be changed");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/account-email-change.json",
        "utf8",
      ),
    ).toContain('"validate_email_grammar"');
  });
});

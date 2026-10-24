// The ACCOUNT PASSWORD CHANGE pin (registry row cap-A2, "Change password,
// then sign in with the new password").
//
// ORACLE-PINNED: fixtures/captured/account-password-change.json, captured
// from the pinned gemset (card-mod-account-0.20.0 and card-1.110.0) by
// tests/card/mod-loader/oracle-capture-account-password-change.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-account-0.20.0 set/right/password.rb - THE WRITE: the
//      :encrypt_password event is `event :encrypt_password, :store, on:
//      :save, changed: :content do` and its body is `self.content =
//      Auth.encrypt content, salt`, over the account's EXISTING salt
//      (`salt = left&.salt`). The validation ladder: the
//      :validate_password_length event, the :validate_password_chars event
//      over PASSWORD_REGEX (lower, upper, special_char, number), and the
//      :validate_password_present event whose body is `abort :success if
//      content.blank?` - a BLANK password is a silent no-op.
//   2. card-mod-account-0.20.0 set/right/salt.rb - THE SALT: `generate` is
//      `self.content = Digest::SHA1.hexdigest "--#{Time.zone.now}--"`, and
//      the salt is generated ONCE at account creation
//      (set_default_salt), never on a password change.
//   3. card-1.110.0 lib/card/auth.rb - THE SIGN-IN: `authenticate` finds
//      the account by email and returns it only when
//      `password_valid?(account, password.strip)`; `password_valid?` is
//      `account.password == encrypt(password, account.salt)`; `encrypt` is
//      `Digest::SHA1.hexdigest "#{salt}--#{password}--"`.
//   4. card-mod-account-0.20.0 set/abstract/account_field.rb - THE OWNER'S
//      WRITE PERMISSION: ok_to_update? is `(own_account? && !name_changed?
//      && !type_id_changed?) || super`.
//   5. card-mod-account-0.20.0 set/right/account.rb - the account's own read
//      and write permissions, the same two overrides.
//   6. card-mod-account-0.20.0 lib/card/mod/account.rb - THE POLICY: the
//      password length (8) and the character requirements
//      (%i[lower upper special_char number]).
//
// The port side is the account-field module
// (src/card/actions/account-fields.ts) for the digest and the validation
// ladder, the action engine
// (src/card/actions/card-action-engine.ts) for the write path that runs
// those checks before it stores, and the password-hash module
// (src/card/auth/password-hash.ts) for the stored value's shape.
//
// The third leg is the harness's own account instrument: the password leg
// must pass for BOTH actors, and it grades the STORED row's digest plus the
// fresh credential verdicts - the old password must stop signing in and the
// new one must sign in.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL(
      "./../../../fixtures/captured/account-password-change.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const portAccountFields = readFileSync(
  new URL(
    "./../../../src/card/actions/account-fields.ts",
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
const portPasswordHash = readFileSync(
  new URL(
    "./../../../src/card/auth/password-hash.ts",
    import.meta.url,
  ),
  "utf8",
);
const portResetFlows = readFileSync(
  new URL(
    "./../../../src/card/auth/account-verify-reset-flows.ts",
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

describe("the pinned Ruby's own bytes for the account password change", () => {
  it("the password right owns the encrypt-on-store event over the account's salt", () => {
    expect(capture.facts.encrypt_password_event).toBe(
      "event :encrypt_password, :store, on: :save, changed: :content do",
    );
    expect(capture.facts.encrypt_password_body).toBe(
      "self.content = Auth.encrypt content, salt",
    );
    expect(capture.facts.encrypt_password_salt_read).toBe("salt = left&.salt");
    expect(capture.facts.password_core_view).toBe("view :core, wrap: :em do");
  });

  it("the password right owns the validation ladder and the blank guard", () => {
    expect(capture.facts.validate_password_length_event).toBe(
      "event :validate_password_length, :validate, on: :save do",
    );
    expect(capture.facts.validate_password_length_body).toBe(
      "return if content.length >= min_pw_length",
    );
    expect(capture.facts.validate_password_chars_event).toBe(
      "event :validate_password_chars, :validate, on: :save do",
    );
    expect(capture.facts.validate_password_chars_body).toBe(
      "pw_requirements = check_password_regex(",
    );
    expect(capture.facts.validate_password_present_event).toBe(
      "event :validate_password_present, :prepare_to_validate, on: :update do",
    );
    expect(capture.facts.validate_password_present_body).toBe(
      "abort :success if content.blank?",
    );
  });

  it("the policy is the pinned length and the four pinned character classes", () => {
    expect(capture.facts.password_policy_length).toBe(
      "config.account_password_length = 8",
    );
    expect(capture.facts.password_policy_requirements).toBe(
      "config.account_password_requirements = %i[lower upper special_char number]",
    );
    expect(capture.facts.password_regex).toBe("PASSWORD_REGEX = {");
    expect(capture.facts.password_regex_lower).toBe("lower: /[a-z]/");
    expect(capture.facts.password_regex_upper).toBe("upper: /[A-Z]/");
    expect(capture.facts.password_regex_special_char).toBe(
      "special_char: %r{",
    );
    expect(capture.facts.password_regex_number).toBe("number: /\\d+/");
  });

  it("the salt is generated once at creation, not on a password change", () => {
    expect(capture.facts.salt_generate).toBe(
      'self.content = Digest::SHA1.hexdigest "--#{Time.zone.now}--"',
    );
    expect(capture.facts.set_default_salt_event).toBe(
      "event :set_default_salt, :prepare_to_validate, on: :create do",
    );
    expect(capture.facts.set_default_salt_body).toBe("field(:salt).generate");
  });

  it("the sign-in compares the stored digest over the account's salt", () => {
    expect(capture.facts.authenticate).toBe(
      "def authenticate email, password",
    );
    expect(capture.facts.authenticate_account).toBe(
      "account = Auth.find_account_by_email email",
    );
    expect(capture.facts.authenticate_valid).toBe(
      "account if not_required? || password_valid?(account, password.strip)",
    );
    expect(capture.facts.password_valid).toBe(
      "def password_valid? account, password",
    );
    expect(capture.facts.password_valid_body).toBe(
      "account.password == encrypt(password, account.salt)",
    );
    expect(capture.facts.auth_encrypt).toBe("def encrypt password, salt");
    expect(capture.facts.auth_encrypt_body).toBe(
      'Digest::SHA1.hexdigest "#{salt}--#{password}--"',
    );
  });

  it("the account holder updates their own field", () => {
    expect(capture.facts.account_field_ok_to_update).toBe(
      "(own_account? && !name_changed? && !type_id_changed?) || super",
    );
    expect(capture.facts.account_ok_to_update).toBe(
      "(own_account? && !name_changed? && !type_id_changed?) || super",
    );
    expect(capture.facts.account_ok_to_read).toBe("own_account? || super");
  });

  it("the capture names the gemsets it photographed", () => {
    expect(capture.oracle.encrypt_password_event.gem).toBe(
      "card-mod-account-0.20.0",
    );
    expect(capture.oracle.salt_generate.gem).toBe("card-mod-account-0.20.0");
    expect(capture.oracle.authenticate.gem).toBe("card-1.110.0");
    expect(capture.oracle.auth_encrypt.gem).toBe("card-1.110.0");
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port computes the pinned digest over the account's salt", () => {
    expect(portAccountFields).toContain(
      'return createHash("sha1").update(`${salt ?? ""}--${password}--`).digest("hex");',
    );
    expect(portAccountFields).toContain(
      "export function encryptPassword(password: string, salt: string | null | undefined): string {",
    );
  });

  it("the port's validation ladder is the pinned one", () => {
    expect(portAccountFields).toContain(
      "export function passwordErrors(password: string): string[] {",
    );
    expect(portAccountFields).toContain(
      'if ([...password].length < 8) errors.push("must be 8 characters or longer");',
    );
    expect(portAccountFields).toContain(
      'if (!/[a-z]/.test(password)) missing.push("a lower case letter");',
    );
    expect(portAccountFields).toContain(
      'if (!/[A-Z]/.test(password)) missing.push("an upper case letter");',
    );
    expect(portAccountFields).toContain(
      'if (!/\\d+/.test(password)) missing.push("a number");',
    );
  });

  it("the port's engine runs the ladder before it stores the digest", () => {
    expect(portActionEngine).toContain(
      'if (rightCode === "password" && input.content != null && input.attachment === undefined && input.passwordEncrypted !== true) {',
    );
    expect(portActionEngine).toContain(
      "const problems = passwordErrors(input.content);",
    );
    expect(portActionEngine).toContain(
      "input.content = await storedPasswordValue(input.content, await this.accountSalt(sides.leftId), this.passwordHashing);",
    );
  });

  it("the port's stored value keeps the salt and the iteration count", () => {
    expect(portPasswordHash).toContain(
      'const PBKDF2_PREFIX = "pbkdf2_sha256";',
    );
    expect(portPasswordHash).toContain(
      "export async function hashPassword(",
    );
    expect(portPasswordHash).toContain(
      "if (policy.mode === \"legacy-sha1\") return legacyDigest(password, legacySalt);",
    );
    expect(portPasswordHash).toContain(
      "export function legacyDigest(password: string, salt: string): Promise<string> {",
    );
  });

  it("the port's blank password is the pinned silent no-op", () => {
    expect(portResetFlows).toContain(
      "if (rubyStrip(newPassword) === \"\") {",
    );
    expect(portResetFlows).toContain(
      "return { ok: true, noOp: true };",
    );
  });
});

describe("the harness's A2 legs cannot pass vacuously", () => {
  it("the row declares exactly the instrument's check name", () => {
    const row = capabilities.capabilities.find((c: { id: string }) => c.id === "A2");
    expect(row).toBeDefined();
    expect(row.checks).toEqual([
      "the account password can be changed and the new one signs in",
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

  it("the password leg grades the OLD credential's refusal and the NEW one's acceptance", () => {
    expect(harness).toContain(
      "record(\"the account password can be changed and the new one signs in\", write.status < 400 && withNew.hasSessionCookie === true && withNew.skipped !== true,",
    );
    expect(harness).toContain(
      "oldPasswordStillWorks: withOld.hasSessionCookie, newPasswordWorks: withNew.hasSessionCookie",
    );
  });

  it("the password leg changes a REAL password and restores the fixture's own", () => {
    expect(harness).toContain(
      "const next = `${oldPassword}Ax7#`;",
    );
    expect(harness).toContain(
      "await restore.fill(oldPassword);",
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("password can be changed");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/account-password-change.json",
        "utf8",
      ),
    ).toContain('"encrypt_password_event"');
  });
});

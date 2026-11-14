// The SIGN-IN FORM VALIDATION pin (registry row cap-S3, "Sign in requires
// email and password (form validation)").
//
// ORACLE-PINNED: fixtures/captured/signin-blank-field-refusal.json, captured
// from the pinned gemset (card-mod-account-0.20.0) by
// tests/card/mod-loader/oracle-capture-signin-blank-field-refusal.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-account-0.20.0 set/self/signin.rb - THE VALIDATION EVENT:
//      `event :signin, :validate, on: :update` is the write route's own
//      validation hook, and `authenticate_or_abort` refuses the blank
//      identifier with `abort_unless email, :email_missing` BEFORE the blank
//      password with `abort_unless pword, :password_missing`. `abort_unless`
//      is the refusal itself: `abort :failure, t("account_#{error_key}")
//      unless value`.
//   2. card-mod-account-0.20.0 set/self/signin.rb - THE TWO REQUIRED FIELDS:
//      `before :core` seats `voo.edit_structure = [signin_field(:email),
//      signin_field(:password)]`, so the form asks for both.
//   3. card-mod-account-0.20.0 config/locales/en.yml - THE TWO MESSAGES:
//      account_email_missing is "email can't be blank" and
//      account_password_missing is "password can't be blank".
//
// The port side is the sign-in ladder (src/card/auth/signin.ts), the write
// route that answers the blank fields (src/server/write-routes.ts) and the
// sign-in form's own two fields (src/card/render/signin-core-form-view.ts).
//
// The fourth leg is the harness's own signed-out instrument: the row's two
// checks are driven one half at a time, each graded as a refusal with no
// session, so the row's own recorded finding ("Empty password tested; empty
// email not tested") cannot stay true.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifiedCapabilities } from "../../../tools/edge-signed-in-exercise/lib/local-policy.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL("./../../../fixtures/captured/signin-blank-field-refusal.json", import.meta.url),
    "utf8",
  ),
);
const portSignin = readFileSync(
  new URL("./../../../src/card/auth/signin.ts", import.meta.url),
  "utf8",
);
const portWriteRoutes = readFileSync(
  new URL("./../../../src/server/write-routes.ts", import.meta.url),
  "utf8",
);
const portForm = readFileSync(
  new URL("./../../../src/card/render/signin-core-form-view.ts", import.meta.url),
  "utf8",
);
const harness = readFileSync(
  new URL("./../../../tools/edge-signed-in-exercise.mjs", import.meta.url),
  "utf8",
);
const coverB = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/checks-cover-b.mjs",
    import.meta.url,
  ),
  "utf8",
);
const roster = JSON.parse(
  readFileSync(
    new URL(
      "./../../../tools/edge-signed-in-exercise/capabilities.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const ROW_CHECKS = [
  "sign-in with an empty email is refused (no session)",
  "sign-in with an empty password is refused (no session)",
];

describe("the pinned Ruby's own bytes for the sign-in form validation", () => {
  it("the sign-in event validates on update with both field contents", () => {
    expect(capture.facts.signin_validate_event).toBe(
      "event :signin, :validate, on: :update do",
    );
    expect(capture.facts.signin_validate_body).toBe(
      "authenticate_or_abort field_content(:email), field_content(:password)",
    );
  });

  it("the refusal names the email key first and the password key second", () => {
    expect(capture.facts.authenticate_or_abort_method).toBe(
      "def authenticate_or_abort email, pword",
    );
    expect(capture.facts.authenticate_or_abort_email).toBe(
      "abort_unless email, :email_missing",
    );
    expect(capture.facts.authenticate_or_abort_password).toBe(
      "abort_unless pword, :password_missing",
    );
    expect(capture.oracle.authenticate_or_abort.source.indexOf(":email_missing")).toBeLessThan(
      capture.oracle.authenticate_or_abort.source.indexOf(":password_missing"),
    );
  });

  it("the refusal aborts with the keyed message", () => {
    expect(capture.facts.abort_unless_method).toBe(
      "def abort_unless value, error_key",
    );
    expect(capture.facts.abort_unless_body).toBe(
      'abort :failure, t("account_#{error_key}") unless value',
    );
  });

  it("the form asks for an email and a password", () => {
    expect(capture.facts.before_core).toBe("before :core do");
    expect(capture.facts.edit_structure).toBe(
      "voo.edit_structure = [signin_field(:email), signin_field(:password)]",
    );
  });

  it("the two messages are Ruby's own", () => {
    expect(capture.facts.email_missing_message).toBe("email can't be blank");
    expect(capture.facts.password_missing_message).toBe(
      "password can't be blank",
    );
  });

  it("the capture names the gemset it photographed", () => {
    expect(capture.oracle.signin_validate_event.gem).toBe(
      "card-mod-account-0.20.0",
    );
    expect(capture.oracle.authenticate_or_abort.gem).toBe(
      "card-mod-account-0.20.0",
    );
    expect(capture.oracle.email_missing_locale.gem).toBe(
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
  it("the port's ladder refuses the blank identifier before the blank password", () => {
    expect(portSignin).toContain(
      'email_missing: "email can\'t be blank", // account_email_missing',
    );
    expect(portSignin).toContain(
      'password_missing: "password can\'t be blank", // account_password_missing',
    );
    expect(portSignin).toContain('if (id === "") return failure("email_missing");');
    expect(portSignin).toContain(
      'if (password === "") return failure("password_missing");',
    );
    expect(portSignin.indexOf('failure("email_missing")')).toBeLessThan(
      portSignin.indexOf('failure("password_missing")'),
    );
  });

  it("the write route answers the blank fields with Ruby's own message", () => {
    expect(portWriteRoutes).toContain('if (email === "" || password === "") {');
    expect(portWriteRoutes).toContain(
      'const field = email === "" ? "email" : "password";',
    );
    expect(portWriteRoutes).toContain(
      "return fail(`${field} missing`, `${field} can't be blank`);",
    );
  });

  it("the port's sign-in form asks for the same two fields", () => {
    expect(portForm).toContain(
      'const editStructure = [signinField("email"), signinField("password")];',
    );
  });
});

describe("the harness's S3 legs cannot pass vacuously", () => {
  it("the harness records both halves of the row", () => {
    for (const name of ROW_CHECKS) {
      expect(
        harness.includes(`record("${name}"`),
        `the harness records the check "${name}"`,
      ).toBe(true);
    }
  });

  it("the blank email is driven on its own, with the password present", () => {
    const blankEmail = harness.indexOf(
      'record("sign-in with an empty email is refused (no session)"',
    );
    expect(blankEmail).toBeGreaterThan(-1);
    const leg = harness.slice(
      harness.lastIndexOf("// empty email", blankEmail),
      blankEmail,
    );
    expect(leg).toContain(
      'await p2.fill(\'input[name="card[subcards][+*email][content]"]\', "");',
    );
    expect(leg).toContain(
      'await p2.fill(\'input[name="card[subcards][+*password][content]"]\', creds.admin.password);',
    );
  });

  it("the refusal is read off the page, so a 4xx with no message cannot pass", () => {
    expect(harness).toContain(
      "const emptyEmailRefused = /([^<>]{0,80}(?:can'?t be blank|is required|blank)[^<>]{0,80})/i.exec(emptyEmailBody)?.[0]?.trim() ?? null;",
    );
    expect(harness).toContain(
      "emptyEmailResponse === null || emptyEmailRefused !== null",
    );
  });

  it("the cover-b module carries the row's own both-empty leg", () => {
    expect(coverB).toContain(
      'record("S3 Sign in requires email and password (form validation)",',
    );
  });

  it("the roster declares the row's two checks and nothing else", () => {
    const row = roster.capabilities.find((c: { id: string }) => c.id === "S3");
    expect(row).toBeDefined();
    expect(row.status).toBe("covered");
    expect(row.checks).toEqual(ROW_CHECKS);
  });

  it("the grader credits the row only when both halves pass", () => {
    const row = roster.capabilities.find((c: { id: string }) => c.id === "S3");
    const both = ROW_CHECKS.map((check) => ({ check, pass: true }));
    expect(
      verifiedCapabilities([row], both).find((c: { id: string }) => c.id === "S3")
        ?.status,
    ).toBe("covered");
    expect(
      verifiedCapabilities([row], both.slice(1)).find(
        (c: { id: string }) => c.id === "S3",
      )?.status,
    ).not.toBe("covered");
    expect(
      verifiedCapabilities([row], [
        ...both,
        { check: both[0].check, pass: false },
      ]).find((c: { id: string }) => c.id === "S3")?.status,
    ).not.toBe("covered");
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("email and a password");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/signin-blank-field-refusal.json",
        "utf8",
      ),
    ).toContain('"email_missing_message"');
  });
});

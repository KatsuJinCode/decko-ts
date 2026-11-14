// tests/card/auth/account-fields.test.ts — the sign-up account field events.
//
// The shown messages are the oracle's (Ruby Decko 0.20, captured by
// tools/parity-side-effects: signup-duplicate-email, signup-bad-email,
// signup-short-password), and the encryption is Card::Auth.encrypt's
// (accounts written by either engine verify in the other; see
// tools/parity-side-effects/ruby/cross_auth.rb).

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  emailIsValid,
  encryptPassword,
  normalizeEmail,
  passwordErrors,
  planAccountFields,
} from "../../../src/card/auth/account-fields.js";
import { listItemStrings } from "../../../src/card/actions/refresh-references-out.js";

const NOW = new Date("2026-10-07T12:00:00.000Z");
const plan = (fields: Record<string, string>, opts: { signup?: boolean; approve?: boolean; taken?: string[] } = {}) =>
  planAccountFields({
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { content: v }])),
    holderIsSignup: opts.signup ?? true,
    canApprove: opts.approve ?? false,
    emailTaken: async (e) => (opts.taken ?? []).includes(e),
    now: NOW,
  });

describe("account field rules", () => {
  it("password rules and their consolidated message", () => {
    expect(passwordErrors("ab")).toEqual([
      "must be 8 characters or longer",
      "must contain an upper case letter, a special character (like !@$%&#), and a number",
    ]);
    expect(passwordErrors("Abcdefg1")).toEqual(["must contain a special character (like !@$%&#)"]);
    expect(passwordErrors("ABCDEFG1$")).toEqual(["must contain a lower case letter"]);
    expect(passwordErrors("abcdefgh")).toEqual([
      "must contain an upper case letter, a special character (like !@$%&#), and a number",
    ]);
    expect(passwordErrors("abcdefg$")).toEqual(["must contain an upper case letter and a number"]);
    expect(passwordErrors("Joiner horse battery 4$")).toEqual([]);
  });

  it("email: downcased and stripped, then the address grammar", () => {
    expect(normalizeEmail("  Invitee.Probe@Example.com ")).toBe("invitee.probe@example.com");
    expect(emailIsValid("joiner.probe@example.com")).toBe(true);
    expect(emailIsValid("not-an-address")).toBe(false);
    expect(emailIsValid("a@b")).toBe(false);
  });

  it("encryption is SHA1(salt--password--), as Card::Auth.encrypt", async () => {
    const want = createHash("sha1").update("s4lt--secret--").digest("hex");
    expect(await encryptPassword("secret", "s4lt")).toBe(want);
  });
});

describe("planAccountFields (the oracle's shown errors and field rows)", () => {
  it("rejects a taken address: +*ACCOUNT: +*email must be unique", async () => {
    const p = await plan({ "+*email": "joiner.probe@example.com", "+*password": "Joiner horse battery 4$" },
      { taken: ["joiner.probe@example.com"] });
    expect(p.errors).toEqual(["+*ACCOUNT: +*email must be unique"]);
    expect(p.writes).toEqual([]);
  });

  it("rejects a malformed address: +*ACCOUNT: +*email must be valid address", async () => {
    const p = await plan({ "+*email": "not-an-address", "+*password": "Joiner horse battery 4$" });
    expect(p.errors).toEqual(["+*ACCOUNT: +*email must be valid address"]);
  });

  it("rejects a short password with both password messages", async () => {
    const p = await plan({ "+*email": "joiner4.probe@example.com", "+*password": "ab" });
    expect(p.errors).toEqual([
      "+*ACCOUNT: +*password password must be 8 characters or longer",
      "+*ACCOUNT: +*password password must contain an upper case letter, a special character (like !@$%&#), and a number",
    ]);
  });

  it("requires an email field", async () => {
    const p = await plan({ "+*password": "Joiner horse battery 4$" });
    expect(p.errors).toEqual(["+*ACCOUNT: email required"]);
  });

  it("writes email, password, salt, status in Ruby's row order; password and salt without history", async () => {
    const p = await plan({ "+*email": "Joiner.Probe@Example.com", "+*password": "Joiner horse battery 4$" });
    expect(p.errors).toEqual([]);
    expect(p.writes.map((w) => [w.key, w.history])).toEqual([
      ["+*email", true], ["+*password", false], ["+*salt", false], ["+*status", true],
    ]);
    const salt = p.writes[2].content;
    expect(salt).toMatch(/^[0-9a-f]{40}$/);
    expect(p.writes[0].content).toBe("joiner.probe@example.com");
    expect(p.writes[1].content).toBe(await encryptPassword("Joiner horse battery 4$", salt));
    expect(p.writes[1].content).not.toContain("horse");
  });

  it("status: unapproved for an anonymous sign-up, unverified when the creator can approve, active otherwise", async () => {
    const fields = { "+*email": "a.b@example.com", "+*password": "Joiner horse battery 4$" };
    expect((await plan(fields)).status).toBe("unapproved");
    const approved = await plan(fields, { approve: true });
    expect(approved.status).toBe("unverified");
    expect(approved.requestVerification).toBe(true);
    expect((await plan(fields, { signup: false })).status).toBe("active");
  });
});

describe("list item strings (Abstract::List references)", () => {
  it("one item per line, brackets stripped", () => {
    expect(listItemStrings("unapproved")).toEqual(["unapproved"]);
    expect(listItemStrings("[[A]]\n[[B C]]\n\nD")).toEqual(["A", "B C", "D"]);
  });
});

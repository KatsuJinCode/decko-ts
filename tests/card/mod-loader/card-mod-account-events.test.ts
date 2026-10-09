// The card-mod-account event chain (the mod-events lane, 2026-10-08):
// every Ruby set-module event the coverage recount mines (30 names,
// deliverables/mod-coverage-authoritative-2026-09-28.md, card-mod-account
// events column "30 / 0") declares into the mod's manifest with the gem's
// stage/trigger/changed/when/after metadata, plus the three DYNAMIC
// declarations the recount's literal `event :name` regex cannot see
// (right/account/events.rb:32-35 builds `event :"send_#{email}"` for
// password_reset_email / verification_email / welcome_email).
//
// Proof shape:
//   WITHOUT the mod: a mod-less loader's event registry holds none of the
//     30 names (the declarations are the port; removing them fails here).
//   WITH the mod: all names declare from their gem set files; the
//     metadata is verbatim per the gem sources; the engine-owned bodies
//     the declarations record are pinned against the Ruby sources
//     (password.rb's validation ladder and messages, email.rb's grammar
//     and normalization, auth.rb#encrypt's digest).
//
// Engine ownership per event is cited at the declaration (manifest source,
// card-mod-account.ts); this file pins the observable half.

import { describe, it, expect, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";
import cardModAccount from "../../../src/card/mod-loader/mods/card-mod-account.js";
import {
  passwordErrors,
  normalizeEmail,
  emailIsValid,
  encryptPassword,
} from "../../../src/card/auth/account-fields.js";

/** Every event declaration in the account manifest, flattened with the
 *  declaring set path (the loader injects the same pair at registration). */
function declaredEvents(): Array<{ setPath: string; modName: string } & Record<string, unknown>> {
  const out: Array<{ setPath: string; modName: string } & Record<string, unknown>> = [];
  for (const file of cardModAccount.setModules ?? []) {
    for (const event of file.events ?? []) {
      out.push({ setPath: file.setPath, modName: "account", ...(event as Record<string, unknown>) });
    }
  }
  return out;
}

/** The recount's 30 names (tmp/wrong-goal-hunt instrument output over the
 *  pinned gems, mod-events lane re-run 2026-10-08). */
const RECOUNT_30 = [
  "act_as_current_for_integrate_stage",
  "activate_account",
  "approve_with_verification",
  "approve_without_verification",
  "auto_approve_with_verification",
  "check_setup",
  "delete_account",
  "downcase_email",
  "encrypt_password",
  "generate_token",
  "password_redirect",
  "reset_password",
  "send_reset_password_token",
  "set_default_salt",
  "set_default_status",
  "set_stamper",
  "setup_first_user",
  "signin",
  "signin_after_setup",
  "signin_success",
  "signout",
  "signout_upon_delete",
  "update_role_cache",
  "validate_account_holder_name_change",
  "validate_email",
  "validate_password_chars",
  "validate_password_length",
  "validate_password_present",
  "validate_unique_email",
  "verify_and_activate",
] as const;

/** The three dynamic declarations (right/account/events.rb:33-35). */
const DYNAMIC_3 = [
  "send_password_reset_email",
  "send_verification_email",
  "send_welcome_email",
] as const;

/** The empty manifest stand-in for the WITHOUT arm (the loader requires a
 *  manifest list; a bare mod-less load leaves the registry empty). */
const EMPTY_MANIFEST: DeckoModManifest = { name: "eventless", group: "gem-defaults", setModules: [] };

afterAll(() => {
  loader?.reset();
});

let loader: ModLoader | undefined;

describe("card-mod-account event declarations (A/B)", () => {
  it("WITHOUT the mod: the registry holds none of the 30 events", () => {
    const bare = new ModLoader([{ manifest: EMPTY_MANIFEST }]);
    bare.load();
    const names = bare.eventRegistry().all().map((e) => e.event);
    for (const name of RECOUNT_30) {
      expect(names).not.toContain(name);
    }
    bare.reset();
  });

  it("WITH the mod: all 30 recount names declare, exactly, plus the 3 dynamic send_*", () => {
    const names = declaredEvents().map((e) => e.event as string);
    for (const name of RECOUNT_30) {
      expect(names, `${name} missing from the account manifest`).toContain(name);
    }
    for (const name of DYNAMIC_3) {
      expect(names, `${name} (the gem's dynamic event loop) missing`).toContain(name);
    }
    // no unaccounted extras: 30 + 3
    expect(new Set(names).size).toBe(33);
  });

  it("each event declares from its gem set file", () => {
    const byFile = new Map(declaredEvents().map((e) => [e.event as string, e.setPath as string]));
    // all/account.rb:16/:20
    expect(byFile.get("generate_token")).toBe("all/account");
    expect(byFile.get("set_stamper")).toBe("all/account");
    // abstract/account_holder.rb:1
    expect(byFile.get("validate_account_holder_name_change")).toBe("abstract/account_holder");
    // right/email.rb:7/:16/:29
    expect(byFile.get("validate_email")).toBe("right/email");
    expect(byFile.get("validate_unique_email")).toBe("right/email");
    expect(byFile.get("downcase_email")).toBe("right/email");
    // right/password.rb:21/:30/:37/:49
    expect(byFile.get("encrypt_password")).toBe("right/password");
    expect(byFile.get("validate_password_length")).toBe("right/password");
    expect(byFile.get("validate_password_chars")).toBe("right/password");
    expect(byFile.get("validate_password_present")).toBe("right/password");
    // right/account/events.rb
    expect(byFile.get("set_default_salt")).toBe("right/account/events");
    expect(byFile.get("set_default_status")).toBe("right/account/events");
    expect(byFile.get("reset_password")).toBe("right/account/events");
    expect(byFile.get("verify_and_activate")).toBe("right/account/events");
    expect(byFile.get("password_redirect")).toBe("right/account/events");
    expect(byFile.get("send_password_reset_email")).toBe("right/account/events");
    expect(byFile.get("activate_account")).toBe("right/account/events");
    expect(byFile.get("delete_account")).toBe("right/account/events");
    expect(byFile.get("signout_upon_delete")).toBe("right/account/events");
    // type/signup.rb:20/:24/:28/:36
    expect(byFile.get("auto_approve_with_verification")).toBe("type/signup");
    expect(byFile.get("approve_with_verification")).toBe("type/signup");
    expect(byFile.get("approve_without_verification")).toBe("type/signup");
    expect(byFile.get("act_as_current_for_integrate_stage")).toBe("type/signup");
    // type/user.rb:50/:59/:66
    expect(byFile.get("check_setup")).toBe("type/user");
    expect(byFile.get("setup_first_user")).toBe("type/user");
    expect(byFile.get("signin_after_setup")).toBe("type/user");
    // type_plus_right/role/members.rb:5
    expect(byFile.get("update_role_cache")).toBe("type_plus_right/role/members");
    // self/signin.rb:10/:15/:19/:27
    expect(byFile.get("signin")).toBe("self/signin");
    expect(byFile.get("signin_success")).toBe("self/signin");
    expect(byFile.get("signout")).toBe("self/signin");
    expect(byFile.get("send_reset_password_token")).toBe("self/signin");
  });

  it("carries the gem's stage/trigger metadata verbatim", () => {
    const byName = new Map(declaredEvents().map((e) => [e.event as string, e]));
    // right/email.rb:7 `event :validate_email, :validate, on: :save`
    expect(byName.get("validate_email")).toMatchObject({ at: "validate", on: ["save"] });
    // right/email.rb:16 `event :validate_unique_email, after: :validate_email, on: :save`
    expect(byName.get("validate_unique_email")).toMatchObject({
      after: "validate_email",
      on: ["save"],
    });
    // right/email.rb:29 `event :downcase_email, :prepare_to_validate, on: :save`
    expect(byName.get("downcase_email")).toMatchObject({ at: "prepare_to_validate", on: ["save"] });
    // right/password.rb:21 `event :encrypt_password, :store, on: :save, changed: :content`
    expect(byName.get("encrypt_password")).toMatchObject({
      at: "store",
      on: ["save"],
      changed: ["content"],
    });
    // right/password.rb:49 `event :validate_password_present, :prepare_to_validate, on: :update`
    expect(byName.get("validate_password_present")).toMatchObject({
      at: "prepare_to_validate",
      on: ["update"],
    });
    // right/account/events.rb:15 `event :reset_password, :prepare_to_validate,
    // on: :update, trigger: :required`
    expect(byName.get("reset_password")).toMatchObject({
      at: "prepare_to_validate",
      on: ["update"],
      trigger: "required",
    });
    // right/account/events.rb:19 `event :verify_and_activate, ... trigger: :required`
    expect(byName.get("verify_and_activate")).toMatchObject({
      at: "prepare_to_validate",
      on: ["update"],
      trigger: "required",
    });
    // right/account/events.rb:26 `event :password_redirect, :finalize,
    // on: :update, when: :password_redirect?`
    expect(byName.get("password_redirect")).toMatchObject({
      at: "finalize",
      on: ["update"],
      when: "password_redirect?",
    });
    // right/account/events.rb:33 (dynamic loop) `event :"send_#{email}",
    // :integrate, trigger: :required`
    for (const name of DYNAMIC_3) {
      expect(byName.get(name)).toMatchObject({ at: "integrate", trigger: "required" });
    }
    // right/account/events.rb:40 `event :activate_account` — no stage, no
    // triggers (runs within the confirming act's director pass).
    const activate = byName.get("activate_account")!;
    expect(activate.at).toBeUndefined();
    expect(activate.on).toBeUndefined();
    // right/account/events.rb:45 `event :delete_account, :prepare_to_validate, on: :delete`
    expect(byName.get("delete_account")).toMatchObject({ at: "prepare_to_validate", on: ["delete"] });
    // right/account/events.rb:49 `event :signout_upon_delete, :integrate,
    // on: :delete, when: :current_account?`
    expect(byName.get("signout_upon_delete")).toMatchObject({
      at: "integrate",
      on: ["delete"],
      when: "current_account?",
    });
    // type/signup.rb:20 `event :auto_approve_with_verification, :validate,
    // on: :create, when: :can_approve?`
    expect(byName.get("auto_approve_with_verification")).toMatchObject({
      at: "validate",
      on: ["create"],
      when: "can_approve?",
    });
    // type/signup.rb:24/:28 `event :approve_..., :validate, on: :update,
    // trigger: :required`
    expect(byName.get("approve_with_verification")).toMatchObject({
      at: "validate",
      on: ["update"],
      trigger: "required",
    });
    expect(byName.get("approve_without_verification")).toMatchObject({
      at: "validate",
      on: ["update"],
      trigger: "required",
    });
    // type/signup.rb:36 `event :act_as_current_for_integrate_stage, :integrate, on: :create`
    expect(byName.get("act_as_current_for_integrate_stage")).toMatchObject({
      at: "integrate",
      on: ["create"],
    });
    // type/user.rb:50 `event :check_setup, before: :check_permissions,
    // on: :create, trigger: :required` (recorded at the resolved stage;
    // the before: relation rides the declaration's comment)
    expect(byName.get("check_setup")).toMatchObject({
      at: "validate",
      on: ["create"],
      trigger: "required",
    });
    // type/user.rb:59/:66 `event :setup_first_user, :finalize, on: :create,
    // when: :setup?` / `event :signin_after_setup, :integrate, ...`
    expect(byName.get("setup_first_user")).toMatchObject({
      at: "finalize",
      on: ["create"],
      when: "setup?",
    });
    expect(byName.get("signin_after_setup")).toMatchObject({
      at: "integrate",
      on: ["create"],
      when: "setup?",
    });
    // type_plus_right/role/members.rb:5 `event :update_role_cache, :finalize`
    expect(byName.get("update_role_cache")).toMatchObject({ at: "finalize" });
    // self/signin.rb:10 `event :signin, :validate, on: :update`
    expect(byName.get("signin")).toMatchObject({ at: "validate", on: ["update"] });
    // self/signin.rb:15 `event :signin_success, after: :signin`
    expect(byName.get("signin_success")).toMatchObject({ after: "signin" });
    // self/signin.rb:19 `event :signout, :validate, on: :delete`
    expect(byName.get("signout")).toMatchObject({ at: "validate", on: ["delete"] });
    // self/signin.rb:27 `event :send_reset_password_token, before: :signin,
    // on: :update, trigger: :required` (recorded at the resolved stage;
    // declared before signin so the same-stage walk order matches)
    expect(byName.get("send_reset_password_token")).toMatchObject({
      at: "validate",
      on: ["update"],
      trigger: "required",
    });
  });

  it("the loader registers the chain with set + mod coordinates injected", () => {
    loader = new ModLoader([{ manifest: cardModAccount }]);
    loader.load();
    const registry = loader.eventRegistry();
    const all = registry.all();
    for (const name of RECOUNT_30) {
      const reg = all.find((e) => e.event === name);
      expect(reg, `${name} not registered by the loader`).toBeDefined();
      expect(reg!.modName).toBe("account");
    }
    // spot-pin the coordinate injection
    const signin = registry.forEvent("signin")!;
    expect(signin.setPath).toBe("self/signin");
    expect(signin.modName).toBe("account");
  });
});

describe("the engine-owned event bodies, pinned against the Ruby sources", () => {
  // right/password.rb:30-35 + en.yml:20 `must be %{num_char} characters or
  // longer`; :37-47 + en.yml:21/:22-25. The messages are the event bodies'
  // errors.add payloads.
  it("validate_password_length/chars produce Ruby's en.yml messages", () => {
    expect(passwordErrors("aB1!")).toEqual([
      "must be 8 characters or longer",
    ]);
    expect(passwordErrors("abcdefgh")).toEqual([
      // password.rb:79-88 consolidated_password_error_message: three
      // requirements join "a, b, and c"
      "must contain an upper case letter, a special character (like !@$%&#), and a number",
    ]);
    // two requirements join "a and b" (:86-88)
    expect(passwordErrors("Abcdefg1")).toEqual([
      "must contain a special character (like !@$%&#)",
    ]);
    // the requirement order is the gem's PASSWORD_REGEX key order
    // (lower, upper, special_char, number) — "Ab1!" with nothing else is
    // clean; a 12-char string missing only lower+number joins "and"
    expect(passwordErrors("AB!@AB!@AB!@")).toEqual([
      "must contain a lower case letter and a number",
    ]);
    expect(passwordErrors("aB1!xkcd92")).toEqual([]);
  });

  // right/email.rb:29-32 (downcase) + :7-14 (strip + grammar) +
  // en.yml:8 `must be valid address`.
  it("downcase_email + validate_email reproduce normalize/grammar", () => {
    expect(normalizeEmail("  Alice@Example.COM ")).toBe("alice@example.com");
    expect(emailIsValid("alice@example.com")).toBe(true);
    expect(emailIsValid("alice@ex")).toBe(false);
    expect(emailIsValid("alice example.com")).toBe(false);
  });

  // card-1.110.0 lib/card/auth.rb:36-38 `Digest::SHA1.hexdigest
  // "#{salt}--#{password}--"` — the encrypt_password event's store-stage
  // write (right/password.rb:21-26). The reference digest is node's SHA-1
  // over the same literal string (Digest::SHA1 is the same function).
  it("encrypt_password produces Auth.encrypt's exact digest", async () => {
    expect(await encryptPassword("secret", "s@lt")).toBe(
      createHash("sha1").update("s@lt--secret--", "utf8").digest("hex"),
    );
  });
});

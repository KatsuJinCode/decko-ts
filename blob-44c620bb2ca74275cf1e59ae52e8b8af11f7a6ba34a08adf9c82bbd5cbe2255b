// Account field writes: what Ruby Decko's account events store when a
// +*account card and its fields are saved through any form or API.
//
// Ruby trail (card-mod-account-0.20.0):
// - set/right/account/events.rb:3-9: on create, the account gets a +*salt
//   field (`field(:salt).generate`) and a +*status field
//   (`accounted&.try(:default_account_status) || "active"`), at
//   :prepare_to_validate, after the fields the request itself names.
// - set/right/account.rb:8 `require_field :email`: an account cannot be
//   created without an email field.
// - set/right/salt.rb:5-7 generate: SHA1("--#{Time.zone.now}--").
// - set/right/password.rb:19-26 encrypt_password (:store, on: :save,
//   changed: :content): `self.content = Auth.encrypt content, left&.salt`,
//   Auth.encrypt (card-1.110.0 lib/card/auth.rb:36-38) =
//   SHA1("#{salt}--#{password}--").
// - set/right/password.rb:13-15 and salt.rb:9-11 `history? false`: saves of
//   these two fields record no action and no changes, and an act whose only
//   save is one of them is not stored at all.

import { createHash } from "node:crypto";
import { hashPassword, type PasswordHashPolicy } from "../auth/password-hash.js";

/** Right codenames whose saves keep no history (history? false). */
export const NO_HISTORY_RIGHT_CODENAMES: ReadonlySet<string> = new Set(["password", "salt"]);

/** Auth.encrypt (auth.rb:36-38). A missing salt is the empty string, as
 *  Ruby's string interpolation of nil. */
export function encryptPassword(password: string, salt: string | null | undefined): string {
  return createHash("sha1").update(`${salt ?? ""}--${password}--`).digest("hex");
}

/** What encrypt_password stores, under the deck's password policy: a PBKDF2
 *  hash by default, Ruby's digest (encryptPassword) in legacy-sha1 mode
 *  (docs/SECURITY.md, "Passwords"; auth/password-hash.ts). */
export function storedPasswordValue(
  password: string,
  salt: string | null | undefined,
  policy?: PasswordHashPolicy,
): Promise<string> {
  return hashPassword(password, salt ?? "", policy);
}

/** Time.zone.now.to_s under the default UTC zone: "YYYY-MM-DD HH:MM:SS UTC". */
function rubyUtcTime(now: Date): string {
  return `${now.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** +*salt generate (salt.rb:5-7). */
export function generateSalt(now: Date): string {
  return createHash("sha1").update(`--${rubyUtcTime(now)}--`).digest("hex");
}

/** validate_password_length + validate_password_chars (password.rb:28-46,
 *  card-mod-account lib/card/mod/account.rb:2-3 defaults: 8 characters,
 *  %i[lower upper special_char number]): the full messages Ruby's
 *  validation adds for a password, in its order; empty when it passes. */
export function passwordErrors(password: string): string[] {
  const errors: string[] = [];
  if ([...password].length < 8) errors.push("must be 8 characters or longer");
  const missing: string[] = [];
  if (!/[a-z]/.test(password)) missing.push("a lower case letter");
  if (!/[A-Z]/.test(password)) missing.push("an upper case letter");
  if (!/[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(password)) missing.push("a special character (like !@$%&#)");
  if (!/\d+/.test(password)) missing.push("a number");
  if (missing.length > 0) {
    const text =
      missing.length > 2 ? `${missing.slice(0, -1).join(", ")}, and ${missing[missing.length - 1]}` : missing.join(" and ");
    errors.push(`must contain ${text}`);
  }
  return errors;
}

/** The +*status an account is created with (events.rb:7-9): the account
 *  holder's default status, "active" for every holder this deck has. */
export const DEFAULT_ACCOUNT_STATUS = "active";

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

/** Right codenames whose saves keep no history (history? false). */
export const NO_HISTORY_RIGHT_CODENAMES: ReadonlySet<string> = new Set(["password", "salt"]);

/** Auth.encrypt (auth.rb:36-38). A missing salt is the empty string, as
 *  Ruby's string interpolation of nil. */
export function encryptPassword(password: string, salt: string | null | undefined): string {
  return createHash("sha1").update(`${salt ?? ""}--${password}--`).digest("hex");
}

/** Time.zone.now.to_s under the default UTC zone: "YYYY-MM-DD HH:MM:SS UTC". */
function rubyUtcTime(now: Date): string {
  return `${now.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** +*salt generate (salt.rb:5-7). */
export function generateSalt(now: Date): string {
  return createHash("sha1").update(`--${rubyUtcTime(now)}--`).digest("hex");
}

/** The +*status an account is created with (events.rb:7-9): the account
 *  holder's default status, "active" for every holder this deck has. */
export const DEFAULT_ACCOUNT_STATUS = "active";

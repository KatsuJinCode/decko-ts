// auth/account-fields.ts — the account field events a save with a
// +*account subcard runs: sign-up (a Sign up card) and any account holder
// created with its account.
//
// Ruby sources (card-mod-account-0.20.0):
//   set/right/account/events.rb:3-9   set_default_salt, set_default_status
//   set/right/email.rb                validate_email, validate_unique_email,
//                                     downcase_email
//   set/right/password.rb             validate_password_length,
//                                     validate_password_chars,
//                                     encrypt_password; history? false
//   set/right/salt.rb                 the salt: SHA1("--#{Time.zone.now}--")
//   set/type/signup.rb                default_account_status (can_approve?
//                                     "unverified" : "unapproved");
//                                     require_field :account
//   set/right/account.rb              require_field :email
//   lib/card/mod/account.rb           password length 8; requirements
//                                     lower, upper, special_char, number
//   config/locales/en.yml             the messages
//   card-1.110.0 lib/card/subcards/all.rb:76-80  subcard_error: a field's
//                                     error reaches its parent under the
//                                     field's relative name, prefixed by
//                                     the attribute unless it is :content
//
// Every check runs before anything is written: Ruby validates the whole
// subcard tree in the validate stage, so a rejected sign-up stores nothing.

import { sha1Hex } from "./signin.js";

/** password.rb PASSWORD_REGEX. */
const PASSWORD_REGEX: Record<string, RegExp> = {
  lower: /[a-z]/,
  upper: /[A-Z]/,
  special_char: /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/,
  number: /\d+/,
  letter: /[a-zA-Z]/,
};

/** Cardio.config.account_password_requirements (lib/card/mod/account.rb:3). */
const PASSWORD_REQUIREMENTS = ["lower", "upper", "special_char", "number"] as const;
/** Cardio.config.account_password_length (lib/card/mod/account.rb:2). */
const PASSWORD_LENGTH = 8;

/** en.yml account_password_requirement_* labels. */
const REQUIREMENT_LABEL: Record<string, string> = {
  lower: "a lower case letter",
  upper: "an upper case letter",
  special_char: "a special character (like !@$%&#)",
  number: "a number",
  letter: "a letter",
};

/** email.rb validate_email's address grammar (case-insensitive). */
const EMAIL_REGEX = /^([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})$/i;

/** The password field's errors, attribute :password (password.rb). */
export function passwordErrors(password: string): string[] {
  const out: string[] = [];
  if (password.length < PASSWORD_LENGTH) out.push(`must be ${PASSWORD_LENGTH} characters or longer`);
  const missing = PASSWORD_REQUIREMENTS.filter((r) => !PASSWORD_REGEX[r].test(password)).map((r) => REQUIREMENT_LABEL[r]);
  if (missing.length > 0) {
    // consolidated_password_error_message
    const text = missing.length > 2
      ? `${missing.slice(0, -1).join(", ")}, and ${missing[missing.length - 1]}`
      : missing.join(" and ");
    out.push(`must contain ${text}`);
  }
  return out;
}

/** downcase_email (prepare_to_validate) then validate_email's strip. */
export function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim();
}

export function emailIsValid(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

/** Auth.encrypt (card-1.110.0 lib/card/auth.rb:36-38). */
export function encryptPassword(password: string, salt: string): Promise<string> {
  return sha1Hex(`${salt}--${password}--`);
}

/** Time#to_s for a UTC time: "2026-10-07 22:40:57 UTC". */
function rubyUtcTime(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** salt.rb generate: SHA1("--#{Time.zone.now}--"). */
export function generateSalt(now: Date): Promise<string> {
  return sha1Hex(`--${rubyUtcTime(now)}--`);
}

/** One account field the save writes, in Ruby's row order. */
export interface AccountFieldWrite {
  /** Relative to the +*account card ("+*email"). */
  readonly key: string;
  readonly content: string;
  /** false for password and salt (history? false: no action rows). */
  readonly history: boolean;
}

export interface AccountFieldInput {
  /** The +*account subcard's own subcards, as posted. */
  readonly fields: Record<string, { content?: string | null }>;
  /** The account holder's type: Sign up cards default to unverified /
   *  unapproved, other holders to active (set_default_status). */
  readonly holderIsSignup: boolean;
  /** Sign up's can_approve?: the actor may create a card of the default
   *  accounted type (User). */
  readonly canApprove: boolean;
  /** Whether a +*email card already holds this address (live cards). */
  readonly emailTaken: (email: string) => Promise<boolean>;
  readonly now: Date;
}

export interface AccountFieldPlan {
  /** Ruby's shown errors on the account holder ("+*ACCOUNT: ..."), empty
   *  when the save may proceed. */
  readonly errors: string[];
  /** The field cards to write under +*account, in order. */
  readonly writes: AccountFieldWrite[];
  /** The status the account starts in. */
  readonly status: string;
  /** Sign up with can_approve?: request_verification sends the
   *  verification email at :integrate. */
  readonly requestVerification: boolean;
}

/** The shown form of a field error on the account holder:
 *  "+*ACCOUNT: <field> <attribute> <message>" (subcard_error twice: the
 *  field error reaches +*account under the field's relative name, then
 *  +*account's error reaches the holder under "+*account"). */
function holderError(fieldKey: string, attribute: string | null, message: string): string {
  const inner = attribute === null ? message : `${attribute} ${message}`;
  return `+*ACCOUNT: ${fieldKey} ${inner}`;
}

export async function planAccountFields(input: AccountFieldInput): Promise<AccountFieldPlan> {
  const errors: string[] = [];
  const writes: AccountFieldWrite[] = [];
  const emailRaw = input.fields["+*email"]?.content ?? undefined;
  const passwordRaw = input.fields["+*password"]?.content ?? undefined;

  // right/account.rb require_field :email (the field on the account card;
  // reaches the holder as "+*account" => "email required").
  if (emailRaw === undefined) errors.push("+*ACCOUNT: email required");

  let email: string | undefined;
  if (emailRaw !== undefined) {
    email = normalizeEmail(emailRaw);
    if (email !== "") {
      if (!emailIsValid(email)) errors.push(holderError("+*email", null, "must be valid address"));
      else if (await input.emailTaken(email)) errors.push(holderError("+*email", null, "must be unique"));
    }
  }
  if (passwordRaw !== undefined) {
    for (const m of passwordErrors(passwordRaw)) errors.push(holderError("+*password", "password", m));
  }

  const status = input.holderIsSignup ? (input.canApprove ? "unverified" : "unapproved") : "active";
  if (errors.length > 0) return { errors, writes, status, requestVerification: false };

  const salt = await generateSalt(input.now);
  if (email !== undefined) writes.push({ key: "+*email", content: email, history: true });
  if (passwordRaw !== undefined) {
    writes.push({ key: "+*password", content: await encryptPassword(passwordRaw, salt), history: false });
  }
  writes.push({ key: "+*salt", content: salt, history: false });
  writes.push({ key: "+*status", content: status, history: true });
  return { errors, writes, status, requestVerification: input.holderIsSignup && input.canApprove };
}

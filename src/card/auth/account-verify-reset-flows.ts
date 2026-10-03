// The member account email-token flows: password reset + account
// verification/activation. The port of the card-mod-account event ladder
// that Ruby Decko builds on its Auth::Token runtime — the FLOW the token
// runtime (src/card/auth/token.ts, lane-tokenseam) and the SMTP transport
// (src/card/notify, lane-proton-mail) exist to serve.
//
// RUBY TRUTH — the whole flow, event by event (all citations are the
// installed card-mod gems):
//
//   REQUEST (a member who forgot their password):
//     event :send_reset_password_token, before: :signin, on: :update,
//           trigger: :required            set/self/signin.rb:27-31
//       blank email  -> error_on :email, :error_blank        (:86-90)
//       account_for(email)&.active?  -> send_reset_password_email
//                                     as_bot             (:78-84, :92-94)
//       known but inactive -> error_on :account, :error_not_active
//       unknown email      -> error_on :email, :error_not_recognized
//                                                          (:96-102)
//     find_account_by_email: strip + downcase, exact content match on the
//     +*account+*email child                 auth/current.rb:74-77, :84-92
//
//   THE EMAIL:
//     account.send_password_reset_email — the triggered integrate event
//     `event :send_password_reset_email, :integrate, trigger: :required`
//     (right/account/events.rb:32-36) -> send_account_email
//     "password_reset_email" (right/account.rb:37-44): renders the
//     EmailTemplate card (codename password_reset_email) with the +account
//     card as context and delivers to the +email content.
//     Template bytes (card-mod-account data/real.yml, extracted with the
//     real YAML parser — the en-dash and the odd "\n  \n" runs are the
//     seed's exact bytes):
//       from:    "Decko Bot"
//       subject: "reset password for {{:title|core}}"
//       text:    "** Password reset for {{:title|core}} **\n\nSomeone –
//                you, we hope – asked to reset your password.  Please
//                follow this link...\n\n  {{_|reset_password_url}}\n  \n
//                ...to update your account details.\n\n\n(Link will remain
//                valid for {{_|reset_password_days}} days.)\n\n"
//       html:    the <div style="text-align:center"> block below.
//     Nest substitution: {{:title|core}} is the *title card's content (the
//     site title — the codename-colon nest against the setting card whose
//     content IS the title); {{_|reset_password_url}} renders the +account
//     card's :reset_password_url view with THIS request's context card
//     ("_" = the context card, card-mod-content contextual_content);
//     {{_|reset_password_days}} is the :reset_password_days view
//     (deprecated alias of :token_days = "2", railtie.rb:12).
//
//   THE LINK (right/account/views.rb:34-38 token_url):
//     card_url path(action: :update, card: { trigger: trigger },
//                   token: Auth::Token.encode(accounted_id, extra))
//     Card::Path action_base (card-mod-format lib/card/path.rb:42-45):
//     mark present -> "#{action}/#{mark}" = "update/<url_key>"; the query
//     is Rails Hash#to_param over {card: {...}, token: ...} in insertion
//     order — VERIFIED against the installed activesupport-7.2.3.2:
//     `{"card"=>{"trigger"=>"reset_password"}, "token"=>jwt}.to_param`
//     renders "card%5Btrigger%5D=reset_password&token=<jwt>" (brackets
//     percent-encoded, the JWT's base64url alphabet passes through
//     untouched). card_url prefixes Env.origin + relative_url_root
//     (card-1.110.0 lib/card/env/location.rb:19-24). The token payload:
//     {user_id:, exp:} (+ {anonymous: true} for verify links only,
//     views.rb:2-4).
//
//   CONFIRM (the member clicks the link — a GET to /update/<mark>):
//     Ruby routes GET /update/:mark through the explicit GET alternative
//     (decko-0.20.0 config/engine_routes.rb "get (card)/update(/:mark)")
//     into card#update (lib/card_controller/rest.rb:15-17), and the
//     controller's authenticator runs FIRST (rest.rb:37-47):
//     Auth.signin_with(token: ...) -> signin_with_token
//     (card-1.110.0 lib/card/auth/token.rb:38-41): decode + RAISE
//     PermissionDenied on a bad token (token.rb:20), else bind the session
//     to user_id (or Anonymous for the verify link's anonymous flag).
//     THEN the trigger event runs on the +account card:
//     event :reset_password, :prepare_to_validate, on: :update,
//           trigger: :required               right/account/events.rb:15-17
//       verifying_token :reset_password_success, :reset_password_failure
//       (:64-73): Auth::Token.decode; a String result OR a user_id that is
//       not this card's accounted_id -> failure; else success.
//       success (:100-104): Auth.signin accounted_id; success << {id:
//       name, view: :edit}; abort :success — NO card save, the only state
//       change is the session; the browser redirects to the +account edit
//       form where the new password is typed.
//       failure (:106-109): Auth.as_bot re-send the reset email; errors
//       t(:account_sorry_email_reset, error_msg) — "Sorry, %{error_msg}.
//       Please check your email for a new password reset link."
//       (config/locales/en.yml:39-40). NOTE the asymmetry: an UNPARSEABLE
//       token never reaches the event (the authenticator already raised),
//       so the resend only fires for a well-formed token naming a
//       DIFFERENT account — the mismatch case.
//
//   SET THE NEW PASSWORD (the +account edit form submit):
//     the +*password child saves through right/password.rb's events:
//       validate_password_present (:45-48): blank content aborts SUCCESS —
//       an empty password field is a silent no-op.
//       validate_password_length (:28-34): content.length >=
//       Cardio.config.account_password_length (8, lib/card/mod/account.rb)
//       else "must be %{num_char} characters or longer" (en.yml:20).
//       validate_password_chars (:36-49): the config'd requirement list
//       (%i[lower upper special_char number], lib/card/mod/account.rb)
//       against PASSWORD_REGEX (:1-9); the consolidated message is
//       "must contain X", "X and Y", "X, Y, and Z" (:92-99) over the
//       per-type strings (en.yml:22-25).
//       encrypt_password (:19-26, :store): content =
//       Auth.encrypt(content, left&.salt) — Digest::SHA1.hexdigest
//       "#{salt}--#{password}--" (auth.rb:36-39). THE SALT IS NOT
//       REGENERATED: the account's existing +*salt content is read
//       (`left&.salt`; the commented-out "need a valid salt" error and the
//       "a lot of existing accounts without a salt" note are the gem's own
//       words). Salt generation happens only at account creation
//       (set_default_salt, right/account/events.rb:3-5).
//
//   VERIFY + ACTIVATE (the signup arm of the same machinery):
//     event :verify_and_activate, :prepare_to_validate, on: :update,
//           trigger: :required             right/account/events.rb:19-24
//       activatable (:57-62): "no field manipulation mid-activation" —
//       the request carries no subcards (the port's confirm API is
//       subcard-free by construction, so this guard is structural here).
//       success (:87-92): Auth.signin accounted_id; Auth.as_bot
//       activate_account (:40-43): status -> "active" +
//       trigger_event! :send_welcome_email; success << "" (redirect to the
//       card). failure (:94-98): re-send the verification email; errors
//       "Sorry, #{error_message}. Please check your email for a new
//       activation link." (the literal string at events.rb:96-97 — the
//       reset arm uses the en.yml key instead).
//     welcome email template: the seed card is name/type/codename ONLY —
//     real.yml carries NO field seeds for welcome_email, so the delivered
//     message is empty-subject/empty-body against the stock deck.
//
//   SESSION SEMANTICS (are old sessions invalidated?):
//     NO. Ruby invalidates nothing on a password reset. A reset link click
//     binds the CURRENT session to the account (Auth.signin); every OTHER
//     session stays valid (Ruby keeps one server-side session hash per
//     browser and has no per-account session registry). The port matches:
//     confirmPasswordReset issues a session for the holder and touches no
//     other auth_sessions row. Pinned by the flow tests.
//
// DEPENDENCY SHAPE: the same injected-context pattern as signin.ts — no
// process globals, no hidden singletons; the host (staging server, worker)
// wires driver + SessionStore + transport + token secret + origin.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import type { Actor } from "./actor.js";
import { actorBot } from "./actor.js";
import { SessionStore, type SessionCreation } from "./session-store.js";
import {
  decodeAuthToken,
  encodeAuthToken,
  claimUserId,
  type TokenClaims,
  type TokenRuntimeConfig,
} from "./token.js";
import {
  resolveAccountCodenameIds,
  rubyStrip,
  encryptAccountPassword,
  type AccountCodenameIds,
} from "./signin.js";
import { CardActionEngine } from "../actions/card-action-engine.js";
import type { FetchEngine } from "../fetch.js";
import type { MailMessage, NotifyTransport } from "../notify/types.js";
import { DeckoName } from "../name.js";

// ---------------------------------------------------------------------------
// the context
// ---------------------------------------------------------------------------

/** Everything the flows run against — the host's wiring, per boot. */
export interface AccountFlowContext {
  readonly driver: SQLDatabaseDriver;
  /** Card write engine input — the activation status write (verify
   *  success, events.rb:89-90) runs a CardActionEngine under the bot
   *  actor over this fetcher. */
  readonly fetcher: FetchEngine;
  readonly sessions: SessionStore;
  /** Where rendered messages go. Tests use CaptureTransport; production
   *  wires the SMTP transport. No default here: a caller that forgets the
   *  transport must not silently drop member mail. */
  readonly transport: NotifyTransport;
  /** The Auth::Token signing config (token.rb:7's secret_key_base + the
   *  railtie expiry). The SAME secret the links are later verified under —
   *  rotating it invalidates outstanding links. */
  readonly token: TokenRuntimeConfig;
  /** Card::Env.origin (location.rb:19-24 card_url's absolute base):
   *  "scheme://host[:port]", no trailing slash. */
  readonly origin: string;
  /** Cardio.config.relative_url_root — card_path's prefix
   *  (location.rb:8-13). Default "" (the stock deck serves at root). */
  readonly relativeUrlRoot?: string;
  /** The {{:title|core}} render — the *title card's content. Resolved by
   *  the caller: the setting-card core walk is the render engine's
   *  surface, and the value for the plain case IS the *title card's
   *  db_content (verified: corpus *title row content is the deck title
   *  string). */
  readonly siteTitle: string;
}

// ---------------------------------------------------------------------------
// en.yml strings + template bytes (verbatim)
// ---------------------------------------------------------------------------

/** card-mod-account config/locales/en.yml — the failure strings the flow
 *  ladders emit. The error_on ladder (signin.rb:97-102) prefixes the
 *  attribute in Rails' form machinery ("email not recognized"); the port
 *  returns the bare i18n message and lets the HTTP layer shape the
 *  envelope (the signin.ts precedent). */
const ACCOUNT_EN = {
  error_blank: "can't be blank", // en.yml:7 account_error_blank
  error_not_active: "Sorry, that account is not active.", // en.yml:9
  error_not_recognized: "not recognized", // en.yml:10
  sorry_email_reset:
    "Sorry, %{error_msg}. Please check your email for a new password reset link.", // en.yml:39-40
  password_length: "must be %{num_char} characters or longer", // en.yml:20
  password_requirements: "must contain %{char_type}", // en.yml:21
  pw_upper: "an upper case letter", // en.yml:22
  pw_lower: "a lower case letter", // en.yml:23
  pw_special_char: "a special character (like !@$%&#)", // en.yml:24
  pw_number: "a number", // en.yml:25
} as const;

/** The verify arm's failure message is a LITERAL in the event body
 *  (events.rb:96-97), not an en.yml key. */
const VERIFY_FAILURE_MESSAGE =
  "Sorry, %{error_msg}. Please check your email for a new activation link.";

/** Cardio::Railtie password policy defaults
 *  (card-mod-account lib/card/mod/account.rb — account_password_length 8,
 *  account_password_requirements %i[lower upper special_char number]). */
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = ["lower", "upper", "special_char", "number"] as const;

/** right/password.rb:1-9 PASSWORD_REGEX, in the gem's own order. */
const PASSWORD_REGEX: Record<(typeof PASSWORD_REQUIREMENTS)[number], RegExp> = {
  lower: /[a-z]/,
  upper: /[A-Z]/,
  special_char: /[!"#$%&'()*+,-./:;<=>?@[\]\\^_`{|}~]/,
  number: /\d+/,
};

/** The email template bytes — card-mod-account data/real.yml, extracted
 *  with the real YAML parser (2026-09-29). Substitution is EXACT-TOKEN:
 *  only the three nest shapes these seeds carry are replaced, never a
 *  general {{...}} walk (general nest processing is the render engine's
 *  surface; a template a deck customizes with other nests renders its
 *  unknown tokens literally here — the honest boundary). */
const RESET_EMAIL_TEMPLATE = {
  codename: "password_reset_email",
  from: "Decko Bot",
  subject: "reset password for {{:title|core}}",
  text:
    "** Password reset for {{:title|core}} **\n\n" +
    "Someone – you, we hope – asked to reset your password.  Please follow this link...\n\n" +
    "  {{_|reset_password_url}}\n" +
    "  \n" +
    "...to update your account details.\n\n\n" +
    "(Link will remain valid for {{_|reset_password_days}} days.)\n\n",
  html:
    '<div style="text-align:center">\n' +
    " <h1>Password reset for {{:title|core}}</h1>\n" +
    "  \n" +
    "  <p>Someone – you, we hope – asked to reset your password.</p>\n" +
    "  \n" +
    '  <p>Please <a href="{{_|reset_password_url}}">follow this link</a> to update your account details.</p>\n' +
    "  \n" +
    "  <p><em>Link will remain valid for {{_|reset_password_days}} days.</em></p>\n" +
    "</div>\n\n",
} as const;

const VERIFY_EMAIL_TEMPLATE = {
  codename: "verification_email",
  from: "Decko Bot",
  subject: "verification link for {{:title|core}}",
  text:
    "Thank you for signing up with {{:title|core}}!\n\n" +
    "Please follow the link below to verify this email address and activate your account.\n\n" +
    "{{_|verify_url}}\n" +
    "(Link will remain valid for {{_|verify_days}} days.)\n",
  html:
    '<div style="text-align:center">\n' +
    "  <h1>Thank you for signing up with {{:title|core}}!</h1>\n" +
    "  <p>\n" +
    '    Please <a href="{{_|verify_url}}">follow this link</a>\n' +
    "    to verify this email address and activate your account.\n" +
    "  </p>\n" +
    "  <p><em>Link will remain valid for {{_|verify_days}} days.</em></p>\n" +
    "</div>",
} as const;

/** The welcome email seed (real.yml) carries name/type/codename and NO
 *  fields — subject/body/from are empty against the stock deck (real
 *  decks customize the card). The html member is present-but-empty so the
 *  template union stays uniform. */
const WELCOME_EMAIL_TEMPLATE = {
  codename: "welcome_email",
  from: "",
  subject: "",
  text: "",
  html: "",
} as const;

/** One template render: the three nest tokens the account seeds carry. */
function renderAccountTemplate(
  template: { subject: string; text: string; html?: string },
  vars: { siteTitle: string; url: string; days: string },
): { subject: string; text: string; html?: string } {
  const daysToken = /\{\{_\|(?:reset_password_days|verify_days)\}\}/g;
  const sub = (s: string): string =>
    s
      .replace(/\{\{:title\|core\}\}/g, vars.siteTitle)
      .replace(/\{\{_\|(?:reset_password_url|verify_url)\}\}/g, vars.url)
      .replace(daysToken, vars.days);
  return {
    subject: sub(template.subject),
    text: sub(template.text),
    ...(template.html !== undefined ? { html: sub(template.html) } : {}),
  };
}

// ---------------------------------------------------------------------------
// the account rows the flows read
// ---------------------------------------------------------------------------

/** One +*account junction with its holder + field children resolved —
 *  the shape every step of the flow reads. */
export interface AccountRecord {
  /** The +*account junction card id. */
  readonly id: number;
  /** The accounted card (right/account.rb:24-26 accounted = left). */
  readonly holder: Actor;
  /** The junction card's name ("jane doe+*account"). */
  readonly name: string;
  readonly email: string | undefined;
  readonly passwordDigest: string | undefined;
  readonly salt: string | undefined;
  readonly status: string | undefined;
  /** The +*account field child card ids (the password write target). */
  readonly childIds: {
    readonly email: number | undefined;
    readonly password: number | undefined;
    readonly salt: number | undefined;
    readonly status: number | undefined;
  };
}

async function loadAccountByJunctionId(
  driver: SQLDatabaseDriver,
  ids: AccountCodenameIds,
  junctionId: number,
): Promise<AccountRecord | undefined> {
  const head = await driver.query<{
    id: number;
    left_id: number;
    junction_name: string;
    holder_name: string | null;
  }>(
    `SELECT a.id, a.left_id, a.name AS junction_name, h.name AS holder_name
     FROM cards a JOIN cards h ON h.id = a.left_id
     WHERE a.id = ? AND a.trash = 0 LIMIT 1`,
    [junctionId],
  );
  const row = head.rows[0];
  if (row === undefined || row.junction_name === null || row.holder_name === null) {
    return undefined;
  }
  return loadAccountChildren(driver, ids, {
    id: row.id,
    leftId: row.left_id,
    name: row.junction_name,
    holderName: row.holder_name,
  });
}

async function loadAccountChildren(
  driver: SQLDatabaseDriver,
  ids: AccountCodenameIds,
  head: { id: number; leftId: number; name: string; holderName: string },
): Promise<AccountRecord> {
  const fields = await driver.query<{
    right_id: number;
    id: number;
    db_content: string | null;
  }>(
    `SELECT right_id, id, db_content FROM cards
     WHERE left_id = ? AND right_id IN (?, ?, ?, ?) AND trash = 0`,
    [head.id, ids.email, ids.password, ids.salt, ids.status],
  );
  const byRight = new Map<number, { id: number; content: string | undefined }>();
  for (const f of fields.rows) {
    byRight.set(f.right_id, { id: f.id, content: f.db_content ?? "" });
  }
  const pick = (field: "email" | "password" | "salt" | "status") => {
    const hit = byRight.get(ids[field]);
    return hit === undefined
      ? { content: undefined, id: undefined }
      : { content: hit.content, id: hit.id };
  };
  const email = pick("email");
  const password = pick("password");
  const salt = pick("salt");
  const status = pick("status");
  return {
    id: head.id,
    holder: { id: head.leftId, name: head.holderName },
    name: head.name,
    email: email.content,
    passwordDigest: password.content,
    salt: salt.content,
    status: status.content,
    childIds: {
      email: email.id,
      password: password.id,
      salt: salt.id,
      status: status.id,
    },
  };
}

/** find_account_by_email (auth/current.rb:74-92): strip + downcase, then
 *  the exact-content match on the +*email child of a +*account junction —
 *  the same SQL shape signin.ts's findJunctionByEmail walks. */
async function findAccountByEmail(
  driver: SQLDatabaseDriver,
  ids: AccountCodenameIds,
  rawEmail: string,
): Promise<AccountRecord | undefined> {
  const email = rubyStrip(rawEmail).toLowerCase();
  const result = await driver.query<{ id: number }>(
    `SELECT a.id FROM cards a
     JOIN cards e ON e.left_id = a.id AND e.right_id = ? AND e.trash = 0
     WHERE a.right_id = ? AND a.trash = 0 AND e.db_content = ?
     ORDER BY a.id LIMIT 1`,
    [ids.email, ids.account, email],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  return loadAccountByJunctionId(driver, ids, row.id);
}

// ---------------------------------------------------------------------------
// the token link (views.rb:34-38 token_url)
// ---------------------------------------------------------------------------

/** The URL mark: the +account card's url_key (path.rb:63-68 interpret_mark
 *  -> name.url_key). */
function urlKeyOf(accountName: string): string {
  return DeckoName.parse(accountName).urlKey;
}

/** Rails Hash#to_param over the path query — byte form verified against
 *  the installed activesupport-7.2.3.2: keys percent-encoded with CGI
 *  escaping (brackets -> %5B %5D), insertion order preserved, the JWT's
 *  base64url alphabet untouched. */
function toParamQuery(card: Record<string, string>, token: string): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(card)) {
    pairs.push(`${cgiEscape(`card[${key}]`)}=${cgiEscape(value)}`);
  }
  pairs.push(`token=${cgiEscape(token)}`);
  return pairs.join("&");
}

/** CGI.escape's reserved set: everything except a-zA-Z0-9*-._ becomes
 *  %XX (space becomes +). The JWT alphabet (A-Za-z0-9-_ plus the . join)
 *  passes through unchanged — verified alongside to_param above. */
function cgiEscape(value: string): string {
  let out = "";
  for (const ch of value) {
    if (/[A-Za-z0-9\*\-._]/.test(ch)) {
      out += ch;
    } else if (ch === " ") {
      out += "+";
    } else {
      const bytes = new TextEncoder().encode(ch);
      for (const b of bytes) out += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

/**
 * views.rb:34-38 token_url — the absolute reset/verify link:
 * `{origin}{root}/update/{urlKey}?card%5Btrigger%5D={trigger}&token={jwt}`.
 * Exported for the async-render seam: the +account :reset_password_url /
 * :verify_url VIEW bodies are exactly this function's output, but a
 * ViewFn is synchronous while HMAC is not (the boundary the account mod's
 * NOT-PORTED block names), so the views cannot call it until the async
 * view lane lands. The FLOW does not have that constraint.
 */
export async function buildAccountTokenUrl(
  ctx: AccountFlowContext,
  accountName: string,
  trigger: "reset_password" | "verify_and_activate",
  extraPayload: Record<string, unknown> = {},
): Promise<{ url: string; token: string }> {
  const userId = await holderIdForAccountName(ctx.driver, accountName);
  if (userId === undefined) {
    throw new Error(`buildAccountTokenUrl: no such account card: ${accountName}`);
  }
  return buildAccountTokenUrlForHolder(ctx, {
    accountName,
    holderId: userId,
    trigger,
    extraPayload,
  });
}

async function buildAccountTokenUrlForHolder(
  ctx: AccountFlowContext,
  parts: {
    accountName: string;
    holderId: number;
    trigger: "reset_password" | "verify_and_activate";
    extraPayload: Record<string, unknown>;
  },
): Promise<{ url: string; token: string }> {
  const token = await encodeAuthToken(ctx.token, parts.holderId, parts.extraPayload);
  const root = ctx.relativeUrlRoot ?? "";
  const url =
    `${ctx.origin}${root}/update/${urlKeyOf(parts.accountName)}` +
    `?${toParamQuery({ trigger: parts.trigger }, token)}`;
  return { url, token };
}

async function holderIdForAccountName(
  driver: SQLDatabaseDriver,
  accountName: string,
): Promise<number | undefined> {
  const key = DeckoName.parse(accountName).key;
  // key OR name: the compound-card key convention varies by corpus builder
  // (the engine-standard cards.key is populated for junctions; some
  // fixtures leave compound rows' keys NULL with the name authoritative).
  const result = await driver.query<{ left_id: number }>(
    `SELECT left_id FROM cards
     WHERE trash = 0 AND (key = ? OR name = ?) ORDER BY id LIMIT 1`,
    [key, accountName],
  );
  return result.rows[0]?.left_id;
}

// ---------------------------------------------------------------------------
// REQUEST: send_reset_password_token (signin.rb:27-31 + helpers)
// ---------------------------------------------------------------------------

export type ResetRequestOutcome =
  | { ok: true; sentTo: string; token: string; resetUrl: string }
  | {
      ok: false;
      reason: "blank_email" | "not_recognized" | "not_active";
      /** The en.yml message (bare — the attribute envelope is Rails form
       *  machinery, module header). */
      message: string;
    };

/**
 * Port of the request arm: the send_reset_password_token event ladder
 * (signin.rb:27-31, :78-102) plus the reset-email delivery it triggers
 * (send_password_reset_email -> send_account_email "password_reset_email",
 * right/account.rb:37-44 + events.rb:32-36).
 *
 * Unknown and inactive accounts FAIL with Ruby's exact strings and send
 * nothing. The delivered message's envelope + bytes are asserted by the
 * flow tests (envelope + token link bytes).
 */
export async function sendResetPasswordToken(
  ctx: AccountFlowContext,
  rawEmail: string,
): Promise<ResetRequestOutcome> {
  // blank_email? (signin.rb:86-90): the RAW field content's presence.
  if (rubyStrip(rawEmail) === "") {
    return { ok: false, reason: "blank_email", message: ACCOUNT_EN.error_blank };
  }
  const ids = await resolveAccountCodenameIds(ctx.driver);
  if (ids === null) {
    return {
      ok: false,
      reason: "not_recognized",
      message: ACCOUNT_EN.error_not_recognized,
    };
  }
  const account = await findAccountByEmail(ctx.driver, ids, rawEmail);
  // send_reset_password_email_or_fail (signin.rb:78-84): found AND active
  // -> send; known but inactive -> :error_not_active; unknown ->
  // :error_not_recognized (signin.rb:96-102).
  if (account !== undefined && account.status !== "active") {
    return { ok: false, reason: "not_active", message: ACCOUNT_EN.error_not_active };
  }
  if (account === undefined) {
    return { ok: false, reason: "not_recognized", message: ACCOUNT_EN.error_not_recognized };
  }
  if (account.email === undefined) {
    // The email child matched the search, so this is unreachable through
    // findAccountByEmail; kept as the honest guard.
    return { ok: false, reason: "not_recognized", message: ACCOUNT_EN.error_not_recognized };
  }
  const { url, token } = await buildAccountTokenUrlForHolder(ctx, {
    accountName: account.name,
    holderId: account.holder.id,
    trigger: "reset_password",
    extraPayload: {},
  });
  const mail = renderAccountEmail(ctx, RESET_EMAIL_TEMPLATE, { url });
  await ctx.transport.sendMail({ ...mail, to: account.email });
  return { ok: true, sentTo: account.email, token, resetUrl: url };
}

// ---------------------------------------------------------------------------
// SIGNUP CREATE: send_verification_email
// (right/account/events.rb:32-35 + set/type/signup.rb:31-33, :48-52)
// ---------------------------------------------------------------------------

export type VerificationSendOutcome =
  | { ok: true; sentTo: string; token: string; verifyUrl: string }
  | { ok: false; reason: "account_not_found" | "no_email"; message: string };

/**
 * The signup create's verification-email delivery. Ruby: the signup form's
 * create runs `auto_approve_with_verification` (mod/account
 * set/type/signup.rb:31-33, on: :create, when: :can_approve?) whose
 * `request_verification` (:48-52) writes +*status "unverified" and fires
 * `trigger_event! :send_verification_email` — one arm of the generic
 * account-template delivery
 * `event :"send_#{email}", :integrate, trigger: :required do
 * send_account_email email end` (right/account/events.rb:32-35).
 *
 * The port takes the account mark (the holder card's name): the signup
 * create has just written the +*account subtree this lookup reads. The
 * delivery is the same machinery sendResetPasswordToken uses — the
 * verification_email template (card-mod-account data/real.yml) + the
 * verify_and_activate token link the confirm arm
 * (confirmAccountVerification, events.rb:19-24) verifies. Called from the
 * signup feature port (tests/card/gherkin/) at the exact point Ruby's
 * trigger fires: after the unverified status write.
 */
export async function sendAccountVerificationToken(
  ctx: AccountFlowContext,
  accountMark: string,
): Promise<VerificationSendOutcome> {
  const ids = await resolveAccountCodenameIds(ctx.driver);
  if (ids === null) {
    return { ok: false, reason: "account_not_found", message: "no account system in this deck" };
  }
  const account = await accountForMark(ctx.driver, ids, accountMark);
  if (account === undefined || account.holder.id === undefined) {
    return { ok: false, reason: "account_not_found", message: `no such card: ${accountMark}` };
  }
  if (account.email === undefined || account.email === "") {
    return { ok: false, reason: "no_email", message: `account ${accountMark} has no +*email content` };
  }
  const { url, token } = await buildAccountTokenUrlForHolder(ctx, {
    accountName: account.name,
    holderId: account.holder.id,
    trigger: "verify_and_activate",
    extraPayload: {},
  });
  const mail = renderAccountEmail(ctx, VERIFY_EMAIL_TEMPLATE, { url });
  await ctx.transport.sendMail({ ...mail, to: account.email });
  return { ok: true, sentTo: account.email, token, verifyUrl: url };
}

/** Deliver one account template — send_account_email's render+deliver
 *  (right/account.rb:37-44): context = the +account card, to = its +email
 *  content. The From: is the template's own field ("Decko Bot" in both
 *  seeded arms; the welcome seed carries none and delivers with the empty
 *  default, module header). */
function renderAccountEmail(
  ctx: AccountFlowContext,
  template: typeof RESET_EMAIL_TEMPLATE | typeof VERIFY_EMAIL_TEMPLATE | typeof WELCOME_EMAIL_TEMPLATE,
  vars: { url?: string },
): Omit<MailMessage, "to"> {
  const days = String(DEFAULT_TOKEN_DAYS);
  const rendered = renderAccountTemplate(
    { subject: template.subject, text: template.text, html: template.html },
    { siteTitle: ctx.siteTitle, url: vars.url ?? "", days },
  );
  return {
    from: template.from,
    subject: rendered.subject,
    textBody: rendered.text,
    ...(rendered.html !== undefined && rendered.html.length > 0 ? { htmlBody: rendered.html } : {}),
    tags: { trigger: "account_email", template: template.codename },
  };
}

/** views.rb:14-16 token_days — DEFAULT_TOKEN_EXPIRY_SECONDS / 86400. */
const DEFAULT_TOKEN_DAYS = 2;

// ---------------------------------------------------------------------------
// CONFIRM: the authenticator + the reset_password event
// ---------------------------------------------------------------------------

export type PasswordResetConfirmation =
  | {
      ok: true;
      holder: Actor;
      /** The +*account junction id. */
      accountId: number;
      /** The issued session (Auth.signin, current.rb:35-41 — the port's
       *  session binding). NO other session is touched: Ruby invalidates
       *  nothing on a password reset (module header). */
      session: SessionCreation;
      /** success << {id: name, view: :edit} (events.rb:102) — the +account
       *  edit form the browser lands on to type the new password. */
      redirectTo: { name: string; view: "edit" };
    }
  | { ok: false; kind: "token_invalid"; message: string }
  | { ok: false; kind: "account_not_found"; message: string }
  | {
      ok: false;
      kind: "token_account_mismatch";
      message: string;
      /** The failure event re-sends the reset email (events.rb:106-109). */
      resent: true;
    };

/**
 * Port of the confirm arm: the rest.rb authenticator (signin_with_token,
 * token.rb:38-41) followed by the reset_password event
 * (events.rb:15-17, :64-73, :100-109).
 *
 * Order is load-bearing: a token that does not DECODE fails at the
 * authenticator with PermissionDenied semantics and the failure event's
 * re-send NEVER RUNS (Ruby raises before the event); only a well-formed
 * token naming a different account reaches the mismatch branch, which
 * re-sends the reset email to THAT card's address and reports the
 * account_sorry_email_reset message with Ruby's Hash#to_s of the decoded
 * claims as %{error_msg}.
 */
export async function confirmPasswordReset(
  ctx: AccountFlowContext,
  accountMark: string,
  token: string | undefined | null,
): Promise<PasswordResetConfirmation> {
  // authenticator first (rest.rb:37-47 -> token.rb:18-23 validate!
  // raises with decode's message).
  const claims = await decodeAuthToken(ctx.token, token);
  if (typeof claims === "string") {
    return { ok: false, kind: "token_invalid", message: claims };
  }
  const ids = await resolveAccountCodenameIds(ctx.driver);
  if (ids === null) {
    return { ok: false, kind: "account_not_found", message: "no account system in this deck" };
  }
  const account = await accountForMark(ctx.driver, ids, accountMark);
  if (account === undefined) {
    // load_card raised NotFound for an unknown mark (rest.rb load_card).
    return {
      ok: false,
      kind: "account_not_found",
      message: `no such card: ${accountMark}`,
    };
  }
  // verifying_token (events.rb:64-73): String result OR user_id mismatch
  // -> failure callback with the RESULT ITSELF as the error message.
  const tokenUserId = claimUserId(claims);
  if (tokenUserId === undefined || String(tokenUserId) !== String(account.holder.id)) {
    const errorMsg = rubyValueToString(claims);
    await sendResetEmailAsBot(ctx, account);
    return {
      ok: false,
      kind: "token_account_mismatch",
      message: ACCOUNT_EN.sorry_email_reset.replace("%{error_msg}", errorMsg),
      resent: true,
    };
  }
  // reset_password_success (events.rb:100-104): Auth.signin accounted_id;
  // success << {id: name, view: :edit}; abort :success — no card write.
  const session = await ctx.sessions.createSession(account.holder.id);
  return {
    ok: true,
    holder: account.holder,
    accountId: account.id,
    session,
    redirectTo: { name: account.name, view: "edit" },
  };
}

/** reset_password_failure's re-send (events.rb:106-107) runs
 *  Auth.as_bot — the mail itself has no permission gate here; the bot
 *  framing is Ruby's (the URL view's perms are what as_bot satisfied). */
async function sendResetEmailAsBot(
  ctx: AccountFlowContext,
  account: AccountRecord,
): Promise<void> {
  if (account.email === undefined) return;
  const { url } = await buildAccountTokenUrlForHolder(ctx, {
    accountName: account.name,
    holderId: account.holder.id,
    trigger: "reset_password",
    extraPayload: {},
  });
  const mail = renderAccountEmail(ctx, RESET_EMAIL_TEMPLATE, { url });
  await ctx.transport.sendMail({ ...mail, to: account.email });
}

/** Resolve the +account card by URL mark (the link's path segment —
 *  markToName semantics: "_" -> " ", percent-decoded). key OR name for
 *  the same convention reason as holderIdForAccountName. */
async function accountForMark(
  driver: SQLDatabaseDriver,
  ids: AccountCodenameIds,
  mark: string,
): Promise<AccountRecord | undefined> {
  const name = mark.replace(/_/g, " ");
  const key = DeckoName.parse(name).key;
  const result = await driver.query<{ id: number }>(
    `SELECT id FROM cards
     WHERE trash = 0 AND (key = ? OR name = ?) ORDER BY id LIMIT 1`,
    [key, name],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  return loadAccountByJunctionId(driver, ids, row.id);
}

/** Ruby Hash#to_s = inspect: `{"user_id"=>583, "exp"=>1234, ...}` — the
 *  failure event interpolates the DECODED RESULT into the i18n message
 *  (events.rb:70 passes `result`, which for a decoded hash is the
 *  HashWithIndifferentAccess). Insertion order; strings quoted; numbers
 *  bare; true/false/null Ruby spellings. */
function rubyValueToString(claims: TokenClaims): string {
  const inner = Object.entries(claims)
    .map(([key, value]) => {
      let rendered: string;
      if (typeof value === "string") rendered = `"${value}"`;
      else if (value === true) rendered = "true";
      else if (value === false) rendered = "false";
      else if (value === null) rendered = "nil";
      else rendered = String(value);
      return `"${key}"=>${rendered}`;
    })
    .join(", ");
  return `{${inner}}`;
}

// ---------------------------------------------------------------------------
// CONFIRM: verify_and_activate (events.rb:19-24, :40-43, :57-98)
// ---------------------------------------------------------------------------

export type VerificationConfirmation =
  | {
      ok: true;
      holder: Actor;
      accountId: number;
      session: SessionCreation;
      /** activate_account ran: +*status content is now "active". */
      activated: boolean;
      /** trigger_event! :send_welcome_email ran (events.rb:42). */
      welcomeSent: boolean;
      /** success << "" (events.rb:91) — the redirect target is the card
       *  itself. */
      redirectTo: { name: string; view: undefined };
    }
  | { ok: false; kind: "token_invalid"; message: string }
  | { ok: false; kind: "account_not_found"; message: string }
  | {
      ok: false;
      kind: "token_account_mismatch";
      message: string;
      resent: true;
    };

/**
 * Port of the signup arm: verify_and_activate (events.rb:19-24) with the
 * SAME authenticator-first order as confirmPasswordReset. The verify
 * link carries {anonymous: true} (views.rb:2-4) — the authenticator
 * binds Anonymous, and it is the EVENT that signs the holder in
 * (verify_and_activate_success, events.rb:87-92), so activation always
 * runs for a well-formed matching token regardless of the anonymous flag.
 *
 * Success: signin; Auth.as_bot activate_account — +*status -> "active"
 * (events.rb:40-43) through the write engine under the DeckoBot actor —
 * then the welcome email; NO other card write (activatable's "no field
 * manipulation mid-activation" guard, events.rb:57-62, is structural: the
 * confirm API carries no subcards).
 *
 * Failure: re-send the verification email (events.rb:95) with the
 * events.rb:96-97 literal message.
 */
export async function confirmAccountVerification(
  ctx: AccountFlowContext,
  accountMark: string,
  token: string | undefined | null,
): Promise<VerificationConfirmation> {
  const claims = await decodeAuthToken(ctx.token, token);
  if (typeof claims === "string") {
    return { ok: false, kind: "token_invalid", message: claims };
  }
  const ids = await resolveAccountCodenameIds(ctx.driver);
  if (ids === null) {
    return { ok: false, kind: "account_not_found", message: "no account system in this deck" };
  }
  const account = await accountForMark(ctx.driver, ids, accountMark);
  if (account === undefined) {
    return {
      ok: false,
      kind: "account_not_found",
      message: `no such card: ${accountMark}`,
    };
  }
  const tokenUserId = claimUserId(claims);
  if (tokenUserId === undefined || String(tokenUserId) !== String(account.holder.id)) {
    // verify_and_activate_failure (events.rb:94-98): send_verification_email
    // + the literal message with the result string as %{error_msg}.
    if (account.email !== undefined) {
      const { url } = await buildAccountTokenUrlForHolder(ctx, {
        accountName: account.name,
        holderId: account.holder.id,
        trigger: "verify_and_activate",
        extraPayload: { anonymous: true },
      });
      const mail = renderAccountEmail(ctx, VERIFY_EMAIL_TEMPLATE, { url });
      await ctx.transport.sendMail({ ...mail, to: account.email });
    }
    return {
      ok: false,
      kind: "token_account_mismatch",
      message: VERIFY_FAILURE_MESSAGE.replace("%{error_msg}", rubyValueToString(claims)),
      resent: true,
    };
  }
  // verify_and_activate_success (events.rb:87-92): Auth.signin;
  // Auth.as_bot { activate_account }; success << "".
  const bot = await actorBot(ctx.driver);
  const session = await ctx.sessions.createSession(account.holder.id);
  let activated = false;
  if (account.childIds.status !== undefined) {
    const engine = new CardActionEngine(ctx.fetcher, { actor: bot });
    await engine.updateCard({ cardId: account.childIds.status, content: "active" });
    activated = true;
  }
  // trigger_event! :send_welcome_email (events.rb:42) — the seed template
  // carries no fields (module header), so the message is the empty one.
  if (account.email !== undefined) {
    const mail = renderAccountEmail(ctx, WELCOME_EMAIL_TEMPLATE, {});
    await ctx.transport.sendMail({ ...mail, to: account.email });
  }
  return {
    ok: true,
    holder: account.holder,
    accountId: account.id,
    session,
    activated,
    welcomeSent: account.email !== undefined,
    redirectTo: { name: account.name, view: undefined },
  };
}

// ---------------------------------------------------------------------------
// SET THE NEW PASSWORD (right/password.rb events)
// ---------------------------------------------------------------------------

export type PasswordWrite =
  | { ok: true; noOp: boolean; passwordCardId?: number; digest?: string }
  | { ok: false; reason: "password_too_short" | "password_missing_char_types"; message: string }
  | { ok: false; reason: "account_not_found" | "no_password_card" | "write_failed"; message: string };

/**
 * The +account edit form submit: the +*password child's save through
 * right/password.rb's validate/store events (citations in the module
 * header). The write target is the +*account+*password child card; the
 * digest replaces the content exactly as encrypt_password would
 * (`Auth.encrypt content, left&.salt` — the EXISTING salt, never
 * regenerated).
 *
 * Runs under `actor` (the signed-in member after a successful confirm;
 * Ruby's own_account? permission path). Validation failure returns the
 * consolidated en.yml messages WITHOUT writing.
 */
export async function applyNewAccountPassword(
  deps: { driver: SQLDatabaseDriver; fetcher: FetchEngine; actor: Actor },
  accountMark: string,
  newPassword: string,
): Promise<PasswordWrite> {
  // validate_password_present (right/password.rb:45-48): blank aborts
  // SUCCESS — a silent no-op (Ruby's blank? covers whitespace-only).
  if (rubyStrip(newPassword) === "") {
    return { ok: true, noOp: true };
  }
  // validate_password_length (:28-34).
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      reason: "password_too_short",
      message: ACCOUNT_EN.password_length.replace("%{num_char}", String(PASSWORD_MIN_LENGTH)),
    };
  }
  // validate_password_chars (:36-49 + :92-99): the config'd requirement
  // list in order, consolidated "X, Y, and Z" / "X and Y" / "X".
  const missing = PASSWORD_REQUIREMENTS.filter((type) =>
    PASSWORD_REGEX[type].test(newPassword) ? false : true,
  ).map((type) => {
    switch (type) {
      case "lower": return ACCOUNT_EN.pw_lower;
      case "upper": return ACCOUNT_EN.pw_upper;
      case "special_char": return ACCOUNT_EN.pw_special_char;
      case "number": return ACCOUNT_EN.pw_number;
    }
  });
  if (missing.length > 0) {
    const consolidated =
      missing.length > 2
        ? `${missing.slice(0, -1).join(", ")}, and ${missing[missing.length - 1]}`
        : missing.join(" and ");
    return {
      ok: false,
      reason: "password_missing_char_types",
      message: ACCOUNT_EN.password_requirements.replace("%{char_type}", consolidated),
    };
  }

  const ids = await resolveAccountCodenameIds(deps.driver);
  if (ids === null) {
    return { ok: false, reason: "account_not_found", message: "no account system in this deck" };
  }
  const account = await accountForMark(deps.driver, ids, accountMark);
  if (account === undefined) {
    return {
      ok: false,
      reason: "account_not_found",
      message: `no such card: ${accountMark}`,
    };
  }
  if (account.childIds.password === undefined) {
    return {
      ok: false,
      reason: "no_password_card",
      message: `no +*password card under ${account.name}`,
    };
  }
  // encrypt_password (:19-26): content = Auth.encrypt(content, left&.salt)
  // — the account's EXISTING salt ("" when absent, the nil-interpolation
  // parity signin.ts documents).
  const digest = await encryptAccountPassword(newPassword, account.salt ?? "");
  // THE PERMISSION OVERRIDE (set/abstract/account_field.rb:15-17, "allow
  // account owner to update account field content"): ok_to_update? =
  // own_account? && !name_changed? && !type_id_changed?. The engine's
  // write-task verdict walk (card-action-engine.ts assertCanWrite) has not
  // ported that override, so the flow applies it at its own boundary with
  // the override's EXACT condition: when the actor IS the accounted holder
  // (this API carries no name/type change, so the other two conjuncts are
  // structural), the write runs under the DeckoBot actor (as_bot, the
  // proxy.rb:26-29 machinery actor.ts ports). Any OTHER actor's write goes
  // through its own rule verdict unmodified.
  const ownAccount = deps.actor.id === account.holder.id;
  const writeActor = ownAccount ? await actorBot(deps.driver) : deps.actor;
  const engine = new CardActionEngine(deps.fetcher, { actor: writeActor });
  try {
    await engine.updateCard({ cardId: account.childIds.password, content: digest });
  } catch (error) {
    return {
      ok: false,
      reason: "write_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return { ok: true, noOp: false, passwordCardId: account.childIds.password, digest };
}

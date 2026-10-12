// The first-run journey: the deck-owner census that opens Ruby's setup
// window, and the create-owner-account flow that closes it.
//
// ---------------------------------------------------------------------------
// WHAT IS RUBY HERE (read before changing anything)
// ---------------------------------------------------------------------------
//
// Ruby DOES have a first-run setup. It is not invented product surface, and
// the port follows it exactly where Ruby has an opinion:
//
//   card-mod-account-0.20.0/set/type/user.rb
//     :8   delegate :needs_setup?, to: Card::Auth
//     :10  view :setup, unknown: true, perms: :needs_setup?, cache: :never
//     :20-29  setup_form = frame_and_form :create over
//             [setup_hidden_fields, _render_name_formgroup,
//              account_formgroups, setup_form_buttons]
//     :39-47  setup_hidden_fields = hidden_tags(
//               card: { type_id: Card.default_accounted_type_id,
//                       trigger: %w[check_setup] },
//               success: { redirect: true, mark: path(mark: "") })
//     :50-57  event :check_setup, before: :check_permissions, on: :create,
//             trigger: :required
//               abort :failure unless Auth.needs_setup?
//               Auth.as_bot
//               @setup_approved = true
//     :59-64  event :setup_first_user, :finalize, on: :create, when: :setup?
//     :66-68  event :signin_after_setup, :integrate, on: :create, when: :setup?
//               Auth.signin id
//
//   The load-bearing line is user.rb:51. The gate is an EVENT on the create,
//   running BEFORE :check_permissions — not a view permission. A deck with an
//   account cannot be setup-created a second time even by crafting the form
//   post directly. This module keeps that shape: the census runs inside the
//   create, not only at the surface that renders the form.
//
//   THE CENSUS — card-1.110.0/lib/card/auth/setup.rb
//     :9-15   needs_setup?  (memoized per process; the NEEDS_SETUP cache is a
//             performance memo, not a lock — see the CACHE note below)
//     :33-37  needs_setup_if_no_accounts = user_account_count.zero?
//     :43-46  user_account_cql = { right: :account,
//                                  creator_id: ["ne", Card::DeckoBotID] }
//             with the gem's own comment at :44 — "every deck starts with two
//             accounts: DeckoBot and Anonymous"
//     :48-52  user_account_count = as_bot { Card.count_by_cql cql }
//
//   Two SQL facts the port must match, both read from source:
//
//   (a) TRASH. count_by_cql (query/card_class.rb:11-15) merges return:"count"
//       into an ordinary search, and every ordinary search appends
//       `trash is false` (query/sql_statement/where.rb:66, :72, :75-77).
//       So the census counts NON-TRASHED +*account junctions only; a trashed
//       account does not re-open the window.
//
//   (b) creator_id NULL. `["ne", id]` compiles to `creator_id != id`. In SQL a
//       NULL creator_id makes that comparison NULL, not true, so the row is
//       EXCLUDED. The port therefore emits a bare `creator_id <> ?` and
//       deliberately does NOT add `OR creator_id IS NULL` — that would count
//       rows Ruby does not count and would open the window on a deck Ruby
//       keeps closed.
//
//   Card::DeckoBotID is NOT a numeric gem constant. It is generated at boot
//   from a CODENAME: `Card.const_get_or_set("DeckoBotID") { id }`
//   (codename.rb:108) over the card whose codename is "decko_bot". The port
//   resolves it the same way the rest of the auth layer already does
//   (actor.ts:9-21, :97-99 `actorBot`).
//
// ---------------------------------------------------------------------------
// THE ACCOUNT CARD SHAPE the owner create must produce
// ---------------------------------------------------------------------------
//
//   *account  (codename "account")     the type_plus_right the junction uses
//   *email    (codename "email")       card-mod-account data/real.yml:121-122
//   *password (codename "password")    real.yml:132-133
//   *salt     (codename "salt")        real.yml:143-144
//   *status   (codename "status")      real.yml:150-151
//
//   per user, the rows signin.ts already reads:
//     <User card>
//       └─ <User>+*account                    left = the User card
//          │                                    right = the *account card
//          │                                    (right/account.rb:20-26
//          │                                     accounted = left)
//          ├─ ...+*account+*email    content = the address
//          ├─ ...+*account+*password content = Card::Auth.encrypt digest
//          ├─ ...+*account+*salt     content = the generated salt
//          └─ ...+*account+*status   content = "active"
//
//   right/account.rb:3-6 `card_accessor :email/:password/:salt/:status` are
//   accessors over exactly those four children — the port never invents a
//   column or a field outside this set.
//
// ---------------------------------------------------------------------------
// THE CREATE-TIME FIELD EVENTS reproduced here, in Ruby's order
// ---------------------------------------------------------------------------
//
//   set/right/account/events.rb:3-5   set_default_salt  (:prepare_to_validate,
//     on :create) -> field(:salt).generate ->
//     set/right/salt.rb:5-7  content = Digest::SHA1.hexdigest "--#{Time.zone.now}--"
//
//   set/right/account/events.rb:7-9   set_default_status ->
//     content = accounted&.try(:default_account_status) || "active".
//     default_account_status is defined on the SIGNUP type
//     (set/type/signup.rb:8-10), NOT on User — and the setup path creates a
//     User-typed card (user.rb:42 `type_id: Card.default_accounted_type_id`,
//     and set/all/account.rb:3-5 `default_accounted_type_id` = UserID). So
//     the try() returns nil and the "active" arm is the one that runs. The
//     owner is born signable, which is what the journey needs: without it
//     signin.ts:268-269 would reject the very account setup just created.
//
//   set/right/email.rb:29-33  downcase_email  (:prepare_to_validate)
//   set/right/email.rb:7-14   validate_email  (:validate) — content.strip,
//     then /^([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})$/i
//   set/right/email.rb:16-27  validate_unique_email (after :validate_email) —
//     { right_id: EmailID, eq: content, return: :id }
//   set/right/password.rb:19-26 encrypt_password (:store) —
//     content = Auth.encrypt(content, left&.salt)
//   set/right/password.rb:28-34 validate_password_length (>= 8)
//   set/right/password.rb:36-49 validate_password_chars over
//     %i[lower upper special_char number], PASSWORD_REGEX at
//     set/right/password.rb:1-9
//
//   Messages are card-mod-account config/locales/en.yml verbatim:
//     :7  account_error_blank               "can't be blank"
//     :8  account_error_invalid_address     "must be valid address"
//     :11 account_error_not_unique          "must be unique"
//     :20 account_password_length           "must be %{num_char} characters or longer"
//     :21 account_password_requirements     "must contain %{char_type}"
//     :22 an upper case letter  :23 a lower case letter
//     :24 a special character (like !@$%&#)   :25 a number
//
//   PASSWORD CRYPTO: no new scheme. This calls signin.ts's own
//   encryptAccountPassword (signin.ts:87-89) —
//   `sha1Hex(`${salt}--${password}--`)` — which is the port of
//   `Digest::SHA1.hexdigest "#{salt}--#{password}--"` (auth.rb:36-39). The
//   salt the owner is given is the same SHA-1-hex shape Ruby's
//   right/salt.rb:6 produces, and the password is digested against THAT salt,
//   the way encrypt_password digests against `left&.salt`.
//
// ---------------------------------------------------------------------------
// WHAT IS NEW, NOT RUBY (stated plainly)
// ---------------------------------------------------------------------------
//
//   1. The /setup HTTP ROUTE and its HTML form. Ruby renders the setup form
//      on the *user card itself (user.rb:10, `view :setup`). The port's card
//      views are byte-parity surface and must not gain a view, so the form is
//      a separate surface mounted only when the env gate is on. See
//      src/server/first-run-routes.ts.
//
//   2. The env gates (DECKO_FIRST_RUN, and the deploy-profile preset). Ruby
//      has no env gate: needs_setup? is purely the census. The port's census
//      is the same, but the port ALSO requires an explicit opt-in, because the
//      port must not add a route to a deployment that never asked for one.
//
//   3. The owner card NAME is derived from the email's local part. Ruby's
//      setup_form includes a _render_name_formgroup (user.rb:24) — a real name
//      field the human types. The port's minimal form is email + password
//      only, so the name is derived; see ownerCardNameFor.
//
//   4. Six engine creates where Ruby posts one form with subcards. The
//      engine's CreateCardInput (src/card/actions/types.ts:99-123) has no
//      subcards member, so the subtree is built as six CardActionEngine
//      creates. The resulting CARD ROWS are the same shape; the card_acts
//      count differs from Ruby's single act. Disclosed, not hidden.
//
//   5. The census counts SHIPPED-account holders rather than Ruby's literal
//      creator_id arm. The full mechanism is on countUserAccounts; the short
//      form is that Ruby splits authority (as_id = the bot) from authorship
//      (current_id = the submitting browser) and this engine has one actor for
//      both, so the literal CQL would never see the owner this flow creates.
//
//   6. The census is NOT memoized. Ruby's needs_setup? memoizes per process
//      and writes a Card.cache NEEDS_SETUP marker (setup.rb:10-14, :35). A
//      memo in a long-lived server would be a correctness bug here, because
//      this route's whole contract is that the window CLOSES on the first
//      owner and never re-opens. Each check counts. The count is one indexed
//      SELECT. Re-counting makes the window close for any LATER create; it
//      does NOT make the check and the create one atomic step — two creates
//      that start in the same tick both read zero and both write an owner.
//      The boundary is stated and measured in src/server/first-run-routes.ts
//      and pinned by the "concurrency boundary" cases in
//      tests/card/auth/first-run-setup.test.ts.
//
// ---------------------------------------------------------------------------
// DEPLOY-PROFILE ENV CONTRACT (the demo preset; the README documents it
// and is deliberately left unedited)
// ---------------------------------------------------------------------------
//
//   DECKO_FIRST_RUN=1
//       Arms the /setup surface. Unset or anything else = the route does not
//       exist and every request to it falls through to the host's own 404.
//       THE DEMO PROFILE SETS THIS.
//
//   DECKO_WRITE_PATH=1
//       Pre-existing gate (src/server/write-routes.ts:190-192). The owner
//       create runs through the same CardActionEngine the write path runs, so
//       a deployment that leaves the write path off still cannot create
//       through it. The first-run surface checks this and reports it rather
//       than half-working. THE DEMO PROFILE SETS THIS.
//
//   Both, together, are the "fresh demo" profile:
//
//         DECKO_WRITE_PATH=1 DECKO_FIRST_RUN=1
//
//   What the profile does NOT do (UPDATED, the account scope pass — this note's original
//   text read "it does not seed an account system … the engine has no
//   mod-seeding capability to create them", which is no longer true): the
//   engine now HAS the boot-seed capability — src/card/auth/boot-seed.ts
//   (bootstrapFreshDeck), the port of cardio/seed.rb + card:eat ruled IN by
//   OPERATOR-SCOPE-RULINGS-2026-10-05.md §R-3 — and the staging server's
//   boot wires it right after its schema-init step, for an EMPTY deck under
//   this same profile. What is still true: THIS module performs no seeding.
//   The census stays honest about a deck the boot seed never ran on: a deck
//   without card-mod-account's *account / *email / *password / *salt /
//   *status cards cannot have an owner account, and the
//   account_system_absent reason reports exactly that.

import type { SQLDatabaseDriver } from "../../server/driver.js";
import { storedPasswordValue } from "../actions/account-fields.js";
import type { FetchEngine } from "../fetch.js";
import { CardActionEngine } from "../actions/card-action-engine.js";
import { CardActionError } from "../actions/types.js";
import { DeckoName } from "../name.js";
import { actorAnonymous, actorBot } from "./actor.js";
import {
  resolveAccountCodenameIds,
  rubyStrip,
  sha1Hex,
  type AccountCodenameIds,
} from "./signin.js";
import type { Actor } from "./actor.js";

// ---------------------------------------------------------------------------
// the env gate
// ---------------------------------------------------------------------------

/**
 * Whether this deployment has opted into the first-run journey.
 *
 * NEW, not Ruby: Ruby gates the setup view purely on `perms: :needs_setup?`
 * (user.rb:10) and the create purely on the census (user.rb:51) — there is no
 * env switch in the gem. The port adds one because adding a route to a
 * deployment that never asked for one is a parity violation, and because a
 * census-only gate is indistinguishable from "this deck is broken" on a deck
 * whose account system was never seeded.
 *
 * Read from the environment on every call (never cached at module load): a
 * host that sets it after import still gets the armed surface, and a test can
 * flip it per case without module-reload machinery.
 */
export function firstRunEnabled(): boolean {
  return process.env.DECKO_FIRST_RUN === "1";
}

// ---------------------------------------------------------------------------
// the census
// ---------------------------------------------------------------------------

/**
 * The system actors whose accounts a deck ships with, by codename.
 *
 * auth/setup.rb:44 names them in the gem's own comment — "every deck starts
 * with two accounts: DeckoBot and Anonymous".
 */
export const SHIPPED_ACCOUNT_CODENAMES = ["decko_bot", "anonymous"] as const;

/**
 * count_by_cql on Ruby's user_account_cql
 * (auth/setup.rb:43-52) — with ONE documented deviation, below.
 *
 * WHAT RUBY COUNTS. `user_account_cql` is
 * `{ right: :account, creator_id: ["ne", Card::DeckoBotID] }`, and the gem's
 * comment at :44 says why: "every deck starts with two accounts: DeckoBot and
 * Anonymous". The creator_id arm is a PROXY for "the two seeded rows" —
 * cardio/seed.rb:106-108 stamps every seeded card with
 * `author_id = Card::DeckoBotID`, so on a real deck the two shipped accounts
 * are exactly the bot-created ones and the proxy is exact.
 *
 * THE DEVIATION, and why it is load-bearing. In Ruby the proxy stays exact for
 * the SETUP-created owner too, because Ruby's `Auth.as_bot` splits authority
 * from authorship:
 *
 *   * card-mod-account set/type/user.rb:52 calls `Auth.as_bot` with NO block,
 *     inside the `:check_setup` event. card-1.110.0/lib/card/auth/proxy.rb:6-24
 *     is the method: it sets `@as_id` (the AUTHORITY) and, at :14, sets
 *     `@current_id` ONLY `if @current_id.nil?` — which it never is on an
 *     inbound request, because current.rb:7-9 already defaulted it to
 *     Card::AnonymousID.
 *   * So the authority is the bot and the AUTHORSHIP is the submitting
 *     browser (Anonymous — nobody can be signed in on a deck that has no
 *     accounts yet, which is the only state setup is reachable in).
 *   * `set_stamper` (card-mod-account set/all/account.rb:20-22) then writes
 *     `updater_id = Auth.current_id; creator_id = updater_id if new_card?` —
 *     the Anonymous id, NOT the bot's. The census therefore counts the
 *     freshly created owner and the window closes.
 *
 * THIS PORT HAS NO SUCH SPLIT. CardActionEngine takes ONE actor
 * (`card-action-engine.ts:346`) and `actingIdForWrite` (:2260-2268) uses it
 * for BOTH the permission walk and the creator_id stamp. A create run as the
 * bot is therefore stamped with the bot's id — indistinguishable from a seeded
 * row — and the literal CQL would report zero forever, leaving the setup
 * window permanently open. That is not a paraphrase difference; it is the
 * window never closing.
 *
 * So this counts what the gem MEANT, which its own comment states in full:
 * a `+*account` junction whose HOLDER is not one of the two system actors.
 * On a real Ruby deck the two rules agree on every pre-existing row, because
 * the shipped accounts are the bot-created ones. They diverge only on a row
 * this port created, where the divergence is the bug above.
 *
 * `trash = 0` is unchanged and is not a deviation: every search carries
 * `trash is false` (query/sql_statement/where.rb:66, :72, :75-77).
 */
export async function countUserAccounts(
  driver: SQLDatabaseDriver,
  ids: AccountCodenameIds,
  shippedAccountHolderIds: readonly number[],
): Promise<number> {
  // Built from a fixed literal, never user input, so the placeholders are
  // known at construction time. An empty shipped set still yields valid SQL
  // (`NOT (0 = 0)`), which is the honest count-everything answer for a deck
  // that somehow resolved no system actors.
  const excluded = shippedAccountHolderIds.join(", ");
  const result = await driver.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM cards
     WHERE right_id = ? AND trash = 0 AND NOT (left_id IN (${excluded}))`,
    [ids.account],
  );
  return Number(result.rows[0]?.n ?? 0);
}

/** Why the setup window is or is not open — the one value every caller acts
 *  on, so the route's decision and the create's decision can never disagree
 *  about the reason. */
export type SetupWindowReason =
  /** The env gate is off. The route does not exist. */
  | "disabled"
  /** The write path is off (write-routes.ts:190-192), so the create could
   *  not run through the machinery it is specified to use. */
  | "write_path_disabled"
  /** The deck carries none of card-mod-account's codename cards. Reported,
   *  not worked around — see the module header. */
  | "account_system_absent"
  /** The deck cannot even name its bot (no decko_bot codename card), so the
   *  census has no DeckoBot to exclude and cannot be computed. */
  | "bot_card_absent"
  /** The window is open: zero non-bot accounts. */
  | "needs_setup"
  /** The window is closed and never re-opens. */
  | "setup_complete";

export interface SetupWindowState {
  /** Ruby's needs_setup? verdict, or the reason it could not be computed. */
  readonly reason: SetupWindowReason;
  /** TRUE only when the form may be rendered AND a create may be attempted. */
  readonly open: boolean;
  /** The census count; undefined when the census could not run. */
  readonly accountCount: number | undefined;
  /** TRUE when DECKO_WRITE_PATH=1. */
  readonly writePathEnabled: boolean;
}

export interface SetupWindowDeps {
  readonly driver: SQLDatabaseDriver;
}

/**
 * The gate. Every check the route and the create make, in one place.
 *
 * Order is load-bearing and mirrors the deploy contract:
 *   1. the env gate — an un-armed deployment must not spend a query;
 *   2. the write-path gate — a browse-only deployment must not render a form
 *      whose submit cannot work;
 *   3. the account system — a deck with no *account codename has no accounts
 *      to count and no shape to create into;
 *   4. the census.
 *
 * Ruby checks only (4) — (1) and (2) are the port's additions and are
 * documented as such in the module header.
 */
export async function setupWindowState(
  deps: SetupWindowDeps,
): Promise<SetupWindowState> {
  const writePath = process.env.DECKO_WRITE_PATH === "1";
  if (!firstRunEnabled()) return { reason: "disabled", open: false, accountCount: undefined, writePathEnabled: writePath };
  if (!writePath) {
    return { reason: "write_path_disabled", open: false, accountCount: undefined, writePathEnabled: false };
  }
  const ids = await resolveAccountCodenameIds(deps.driver);
  if (ids === null) {
    return { reason: "account_system_absent", open: false, accountCount: undefined, writePathEnabled: true };
  }
  // The two shipped accounts, resolved the way the whole auth layer resolves
  // a system actor — by codename (actor.ts:9-21). A deck missing the bot
  // cannot compute the census; a deck missing Anonymous is one whose account
  // system is half-seeded, and counting its rows as user accounts is the
  // conservative (window-closed) answer.
  const bot = await actorBot(deps.driver).catch(() => undefined);
  if (bot === undefined) {
    return { reason: "bot_card_absent", open: false, accountCount: undefined, writePathEnabled: true };
  }
  const shippedHolderIds: number[] = [bot.id];
  const anon = await actorAnonymous(deps.driver).catch(() => undefined);
  if (anon !== undefined) shippedHolderIds.push(anon.id);
  const count = await countUserAccounts(deps.driver, ids, shippedHolderIds);
  return {
    reason: count === 0 ? "needs_setup" : "setup_complete",
    open: count === 0,
    accountCount: count,
    writePathEnabled: true,
  };
}

// ---------------------------------------------------------------------------
// validation (the four Ruby create-time ladders, as pure checks)
// ---------------------------------------------------------------------------

/** set/right/email.rb:11 — the validity regex, verbatim. */
const EMAIL_RE = /^([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})$/i;

/** Cardio::Railtie password policy defaults (card-mod-account
 *  lib/card/mod/account.rb — account_password_length 8,
 *  account_password_requirements %i[lower upper special_char number]),
 *  as recorded in account-verify-reset-flows.ts:224-236 which ports
 *  right/password.rb's own validation ladder. Reused verbatim; the ladder is
 *  not restated here. */
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = ["lower", "upper", "special_char", "number"] as const;
/** right/password.rb:1-9 PASSWORD_REGEX, the gem's own order. */
const PASSWORD_REGEX: Record<(typeof PASSWORD_REQUIREMENTS)[number], RegExp> = {
  lower: /[a-z]/,
  upper: /[A-Z]/,
  special_char: /[!"#$%&'()*+,-./:;<=>?@[\]\\^_`{|}~]/,
  number: /\d+/,
};

/** en.yml verbatim, in the subset this flow can emit. */
const ACCOUNT_EN = {
  error_blank: "can't be blank", // en.yml:7
  error_invalid_address: "must be valid address", // en.yml:8
  error_not_unique: "must be unique", // en.yml:11
  password_length: "must be %{num_char} characters or longer", // en.yml:20
  password_requirements: "must contain %{char_type}", // en.yml:21
  pw_upper: "an upper case letter", // en.yml:22
  pw_lower: "a lower case letter", // en.yml:23
  pw_special_char: "a special character (like !@$%&#)", // en.yml:24
  pw_number: "a number", // en.yml:25
} as const;

export type OwnerInputFailureReason =
  | "email_blank"
  | "email_invalid"
  | "email_taken"
  | "password_blank"
  | "password_too_short"
  | "password_missing_char_types";

export interface OwnerInputFailure {
  readonly ok: false;
  readonly reason: OwnerInputFailureReason;
  /** The en.yml message, already substituted. */
  readonly message: string;
  /** The field the message belongs to, for the form's re-render. */
  readonly field: "email" | "password";
}

/** The password half of the ladder (right/password.rb:28-49) — exported so the
 *  route's form can show the SAME message the create will refuse with,
 *  without duplicating the rules. */
export function checkNewAccountPassword(
  password: string,
): { ok: true } | OwnerInputFailure {
  // validate_password_present (right/password.rb:45-48): a blank password is
  // a silent no-op in Ruby, which on a CREATE means no +*password child at
  // all and therefore an account that can never be signed into. The port
  // refuses instead of creating one — the honest behavior for a journey whose
  // whole point is that the new owner can then sign in.
  if (password === "") {
    return { ok: false, reason: "password_blank", message: ACCOUNT_EN.error_blank, field: "password" };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      reason: "password_too_short",
      message: ACCOUNT_EN.password_length.replace("%{num_char}", String(PASSWORD_MIN_LENGTH)),
      field: "password",
    };
  }
  // right/password.rb:36-49 + :92-99 — the config'd requirement list in
  // order, consolidated "X, Y, and Z" / "X and Y" / "X".
  const missing = PASSWORD_REQUIREMENTS.filter((t) => !PASSWORD_REGEX[t].test(password)).map(
    (t) => {
      switch (t) {
        case "lower": return ACCOUNT_EN.pw_lower;
        case "upper": return ACCOUNT_EN.pw_upper;
        case "special_char": return ACCOUNT_EN.pw_special_char;
        case "number": return ACCOUNT_EN.pw_number;
      }
    },
  );
  if (missing.length > 0) {
    const consolidated =
      missing.length > 2
        ? `${missing.slice(0, -1).join(", ")}, and ${missing[missing.length - 1]}`
        : missing.join(" and ");
    return {
      ok: false,
      reason: "password_missing_char_types",
      message: ACCOUNT_EN.password_requirements.replace("%{char_type}", consolidated),
      field: "password",
    };
  }
  return { ok: true };
}

/** The email half: downcase_email (email.rb:29-33) then validate_email
 *  (email.rb:7-14). Returns the NORMALIZED address — Ruby's events mutate
 *  content in place, so the stored value is the downcased, stripped one. */
export function normalizeNewAccountEmail(
  rawEmail: string,
): { ok: true; email: string } | OwnerInputFailure {
  // downcase_email runs at :prepare_to_validate, BEFORE validate_email at
  // :validate, so the regex sees the downcased string.
  const email = rubyStrip(rawEmail).toLowerCase();
  if (email === "") {
    return { ok: false, reason: "email_blank", message: ACCOUNT_EN.error_blank, field: "email" };
  }
  if (!EMAIL_RE.test(email)) {
    return {
      ok: false,
      reason: "email_invalid",
      message: ACCOUNT_EN.error_invalid_address,
      field: "email",
    };
  }
  return { ok: true, email };
}

// ---------------------------------------------------------------------------
// the owner card name
// ---------------------------------------------------------------------------

/** Ruby String#gsub's replacement is a backreference-unescaped literal; this
 *  is a plain character filter, matching intent not syntax. */
const NAME_ILLEGAL = /[^A-Za-z0-9 ]/g;

/** The longest trunk the engine will accept. name-validation.ts:31 caps the
 *  WHOLE name; the trunk is the part this function controls, so it is capped
 *  to leave room for the "+*account+*password" suffix that will be appended
 *  under it. */
const MAX_TRUNK = 60;

/**
 * NEW, not Ruby — the derived owner card name.
 *
 * Ruby's setup_form asks for a name (user.rb:24 `_render_name_formgroup`);
 * the form here is email + password only, so the User card's name is
 * derived from the address's local part: downcased, non-alphanumerics
 * collapsed to single spaces, trimmed, truncated, and de-duplicated with a
 * numeric suffix against the live deck (the engine's own
 * assertNameAvailable would otherwise raise a 422 name-illegal that the
 * human cannot act on).
 *
 * A local part that is entirely punctuation yields the empty string, which
 * the engine rejects (name-validation.ts:34-36); that falls back to the
 * deck's own convention for a nameless account rather than inventing one.
 */
export async function ownerCardNameFor(
  fetcher: FetchEngine,
  email: string,
): Promise<string> {
  const local = email.slice(0, email.lastIndexOf("@"));
  const cleaned = local
    .toLowerCase()
    .replace(NAME_ILLEGAL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TRUNK)
    .trim();
  const base = cleaned === "" ? "owner" : cleaned;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base} ${attempt + 1}`;
    const taken = await fetcher.driver.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM cards WHERE key = ? AND trash = 0",
      [candidate.toLowerCase().replace(/ /g, "_")],
    );
    if (Number(taken.rows[0]?.n ?? 0) === 0) return candidate;
  }
  throw new CardActionError(
    "name-illegal",
    `could not derive an unused owner card name from ${base}`,
  );
}

// ---------------------------------------------------------------------------
// the create
// ---------------------------------------------------------------------------

export type OwnerCreateFailureReason =
  | SetupWindowReason
  | OwnerInputFailureReason
  | "write_failed";

export interface OwnerCreateSuccess {
  readonly ok: true;
  /** The created User card — the actor a later sign-in binds. */
  readonly owner: Actor;
  /** The +*account junction id (diagnostics; signin.ts reads it the same). */
  readonly accountId: number;
  /** The normalized (downcased, stripped) address stored on +*account+*email. */
  readonly email: string;
  /** The generated salt, stored on +*account+*salt. */
  readonly salt: string;
  /** Card ids of the four field children, in creation order. */
  readonly fieldCardIds: {
    readonly email: number;
    readonly salt: number;
    readonly status: number;
    readonly password: number;
  };
  /** Where the journey sends the human next. The port redirects to the
   *  sign-in surface rather than auto-signing-in; see the SIGN-IN note in the
   *  route module. */
  readonly signInAt: string;
}

export interface OwnerCreateFailure {
  readonly ok: false;
  readonly reason: OwnerCreateFailureReason;
  readonly message: string;
  /** Present when the failure is an input failure (the form re-renders with
   *  the message against its field). */
  readonly field?: "email" | "password";
}

export type OwnerCreateOutcome = OwnerCreateSuccess | OwnerCreateFailure;

export interface CreateOwnerDeps extends SetupWindowDeps {
  readonly fetcher: FetchEngine;
  /** Injected so the generated salt is deterministic under test. Defaults to
   *  the wall clock, matching Time.zone.now in right/salt.rb:6. */
  readonly now?: () => Date;
}

/**
 * The owner create: Ruby's setup form submit, as one function.
 *
 * Steps, in the order the events fire:
 *   0. the gate (setupWindowState) — Ruby's user.rb:51 `abort :failure
 *      unless Auth.needs_setup?` runs BEFORE :check_permissions, so it runs
 *      here before any engine write;
 *   1. normalize + validate the email (downcase_email, validate_email);
 *   2. validate uniqueness (validate_unique_email);
 *   3. validate the password (validate_password_length, validate_password_chars);
 *   4. derive the salt (set_default_salt -> right/salt.rb:6);
 *   5. create the subtree through the CardActionEngine under the DeckoBot
 *      actor (Auth.as_bot, user.rb:52).
 *
 * The engine call is the SAME machinery the write path uses — the port of
 * :191-198's "action layer for new-account
 * creation", which that document names as the missing half of setup.feature.
 */
export async function createOwnerAccount(
  deps: CreateOwnerDeps,
  input: {
    email: string;
    password: string;
    /** The setup form's card[name] field (user.rb:14 — the setup view
     *  renders _render_name_formgroup, so the create carries the
     *  submitted name). Omitted = the email-derived name
     *  ownerCardNameFor computes, the prior behavior. */
    cardName?: string;
  },
): Promise<OwnerCreateOutcome> {
  // (0) the gate
  const window = await setupWindowState(deps);
  if (!window.open) {
    return { ok: false, reason: window.reason, message: SETUP_CLOSED_MESSAGE[window.reason] };
  }

  // (1) email
  const normalized = normalizeNewAccountEmail(input.email);
  if (!normalized.ok) return normalized;
  const email = normalized.email;

  // (3) password — checked before any write so a rejected form writes nothing.
  const passwordCheck = checkNewAccountPassword(input.password);
  if (!passwordCheck.ok) return passwordCheck;

  const ids = await resolveAccountCodenameIds(deps.driver);
  /* c8 ignore next 3 -- setupWindowState already proved the codenames resolve
     (it returned open:true), so a null here is unreachable; the guard keeps
     the non-null contract explicit for the type checker. */
  if (ids === null) {
    return { ok: false, reason: "account_system_absent", message: SETUP_CLOSED_MESSAGE.account_system_absent };
  }
  const bot = await actorBot(deps.driver);

  // (2) validate_unique_email (right/email.rb:16-27): the CQL is
  // `{ right_id: EmailID, eq: content, return: :id }` — a content match on any
  // live +*email child, excluding the card being saved (there is none: this is
  // a create). Ruby's `Card.search` carries the same default
  // `trash is false` (where.rb:75-77).
  const duplicate = await deps.driver.query<{ id: number }>(
    `SELECT id FROM cards
     WHERE right_id = ? AND db_content = ? AND trash = 0
     ORDER BY id LIMIT 1`,
    [ids.email, email],
  );
  if (duplicate.rows[0] !== undefined) {
    return {
      ok: false,
      reason: "email_taken",
      message: ACCOUNT_EN.error_not_unique,
      field: "email",
    };
  }

  // (4) set_default_salt -> right/salt.rb:6
  // `Digest::SHA1.hexdigest "--#{Time.zone.now}--"`. The timestamp renders
  // through Ruby's Time#to_s ("2026-10-02 05:30:57 UTC"); the port uses the
  // same second-resolution UTC rendering so the digest's INPUT string has the
  // same shape. What matters downstream is only that the value is a 40-char
  // lowercase hex salt, which is the shape right/salt.rb:6 produces and the
  // shape every real deck's +*salt carries.
  const now = (deps.now ?? (() => new Date()))();
  const salt = await sha1Hex(`--${rubyTimestamp(now)}--`);

  // (5) the subtree. Six engine creates under the bot actor (Auth.as_bot,
  // user.rb:52 — the bot is the administrator whose permissions cannot be
  // disabled, auth/permissions.rb:9).
  // The engine's clock is the flow's, so the +*salt the engine generates for
  // the new account (set_default_salt) is the salt derived above.
  const engine = new CardActionEngine(deps.fetcher, { actor: bot, now: () => now });
  // The holder's name: the submitted card[name] when the form carries one
  // (user.rb:14), else the email-derived unique name.
  const ownerName = input.cardName ?? (await ownerCardNameFor(deps.fetcher, email));
  // set/all/account.rb:3-5 `default_accounted_type_id` = UserID, and the
  // setup form posts exactly that (user.rb:42 `type_id:
  // Card.default_accounted_type_id`). The holder is therefore a User-typed
  // card, not a default-typed one. A deck whose `user` codename card is
  // missing is a deck without card-mod-account, which the gate above already
  // excluded — the throw is the honest leftover, not a reachable path.
  const userTypeId = await resolveCodenameCardId(deps.driver, "user");
  if (userTypeId === undefined) {
    return {
      ok: false,
      reason: "account_system_absent",
      message: SETUP_CLOSED_MESSAGE.account_system_absent,
    };
  }
  try {
    const owner = await engine.createCard({ name: ownerName, typeId: userTypeId });
    const ownerId = owner.cardId;
    // The account's create runs set_default_salt and set_default_status in
    // the engine (account-fields.ts): its +*salt and +*status ("active")
    // are stored with it.
    // The account is created with its +*email as a subcard, as the setup
    // form posts it (require_field :email, set/right/account.rb:8).
    const junction = await engine.createCard({
      name: `${ownerName}+*account`,
      subcards: { "+*email": { content: email } },
    });
    const junctionId = junction.cardId;
    const fieldId = async (field: string): Promise<number> => {
      const id = await deps.fetcher.lexicon.id(DeckoName.parse(`${ownerName}+*account+${field}`));
      if (id === undefined) throw new CardActionError("not-found", `missing ${ownerName}+*account+${field}`);
      return id;
    };
    const emailCard = { cardId: await fieldId("*email") };
    const saltCard = { cardId: await fieldId("*salt") };
    const statusCard = { cardId: await fieldId("*status") };
    // encrypt_password (right/password.rb:19-26) runs in the engine, over
    // the account's OWN salt — the one just stored, never a fresh one.
    // The digest over the account's own salt (right/password.rb:19-26),
    // in the policy the deck runs (the setup salt is the generated one);
    // the engine stores it as-is (passwordEncrypted).
    const digest = await storedPasswordValue(input.password, salt);
    const passwordCard = await engine.createCard({
      name: `${ownerName}+*account+*password`,
      content: digest,
      passwordEncrypted: true,
    });
    // setup_first_user (user.rb:59-64, :finalize, when: :setup? — this whole
    // function runs only when the setup window is open, the port's
    // `when: :setup?`): subcard [role, :*members] content = name, over
    // basket[:roles_for_first_user] %i[help_desk shark administrator]
    // (user.rb:3), in basket order; plus the signup_alert_email+to subcard
    // (user.rb:60). Ruby's subcard write is create-or-update (Card.create
    // on an existing name updates) — the concurrent-setup pin
    // (first-run-setup.test.ts "two creates issued CONCURRENTLY") needs
    // that tolerance too, so the writes go through ensureCard.
    //
    // The setting is `*members`, NOT `members`. Ruby's rolehash hangs off
    // `right_id: MembersID` — the `*members` SETTING's id
    // (card-mod-account set/self/role.rb:33-40), which is what
    // fetch_roles reads to decide whether this user holds the role
    // (src/card/permissions/read-rules.ts:72 MEMBERS_CODENAME="members",
    // :247). `+members` is a different card — a plain subcard of the role
    // named after the codename, which no permission statement consults — so
    // writing the owner there left the owner in no role at all and never an
    // admin. The star is the whole fix.
    await ensureCard(engine, "signup alert email+to", ownerName);
    for (const role of ["Help Desk", "Shark", "Administrators"]) {
      await ensureCard(engine, `${role}+*members`, ownerName);
    }
    return {
      ok: true,
      owner: { id: ownerId, name: ownerName },
      accountId: junctionId,
      email,
      salt,
      fieldCardIds: {
        email: emailCard.cardId,
        salt: saltCard.cardId,
        status: statusCard.cardId,
        password: passwordCard.cardId,
      },
      signInAt: SIGN_IN_PATH,
    };
  } catch (error) {
    if (error instanceof CardActionError) {
      return { ok: false, reason: "write_failed", message: error.message };
    }
    return {
      ok: false,
      reason: "write_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Ruby's create-or-update subcard write: Card.create on an existing name
 *  performs an update (the save machinery routes by name), so a subcard
 *  whose card already exists gets its content replaced, never a name
 *  collision. Used by the setup_first_user role writes. */
async function ensureCard(
  engine: CardActionEngine,
  name: string,
  content: string,
): Promise<void> {
  const existing = await engine.fetch.fetchByName(name);
  if (existing !== undefined && existing.id !== undefined) {
    await engine.updateCard({ cardId: existing.id, content });
  } else {
    await engine.createCard({ name, content });
  }
}

/** The id of a codename card, or undefined. The port of the boot-time
 *  `Card.const_get_or_set("...ID") { id }` mechanism (codename.rb:108) that
 *  actor.ts:9-21 documents, applied to a codename the flow needs but the
 *  account accessor set does not carry. */
async function resolveCodenameCardId(
  driver: SQLDatabaseDriver,
  codename: string,
): Promise<number | undefined> {
  const result = await driver.query<{ id: number }>(
    "SELECT id FROM cards WHERE codename = ? AND trash = 0 ORDER BY id LIMIT 1",
    [codename],
  );
  return result.rows[0]?.id;
}

/** Ruby's Time#to_s for a UTC Time: "YYYY-MM-DD HH:MM:SS UTC". */
function rubyTimestamp(when: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, "0");
  return (
    `${when.getUTCFullYear()}-${p(when.getUTCMonth() + 1)}-${p(when.getUTCDate())} ` +
    `${p(when.getUTCHours())}:${p(when.getUTCMinutes())}:${p(when.getUTCSeconds())} UTC`
  );
}

/** The sign-in route the journey ends at — the staging-slice alias the
 *  server already serves the form at (vm-staging-server.mjs SIGNIN_PAGE_PATHS
 *  includes both this and the live `/*signin` mark). */
export const SIGN_IN_PATH = "/_signin";

/** The closed-window reasons, as data. A caller that must tell a WINDOW
 *  failure from an INPUT failure (the route: 404 vs a 422 form re-render)
 *  tests membership here rather than guessing from a string, because the
 *  create's reason union also carries the input reasons. */
export const SETUP_CLOSED_REASONS = [
  "disabled",
  "write_path_disabled",
  "account_system_absent",
  "bot_card_absent",
  "setup_complete",
] as const satisfies ReadonlyArray<Exclude<SetupWindowReason, "needs_setup">>;

export type SetupClosedReason = (typeof SETUP_CLOSED_REASONS)[number];

/** The user-facing line for each closed-window reason. Deliberately honest:
 *  a first-run surface that says "try again later" when the real answer is
 *  "this deck has no account system" teaches the reader the wrong thing. */
const SETUP_CLOSED_MESSAGE: Record<SetupWindowReason, string> = {
  disabled: "This deck is not running first-run setup.",
  write_path_disabled: "This deck is running read-only; account creation is unavailable.",
  account_system_absent:
    "This deck has no account system, so it has no first account to create.",
  bot_card_absent:
    "This deck has no Decko Bot card, so the account census cannot run.",
  setup_complete: "This deck already has an account. Sign in instead.",
  // Carried for the union, never surfaced: a `needs_setup` reason IS the open
  // window, and no closed-window path can reach it.
  needs_setup: "This deck is ready for its first account.",
};

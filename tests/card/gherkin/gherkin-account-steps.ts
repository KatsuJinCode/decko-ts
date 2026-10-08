// Gherkin step helpers for the account-flow features (reset_password.feature,
// signup.feature, setup.feature). Each function is the port of one upstream
// Given/When/Then step (decko-commons/decko decko/features/*.feature +
// features/step_definitions/account_steps.rb + email_steps.rb), executed
// against the auth engine surfaces the account stream owns:
// account-verify-reset-flows.ts, first-run-setup.ts, signin.ts — over the
// SAME gherkin world (gherkin-storage.ts) the crud/views slices use.
//
// The browser shell (modal forms, "Save and Close", page banners) is out of
// scope by the same boundary the other slices document: the business behavior
// of each step is the engine call, and the "Then I should see" assertions
// read the engine-observable state that banner content would have rendered.

import type { Actor } from "../../../src/card/actions/index.js";
import {
  applyNewAccountPassword,
  confirmPasswordReset,
  confirmAccountVerification,
  sendAccountVerificationToken,
  sendResetPasswordToken,
  type AccountFlowContext,
  type PasswordResetConfirmation,
  type VerificationConfirmation,
} from "../../../src/card/auth/account-verify-reset-flows.js";
import {
  createOwnerAccount,
  type OwnerCreateSuccess,
} from "../../../src/card/auth/first-run-setup.js";
import { runAuthMigrations } from "../../../src/card/auth/migrations.js";
import { sha1Hex } from "../../../src/card/auth/signin.js";
import { SessionStore } from "../../../src/card/auth/session-store.js";
import { signoutAccount, signinAccount, type SigninOutcome } from "../../../src/card/auth/signin.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { CaptureTransport } from "../../../src/card/notify/index.js";
import { givenStandardDeck, freshWorld, closeWorld, type GherkinWorld } from "./gherkin-steps.js";
import { installGherkinNameEnvironment, seedCard, TYPE_IDS, type GherkinTestStorage } from "./gherkin-storage.js";

// ---------------------------------------------------------------------------
// ids — disjoint from the standard deck's 1..309 range
// ---------------------------------------------------------------------------

/** The account-system cards this deck seeds (card-mod-account
 *  data/real.yml: names, codenames; *title carries the deck title). */
export const ACCOUNT_IDS = {
  account: 320,
  email: 321,
  password: 322,
  salt: 323,
  status: 324,
  title: 325,
  deckoBot: 326,
  anonymous: 327,
  user: 328,
  signup: 329,
  administrators: 330,
  shark: 331,
  helpDesk: 332,
} as const;

/** The deck title the Ruby features run under — reset_password.feature:17
 *  expects the mail subject "reset password for My Deck", which the
 *  engine's reset template renders from {{:title|core}}. */
export const GHERKIN_DECK_TITLE = "My Deck";

/** Fixed token-clock epoch (AccountFlowContext.token.now). */
const T0 = 1_758_000_000;

/** The actor ids the features' fixtures use (Joe User is the signed-in
 *  editor; Joe Camel the second watcher; Joe Admin the shark). */
export const JOE_ADMIN: Actor = { id: 1, name: "Joe Admin" };
export const JOE_USER: Actor = { id: 9, name: "Joe User" };
export const JOE_CAMEL: Actor = { id: 12, name: "Joe Camel" };

/** The fixed salt timestamp (right/salt.rb:6's hexdigest-of-timestamp
 *  shape; any 40-hex value satisfies the digest input's contract). */
const SALT_TS = "--2026-10-03 00:00:00 UTC--";

// ---------------------------------------------------------------------------
// world
// ---------------------------------------------------------------------------

/** The account-flow world: the gherkin world plus the wired
 *  AccountFlowContext (the host wiring the flows require — the injected
 *  context pattern, account-verify-reset-flows.ts "DEPENDENCY SHAPE"). */
export interface AccountFlowWorld {
  world: GherkinWorld;
  ctx: AccountFlowContext;
  transport: CaptureTransport;
  sessions: SessionStore;
}

export async function freshAccountFlowWorld(): Promise<AccountFlowWorld> {
  const world = await freshWorld();
  const transport = new CaptureTransport("gherkin-account-flow");
  const sessions = new SessionStore({ driver: world.storage.driver });
  const ctx: AccountFlowContext = {
    driver: world.storage.driver,
    fetcher: world.storage.fetcher,
    sessions,
    transport,
    token: { secret: "gherkin-account-flow-secret", now: () => T0 },
    origin: "http://mydeck.example",
    siteTitle: GHERKIN_DECK_TITLE,
  };
  return { world, ctx, transport, sessions };
}

export async function closeAccountFlowWorld(flow: AccountFlowWorld): Promise<void> {
  await closeWorld(flow.world);
}

/** "Background: there is a user named Joe User in the test data with the
 *  email joe@user.com" (reset_password.feature:7) + the account system the
 *  flows read. Seeds the codename cards card-mod-account ships, the deck
 *  title, the auth migrations (the auth_sessions table the SessionStore
 *  needs), and — unless opts.joePassword is omitted — Joe User's own
 *  account subtree. Omit the password for the setup.feature deck: its
 *  census (setupWindowState) requires ZERO non-bot accounts, the deck
 *  state the setup window opens in. */
export async function givenAccountSystemDeck(
  flow: AccountFlowWorld,
  opts: { joePassword?: string } = {},
): Promise<void> {
  const { world } = flow;
  await givenStandardDeck(world);
  const s = world.storage;
  // card-mod-account data/real.yml: the setting/right codename cards.
  await seedCard(s, { id: ACCOUNT_IDS.account, name: "*account", codename: "account", typeId: TYPE_IDS.cardtype });
  await seedCard(s, { id: ACCOUNT_IDS.email, name: "*email", codename: "email", typeId: TYPE_IDS.cardtype });
  await seedCard(s, { id: ACCOUNT_IDS.password, name: "*password", codename: "password", typeId: TYPE_IDS.phrase });
  await seedCard(s, { id: ACCOUNT_IDS.salt, name: "*salt", codename: "salt", typeId: TYPE_IDS.phrase });
  await seedCard(s, { id: ACCOUNT_IDS.status, name: "*status", codename: "status", typeId: TYPE_IDS.phrase });
  // *title with the deck's title content (the {{:title|core}} render's value).
  await seedCard(s, { id: ACCOUNT_IDS.title, name: "*title", codename: "title", dbContent: GHERKIN_DECK_TITLE });
  // the two shipped system actors (auth/setup.rb:44): DeckoBot + Anonymous.
  await seedCard(s, { id: ACCOUNT_IDS.deckoBot, name: "Decko Bot", codename: "decko_bot" });
  await seedCard(s, { id: ACCOUNT_IDS.anonymous, name: "*anonymous", codename: "anonymous" });
  // the accounted cardtypes the flows create under (user.rb:50-57's default
  // accounted type; signup.rb the Signup cardtype) and the roles the setup
  // path grants the first user (user.rb:3 roles_for_first_user
  // %i[help_desk shark administrator]).
  await seedCard(s, { id: ACCOUNT_IDS.user, name: "User", codename: "user", typeId: TYPE_IDS.cardtype });
  await seedCard(s, { id: ACCOUNT_IDS.signup, name: "Signup", codename: "signup", typeId: TYPE_IDS.cardtype });
  // the Pointer cardtype the signup Background's permission rule needs
  // ("User+*type+*create", a Pointer-typed rule card).
  await seedCard(s, { id: TYPE_IDS.pointer, name: "Pointer", codename: "pointer", typeId: TYPE_IDS.cardtype });
  await seedCard(s, { id: ACCOUNT_IDS.administrators, name: "Administrators" });
  await seedCard(s, { id: ACCOUNT_IDS.shark, name: "Shark" });
  await seedCard(s, { id: ACCOUNT_IDS.helpDesk, name: "Help Desk" });
  // the auth_sessions table the SessionStore binds.
  await runAuthMigrations(s.driver);
  await installGherkinNameEnvironment(s);

  // upstream: "There is a user named Joe User in the test data with the
  // email joe@user.com" — password joe_pass (account_steps.rb:19). Skipped
  // for the setup deck (the census must read zero).
  if (opts.joePassword !== undefined) {
    await givenUserWithAccount(flow, {
      name: "Joe User",
      email: "joe@user.com",
      password: opts.joePassword,
      status: "active",
    });
  }
}

/** One accounted user: the holder card + the +*account subtree the flows
 *  read (right/account.rb:24-26 accounted = left; the four field children
 *  real.yml seeds). The password content is the salted digest —
 *  right/password.rb:19-26 encrypt_password (`Auth.encrypt content, salt`,
 *  the salt from right/salt.rb:6's hexdigest shape).
 *
 * ROW-SHAPE NOTE: the compound rows are inserted with their NAME column
 * populated (the auth stream's own fixture convention,
 * account-verify-reset-flows.test.ts insertCompoundCard) because the auth
 * layer's read SQL requires it (loadAccountByJunctionId returns undefined
 * on a null junction name, account-verify-reset-flows.ts:360). The action
 * engine's compound create writes NULL names — the two shapes are a
 * named divergence for the reconciler; this deck seeds the shape the
 * flows read. */
export async function givenUserWithAccount(
  flow: AccountFlowWorld,
  seed: { name: string; email: string; password: string; status: string; typeCode?: string },
): Promise<void> {
  const s = flow.world.storage;
  const holderId = await insertNamedCompound(s, { name: seed.name, typeId: seed.typeCode === "signup" ? ACCOUNT_IDS.signup : TYPE_IDS.richText });
  const junctionId = await insertNamedCompound(s, { name: `${seed.name}+*account`, leftId: holderId, rightId: ACCOUNT_IDS.account });
  await insertNamedCompound(s, { name: `${seed.name}+*account+*email`, leftId: junctionId, rightId: ACCOUNT_IDS.email, dbContent: seed.email });
  const salt = await sha1Hex(SALT_TS);
  await insertNamedCompound(s, { name: `${seed.name}+*account+*salt`, leftId: junctionId, rightId: ACCOUNT_IDS.salt, dbContent: salt });
  await insertNamedCompound(s, { name: `${seed.name}+*account+*status`, leftId: junctionId, rightId: ACCOUNT_IDS.status, dbContent: seed.status });
  const digest = await sha1Hex(`${salt}--${seed.password}--`);
  await insertNamedCompound(s, { name: `${seed.name}+*account+*password`, leftId: junctionId, rightId: ACCOUNT_IDS.password, dbContent: digest });
}

/** The auth fixture's compound-row INSERT (simple: name+key; compound:
 *  name + left_id/right_id) — the shape loadAccountByJunctionId reads.
 *  Returns the inserted row's id. */
async function insertNamedCompound(
  s: GherkinTestStorage,
  opts: { name: string; leftId?: number; rightId?: number; typeId?: number; dbContent?: string },
): Promise<number> {
  const { DeckoName } = await import("../../../src/card/name.js");
  const compound = opts.leftId !== undefined;
  const parsed = DeckoName.parse(opts.name);
  await s.driver.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, 1, 1, NULL, NULL, NULL, 0, ?, ?)`,
    [
      null,
      opts.name,
      compound ? null : parsed.key,
      opts.leftId ?? null,
      opts.rightId ?? null,
      "2026-10-03 00:00:00.000",
      "2026-10-03 00:00:00.000",
      opts.typeId ?? TYPE_IDS.richText,
      opts.dbContent ?? null,
    ],
  );
  const row = await s.selectOne<{ id: number }>(
    "SELECT id FROM cards WHERE rowid = last_insert_rowid()",
  );
  if (row === undefined) throw new Error(`insertNamedCompound: insert lost for ${opts.name}`);
  return row.id;
}

// ---------------------------------------------------------------------------
// When — the flows
// ---------------------------------------------------------------------------

/** "I enter 'joe@user.com' into '*email' in modal / And I press 'Reset
 *  password'" (reset_password.feature:14-15) — the reset request submit
 *  (signin.rb:27-31 + helpers, ported as sendResetPasswordToken). */
export async function whenRequestPasswordReset(
  flow: AccountFlowWorld,
  email: string,
): Promise<{ ok: boolean; sentTo?: string; reason?: string }> {
  const outcome = await sendResetPasswordToken(flow.ctx, email);
  return outcome.ok
    ? { ok: true, sentTo: outcome.sentTo }
    : { ok: false, reason: outcome.reason };
}

/** "I open the email / And I click the first link in the email"
 *  (reset_password.feature:19-20) — the link lands on
 *  /update/:mark?card[trigger]=...&token=... (token_url, views.rb:34-38);
 *  the click is the trigger request the confirm functions verify. */
export async function whenFollowMailLink(
  flow: AccountFlowWorld,
  trigger: "reset_password" | "verify_and_activate",
): Promise<PasswordResetConfirmation | VerificationConfirmation> {
  const link = firstMailLink(flow);
  if (link === undefined) throw new Error("no /update/ link found in any captured mail");
  const url = new URL(link);
  const mark = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  const token = url.searchParams.get("token") ?? "";
  if (trigger === "reset_password") {
    return confirmPasswordReset(flow.ctx, mark, token);
  }
  return confirmAccountVerification(flow.ctx, mark, token);
}

/** "I enter 'joe_pass_reset' into '*password' in modal / And I press 'Save
 *  and Close'" (reset_password.feature:23-24) — the +*account edit form's
 *  password write (right/password.rb's validate/store events, ported as
 *  applyNewAccountPassword under the signed-in holder). */
export async function whenApplyNewPassword(
  flow: AccountFlowWorld,
  holder: Actor,
  newPassword: string,
): Promise<{ ok: boolean; digest?: string; reason?: string }> {
  const outcome = await applyNewAccountPassword(
    { driver: flow.ctx.driver, fetcher: flow.ctx.fetcher, actor: holder },
    // the ACCOUNT mark (the +*account junction), the mark the flow's own
    // tests pass — the browser form posts against the +account card.
    `${holder.name}+*account`,
    newPassword,
  );
  return outcome.ok
    ? { ok: true, digest: outcome.digest }
    : { ok: false, reason: outcome.reason };
}

/** "And I follow 'Sign out'" (reset_password.feature:28) — the :signout
 *  event port; the session token is the flow's last-issued one. */
export async function whenSignOut(flow: AccountFlowWorld, sessionToken: string): Promise<boolean> {
  return signoutAccount(flow.sessions, sessionToken);
}

/** "And I follow 'Sign in' / And I enter <email> into '*email' / And I
 *  enter <password> into '*password' / And I press 'Sign in'" — the
 *  :signin event port (signin.rb:12-19). */
export async function whenSignIn(
  flow: AccountFlowWorld,
  identifier: string,
  password: string,
): Promise<SigninOutcome> {
  return signinAccount(flow.ctx.driver, flow.sessions, identifier, password);
}

/** "I fill in 'card_name' with 'Wanna B' / And I enter 'wanna@decko.org'
 *  into '*email' / And I enter 'wanna_pass' into '*password' / And I press
 *  'Submit'" (signup.feature:23-26) — the signup form's create, submitted
 *  signed out (signup.feature:18). The Ruby write shape (mod/account
 *  set/type/signup.rb): the Signup-typed holder + the +*account children;
 *  auto_approve_with_verification (:31-33) + request_verification (:48-52)
 *  write the account status "unverified" and trigger
 *  send_verification_email (right/account/events.rb:32-35) — the send this
 *  step makes at the same point. */
export async function whenSubmitSignup(
  flow: AccountFlowWorld,
  form: { name: string; email: string; password: string },
): Promise<void> {
  const { world } = flow;
  // The signed-out submitter (signup.feature:18 "And I am signed out") —
  // the same engine-rebuild the signed-in step uses. The form posts the
  // holder with its +*account subtree; the engine runs the account field
  // events (email, password, salt, status) in the one create.
  const engine = new CardActionEngine(world.storage.fetcher, {
    actor: { id: -1, name: "*anonymous" },
    ipAddress: "127.0.0.1",
  });
  await engine.createCard({
    name: form.name,
    typeCode: "signup",
    subcards: {
      "+*account": {
        subcards: { "+*email": { content: form.email }, "+*password": { content: form.password } },
      },
    },
  });
  // auto_approve_with_verification (signup.rb:31-33): the Background's
  // User+*type+*create = [[Anyone]] lets the submitter approve, so the
  // account starts "unverified" (request_verification, :48-52).
  const status = await world.storage.fetcher.fetchByName(`${form.name}+*account+*status`);
  if (status?.dbContent !== "unverified") {
    throw new Error(`signup status is ${status?.dbContent ?? "missing"}, expected unverified`);
  }
  // trigger_event! :send_verification_email (signup.rb:52).
  const send = await sendAccountVerificationToken(flow.ctx, `${form.name}+*account`);
  if (!send.ok) throw new Error(`verification email failed: ${send.reason}: ${send.message}`);
}

/** "I fill in 'card_name' with 'The Newber' / And I enter 'newb@decko.org'
 *  into '*email' / And I enter 'newb_pass' into '*password' / And I press
 *  'Set up'" (setup.feature:13-16) — the setup form submit (user.rb:9-30
 *  setup view; the create carries the submitted name and grants the first
 *  user the basket roles, ported inside createOwnerAccount). */
export async function whenRunSetup(
  flow: AccountFlowWorld,
  form: { name: string; email: string; password: string },
): Promise<OwnerCreateSuccess> {
  const outcome = await createOwnerAccount(
    { driver: flow.ctx.driver, fetcher: flow.ctx.fetcher },
    { email: form.email, password: form.password, cardName: form.name },
  );
  if (!outcome.ok) throw new Error(`setup failed: ${outcome.reason}: ${outcome.message}`);
  return outcome;
}

// ---------------------------------------------------------------------------
// Then — mail + state assertions
// ---------------------------------------------------------------------------

/** '"joe@user.com" should receive an email with subject ...'
 *  (reset_password.feature:17; email_steps.rb:196-206's subject match). */
export function thenMailWithSubject(flow: AccountFlowWorld, subjectFragment: string): void {
  const hit = flow.transport.captured().find((m) => m.subject.includes(subjectFragment));
  if (hit === undefined) {
    throw new Error(
      `no captured mail with subject containing ${JSON.stringify(subjectFragment)}; ` +
        `captured subjects: ${JSON.stringify(flow.transport.captured().map((m) => m.subject))}`,
    );
  }
}

/** The first /update/ link in the captured mails (email_spec's "I click the
 *  first link in the email" walks the mail body). */
export function firstMailLink(flow: AccountFlowWorld): string | undefined {
  for (const mail of flow.transport.captured()) {
    const line = mail.textBody?.split("\n").find((l) => l.includes("/update/"));
    if (line !== undefined) {
      const match = line.trim().match(/(https?:\/\/\S+)/);
      if (match !== null) return match[1];
    }
  }
  return undefined;
}

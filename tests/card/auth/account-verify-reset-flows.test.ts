// The account email-token FLOW tests (src/card/auth/account-verify-reset-flows.ts):
// request reset -> reset email (token link) -> confirm -> set new password,
// plus the signup-arm verification/activation. Red-first per the suite
// contract: the module under test did not exist at d6b1957 — every import
// below is the gap this suite closes.
//
// Ruby truth is cited per block; the master citations live in the module
// header of the implementation (set/self/signin.rb send_reset_password_token,
// right/account/events.rb reset_password + verify_and_activate,
// right/account/views.rb token_url, right/password.rb validate/encrypt
// events, data/real.yml template bytes).
//
// Storage: the auth suite's in-memory core-schema storage with SYNTHETIC
// account cards (the stream data rule — no real deck content in tests),
// real auth migration runner, real SessionStore, CaptureTransport for the
// mail (the mocked transport; envelope + token link bytes asserted).

import { describe, expect, it } from "vitest";
import {
  generatedEmail,
  generatedPassword,
} from "../../../src/testing/generated-credentials.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CaptureTransport } from "../../../src/card/notify/transport.js";
import { DeckoName } from "../../../src/card/name.js";
import {
  runAuthMigrations,
  SessionStore,
  sha1Hex,
  authenticateAccount,
  decodeAuthToken,
  encodeAuthToken,
  DEFAULT_TOKEN_EXPIRY_SECONDS,
  type TokenRuntimeConfig,
} from "../../../src/card/auth/index.js";
import {
  applyNewAccountPassword,
  buildAccountTokenUrl,
  confirmPasswordReset,
  confirmAccountVerification,
  sendResetPasswordToken,
  type AccountFlowContext,
} from "../../../src/card/auth/account-verify-reset-flows.js";
import {
  createAuthTestStorage,
  insertAccountCard,
  type AuthTestStorage,
} from "./auth-test-storage.js";

// --- fixture -----------------------------------------------------------------

const IDS = {
  account: 9001,
  email: 9002,
  password: 9003,
  salt: 9004,
  status: 9005,
  anonymous: 9006,
  decko_bot: 9007,
  title: 9008,
} as const;

const JANE = { id: 9100, name: "Jane Doe" };
const JANE_JUNCTION = 9101;
const JILL = { id: 9110, name: "Jill Inactive" };
const JILL_JUNCTION = 9111;
const SAM = { id: 9120, name: "Sam Other" };
const SAM_JUNCTION = 9121;

const JANE_EMAIL = generatedEmail("jane");
const JILL_EMAIL = generatedEmail("jill");
const SAM_EMAIL = generatedEmail("sam");
const SALT = "SALT";
const OLD_PASSWORD = generatedPassword("verifyold");
const NEW_PASSWORD = generatedPassword("verifynew");
const SITE_TITLE = "Test Deck";
const ORIGIN = "http://testdeck.example";

/** Fixed epoch seconds for the token clock (token.now). */
const T0 = 1_758_000_000;

const TS = "2026-09-20 11:00:00.000";

function insertCodenameCard(
  storage: AuthTestStorage,
  id: number,
  codename: string,
  name: string,
  content: string | null = null,
): void {
  storage.exec(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES
       (${id}, '${name}', '${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}',
        '${codename}', NULL, NULL, NULL, '${TS}', '${TS}', 1, 1,
        NULL, NULL, NULL, 0, 1, ${content === null ? "NULL" : `'${content}'`})`,
  );
}

function insertCompoundCard(
  storage: AuthTestStorage,
  id: number,
  name: string,
  leftId: number,
  rightId: number,
  content: string | null,
): void {
  storage.exec(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id,
        read_rule_class, read_rule_id, references_expired, trash, type_id, db_content)
     VALUES
       (${id}, '${name}', NULL, NULL, ${leftId}, ${rightId}, NULL,
        '${TS}', '${TS}', 1, 1, NULL, NULL, NULL, 0, 1,
        ${content === null ? "NULL" : `'${content.replace(/'/g, "''")}'`})`,
  );
}

interface Fixture {
  storage: AuthTestStorage;
  ctx: AccountFlowContext;
  transport: CaptureTransport;
  tokenConfig: TokenRuntimeConfig;
}

async function buildFixture(opts?: {
  janeStatus?: string;
  janeDigest?: string;
}): Promise<Fixture> {
  const storage = createAuthTestStorage();
  await runAuthMigrations(storage.driver);
  insertCodenameCard(storage, IDS.account, "account", "*account");
  insertCodenameCard(storage, IDS.email, "email", "*email");
  insertCodenameCard(storage, IDS.password, "password", "*password");
  insertCodenameCard(storage, IDS.salt, "salt", "*salt");
  insertCodenameCard(storage, IDS.status, "status", "*status");
  insertCodenameCard(storage, IDS.anonymous, "anonymous", "*anonymous");
  insertCodenameCard(storage, IDS.decko_bot, "decko_bot", "Decko Bot");
  insertCodenameCard(storage, IDS.title, "title", "*title", SITE_TITLE);

  insertAccountCard(storage, JANE);
  insertAccountCard(storage, JILL);
  insertAccountCard(storage, SAM);

  // Jane: active, salted, digested (the request/reset/set-password arm).
  insertCompoundCard(storage, JANE_JUNCTION, `${JANE.name}+*account`, JANE.id, IDS.account, null);
  insertCompoundCard(
    storage,
    9102,
    `${JANE.name}+*account+*email`,
    JANE_JUNCTION,
    IDS.email,
    JANE_EMAIL,
  );
  insertCompoundCard(
    storage,
    9103,
    `${JANE.name}+*account+*password`,
    JANE_JUNCTION,
    IDS.password,
    opts?.janeDigest ?? (await sha1Hex(`${SALT}--${OLD_PASSWORD}--`)),
  );
  insertCompoundCard(storage, 9104, `${JANE.name}+*account+*salt`, JANE_JUNCTION, IDS.salt, SALT);
  insertCompoundCard(
    storage,
    9105,
    `${JANE.name}+*account+*status`,
    JANE_JUNCTION,
    IDS.status,
    opts?.janeStatus ?? "active",
  );

  // Jill: unverified (the not_active ladder + the verify/activate arm).
  insertCompoundCard(storage, JILL_JUNCTION, `${JILL.name}+*account`, JILL.id, IDS.account, null);
  insertCompoundCard(
    storage,
    9112,
    `${JILL.name}+*account+*email`,
    JILL_JUNCTION,
    IDS.email,
    JILL_EMAIL,
  );
  insertCompoundCard(
    storage,
    9113,
    `${JILL.name}+*account+*password`,
    JILL_JUNCTION,
    IDS.password,
    await sha1Hex(`${SALT}--Irrelevant1!--`),
  );
  insertCompoundCard(storage, 9114, `${JILL.name}+*account+*salt`, JILL_JUNCTION, IDS.salt, SALT);
  insertCompoundCard(
    storage,
    9115,
    `${JILL.name}+*account+*status`,
    JILL_JUNCTION,
    IDS.status,
    "unverified",
  );

  // Sam: active (the token-mismatch source account).
  insertCompoundCard(storage, SAM_JUNCTION, `${SAM.name}+*account`, SAM.id, IDS.account, null);
  insertCompoundCard(
    storage,
    9122,
    `${SAM.name}+*account+*email`,
    SAM_JUNCTION,
    IDS.email,
    SAM_EMAIL,
  );
  insertCompoundCard(
    storage,
    9123,
    `${SAM.name}+*account+*password`,
    SAM_JUNCTION,
    IDS.password,
    await sha1Hex(`${SALT}--Hers1!--`),
  );
  insertCompoundCard(storage, 9124, `${SAM.name}+*account+*salt`, SAM_JUNCTION, IDS.salt, SALT);
  insertCompoundCard(
    storage,
    9125,
    `${SAM.name}+*account+*status`,
    SAM_JUNCTION,
    IDS.status,
    "active",
  );

  const transport = new CaptureTransport("flow-test");
  const tokenConfig: TokenRuntimeConfig = { secret: "flow-test-secret", now: () => T0 };
  const ctx: AccountFlowContext = {
    driver: storage.driver,
    fetcher: new FetchEngine(storage.driver),
    sessions: new SessionStore({ driver: storage.driver }),
    transport,
    token: tokenConfig,
    origin: ORIGIN,
    siteTitle: SITE_TITLE,
  };
  return { storage, ctx, transport, tokenConfig };
}

/** The reset URL shape (token_url, views.rb:34-38 + to_param — verified
 *  against the installed activesupport): percent-encoded brackets, JWT
 *  untouched, url_key keeps case with underscores. Applied to TRIMMED
 *  lines (the text template indents the link with two spaces). */
const URL_SHAPE =
  /^http:\/\/testdeck\.example\/update\/([^?]+)\?card%5Btrigger%5D=([a-z_]+)&token=([A-Za-z0-9\-_.]+)$/;

function linkFromText(textBody: string | undefined): string | undefined {
  const line = textBody?.split("\n").find((l) => l.includes("/update/"));
  return line === undefined ? undefined : line.trim();
}

// --- REQUEST: send_reset_password_token --------------------------------------

describe("sendResetPasswordToken (signin.rb:27-31 + helpers)", () => {
  it("delivers the reset email with the Ruby envelope + token link bytes", async () => {
    const f = await buildFixture();
    const outcome = await sendResetPasswordToken(f.ctx, JANE_EMAIL);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // the delivered envelope (send_account_email, right/account.rb:37-44:
    // to = the +email content; from/subject = the template fields).
    expect(f.transport.count()).toBe(1);
    const msg = f.transport.last();
    expect(msg).toBeDefined();
    expect(msg?.to).toBe(JANE_EMAIL);
    expect(msg?.from).toBe("Decko Bot");
    expect(msg?.subject).toBe(`reset password for ${SITE_TITLE}`);

    // THE TOKEN LINK BYTES: exact URL shape (url_key "Jane_Doe+*account";
    // to_param encodes the brackets; the JWT is base64url with dots).
    expect(outcome.resetUrl).toMatch(URL_SHAPE);
    const match = URL_SHAPE.exec(outcome.resetUrl);
    expect(match?.[1]).toBe(`${JANE.name.replace(/ /g, "_")}+*account`);
    expect(match?.[2]).toBe("reset_password");

    // the token decodes under the SAME secret to this holder with the
    // railtie expiry (token.rb:10-14 + railtie.rb:12).
    const claims = await decodeAuthToken(f.tokenConfig, outcome.token);
    expect(typeof claims).toBe("object");
    if (typeof claims === "string") return;
    expect(claims.user_id).toBe(JANE.id);
    expect(claims.exp).toBe(T0 + DEFAULT_TOKEN_EXPIRY_SECONDS);

    // the text body: template bytes with the URL + days substituted
    // (real.yml text_message; en-dash and the odd whitespace runs are the
    // seed's exact bytes).
    expect(msg?.textBody).toBe(
      `** Password reset for ${SITE_TITLE} **\n\n` +
        "Someone – you, we hope – asked to reset your password.  Please follow this link...\n\n" +
        `  ${outcome.resetUrl}\n` +
        "  \n" +
        "...to update your account details.\n\n\n" +
        "(Link will remain valid for 2 days.)\n\n",
    );
    // the html body carries the same link in the anchor.
    expect(msg?.htmlBody).toContain(`href="${outcome.resetUrl}"`);
    expect(msg?.htmlBody).toContain(`<h1>Password reset for ${SITE_TITLE}</h1>`);
  });

  it("rejects an unknown email with Ruby's :error_not_recognized and sends nothing", async () => {
    const f = await buildFixture();
    const outcome = await sendResetPasswordToken(f.ctx, "nobody@example.com");
    expect(outcome).toEqual({
      ok: false,
      reason: "not_recognized",
      message: "not recognized",
    });
    expect(f.transport.count()).toBe(0);
  });

  it("rejects an inactive account with Ruby's :error_not_active and sends nothing", async () => {
    const f = await buildFixture();
    const outcome = await sendResetPasswordToken(f.ctx, JILL_EMAIL);
    expect(outcome).toEqual({
      ok: false,
      reason: "not_active",
      message: "Sorry, that account is not active.",
    });
    expect(f.transport.count()).toBe(0);
  });

  it("rejects a blank email with Ruby's :error_blank and sends nothing", async () => {
    const f = await buildFixture();
    expect(await sendResetPasswordToken(f.ctx, "")).toEqual({
      ok: false,
      reason: "blank_email",
      message: "can't be blank",
    });
    expect(await sendResetPasswordToken(f.ctx, "   ")).toEqual({
      ok: false,
      reason: "blank_email",
      message: "can't be blank",
    });
    expect(f.transport.count()).toBe(0);
  });

  it("matches emails case-insensitively after strip (auth/current.rb:74-77)", async () => {
    const f = await buildFixture();
    const outcome = await sendResetPasswordToken(
      f.ctx,
      `  ${JANE_EMAIL.toUpperCase()} `,
    );
    expect(outcome.ok).toBe(true);
    expect(f.transport.count()).toBe(1);
  });
});

// --- the link builder (views.rb:34-38) ----------------------------------------

describe("buildAccountTokenUrl (token_url)", () => {
  it("builds the verify link with the anonymous claim and its own trigger", async () => {
    const f = await buildFixture();
    const { url, token } = await buildAccountTokenUrl(
      f.ctx,
      `${JILL.name}+*account`,
      "verify_and_activate",
      { anonymous: true },
    );
    expect(url).toMatch(URL_SHAPE);
    const match = URL_SHAPE.exec(url);
    expect(match?.[1]).toBe(`${JILL.name.replace(/ /g, "_")}+*account`);
    expect(match?.[2]).toBe("verify_and_activate");
    const claims = await decodeAuthToken(f.tokenConfig, token);
    if (typeof claims === "string") return expect.fail(claims);
    // views.rb:2-4: the verify link's extra payload rides the merge
    // (token.rb:11) — anonymous: true is why the authenticator binds
    // Anonymous instead of the user.
    expect(claims.anonymous).toBe(true);
    expect(claims.user_id).toBe(JILL.id);
  });
});

// --- CONFIRM: reset_password event --------------------------------------------

describe("confirmPasswordReset (events.rb:15-17 + authenticator)", () => {
  it("issues a session for the holder and redirects to the +account edit view", async () => {
    const f = await buildFixture();
    const request = await sendResetPasswordToken(f.ctx, JANE_EMAIL);
    if (!request.ok) return expect.fail("request failed");
    const confirmation = await confirmPasswordReset(
      f.ctx,
      `${JANE.name}+*account`,
      request.token,
    );
    expect(confirmation.ok).toBe(true);
    if (!confirmation.ok) return;
    expect(confirmation.holder).toEqual({ id: JANE.id, name: JANE.name });
    expect(confirmation.accountId).toBe(JANE_JUNCTION);
    // reset_password_success (events.rb:100-104): redirect id = the +account
    // card name, view :edit.
    expect(confirmation.redirectTo).toEqual({
      name: `${JANE.name}+*account`,
      view: "edit",
    });
    // Auth.signin parity: the issued session resolves to the holder.
    const actor = await f.ctx.sessions.lookupSession(confirmation.session.token);
    expect(actor).toEqual({ id: JANE.id, name: JANE.name });
    // abort :success — NO card write rode the confirm.
    const digest = f.storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE id = 9103",
    );
    expect(digest?.db_content).toBe(await sha1Hex(`${SALT}--${OLD_PASSWORD}--`));
  });

  it("fails an unparseable token at the authenticator WITHOUT a re-send", async () => {
    const f = await buildFixture();
    const confirmation = await confirmPasswordReset(
      f.ctx,
      `${JANE.name}+*account`,
      "not-a-jwt",
    );
    expect(confirmation).toEqual({
      ok: false,
      kind: "token_invalid",
      message: "Not enough or too many segments",
    });
    // the authenticator asymmetry: Ruby raises PermissionDenied in the
    // controller BEFORE the event runs (rest.rb:37-47 -> token.rb:20), so
    // the failure event's re-send never fires for decode failures.
    expect(f.transport.count()).toBe(0);
  });

  it("fails a tampered token with the jwt gem's own message", async () => {
    const f = await buildFixture();
    const request = await sendResetPasswordToken(f.ctx, JANE_EMAIL);
    if (!request.ok) return expect.fail("request failed");
    const tampered = `${request.token.slice(0, -3)}abc`;
    const confirmation = await confirmPasswordReset(f.ctx, `${JANE.name}+*account`, tampered);
    expect(confirmation).toEqual({
      ok: false,
      kind: "token_invalid",
      message: "Signature verification failed",
    });
    expect(f.transport.count()).toBe(1); // only the original request mail
  });

  it("fails an expired token at the authenticator WITHOUT a re-send", async () => {
    const f = await buildFixture();
    const request = await sendResetPasswordToken(f.ctx, JANE_EMAIL);
    if (!request.ok) return expect.fail("request failed");
    // the SAME token one second after exp (railtie expiry + 1).
    const later: TokenRuntimeConfig = {
      secret: "flow-test-secret",
      now: () => T0 + DEFAULT_TOKEN_EXPIRY_SECONDS + 1,
    };
    const claims = await decodeAuthToken(later, request.token);
    expect(claims).toBe("Signature has expired");
    const confirmation = await confirmPasswordReset(
      { ...f.ctx, token: later },
      `${JANE.name}+*account`,
      request.token,
    );
    expect(confirmation).toEqual({
      ok: false,
      kind: "token_invalid",
      message: "Signature has expired",
    });
    expect(f.transport.count()).toBe(1); // no re-send (authenticator arm)
  });

  it("re-sends the reset email when a valid token names a DIFFERENT account", async () => {
    const f = await buildFixture();
    // a well-formed token for SAM, presented at JANE's +account mark —
    // Ruby's decode succeeds (the authenticator binds Sam) but
    // verifying_token's user_id check fails (events.rb:64-73) -> the
    // failure event re-sends to JANE (events.rb:106-109).
    const samToken = await encodeAuthToken(f.tokenConfig, SAM.id);
    const confirmation = await confirmPasswordReset(
      f.ctx,
      `${JANE.name}+*account`,
      samToken,
    );
    expect(confirmation.ok).toBe(false);
    if (confirmation.ok || confirmation.kind !== "token_account_mismatch") return;
    expect(confirmation.resent).toBe(true);
    // the %{error_msg} is Ruby Hash#to_s of the decoded claims
    // (events.rb:70 passes the result object into i18n).
    expect(confirmation.message).toMatch(
      /^Sorry, \{"user_id"=>9120, "exp"=>\d+\}\. Please check your email for a new password reset link\.$/,
    );
    // TWO mails: the failure re-send went to JANE's address.
    expect(f.transport.count()).toBe(1);
    const resent = f.transport.last();
    expect(resent?.to).toBe(JANE_EMAIL);
    expect(resent?.subject).toBe(`reset password for ${SITE_TITLE}`);
    const link = URL_SHAPE.exec(linkFromText(resent?.textBody) ?? "");
    expect(link?.[1]).toBe("Jane_Doe+*account");
    expect(link?.[2]).toBe("reset_password");
  });

  it("404s an unknown mark", async () => {
    const f = await buildFixture();
    const samToken = await encodeAuthToken(f.tokenConfig, SAM.id);
    const confirmation = await confirmPasswordReset(f.ctx, "Nobody+*account", samToken);
    expect(confirmation).toEqual({
      ok: false,
      kind: "account_not_found",
      message: "no such card: Nobody+*account",
    });
    expect(f.transport.count()).toBe(0);
  });
});

// --- CONFIRM: verify_and_activate ----------------------------------------------

describe("confirmAccountVerification (events.rb:19-24 + activate_account)", () => {
  it("activates the account, sends the welcome email, and signs the holder in", async () => {
    const f = await buildFixture();
    // views.rb:2-4: the verify link's token carries {anonymous: true}.
    const token = await encodeAuthToken(f.tokenConfig, JILL.id, { anonymous: true });
    const confirmation = await confirmAccountVerification(
      f.ctx,
      `${JILL.name}+*account`,
      token,
    );
    expect(confirmation.ok).toBe(true);
    if (!confirmation.ok) return;
    expect(confirmation.activated).toBe(true);
    expect(confirmation.welcomeSent).toBe(true);
    expect(confirmation.redirectTo).toEqual({ name: `${JILL.name}+*account`, view: undefined });
    // activate_account (events.rb:40-43): the +*status child content is
    // now "active" (written under the bot actor).
    const status = f.storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE id = 9115",
    );
    expect(status?.db_content).toBe("active");
    // the session binds the holder (the EVENT signed in, not the
    // authenticator — the link's anonymous flag binds Anonymous upstream).
    const actor = await f.ctx.sessions.lookupSession(confirmation.session.token);
    expect(actor).toEqual({ id: JILL.id, name: JILL.name });
    // ONE mail: the welcome email — the seed template carries no fields,
    // so subject and body are empty (real.yml welcome_email).
    expect(f.transport.count()).toBe(1);
    const welcome = f.transport.last();
    expect(welcome?.to).toBe(JILL_EMAIL);
    expect(welcome?.subject).toBe("");
    expect(welcome?.textBody).toBe("");
  });

  it("re-sends the verification email with the activation-worded failure message on mismatch", async () => {
    const f = await buildFixture();
    const janeToken = await encodeAuthToken(f.tokenConfig, JANE.id, { anonymous: true });
    const confirmation = await confirmAccountVerification(
      f.ctx,
      `${JILL.name}+*account`,
      janeToken,
    );
    expect(confirmation.ok).toBe(false);
    if (confirmation.ok || confirmation.kind !== "token_account_mismatch") return;
    // events.rb:96-97 literal (the reset arm uses the en.yml key instead).
    // The verify token carries {anonymous: true} (views.rb:2-4), so the
    // Hash#to_s of the claims includes it in insertion order.
    expect(confirmation.message).toMatch(
      /^Sorry, \{"user_id"=>9100, "exp"=>\d+, "anonymous"=>true\}\. Please check your email for a new activation link\.$/,
    );
    // ONE mail: the verification re-send to JILL, with the verify trigger
    // link and the verify template bytes.
    expect(f.transport.count()).toBe(1);
    const resent = f.transport.last();
    expect(resent?.to).toBe(JILL_EMAIL);
    expect(resent?.subject).toBe(`verification link for ${SITE_TITLE}`);
    const linkLine = linkFromText(resent?.textBody) ?? "";
    const link = URL_SHAPE.exec(linkLine);
    expect(link?.[1]).toBe("Jill_Inactive+*account");
    expect(link?.[2]).toBe("verify_and_activate");
    const claims = await decodeAuthToken(f.tokenConfig, link?.[3] ?? "");
    if (typeof claims === "string") return expect.fail(claims);
    expect(claims.anonymous).toBe(true);
    expect(claims.user_id).toBe(JILL.id);
    // the failed confirm did NOT activate (status stays "unverified").
    const status = f.storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE id = 9115",
    );
    expect(status?.db_content).toBe("unverified");
  });

  it("fails an unparseable token at the authenticator without a re-send", async () => {
    const f = await buildFixture();
    const confirmation = await confirmAccountVerification(
      f.ctx,
      `${JILL.name}+*account`,
      "junk.token",
    );
    // "junk.token" is a TWO-segment token: the header parse fails first
    // (token.ts's documented segment-order — decode.rb:31-40 touches the
    // header before the segment count can report).
    expect(confirmation).toEqual({
      ok: false,
      kind: "token_invalid",
      message: "Invalid segment encoding",
    });
    expect(f.transport.count()).toBe(0);
  });

  it("fails a one-segment token with the segment-count message", async () => {
    const f = await buildFixture();
    const confirmation = await confirmPasswordReset(f.ctx, `${JANE.name}+*account`, "garbage");
    expect(confirmation).toEqual({
      ok: false,
      kind: "token_invalid",
      message: "Not enough or too many segments",
    });
  });
});

// --- SET THE NEW PASSWORD (right/password.rb events) ---------------------------

describe("applyNewAccountPassword (validate/store events)", () => {
  it("writes the salted digest with the EXISTING salt and old password stops verifying", async () => {
    const f = await buildFixture();
    const write = await applyNewAccountPassword(
      { driver: f.storage.driver, fetcher: f.ctx.fetcher, actor: JANE },
      `${JANE.name}+*account`,
      NEW_PASSWORD,
    );
    expect(write.ok).toBe(true);
    if (!write.ok || write.noOp) return;
    // encrypt_password (right/password.rb:19-26): Auth.encrypt(content,
    // left&.salt) — the account's EXISTING salt, NOT regenerated.
    expect(write.digest).toBe(await sha1Hex(`${SALT}--${NEW_PASSWORD}--`));
    const row = f.storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE id = 9103",
    );
    expect(row?.db_content).toBe(await sha1Hex(`${SALT}--${NEW_PASSWORD}--`));
    // the salt card is untouched.
    const salt = f.storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE id = 9104",
    );
    expect(salt?.db_content).toBe(SALT);
    // the new password verifies through the signin ladder; the old fails.
    const newOk = await authenticateAccount(f.storage.driver, JANE_EMAIL, NEW_PASSWORD);
    expect(newOk.ok).toBe(true);
    const oldTry = await authenticateAccount(f.storage.driver, JANE_EMAIL, OLD_PASSWORD);
    expect(oldTry).toMatchObject({ ok: false, reason: "wrong_password" });
  });

  it("enforces the length event (8 chars, lib/card/mod/account.rb)", async () => {
    const f = await buildFixture();
    const write = await applyNewAccountPassword(
      { driver: f.storage.driver, fetcher: f.ctx.fetcher, actor: JANE },
      `${JANE.name}+*account`,
      "aB1!",
    );
    expect(write).toEqual({
      ok: false,
      reason: "password_too_short",
      message: "must be 8 characters or longer",
    });
    // nothing was written.
    const row = f.storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE id = 9103",
    );
    expect(row?.db_content).toBe(await sha1Hex(`${SALT}--${OLD_PASSWORD}--`));
  });

  it("consolidates the char-requirement messages Ruby's order (lower, upper, special, number)", async () => {
    const f = await buildFixture();
    const actorDeps = { driver: f.storage.driver, fetcher: f.ctx.fetcher, actor: JANE };
    // one missing -> bare "must contain X".
    expect(
      await applyNewAccountPassword(actorDeps, `${JANE.name}+*account`, "password1!"),
    ).toMatchObject({
      ok: false,
      reason: "password_missing_char_types",
      message: "must contain an upper case letter",
    });
    // two missing -> "X and Y".
    expect(
      await applyNewAccountPassword(actorDeps, `${JANE.name}+*account`, "password1234"),
    ).toMatchObject({
      ok: false,
      reason: "password_missing_char_types",
      message: "must contain an upper case letter and a special character (like !@$%&#)",
    });
    // three missing -> "X, Y, and Z" (consolidated_password_error_message,
    // right/password.rb:92-99, over the config order).
    expect(
      await applyNewAccountPassword(actorDeps, `${JANE.name}+*account`, "abcdefgh"),
    ).toMatchObject({
      ok: false,
      reason: "password_missing_char_types",
      message:
        "must contain an upper case letter, a special character (like !@$%&#), and a number",
    });
  });

  it("treats a blank password as a silent no-op (validate_password_present aborts success)", async () => {
    const f = await buildFixture();
    expect(
      await applyNewAccountPassword(
        { driver: f.storage.driver, fetcher: f.ctx.fetcher, actor: JANE },
        `${JANE.name}+*account`,
        "   ",
      ),
    ).toEqual({ ok: true, noOp: true });
    const row = f.storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE id = 9103",
    );
    expect(row?.db_content).toBe(await sha1Hex(`${SALT}--${OLD_PASSWORD}--`));
  });
});

// --- URL/mark round trip --------------------------------------------------------

describe("the link's mark round-trips through the account lookup", () => {
  it("url_key -> markToName -> key resolves the same junction", () => {
    const accountName = `${JANE.name}+*account`;
    const urlKey = DeckoName.parse(accountName).urlKey;
    expect(urlKey).toBe("Jane_Doe+*account");
    // the confirm's mark decoder: "_" -> " ", then key comparison.
    const decoded = urlKey.replace(/_/g, " ");
    expect(DeckoName.parse(decoded).key).toBe(DeckoName.parse(accountName).key);
  });
});

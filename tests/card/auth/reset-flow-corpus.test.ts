// The FULL password-reset flow against a DISPOSABLE COPY of the anonymized
// corpus-v2 (the lane contract: "test the full flow against a local corpus
// copy with the mail transport mocked (assert envelope + token link
// bytes)").
//
// The journey, end to end, in-process (no booted server — the endpoint
// surface has its own lane test):
//
//   1. the member requests a reset (sendResetPasswordToken — the
//      send_reset_password_token event, set/self/signin.rb:27-31)
//   2. the reset email lands on the mocked transport: envelope + token
//      link bytes asserted against the real.yml template + token_url shape
//   3. the member clicks the link (confirmPasswordReset — the rest.rb JWT
//      authenticator + the reset_password event, right/account/events.rb)
//   4. the session binds the member (Auth.signin parity)
//   5. the member sets a new password (applyNewAccountPassword — the
//      right/password.rb validate/store events, under the account-field
//      own_account? override the engine's rule walk has not ported —
//      see the flow module's permission-override note)
//   6. the new password signs in through the real signin ladder; the old
//      one fails
//   plus: Ruby's session semantics — NO invalidation of pre-existing
//   sessions on a reset (module header of
//   src/card/auth/account-verify-reset-flows.ts); the pre-reset session
//   still resolves after the flow, and that is PARITY, not a bug.
//
// The journey test MUTATES the shared fixture (the password digest), so it
// runs before the read-only rejection test via it() ordering (vitest runs
// sequentially within a file) — the rejection test additionally drains the
// capture to isolate from the journey's mail.

import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  generatedEmail,
  generatedPassword,
  generatedTokenSecret,
} from "../../../src/testing/generated-credentials.js";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { runAuthMigrations, SessionStore, authenticateAccount } from "../../../src/card/auth/index.js";
import { CaptureTransport } from "../../../src/card/notify/transport.js";
import {
  applyNewAccountPassword,
  confirmPasswordReset,
  sendResetPasswordToken,
  type AccountFlowContext,
} from "../../../src/card/auth/account-verify-reset-flows.js";
import {
  CORPUS_PATH,
  prepareResetFlowCorpusFixture,
} from "./reset-flow-corpus-fixture.js";

const FIXTURE_PATH = path.join(
  fileURLToPath(new URL("../../..", import.meta.url)),
  "tmp",
  "reset-flow-corpus-fixture.sqlite3",
);
const OLD_PASSWORD = generatedPassword("resetlaneold");
const NEW_PASSWORD = generatedPassword("resetlanenew");
const ORIGIN = "http://corpus-flow.test";

const describeIfCorpus = CORPUS_PATH !== null ? describe : describe.skip;

interface CorpusFixture {
  driver: LocalSqliteDriver;
  ctx: AccountFlowContext;
  transport: CaptureTransport;
  info: {
    email: string;
    holderName: string;
    junctionName: string;
    accountMark: string;
    siteTitle: string;
  };
  close(): void;
}

let fixture: CorpusFixture;

beforeAll(async () => {
  if (CORPUS_PATH === null) return;
  const info = prepareResetFlowCorpusFixture(FIXTURE_PATH, OLD_PASSWORD);
  const driver = new LocalSqliteDriver({ path: FIXTURE_PATH, readonly: false });
  await runAuthMigrations(driver, {
    migrationsDir: path.join(
      fileURLToPath(new URL("../../..", import.meta.url)),
      "db",
      "migrations",
    ),
  });
  const transport = new CaptureTransport("corpus-flow");
  const ctx: AccountFlowContext = {
    driver,
    fetcher: new FetchEngine(driver),
    sessions: new SessionStore({ driver }),
    transport,
    token: { secret: generatedTokenSecret() },
    origin: ORIGIN,
    siteTitle: info.siteTitle,
  };
  fixture = { driver, ctx, transport, info, close: () => driver.close() };
});

afterAll(() => {
  fixture?.close();
  rmSync(FIXTURE_PATH, { force: true });
});

describeIfCorpus("password-reset flow over the corpus copy (holder 583)", () => {
  it("runs request -> email -> confirm -> set password -> new-password signin", async () => {
    // A pre-existing session (the member signed in on another device before
    // forgetting the password): after the flow it must STILL resolve —
    // Ruby invalidates nothing on a password reset.
    const sessions = fixture.ctx.sessions;
    const oldSession = await sessions.createSession(583);

    // 1. REQUEST (signin.rb:27-31).
    const request = await sendResetPasswordToken(fixture.ctx, fixture.info.email);
    expect(request.ok).toBe(true);
    if (!request.ok) return;
    expect(request.sentTo).toBe(fixture.info.email);

    // 2. THE EMAIL: envelope + token link bytes (real.yml + token_url).
    expect(fixture.transport.count()).toBe(1);
    const mail = fixture.transport.last();
    expect(mail?.to).toBe(fixture.info.email);
    expect(mail?.from).toBe("Decko Bot");
    // {{:title|core}} -> the corpus's own *title content.
    expect(mail?.subject).toBe(`reset password for ${fixture.info.siteTitle}`);
    expect(mail?.textBody).toContain(`  ${request.resetUrl}\n`);
    expect(mail?.htmlBody).toContain(`href="${request.resetUrl}"`);
    // the link shape: absolute origin + /update/<url_key> + to_param query.
    const link =
      /^http:\/\/corpus-flow\.test\/update\/([^?]+)\?card%5Btrigger%5D=reset_password&token=([A-Za-z0-9\-_.]+)$/.exec(
        request.resetUrl,
      );
    expect(link).toBeDefined();
    expect(link?.[1]).toBe(fixture.info.accountMark);

    // 3. CONFIRM: the member clicks the link (rest.rb authenticator +
    //    events.rb:15-17 reset_password).
    const confirmation = await confirmPasswordReset(fixture.ctx, link?.[1] ?? "", link?.[2] ?? "");
    expect(confirmation.ok).toBe(true);
    if (!confirmation.ok) return;
    expect(confirmation.holder.id).toBe(583);
    expect(confirmation.holder.name).toBe(fixture.info.holderName);
    expect(confirmation.redirectTo).toEqual({
      name: fixture.info.junctionName,
      view: "edit",
    });

    // 4. THE SESSION binds the member (Auth.signin parity).
    const actor = await sessions.lookupSession(confirmation.session.token);
    expect(actor?.id).toBe(583);
    // ...and the PRE-EXISTING session is untouched (Ruby invalidates
    // nothing — the parity pin, not a bug).
    const stillOld = await sessions.lookupSession(oldSession.token);
    expect(stillOld?.id).toBe(583);

    // 5. SET THE NEW PASSWORD (right/password.rb validate/store events),
    //    as the signed-in member (the confirm redirect's actor).
    const write = await applyNewAccountPassword(
      { driver: fixture.driver, fetcher: fixture.ctx.fetcher, actor: confirmation.holder },
      fixture.info.accountMark,
      NEW_PASSWORD,
    );
    expect(write.ok, JSON.stringify(write)).toBe(true);

    // 6. The new password signs in through the REAL signin ladder; the old
    //    one is dead.
    const newSignin = await authenticateAccount(fixture.driver, fixture.info.email, NEW_PASSWORD);
    expect(newSignin.ok).toBe(true);
    const oldSignin = await authenticateAccount(fixture.driver, fixture.info.email, OLD_PASSWORD);
    expect(oldSignin).toMatchObject({ ok: false, reason: "wrong_password" });
  });

  it("rejects a reset request for an email that owns no account (real corpus data)", async () => {
    fixture.transport.drain(); // isolate from the journey test's captured mail
    const outcome = await sendResetPasswordToken(fixture.ctx, "no-such-member@corpus.test");
    expect(outcome).toEqual({
      ok: false,
      reason: "not_recognized",
      message: "not recognized",
    });
    expect(fixture.transport.count()).toBe(0);
  });
});

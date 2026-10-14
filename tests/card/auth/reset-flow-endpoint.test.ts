// Endpoint tests for the staging server's reset-password surface: the
// FULL HTTP journey over a booted vm-staging-server —
//
//   POST /_reset-request {email}
//     -> the send_reset_password_token event; 422 with Ruby's ladder on
//        unknown/inactive, nothing sent
//   GET /_mail-log        (DECKO_MAIL_CAPTURE=1 debug surface)
//     -> the captured envelope; the reset link extracted from its bytes
//   GET  <resetUrl>       (the EXACT link from the email — /update/<mark>?
//        card[trigger]=reset_password&token=<jwt>)
//     -> 303 to the +account edit view's PATH address (/<url_key>/edit)
//        + the session cookie (the browser that clicked is signed in,
//        Ruby's Auth.signin parity)
//   POST /_account-password {password} with that cookie
//     -> the +*password validate/store events; the digest lands
//   POST /_signin {identifier, password}
//     -> the NEW password signs in through the real signin ladder; the old
//        one is 401
//
// plus the guards: a link without the token, a garbage token, a plain GET
// /update/<mark> with no trigger (NOT a write — falls through to the card
// route), and /_account-password without a session (401).
//
// The server boots against a DISPOSABLE COPY of the anonymized corpus-v2
// (shared fixture helper with the in-process corpus test; holder 583). The
// spawn pattern is signin-endpoint.test.ts's.

import { spawn, type ChildProcess } from "node:child_process";
import {
  generatedEmail,
  generatedPassword,
  generatedTokenSecret,
} from "../../../src/testing/generated-credentials.js";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHmac } from "node:crypto";
import { createServer as netCreateServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  CORPUS_PATH,
  HOLDER_ID,
  prepareResetFlowCorpusFixture,
  type CorpusFixtureInfo,
} from "./reset-flow-corpus-fixture.js";
import { describeWithCorpus } from "../../support/describe-with-corpus.js";
import { ensureStagingServerDist } from "./staging-server-dist-bootstrap.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const FIXTURE_PATH = path.join(REPO_ROOT, "tmp", "reset-endpoint-fixture.sqlite3");
const OLD_PASSWORD = generatedPassword("resetendpointold");
const NEW_PASSWORD = generatedPassword("resetendpointnew");
const TOKEN_SECRET = generatedTokenSecret();

const describeIfCorpus = describeWithCorpus(CORPUS_PATH !== null, "tests/card/auth/reset-flow-endpoint.test.ts", "the committed miniature corpus (fixtures/test-corpus/) is not present");

interface Fixture {
  baseUrl: string;
  email: string;
  accountMark: string;
}

let fixture: Fixture;
let server: ChildProcess | null = null;
let serverOutput = "";
let reservedPort = 0;

async function reserveEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = netCreateServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (address === null || typeof address === "string") {
        reject(new Error("unexpected address"));
        srv.close();
        return;
      }
      const port = address.port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** HS256 JWT signed the way Auth::Token encodes (card-1.110.0
 *  lib/card/auth/token.rb:13-16) so the endpoint tests can present a
 *  VALID token whose claims the flow then rejects (mismatch arms). */
function signAccountToken(
  claims: Record<string, unknown>,
  secret: string,
): string {
  const b64url = (input: string) => Buffer.from(input, "utf8").toString("base64url");
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/** The forgot-password form POST exactly as the live form submits it:
 *  url-encoded with Ruby's subcard input names (set/self/signin.rb
 *  format :html edit view - card_form :update + edit_view_hidden). */
function forgotPasswordFormBody(email: string): string {
  return (
    "utf8=%E2%9C%93" +
    "&_method=patch" +
    "&success%5Bview%5D=reset_password_success" +
    "&card%5Btrigger%5D=send_reset_password_token" +
    `&card%5Bsubcards%5D%5B%2B%2Aemail%5D%5Bcontent%5D=${encodeURIComponent(email)}`
  );
}

let info: ReturnType<typeof prepareResetFlowCorpusFixture> | null = null;

describeIfCorpus("reset-flow staging endpoints (booted server, disposable corpus copy)", () => {
  beforeAll(async () => {
    await ensureStagingServerDist();
    info = prepareResetFlowCorpusFixture(FIXTURE_PATH, OLD_PASSWORD);
    reservedPort = await reserveEphemeralPort();
    fixture = {
      baseUrl: `http://127.0.0.1:${reservedPort}`,
      email: info.email,
      accountMark: info.accountMark,
    };
    server = spawn(
      process.execPath,
      [path.join(REPO_ROOT, "vm-staging-server.mjs"), FIXTURE_PATH, String(reservedPort)],
      {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          DECKO_MAIL_CAPTURE: "1",
          DECKO_TOKEN_SECRET: TOKEN_SECRET,
          DECKO_ORIGIN: fixture.baseUrl,
        },
      },
    );
    server.stdout?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });
    server.stderr?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });

    let ready = false;
    for (let attempt = 0; attempt < 120 && !ready; attempt++) {
      try {
        const response = await fetch(`${fixture.baseUrl}/_status`);
        ready = response.status === 200;
      } catch {
        await delay(250);
      }
    }
    if (!ready) {
      throw new Error(`staging server did not become ready:\n${serverOutput.slice(-2000)}`);
    }
  }, 120_000);

  afterAll(async () => {
    if (server !== null && server.exitCode === null) {
      server.kill();
      await delay(200);
    }
    rmSync(FIXTURE_PATH, { force: true });
  });

  it("runs the full reset journey over HTTP", async () => {
    // 1. REQUEST.
    const requestResponse = await fetch(`${fixture.baseUrl}/_reset-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fixture.email }),
    });
    expect(requestResponse.status).toBe(200);
    const requestBody = (await requestResponse.json()) as { ok: boolean; sentTo: string };
    expect(requestBody).toEqual({ ok: true, sentTo: fixture.email });

    // 2. THE EMAIL from the capture surface: envelope + link bytes.
    const mailLog = (await (await fetch(`${fixture.baseUrl}/_mail-log`)).json()) as {
      messages: Array<{ to: string; from: string; subject: string; textBody: string }>;
    };
    expect(mailLog.messages).toHaveLength(1);
    const mail = mailLog.messages[0]!;
    expect(mail.to).toBe(fixture.email);
    expect(mail.from).toBe("Decko Bot");
    expect(mail.subject).toBe(`reset password for ${(info as { siteTitle: string }).siteTitle}`);
    // the link rides the text body indented two spaces (real.yml bytes).
    const linkLine = mail.textBody.split("\n").find((l) => l.includes("/update/"))?.trim() ?? "";
    expect(linkLine).toMatch(
      new RegExp(
        `^${fixture.baseUrl.replace(/[.]/g, "\\.")}/update/${fixture.accountMark.replace(/[+*]/g, "\\$&")}\\?card%5Btrigger%5D=reset_password&token=[A-Za-z0-9\\-_.]+$`,
      ),
    );

    // 3. CONFIRM: the member clicks the EXACT link (GET; redirects manual).
    const confirmResponse = await fetch(linkLine, { redirect: "manual" });
    expect(confirmResponse.status, await confirmResponse.text()).toBe(303);
    const location = confirmResponse.headers.get("location") ?? "";
    expect(decodeURIComponent(location)).toContain(fixture.accountMark);
    // Ruby's success redirect for `success << {id: name, view: :edit}`
    // (card-mod-account-0.20.0 set/right/account/events.rb:100-104) is
    // Success#to_url -> Card::Path#path(view: :edit) on the account card,
    // and Card::Path answers the PATH form: a mark AND a view render
    // "#{mark}/#{view}" (mod/format/lib/card/path.rb:37-45, the view is
    // deleted from the opts at :60-62 so it never also lands in the query).
    // So the browser lands on /Mira_Member+*account/edit, not on a
    // ?view=edit address. The status is Ruby's CUD hard redirect, 303
    // (decko/lib/card_controller/response.rb:29-33).
    expect(decodeURIComponent(location).endsWith("/edit")).toBe(true);
    // The MARK is not percent-encoded: Card::Path builds it from
    // `name.url_key` (mod/format/lib/card/path.rb:64-71), and
    // Cardname#url_key already makes a URL-safe mark — word characters
    // and "*" survive, runs of space/underscore collapse to one "_",
    // parts join with "+" (cardname/lib/cardname/variants.rb:8-14 +
    // cardname.rb:37 OK4KEY_RE) — and nothing escapes it afterwards
    // (card/lib/card/env/location.rb:12-21 card_path returns any "/…"
    // string untouched). So the RAW Location carries the junction's "+"
    // and "*" literally, and needs no decodeURIComponent to be right.
    expect(location).toBe(`${fixture.baseUrl}/${fixture.accountMark}/edit`);
    const setCookie = confirmResponse.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("decko_ts_session=");
    const sessionCookie = /decko_ts_session=[^;]+/.exec(setCookie)?.[0] ?? "";

    // 4/5. SET THE NEW PASSWORD with the confirm's session.
    const passwordResponse = await fetch(`${fixture.baseUrl}/_account-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify({ password: NEW_PASSWORD }),
    });
    expect(passwordResponse.status).toBe(200);
    expect(await passwordResponse.json()).toEqual({ ok: true, noOp: false });

    // 6. The NEW password signs in; the OLD one is dead.
    const newSignin = await fetch(`${fixture.baseUrl}/_signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: fixture.email, password: NEW_PASSWORD }),
    });
    expect(newSignin.status).toBe(200);
    const oldSignin = await fetch(`${fixture.baseUrl}/_signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: fixture.email, password: OLD_PASSWORD }),
    });
    expect(oldSignin.status).toBe(401);
  });

  it("rejects an unknown email over HTTP without sending anything", async () => {
    const before = await (await fetch(`${fixture.baseUrl}/_mail-log`)).json();
    const response = await fetch(`${fixture.baseUrl}/_reset-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@corpus.test" }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, message: "not recognized" });
    const after = (await (await fetch(`${fixture.baseUrl}/_mail-log`)).json()) as {
      messages: unknown[];
    };
    expect(after.messages.length).toBe((before as { messages: unknown[] }).messages.length);
  });

  // Security divergence (docs/SECURITY.md, "Cross-site requests"): the
  // staging host refuses every state-changing request from another site.
  it("refuses the reset, password and sign-in forms when posted from another site, and sends nothing", async () => {
    // Drain the capture so only this test's mail would show.
    await (await fetch(`${fixture.baseUrl}/_mail-log`)).json();
    const forgot = await fetch(`${fixture.baseUrl}/update/*signin`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://attacker.example" },
      body: forgotPasswordFormBody(fixture.email),
    });
    expect(forgot.status).toBe(403);
    const password = await fetch(`${fixture.baseUrl}/_account-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
      body: JSON.stringify({ password: "Whatever1!" }),
    });
    expect(password.status).toBe(403);
    const signin = await fetch(`${fixture.baseUrl}/_signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" },
      body: JSON.stringify({ identifier: fixture.email, password: OLD_PASSWORD }),
    });
    expect(signin.status).toBe(403);
    expect(signin.headers.get("set-cookie")).toBeNull();
    const drainedAfter = (await (await fetch(`${fixture.baseUrl}/_mail-log`)).json()) as {
      messages: unknown[];
    };
    expect(drainedAfter.messages).toEqual([]);
  });

  it("guards the link route: garbage token 403, missing token falls through, password write needs the session", async () => {
    // garbage token -> the authenticator arm, 403, no re-send.
    const garbage = await fetch(
      `${fixture.baseUrl}/update/${fixture.accountMark}?card%5Btrigger%5D=reset_password&token=garbage`,
      { redirect: "manual" },
    );
    expect(garbage.status).toBe(403);

    // a plain GET /update/<mark> with NO trigger is not a write — it falls
    // through to the card route (renders the card page or 404s, never
    // mutates; the no-GET-writes posture stands).
    const plain = await fetch(`${fixture.baseUrl}/update/${fixture.accountMark}`, {
      redirect: "manual",
    });
    expect(plain.status).not.toBe(302);

    // the password write without a session cookie is 401.
    const noSession = await fetch(`${fixture.baseUrl}/_account-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "Whatever1!" }),
    });
    expect(noSession.status).toBe(401);
  });

  // -- render polish: the forgot-password page, the form POST surface,
  // and the full-chrome failure pages. Oracle bytes captured from the
  // live decko-0.20.0 oracle app's sign-in and reset pages.

  it("GET /*signin?view=edit serves the Forgot Password page: titled main + modal form in house chrome", async () => {
    const response = await fetch(`${fixture.baseUrl}/*signin?view=edit`);
    expect(response.status).toBe(200);
    const html = await response.text();
    // The modal container rides AFTER the footer (oracle
    // oracle-signin-edit.html document shape).
    expect(html).toContain(
      `</footer>\n<div class='modal fade _modal-slot' id='modal-container' role='dialog'>`,
    );
    // modal-header: the Forgot Password title + the close button
    expect(html).toContain(
      `<span class="card-title" title="Forgot Password">Forgot Password</span>`,
    );
    expect(html).toContain(`<a class="_close-modal btn-close" data-bs-dismiss="modal" href="">`);
    // modal-body: the edit slot wrap + the form contract (Ruby's exact
    // action, hidden trigger, subcard input name, bootstrapified button
    // bytes set/self/signin.rb:165-168 + form.rb:33-36)
    expect(html).toContain(`class="card-slot edit-view ALL TYPE-rich_text STAR SELF-Xsignin"`);
    expect(html).toContain(`action="/update/*signin"`);
    expect(html).toContain(
      `name="card[trigger]" id="card_trigger" value="send_reset_password_token"`,
    );
    expect(html).toContain(`name="success[view]" id="success_view" value="reset_password_success"`);
    expect(html).toContain(`name="card[subcards][+*email][content]"`);
    expect(html).toContain(
      `<button name="button" type="submit" class="_close-modal-on-success btn btn-primary">Reset password</button>`,
    );
    // the page MAIN is still the titled sign-in form (oracle: the article
    // region is byte-identical to /*signin; the edit view is modal-only)
    expect(html).toContain(`action="/_signin"`);
    // the /edit route shape serves the same page
    const viaEditRoute = await fetch(`${fixture.baseUrl}/*signin/edit`);
    expect(viaEditRoute.status).toBe(200);
    const editHtml = await viaEditRoute.text();
    expect(editHtml).toContain(
      `<span class="card-title" title="Forgot Password">Forgot Password</span>`,
    );
    expect(editHtml).toContain(
      `name="card[trigger]" id="card_trigger" value="send_reset_password_token"`,
    );
  });

  it("the forgot-password form POST renders the errors alert page for an unknown email and sends nothing", async () => {
    const drainedBefore = (await (await fetch(`${fixture.baseUrl}/_mail-log`)).json()) as {
      messages: unknown[];
    };
    const response = await fetch(`${fixture.baseUrl}/update/*signin`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: forgotPasswordFormBody("nobody@corpus.test"),
    });
    expect(response.status).toBe(422);
    const html = await response.text();
    // the failed-update render: the bare alert IS the whole main slot
    // (oracle oracle-reset-request-unknown.html article region, byte-exact
    // incl. the alert class list's two spaces)
    expect(html).toContain(
      `<div id="main"><div class="alert alert-warning alert-dismissible  card-error-msg" role="alert"><button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>\n<h4 class="alert-heading error">Problems with *signin</h4>\n<p><strong>EMAIL:</strong> not recognized</p></div></div>`,
    );
    expect(html).toContain("<title>*signin - ");
    const drainedAfter = (await (await fetch(`${fixture.baseUrl}/_mail-log`)).json()) as {
      messages: unknown[];
    };
    expect(drainedAfter.messages.length).toBe(drainedBefore.messages.length);
  });

  it("the forgot-password form POST renders the blank-email ladder message", async () => {
    const response = await fetch(`${fixture.baseUrl}/update/*signin`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: forgotPasswordFormBody(""),
    });
    expect(response.status).toBe(422);
    const html = await response.text();
    expect(html).toContain(`<p><strong>EMAIL:</strong> can&#39;t be blank</p>`);
  });

  it("the forgot-password form POST redirects to the reset_password_success page for a known email", async () => {
    await (await fetch(`${fixture.baseUrl}/_mail-log`)).json();
    const response = await fetch(`${fixture.baseUrl}/update/*signin`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: forgotPasswordFormBody(fixture.email),
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${fixture.baseUrl}/*signin/reset_password_success`,
    );
    expect(await response.text()).toBe("");
    // the request arm DELIVERED the reset email (capture transport)
    const mailLog = (await (await fetch(`${fixture.baseUrl}/_mail-log`)).json()) as {
      messages: Array<{ subject: string }>;
    };
    expect(mailLog.messages).toHaveLength(1);

    // the success page (oracle oracle-reset-password-success-page.html):
    // the reset_password_success slot wrap + frame + the check-email body
    const page = await fetch(`${fixture.baseUrl}/*signin/reset_password_success`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(
      `class="card-slot reset_password_success-view ALL TYPE-rich_text STAR SELF-Xsignin"`,
    );
    expect(html).toContain(`<span class="card-title" title="Sign In">Sign In</span>`);
    expect(html).toContain(
      `<div class="d0-card-body card-body card-text">Check your email for a link to reset your password</div>`,
    );
    expect(html).toContain("<title>*signin - ");
  });

  it("the garbage-token link denial renders the full-chrome loud denial page", async () => {
    const response = await fetch(
      `${fixture.baseUrl}/update/${fixture.accountMark}?card%5Btrigger%5D=reset_password&token=garbage`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(403);
    const html = await response.text();
    // oracle oracle-reset-link-garbage.html main slot: the authenticator
    // denies BEFORE any card fetch — empty card name, default RichText
    // type keys, no denied task ("to do that"), byte-exact slot attrs.
    expect(html).toContain(
      `<div id="-denial-view" class="card-slot denial-view ALL TYPE-rich_text" data-card-name="" data-card-type-id="2" data-card-type-name="RichText" data-card-link-name=""`,
    );
    expect(html).toContain(`<span class="card-title" title=""></span></h1></div>`);
    expect(html).toContain(`<h1>Sorry!</h1>`);
    expect(html).toContain(
      `<div><div>Please <a class="signin-link known-card" href="/*signin/titled">sign in</a> or <a class="signup-link known-card" href="/new/Sign_up">sign up</a> to do that.</div></div>`,
    );
  });

  it("a valid token for a different account renders the mismatch alert page and re-sends", async () => {
    await (await fetch(`${fixture.baseUrl}/_mail-log`)).json();
    const token = signAccountToken(
      { user_id: 999999, exp: Math.floor(Date.now() / 1000) + 3600 },
      TOKEN_SECRET,
    );
    const response = await fetch(
      `${fixture.baseUrl}/update/${fixture.accountMark}?card%5Btrigger%5D=reset_password&token=${token}`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(422);
    const html = await response.text();
    expect(html).toContain(
      `<h4 class="alert-heading error">Problems with ${(info as CorpusFixtureInfo).junctionName}</h4>`,
    );
    expect(html).toContain(`<p><strong>CONTENT:</strong> Sorry, {&quot;user_id&quot;=&gt;999999`);
    expect(html).toContain(
      `. Please check your email for a new password reset link.</p>`,
    );
    // the failure event re-sent the reset email (events.rb:106-109)
    const mailLog = (await (await fetch(`${fixture.baseUrl}/_mail-log`)).json()) as {
      messages: Array<{ subject: string }>;
    };
    expect(mailLog.messages).toHaveLength(1);
  });

  it("a valid token for a missing account mark renders the full-chrome not-found page without sending", async () => {
    const drainedBefore = (await (await fetch(`${fixture.baseUrl}/_mail-log`)).json()) as {
      messages: unknown[];
    };
    const token = signAccountToken(
      { user_id: 999999, exp: Math.floor(Date.now() / 1000) + 3600 },
      TOKEN_SECRET,
    );
    const response = await fetch(
      `${fixture.baseUrl}/update/Nobody+*account?card%5Btrigger%5D=reset_password&token=${token}`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain(`not_found-view`);
    expect(html).toContain(`Could not find`);
    expect(html).toContain(`Nobody+*account`);
    expect(html).toContain(`sign up</a> to create it.`);
    const drainedAfter = (await (await fetch(`${fixture.baseUrl}/_mail-log`)).json()) as {
      messages: unknown[];
    };
    expect(drainedAfter.messages.length).toBe(drainedBefore.messages.length);
  });

  it("a verify-arm token mismatch renders the activation-link alert page and re-sends", async () => {
    await (await fetch(`${fixture.baseUrl}/_mail-log`)).json();
    const token = signAccountToken(
      { user_id: 999999, exp: Math.floor(Date.now() / 1000) + 3600 },
      TOKEN_SECRET,
    );
    const response = await fetch(
      `${fixture.baseUrl}/update/${fixture.accountMark}?card%5Btrigger%5D=verify_and_activate&token=${token}`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(422);
    const html = await response.text();
    expect(html).toContain(
      `<h4 class="alert-heading error">Problems with ${(info as CorpusFixtureInfo).junctionName}</h4>`,
    );
    expect(html).toContain(`<p><strong>CONTENT:</strong> Sorry, {&quot;user_id&quot;=&gt;999999`);
    expect(html).toContain(`. Please check your email for a new activation link.</p>`);
    // the failure re-sent the verification email (events.rb:94-98)
    const mailLog = (await (await fetch(`${fixture.baseUrl}/_mail-log`)).json()) as {
      messages: Array<{ subject: string }>;
    };
    expect(mailLog.messages).toHaveLength(1);
  });

  it("the verify link's success redirect answers the deck root, not the account card", async () => {
    const token = signAccountToken(
      { user_id: HOLDER_ID, exp: Math.floor(Date.now() / 1000) + 3600 },
      TOKEN_SECRET,
    );
    const response = await fetch(
      `${fixture.baseUrl}/update/${fixture.accountMark}?card%5Btrigger%5D=verify_and_activate&token=${token}`,
      { redirect: "manual" },
    );
    // verify_and_activate_success (card-mod-account-0.20.0
    // set/right/account/events.rb:87-92) ends in `success << ""` — the
    // EMPTY mark. Success#<< hands a String to `mark=`
    // (card/lib/card/env/success.rb:30-35); process_target's `when ""`
    // arm keeps it (success/target.rb:22-34); to_url returns that ""
    // unrendered because the target is not a Card (success.rb:23-25);
    // and hard_redirect's card_url turns "" into the site root
    // (card/lib/card/env/location.rb:12-21 — card_path "" is
    // "<relative_url_root>/"). So Ruby sends the browser to the DECK
    // ROOT; the account-card address is the RESET event's
    // `success << {id: name, view: :edit}` (events.rb:100-104), not this
    // one's. The status is the same CUD hard redirect, 303
    // (decko/lib/card_controller/response.rb:29-33).
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${fixture.baseUrl}/`);
    expect(response.headers.get("set-cookie")).toContain("decko_ts_session=");
  });
});

// The inactive arm needs its own boot: the request ladder reads +*status
// through the flows fetcher's card cache (Card::Cache parity), so a status
// flip after earlier requests have cached the account is invisible. Here
// the account goes pending BEFORE the server boots.
describeIfCorpus("forgot-password inactive arm (booted server, pending account)", () => {
  const FIXTURE_PENDING_PATH = path.join(REPO_ROOT, "tmp", "reset-endpoint-pending.sqlite3");
  let baseUrl = "";
  let pendingServer: ChildProcess | null = null;
  let serverOutput = "";
  let pendingPort = 0;
  let pendingEmail = "";

  beforeAll(async () => {
    const prepared = prepareResetFlowCorpusFixture(FIXTURE_PENDING_PATH, OLD_PASSWORD);
    pendingEmail = prepared.email;

    // flip the account +*status child to pending in the COPY, pre-boot
    const db = new Database(FIXTURE_PENDING_PATH);
    try {
      const codenameId = (code: string): number =>
        (
          db.prepare("SELECT id FROM cards WHERE codename = ? AND trash = 0").get(code) as
            | { id: number }
            | undefined
        )?.id ?? -1;
      const junction = db
        .prepare("SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0")
        .get(HOLDER_ID, codenameId("account")) as { id: number };
      const statusChild = db
        .prepare("SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0")
        .get(junction.id, codenameId("status")) as { id: number };
      db.prepare("UPDATE cards SET db_content = 'pending' WHERE id = ?").run(statusChild.id);
    } finally {
      db.close();
    }

    pendingPort = await reserveEphemeralPort();
    await ensureStagingServerDist();
    baseUrl = `http://127.0.0.1:${pendingPort}`;
    pendingServer = spawn(
      process.execPath,
      [path.join(REPO_ROOT, "vm-staging-server.mjs"), FIXTURE_PENDING_PATH, String(pendingPort)],
      {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          DECKO_MAIL_CAPTURE: "1",
          DECKO_TOKEN_SECRET: TOKEN_SECRET,
          DECKO_ORIGIN: baseUrl,
        },
      },
    );
    pendingServer.stdout?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });
    pendingServer.stderr?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });
    let ready = false;
    for (let attempt = 0; attempt < 120 && !ready; attempt++) {
      try {
        const response = await fetch(`${baseUrl}/_status`);
        ready = response.status === 200;
      } catch {
        await delay(250);
      }
    }
    if (!ready) {
      throw new Error(`pending-arm staging server did not become ready:\n${serverOutput.slice(-2000)}`);
    }
  }, 120_000);

  afterAll(async () => {
    if (pendingServer !== null && pendingServer.exitCode === null) {
      pendingServer.kill();
      await delay(200);
    }
    rmSync(FIXTURE_PENDING_PATH, { force: true });
  });

  it("the forgot-password form POST renders the ACCOUNT alert page for an inactive account and sends nothing", async () => {
    const drainedBefore = (await (await fetch(`${baseUrl}/_mail-log`)).json()) as {
      messages: unknown[];
    };
    const response = await fetch(`${baseUrl}/update/*signin`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: forgotPasswordFormBody(pendingEmail),
    });
    expect(response.status).toBe(422);
    const html = await response.text();
    expect(html).toContain(
      `<h4 class="alert-heading error">Problems with *signin</h4>`,
    );
    expect(html).toContain(
      `<p><strong>ACCOUNT:</strong> Sorry, that account is not active.</p>`,
    );
    const drainedAfter = (await (await fetch(`${baseUrl}/_mail-log`)).json()) as {
      messages: unknown[];
    };
    expect(drainedAfter.messages.length).toBe(drainedBefore.messages.length);
  });
});

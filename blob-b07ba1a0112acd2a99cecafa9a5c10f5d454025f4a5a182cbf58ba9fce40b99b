// The PASSWORD RESET REQUEST pin (registry row cap-A5, "Request a password
// reset (mail link)").
//
// ORACLE-PINNED: fixtures/captured/password-reset-request.json, captured
// from the pinned gemset (card-mod-account-0.20.0 and card-1.110.0) by
// tests/card/mod-loader/oracle-capture-password-reset-request.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-account-0.20.0 set/self/signin.rb - THE REQUEST: the
//      :send_reset_password_token event is `event :send_reset_password_token,
//      before: :signin, on: :update, trigger: :required do` and its body is
//      `blank_email? ? break : send_reset_password_email_or_fail`; the send
//      ladder requires an ACTIVE account, and the send itself is
//      `Auth.as_bot { account.send_password_reset_email }`. The FORM is view
//      :edit with `voo.edit_structure = [signin_field(:email)]`, and the
//      ACKNOWLEDGMENT is view :reset_password_success, whose body is
//      `frame { t :account_check_email }` - "Check your email for a link to
//      reset your password".
//   2. card-mod-account-0.20.0 set/right/account/views.rb - THE LINK: view
//      :reset_password_url is `token_url :reset_password`; token_url is
//      `card_url path(action: :update, card: { trigger: trigger }, token:
//      new_token(extra_payload))`; new_token is `Auth::Token.encode
//      card.accounted_id, extra_payload`.
//   3. card-mod-account-0.20.0 set/right/account/events.rb - THE CONFIRM: the
//      :reset_password event is `event :reset_password, :prepare_to_validate,
//      on: :update, trigger: :required do` and calls `verifying_token
//      :reset_password_success, :reset_password_failure`; the
//      requiring_token helper refuses a request with no token
//      (`errors.add :token, "is required"`); reset_password_success is
//      `Auth.signin accounted_id` followed by `success << { id: name, view:
//      :edit }` - the browser lands on the account's edit form, which is
//      where the new password is typed; reset_password_failure re-sends the
//      email and reports the mismatch.
//   4. card-1.110.0 lib/card/auth/token.rb - THE TOKEN codec.
//   5. card-mod-account-0.20.0 set/right/account.rb - THE DELIVERY:
//      `ecard.deliver self, to: email`.
//   6. card-mod-account-0.20.0 data/real.yml - the password_reset_email
//      template's own bytes.
//
// The port side is the reset flow module
// (src/card/auth/account-verify-reset-flows.ts) for the request ladder, the
// link, the confirmation and the password write, the write routes
// (src/server/write-routes.ts) for the trigger's own entry point, the
// account mod (src/card/mod-loader/mods/card-mod-account.ts) for the
// acknowledgment and the reset form, and the token module
// (src/card/auth/token.ts) for the link's claim.
//
// The third leg reads the harness's OWN mail-reset check module
// (tools/edge-signed-in-exercise/checks-mail-reset.mjs), which arms the
// owned local mail capture and drives the whole journey as a person would:
// the request, the captured message, the link, the new password, the old
// credential's refusal, and the fixture's own restoration.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL(
      "./../../../fixtures/captured/password-reset-request.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const portResetFlows = readFileSync(
  new URL(
    "./../../../src/card/auth/account-verify-reset-flows.ts",
    import.meta.url,
  ),
  "utf8",
);
const portWriteRoutes = readFileSync(
  new URL(
    "./../../../src/server/write-routes.ts",
    import.meta.url,
  ),
  "utf8",
);
const portAccount = readFileSync(
  new URL(
    "./../../../src/card/mod-loader/mods/card-mod-account.ts",
    import.meta.url,
  ),
  "utf8",
);
const portToken = readFileSync(
  new URL("./../../../src/card/auth/token.ts", import.meta.url),
  "utf8",
);
const mailResetModule = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/checks-mail-reset.mjs",
    import.meta.url,
  ),
  "utf8",
);
const harness = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise.mjs",
    import.meta.url,
  ),
  "utf8",
);
const capabilities = JSON.parse(
  readFileSync(
    new URL(
      "./../../../tools/edge-signed-in-exercise/capabilities.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("the pinned Ruby's own bytes for the password reset request", () => {
  it("the signin card owns the request trigger and its failure ladder", () => {
    expect(capture.facts.send_reset_password_token_event).toBe(
      "event :send_reset_password_token, before: :signin, on: :update, trigger: :required do",
    );
    expect(capture.facts.send_reset_password_token_body).toBe(
      "blank_email? ? break : send_reset_password_email_or_fail",
    );
    expect(capture.facts.blank_email_method).toBe("def blank_email?");
    expect(capture.facts.blank_email_body).toBe(
      "error_on :email, :error_blank",
    );
    expect(capture.facts.send_reset_password_email_or_fail).toBe(
      "def send_reset_password_email_or_fail",
    );
    expect(capture.facts.send_reset_password_email_or_fail_body).toBe(
      "if (account = account_for email_from_field)&.active?",
    );
    expect(capture.facts.send_reset_password_email).toBe(
      "def send_reset_password_email account",
    );
    expect(capture.facts.send_reset_password_email_body).toBe(
      "Auth.as_bot { account.send_password_reset_email }",
    );
    expect(capture.facts.reset_password_fail).toBe(
      "def reset_password_fail account",
    );
    expect(capture.facts.reset_password_fail_body).toBe(
      "error_on :account, :error_not_active",
    );
  });

  it("the signin card owns the reset form and the acknowledgment", () => {
    expect(capture.facts.reset_password_voo).toBe("def reset_password_voo");
    expect(capture.facts.reset_password_voo_body).toBe(
      "voo.edit_structure = [signin_field(:email)]",
    );
    expect(capture.facts.reset_password_success_view).toBe(
      "view :reset_password_success do",
    );
    expect(capture.facts.reset_password_success_view_body).toBe(
      "frame { t :account_check_email }",
    );
  });

  it("the account right owns the link's own bytes", () => {
    expect(capture.facts.reset_password_url_view).toBe(
      "view :reset_password_url, denial: :blank, perms: :reset_password_ok? do",
    );
    expect(capture.facts.reset_password_url_body).toBe(
      "token_url :reset_password",
    );
    expect(capture.facts.token_url).toBe(
      "def token_url trigger, extra_payload={}",
    );
    expect(capture.facts.token_url_body).toBe(
      "card_url path(action: :update,\n                  card: { trigger: trigger },\n                  token: new_token(extra_payload))",
    );
    expect(capture.facts.new_token).toBe("def new_token extra_payload");
    expect(capture.facts.new_token_body).toBe(
      "Auth::Token.encode card.accounted_id, extra_payload",
    );
  });

  it("the confirm event verifies the token and lands on the edit form", () => {
    expect(capture.facts.reset_password_event).toBe(
      "event :reset_password, :prepare_to_validate, on: :update, trigger: :required do",
    );
    expect(capture.facts.reset_password_event_body).toBe(
      "verifying_token :reset_password_success, :reset_password_failure",
    );
    expect(capture.facts.requiring_token).toBe("def requiring_token");
    expect(capture.facts.requiring_token_body).toBe(
      "if (token = Env.params[:token])",
    );
    expect(capture.facts.requiring_token_error).toBe(
      'errors.add :token, "is required"',
    );
    expect(capture.facts.reset_password_success).toBe(
      "def reset_password_success",
    );
    expect(capture.facts.reset_password_success_signin).toBe(
      "Auth.signin accounted_id",
    );
    expect(capture.facts.reset_password_success_body).toBe(
      "success << { id: name, view: :edit }",
    );
    expect(capture.facts.reset_password_failure).toBe(
      "def reset_password_failure error_message",
    );
    expect(capture.facts.reset_password_failure_body).toBe(
      "Auth.as_bot { send_password_reset_email }",
    );
  });

  it("the delivery addresses the account's own email field", () => {
    expect(capture.facts.send_account_email).toBe(
      "def send_account_email email_template",
    );
    expect(capture.facts.send_account_email_body).toBe(
      "ecard.deliver self, to: email",
    );
  });

  it("the token codec signs and decodes the link's claim", () => {
    expect(capture.facts.token_encode).toBe(
      "def encode user_id, extra_payload={}",
    );
    expect(capture.facts.token_encode_body).toBe(
      "payload = { user_id: user_id, exp: expiration }.merge(extra_payload)",
    );
    expect(capture.facts.token_decode).toBe("def decode token");
  });

  it("the capture names the gemsets it photographed", () => {
    expect(capture.oracle.send_reset_password_token_event.gem).toBe(
      "card-mod-account-0.20.0",
    );
    expect(capture.oracle.reset_password_url_view.gem).toBe(
      "card-mod-account-0.20.0",
    );
    expect(capture.oracle.reset_password_event.gem).toBe(
      "card-mod-account-0.20.0",
    );
    expect(capture.oracle.token_encode.gem).toBe("card-1.110.0");
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port's request ladder refuses a blank and an unknown address", () => {
    expect(portResetFlows).toContain(
      "export async function sendResetPasswordToken(",
    );
    expect(portResetFlows).toContain(
      'if (rubyStrip(rawEmail) === "") {',
    );
    expect(portResetFlows).toContain(
      'if (account !== undefined && account.status !== "active") {',
    );
    expect(portResetFlows).toContain(
      'reason: "not_recognized",\n      message: ACCOUNT_EN.error_not_recognized,',
    );
  });

  it("the port's link carries the trigger and the token", () => {
    expect(portResetFlows).toContain(
      "export async function buildAccountTokenUrl(",
    );
    expect(portResetFlows).toContain(
      "`?${toParamQuery({ trigger: parts.trigger }, token)}`;",
    );
    expect(portResetFlows).toContain(
      'const pairs: string[] = [];',
    );
    expect(portResetFlows).toContain(
      "pairs.push(`${cgiEscape(`card[${key}]`)}=${cgiEscape(value)}`);",
    );
  });

  it("the port's message carries the pinned subject and the link token", () => {
    expect(portResetFlows).toContain(
      'subject: "reset password for {{:title|core}}",',
    );
    expect(portResetFlows).toContain(
      "await ctx.transport.sendMail({ ...mail, to: account.email });",
    );
  });

  it("the port's confirm arm signs the holder in and lands on the edit form", () => {
    expect(portResetFlows).toContain(
      "export async function confirmPasswordReset(",
    );
    expect(portResetFlows).toContain(
      "const session = await ctx.sessions.createSession(account.holder.id);",
    );
    expect(portResetFlows).toContain(
      'redirectTo: { name: account.name, view: "edit" },',
    );
  });

  it("the port's trigger route is the signin update's own entry point", () => {
    expect(portWriteRoutes).toContain(
      'if (parsed.card["trigger"] === "send_reset_password_token") {',
    );
    expect(portWriteRoutes).toContain(
      "async function handleResetPasswordTrigger(",
    );
    expect(portWriteRoutes).toContain(
      "const outcome = await sendResetPasswordToken(",
    );
  });

  it("the port's acknowledgment and the token codec are the pinned ones", () => {
    expect(portAccount).toContain(
      'account_check_email: "Check your email for a link to reset your password",',
    );
    expect(portAccount).toContain(
      "const resetPasswordSuccessView: ViewFn = (ctx) =>",
    );
    expect(portToken).toContain(
      "export async function encodeAuthToken(",
    );
    expect(portToken).toContain(
      "export async function decodeAuthToken(",
    );
  });
});

describe("the harness's A5 legs cannot pass vacuously", () => {
  it("the row declares exactly the mail-reset module's four check names", () => {
    const row = capabilities.capabilities.find((c: { id: string }) => c.id === "A5");
    expect(row).toBeDefined();
    expect(row.checks).toEqual([
      "reset request reaches the captured test inbox with visible acknowledgment",
      "captured reset link signs member into the password form",
      "reset password persists and rejects the old credential",
      "reset journey restores its original fixture credential",
    ]);
    for (const name of row.checks) {
      const recorded = [
        `record('${name}'`,
        `record("${name}"`,
        `record(capabilityChecks[`,
      ].some((shape) => mailResetModule.includes(shape));
      expect(recorded, `the mail-reset module records the check "${name}"`).toBe(
        true,
      );
    }
  });

  it("the mail-reset module arms the owned local capture and refuses a live target", () => {
    expect(mailResetModule).toContain(
      "export const meta={topic:'mail-reset',capabilityIds:['A5'],requiresMail:true};",
    );
    expect(mailResetModule).toContain(
      "mail reset requires the disposable loopback deck",
    );
    expect(mailResetModule).toContain(
      "mail reset requires owned capture and fixture quarantine support",
    );
  });

  it("the request leg grades the delivered message AND the visible acknowledgment", () => {
    expect(mailResetModule).toContain(
      "const delivered=mail.inbox.filter(m=>m.to===creds.member.email&&m.subject.startsWith('reset password for '));",
    );
    expect(mailResetModule).toContain(
      "acknowledged=await p.waitForFunction(()=>/check your email[\\s\\S]*link[\\s\\S]*reset your password/i.test(document.body?.innerText ?? \"\"),undefined,{timeout:10000}).then(()=>true,()=>false);",
    );
  });

  it("the link leg grades the OWNED account's own link and the session it opens", () => {
    expect(mailResetModule).toContain(
      "const validLink=parsed?.origin===stack.origin&&decodeURIComponent(parsed.pathname)==='/update/'+accountName.replaceAll(' ','_')&&parsed.searchParams.get('card[trigger]')==='reset_password'&&Boolean(parsed.searchParams.get('token'));",
    );
    expect(mailResetModule).toContain(
      "record(capabilityChecks[1],landed.status()<400&&session,",
    );
  });

  it("the persistence leg grades the stored digest and the OLD credential's refusal", () => {
    expect(mailResetModule).toContain(
      "const changed=database().prepare('SELECT db_content FROM cards WHERE id=? AND trash=0').get(info.password_id)?.db_content!==info.digest;",
    );
    expect(mailResetModule).toContain(
      "record(capabilityChecks[2],save.response.status()<400&&changed&&fresh.hasSessionCookie&&fresh.landing.signedIn&&!old.hasSessionCookie,",
    );
  });

  it("the restore leg grades the fixture's own credential coming back", () => {
    expect(mailResetModule).toContain(
      "record(capabilityChecks[3],restored,{restored});",
    );
    expect(mailResetModule).toContain(
      "if(!restored)fixtureState.fatalReason='password reset fixture credential could not be restored';",
    );
  });

  it("the harness arms the local mail capture for the mail-required module", () => {
    expect(harness).toContain(
      "const mailRequired=checkModules.some(({meta,checks})=>meta.requiresMail===true&&",
    );
    expect(harness).toContain(
      "host-override target (${liveWalk.origin}, mode ${liveWalk.mode}): owned local mail capture is impossible; refusing mail-required check modules:",
    );
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("reset request");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/password-reset-request.json",
        "utf8",
      ),
    ).toContain('"send_reset_password_token_event"');
  });
});

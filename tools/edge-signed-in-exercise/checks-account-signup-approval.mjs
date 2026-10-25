// checks-account-signup-approval.mjs - the administrator approval step of
// the signup activation journey, the enumeration audit's gap 27
// (docs/runs/enumeration-audit-2026-10-25.md part A5;
// docs/runs/enumeration-audit-2026-10-25.gaps.json entry 27, element "the
// administrator approval step of the signup activation journey").
//
// THE JOURNEY IS THE SPEC. reference-harness/browser/journeys/
// acceptance-account-date.json, journey account-signup-activation-complete,
// covers "administrator approval required by fixture create permission",
// and the steps the audit cites are:
//   signin admin - visit /<SignupName> - observe "administrator reviews
//   pending signup" - click link "Send verification email" - observe
//   "administrator sent verification email" - and the activation mail only
//   then arrives (the journey's mail_link step reads it).
// The audit's why_no_row: "cap-A4 and mx-159 cover signing up and signing
// in; no row covers the administrator's approval-and-send step on a pending
// signup."
//
// THE PENDING STATE IS THE DECK'S OWN DEFAULT. A sign-up whose creator
// cannot approve starts "unapproved" and no mail goes out at create
// (src/card/auth/account-fields.ts: planAccountFields - `holderIsSignup ?
// (canApprove ? "unverified" : "unapproved") : "active"`, and
// requestVerification only when canApprove). This source deck carries no
// User+*type+*create rule (the accounted cardtype is named Person, codename
// user unchanged), so the anonymous submitter of the journey's sign-up form
// cannot approve, and the card waits. The administrator's approval is the
// update save of the Sign up card carrying card[trigger]
// =approve_with_verification (src/server/write-routes.ts approveSignup,
// the port of card-mod-account set/type/signup.rb:24-35's
// verification_links view links, whose rendered page the signed-in parity
// test pins byte for byte): it sets +*account+*status to "unverified" and
// the account-mail seat sends the verification mail at integrate.
//
// The links, the mail's subject and the verify link's shape are not
// guesses: the approval link's bytes are the signed-in parity test's
// (tests/card/render/signed-in-parity.test.ts), and the mail contracts are
// the ones cap-A4's module grades (lib/signup-then-signin.mjs, against the
// committed Ruby captures).
//
// Selected by `--only account-signup-approval`.

import {
  verificationMailContract,
  verifyLinkContract,
  SIGNUP_FORM_FIELDS,
  SIGNUP_FORM_ACTION,
} from './lib/signup-then-signin.mjs';

export const meta = {
  topic: 'account-signup-approval',
  capabilityIds: ['A6'],
  requiresMail: true,
};

export const capabilityChecks = {
  A6: [
    'A6 the anonymous sign-up on a deck that leaves approval to the administrator creates a pending Sign up card and sends no verification mail itself',
    'A6 the pending sign-up\'s page offers the signed-in administrator the Send verification email link and offers it to no anonymous reader',
    'A6 the administrator\'s Send verification email click marks the account unverified and sends the verification mail',
    'A6 the approval\'s mail carries the account\'s verification link with its token',
  ],
};

/** A card row by name, or by the junction pair when the name column is
 *  null (the engine writes NULL names for compound cards). */
function resolveCard(db, name) {
  const direct = db.prepare('SELECT id,name,db_content FROM cards WHERE name=? AND trash=0').get(name);
  if (direct !== undefined) return direct;
  const joint = name.lastIndexOf('+');
  if (joint < 1 || joint === name.length - 1) return undefined;
  const left = resolveCard(db, name.slice(0, joint));
  const right = resolveCard(db, name.slice(joint + 1));
  if (left === undefined || right === undefined) return undefined;
  return db.prepare('SELECT id,name,db_content FROM cards WHERE left_id=? AND right_id=? AND trash=0')
    .get(left.id, right.id);
}

/** The signup's account status content ("<Name>+*account+*status"). */
function accountStatus(db, accountName) {
  return resolveCard(db, `${accountName}+*account+*status`)?.db_content ?? null;
}

export const checks = [
  {
    name: 'a pending sign-up is approved and its verification email is sent by the administrator',
    only: 'account-signup-approval',
    run: async (ctx) => {
      const { stack, creds, database, record, created, mail, captureEvidence } = ctx;
      if (!mail?.enabled) throw Error('the approval\'s verification mail requires the owned capture (requiresMail is declared by this module)');
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(stack.origin).hostname)) {
        throw Error('the sign-up approval runs on the disposable loopback deck only');
      }
      const stamp = Date.now().toString(36);
      const accountName = `Harness_Approval_${stamp}`;
      const accountEmail = `harness-approval-${stamp}@harness.invalid`;
      const accountPassword = `Harness_${stamp}_2!`;
      created.push(accountName);
      let admin;
      let anon;
      try {
        // --- the anonymous sign-up (the journey's Sign up, fill, Submit) --
        anon = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        const anonPage = anon.page;
        await anonPage.goto(stack.origin + '/', { waitUntil: 'load' });
        // the journey clicks the navbar's "Sign up" link
        await anonPage.locator('a.nav-link.signup-link').first().click();
        await anonPage.waitForURL(/\/new\/Sign_up/, { timeout: 30000 });
        const formHtml = await anonPage.content();
        if (!formHtml.includes(`name="${SIGNUP_FORM_FIELDS.email}"`)) {
          throw Error('the sign-up form the navbar opens does not carry Ruby\'s account field names');
        }
        // The :new view hides the name formgroup and pre-fills it from the
        // request; the journey's harness fills card[name] directly, and the
        // hidden input takes its value the same way the request-name arm
        // would put it there.
        await anonPage.evaluate((value) => {
          const input = document.querySelector('input[name="card[name]"]');
          if (input) input.value = value;
        }, accountName);
        await anonPage.fill(`input[name="${SIGNUP_FORM_FIELDS.email}"]`, accountEmail);
        await anonPage.fill(`input[name="${SIGNUP_FORM_FIELDS.password}"]`, accountPassword);
        const pending = anonPage.waitForResponse((response) => {
          const url = new URL(response.url());
          return url.origin === stack.origin && url.pathname === SIGNUP_FORM_ACTION && response.request().method() === 'POST';
        }, { timeout: 60000 });
        await anonPage.locator('form.card-form .create-submit-button').first().click();
        const observed = await pending;
        await observed.response.finished();

        // The pending state: the card stored, the account status
        // "unapproved", and the inbox silent - the mail only arrives once
        // the administrator sends it (the journey's own ordering: the
        // activation mail comes AFTER the approval click).
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const storedRow = database().prepare('SELECT id,name,type_id FROM cards WHERE name=? AND trash=0').get(accountName);
        const statusBefore = accountStatus(database(), accountName);
        const mailsBefore = mail.inbox.filter((m) => m.to === accountEmail).length;
        record(capabilityChecks.A6[0], observed.response.status() < 400 && storedRow !== undefined && statusBefore === 'unapproved' && mailsBefore === 0, {
          actor: 'anonymous',
          account: accountName,
          createStatus: observed.response.status(),
          storedRow: storedRow ? { id: storedRow.id, typeId: storedRow.type_id } : null,
          accountStatusBefore: statusBefore,
          mailsForAddress: mailsBefore,
          deckCarriesAnyoneCreateRule: resolveCard(database(), 'Person+*type+*create') !== undefined || resolveCard(database(), 'User+*type+*create') !== undefined,
          raw: captureEvidence(formHtml, { check: 'account-signup-approval-form' }),
        });

        // --- who the pending page offers the approval to ------------------
        const anonView = await anonPage.goto(stack.origin + '/' + accountName, { waitUntil: 'load' });
        const anonViewHtml = await anonPage.content();

        // --- the administrator reviews and sends (the journey's steps) ----
        admin = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        const page = admin.page;
        await page.goto(stack.origin + '/*signin', { waitUntil: 'load' });
        await page.fill('input[name="card[subcards][+*email][content]"]', creds.admin.email);
        await page.fill('input[type="password"]', creds.admin.password);
        const pendingSignIn = page.waitForResponse(
          r => new URL(r.url()).pathname === '/update/*signin' && r.request().method() === 'POST',
          { timeout: 20000 },
        );
        await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
        const signInResponse = await pendingSignIn;
        await signInResponse.finished();
        if (signInResponse.status() >= 400) throw Error('account-signup-approval admin was not signed in');

        const adminView = await page.goto(stack.origin + '/' + accountName, { waitUntil: 'load' });
        const adminHtml = await page.content();
        const approvalLinkCount = (adminHtml.match(/approve_with_verification/g) ?? []).length;
        record(capabilityChecks.A6[1], adminView?.status() === 200 && adminHtml.includes('Send verification email') && approvalLinkCount > 0 && !anonViewHtml.includes('approve_with_verification'), {
          administrator: creds.admin.name,
          account: accountName,
          pageStatus: adminView?.status() ?? null,
          anonymousPageStatus: anonView?.status() ?? null,
          linkOnAdminPage: adminHtml.includes('Send verification email'),
          approveTriggerCount: approvalLinkCount,
          linkOnAnonymousPage: anonViewHtml.includes('approve_with_verification'),
          raw: captureEvidence(adminHtml, { check: 'account-signup-approval-links', accountName }),
        });

        // the click: the link is the view's own known-card anchor
        const approvalPending = page.waitForResponse(
          r => r.url().includes('approve_with_verification') && r.request().method() === 'GET',
          { timeout: 30000 },
        );
        await page.locator('a:has-text("Send verification email")').first().click();
        const approvalResponse = await approvalPending;
        await approvalResponse.finished();

        // The sent state: status "unverified", the verification mail in the
        // owned capture, its link the account's own verify url with the
        // token (the journey's mail_link step reads exactly this mail).
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const statusAfter = accountStatus(database(), accountName);
        const messages = mail.inbox.filter((m) => m.to === accountEmail);
        const delivered = messages.at(-1);
        const mailVerdict = verificationMailContract(
          { subject: delivered?.subject ?? null, textBody: delivered?.textBody ?? null, htmlBody: delivered?.htmlBody ?? null },
          { siteTitle: undefined },
        );
        record(capabilityChecks.A6[2], approvalResponse.status() < 400 && statusAfter === 'unverified' && messages.length > 0 && mailVerdict.ok, {
          administrator: creds.admin.name,
          account: accountName,
          approvalStatus: approvalResponse.status(),
          approvalUrl: approvalResponse.url(),
          accountStatusAfter: statusAfter,
          mailsForAddress: messages.length,
          subject: delivered?.subject ?? null,
          failures: mailVerdict.failures,
          ruby: 'card-mod-account set/type/signup.rb request_verification + send_verification_email; the delivered mail pinned by the committed Ruby capture the A4 module grades',
        });

        const linkVerdict = verifyLinkContract(mailVerdict.link?.url ?? null, { accountName: `${accountName}+*account` });
        record(capabilityChecks.A6[3], linkVerdict.ok, {
          account: accountName,
          url: mailVerdict.link?.url ?? null,
          from: mailVerdict.link?.from ?? null,
          failures: linkVerdict.failures,
          ruby: 'the committed Ruby capture\'s verify url: "/update/<Name>+*account?card[trigger]=verify_and_activate&token=..."',
        });
      } finally {
        await anon?.close().catch(() => {});
        await admin?.close().catch(() => {});
      }
    },
  },
];

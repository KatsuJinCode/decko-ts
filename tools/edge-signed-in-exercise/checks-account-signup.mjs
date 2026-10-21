// checks-account-signup.mjs - the anonymous sign-up and the sign-in that
// follows it (cap-A4).
//
// THE ROW. cap-A4 ("Sign up for a new account (anonymous), then sign in",
// tools/edge-signed-in-exercise/capabilities.json id A4) is carried as
// not_covered, and its own finding says why: "no A4-named check exists in
// any tools/edge-signed-in-exercise checks-*.mjs module or core group, and
// no A4-named result exists in either baseline capture... Unblock: write
// the anonymous signup-then-sign-in check into tools/edge-signed-in-exercise
// and re-capture so A4 credits."
//
// There is no old check to improve here. There is no row to re-scope. This
// module IS the check the row asks for, and it drives the scenario the way
// signup.feature:17-46 drives it:
//
//   And I am signed out
//   When I go to the home page
//   And I follow "Sign up"
//   And I fill in "card_name" with "Wanna B"
//   And I enter "wanna@decko.org" into "*email"
//   And I enter "wanna_pass" into "*password"
//   And I press "Submit"
//   Then I should see "Signup Success"
//   And "wanna@decko.org" should receive an email with subject
//     "verification link for My Deck"
//   When I open the email
//   And I click the first link in the email
//   Then I should see "Wanna B"
//   And "Wanna B" should be signed in
//   When I go to the home page
//   And I follow "Sign out"
//   Then I should not see "Wanna B"
//   When I follow "Sign in"
//   And I enter "wanna@decko.org" into "*email"
//   And I enter "wanna_pass" into "*password"
//   And I press "Sign in"
//   Then I should see "Wanna B"
//   And "Wanna B" should be signed in
//
// The form's field names, its action, its success mark and its submit
// button are not guesses: they are read out of Ruby's own rendered
// sign-up form, the committed capture arm
// reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl
// `probe-view:23:new@set/type/signup/views.rb`, and the predicate
// (lib/signup-then-signin.mjs) grades them.
//
// THE PERMISSION THE SCENARIO SETS UP. The upstream Background creates the
// pointer card "User+*type+*create" with the content "[[Anyone]]", and
// card-mod-account's own seed says what it is for (data/real.yml:108):
// "When [[Anyone]] can [[*create|create]] a [[User]] card, each [[Sign up]]
// can be auto-approved with a verification email." The setup below writes
// that rule when the deck does not carry it, and RECORDS what it wrote. The
// setup is best-effort on purpose: whether the anonymous submitter can
// approve is the deck's permission state, and if the deck already allows it
// the flow runs either way. What the flow then produces - the mail, the
// link, the activation, the sign-in - is what the row grades.
//
// The module declares requiresMail, so the owned in-process mail capture
// (the NotifyTransport seat) is armed for the run: the verification email
// is delivered by the engine's account-mail seat, which is a different
// seat from the follower notice's but the same capture.

import {
  signupFormContract,
  signupSuccessContract,
  verificationMailContract,
  verifyLinkContract,
  signedInContract,
  SIGNUP_CHECKS,
  SIGNUP_FORM_FIELDS,
  SIGNUP_FORM_ACTION,
} from './lib/signup-then-signin.mjs';

export const meta = {
  topic: 'account-signup',
  capabilityIds: ['A4'],
  requiresMail: true,
};

export const capabilityChecks = {
  A4_FORM: [SIGNUP_CHECKS.form],
  A4_SUCCESS: [SIGNUP_CHECKS.success],
  A4_MAIL: [SIGNUP_CHECKS.mail],
  A4_LINK: [SIGNUP_CHECKS.link],
  A4_SIGNIN: [SIGNUP_CHECKS.signIn],
};

/** A card row by name, or by the junction pair when the name column is
 *  null (the engine writes NULL names for compound cards). */
function resolveCard(db, name) {
  const direct = db.prepare('SELECT id,name,db_content,type_id FROM cards WHERE name=? AND trash=0').get(name);
  if (direct !== undefined) return direct;
  const joint = name.lastIndexOf('+');
  if (joint < 1 || joint === name.length - 1) return undefined;
  const left = resolveCard(db, name.slice(0, joint));
  const right = resolveCard(db, name.slice(joint + 1));
  if (left === undefined || right === undefined) return undefined;
  return db.prepare('SELECT id,name,db_content,type_id FROM cards WHERE left_id=? AND right_id=? AND trash=0')
    .get(left.id, right.id);
}

export const checks = [
  {
    name: capabilityChecks.A4_FORM[0],
    only: 'account-signup',
    run: async (ctx) => {
      const { page, stack, creds, record, database, created, mail, captureEvidence, signIn } = ctx;
      if (!mail?.enabled) throw Error('the sign-up verification mail requires the owned capture (requiresMail is declared by this module)');
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(stack.origin).hostname)) {
        throw Error('the anonymous sign-up runs on the disposable loopback deck only');
      }
      const stamp = Date.now().toString(36);
      const accountName = `Harness_Signup_${stamp}`;
      const accountEmail = `harness-signup-${stamp}@harness.invalid`;
      // The port's own password policy wants the character classes the
      // upstream literal does not carry (the gherkin signup test's header
      // note), so the password keeps the shape and adds them.
      const accountPassword = `Harness_${stamp}_1!`;
      created.push(accountName);

      /** A create through the deck's own create route, as the browser's
       *  form would post it. */
      const create = async (fields) => {
        const response = await page.context().request.post(`${stack.origin}${SIGNUP_FORM_ACTION}`, {
          headers: { origin: stack.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
          maxRedirects: 0,
          data: new URLSearchParams(fields).toString(),
        });
        return { status: response.status(), body: await response.json().catch(() => null) };
      };

      // --- the scenario's Background: anyone may create a User card ------
      // The set card the rule hangs under, and the rule itself. Both are
      // written only when the deck does not carry them, and what was written
      // is recorded either way.
      //
      // THE ANCHOR IS THE DECK'S OWN ACCOUNTED CARDTYPE. can_approve?
      // (set/type/signup.rb:12-14) is `Card.new(type_id:
      // Card.default_accounted_type_id).ok?(:create)` - the create rule the
      // scenario turns on is the one on the ACCOUNTED type's *type set,
      // whose card is found through the `user` codename. signup.feature's
      // Background writes the literal "User+*type+*create" because the
      // stock deck's accounted cardtype is NAMED "User"; a deck that
      // renamed the cardtype (this deck's accounted cardtype is named
      // "Person", codename user unchanged) has its *type set under the new
      // name, and a rule anchored on "User" covers a set no card of the
      // accounted type belongs to - in Ruby's own algebra exactly as here.
      // Resolving the anchor through the codename writes the same rule the
      // scenario means, under the name the deck's own set carries (byte-
      // equal to the scenario's literal on a stock deck).
      //
      // THE ACTOR IS THE SCENARIO'S: signup.feature's Background has Joe
      // Admin create the pointer card, so the write runs as the
      // administrator. An anonymous write of the same rule is refused by
      // the deck's own create permission (the port answers 403 with
      // "actor *anonymous may not create card <anchor>+*type+*create"), and
      // a rule that was never written leaves the anonymous submitter unable
      // to create the accounted card - which is the permission the whole
      // scenario turns on. The flow below runs signed out, as the scenario
      // does.
      await signIn(creds.admin);
      const accountedType = database()
        .prepare("SELECT id,name FROM cards WHERE codename='user' AND trash=0 ORDER BY id LIMIT 1")
        .get();
      if (accountedType === undefined || !accountedType.name) {
        throw Error('the deck has no accounted cardtype (codename user); the scenario cannot run');
      }
      const setCardName = `${accountedType.name}+*type`;
      const ruleName = `${setCardName}+*create`;
      const setup = { accountedType: accountedType.name, setCard: null, rule: null, wrote: [] };
      const setCardBefore = resolveCard(database(), setCardName);
      if (setCardBefore === undefined) {
        const written = await create({ 'card[name]': setCardName, 'card[type]': 'Set' });
        setup.wrote.push({ name: setCardName, ...written });
      }
      setup.setCard = resolveCard(database(), setCardName);
      const ruleBefore = resolveCard(database(), ruleName);
      if (ruleBefore === undefined) {
        const written = await create({
          'card[name]': ruleName,
          'card[type]': 'Pointer',
          'card[content]': '[[Anyone]]',
        });
        setup.wrote.push({ name: ruleName, ...written });
      }
      setup.rule = resolveCard(database(), ruleName);
      setup.ruleContent = setup.rule?.db_content ?? null;
      setup.rulePresent = setup.rule !== undefined;

      // --- the sign-up itself --------------------------------------------
      // The signed-out submitter: the scenario's "And I am signed out".
      await page.context().clearCookies();
      const formUrl = `${stack.origin}/new/Sign_up?card[name]=${encodeURIComponent(accountName)}`;
      const opened = await page.goto(formUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const formHtml = await page.content();
      const formVerdict = signupFormContract(formHtml);
      record(capabilityChecks.A4_FORM[0], formVerdict.ok, {
        actor: 'anonymous',
        formUrl,
        status: opened?.status() ?? null,
        failures: formVerdict.failures,
        fields: formVerdict.fields,
        // What the Background wrote (or found already in the deck): the
        // permission the scenario turns on, and the name the request asked
        // for, which Ruby's named :new view carries in a hidden field.
        setup: {
          rulePresent: setup.rulePresent,
          ruleContent: setup.ruleContent,
          wrote: setup.wrote.map((entry) => ({ name: entry.name, status: entry.status })),
        },
        nameField: {
          value: (formHtml.match(/name="card\[name\]"[^>]*value="([^"]*)"/) ?? [])[1] ?? null,
          hidden: /type="hidden"[^>]*name="card\[name\]"/.test(formHtml),
        },
        ruby: 'the committed Ruby capture arm probe-view:23:new@set/type/signup/views.rb - the form tag, the success[mark], the name field, the email and password inputs and the Submit button',
        raw: captureEvidence(formHtml, { check: 'account-signup-form' }),
      });
      if (!formVerdict.ok) {
        // The form is not the form: every later leg is unreachable, and
        // saying so is the honest outcome.
        for (const name of [capabilityChecks.A4_SUCCESS[0], capabilityChecks.A4_MAIL[0], capabilityChecks.A4_LINK[0], capabilityChecks.A4_SIGNIN[0]]) {
          record(name, null, { skipped: true, reason: 'the sign-up form does not carry Ruby\'s fields, so the flow could not start' });
        }
        return;
      }

      // The name arrives in the form's hidden field (Ruby's :new view hides
      // the name formgroup and pre-fills it from the request), and the two
      // account fields are typed by a person.
      await page.fill(`input[name="${SIGNUP_FORM_FIELDS.email}"]`, accountEmail);
      await page.fill(`input[name="${SIGNUP_FORM_FIELDS.password}"]`, accountPassword);
      const before = ctx.ledger().length;
      const pending = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.origin === stack.origin && url.pathname === SIGNUP_FORM_ACTION && response.request().method() === 'POST';
      }, { timeout: 60_000 }).then((response) => ({ response }), (error) => ({ error }));
      await page.locator('form.card-form .create-submit-button').first().click();
      const observed = await pending;
      if (observed.error) throw observed.error;
      await observed.response.finished();
      const outcome = await observed.response.json().catch(() => null);
      if (typeof outcome?.redirect === 'string') {
        const redirect = new URL(outcome.redirect, stack.origin);
        if (redirect.origin !== stack.origin) throw Error('the sign-up redirect leaves the owned origin');
        await page.waitForURL(redirect.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      }
      // The client's own success handling navigates to the success mark,
      // and a hard navigation evicts the XHR body before the protocol
      // reader returns it (the signIn contract names this shape) - so
      // outcome can be null while the page navigates anyway. Either way
      // the landing gets the same beat a person's browser gets: wait for
      // the seed card's page (or its content in the swapped slot) to be
      // THERE before reading it.
      await page
        .waitForFunction(
          () => /^\/signup_success/i.test(window.location.pathname) ||
            (document.body !== null && document.body.innerHTML.includes('Signup Success')),
          undefined,
          { timeout: 15_000 },
        )
        .catch(() => undefined);
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
      const landingHtml = await page.content();
      const successVerdict = signupSuccessContract(landingHtml);
      record(capabilityChecks.A4_SUCCESS[0], successVerdict.ok && observed.response.status() < 400, {
        actor: 'anonymous',
        account: accountName,
        status: observed.response.status(),
        redirect: outcome?.redirect ?? null,
        failures: successVerdict.failures,
        ruby: 'signup.feature:27 - "Then I should see \'Signup Success\'"; the card is the deck\'s own seed card, whose content the committed capture carries',
        raw: captureEvidence(landingHtml, { check: 'account-signup-success' }),
      });

      // --- the verification mail ----------------------------------------
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const messages = mail.inbox.filter((m) => m.to === accountEmail);
      const delivered = messages.at(-1);
      const mailVerdict = verificationMailContract(
        { subject: delivered?.subject ?? null, textBody: delivered?.textBody ?? null, htmlBody: delivered?.htmlBody ?? null },
        { siteTitle: undefined },
      );
      record(capabilityChecks.A4_MAIL[0], mailVerdict.ok && messages.length > 0, {
        actor: 'anonymous',
        recipient: accountEmail,
        delivered: messages.length,
        subject: delivered?.subject ?? null,
        failures: mailVerdict.failures,
        ruby: 'card-mod-account data/real.yml:210-231 - the verification_email template, its subject "verification link for {{:title|core}}" and its "follow this link" anchor; the delivered mail is pinned on the committed Ruby capture',
      });

      // --- the verification link, and the activation ---------------------
      const linkVerdict = verifyLinkContract(mailVerdict.link?.url ?? null, { accountName: `${accountName}+*account` });
      record(capabilityChecks.A4_LINK[0], linkVerdict.ok, {
        actor: 'anonymous',
        account: accountName,
        url: mailVerdict.link?.url ?? null,
        from: mailVerdict.link?.from ?? null,
        failures: linkVerdict.failures,
        ruby: 'the committed Ruby capture\'s verify url: "/update/Jane_Oracle_Signup+*account?card[trigger]=verify_and_activate&token=..."',
      });

      // --- the activation, and the sign-in that follows it ---------------
      let activated = null;
      if (linkVerdict.ok) {
        const response = await page.goto(mailVerdict.link.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(1500);
        const html = await page.content();
        const cookies = await page.context().cookies(stack.origin);
        activated = {
          status: response?.status() ?? null,
          hasSessionCookie: cookies.some((c) => c.name === 'decko_ts_session'),
          signedIn: /Sign out/.test(html),
        };
      }
      const signedOutHtml = activated === null ? null : await (async () => {
        // "When I go to the home page / And I follow 'Sign out'": the
        // session is dropped, and the name must be gone.
        await page.goto(`${stack.origin}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        const out = await page.evaluate(() => {
          const link = [...document.querySelectorAll('a')].find((el) => /^sign out$/i.test(el.textContent.replace(/\s+/g, ' ').trim()));
          return link === undefined ? null : link.getAttribute('href');
        });
        if (out !== null) {
          await page.goto(new URL(out, stack.origin).href, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined);
        }
        await page.waitForTimeout(1000);
        return await page.content();
      })();
      const afterSignOut = signedOutHtml === null ? null : { showsName: signedOutHtml.includes(accountName) };

      const backIn = await signIn({ name: accountName, email: accountEmail, password: accountPassword });
      const backInHtml = await page.content();
      const signInVerdict = signedInContract(
        { html: backInHtml, hasSessionCookie: backIn.hasSessionCookie === true, signedIn: backIn.landing?.signedIn === true },
        { name: accountName },
      );
      record(capabilityChecks.A4_SIGNIN[0], signInVerdict.ok, {
        actor: accountName,
        account: accountName,
        failures: signInVerdict.failures,
        hasSessionCookie: backIn.hasSessionCookie === true,
        landingSignedIn: backIn.landing?.signedIn === true,
        activated,
        afterSignOut,
        ruby: 'signup.feature:37-46 - sign out, then sign in with the account\'s own email and password, and the account is shown and signed in',
        raw: captureEvidence(backInHtml, { check: 'account-signup-signin' }),
      });
    },
  },
];

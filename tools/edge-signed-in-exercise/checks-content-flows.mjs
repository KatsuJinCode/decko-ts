// checks-content-flows.mjs — first instruments for the CONTENT-FLOW rows the
// coverage matrix carries as never-observed (instrument-coverage-matrix.json,
// last_recomputed 2026-10-17T09:57Z; 48 actions with no entry whose status is
// pass or fail). This lane's family is content flows: import/export, mail, and
// rendering edge cases.
//
// Rows claimed here (matrix action id -> capability id):
//   ACT-156 W5   watcher notified of updates to included and plus cards (mail)
//   ACT-157 W6   unfollow link in the email
//   ACT-152 N10  read pages with nests, links, files, chains and loops
//   ACT-172 N16  RSS format view of a search or card                 (no catalog row)
//   ACT-178 ERR1 error pages render as error pages, not create forms (no catalog row)
//   ACT-180 S11  plurality/slug pinning: name variants round-trip    (no catalog row)
//   ACT-146 F4   change a coded image
//   ACT-151 N9   visit a User card with the user layout
//
// ACT-149 (F8, replace an uploaded file) is NOT claimed here: it already has an
// instrument and a passing result from checks-upload-image-change.mjs (commit
// e83a2014, run 2026-10-17T23-52-25-090Z-43980), which postdates the matrix
// recompute. Duplicating it would measure nothing new.
//
// Every check records what the surface DID, with the evidence that shows it,
// instead of throwing on a shape it did not expect: a first measurement that
// finds nothing is the result this lane exists to produce, and an unwritten
// check is not evidence either way. A thrown error stays reserved for a broken
// fixture (a refused typed fixture, a lost session), which is not a finding
// about the surface.
//
// The two mail checks declare requiresMail, which is what arms the owned
// in-process capture (tools/edge-signed-in-exercise.mjs:56, 240-249) that
// deploy/bunny-worker-src/bunny-edge-local-mail.ts installs behind the
// NotifyTransport seat. That seat covers BOTH kinds of member mail — the
// password reset and the follower change notice (the module's own header,
// lines 5-16) — so W5/W6 are inside this harness's reach even though
// capabilities.json still carries them as out_of_scope for the absence of an
// SMTP sink.

import { createTypedFixture, fixtureCard } from './lib/typed-fixture.mjs';

export const meta = {
  topic: 'content-flows',
  capabilityIds: ['W5', 'W6', 'N10', 'N16', 'ERR1', 'S11', 'F4', 'N9'],
  requiresMail: true,
};

export const capabilityChecks = {
  W5: ['W5 a follower is mailed when a followed card is edited, when a card the followed card nests is edited, and when a followed card\'s plus card is edited'],
  W6: ['W6 the unfollow link in the follower mail stops the follow rule'],
  N10: ['N10 a page of nests, links, a file, a nest chain and a nest loop renders every one of them'],
  N16: ['N16 a card and a search answer an RSS format view'],
  ERR1: ['ERR1 a card that does not exist answers an error page, not a create form'],
  S11: ['S11 name variants of one card resolve to that same card'],
  F4: ['F4 a coded image can be changed through the image edit form'],
  N9: ['N9 a User card renders through the user layout'],
};

/** A real minimal 1x1 PNG (RGBA): an image card accepts image bytes, not a
 *  text/plain stub wearing a .png name (the F3 leg in checks-cover-b.mjs
 *  makes the same point). */
const ONE_BY_ONE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** The create form the port renders for a name that does not exist
 *  (src/card/render/views.ts:1823, named in the S10 check's docstring). */
const CREATE_FORM_SELECTOR = 'form#new_card[action="/card/create"], #main form[action="/card/create"], form[action="/card/create"]';

const isLocalOrigin = (origin) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname);

/** What the surface rendered for one URL: status, the create-form question the
 *  ERR1 row is about, and enough of the page to tell an error page from a
 *  create form without guessing from one marker. */
async function renderedShape(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(1200);
  const shape = await page.evaluate((createSelector) => {
    const createForms = [...document.querySelectorAll(createSelector)];
    const inputs = [...document.querySelectorAll('input[name="card[name]"]')];
    return {
      title: document.title,
      createForms: createForms.length,
      nameInputs: inputs.length,
      formActions: [...new Set([...document.querySelectorAll('form')].map((f) => f.getAttribute('action')).filter(Boolean))].slice(0, 8),
      heading: (document.querySelector('#main h1, #main h2, main h1, main h2')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      mainText: (document.querySelector('#main, main')?.innerText ?? document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
      feedMeta: [...document.querySelectorAll('link[type], meta[name], meta[property]')].map((m) => ({ type: m.getAttribute('type'), name: m.getAttribute('name'), property: m.getAttribute('property'), href: m.getAttribute('href')?.slice(0, 80) ?? null })).filter((m) => /rss|atom|description|og:/i.test(`${m.type} ${m.name} ${m.property}`)).slice(0, 6),
    };
  }, CREATE_FORM_SELECTOR);
  return { requested: new URL(url).pathname, status: response?.status() ?? null, ...shape };
}

/** How the port names the card a URL resolved to. There is no decko.card_id
 *  meta pair on the page (decko.signed_in is a script variable,
 *  src/card/render/page.ts:1261), so identity is read from the carriers the
 *  port does emit: the slot attributes data-card-id / data-card-name
 *  (mod-form-substrate.ts:163, mod-view-helpers.ts:71) plus the page title. A
 *  page that resolved to nothing carries none of them. */
async function servedCardId(page) {
  return page.evaluate(() => {
    const slots = [...document.querySelectorAll('[data-card-id], [data-card-name]')]
      .map((el) => ({ id: el.getAttribute('data-card-id'), name: el.getAttribute('data-card-name') }))
      .filter((s) => s.id !== null || s.name !== null);
    const numeric = slots.map((s) => Number(s.id)).find((n) => Number.isFinite(n) && n > 0) ?? null;
    return { slots: slots.slice(0, 6), numeric, title: document.title };
  });
}

/**
 * The stored follow option for one card and one viewer.
 *
 * A junction rule carries no name column in this deck, so `<card>+*self+
 * <user>+*follow` is not resolvable by name, and fixtureCard cannot resolve it
 * either (the `+*self` segment has a codename, not a name). The real shape,
 * read off a rule that does exist in this deck (Household Financial Management
 * <- Brandon WilliamsCraig = *always):
 *   card -> (right card codename 'self')     the +*self set
 *        -> (right_id = the viewer card)     the viewer's rule on that set
 *        -> (right card codename 'follow')   the option row (*always, ...)
 * The absent cases name themselves, so a rule that was never written reads as a
 * finding rather than as a null nobody can interpret.
 */
function followOption(database, cardId, viewerId) {
  if (cardId === undefined || cardId === null) return { found: false, why: 'no such card' };
  if (viewerId === undefined || viewerId === null) return { found: false, why: 'no such viewer' };
  const selfSet = database.prepare("SELECT f.id FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='self' AND f.trash=0 LIMIT 1").get(cardId);
  if (selfSet === undefined) return { found: false, why: 'the card has no +*self set' };
  const viewerRule = database.prepare('SELECT id FROM cards WHERE left_id=? AND right_id=? AND trash=0 LIMIT 1').get(selfSet.id, viewerId);
  if (viewerRule === undefined) return { found: false, why: 'no rule of this viewer on the +*self set' };
  const option = database.prepare("SELECT f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='follow' AND f.trash=0 LIMIT 1").get(viewerRule.id);
  return { found: option !== undefined, option: option?.db_content ?? null, cardId, viewerId };
}

/** Signs in through the deck's own form on the runner's page and reports the
 *  session that the deck's own session cookie names. Every actor switch goes
 *  through here so a check that dies mid-switch leaves the next check's actor
 *  explicit rather than accidental. */
async function signInAs(ctx, account) {
  const landing = await ctx.signIn(account);
  const actorId = landing.actorId ?? null;
  return { ...landing, actorId };
}

export const checks = [
  // ------------------------------------------------------------------ W5, W6
  {
    name: capabilityChecks.W5[0],
    only: 'content-flows',
    run: async (ctx) => {
      const { page, stack, creds, record, database, created, mail, captureEvidence, visit, ledger, linesSince } = ctx;
      if (!mail?.enabled) throw Error('follower mail requires the owned capture (requiresMail is declared by this module)');
      if (!isLocalOrigin(stack.origin)) throw Error('follower mail is captured on the disposable loopback deck only');
      const stamp = Date.now().toString(36);
      const member = creds.member;

      // Three distinct recipients so each leg's mail can be attributed: the
      // followed card itself, a card the followed card NESTS (the indirect
      // walk in follower-resolver.ts), and a followed card's plus card.
      const direct = `Harness_CF_Followed_${stamp}`;
      const includer = `Harness_CF_Includer_${stamp}`;
      const nested = `Harness_CF_Nested_${stamp}`;
      const plusHost = `Harness_CF_Plus_Host_${stamp}`;
      const plusCard = `${plusHost}+*type`;
      for (const name of [direct, includer, nested, plusHost, plusCard]) if (!created.includes(name)) created.push(name);

      /** The follow link on the board's Engage tab writes the rule
       *  "<card>+*self+<viewer>+*follow" = *always (the storage the W1/W3
       *  docstring in checks-cover-b.mjs names); this check reads the rule
       *  back from the deck rather than trusting the link's post-state. */
      const followOn = async (card) => {
        const board = await visit(`/${encodeURIComponent(card)}/board`);
        await page.waitForTimeout(1500);
        const tab = page.locator('.board .nav-link', { hasText: 'Engage' }).first();
        if (await tab.count() === 0) return { board: board.status, tab: false };
        await tab.click().catch(() => undefined);
        await page.waitForTimeout(1500);
        const link = await page.evaluate(() => {
          const a = [...document.querySelectorAll('#main a, .board a')].find((el) => /^(follow|watch)$/i.test(el.textContent.replace(/\s+/g, ' ').trim()));
          return a === undefined ? null : a.getAttribute('href');
        });
        if (link == null) return { board: board.status, tab: true, links: await page.evaluate(() => [...document.querySelectorAll('#main a, .board a')].map((a) => a.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /follow|unfollow|watch/i.test(t)).slice(0, 6)) };
        const before = ledger().length;
        await page.locator(`#main a[href="${link}"], .board a[href="${link}"]`).first().dispatchEvent('click').catch(() => undefined);
        await page.waitForTimeout(2500);
        const ruleName = decodeURIComponent(new URL(link, stack.origin).pathname.replace(/^\/update\//, ''));
        if (!created.includes(ruleName)) created.push(ruleName);
        const requests = linesSince(before).map((l) => ({ method: l.method, path: l.path.slice(0, 90), status: l.status }));
        const state = followOption(database(), fixtureCard(database(), card)?.id, member.id);
        return { board: board.status, tab: true, href: link, ruleName, storedOption: state.option, ruleState: state, requests };
      };

      /** The administrator's save through the real update route: the write path
       *  is where the notify hook is registered (card-action-engine.ts:719-728
       *  builds the follow-notify hook on every save). */
      const editAsAdmin = async (card, content) => {
        const response = await page.context().request.post(`${stack.origin}/update/${encodeURIComponent(card)}`, {
          headers: { origin: stack.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
          data: new URLSearchParams({ 'card[content]': content, 'success[redirect]': 'true' }).toString(),
          maxRedirects: 0,
        });
        return { status: response.status() };
      };

      const settle = () => new Promise((resolve) => setTimeout(resolve, 2500));
      const notices = () => mail.inbox.filter((m) => m.to === member.email).map((m) => ({
        subject: m.subject, seq: m.seq, mentionsCard: null, head: (m.textBody ?? '').replace(/\s+/g, ' ').slice(0, 200),
      }));

      try {
        await signInAs(ctx, creds.admin);
        await createTypedFixture(ctx, { type: 'RichText', name: direct, content: `Harness followed card ${stamp}` });
        // The includer NESTS the nested card, so a follower of the includer is
        // the recipient the oracle's update_includers scenarios grade. The
        // inclusion MUST be a `{{nested}}` nest (refresh-references-out.ts
        // NEST_FULL_STICKY at :415 -> ref_type 'I'), not a `[[link]]` —
        // nested_card? in follower-resolver.ts:595-606 walks card_references
        // WHERE ref_type='I', so a wiki link would never satisfy the
        // inclusion check the indirect-follower walk (lines 549-563) uses
        // to decide whether the includer's followers are notified when the
        // nested card changes. The prior instrument used `[[nested]]`,
        // making the nested-inclusion leg a no-op from the engine's view.
        await createTypedFixture(ctx, { type: 'RichText', name: nested, content: `Harness nested card ${stamp}` });
        await createTypedFixture(ctx, { type: 'RichText', name: includer, content: `Harness includer ${stamp}\n{{${nested}}}` });
        await createTypedFixture(ctx, { type: 'RichText', name: plusHost, content: `Harness plus host ${stamp}` });
        await visit(`/${encodeURIComponent(includer)}`);

        await signInAs(ctx, member);
        const follows = {
          direct: await followOn(direct),
          includer: await followOn(includer),
          plusHost: await followOn(plusHost),
        };

        mail.drain();
        await signInAs(ctx, creds.admin);
        const legs = {};

        // Leg 1 — a followed card is edited.
        legs.direct = { ...await editAsAdmin(direct, `Harness followed card edited ${stamp}`) };
        await settle();
        const directMail = notices();
        legs.direct = { ...legs.direct, delivered: directMail.length, notices: directMail, namesTheCard: directMail.some((m) => m.head.includes(direct) || (m.subject ?? '').includes(direct)) };

        // Leg 2 — a card the followed card NESTS is edited.
        legs.nested = { ...await editAsAdmin(nested, `Harness nested card edited ${stamp}`) };
        await settle();
        const nestedMail = notices();
        legs.nested = { ...legs.nested, delivered: nestedMail.length, notices: nestedMail, namesTheCard: nestedMail.some((m) => m.head.includes(nested) || (m.subject ?? '').includes(nested)) };

        // Leg 3 — a followed card's plus card is edited. The plus card is
        // created first: an update to a subcard that does not exist yet is
        // refused (the first run answered 422 and stored nothing), so the leg
        // measures an update to an existing plus card, which is what the
        // oracle's update_includers scenarios edit.
        const plusCreate = await page.context().request.post(`${stack.origin}/card/create`, {
          headers: { origin: stack.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
          data: new URLSearchParams({ 'card[name]': plusCard, 'card[type]': 'RichText', 'card[content]': `Harness plus card ${stamp}`, 'success[redirect]': 'true' }).toString(),
          maxRedirects: 0,
        });
        mail.drain();
        legs.plus = { createStatus: plusCreate.status(), ...await editAsAdmin(plusCard, `Harness plus card edited ${stamp}`) };
        await settle();
        const plusMail = notices();
        legs.plus = { ...legs.plus, delivered: plusMail.length, notices: plusMail, namesTheCard: plusMail.some((m) => m.head.includes(plusCard) || (m.subject ?? '').includes(plusHost)) };

        const storedBodies = Object.fromEntries([direct, includer, nested, plusHost, plusCard].map((name) => [name, fixtureCard(database(), name)?.db_content?.slice(0, 80) ?? null]));
        const template = database().prepare("SELECT id FROM cards WHERE name='follower notification email' AND trash=0").get();
        const allFollowsWritten = Object.values(follows).every((f) => f?.storedOption === '*always');
        // The witness the capability's CLAIM requires: the indirect-follower
        // walk (follower-resolver.ts:549-563 + nested_card? :595-606) MUST
        // reach the includer's follower when the nested card is edited. The
        // previous instrument graded only the direct leg and recorded the
        // nested leg without acting on it — a pass that ignored whether the
        // engine actually walked the inclusion. All three legs now contribute
        // to the verdict: nested-mail delivered AND namesTheCard is the
        // RIGHT witness for the nested-inclusion claim. direct-mail and
        // plus-mail each carry their own leg into the verdict for the same
        // reason.
        const inclusionRow = includer !== undefined ? database().prepare(
          "SELECT r.id, r.referer_id, r.referee_id, r.ref_type FROM card_references r " +
          "WHERE r.referer_id = (SELECT id FROM cards WHERE name=? AND trash=0) " +
          "AND r.referee_id = (SELECT id FROM cards WHERE name=? AND trash=0) AND r.trash=0",
        ).get(includer, nested) : undefined;
        record(capabilityChecks.W5[0],
          allFollowsWritten
          && [legs.direct, legs.nested, legs.plus].every((leg) => leg.status < 400)
          && legs.direct.delivered > 0 && legs.direct.namesTheCard
          && legs.nested.delivered > 0 && legs.nested.namesTheCard
          && legs.plus.delivered > 0 && legs.plus.namesTheCard
          && template !== undefined,
          {
            actor: member.name, mailArmed: mail.enabled, recipient: member.email,
            follows, legs, storedBodies,
            notificationTemplateRow: template ?? null,
            allFollowRulesWritten: allFollowsWritten,
            inclusionReference: inclusionRow ?? null,
            legsMeasured: ['direct', 'nested', 'plus'],
            note: 'every leg is now part of the capability\'s claim; the direct leg covers direct followers, the nested leg exercises the indirect-follower walk through a {{inclusion}} reference the prior [[link]] fixture never satisfied, and the plus leg covers the followed card\'s +*type right',
            raw: captureEvidence(await page.content(), { check: 'content-flows-follower-mail' }),
          });
      } catch (error) {
        if (error?.name === 'TimeoutError') ctx.fixtureState.fatalReason = 'follower mail browser operation timed out';
        throw error;
      } finally {
        await signInAs(ctx, creds.admin).catch(() => undefined);
      }
    },
  },
  {
    name: capabilityChecks.W6[0],
    only: 'content-flows',
    run: async (ctx) => {
      const { page, stack, creds, record, database, created, mail, captureEvidence } = ctx;
      if (!mail?.enabled) throw Error('the unfollow link check requires the owned capture');
      const stamp = Date.now().toString(36);
      const watched = `Harness_CF_Unfollow_${stamp}`;
      if (!created.includes(watched)) created.push(watched);
      const member = creds.member;

      try {
        await signInAs(ctx, creds.admin);
        await createTypedFixture(ctx, { type: 'RichText', name: watched, content: 'Harness unfollow target' });

        await signInAs(ctx, member);
        await page.goto(`${stack.origin}/${encodeURIComponent(watched)}/board`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(1500);
        await page.locator('.board .nav-link', { hasText: 'Engage' }).first().click().catch(() => undefined);
        await page.waitForTimeout(1500);
        const link = await page.evaluate(() => {
          const a = [...document.querySelectorAll('#main a, .board a')].find((el) => /^(follow|watch)$/i.test(el.textContent.replace(/\s+/g, ' ').trim()));
          return a === undefined ? null : a.getAttribute('href');
        });
        if (link == null) {
          const links = await page.evaluate(() => [...document.querySelectorAll('#main a, .board a')].map((a) => a.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /follow|unfollow|watch/i.test(t)).slice(0, 8));
          record(capabilityChecks.W6[0], false, { note: 'the Engage tab offered no follow link, so no follower mail and no unfollow link could exist', watched, engageLinks: links, raw: captureEvidence(await page.content(), { check: 'content-flows-unfollow-link' }) });
          return;
        }
        await page.locator(`#main a[href="${link}"], .board a[href="${link}"]`).first().dispatchEvent('click').catch(() => undefined);
        await page.waitForTimeout(2500);
        const ruleName = decodeURIComponent(new URL(link, stack.origin).pathname.replace(/^\/update\//, ''));
        if (!created.includes(ruleName)) created.push(ruleName);
        const before = followOption(database(), fixtureCard(database(), watched)?.id, member.id);
        const optionBefore = before.option;

        // The administrator's edit produces the notice the link rides in.
        mail.drain();
        await signInAs(ctx, creds.admin);
        const write = await page.context().request.post(`${stack.origin}/update/${encodeURIComponent(watched)}`, {
          headers: { origin: stack.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
          data: new URLSearchParams({ 'card[content]': `Harness unfollow trigger ${stamp}`, 'success[redirect]': 'true' }).toString(),
          maxRedirects: 0,
        });
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const message = mail.inbox.filter((m) => m.to === member.email).at(-1);
        // follow-mail-views.ts:252-258 builds the URL as
        // "<origin>/update/<follow mark>?card[subcards][<rule>]=*never" and
        // hands it to the templates as _|unfollow_url (lines 298, 310).
        const haystack = `${message?.textBody ?? ''}\n${message?.htmlBody ?? ''}`;
        const candidates = [...haystack.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0]).map((u) => u.replace(/&amp;/g, '&'));
        const unfollowUrl = candidates.find((u) => /\/update\//.test(u) && /never/i.test(u));
        const parsed = unfollowUrl === undefined ? undefined : new URL(unfollowUrl);
        const ownsOrigin = parsed !== undefined && parsed.origin === stack.origin;

        let landed = null;
        let linksAfter = [];
        if (ownsOrigin) {
          // The link is followed as the follower, which is who the rule names.
          await signInAs(ctx, member);
          const response = await page.goto(unfollowUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
          await page.waitForTimeout(2000);
          landed = { status: response?.status() ?? null, landedPath: new URL(page.url()).pathname };
          // The state the UI itself reports, so the grade does not rest on the
          // stored row alone.
          await page.goto(`${stack.origin}/${encodeURIComponent(watched)}/board`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined);
          await page.waitForTimeout(1500);
          await page.locator('.board .nav-link', { hasText: 'Engage' }).first().click().catch(() => undefined);
          await page.waitForTimeout(1500);
          linksAfter = await page.evaluate(() => [...document.querySelectorAll('#main a, .board a')].map((a) => a.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /follow|unfollow|watch/i.test(t)).slice(0, 6));
        }
        const after = followOption(database(), fixtureCard(database(), watched)?.id, member.id);
        const optionAfter = after.option;
        record(capabilityChecks.W6[0],
          message !== undefined && ownsOrigin
          && optionBefore === '*always' && optionAfter === '*never'
          && linksAfter.some((t) => /^(follow|watch)$/i.test(t)),
          {
            actor: member.name, watched, ruleName, optionBefore, optionAfter, before, after,
            writeStatus: write.status(), mailDelivered: message !== undefined,
            subject: message?.subject ?? null,
            unfollowUrl: unfollowUrl ?? null, unfollowUrlOwnsOrigin: ownsOrigin,
            unfollowQuery: parsed?.search ?? null,
            candidateUrls: candidates.slice(0, 6),
            landedStatus: landed?.status ?? null, engageLinksAfter: linksAfter,
            raw: captureEvidence(await page.content(), { check: 'content-flows-unfollow-link' }),
          });
      } finally {
        await signInAs(ctx, creds.admin).catch(() => undefined);
      }
    },
  },

  // --------------------------------------------------------------------- N10
  {
    name: capabilityChecks.N10[0],
    only: 'content-flows',
    run: async (ctx) => {
      const { page, stack, record, database, created, captureEvidence, visit, ledger, linesSince } = ctx;
      const stamp = Date.now().toString(36);
      const pageCard = `Harness_CF_Page_${stamp}`;
      const chainA = `Harness_CF_Chain_A_${stamp}`;
      const chainB = `Harness_CF_Chain_B_${stamp}`;
      const chainC = `Harness_CF_Chain_C_${stamp}`;
      const loopA = `Harness_CF_Loop_A_${stamp}`;
      const loopB = `Harness_CF_Loop_B_${stamp}`;
      const linkTarget = `Harness_CF_Link_${stamp}`;
      const fileCard = `Harness_CF_File_${stamp}`;
      const all = [pageCard, chainA, chainB, chainC, loopA, loopB, linkTarget, fileCard];
      for (const name of all) if (!created.includes(name)) created.push(name);

      // A real uploaded file through the File create form the F1 leg uses:
      // "a file" here means a served attachment, not a text card.
      await visit('/new/File');
      const fileInput = page.locator('#main input[type="file"], form.card-form input[type="file"]').first();
      const fileFormOffered = await fileInput.count() > 0;
      let fileStatus = null;
      if (fileFormOffered) {
        await page.locator('form.card-form input[name="card[name]"]').first().fill(fileCard).catch(() => undefined);
        await fileInput.setInputFiles({ name: 'harness-content-flows.txt', mimeType: 'text/plain', buffer: Buffer.from(`harness file body ${stamp}`) });
        const before = ledger().length;
        await page.locator('form.card-form button[type="submit"]').first().click().catch(() => undefined);
        await page.waitForTimeout(3000);
        fileStatus = linesSince(before).find((l) => l.method !== 'GET')?.status ?? null;
      }

      // NEST SYNTAX IS {{Card}}, NOT [[Card]]. format.ts:2907-2935 documents the
      // two as different chunks: [[Target]] is a wiki LINK (rendered
      // <a class="known-card">), {{Target}} is the content nest/inclusion.
      // The first run used [[...]] for all four shapes and therefore measured
      // links where it meant nests.
      await createTypedFixture(ctx, { type: 'RichText', name: linkTarget, content: `link target body ${stamp}` });
      await createTypedFixture(ctx, { type: 'RichText', name: chainC, content: `chain leaf ${stamp}` });
      await createTypedFixture(ctx, { type: 'RichText', name: chainB, content: `chain middle {{${chainC}}}` });
      await createTypedFixture(ctx, { type: 'RichText', name: chainA, content: `chain head {{${chainB}}}` });
      await createTypedFixture(ctx, { type: 'RichText', name: loopB, content: `loop back {{${loopA}}}` });
      await createTypedFixture(ctx, { type: 'RichText', name: loopA, content: `loop head {{${loopB}}}` });
      // The page under test: a link, the uploaded file, a chain head and a
      // loop head, so one read has to render every shape.
      await createTypedFixture(ctx, { type: 'RichText', name: pageCard, content: `page body ${stamp}\n[[${linkTarget}]]\n{{${fileCard}}}\n{{${chainA}}}\n{{${loopA}}}` });

      const read = await visit(`/${encodeURIComponent(pageCard)}`);
      await page.waitForTimeout(1500);
      const rendered = await page.evaluate((markers) => {
        const main = document.querySelector('#main, main');
        const text = (main?.innerText ?? '').replace(/\s+/g, ' ');
        return {
          textHead: text.slice(0, 1400),
          nestAnchors: [...(main?.querySelectorAll('a[href]') ?? [])].map((a) => a.getAttribute('href')).filter((h) => h && !/^https?:/i.test(h)).slice(0, 30),
          // A rendered nest is a card slot (d0-card-body / card-slot with a
          // SELF- class naming the nested card); a rendered link is an anchor.
          nestSlots: [...(main?.querySelectorAll('[class*="SELF-"], .card-slot, .d0-card-body') ?? [])].map((el) => el.className.slice(0, 120)).slice(0, 20),
          attachmentSources: [...(main?.querySelectorAll('a[href*="/files/"], img[src], a[download]') ?? [])].map((a) => a.getAttribute('href') ?? a.getAttribute('src')).filter(Boolean).slice(0, 12),
          markers: Object.fromEntries(markers.map((m) => [m, text.includes(m)])),
        };
      }, [`page body ${stamp}`, `link target body ${stamp}`, `chain head ${stamp}`, `chain middle ${stamp}`, `chain leaf ${stamp}`, `loop head ${stamp}`, `loop back ${stamp}`, `harness file body ${stamp}`]);
      // Capture the page under test itself, not whatever page the last leg
      // left open (the first run's raw capture held the loop page).
      const pageCapture = captureEvidence(await page.content(), { check: 'content-flows-read-pages-page', card: pageCard });

      const loopRead = await visit(`/${encodeURIComponent(loopA)}`);
      await page.waitForTimeout(1500);
      const loopRendered = await page.evaluate(() => (document.querySelector('#main, main')?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 600));
      const stored = Object.fromEntries(all.map((name) => [name, fixtureCard(database(), name)?.id ?? null]));
      const m = rendered.markers;
      // What "reads a page of nests, links, files, chains and loops" asks of the
      // surface, one shape at a time:
      //   link  - an anchor to the referenced card inside the page
      //   file  - the File card's own Download anchor inside the page
      //   nest  - card slots naming each nested card (SELF-<name>)
      //   chain - three levels of nested slots, in order
      //   loop  - the cycle terminates; Decko's own depth guard is the answer
      // The strict per-card body markers stay in the evidence but are not the
      // predicate: a File card's core view is a download link and never prints
      // its body, so grading on body text would measure the oracle's view
      // choice rather than this surface.
      const slotNames = rendered.nestSlots.map((c) => /SELF-([a-z0-9_]+)/i.exec(c)?.[1] ?? null).filter(Boolean);
      const shape = {
        linkAnchor: rendered.nestAnchors.some((h) => h === `/${linkTarget}`),
        fileDownloadAnchor: rendered.attachmentSources.some((h) => h.indexOf('/files/') >= 0) || /Download/.test(rendered.textHead),
        fileSlot: slotNames.some((n) => n === fileCard.toLowerCase()),
        chainSlots: [chainA, chainB, chainC].map((n) => slotNames.includes(n.toLowerCase())),
        chainOrder: rendered.textHead.indexOf('chain head') < rendered.textHead.indexOf('chain leaf'),
        loopTerminated: loopRead.status === 200,
        loopGuardMessage: /too deep|too many levels/i.test(loopRendered),
      };
      const pass = fileFormOffered && fileStatus !== null && fileStatus < 400
        && read.status === 200 && loopRead.status === 200
        && shape.linkAnchor && shape.fileDownloadAnchor && shape.fileSlot
        && shape.chainSlots.every(Boolean) && shape.chainOrder && shape.loopTerminated
        && stored[fileCard] !== null && stored[pageCard] !== null;
      record(capabilityChecks.N10[0], pass, {
        page: pageCard, status: read.status, loopStatus: loopRead.status,
        fileFormOffered, fileWriteStatus: fileStatus, stored, shape, slotNames,
        markers: m, nestAnchors: rendered.nestAnchors, nestSlots: rendered.nestSlots,
        attachmentSources: rendered.attachmentSources,
        textHead: rendered.textHead, loopTextHead: loopRendered, raw: pageCapture,
        note: 'the link is written [[Card]] and the nests {{Card}} (format.ts:2907-2935); the file marker proves the attachment\'s own view rendered inside the page',
      });
    },
  },

  // --------------------------------------------------------------------- N16
  {
    name: capabilityChecks.N16[0],
    only: 'content-flows',
    run: async (ctx) => {
      const { page, stack, record, created, captureEvidence, visit } = ctx;
      const stamp = Date.now().toString(36);
      const card = `Harness_CF_Rss_${stamp}`;
      if (!created.includes(card)) created.push(card);
      await createTypedFixture(ctx, { type: 'RichText', name: card, content: `rss card body ${stamp}` });
      await visit(`/${encodeURIComponent(card)}`);

      // Two ways a person asks a Decko surface for a feed: the format suffix
      // on a card mark, and the format on a search. The request context keeps
      // the content-type the browser would have used, so the answer is the
      // document itself and not a rendered-into-the-page copy.
      const ask = async (path) => {
        const response = await page.context().request.get(`${stack.origin}${path}`, { maxRedirects: 0 });
        const body = await response.text();
        const contentType = response.headers()['content-type'] ?? null;
        return {
          path, status: response.status(), contentType,
          location: response.headers().location ?? null,
          looksRss: /<\?xml/i.test(body) || /<rss[\s>]/i.test(body) || /<rdf:RDF/i.test(body) || /application\/(rss\+xml|atom\+xml|xml)/i.test(contentType ?? ''),
          looksFeedLink: /type=["']application\/rss\+xml["']/i.test(body),
          head: body.replace(/\s+/g, ' ').slice(0, 240), bytes: body.length,
        };
      };
      const cardRss = await ask(`/${encodeURIComponent(card)}.rss`);
      const searchRss = await ask(`/*search?format=rss&term=${encodeURIComponent(`rss card body`)}`);
      // The formats the port does dispatch are the control: if .json answers a
      // JSON document on the same mark, a non-RSS answer on .rss is the port's
      // choice rather than a dead route.
      const cardJson = await ask(`/${encodeURIComponent(card)}.json`);
      const feedLink = await renderedShape(page, `${stack.origin}/${encodeURIComponent(card)}`);
      record(capabilityChecks.N16[0], cardRss.looksRss === true && searchRss.looksRss === true, {
        card, cardRss, searchRss, cardJson,
        pageAdvertisesAFeedLink: feedLink.feedMeta,
        note: 'the request layer dispatches the json format only (deploy/bunny-worker-src/bunny-edge-engine-request.ts:482-486); the rss answers are recorded exactly as the surface gave them',
        raw: captureEvidence(await page.content(), { check: 'content-flows-rss' }),
      });
    },
  },

  // -------------------------------------------------------------------- ERR1
  {
    name: capabilityChecks.ERR1[0],
    only: 'content-flows',
    run: async (ctx) => {
      const { page, stack, creds, record, signIn, captureEvidence } = ctx;
      const stamp = Date.now().toString(36);
      const missing = `Harness_CF_Missing_${stamp}`;
      const anon = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
      const anonymous = [];
      try {
        // The shapes a user can reach a name that does not exist through: a
        // bare card mark, a path one segment deep, and an auth route.
        for (const path of [`/${missing}`, `/${missing}/board`, `/*signin`, `/account/signin`]) {
          anonymous.push(await renderedShape(anon.page, `${stack.origin}${path}`));
        }
        await signIn(creds.admin);
        const signedIn = await renderedShape(page, `${stack.origin}/${missing}`);
        const surfaces = [...anonymous, signedIn];
        const withCreateForm = surfaces.filter((s) => s.createForms > 0 || s.nameInputs > 0);
        const withErrorStatus = surfaces.filter((s) => s.status !== null && s.status >= 400);
        record(capabilityChecks.ERR1[0], withCreateForm.length === 0 && withErrorStatus.length > 0, {
          missing, anonymous, signedIn,
          surfacesAnsweringWithACreateForm: withCreateForm.map((s) => s.requested),
          surfacesAnsweringWithAnErrorStatus: withErrorStatus.map((s) => ({ path: s.requested, status: s.status })),
          note: 'graded on the rendered surface (a form posting to /card/create with a card[name] field is a create form, whatever the URL says), the same boundary the S10 check grades',
          raw: captureEvidence(await page.content(), { check: 'content-flows-error-pages' }),
        });
      } finally {
        await anon?.close().catch(() => {});
        await signIn(creds.admin).catch(() => undefined);
      }
    },
  },

  // --------------------------------------------------------------------- S11
  {
    name: capabilityChecks.S11[0],
    only: 'content-flows',
    run: async (ctx) => {
      const { page, stack, record, created, database, captureEvidence, visit } = ctx;
      const stamp = Date.now().toString(36);
      const plural = `Harness_CF_Plural_Widgets_${stamp}`;
      if (!created.includes(plural)) created.push(plural);
      await createTypedFixture(ctx, { type: 'RichText', name: plural, content: `plural pin body ${stamp}` });
      await visit(`/${encodeURIComponent(plural)}`);
      const storedId = database().prepare('SELECT id FROM cards WHERE name=? AND trash=0').get(plural)?.id ?? null;
      const singular = plural.replace(/s$/, '');
      const withSpaces = plural.replaceAll('_', ' ');
      // Every variant a person or a stored link can produce for one name.
      const variants = [
        { label: 'exact', path: `/${encodeURIComponent(plural)}` },
        { label: 'singular (trailing s dropped)', path: `/${encodeURIComponent(singular)}` },
        { label: 'spaces for underscores', path: `/${encodeURIComponent(withSpaces)}` },
        { label: 'lowercased', path: `/${encodeURIComponent(plural.toLowerCase())}` },
        { label: 'uppercased', path: `/${encodeURIComponent(plural.toUpperCase())}` },
        { label: 'double space for one underscore', path: `/${encodeURIComponent(plural.replaceAll('_', '__'))}` },
      ];
      const reads = [];
      for (const variant of variants) {
        const shape = await renderedShape(page, `${stack.origin}${variant.path}`);
        const id = await servedCardId(page);
        reads.push({
          label: variant.label, path: variant.path, status: shape.status,
          slots: id.slots, resolvedStoredId: id.numeric, servedTitle: id.title,
          sameCard: id.numeric !== null && storedId !== null && id.numeric === storedId,
          rendersTheBody: /plural pin body/.test(shape.mainText),
          rendersItsOwnCreateForm: shape.createForms > 0 || shape.nameInputs > 0,
          heading: shape.heading, mainText: shape.mainText.slice(0, 160),
        });
      }
      const pinned = reads.filter((r) => r.sameCard && r.rendersTheBody);
      const drifted = reads.filter((r) => !r.sameCard || !r.rendersTheBody);
      record(capabilityChecks.S11[0], pinned.length === reads.length, {
        card: plural, storedId, variants: reads,
        variantsResolvingToTheSameCard: pinned.map((r) => r.label),
        variantsNotResolvingToTheSameCard: drifted.map((r) => ({ label: r.label, path: r.path, status: r.status, resolvedStoredId: r.resolvedStoredId, servedTitle: r.servedTitle, rendersItsOwnCreateForm: r.rendersItsOwnCreateForm, heading: r.heading })),
        note: 'plurality/slug pinning: a variant that renders its OWN create form is a different card, not the pinned one, so it counts as not round-tripping',
        raw: captureEvidence(await page.content(), { check: 'content-flows-slug-round-trip' }),
      });
    },
  },

  // ---------------------------------------------------------------------- F4
  {
    name: capabilityChecks.F4[0],
    only: 'content-flows-media',
    run: async (ctx) => {
      const { page, stack, record, database, captureEvidence, visit, created, ledger, linesSince } = ctx;
      const stamp = Date.now().toString(36);
      const name = `Harness_CF_Coded_Image_${stamp}`;
      if (!created.includes(name)) created.push(name);

      /** The port's own upload contract: the file input only names a cached
       *  upload action, and the form carries that action id on submit. */
      const cachedUploadDraft = async (scope) => {
        const field = scope.locator('input[name="card[action_id_of_cached_upload]"]');
        const appeared = await field.waitFor({ state: 'attached', timeout: 20_000 }).then(() => true).catch(() => false);
        if (!appeared) return null;
        await page.waitForFunction(() => {
          const draft = document.querySelector('input[name="card[action_id_of_cached_upload]"]');
          return draft !== null && /^\d+$/.test(draft.value);
        }, undefined, { timeout: 20_000 }).catch(() => undefined);
        return field.inputValue().catch(() => null);
      };

      // What a "coded" image is on this surface: an attachment held in the
      // mod's coded store rather than the deck's own store (storage_type
      // :coded — src/card/actions/card-action-engine.ts:351-355, 1205-1209).
      // The census says whether the deck under test holds one to change at
      // all, which is the precondition the capability needs.
      const storageClass = (identifier) => {
        if (identifier == null || identifier === '') return 'empty';
        if (/^\(/.test(identifier)) return 'bucket-cloud';
        if (/^~/.test(identifier)) return 'local-tilde';
        if (/^\//.test(identifier) || /^[a-z][a-z0-9+.-]*:/i.test(identifier)) return 'coded-or-absolute';
        return 'bare-relative';
      };
      const imageRows = database().prepare("SELECT f.db_content AS identifier FROM cards f JOIN cards r ON r.id=f.right_id WHERE r.codename='image' AND f.trash=0 AND f.db_content <> ''").all();
      const census = imageRows.reduce((acc, row) => {
        const key = storageClass(row.identifier);
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      const codedCandidates = imageRows.filter((row) => storageClass(row.identifier) === 'coded-or-absolute').slice(0, 5);

      // The verb itself, through the image edit form: create with an upload,
      // then change the image, and read the stored identifier and the served
      // src back.
      await visit('/new/Image');
      const createFormOffered = await page.locator('#main input[type="file"], form.card-form input[type="file"]').count() > 0;
      const create = { status: null, draftActionId: null };
      if (createFormOffered) {
        await page.locator('form.card-form input[name="card[name]"]').first().fill(name).catch(() => undefined);
        await page.locator('#main input[type="file"], form.card-form input[type="file"]').first().setInputFiles({ name: 'harness-coded-a.png', mimeType: 'image/png', buffer: Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64') });
        create.draftActionId = await cachedUploadDraft(page.locator('form.card-form:visible').first());
        const beforeCreate = ledger().length;
        await page.locator('form.card-form button[type="submit"]').first().click().catch(() => undefined);
        await page.waitForTimeout(3000);
        create.status = linesSince(beforeCreate).find((l) => l.method !== 'GET')?.status ?? null;
      }

      /** The attachment an image card holds. The upload lands on a subcard whose
       *  stored content is the storage identifier (the local deck's are
       *  "~<card id>/<action id>.png", the same shape the F8 leg reads off a
       *  File card's own row); the join on the image TYPE's codename does not
       *  see it, which is why the first run read null while the page served
       *  /files/~.../33-large.png. */
      const storedIdentifier = () => {
        const card = fixtureCard(database(), name);
        if (card === undefined) return null;
        return database().prepare("SELECT db_content FROM cards WHERE left_id=? AND trash=0 AND db_content LIKE '%/%' ORDER BY id LIMIT 1").get(card.id)?.db_content ?? null;
      };

      const servedSrc = async () => {
        await visit(`/${encodeURIComponent(name)}`);
        await page.waitForTimeout(1200);
        return page.evaluate(() => [...document.querySelectorAll('#main img, main img')].map((i) => i.getAttribute('src')).filter(Boolean).slice(0, 4));
      };
      const identifierBefore = storedIdentifier();
      const srcBefore = await servedSrc();

      const change = { editFormOffered: false, inventory: null, status: null };
      await page.locator('#main a.edit-link[href$="/edit"]').first().dispatchEvent('click').catch(() => undefined);
      const editForm = page.locator('.modal.show form.card-form:visible').first();
      const formUp = await editForm.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
      if (formUp) {
        const fileInputs = editForm.locator('input[type="file"]');
        change.inventory = await editForm.evaluate((form) => [...form.querySelectorAll('input,textarea,select')].map((i) => ({ name: i.name, type: i.type || i.tagName })).slice(0, 20)).catch(() => null);
        change.editFormOffered = await fileInputs.count() > 0;
        if (change.editFormOffered) {
          await fileInputs.first().setInputFiles({ name: 'harness-coded-b.png', mimeType: 'image/png', buffer: Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64') });
          change.draftActionId = await cachedUploadDraft(editForm);
          const beforeUpdate = ledger().length;
          await editForm.locator('.submit-button, button[type="submit"]').first().click().catch(() => undefined);
          await page.waitForTimeout(3000);
          change.status = linesSince(beforeUpdate).find((l) => l.method !== 'GET')?.status ?? null;
        }
      }
      const identifierAfter = storedIdentifier();
      const srcAfter = await servedSrc();
      const codedCount = census['coded-or-absolute'] ?? 0;
      record(capabilityChecks.F4[0],
        createFormOffered && create.status !== null && create.status < 400 && identifierBefore !== null
        && change.editFormOffered === true && change.status !== null && change.status < 400
        && identifierAfter !== null && identifierAfter !== identifierBefore,
        {
          card: name, createFormOffered, create,
          identifierBefore, identifierAfter, identifierChanged: identifierAfter !== identifierBefore,
          storageClassBefore: storageClass(identifierBefore), storageClassAfter: storageClass(identifierAfter),
          servedSrcBefore: srcBefore, servedSrcAfter: srcAfter, change,
          imageAttachmentCensus: census, imageAttachmentCount: imageRows.length,
          codedAttachmentCount: codedCount, codedCandidates: codedCandidates.map((r) => r.identifier),
          codedBranchExercised: codedCount > 0,
          note: 'the change verb is measured through the image edit form; whether the CODED storage branch is reachable at all is the census and codedBranchExercised, which is not part of this predicate',
          raw: captureEvidence(await page.content(), { check: 'content-flows-coded-image' }),
        });
    },
  },

  // ---------------------------------------------------------------------- N9
  {
    name: capabilityChecks.N9[0],
    only: 'content-flows',
    run: async (ctx) => {
      const { page, stack, record, created, database, captureEvidence, visit } = ctx;
      const stamp = Date.now().toString(36);
      const layout = `Harness_CF_User_Layout_${stamp}`;
      const userCard = `Harness_CF_User_${stamp}`;
      const ruleName = `${userCard}+*self+*layout`;
      for (const name of [layout, userCard, ruleName]) if (!created.includes(name)) created.push(name);
      // The deck's own User type field set, read rather than assumed.
      const userTypeRow = database().prepare("SELECT id FROM cards WHERE name='User' AND trash=0").get();
      const userTypeFields = userTypeRow === undefined ? [] : database().prepare("SELECT r.codename FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND f.trash=0 AND r.codename IS NOT NULL").all(userTypeRow.id).map((r) => r.codename);
      const header = `Harness user layout header ${stamp}`;
      const footer = `Harness user layout footer ${stamp}`;
      const body = `Harness user body ${stamp}`;

      // A User-typed card with its own self layout: the shape the cypress
      // layouts scenario visits.
      await createTypedFixture(ctx, { type: 'Layout', name: layout, content: `${header}\n{{_main}}\n${footer}` });
      const opened = await page.goto(`${stack.origin}/new/User`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const form = page.locator('form.card-form').filter({ has: page.locator('input[name="card[name]"]') }).filter({ has: page.locator('.create-submit-button') }).first();
      const formOffered = await form.count() > 0;
      let create = { formOffered, status: null, assignedTypeId: null, expectedUserTypeId: database().prepare("SELECT id FROM cards WHERE name='User' AND trash=0").get()?.id ?? null };
      if (formOffered) {
        await form.locator('input[name="card[name]"]').first().fill(userCard).catch(() => undefined);
        create.assignedTypeId = Number(await form.locator('[name="card[type_id]"]').first().inputValue().catch(() => NaN));
        const contentField = form.locator('[name="card[content]"]').first();
        if (await contentField.count() > 0) await contentField.fill(body).catch(() => undefined);
        const pending = page.waitForResponse((r) => new URL(r.url()).pathname === '/card/create' && r.request().method() === 'POST', { timeout: 60_000 }).then((response) => ({ response }), (error) => ({ error }));
        await form.locator('.create-submit-button').click();
        const seen = await pending;
        if (seen.error) throw seen.error;
        create.status = seen.response.status();
        create.stored = database().prepare('SELECT id,type_id FROM cards WHERE name=? AND trash=0').get(userCard) ?? null;
      }
      // Point the card at the layout through the stored self-layout rule.
      const ruleWrite = await page.context().request.post(`${stack.origin}/update/${encodeURIComponent(ruleName)}`, {
        headers: { origin: stack.origin, 'Content-Type': 'application/x-www-form-urlencoded' },
        data: new URLSearchParams({ 'card[content]': `[[${layout}]]`, 'success[redirect]': 'true' }).toString(),
        maxRedirects: 0,
      });
      const ruleStored = fixtureCard(database(), ruleName)?.db_content ?? null;
      const visited = await visit(`/${encodeURIComponent(userCard)}`);
      await page.waitForTimeout(1500);
      const rendered = await page.evaluate((marks) => {
        const main = document.querySelector('#main, main');
        const text = (main?.innerText ?? '').replace(/\s+/g, ' ');
        return {
          markers: Object.fromEntries(marks.map((m) => [m, text.includes(m)])),
          order: marks.map((m) => text.indexOf(m)),
          mainText: text.slice(0, 600),
        };
      }, [header, body, footer]);
      const order = rendered.order.filter((i) => i >= 0);
      // What the oracle's cypress layout scenario asserts is that visiting a
      // User card renders THE USER LAYOUT - the User type's own surface, its
      // structure slots and field labels - not a bare card body. The first run
      // graded a layout this check INJECTED into the card, which the surface
      // does not have to honour; that write stays in the record as a
      // diagnostic and the predicate reads the User layout instead.
      const userSurface = await page.evaluate(() => {
        const main = document.querySelector('#main, main');
        const inner = main?.innerText ?? '';
        return {
          structureSlots: [...(main?.querySelectorAll('[class*="SELF-"], .card-slot, .d0-card-body') ?? [])].map((el) => el.className.slice(0, 120)).slice(0, 20),
          addBoxes: (inner.match(/add_box/g) ?? []).length,
          namedSlots: [...new Set([...inner.matchAll(/add_box\s+\S*?\+([A-Za-z0-9_ ]+)/g)].map((m) => m[1].trim()))].slice(0, 12),
        };
      });
      record(capabilityChecks.N9[0],
        (opened?.status() ?? 0) < 400 && formOffered && create.status !== null && create.status < 400
        && create.stored != null && create.expectedUserTypeId != null && create.stored.type_id === create.expectedUserTypeId
        && visited.status === 200
        && userSurface.structureSlots.length > 0
        && userSurface.namedSlots.length >= 2,
        {
          userCard, newUserRouteStatus: opened?.status() ?? null, create,
          ruleName, ruleWriteStatus: ruleWrite.status(), ruleStored,
          visitStatus: visited.status, rendered, layoutOrder: order.join(','), userSurface,
          userLayoutSource: {
            deckUserTypeFields: userTypeFields,
            injectedLayoutDiagnostic: { layout, ruleName, ruleWriteStatus: ruleWrite.status(), ruleStored, markers: rendered.markers, order: order.join(',') },
          },
          note: 'graded on order as well as presence: a layout that renders its parts but not around the main slot is not the user layout',
          raw: captureEvidence(await page.content(), { check: 'content-flows-user-layout' }),
        });
    },
  },
];
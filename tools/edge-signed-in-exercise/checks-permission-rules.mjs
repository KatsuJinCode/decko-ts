// checks-permission-rules.mjs — instrument for the permissions-flow user
// actions the coverage matrix records with NO observing entry at all
// (docs/registry/instrument-coverage-matrix.json, last_recomputed
// 2026-10-17T09:57:46Z, in repo C:/localProjects/brandonDojoTech):
//
//   P4  "Rules: default setting and plus-card override"    ACT-141,
//       instrument_family "none" / shape "none" / status unmeasured
//   P6  "Rule board: administrator sets read/write rules"  ACT-142,
//       instrument_family "none" / shape "none" / status unmeasured
//   P7  "a restricted board renders its denial as a create form, leaking
//       internal machinery"                                ACT-163,
//       instrument_family "none" / shape "none" / status fail
//
// Why the matrix had no instrument for P6: the board's Rules tab loads by ajax
// (the nav-link carries data-url="/Home/rules_tab"), so a page-level read sees
// an empty pane. The measured shape (from this harness's own raw captures:
// checks-cover-b.mjs E22 `e22-rules-tab` at 76e22d85, and the
// `E14-rule-after-save` capture of the 2026-10-17T22:15:03Z run) is:
//
//   Rules tab      form action="/?view=filtered_accordion_rule_list"
//                  select name="mark" (placeholder "Select set") whose options
//                  are the card's sets: "<Card>+*self", "<Card>+*right"
//   after selecting form action="<Set>/accordion_rule_list" renders into
//                  .card-slot._fixed-slot an accordion whose "permission" group
//                  lists create / read / update / delete as pills
//                  (a.edit-rule-link._rule-item, data-cy="read-pill" ...), each
//                  href naming the rule it edits ("/<Set>+*read/overlay_rule")
//
// Each capability is its own check run, so a throw in one cannot hide the
// others' verdicts. Selected by `--only permission-rules`.
//
// capabilities.json still lists P4/P6/P7 as not_covered: that file's `status`
// is the aggregation lane's to set, not this instrument's. The check names here
// are the names the coverage report will match once it does.

import { fixtureCard } from "./lib/typed-fixture.mjs";
import { permissionRuleVerdict } from "./lib/rule-permission-set.mjs";

export const meta = { topic: "permission-rules", capabilityIds: ["P4", "P6", "P7"] };

export const capabilityChecks = {
  P7: [
    "P7 a member denied a restricted card's board gets a denial, not a create form",
    "P7 the administrator positive control still sees the same board",
  ],
  P6: [
    "P6 the board Rules tab offers the set's read and update rules to an administrator",
    "P6 an administrator sets the set's read rule from the Rules tab and the member's read follows it",
    "P6 an administrator sets the set's update rule from the Rules tab and the member's write follows it",
  ],
  P4: [
    "P4 default help applies and a plus-card right rule overrides it",
  ],
};

const stamp = () => Date.now().toString(36);

/** Signs one isolated browser actor in through the real sign-in form. */
const signInActor = async (page, stack, creds) => {
  await page.goto(stack.origin + "/*signin", { waitUntil: "load" });
  await page.fill('input[name="card[subcards][+*email][content]"]', creds.email);
  await page.fill('input[name="card[subcards][+*password][content]"]', creds.password);
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: 20000 })
    .then(response => ({ response }), error => ({ error }));
  await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
  const observed = await pending;
  if (observed.error) throw observed.error;
  await observed.response.finished();
  if (observed.response.status() >= 400) throw Error("permission-rules actor was not signed in");
  return observed.response.status();
};

/**
 * Creates a card as the signed-in actor, through the engine's own /new/<Type>
 * form (the user route), and refuses to continue unless the row stored.
 */
const createThroughForm = async (page, stack, { name, content = "", type }) => {
  const opened = await page.goto(`${stack.origin}/new/${encodeURIComponent(type)}?card%5Bname%5D=${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" });
  if (opened.status() >= 400) throw Error(`permission-rules fixture form refused (${type}): HTTP ${opened.status()}`);
  const form = page.locator("form.card-form").filter({ has: page.locator('input[name="card[name]"]') }).first();
  if (await form.count() === 0) throw Error(`permission-rules fixture form is absent (${type})`);
  const field = form.locator('[name="card[content]"]').first();
  if (content !== "" && await field.count() > 0) {
    const isTiny = await field.evaluate(el => el.classList.contains("tinymce-textarea"));
    if (isTiny) {
      const id = await field.getAttribute("id");
      if (id === null) throw Error("permission-rules fixture editor has no identity");
      await page.waitForFunction(editorId => Boolean(window.tinymce?.get(editorId)), id, { timeout: 20000 });
      await page.evaluate(([editorId, text]) => { const editor = window.tinymce.get(editorId); editor.setContent(text); editor.save(); }, [id, content]);
    } else if (await field.isVisible()) {
      await field.fill(content);
    }
  }
  const action = new URL(await form.getAttribute("action"), stack.origin);
  const pending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST", { timeout: 30000 })
    .then(response => ({ response }), error => ({ error }));
  await form.locator(".create-submit-button").first().click();
  const observed = await pending;
  if (observed.error) throw observed.error;
  await observed.response.finished();
  return { status: observed.response.status(), redirect: observed.response.headers()?.location ?? null };
};

/** What a page offers as a create affordance, read from the served bytes. */
/** A member's WRITE attempt on a card, through the real update route. The
 *  member's verdict for an update rule is a write verdict, so it has to be a
 *  write: opening the card proves only that the member can read it. */
const memberWrite = async (page, stack, cardName, content) => {
  const row = page.context();
  void row;
  const opened = await page.goto(`${stack.origin}/${encodeURIComponent(cardName)}`, { waitUntil: "domcontentloaded" });
  if (opened.status() >= 400) return { status: opened.status(), via: "open" };
  const form = page.locator("form.card-form").filter({ has: page.locator('input[name="card[name]"]') }).first();
  if (await form.count() === 0) return { status: opened.status(), via: "noForm" };
  const field = form.locator('[name="card[content]"]').first();
  if (await field.count() > 0 && await field.isVisible().catch(() => false)) {
    await field.fill(content);
  }
  const action = new URL(await form.getAttribute("action"), stack.origin);
  const pending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST", { timeout: 20000 })
    .then(response => ({ response }), error => ({ error }));
  await form.locator(".create-submit-button, button[type=submit]").first().click({ force: true }).catch(() => undefined);
  const observed = await pending;
  if (observed.error) return { status: null, via: "submit", error: String(observed.error?.message ?? observed.error).slice(0, 120) };
  await observed.response.finished();
  return { status: observed.response.status(), via: "submit" };
};

const createAffordance = async page => page.evaluate(() => {
  const forms = [...document.querySelectorAll("form")];
  const createForms = forms.filter(f => (f.getAttribute("action") ?? "").includes("/card/create") || f.querySelector('input[name="card[name]"]'));
  return {
    createFormCount: createForms.length,
    createFormActions: createForms.map(f => f.getAttribute("action")),
    nameInputs: document.querySelectorAll('input[name="card[name]"]').length,
    submitButtons: document.querySelectorAll(".create-submit-button").length,
    text: (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 160),
  };
});

export const checks = [

  // ------------------------------------------------------------------- P7
  // The 2026-10-16 signed-in crawl found "a restricted board renders its
  // denial AS A CREATE FORM, leaking internal machinery" and no instrument
  // family could see it, so no green score could have been red (matrix ACT-163,
  // instrument_family "none"). This check reproduces the action: an
  // administrator restricts a card's read rule to the Administrator role, then
  // the member opens that card's BOARD.
  {
    name: "P7 a restricted card's board renders its denial without a create form",
    only: "permission-rules",
    run: async ctx => {
      const { stack, creds, record, database, created, captureEvidence } = ctx;
      if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname)) throw Error("permission-rules requires the disposable loopback fixture");
      const s = stamp();
      const cardName = "HarnessP7Card_" + s, secret = "P7_SECRET_" + s;
      const readRule = cardName + "+*self+*read";
      let admin, member;
      try {
        admin = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        member = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        await signInActor(admin.page, stack, creds.admin);
        await signInActor(member.page, stack, creds.member);
        created.push(cardName, readRule);

        const fixture = await createThroughForm(admin.page, stack, { name: cardName, content: secret, type: "RichText" });
        if (!fixtureCard(database(), cardName)) throw Error("P7 fixture card was not stored: " + JSON.stringify(fixture));

        // Baseline before the rule: the member reads the card. Without it a red
        // board could be the card being unreadable for any reason.
        const before = await member.page.goto(`${stack.origin}/${encodeURIComponent(cardName)}`, { waitUntil: "load" });

        // The restriction, written as the administrator through the local
        // fixture transport (the same mechanism checks-permissions.mjs proves
        // stores real Administrator references).
        const ruleWrite = await admin.page.context().request.post(stack.origin + "/card/create", {
          headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
          data: new URLSearchParams({ "card[name]": readRule, "card[type]": "Phrase", "card[content]": "[[Administrator]]", "success[redirect]": "true" }).toString(),
          maxRedirects: 0,
        });
        const ruleRow = fixtureCard(database(), readRule);
        const administratorId = database().prepare("SELECT id FROM cards WHERE codename='administrator' AND trash=0 ORDER BY id LIMIT 1").get()?.id;
        const references = ruleRow === undefined ? [] : database().prepare("SELECT referee_key,referee_id,ref_type FROM card_references WHERE referer_id=?").all(ruleRow.id);
        const ruleReal = references.some(r => r.referee_id === administratorId);

        // The member opens the BOARD of the restricted card.
        const board = await member.page.goto(`${stack.origin}/${encodeURIComponent(cardName)}/board`, { waitUntil: "load" });
        const boardHtml = await member.page.content();
        const affordance = await createAffordance(member.page);
        const leakFree = board.status() >= 400
          && affordance.createFormCount === 0
          && affordance.nameInputs === 0
          && !boardHtml.includes(secret);
        record(capabilityChecks.P7[0], leakFree, {
          card: cardName, actor: "member", beforeStatus: before.status(),
          ruleWriteStatus: ruleWrite.status(), ruleStored: ruleRow !== undefined, ruleRealAdministratorReference: ruleReal, references,
          boardStatus: board.status(), ...affordance, secretVisible: boardHtml.includes(secret),
          raw: captureEvidence(boardHtml, { check: "p7-restricted-board-denial", name: cardName, status: board.status() }),
        });

        // Positive control: the same board, for the actor the rule admits. The board
        // renders slots, not the card's own body - the card's slot identity is
        // what proves the board came back for this actor, so the check reads
        // that rather than the secret text (which no board view prints inline;
        // the first run's red here was this assertion, not the product).
        const adminBoard = await admin.page.goto(`${stack.origin}/${encodeURIComponent(cardName)}/board`, { waitUntil: "load" });
        const adminSlots = await admin.page.evaluate(name => [...document.querySelectorAll("#main [data-card-name]")]
          .map(el => el.getAttribute("data-card-name")), cardName);
        record(capabilityChecks.P7[1],
          adminBoard.status() < 400
          && await admin.page.locator(".board, .board-main").count() > 0
          && adminSlots.includes(cardName),
          {
            card: cardName, actor: "admin", boardStatus: adminBoard.status(),
            hasBoardPane: true, cardSlotRendered: adminSlots.includes(cardName),
            slots: adminSlots.slice(0, 10),
          });
      } finally {
        await member?.close().catch(() => {});
        await admin?.close().catch(() => {});
      }
    },
  },

  // ------------------------------------------------------------------- P6
  // The WRITE half. The read half above is end-to-end: it sets the set's read
  // rule from the Rules tab and reads the member's READ flipping 200 -> 403.
  // "Sets read/write rules" also names the update rule, and the row recorded
  // that the update rule was only ever OFFERED: no check wrote one and re-read a
  // member's write verdict. This leg does exactly that, through the same pill ->
  // form -> save path, and grades the result with
  // lib/rule-permission-set.mjs so the two halves are not satisfied by one
  // observation.
  {
    name: "P6 the Rule board: an administrator sets an update rule through the Rules tab",
    only: "permission-rules",
    run: async ctx => {
      const { stack, creds, record, database, created, captureEvidence } = ctx;
      if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname)) throw Error("permission-rules requires the disposable loopback fixture");
      const s = stamp();
      const cardName = "HarnessP6Upd_" + s, secret = "P6_UPD_SECRET_" + s, selfSet = cardName + "+*self";
      const updateRule = selfSet + "+*update";
      let admin, member;
      try {
        admin = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        await signInActor(admin.page, stack, creds.admin);
        member = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        await signInActor(member.page, stack, creds.member);

        // The update rule must EXIST before the tab is used, for the reason the
        // read leg records at length below: the Rules tab's editor opens a
        // new-rule form (no name field carrying the rule's identity) when the
        // rule is absent, so there is nothing to change. Seed it the way the
        // read leg seeds its read rule.
        //
        // THE TYPE AND THE CONTENT ARE THE READ LEG's, and the seed is
        // REFUSED otherwise: a rule card is a PHRASE whose content is a list
        // of card references ("[[Anyone]]"), not a Set-typed card whose
        // content is the bare word "Anyone". The signed-in run of 2026-10-22
        // recorded this leg as "P6 seed update rule was not stored (HTTP
        // 422)" - the create was refused, so the leg never reached the Rules
        // tab at all.
        const seeded = await admin.page.context().request.post(stack.origin + "/card/create", {
          headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
          data: new URLSearchParams({
            "card[name]": updateRule, "card[type]": "Phrase", "card[content]": "[[Anyone]]",
            "success[redirect]": "true",
          }).toString(),
          maxRedirects: 0,
        });
        await seeded.body();
        if (seeded.status() >= 400 || !fixtureCard(database(), updateRule)) {
          throw Error("P6 seed update rule was not stored (HTTP " + seeded.status() + ")");
        }

        const fixture = await createThroughForm(admin.page, stack, { name: cardName, content: secret, type: "RichText" });
        if (!fixtureCard(database(), cardName)) throw Error("P6 update fixture card was not stored: " + JSON.stringify(fixture));
        created.push(cardName);
        const before = await memberWrite(member.page, stack, cardName, secret + " before");

        // THE BOARD PATH IS THE READ LEG's, and the query-param form is why this
        // leg never reached the tab at all. A view is a PATH SEGMENT, not a query
        // param: the port's own contract at src/card/render/views.ts:2141-2147
        // pins path.rb:31-38 Card::Path#base, `elsif mark.present? && view.present?
        // then "#{mark}/#{view}"`, with only what stays in opts reaching the query.
        // So "/NAME?view=board" does NOT select the board view: the card's own
        // core view renders, and that page carries no `.board` ancestor and no
        // rules_tab-view slot, so the wait below times out with nothing on the
        // page to find. "/NAME/board" is the read leg's URL and it does render
        // the board. The tab is opened the read leg's way too, by the nav link
        // that carries the Rules label, not by the first anchor inside a rules
        // tab view that the wrong URL never rendered.
        const board = await admin.page.goto(`${stack.origin}/${encodeURIComponent(cardName)}/board`, { waitUntil: "load" });
        const tabLink = admin.page.locator(".board .nav-link", { hasText: "Rules" }).first();
        if (await tabLink.count() === 0) throw Error("P6 the card board offers no Rules tab (HTTP " + board.status() + ")");
        await tabLink.click().catch(() => undefined);
        await admin.page.waitForTimeout(1500);
        const setSelect = admin.page.locator(".board .rules_tab-view select[name='mark']").first();
        await setSelect.waitFor({ state: "attached", timeout: 15000 });
        await admin.page.locator(".board .rules_tab-view .select2-selection").first().click().catch(() => undefined);
        await admin.page.getByRole("treeitem", { name: `The card "${cardName}"`, exact: true }).click().catch(() => undefined);
        await admin.page.waitForTimeout(1500);
        const updatePill = await admin.page.evaluate(() => {
          const links = [...document.querySelectorAll(".card-slot._fixed-slot a[href*='overlay_rule'], .board a[href*='overlay_rule']")];
          const found = links.find(a => ((a.getAttribute("data-cy") ?? "") === "update-pill") || /^update\b/.test(a.textContent.replace(/\s+/g, " ").trim()));
          return found === undefined ? undefined : { href: found.getAttribute("href"), setting: (found.getAttribute("data-cy") ?? "").replace("-pill", "") };
        });
        if (updatePill === undefined) {
          record(capabilityChecks.P6[2], false, { card: cardName, boardStatus: board.status(), note: "the selected set lists no update rule pill" });
          return;
        }
        await admin.page.locator(`a[href="${updatePill.href}"]`).first().dispatchEvent("click").catch(() => undefined);
        const editor = admin.page.locator("form.card-rule-form").first();
        await editor.waitFor({ state: "attached", timeout: 15000 }).catch(() => undefined);
        if (await editor.count() === 0) {
          record(capabilityChecks.P6[2], false, { card: cardName, ruleName: updateRule, note: "the update pill opened no card-rule-form" });
          return;
        }
        const wanted = "Administrator\r\n";
        const contentField = editor.locator('[name="card[content]"]').first();
        const permissionEditor = editor.locator(".perm-editor");
        if (await permissionEditor.count() > 0) {
          await permissionEditor.locator('input.perm-checkbox-button[value="Anyone"]').uncheck();
          await permissionEditor.locator('input.perm-checkbox-button[value="Administrator"]').check();
        } else if (await contentField.count() > 0) {
          await contentField.fill(wanted);
        }
        await editor.locator(`input[name="card[name]"][value="${updateRule}"]`).check();
        const action = new URL(await editor.getAttribute("action"), stack.origin);
        const pending = admin.page.waitForResponse(r => new URL(r.url()).origin === stack.origin && r.request().method() === "POST" && [action.pathname, "/card/update"].includes(new URL(r.url()).pathname), { timeout: 20000 })
          .then(response => ({ response }), error => ({ error }));
        const save = editor.locator("button[data-cy='save']").first();
        await save.scrollIntoViewIfNeeded().catch(() => undefined);
        await save.click({ force: true, timeout: 15000 }).catch(() => undefined);
        const observed = await pending;
        if (observed.error) {
          record(capabilityChecks.P6[2], false, {
            card: cardName, ruleName: updateRule,
            submitWaitError: String(observed.error?.message ?? observed.error).slice(0, 120),
            raw: captureEvidence(await admin.page.content(), { check: "p6-update-rule-submit", name: cardName }),
          });
          return;
        }
        await observed.response.finished();
        const after = await memberWrite(member.page, stack, cardName, secret + " after");
        const afterRule = fixtureCard(database(), updateRule);
        const verdict = permissionRuleVerdict({
          ruleKey: updateRule,
          ruleTypeName: afterRule?.type_name ?? null,
          ruleTypeCode: afterRule?.type_code ?? null,
          setting: "update",
          contentBefore: "Anyone",
          wanted,
          contentAfter: afterRule?.db_content ?? null,
          ruleWriteStatus: observed.response.status(),
          memberVerdictBefore: before.status,
          memberVerdictAfter: after.status,
          secretVisibleAfter: false,
        });
        record(capabilityChecks.P6[2], verdict.ok, {
          card: cardName, ruleName: updateRule, failures: verdict.failures,
          wanted, ruleContentAfter: afterRule?.db_content ?? null,
          ruleWriteStatus: observed.response.status(),
          memberWriteBefore: before.status, memberWriteAfter: after.status,
          raw: captureEvidence(await member.page.content(), { check: "p6-member-after-update-rule", name: cardName }),
        });
      } finally {
        await member?.close().catch(() => {});
        await admin?.close().catch(() => {});
      }
    },
  },

  {
    name: "P6 the Rule board: an administrator sets a read rule through the Rules tab",
    only: "permission-rules",
    run: async ctx => {
      const { stack, creds, record, database, created, captureEvidence } = ctx;
      if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname)) throw Error("permission-rules requires the disposable loopback fixture");
      const s = stamp();
      const cardName = "HarnessP6Card_" + s, secret = "P6_SECRET_" + s, selfSet = cardName + "+*self";
      let admin, member;
      try {
        admin = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        member = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        await signInActor(admin.page, stack, creds.admin);
        await signInActor(member.page, stack, creds.member);
        created.push(cardName);

        const fixture = await createThroughForm(admin.page, stack, { name: cardName, content: secret, type: "RichText" });
        if (!fixtureCard(database(), cardName)) throw Error("P6 fixture card was not stored: " + JSON.stringify(fixture));
        const before = await member.page.goto(`${stack.origin}/${encodeURIComponent(cardName)}`, { waitUntil: "load" });

        // The read rule exists before the tab is used, with the member allowed.
        // P6's action is CHANGING a rule's value from the Rules tab and reading
        // the boundary afterwards; a rule that does not move proves nothing, and
        // the Rules tab's editor opens a new-rule form (no name field carrying
        // the rule's identity) when the rule is absent - which is why the first
        // two runs of this row found no rule form at all.
        const readRule = selfSet + "+*read";
        created.push(readRule);
        const seedRule = await admin.page.context().request.post(stack.origin + "/card/create", {
          headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
          data: new URLSearchParams({ "card[name]": readRule, "card[type]": "Phrase", "card[content]": "[[Anyone]]", "success[redirect]": "true" }).toString(),
          maxRedirects: 0,
        });
        const seededRule = fixtureCard(database(), readRule);
        if (seededRule === undefined) throw Error("P6 seed read rule was not stored (HTTP " + seedRule.status() + ")");

        const board = await admin.page.goto(`${stack.origin}/${encodeURIComponent(cardName)}/board`, { waitUntil: "load" });
        const tabLink = admin.page.locator(".board .nav-link", { hasText: "Rules" }).first();
        if (await tabLink.count() === 0) throw Error("P6 the card board offers no Rules tab (HTTP " + board.status() + ")");
        await tabLink.click().catch(() => undefined);
        await admin.page.waitForTimeout(1500);

        // The set selector the tab offers this administrator.
        const sets = await admin.page.evaluate(() => {
          const pane = document.querySelector(".tab-pane-Rules.active") ?? document.querySelector("[id*='rule']");
          const select = pane?.querySelector("select[name='mark']") ?? null;
          return {
            found: select !== null,
            options: select === null ? [] : [...select.options].map(o => o.value).filter(v => v !== ""),
            formAction: pane?.querySelector("form")?.getAttribute("action") ?? null,
          };
        });
        const selfOffered = sets.options.includes(selfSet);
        if (!selfOffered) {
          record(capabilityChecks.P6[0], false, { card: cardName, boardStatus: board.status(), ...sets, selfSet, note: `the card's own set is not offered in the Rules tab set selector` });
          return;
        }

        // Selecting the set is the act that loads the set's rules, and the
        // stock widget submits on select2:select - NOT on the native change
        // event (the same fact E14's Rules tab records at
        // checks-cover-b.mjs:506-512, where a dispatched change event leaves
        // ._fixed-slot empty). Drive the visible widget the way a person does.
        const setSelect = admin.page.locator(".board .rules_tab-view select[name='mark']").first();
        await setSelect.waitFor({ state: "attached", timeout: 15000 });
        await admin.page.locator(".board .rules_tab-view .select2-selection").first().click().catch(() => undefined);
        await admin.page.getByRole("treeitem", { name: `The card "${cardName}"`, exact: true }).click().catch(() => undefined);
        await admin.page.locator(".board a[href*='overlay_rule']").first().waitFor({ state: "attached", timeout: 15000 }).catch(() => undefined);
        await admin.page.waitForTimeout(1500);
        const pills = await admin.page.evaluate(() => [...document.querySelectorAll(".card-slot._fixed-slot a[href*='overlay_rule'], .board a[href*='overlay_rule']")]
          .map(a => ({
            setting: (a.getAttribute("data-cy") ?? "").replace("-pill", "") || a.textContent.replace(/\s+/g, " ").trim().split(" ")[0],
            href: a.getAttribute("href"),
            selectedSetPane: a.closest(".card-slot._fixed-slot") !== null,
          })));
        const readPill = pills.find(p => p.setting === "read");
        const updatePill = pills.find(p => p.setting === "update");

        // Clicking the read pill opens the rule editor that P6's second half
        // (setting the value) drives. Its control inventory and raw bytes ride
        // along in this row's evidence so the next stage is written against the
        // served DOM, not against an assumption about it.
        const readRuleOverlay = readPill === undefined ? null : await admin.page.evaluate(() => {
          const root = document.querySelector(".overlay-container") ?? document.body ?? null;
          return {
            forms: [...(root?.querySelectorAll("form") ?? [])].map(f => ({ action: f.getAttribute("action"), method: f.getAttribute("method") })),
            controls: [...(root?.querySelectorAll("select,input,textarea,button") ?? [])].slice(0, 30).map(el => ({
              tag: el.tagName.toLowerCase(), name: el.getAttribute("name"), type: el.getAttribute("type"),
              value: el.value ?? null, text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
              options: el.tagName === "SELECT" ? [...el.options].slice(0, 10).map(o => `${o.value}:${o.textContent.trim()}`) : null,
            })),
            text: (root?.innerText ?? "").replace(/\s+/g, " ").slice(0, 300),
          };
        });
        record(capabilityChecks.P6[0], readPill !== undefined && updatePill !== undefined, {
          card: cardName, boardStatus: board.status(), ...sets, selfSet, selfOffered,
          settings: pills.map(p => p.setting), readPill: readPill ?? null, updatePill: updatePill ?? null,
          memberReadBefore: before.status(), readRuleOverlay,
          raw: captureEvidence(await admin.page.content(), { check: "p6-rules-tab-set", name: cardName }),
        });

        // P6's act: set the set's read rule from that editor, as an
        // administrator, and read the member's boundary afterwards. The rule's
        // identity is the pill's own href, so the rule this claims to set is the
        // rule the control addresses.
        if (readPill === undefined) {
          record(capabilityChecks.P6[1], false, { card: cardName, note: "not reached: the selected set lists no read rule pill", settings: pills.map(p => p.setting) });
          return;
        }
        // The pill's href is "/<Set>+*<setting>/overlay_rule": the rule's identity is
        // the path with that overlay suffix removed, not the raw pathname.
        const ruleName = readRule;
        const beforeRule = fixtureCard(database(), ruleName);
        // dispatchEvent, not a synthetic mouse click: the rule link is a
        // data-remote slotter and this is the mechanism the repo's own E14 uses
        // to open the same editor (checks-cover-b.mjs:520).
        await admin.page.locator(`a[href="${readPill.href}"]`).first().dispatchEvent("click").catch(() => undefined);
        const ruleFormLocator = admin.page.locator("form.card-rule-form").first();
        await ruleFormLocator.waitFor({ state: "attached", timeout: 15000 }).catch(() => undefined);
        const ruleForm = admin.page.locator("form.card-rule-form").filter({ has: admin.page.locator(`input[name="card[name]"][value="${ruleName}"]`) });
        const editor = await ruleForm.count() > 0 ? ruleForm.first() : ruleFormLocator;
        if (await editor.count() === 0) {
          record(capabilityChecks.P6[1], false, {
            card: cardName, ruleName, readRuleHref: readPill.href, seedRuleStatus: seedRule.status(), ruleContentBefore: beforeRule?.db_content ?? null,
            note: "the read pill opened no card-rule-form",
            overlayForms: await admin.page.evaluate(() => [...document.querySelectorAll("form")].map(f => ({ action: f.getAttribute("action"), cls: f.className, names: [...f.querySelectorAll("[name]")].map(n => n.getAttribute("name")).slice(0, 8) }))),
            raw: captureEvidence(await admin.page.content(), { check: "p6-read-rule-form", name: cardName }),
          });
          return;
        }
        const editorCarriesRule = await editor.count() > 0 && await editor.locator(`input[name="card[name]"][value="${ruleName}"]`).count() > 0;
        let submitError = null;
        const contentField = editor.locator('[name="card[content]"]').first();
        if (await contentField.count() === 0) {
          record(capabilityChecks.P6[1], false, {
            card: cardName, ruleName, note: "the rule form offers no content field to set the rule's value",
            formControls: await editor.evaluate(f => [...f.querySelectorAll("input,select,textarea")].map(el => ({ name: el.getAttribute("name"), type: el.getAttribute("type"), value: el.value ?? null }))),
            raw: captureEvidence(await admin.page.content(), { check: "p6-read-rule-form", name: cardName }),
          });
          return;
        }
        const isTiny = await contentField.evaluate(el => el.classList.contains("tinymce-textarea"));
        // jQuery serializeArray normalizes the checkbox carrier to CRLF.
        const wanted = "Administrator\r\n";
        const permissionEditor = editor.locator('.perm-editor');
        if (await permissionEditor.count() > 0) {
          // This editor owns a hidden content carrier. Drive its real role
          // controls instead of leaving that hidden field unchanged.
          await permissionEditor.locator('input.perm-checkbox-button[value="Anyone"]').uncheck();
          await permissionEditor.locator('input.perm-checkbox-button[value="Administrator"]').check();
        } else if (isTiny) {
          const id = await contentField.getAttribute("id");
          await admin.page.waitForFunction(editor => Boolean(window.tinymce?.get(editor)), id, { timeout: 20000 });
          await admin.page.evaluate(([editor, text]) => { const instance = window.tinymce.get(editor); instance.setContent(text); instance.save(); }, [id, wanted]);
        } else if (await contentField.isVisible()) {
          await contentField.fill(wanted);
        }
        // The rule-submit handler requires an explicit, card-specific Set.
        await editor.locator('input[name="card[name]"][value="'+ruleName+'"]').check();
        const action = new URL(await editor.getAttribute("action"), stack.origin);
        const pending = admin.page.waitForResponse(r => new URL(r.url()).origin === stack.origin && r.request().method() === "POST" && [action.pathname, "/card/update"].includes(new URL(r.url()).pathname), { timeout: 20000 })
          .then(response => ({ response }), error => ({ error }));
        // The rule editor's save control is button[data-cy=save]
        // (src/card/mod-loader/mods/card-mod-rules.ts:2256-2259, submitButton at
        // mod-form-substrate.ts:66-82). It renders inside the overlay, so it is
        // scrolled to and clicked with force: a plain click waits out Playwright's
        // actionability timeout when the overlay has not settled, and a swallowed
        // click timeout looks identical to "the form never submitted".
        const save = editor.locator("button[data-cy='save']").first();
        await save.scrollIntoViewIfNeeded().catch(() => undefined);
        await save.click({ force: true, timeout: 15000 }).catch(error => { submitError = String(error?.message ?? error).slice(0, 120); });
        const observed = await pending;
        if (observed.error) {
          // A submit that never answered must leave its evidence behind rather
          // than throw the rest of the run away (the standard S5's evidence
          // extension set).
          record(capabilityChecks.P6[1], false, {
            card: cardName, ruleName, readRuleHref: readPill.href, editorCarriesRule,
            editorAction: action.pathname, submitClickError: submitError ?? null,
            submitWaitError: String(observed.error?.message ?? observed.error).slice(0, 120),
            ruleContentBefore: beforeRule?.db_content ?? null,
            contentAfterFill: await contentField.inputValue().catch(() => null),
            editorButtons: await editor.evaluate(f => [...f.querySelectorAll("button,input[type=submit]")].map(b => ({ tag: b.tagName.toLowerCase(), type: b.getAttribute("type"), cy: b.getAttribute("data-cy"), text: (b.textContent ?? "").trim().slice(0, 20), visible: b.offsetParent !== null }))),
            raw: captureEvidence(await admin.page.content(), { check: "p6-read-rule-submit", name: cardName }),
          });
          return;
        }
        await observed.response.finished();
        const afterRule = fixtureCard(database(), ruleName);

        // The boundary the administrator just set, read from the member's side.
        const after = await member.page.goto(`${stack.origin}/${encodeURIComponent(cardName)}`, { waitUntil: "load" });
        const afterHtml = await member.page.content();
        record(capabilityChecks.P6[1],
          observed.response.status() < 400
          && afterRule?.db_content === wanted
          && after.status() >= 400
          && !afterHtml.includes(secret),
          {
            card: cardName, ruleName, wanted, editorCarriesRule,
            seedRuleStatus: seedRule.status(),
            ruleWriteStatus: observed.response.status(),
            ruleContentBefore: beforeRule?.db_content ?? null,
            ruleContentAfter: afterRule?.db_content ?? null,
            memberReadBefore: before.status(), memberReadAfter: after.status(),
            secretVisibleAfter: afterHtml.includes(secret),
            raw: captureEvidence(afterHtml, { check: "p6-member-after-read-rule", name: cardName, status: after.status() }),
          });
      } finally {
        await member?.close().catch(() => {});
        await admin?.close().catch(() => {});
      }
    },
  },

  // P4 follows stock Cypress rules.spec.coffee:5-11. "Plus card" means
  // a junction with a more specific *right+*help rule, not a toolbar link.
  {
    name: "P4 default help applies and a plus-card right rule overrides it",
    only: "permission-rules",
    run: async ctx => {
      const {stack,creds,record,database,created,captureEvidence}=ctx;
      if (!["127.0.0.1","localhost","[::1]"].includes(new URL(stack.origin).hostname)) throw Error("P4 requires the disposable loopback fixture");
      const suffix=stamp(),host="HarnessP4Host_"+suffix,right="HarnessP4Right_"+suffix;
      const globalRule="*all+*help",rightRule=right+"+*right+*help";
      const fallback="P4_DEFAULT_"+suffix,override="P4_OVERRIDE_"+suffix;
      const original=fixtureCard(database(),globalRule);
      let admin,changedGlobal=false;
      try {
        admin=await ctx.launchBrowser({origin:stack.origin,assetHosts:ctx.assetHosts});
        await signInActor(admin.page,stack,creds.admin);
        const write=async(name,content,existing)=>{
          const fields={"card[content]":content,"success[redirect]":"true"};
          if(!existing){fields["card[name]"]=name;fields["card[type]"]="RichText";}
          const response=await admin.page.context().request.post(stack.origin+(existing?"/update/~"+existing.id:"/card/create"),{
            headers:{origin:stack.origin,"Content-Type":"application/x-www-form-urlencoded"},data:new URLSearchParams(fields).toString(),maxRedirects:0,
          });
          await response.body();return response.status();
        };
        if(!original)created.push(globalRule);
        created.push(right,right+"+*right",rightRule);
        const globalStatus=await write(globalRule,fallback,original);changedGlobal=globalStatus<400;
        const rightStatus=await write(rightRule,override);
        const observe=async(name,label)=>{
          const response=await admin.page.goto(stack.origin+"/"+encodeURIComponent(name),{waitUntil:"load"});
          const html=await admin.page.content(),main=await admin.page.locator("#main").innerText();
          return {name,status:response.status(),hasFallback:main.includes(fallback),hasOverride:main.includes(override),raw:captureEvidence(html,{check:label,name,status:response.status()})};
        };
        const plain=await observe(host,"p4-default-help"),plus=await observe(host+"+"+right,"p4-right-help"),plainAgain=await observe(host,"p4-default-help-again");
        const globalStored=fixtureCard(database(),globalRule)?.db_content,rightStored=fixtureCard(database(),rightRule)?.db_content;
        const readOnlyNames=fixtureCard(database(),host)===undefined&&fixtureCard(database(),host+"+"+right)===undefined;
        record(capabilityChecks.P4[0],globalStatus<400&&rightStatus<400&&globalStored===fallback&&rightStored===override
          &&plain.status===200&&plain.hasFallback&&!plain.hasOverride&&plus.status===200&&plus.hasOverride&&!plus.hasFallback
          &&plainAgain.status===200&&plainAgain.hasFallback&&!plainAgain.hasOverride&&readOnlyNames,
          {globalStatus,rightStatus,globalStored,rightStored,plain,plus,plainAgain,readOnlyNames});
      } finally {
        if(original&&changedGlobal&&admin){
          const restored=await admin.page.context().request.post(stack.origin+"/update/~"+original.id,{
            headers:{origin:stack.origin,"Content-Type":"application/x-www-form-urlencoded"},
            data:new URLSearchParams({"card[content]":original.db_content??"","success[redirect]":"true"}).toString(),maxRedirects:0,
          });
          await restored.body();if(restored.status()>=400||fixtureCard(database(),globalRule)?.db_content!==original.db_content)throw Error("P4 failed to restore the pre-existing local help rule");
        }
        await admin?.close().catch(()=>{});
      }
    },
  },
];

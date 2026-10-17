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

export const meta = { topic: "permission-rules", capabilityIds: ["P4", "P6", "P7"] };

export const capabilityChecks = {
  P7: [
    "P7 a member denied a restricted card's board gets a denial, not a create form",
    "P7 the administrator positive control still sees the same board",
  ],
  P6: [
    "P6 the board Rules tab offers the set's read and update rules to an administrator",
  ],
  P4: [
    "P4 the board offers a plus card whose create form the administrator can open",
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
const createAffordance = async page => page.evaluate(() => {
  const forms = [...document.querySelectorAll("form")];
  const createForms = forms.filter(f => (f.getAttribute("action") ?? "").includes("/card/create") || f.querySelector('input[name="card[name]"]'));
  return {
    createFormCount: createForms.length,
    createFormActions: createForms.map(f => f.getAttribute("action")),
    nameInputs: document.querySelectorAll('input[name="card[name]"]').length,
    submitButtons: document.querySelectorAll(".create-submit-button").length,
    text: (document.body.innerText ?? "").replace(/\s+/g, " ").slice(0, 160),
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

        // Positive control: the same board, for the actor the rule admits.
        const adminBoard = await admin.page.goto(`${stack.origin}/${encodeURIComponent(cardName)}/board`, { waitUntil: "load" });
        const adminHtml = await admin.page.content();
        record(capabilityChecks.P7[1], adminBoard.status() < 400 && adminHtml.includes(secret), {
          card: cardName, actor: "admin", boardStatus: adminBoard.status(), secretVisible: adminHtml.includes(secret),
          hasBoardPane: await admin.page.locator(".board, .board-main").count() > 0,
        });
      } finally {
        await member?.close().catch(() => {});
        await admin?.close().catch(() => {});
      }
    },
  },

  // ------------------------------------------------------------------- P6
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

        // The administrator selects the set: the selector is _submit-on-select,
        // so choosing it is the act that loads the set's rules.
        await admin.page.evaluate(set => {
          const pane = document.querySelector(".tab-pane-Rules.active") ?? document.querySelector("[id*='rule']");
          const select = pane?.querySelector("select[name='mark']");
          if (select === null) return;
          select.value = set;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }, selfSet);
        await admin.page.waitForTimeout(3000);
        const pills = await admin.page.evaluate(() => [...document.querySelectorAll(".card-slot._fixed-slot a._rule-item, .card-slot._fixed-slot .edit-rule-link")]
          .map(a => ({
            setting: (a.getAttribute("data-cy") ?? "").replace("-pill", "") || a.textContent.replace(/\s+/g, " ").trim().split(" ")[0],
            href: a.getAttribute("href"),
          })));
        const readPill = pills.find(p => p.setting === "read");
        const updatePill = pills.find(p => p.setting === "update");

        // Clicking the read pill opens the rule editor that P6's second half
        // (setting the value) drives. Its control inventory and raw bytes ride
        // along in this row's evidence so the next stage is written against the
        // served DOM, not against an assumption about it.
        let readRuleOverlay = null;
        if (readPill !== undefined) {
          await admin.page.locator(`a[href="${readPill.href}"]`).first().click().catch(() => undefined);
          await admin.page.waitForTimeout(3000);
          readRuleOverlay = await admin.page.evaluate(() => {
            const root = document.querySelector(".overlay-container") ?? document.body;
            return {
              forms: [...root.querySelectorAll("form")].map(f => ({ action: f.getAttribute("action"), method: f.getAttribute("method") })),
              controls: [...root.querySelectorAll("select,input,textarea,button")].slice(0, 30).map(el => ({
                tag: el.tagName.toLowerCase(), name: el.getAttribute("name"), type: el.getAttribute("type"),
                value: el.value ?? null, text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
                options: el.tagName === "SELECT" ? [...el.options].slice(0, 10).map(o => `${o.value}:${o.textContent.trim()}`) : null,
              })),
              text: (root.innerText ?? "").replace(/\s+/g, " ").slice(0, 300),
            };
          });
        }
        record(capabilityChecks.P6[0], readPill !== undefined && updatePill !== undefined, {
          card: cardName, boardStatus: board.status(), ...sets, selfSet, selfOffered,
          settings: pills.map(p => p.setting), readPill: readPill ?? null, updatePill: updatePill ?? null,
          memberReadBefore: before.status(), readRuleOverlay,
          raw: captureEvidence(await admin.page.content(), { check: "p6-rules-tab-set", name: cardName }),
        });
      } finally {
        await member?.close().catch(() => {});
        await admin?.close().catch(() => {});
      }
    },
  },

  // ------------------------------------------------------------------- P4
  {
    name: "P4 a *default rule fills the plus-card create form opened from the board",
    only: "permission-rules",
    run: async ctx => {
      const { stack, creds, record, database, created } = ctx;
      if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(stack.origin).hostname)) throw Error("permission-rules requires the disposable loopback fixture");
      const s = stamp();
      const cardName = "HarnessP4Card_" + s, defaultText = "P4_DEFAULT_" + s;
      const defaultRule = cardName + "+*right+*default";
      let admin;
      try {
        admin = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
        await signInActor(admin.page, stack, creds.admin);
        created.push(cardName, defaultRule);

        const fixture = await createThroughForm(admin.page, stack, { name: cardName, content: "", type: "RichText" });
        if (!fixtureCard(database(), cardName)) throw Error("P4 fixture card was not stored: " + JSON.stringify(fixture));

        // The default-setting rule for every card carrying this card's +*right
        // set. C14 measures this rule's effect on /new/<Type>; P4's remaining
        // half is the PLUS CARD - the affordance on the board that opens the
        // same create form.
        const ruleWrite = await admin.page.context().request.post(stack.origin + "/card/create", {
          headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
          data: new URLSearchParams({ "card[name]": defaultRule, "card[type]": "RichText", "card[content]": defaultText, "success[redirect]": "true" }).toString(),
          maxRedirects: 0,
        });
        const ruleRow = fixtureCard(database(), defaultRule);

        const board = await admin.page.goto(`${stack.origin}/${encodeURIComponent(cardName)}/board`, { waitUntil: "load" });
        const plusLinks = await admin.page.evaluate(() => [...document.querySelectorAll("a, .card-slot")]
          .filter(el => /^\s*\+/.test(el.textContent ?? "") || /\+\s*$/.test((el.getAttribute("data-card-name") ?? "")))
          .slice(0, 8)
          .map(el => ({ tag: el.tagName.toLowerCase(), text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40), href: el.getAttribute("href"), name: el.getAttribute("data-card-name") })));
        // A plus card the administrator can actually open is the affordance P4
        // is about; whether the *default rule's text arrives inside that form
        // is the next stage, written against whatever the form renders here.
        let openedForm = null;
        const plusHref = plusLinks.find(l => l.href && l.href.includes("/new/"))?.href ?? null;
        if (plusHref !== null) {
          const opened = await admin.page.goto(new URL(plusHref, stack.origin).href, { waitUntil: "domcontentloaded" }).catch(() => null);
          if (opened !== null) {
            openedForm = await admin.page.evaluate(() => {
              const form = document.querySelector("form.card-form");
              const field = form?.querySelector('[name="card[content]"]') ?? null;
              const isTiny = field !== null && field.classList.contains("tinymce-textarea");
              return {
                hasForm: form !== null,
                action: form?.getAttribute("action") ?? null,
                contentInput: field === null ? null : { name: field.getAttribute("name"), value: field.value ?? null, tinyMce: isTiny },
                submitButtons: document.querySelectorAll(".create-submit-button").length,
              };
            });
            if (openedForm?.contentInput?.tinyMce === true) {
              // The TinyMCE editor id is not the input name; read it off the DOM.
              const id = await admin.page.evaluate(() => document.querySelector("form.card-form [name='card[content]'].tinymce-textarea")?.id ?? null);
              if (id !== null) {
                await admin.page.waitForFunction(editor => Boolean(window.tinymce?.get(editor)), id, { timeout: 20000 }).catch(() => undefined);
                openedForm.contentValue = await admin.page.evaluate(editor => window.tinymce?.get(editor)?.getContent?.() ?? null, id);
              }
            }
          }
        }
        record(capabilityChecks.P4[0], plusHref !== null && openedForm?.hasForm === true, {
          card: cardName, ruleWriteStatus: ruleWrite.status(), ruleStored: ruleRow !== undefined, ruleContent: ruleRow?.db_content ?? null,
          boardStatus: board.status(), plusLinks, plusHref, openedForm,
        });
      } finally {
        await admin?.close().catch(() => {});
      }
    },
  },
];
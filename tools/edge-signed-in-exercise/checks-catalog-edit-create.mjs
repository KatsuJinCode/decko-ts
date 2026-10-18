// checks-catalog-edit-create.mjs — instruments for the catalog-edit and
// catalog-create rows the coverage matrix
// (docs/registry/instrument-coverage-matrix.json, last_recomputed
// 2026-10-18T00:29:27Z, repo C:/localProjects/brandonDojoTech) still carries
// with NO observing entry at all:
//
//   E7   "Nest rules editor"                              ACT-134
//   E9   "Nest list editor"                               ACT-135
//   E11  "Edit a nested summary with plusses"             ACT-136
//   E13  "Edit type for a new card"                       ACT-137
//   E15  "Save and Close updates the main slot"           ACT-138
//   C7   "Create a plain-input card through the editor"   ACT-128
//   C9   "Invalid number refused in the editor"           ACT-129
//   C11  "Autoname cardtype (name generated on save)"     ACT-130
//
// The eight rows the matrix marks `unmeasured` are catalog-capability
// rows: no instrument has ever observed them. Tonight's earlier lanes
// instrumented other matrix rows (content-flows, role-plus-right,
// permission-rules, account, recent-changes-feed, media, search-overmatch).
// None of those lanes claimed these eight, so this module does.
//
// SERVED SHAPE, measured rather than assumed. Each check's body opens the
// page the capability describes and records what the port actually renders.
// A thrown error stays reserved for a broken fixture (a refused typed
// fixture, a lost session); a missing affordance is the finding this lane
// exists to produce, and an unwritten check is not evidence either way.
//
// Selected by --only catalog-edit-create.

import { checks as saveEditChecks, capabilityChecks as saveEditCapabilityChecks } from "./checks-unmeasured-save-edit-create.mjs";
import { createTypedFixture, fixtureCard, fixtureType } from "./lib/typed-fixture.mjs";

/** The create form on /new/:type (the page's own form, not the navbar's
 *  roles form which is also `form.card-form`). The /new page renders
 *  the navbar's account roles form first, so an unscoped form.card-form
 *  read returns that form's action (/update/<actor>+*enabled_roles)
 *  instead of /card/create. The MAIN_FORM selector rules those out. */
const MAIN_FORM = 'form#new_card[action="/card/create"], #main form.card-form, form.card-form[action*="/card/create"], form.card-form[id="new_card"]';

export const meta = {
  topic: "catalog-edit-create",
  capabilityIds: ["E7", "E9", "E11", "E13", "E15", "C7", "C9", "C11"],
};

/** Whether a 1.110.0 list cardtype exists in this deck; the Ruby view
 *  set/type/nest_list.rb expects a list cardtype with codename `nest_list`.
 *  The local deck keeps the 1.110.0 codenames. */
function nestListCardtypeId(database) {
  return database
    .prepare("SELECT id FROM cards WHERE codename = 'nest_list' AND trash = 0")
    .get()?.id;
}

export const checks = [
  // --------------------------------------------------------------- E7
  {
    name: "E7 a set card renders a nest_rules slot carrying the rule list",
    run: async (ctx) => {
      const { page, database, record, visit, signIn, creds } = ctx;
      await signIn(creds.admin);
      // Ruby contract (filtered_rule_lists.rb:2-5 view :nest_rules, wrap:
      // :slot): a Set card's edit_rules nests the current_set_card under
      // view :board_rules_tab. Find a Set card and open its edit form to
      // grade the slot.
      const setCardRow = database()
        .prepare(
          "SELECT id, name FROM cards WHERE type_id = (SELECT id FROM cards WHERE codename='set' AND trash=0) AND name IS NOT NULL AND trash=0 ORDER BY id LIMIT 1"
        )
        .get();
      if (!setCardRow) {
        record(
          "E7 a set card renders a nest_rules slot carrying the rule list",
          false,
          { note: "no Set card found in the seeded deck" }
        );
        return;
      }
      const setCardName = setCardRow.name;
      await visit("/" + encodeURIComponent(setCardName) + "/edit");
      await page.waitForTimeout(2500);
      const inventory = await page.evaluate(() => {
        const modal = document.querySelector(".modal.show");
        const main = document.querySelector("#main");
        const modalText = (modal?.textContent ?? "") + " " + (main?.textContent ?? "");
        return {
          modalOpen: modal !== null,
          hasNestRulesSlot: (modal ?? document).querySelector('[class*="nest-rules"], [class*="nest_rules"]') !== null,
          hasSettingList: (modal ?? document).querySelector('[class*="quick-edit-setting-list"], [class*="_setting-list"]') !== null,
          hasRuleListText: /setting|rule/i.test(modalText),
          mainTextSnippet: (main?.textContent ?? "").replace(/\s+/g, " ").slice(0, 200),
        };
      });
      // The word-presence arm is evidence, not the verdict (adversarial
      // blindness-review F6 item 7): /setting|rule/i over the modal text
      // passed an edit whose nest_rules slot was entirely missing — the
      // 2026-10-18 full run graded this PASS with hasNestRulesSlot:false and
      // hasSettingList:false, carried by hasRuleListText alone. The slot the
      // name promises is structural.
      const rendered = inventory.hasNestRulesSlot || inventory.hasSettingList;
      record(
        "E7 a set card renders a nest_rules slot carrying the rule list",
        rendered,
        { setCardName, ...inventory, raw: ctx.captureEvidence?.(await page.content(), { check: "E7-nest-rules" }) }
      );
    },
  },

  // --------------------------------------------------------------- E9
  {
    name: "E9 a NestList card renders a nest_list_input with {{...}} rows",
    run: async (ctx) => {
      const { page, database, record, visit, signIn, creds } = ctx;
      await signIn(creds.admin);
      const nestListId = nestListCardtypeId(database());
      if (!nestListId) {
        record(
          "E9 a NestList card renders a nest_list_input with {{...}} rows",
          false,
          { note: "no nest_list codename cardtype in the seeded deck" }
        );
        return;
      }
      const fixtureName = "Harness_nestlist_" + Date.now().toString(36);
      await createTypedFixture(ctx, { type: "Nest list", name: fixtureName, content: "" });
      await visit("/" + encodeURIComponent(fixtureName) + "/edit");
      await page.waitForTimeout(2500);
      const inventory = await page.evaluate(() => {
        const root = document.querySelector(".modal.show") ?? document;
        const nestForms = [...root.querySelectorAll("._nest-form, .pointer-li")];
        const nameFields = [...root.querySelectorAll('input._reference, input.pointer-item-text')];
        const addAnother = root.querySelector(".add-another, [data-add-another], ._add-another-span, .pointer-list-add");
        return {
          modalOpen: document.querySelector(".modal.show") !== null,
          nestFormRows: nestForms.length,
          referenceFields: nameFields.length,
          addAnotherPresent: addAnother !== null,
          mainTextSnippet: (document.querySelector("#main")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 200),
        };
      });
      record(
        "E9 a NestList card renders a nest_list_input with {{...}} rows",
        inventory.modalOpen && (inventory.nestFormRows >= 1 || inventory.referenceFields >= 1),
        { fixtureName, ...inventory, raw: ctx.captureEvidence?.(await page.content(), { check: "E9-nest-list" }) }
      );
    },
  },

  // --------------------------------------------------------------- E11
  {
    name: "E11 a card with a +summary nested field renders that field's editor",
    run: async (ctx) => {
      const { page, database, record, visit, signIn, creds } = ctx;
      await signIn(creds.admin);
      // The check's name promises a +summary NESTED FIELD's editor — the
      // field group a parent card's edit form renders for its +summary right
      // (adversarial blindness-review F6 item 8: the old target was
      // `name LIKE '%+*account'`, an account RULE card with no +summary
      // field, and the predicate was hasContentField || hasEmailOrPassword —
      // any content or email/password input anywhere in the modal, so the
      // +summary editor the name claims was never opened). Neither this
      // battery's deck copy nor a seeded +summary junction can be assumed
      // (the local deck copy carries none — measured in the 2026-10-18
      // re-grade: `name LIKE '%+summary'` found no row), so the case STAGES
      // the whole shape it grades: a host card, its +*self+*structure rule
      // nesting {{+summary}}, and the +summary junction with its own content.
      // Measured 2026-10-18 on the ts engine: the host's edit modal then
      // renders .RIGHT-summary (2 groups) whose d0-card-content editor holds
      // the junction's stored content.
      const stamp = Date.now().toString(36);
      const host = `Harness_E11_summary_host_${stamp}`;
      const summaryContent = `E11 summary content ${stamp}`;
      await createTypedFixture(ctx, { name: host, content: "E11 host", type: "Basic" });
      ctx.created?.push?.(host);
      await createTypedFixture(ctx, { name: `${host}+*self+*structure`, content: "{{+summary}}", type: "Phrase" });
      ctx.created?.push?.(`${host}+*self+*structure`);
      // The +summary junction rides the request channel: under the structure
      // rule the junction's create FORM answered 200 without storing the
      // requested card (the battery r2 re-grade recorded "typed fixture was
      // not created as requested: ...+summary; HTTP 200; stored null"),
      // while POST /card/create with the same fields stores it — measured
      // both ways on the ts engine (303, row present, editor renders the
      // stored content).
      const junctionCreate = await page.context().request.post(`${ctx.stack.origin}/card/create`, {
        headers: { origin: ctx.stack.origin },
        form: { "card[name]": `${host}+summary`, "card[type]": "Phrase", "card[content]": summaryContent, "success[redirect]": "true" },
        maxRedirects: 0,
      }).catch((e) => ({ error: String(e?.message ?? e) }));
      const junctionOk = !junctionCreate.error && junctionCreate.status() < 400;
      const junctionStored = database().prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(`${host}+summary`);
      ctx.created?.push?.(`${host}+summary`);
      if (!junctionOk || !junctionStored) {
        record(
          "E11 a card with a +summary nested field renders that field's editor",
          false,
          { target: host, junctionCreateStatus: junctionCreate.error ? null : junctionCreate.status(), junctionStored: !!junctionStored }
        );
        return;
      }
      await visit("/" + encodeURIComponent(host) + "/edit");
      await page.waitForTimeout(2500);
      const inventory = await page.evaluate(() => {
        const root = document.querySelector(".modal.show") ?? document;
        const editors = [...root.querySelectorAll(".RIGHT-summary textarea.d0-card-content, .RIGHT-summary input.d0-card-content")];
        return {
          modalOpen: document.querySelector(".modal.show") !== null,
          summaryGroups: root.querySelectorAll(".RIGHT-summary").length,
          summaryEditorNames: editors.map((i) => i.getAttribute("name") ?? "").slice(0, 8),
          summaryEditorValues: editors.map((i) => i.value?.slice(0, 60) ?? null).slice(0, 8),
        };
      });
      record(
        "E11 a card with a +summary nested field renders that field's editor",
        inventory.modalOpen && inventory.summaryEditorNames.length >= 1,
        { target: host, summaryContent, ...inventory, raw: ctx.captureEvidence?.(await page.content(), { check: "E11-nested-summary" }) }
      );
    },
  },

  // --------------------------------------------------------------- E13
  {
    name: "E13 a /new form serves a card[type] selector the user can change",
    run: async ctx => {
      const {page,stack,database,record,visit,signIn,creds}=ctx;
      await signIn(creds.admin);
      const startType=fixtureType(database(),'Basic'),chosenType=fixtureType(database(),'Phrase');
      // /new/:type deliberately presets its type in stock Decko.
      await visit('/new/'+encodeURIComponent(startType.name));
      const typed=page.locator('form[action="/card/create"]').first();
      const typedHasChooser=await typed.locator('select[name="card[type]"],select[name="card[type_id]"]').count()>0;
      const typedTypeId=Number(await typed.locator('input[name="card[type_id]"]').inputValue());
      const name='HarnessE13'+Date.now();ctx.created.push(name);
      await visit('/card/new?'+new URLSearchParams({'card[name]':name}));
      const form=page.locator('form[action="/card/create"]').first();
      const field=form.locator('select[name="card[type]"],select[name="card[type_id]"]').first();
      const chooserPresent=await field.count()>0;
      if(!chooserPresent){record("E13 a /new form serves a card[type] selector the user can change",false,{name,chooserPresent,typedHasChooser,typedTypeId,raw:ctx.captureEvidence(await page.content(),{check:'E13-type-selector'})});return;}
      const options=await field.locator('option').evaluateAll(items=>items.map(option=>({value:option.value,text:option.textContent.trim()})));
      const choice=options.find(option=>option.text===chosenType.name||option.value===chosenType.name||option.value===String(chosenType.id));
      if(!choice)throw Error('The new type chooser does not offer the canonical Phrase type');
      if(await field.isVisible())await field.selectOption(choice.value);
      else{
        const control=field.locator('xpath=following-sibling::span[contains(@class,"select2-container")]').first();
        await control.locator('.select2-selection').click();
        const search=page.locator('.select2-container--open input.select2-search__field:visible');
        if(await search.count())await search.last().fill(chosenType.name);
        await page.locator('.select2-container--open .select2-results__option').filter({hasText:new RegExp('^\\s*'+chosenType.name+'\\s*$')}).last().click();
      }
      const updated=page.locator('form[action="/card/create"]').first();
      const content=updated.locator('input[name="card[content]"]:not([type=hidden])').first();
      await content.waitFor({state:'visible',timeout:20000});
      const marker='E13 chosen phrase '+name;await content.fill(marker);
      const pending=page.waitForResponse(r=>new URL(r.url()).origin===stack.origin&&new URL(r.url()).pathname==='/card/create'&&r.request().method()==='POST',{timeout:30000}).then(response=>({response}),error=>({error}));
      await updated.locator('.create-submit-button').click();
      const seen=await pending;if(seen.error)throw seen.error;await seen.response.finished();
      const outcome=await seen.response.json().catch(()=>null);
      if(typeof outcome?.redirect==='string'){
        const redirect=new URL(outcome.redirect,stack.origin);
        if(redirect.origin!==stack.origin)throw Error('Type-choice create left the owned origin');
        await page.waitForURL(redirect.href,{waitUntil:'domcontentloaded',timeout:20000});
      }
      const stored=fixtureCard(database(),name);
      record("E13 a /new form serves a card[type] selector the user can change",!typedHasChooser&&typedTypeId===startType.id&&seen.response.status()<400&&stored?.type_id===chosenType.id&&stored.db_content===marker,{
        name,typedHasChooser,typedTypeId,chooserPresent,selected:choice,submitStatus:seen.response.status(),expectedTypeId:chosenType.id,storedTypeId:stored?.type_id,storedContent:stored?.db_content,raw:ctx.captureEvidence(await page.content(),{check:'E13-type-selector'})
      });
    },
  },

  // --------------------------------------------------------------- E15
  {
    name: "E15 the edit modal's Save and Close updates the main slot",
    run: async (ctx) => {
      const { page, database, record, visit, signIn, creds, ledger, linesSince } = ctx;
      await signIn(creds.admin);
      const fixtureName = "Harness_saveclose_" + Date.now().toString(36);
      await createTypedFixture(ctx, { type: "Phrase", name: fixtureName, content: "save close before" });
      await visit("/" + encodeURIComponent(fixtureName) + "/edit");
      await page.waitForTimeout(2500);
      const surface = await page.evaluate(() => {
        const modal = document.querySelector(".modal.show");
        const editCard = document.querySelector("#edit_card");
        const form = modal?.querySelector("form") ?? editCard ?? null;
        return {
          modalOpen: modal !== null,
          editCardOpen: editCard !== null,
          modalFormAction: form?.getAttribute("action") ?? null,
        };
      });
      const saveAndClose = page.locator(
        ".modal button.submit-button, .modal button[type=submit]:has-text('Save and Close'), " +
        ".modal button:has-text('Save and Close'), #edit_card button.submit-button"
      ).first();
      const hasSaveAndClose = await saveAndClose.count();
      if (!hasSaveAndClose || !surface.modalOpen) {
        record(
          "E15 the edit modal's Save and Close updates the main slot",
          false,
          { note: "edit modal did not open or Save and Close button absent", surface, hasSaveAndClose }
        );
        return;
      }
      const field = page.locator(
        '.modal input[name$="[content]"]:not([type=hidden]), ' +
        '.modal textarea[name$="[content]"]:not([type=hidden])'
      ).first();
      if (await field.count() === 0) {
        record(
          "E15 the edit modal's Save and Close updates the main slot",
          false,
          { note: "no content field in the edit modal" }
        );
        return;
      }
      const newContent = "save close after " + Date.now().toString(36);
      await field.fill(newContent);
      const before = ledger().length;
      await saveAndClose.click();
      await page.waitForTimeout(3500);
      const write = linesSince(before).find((l) => l.method !== "GET");
      const after = await visit("/" + encodeURIComponent(fixtureName));
      const showsNew = after.html.includes(newContent);
      const modalClosed = await page.evaluate(() => document.querySelector(".modal.show") === null);
      record(
        "E15 the edit modal's Save and Close updates the main slot",
        write !== undefined && write.status < 400 && showsNew && modalClosed,
        { writeStatus: write?.status ?? null, showsNew, modalClosed, newContent, surface }
      );
    },
  },

  // --------------------------------------------------------------- C7
  {
    name: "C7 a plain-input card can be created through the editor",
    run: async (ctx) => {
      const { page, database, record, visit, signIn, creds } = ctx;
      await signIn(creds.admin);
      const fixtureName = "Harness_plaintext_" + Date.now().toString(36);
      const plainType = fixtureType(database(), "PlainText");
      await visit("/new/" + encodeURIComponent(plainType.name));
      await page.waitForTimeout(2500);
      const inventory = await page.evaluate(() => {
        const form = document.querySelector("form#new_card[action='/card/create']") ?? document.querySelector("form#new_card") ?? document.querySelector("#main form.card-form");
        const inputs = form ? [...form.querySelectorAll("input,textarea,select")] : [];
        const nameField = form?.querySelector('input[name="card[name]"]') ?? null;
        const contentField = form?.querySelector('input[name="card[content]"], textarea[name="card[content]"]') ?? null;
        const submit = form?.querySelector("button.submit-button, .create-submit-button, button[type=submit]") ?? null;
        return {
          formAction: form?.getAttribute("action") ?? null,
          nameFieldEditable: nameField !== null && !nameField.hasAttribute("readonly"),
          contentFieldPresent: contentField !== null,
          submitPresent: submit !== null,
          hiddenTypeId: form?.querySelector('input[name="card[type_id]"]')?.value ?? null,
        };
      });
      if (!inventory.nameFieldEditable || !inventory.contentFieldPresent || !inventory.submitPresent) {
        record(
          "C7 a plain-input card can be created through the editor",
          false,
          { note: "PlainText new form is missing one of name/content/submit", fixtureName, ...inventory }
        );
        return;
      }
      const pending = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST",
        { timeout: 60_000 }
      ).then((response) => ({ response }), (error) => ({ error }));
      await page.locator("form#new_card[action='/card/create'] input[name='card[name]']").first().fill(fixtureName);
      await page.locator("form#new_card[action='/card/create'] input[name='card[content]'], form#new_card[action='/card/create'] textarea[name='card[content]']").first().fill("plain text body " + Date.now().toString(36));
      await page.locator(".create-submit-button, form#new_card[action='/card/create'] button[type=submit]").first().click();
      const seen = await pending;
      if (seen.error) throw seen.error;
      await seen.response.finished();
      const stored = fixtureCard(database(), fixtureName);
      record(
        "C7 a plain-input card can be created through the editor",
        seen.response.status() < 400 && stored !== undefined && Number(stored.type_id) === Number(plainType.id),
        { fixtureName, writeStatus: seen.response.status(), storedTypeId: stored?.type_id, expectedTypeId: plainType.id, ...inventory }
      );
    },
  },

  // --------------------------------------------------------------- C9
  {
    name: "C9 an invalid number is refused in the editor",
    run: async (ctx) => {
      const { page, database, record, visit, signIn, creds } = ctx;
      await signIn(creds.admin);
      const fixtureName = "Harness_badnumber_" + Date.now().toString(36);
      const numberType = fixtureType(database(), "Number");
      await visit("/new/" + encodeURIComponent(numberType.name));
      await page.waitForTimeout(2500);
      const form = page.locator("form#new_card[action='/card/create']").first();
      if ((await form.count()) === 0) {
        record(
          "C9 an invalid number is refused in the editor",
          false,
          { note: "no /card/create form rendered for Number type", numberType: numberType.name }
        );
        return;
      }
      const before = database()
        .prepare("SELECT COUNT(*) AS n FROM cards WHERE name=? AND trash=0")
        .get(fixtureName)?.n ?? 0;
      const pending = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST",
        { timeout: 60_000 }
      ).then((response) => ({ response }), (error) => ({ error }));
      await form.locator('input[name="card[name]"]').first().fill(fixtureName);
      await form.locator('input[name="card[content]"], textarea[name="card[content]"]').first().fill("not-a-number-at-all");
      await form.locator(".create-submit-button, button[type=submit]").first().click();
      const seen = await pending;
      if (seen.error) throw seen.error;
      await seen.response.finished();
      const after = database()
        .prepare("SELECT COUNT(*) AS n FROM cards WHERE name=? AND trash=0")
        .get(fixtureName)?.n ?? 0;
      let bodyText = null;
      try {
        bodyText = await seen.response.text();
      } catch { /* the response body may have been streamed */ }
      const refused = seen.response.status() >= 400 || after === 0;
      const storedAnyway = after > before;
      record(
        "C9 an invalid number is refused in the editor",
        refused && !storedAnyway,
        { writeStatus: seen.response.status(), before, after, storedAnyway, bodyExcerpt: (bodyText ?? "").slice(0, 200) }
      );
    },
  },

  // C11 shares the actual save/readback implementation. Its separate run
  // uses a new private fixture; this is one capability, not extra coverage.
  {
    name:"C11 an autoname cardtype generates its name on save",
    run:async ctx=>{
      const check=saveEditChecks.find(check=>check.name===saveEditCapabilityChecks.C11[0]);
      if(!check)throw Error('Native autoname journey unavailable');
      await check.run({...ctx,record:(_name,pass,evidence)=>ctx.record("C11 an autoname cardtype generates its name on save",pass,{...evidence,sharedImplementation:'save-edit-create/C11',sameCapability:true})});
    },
  },
];

export async function runChecks(ctx) {
  for (const c of checks) {
    await ctx.attempt(c.name, () => c.run(ctx));
    if (ctx.fixtureState?.fatalReason) throw new Error("fixture quarantined: " + ctx.fixtureState.fatalReason);
  }
}

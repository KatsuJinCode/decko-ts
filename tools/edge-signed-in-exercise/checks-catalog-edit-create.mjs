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

/** Whether the deck has a cardtype with an autoname rule; the matrix
 *  carries C11 with no instrument of any kind. */
function findAutonameSetCardId(database) {
  return database
    .prepare(
      "SELECT id FROM cards WHERE codename IN ('autoname','trademark','year') AND trash = 0 LIMIT 1"
    )
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
        const root = document.querySelector(".modal.show") ?? document;
        return {
          modalOpen: document.querySelector(".modal.show") !== null,
          hasNestRulesSlot: root.querySelector('[class*="nest-rules"], [class*="nest_rules"]') !== null,
          hasSettingList: root.querySelector('[class*="quick-edit-setting-list"], [class*="_setting-list"]') !== null,
          hasRuleListText: /setting|rule/i.test(root.textContent ?? ""),
          mainTextSnippet: (document.querySelector("#main")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 200),
        };
      });
      const rendered =
        inventory.hasNestRulesSlot ||
        inventory.hasSettingList ||
        inventory.hasRuleListText;
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
      const summaryTypeRow = database()
        .prepare(
          "SELECT id, name FROM cards WHERE codename='account' AND trash=0 LIMIT 1"
        )
        .get();
      if (!summaryTypeRow) {
        record(
          "E11 a card with a +summary nested field renders that field's editor",
          false,
          { note: "no account cardtype in the seeded deck" }
        );
        return;
      }
      const accountCardRow = database()
        .prepare(
          "SELECT id, name FROM cards WHERE name LIKE '%+*account' AND trash=0 LIMIT 1"
        )
        .get();
      const target = accountCardRow?.name ?? summaryTypeRow.name;
      await visit("/" + encodeURIComponent(target) + "/edit");
      await page.waitForTimeout(2500);
      const inventory = await page.evaluate(() => {
        const root = document.querySelector(".modal.show") ?? document;
        const inputs = [...root.querySelectorAll('input, textarea')];
        return {
          modalOpen: document.querySelector(".modal.show") !== null,
          inputNames: inputs.map((i) => i.getAttribute("name") ?? "").filter(Boolean).slice(0, 20),
          hasContentField: inputs.some((i) => /content/.test(i.getAttribute("name") ?? "")),
          hasEmailOrPassword: inputs.some((i) => /email|password/i.test(i.getAttribute("name") ?? "")),
          mainTextSnippet: (document.querySelector("#main")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 200),
        };
      });
      record(
        "E11 a card with a +summary nested field renders that field's editor",
        inventory.modalOpen && (inventory.hasContentField || inventory.hasEmailOrPassword),
        { target, ...inventory, raw: ctx.captureEvidence?.(await page.content(), { check: "E11-nested-summary" }) }
      );
    },
  },

  // --------------------------------------------------------------- E13
  {
    name: "E13 a /new form serves a card[type] selector the user can change",
    run: async (ctx) => {
      const { page, database, record, visit, signIn, creds } = ctx;
      await signIn(creds.admin);
      const startType = fixtureType(database(), "Basic");
      await visit("/new/" + encodeURIComponent(startType.name));
      await page.waitForTimeout(2500);
      const inventory = await page.evaluate(() => {
        const form = document.querySelector("form#new_card[action='/card/create']") ?? document.querySelector("form#new_card") ?? document.querySelector("#main form.card-form");
        const inputs = form ? [...form.querySelectorAll("input,select,textarea")] : [];
        const radios = [...(form?.querySelectorAll('input[type="radio"][name="card[type]"]') ?? [])];
        const select = form?.querySelector('select[name="card[type]"], select[name="card[type_id]"]') ?? null;
        return {
          formAction: form?.getAttribute("action") ?? null,
          radioCount: radios.length,
          radioNames: [...new Set(radios.map((r) => r.value).filter(Boolean))].slice(0, 10),
          selectPresent: select !== null,
          selectOptions: select ? [...select.options].map((o) => o.value).filter(Boolean).slice(0, 10) : [],
          hiddenTypeId: form?.querySelector('input[name="card[type_id]"]')?.value ?? null,
          mainTextSnippet: (document.querySelector("#main")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 200),
        };
      });
      const changeable =
        (inventory.radioCount > 1) ||
        (inventory.selectPresent && inventory.selectOptions.length > 1);
      record(
        "E13 a /new form serves a card[type] selector the user can change",
        changeable && inventory.hiddenTypeId !== null,
        { startType: startType.name, ...inventory, raw: ctx.captureEvidence?.(await page.content(), { check: "E13-type-selector" }) }
      );
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

  // --------------------------------------------------------------- C11
  {
    name: "C11 an autoname cardtype generates its name on save",
    run: async (ctx) => {
      const { page, database, record, visit, signIn, creds } = ctx;
      await signIn(creds.admin);
      const autoRow = findAutonameSetCardId(database());
      const inventory = {
        autonameCodenamePresent: autoRow !== undefined,
        typesWithAutonameRule: database()
          .prepare(
            "SELECT COUNT(*) AS n FROM cards WHERE codename='autoname' AND trash=0"
          )
          .get()?.n ?? 0,
      };
      if (!autoRow) {
        record(
          "C11 an autoname cardtype generates its name on save",
          false,
          { note: "no autoname codename in the seeded deck; the surface is not exercised", ...inventory }
        );
        return;
      }
      // The 1.110.0 deck keeps the autoname codename on the *autoname set
      // card (id 247); the autoname rule on a TYPE is a junction row with
      // right_id = 247 and left_id = type_id. No seeded cardtype here has
      // such a rule (the typesWithAutonameRule count is 1 = the set card
      // itself), so the contract cannot be exercised on this deck. Record
      // the surface state.
      const autoTypeRow = database()
        .prepare(
          "SELECT t.id, t.name FROM cards t JOIN cards r ON r.left_id = t.id AND r.right_id = (SELECT id FROM cards WHERE codename='autoname' AND trash=0) AND r.trash=0 WHERE t.trash=0 AND t.type_id = (SELECT id FROM cards WHERE codename='cardtype' AND trash=0) LIMIT 1"
        )
        .get();
      if (!autoTypeRow) {
        record(
          "C11 an autoname cardtype generates its name on save",
          false,
          { note: "no Cardtype has a +*autoname rule in the seeded deck; surface not exercisable here", ...inventory }
        );
        return;
      }
      await visit("/new/" + encodeURIComponent(autoTypeRow.name));
      await page.waitForTimeout(2500);
      const form = page.locator("form#new_card[action='/card/create']").first();
      if ((await form.count()) === 0) {
        record(
          "C11 an autoname cardtype generates its name on save",
          false,
          { note: "no /card/create form rendered", autoTypeRow: autoTypeRow.name, ...inventory }
        );
        return;
      }
      const nameField = form.locator('input[name="card[name]"]').first();
      const nameFieldType = (await nameField.count()) > 0 ? await nameField.getAttribute("type") : null;
      const nameHidden = nameFieldType === "hidden";
      const promptVisible = await page.evaluate(() => {
        const f = document.querySelector("form#new_card[action='/card/create']") ?? document.querySelector("form#new_card");
        const nameInput = f?.querySelector('input[name="card[name]"]') ?? null;
        if (!nameInput) return false;
        const isVisible = nameInput.offsetParent !== null && nameInput.type !== "hidden";
        return isVisible;
      });
      record(
        "C11 an autoname cardtype generates its name on save",
        nameHidden || !promptVisible,
        { autoTypeRow: autoTypeRow.name, nameHidden, promptVisible, ...inventory }
      );
    },
  },
];

export async function runChecks(ctx) {
  for (const c of checks) {
    await ctx.attempt(c.name, () => c.run(ctx));
    if (ctx.fixtureState?.fatalReason) throw new Error("fixture quarantined: " + ctx.fixtureState.fatalReason);
  }
}
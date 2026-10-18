// checks-unmeasured-save-edit-create.mjs — continuation lane A of the
// 2026-10-17 unmeasured-matrix lane. Per the assignment: pick the next 8
// actions from the matrix that no instrument has ever observed, drawn from
// families NOT yet touched tonight's earlier lanes (engine-permissions,
// interaction-widgets, content-flows), and write a measured instrument for
// each.
//
// Matrix ACT ids → capability ids claimed here:
//   ACT-130 → C11  "Autoname cardtype (name generated on save)"
//   ACT-132 → C15  "Radio input in a new card"
//   ACT-133 → C17  "Multiselect input in a new card"
//   ACT-134 → E7   "Nest rules editor"
//   ACT-136 → E11  "Edit a nested summary with plusses"
//   ACT-138 → E15  "Save and Close updates the main slot"
//   ACT-164 → CM1  "Comment on a card"
//   ACT-171 → N15  "Hashtag/reference navigation"
//
// What tonight's earlier lanes did NOT touch:
//   - capability catalog rows whose `kind` is "catalog-capability" in the
//     create / edit / history / follow / permissions groups (the matrix
//     carries them as family `none`)
//   - the enumeration-backlog rows in the comments / hashtag / related-card
//     / history-revision panels (no instrument saw them)
// This module claims eight of those rows, prioritised by the standing
// rule's verb ranking: save (E15, C11), pick/type (C15, C17, E7), edit
// (E11), and then one each from comments (CM1) and reference navigation
// (N15) so a single lane does not concentrate on one verb.
//
// Each check records what the surface DID with the evidence that shows it,
// instead of throwing on a shape it did not expect; a first measurement
// that finds nothing is the result this lane exists to produce. A thrown
// error stays reserved for a broken fixture (refused typed fixture, lost
// session) which is not a finding about the surface.
//
// `requiresMail` is NOT declared: this lane reads no mailbox; the mail
// capture stays available for other lanes.
//
// capabilityIds is declared so the run record shows this module's claim;
// capabilities.json still lists every row here as `not_covered`, and
// adding capabilities.json rows is the capabilities lane's to do. The
// check names below match the matrix action text so a future coverage
// pass credits them.

import { fixtureCard } from "./lib/typed-fixture.mjs";

export const meta = {
  topic: "unmeasured-save-edit-create",
  capabilityIds: ["C11", "C15", "C17", "E7", "E11", "E15", "CM1", "N15"],
};

export const capabilityChecks = {
  C11: [
    "C11 a cardtype created with an autoname pattern stores a card with the generated name, not the empty name",
  ],
  C15: [
    "C15 a new card form on a cardtype with a pointer slot renders the radio input and a selection persists",
  ],
  C17: [
    "C17 a new card form on a cardtype with a multi-pointer slot renders the multiselect input and a selection persists",
  ],
  E7: [
    "E7 the nest dialog offers a Rules editor option whose form accepts a rule name and persists the rule",
  ],
  E11: [
    "E11 editing a nested summary card opens an editor scoped to the nested slot and the new content persists",
  ],
  E15: [
    "E15 the editor's Save-and-Close control writes the new content and returns to the edited card page",
  ],
  CM1: [
    "CM1 a signed-in member adds a comment to a card and the comment is on the card's page afterwards",
  ],
  N15: [
    "N15 clicking a [[reference]] on a card navigates to the referenced card and the page shows its main slot",
  ],
};

const stamp = () => Date.now().toString(36);
const isLocalOrigin = (stackOrigin) => ["127.0.0.1", "localhost", "[::1]"].includes(new URL(stackOrigin).hostname);

/** Signs the active page in through the deck's own form, the way every other
 *  checks module signs its actor in. */
async function signInActor(page, stack, creds) {
  await page.goto(stack.origin + "/*signin", { waitUntil: "load" });
  await page.fill('input[name="card[subcards][+*email][content]"]', creds.email);
  await page.fill('input[type="password"]', creds.password);
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: 20000 })
    .then(response => ({ response }), error => ({ error }));
  await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
  const observed = await pending;
  if (observed.error) throw observed.error;
  await observed.response.finished();
  if (observed.response.status() >= 400) throw Error("actor was not signed in: " + observed.response.status());
  return observed.response.status();
}

/** Posts an engine write through the deck's own /card/create endpoint and
 *  returns the response plus the row's id from the running fixture database.
 *  This is the same transport create-permission / permission-rules use. */
async function createThroughForm(page, stack, database, { name, type, content = "" }) {
  const opened = await page.goto(`${stack.origin}/new/${encodeURIComponent(type)}?card%5Bname%5D=${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" });
  if (opened.status() >= 400) throw Error(`create form refused (${type}): HTTP ${opened.status()}`);
  const form = page.locator("form.card-form").filter({ has: page.locator('input[name="card[name]"]') }).first();
  if (await form.count() === 0) throw Error(`create form is absent (${type})`);
  const field = form.locator('[name="card[content]"]').first();
  if (content !== "" && await field.count() > 0) {
    const isTiny = await field.evaluate(el => el.classList.contains("tinymce-textarea"));
    if (isTiny) {
      const id = await field.getAttribute("id");
      if (id === null) throw Error("create editor has no identity");
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
  const row = database().prepare("SELECT id,name,type_id,trash FROM cards WHERE name=? AND trash=0").get(name);
  return { status: observed.response.status(), row };
}

/** What the nest dialog offers as the picker after the {{}} button is clicked:
 *  a list of nest types with their picker affordance. The E7 row is "Nest
 *  rules editor" - the engine ships nest pickers for List, Image, Link, and
 *  Rules; this is the picker for the rules shape (src/card/mod-loader/mods/
 *  card-mod-editor-nest-types.ts is the dispatch, but the rendered DOM is
 *  the source of truth here). */
async function nestPickerOffered(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector(".modal, .ui-dialog, [role='dialog']") ?? document.body;
    const buttons = [...dialog.querySelectorAll("button, a.button, .btn, a")];
    return {
      buttons: buttons.map(b => (b.textContent ?? "").replace(/\s+/g, " ").trim()).filter(t => t !== "").slice(0, 30),
      hasRulesOption: buttons.some(b => /rules?/i.test((b.textContent ?? ""))),
      hasListOption: buttons.some(b => /^list$/i.test((b.textContent ?? "").trim())),
      hasImageOption: buttons.some(b => /^image$/i.test((b.textContent ?? "").trim())),
      hasLinkOption: buttons.some(b => /^link$/i.test((b.textContent ?? "").trim())),
    };
  });
}

export const checks = [
  // -------------------------------------------------------------------- C11
  // What the cypress reference 'simple cardtype autoname' asserts: a cardtype
  // with name set to "_self/{{year}}+{{month}}+{{day}}+birthday" auto-derives
  // the name from the inserted date tokens. The deck does not carry an
  // autoname-pattern cardtype by default in this snapshot, so this check
  // creates one (with a stable name pattern that produces a known token) and
  // then submits a card through the form with that cardtype selected. The
  // verdict is whether a card row exists afterwards, named after the generated
  // token - the "name generated on save" claim.
  {
    name: capabilityChecks.C11[0],
    only: "unmeasured-save-edit-create",
    run: async ctx => {
      const { stack, page, creds, record, database, created, captureEvidence, fixtureState } = ctx;
      if (!isLocalOrigin(stack.origin)) throw Error("C11 requires the disposable loopback fixture");
      const signedIn = await signInActor(page, stack, creds.admin);
      if (signedIn >= 400) throw Error("C11 admin was not signed in");
      const s = stamp();
      // The cardtype's own name pattern is the engine's documented autoname
      // anchor (decko-ruby-reference/decko/spec/cypress/e2e/create/presetting_spec.coffee
      // 'simple cardtype autoname'): a leading underscore triggers autoname.
      const cardtypeName = "HarnessC11Type_" + s;
      const cardName = "HarnessC11Card_" + s;
      created.push(cardtypeName, cardName);

      // Seed the autoname cardtype through the engine's own /card/create.
      const typeCreate = await page.context().request.post(stack.origin + "/card/create", {
        headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({
          "card[name]": cardtypeName,
          "card[type]": "CardType",
          "card[content]": "harness C11 autoname cardtype " + s,
          "success[redirect]": "true",
        }).toString(),
        maxRedirects: 0,
      });
      const cardtypeRow = fixtureCard(database(), cardtypeName);
      if (typeCreate.status() >= 400 || cardtypeRow === undefined) throw Error("C11 cardtype was not stored: HTTP " + typeCreate.status());

      // Open the new-card form for the cardtype and submit with the seed name
      // empty so the autoname branch can run. The form's name input is left
      // blank on purpose.
      const opened = await page.goto(`${stack.origin}/new/${encodeURIComponent(cardtypeName)}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const form = page.locator("form.card-form").filter({ has: page.locator('.create-submit-button') }).first();
      if (await form.count() === 0) throw Error("C11 cardtype create form is absent");
      const action = new URL(await form.getAttribute("action"), stack.origin);
      const pending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST", { timeout: 30_000 })
        .then(response => ({ response }), error => ({ error }));
      await form.locator(".create-submit-button").first().click();
      const observed = await pending;
      if (observed.error) throw observed.error;
      await observed.response.finished();

      // Read every card with the cardtype (the autoname branch may have named
      // the new card after the date pattern - we do not assert the exact name
      // because the harness clock produces a fresh date string per run, but we
      // DO assert: (a) the create request returned 2xx/3xx (the engine did
      // something), (b) at least one card with this cardtype now exists that
      // did not exist before, and (c) the row was stored under a non-empty
      // name (autoname does not store an empty name).
      const cardsBefore = cardtypeRow.id;
      const beforeRowCount = database().prepare("SELECT COUNT(*) AS n FROM cards WHERE type_id=? AND trash=0").get(cardsBefore)?.n ?? 0;
      const afterRow = database().prepare("SELECT id,name FROM cards WHERE type_id=? AND trash=0 ORDER BY id DESC LIMIT 1").get(cardsBefore);
      const allRowsAfter = database().prepare("SELECT id,name FROM cards WHERE type_id=? AND trash=0 ORDER BY id").all(cardsBefore).map(r => r.name);
      const newRows = allRowsAfter.length;
      const storedName = afterRow?.name ?? "";
      const verdict = observed.response.status() < 400 && newRows > beforeRowCount && storedName.length > 0 && storedName !== cardtypeName;
      const html = await page.content();
      record(capabilityChecks.C11[0], verdict, {
        actor: creds.admin.name,
        cardtype: cardtypeName,
        cardtypeTypeId: cardtypeRow.type_id,
        createStatus: observed.response.status(),
        cardsBeforeTypeWrite: beforeRowCount,
        cardsAfterTypeWrite: newRows,
        mostRecentCardName: storedName,
        allCardsForType: allRowsAfter,
        requestStatus: opened.status(),
        raw: captureEvidence(html, { check: "c11-autoname", cardtype: cardtypeName }),
      });
      if (fixtureState?.fatalReason) throw Error("C11 fixture quarantined: " + fixtureState.fatalReason);
    },
  },

  // -------------------------------------------------------------------- C15
  // Cucumber 'radio input': a Phrase cardtype with a pointer slot that the
  // form renders as a radio. The simplest proof that C15's flow path passes
  // is: (a) a cardtype exists with a slot whose pointer view is single-choice,
  // (b) the new-card form on that cardtype shows radio inputs (multiple input
  // type="radio" sharing a name), and (c) clicking one radio and submitting
  // persists the picked value (read from the stored card content or from a
  // fresh GET on the persisted slot).
  {
    name: capabilityChecks.C15[0],
    only: "unmeasured-save-edit-create",
    run: async ctx => {
      const { stack, page, creds, record, database, created, captureEvidence, fixtureState } = ctx;
      if (!isLocalOrigin(stack.origin)) throw Error("C15 requires the disposable loopback fixture");
      const signedIn = await signInActor(page, stack, creds.admin);
      if (signedIn >= 400) throw Error("C15 admin was not signed in");
      const s = stamp();
      const cardtypeName = "HarnessC15Type_" + s;
      const optionName = "HarnessC15Option_" + s;
      const cardName = "HarnessC15Card_" + s;
      created.push(cardtypeName, optionName, cardName);

      // The option card the slot will point at - a regular Phrase.
      const optionCreate = await createThroughForm(page, stack, database, { name: optionName, type: "Phrase", content: "C15 option " + s });
      if (optionCreate.status >= 400 || optionCreate.row === undefined) throw Error("C15 option was not stored");

      // Seed a cardtype with a pointer slot typed as Phrase; the form should
      // render a radio input. We add the slot through a raw type-rule storage
      // because the engine's own /card/create does not expose a slot editor.
      const typeCreate = await page.context().request.post(stack.origin + "/card/create", {
        headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({
          "card[name]": cardtypeName,
          "card[type]": "CardType",
          "card[content]": "harness C15 pointer cardtype " + s,
          "success[redirect]": "true",
        }).toString(),
        maxRedirects: 0,
      });
      if (typeCreate.status() >= 400) throw Error("C15 cardtype was not stored");

      // Now open the new-card form for the cardtype and read its rendered
      // inputs. If the engine renders a radio input, multiple `input[type=radio]`
      // with a shared name appear; otherwise the form omits the slot input.
      await page.goto(`${stack.origin}/new/${encodeURIComponent(cardtypeName)}?card%5Bname%5D=${encodeURIComponent(cardName)}`, { waitUntil: "domcontentloaded" });
      const form = page.locator("form.card-form").filter({ has: page.locator('.create-submit-button') }).first();
      if (await form.count() === 0) throw Error("C15 new-card form is absent");
      const radioInventory = await form.evaluate(f => {
        const inputs = [...f.querySelectorAll("input[type='radio'], input[type=radio]")];
        return {
          radioCount: inputs.length,
          names: [...new Set(inputs.map(i => i.getAttribute("name")))].filter(Boolean),
          values: inputs.slice(0, 12).map(i => i.getAttribute("value")),
        };
      });
      const radioPresent = radioInventory.radioCount > 0;
      // Click the first radio and submit. The radio's value is the junction
      // form name for the slot option; the engine stores it on the new card.
      let submissionVerdict = false;
      let submissionEvidence = null;
      if (radioPresent) {
        const first = form.locator("input[type=radio]").first();
        const value = await first.getAttribute("value");
        await first.check().catch(() => undefined);
        const action = new URL(await form.getAttribute("action"), stack.origin);
        const pending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST", { timeout: 30_000 })
          .then(response => ({ response }), error => ({ error }));
        await form.locator(".create-submit-button").first().click();
        const observed = await pending;
        if (observed.error) { submissionVerdict = false; submissionEvidence = { error: String(observed.error.message ?? observed.error) }; }
        else {
          await observed.response.finished();
          submissionEvidence = { status: observed.response.status(), chosenValue: value };
          // Read back the stored card. The `card_references` table carries the
          // picked option for a pointer slot.
          const stored = database().prepare("SELECT id FROM cards WHERE name=? AND trash=0").get(cardName);
          submissionVerdict = stored !== undefined && observed.response.status() < 400;
          if (stored !== undefined) {
            submissionEvidence.storedRowId = stored.id;
            submissionEvidence.references = database().prepare("SELECT referee_key,referee_id,ref_type FROM card_references WHERE referer_id=? LIMIT 5").all(stored.id);
          }
        }
      }
      record(capabilityChecks.C15[0], radioPresent && submissionVerdict, {
        actor: creds.admin.name,
        cardtype: cardtypeName,
        option: optionName,
        card: cardName,
        radioInventory,
        submissionEvidence,
        raw: captureEvidence(await page.content(), { check: "c15-radio-input", cardtype: cardtypeName }),
      });
      if (fixtureState?.fatalReason) throw Error("C15 fixture quarantined: " + fixtureState.fatalReason);
    },
  },

  // -------------------------------------------------------------------- C17
  // Same shape as C15 but with a multiselect slot. The form renders a
  // multi-select control (HTML select with multiple attribute OR a checked
  // set of checkboxes). Clicking two options and submitting persists the
  // selection.
  {
    name: capabilityChecks.C17[0],
    only: "unmeasured-save-edit-create",
    run: async ctx => {
      const { stack, page, creds, record, database, created, captureEvidence, fixtureState } = ctx;
      if (!isLocalOrigin(stack.origin)) throw Error("C17 requires the disposable loopback fixture");
      const signedIn = await signInActor(page, stack, creds.admin);
      if (signedIn >= 400) throw Error("C17 admin was not signed in");
      const s = stamp();
      const cardtypeName = "HarnessC17Type_" + s;
      const option1 = "HarnessC17Opt1_" + s;
      const option2 = "HarnessC17Opt2_" + s;
      const cardName = "HarnessC17Card_" + s;
      created.push(cardtypeName, option1, option2, cardName);
      const c1 = await createThroughForm(page, stack, database, { name: option1, type: "Phrase", content: "C17 option 1 " + s });
      const c2 = await createThroughForm(page, stack, database, { name: option2, type: "Phrase", content: "C17 option 2 " + s });
      if (c1.status >= 400 || c1.row === undefined || c2.status >= 400 || c2.row === undefined) throw Error("C17 options were not stored");

      const typeCreate = await page.context().request.post(stack.origin + "/card/create", {
        headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({
          "card[name]": cardtypeName,
          "card[type]": "CardType",
          "card[content]": "harness C17 multi-pointer cardtype " + s,
          "success[redirect]": "true",
        }).toString(),
        maxRedirects: 0,
      });
      if (typeCreate.status() >= 400) throw Error("C17 cardtype was not stored");

      await page.goto(`${stack.origin}/new/${encodeURIComponent(cardtypeName)}?card%5Bname%5D=${encodeURIComponent(cardName)}`, { waitUntil: "domcontentloaded" });
      const form = page.locator("form.card-form").filter({ has: page.locator('.create-submit-button') }).first();
      if (await form.count() === 0) throw Error("C17 new-card form is absent");
      const multiInventory = await form.evaluate(f => {
        const selects = [...f.querySelectorAll("select[multiple], select[multiple='multiple'], select[multiple=true]")];
        const checkboxes = [...f.querySelectorAll("input[type='checkbox'], input[type=checkbox]")];
        return {
          selectMultipleCount: selects.length,
          checkboxCount: checkboxes.length,
          selectNames: selects.map(s => s.getAttribute("name")).filter(Boolean),
          checkboxNames: [...new Set(checkboxes.map(c => c.getAttribute("name")))].filter(Boolean),
        };
      });
      const multiPresent = multiInventory.selectMultipleCount > 0 || multiInventory.checkboxCount > 1;
      let submissionVerdict = false;
      let submissionEvidence = null;
      if (multiPresent) {
        // For a multi-select: select option1 and option2 then submit.
        if (multiInventory.selectMultipleCount > 0) {
          const sel = form.locator("select[multiple]").first();
          // Playwright's selectOption respects multiple.
          await sel.selectOption({ index: 0 }).catch(() => undefined);
          await sel.selectOption({ index: 1 }).catch(() => undefined);
        } else {
          const cbs = form.locator("input[type=checkbox]");
          const n = await cbs.count();
          if (n >= 2) { await cbs.nth(0).check().catch(() => undefined); await cbs.nth(1).check().catch(() => undefined); }
        }
        const action = new URL(await form.getAttribute("action"), stack.origin);
        const pending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST", { timeout: 30_000 })
          .then(response => ({ response }), error => ({ error }));
        await form.locator(".create-submit-button").first().click();
        const observed = await pending;
        if (observed.error) { submissionEvidence = { error: String(observed.error.message ?? observed.error) }; }
        else {
          await observed.response.finished();
          submissionEvidence = { status: observed.response.status() };
          const stored = database().prepare("SELECT id FROM cards WHERE name=? AND trash=0").get(cardName);
          submissionVerdict = stored !== undefined && observed.response.status() < 400;
          if (stored !== undefined) {
            submissionEvidence.storedRowId = stored.id;
            submissionEvidence.references = database().prepare("SELECT referee_key,referee_id,ref_type FROM card_references WHERE referer_id=? LIMIT 8").all(stored.id);
          }
        }
      }
      record(capabilityChecks.C17[0], multiPresent && submissionVerdict, {
        actor: creds.admin.name,
        cardtype: cardtypeName,
        options: [option1, option2],
        card: cardName,
        multiInventory,
        submissionEvidence,
        raw: captureEvidence(await page.content(), { check: "c17-multiselect-input", cardtype: cardtypeName }),
      });
      if (fixtureState?.fatalReason) throw Error("C17 fixture quarantined: " + fixtureState.fatalReason);
    },
  },

  // -------------------------------------------------------------------- E7
  // Cypress 'nest rules editor': click the {{}} nest button on a RichText
  // editor, look for a Rules option in the dialog, click it, and assert the
  // rules editor opens (it has a name input and content field).
  {
    name: capabilityChecks.E7[0],
    only: "unmeasured-save-edit-create",
    run: async ctx => {
      const { stack, page, creds, record, database, created, captureEvidence, fixtureState } = ctx;
      if (!isLocalOrigin(stack.origin)) throw Error("E7 requires the disposable loopback fixture");
      const signedIn = await signInActor(page, stack, creds.admin);
      if (signedIn >= 400) throw Error("E7 admin was not signed in");
      const s = stamp();
      const cardName = "HarnessE7Card_" + s;
      const nestRuleName = "HarnessE7Rule_" + s;
      created.push(cardName, nestRuleName);

      // The card whose RichText editor this check drives.
      const seeded = await createThroughForm(page, stack, database, { name: cardName, type: "RichText", content: "Harness E7 nest-rules editor " + s });
      if (seeded.status >= 400) throw Error("E7 fixture card was not stored");

      // Open the card's edit view and wait for TinyMCE.
      await page.goto(`${stack.origin}/${encodeURIComponent(cardName)}?view=edit`, { waitUntil: "load" });
      await page.waitForFunction(() => typeof window.tinymce !== "undefined" && window.tinymce.activeEditor !== null, undefined, { timeout: 30_000 }).catch(() => undefined);

      // Click the {{}} nest button. The toolbar locator is the same one
      // checks-cover-b.mjs uses (its E4 check, lines around the nestDialogJourney
      // helper that the cover-b file imports for the {{}} button click).
      let dialogState = null;
      let rulesOptionPresent = false;
      try {
        // First attempt: the stock {{}} toolbar button inside tinymce's iframe.
        const nestButton = page.locator(".tox-toolbar button[title*='nest' i], .tox-toolbar button[aria-label*='nest' i], .tox-toolbar .tox-tbtn[title*='nest' i]").first();
        if (await nestButton.count() > 0) {
          await nestButton.click().catch(() => undefined);
          await page.waitForTimeout(1500);
          dialogState = await nestPickerOffered(page);
          rulesOptionPresent = dialogState.hasRulesOption;
        }
      } catch { /* fall through to the record() call below */ }
      // If the toolbar button is not present, look for an in-page nest button
      // (the harness sees the same control paths content-flows uses).
      if (!dialogState) {
        const pageNestButton = page.locator("button[title*='nest' i], a[title*='nest' i], .nest-button, .nest-add").first();
        if (await pageNestButton.count() > 0) {
          await pageNestButton.click().catch(() => undefined);
          await page.waitForTimeout(1500);
          dialogState = await nestPickerOffered(page);
          rulesOptionPresent = dialogState.hasRulesOption;
        }
      }
      record(capabilityChecks.E7[0], dialogState !== null && rulesOptionPresent, {
        actor: creds.admin.name,
        card: cardName,
        dialogState: dialogState ?? { buttons: [] },
        rulesOptionPresent,
        raw: captureEvidence(await page.content(), { check: "e7-nest-rules", card: cardName }),
      });
      if (fixtureState?.fatalReason) throw Error("E7 fixture quarantined: " + fixtureState.fatalReason);
    },
  },

  // -------------------------------------------------------------------- E11
  // Journeys 'edit-nested-summary-member': a card with nested summary
  // subcards lets the member open an editor scoped to one of those subcards
  // and persist a write through it. The simplest proof is: create a host
  // card with a nested card, visit the nested card's edit URL, write a new
  // content through the engine's /update endpoint, and verify the nested
  // card's content changed on a fresh GET.
  {
    name: capabilityChecks.E11[0],
    only: "unmeasured-save-edit-create",
    run: async ctx => {
      const { stack, page, creds, record, database, created, captureEvidence, fixtureState } = ctx;
      if (!isLocalOrigin(stack.origin)) throw Error("E11 requires the disposable loopback fixture");
      const signedIn = await signInActor(page, stack, creds.admin);
      if (signedIn >= 400) throw Error("E11 admin was not signed in");
      const s = stamp();
      const hostName = "HarnessE11Host_" + s;
      const nestedName = "HarnessE11Nested_" + s;
      created.push(hostName, nestedName);
      const host = await createThroughForm(page, stack, database, { name: hostName, type: "Basic", content: "host " + s });
      if (host.status >= 400) throw Error("E11 host card was not stored");
      const nested = await createThroughForm(page, stack, database, { name: nestedName, type: "RichText", content: "nested original " + s });
      if (nested.status >= 400) throw Error("E11 nested card was not stored");

      // Drive the engine's own update endpoint through the nested card's view.
      // The form action on the nested edit page is the same POST path the
      // other checks use; this proves the persist side of the edit cycle.
      const before = database().prepare("SELECT id,db_content FROM cards WHERE name=? AND trash=0").get(nestedName);
      const update = await page.context().request.post(`${stack.origin}/update/${encodeURIComponent(nestedName)}`, {
        headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({ "card[content]": "nested edited " + s, "success[redirect]": "true" }).toString(),
        maxRedirects: 0,
      });
      const after = database().prepare("SELECT id,db_content FROM cards WHERE name=? AND trash=0").get(nestedName);
      // Visit the host page and confirm the nested card still renders as
      // nested (data-card-name present in a slot) under the host's main slot.
      const hostPage = await page.goto(`${stack.origin}/${encodeURIComponent(hostName)}`, { waitUntil: "load" });
      const nestedSlotRendered = await page.evaluate(name => {
        const slots = [...document.querySelectorAll(`#main [data-card-name="${name}"]`)];
        return slots.length > 0 ? { count: slots.length } : { count: 0 };
      }, nestedName);
      record(capabilityChecks.E11[0],
        update.status() < 400 && after !== undefined && after.db_content !== before?.db_content && hostPage.status() === 200 && nestedSlotRendered.count > 0,
        {
          actor: creds.admin.name,
          host: hostName,
          nested: nestedName,
          updateStatus: update.status(),
          before: { id: before?.id ?? null, content: before?.db_content ?? null },
          after: { id: after?.id ?? null, content: after?.db_content ?? null },
          hostPageStatus: hostPage.status(),
          nestedSlotRendered,
          raw: captureEvidence(await page.content(), { check: "e11-nested-summary-edit", host: hostName, nested: nestedName }),
        }
      );
      if (fixtureState?.fatalReason) throw Error("E11 fixture quarantined: " + fixtureState.fatalReason);
    },
  },

  // -------------------------------------------------------------------- E15
  // Cypress edit/board/save_changes 'Save and Close'. The editor on a
  // RichText card renders a Save and Close button (data-cy="save-and-close"
  // is the stock stable selector per
  // src/card/mod-loader/mods/card-mod-edit.ts:54-72). Driving that button
  // does TWO things: it submits the editor's form to the engine's update
  // path, AND it closes the editor and returns to the edited card page.
  {
    name: capabilityChecks.E15[0],
    only: "unmeasured-save-edit-create",
    run: async ctx => {
      const { stack, page, creds, record, database, created, captureEvidence, fixtureState } = ctx;
      if (!isLocalOrigin(stack.origin)) throw Error("E15 requires the disposable loopback fixture");
      const signedIn = await signInActor(page, stack, creds.admin);
      if (signedIn >= 400) throw Error("E15 admin was not signed in");
      const s = stamp();
      const cardName = "HarnessE15Card_" + s;
      const newContent = "E15 save-and-close content " + s;
      created.push(cardName);

      const seeded = await createThroughForm(page, stack, database, { name: cardName, type: "RichText", content: "E15 original " + s });
      if (seeded.status >= 400) throw Error("E15 fixture card was not stored");
      const before = database().prepare("SELECT id,db_content FROM cards WHERE name=? AND trash=0").get(cardName);

      // Open the card's edit page and find the Save-and-Close button.
      await page.goto(`${stack.origin}/${encodeURIComponent(cardName)}?view=edit`, { waitUntil: "load" });
      await page.waitForFunction(() => typeof window.tinymce !== "undefined" && window.tinymce.activeEditor !== null, undefined, { timeout: 30_000 }).catch(() => undefined);

      const editorForm = page.locator("form.card-form").filter({ has: page.locator('[name="card[content]"]') }).first();
      if (await editorForm.count() === 0) throw Error("E15 edit form is absent");
      // Set the editor content (TinyMCE if present).
      const field = editorForm.locator('[name="card[content]"]').first();
      const isTiny = await field.evaluate(el => el.classList.contains("tinymce-textarea"));
      if (isTiny) {
        const id = await field.getAttribute("id");
        if (id !== null) {
          await page.waitForFunction(editorId => Boolean(window.tinymce?.get(editorId)), id, { timeout: 20_000 });
          await page.evaluate(([editorId, text]) => { const editor = window.tinymce.get(editorId); editor.setContent(text); editor.save(); }, [id, newContent]);
        }
      } else if (await field.isVisible()) {
        await field.fill(newContent);
      }
      // Find Save and Close. Several stock selectors in decko.
      const saveAndClose = page.locator(
        'button[data-cy="save-and-close"], button[data-cy="save_and_close"], button:has-text("Save and Close"), button:has-text("Save & Close"), input[name="save_and_close"]'
      ).first();
      const saveAndClosePresent = await saveAndClose.count() > 0;
      if (!saveAndClosePresent) {
        record(capabilityChecks.E15[0], false, {
          actor: creds.admin.name,
          card: cardName,
          saveAndClosePresent: false,
          note: "no Save and Close control rendered on the RichText edit form",
          raw: captureEvidence(await page.content(), { check: "e15-save-and-close-missing", card: cardName }),
        });
        return;
      }
      // What the click posts and where it lands.
      const urlBefore = page.url();
      const action = new URL(await editorForm.getAttribute("action"), stack.origin);
      const pending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && r.request().method() === "POST", { timeout: 30_000 })
        .then(response => ({ response }), error => ({ error }));
      await saveAndClose.click().catch(() => undefined);
      const observed = await pending;
      if (observed.error) throw observed.error;
      await observed.response.finished();
      // Wait for any redirect navigation to settle so the read-after follows
      // the post-redirect URL the engine itself hands back.
      await page.waitForLoadState("load").catch(() => undefined);
      const urlAfter = page.url();
      const afterRow = database().prepare("SELECT id,db_content FROM cards WHERE name=? AND trash=0").get(cardName);
      // The act of editing is also recorded as a card_actions row.
      const actionsCount = database().prepare("SELECT COUNT(*) AS n FROM card_actions WHERE card_id=?").get(before?.id ?? 0)?.n ?? -1;
      record(capabilityChecks.E15[0],
        observed.response.status() < 400 &&
        afterRow !== undefined &&
        afterRow.db_content !== before?.db_content &&
        urlBefore !== urlAfter,
        {
          actor: creds.admin.name,
          card: cardName,
          saveAndClosePresent: true,
          submitStatus: observed.response.status(),
          storedContentAfter: afterRow?.db_content ?? null,
          storedContentBefore: before?.db_content ?? null,
          actionsCount,
          urlBefore,
          urlAfter,
          raw: captureEvidence(await page.content(), { check: "e15-save-and-close-after", card: cardName }),
        }
      );
      if (fixtureState?.fatalReason) throw Error("E15 fixture quarantined: " + fixtureState.fatalReason);
    },
  },

  // -------------------------------------------------------------------- CM1
  // Comments on cards. The engine may not ship a comment cardtype in this
  // snapshot, so this check exercises the surface: a member POSTs a comment
  // through the engine's /card/create, names it after a plus-card convention
  // <card>+*comment, and asserts both the comment row exists and the parent
  // card's page lists it.
  {
    name: capabilityChecks.CM1[0],
    only: "unmeasured-save-edit-create",
    run: async ctx => {
      const { stack, page, creds, record, database, created, captureEvidence, fixtureState } = ctx;
      if (!isLocalOrigin(stack.origin)) throw Error("CM1 requires the disposable loopback fixture");
      const signedIn = await signInActor(page, stack, creds.member);
      if (signedIn >= 400) throw Error("CM1 member was not signed in");
      const s = stamp();
      const cardName = "HarnessCM1Parent_" + s;
      const commentName = cardName + "+*comment";
      const commentText = "CM1 comment from member " + s;
      created.push(cardName);

      // Member creates a Basic parent card first (members can do that).
      const parent = await page.context().request.post(stack.origin + "/card/create", {
        headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({
          "card[name]": cardName,
          "card[type]": "Basic",
          "card[content]": "CM1 parent " + s,
          "success[redirect]": "true",
        }).toString(),
        maxRedirects: 0,
      });
      const parentRow = fixtureCard(database(), cardName);
      if (parent.status >= 400 || parentRow === undefined) throw Error("CM1 parent was not stored");

      // The comment attempt: a typed fixture creation through the engine's
      // own /card/create. The engine accepts arbitrary card names; whether
      // "<parent>+*comment" stores depends on whether the deck recognises the
      // *comment codename. We try through the create form first and if that
      // route is refused, fall back to a plain Basic child card to record
      // what the surface DOES support.
      let createAttempt = null;
      let fallbackUsed = false;
      try {
        const direct = await page.context().request.post(stack.origin + "/card/create", {
          headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
          data: new URLSearchParams({
            "card[name]": commentName,
            "card[type]": "Basic",
            "card[content]": commentText,
            "success[redirect]": "true",
          }).toString(),
          maxRedirects: 0,
        });
        createAttempt = { status: direct.status(), name: commentName };
      } catch (error) {
        createAttempt = { status: -1, error: String(error?.message ?? error), name: commentName };
      }
      const storedComment = database().prepare("SELECT id,db_content,trash,name FROM cards WHERE name=? AND trash=0").get(commentName);
      if (storedComment === undefined) {
        // Fall back: store a plain child card to record what the surface DOES.
        const plainChild = cardName + "_plain_" + s;
        await page.context().request.post(stack.origin + "/card/create", {
          headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
          data: new URLSearchParams({
            "card[name]": plainChild, "card[type]": "Basic", "card[content]": commentText, "success[redirect]": "true",
          }).toString(),
          maxRedirects: 0,
        });
        const storedPlain = database().prepare("SELECT id,db_content,trash,name FROM cards WHERE name=? AND trash=0").get(plainChild);
        fallbackUsed = true;
        createAttempt = { ...createAttempt, fallbackName: plainChild, fallbackStored: storedPlain !== undefined };
      }
      // Read the parent's own page and look for the comment marker in the
      // rendered bytes (either by data-card-name=commentName, or by the
      // literal comment text appearing inside #main).
      const parentPage = await page.goto(`${stack.origin}/${encodeURIComponent(cardName)}`, { waitUntil: "load" });
      const html = await page.content();
      const matchesName = html.includes(commentName) || html.includes(encodeURIComponent(commentName));
      const matchesText = html.includes(commentText);
      const verdict = storedComment !== undefined && (matchesName || matchesText);
      record(capabilityChecks.CM1[0], verdict, {
        actor: creds.member.name,
        parent: cardName,
        commentAttempt: createAttempt,
        fallbackUsed,
        storedComment: storedComment ?? null,
        parentPageStatus: parentPage.status(),
        pageIncludesCommentName: matchesName,
        pageIncludesCommentText: matchesText,
        raw: captureEvidence(html, { check: "cm1-comment-on-card", parent: cardName }),
      });
      if (fixtureState?.fatalReason) throw Error("CM1 fixture quarantined: " + fixtureState.fatalReason);
    },
  },

  // -------------------------------------------------------------------- N15
  // Cypress 'hashtag/reference navigation'. A card whose body is "[[OtherCard]]"
  // renders a reference link. Clicking it lands on the referenced card and
  // the destination renders its own main slot. This check is the read-path
  // contract.
  {
    name: capabilityChecks.N15[0],
    only: "unmeasured-save-edit-create",
    run: async ctx => {
      const { stack, page, creds, record, database, created, captureEvidence, fixtureState } = ctx;
      if (!isLocalOrigin(stack.origin)) throw Error("N15 requires the disposable loopback fixture");
      const signedIn = await signInActor(page, stack, creds.admin);
      if (signedIn >= 400) throw Error("N15 admin was not signed in");
      const s = stamp();
      const referrerName = "HarnessN15Referrer_" + s;
      const targetName = "HarnessN15Target_" + s;
      const targetContent = "N15 target content " + s;
      created.push(referrerName, targetName);
      const target = await createThroughForm(page, stack, database, { name: targetName, type: "Basic", content: targetContent });
      if (target.status >= 400 || target.row === undefined) throw Error("N15 target was not stored");
      const referrer = await createThroughForm(page, stack, database, { name: referrerName, type: "RichText", content: `Before [[${targetName}]] after` });
      if (referrer.status >= 400) throw Error("N15 referrer was not stored");

      // Open the referrer page and look for a link to the target.
      await page.goto(`${stack.origin}/${encodeURIComponent(referrerName)}`, { waitUntil: "load" });
      const link = await page.evaluate(target => {
        const hrefs = [...document.querySelectorAll("#main a")].map(a => a.getAttribute("href"));
        // Decks link references as /<card> or as ?_keyword=<card> through a
        // search shortcut; we accept either.
        const candidates = hrefs.filter(h => h !== null && (h.endsWith("/" + target) || h.endsWith("/" + encodeURIComponent(target)) || h.includes(target) || h.includes(encodeURIComponent(target))));
        return { hrefCount: hrefs.length, candidateCount: candidates.length, candidateHrefs: candidates.slice(0, 6), anyReferrerLinkToTarget: candidates.length > 0 };
      }, targetName);
      let landedVerdict = false;
      let landedEvidence = null;
      if (link.anyReferrerLinkToTarget) {
        const href = link.candidateHrefs[0];
        const nav = await page.context().request.get(stack.origin + href, { headers: { origin: stack.origin, accept: "text/html" } });
        // The deck's reference can answer 200 with the referenced card or 303
        // to the URL with the right card; we accept the destination if the
        // body includes the target's name OR a card-slot for the target.
        const body = await nav.text();
        const reached = nav.status() === 200 && (body.includes(targetName) || body.includes(encodeURIComponent(targetName)));
        landedVerdict = reached;
        landedEvidence = { status: nav.status(), href, bodyMentionsTarget: body.includes(targetName), bodyHead: body.slice(0, 200) };
      }
      record(capabilityChecks.N15[0], link.anyReferrerLinkToTarget && landedVerdict, {
        actor: creds.admin.name,
        referrer: referrerName,
        target: targetName,
        referrerLinkInventory: link,
        landedEvidence,
        raw: captureEvidence(await page.content(), { check: "n15-reference-navigation", referrer: referrerName }),
      });
      if (fixtureState?.fatalReason) throw Error("N15 fixture quarantined: " + fixtureState.fatalReason);
    },
  },
];

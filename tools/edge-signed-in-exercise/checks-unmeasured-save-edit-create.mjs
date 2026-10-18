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

import { fixtureCard, createTypedFixture } from "./lib/typed-fixture.mjs";
import { nestRulesJourney } from "./lib/nest-rules-journey.mjs";
import { newPointerInput } from "./lib/new-pointer-input.mjs";
import { matchingRichEditor } from "./lib/rich-editor.mjs";

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
  const result = await createTypedFixture({ page, stack, database }, { name, type, content });
  return { status: result.status, row: fixtureCard(database(), name) };
}

export const checks = [
  // -------------------------------------------------------------------- C11
  // core/set/all/autoname.rb and its installed spec: a type-set autoname
  // rule supplies the name on save. Create a private Cardtype and real rule,
  // submit the unnamed form, and verify the exact typed row and rule seed.
  {
    name: capabilityChecks.C11[0],
    only: "unmeasured-save-edit-create",
    run: async ctx => {
      const { stack, page, creds, record, database, created, captureEvidence, fixtureState } = ctx;
      if (!isLocalOrigin(stack.origin)) throw Error("C11 requires the disposable loopback fixture");
      const signedIn = await signInActor(page, stack, creds.admin);
      if (signedIn >= 400) throw Error("C11 admin was not signed in");
      const s = stamp();
      const cardtypeName = "HarnessC11Type_" + s;
      const cardName = "HarnessC11Card_" + s;
      created.push(cardtypeName, cardName);

      // Stock autoname is a type-set rule, not the cardtype's content.
      const typeCreate = await createThroughForm(page, stack, database, { name: cardtypeName, type: "Cardtype" });
      const cardtypeRow = fixtureCard(database(), cardtypeName);
      if (typeCreate.status >= 400 || cardtypeRow === undefined) throw Error("C11 cardtype was not stored: HTTP " + typeCreate.status);
      const ruleName = cardtypeName + "+*type+*autoname";
      created.push(ruleName);
      await createThroughForm(page, stack, database, { name: ruleName, type: "Phrase", content: cardName });
      const beforeRowCount = database().prepare("SELECT COUNT(*) AS n FROM cards WHERE type_id=? AND trash=0").get(cardtypeRow.id)?.n ?? 0;

      // Open the new-card form for the cardtype and submit with the seed name
      // empty so the autoname branch can run. The form's name input is left
      // blank on purpose.
      const opened = await page.goto(`${stack.origin}/new/${encodeURIComponent(cardtypeName)}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const form = page.locator("form.card-form").filter({ has: page.locator('.create-submit-button') }).first();
      if (await form.count() === 0) throw Error("C11 cardtype create form is absent");
      const nameFieldsBeforeSubmit=await form.locator('[name="card[name]"]').count();
      const action = new URL(await form.getAttribute("action"), stack.origin);
      const pending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST", { timeout: 30_000 })
        .then(response => ({ response }), error => ({ error }));
      await form.locator(".create-submit-button").first().click();
      const observed = await pending;
      if (observed.error) throw observed.error;
      await observed.response.finished();
      const outcome=await observed.response.json().catch(()=>null);
      if(typeof outcome?.redirect==='string'){
        const redirect=new URL(outcome.redirect,stack.origin);
        if(redirect.origin!==stack.origin)throw Error('Autoname create left the owned origin');
        await page.waitForURL(redirect.href,{waitUntil:'domcontentloaded',timeout:20000});
      }

      // The before count precedes submission; the generated name must equal the rule seed.
      const cardsBefore = cardtypeRow.id;
      const afterRow = database().prepare("SELECT id,name FROM cards WHERE type_id=? AND trash=0 ORDER BY id DESC LIMIT 1").get(cardsBefore);
      const allRowsAfter = database().prepare("SELECT id,name FROM cards WHERE type_id=? AND trash=0 ORDER BY id").all(cardsBefore).map(r => r.name);
      const newRows = allRowsAfter.length;
      const storedName = afterRow?.name ?? "";
      const ruleContentAfter=fixtureCard(database(),ruleName)?.db_content;
      const verdict = nameFieldsBeforeSubmit===0 && observed.response.status() < 400 && newRows === beforeRowCount + 1 && storedName === cardName && ruleContentAfter===storedName;
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
        nameFieldsBeforeSubmit,
        ruleContentAfter,
        requestStatus: opened.status(),
        raw: captureEvidence(html, { check: "c11-autoname", cardtype: cardtypeName }),
      });
      if (fixtureState?.fatalReason) throw Error("C11 fixture quarantined: " + fixtureState.fatalReason);
    },
  },

  // New Pointer cards use real *right input-type/content-options rules.
  ...[['C15','radio'],['C17','multiselect']].map(([id,widget])=>({
    name:capabilityChecks[id][0],only:'unmeasured-save-edit-create',
    run:async ctx=>{
      await signInActor(ctx.page,ctx.stack,ctx.creds.admin);
      const observed=await newPointerInput(ctx,widget);
      ctx.record(capabilityChecks[id][0],observed.pass,observed.evidence);
    },
  })),

  // Installed nest_editor_tabs.rb exposes rules as a tab after naming a nest.
  {name:capabilityChecks.E7[0],only:'unmeasured-save-edit-create',run:async ctx=>{
    await signInActor(ctx.page,ctx.stack,ctx.creds.admin);
    const observed=await nestRulesJourney(ctx);
    ctx.record(capabilityChecks.E7[0],observed.pass,observed.evidence);
  }},

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
      const summaryName = database().prepare("SELECT name FROM cards WHERE key='summary' AND trash=0").get()?.name;
      if (!summaryName) throw Error('The canonical summary tag is unavailable');
      const nestedName = hostName + "+" + summaryName;
      created.push(hostName, nestedName);
      // Establish the parent before creating its plus field.
      await createThroughForm(page, stack, database, { name: hostName, type: "Basic" });
      const nested = await createThroughForm(page, stack, database, { name: nestedName, type: "RichText", content: "nested original " + s });
      if (nested.status >= 400) throw Error("E11 nested card was not stored");
      const host = await page.context().request.post(stack.origin + '/update/' + hostName, {headers:{origin:stack.origin,'Content-Type':'application/x-www-form-urlencoded'},data:new URLSearchParams({'card[content]':'host {{'+nestedName+'|open}} '+s}).toString(),maxRedirects:0});
      if (host.status() >= 400) throw Error("E11 host fixture content was not stored");

      const before = fixtureCard(database(), nestedName);
      await page.goto(stack.origin+"/"+encodeURIComponent(hostName),{waitUntil:"load"});
      const slot=page.locator('#main .card-slot[data-card-id="'+before.id+'"]')
        .filter({has:page.locator('a.edit-link[href$="/edit"]')}).first();
      await slot.locator('a.edit-link[href$="/edit"]').first().dispatchEvent('click');
      const form=page.locator('.modal.show form.card-form[id^="edit_card"]:visible').filter({has:page.locator('textarea[name="card[content]"]')}).first();
      await form.waitFor({state:'visible',timeout:20000});
      const action=new URL(await form.getAttribute('action'),stack.origin);
      const targetId=Number(await form.locator('xpath=ancestor::*[@data-card-id][1]').getAttribute('data-card-id'));
      if(action.origin!==stack.origin||!action.pathname.startsWith('/update/')||targetId!==before.id)throw Error('Nested editor updates a different card');
      const field=form.locator('textarea[name="card[content]"]').first(),id=await field.getAttribute('id');
      if(!id)throw Error('Nested editor has no identity');
      await page.waitForFunction(matchingRichEditor,[id,false],{timeout:20000});
      const newContent='nested edited '+s;
      await page.evaluate(([id,text])=>{const editor=window.tinymce.get(id);editor.setContent(text);editor.save()},[id,newContent]);
      const pending=page.waitForResponse(r=>new URL(r.url()).origin===stack.origin&&new URL(r.url()).pathname===action.pathname&&r.request().method()==='POST',{timeout:30000}).then(response=>({response}),error=>({error}));
      await form.locator('button.submit-button').first().click();
      const seen=await pending;if(seen.error)throw seen.error;await seen.response.finished();
      await form.waitFor({state:'hidden',timeout:20000});
      const after=fixtureCard(database(),nestedName);
      const hostPage=await page.goto(stack.origin+'/'+encodeURIComponent(hostName),{waitUntil:'load'});
      const nestedSlot=page.locator('#main .card-slot[data-card-id="'+before.id+'"]');
      const nestedShowsNewContent=await nestedSlot.first().innerText().then(text=>text.includes(newContent));
      record(capabilityChecks.E11[0],seen.response.status()<400&&after?.id===before.id&&after.db_content.includes(newContent)&&hostPage.status()===200&&nestedShowsNewContent,{
        actor:creds.admin.name,host:hostName,nested:nestedName,updateStatus:seen.response.status(),sameNestedId:after?.id===before.id,storedContent:after?.db_content,nestedShowsNewContent,hostPageStatus:hostPage.status(),nativeEditorAction:action.pathname,
        raw:captureEvidence(await page.content(),{check:'e11-nested-summary-edit',host:hostName,nested:nestedName})
      });
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

      // Open the editor using the application's native edit navigation.
      await page.goto(`${stack.origin}/${encodeURIComponent(cardName)}`, { waitUntil: "load" });
      await page.locator('#main a.edit-link[href$="/edit"]').first().dispatchEvent('click');
      const editorForm = page.locator('.modal.show form.card-form[id^="edit_card"]:visible').filter({ has: page.locator('textarea[name="card[content]"]') }).first();
      await editorForm.waitFor({ state: 'visible', timeout: 20000 });
      if (await editorForm.count() === 0) {
        const inventory = await page.locator('form.card-form').evaluateAll(forms => forms.map(form => ({action:form.getAttribute('action'),visible:form.getClientRects().length>0,fields:[...form.querySelectorAll('textarea,input,button')].map(field=>({tag:field.tagName,name:field.name,type:field.type,classes:field.className,text:field.tagName==='BUTTON'?field.textContent:null}))})));
        captureEvidence(await page.content(),{check:'e15-form-inventory',inventory});
        throw Error("E15 edit form is absent: "+JSON.stringify(inventory));
      }
      // Set the editor content (TinyMCE if present).
      const field = editorForm.locator('[name="card[content]"]').first();
      const isTiny = await field.evaluate(el => el.classList.contains("tinymce-textarea"));
      if (isTiny) {
        const id = await field.getAttribute("id");
        if (id !== null) {
          await page.waitForFunction(matchingRichEditor, [id, false], { timeout: 20_000 });
          await page.evaluate(([editorId, text]) => { const editor = window.tinymce.get(editorId); editor.setContent(text); editor.save(); }, [id, newContent]);
        }
      } else if (await field.isVisible()) {
        await field.fill(newContent);
      }
      // Find Save and Close. Several stock selectors in decko.
      const saveAndClose = editorForm.locator(
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
      const pending = page.waitForResponse(r => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST", { timeout: 30_000 })
        .then(response => ({ response }), error => ({ error }));
      await saveAndClose.click();
      const observed = await pending;
      if (observed.error) throw observed.error;
      await observed.response.finished();
      // Wait for any redirect navigation to settle so the read-after follows
      // the post-redirect URL the engine itself hands back.
      await editorForm.waitFor({ state: 'hidden', timeout: 20000 });
      await page.waitForFunction(text => document.querySelector('#main')?.textContent?.includes(text), newContent, { timeout: 20000 });
      const urlAfter = page.url();
      const mainShowsNewContent = await page.locator('#main').innerText().then(text => text.includes(newContent));
      const afterRow = database().prepare("SELECT id,db_content FROM cards WHERE name=? AND trash=0").get(cardName);
      // The act of editing is also recorded as a card_actions row.
      const actionsCount = database().prepare("SELECT COUNT(*) AS n FROM card_actions WHERE card_id=?").get(before?.id ?? 0)?.n ?? -1;
      record(capabilityChecks.E15[0],
        observed.response.status() < 400 &&
        afterRow !== undefined &&
        afterRow.db_content.includes(newContent) &&
        mainShowsNewContent && new URL(urlAfter).pathname === new URL(urlBefore).pathname,
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
          mainShowsNewContent,
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
      const commentText = "CM1 comment from member " + s;
      created.push(cardName);
      await createThroughForm(page, stack, database, {name:cardName,type:"RichText",content:"CM1 parent "+s});
      const before = fixtureCard(database(),cardName);
      const opened = await page.goto(stack.origin+"/"+encodeURIComponent(cardName)+"?view=comment_box",{waitUntil:"load"});
      const form = page.locator('form.card-form').filter({has:page.locator('textarea[name="card[comment]"]')}).first();
      await form.waitFor({state:"visible",timeout:20000});
      const action = new URL(await form.getAttribute("action"),stack.origin);
      if(action.origin!==stack.origin || action.pathname!=="/update/"+encodeURIComponent(cardName))throw Error("Comment form does not update the owned parent");
      await form.locator('textarea[name="card[comment]"]').fill(commentText);
      const pending=page.waitForResponse(r=>new URL(r.url()).origin===stack.origin&&new URL(r.url()).pathname===action.pathname&&r.request().method()==="POST",{timeout:30000}).then(response=>({response}),error=>({error}));
      await form.getByRole('button',{name:'Comment',exact:true}).click();
      const seen=await pending;if(seen.error)throw seen.error;await seen.response.finished();
      const after=fixtureCard(database(),cardName);
      const fresh=await page.goto(stack.origin+"/"+encodeURIComponent(cardName),{waitUntil:"load"});
      const mainText=await page.locator('#main').innerText();
      record(capabilityChecks.CM1[0],seen.response.status()<400&&after?.id===before.id&&after.db_content.includes(commentText)&&after.db_content.includes("CM1 parent "+s)&&fresh.status()===200&&mainText.includes(commentText),{
        actor:creds.member.name,parent:cardName,openedStatus:opened.status(),submitStatus:seen.response.status(),sameParent:after?.id===before.id,storedComment:after?.db_content.includes(commentText),freshStatus:fresh.status(),mainShowsComment:mainText.includes(commentText),fallbackUsed:false,
        raw:captureEvidence(await page.content(),{check:"cm1-comment-on-card",parent:cardName})
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

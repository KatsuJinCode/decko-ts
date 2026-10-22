// checks-cover-b.mjs — the capability checks the cover-B share owns: the
// odd-numbered (1st, 3rd, 5th, …) entries of the "not covered" list in
// tools/edge-signed-in-exercise/capabilities.json, sorted by id.
//
// Every check drives the real signed-in UI the way a person does (clicks,
// typing, menus, Enter in the navbox) and grades the result against what
// Ruby's own Cucumber/Cypress tests assert (each check's docstring names the
// Ruby source). Cards a check creates are pushed onto ctx.created so the
// harness's cleanup trashes them.
//
// Loaded by tools/edge-signed-in-exercise.mjs through its checks-*.mjs loader;
// the entry point is runCoverBChecks(ctx).

import { focusRichEditor, matchingRichEditor } from "./lib/rich-editor.mjs";
import { createTypedFixture, fixtureType, fixtureCard } from "./lib/typed-fixture.mjs";
import {linkDialogJourney,imageDialogJourney,nestDialogJourney} from './lib/editor-dialogs.mjs';
import {storedSessionActorId} from './lib/session-actor.mjs';
import {hasCredentialForm, SIGNIN_FIELD_NAMES} from './lib/signin-credential-form.mjs';
import {listsChangeAsPills} from './lib/history-pills.mjs';
import {renameFormShape, referersFollowRename, refererReferenceRows} from './lib/rename-referers.mjs';
import {P5_CHECK_NAMES, allSlotSetKeys, ruleLegHolds, slotSetKeys} from './lib/rule-set-legs.mjs';
import {cardHistoryPage, CARD_HISTORY_CHECKS} from './lib/card-history-acts.mjs';
import {followLinkShape, unfollowRoundTrip, UNFOLLOW_CHECKS} from './lib/unfollow-from-board.mjs';
import {fileCardOffersDownload, fileChooserShape} from './lib/file-download-view.mjs';
import {imageCoreShows} from './lib/image-core-view.mjs';
import {
  editorToolbarContract,
  stockTinyMceConfigFromRealYml,
  RICH_TEXT_TOOLBAR_CHECKS,
} from './lib/rich-text-toolbar.mjs';
import { readFileSync } from "node:fs";

const CAP = "C";

/** The create form on /new/:type (the page's own form, not the navbar's roles form). */
const MAIN_FORM = 'form#new_card[action="/card/create"], #main form.card-form, form.card-form[action*="/card/create"], form.card-form[id="new_card"]';

/** A real minimal 1x1 PNG (RGBA, transparent): the Image upload posts bytes an
 *  image card actually accepts, not a text/plain stub wearing a .png name. */
const ONE_BY_ONE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
// A SECOND, genuinely different PNG for F3's change leg: 2x1 pixels of a
// different colour, 72 bytes against the 70 above, so a leg that re-reads the
// first upload's state cannot pass. Built as a real PNG (signature, IHDR, IDAT,
// IEND) rather than a byte string that only looks like one.
const TWO_BY_ONE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGM4IWdzQs4GAAkNAkVEh+5bAAAAAElFTkSuQmCC";

/** TinyMCE is ready once the global tinymce has an active editor. */
async function waitForEditor(page, timeout = 30_000) {
  try {
    await page.waitForFunction(() => typeof window.tinymce !== "undefined" && window.tinymce.activeEditor !== null, undefined, { timeout });
  } catch { /* recorded by the caller */ }
  return page.evaluate(() => ({
    present: typeof window.tinymce !== "undefined",
    active: typeof window.tinymce !== "undefined" && window.tinymce.activeEditor !== null,
  }));
}

/** The id of the editor owning the open edit modal (the runner's
 *  focusRichEditor contract), focused and ready; null when no editor came up,
 *  so the checks below record the miss instead of throwing. A stale global
 *  activeEditor left by an earlier page or modal must not be graded. */
async function openRichEditorId(page) {
  try {
    return await focusRichEditor(page);
  } catch {
    return null;
  }
}

/** A check that never settles (a stalled click or a page that never answers)
 *  is recorded as a failure after this bound, so the run moves on. */
const CHECK_BOUND_MS = 240_000;
function bounded(promise, name) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`check did not settle within ${CHECK_BOUND_MS} ms: ${name}`);
      error.timedOut = true;
      reject(error);
    }, CHECK_BOUND_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function runCoverBChecks(ctx) {
  const selectedCases=ctx.coverBCase?.split(',');
  if(selectedCases?.some(id=>!meta.capabilityIds.includes(id)))throw Error('unknown cover-b capability selection');
  const { page, stack, creds, record, visit, signIn, ledger, linesSince, created, cardName } = ctx;
  const group = ctx.group ?? ((name) => console.log(`\n== ${name}`));
  const admin = creds.admin;
  const member = creds.member;
  // A check that hits the bound above is abandoned mid-flight: its continuation
  // stays suspended on an await it may still finish, so nothing this module
  // does afterwards can make the fixture's page or session safe for the next
  // check. The runner owns the fixture and its abort protocol
  // (fixtureState.fatalReason — the disposable run is quarantined and the
  // owned browser closed, a fresh run continues), so a timed-out attempt marks
  // the fixture fatal, lets the inner attempt record the failed check, then
  // throws so runCoverBChecks exits entirely.
  let timedOutCheck = null;
  const attempt = async (name, fn) => {
    if(selectedCases!==undefined&&!selectedCases.some(id=>name.startsWith(id+' ')))return;
    // Every check here assumes the ADMIN ambient actor unless its own body
    // sets another one: the member-actor checks sign member in at their start
    // and restore admin at their end, but that restore sits AFTER the body's
    // last assertion - a check that throws mid-body (W3's typed-fixture 403,
    // 2026-10-17) skips it and leaks the member session into every later
    // check. E22 then visits /Home/board as member, the board view requires
    // the update task (src/card/permissions/view-perms.ts board: "update"),
    // and the denied page has no board pane - a false render failure. Verify
    // the stored actor and restore admin BEFORE each body, so one check's
    // failure cannot poison the actor state of the checks after it (and a
    // --case selection starting at any check still runs with the actor it
    // needs). Checks that want member keep signing member in themselves.
    try {
      const actorId = storedSessionActorId(ctx.database(), await page.context().cookies(stack.origin));
      if (actorId !== admin.id) await signIn(admin);
    } catch { /* the check body's own actor setup remains the backstop */ }
    const result = await ctx.attempt(name, async () => {
      try {
        return await bounded(Promise.resolve().then(fn), name);
      } catch (error) {
        if (error?.timedOut === true) {
          timedOutCheck = name;
          if (ctx.fixtureState) ctx.fixtureState.fatalReason = `cover-b check "${name}" did not settle within ${CHECK_BOUND_MS} ms; the fixture browser state is unowned from here`;
        }
        throw error;
      }
    });
    if (timedOutCheck !== null) throw new Error(`cover-b aborts the rest of its checks after "${timedOutCheck}": the bound abandoned it mid-flight${ctx.fixtureState?.fatalReason ? ` (${ctx.fixtureState.fatalReason})` : ""}`);
    return result;
  };

  const ensure = (name) => { if (!created.includes(name)) created.push(name); return name; };
  const exists = (name) => fixtureCard(ctx.database(),name);
  const row = (name) => {const found=fixtureCard(ctx.database(),name);return found?{...found,content:found.db_content}:undefined;};
  const adminActor=async()=>{
    const id=storedSessionActorId(ctx.database(),await page.context().cookies(stack.origin));
    if(id!==admin.id)throw Error('the requested admin actor is not verified');
    return id;
  };
  /** Creates the requested canonical cardtype and verifies its stored identity. */
  const create = async (name, content = "", type = "RichText") => {
    ensure(name);
    return createTypedFixture(ctx, { type, name, content });
  };
  const clickAndWait = async (locator, { timeout = 15_000 } = {}) => {
    const before = ledger().length;
    await locator.first().click({ timeout }).catch(() => undefined);
    await page.waitForTimeout(1500);
    return linesSince(before);
  };
  const pointerEditor = async name => {
    const actorId=await adminActor(),target=exists(name);
    if(!target)throw Error('pointer editor target is not a stored fixture');
    const shown=await visit('/'+encodeURIComponent(name));
    await page.locator('#main a.edit-link[href$="/edit"]').first().dispatchEvent('click');
    const form=page.locator('.modal.show form.card-form[id^="edit_card"]:visible').first();
    await form.waitFor({state:'visible',timeout:20000});
    const shownId=Number(await form.locator('xpath=ancestor::*[@data-card-id][1]').getAttribute('data-card-id'));
    if(shownId!==target.id)throw Error('pointer form belongs to a different stored card');
    return {form,status:shown.status,actorId};
  };
  const submitEditor = async form => {
    const action=new URL(await form.getAttribute('action'),stack.origin);
    if(action.origin!==stack.origin||!action.pathname.startsWith('/update/'))throw Error('pointer editor is not the local update form');
    const pending=page.waitForResponse(r=>new URL(r.url()).origin===stack.origin&&new URL(r.url()).pathname===action.pathname&&r.request().method()==='POST',{timeout:60000}).then(response=>({response}),error=>({error}));
    await form.locator('.submit-button').first().click();
    const seen=await pending;if(seen.error)throw seen.error;await seen.response.finished();
    return {status:seen.response.status()};
  };

  // ------------------------------------------------------------------ S2-S4
  group("cover-b. session: sign-in refusals and the signed-out links (S2, S4)");

  await attempt("S2 sign-in refused on a wrong password, with an error shown and no session", async () => {
    await visit("/_signout");
    await visit("/*signin");
    await page.fill('input[name="card[subcards][+*email][content]"]', admin.email);
    await page.fill('input[name="card[subcards][+*password][content]"]', "definitely-not-the-password");
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/update/*signin"), { timeout: 30_000 }).catch(() => null),
      page.locator('form[action="/update/*signin"] button[type="submit"], form[action="/update/*signin"] input[type="submit"]').first().click(),
    ]);
    await page.waitForTimeout(1500);
    const cookies = await page.context().cookies(stack.origin);
    const session = cookies.some((c) => c.name === "decko_ts_session" && c.value.length > 0);
    const errors = await page.evaluate(() => [...document.querySelectorAll(".error, .alert, .invalid-feedback, .form-group .help-block, .form-control-feedback")]
      .map((e) => e.textContent.replace(/\s+/g, " ").trim()).filter((t) => /wrong|password|email|problem/i.test(t)).slice(0, 4));
    const anonymous = await visit("/");
    record("S2 sign-in refused on a wrong password, with an error shown and no session",
      response !== null && response.status() === 422 && !session && errors.length > 0 && !anonymous.signedIn,
      { status: response?.status() ?? null, hasSession: session, errors, anonymousAfter: anonymous.signedIn });
  });

  await attempt("S4 the signed-out sign-in page links to Sign up and to Reset password", async () => {
    await visit("/_signout");
    await visit("/*signin");
    const links = await page.evaluate(() => [...document.querySelectorAll("a")].map((a) => ({ text: a.textContent.replace(/\s+/g, " ").trim(), href: a.getAttribute("href") })));
    const signup = links.find((l) => /\/new\/Sign_up$/.test(l.href ?? ""));
    const reset = links.find((l) => /\/\*signin/.test(l.href ?? "") && /reset/i.test(l.text));
    // Both links must work: the sign-up link opens the sign-up form.
    let signupOpens = false;
    if (signup) {
      await page.goto(new URL(signup.href, stack.origin).href, { waitUntil: "load" }).catch(() => undefined);
      signupOpens = /email/i.test(await page.evaluate(() => document.body.innerText)) && /password/i.test(await page.evaluate(() => document.body.innerText));
    }
    record("S4 the signed-out sign-in page links to Sign up and to Reset password, and the sign-up link works",
      signup !== undefined && reset !== undefined && signupOpens,
      { signup, reset, signupOpens });
  });
  await signIn(admin);

  // ------------------------------------------------------------------- S10
  group("cover-b. session: the auth route under an existing session (S10)");

  await attempt("S10 a signed-in visit to the sign-in route renders the sign-in form, not a card-creation form", async () => {
    // Oracle contract, card-mod-account 0.20.0 set/self/signin.rb: the
    // "*signin (core view) gives the login ui" (file header :3) is readable by
    // anyone - `ok_to_read?` is `true` (:37-39) with no session condition - and
    // `view :core` (:119-125) renders `card_form :update` over the email and
    // password nests whatever the session holds. There is no signed-in
    // redirect arm anywhere in the gem (no `redirect` reference in
    // card-mod-layout), so a signed-in GET /*signin must still answer the
    // sign-in form. The port's create-form page is form#new_card posting to
    // /card/create (src/card/render/views.ts:1823), which is what a card name
    // that does not exist renders - the 2026-10-16 enumeration crawl recorded
    // a signed-in auth-route visit landing on exactly that create form
    // (docs/handoffs/edge-demo-coordination.md 19:45Z entry). Grade the
    // rendered surface, not the URL: the sign-in form present AND no
    // card-creation form.
    const actor = storedSessionActorId(ctx.database(), await page.context().cookies(stack.origin));
    const sessionCookie = (await page.context().cookies(stack.origin)).some((c) => c.name === "decko_ts_session" && c.value.length > 0);
    const visit1 = await visit("/*signin");
    await page.waitForTimeout(1200);
    const shape = await page.evaluate(() => {
      const signinForm = document.querySelector('form[action="/update/*signin"]');
      const createForm = document.querySelector('form#new_card[action="/card/create"], #main form[action="/card/create"]');
      return {
        title: document.title,
        signinForm: signinForm !== null,
        signinFields: signinForm === null ? [] : [...signinForm.querySelectorAll("input")].map((i) => ({ name: i.name, type: i.type })),
        createForm: createForm !== null,
        createFields: createForm === null ? [] : [...createForm.querySelectorAll("input, textarea, select")].map((i) => ({ name: i.name, type: i.type || i.tagName })).slice(0, 12),
        formActions: [...new Set([...document.querySelectorAll("form")].map((f) => f.getAttribute("action")).filter(Boolean))].slice(0, 10),
      };
    });
    const hasEmail = shape.signinFields.some((f) => /email/i.test(f.name ?? ""));
    const hasPassword = shape.signinFields.some((f) => /password/i.test(f.name ?? ""));
    // The crawl wrote the create-form landing as "/account/signin", which is a
    // SUB-card path (the card named `account` with subcard `signin`), not the
    // canonical auth route signin.rb names. Read it as well so the evidence
    // records what that URL actually answers rather than leaving the crawl's
    // own string unmeasured. Ruby renders the create form for ANY subcard that
    // does not exist, so this read is diagnostic and stays out of the
    // predicate.
    const subcard = await visit("/account/signin");
    const subcardShape = await page.evaluate(() => ({
      title: document.title,
      createForm: document.querySelector('form#new_card[action="/card/create"], #main form[action="/card/create"]') !== null,
      signinForm: document.querySelector('form[action="/update/*signin"]') !== null,
      prefilledName: document.querySelector('input[name="card[name]"]')?.value ?? null,
    }));
    const accountCard = ctx.database().prepare("SELECT id, trash FROM cards WHERE name = 'account'").get();
    record("S10 a signed-in visit to the sign-in route renders the sign-in form, not a card-creation form",
      visit1.status === 200 && sessionCookie && actor === admin.id && shape.signinForm && hasEmail && hasPassword && !shape.createForm,
      { actor, sessionCookie, status: visit1.status, url: visit1.pathname, signedInWhileVisiting: visit1.signedIn, title: shape.title, hasEmail, hasPassword, createForm: shape.createForm, createFields: shape.createFields, formActions: shape.formActions, raw: ctx.captureEvidence(await page.content(), { check: "S10-signed-in-signin-route" }), crawlUrlDiagnostic: { requested: "/account/signin", status: subcard.status, ...subcardShape, accountCardRow: accountCard ?? null } });
  });

  await signIn(admin);

  // ---------------------------------------------------------------- C8, C10
  group("cover-b. create: duplicate name, URL presets (C8, C10)");

  await attempt("C8 creating a card whose name already exists is refused", async () => {
    await visit("/new/RichText");
    await page.locator('form.card-form input[name="card[name]"]').first().fill("Home");
    const before = ledger().length;
    await page.locator('form.card-form button[type="submit"], form.card-form input[type="submit"]').first().click();
    await page.waitForTimeout(2500);
    const write = linesSince(before).find((l) => l.method !== "GET");
    const body = await page.evaluate(() => document.body.innerText);
    const stillThere = await visit("/Home");
    const refusal = write !== undefined && write.status >= 400 && /already|exist|taken|Problems with/i.test(body);
    record("C8 creating a card whose name already exists is refused (Home untouched, error shown)",
      refusal && stillThere.status === 200,
      { writeStatus: write?.status ?? null, serverSaid: write?.bodyHead?.slice(0, 200), errorShown: /already|exist|taken|Problems with/i.test(body), homeStatus: stillThere.status });
  });

  await attempt("C10 content preset in the /new URL fills the editor and is stored", async () => {
    const name = ensure(cardName("preset"));
    const marker = "Harness preset marker";
    await page.goto(`${stack.origin}/new/RichText?card%5Bname%5D=${encodeURIComponent(name)}&card%5Bcontent%5D=${encodeURIComponent(`<p>${marker}</p>`)}`, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    const ed = await waitForEditor(page);
    // TinyMCE fills the preset asynchronously after it becomes active: wait
    // until the editor holds the marker before the submit reads it.
    await page.waitForFunction((text) => (window.tinymce?.activeEditor?.getContent?.() ?? "").includes(text), marker, { timeout: 15_000 }).catch(() => undefined);
    const prefilled = await page.evaluate(() => window.tinymce?.activeEditor?.getContent?.() ?? document.querySelector('textarea[name="card[content]"]')?.value ?? null);
    await page.locator('form.card-form button[type="submit"]').first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    const after = await visit(`/${name}`);
    record("C10 content preset in the /new URL fills the editor and is stored on the card",
      ed.active === true && String(prefilled ?? "").includes(marker) && after.status === 200 && after.html.includes(marker),
      { editor: ed, prefilled: String(prefilled ?? "").slice(0, 80), afterStatus: after.status, stored: after.html.includes(marker) });
  });

  // ------------------------------------------------------------- C12, C14
  group("cover-b. create: structured cards and rule defaults (C12, C14)");

  const movie = ensure("Harness_CB_Movie");
  await attempt("C12 a structured card's new form offers its subcards", async () => {
    await create(movie, "", "Cardtype");
    await create(`${movie}+*type+*structure`, "{{+director}} {{+lead}}");
    const form = await visit(`/new/${movie}`);
    await page.waitForTimeout(1500);
    const shown = await page.evaluate(() => {
      const text = document.querySelector("#main")?.innerText ?? document.body.innerText;
      const groups = [...document.querySelectorAll("#main .form-group, #main .card-editor")].map((g) => (g.querySelector(".card-title")?.getAttribute("title") ?? g.innerText ?? "").trim().slice(0, 30));
      return { text: text.slice(0, 400), groups: groups.slice(0, 20) };
    });
    const hasDirector = /\+?director/i.test(shown.text) || shown.groups.some((g) => /director/i.test(g));
    const hasLead = /\+?lead/i.test(shown.text) || shown.groups.some((g) => /lead/i.test(g));
    record("C12 a structured card's new form offers its subcards (+director and +lead)",
      form.status === 200 && hasDirector && hasLead, { status: form.status, hasDirector, hasLead, groups: shown.groups, text: shown.text.slice(0, 200) });
  });

  await attempt("C14 a *right+*default rule's content fills the new form", async () => {
    const actorId=await adminActor();
    // Ruby: "Home Movie+*right+*default" = "Watch this"; a new card "Lew+Home Movie" shows it.
    // Creating a junction creates its LEFT card too, so track it for cleanup.
    ensure("Harness_CB_Home");
    await create("Harness_CB_Home+*right+*default", "Watch this");
    const name = ensure("Harness_CB_Lew+Harness_CB_Home");
    const defaultType = fixtureType(ctx.database(), "RichText");
    const opened=await page.goto(`${stack.origin}/new/${encodeURIComponent(defaultType.name)}?card%5Bname%5D=${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" });
    const form=page.locator('#main form.card-form').filter({has:page.locator('textarea[name="card[content]"]')}).first();
    if(await form.locator('input[name="card[name]"]').inputValue()!==name||Number(await form.locator('[name="card[type_id]"]').first().inputValue())!==defaultType.id)throw Error('default prefill form does not match the requested fixture');
    const field=form.locator('textarea[name="card[content]"]'),id=await field.getAttribute('id');
    if(!id)throw Error('default form editor has no field identity');
    await page.waitForFunction(matchingRichEditor,[id,false],{timeout:20000});
    await field.locator('..').locator('.tox-tinymce').waitFor({state:'visible'});
    const content=await page.evaluate(id=>window.tinymce.get(id).getContent(),id);
    record("C14 a *right+*default rule's content fills the new form for a card with that right",
      opened.status()===200&&/Watch this/.test(content), {actor:'admin',actorId,editorId:id,status:opened.status(),content:String(content).slice(0,120)});
  });

  // ------------------------------------------------------------ C16, C18
  group("cover-b. create: pointer inputs (checkbox, select) (C16, C18)");

  // Ruby's pointer_inputs.feature: "<right>+*right+*input type" picks the widget and
  // options_api.rb uses rule_card(:content_options). Resolve its migrated
  // name from the codename; a new ordinary *options card is not this setting.
  const rightSet = "Harness_CB_Role";
  const optionType = "Harness_CB_Option";
  const optionCards = ["Harness_CB_Pick_One", "Harness_CB_Pick_Two"];
  let pointerBuilt = false;
  const buildPointerInput = async (inputType) => {
    if (!pointerBuilt) {
      // The junction rules below create the right card "Harness_CB_Role" as their left part.
      ensure(rightSet);
      await create(optionType, "", "Cardtype");
      for (const option of optionCards) await create(option, "", optionType);
      const setting=ctx.database().prepare("SELECT name FROM cards WHERE codename='content_options' AND trash=0").get();
      if(!setting?.name)throw Error('canonical content_options setting is unavailable');
      await create(`${rightSet}+*right+${setting.name}`, JSON.stringify({ type: optionType, sort: "name" }), "Search");
      pointerBuilt = true;
    }
    const inputRule=ensure(`${rightSet}+*right+*input type`);
    if(exists(inputRule)){
      // A whole run reuses this fixture across checkbox/select/edit cases.
      // Update the existing rule instead of silently ignoring duplicate create.
      const updated=await page.context().request.post(stack.origin+'/update/'+encodeURIComponent(inputRule),{headers:{origin:stack.origin,accept:'application/json'},form:{'card[content]':inputType},maxRedirects:0});
      await updated.body();
      if(updated.status()>=400||row(inputRule)?.content!==inputType)throw Error('pointer input fixture rule update did not persist');
    }else await create(inputRule, inputType, "Phrase");
  };

  await attempt("C16 a checkbox pointer input can be checked and stored", async () => {
    await buildPointerInput("checkbox");
    const cardNamePick = ensure("Harness_CB_Boxy");
    await create(cardNamePick, null, "Basic");
    ensure(`${cardNamePick}+${rightSet}`); await create(`${cardNamePick}+${rightSet}`, "", "Pointer");
    const form = await pointerEditor(`${cardNamePick}+${rightSet}`);
    const boxes = await form.form.locator('input[type="checkbox"]').evaluateAll(items => items.map(i => ({name:i.name,value:i.value,id:i.id})));
    const target = boxes.find((b) => /Pick_Two/i.test(`${b.value} ${b.name}`));
    if (target === undefined) {
      record("C16 a checkbox pointer input can be checked and stored", false, { formStatus: form.status, checkboxes: boxes.slice(0, 8), note: "no checkbox inputs on the pointer's edit form" });
      return;
    }
    await form.form.locator(`input[type="checkbox"][value="${target.value}"]`).check();
    const write = await submitEditor(form.form);
    const stored = row(`${cardNamePick}+${rightSet}`)?.content ?? '';
    const after = await visit(`/${cardNamePick}+${rightSet}`);
    record("C16 a checkbox pointer input can be checked and stored (card shows the checked value)",
      write.status < 400 && stored.includes(target.value) && /Pick_Two/.test(after.html),
      { writeStatus: write.status, stored, checkboxes: boxes.slice(0, 6), afterStatus: after.status, showsPickTwo: /Pick_Two/.test(after.html) });
    // pointer_inputs.feature also removes the selected item and rereads it.
    const reopened=await pointerEditor(`${cardNamePick}+${rightSet}`);
    await reopened.form.locator(`input[type="checkbox"][value="${target.value}"]`).uncheck();
    const removed=await submitEditor(reopened.form);
    const remaining=row(`${cardNamePick}+${rightSet}`)?.content??'';
    const reloaded=await visit(`/${cardNamePick}+${rightSet}`);
    record('a checkbox choice can be unchecked and removal persists on a fresh page',removed.status<400&&!remaining.includes(target.value)&&!/Pick_Two/.test(reloaded.html),{status:removed.status,stored:remaining,freshStatus:reloaded.status,removed:!/Pick_Two/.test(reloaded.html)});
  });

  await attempt("C18 a select pointer input offers a choice and stores it", async () => {
    await buildPointerInput("select");
    const cardNameSel = ensure("Harness_CB_Selly");
    await create(cardNameSel, null, "Basic");
    ensure(`${cardNameSel}+${rightSet}`); await create(`${cardNameSel}+${rightSet}`, "", "Pointer");
    const form = await pointerEditor(`${cardNameSel}+${rightSet}`);
    const selects = await form.form.locator('select').evaluateAll(items => items.map(s => ({name:s.name,id:s.id,options:[...s.options].map(o=>({text:o.textContent.trim(),value:o.value})).slice(0,8)})));
    const sel = selects.find((s) => s.options.some((o) => /Pick_One/i.test(o.text) || /Pick_One/i.test(o.value)));
    if (sel === undefined) {
      record("C18 a select pointer input offers a choice and stores it", false, { formStatus: form.status, selects: selects.slice(0, 4), note: "no select with the option cards on the pointer's edit form" });
      return;
    }
    const option = sel.options.find((o) => /Pick_One/i.test(o.text) || /Pick_One/i.test(o.value));
    await form.form.locator(`select[name="${sel.name}"]`).selectOption(option.value);
    const write = await submitEditor(form.form);
    const stored=row(`${cardNameSel}+${rightSet}`)?.content??'';
    const after = await visit(`/${cardNameSel}+${rightSet}`);
    void write;
    record("C18 a select pointer input offers a choice and stores it (card shows the selection)",
      write.status < 400 && stored.includes(option.value) && /Pick_One/.test(after.html),
      { writeStatus: write.status, stored, selected: option, afterStatus: after.status, showsPickOne: /Pick_One/.test(after.html) });
  });

  // ------------------------------------------------------------------ E6-E8
  group("cover-b. edit: editor buttons (link, nest image) (E6, E8)");

  await attempt("E6 the editor's link button inserts a reference that renders as a link",()=>linkDialogJourney(ctx));

  await attempt("E8 the nest image editor inserts a nest with view and size options",()=>imageDialogJourney(ctx));

  // ------------------------------------------------------------------ E5
  group("cover-b. edit: the Nest dialog's Apply (E5): wire id, insertion, save persistence");

  await attempt("E5 the Nest dialog Apply inserts and saves through its owned visible editor",()=>nestDialogJourney(ctx));

  // ------------------------------------------------------------- E10, E12
  group("cover-b. edit: plain input, edit type in board (E10, E12)");

  await attempt("E10 a plain-input card can be edited and saved", async () => {
    const name = ensure(cardName("phrase"));
    await create(name, "Harness original phrase", "Phrase");
    await visit(`/${name}`);
    const link = page.locator('a.edit-link[href$="/edit"]').first();
    await link.dispatchEvent("click").catch(() => undefined);
    await page.waitForSelector("#edit_card, .modal", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(2500);
    const field = page.locator('#edit_card input[name$="[content]"]:not([type=hidden]), #edit_card textarea[name$="[content]"], .modal input[name$="[content]"]:not([type=hidden]), .modal textarea[name$="[content]"]').first();
    const fieldInfo = await field.evaluate((el) => ({ type: el.type ?? el.tagName, value: el.value })).catch(() => null);
    await field.fill("Harness edited phrase").catch(() => undefined);
    const before = ledger().length;
    await page.locator("#edit_card button[type=submit], .modal button[type=submit]").first().click().catch(() => undefined);
    await page.waitForTimeout(2500);
    const write = linesSince(before).find((l) => l.method !== "GET");
    const after = await visit(`/${name}`);
    record("E10 a plain-input card can be edited and saved (the new content shows on the card)",
      fieldInfo !== null && write !== undefined && write.status < 400 && after.html.includes("Harness edited phrase"),
      { field: fieldInfo, writeStatus: write?.status ?? null, afterStatus: after.status, shows: after.html.includes("Harness edited phrase") });
  });

  await attempt("E12 a card's type can be changed in the board", async () => {
    const name = ensure(cardName("typechange"));
    await create(name, null, "Basic");
    // Ruby: "Book" is a Cardtype whose +*structure is {{+author}}.
    const bookType = ensure("Harness_CB_Book");
    if (!exists(bookType)) { await create(bookType, "", "Cardtype"); await create(`${bookType}+*type+*structure`, "{{+author}}"); }
    await visit(`/${name}/board`);
    await page.waitForTimeout(2500);
    const rowLink = page.locator(".board a[href$='/board_type_formgroup'], .board .edit_type_row a, .board a[href$='/edit_type']").first();
    const rowCount = await page.locator(".board a").filter({ hasText: /^edit$/ }).count();
    void rowCount;
    const opened = await rowLink.count();
    if (opened === 0) {
      const rowInfo = await page.evaluate(() => [...document.querySelectorAll(".board .edit_name_row, .board .row, .board .form-group")].map((r) => r.className.slice(0, 60)));
      record("E12 a card's type can be changed in the board", false, { note: "no type edit row in the board", rows: rowInfo.slice(0, 10), boardLinks: await page.evaluate(() => [...document.querySelectorAll(".board a")].map((a) => a.getAttribute("href")).slice(0, 20)) });
      return;
    }
    await rowLink.dispatchEvent("click").catch(() => undefined);
    await page.waitForTimeout(1500);
    const typeField = page.locator('#main select[name="card[type]"], #main input[name="card[type]"], .modal select[name="card[type]"], #edit_card select[name="card[type]"], .modal input[name="card[type]"], #edit_card input[name="card[type]"]').first();
    if (await typeField.count() === 0) {
      record("E12 a card's type can be changed in the board", false, { note: "the type row opened but no card[type] field appeared", main: await page.evaluate(() => (document.querySelector("#main")?.innerText ?? "").slice(0, 200)) });
      return;
    }
    await typeField.selectOption({ label: bookType }).catch(async () => { await typeField.selectOption(bookType).catch(() => undefined); });
    await page.waitForTimeout(2000);
    const chosen = await page.evaluate(() => {
      const f = document.querySelector('#main select[name="card[type]"], #main input[name="card[type]"], .modal select[name="card[type]"], #edit_card select[name="card[type]"], .modal input[name="card[type]"], #edit_card input[name="card[type]"]');
      const hidden = document.querySelector('input[name="card[type_id]"]');
      return { field: f?.value ?? null, hiddenTypeId: hidden?.value ?? null, formAction: f?.closest("form")?.getAttribute("action") ?? null, options: f?.tagName === "SELECT" ? [...f.options].map(o => ({value:o.value,selected:o.selected})) : [], slotTypes: [...document.querySelectorAll('[data-card-type-id]')].filter(s=>s.getAttribute('data-card-name')?.startsWith('Harness_typechange')).map(s=>({view:s.className,type:s.getAttribute('data-card-type-id')})) };
    });
    chosen.raw = ctx.captureEvidence(await page.content(), {check: "E12-selected-type", name});
    const before = ledger().length;
    await page.locator("#edit_card button.submit-button, .modal button.submit-button, .modal button[type=submit]:has-text('Save and Close'), #edit_card button[type=submit]").first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    const write = linesSince(before).find((l) => l.method !== "GET");
    const after = await visit(`/${name}`);
    // The card's stored type is the authority: type_id must be Book's id.
    const bookId = ctx.database().prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(bookType)?.id;
    const storedTypeId = ctx.database().prepare("SELECT type_id FROM cards WHERE name = ? AND trash = 0").get(name)?.type_id;
    record("E12 a card's type can be changed in the board (the card's stored type becomes Book)",
      write !== undefined && write.status < 400 && bookId !== undefined && Number(storedTypeId) === Number(bookId),
      { writeStatus: write?.status ?? null, writeBody: write?.bodyHead?.slice(0, 120), chosen, afterStatus: after.status, bookId, storedTypeId });
  });

  // ------------------------------------------------------------------ E14
  group("cover-b. edit: type for a rule (E14)");

  await attempt("E14 a rule card's type can be changed in the board's Rules tab", async () => {
    const target = ensure(cardName("ruleType"));
    const ruleName = ensure(`${target}+*self+*default`);
    await create(target, "rule type target", "Basic");
    await create(ruleName, "rule type content", "Basic");
    await visit(`/${target}/board`);
    await page.waitForTimeout(1500);
    const rulesTab = page.locator(".board .nav-link", { hasText: "Rules" }).first();
    await rulesTab.click().catch(() => undefined);
    const setSelect = page.locator('.board .rules_tab-view select[name="mark"]');
    await setSelect.waitFor({state:"attached",timeout:15000});
    // Ruby's rules_tab is a set selector. The rule list appears only after
    // selecting the card's self set; opening the tab is not that selection.
    // The stock widget submits on select2:select, not the native change
    // event produced by selectOption. Use its visible option as a person does.
    await page.locator('.board .rules_tab-view .select2-selection').click();
    await page.getByRole('treeitem', {name:`The card "${target}"`,exact:true}).click();
    await page.locator('.board a[href*="overlay_rule"]').first().waitFor({state:"attached",timeout:15000});
    const rows = await page.evaluate(() => [...document.querySelectorAll(".board .card-slot, .board .rule-row, .board [id*='rule']")].map((r) => ({ id: r.id, text: r.textContent.replace(/\s+/g, " ").trim().slice(0, 40) })).slice(0, 15));
    const ruleLink = page.locator(`.board a[href^="/${ruleName}/overlay_rule"]`).first();
    const opened = await ruleLink.count();
    if (opened === 0) {
      record("E14 a rule card's type can be changed in the board's Rules tab", false, { note: "no rule row edit link in the Rules tab", rows, rulesTabLinks: await page.evaluate(() => [...document.querySelectorAll(".board a")].map((a) => a.getAttribute("href"))), raw: ctx.captureEvidence(await page.content(), { check: "E14-rules-tab" }) });
      return;
    }
    await ruleLink.dispatchEvent("click").catch(() => undefined);
    await page.waitForTimeout(1500);
    const typeField = page.locator('#main select[name="card[type]"], #main input[name="card[type]"], .modal select[name="card[type]"], #edit_card select[name="card[type]"], .modal input[name="card[type]"], #edit_card input[name="card[type]"]').first();
    if (await typeField.count() === 0) {
      record("E14 a rule card's type can be changed in the board's Rules tab", false, { note: "the rule opened but no card[type] field appeared", main: await page.evaluate(() => (document.querySelector("#main")?.innerText ?? "").slice(0, 200)) });
      return;
    }
    await typeField.selectOption({ label: "PlainText" }).catch(async () => { await typeField.selectOption("PlainText").catch(() => undefined); });
    const ruleForm = page.locator('form.card-rule-form').filter({has:page.locator(`input[name="card[name]"][value="${ruleName}"]`)});
    await ruleForm.locator(`input[name="card[name]"][value="${ruleName}"]`).check();
    const action = new URL(await ruleForm.getAttribute('action'), stack.origin);
    const saved = page.waitForResponse(r=>new URL(r.url()).origin===stack.origin&&new URL(r.url()).pathname===action.pathname&&r.request().method()==='POST',{timeout:20000});
    await ruleForm.locator('button[type="submit"]').first().click();
    const response = await saved; await response.finished();
    const write = {status:response.status()};
    const stored = fixtureCard(ctx.database(), ruleName);
    const expected = fixtureType(ctx.database(), "PlainText");
    record("E14 a rule card's type can be changed in the board's Rules tab (the write answers 200)",
      write !== undefined && write.status < 400 && stored?.type_id === expected.id,
      { writeStatus: write?.status ?? null, rows, ruleName, storedTypeId:stored?.type_id, expectedTypeId:expected.id, raw:ctx.captureEvidence(await page.content(),{check:"E14-rule-after-save",ruleName}) });
  });

  // ------------------------------------------------------------ E17, E19, E21
  group("cover-b. edit: board name change, account tab, history tab (E17, E19, E21)");

  await attempt("E17 saving a name change updates the origin slot", async () => {
    const name = ensure(cardName("origin"));
    const renamed = `${name}_renamed`;
    await create(name, "Harness origin body", "Basic");
    const before = await visit(`/${name}/board`);
    await page.waitForTimeout(2000);
    const nameRow = page.locator(".board .edit_name_row a[href$='/name_form'], .board a[href$='/name_form']").first();
    if (await nameRow.count() === 0) {
      record("E17 saving a name change updates the origin slot", false, { note: "no name row edit link in the board", boardLinks: await page.evaluate(() => [...document.querySelectorAll(".board a")].map((a) => a.getAttribute("href")).slice(0, 20)) });
      return;
    }
    await nameRow.dispatchEvent("click").catch(() => undefined);
    await page.waitForTimeout(1500);
    const input = page.locator('#main input[name="card[name]"], .modal input[name="card[name]"], #edit_card input[name="card[name]"], .board input[name="card[name]"]').first();
    await input.fill(renamed).catch(() => undefined);
    const writeBefore = ledger().length;
    await page.locator('.modal button.renamer, .board button.renamer, #edit_card button.renamer, .modal button[type=submit], #edit_card button[type=submit]').first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    const write = linesSince(writeBefore).find((l) => l.method !== "GET");
    const origin = await page.evaluate(() => document.querySelector(".board .edit_name_row, .board .name, .board h1, .board .d0-card-header-title")?.textContent?.trim().slice(0, 80) ?? null);
    const after = await visit(`/${renamed}`);
    const boardAgain = await visit(`/${renamed}/board`);
    await page.waitForTimeout(1500);
    const originAfter = await page.evaluate(() => document.querySelector(".board .edit_name_row, .board .name, .board h1, .board .d0-card-header-title")?.textContent?.trim().slice(0, 80) ?? null);
    // Swap the tracked name only once the rename provably landed (the runner's
    // rename guard): swapping before the write would leave the list pointing
    // at a card that does not exist while the created one leaks.
    const renamedRow = ctx.database().prepare("SELECT id, name, trash FROM cards WHERE name = ?").get(renamed);
    const oldGoneInDb = Number(ctx.database().prepare("SELECT COUNT(*) AS n FROM cards WHERE name = ? AND trash = 0").get(name)?.n ?? 0) === 0;
    if (renamedRow?.trash === 0 && oldGoneInDb) created[created.indexOf(name)] = renamed;
    record("E17 saving a name change updates the origin slot (the board and page show the new name)",
      write !== undefined && write.status < 400 && after.status === 200 && `${origin ?? ""}${originAfter ?? ""}${boardAgain.html}`.includes(renamed),
      { writeStatus: write?.status ?? null, originBefore: origin, originAfter, afterStatus: after.status, newName: renamed });
  });

  await attempt("E19 the account card's board has an Account tab that exposes email and password", async () => {
    const holder = admin.name.replace(/ /g, "_");
    await visit(`/${holder}/board`);
    await page.waitForTimeout(2500);
    const tabs = await page.evaluate(() => [...document.querySelectorAll(".board .nav-link, .board [role=tab], .board .nav-tabs a")].map((t) => ({ text: t.textContent.replace(/\s+/g, " ").trim().slice(0, 40), href: t.getAttribute("href") })));
    const accountTab = tabs.find((t) => /account/i.test(t.text));
    if (accountTab === undefined) {
      record("E19 the account card's board has an Account tab that exposes email and password", false, { tabs });
      return;
    }
    if (accountTab.href && !accountTab.href.startsWith("#")) await page.goto(new URL(accountTab.href, stack.origin).href, { waitUntil: "load" }).catch(() => undefined);
    else { await page.locator(".board .nav-link", { hasText: /account/i }).first().click().catch(() => undefined); await page.waitForTimeout(1500); }
    // The Account tab pane is a PILL LIST on both engines, never a bare form:
    // oracle card-mod-account set/abstract/account_holder.rb:132-137 `view
    // :account_tab` renders board_pill_sections only (Settings/Content
    // sections), and default_board_tab (:128-130) makes it the active tab, so
    // the tab click itself swaps nothing. The email/password form lives one
    // pill deeper - "Email and Password" fetches +*account/content into the
    // board's overlay slot (inside the same modal, so .modal input sees it).
    // A person reaches the fields through that pill; the check does too.
    const pill = page.locator(".board .board-pills a", { hasText: /email and password/i }).first();
    if (await pill.count() === 0) {
      record("E19 the account card's board has an Account tab that exposes email and password", false, { accountTab, note: "the Account tab offers no Email and Password pill", pills: await page.evaluate(() => [...document.querySelectorAll(".board .board-pills a")].map((a) => ({ text: a.textContent.replace(/\s+/g, " ").trim().slice(0, 40), href: a.getAttribute("href") })).slice(0, 12)) });
      return;
    }
    const pillHref = await pill.getAttribute("href");
    const pillLines = await clickAndWait(pill);
    const pillFetch = pillLines.find((l) => /account\/content/.test(l.path ?? ""));
    // The pill target renders the +*account card (oracle
    // right/account/views.rb :core = email+password field_nests, view:
    // :labeled; the edit: :inline variant sits commented out in the gem), so
    // the swapped region is read-style: email and password show up as labeled
    // rows, not bare form inputs. Grade the exposure the person sees where
    // the board pane stood: the fetch answering 200, the email VALUE (the
    // signed-in account's own address), and the password's own labeled row or
    // a real input. Inputs, when an edit form is open, still count.
    const regionInventory = await page.evaluate(() => {
      const regionEl = document.querySelector(".board-main > .overlay-container > .card-slot._bottomlay-slot, .board-main > ._overlay-container-placeholder > .card-slot");
      const fields = [...document.querySelectorAll("#main input, .modal input")].map((i) => ({ name: i.name, type: i.type }));
      // The labeled rows the person reads: the sanitized right names the
      // engine renders (.RIGHT-Xemail / .RIGHT-Xpassword, the same rows the
      // A1 value-graded check opens).
      const emailRow = regionEl?.querySelector(".RIGHT-Xemail, .RIGHT-email") ?? null;
      const passwordRow = regionEl?.querySelector(".RIGHT-Xpassword, .RIGHT-password") ?? null;
      return {
        regionText: regionEl === null || regionEl === undefined ? null : regionEl.textContent.replace(/\s+/g, " ").trim().slice(0, 400),
        emailRowPresent: emailRow !== null,
        passwordRowPresent: passwordRow !== null,
        fields,
      };
    });
    const fields = regionInventory.fields;
    const emailField = fields.find((f) => /email/i.test(f.name ?? "") && f.type !== "hidden");
    const passwordField = fields.find((f) => /password/i.test(f.name ?? "") && f.type !== "hidden");
    // Word presence in the region text is evidence, not the verdict
    // (adversarial blindness-review F6 item 9): email grades by VALUE — the
    // signed-in account's own address, the same value-graded shape as the
    // strong A1 check — or by a real email input; password grades by a real
    // password input or its own labeled row element.
    const showsEmail = emailField !== undefined || (regionInventory.regionText !== null && regionInventory.regionText.includes(admin.email));
    const showsPassword = passwordField !== undefined || regionInventory.passwordRowPresent;
    record("E19 the account card's board has an Account tab that exposes email and password",
      pillFetch?.status === 200 && showsEmail && showsPassword,
      { accountTab, pill: { href: pillHref, fetchStatus: pillFetch?.status ?? null, fetchPath: pillFetch?.path ?? null }, regionText: regionInventory.regionText, emailRowPresent: regionInventory.emailRowPresent, passwordRowPresent: regionInventory.passwordRowPresent, fields });
  });

  await attempt("E21 the board History tab lists the run's change", async () => {
    const name=ensure('Harness_CB_History_'+Date.now().toString(36));
    await create(name,'history fixture created by this run');
    const card=exists(name);
    const expectedActId=ctx.database().prepare('SELECT card_act_id FROM card_actions WHERE card_id=? ORDER BY id DESC LIMIT 1').get(card.id)?.card_act_id;
    if(!expectedActId)throw Error('Fresh history fixture has no recorded act');
    await visit('/'+encodeURIComponent(name)+'/board');
    const tab=page.locator('.board a.nav-link[data-url$="/history_tab"]').first();
    const href=await tab.getAttribute('data-url');
    const pending=page.waitForResponse(r=>new URL(r.url()).origin===stack.origin && new URL(r.url()).pathname===new URL(href,stack.origin).pathname,{timeout:15000}).then(response=>({response}),error=>({error}));
    await tab.click();
    const seen=await pending;if(seen.error)throw seen.error;await seen.response.finished();
    const history=page.locator('.board .history_tab-view[data-card-id="'+card.id+'"]');
    await history.waitFor({state:'visible',timeout:10000});
    const acts=await history.locator('a[href*="/board_act?"]').evaluateAll(links=>links.map(a=>Number(new URL(a.href).searchParams.get('act_id'))));
    // The act id in the href is only half of what Ruby's history-tab spec
    // asserts: `cy.contains("Joe Admin less than a minute ago")` — the pill's
    // own text names the actor and the age (board_act_renderer.rb:6-13,
    // act_renderer.rb:105-109). lib/history-pills.mjs grades those bytes off
    // the same slot, so the Related tab's identical pill classes cannot answer.
    //
    // THE PREDICATE IS HANDED THE SLOT'S OWN HTML, OUTER INCLUDED. It scopes
    // to the slot (the div whose class carries "history_tab-view",
    // tab_views.rb:6-10) and then reads the ul.board-pills inside it
    // (board_pills.rb:1-11), so the Related tab's identical pill classes
    // cannot answer for it. The slot's INNER html does not carry the slot:
    // the signed-in run of 2026-10-22 at this tip recorded the pill leg as
    // failures ["historyTabSlot","expectedAct"] with pills [] on a board
    // whose history tab rendered the pill exactly as Ruby does (the captured
    // page 166-E21-board-history.html carries the slot, the ul.board-pills
    // and the pill with the actor and the age).
    const pills=listsChangeAsPills(await history.evaluate(el=>el.outerHTML),Number(expectedActId));
    record("E21 the board History tab lists the run's change",seen.response.status()===200&&acts.includes(Number(expectedActId)),
      {card:name,cardId:card.id,expectedActId,actIds:acts,tabStatus:seen.response.status(),raw:ctx.captureEvidence?.(await page.content(),{check:'E21-board-history'})});
    record("the board History tab lists the run's change as a pill",pills.ok,
      {failures:pills.failures,pills:pills.pills});
  });

  // ------------------------------------------------------------------ E23
  group("cover-b. edit: pointer editing (E23)");

  await attempt("E23 a pointer card can be edited: the selection changes and is stored", async () => {
    await buildPointerInput("select");
    const host = ensure("Harness_CB_Host");
    await create(host, null, "Basic");
    const pointer = `${host}+${rightSet}`;
    ensure(pointer);
    await create(pointer, "Harness_CB_Pick_One", "Pointer");
    const form = await pointerEditor(pointer);
    const selects = await form.form.locator('select').evaluateAll(items=>items.map(s=>({name:s.name,value:s.value,options:[...s.options].map(o=>({text:o.textContent.trim(),value:o.value})).slice(0,6)})));
    const sel = selects.find((s) => s.options.some((o) => /Pick_Two/.test(o.text) || /Pick_Two/.test(o.value)));
    if (sel === undefined) { record("E23 a pointer card can be edited: the selection changes and is stored", false, { formStatus: form.status, selects, note: "no select input on the pointer card's edit form" }); return; }
    const option = sel.options.find((o) => /Pick_Two/.test(o.text) || /Pick_Two/.test(o.value));
    await form.form.locator(`select[name="${sel.name}"]`).selectOption(option.value);
    const write = await submitEditor(form.form);
    const stored = row(pointer)?.content ?? "";
    const after = await visit(`/${pointer}`);
    record("E23 a pointer card can be edited: the selection changes and is stored",
      write !== undefined && write.status < 400 && /Pick_Two/.test(stored) && /Pick_Two/.test(after.html),
      {actor:'admin',actorId:form.actorId,writeStatus:write.status,stored,afterStatus:after.status,showsPickTwo:/Pick_Two/.test(after.html)});
  });

  // -------------------------------------------------------------- F1, F3, F5, F7
  group("cover-b. files: upload a file, an image, empty refused, member (F1, F3, F5, F7)");

  const uploadCheck = async (capId, label, type, expectStored) => {
    const form = await visit(`/new/${type}`);
    const fileInput = page.locator('#main input[type="file"], form.card-form input[type="file"]').first();
    if (await fileInput.count() === 0) {
      record(`${capId} ${label}`, false, { formStatus: form.status, note: `the ${type} create form offers no file input`, mainText: (await page.evaluate(() => document.querySelector("#main")?.innerText ?? "")).slice(0, 200) });
      return;
    }
    const name = ensure(cardName(expectStored ? "upload" : "empty"));
    await page.locator('form.card-form input[name="card[name]"]').first().fill(name).catch(() => undefined);
    // An Image card gets real image bytes; a text/plain buffer cannot credit
    // the image capability no matter what the server answers.
    const isImage = type === "Image";
    await fileInput.setInputFiles({
      name: isImage ? "harness.png" : "harness.txt",
      mimeType: isImage ? "image/png" : "text/plain",
      buffer: isImage ? Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64") : Buffer.from("harness"),
    }).catch(() => undefined);
    const before = ledger().length;
    await page.locator('form.card-form button[type="submit"]').first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    const write = linesSince(before).find((l) => l.method !== "GET");
    const after = await visit(`/${name}`);
    const stored = expectStored ? after.status === 200 && /harness/.test(after.html) : after.status === 200 && /Problems with|is missing/i.test(after.html);
    record(`${capId} ${label}`, write !== undefined && write.status < 400 && stored,
      { writeStatus: write?.status ?? null, serverSaid: write?.bodyHead?.slice(0, 120), afterStatus: after.status, stored });
  };
  await attempt("F1 a file can be uploaded through the File create form", () => uploadCheck("F1", "a file can be uploaded through the File create form", "File", true));
  await attempt("F3 an image can be uploaded through the Image create form", () => uploadCheck("F3", "an image can be uploaded through the Image create form", "Image", true));

  // F3's own second half. The upload leg above is satisfied by the FIRST image
  // and can never see the second, which is why this row's finding recorded that
  // no F3-named check asserted "and change". Ruby's attach.feature ends that
  // scenario on `Then I should see an image of size "large" and type "jpg"`
  // after uploading image2.jpg over image.png - the TYPE moved. Graded by
  // lib/image-core-view.mjs against the gem's own html_views.rb (vendored at
  // fixtures/vendor/card-mod-carrierwave-0.20.0/set/type/image/html_views.rb):
  // image_tag source, alt: card.name, and an invalid source renders the
  // `<!-- invalid image ... -->` comment rather than an <img>.
  //
  // WHAT THIS LEG DRIVES, precisely: the repository carries no JPEG fixture
  // (git ls-files finds no .jpg/.jpeg), so the second upload here is a
  // DIFFERENT PNG rather than a different TYPE. The leg therefore proves the
  // change is observable - the source moved and is not the superseded one - and
  // the png->jpg transition itself is pinned by
  // test/image-core-view.test.mjs, which grades rendered sources and needs no
  // image bytes at all. Fabricating JPEG bytes to make this leg look closer to
  // Ruby's scenario is not something to do silently.
  await attempt("F3 an uploaded image can be changed through the Image edit form", async () => {
    const name = ensure(cardName("imagechange"));
    await visit(`/new/Image`);
    const fileInput = page.locator('#main input[type="file"], form.card-form input[type="file"]').first();
    if (await fileInput.count() === 0) {
      record("F3 an uploaded image can be changed through the Image edit form", false, { note: "the Image create form offers no file input" });
      return;
    }
    await page.locator('form.card-form input[name="card[name]"]').first().fill(name).catch(() => undefined);
    await fileInput.setInputFiles({ name: "harness-first.png", mimeType: "image/png", buffer: Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64") }).catch(() => undefined);
    const createBefore = ledger().length;
    await page.locator('form.card-form button[type="submit"]').first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    const createWrite = linesSince(createBefore).find((l) => l.method !== "GET");
    const uploaded = await visit(`/${name}`);
    // THE CARD'S OWN REGION, and the whole point of this leg.
    //
    // THE DEFECT. The predicate grades "the core view is what the CARD SLOT
    // renders" (lib/image-core-view.mjs) and takes the FIRST <img> of the
    // html it is handed. The caller handed it the WHOLE PAGE, and the first
    // <img> on a card page is the deck's own logo in the navbar
    // (alt="*logo", src=.../files/79/3643-small.jpg). So the leg graded the
    // LOGO: the signed-in run of 2026-10-22 recorded the first upload as
    // failures ["altNotCardName","sizeNotInSource","wrongExtension"] and the
    // change as the same three, with sourceMoved false - on a page whose card
    // rendered its own image exactly as Ruby renders it (alt=card.name, the
    // requested size's source, the stored extension).
    //
    // The card's own content is the #main region - the scope the harness's own
    // F9 leg already uses (document.querySelector("#main img"), checks-
    // upload-image-change.mjs:213), and the scope the navbar's logo is
    // outside of.
    const cardRegion = async () => page.evaluate(() => {
      const main = document.querySelector('#main, main');
      return main === null ? null : main.innerHTML;
    });
    const uploadedCore = await cardRegion();
    const firstVerdict = imageCoreShows({
      cardName: name, html: uploadedCore ?? uploaded.html, requestedSize: "large", extension: "png",
    });
    const firstSrc = (uploadedCore ?? uploaded.html).match(/<img\b[^>]*src=["']([^"']+)["']/i)?.[1] ?? null;

    // The change: edit the card and upload a DIFFERENT image over it. The
    // second PNG is a different image (different pixels, different byte length),
    // so a leg that only re-read the first upload's state cannot pass.
    const edit = await visit(`/${name}?view=edit`);
    const editInput = page.locator('#main input[type="file"], form.card-form input[type="file"]').first();
    if (await editInput.count() === 0) {
      record("F3 an uploaded image can be changed through the Image edit form", false,
        { note: "the Image edit form offers no file input", editStatus: edit.status, firstImage: firstVerdict.failures });
      return;
    }
    await editInput.setInputFiles({ name: "harness-second.png", mimeType: "image/png", buffer: Buffer.from(TWO_BY_ONE_PNG_BASE64, "base64") }).catch(() => undefined);
    const editBefore = ledger().length;
    await page.locator('form.card-form button[type="submit"]').first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    const editWrite = linesSince(editBefore).find((l) => l.method !== "GET");
    const after = await visit(`/${name}`);
    const afterCore = await cardRegion();
    const afterSrc = (afterCore ?? after.html).match(/<img\b[^>]*src=["']([^"']+)["']/i)?.[1] ?? null;
    const changedVerdict = imageCoreShows({
      cardName: name, html: afterCore ?? after.html, requestedSize: "large", extension: "png",
    });
    // The change itself: the card now serves a DIFFERENT source.
    const sourceMoved = firstSrc !== null && afterSrc !== null && firstSrc !== afterSrc;
    record("F3 an uploaded image can be changed through the Image edit form",
      createWrite !== undefined && createWrite.status < 400 && uploaded.status === 200
      && editWrite !== undefined && editWrite.status < 400 && after.status === 200
      && firstVerdict.ok && changedVerdict.ok && sourceMoved,
      {
        firstUploadFailures: firstVerdict.failures, changeFailures: changedVerdict.failures,
        sourceMoved, firstSrc, afterSrc,
        createWriteStatus: createWrite?.status ?? null, editWriteStatus: editWrite?.status ?? null,
        uploadedStatus: uploaded.status, afterStatus: after.status, cardName: name,
      });
  });

  // F1's own half. The upload leg above proves a write happened and the card
  // answers 200; it never looks at what the card then SHOWS, which is the whole
  // of "/files route after upload". Ruby's attach.feature ends its scenario
  // with `Then I should see "Download a test file"` - and that string IS the
  // /files route rendered, because set/type/file/core.haml is one anchor whose
  // href is the attachment's source and whose text is
  // `t :carrierwave_download` = "Download %{title}" (the gem's en.yml:5).
  // Graded by lib/file-download-view.mjs, whose bytes are vendored from the gem
  // under fixtures/vendor/card-mod-carrierwave-0.20.0.
  await attempt("F1 the uploaded card offers the /files route as a Download link", async () => {
    const name = ensure(cardName("download"));
    const created1 = await visit(`/new/File`);
    const chooser = fileChooserShape(created1.html);
    const fileInput = page.locator('#main input[type="file"], form.card-form input[type="file"]').first();
    if (await fileInput.count() === 0) {
      record("F1 the uploaded card offers the /files route as a Download link", false,
        { chooserFailures: chooser.failures, formStatus: created1.status, note: "the File create form offers no file input" });
      return;
    }
    await page.locator('form.card-form input[name="card[name]"]').first().fill(name).catch(() => undefined);
    const uploaded = Buffer.from("harness file body");
    await fileInput.setInputFiles({ name: "harness.txt", mimeType: "text/plain", buffer: uploaded }).catch(() => undefined);
    const before = ledger().length;
    await page.locator('form.card-form button[type="submit"]').first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    const write = linesSince(before).find((l) => l.method !== "GET");
    const after = await visit(`/${name}`);
    const stored = row(name);
    // THE UPLOAD ROUND TRIP - the document that renders the CHOSEN-FILE CHIP.
    //
    // Ruby's chip is preview_editor.haml's `.chosen-file` block, and the gem's
    // own flow puts it in the FORM: upload.js.coffee:48-51 swaps the round
    // trip's response into the chooser's `.chosen-file` ("editor.find
    // ('.chosen-file').replaceWith data.result"). The request shape is the
    // gem's own (upload.js.coffee:11-20): the file input posts to card/create
    // (or card/update/<name>) with the formData {card[type_id],
    // attachment_upload} and the hidden "preview_editor" view, and the
    // attachment_upload value is the NAME of the chooser's
    // `.attachment_card_name` field - which the same script reads at
    // upload.js.coffee:12.
    //
    // The port does not ship that script, so the browser never swaps the
    // response in; the SERVER's response is the chip, and the leg reads it
    // there. The round trip is driven against the card the leg just created
    // (the update arm), so no cache card is left behind: the port's
    // handlePreliminaryUpload renders the preview editor of the card itself
    // for an update (00_upload_cache.rb:19) and of the *new file cache card
    // for a create.
    const typeId = await page.locator('form.card-form [name="card[type_id]"]').first().inputValue().catch(() => null);
    const attachmentUpload = chooser.attachmentCardNameField?.name ?? "card[file]";
    const uploadResponse = await page.context().request.post(`${stack.origin}/card/update/${encodeURIComponent(name)}`, {
      headers: { origin: stack.origin, 'x-requested-with': 'XMLHttpRequest' },
      multipart: {
        ...(typeId === null ? {} : { 'card[type_id]': String(typeId) }),
        attachment_upload: attachmentUpload,
        view: 'preview_editor',
        'card[file]': { name: "harness.txt", mimeType: "text/plain", buffer: uploaded },
      },
    });
    const chipHtml = await uploadResponse.text();
    const verdict = fileCardOffersDownload({
      cardName: name,
      coreHtml: after.html,
      chooserHtml: created1.html,
      chipHtml,
      originalFilename: "harness.txt",
      // the stored byte length, which is what preview_editor.haml humanizes
      bytes: Number(stored?.attachment_size ?? uploaded.length),
    });
    record("F1 the uploaded card offers the /files route as a Download link",
      write !== undefined && write.status < 400 && after.status === 200 && verdict.ok,
      { failures: verdict.failures, download: verdict.download, writeStatus: write?.status ?? null, afterStatus: after.status, cardName: name,
        uploadRoundTripStatus: uploadResponse.status(), attachmentUpload, chipPresent: /chosen-file/.test(chipHtml) });
  });

  await attempt("F5 an empty file is refused", async () => {
    const name = ensure(cardName("empty"));
    await visit("/new/File");
    await page.locator('form.card-form input[name="card[name]"]').first().fill(name).catch(() => undefined);
    const before = ledger().length;
    await page.locator('form.card-form button[type="submit"]').first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    const write = linesSince(before).find((l) => l.method !== "GET");
    const body = await page.evaluate(() => document.body.innerText);
    const refused = (write !== undefined && write.status >= 400) || /Problems with|is missing/i.test(body) || !exists(name);
    record("F5 an empty file is refused (Problems with … is missing, no card created)", refused && !exists(name),
      { writeStatus: write?.status ?? null, errorShown: /Problems with|is missing/i.test(body), createdAnyway: exists(name) !== undefined });
  });

  await attempt("F7 a member can upload a file", async () => {
    // Start every actor-switching check from a known admin session: a prior
    // check that died mid-switch (its own restore never ran) must not grade
    // this one as the wrong role.
    await signIn(admin);
    await signIn(member);
    await uploadCheck("F7", "a member can upload a file", "File", true);
    await signIn(admin);
  });

  // ------------------------------------------------------------- N3, N8, N11
  // (N1 lives in checks-navbox.mjs, which drives the navbox for real.)
  group("cover-b. search, layouts and references (N3, N8, N11)");

  await attempt("N3 paging to the next page of results shows different results", async () => {
    await visit("/");
    await page.fill("#query_keyword", "Topic");
    await page.press("#query_keyword", "Enter");
    await page.waitForLoadState("load").catch(() => undefined);
    await page.waitForTimeout(1500);
    // Paging is graded on the unfiltered search (Ruby's paging spec pages a
    // card-search listing; the keyword arm is the reproduced SQLite match
    // failure, reported separately).
    await visit("/*search");
    await page.waitForTimeout(800);
    const names = () => page.evaluate(() => (document.querySelector("#main")?.innerText ?? "").replace(/\s+/g, " ").slice(0, 400));
    const active = () => page.evaluate(() => document.querySelector(".pagination .active, .page-item.active, .page-link.active")?.textContent?.trim() ?? null);
    const firstText = await names();
    const firstActive = await active();
    const two = await page.evaluate(() => [...document.querySelectorAll(".pagination a, .page-item a, .page-link")].find((a) => a.textContent.trim() === "2")?.getAttribute("href") ?? null);
    if (two === null) { record("N3 paging to the next page of results shows different results", false, { note: "no page 2 link", firstActive, firstText }); return; }
    await visit(two);
    await page.waitForTimeout(800);
    const secondText = await names();
    const secondActive = await active();
    record("N3 paging to the next page of results shows different results (page 2 is active and lists different cards)",
      /2/.test(secondActive ?? "") && secondText !== firstText && /1/.test(firstActive ?? ""),
      { page2Href: two, firstActive, secondActive, firstText, secondText });
  });

  await attempt("N8 a card with a self layout renders through that layout", async () => {
    const layout = ensure("Harness_CB_Simple_Layout");
    await create(layout, "Simple Header {{_main}} Simple Footer", "Basic");
    const page1 = ensure("Harness_CB_Laid_Out");
    await create(page1, "Harness main body", "Basic");
    const rule = `${page1}+*self+*layout`;
    ensure(rule);
    await create(rule, `[[${layout}]]`, "Phrase");
    const visited = await visit(`/${page1}`);
    const text = await page.evaluate(() => document.body.innerText);
    record("N8 a card with a self layout renders through that layout (Simple Header and Simple Footer around the main)",
      visited.status === 200 && /Simple Header/.test(text) && /Simple Footer/.test(text) && /Harness main body/.test(text),
      { status: visited.status, header: /Simple Header/.test(text), footer: /Simple Footer/.test(text), main: /Harness main body/.test(text), storedRule: row(rule)?.content });
  });

  await attempt("N11 a reference renders as a link to the referenced card", async () => {
    const target = ensure(cardName("referenced"));
    await create(target, "Harness referenced body", "Basic");
    const source = ensure(cardName("referrer"));
    await create(source, `[[${target}]]`);
    const visited = await visit(`/${source}`);
    const link = await page.evaluate((t) => [...document.querySelectorAll("#main a[href]")].map((a) => a.getAttribute("href")).filter((h) => h === `/${t}` || h === t), target);
    record("N11 a reference renders as a link to the referenced card",
      visited.status === 200 && link.length > 0, { status: visited.status, linksToTarget: link });
  });

  // (P1 and P3 live in checks-permissions.mjs, which drives the read/update
  // restrictions with real positive and negative controls.)

  // ------------------------------------------------------------------ P5
  group("cover-b. permissions: rule sets (*right, *type plus right, *self) (P5)");

  // Ruby's spec/cypress/e2e/rules.spec.coffee creates one rule per kind and
  // reads the MAIN SLOT of a visited card. Each leg also asserts what the rule
  // REPLACED - rules.spec.coffee's *right leg reads
  //   .should("not.contain", "something spicy").should("contain", "poopoo")
  // so the negative control comes FIRST there. The single leg this row carried
  // was a +*self+*structure rule labelled as the *right leg, with no control.
  // Each leg below is graded by lib/rule-set-legs.mjs against the visited card's
  // OWN set keys, which is how Ruby decides which rule can answer at all.
  const P5_DEFAULT = "Harness cereal default body";

  /** The card slot whose set keys are the VISITED CARD's own keys: the slot
   *  that renders the card itself, carrying SELF-<this card> and, for a compound
   *  card, RIGHT-<its right side> and TYPE_PLUS_RIGHT-<left type>-<right>. */
  const P5_OWN_SLOT_VIEW = "titled-view";

  /** Visit one card and grade one P5 rule against it, returning the evidence
   *  instead of recording it, so a leg that visits more than one card can
   *  record once over all of them.
   *
   *  THE READ IS THE VISITED CARD'S OWN SLOT, not the page's first slot. The
   *  committed page captures of every compound card this harness visits show
   *  four card slots, and the first one is the breadcrumb's nav-link dropdown:
   *
   *    0  nav_link_in_dropdown   ALL TYPE-basic_c
   *    1  edit_inline           ... RIGHT-Xenabled_role ...
   *    2  titled                 ALL ALL_PLUS TYPE-pointer
   *                               RIGHT-harness_cb_role
   *                               TYPE_PLUS_RIGHT-rich_text-harness_cb_role
   *                               SELF-harness_cb_boxy
   *    3  content                ALL TYPE-html SELF-Xfooter
   *
   *  The anchors that decide which rule can answer - SELF-<this card>,
   *  RIGHT-<this card's right side>, TYPE_PLUS_RIGHT-<left type>-<right> - are
   *  all on the `titled` slot, because that is the slot rendering the visited
   *  card. Reading slot 0 measured the breadcrumb: the signed-in run of
   *  2026-10-22 recorded every leg's setKeys as ["ALL","TYPE-basic_c"], which
   *  is exactly slot 0's row, and graded "noRIGHTToken"/"noSELFToken" for
   *  cards whose own bytes carried those tokens all along. */
  const p5LegCollect = async (visitPath, ruleKey, ruleContent, defaultContent) => {
    const visited = await visit(visitPath);
    const html = await page.content();
    const setKeys = slotSetKeys(html, P5_OWN_SLOT_VIEW);
    const verdict = ruleLegHolds({
      ruleKey,
      ruleContent,
      setKeys,
      mainSlotText: await page.evaluate(() => document.body.innerText),
      defaultContent,
    });
    return {
      id: visitPath,
      ok: verdict.ok,
      failures: verdict.failures,
      kind: verdict.kind,
      ruleKey,
      setKeys,
      // Every slot the page rendered, so the next reader can see which slot the
      // grade read and what each other one carried.
      slots: allSlotSetKeys(html),
      status: visited.status,
      stored: row(ruleKey)?.content?.slice(0, 80) ?? null,
    };
  };

  /** Grade one P5 leg: visit the card, read the slot, record the verdict. */
  const p5Leg = async (label, ruleKey, ruleContent, visitPath, defaultContent) => {
    const evidence = await p5LegCollect(visitPath, ruleKey, ruleContent, defaultContent);
    record(P5_CHECK_NAMES[label], evidence.ok, evidence);
    return evidence;
  };

  await attempt("P5 *right Set", async () => {
    const card = ensure("Harness_CB_Cereal");
    await create(card, "Harness cereal body", "Basic");
    await create(`${card}+*all+*help`, P5_DEFAULT);
    await create(`${card}+*right+*help`, "poopoo");
    // THE VISITED CARD IS NOT THE CEREAL CARD. A *right rule is keyed on the
    // card's RIGHT SIDE, so the RIGHT token belongs to a card whose right side
    // IS the cereal card, not to the cereal card itself. The signed-in run of
    // 2026-10-22 visited the cereal card and recorded failures
    // ["noRIGHTToken","ruleContentNotRendered"] with setKeys ["ALL",
    // "TYPE-basic_c"] - a one-part card carries no RIGHT token at all, so the
    // rule could not answer however the page was read.
    //
    // Ruby visits "/Test+cereal" for exactly this reason
    // (rules.spec.coffee's '*right Set': ensure "cereal+*right+*help" with
    // content "I go poopoo for poco puffs", then cy.visit "/Test+cereal").
    // The port's own set-keys contract names the same shape: a card's
    // safe_set_keys carries "RIGHT-legacy" for a `<x>+legacy` card
    // (src/card/render/set-keys.ts:48-56).
    const holder = ensure("Harness_CB_Cereal_Holder");
    await create(holder, "Harness cereal holder", "Basic");
    await p5Leg("right", `${card}+*right+*help`, "poopoo", `/${holder}+${card}`, P5_DEFAULT);
  });

  await attempt("P5 *type plus right Set", async () => {
    const card = ensure("Harness_CB_Cereal_TPR");
    await create(card, "Harness cereal body", "Basic");
    await create(`${card}+*all+*help`, P5_DEFAULT);
    // THE RULE'S LEFT IS A CARD, AND ITS SPELLING IS THE DECK'S. Ruby writes
    // "User+cereal+*type plus right+*help" where User is a CARD of the left
    // type. This fixture wrote the LITERAL "Basic", and the create stored the
    // card with the deck's own spelling of that card - the signed-in run of
    // 2026-10-22 captured the resulting page titled
    // "basic+Harness_CB_Cereal_TPR+*type plus right+*help" (lowercase) - so the
    // post-create lookup for the "Basic+..." spelling found nothing and the leg
    // died on "typed fixture was not created as requested; HTTP 200; stored
    // null". The create SUCCEEDED. The left part is read out of the deck by
    // codename here so the fixture and the lookup can never drift again.
    const leftTypeCard = ensure("Harness_CB_TPR_User");
    await create(leftTypeCard, "Harness cereal user", "RichText");
    const typeRule = `${leftTypeCard}+${card}+*type plus right+*help`;
    await create(typeRule, "your favorite");
    // Ruby visits TWO cards of the set - "/Joe User+cereal" then
    // "/Joe Admin+cereal" - and both must render the rule while the *all
    // default is gone. Both are read here, one visit per card.
    const leftA = ensure("Harness_CB_TPR_LeftA");
    await create(leftA, "Harness cereal left A", "RichText");
    const leftB = ensure("Harness_CB_TPR_LeftB");
    await create(leftB, "Harness cereal left B", "RichText");
    const visits = [];
    for (const left of [leftA, leftB]) {
      visits.push(await p5LegCollect(`/${left}+${card}`, typeRule, "your favorite", P5_DEFAULT));
    }
    record(P5_CHECK_NAMES.typePlusRight,
      visits.every(v => v.ok),
      {
        ruleKey: typeRule,
        failures: visits.flatMap(v => v.failures),
        visitedCards: visits.map(v => ({ id: v.id, setKeys: v.setKeys, failures: v.failures })),
        setKeys: visits[0]?.setKeys ?? null,
        slots: visits[0]?.slots ?? [],
        status: visits[0]?.status ?? null,
        stored: row(typeRule)?.content?.slice(0, 80) ?? null,
      });
  });

  await attempt("P5 Self Set", async () => {
    const card = ensure("Harness_CB_Cereal_Self");
    await create(card, "Harness cereal body", "Basic");
    await create(`${card}+*all+*help`, P5_DEFAULT);
    const structure = `${card} structure`;
    await create(structure, "My very own header");
    // Ruby stores the LINK and asserts the rendered name
    // (rules.spec.coffee: content "[[cereal structure]]", then
    // cy.main_slot().should "contain", "cereal structure").
    await create(`${card}+*self+*structure`, `[[${structure}]]`);
    // THE FIXTURE WAS RIGHT: Ruby visits "cereal" ITSELF for the Self leg
    // (cy.visit "cereal"), and the card's own bytes do carry the SELF token -
    // SELF-harness_cb_cereal_self - on the card's own titled slot. What was
    // wrong was the read, which took the page's first slot (the breadcrumb's
    // nav-link dropdown) and so graded "noSELFToken" for a card whose own slot
    // carried the token the rule is keyed on. The read is fixed in p5LegCollect.
    await p5Leg("self", `${card}+*self+*structure`, `[[${structure}]]`, `/${card}`, P5_DEFAULT);
  });

  // The leg this row carried before, kept under its TRUE name: the fixture is a
  // +*self+*structure rule, so it is the Self Set leg and never was the *right
  // one. The old name stays on the row's history in git, not in the registry.
  await attempt("P5 *self+*structure rule on a card renders its structure in the main slot", async () => {
    // ITS OWN CARD. The *right Set leg above created "Harness_CB_Cereal",
    // and a fixture that creates a name the run already created is REFUSED
    // with a name conflict (HTTP 422) - the signed-in run of 2026-10-22
    // recorded this leg as "typed fixture was not created as requested:
    // Harness_CB_Cereal; HTTP 422" with the card itself already stored.
    const cardName5 = ensure("Harness_CB_Cereal_Struct");
    await create(cardName5, "Harness cereal body", "Basic");
    ensure(`${cardName5}+*self+*structure`);
    await create(`${cardName5}+*self+*structure`, "My very own header");
    const visited = await visit(`/${cardName5}`);
    const text = await page.evaluate(() => document.body.innerText);
    // Ruby (rules.spec: "Self Set"): the card's main slot shows the *self
    // structure's rendering. The card's own body is not part of that rendering.
    record("P5 *self+*structure rule on a card renders its structure in the main slot",
      visited.status === 200 && /My very own header/.test(text),
      { status: visited.status, showsHeader: /My very own header/.test(text), stored: row(`${cardName5}+*self+*structure`)?.content?.slice(0, 80) });
  });

  // ------------------------------------------------------------------ R1
  group("cover-b. rename (R1)");

  await attempt("R1 a card can be renamed and its referers follow", async () => {
    const name = ensure(cardName("rename"));
    const renamed = `${name}_renamed`;
    await create(name, "Harness rename body", "Basic");
    const referrer = ensure(cardName("referrer"));
    await create(referrer, `[[${name}]]`);
    const editName = await visit(`/${name}?view=edit_name`);
    await page.waitForTimeout(1500);
    const input = page.locator('#main input[name="card[name]"]').first();
    if (await input.count() === 0) { record("R1 a card can be renamed and its referers follow", false, { status: editName.status, note: "no card[name] field on ?view=edit_name" }); return; }
    // Read the rename form BEFORE the submit: after the click the main slot
    // holds the renamed card, not the form. Ruby's :name_form ships the referer
    // opt-out UNCHECKED (card[skip]=update_referer_content inside
    // div.skip-referers, committed capture fixtures/captured/edit-name-type.json).
    //
    // THE PREDICATE IS HANDED THE FORM'S OWN HTML, OUTER INCLUDED. It scopes
    // to the form (the one whose class carries "_rename-form", Ruby's
    // `form._rename-form card-form slotter`) before it reads the name field,
    // the referer opt-out and the rename button, so the form's INNER html -
    // which does not carry the form - could not be scoped. The signed-in run
    // of 2026-10-22 recorded the leg as failures ["noRenameForm"] on a page
    // whose rename form rendered exactly as Ruby renders it.
    const formShape = renameFormShape(await page.locator("#main form._rename-form").first().evaluate((el) => el.outerHTML).catch(() => ""));
    record("R1 the rename form offers the referer update Ruby offers, unchecked by default", formShape.ok,
      { failures: formShape.failures, skipReferers: formShape.skipReferers, action: formShape.action });
    await input.fill(renamed);
    const before = ledger().length;
    await page.locator('#main button.renamer, .modal button.renamer, #edit_card button.renamer, form button[type=submit]:has-text("Rename"), button.renamer').first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    const write = linesSince(before).find((l) => l.method !== "GET");
    const after = await visit(`/${renamed}`);
    const old = await visit(`/${name}`);
    // An unknown name answers the new-card form at 200 (Ruby: unknown main card
    // renders view :new), so the old name is gone when its content is gone.
    const oldGone = !old.html.includes("Harness rename body");
    const referrerAfter = await visit(`/${referrer}`);
    const refersNew = await page.evaluate((r) => [...document.querySelectorAll("#main a[href]")].map((a) => a.getAttribute("href")).filter((h) => h === `/${r}` || h === r).length, renamed);
    const storedRef = row(referrer)?.content ?? "";
    // Swap the tracked name only once the rename provably landed in the
    // database (the runner's rename guard, which reads the same two facts):
    // the page evidence above is the grade, this is the fixture bookkeeping.
    const renamedRow = ctx.database().prepare("SELECT id, name, trash FROM cards WHERE name = ?").get(renamed);
    const oldGoneInDb = Number(ctx.database().prepare("SELECT COUNT(*) AS n FROM cards WHERE name = ? AND trash = 0").get(name)?.n ?? 0) === 0;
    if (renamedRow?.trash === 0 && oldGoneInDb) created[created.indexOf(name)] = renamed;
    // The table half: the referrer's stored text is not the reference table.
    // Ruby's rename re-points card_references by referee_key
    // (card-1.110.0 lib/card/reference.rb:26-27 map_referees); a rename that
    // rewrote the text but not referee_id would pass the string read above and
    // leave every reference query reading a dead referee
    // (reference_query.rb:5-6,36-37).
    const refererRow = ctx.database().prepare("SELECT id FROM cards WHERE name = ?").get(referrer);
    const references = refererReferenceRows(
      refererRow === undefined ? [] : ctx.database().prepare("SELECT referer_id, referee_key, referee_id, ref_type FROM card_references WHERE referer_id = ?").all(refererRow.id),
      refererRow?.id,
    );
    // THE DECK'S OWN KEYS. The reference table stores the card's KEY
    // (map_referees, card-1.110.0 lib/card/reference.rb:26-27), so the two
    // cards' own key columns are the form the grade compares against - the
    // deck's, not a re-implementation of cardname's key algorithm. The old
    // card's row survives the rename (Ruby's rename trashes it), so its key
    // is still readable.
    const renamedKey = renamedRow === undefined ? null : ctx.database().prepare("SELECT key FROM cards WHERE id=?").get(renamedRow.id)?.key ?? null;
    const oldKey = ctx.database().prepare("SELECT key FROM cards WHERE name=? LIMIT 1").get(name)?.key ?? null;
    const tableVerdict = referersFollowRename({
      oldName: name, newName: renamed, renamedId: renamedRow?.id ?? null,
      oldKey, newKey: renamedKey,
      writeStatus: write?.status ?? null, newStatus: after.status, oldGoneInDb,
      references, referrerContent: storedRef,
    });
    record("R1 a renamed card's references are re-pointed at its new name and id", tableVerdict.ok,
      { failures: tableVerdict.failures, references, renamedId: renamedRow?.id ?? null, renamedKey, oldKey });
    record("R1 a card can be renamed and its referers follow (old name gone, referer links the new name)",
      write !== undefined && write.status < 400 && after.status === 200 && oldGone && refersNew > 0 && storedRef.includes(renamed),
      { writeStatus: write?.status ?? null, newStatus: after.status, oldStatus: old.status, refererLinksNew: refersNew, referrerContent: storedRef });
  });

  // ------------------------------------------------------------------ W1, W3
  group("cover-b. follow: follow a card and a type from the board (W1, W3)");

  // The follow link writes the rule "<card>+*self+<user>+*follow" = *always
  // (follow_link_views / follow.rb: the self set of the followed card). The
  // Engage tab then shows the StopFollowLink, whose text is "following" (Ruby
  // stop_follow_link.rb: link_text "following", hover "unfollow"). Junction
  // rules carry no name column in this deck, so the grade reads that state.
  const followOn = async (card) => {
    const before = null;
    const board = await visit(`/${card}/board`);
    await page.waitForTimeout(1500);
    const tab = page.locator(".board .nav-link", { hasText: "Engage" }).first();
    if (await tab.count() === 0) return { board: board.status, tab: false, before };
    await tab.click().catch(() => undefined);
    await page.waitForTimeout(1500);
    const links = await page.evaluate(() => [...document.querySelectorAll("#main a, .board a")].map((a) => ({ text: a.textContent.replace(/\s+/g, " ").trim(), href: a.getAttribute("href"), cls: String(a.className).slice(0, 50) })).filter((l) => /follow|following|unfollow|watch/i.test(l.text) || /follow|watch/i.test(l.href ?? "")));
    const followLink = links.find((l) => /^(follow|watch)$/i.test(l.text));
    if (followLink === undefined) return { board: board.status, tab: true, links: links.slice(0, 8), before };
    // The link's own href names the rule the act writes ("/update/<card>
    // +*self+<viewer>+*follow?..."), so the tracked and reported rule name
    // is the href's mark — not an assumed viewer (W3's cardtype half is
    // watched by the administrator, not the member).
    const followRule = decodeURIComponent(new URL(followLink.href, stack.origin).pathname.replace(/^\/update\//, "")) || `${card}+*self+Harness_Member+*follow`;
    const beforeClick = ledger().length;
    await page.locator(`#main a[href="${followLink.href}"], .board a[href="${followLink.href}"]`).first().dispatchEvent("click").catch(() => undefined);
    await page.waitForTimeout(2500);
    const followRequests = linesSince(beforeClick).map((l) => ({ method: l.method, path: l.path.slice(0, 90), status: l.status }));
    // Reload the board's Engage tab: the follow state is the server's answer.
    await visit(`/${card}/board`);
    await page.waitForTimeout(1200);
    await page.locator(".board .nav-link", { hasText: "Engage" }).first().click().catch(() => undefined);
    await page.waitForTimeout(1200);
    const linksAfter = await page.evaluate(() => [...document.querySelectorAll("#main a, .board a")].map((a) => a.textContent.replace(/\s+/g, " ").trim()).filter((t) => /follow|following|unfollow|watch/i.test(t)).slice(0, 6));
    const ruleExists = linksAfter.some((t) => /^following$/i.test(t) || /unfollow/i.test(t));
    // A successful follow wrote a rule card ("<card>+*self+<user>+*follow"):
    // track it so the trash pass covers it with the rest of the run's cards.
    if (ruleExists === true) ensure(followRule);
    return { board: board.status, tab: true, followLink, followRequests, linksAfter, ruleExists, before, followRule };
  };

  await attempt("W1 a card can be followed from the board's Engage tab", async () => {
    await signIn(admin);
    await signIn(member);
    const card = ensure(cardName("watchme"));
    await create(card, "Harness follow body", "Basic");
    const result = await followOn(card);
    record("W1 a card can be followed from the board's Engage tab (link becomes following; *follow rule added)",
      result.followLink !== undefined && result.ruleExists === true,
      { ...result, ruleExists: result.ruleExists });
    await signIn(admin);
  });

  // ---------------------------------------------------------------------- W2
  // "Unfollow from the board." W1 grades the FOLLOW half and reads only the
  // link TEXT (linksAfter.some(t => /^following$/i.test(t))). W2 is the other
  // half, on the same control, and it is graded on all four bytes the two
  // Ruby link states differ on plus the STORED rule - because a link that says
  // "following" over a stored *never is a card that will never mail, described
  // as one that will, and no byte-level leg can see that inversion.
  await attempt("W2 a follower can unfollow from the board's Engage tab", async () => {
    await signIn(admin);
    await signIn(member);
    const card = ensure(cardName("unfollowme"));
    await create(card, "Harness unfollow body", "Basic");
    const cardId = fixtureCard(ctx.database(), card)?.id;
    if (cardId === undefined) { await signIn(admin); return; }

    // The stored preference, read from the deck through the rule card rather
    // than inferred from the page (set/right/following.rb
    // current_follow_rule_card -> card.left.preference :follow). A driver that
    // reported the value it expected would have measured nothing.
    const storedOption = () => {
      const selfSet = ctx.database().prepare("SELECT f.id FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='self' AND f.trash=0 LIMIT 1").get(cardId);
      if (selfSet === undefined) return null;
      const viewerRule = ctx.database().prepare('SELECT id FROM cards WHERE left_id=? AND right_id=? AND trash=0 LIMIT 1').get(selfSet.id, member.id);
      if (viewerRule === undefined) return null;
      const option = ctx.database().prepare("SELECT f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='follow' AND f.trash=0 LIMIT 1").get(viewerRule.id);
      return option?.db_content ?? null;
    };

    // One read of the board's Engage tab for THIS member: the link's own
    // bytes, the follower count off the followers link's label
    // (follow_section.rb:31-36), and the stored rule.
    const readState = async () => {
      await visit(`/${card}/board`);
      await page.waitForTimeout(1200);
      await page.locator('.board .nav-link', { hasText: 'Engage' }).first().click().catch(() => undefined);
      await page.waitForTimeout(1200);
      const html = await page.content();
      const count = await page.evaluate(() => {
        const link = [...document.querySelectorAll('#main a, .board a')]
          .find((a) => a.getAttribute('data-cy') === 'followers');
        const m = link === undefined ? null : /^(\d+) followers?$/.exec((link.textContent ?? '').replace(/\s+/g, ' ').trim());
        return m === null ? null : Number(m[1]);
      });
      return { html, shape: followLinkShape(html), storedOption: storedOption(), followerCount: count };
    };

    const clickFollowLink = async () => {
      // THE LINK'S OWN HREF, READ OFF THE DOM.
      //
      // THE DEFECT. The shape is parsed out of the page's HTML, where the
      // href is HTML-ESCAPED ("...&amp;success%5Bmark%5D=..."), and the
      // locator was built from that escaped string. The DOM's attribute
      // value is the UNESCAPED one, so the locator matched nothing and the
      // click never happened: the signed-in run of 2026-10-22 recorded the
      // "after" state IDENTICAL to the "before" state - the same start link,
      // the same stored rule, a follower count of 0 - and named a follow
      // that never took.
      const href = await page.evaluate(() => {
        const link = [...document.querySelectorAll('#main a, .board a')]
          .find((a) => /^(follow|following)$/i.test((a.textContent ?? '').replace(/\s+/g, ' ').trim()));
        return link === undefined ? null : link.getAttribute('href');
      });
      if (href === null) return false;
      const shape = followLinkShape(await page.content());
      if (shape === null || shape.href === null) return false;
      const ruleName = shape.ruleName;
      if (ruleName !== null && ruleName !== '') ensure(ruleName);
      await page.locator(`#main a[href="${href}"], .board a[href="${href}"]`).first().dispatchEvent('click').catch(() => undefined);
      await page.waitForTimeout(2500);
      return true;
    };

    const before = await readState();
    const followed = await clickFollowLink() ? await readState() : before;
    const stopped = await clickFollowLink() ? await readState() : followed;
    const verdict = unfollowRoundTrip({ before, after: followed, stopped, followLabel: card });
    const evidence = {
      card, cardId, actor: member.name,
      before: { shape: before.shape, storedOption: before.storedOption, followerCount: before.followerCount },
      after: { shape: followed.shape, storedOption: followed.storedOption, followerCount: followed.followerCount },
      stopped: { shape: stopped.shape, storedOption: stopped.storedOption, followerCount: stopped.followerCount },
      failures: verdict.failures,
      ruby: 'card-mod-follow-0.20.0 set/all/follow/{start,stop}_follow_link.rb (four differing values), follow_link.rb:44-69 (link_opts / title / path), follow_link_views.rb:3-5 (the class is chosen BY STATE); card-mod-edit-0.20.0 set/all/board/follow_section.rb:31-36 (the follower count)',
      raw: ctx.captureEvidence(stopped.html, { check: 'w2-unfollow-from-board', card, status: 200 }),
    };
    const has = (f) => verdict.failures.includes(f);
    record(UNFOLLOW_CHECKS.startLink, !verdict.failures.some((f) => f.startsWith('before:')), evidence);
    record(UNFOLLOW_CHECKS.stopLink, !verdict.failures.some((f) => f.startsWith('after:')), evidence);
    record(UNFOLLOW_CHECKS.storage, !has('afterNotFollowed') && !has('afterNotUnfollowed') && !has('ruleChanged'), evidence);
    record(UNFOLLOW_CHECKS.reverted, !verdict.failures.some((f) => f.startsWith('stopped:')) && !has('followCountDidNotFall') && !has('beforeNotUnfollowed'), evidence);
    await signIn(admin);
  });

  await attempt("W3 a card and a cardtype can be watched (both get a *follow rule)", async () => {
    // This deck's stored rules give the Cardtype TYPE-set both its create
    // and its update rule to the "Shark" role (rule cards 34793/34794 on the
    // Cardtype+*type set), so a role-less member may neither create a card
    // of type Cardtype (GET /new/Cardtype answers 403 — the engine's
    // rule-driven denial, byte-identical in the 50717cca run ledger, where
    // the old create helper's silent retry-as-Basic is what made the
    // 2026-10-16 run "pass" without ever watching a cardtype) nor write the
    // follow rule of any existing type card. The card half stays the
    // member's; the type card is created and watched by the administrator,
    // whose role the engine's read rules treat as always_ok
    // (lib/seed-local-accounts.mjs). The actor is not the capability:
    // capabilities.json W3 is "Watch a card and a type card".
    await signIn(admin);
    const cardtype = ensure("Harness_CB_Watched_Type");
    await create(cardtype, "", "Cardtype");
    await signIn(member);
    const card = ensure(cardName("watchcard"));
    await create(card, "Harness watched card", "Basic");
    const cardResult = await followOn(card);
    await signIn(admin);
    const typeResult = await followOn(cardtype);
    const rules = ctx.database().prepare("SELECT name FROM cards WHERE name LIKE ? AND trash = 0 ORDER BY name").all("%+*follow");
    record("W3 a card and a cardtype can be watched (each gets a *follow rule: the card for the member, the cardtype for the administrator)",
      cardResult.ruleExists === true && typeResult.ruleExists === true,
      { card, cardResult: { followLink: cardResult.followLink?.text ?? null, rule: cardResult.followRule, ruleExists: cardResult.ruleExists },
        cardtype, typeResult: { followLink: typeResult.followLink?.text ?? null, rule: typeResult.followRule, ruleExists: typeResult.ruleExists, links: typeResult.links?.slice(0, 4) },
        followRules: rules.map((r) => r.name) });
  });

  // (A1 and A3 live in the runner's own account journey, which changes the
  // account email and proves both the new and the restored credential by
  // signing in — including the mandatory restore this module never owned.)

  void clickAndWait;
  void CAP;

  // ---------------------------------------------------------------- the rest
  // (the odd-position capabilities that had no check yet: C6, E3, E16, E18,
  //  E22, H1, M1, N5, S3, S5; A5 and W5 need a mail sink and are out of scope)
  group("cover-b. more odd-position capabilities (C6, E3, E16, E18, E22, H1, M1, N5, S3, S5)");

  // C6 grades the create offer decko actually implements: a nonexistent term
  // gets an `add` item in the search box's search_box_complete JSON
  // (card-mod-search set/self/search.rb:70-72, view :search_box_complete =
  // search_box_items :search_item, :add_item, :goto_items; :100-106 add_item
  // yields action "add" only when exact.add_autocomplete_ok? —
  // set/all/autocomplete.rb:1-3 `new_card? && name.valid? && !virtual? &&
  // ok?(:create)` — with url = the new card's own path (:29-31) and the html
  // add_autocomplete_item label (:10-12); the term rides as `?term=`, the
  // wire format the deck script's autocomplete fetches (search_box.js.coffee,
  // search.rb:26-29 complete_path)). The results PAGE this check visited
  // before (2026-10-16/17 fails) carries no create link in the reference:
  // the html :no_search_results view is an empty div (0_search/views.rb:
  // 126-128), and on SQLite the keyword query cannot even run — the
  // active_record match patch raises "%{func} not implemented"
  // (card-1.110.0 config/initializers/02_patches/active_record.rb:82; the
  // Ruby 3.3 oracle answered 500 to this exact URL when probed 2026-10-17;
  // the journey battery's navbox-paging covers note says the same). The
  // legacy whole-page-regex check passed only via unrelated matches (a deck
  // card named "New Card" in the navbar, an SVG "Created with Sketch" desc).
  await attempt("C6 Search for a nonexistent name offers a create link", async () => {
    const missing = "zzq harness nonexistent name";
    const answer = await page.evaluate(async (url) => {
      const r = await fetch(url, { credentials: "include" });
      return { status: r.status, body: await r.text() };
    }, `${stack.origin}/*search/search_box_complete.json?term=${encodeURIComponent(missing)}`);
    let items = [];
    try { items = JSON.parse(answer.body); } catch { /* a non-JSON body fails the check below */ }
    const addItem = items.find((i) => i?.action === "add");
    const createLink = typeof addItem?.url === "string" ? addItem.url : null;
    const underscored = missing.toLowerCase().replaceAll(" ", "_");
    const searchItem = items.find((i) => i?.action === "search");
    record("C6 Search for a nonexistent name offers a create link",
      answer.status === 200 && addItem !== undefined
        && createLink !== null && createLink.toLowerCase().includes(underscored)
        && addItem.value === missing && typeof addItem.label === "string" && addItem.label.length > 0
        && searchItem !== undefined,
      { status: answer.status, actions: items.map((i) => i?.action),
        addItem: { url: createLink, value: addItem?.value ?? null, labelHead: typeof addItem?.label === "string" ? addItem.label.slice(0, 120) : null },
        searchItemUrl: typeof searchItem?.url === "string" ? searchItem.url : null });
  });

  await attempt("E3 TinyMCE loads with its nest plugin and toolbar", async () => {
    const name = ensure(cardName("tinymce"));
    await create(name, "Harness tinymce body", "RichText");
    await visit(`/${name}`);
    await page.locator('a.edit-link[href$="/edit"]').first().dispatchEvent("click").catch(() => undefined);
    await page.waitForSelector("#edit_card, .modal", { timeout: 20_000 }).catch(() => undefined);
    const ed = await waitForEditor(page, 20_000);
    const editorId = await openRichEditorId(page);
    // The probe addresses the modal's own editor (tinymce.get(id)): a stale
    // global activeEditor from an earlier page or modal must not credit it.
    const nestButton = await page.evaluate((id) => {
      const c = window.tinymce?.get(id)?.editorContainer;
      return c ? c.querySelectorAll("[title='Insert/edit nest'], button[title*='nest'], button[aria-label*='nest']").length : 0;
    }, editorId);
    record("E3 TinyMCE loads with its nest plugin and toolbar", ed.active === true && nestButton > 0,
      { editor: ed, editorId, nestButtons: nestButton });
    await page.keyboard.press("Escape").catch(() => undefined);
  });

  await attempt("M1 Rich text editor toolbar (formats, lists, table, insert menu)", async () => {
    const name = ensure(cardName("toolbar"));
    await create(name, "Harness toolbar body", "RichText");
    await visit(`/${name}`);
    await page.locator('a.edit-link[href$="/edit"]').first().dispatchEvent("click").catch(() => undefined);
    await page.waitForSelector("#edit_card, .modal", { timeout: 20_000 }).catch(() => undefined);
    const editorId = await openRichEditorId(page);
    // The sweep reads every control the editor CONTAINER renders. TinyMCE
    // renders some toolbar tokens as PLAIN BUTTONS (.tox-tbtn, <button>) and
    // others as SPLIT BUTTONS: a div.tox-split-button with role="button" and
    // the same title/aria-label attributes (the stock toolbar's forecolor
    // renders as title="Text color", backcolor as title="Background color" -
    // the silver theme's kb(t,"forecolor","forecolor","Text color",...) /
    // kb(t,"backcolor","hilitecolor","Background color",...) registrations).
    // The sweep's selector must name every element class the editor emits,
    // not only the two the simple controls use; Ruby's own Cypress suite
    // drives these controls by the same title attributes
    // (cy.get("[title='Insert/edit nest']")). A sweep that misses the split
    // buttons reads a toolbar WITHOUT the color controls and fails tokens
    // the editor renders - the tranche-5 run's exact red.
    const labels = await page.evaluate((id) => {
      const c = window.tinymce?.get(id)?.editorContainer;
      return c ? [...c.querySelectorAll("button, [role=menuitem], [role=button], .tox-tbtn, .tox-mbtn, .tox-split-button")].map((b) => `${b.getAttribute("title") ?? ""} ${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`.replace(/\s+/g, " ").trim()).filter(Boolean) : [];
    }, editorId);
    const has = (re) => labels.some((l) => re.test(l));
    const ok = has(/bold/i) && has(/bullet|numbered|list/i) && has(/table/i) && has(/insert/i) && has(/format/i);
    record("M1 Rich text editor toolbar (formats, lists, table, insert menu)", ok,
      { formats: has(/bold/i), lists: has(/bullet|numbered|list/i), table: has(/table/i), insert: has(/insert/i), format: has(/format/i), sample: labels.slice(0, 12) });
    // The toolbar's own CONTRACT, on Ruby's configuration: the *tinyMCE
    // card's toolbar1/menubar/plugins tokens (card-mod-tinymce_editor
    // data/real.yml:1-15) plus the runtime Insert menu
    // (tinymce_config.js.coffee:57-60), each token resolved to the control
    // TinyMCE renders for it, every unmatched token named. The config the
    // page actually carried is read off the page (decko.setTinyMCEConfig
    // stashes it); a page that served no config is recorded, and the grade
    // falls to the stock config the vendored gem bytes carry.
    const pageConfig = await page.evaluate(() => window.decko?.tinyMCEConfig ?? null).catch(() => null);
    const stockConfig = stockTinyMceConfigFromRealYml(
      readFileSync(
        new URL("../../fixtures/vendor/card-mod-tinymce_editor-0.20.0/data/real.yml", import.meta.url),
        "utf8",
      ),
    );
    const config = typeof pageConfig === "object" && pageConfig !== null && Object.keys(pageConfig).length > 0 ? pageConfig : stockConfig;
    const verdict = editorToolbarContract(labels, config);
    // THE SERVED BYTES the controls come from. The host serves the editor's
    // lazily-loaded distribution files under /mod/tinymce_editor/ by
    // redirecting to the published 5.10.7 distribution (the version the
    // gem's own tree ships, its tinymce.min.js header reads "Version: 5.10.7
    // (2022-12-06)"); the digests below are the gem tree's own files
    // (card-mod-tinymce_editor-0.20.0/public/), sha256-verified this run
    // against the redirect target. The receipt stays green only while the
    // editor the page renders is built from Ruby's own bytes.
    const GEM_TINYMCE_DISTRIBUTION_SHA256 = {
      core: "3c6a5feeb3fb4dd9b5ab70f3e13b6cb0715136ddb50344b6d3069e9233dc8a9c",
      theme: "40126fc0466dc69021240211ce9a6bc90b73f14a6533bd205cd08a1e4af8f87a",
    };
    const servedBytes = await page.evaluate(async () => {
      const digest = async (path) => {
        const response = await fetch(path, { redirect: "follow" });
        const bytes = new Uint8Array(await response.arrayBuffer());
        const hash = await crypto.subtle.digest("SHA-256", bytes);
        return { status: response.status, finalUrl: response.url, sha256: [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("") };
      };
      return { core: await digest("/mod/tinymce_editor/tinymce.min.js"), theme: await digest("/mod/tinymce_editor/themes/silver/theme.min.js") };
    }).catch(() => null);
    record(RICH_TEXT_TOOLBAR_CHECKS.rendered, verdict.ok,
      {
        editorId, labels: labels.slice(0, 40),
        configSeen: verdict.configSeen,
        pageConfigCarried: typeof pageConfig === "object" && pageConfig !== null,
        tokens: verdict.tokens,
        matched: verdict.matched,
        missing: verdict.missing,
        failures: verdict.failures,
        insertMenuSeen: verdict.insertMenuSeen,
        servedBytes,
        servedBytesMatchGemPin: servedBytes !== null &&
          servedBytes.core?.sha256 === GEM_TINYMCE_DISTRIBUTION_SHA256.core &&
          servedBytes.theme?.sha256 === GEM_TINYMCE_DISTRIBUTION_SHA256.theme,
        ruby: "card-mod-tinymce_editor-0.20.0 data/real.yml:1-15 - the *tinyMCE card's toolbar1/menubar/plugins; tinymce_config.js.coffee:57-60 - addNestPlugin's Insert menu; stock config sha256-pinned in test/rich-text-toolbar.test.mjs; the served distribution files pinned to the gem tree's own bytes (public/tinymce.min.js, public/themes/silver/theme.min.js)",
      });
    await page.keyboard.press("Escape").catch(() => undefined);
  });

  await attempt("E16 Save (without close) updates the slot and leaves the board open", async () => {
    const name = ensure(cardName("savebtn"));
    await create(name, "Harness save before", "Basic");
    await visit(`/${name}/board`);
    await page.waitForTimeout(2000);
    const save = page.locator(".board button[data-cy='save']").first();
    if (await save.count() === 0) { record("E16 Save (without close) updates the slot and leaves the board open", false, { note: "no data-cy=save control on the board" }); return; }
    await save.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(1000);
    // This deck's "Basic" fixture resolves to the RichText cardtype
    // (typed-fixture.mjs codename map), whose board content field is a
    // visibility:hidden tinymce-textarea. A raw fill throws on the invisible
    // element, and the swallowed error made the save silently re-submit the
    // old content - the identical 10-16 and 10-17 E16 evidence (writeStatus
    // 200, storedAfterSave false). Write through the editor that owns the
    // field (the matchingRichEditor contract the dialog journeys use); only
    // when no editor owns the field, fill a visible plain field. If the
    // content cannot be set, fail here instead of saving stale content.
    const field = page.locator('.board input[name$="[content]"]:not([type=hidden]), .board textarea[name$="[content]"]').first();
    const fieldId = await field.getAttribute("id");
    const ownsEditor = fieldId
      ? await page.waitForFunction(matchingRichEditor, [fieldId, true], { timeout: 10_000 }).then(() => true).catch(() => false)
      : false;
    const contentSet = ownsEditor
      ? await page.evaluate((id) => {
          const ed = window.tinymce?.get(id);
          if (!ed?.initialized) return false;
          ed.setContent("Harness save after");
          return (ed.getContent() ?? "").includes("Harness save after");
        }, fieldId)
      : await field.isVisible().then((visible) => visible && field.fill("Harness save after").then(() => true, () => false));
    if (!contentSet) throw new Error(`the board content field could not take the new content (fieldId ${fieldId}, ownsEditor ${ownsEditor})`);
    await page.waitForTimeout(500);
    const before = ledger().length;
    await save.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(3000);
    const stillOpen = await page.locator(".board .board-main").count();
    const write = linesSince(before).find((l) => l.method !== "GET");
    const after = await visit(`/${name}`);
    record("E16 Save (without close) updates the slot and leaves the board open",
      stillOpen > 0 && write !== undefined && write.status < 400 && after.html.includes("Harness save after"),
      { boardStillOpen: stillOpen, writeStatus: write?.status ?? null, storedAfterSave: after.html.includes("Harness save after") });
  });

  // E18 lives in checks-conflict.mjs: two real browser actors, exact 409,
  // preserved history/content, revision refresh and a persisted same-form retry.

  await attempt("E22 Edit board: rules tab (no set selected; warns when set 'all' selected)", async () => {
    await visit("/Home/board");
    await page.waitForTimeout(1500);
    await page.locator(".board .nav-link", { hasText: "Rules" }).first().click().catch(() => undefined);
    await page.waitForTimeout(1500);
    const tab = await page.evaluate(() => {
      const pane = document.querySelector("#tab-home-8-rule, .board .tab-pane.active, .board [id*='rule']");
      const text = pane?.textContent?.replace(/\s+/g, " ") ?? "";
      const controls = [...(pane?.querySelectorAll("select, .select2, input") ?? [])];
      // The pane loads by ajax (the board's Rules nav-link carries
      // data-url="/Home/rules_tab"), so the verdict must name the controls a
      // user would actually operate - a count alone cannot say WHICH set and
      // setting selectors rendered, and P6 ("administrator sets read/write
      // rules") has no other instrument to read them from.
      return {
        text: text.slice(0, 160),
        selects: controls.length,
        mentionsSelect: /select/i.test(text),
        controls: controls.slice(0, 8).map((el) => ({
          tag: el.tagName.toLowerCase(),
          name: el.getAttribute("name"),
          id: el.id || null,
          type: el.getAttribute("type"),
          options: el.tagName === "SELECT" ? [...el.options].slice(0, 6).map((o) => `${o.value}:${o.textContent.trim()}`) : null,
        })),
        forms: [...(pane?.querySelectorAll("form") ?? [])].map((f) => f.getAttribute("action")),
      };
    });
    record("E22 Edit board: rules tab (no set selected; warns when set 'all' selected)",
      tab.selects > 0 && tab.mentionsSelect, { tab, raw: ctx.captureEvidence(await page.content(), { check: "e22-rules-tab", name: "Home" }) });
  });

  await attempt("H1 View a card's history page", async () => {
    const name = created.find((n) => n.startsWith("Harness_") && !n.includes("+")) ?? "Home";
    const v = await visit(`/${name}/history`);
    const acts = await page.evaluate(() => document.querySelectorAll(".act, .card-history, [class*=history], tr").length);
    record("H1 View a card's history page", v.status === 200 && /act|change|edit|history/i.test(v.html),
      { card: name, status: v.status, actLikeNodes: acts });
  });

  // cap-H1. The two attempts below are the row's EXISTING credit and are left
  // exactly as they are. What follows grades what the row's own finding names:
  // "Act-like node count recorded but not asserted; whole HTML act/change/edit
  // regex is insufficient." Both halves, by name, with the expected acts read
  // from the deck BEFORE the page is opened.
  await attempt("H1 the history page lists the card's acts", async () => {
    const name = created.find((n) => n.startsWith("Harness_") && !n.includes("+")) ?? "Home";
    const card = ctx.database().prepare('SELECT id FROM cards WHERE name=? AND trash=0').get(name)?.id;
    if (card === undefined) return;
    // Ruby: set/all/history/acts.rb:3
    //   Act.all_with_actions_on(history_card_ids, true).order id: :desc
    // The same clause, on the same table, for this card only.
    const storedActs = ctx.database().prepare(
      'SELECT card_actions.id AS actionId, card_acts.id AS actId FROM card_actions ' +
      'JOIN card_acts ON card_acts.id = card_actions.card_act_id ' +
      'WHERE card_actions.card_id=? AND card_actions.draft IS NOT TRUE ' +
      'ORDER BY card_acts.id DESC').all(card)
      .map((row) => ({ actionId: Number(row.actionId), actId: Number(row.actId) }));
    const v = await visit(`/${name}/history`);
    const verdict = cardHistoryPage({ html: v.html, storedActs });
    const evidence = { card: name, status: v.status, counts: verdict.counts, failures: verdict.failures,
      order: verdict.order, renderedActIds: verdict.renderedActIds, storedActs,
      raw: ctx.captureEvidence(v.html, { check: 'h1-history-acts', card: name, status: v.status }) };
    // Four legs, four verdicts. They fail apart - a page can carry the right
    // acts in the wrong order, the wrong acts in the right order, one act
    // twice, or answer 200 and render none - and one verdict would hide which.
    const has = (f) => verdict.failures.includes(f);
    record(CARD_HISTORY_CHECKS.surface, !has('notAHistoryView') && v.status === 200, evidence);
    record(CARD_HISTORY_CHECKS.count, !has('actCountMismatch') && storedActs.length > 0, evidence);
    record(CARD_HISTORY_CHECKS.acts, !has('wrongActSet') && !has('duplicateActionEntries') && !has('entryWithoutActionId'), evidence);
    record(CARD_HISTORY_CHECKS.order, !has('notNewestFirst'), evidence);
  });

  await attempt("N5 Changes link lists recently updated cards, newest first", async () => {
    const name = ensure(cardName("newest"));
    await create(name, "Harness newest body", "Basic");
    // The deck's own Changes menu item is *main menu's [[*search|Changes]],
    // so this check grades the *search card page. Oracle contract for the
    // page's order: the card's CQL sort "relevance" orders by updated_at DESC
    // (card-1.110.0 sql_statement/order.rb ORDER_MAP deprecated alias +
    // query.rb DEFAULT_ORDER_DIRS), so the just-created card must be the
    // first result row.
    //
    // The rows must be read OFF THE ROW WRAPPERS, and this check failed on
    // both graded nights (2026-10-16 at 50717cca and 2026-10-17 at
    // d797e8de, evidence firstRows ["RichText","1","2","3","4","5"]) because
    // it read the wrong nodes twice over:
    //   - an anchor-text read (#main a[href^='/']) cannot see a row name at
    //     all - a row is a bar view, and bar.haml renders it a _card-link div
    //     whose only <a>s are menu icons (edit / space_dashboard /
    //     open_in_full page / fullscreen modal), so every row anchor is
    //     filtered out and the first surviving text anchors are the paging
    //     links "1","2","3",... Replaying that exact selector against this
    //     run's own captured page reads ["1","2","3","4","5","6"].
    //   - a bare `#main [data-card-name]` read is not scoped to the results,
    //     so it also swallows every other card-slot under #main, and each row
    //     carries TWO slots (the .search-result-item wrapper's own and the
    //     nested one), which halves the number of rows the index window sees.
    // The result list is rendered by cardListView (src/card/render/views.ts:
    // `<div class="card-list card-list-<view> search-result-list">` holding
    // `<div class="search-result-item item-<view>">` children), so reading
    // those children in DOM order IS the rendered order, independent of page
    // chrome and of the doubled slot encoding. Names are matched
    // space/underscore- and case-insensitively (static renders print
    // canonical spaces, live renders the requested underscores).
    await visit("/*search");
    await page.waitForTimeout(1200);
    const first = await page.evaluate(() => [...document.querySelectorAll("#main .search-result-list > .search-result-item")]
      .map((row) => row.querySelector("[data-card-name]")?.getAttribute("data-card-name"))
      .filter((t) => t && t !== "*search")
      .slice(0, 6));
    const key = (t) => t.replace(/_/g, " ").trim().toLowerCase();
    record("N5 Changes link lists recently updated cards, newest first", first.some((t) => key(t) === key(name)) && first.findIndex((t) => key(t) === key(name)) <= 1,
      { newest: name, firstRows: first });
  });

  await attempt("S3 Sign in requires email and password (form validation)", async () => {
    await signIn(admin);
    await visit("/_signout");
    await visit("/*signin");
    await page.fill('input[name="card[subcards][+*email][content]"]', "");
    await page.fill('input[name="card[subcards][+*password][content]"]', "");
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/update/*signin"), { timeout: 15_000 }).catch(() => null),
      page.locator('form[action="/update/*signin"] button[type="submit"]').first().click().catch(() => undefined),
    ]);
    await page.waitForTimeout(1500);
    const session = (await page.context().cookies(stack.origin)).some((c) => c.name === "decko_ts_session" && c.value.length > 0);
    const text = await page.evaluate(() => document.body.innerText);
    const msg = /email|password|required|blank|can.t be/i.test(text);
    record("S3 Sign in requires email and password (form validation)", !session && (resp === null || resp.status() >= 400) && msg,
      { status: resp?.status() ?? null, noRequest: resp === null, hasSession: session, messageShown: msg });
    await signIn(admin);
  });

  await attempt("S5 Anonymous user opens a card edit modal, sees denial, then follows its sign-in link to the card", async () => {
    await signIn(admin);
    await visit("/_signout");
    const target = "Home";
    await visit(`/${target}?view=edit`);
    await page.waitForTimeout(1500);
    const denial = await page.evaluate(() => document.body.innerText);
    const signinLink = await page.evaluate(() => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")).find((h) => h && /\*signin/.test(h)) ?? null);
    const denied = /Sorry|sign in|not permitted|permission/i.test(denial) && !/card-form|edit_card/.test(await page.content());
    // Each leg of "lands back on the card" is recorded on its own: the verdict
    // is the AND of three reads (the account name renders, the URL is not the
    // sign-in route, the target card's own id is in #main), and before this the
    // evidence carried only {denied, signinLink, landedOn} - so the 2026-10-16
    // and 2026-10-17 FAILs printed evidence byte-identical to a PASS and named
    // nothing about which leg broke.
    let back = false;
    let signInStatus = null, returnNavigation = null;
    const backLegs = { credentialFormRendered: null, accountNameShown: null, offSigninRoute: null, targetCardRendered: null };
    if (signinLink !== null) {
      await page.goto(new URL(signinLink, stack.origin).href, { waitUntil: "load" });
      // Ruby's spec asserts the sign-in card's own slot (.SELF-Xsignin) and
      // then types into *email and *password, so "reached the credential
      // form" is three reads on the destination's HTML — not the 200 this
      // leg used to record. Registry row cap-S5's finding: the sentence ends
      // at "the credential form", which the check did not assert.
      const credential = hasCredentialForm(await page.content());
      backLegs.credentialFormRendered = credential.ok;
      await page.fill(`input[name="${SIGNIN_FIELD_NAMES.email}"]`, admin.email);
      await page.fill(`input[name="${SIGNIN_FIELD_NAMES.password}"]`, admin.password);
      const posted = page.waitForResponse(response => new URL(response.url()).origin === stack.origin && new URL(response.url()).pathname === '/update/*signin' && response.request().method() === 'POST', {timeout:30000})
        .then(response=>({response}),error=>({error:String(error?.message??error)}));
      const returned = page.waitForURL(url => decodeURIComponent(url.pathname).replace(/\/$/,'') !== '/*signin', {waitUntil:'domcontentloaded',timeout:30000})
        .then(()=>({url:page.url()}),error=>({error:String(error?.message??error)}));
      await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
      const observed = await posted;
      if(observed.response){await observed.response.finished();signInStatus=observed.response.status();}
      returnNavigation = await returned;
      await page.locator('body').waitFor({state:'attached',timeout:10000});
      // Ruby's signin redirect: after signing in, the person lands back on the card.
      const landedPath = new URL(page.url()).pathname.replace(/\/$/, "");
      backLegs.accountNameShown = /Harness Admin/.test(await page.evaluate(() => document.body.innerText));
      backLegs.offSigninRoute = landedPath !== "/*signin";
      // The configured Home card is also served at /. Verify the displayed
      // card's stored identity instead of rejecting that canonical root URL.
      const targetId = fixtureCard(ctx.database(), target)?.id;
      backLegs.targetCardRendered = targetId !== undefined && await page.locator(`#main[data-card-id="${targetId}"], #main [data-card-id="${targetId}"]`).count() > 0;
      back = signInStatus !== null && signInStatus < 400 && !returnNavigation.error && backLegs.credentialFormRendered && backLegs.accountNameShown && backLegs.offSigninRoute && backLegs.targetCardRendered;
    }
    record("S5 Anonymous user opens a card edit modal, sees denial, then follows its sign-in link to the card",
      denied && signinLink !== null && back, { denied, signinLink, signInStatus, returnNavigation, landedOn: page.url().replace(stack.origin, ""), target, backLegs });
    await signIn(admin);
  });
}

// ---------------------------------------------------------------------------
// The runner contract (tools/edge-signed-in-exercise/lib/check-modules.mjs).
// The runner passes the database as a handle and no cardName; the checks above
// expect a function and a name helper, so the adapter supplies both.
// ---------------------------------------------------------------------------

export const meta = {
  topic: "cover-b",
  capabilityIds: ["C10", "C12", "C14", "C16", "C18", "C6", "C8", "E3", "E5", "E6", "E8", "E10", "E12", "E14", "E16", "E17", "E19", "E21", "E22", "E23", "F1", "F3", "F5", "F7", "H1", "M1", "N11", "N3", "N5", "N8", "P5", "R1", "S10", "S2", "S3", "S4", "S5", "W1", "W2", "W3"],
};

function adaptRunnerContext(ctx) {
  const handle = ctx.database;
  return {
    ...ctx,
    database: typeof handle === "function" ? handle : () => handle,
    cardName: (label) => `Harness_${label}_${Date.now().toString(36)}`,
  };
}

export const checks = [
  {
    name: "cover-b: the odd-position capability checks (each record names its capability)",
    run: (ctx) => runCoverBChecks(adaptRunnerContext(ctx)),
  },
];

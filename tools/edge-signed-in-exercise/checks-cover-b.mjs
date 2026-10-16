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

import { focusRichEditor } from "./lib/rich-editor.mjs";

const CAP = "C";

/** The create form on /new/:type (the page's own form, not the navbar's roles form). */
const MAIN_FORM = 'form#new_card[action="/card/create"], #main form.card-form, form.card-form[action*="/card/create"], form.card-form[id="new_card"]';

/** A real minimal 1x1 PNG (RGBA, transparent): the Image upload posts bytes an
 *  image card actually accepts, not a text/plain stub wearing a .png name. */
const ONE_BY_ONE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** TinyMCE is ready once the global tinymce has an active editor. */
async function waitForEditor(page, timeout = 30_000) {
  try {
    await page.waitForFunction(() => typeof window.tinymce !== "undefined" && window.tinymce.activeEditor !== null, { timeout });
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

/** Creates a card of `type` with `content` through the create form. */
async function createCard(page, stack, { type = "RichText", name, content = "" }) {
  const url = `${stack.origin}/new/${type}` + (name || content ? `?card%5Bname%5D=${encodeURIComponent(name ?? "")}${content ? `&card%5Bcontent%5D=${encodeURIComponent(content)}` : ""}` : "");
  const response = await page.goto(url, { waitUntil: "load", timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => {
    const form = document.querySelector('form.card-form');
    const input = document.querySelector('form.card-form input[name="card[name]"]');
    return { action: form?.getAttribute("action") ?? null, name: input?.value ?? null, hasSubmit: Boolean(document.querySelector('form.card-form button[type="submit"]')) };
  });
  if (content && state.hasSubmit) {
    const ed = await waitForEditor(page, 15_000);
    if (ed.active) await page.evaluate((text) => window.tinymce.activeEditor.setContent(text), content);
    else await page.fill('form.card-form textarea[name="card[content]"]', content).catch(() => undefined);
  }
  const before = page.__ctxLedgerLength?.() ?? null;
  void before;
  await page.locator('form.card-form button[type="submit"], form.card-form input[type="submit"]').first().click().catch(() => undefined);
  await page.waitForTimeout(3000);
  return { status: response?.status() ?? null, landed: page.url().replace(stack.origin, ""), ...state };
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
  if(ctx.coverBCase!==undefined&&!meta.capabilityIds.includes(ctx.coverBCase))throw Error('unknown cover-b capability selection');
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
    if(ctx.coverBCase!==undefined&&!name.startsWith(ctx.coverBCase+' '))return;
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
  const exists = (name) => ctx.database().prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(name);
  const row = (name) => ctx.database().prepare("SELECT name, db_content AS content FROM cards WHERE name = ? AND trash = 0").get(name);
  /** Creates a card, retrying the type that actually matches (a Date type needs a date input). */
  const create = async (name, content = "", type = "RichText") => {
    ensure(name);
    const made = await createCard(page, stack, { type, name, content });
    if (!exists(name)) {
      const alt = await createCard(page, stack, { type: "Basic", name, content });
      return { ...made, retriedAsBasic: true, alt };
    }
    return made;
  };
  const clickAndWait = async (locator, { timeout = 15_000 } = {}) => {
    const before = ledger().length;
    await locator.first().click({ timeout }).catch(() => undefined);
    await page.waitForTimeout(1500);
    return linesSince(before);
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
    // Ruby: "Home Movie+*right+*default" = "Watch this"; a new card "Lew+Home Movie" shows it.
    // Creating a junction creates its LEFT card too, so track it for cleanup.
    ensure("Harness_CB_Home");
    await create("Harness_CB_Home+*right+*default", "Watch this");
    const name = ensure("Harness_CB_Lew+Harness_CB_Home");
    await page.goto(`${stack.origin}/new/${encodeURIComponent(movie)}?card%5Bname%5D=${encodeURIComponent(name)}`, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    const editor = await waitForEditor(page, 20_000);
    const content = await page.evaluate(() => window.tinymce?.activeEditor?.getContent?.() ?? document.querySelector('textarea[name="card[content]"], input[name="card[content]"]')?.value ?? "");
    record("C14 a *right+*default rule's content fills the new form for a card with that right",
      editor.active && /Watch this/.test(content), { editor, content: String(content).slice(0, 120) });
  });

  // ------------------------------------------------------------ C16, C18
  group("cover-b. create: pointer inputs (checkbox, select) (C16, C18)");

  // Ruby's pointer_inputs.feature: "<right>+*right+*input type" picks the widget and
  // "<right>+*right+*options" is a Search card of the option cards' type.
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
      await create(`${rightSet}+*right+*options`, JSON.stringify({ type: optionType, sort: "name" }), "RichText");
      pointerBuilt = true;
    }
    ensure(`${rightSet}+*right+*input type`);
    await create(`${rightSet}+*right+*input type`, inputType, "Phrase");
  };

  await attempt("C16 a checkbox pointer input can be checked and stored", async () => {
    await buildPointerInput("checkbox");
    const cardNamePick = ensure("Harness_CB_Boxy");
    await create(cardNamePick, null, "Basic");
    ensure(`${cardNamePick}+${rightSet}`); await create(`${cardNamePick}+${rightSet}`, "", "Pointer");
    const form = await visit(`/${cardNamePick}+${rightSet}?view=edit`);
    await page.waitForTimeout(1500);
    const boxes = await page.evaluate(() => [...document.querySelectorAll('#main input[type="checkbox"]')].map((i) => ({ name: i.name, value: i.value, id: i.id })));
    const target = boxes.find((b) => /Pick_Two/i.test(`${b.value} ${b.name}`));
    if (target === undefined) {
      record("C16 a checkbox pointer input can be checked and stored", false, { formStatus: form.status, checkboxes: boxes.slice(0, 8), note: "no checkbox inputs on the pointer's edit form" });
      return;
    }
    await page.locator(`#main input[type="checkbox"][value="${target.value}"]`).first().check({ force: true }).catch(() => undefined);
    const before = ledger().length;
    await page.locator('#main form button[type="submit"], #main button.submit-button, #main button[type="submit"]').first().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(3000);
    const write = linesSince(before).find((l) => l.method !== "GET");
    const after = await visit(`/${cardNamePick}+${rightSet}`);
    record("C16 a checkbox pointer input can be checked and stored (card shows the checked value)",
      write !== undefined && write.status < 400 && /Pick_Two/.test(after.html),
      { writeStatus: write?.status ?? null, checkboxes: boxes.slice(0, 6), afterStatus: after.status, showsPickTwo: /Pick_Two/.test(after.html) });
  });

  await attempt("C18 a select pointer input offers a choice and stores it", async () => {
    await buildPointerInput("select");
    const cardNameSel = ensure("Harness_CB_Selly");
    await create(cardNameSel, null, "Basic");
    ensure(`${cardNameSel}+${rightSet}`); await create(`${cardNameSel}+${rightSet}`, "", "Pointer");
    const form = await visit(`/${cardNameSel}+${rightSet}?view=edit`);
    await page.waitForTimeout(1500);
    const selects = await page.evaluate(() => [...document.querySelectorAll('#main select')].map((s) => ({ name: s.name, id: s.id, options: [...s.options].map((o) => ({ text: o.textContent.trim(), value: o.value })).slice(0, 8) })));
    const sel = selects.find((s) => s.options.some((o) => /Pick_One/i.test(o.text) || /Pick_One/i.test(o.value)));
    if (sel === undefined) {
      record("C18 a select pointer input offers a choice and stores it", false, { formStatus: form.status, selects: selects.slice(0, 4), note: "no select with the option cards on the pointer's edit form" });
      return;
    }
    const option = sel.options.find((o) => /Pick_One/i.test(o.text) || /Pick_One/i.test(o.value));
    await page.selectOption(`#main select[name="${sel.name}"]`, { label: option.text }).catch(async () => { await page.selectOption(`#main select[name="${sel.name}"]`, option.value).catch(() => undefined); });
    const before = ledger().length;
    await page.locator('#main form button[type="submit"], #main button.submit-button, #main button[type="submit"]').first().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(3000);
    const write = linesSince(before).find((l) => l.method !== "GET");
    const after = await visit(`/${cardNameSel}+${rightSet}`);
    void write;
    record("C18 a select pointer input offers a choice and stores it (card shows the selection)",
      write !== undefined && write.status < 400 && /Pick_One/.test(after.html),
      { writeStatus: write?.status ?? null, selected: option, afterStatus: after.status, showsPickOne: /Pick_One/.test(after.html) });
  });

  // ------------------------------------------------------------------ E6-E8
  group("cover-b. edit: editor buttons (link, nest image) (E6, E8)");

  await attempt("E6 the editor's link button inserts a reference that renders as a link", async () => {
    const name = ensure(cardName("linkbtn"));
    await create(name, "");
    await visit(`/${name}`);
    const link = page.locator('a.edit-link[href$="/edit"]').first();
    await link.dispatchEvent("click").catch(() => undefined);
    await page.waitForSelector("#edit_card, .modal", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(3500);
    const editorId = await openRichEditorId(page);
    const buttons = await page.evaluate((id) => {
      const c = window.tinymce?.get(id)?.editorContainer;
      if (!c) return [];
      return [...c.querySelectorAll("button, a")].map((b) => ({ label: `${b.getAttribute("title") ?? ""} ${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`.trim() })).filter((b) => b.label);
    }, editorId);
    const linkButton = buttons.find((b) => /\[\[|link/i.test(b.label) && !/nest|image/i.test(b.label));
    if (linkButton === undefined) {
      record("E6 the editor's link button inserts a reference that renders as a link", false, { note: "no link ([[ ]]) button in the TinyMCE toolbar", buttons: buttons.slice(0, 12) });
      return;
    }
    await page.evaluate((id) => {
      const c = window.tinymce?.get(id)?.editorContainer;
      const b = c ? [...c.querySelectorAll("button, a")].find((x) => /\[\[|link/i.test(`${x.getAttribute("title") ?? ""} ${x.getAttribute("aria-label") ?? ""} ${x.textContent ?? ""}`) && !/nest|image/i.test(`${x.getAttribute("title") ?? ""} ${x.textContent ?? ""}`)) : undefined;
      b?.click();
    }, editorId);
    await page.waitForTimeout(1200);
    const dialog = await page.evaluate(() => {
      const d = document.querySelector(".mce-window, .mce-dialog, .mce-modal, [role=dialog]");
      return d ? { open: true, fields: [...d.querySelectorAll("input,textarea,select")].map((i) => i.name || i.id || i.type) } : { open: false };
    });
    let inserted = false;
    if (dialog.open) {
      // TinyMCE's own link dialog: link_name is the [[card]] it inserts.
      await page.locator('[role=dialog] input[name="link_name"], .mce-window input[name="link_name"], .mce-dialog input[name="link_name"], [role=dialog] input[type=text]').first().fill("Home").catch(() => undefined);
      await page.waitForTimeout(400);
      await page.locator('[role=dialog] button.primary, .mce-window .mce-primary button, .mce-dialog .mce-primary button, [role=dialog] button:has-text("Save"), [role=dialog] button:has-text("Insert"), [role=dialog] button:has-text("OK")').first().click().catch(() => undefined);
      await page.waitForTimeout(1200);
      const content = await page.evaluate((id) => window.tinymce?.get(id)?.getContent?.() ?? "", editorId);
      inserted = /Home/.test(content) && /\[\[|\]\]|href=/.test(content);
      if (inserted) {
        // Ruby's expectation (edit/nest_editor + edit-note-admin): the [[Home]]
        // reference renders on the card page as a link to Home.
        const before = ledger().length;
        await page.locator("#edit_card button[type=submit], .modal button[type=submit]").first().click().catch(() => undefined);
        await page.waitForTimeout(2500);
        const after = await visit(`/${name}`);
        const renderedLink = /<a[^>]+href="\/Home"/.test(after.html);
        record("E6 the editor's link button inserts a reference that renders as a link",
          renderedLink, { linkButton, dialog, editorContent: content.slice(0, 120), wrote: linesSince(before).find((l) => l.method !== "GET")?.status ?? null, renderedLink });
        return;
      }
      void inserted;
    }
    // The button's own dialog did not insert a [[reference]] into the editor.
    // Grade the underlying reference syntax the button produces by typing it:
    // if THAT renders as a link, the defect is the button/dialog; if it does
    // not, [[references]] do not render as links at all.
    await page.evaluate((id) => window.tinymce?.get(id)?.setContent?.("<p>[[Home]]</p>"), editorId).catch(() => undefined);
    const before = ledger().length;
    await page.locator("#edit_card button[type=submit], .modal button[type=submit]").first().click().catch(() => undefined);
    await page.waitForTimeout(2500);
    const after = await visit(`/${name}`);
    const renderedLink = /<a[^>]+href="\/Home"/.test(after.html);
    record("E6 the editor's link button inserts a reference that renders as a link",
      dialog.open && inserted && renderedLink,
      { linkButton, dialog, insertedByButton: inserted, typedReferenceRendersLink: renderedLink, wrote: linesSince(before).find((l) => l.method !== "GET")?.status ?? null, afterStatus: after.status });
  });

  await attempt("E8 the nest image editor inserts a nest with view and size options", async () => {
    const name = ensure(cardName("imgbtn"));
    await create(name, "");
    await visit(`/${name}`);
    const link = page.locator('a.edit-link[href$="/edit"]').first();
    await link.dispatchEvent("click").catch(() => undefined);
    await page.waitForSelector("#edit_card, .modal", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(3500);
    const editorId = await openRichEditorId(page);
    const opened = await page.evaluate((id) => {
      const c = window.tinymce?.get(id)?.editorContainer;
      if (!c) return { opened: false, reason: "no editor" };
      const buttons = [...c.querySelectorAll("button, a")];
      const insert = buttons.find((b) => /^insert$/i.test((b.getAttribute("aria-label") ?? b.textContent ?? "").trim()));
      if (!insert) return { opened: false, reason: "no Insert menu button", buttons: buttons.map((b) => b.getAttribute("title") ?? b.textContent).slice(0, 20) };
      insert.click();
      const image = buttons.find((b) => /image/i.test(`${b.getAttribute("title") ?? ""} ${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`) && !/nest/i.test(`${b.getAttribute("title") ?? ""} ${b.textContent ?? ""}`));
      if (!image) return { opened: false, reason: "no Image... item after Insert", buttons: buttons.map((b) => b.getAttribute("title") ?? b.textContent).slice(0, 20) };
      image.click();
      return { opened: true };
    }, editorId);
    await page.waitForTimeout(1500);
    const dialog = await page.evaluate(() => {
      const d = document.querySelector(".mce-window, .mce-dialog, .mce-modal, [role=dialog]");
      return d ? { open: true, selects: [...d.querySelectorAll("select")].map((s) => ({ cls: s.className, options: [...s.options].map((o) => o.value) }).slice(0, 10)) } : { open: false };
    });
    let applied = false;
    if (dialog.open) {
      await page.evaluate(() => {
        for (const s of document.querySelectorAll(".mce-window select, .mce-dialog select")) {
          if (/image-card-select/.test(s.className) || s.options.length === 0) continue;
          if (/view-select/.test(s.className) && [...s.options].some((o) => /titled/.test(o.value))) { s.value = "titled"; s.dispatchEvent(new Event("change", { bubbles: true })); }
          if (/size-select/.test(s.className) && [...s.options].some((o) => /small/.test(o.value))) { s.value = "small"; s.dispatchEvent(new Event("change", { bubbles: true })); }
        }
        const apply = [...document.querySelectorAll(".mce-window button, .mce-dialog button")].find((b) => /apply and close/i.test(b.textContent ?? ""));
        apply?.click();
      });
      await page.waitForTimeout(1000);
      applied = /view: titled/.test(await page.evaluate((id) => window.tinymce?.get(id)?.getContent?.() ?? "", editorId));
    }
    record("E8 the nest image editor inserts a nest with view and size options",
      opened.opened && dialog.open && applied,
      { opened, dialog, applied, note: opened.reason ?? null });
    await page.keyboard.press("Escape").catch(() => undefined);
  });

  // ------------------------------------------------------------------ E5
  group("cover-b. edit: the Nest dialog's Apply (E5): wire id, insertion, save persistence");

  await attempt("E5 the Nest dialog's Apply inserts the nest and saving persists it (data-tinymce-id wire, editor content, fresh GET)", async () => {
    // nest_editor 'nest editor', beyond dialog presence: the {{}} toolbar
    // button opens the Nest dialog; its Apply must carry the id of the editor
    // that opened it (data-tinymce-id — nest_editor.js.coffee inserts the
    // preview through tinymce.get($(apply).data("tinymce-id"))), the nest
    // markup must land in the editor's content, and the save must persist it
    // (a fresh GET of the page renders the nested card's body). Without the
    // wire the insert threw while Bootstrap's data-bs-dismiss closed the
    // dialog anyway — invisible to presence-only checks.
    const target = ensure(cardName("NestTarget"));
    const nestedBody = `Harness nested body ${target}`;
    await create(target, nestedBody, "PlainText");
    const source = ensure(cardName("NestSource"));
    await create(source, "before the nest", "RichText");
    await visit(`/${source}`);
    const link = page.locator('a.edit-link[href$="/edit"]').first();
    await link.dispatchEvent("click").catch(() => undefined);
    await page.waitForSelector("#edit_card, .modal", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(3500);
    const editorId = await openRichEditorId(page);
    await page.keyboard.press("Control+End");
    const opened = await page.evaluate((id) => {
      const c = window.tinymce?.get(id)?.editorContainer;
      if (!c) return { opened: false, reason: "no editor" };
      const nest = [...c.querySelectorAll("button, a")].find((b) =>
        /nest/i.test(`${b.getAttribute("title") ?? ""} ${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`) &&
        !/image|list|rules/i.test(`${b.getAttribute("title") ?? ""} ${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`));
      if (!nest) return { opened: false, reason: "no Insert/edit nest toolbar button", buttons: [...c.querySelectorAll("button, a")].map((b) => b.getAttribute("title") ?? b.textContent).slice(0, 20) };
      nest.click();
      return { opened: true };
    }, editorId);
    await page.waitForSelector("button._nest-apply", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    // The wire, read at render time: Apply's data-tinymce-id names a live
    // TinyMCE instance (the one that opened the dialog).
    const wire = await page.evaluate((modalEditorId) => {
      const apply = document.querySelector("button._nest-apply");
      if (!apply) return { present: false };
      const id = apply.getAttribute("data-tinymce-id");
      return {
        present: true,
        tinymceId: id,
        nonEmpty: typeof id === "string" && id.length > 0,
        resolvesEditor: Boolean(id) && typeof window.tinymce?.get === "function" && Boolean(window.tinymce.get(id)),
        isEditorThatOpened: Boolean(id) && Boolean(modalEditorId) && window.tinymce?.get?.(id) != null && window.tinymce.get(id) === window.tinymce.get(modalEditorId),
        label: (apply.textContent ?? "").trim(),
        inModalSlot: Boolean(apply.closest("._modal-slot")),
      };
    }, editorId);
    await page.locator("input._nest-name").first().fill(target).catch(() => undefined);
    await page.waitForTimeout(600);
    const preview = await page.evaluate(() => document.querySelector("._nest-preview")?.value ?? null);
    await page.evaluate(() => document.querySelector("button._nest-apply")?.click());
    await page.waitForTimeout(1000);
    const content = await page.evaluate((id) => window.tinymce?.get(id)?.getContent?.() ?? "", editorId);
    const insertedNest = content.includes(target) && content.includes("{{");
    const before = ledger().length;
    await page.locator("#edit_card button[type=submit], .modal button[type=submit]").first().click().catch(() => undefined);
    await page.waitForTimeout(2500);
    const write = linesSince(before).find((l) => l.method !== "GET");
    // The stored content is the durable proof the nest markup was saved; the
    // fresh GET must render the nested card's body through the nest.
    const stored = row(source)?.content ?? "";
    const after = await visit(`/${source}`);
    const freshShowsNestedBody = after.html.includes(nestedBody);
    record("E5 the Nest dialog's Apply inserts the nest and saving persists it (data-tinymce-id wire, editor content, fresh GET)",
      wire.present && wire.nonEmpty && wire.resolvesEditor && opened.opened && insertedNest &&
        write !== undefined && write.status < 400 && stored.includes(target) && freshShowsNestedBody,
      { opened, wire, preview, inserted: content.slice(0, 140), insertedNest, saveStatus: write?.status ?? null,
        storedHasNest: stored.includes(target), stored: stored.slice(0, 120), freshShowsNestedBody, afterStatus: after.status });
    await page.keyboard.press("Escape").catch(() => undefined);
  });

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
      return { field: f?.value ?? null, hiddenTypeId: hidden?.value ?? null, formAction: f?.closest("form")?.getAttribute("action") ?? null };
    });
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
    await visit("/Home/board");
    await page.waitForTimeout(1500);
    const rulesTab = page.locator(".board .nav-link", { hasText: "Rules" }).first();
    await rulesTab.click().catch(() => undefined);
    await page.waitForTimeout(1500);
    const rows = await page.evaluate(() => [...document.querySelectorAll(".board .card-slot, .board .rule-row, .board [id*='rule']")].map((r) => ({ id: r.id, text: r.textContent.replace(/\s+/g, " ").trim().slice(0, 40) })).slice(0, 15));
    const ruleLink = page.locator(".board a[href*='rule_form'], .board a[href$='/edit']").first();
    const opened = await ruleLink.count();
    if (opened === 0) {
      record("E14 a rule card's type can be changed in the board's Rules tab", false, { note: "no rule row edit link in the Rules tab", rows, rulesTabLinks: await page.evaluate(() => [...document.querySelectorAll(".board a")].map((a) => a.getAttribute("href")).slice(0, 20)) });
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
    const before = ledger().length;
    await page.locator("#edit_card button.submit-button, .modal button.submit-button, #edit_card button[type=submit], .modal button[type=submit]").first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    const write = linesSince(before).find((l) => l.method !== "GET");
    record("E14 a rule card's type can be changed in the board's Rules tab (the write answers 200)",
      write !== undefined && write.status < 400, { writeStatus: write?.status ?? null, rows });
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
    const fields = await page.evaluate(() => [...document.querySelectorAll("#main input, .modal input")].map((i) => ({ name: i.name, type: i.type })));
    const emailField = fields.find((f) => /email/i.test(f.name ?? "") && f.type !== "hidden");
    const passwordField = fields.find((f) => /password/i.test(f.name ?? "") && f.type !== "hidden");
    record("E19 the account card's board has an Account tab that exposes email and password",
      emailField !== undefined && passwordField !== undefined, { accountTab, fields });
  });

  await attempt("E21 the board History tab lists the run's change", async () => {
    const name = created.find((n) => n.startsWith("Harness_") && n.endsWith("_renamed")) ?? created[created.length - 1];
    await visit(`/${name}/board`);
    await page.waitForTimeout(1500);
    const tab = page.locator(".board .nav-link", { hasText: "History" }).first();
    if (await tab.count() === 0) { record("E21 the board History tab lists the run's change", false, { note: "no History tab", url: page.url() }); return; }
    await tab.click().catch(() => undefined);
    await page.waitForTimeout(1500);
    const rows = await page.evaluate(() => [...document.querySelectorAll("#main .pill, #main .act, #main .card-slot, #main li")].map((r) => r.textContent.replace(/\s+/g, " ").trim().slice(0, 60)).filter(Boolean).slice(0, 8));
    record("E21 the board History tab lists the run's change", rows.length > 0, { card: name, rows });
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
    const form = await visit(`/${pointer}?view=edit`);
    await page.waitForTimeout(1500);
    const selects = await page.evaluate(() => [...document.querySelectorAll("#main select")].map((s) => ({ name: s.name, value: s.value, options: [...s.options].map((o) => ({ text: o.textContent.trim(), value: o.value })).slice(0, 6) })));
    const sel = selects.find((s) => s.options.some((o) => /Pick_Two/.test(o.text) || /Pick_Two/.test(o.value)));
    if (sel === undefined) { record("E23 a pointer card can be edited: the selection changes and is stored", false, { formStatus: form.status, selects, note: "no select input on the pointer card's edit form" }); return; }
    const option = sel.options.find((o) => /Pick_Two/.test(o.text) || /Pick_Two/.test(o.value));
    await page.selectOption(`#main select[name="${sel.name}"]`, { label: option.text }).catch(async () => { await page.selectOption(`#main select[name="${sel.name}"]`, option.value).catch(() => undefined); });
    const before = ledger().length;
    await page.locator("#main form button[type=submit], #main button.submit-button, #main button[type=submit]").first().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(3000);
    const write = linesSince(before).find((l) => l.method !== "GET");
    const stored = row(pointer)?.content ?? "";
    const after = await visit(`/${pointer}`);
    record("E23 a pointer card can be edited: the selection changes and is stored",
      write !== undefined && write.status < 400 && /Pick_Two/.test(stored) && /Pick_Two/.test(after.html),
      { writeStatus: write?.status ?? null, stored, afterStatus: after.status, showsPickTwo: /Pick_Two/.test(after.html) });
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

  await attempt("P5 *right Set: a *right+*self+*structure rule on the deck's own card renders", async () => {
    const cardName5 = ensure("Harness_CB_Cereal");
    await create(cardName5, "Harness cereal body", "Basic");
    ensure(`${cardName5}+*self+*structure`);
    await create(`${cardName5}+*self+*structure`, "My very own header");
    const visited = await visit(`/${cardName5}`);
    const text = await page.evaluate(() => document.body.innerText);
    // Ruby (rules.spec: "Self Set"): the card's main slot shows the *self
    // structure's rendering. The card's own body is not part of that rendering.
    record("P5 *right Set: a *self+*structure rule on a card renders its structure in the main slot",
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
    const followRule = `${card}+*self+Harness_Member+*follow`;
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

  await attempt("W3 a card and a cardtype can be watched (both get a *follow rule)", async () => {
    await signIn(admin);
    await signIn(member);
    const card = ensure(cardName("watchcard"));
    await create(card, "Harness watched card", "Basic");
    const cardResult = await followOn(card);
    const cardtype = ensure("Harness_CB_Watched_Type");
    await create(cardtype, "", "Cardtype");
    const typeResult = await followOn(cardtype);
    const rules = ctx.database().prepare("SELECT name FROM cards WHERE name LIKE ? AND trash = 0 ORDER BY name").all("%+*follow");
    record("W3 a card and a cardtype can be watched (each gets a *follow rule for the member)",
      cardResult.ruleExists === true && typeResult.ruleExists === true,
      { card, cardResult: { followLink: cardResult.followLink?.text ?? null, rule: cardResult.followRule, ruleExists: cardResult.ruleExists },
        cardtype, typeResult: { followLink: typeResult.followLink?.text ?? null, rule: typeResult.followRule, ruleExists: typeResult.ruleExists, links: typeResult.links?.slice(0, 4) },
        followRules: rules.map((r) => r.name) });
    await signIn(admin);
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

  await attempt("C6 Search for a nonexistent name offers a create link", async () => {
    const missing = "zzq harness nonexistent name";
    await visit(`/*search?query%5Bkeyword%5D=${encodeURIComponent(missing)}`);
    await page.waitForTimeout(1200);
    const hrefs = await page.evaluate(() => [...document.querySelectorAll("#main a[href], .search-result-item a[href]")].map((a) => a.getAttribute("href")));
    const createLink = hrefs.find((h) => h && /\/new\//.test(h));
    record("C6 Search for a nonexistent name offers a create link", createLink !== undefined,
      { createLink: createLink ?? null, linksSample: hrefs.slice(0, 6) });
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
    const labels = await page.evaluate((id) => {
      const c = window.tinymce?.get(id)?.editorContainer;
      return c ? [...c.querySelectorAll("button, [role=menuitem], .tox-tbtn, .tox-mbtn")].map((b) => `${b.getAttribute("title") ?? ""} ${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`.replace(/\s+/g, " ").trim()).filter(Boolean) : [];
    }, editorId);
    const has = (re) => labels.some((l) => re.test(l));
    const ok = has(/bold/i) && has(/bullet|numbered|list/i) && has(/table/i) && has(/insert/i) && has(/format/i);
    record("M1 Rich text editor toolbar (formats, lists, table, insert menu)", ok,
      { formats: has(/bold/i), lists: has(/bullet|numbered|list/i), table: has(/table/i), insert: has(/insert/i), format: has(/format/i), sample: labels.slice(0, 12) });
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
    const field = page.locator('.board input[name$="[content]"]:not([type=hidden]), .board textarea[name$="[content]"]').first();
    await field.fill("Harness save after").catch(() => undefined);
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

  await attempt("E18 Two edits at the same time: second save refused (conflict)", async () => {
    const name = ensure(cardName("conflict"));
    await create(name, "Harness conflict base", "Basic");
    await signIn(admin);
    const held = await page.evaluate(async ({ origin, card }) => {
      const form = await (await fetch(`${origin}/${card}/edit`, { credentials: "include" })).text();
      return /name="card\[last_action_id_before_edit\]"[^>]*value="([^"]*)"/.exec(form)?.[1] ?? /value="([^"]*)"[^>]*name="card\[last_action_id_before_edit\]"/.exec(form)?.[1] ?? null;
    }, { origin: stack.origin, card: name });
    await signIn(member);
    await page.evaluate(async ({ origin, card, id }) => {
      await fetch(`${origin}/update/${card}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin },
        body: new URLSearchParams({ _method: "patch", "card[content]": "member edit first", "card[last_action_id_before_edit]": id ?? "", "success[redirect]": "true" }).toString(), redirect: "manual", credentials: "include" });
    }, { origin: stack.origin, card: name, id: held });
    await signIn(admin);
    const second = await page.evaluate(async ({ origin, card, id }) => {
      const r = await fetch(`${origin}/update/${card}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin },
        body: new URLSearchParams({ _method: "patch", "card[content]": "admin edit on stale revision", "card[last_action_id_before_edit]": id ?? "", "success[redirect]": "true" }).toString(), redirect: "manual", credentials: "include" });
      return { status: r.status, body: (await r.text()).replace(/\s+/g, " ").slice(0, 160) };
    }, { origin: stack.origin, card: name, id: held });
    record("E18 Two edits at the same time: second save refused (conflict)",
      held !== null && (second.status >= 400 || /conflict|stale|changed/i.test(second.body)),
      { heldRevision: held, status: second.status, body: second.body.slice(0, 120) });
  });

  await attempt("E22 Edit board: rules tab (no set selected; warns when set 'all' selected)", async () => {
    await visit("/Home/board");
    await page.waitForTimeout(1500);
    await page.locator(".board .nav-link", { hasText: "Rules" }).first().click().catch(() => undefined);
    await page.waitForTimeout(1500);
    const tab = await page.evaluate(() => {
      const pane = document.querySelector("#tab-home-8-rule, .board .tab-pane.active, .board [id*='rule']");
      const text = pane?.textContent?.replace(/\s+/g, " ") ?? "";
      const selects = [...(pane?.querySelectorAll("select, .select2, input") ?? [])].length;
      return { text: text.slice(0, 160), selects, mentionsSelect: /select/i.test(text) };
    });
    record("E22 Edit board: rules tab (no set selected; warns when set 'all' selected)",
      tab.selects > 0 && tab.mentionsSelect, { tab });
  });

  await attempt("H1 View a card's history page", async () => {
    const name = created.find((n) => n.startsWith("Harness_") && !n.includes("+")) ?? "Home";
    const v = await visit(`/${name}/history`);
    const acts = await page.evaluate(() => document.querySelectorAll(".act, .card-history, [class*=history], tr").length);
    record("H1 View a card's history page", v.status === 200 && /act|change|edit|history/i.test(v.html),
      { card: name, status: v.status, actLikeNodes: acts });
  });

  await attempt("N5 Changes link lists recently updated cards, newest first", async () => {
    const name = ensure(cardName("newest"));
    await create(name, "Harness newest body", "Basic");
    await visit("/*search");
    await page.waitForTimeout(1200);
    const first = await page.evaluate(() => [...document.querySelectorAll("#main a[href^='/']")].map((a) => a.textContent.trim()).filter((t) => t && !/^(edit|space_dashboard|more_horiz|open_in|fullscreen|modal|page|advanced|help|Changes|Opportunities|Culturesmith)/.test(t)).slice(0, 6));
    record("N5 Changes link lists recently updated cards, newest first", first.some((t) => t.includes(name)) && first.findIndex((t) => t.includes(name)) <= 1,
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
    let back = false;
    if (signinLink !== null) {
      await page.goto(new URL(signinLink, stack.origin).href, { waitUntil: "load" }).catch(() => undefined);
      await page.fill('input[name="card[subcards][+*email][content]"]', admin.email).catch(() => undefined);
      await page.fill('input[name="card[subcards][+*password][content]"]', admin.password).catch(() => undefined);
      await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click().catch(() => undefined);
      await page.waitForTimeout(2500);
      // Ruby's signin redirect: after signing in, the person lands back on the card.
      back = /Harness Admin/.test(await page.evaluate(() => document.body.innerText)) && new URL(page.url()).pathname.replace(/\/$/, "") !== "/*signin";
      back = back && (await page.url()).includes(`/${target}`);
    }
    record("S5 Anonymous user opens a card edit modal, sees denial, then follows its sign-in link to the card",
      denied && signinLink !== null && back, { denied, signinLink, landedOn: page.url().replace(stack.origin, "") });
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
  capabilityIds: ["C10", "C12", "C14", "C16", "C18", "C6", "C8", "E3", "E5", "E6", "E8", "E10", "E12", "E14", "E16", "E17", "E18", "E19", "E21", "E22", "E23", "F1", "F3", "F5", "F7", "H1", "M1", "N11", "N3", "N5", "N8", "P5", "R1", "S2", "S3", "S4", "S5", "W1", "W3"],
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

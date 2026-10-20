// checks-capability-legs.mjs — the missing capability legs the 2026-10-20
// contract grind named (tmp/caps-grind-20261020/verdicts.json, rows whose
// instrumentStatus was "partial by contract"): each check below measures one
// named leg the bound check of its row did not assert. Every check drives the
// real signed-in UI the way a person does and grades the result against what
// Ruby's own Cucumber/Cypress tests assert (each check's docstring names the
// Ruby source). Cards a check creates are pushed onto ctx.created so the
// harness's cleanup trashes them.
//
// Loaded by tools/edge-signed-in-exercise.mjs through its checks-*.mjs loader;
// selected with --only caps-legs. Row N5 is absent on purpose: its grind
// verdict is "none beyond the contract partial" — the order leg it names is
// already graded by the row's own declared check.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fixtureCard, createTypedFixture } from "./lib/typed-fixture.mjs";
import { focusRichEditor } from "./lib/rich-editor.mjs";

const fileDigest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** A real minimal 1x1 transparent PNG, and the harness's own larger gradient
 *  PNG: the F3 change leg needs two image payloads with different bytes. */
const ONE_BY_ONE_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const GRADIENT_PNG = () => readFileSync(new URL("../../reference-harness/browser/files/gradient.png", import.meta.url));

/** Loopback guard shared by every check here: the module stages fixtures and
 *  reads the owned local deck, so it never attaches to a remote target. */
const assertLocal = (origin) => {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)) {
    throw Error("capability-legs checks require the disposable loopback fixture");
  }
};

const isLocal = (origin) => ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname);

/** Tracks a fixture name for cleanup and creates it through the canonical
 *  typed-fixture form flow (the cover-b `create` helper's contract). */
const makeFixture = (ctx) => async (name, content = "", type = "RichText") => {
  if (!ctx.created.includes(name)) ctx.created.push(name);
  return createTypedFixture(ctx, { type, name, content });
};

/** Creates the requested card through the /new/<Type> form, as a person does,
 *  and reports the landing URL the form answered with (the C1/C2 legs). */
async function createThroughNewForm(ctx, { type, name, content = "" }) {
  const { page, stack } = ctx;
  const opened = await page.goto(`${stack.origin}/new/${encodeURIComponent(type)}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const form = page.locator("form.card-form").filter({ has: page.locator('input[name="card[name]"]') }).first();
  if ((await form.count()) === 0) return { openedStatus: opened.status(), formOffered: false };
  await form.locator('input[name="card[name]"]').first().fill(name);
  const contentField = form.locator('[name="card[content]"]').first();
  if (content !== "" && (await contentField.count()) > 0) {
    const isTiny = await contentField.evaluate((el) => el.classList.contains("tinymce-textarea"));
    if (isTiny) {
      const id = await contentField.getAttribute("id");
      await page.waitForFunction((editorId) => Boolean(window.tinymce?.get(editorId)), id, { timeout: 20_000 });
      await page.evaluate(([editorId, text]) => { const editor = window.tinymce.get(editorId); editor.setContent(text); editor.save(); }, [id, content]);
    } else if (await contentField.isVisible()) {
      await contentField.fill(content);
    }
  }
  const before = ctx.ledger().length;
  const action = new URL(await form.getAttribute("action"), stack.origin);
  const pending = page.waitForResponse((r) => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST", { timeout: 60_000 })
    .then((response) => ({ response }), (error) => ({ error }));
  await form.locator(".create-submit-button").first().click();
  const seen = await pending;
  if (seen.error) throw seen.error;
  await seen.response.finished();
  return {
    openedStatus: opened.status(),
    formOffered: true,
    writeStatus: seen.response.status(),
    landedPath: decodeURIComponent(new URL(page.url()).pathname),
    expectedPath: `/${name}`,
    stored: fixtureCard(ctx.database(), name) ?? null,
    lines: ctx.linesSince(before).filter((l) => l.method !== "GET").map((l) => ({ path: l.path?.slice(0, 80), status: l.status })),
  };
}

export const meta = {
  topic: "caps-legs",
  capabilityIds: ["C1", "C2", "C6", "N6", "C8", "E20", "E21", "E3", "F3", "H1", "M1", "N2", "N9", "P5", "P6", "R1", "S3", "S4", "S5"],
};

export const capabilityChecks = {
  C1: ["create a RichText card via /new/RichText and land on its new card page"],
  C2: ["create a Basic card through /new/Basic and a Date card through /new/Date (both stored)"],
  C6: ["search for a nonexistent name offers a result-specific create link"],
  N6: ["search for a nonexistent name offers a result-specific create link"],
  C8: ["creating a card whose name already exists shows a visible validation error"],
  E20: ["the Engage tab shows follow, advanced, followers, all followed cards, and discussion"],
  E21: ["the board History tab lists the run's change as a pill"],
  E3: ["the TinyMCE nest plugin is served and opens the nest editor"],
  F3: ["F3 an uploaded image can be changed through the Image edit form"],
  H1: ["the history page renders one act entry per stored act (count asserted)"],
  M1: ["the RichText editor toolbar applies formats and lists and offers table and insert"],
  N2: [
    "JSON CQL AND and OR conjunctions return the expected members",
    "JSON CQL != operator, deprecated view= key, and right-relation scope answer as specified",
  ],
  N9: ["N9 the applied layout renders header, body, and footer around the User card"],
  P5: [
    "P5 *right Set: a +*right+*structure rule renders for members of the set and not outside it",
    "P5 *type_plus_right Set: a +*type_plus_right+*structure rule renders for members and not outside the set",
    "P5 Self Set: a +*self+*structure rule renders on that card and not on a sibling",
  ],
  P6: ["P6 an administrator sets the set's update rule from the Rules tab and the member's write follows it"],
  R1: ["rename through the board's name row updates the card's referers"],
  S3: ["sign-in with an empty email is refused (no session)"],
  S4: ["the sign-in page's reset-password link opens the reset form"],
  S5: ["the denial's sign-in link renders the credential form (email and password fields)"],
};

async function runCapabilityLegChecks(ctx) {
  const { stack, page, creds, record, visit, signIn, database, created, captureEvidence, linesSince, ledger } = ctx;
  assertLocal(stack.origin);
  const create = makeFixture(ctx);
  const name = (label) => `Harness_Leg_${label}_${Date.now().toString(36)}`;
  const admin = creds.admin;
  const member = creds.member;
  const bodyText = () => page.evaluate(() => document.body.innerText);
  const group = ctx.group ?? ((n) => console.log(`\n== ${n}`));
  // This deck's default cardtype carries codename "basic" but is NAMED
  // something else (typed-fixture.mjs: "the ordinary card named basic is not
  // a cardtype"). CQL {"type": ...} and *type_plus_right set names resolve
  // the cardtype CARD's name, so both are read, never assumed.
  const basicTypeName = database().prepare("SELECT name FROM cards WHERE codename='basic' AND trash=0").get()?.name ?? null;

  // ------------------------------------------------------------------- C1
  // journeys create-note-member, first leg the 2026-10-20 grind named: the
  // create succeeds but the bound check never asserts the reported landing.
  // Ruby's journey ends on the new card's page. The port's /new form creates
  // through an AJAX slot write (try1: POST /card/create?slot[view]=new
  // answers 200 with the URL unchanged), so the landing is graded on what
  // the person then SEES: the new card's identity in the main slot — with
  // the URL named alongside in the evidence.
  group("caps-legs. C1 landing after create");
  await ctx.attempt(capabilityChecks.C1[0], async () => {
    await signIn(admin);
    const rich = name("landing");
    created.push(rich);
    const outcome = await createThroughNewForm(ctx, { type: "RichText", name: rich });
    // The landing is the AJAX slot update (URL stays on /new/RichText), so
    // the card's identity arriving in #main is the settled state — waited
    // for, not raced (try3 read it 1.5 s in and missed it; try2 caught it).
    const storedRow = fixtureCard(database(), rich);
    const mainCarriesCard = storedRow != null && await page.locator(`#main [data-card-id="${storedRow.id}"], #main[data-card-id="${storedRow.id}"]`)
      .first().waitFor({ state: "attached", timeout: 20_000 }).then(() => true, () => false);
    const urlLanded = outcome.landedPath === `/${rich}`;
    record(capabilityChecks.C1[0],
      outcome.formOffered && outcome.writeStatus !== undefined && outcome.writeStatus < 400 && outcome.stored != null
        && (urlLanded || mainCarriesCard),
      { ...outcome, urlLanded, mainCarriesCard, raw: captureEvidence(await page.content(), { check: "caps-legs-c1-landing", name: rich }) });
  });

  // ------------------------------------------------------------------- C2
  // journeys create-phrase-admin + cypress presetting: the grind found the
  // bound checks only OPEN the /new/Basic and /new/Date forms. This leg
  // creates one card of each through those forms. The stored row's type
  // must equal the type the FORM itself assigned (this deck carries a
  // cardtype literally named "Basic" alongside the codename-basic RichText
  // cardtype — try1 measured type_id 39120 from the /new/Basic form), so
  // the expectation is read off the form, never assumed from a codename.
  group("caps-legs. C2 create through /new/Basic and /new/Date");
  await ctx.attempt(capabilityChecks.C2[0], async () => {
    await signIn(admin);
    const legs = {};
    for (const type of ["Basic", "Date"]) {
      const card = name(`typed_${type.toLowerCase()}`);
      created.push(card);
      const opened = await page.goto(`${stack.origin}/new/${encodeURIComponent(type)}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const form = page.locator("form.card-form").filter({ has: page.locator('input[name="card[name]"]') }).first();
      if ((await form.count()) === 0) { legs[type] = { openedStatus: opened.status(), formOffered: false }; continue; }
      const assignedTypeId = Number(await form.locator('[name="card[type_id]"]').first().inputValue().catch(() => NaN));
      await form.locator('input[name="card[name]"]').first().fill(card);
      const before = ledger().length;
      const action = new URL(await form.getAttribute("action"), stack.origin);
      const pending = page.waitForResponse((r) => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST", { timeout: 60_000 })
        .then((response) => ({ response }), (error) => ({ error }));
      await form.locator(".create-submit-button").first().click();
      const seen = await pending;
      if (seen.error) throw seen.error;
      await seen.response.finished();
      const storedRow = fixtureCard(database(), card) ?? null;
      const storedType = storedRow === null ? null : database().prepare("SELECT c.type_id, t.name AS type_name FROM cards c LEFT JOIN cards t ON t.id=c.type_id WHERE c.id=?").get(storedRow.id);
      legs[type] = {
        openedStatus: opened.status(),
        formOffered: true,
        assignedTypeId,
        assignedTypeName: Number.isFinite(assignedTypeId) ? database().prepare("SELECT name FROM cards WHERE id=?").get(assignedTypeId)?.name ?? null : null,
        writeStatus: seen.response.status(),
        stored: storedRow != null,
        storedTypeId: storedType?.type_id ?? null,
        storedTypeName: storedType?.type_name ?? null,
        storedMatchesFormAssignment: storedRow != null && storedType?.type_id === assignedTypeId,
      };
    }
    const ok = ["Basic", "Date"].every((t) => legs[t].formOffered && legs[t].writeStatus < 400 && legs[t].stored && legs[t].storedMatchesFormAssignment);
    record(capabilityChecks.C2[0], ok, legs);
  });

  // ---------------------------------------------------------------- C6, N6
  // The grind found the whole-page create/new regex can match unrelated
  // navbar chrome. The oracle surface is the search box's own completion
  // (card-mod-search set/self/search.rb:70-72 view :search_box_complete =
  // search_box_items :search_item, :add_item; :100-106 add_item yields
  // action "add" only when exact.add_autocomplete_ok?, with url = the new
  // card's own path) — the link must NAME the searched term and OPEN the
  // create form carrying that name.
  group("caps-legs. C6/N6 result-specific create offer");
  await ctx.attempt(capabilityChecks.C6[0], async () => {
    await signIn(admin);
    const missing = `zzq harness result specific ${Date.now().toString(36)}`;
    const answer = await page.evaluate(async (url) => {
      const r = await fetch(url, { credentials: "include" });
      return { status: r.status, body: await r.text() };
    }, `${stack.origin}/*search/search_box_complete.json?term=${encodeURIComponent(missing)}`);
    let items = [];
    try { items = JSON.parse(answer.body); } catch { /* a non-JSON body fails below */ }
    const addItem = items.find((i) => i?.action === "add");
    const createLink = typeof addItem?.url === "string" ? addItem.url : null;
    const underscored = missing.toLowerCase().replaceAll(" ", "_");
    // The destination leg: the offered URL opens the create form prefilled
    // with the searched name — a navbar link cannot pass this.
    let destination = null;
    if (createLink !== null) {
      const dest = await page.goto(new URL(createLink, stack.origin).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(1200);
      destination = {
        status: dest.status(),
        nameFieldValue: await page.locator('input[name="card[name]"]').first().inputValue().catch(() => null),
        formOffered: (await page.locator("form.card-form, form#new_card").count()) > 0,
        createFormAction: await page.evaluate(() => document.querySelector("form#new_card[action='/card/create'], form.card-form[action='/card/create']")?.getAttribute("action") ?? null),
      };
    }
    const norm = (t) => (t ?? "").toLowerCase().replaceAll("_", " ").replace(/%20/g, " ").trim();
    const destinationCarriesTerm = destination !== null
      && destination.status === 200 && destination.formOffered
      && (norm(destination.nameFieldValue).includes(norm(missing)) || norm(createLink).includes(norm(missing)));
    record(capabilityChecks.C6[0],
      answer.status === 200 && addItem !== undefined
        && createLink !== null && createLink.toLowerCase().includes(underscored)
        && addItem.value === missing
        && destinationCarriesTerm,
      { status: answer.status, actions: items.map((i) => i?.action), addItem: { url: createLink, value: addItem?.value ?? null }, destination, destinationCarriesTerm, raw: captureEvidence(await page.content(), { check: "caps-legs-c6-destination" }) });
  });

  // ------------------------------------------------------------------- C8
  // journeys create-duplicate-name-admin: the refusal is graded, but the
  // bound check never asserts the VISIBLE validation error the editor shows.
  group("caps-legs. C8 visible duplicate-name error");
  await ctx.attempt(capabilityChecks.C8[0], async () => {
    await signIn(admin);
    await visit("/new/RichText");
    await page.locator('form.card-form input[name="card[name]"]').first().fill("Home");
    const before = ledger().length;
    await page.locator('form.card-form button[type="submit"], form.card-form input[type="submit"]').first().click().catch(() => undefined);
    await page.waitForTimeout(2500);
    const write = linesSince(before).find((l) => l.method !== "GET");
    const visibleError = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll(".error, .alert, .invalid-feedback, .card-form .help-block, [class*='error']")]
        .filter((el) => el.offsetParent !== null || el.getClientRects().length > 0)
        .map((el) => el.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
      return { nodes: nodes.slice(0, 4), bodyMentions: /Problems with|already|exist|taken/i.test(document.body.innerText) };
    });
    const homeStillThere = (await visit("/Home")).status === 200;
    record(capabilityChecks.C8[0],
      write !== undefined && write.status >= 400 && (visibleError.nodes.length > 0 || visibleError.bodyMentions) && homeStillThere,
      { writeStatus: write?.status ?? null, visibleError, homeStillThere, raw: captureEvidence(await page.content(), { check: "caps-legs-c8-visible-error", name: "Home" }) });
  });

  // ------------------------------------------------------------------- E20
  // cypress edit/board/engage_tab (6 specs): follow button, advanced, all
  // followed cards, followers, discussion. The bound check reads only a
  // /follow|watch|discussion/ regex over the tab's bytes. The port renders
  // the section itself (card-mod-edit.ts follow_section: data-cy
  // follow-advanced / followers / follow-overview) plus the discussion nest
  // (engage_tab_view, tab_views.rb:2-5 discussion_section).
  group("caps-legs. E20 engage tab breadth");
  await ctx.attempt(capabilityChecks.E20[0], async () => {
    await signIn(admin);
    const engageCard = name("engage");
    await create(engageCard, "Harness engage body", "Basic");
    const board = await visit(`/${engageCard}/board`);
    await page.waitForTimeout(1500);
    const tab = page.locator(".board .nav-link", { hasText: "Engage" }).first();
    if ((await tab.count()) === 0) {
      record(capabilityChecks.E20[0], false, { boardStatus: board.status, note: "no Engage tab on the board" });
      return;
    }
    await tab.click().catch(() => undefined);
    await page.waitForTimeout(2000);
    const controls = await page.evaluate(() => {
      const pane = document.querySelector("._engage-tab") ?? document.querySelector(".board");
      const q = (sel) => pane?.querySelector(sel) ?? null;
      const follow = q("a.follow-link");
      return {
        follow: follow === null ? null : { text: follow.textContent.replace(/\s+/g, " ").trim(), href: follow.getAttribute("href")?.slice(0, 120) },
        advanced: q('[data-cy="follow-advanced"]') !== null,
        followers: (() => { const el = q('[data-cy="followers"]'); return el === null ? null : el.textContent.replace(/\s+/g, " ").trim(); })(),
        overview: (() => { const el = q('[data-cy="follow-overview"]'); return el === null ? null : el.textContent.replace(/\s+/g, " ").trim(); })(),
        discussionMentioned: /discussion/i.test(pane?.innerText ?? ""),
        paneText: (pane?.innerText ?? "").replace(/\s+/g, " ").slice(0, 300),
      };
    });
    record(capabilityChecks.E20[0],
      board.status === 200 && controls.follow !== null && controls.advanced
        && typeof controls.followers === "string" && /follower/i.test(controls.followers)
        && controls.overview === "all followed cards"
        && controls.discussionMentioned,
      { card: engageCard, boardStatus: board.status, controls, raw: captureEvidence(await page.content(), { check: "caps-legs-e20-engage", name: engageCard }) });
  });

  // ------------------------------------------------------------------- E21
  // cypress edit/board/history_tab: the board History tab lists changes as
  // PILLS (tab_views.rb act_link_list -> board_pills, one li per act, each
  // a data-bs-toggle="pill" anchor). The bound check reads only the tab
  // links; the grind's companion proved the act id but not the pill shape.
  group("caps-legs. E21 history pills");
  await ctx.attempt(capabilityChecks.E21[0], async () => {
    await signIn(admin);
    const hist = name("pills");
    await create(hist, "history pills fixture, first state");
    const card = fixtureCard(database(), hist);
    const expectedActId = database().prepare("SELECT card_act_id FROM card_actions WHERE card_id=? ORDER BY id DESC LIMIT 1").get(card.id)?.card_act_id;
    if (!expectedActId) throw Error("fresh history fixture has no recorded act");
    await visit(`/${hist}/board`);
    await page.waitForTimeout(1500);
    const tab = page.locator('.board a.nav-link[data-url$="/history_tab"]').first();
    const href = await tab.getAttribute("data-url");
    const pending = page.waitForResponse((r) => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === new URL(href, stack.origin).pathname, { timeout: 15000 })
      .then((response) => ({ response }), (error) => ({ error }));
    await tab.click();
    const seen = await pending;
    if (seen.error) throw seen.error;
    await seen.response.finished();
    const history = page.locator('.board .history_tab-view[data-card-id="' + card.id + '"]');
    await history.waitFor({ state: "visible", timeout: 10000 });
    const pills = await history.locator('a[data-bs-toggle="pill"][href*="board_act?act_id="]').evaluateAll((links) =>
      links.map((a) => Number(new URL(a.href).searchParams.get("act_id"))));
    record(capabilityChecks.E21[0],
      seen.response.status() === 200 && pills.includes(Number(expectedActId)) && pills.length >= 1,
      { card: hist, cardId: card.id, expectedActId, pillActIds: pills, tabStatus: seen.response.status(), raw: captureEvidence(await page.content(), { check: "caps-legs-e21-pills", name: hist }) });
  });

  // ------------------------------------------------------------------- E3
  // cypress edit/nest_editor: the nest editor plugin must not merely draw a
  // toolbar button — its UI must be SERVED and open. The bound checks assert
  // editor presence and a button node; this leg clicks the nest button and
  // requires the nest editor dialog (input._nest-name) the plugin serves.
  group("caps-legs. E3 nest plugin served and opens");
  await ctx.attempt(capabilityChecks.E3[0], async () => {
    await signIn(admin);
    const edCard = name("nestplugin");
    await create(edCard, "Harness nest plugin body", "RichText");
    await visit(`/${edCard}`);
    await page.locator('a.edit-link[href$="/edit"]').first().dispatchEvent("click").catch(() => undefined);
    await page.waitForSelector("#edit_card, .modal", { timeout: 20_000 }).catch(() => undefined);
    const editorId = await focusRichEditor(page);
    const before = await page.evaluate((id) => {
      const ed = window.tinymce?.get(id);
      return {
        active: ed?.initialized === true,
        plugins: ed ? Object.keys(ed.plugins ?? {}) : [],
        nestButton: ed?.editorContainer ? ed.editorContainer.querySelectorAll("[title='Insert/edit nest'], button[title*='nest'], button[aria-label*='nest']").length : 0,
      };
    }, editorId);
    let dialogOpened = false;
    if (before.nestButton > 0) {
      await page.locator(".tox-tinymce [title='Insert/edit nest'], .tox-tinymce button[title*='nest']").first().click().catch(() => undefined);
      dialogOpened = await page.locator('.modal.show input._nest-name, .modal.show .modal_nest_editor-view').first().waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false);
      await page.keyboard.press("Escape").catch(() => undefined);
    }
    record(capabilityChecks.E3[0], before.active === true && before.nestButton > 0 && dialogOpened,
      { editorId, ...before, dialogOpened, raw: captureEvidence(await page.content(), { check: "caps-legs-e3-plugin" }) });
    await page.keyboard.press("Escape").catch(() => undefined);
  });

  // ------------------------------------------------------------------- F3
  // cucumber attach "Uploading and changing an image" — the scenario F3
  // cites names BOTH halves; the bound check carries only the upload. This
  // leg uploads through the Image create form, then changes the image
  // through the card's edit form, and requires the stored file's bytes to
  // move (digest before != digest after).
  group("caps-legs. F3 upload and change");
  await ctx.attempt(capabilityChecks.F3[0], async () => {
    await signIn(admin);
    const img = name("changeimg");
    created.push(img);
    await visit("/new/Image");
    const fileInput = page.locator('#main input[type="file"], form.card-form input[type="file"]').first();
    if ((await fileInput.count()) === 0) {
      record(capabilityChecks.F3[0], false, { note: "the Image create form offers no file input" });
      return;
    }
    await page.locator('form.card-form input[name="card[name]"]').first().fill(img).catch(() => undefined);
    await fileInput.setInputFiles({ name: "harness-first.png", mimeType: "image/png", buffer: Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64") }).catch(() => undefined);
    const before = ledger().length;
    await page.locator('form.card-form button[type="submit"]').first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    const createWrite = linesSince(before).find((l) => l.method !== "GET");
    const storedRow = fixtureCard(database(), img);
    const refBefore = storedRow?.db_content ?? null;
    const fetchBefore = refBefore ? await page.request.get(stack.origin + "/files/" + refBefore) : null;
    const bytesBefore = fetchBefore ? await fetchBefore.body() : null;
    // The change half: the card's own edit form offers a new upload.
    await visit(`/${img}?view=edit`);
    const editInput = page.locator('form.card-form input[type="file"]').first();
    const editInputOffered = (await editInput.count()) > 0;
    let changeWrite = null, refAfter = null, bytesAfter = null;
    if (editInputOffered) {
      await editInput.setInputFiles({ name: "gradient.png", mimeType: "image/png", buffer: GRADIENT_PNG() }).catch(() => undefined);
      // The draft-upload carrier arrives with the preview HTML; wait for it
      // so the save submits the replacement (the F4 check's mechanism).
      await page.waitForFunction(() => /^\d+$/.test(document.querySelector('input[name="card[action_id_of_cached_upload]"]')?.value ?? ""), undefined, { timeout: 15_000 }).catch(() => undefined);
      const form = editInput.locator("xpath=ancestor::form").first();
      const actionPath = new URL(await form.getAttribute("action"), stack.origin).pathname;
      const pending = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === actionPath, { timeout: 30_000 })
        .then((response) => ({ response }), (error) => ({ error }));
      await form.locator(".submit-button, button[type='submit']").first().click({ timeout: 10_000 }).catch(() => undefined);
      const seen = await pending;
      if (!seen.error) { await seen.response.finished(); changeWrite = seen.response.status(); }
      const rowAfter = fixtureCard(database(), img);
      refAfter = rowAfter?.db_content ?? null;
      const fetchAfter = refAfter ? await page.request.get(stack.origin + "/files/" + refAfter) : null;
      bytesAfter = fetchAfter ? await fetchAfter.body() : null;
    }
    const changed = bytesBefore !== null && bytesAfter !== null && fileDigest(bytesBefore) !== fileDigest(bytesAfter);
    record(capabilityChecks.F3[0],
      createWrite !== undefined && createWrite.status < 400 && storedRow != null
        && editInputOffered && changeWrite !== null && changeWrite < 400 && changed,
      { card: img, createWriteStatus: createWrite?.status ?? null, refBefore, refAfter, editInputOffered, changeWriteStatus: changeWrite, digestBefore: bytesBefore ? fileDigest(bytesBefore) : null, digestAfter: bytesAfter ? fileDigest(bytesAfter) : null, changed });
  });

  // ------------------------------------------------------------------- H1
  // journeys history-view-admin: the bound check records the act-like node
  // count but never asserts it. Ruby's history page lists the card's acts —
  // one accordion entry per stored act — so the rendered act entry count
  // must EQUAL the stored act count read from the owned deck.
  group("caps-legs. H1 act count asserted");
  await ctx.attempt(capabilityChecks.H1[0], async () => {
    await signIn(admin);
    const hist = name("actcount");
    await create(hist, "act count fixture, creation act");
    const card = fixtureCard(database(), hist);
    // Two more acts through the card's own update route.
    for (const text of ["act count fixture, second state", "act count fixture, third state"]) {
      await page.context().request.post(`${stack.origin}/update/${encodeURIComponent(hist)}`, {
        headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({ "card[content]": text, "success[redirect]": "true" }).toString(),
        maxRedirects: 0,
      });
    }
    const storedActs = Number(database().prepare("SELECT COUNT(DISTINCT card_act_id) AS n FROM card_actions WHERE card_id=?").get(card.id)?.n ?? 0);
    const v = await visit(`/${hist}/history`);
    const renderedActs = await page.evaluate(() => document.querySelectorAll("button.accordion-button[data-bs-target^='#act-id-']").length);
    record(capabilityChecks.H1[0], v.status === 200 && storedActs >= 3 && renderedActs === storedActs,
      { card: hist, status: v.status, storedActs, renderedActs, note: "rendered act entries must equal the card's stored act count" });
  });

  // ------------------------------------------------------------------- M1
  // cypress edit/nest_editor: formats, lists, table, insert menu. The bound
  // check loads the editor; the grind's companion asserts button presence.
  // This leg OPERATES the controls: bold and bullet-list apply to the
  // editor's content, and the Insert menu opens with the deck's insert
  // items; table is graded as offered (toolbar or Insert menu).
  group("caps-legs. M1 toolbar operations");
  await ctx.attempt(capabilityChecks.M1[0], async () => {
    await signIn(admin);
    const tb = name("toolbarops");
    await create(tb, "Harness toolbar operations body", "RichText");
    await visit(`/${tb}`);
    await page.locator('a.edit-link[href$="/edit"]').first().dispatchEvent("click").catch(() => undefined);
    await page.waitForSelector("#edit_card, .modal", { timeout: 20_000 }).catch(() => undefined);
    const editorId = await focusRichEditor(page);
    await page.evaluate((id) => { const ed = window.tinymce?.get(id); if (ed) { ed.setContent("Harness operate me"); ed.focus(); } }, editorId);
    const clickButton = async (titleRe) => page.evaluate(([id, reSource]) => {
      const ed = window.tinymce?.get(id);
      const re = new RegExp(reSource, "i");
      const btn = [...(ed?.editorContainer?.querySelectorAll("button, .tox-tbtn") ?? [])].find((b) => re.test(`${b.getAttribute("title") ?? ""} ${b.getAttribute("aria-label") ?? ""}`));
      if (btn) { btn.click(); return true; }
      return false;
    }, [editorId, titleRe.source]);
    const selectAll = () => page.evaluate((id) => { const ed = window.tinymce?.get(id); if (ed) { ed.focus(); ed.selection.select(ed.getBody(), true); } }, editorId);
    await selectAll();
    const boldClicked = await clickButton(/^bold/i);
    await page.waitForTimeout(600);
    await selectAll();
    const listClicked = await clickButton(/bullet list|unordered list/i);
    await page.waitForTimeout(600);
    const content = await page.evaluate((id) => window.tinymce?.get(id)?.getContent() ?? "", editorId);
    // The Insert menu: the menubar's own Insert item (imageDialogJourney's
    // mechanism), then the menu items it serves.
    let insertItems = [];
    const insertOpened = await page.evaluate((id) => {
      const ed = window.tinymce?.get(id);
      const item = [...(ed?.editorContainer?.querySelectorAll(".tox-mbtn, [role=menuitem], button") ?? [])]
        .find((b) => /^insert$/i.test((b.textContent ?? "").trim()) || /^insert$/i.test(b.getAttribute("aria-label") ?? ""));
      if (item) { item.click(); return true; }
      return false;
    }, editorId);
    if (insertOpened) {
      await page.waitForTimeout(1000);
      insertItems = await page.evaluate(() => [...document.querySelectorAll(".tox-menu [role=menuitem], .tox-menu .tox-mbtn, .tox-selected-menu [role=menuitem]")]
        .map((el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 14));
      await page.keyboard.press("Escape").catch(() => undefined);
    }
    const tableOffered = await page.evaluate((id) => {
      const ed = window.tinymce?.get(id);
      const hay = [...(ed?.editorContainer?.querySelectorAll("[title], [aria-label]") ?? [])].map((b) => `${b.getAttribute("title") ?? ""} ${b.getAttribute("aria-label") ?? ""}`);
      return hay.some((t) => /table/i.test(t));
    }, editorId) || insertItems.some((t) => /table/i.test(t));
    // The dependency context for a table miss: the deck's own *TinyMCE
    // setting names the table plugin and menubar entry Ruby's editor serves.
    const tinyMceConfig = database().prepare("SELECT db_content FROM cards WHERE codename='tiny_mce' AND trash=0").get()?.db_content ?? null;
    record(capabilityChecks.M1[0],
      editorId != null && boldClicked && listClicked && /<strong>/i.test(content) && /<ul>/i.test(content)
        && insertOpened && insertItems.length > 0 && tableOffered,
      { editorId, boldClicked, listClicked, contentHead: content.slice(0, 160), insertOpened, insertItems, tableOffered,
        deckTinyMceConfig: tinyMceConfig === null ? null : { pluginsHead: (tinyMceConfig.match(/"plugins":\s*"([^"]*)"/) ?? [])[1] ?? null, menubarHead: (tinyMceConfig.match(/"menubar":\s*"([^"]*)"/) ?? [])[1] ?? null },
        raw: captureEvidence(await page.content(), { check: "caps-legs-m1-toolbar" }) });
    await page.keyboard.press("Escape").catch(() => undefined);
  });

  // ------------------------------------------------------------------- N2
  // cucumber navbox "cql search": the grind residue is operator breadth —
  // the bound checks drive only type+name shapes. Ruby's query.rb defines
  // conjunction clauses ("or"/"and" keys), operators on values (["!=", x]),
  // the deprecated "view" key, and relational scopes (right/left). The
  // engine's own tables are the parity contract (src/cql/constants.ts,
  // OPERATORS / CONJUNCTIONS / DEPRECATED_KEYS / relational keys).
  group("caps-legs. N2 CQL operator breadth");
  if (!basicTypeName) throw Error("the deck's default cardtype (codename basic) is unavailable for CQL fixtures");
  await ctx.attempt(capabilityChecks.N2[0], async () => {
    await signIn(admin);
    const stampA = name("conja"), stampB = name("conjb");
    await create(stampA, "Harness conjunction alpha body", "Basic");
    await create(stampB, "Harness conjunction beta body", "Basic");
    const submitCql = async (query) => {
      await page.goto(stack.origin + "/", { waitUntil: "load" });
      const input = page.locator('form.search-box-form input[name="query[keyword]"]:visible').first();
      const json = JSON.stringify(query);
      await input.fill(json);
      const pending = page.waitForResponse((r) => { const u = new URL(r.url()); return u.origin === stack.origin && u.pathname === "/*search" && u.searchParams.get("query[keyword]") === json && r.request().method() === "GET"; }, { timeout: 20_000 })
        .then((response) => ({ response }), (error) => ({ error }));
      await input.press("Enter");
      const seen = await pending;
      if (seen.error) throw seen.error;
      await seen.response.finished();
      await page.waitForURL((u) => u.pathname === "/*search" && u.searchParams.get("query[keyword]") === json, { waitUntil: "load", timeout: 20_000 });
      const names = await page.locator("#main .search-result-item").evaluateAll((items) =>
        items.map((item) => item.querySelector(".card-slot[data-card-name]")?.getAttribute("data-card-name")).filter(Boolean));
      return { query: json, status: seen.response.status(), names };
    };
    // AND (the default conjunction): both conditions must hold.
    const andRun = await submitCql({ "type": basicTypeName, "name": stampA });
    // OR clause: either condition holds ("or" is a clause key, query.rb
    // CONJUNCTIONS; "match" is the content match attribute, ~ operator).
    const orRun = await submitCql({ "or": { "name": stampA, "match": "conjunction beta" } });
    record(capabilityChecks.N2[0],
      andRun.status === 200 && andRun.names.length === 1 && andRun.names[0] === stampA
        && orRun.status === 200 && orRun.names.length === 2
        && orRun.names.includes(stampA) && orRun.names.includes(stampB),
      { andRun, orRun, raw: captureEvidence(await page.content(), { check: "caps-legs-n2-conjunctions" }) });
  });

  await ctx.attempt(capabilityChecks.N2[1], async () => {
    await signIn(admin);
    const token = `legtok${Date.now().toString(36)}`;
    const base = name("operator"), mate = name("operatormate");
    await create(base, `Harness ${token} one`, "Basic");
    await create(mate, `Harness ${token} two`, "Basic");
    const junctionRight = name("rightleg");
    created.push(junctionRight);
    await create(`${base}+${junctionRight}`, "junction one", "Phrase");
    await create(`${mate}+${junctionRight}`, "junction two", "Phrase");
    const submitCql = async (query) => {
      await page.goto(stack.origin + "/", { waitUntil: "load" });
      const input = page.locator('form.search-box-form input[name="query[keyword]"]:visible').first();
      const json = JSON.stringify(query);
      await input.fill(json);
      const pending = page.waitForResponse((r) => { const u = new URL(r.url()); return u.origin === stack.origin && u.pathname === "/*search" && u.searchParams.get("query[keyword]") === json && r.request().method() === "GET"; }, { timeout: 20_000 })
        .then((response) => ({ response }), (error) => ({ error }));
      await input.press("Enter");
      const seen = await pending;
      if (seen.error) throw seen.error;
      await seen.response.finished();
      await page.waitForURL((u) => u.pathname === "/*search" && u.searchParams.get("query[keyword]") === json, { waitUntil: "load", timeout: 20_000 });
      const names = await page.locator("#main .search-result-item").evaluateAll((items) =>
        items.map((item) => item.querySelector(".card-slot[data-card-name]")?.getAttribute("data-card-name")).filter(Boolean));
      return { query: json, status: seen.response.status(), names };
    };
    // != on a value (query.rb OPERATORS: the ARRAY form ["!=", x] leads the
    // value list with the operator word — parser.ts parseArrayValue; the
    // object form try1 tried parses as a plain value, not an operator).
    const neRun = await submitCql({ "match": token, "name": ["!=", base] });
    // The deprecated "view" key (query.rb deprecated list) must be consumed
    // without error and change nothing.
    const viewRun = await submitCql({ "type": basicTypeName, "name": base, "view": "content" });
    // Relational scope: the junctions whose right is the fixture right.
    const rightRun = await submitCql({ "right": junctionRight });
    const neNamesOk = neRun.status === 200 && neRun.names.length === 1 && neRun.names[0] === mate;
    const viewOk = viewRun.status === 200 && viewRun.names.length === 1 && viewRun.names[0] === base;
    const rightOk = rightRun.status === 200 && rightRun.names.length === 2
      && rightRun.names.includes(`${base}+${junctionRight}`) && rightRun.names.includes(`${mate}+${junctionRight}`);
    record(capabilityChecks.N2[1], neNamesOk && viewOk && rightOk,
      { neRun, viewRun, rightRun, neNamesOk, viewOk, rightOk, raw: captureEvidence(await page.content(), { check: "caps-legs-n2-operators" }) });
  });

  // ------------------------------------------------------------------- N9
  // cypress layouts "visit User card with user layout": the open probe —
  // fixture markers wrong, or the applied layout genuinely does not render?
  // This check builds the layout the scenario builds (Ruby layouts spec
  // creates a layout card and points the card's rule at it) and grades the
  // header/body/footer markers the layout itself carries, in order.
  group("caps-legs. N9 applied layout renders around the User card");
  await ctx.attempt(capabilityChecks.N9[0], async () => {
    await signIn(admin);
    const stamp = Date.now().toString(36);
    const layout = `Harness_Leg_User_Layout_${stamp}`;
    const userCard = `Harness_Leg_User_${stamp}`;
    const ruleName = `${userCard}+*self+*layout`;
    for (const n of [layout, userCard, ruleName]) if (!created.includes(n)) created.push(n);
    const header = `Harness user layout header ${stamp}`;
    const footer = `Harness user layout footer ${stamp}`;
    const body = `Harness user body ${stamp}`;
    await createTypedFixture(ctx, { type: "Layout", name: layout, content: `${header}\n{{_main}}\n${footer}` });
    const opened = await page.goto(`${stack.origin}/new/User`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const form = page.locator("form.card-form").filter({ has: page.locator('input[name="card[name]"]') }).filter({ has: page.locator(".create-submit-button") }).first();
    const formOffered = (await form.count()) > 0;
    let createStatus = null;
    if (formOffered) {
      await form.locator('input[name="card[name]"]').first().fill(userCard).catch(() => undefined);
      const contentField = form.locator('[name="card[content]"]').first();
      if ((await contentField.count()) > 0) await contentField.fill(body).catch(() => undefined);
      const pending = page.waitForResponse((r) => new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST", { timeout: 60_000 })
        .then((response) => ({ response }), (error) => ({ error }));
      await form.locator(".create-submit-button").click();
      const seen = await pending;
      if (seen.error) throw seen.error;
      createStatus = seen.response.status();
    }
    const ruleWrite = await page.context().request.post(`${stack.origin}/update/${encodeURIComponent(ruleName)}`, {
      headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
      data: new URLSearchParams({ "card[content]": `[[${layout}]]`, "success[redirect]": "true" }).toString(),
      maxRedirects: 0,
    });
    const ruleStored = fixtureCard(database(), ruleName)?.db_content ?? null;
    // The User cardtype is a field-set type: its create form carries no
    // root content field (try1's body marker never stored), so the main
    // body this leg grades is written through the card's own update route
    // after the create.
    const bodyWrite = await page.context().request.post(`${stack.origin}/update/${encodeURIComponent(userCard)}`, {
      headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
      data: new URLSearchParams({ "card[content]": body, "success[redirect]": "true" }).toString(),
      maxRedirects: 0,
    });
    const bodyStored = fixtureCard(database(), userCard)?.db_content ?? null;
    const visited = await visit(`/${userCard}`);
    await page.waitForTimeout(1500);
    const userCardRow = fixtureCard(database(), userCard);
    const mainCarriesCard = userCardRow != null && await page.locator(`#main[data-card-id="${userCardRow.id}"], #main [data-card-id="${userCardRow.id}"]`).count() > 0;
    const rendered = await page.evaluate((marks) => {
      const text = document.body.innerText.replace(/\s+/g, " ");
      return {
        markers: Object.fromEntries(marks.map((m) => [m, text.includes(m)])),
        order: marks.map((m) => text.indexOf(m)),
      };
    }, [header, body, footer]);
    const [hIdx, , fIdx] = rendered.order;
    const layoutAroundMain = rendered.markers[header] === true && rendered.markers[footer] === true && hIdx >= 0 && fIdx > hIdx;
    record(capabilityChecks.N9[0],
      visited.status === 200 && createStatus !== null && createStatus < 400
        && layoutAroundMain && mainCarriesCard && rendered.markers[body] === true,
      { userCard, newUserRouteStatus: opened.status(), formOffered, createStatus, ruleName, ruleWriteStatus: ruleWrite.status(), ruleStored,
        bodyWriteStatus: bodyWrite.status(), bodyStored: bodyStored != null && bodyStored.includes(body), visitStatus: visited.status,
        mainCarriesCard, rendered, layoutOrder: rendered.order.join(","), layoutAroundMain, raw: captureEvidence(await page.content(), { check: "caps-legs-n9-user-layout", name: userCard }) });
  });

  // ------------------------------------------------------------------- P5
  // cypress rules (3 specs): *right Set, *type_plus_right Set, Self Set —
  // each a structure rule whose rendering claims the SET membership, so each
  // leg carries its own negative control (a card outside the set).
  group("caps-legs. P5 set legs with negative controls");
  await ctx.attempt(capabilityChecks.P5[0], async () => {
    await signIn(admin);
    const right = name("rightlegset");
    created.push(right);
    const outsideRight = name("otherleg");
    created.push(outsideRight);
    const member1 = name("rightmember1"), member2 = name("rightmember2"), outsider = name("rightoutsider");
    await create(`${member1}+${right}`, "member one own body", "Phrase");
    await create(`${member2}+${right}`, "member two own body", "Phrase");
    await create(`${outsider}+${outsideRight}`, "outsider own body", "Phrase");
    const rule = `${right}+*right+*structure`;
    created.push(rule);
    await create(rule, "Harness right-set header", "RichText");
    const readBody = async (cardName) => {
      const v = await visit(`/${cardName}`);
      const text = await bodyText();
      return { status: v.status, text };
    };
    const m1 = await readBody(`${member1}+${right}`);
    const m2 = await readBody(`${member2}+${right}`);
    const out = await readBody(`${outsider}+${outsideRight}`);
    const marker = "Harness right-set header";
    record(capabilityChecks.P5[0],
      m1.status === 200 && m2.status === 200 && m1.text.includes(marker) && m2.text.includes(marker)
        && out.status === 200 && !out.text.includes(marker),
      { rule, member1: { name: `${member1}+${right}`, status: m1.status, showsHeader: m1.text.includes(marker) },
        member2: { name: `${member2}+${right}`, status: m2.status, showsHeader: m2.text.includes(marker) },
        negativeControl: { name: `${outsider}+${outsideRight}`, status: out.status, showsHeader: out.text.includes(marker) },
        storedRule: fixtureCard(database(), rule)?.db_content ?? null });
  });

  await ctx.attempt(capabilityChecks.P5[1], async () => {
    await signIn(admin);
    if (!basicTypeName) throw Error("the deck's default cardtype (codename basic) is unavailable for the *type_plus_right set");
    const right = name("tpright");
    created.push(right);
    // The set names the cardtype CARD (codename basic, whatever this deck
    // named it) plus the right; the in-set member is a card OF that type.
    const rule = `${basicTypeName}+${right}+*type_plus_right+*structure`;
    created.push(rule);
    const inSet = name("tpinset");         // default-typed left + right -> in the set
    const wrongType = name("tpwrongtype"); // Phrase-typed left + right -> outside
    await create(`${inSet}+${right}`, "in-set own body", "Basic");
    await create(`${wrongType}+${right}`, "wrong-type own body", "Phrase");
    // try1: the /new form create of this three-segment rule name answered
    // 200 but stored nothing (the only rule kind of the three that refuses
    // the form route), so the rule is created through the engine's own
    // create route — the mechanism the P6 seed rule proves out. The probe
    // below isolates WHICH name depth first refuses, so a dependency
    // verdict names the exact layer and not the whole family.
    const post = (cardName, content) => page.context().request.post(stack.origin + "/card/create", {
      headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
      data: new URLSearchParams({ "card[name]": cardName, "card[type]": "Phrase", "card[content]": content, "success[redirect]": "true" }).toString(),
      maxRedirects: 0,
    }).then((r) => ({ status: r.status() }));
    const setName = `${basicTypeName}+${right}+*type_plus_right`;
    created.push(setName);
    const probeSet = await post(setName, "probe: the type_plus_right set card itself");
    const setStored = fixtureCard(database(), setName) !== undefined;
    const ruleWrite = await post(rule, "Harness type-plus-right header");
    const ruleStoredRow = fixtureCard(database(), rule) ?? null;
    if (ruleStoredRow === null) {
      record(capabilityChecks.P5[1], false, {
        note: "the *type_plus_right structure rule could not be created (POST /card/create answered but stored nothing): the set-render leg is unverifiable until the rule card can exist",
        rule, ruleWriteStatus: ruleWrite.status,
        setCard: { name: setName, probeStatus: probeSet.status, stored: setStored },
        selfAndRightRuleControls: "the +*self+*structure and +*right+*structure rule names store through the same routes (P5 Self Set and *right Set legs, this run)",
        marker: "Harness type-plus-right header",
        raw: captureEvidence(await page.content(), { check: "caps-legs-p5-tpr-rule-create" }),
      });
      return;
    }
    const marker = "Harness type-plus-right header";
    const inBody = await visit(`/${inSet}+${right}`);
    const inText = await bodyText();
    const wtVisit = await visit(`/${wrongType}+${right}`);
    const wtText = await bodyText();
    record(capabilityChecks.P5[1],
      inBody.status === 200 && inText.includes(marker) && wtVisit.status === 200 && !wtText.includes(marker),
      { rule, setType: basicTypeName, member: { name: `${inSet}+${right}`, status: inBody.status, showsHeader: inText.includes(marker) },
        negativeControl: { name: `${wrongType}+${right}`, status: wtVisit.status, showsHeader: wtText.includes(marker) },
        storedRule: fixtureCard(database(), rule)?.db_content ?? null });
  });

  await ctx.attempt(capabilityChecks.P5[2], async () => {
    await signIn(admin);
    const selfCard = name("selfset"), sibling = name("selfsibling");
    await create(selfCard, "self-set own body", "Basic");
    await create(sibling, "sibling own body", "Basic");
    const rule = `${selfCard}+*self+*structure`;
    created.push(rule);
    await create(rule, "Harness self-set header", "RichText");
    const marker = "Harness self-set header";
    const selfStatus = (await visit(`/${selfCard}`)).status;
    const selfText = await bodyText();
    const sibStatus = (await visit(`/${sibling}`)).status;
    const sibText = await bodyText();
    record(capabilityChecks.P5[2],
      selfStatus === 200 && selfText.includes(marker) && !selfText.includes("self-set own body")
        && sibStatus === 200 && !sibText.includes(marker) && sibText.includes("sibling own body"),
      { rule, selfCard: { status: selfStatus, showsHeader: selfText.includes(marker), showsOwnBody: selfText.includes("self-set own body") },
        negativeControl: { name: sibling, status: sibStatus, showsHeader: sibText.includes(marker), showsOwnBody: sibText.includes("sibling own body") },
        storedRule: fixtureCard(database(), rule)?.db_content ?? null });
  });

  // ------------------------------------------------------------------- P6
  // journeys rule-board-admin: the grind found the write half only OFFERED.
  // This leg sets the set's UPDATE rule from the Rules tab (the update pill
  // the bound check read), then grades the member's write verdict against
  // it — refused after, with the administrator's write still working.
  group("caps-legs. P6 update rule set from the Rules tab");
  await ctx.attempt(capabilityChecks.P6[0], async () => {
    assertLocal(stack.origin);
    const stamp = Date.now().toString(36);
    const cardName = `Harness_Leg_P6_${stamp}`;
    const secret = `P6_LEG_SECRET_${stamp}`;
    const selfSet = `${cardName}+*self`;
    const updateRule = `${selfSet}+*update`;
    created.push(cardName, updateRule);
    let adminB, memberB;
    try {
      adminB = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
      memberB = await ctx.launchBrowser({ origin: stack.origin, assetHosts: ctx.assetHosts });
      const signInActor = async (browser, account) => {
        await browser.page.goto(stack.origin + "/*signin", { waitUntil: "load" });
        await browser.page.fill('input[name="card[subcards][+*email][content]"]', account.email);
        await browser.page.fill('input[name="card[subcards][+*password][content]"]', account.password);
        const pending = browser.page.waitForResponse((r) => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: 20_000 })
          .then((response) => ({ response }), (error) => ({ error }));
        await browser.page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
        const seen = await pending;
        if (seen.error) throw seen.error;
        await seen.response.finished();
        if (seen.response.status() >= 400) throw Error("capability-legs P6 actor was not signed in");
      };
      await signInActor(adminB, admin);
      await signInActor(memberB, member);
      // The fixture card through the admin's create form (the POST is
      // awaited before storage is read — try1 raced it and read null).
      const opened = await adminB.page.goto(`${stack.origin}/new/RichText?card%5Bname%5D=${encodeURIComponent(cardName)}&card%5Bcontent%5D=${encodeURIComponent(secret)}`, { waitUntil: "domcontentloaded" });
      const form = adminB.page.locator("form.card-form").filter({ has: adminB.page.locator('input[name="card[name]"]') }).first();
      const createPending = adminB.page.waitForResponse((r) => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST", { timeout: 60_000 })
        .then((response) => ({ response }), (error) => ({ error }));
      await form.locator(".create-submit-button").click();
      const createSeen = await createPending;
      if (createSeen.error) throw createSeen.error;
      await createSeen.response.finished();
      if (!fixtureCard(database(), cardName)) throw Error(`P6 fixture card was not stored (form status ${opened.status()}, create POST status ${createSeen.response.status()})`);
      // Seed the update rule open ([[Anyone]]) so the member's BEFORE write
      // is a real positive control: the rule must MOVE for the leg to mean.
      const seed = await adminB.page.context().request.post(stack.origin + "/card/create", {
        headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({ "card[name]": updateRule, "card[type]": "Phrase", "card[content]": "[[Anyone]]", "success[redirect]": "true" }).toString(),
        maxRedirects: 0,
      });
      if (fixtureCard(database(), updateRule) === undefined) throw Error("P6 seed update rule was not stored (HTTP " + seed.status() + ")");

      /** One member write attempt through the card's own edit form. */
      const memberWrite = async () => {
        await memberB.page.goto(`${stack.origin}/${encodeURIComponent(cardName)}?view=edit`, { waitUntil: "load" });
        await memberB.page.waitForTimeout(1500);
        const editForm = memberB.page.locator("form.card-form").filter({ has: memberB.page.locator('[name="card[content]"]') }).first();
        if ((await editForm.count()) === 0) {
          return { refused: true, note: "no edit form offered to the member", body: (await memberB.page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200) };
        }
        const field = editForm.locator('[name="card[content]"]').first();
        const isTiny = await field.evaluate((el) => el.classList.contains("tinymce-textarea")).catch(() => false);
        const memberSecret = `${secret}_MEMBER_EDIT`;
        if (isTiny) {
          const id = await field.getAttribute("id");
          await memberB.page.waitForFunction((editorId) => Boolean(window.tinymce?.get(editorId)), id, { timeout: 20_000 });
          await memberB.page.evaluate(([editorId, text]) => { const ed = window.tinymce.get(editorId); ed.setContent(text); ed.save(); }, [id, memberSecret]);
        } else {
          await field.fill(memberSecret);
        }
        const action = new URL(await editForm.getAttribute("action"), stack.origin);
        const pending = memberB.page.waitForResponse((r) => new URL(r.url()).origin === stack.origin && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST", { timeout: 30_000 })
          .then((response) => ({ response }), (error) => ({ error }));
        await editForm.locator(".submit-button, button[type='submit']").first().click({ timeout: 10_000 }).catch(() => undefined);
        const seen = await pending;
        if (seen.error) return { refused: true, note: "the write never answered", error: String(seen.error).slice(0, 120) };
        await seen.response.finished();
        const stored = fixtureCard(database(), cardName)?.db_content ?? "";
        return { status: seen.response.status(), storedMemberEdit: stored.includes(memberSecret), storedSecretIntact: stored.includes(secret) };
      };
      const before = await memberWrite();
      const beforeRefused = before.refused === true || before.status >= 400;

      // The act: the administrator opens the Rules tab, selects the card's
      // self set, and sets the UPDATE rule to Administrator (the read leg's
      // exact mechanism, on the update pill).
      await adminB.page.goto(`${stack.origin}/${encodeURIComponent(cardName)}/board`, { waitUntil: "load" });
      await adminB.page.waitForTimeout(1500);
      const tabLink = adminB.page.locator(".board .nav-link", { hasText: "Rules" }).first();
      if ((await tabLink.count()) === 0) throw Error("P6 the card board offers no Rules tab");
      await tabLink.click().catch(() => undefined);
      await adminB.page.waitForTimeout(1500);
      const setSelect = adminB.page.locator(".board .rules_tab-view select[name='mark']").first();
      await setSelect.waitFor({ state: "attached", timeout: 15_000 });
      await adminB.page.locator(".board .rules_tab-view .select2-selection").first().click().catch(() => undefined);
      await adminB.page.getByRole("treeitem", { name: `The card "${cardName}"`, exact: true }).click().catch(() => undefined);
      await adminB.page.locator(".board a[href*='overlay_rule']").first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined);
      await adminB.page.waitForTimeout(1500);
      const pills = await adminB.page.evaluate(() => [...document.querySelectorAll(".card-slot._fixed-slot a[href*='overlay_rule'], .board a[href*='overlay_rule']")]
        .map((a) => ({ setting: (a.getAttribute("data-cy") ?? "").replace("-pill", "") || a.textContent.replace(/\s+/g, " ").trim().split(" ")[0], href: a.getAttribute("href") })));
      const updatePill = pills.find((p) => p.setting === "update");
      if (updatePill === undefined) {
        record(capabilityChecks.P6[0], false, { card: cardName, note: "the selected set lists no update rule pill", settings: pills.map((p) => p.setting), before });
        return;
      }
      await adminB.page.locator(`a[href="${updatePill.href}"]`).first().dispatchEvent("click").catch(() => undefined);
      const ruleFormLocator = adminB.page.locator("form.card-rule-form").first();
      await ruleFormLocator.waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined);
      const ruleForm = adminB.page.locator("form.card-rule-form").filter({ has: adminB.page.locator(`input[name="card[name]"][value="${updateRule}"]`) });
      const editor = (await ruleForm.count()) > 0 ? ruleForm.first() : ruleFormLocator;
      if ((await editor.count()) === 0) {
        record(capabilityChecks.P6[0], false, { card: cardName, ruleName: updateRule, note: "the update pill opened no card-rule-form", settings: pills.map((p) => p.setting), raw: captureEvidence(await adminB.page.content(), { check: "caps-legs-p6-update-rule-form", name: cardName }) });
        return;
      }
      const contentField = editor.locator('[name="card[content]"]').first();
      if ((await contentField.count()) === 0) {
        record(capabilityChecks.P6[0], false, { card: cardName, ruleName: updateRule, note: "the rule form offers no content field" });
        return;
      }
      const permissionEditor = editor.locator(".perm-editor");
      const wanted = "Administrator\r\n";
      if ((await permissionEditor.count()) > 0) {
        await permissionEditor.locator('input.perm-checkbox-button[value="Anyone"]').uncheck().catch(() => undefined);
        await permissionEditor.locator('input.perm-checkbox-button[value="Administrator"]').check().catch(() => undefined);
      } else {
        const isTiny = await contentField.evaluate((el) => el.classList.contains("tinymce-textarea"));
        if (isTiny) {
          const id = await contentField.getAttribute("id");
          await adminB.page.waitForFunction((editorId) => Boolean(window.tinymce?.get(editorId)), id, { timeout: 20_000 });
          await adminB.page.evaluate(([editorId, text]) => { const instance = window.tinymce.get(editorId); instance.setContent(text); instance.save(); }, [id, wanted]);
        } else {
          await contentField.fill(wanted);
        }
      }
      await editor.locator(`input[name="card[name]"][value="${updateRule}"]`).check().catch(() => undefined);
      const action = new URL(await editor.getAttribute("action"), stack.origin);
      const pending = adminB.page.waitForResponse((r) => new URL(r.url()).origin === stack.origin && r.request().method() === "POST" && [action.pathname, "/card/update"].includes(new URL(r.url()).pathname), { timeout: 20_000 })
        .then((response) => ({ response }), (error) => ({ error }));
      const save = editor.locator("button[data-cy='save']").first();
      await save.scrollIntoViewIfNeeded().catch(() => undefined);
      await save.click({ force: true, timeout: 15_000 }).catch(() => undefined);
      const observed = await pending;
      if (observed.error) {
        record(capabilityChecks.P6[0], false, { card: cardName, ruleName: updateRule, note: "the rule submit never answered", error: String(observed.error).slice(0, 120), before });
        return;
      }
      await observed.response.finished();
      const ruleStored = fixtureCard(database(), updateRule)?.db_content ?? null;
      const after = await memberWrite();
      const afterRefused = after.refused === true || after.status >= 400;
      const secretIntact = (fixtureCard(database(), cardName)?.db_content ?? "").includes(secret);
      record(capabilityChecks.P6[0],
        observed.response.status() < 400 && ruleStored === wanted
          && beforeRefused === false
          && afterRefused === true && secretIntact,
        { card: cardName, ruleName: updateRule, wanted,
          ruleWriteStatus: observed.response.status(), ruleStored,
          memberWriteBefore: before, memberWriteBeforeRefused: beforeRefused,
          memberWriteAfter: after, memberWriteAfterRefused: afterRefused, secretIntact,
          raw: captureEvidence(await memberB.page.content(), { check: "caps-legs-p6-member-after-update-rule", name: cardName }) });
    } finally {
      await memberB?.close().catch(() => {});
      await adminB?.close().catch(() => {});
    }
  });

  // ------------------------------------------------------------------- R1
  // journeys rename-topic-with-referers-admin: the bound check renames via
  // the board's name row but never reads the referers. This leg renames a
  // card that a referrer links ([[...]]) and requires the referrer to link
  // the NEW name afterwards.
  group("caps-legs. R1 referers follow the board rename");
  await ctx.attempt(capabilityChecks.R1[0], async () => {
    await signIn(admin);
    const original = name("renamee");
    const renamed = `${original}_renamed`;
    await create(original, "Harness rename body", "Basic");
    const referrer = name("referrer");
    await create(referrer, `[[${original}]]`, "RichText");
    await visit(`/${original}/board`);
    await page.waitForTimeout(2000);
    const rowLoc = page.locator(".board .edit_name_row-view, .board [id*='edit_name_row']").first();
    if ((await rowLoc.count()) === 0) {
      record(capabilityChecks.R1[0], false, { note: "no edit_name_row in the board" });
      return;
    }
    const edit = rowLoc.locator("a.edit-link, a[href$='/edit']").first();
    const href = await edit.getAttribute("href");
    const target = new URL(href, stack.origin);
    if (target.origin !== stack.origin) throw Error("rename target leaves owned origin");
    const opened = page.waitForResponse((r) => r.url().startsWith(stack.origin) && new URL(r.url()).pathname === target.pathname, { timeout: 60_000 })
      .then((response) => ({ response }), (error) => ({ error }));
    await edit.dispatchEvent("click");
    const seenOpen = await opened;
    if (seenOpen.error) throw seenOpen.error;
    await seenOpen.response.finished();
    const nameInput = page.locator(".modal input[name='card[name]'], .board input[name='card[name]'], .name-editor input[name='card[name]']").first();
    await nameInput.waitFor({ state: "visible", timeout: 20_000 });
    await nameInput.fill(renamed);
    const form = nameInput.locator("xpath=ancestor::form[1]");
    const action = await form.getAttribute("action");
    const before = ledger().length;
    const saved = page.waitForResponse((r) => r.url().startsWith(stack.origin) && new URL(r.url()).pathname === new URL(action, stack.origin).pathname && r.request().method() !== "GET", { timeout: 60_000 })
      .then((response) => ({ response }), (error) => ({ error }));
    await form.locator("button.renamer, button[type=submit], input[type=submit]").first().click();
    const answer = await saved;
    if (answer.error) throw answer.error;
    await answer.response.finished();
    const stored = database().prepare("SELECT id,name,trash FROM cards WHERE name = ?").get(renamed);
    const oldGone = Number(database().prepare("SELECT COUNT(*) AS n FROM cards WHERE name = ? AND trash = 0").get(original)?.n ?? 0) === 0;
    if (stored?.trash === 0 && oldGone && created.includes(original)) created[created.indexOf(original)] = renamed;
    // The referers leg: the referrer links the NEW name now.
    const referrerVisit = await visit(`/${referrer}`);
    const referrerLinks = await page.evaluate((r) => [...document.querySelectorAll("#main a[href]")]
      .map((a) => a.getAttribute("href")).filter((h) => h === `/${r}` || h === r).length, renamed);
    const referrerStored = fixtureCard(database(), referrer)?.db_content ?? "";
    record(capabilityChecks.R1[0],
      answer.response.status() < 400 && stored?.trash === 0 && oldGone
        && referrerVisit.status === 200 && referrerLinks > 0 && referrerStored.includes(renamed),
      { original, renamed, renameWriteStatus: answer.response.status(), oldGone,
        referrer: { name: referrer, status: referrerVisit.status, linksToNew: referrerLinks, storedContent: referrerStored.slice(0, 120) },
        storedId: stored?.id ?? null });
  });

  // ------------------------------------------------------------- S3, S4, S5
  group("caps-legs. session legs (S3 empty email, S4 reset destination, S5 credential form)");
  await ctx.attempt(capabilityChecks.S3[0], async () => {
    await signIn(admin);
    await visit("/_signout");
    await visit("/*signin");
    // The empty-EMAIL refusal: password filled, email left empty.
    await page.fill('input[name="card[subcards][+*password][content]"]', "Harness-Leg-Password-1");
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/update/*signin"), { timeout: 15_000 }).catch(() => null),
      page.locator('form[action="/update/*signin"] button[type="submit"], form[action="/update/*signin"] input[type="submit"]').first().click().catch(() => undefined),
    ]);
    await page.waitForTimeout(1500);
    const session = (await page.context().cookies(stack.origin)).some((c) => c.name === "decko_ts_session" && c.value.length > 0);
    const text = await bodyText();
    const msg = /email|required|blank|can't be|cannot be/i.test(text);
    record(capabilityChecks.S3[0], !session && (resp === null || resp.status() >= 400) && msg,
      { status: resp?.status() ?? null, noRequest: resp === null, hasSession: session, messageShown: msg });
    await signIn(admin);
  });

  await ctx.attempt(capabilityChecks.S4[0], async () => {
    await visit("/_signout");
    await visit("/*signin");
    // The reset link the bound check regexes (signin.rb:186-188
    // reset_password_link): its destination is the *signin card's EDIT view
    // — the reset-password form. The leg verifies the destination renders
    // that form, not merely that a link-ish href exists.
    const links = await page.evaluate(() => [...document.querySelectorAll("a")]
      .map((a) => ({ text: a.textContent.replace(/\s+/g, " ").trim(), href: a.getAttribute("href") }))
      .filter((l) => /reset/i.test(l.text)));
    const reset = links.find((l) => /reset password/i.test(l.text)) ?? links[0] ?? null;
    let destination = null;
    if (reset !== null && reset.href) {
      const dest = await page.goto(new URL(reset.href, stack.origin).href, { waitUntil: "load", timeout: 60_000 });
      await page.waitForTimeout(1200);
      destination = await page.evaluate(() => {
        const form = document.querySelector("form");
        const inputs = [...document.querySelectorAll("input")].map((i) => ({ name: i.name, type: i.type })).filter((i) => !i.name.includes("authenticity"));
        return {
          status: null,
          formAction: form?.getAttribute("action") ?? null,
          emailField: inputs.some((i) => /email/i.test(i.name ?? "")),
          passwordField: inputs.some((i) => /password/i.test(i.name ?? "")),
          text: document.body.innerText.replace(/\s+/g, " ").slice(0, 300),
        };
      });
      destination.status = dest.status();
    }
    record(capabilityChecks.S4[0],
      reset !== null && destination !== null && destination.status === 200
        && destination.formAction !== null && (destination.emailField || destination.passwordField),
      { resetLink: reset, destination, raw: captureEvidence(await page.content(), { check: "caps-legs-s4-reset-destination" }) });
    await signIn(admin);
  });

  await ctx.attempt(capabilityChecks.S5[0], async () => {
    await signIn(admin);
    await visit("/_signout");
    await visit("/Home?view=edit");
    await page.waitForTimeout(1500);
    const signinLink = await page.evaluate(() => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")).find((h) => h && /\*signin/.test(h)) ?? null);
    let credentialForm = null;
    if (signinLink !== null) {
      const dest = await page.goto(new URL(signinLink, stack.origin).href, { waitUntil: "load", timeout: 60_000 });
      await page.waitForTimeout(1200);
      credentialForm = await page.evaluate(() => {
        const form = document.querySelector('form[action="/update/*signin"]');
        const fields = form === null ? [] : [...form.querySelectorAll("input")].map((i) => ({ name: i.name, type: i.type }));
        return {
          formPresent: form !== null,
          emailField: fields.some((f) => /email/i.test(f.name ?? "") && f.type !== "hidden"),
          passwordField: fields.some((f) => /password/i.test(f.name ?? "") && f.type === "password"),
          submitPresent: form === null ? false : (form.querySelector("button[type='submit'], input[type='submit']") !== null),
        };
      });
      credentialForm.status = dest.status();
    }
    record(capabilityChecks.S5[0],
      signinLink !== null && credentialForm !== null && credentialForm.formPresent
        && credentialForm.emailField && credentialForm.passwordField && credentialForm.submitPresent,
      { signinLink, credentialForm, raw: captureEvidence(await page.content(), { check: "caps-legs-s5-credential-form" }) });
    await signIn(admin);
  });
}

export const checks = [
  {
    name: "caps-legs: the missing capability legs named by the 2026-10-20 contract grind (each record names its row's leg)",
    only: "caps-legs",
    run: (ctx) => runCapabilityLegChecks(ctx),
  },
];

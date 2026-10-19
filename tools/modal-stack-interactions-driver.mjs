// modal-stack-driver.mjs — the modal-stack lane's two-browser driver.
//
// Boots the local edge stack (lib/stack.mjs, the checks-conflict pattern)
// and drives the four modal-interaction scenarios as real signed-in
// journeys, grading each leg and writing a JSON receipt:
//
//   S1  nested edit modals: open card A's edit modal; inventory the modal
//       for a nested-embed affordance toward card B; drive it; save both
//       forms; verify both persist and neither clobbers the other.
//   S2  conflict inside a modal while TWO modals exist: admin holds two
//       stacked edit modals of card C; member saves C; admin submits the
//       upper form -> 409. Records which form's revision input the refresh
//       reaches, and whether ANY OTHER form's
//       card[last_action_id_before_edit] moved (cross-modal tracker
//       clobber -> silent-overwrite risk leg).
//   S3  edit modal + account board panel: open the edit modal, then the
//       board surface; record what each subsequent writer targets.
//   S4  edit modal open + page's own nav click: state after nav, and what
//       a save attempt after nav does.
//
// Env: MODAL_STACK_CONFLICT_RETRY=1 arms the opt-in conflict-retry delta
// (DECKO_CONFLICT_RETRY) for the run; default is stock.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = (() => { let dir = HERE; while (!existsSync(join(dir, "package.json"))) dir = dirname(dir); return dir; })();
const load = async (rel) => await import(pathToFileURL(join(REPO, rel)).href);

const SOURCE_DECK = "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3";
const SECRETS = "C:/localProjects/brandonDojoTech/library/data/secrets.env";
const RUN_ID = `modal-stack-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const RUN_DIR = join(REPO, "tmp", RUN_ID);
mkdirSync(RUN_DIR, { recursive: true });

const stackLib = await load("tools/edge-signed-in-exercise/lib/stack.mjs");
const { buildLocalDeck } = await load("tools/edge-signed-in-exercise/lib/build-local-deck.mjs");
const { seedLocalAccounts } = await load("tools/edge-signed-in-exercise/lib/seed-local-accounts.mjs");
const { launchHarnessBrowser } = await load("tools/edge-signed-in-exercise/lib/harness-browser.mjs");

const receipt = { runId: RUN_ID, startedAt: new Date().toISOString(), scenarios: {}, notes: [] };
const note = (line) => { receipt.notes.push(line); console.log(`[note] ${line}`); };
const receiptPath = join(RUN_DIR, "receipt.json");
const writeReceipt = () => writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

// ---- stack -----------------------------------------------------------------

const localDeck = join(RUN_DIR, "deck.sqlite3");
console.log("building local deck copy…");
await buildLocalDeck({ source: SOURCE_DECK, out: localDeck });
const credentialsPath = join(RUN_DIR, "credentials.json");
await seedLocalAccounts({ deck: localDeck, credentialsOut: credentialsPath });
const creds = JSON.parse(readFileSync(credentialsPath, "utf8"));
console.log(`seeded accounts: ${creds.admin.name} (admin), ${creds.member.name} (member)`);

const { env: liveEnv } = await stackLib.readLiveScriptEnv(SECRETS);
const conflictRetry = process.env.MODAL_STACK_CONFLICT_RETRY === "1";
const captureEnv = { ...liveEnv, ...(conflictRetry ? { DECKO_CONFLICT_RETRY: "1" } : {}) };
const assetHosts = [...new Set(Object.entries(captureEnv)
  .filter(([k, v]) => k.startsWith("DECKO_SERVED_") && typeof v === "string" && /^https?:\/\//i.test(v))
  .map(([, v]) => { try { return new URL(v).hostname; } catch { return null; } })
  .filter(Boolean))];

const bundlePath = join(REPO, "deploy/dist/bunny-edge-engine.bundle.js");
const bundleSha256 = createHash("sha256").update(readFileSync(bundlePath)).digest("hex");
const stack = await stackLib.startStack({
  deckPath: localDeck,
  live: captureEnv,
  runtimeDir: join(RUN_DIR, "runtime"),
  bundlePath,
  expectedBundleSha256: bundleSha256,
});
console.log(`stack up: ${stack.origin} (conflictRetry=${conflictRetry}, bundle ${bundleSha256.slice(0, 12)})`);

const dbContentOf = (name) => {
  const db = new Database(localDeck, { readonly: true });
  try { return db.prepare("SELECT db_content FROM cards WHERE name=? AND trash=0").get(name)?.db_content ?? null; }
  finally { db.close(); }
};
const historyOf = (name) => {
  const db = new Database(localDeck, { readonly: true });
  try {
    return db.prepare("SELECT a.id FROM card_actions a JOIN cards c ON c.id=a.card_id WHERE c.name=? AND c.trash=0 ORDER BY a.id").all(name).map((r) => r.id);
  } finally { db.close(); }
};

// ---- browser ---------------------------------------------------------------

const harnessMain = await launchHarnessBrowser({ origin: stack.origin, assetHosts });
const pageOf = { admin: harnessMain.page };
let harnessMember;
// Client-side error evidence per actor: page exceptions and console errors.
const clientErrors = { admin: [], member: [] };
harnessMain.page.on("pageerror", (error) => clientErrors.admin.push(`pageerror: ${error.message}`));
harnessMain.page.on("console", (m) => { if (m.type() === "error") clientErrors.admin.push(m.text().slice(0, 300)); });
const attachMemberErrorTap = () => {
  harnessMember.page.on("pageerror", (error) => clientErrors.member.push(`pageerror: ${error.message}`));
  harnessMember.page.on("console", (m) => { if (m.type() === "error") clientErrors.member.push(m.text().slice(0, 300)); });
};
const closeBrowser = async () => {
  await harnessMember?.close().catch(() => undefined);
  await harnessMain.close().catch(() => undefined);
};

async function signIn(actor) {
  if (actor === "member" && !harnessMember) {
    harnessMember = await harnessMain.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
    pageOf.member = harnessMember.page;
    attachMemberErrorTap();
  }
  const page = pageOf[actor];
  await page.goto(stack.origin + "/*signin", { waitUntil: "load" });
  const form = page.locator("form.card-form").filter({ has: page.locator("input[type=\"password\"]") }).first();
  await form.locator("input[name=\"card[subcards][+*email][content]\"]").fill(creds[actor].email);
  await form.locator("input[type=\"password\"]").fill(creds[actor].password);
  const pending = page.waitForResponse((r) => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: 30000 });
  await form.locator("button[type=\"submit\"]").first().click();
  const response = await pending;
  await response.finished();
  console.log(`signed in ${actor}: ${response.status()}`);
  return response.status() < 400;
}

const createCard = async (name, type, content) => {
  const response = await harnessMain.page.context().request.post(stack.origin + "/card/create", {
    headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
    data: new URLSearchParams({ "card[name]": name, "card[type]": type, "card[content]": content, "success[redirect]": "true" }).toString(),
    maxRedirects: 0,
  });
  if (response.status() >= 400) throw new Error(`fixture create ${name} refused: ${response.status()}`);
};

// DOM readers -----------------------------------------------------------------

const formStateIn = (page, scopeSelector) => page.evaluate(({ scope }) => {
  const root = scope ? document.querySelector(scope) : document;
  return [...(root ?? document).querySelectorAll("form.card-form")].map((f) => ({
    action: f.getAttribute("action"),
    id: f.id,
    visible: !!(f.offsetWidth || f.offsetHeight),
    inModalContainer: !!f.closest("#modal-container"),
    inModalStack: !!f.closest("._modal-stack"),
    modalIndex: (() => { const bodyModals = [...document.querySelectorAll("body > .modal, body > ._modal-slot, body > ._modal-stack")]; return bodyModals.indexOf(f.closest(".modal")); })(),
    revision: f.querySelector("[name=\"card[last_action_id_before_edit]\"]")?.value ?? null,
    content: f.querySelector("[name=\"card[content]\"]")?.value ?? null,
    notice: f.querySelector(".card-notice")?.innerText?.slice(0, 300) ?? null,
    slotId: f.closest(".card-slot")?.getAttribute("data-slot-id") ?? null,
    cardId: f.closest(".card-slot")?.getAttribute("data-card-id") ?? null,
  }));
}, { scope: scopeSelector ?? null });

const modalState = (page) => page.evaluate(() => ({
  bodyModals: [...document.querySelectorAll("body > .modal, body > ._modal-slot, body > ._modal-stack")].map((m) => ({
    id: m.id, classes: m.className,
    visible: !!(m.offsetWidth || m.offsetHeight),
    display: getComputedStyle(m).display,
    cardName: m.querySelector(".card-slot")?.getAttribute("data-card-name") ?? null,
    cardId: m.querySelector(".card-slot")?.getAttribute("data-card-id") ?? null,
  })),
  backdrops: [...document.querySelectorAll(".modal-backdrop")].map((b) => ({ show: b.classList.contains("show") })),
  bodyModalOpen: document.body.classList.contains("modal-open"),
  modalStackCount: document.querySelectorAll("._modal-stack").length,
}));

// Fill a form's content field through the page's own editor plumbing: the
// rich-text editor hides the textarea (TinyMCE replaces it), so set the
// editor content and sync it back the way decko's editors do on submit.
const fillContent = (page, scopeSelector, text) => page.evaluate(({ scope, text }) => {
  const root = scope ? document.querySelector(scope) : document;
  const ta = root?.querySelector("[name=\"card[content]\"]");
  if (!ta) return { filled: false };
  const ed = window.tinymce?.get?.(ta.id);
  if (ed) { ed.setContent(text); ta.value = ed.getContent(); }
  else ta.value = text;
  return { filled: true, viaTinymce: !!ed };
}, { scope: scopeSelector, text });

// Per-form editor telemetry: duplicate-DOM-id detection across stacked
// renders and what each TinyMCE instance holds (the submit content path is
// tinyMCE.get(<textarea id>).getContent() — two editors sharing one id make
// that lookup ambiguous).
const editorTelemetry = (page) => page.evaluate(() => ({
  textareas: [...document.querySelectorAll("form.card-form [name=\"card[content]\"]")].map((ta) => ({
    id: ta.id,
    formId: ta.closest("form")?.id ?? null,
    inContainer: !!ta.closest("#modal-container"),
    inStack: !!ta.closest("._modal-stack"),
    value: (ta.value ?? "").slice(0, 80),
    ariaHidden: ta.getAttribute("aria-hidden"),
    editorExists: !!(window.tinymce && window.tinymce.get(ta.id)),
    editorContent: window.tinymce?.get?.(ta.id) ? window.tinymce.get(ta.id).getContent().slice(0, 80) : null,
  })),
  duplicateIds: (() => {
    const ids = [...document.querySelectorAll("form.card-form [name=\"card[content]\"]")].map((ta) => ta.id);
    return ids.filter((id, i) => ids.indexOf(id) !== i);
  })(),
  tinymceCount: window.tinymce ? Object.keys(window.tinymce.editors ?? {}).length : 0,
}));

// The store's own view of one card's saved content per action.
const contentChangesOf = (name) => {
  const db = new Database(localDeck, { readonly: true });
  try {
    return db.prepare(
      "SELECT a.id AS action_id, ch.value FROM card_changes ch JOIN card_actions a ON a.id=ch.card_action_id " +
      "JOIN cards c ON c.id=a.card_id WHERE c.name=? AND c.trash=0 AND ch.field=2 ORDER BY a.id",
    ).all(name).map((r) => ({ action: r.action_id, value: String(r.value ?? "").slice(0, 80) }));
  } finally { db.close(); }
};

// Click a form's submit and verify a POST actually leaves: a click that
// produces no POST within the window is retried with dispatchEvent. The
// real-click path doubles as an interaction measurement: when a covering
// modal intercepts pointer events, Playwright's click refuses — that is the
// honest user answer for background forms (recorded as intercepted), and the
// dispatchEvent fallback is the two-writers simulation bypassing layering.
const clickSubmitExpectingPost = async (page, formLocator, label, attempts = 2) => {
  const button = formLocator.locator("button[data-cy=\"submit-modal\"], button[type=\"submit\"]:not([disabled]), input[type=\"submit\"]").first();
  let intercepted = false;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const pending = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.startsWith("/update/"), { timeout: 20000 }).then((r) => ({ r }), (e) => ({ e }));
    const clickOutcome = await button.click({ timeout: 4000 }).then(() => "clicked", (e) => {
      if (String(e).includes("intercepts pointer events")) intercepted = true;
      return `refused:${String(e).split("\n")[0].slice(0, 120)}`;
    });
    if (clickOutcome !== "clicked") await button.dispatchEvent("click");
    const seen = await pending;
    if (seen.r) {
      if (intercepted) receipt.scenarios[`${label}PointerIntercepted`] = true;
      return seen;
    }
    const diag = await formLocator.first().evaluate((f) => ({
      remote: f.getAttribute("data-remote"), classes: f.className, action: f.action,
      railsBound: !!(window.jQuery && window.jQuery._data && window.jQuery._data(f, "events")?.submit),
      jqueryPresent: !!window.jQuery, railsPresent: !!(window.jQuery && window.jQuery.rails),
      buttonDisabled: [...f.querySelectorAll("button[type=\"submit\"], input[type=\"submit\"]")].map((b) => ({ disabled: b.disabled, visible: !!(b.offsetWidth || b.offsetHeight) })),
    })).catch((e) => ({ diagError: String(e).slice(0, 120) }));
    receipt.scenarios[`${label}ClickAttempt${attempt}`] = { diag, clickOutcome };
    console.log(`${label} click attempt ${attempt} (${clickOutcome}) produced no POST; diagnostics recorded`);
  }
  return { r: null };
};

// ---- fixtures ---------------------------------------------------------------

const TS = Date.now().toString(36);
const CARD_A = `ModalStackA_${TS}`;        // Basic embedding B (the nested embed)
const CARD_B = `ModalStackB_${TS}`;        // PlainText nested inside A
const CARD_C = `ModalStackC_${TS}`;        // Phrase: the two-actor conflict card
const CARD_D = `ModalStackD_${TS}`;        // Phrase: nav + second-modal card
const ADMIN_NAME = creds.admin.name;

await signIn("admin");
await createCard(CARD_B, "PlainText", "B_ORIGINAL");
await createCard(CARD_A, "Basic", `A leads.\n\n{{${CARD_B}|core}}\n\nA trails.`);
await createCard(CARD_C, "Phrase", "CONFLICT_BASE");
await createCard(CARD_D, "Phrase", "NAV_BASE");

// ---- S1 ---------------------------------------------------------------------

receipt.scenarios.s1 = { name: "nested edit modals (A's edit modal opens B's)" };
{
  const admin = pageOf.admin;
  // (a) A's EDIT modal: inventory any B-affordance inside it.
  await admin.goto(stack.origin + "/" + CARD_A, { waitUntil: "load" });
  await admin.locator("#main a.edit-link[href$='/edit']").first().dispatchEvent("click");
  await admin.locator("#modal-container form.card-form:visible").first().waitFor({ state: "visible", timeout: 20000 });
  const inventoryInEditModal = await admin.evaluate((cardB) => {
    const modal = document.getElementById("modal-container");
    const hits = modal ? [...modal.querySelectorAll("a, [data-url], .card-slot")].filter((el) =>
      (el.getAttribute("href") ?? el.getAttribute("data-url") ?? "").includes(cardB) ||
      (el.getAttribute("data-card-name") ?? "").includes(cardB)) : [];
    return hits.map((el) => ({
      tag: el.tagName, href: el.getAttribute("href"), dataUrl: el.getAttribute("data-url"),
      cardName: el.getAttribute("data-card-name"), classes: el.className?.slice?.(0, 120) ?? "",
      slotterMode: el.getAttribute("data-slotter-mode"), text: el.textContent?.trim().slice(0, 60) ?? "",
    }));
  }, CARD_B);
  receipt.scenarios.s1.editModalAffordancesTowardB = inventoryInEditModal;
  console.log(`S1 edit-modal B-affordances: ${inventoryInEditModal.length}`);
  await admin.goto(stack.origin + "/" + CARD_A, { waitUntil: "load" }); // reset modal state

  // (b) A's VIEW modal (the menu's "modal" fullscreen link): its core embeds B.
  const viewModalLink = admin.locator("a._modal-page-link[data-slotter-mode='modal'], a[data-slotter-mode='modal'][href*='layout=modal']").first();
  let opened = false;
  if (await viewModalLink.count() > 0) {
    await viewModalLink.dispatchEvent("click");
    await admin.waitForTimeout(2000);
    const affordancesInViewModel = await admin.evaluate((cardB) => {
      const modal = document.getElementById("modal-container");
      if (!modal) return { modalMissing: true, hits: [] };
      const hits = [...modal.querySelectorAll("a, .card-slot")].filter((el) =>
        (el.getAttribute("href") ?? "").includes(cardB) ||
        (el.getAttribute("data-card-name") ?? "").includes(cardB));
      return { modalMissing: false, hits: hits.map((el) => ({
        tag: el.tagName, href: el.getAttribute("href"), cardName: el.getAttribute("data-card-name"),
        classes: el.className?.slice?.(0, 140) ?? "", slotterMode: el.getAttribute("data-slotter-mode"),
        text: el.textContent?.trim().slice(0, 60) ?? "",
      })) };
    }, CARD_B);
    receipt.scenarios.s1.viewModelAffordancesTowardB = affordancesInViewModel;
    console.log(`S1 view-modal B-affordances: ${JSON.stringify(affordancesInViewModel.hits?.slice(0, 6))}`);

    // Drive the first B edit affordance found (an /edit href), if any.
    const bEdit = affordancesInViewModel.hits?.find((h) => (h.href ?? "").endsWith("/edit") || (h.href ?? "").includes("view=edit"));
    if (bEdit) {
      const pending = admin.waitForResponse((r) => r.request().method() === "GET" && (r.url()).includes(encodeURIComponent(CARD_B)), { timeout: 20000 }).then((r) => ({ r }), (e) => ({ e }));
      await admin.locator(`#modal-container a[href="${bEdit.href}"]`).first().dispatchEvent("click");
      const seen = await pending;
      if (seen.r) await seen.r.finished().catch(() => undefined);
      await admin.waitForTimeout(1500);
      const stacked = await modalState(admin);
      opened = stacked.modalStackCount >= 1 && (await formStateIn(admin, null)).some((f) => f.action?.includes(encodeURIComponent(CARD_B)));
      receipt.scenarios.s1.nestedModalOpened = { opened, droveHref: bEdit.href, stacked };
    } else {
      receipt.scenarios.s1.nestedModalOpened = { opened: false, why: "no B edit affordance inside A's view modal", hits: affordancesInViewModel.hits };
    }
  } else {
    receipt.scenarios.s1.viewModalLinkPresent = false;
    receipt.scenarios.s1.nestedModalOpened = { opened: false, why: "no view-modal link on A's page" };
  }

  // (c) THE stacked-pair save-independence contract, driven on whatever
  // stacked pair the UI actually offers: the pre-filled edit modal +
  // a second modal opened from the page's own menu edit link (S2's shape,
  // on cards A and B so the pair is really A's modal + B's modal).
  await admin.goto(stack.origin + "/" + CARD_A + "?view=edit", { waitUntil: "load" });
  const firstModalForms = await formStateIn(admin, null);
  receipt.scenarios.s1.preFilledModalForms = firstModalForms;
  // Open B's edit modal from the PAGE's menu affordances: navigate via the
  // navbox? The honest in-DOM path: the page's own menu edit link for A
  // opens A's SECOND edit modal. For a B modal from A's page, use the
  // navbox search? Not available without typing. Record the pair the deck
  // offers (A + A) and drive the save-independence legs on it; the B edit
  // modal is reached directly through B's own page in the member context as
  // the second writer instead (two writers, two forms, one card each).
  const menuEdit = admin.locator("#main a.edit-link[href$='/edit']").first();
  if (await menuEdit.count() > 0) {
    await menuEdit.dispatchEvent("click");
    await admin.waitForTimeout(1500);
  }
  const pair = await modalState(admin);
  receipt.scenarios.s1.stackedPairState = pair;
  const forms = await formStateIn(admin, null);
  const aForms = forms.filter((f) => f.action?.includes(encodeURIComponent(CARD_A)));
  receipt.scenarios.s1.aModalForms = aForms;
  if (aForms.length >= 2) {
    // Type distinct markers into each form, save the UPPER, then the LOWER.
    // Both forms share id edit_card_<id>; discriminate by modal position
    // (bodyModals index — the container modal vs the stacked background one).
    // pushModal puts the NEWEST modal in #modal-container (first in DOM)
    // and demotes the older one to ._modal-stack.
    const upper = aForms.find((f) => f.inModalContainer) ?? aForms[0];
    const lower = aForms.find((f) => f.inModalStack) ?? aForms.find((f) => f !== upper);
    // Playwright locators: pick by position among matched forms instead of
    // an id (ids collide across stacked same-card modals).
    const upperLoc = upper.inModalContainer === true
      ? admin.locator("#modal-container form.card-form").first()
      : admin.locator("._modal-stack form.card-form").first();
    const lowerLoc = lower.inModalContainer === true
      ? admin.locator("#modal-container form.card-form").first()
      : admin.locator("._modal-stack form.card-form").first();
    const upperText = `A_UPPER_SAVE_${TS}`, lowerText = `A_LOWER_SAVE_${TS}`;
    receipt.scenarios.s1.fillUpper = await fillContent(admin, '#modal-container form.card-form', upperText).catch(e=>({err:String(e).slice(0,80)}));
    receipt.scenarios.s1.fillLower = await fillContent(admin, '._modal-stack form.card-form', lowerText).catch(e=>({err:String(e).slice(0,80)}));
    receipt.scenarios.s1.editorsBeforeUpperSave = await editorTelemetry(admin);
    // Save the UPPER (top) modal form: the modal edit's only submit is
    // "Save and Close" (data-cy=submit-modal; the :edit arm hides Save).
    const submit1 = admin.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.startsWith("/update/"), { timeout: 30000 });
    await upperLoc.locator("button[type=\"submit\"]").first().click();
    const resp1 = await submit1; await resp1.finished();
    await admin.waitForTimeout(1800);
    const afterUpper = { status: resp1.status(), stored: dbContentOf(CARD_A), changes: contentChangesOf(CARD_A), forms: await formStateIn(admin, null), modal: await modalState(admin) };
    receipt.scenarios.s1.editorsAfterUpperSave = await editorTelemetry(admin);
    // Save the LOWER form if it survived. Note the stack pop: the upper
    // save hid the container modal, and popModal promoted the lower modal
    // back INTO #modal-container — locate it fresh, not by its old scope.
    const lowerAfter = afterUpper.forms.find((f) => f.id === lower.id);
    let resp2Status = null, lowerStored = null;
    if (lowerAfter) {
      const lowerLocNow = lowerAfter.inModalContainer
        ? admin.locator("#modal-container form.card-form").first()
        : admin.locator("._modal-stack form.card-form").first();
      const submit2 = admin.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.startsWith("/update/"), { timeout: 30000 }).then((r) => ({ r }), (e) => ({ e }));
      const btn = lowerLocNow.locator("button[type=\"submit\"]").first();
      if (await btn.count() > 0) {
        await btn.click();
        const seen2 = await submit2;
        if (seen2.r) { await seen2.r.finished().catch(() => undefined); resp2Status = seen2.r.status(); }
        await admin.waitForTimeout(1800);
      } else { receipt.scenarios.s1.lowerSubmitButtonGone = true; }
      lowerStored = dbContentOf(CARD_A);
    }
    receipt.scenarios.s1.saveIndependence = {
      upperSave: { status: afterUpper.status, storedAfterUpper: afterUpper.stored, changesAfterUpper: afterUpper.changes },
      lowerFormSurvivedUpperSave: !!lowerAfter,
      lowerSave: { status: resp2Status, storedAfterLower: lowerStored },
      finalStored: dbContentOf(CARD_A),
      finalChanges: contentChangesOf(CARD_A),
      editorsAfterLowerSave: await editorTelemetry(admin),
    };
    receipt.scenarios.s1.clientErrors = clientErrors.admin;
    console.log("S1 save-independence:", JSON.stringify(receipt.scenarios.s1.saveIndependence));
  } else {
    note("S1: the page never yielded two stacked A-forms; save-independence legs not driven as designed");
  }
}

writeReceipt();

// ---- S2 ---------------------------------------------------------------------

receipt.scenarios.s2 = { name: "409 inside a modal while two modals exist" };
{
  const admin = pageOf.admin;
  await signIn("member");
  const member = pageOf.member;
  // Admin holds TWO stacked C-edit forms (pre-filled ?view=edit + menu edit).
  await admin.goto(stack.origin + "/" + CARD_C + "?view=edit", { waitUntil: "load" });
  await member.goto(stack.origin + "/" + CARD_C + "?view=edit", { waitUntil: "load" });
  receipt.scenarios.s2.memberPageForms = await formStateIn(member, null);
  receipt.scenarios.s2.memberPageTitle = await member.title();
  writeReceipt();
  // The update form for CARD_C specifically — the page also carries a
  // new_card create form whose content field would otherwise match first.
  const memberForm = () => member.locator(`#modal-container form.card-form[action*="/update/${CARD_C}"]`).first();
  const revMember = await memberForm().locator("[name=\"card[last_action_id_before_edit]\"]").inputValue();
  const revAdmin = await admin.locator("#modal-container [name=\"card[last_action_id_before_edit]\"]").first().inputValue();
  receipt.scenarios.s2.bothHoldSameRevision = revMember !== "" && revMember === revAdmin;

  await fillContent(member, "#modal-container", `C_MEMBER_SAVE_${TS}`);
  // Submit with a click-and-verify retry: the stock form is a rails-ujs
  // remote submit; a click that produces no POST within 5 s is retried once
  // with submit-binding diagnostics, and a second miss is recorded (the run
  // continues to S3/S4 rather than dying on harness flake).
  const memberSubmitWithRetry = async () => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const pending = member.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.startsWith("/update/"), { timeout: 20000 }).then((r) => ({ r }), (e) => ({ e }));
      await memberForm().locator("button[type=\"submit\"], input[type=\"submit\"]").first().click();
      const seen = await pending;
      if (seen.r) return seen;
      receipt.scenarios.s2[`memberClickAttempt${attempt}`] = {
        formAttrs: await member.locator("#modal-container form.card-form").first().evaluate((f) => ({
          remote: f.getAttribute("data-remote"), classes: f.className, action: f.action,
          railsBound: !!(window.jQuery && window.jQuery._data && window.jQuery._data(f, "events")?.submit),
          jqueryPresent: !!window.jQuery, railsPresent: !!window.$.rails,
          buttonVisible: [...f.querySelectorAll("button[type=\"submit\"], input[type=\"submit\"]")].map((b) => ({ visible: !!(b.offsetWidth || b.offsetHeight), disabled: b.disabled, cls: b.className.slice(0, 60) })),
        })).catch((e) => ({ diagError: String(e).slice(0, 120) })),
        consoleErrors: clientErrors.member.slice(-5),
      };
      console.log(`S2 member click attempt ${attempt} produced no POST; diagnostics recorded`);
    }
    return { r: null };
  };
  const mSeen = await memberSubmitWithRetry();
  if (!mSeen.r) {
    receipt.scenarios.s2.memberSaveStatus = "no-post";
    note("S2: member save produced no POST after two attempts; conflict legs aborted this run");
    writeReceipt();
  } else {
    const mResp = mSeen.r;
    await mResp.finished();
    receipt.scenarios.s2.memberSaveStatus = mResp.status();
    receipt.scenarios.s2.storedAfterMember = dbContentOf(CARD_C);
  }

  if (receipt.scenarios.s2.memberSaveStatus !== "no-post") {
  // Stack the second C modal (menu edit over the pre-filled modal).
  const menuEdit = admin.locator("#main a.edit-link[href$='/edit']").first();
  if (await menuEdit.count() > 0) {
    await menuEdit.dispatchEvent("click");
    await admin.waitForTimeout(1500);
  }
  const cForms = (await formStateIn(admin, null)).filter((f) => f.action?.includes(encodeURIComponent(CARD_C)));
  receipt.scenarios.s2.stackedCForms = cForms;
  if (cForms.length >= 2) {
    // The STALE form is the older one — demoted to ._modal-stack by
    // pushModal when the (fresh) second modal took #modal-container.
    const stale = cForms.find((f) => f.inModalStack) ?? cForms[0];
    const fresh = cForms.find((f) => f.inModalContainer) ?? cForms.find((f) => f !== stale);
    const staleLoc = stale.inModalContainer
      ? admin.locator("#modal-container form.card-form").first()
      : admin.locator("._modal-stack form.card-form").first();
    const currentAfterMember = String(historyOf(CARD_C).at(-1));
    receipt.scenarios.s2.staleVsFresh = {
      staleRevision: stale.revision, freshRevision: fresh.revision, currentRevision: currentAfterMember,
      staleIsOlder: String(stale.revision) !== currentAfterMember,
    };
    // Fill and submit the STALE form -> the engine must answer 409.
    await fillContent(admin, "._modal-stack form.card-form", `C_ADMIN_STALE_${TS}`);
    const staleSeen = await clickSubmitExpectingPost(admin, staleLoc, "staleForm", 2);
    const resp = staleSeen.r;
    if (!resp) {
      receipt.scenarios.s2.staleSubmit = { aborted: "no POST after retries" };
      note("S2: stale-form submit produced no POST after retries; conflict legs aborted this run");
      writeReceipt();
    } else {
    await resp.finished();
    const body = await resp.text().catch(() => "");
    await admin.waitForTimeout(1200);
    const after = await formStateIn(admin, null);
    const afterStale = after.find((f) => f.inModalStack) ?? after.find((f) => f.action?.includes(encodeURIComponent(CARD_C)));
    const afterFresh = after.find((f) => f.inModalContainer && f.action?.includes(encodeURIComponent(CARD_C)));
    receipt.scenarios.s2.staleSubmit = {
      status: resp.status(),
      bodyHasRevisionSpan: body.includes("new-current-revision-id"),
      bodyIsConflictView: body.includes("Conflict"),
      staleRevisionBefore: stale.revision,
      staleRevisionAfter: afterStale?.revision ?? null,
      currentRevision: currentAfterMember,
      staleNotice: afterStale?.notice ?? null,
      freshRevisionBefore: fresh.revision,
      freshRevisionAfter: afterFresh?.revision ?? null,
      freshNotice: afterFresh?.notice ?? null,
      stored: dbContentOf(CARD_C),
    };
    console.log("S2 stale-form submit:", JSON.stringify(receipt.scenarios.s2.staleSubmit));

    // The retry leg: with the conflict answer's revision refresh in place,
    // resubmitting the same form should succeed. Stock refresh targets the
    // modal origin (a no-op); measure honestly either way.
    const retryBtn = staleLoc.locator("button[type=\"submit\"]").first();
    if (await retryBtn.count() > 0) {
      const seen = await clickSubmitExpectingPost(admin, staleLoc, "staleRetry", 2);
      await seen.r?.finished().catch(() => undefined);
      await admin.waitForTimeout(1200);
      const afterRetry = await formStateIn(admin, null);
      receipt.scenarios.s2.staleRetry = {
        status: seen.r?.status() ?? null,
        stored: dbContentOf(CARD_C),
        freshRevisionAfterRetry: (afterRetry.find((f) => f.inModalContainer && f.action?.includes(encodeURIComponent(CARD_C))) ?? {}).revision ?? null,
        staleRevisionAfterRetry: (afterRetry.find((f) => f.inModalStack) ?? {}).revision ?? null,
      };
      console.log("S2 stale retry:", JSON.stringify(receipt.scenarios.s2.staleRetry));
    }
    } // stale POST arrived
  } else {
    note("S2: two stacked C-forms never materialized; conflict-in-modal legs need the single-modal shape");
    receipt.scenarios.s2.stackedFailed = true;
  }
  } // memberSaveStatus !== "no-post"
}

writeReceipt();

// ---- S3 ---------------------------------------------------------------------

receipt.scenarios.s3 = { name: "edit modal + account board panel slot writers" };
{
  const admin = pageOf.admin;
  await admin.goto(stack.origin + "/" + encodeURIComponent(ADMIN_NAME), { waitUntil: "load" });
  // Open the edit modal (the account/user card's edit).
  const editLink = admin.locator("#main a.edit-link[href$='/edit']").first();
  receipt.scenarios.s3.editLinkPresent = await editLink.count() > 0;
  if (await editLink.count() > 0) {
    await editLink.dispatchEvent("click");
    await admin.waitForTimeout(1500);
    receipt.scenarios.s3.afterEditModal = await modalState(admin);
  }
  // The board affordance: the menu's "advanced" board link (modal-replace)
  // or any /board link. Record what opening it does to the edit modal.
  const boardLink = admin.locator("a[href$='/board']").first();
  receipt.scenarios.s3.boardLinkPresent = await boardLink.count() > 0;
  if (await boardLink.count() > 0) {
    const pending = admin.waitForResponse((r) => new URL(r.url()).pathname.endsWith("/board"), { timeout: 30000 }).then((r) => ({ r }), (e) => ({ e }));
    await boardLink.dispatchEvent("click");
    const seen = await pending;
    if (seen.r) { await seen.r.finished().catch(() => undefined); receipt.scenarios.s3.boardResponseStatus = seen.r.status(); }
    else receipt.scenarios.s3.boardError = String(seen.e).slice(0, 160);
    await admin.waitForTimeout(1800);
    receipt.scenarios.s3.afterBoard = { modal: await modalState(admin), forms: await formStateIn(admin, null) };
    // If the board is up, click its first account pill and record the write
    // target (the pill is the board's slot writer: slotter-mode=override,
    // slot-selector .board-main > .overlay-container > .card-slot).
    const pill = admin.locator(".board-main a[data-slotter-mode='override'], a[data-breadcrumb]").first();
    if (await pill.count() > 0) {
      const pillHref = await pill.getAttribute("href");
      const pendingPill = admin.waitForResponse((r) => (r.url()).includes("layout=overlay") || (new URL(r.url()).pathname === new URL(pillHref, stack.origin).pathname), { timeout: 30000 }).then((r) => ({ r }), (e) => ({ e }));
      await pill.dispatchEvent("click");
      const seenPill = await pendingPill;
      if (seenPill.r) { await seenPill.r.finished().catch(() => undefined); receipt.scenarios.s3.pillResponseStatus = seenPill.r.status(); }
      await admin.waitForTimeout(1500);
      receipt.scenarios.s3.afterPill = { modal: await modalState(admin), forms: await formStateIn(admin, null) };
      receipt.scenarios.s3.pillHref = pillHref;
    } else { receipt.scenarios.s3.pillPresent = false; }
  }
  console.log("S3 board interaction:", JSON.stringify({ boardResponseStatus: receipt.scenarios.s3.boardResponseStatus, pillResponseStatus: receipt.scenarios.s3.pillResponseStatus, afterBoardModal: receipt.scenarios.s3.afterBoard?.modal?.bodyModals?.map((m) => m.classes) }));
  // The second writer: save an edit form (if one survived the board/pill
  // writes) and record where its response lands relative to the board panel.
  // The board demoted the edit modal into ._modal-stack (measured above), so
  // the surviving edit form may live in the BACKGROUND modal — saving it
  // while the board modal sits on top is exactly the two-writers-at-once
  // measurement.
  const formsBeforeSave = await formStateIn(admin, null);
  receipt.scenarios.s3.formsBeforeSave = formsBeforeSave;
  const editable = formsBeforeSave.find((f) => (f.inModalContainer || f.inModalStack) && f.action?.includes("/update/"));
  if (editable) {
    const scope = editable.inModalContainer ? "#modal-container form.card-form" : "._modal-stack form.card-form";
    await fillContent(admin, scope, `S3 edit after board ${TS}`);
    const scopeLoc = admin.locator(scope).first();
    const btnS3 = admin.locator(`${scope} button[data-cy="submit-modal"], ${scope} button[type="submit"]:not([disabled]), ${scope} input[type="submit"]`).first();
    if (await btnS3.count() > 0) {
      const seenS3 = await clickSubmitExpectingPost(admin, scopeLoc, "s3BoardCoveredSave", 2);
      if (seenS3.r) { await seenS3.r.finished().catch(() => undefined); receipt.scenarios.s3.saveStatus = seenS3.r.status(); }
      else receipt.scenarios.s3.saveError = "no POST after retries (see s3BoardCoveredSave* diagnostics)";
      await admin.waitForTimeout(1500);
      receipt.scenarios.s3.afterSave = { modal: await modalState(admin), forms: await formStateIn(admin, null) };
    } else { receipt.scenarios.s3.saveSkipped = "no submit button in modal form"; }
  } else {
    receipt.scenarios.s3.saveSkipped = "no editable modal form survived the board/pill writes";
  }
  console.log("S3 save leg:", JSON.stringify({ saveStatus: receipt.scenarios.s3.saveStatus, saveSkipped: receipt.scenarios.s3.saveSkipped }));
}

writeReceipt();

// ---- S4 ---------------------------------------------------------------------

receipt.scenarios.s4 = { name: "edit modal open + page nav click" };
{
  const admin = pageOf.admin;
  await admin.goto(stack.origin + "/" + CARD_D, { waitUntil: "load" });
  await admin.locator("#main a.edit-link[href$='/edit']").first().dispatchEvent("click");
  await admin.locator("#modal-container form.card-form:visible").first().waitFor({ state: "visible", timeout: 20000 });
  await fillContent(admin, "#modal-container form.card-form", `S4 unsaved ${TS}`);
  receipt.scenarios.s4.beforeNav = { modal: await modalState(admin), forms: await formStateIn(admin, "#modal-container"), storedD: dbContentOf(CARD_D) };
  const nav = admin.locator(".navbar a.navbar-brand, header a[href='/'], #navbar a[href='/']").first();
  receipt.scenarios.s4.navPresent = await nav.count() > 0;
  const settleAfterNav = async () => {
    await admin.waitForLoadState("load").catch(() => undefined);
    await admin.waitForTimeout(2500);
  };
  const safeRead = async (label, fn) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await fn(); } catch (error) {
        if (attempt === 2) { receipt.scenarios.s4[`readError_${label}`] = String(error).split("\n")[0]; return null; }
        await settleAfterNav();
      }
    }
  };
  if (await nav.count() > 0) {
    await nav.dispatchEvent("click");
    await settleAfterNav();
  }
  receipt.scenarios.s4.afterNav = {
    url: admin.url(),
    modal: await safeRead("modal", () => modalState(admin)),
    forms: await safeRead("forms", () => formStateIn(admin, null)),
    storedD: dbContentOf(CARD_D),
    storedA: dbContentOf(CARD_A),
  };
  console.log("S4 after nav:", JSON.stringify({ url: receipt.scenarios.s4.afterNav.url, bodyModalOpen: receipt.scenarios.s4.afterNav.modal?.bodyModalOpen, forms: receipt.scenarios.s4.afterNav.forms?.length }));
  // A save attempt against whatever modal form remains in the DOM: what a
  // user returning to the still-visible (or zombie) modal would trigger.
  const staleFormCount = await safeRead("staleFormCount", () => admin.locator("#modal-container form.card-form").count());
  if (staleFormCount) {
    const submit = admin.waitForResponse((r) => r.request().method() === "POST", { timeout: 20000 }).then((r) => ({ r }), (e) => ({ e }));
    const clicked = await admin.locator("#modal-container form.card-form button[type=\"submit\"]").first().click({ timeout: 5000 })
      .then(() => true, (e) => { receipt.scenarios.s4.submitClickError = String(e).split("\n")[0]; return false; });
    if (clicked) {
      const seen = await submit;
      await seen.r?.finished().catch(() => undefined);
      receipt.scenarios.s4.saveAfterNavStatus = seen.r?.status() ?? null;
      await settleAfterNav();
    }
    receipt.scenarios.s4.afterSaveAttempt = await safeRead("afterSave", () => ({ url: admin.url(), forms: formStateIn(admin, null) }));
    receipt.scenarios.s4.storedDAfterSaveAttempt = dbContentOf(CARD_D);
    receipt.scenarios.s4.clientErrorsAfterNav = clientErrors.admin.slice(-8);
  } else {
    receipt.scenarios.s4.modalFormGoneAfterNav = true;
  }
}

writeReceipt();

// ---- receipt ------------------------------------------------------------------

receipt.finishedAt = new Date().toISOString();
writeFileSync(join(HERE, `${RUN_ID}-receipt.json`), JSON.stringify(receipt, null, 2));
console.log("RECEIPT", join(HERE, `${RUN_ID}-receipt.json`));

await closeBrowser();
await stack.close().catch(() => undefined);
process.exit(0);

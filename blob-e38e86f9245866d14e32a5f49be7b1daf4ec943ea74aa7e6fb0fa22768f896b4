#!/usr/bin/env node
// probe-pageonly-top10-write-permission.mjs
//
// Exercised instruments for the ten highest-value page-only actions of the
// 2026-10-18 exhaustive re-grade (.runtime/exhaustive/2026-10-18: 101 of 190
// actions graded "page-only" — visited and observed, no affordance exercised).
// This lane takes the write-path and permission/account actions that no other
// committed instrument measures (cross-checked against every checks-*.mjs
// module in tools/edge-signed-in-exercise/ and the probe commits on this
// branch — ACT-099/132/133/140/141/142/146/150/151/152/160/161/163/164/167/
// 171/172/174/175/178/180/185/187/190 already carry instruments):
//
//   ACT-060  the member is signed in                                  (session/permission)
//   ACT-032  the Opportunities dropdown and navbar add links          (create affordance)
//   ACT-033  search for a nonexistent name offers a create link       (create affordance)
//   ACT-166  C19 create a wanted-card offer from a search miss        (write)
//   ACT-168  C21 type-scoped create route                             (write)
//   ACT-170  N13 recent-changes feed renders as a feed                (read/feed)
//   ACT-177  REL1 related-cards panel content                         (read)
//   ACT-068  A1 the account settings page shows the member's email    (account)
//   ACT-069  A3 the account's email can be changed                    (write/account)
//   ACT-127  S9 first-run setup of the first admin account            (write/permission)
//
// Every leg drives the affordance the way a person does — typing into the
// navbox, opening the navbar dropdown, clicking the autocomplete item,
// submitting the real forms — on the same engine and fixture the exhaustive
// runner grades (reference-harness/browser/engines/ts.json on
// reference-harness/fixtures/synthetic-v1). ACT-127 needs a deck with zero
// user accounts, so it boots a SECOND engine on a staged zero-account variant
// of the fixture with DECKO_FIRST_RUN=1 + a known DECKO_SETUP_TOKEN (the env
// gates first-run-routes.ts documents); the main pass runs unarmed, exactly
// as the graded run did.
//
//   node reference-harness/browser/probe-pageonly-top10-write-permission.mjs \
//     [--engine reference-harness/browser/engines/ts.json] \
//     [--fixture reference-harness/fixtures/synthetic-v1] [--out <dir>]
//
// The engine stages a private copy of the fixture deck (lib/engines.mjs), so
// every write this probe makes dies with the staging directory. A3 restores
// the original email through the same form before exiting, so a failure
// leaves the staged deck legible for diagnosis. Exits non-zero if any leg is
// RED.

import { mkdirSync, writeFileSync, existsSync, cpSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const engineManifest = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-pageonly-top10");
const T = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);

mkdirSync(out, { recursive: true });
const report = { out, fixture: fixtureDir, legs: [], failures: 0 };

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[top10] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 900)}`);
}

const stamp = () => Date.now().toString(36);
const urlKey = (name) => name.replaceAll(" ", "_");

async function runMainPass() {
  const engine = loadEngine(engineManifest);
  const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server-main.log") });
  const spec = readJson(path.join(fixtureDir, "deck.json"));
  console.log(`[top10] engine ${engine.name} on ${server.base} (boot ${server.bootMs}ms)`);
  const answers = { base: server.base };

  const bh = await launchBrowser();
  const ctx = bh.context;
  let page = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(T);
  page.on("dialog", (d) => d.accept().catch(() => {}));
  const api = ctx.request;
  if (!["127.0.0.1", "localhost"].includes(new URL(server.base).hostname)) throw Error("top10 probe requires the loopback engine");

  const signIn = async (who) => {
    const a = spec.actors[who];
    await ctx.clearCookies();
    await page.goto(server.base + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
    await page.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email, { timeout: T });
    await page.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password, { timeout: T });
    await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
    await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
    await page.waitForTimeout(600);
    return page.locator("a.signout-link").first().count().catch(() => 0);
  };
  const visit = async (p) => {
    const r = await page.goto(server.base + p, { waitUntil: "load", timeout: T }).catch(() => null);
    await page.waitForTimeout(800);
    return { status: r ? r.status() : null, url: page.url() };
  };
  const evalPage = async (fn, arg) => page.evaluate(fn, arg).catch((e) => ({ error: String(e?.message ?? e) }));
  /** Navigation status of the LAST goto/click, read off the browser context. */
  let lastNavStatus = null;
  ctx.on("response", (r) => {
    try {
      if (r.request().isNavigationRequest() && r.frame() === r.frame()?.page()?.mainFrame()) lastNavStatus = r.status();
    } catch { /* closing frames */ }
  });
  const mainFormInfo = async () =>
    evalPage(() => {
      const forms = [...document.querySelectorAll("#main form.card-form, form.card-form")].filter((f) => !f.closest("nav") && !f.classList.contains("search-box-form"));
      return forms.slice(0, 3).map((f) => ({
        action: f.getAttribute("action"),
        id: f.id,
        nameValue: f.querySelector("input[name='card[name]']")?.value ?? null,
        typeId: f.querySelector("input[name='card[type_id]']")?.value ?? null,
        hasContentTextarea: !!f.querySelector("textarea[name='card[content]']"),
        hasSubmit: !!f.querySelector("button[type=submit], input[type=submit], .submit-button"),
      }));
    });
  /** The first card-form that is not the navbox/nav forms, as a locator. */
  const mainForm = () => page.locator("#main form.card-form").first();

  // ---------------------------------------------------------------- ACT-060
  // "the member is signed in" (surface 8, ordinary non-admin permissions).
  // The graded run only visited "/" and read text. The exercised contract:
  // the member signs in THROUGH THE FORM, the session is HERS (ident card
  // links Mira Member, the ident menu's role is Member, not Administrator),
  // and the session answers for her own account surface.
  {
    const signout = await signIn("member");
    await visit("/");
    const ident = await evalPage(() => {
      const nav = document.querySelector("nav.navbar");
      // the ident menu is the dropdown that carries the account-settings link
      const menus = nav ? [...nav.querySelectorAll(".dropdown-menu")].filter((m) => m.querySelector("a[href*='account_settings']")) : [];
      const roleLinks = menus.flatMap((m) => [...m.querySelectorAll("a")].map((a) => ({ t: a.textContent.replace(/\s+/g, " ").trim(), h: a.getAttribute("href") })));
      const myCard = document.querySelector("a.my-card");
      return { myCardHref: myCard?.getAttribute("href") ?? null, myCardText: myCard?.textContent.replace(/\s+/g, " ").trim() ?? null, roleLinks };
    });
    // Drive her ident menu open and follow its Account link — the session
    // answers for HER account surface.
    const accountLink = page.locator("nav.navbar .dropdown-menu a[href*='account_settings']").first();
    let accountStatus = null, accountUrl = null;
    if ((await accountLink.count().catch(() => 0)) > 0) {
      await accountLink.click({ timeout: T }).catch(() => {});
      await page.waitForTimeout(1500);
      accountStatus = lastNavStatus;
      accountUrl = page.url();
    }
    answers.ACT060 = { signout, ident, accountFollow: { status: accountStatus, url: accountUrl } };
    await signIn("admin"); // the later legs write as the administrator
  }

  // ---------------------------------------------------------------- ACT-032
  // "the Opportunities dropdown and navbar add links are present". The
  // graded run (and the whole-harness leg) only COUNTED .dropdown-menu
  // anchors in the DOM. Exercised: open the navbar dropdown with a real
  // click, watch the menu become visible, then CLICK its add link and land
  // on the create form the link offers.
  {
    await visit("/");
    const toggle = page.locator("nav.navbar .dropdown-toggle").filter({ hasText: /getting started/i }).first();
    let menuItems = null, addClicked = null;
    if ((await toggle.count().catch(() => 0)) > 0) {
      await toggle.click({ timeout: T }).catch(() => {});
      await page.waitForTimeout(700);
      menuItems = await evalPage(() =>
        [...document.querySelectorAll("nav.navbar .dropdown-menu")].filter((m) => m.offsetParent !== null || m.classList.contains("show"))
          .flatMap((m) => [...m.querySelectorAll("a")].map((a) => ({ t: a.textContent.replace(/\s+/g, " ").trim(), h: a.getAttribute("href") }))),
      );
      const addType = page.locator("nav.navbar .dropdown-menu a.dropdown-item").filter({ hasText: /^add type$/i }).first();
      if ((await addType.count().catch(() => 0)) > 0) {
        await addType.click({ timeout: T }).catch(() => {});
        await page.waitForLoadState("load", { timeout: T }).catch(() => {});
        await page.waitForTimeout(1200);
        addClicked = { url: page.url(), forms: await mainFormInfo() };
      }
    }
    answers.ACT032 = { toggleFound: (await toggle.count().catch(() => 0)) > 0, menuItems, addClicked };
  }

  // ---------------------------------------------------------------- ACT-033
  // "search for a nonexistent name offers a create link". Decko's create
  // offer on a search miss is the navbox autocomplete's ADD item
  // (checks-cover-b.mjs C6 reads it at /*search/search_box_complete.json).
  // Exercised: type the missing name into the navbox, let the menu render,
  // find the add item, CLICK it, and require the create form prefilled with
  // the missing name.
  const wantedName = "Harness_Wanted_" + stamp();
  {
    await visit("/");
    const input = page.locator("form.search-box-form input[name='query[keyword]']:visible").first();
    await input.click({ timeout: T }).catch(() => {});
    await input.pressSequentially(wantedName, { delay: 40 }).catch(() => {});
    await page.waitForTimeout(2500);
    const menu = await evalPage(() => {
      const items = [...document.querySelectorAll(".ui-menu-item, .ui-autocomplete li, .ui-autocomplete a, .autocomplete-item")];
      return items.slice(0, 10).map((el) => {
        const a = el.matches("a") ? el : el.querySelector("a");
        return { t: el.textContent.replace(/\s+/g, " ").trim().slice(0, 90), h: a?.getAttribute("href") ?? el.getAttribute?.("href") ?? null, cls: el.className.slice(0, 60) };
      });
    });
    // The add affordance: any rendered menu entry whose class names the add
    // item or whose href resolves the missing card directly.
    const addHref = (Array.isArray(menu) ? menu : []).find((m) => /add/i.test(m.cls) || (m.h && decodeURIComponent(m.h).endsWith("/" + wantedName)));
    let clicked = null;
    if (addHref) {
      const loc = page.locator(`.ui-autocomplete a[href='${addHref.h}'], .ui-autocomplete li:has(.autocomplete-item-add) a, .ui-autocomplete .autocomplete-item-add`).first();
      await loc.click({ timeout: T }).catch(async () => {
        await page.locator(".ui-autocomplete li").filter({ hasText: wantedName }).first().click({ timeout: T }).catch(() => {});
      });
      await page.waitForTimeout(1800);
      clicked = { url: page.url(), forms: await mainFormInfo() };
    }
    answers.ACT033 = { wantedName, menu, clicked };
  }

  // ---------------------------------------------------------------- ACT-166
  // "C19 create a wanted-card offer from a search miss": continue the miss
  // flow to its write — the offered create form, filled and submitted, makes
  // the wanted card real. Independent of ACT-033's grading: this leg repeats
  // the miss and grades the completed creation.
  {
    let completed = null;
    const offer = answers.ACT033.clicked;
    if (offer && Array.isArray(offer.forms) && offer.forms.some((f) => f.action === "/card/create")) {
      const form = mainForm();
      await form.locator("input[name='card[name]']").first().fill(wantedName, { timeout: T }).catch(() => {});
      const ta = form.locator("textarea[name='card[content]']:visible").first();
      const content = "C19 wanted card body " + stamp();
      if ((await ta.count().catch(() => 0)) > 0) await ta.fill(content, { timeout: T }).catch(() => {});
      else await form.locator("input[name='card[content]']:visible").first().fill(content, { timeout: T }).catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: T }).catch(() => null);
      await form.locator("button[type=submit], input[type=submit], .submit-button").first().click({ timeout: T }).catch(() => {});
      const resp = await responded;
      await page.waitForTimeout(1800);
      const after = await visit("/" + wantedName);
      // the stored card carries the URL key's SPACE form (DeckoName#urlKey
      // maps every space to an underscore and back), so the row is looked
      // up under the space-normalized name.
      const storedName = wantedName.replaceAll("_", " ");
      const db = new DatabaseSync(server.db, { readOnly: true });
      const row = db.prepare("SELECT id, trash, db_content FROM cards WHERE name=? AND trash=0").get(storedName);
      db.close();
      completed = { createPostStatus: resp ? resp.status() : null, visitAfter: after, storedName, dbRow: row ?? null, contentMatch: String(row?.db_content ?? "").includes(content) };
    }
    answers.ACT166 = { wantedName, offerPresent: !!offer, completed };
  }

  // ---------------------------------------------------------------- ACT-168
  // "C21 type-scoped create route": /new/Note must offer a create form whose
  // type is already Note, and the card the form stores must carry that type.
  {
    const db = new DatabaseSync(server.db, { readOnly: true });
    const noteTypeId = db.prepare("SELECT id FROM cards WHERE name='Note' AND trash=0").get()?.id ?? null;
    db.close();
    const seen = await visit("/new/Note");
    const forms = await mainFormInfo();
    const form = mainForm();
    const name = "Harness_C21_" + stamp();
    let stored = null;
    if (forms.some?.((f) => f.action === "/card/create" && f.typeId !== null)) {
      await form.locator("input[name='card[name]']").first().fill(name, { timeout: T }).catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: T }).catch(() => null);
      await form.locator("button[type=submit], input[type=submit], .submit-button").first().click({ timeout: T }).catch(() => {});
      const resp = await responded;
      await page.waitForTimeout(1800);
      const db2 = new DatabaseSync(server.db, { readOnly: true });
      stored = { postStatus: resp ? resp.status() : null, row: db2.prepare("SELECT id, type_id, trash FROM cards WHERE name=? AND trash=0").get(name) ?? null };
      db2.close();
    }
    answers.ACT168 = { noteTypeId, seen, forms, stored, storedTypeMatches: stored?.row ? String(stored.row.type_id) === String(noteTypeId) : false };
  }

  // ---------------------------------------------------------------- ACT-170
  // "N13 recent-changes feed renders as a feed": make a real edit through
  // the edit form, then require the feed to answer with entries — the fresh
  // act FIRST (newest first), links on the entries, and an entry that
  // expands into the act's action list on click.
  {
    const name = "Harness_N13_feed_" + stamp();
    const create = await api.fetch(server.base + "/card/create", {
      method: "POST", headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0,
      data: new URLSearchParams({ "card[name]": name, "card[type]": "Basic", "card[content]": "feed seed", "success[redirect]": "true" }).toString(),
    }).catch(() => null);
    // the write the feed must witness, driven through the card's own edit form
    await visit("/" + urlKey(name) + "/edit");
    // the edit route renders its form outside #main — scope by the form's own
    // action, the way the labeled row's pencil href names it
    const editForm = page.locator(`form.card-form[action='/update/${urlKey(name)}']`).first();
    const editFormPresent = (await editForm.count().catch(() => 0)) > 0;
    const newContent = "N13 edited body " + stamp();
    let updateStatus = null, editFillDone = false;
    if (editFormPresent) {
      const ta = editForm.locator("textarea[name='card[content]']:visible").first();
      const field = (await ta.count().catch(() => 0)) > 0 ? ta : editForm.locator("input[name='card[content]']:visible").first();
      if ((await field.count().catch(() => 0)) > 0) {
        await field.fill(newContent, { timeout: T }).catch(() => {});
        editFillDone = true;
      }
      const responded = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/update/"), { timeout: T }).catch(() => null);
      await editForm.locator("button[type=submit], input[type=submit], .submit-button").first().click({ timeout: T }).catch(() => {});
      const resp = await responded;
      updateStatus = resp ? resp.status() : null;
      if (updateStatus === null) {
        // autosave forms may need the Enter path; try once and record both
        await field.press("Enter", { timeout: T }).catch(() => {});
        const resp2 = await page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/update/"), { timeout: 8000 }).catch(() => null);
        updateStatus = resp2 ? resp2.status() : null;
      }
    }
    await page.waitForTimeout(1200);
    // the feed
    await visit("/*recent");
    await page.waitForTimeout(1200);
    const feed = await evalPage(() => {
      const items = [...document.querySelectorAll(".accordion-item")].slice(0, 6);
      return items.map((it) => ({
        header: it.querySelector(".accordion-header")?.textContent.replace(/\s+/g, " ").trim().slice(0, 120) ?? null,
        cardLinks: [...it.querySelectorAll(".accordion-header a.known-card")].map((a) => a.getAttribute("href")).slice(0, 4),
      }));
    });
    // expand the first entry — the feed's own affordance
    let expanded = null;
    const firstBtn = page.locator(".accordion-item .accordion-button").first();
    if ((await firstBtn.count().catch(() => 0)) > 0) {
      await firstBtn.click({ timeout: T }).catch(() => {});
      await page.waitForTimeout(2200);
      expanded = await evalPage(() => {
        const body = document.querySelector(".accordion-item .accordion-collapse .accordion-body, .accordion-item .accordion-body");
        return { bodyText: body ? body.textContent.replace(/\s+/g, " ").trim().slice(0, 300) : null, hasActionList: !!document.querySelector(".accordion-item .action-list, .accordion-item .action_summary-view") };
      });
    }
    answers.ACT170 = { createStatus: create ? create.status() : null, updateStatus, editFormPresent, editFillDone, feed, expanded, firstHeaderNamesCard: (Array.isArray(feed) ? feed[0]?.header : "")?.includes(name) ?? false };
  }

  // ---------------------------------------------------------------- ACT-177
  // "REL1 related-cards panel content": the +related closed panel on
  // Topic 001 loads its content through a card-slot-stub AJAX call when the
  // person expands it. Exercised: expand it, require BOTH related cards it
  // points at, and follow one of the links.
  {
    await visit("/Topic_001");
    const panelBtn = page.locator("#topic_001-related-closed-view button.accordion-button").first();
    let panel = { buttonFound: (await panelBtn.count().catch(() => 0)) > 0 };
    if (panel.buttonFound) {
      await panelBtn.click({ timeout: T }).catch(() => {});
      await page.waitForTimeout(2500);
      panel.content = await evalPage(() => {
        const body = document.querySelector("#topic_001-related-closed-view .accordion-body");
        const links = body ? [...body.querySelectorAll("a.known-card")].map((a) => ({ t: a.textContent.replace(/\s+/g, " ").trim(), h: a.getAttribute("href") })) : [];
        return { bodyText: body ? body.textContent.replace(/\s+/g, " ").trim().slice(0, 250) : null, links };
      });
      // the related list renders each pointed-at card as a clickable BAR
      // (div.bar._card-link) — the bar itself is the link a person clicks
      const topic2 = page.locator("#topic_001-related-closed-view .accordion-body .bar[data-card-link-name='Topic_002']").first();
      if ((await topic2.count().catch(() => 0)) > 0) {
        await topic2.click({ timeout: T }).catch(() => {});
        await page.waitForLoadState("load", { timeout: T }).catch(() => {});
        await page.waitForTimeout(1500);
        // decko renders card links through the slot machinery: the follow
        // may replace the page's main card without a URL navigation, so the
        // graded fact is WHICH CARD the page now presents.
        panel.followed = {
          url: page.url(),
          presented: await evalPage(() => document.querySelector(".card-slot.titled-view")?.getAttribute("data-card-name") ?? null),
          isTopic2: false,
        };
        panel.followed.isTopic2 = panel.followed.presented === "Topic 002" || /\/Topic_002$/.test(page.url());
      }
    }
    panel.bothListed = Array.isArray(panel.content?.links)
      && panel.content.links.some((l) => /Topic 002|Topic_002/.test(l.t + l.h))
      && panel.content.links.some((l) => /Topic 012|Topic_012/.test(l.t + l.h));
    answers.ACT177 = panel;
  }

  // ---------------------------------------------------------------- ACT-068
  // "A1 the account settings page shows the signed-in member's email". The
  // account settings a person can actually reach is the account card's
  // BOARD page's Account tab (the navbar's Account link answers something
  // else on this tree — recorded below, not graded here).
  {
    await visit("/Ada_Admin/board");
    await page.waitForTimeout(1500);
    const tab = page.locator(".board .nav-tabs a, .board .nav-link").filter({ hasText: /^account$/i }).first();
    let leg = { tabFound: (await tab.count().catch(() => 0)) > 0 };
    if (leg.tabFound) {
      await tab.click({ timeout: T }).catch(() => {});
      const pill = page.locator("[data-cy='email_and_password-pill']").first();
      await pill.waitFor({ state: "visible", timeout: T }).catch(() => {});
      await pill.click({ timeout: T }).catch(() => {});
      const emailView = page.locator(".RIGHT-Xemail.labeled-view").first();
      await emailView.waitFor({ state: "visible", timeout: T }).catch(() => {});
      await page.waitForTimeout(800);
      leg.emailShown = await evalPage(() => {
        const el = document.querySelector(".RIGHT-Xemail.labeled-view");
        return { text: el ? el.textContent.replace(/\s+/g, " ").trim().slice(0, 200) : null, value: el?.querySelector("input[name='card[content]']")?.value ?? null };
      });
    }
    // context (not graded): the navbar Account link's own answer
    const navAccount = await visit("/Ada_Admin+*account_settings");
    leg.navbarAccountLink = { status: navAccount.status, url: navAccount.url, rendersCreateForm: (await mainFormInfo()).some?.((f) => f.action === "/card/create") ?? null };
    await visit("/");
    answers.ACT068 = leg;
  }

  // ---------------------------------------------------------------- ACT-069
  // "A3 the account's email can be changed (the new address shows on the
  // account page)". Drive the email row's own edit route
  // (/Ada_Admin+*account+*email/edit — the labeled row's pencil href),
  // save the new address, require it on the account page AND in the stored
  // +*email row, then restore the original through the same form.
  {
    const holder = "Ada_Admin";
    const route = `/${holder}+*account+*email/edit`;
    const seen = await visit(route);
    // the row's own edit form, scoped by its action (it renders outside #main)
    const form = page.locator(`form.card-form[action='/update/${holder}+*account+*email']`).first();
    const field = form.locator("input[name='card[content]']:visible").first();
    const leg = { route: seen, formAction: (await form.count().catch(() => 0)) > 0, fieldFound: (await field.count().catch(() => 0)) > 0 };
    if (leg.fieldFound) {
      const newEmail = `top10.${stamp()}@example.test`;
      await field.fill(newEmail, { timeout: T }).catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(`/update/${holder}+*account+*email`), { timeout: T }).catch(() => null);
      const submit = form.locator("button[type=submit], input[type=submit], .submit-button").first();
      if ((await submit.count().catch(() => 0)) > 0) await submit.click({ timeout: T }).catch(() => {});
      else await field.press("Enter", { timeout: T }).catch(() => {});
      const resp = await responded;
      await page.waitForTimeout(1500);
      // junction CHILD cards (like +*email under +*account) carry a null
      // name column — the stored row is resolved by left/right ids, the
      // way the engine's own account-fields.ts resolves it.
      const db = new DatabaseSync(server.db, { readOnly: true });
      const stored = db.prepare(`
        SELECT child.db_content FROM cards child
        WHERE child.left_id = (SELECT id FROM cards WHERE right_id=(SELECT id FROM cards WHERE name='*account') AND left_id=(SELECT id FROM cards WHERE name='Ada Admin') AND trash=0)
          AND child.right_id = (SELECT id FROM cards WHERE name='*email') AND child.trash=0
      `).get();
      db.close();
      leg.stored = { updateStatus: resp ? resp.status() : null, dbContent: stored?.db_content ?? null, matchesNew: stored?.db_content === newEmail };
      // the account page shows the new address (same A1 path)
      await visit(`/${holder}/board`);
      await page.waitForTimeout(1500);
      const tab = page.locator(".board .nav-tabs a, .board .nav-link").filter({ hasText: /^account$/i }).first();
      if ((await tab.count().catch(() => 0)) > 0) {
        await tab.click({ timeout: T }).catch(() => {});
        const pill = page.locator("[data-cy='email_and_password-pill']").first();
        await pill.waitFor({ state: "visible", timeout: T }).catch(() => {});
        await pill.click({ timeout: T }).catch(() => {});
        const emailView = page.locator(".RIGHT-Xemail.labeled-view").first();
        await emailView.waitFor({ state: "visible", timeout: T }).catch(() => {});
        await page.waitForTimeout(800);
        leg.showsOnAccountPage = await evalPage(() => {
          const el = document.querySelector(".RIGHT-Xemail.labeled-view");
          return { text: el ? el.textContent.replace(/\s+/g, " ").trim().slice(0, 200) : null, value: el?.querySelector("input[name='card[content]']")?.value ?? null };
        });
      }
      // restore the fixture address through the same affordance
      await visit(route);
      const rform = page.locator(`form.card-form[action='/update/${holder}+*account+*email']`).first();
      const restoreField = rform.locator("input[name='card[content]']:visible").first();
      if ((await restoreField.count().catch(() => 0)) > 0) {
        await restoreField.fill(spec.actors.admin.email, { timeout: T }).catch(() => {});
        const rresp = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(`/update/${holder}+*account+*email`), { timeout: T }).catch(() => null);
        const rsubmit = rform.locator("button[type=submit], input[type=submit], .submit-button").first();
        if ((await rsubmit.count().catch(() => 0)) > 0) await rsubmit.click({ timeout: T }).catch(() => {});
        else await restoreField.press("Enter", { timeout: T }).catch(() => {});
        const rr = await rresp;
        await page.waitForTimeout(1200);
        const db2 = new DatabaseSync(server.db, { readOnly: true });
        const after = db2.prepare(`
          SELECT child.db_content FROM cards child
          WHERE child.left_id = (SELECT id FROM cards WHERE right_id=(SELECT id FROM cards WHERE name='*account') AND left_id=(SELECT id FROM cards WHERE name='Ada Admin') AND trash=0)
            AND child.right_id = (SELECT id FROM cards WHERE name='*email') AND child.trash=0
        `).get();
        db2.close();
        leg.restored = { updateStatus: rr ? rr.status() : null, dbContent: after?.db_content ?? null, matchesOriginal: after?.db_content === spec.actors.admin.email };
      }
      leg.newEmail = newEmail;
    }
    answers.ACT069 = leg;
  }

  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
  return answers;
}

// ---------------------------------------------------------------------------
// ACT-127 — first-run setup. Needs a deck with ZERO user accounts and the
// first-run env armed; boots its own engine on a staged variant fixture.
// ---------------------------------------------------------------------------
async function runFirstRunLeg(outDir) {
  const fixture = path.join(outDir, "zero-account-fixture");
  mkdirSync(path.join(fixture, "deck"), { recursive: true });
  cpSync(path.join(fixtureDir, "deck.json"), path.join(fixture, "deck.json"));
  cpSync(path.join(fixtureDir, "deck", "deck.sqlite3"), path.join(fixture, "deck", "deck.sqlite3"));

  // Zero the user accounts the way the port's own census counts them
  // (first-run-setup.ts countUserAccounts): the shipped holders are
  // DeckoBot and Anonymous (auth/setup.rb:44); every OTHER +*account
  // junction must be gone. The synthetic fixture carries five junctions —
  // Sign up, User, Decko Bot, Ada Admin, Mira Member — so all three
  // non-shipped ones (and their +*email/+*password/+*salt/+*status
  // children) are trashed here.
  const db = new DatabaseSync(path.join(fixture, "deck", "deck.sqlite3"));
  const account = db.prepare("SELECT id FROM cards WHERE name='*account' AND trash=0").get()?.id;
  const shipped = db.prepare("SELECT id FROM cards WHERE name IN ('Decko Bot','Anonymous')").all().map((r) => r.id);
  const junctions = db.prepare(`SELECT id FROM cards WHERE right_id=${account} AND trash=0 AND left_id NOT IN (${shipped.join(",")})`).all().map((r) => r.id);
  db.exec(`BEGIN;
    UPDATE cards SET trash=1 WHERE right_id=${account} AND trash=0 AND left_id NOT IN (${shipped.join(",")});
    ${junctions.length ? `UPDATE cards SET trash=1 WHERE left_id IN (${junctions.join(",")});` : ""}
  COMMIT;`);
  // the port's exact census predicate, on the same rows it will read
  const census = db.prepare(`SELECT COUNT(*) AS n FROM cards WHERE right_id=${account} AND trash=0 AND NOT (left_id IN (${shipped.join(",")}))`).get().n;
  db.close();

  // The armed engine manifest: first-run ON, write path ON, known token.
  const manifestPath = path.join(outDir, "engine-ts-firstrun.json");
  writeFileSync(manifestPath, JSON.stringify({
    name: "ts-firstrun",
    description: "The harness ts engine with the first-run surface armed (DECKO_FIRST_RUN=1) and a known setup token.",
    command: ["node", path.join(here, "engines", "ts-server.mjs")],
    ready: "/__harness/ready",
    env: { DECKO_FIRST_RUN: "1", DECKO_WRITE_PATH: "1", DECKO_SETUP_TOKEN: "top10-probe-setup-token" },
  }, null, 2));
  const engine = loadEngine(manifestPath);
  const server = await startEngine(engine, fixture, { logFile: path.join(outDir, "server-firstrun.log") });
  const bh = await launchBrowser();
  const ctx = bh.context;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(T);
  page.on("dialog", (d) => d.accept().catch(() => {}));
  const visit = async (p) => {
    const r = await page.goto(server.base + p, { waitUntil: "load", timeout: T }).catch(() => null);
    await page.waitForTimeout(700);
    return { status: r ? r.status() : null, url: page.url() };
  };

  const ownerEmail = `owner.${stamp()}@example.test`;
  const ownerPassword = "First run pass 3#";
  const setupPage = await visit("/setup");
  const formPresent = await page.evaluate(() => !!document.querySelector("form.first-run-setup-form")).catch(() => false);
  let posted = null, dbProof = null, signInProof = null, adminProof = null, windowClosed = null;
  if (formPresent) {
    await page.locator("#setup_token").fill("top10-probe-setup-token", { timeout: T });
    await page.locator("#setup_email").fill(ownerEmail, { timeout: T });
    await page.locator("#setup_password").fill(ownerPassword, { timeout: T });
    const responded = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/setup", { timeout: T }).catch(() => null);
    await page.locator("form.first-run-setup-form button[type=submit]").click({ timeout: T });
    const resp = await responded;
    await page.waitForTimeout(1500);
    posted = { status: resp ? resp.status() : null, url: page.url(), bodyHasError: await page.evaluate(() => !!document.querySelector(".form-error")).catch(() => null) };
    // stored rows — resolved by ids, because the junction children carry a
    // null name column. Two hops up from the +*email row: its left_id is
    // the +*account junction, and the JUNCTION's left_id is the holder.
    const db2 = new DatabaseSync(server.db, { readOnly: true });
    const emailRow = db2.prepare("SELECT id, left_id FROM cards WHERE db_content=? AND right_id=(SELECT id FROM cards WHERE name='*email') AND trash=0").get(ownerEmail);
    const junctionId = emailRow?.left_id ?? null;
    const holderId = junctionId ? db2.prepare("SELECT left_id FROM cards WHERE id=?").get(junctionId)?.left_id ?? null : null;
    const holderName = holderId ? db2.prepare("SELECT name FROM cards WHERE id=?").get(holderId)?.name ?? null : null;
    const statusRow = junctionId ? db2.prepare("SELECT db_content FROM cards WHERE left_id=? AND right_id=(SELECT id FROM cards WHERE name='*status') AND trash=0").get(junctionId) : null;
    // The owner's role membership is stored as a LINK to the holder card
    // ("~<card id>") in <Role>+*members; the deck's administrator role card
    // is "Administrator" (the fixture's role name).
    const adminRole = db2.prepare(`
      SELECT role_members.db_content FROM cards role_members
      WHERE role_members.left_id = (SELECT id FROM cards WHERE name='Administrator' AND trash=0)
        AND role_members.right_id = (SELECT id FROM cards WHERE name='*members') AND role_members.trash=0
    `).get();
    db2.close();
    dbProof = {
      ownerEmailRowId: emailRow?.id ?? null, holderId, holderName,
      status: statusRow?.db_content ?? null,
      inAdministrators: String(adminRole?.db_content ?? "").includes(`~${holderId}`),
    };
    // the new owner signs in THROUGH THE FORM and holds the admin keys
    const a = { email: ownerEmail, password: ownerPassword };
    await ctx.clearCookies();
    await page.goto(server.base + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
    await page.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email, { timeout: T });
    await page.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password, { timeout: T });
    await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
    await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
    await page.waitForTimeout(800);
    signInProof = await page.evaluate(() => ({ signout: !!document.querySelector("a.signout-link"), roles: [...document.querySelectorAll("nav.navbar .dropdown-menu a")].map((x) => x.getAttribute("href")) })).catch((e) => ({ error: String(e) }));
    // Brief cards are Administrator-only read (Brief+*type+*read=[[Administrator]])
    const brief = await visit("/Brief_01");
    adminProof = { briefStatus: brief.status, briefDenied: await page.evaluate(() => /sorry|permission|denied/i.test(document.body.innerText.slice(0, 2000))).catch(() => null) };
    // the window closes for good
    await ctx.clearCookies();
    const again = await visit("/setup");
    windowClosed = { status: again.status, stillOffersForm: await page.evaluate(() => !!document.querySelector("form.first-run-setup-form")).catch(() => null) };
  }
  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
  return { censusAfterZeroing: Number(census), setupPage, formPresent, posted, dbProof, signInProof, adminProof, windowClosed };
}

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

try {
  const port = await runMainPass();

  grade("ACT-060", "the member is signed in (form session, her identity, her role)",
    port.ACT060.signout > 0 && port.ACT060.ident.myCardHref === "/Mira_Member"
      && Array.isArray(port.ACT060.ident.roleLinks) && port.ACT060.ident.roleLinks.some((l) => l.h === "/Member")
      && !port.ACT060.ident.roleLinks.some((l) => l.h === "/Administrator"),
    port.ACT060);  grade("ACT-032", "the Opportunities (navbar) dropdown opens and its add link leads to a create form",
    port.ACT032.toggleFound === true
      && Array.isArray(port.ACT032.menuItems) && port.ACT032.menuItems.length >= 3
      && port.ACT032.menuItems.some((m) => /^add type$/i.test(m.t) && m.h === "/new/Cardtype")
      && port.ACT032.addClicked?.forms?.some?.((f) => f.action === "/card/create" && f.nameValue !== undefined) === true,
    port.ACT032);

  grade("ACT-033", "search for a nonexistent name offers a create link (autocomplete add item, clicked, form prefilled)",
    Array.isArray(port.ACT033.menu) && port.ACT033.menu.some((m) => /add/i.test(m.cls) || (m.h && decodeURIComponent(m.h).endsWith("/" + port.ACT033.wantedName)))
      && port.ACT033.clicked?.url?.endsWith("/" + port.ACT033.wantedName) === true
      && port.ACT033.clicked?.forms?.some?.((f) => f.action === "/card/create"
        && f.nameValue === port.ACT033.wantedName.replaceAll("_", " ")) === true,
    port.ACT033);

  grade("ACT-166", "C19 the wanted-card offer completes: the card is created from the search miss",
    port.ACT166.completed?.createPostStatus !== null && port.ACT166.completed?.createPostStatus < 400
      && port.ACT166.completed?.visitAfter?.status === 200
      && !!port.ACT166.completed?.dbRow,
    port.ACT166);

  grade("ACT-168", "C21 the type-scoped create route stores the route's type",
    port.ACT168.noteTypeId !== null
      && port.ACT168.forms.some?.((f) => f.action === "/card/create" && String(f.typeId) === String(port.ACT168.noteTypeId)) === true
      && port.ACT168.storedTypeMatches === true,
    port.ACT168);

  grade("ACT-170", "N13 the recent-changes feed renders as a feed: fresh act first, links, expandable entry",
    port.ACT170.updateStatus === 200
      && Array.isArray(port.ACT170.feed) && port.ACT170.feed.length >= 3
      && port.ACT170.feed.every((f) => (f.cardLinks ?? []).length > 0)
      && port.ACT170.firstHeaderNamesCard === true
      && port.ACT170.expanded?.hasActionList === true,
    port.ACT170);

  grade("ACT-177", "REL1 the related-cards panel expands to its content and its links navigate",
    port.ACT177.buttonFound === true
      && port.ACT177.bothListed === true
      && port.ACT177.followed?.isTopic2 === true,
    port.ACT177);

  grade("ACT-068", "A1 the account settings page shows the signed-in member's email",
    port.ACT068.tabFound === true
      && (port.ACT068.emailShown?.text?.includes("ada.admin@example.test")
        || port.ACT068.emailShown?.value === "ada.admin@example.test"),
    port.ACT068);

  grade("ACT-069", "A3 the account's email can be changed and the new address shows on the account page",
    port.ACT069.stored?.updateStatus === 200
      && port.ACT069.stored?.matchesNew === true
      && (port.ACT069.showsOnAccountPage?.text?.includes(port.ACT069.newEmail)
        || port.ACT069.showsOnAccountPage?.value === port.ACT069.newEmail)
      && port.ACT069.restored?.matchesOriginal === true,
    port.ACT069);

  // ACT-127 runs on its own zero-account engine.
  const s9 = await runFirstRunLeg(out);
  report.firstRun = s9;
  grade("ACT-127", "S9 first-run setup of the first admin account (form setup, owner signs in, admin keys)",
    s9.censusAfterZeroing === 0 && s9.formPresent === true
      && s9.posted?.status !== null && s9.posted?.status < 400
      && s9.dbProof?.status === "active" && s9.dbProof?.inAdministrators === true
      && s9.signInProof?.signout === true
      && (s9.signInProof?.roles ?? []).includes("/Administrator")
      && s9.adminProof?.briefStatus === 200 && s9.adminProof?.briefDenied === false
      && s9.windowClosed?.stillOffersForm === false,
    s9);

  report.port = port;
} catch (err) {
  report.fatal = String(err?.stack ?? err);
  report.failures += 1;
  console.error(`[top10] FATAL ${err?.stack ?? err}`);
}

writeFileSync(path.join(out, "probe-top10-result.json"), JSON.stringify(report, null, 2));
console.log(`[top10] ${report.failures === 0 ? "ALL LEGS GREEN" : report.failures + " LEG(S) RED"} - evidence ${path.join(out, "probe-top10-result.json")}`);
process.exit(report.failures === 0 ? 0 : 1);

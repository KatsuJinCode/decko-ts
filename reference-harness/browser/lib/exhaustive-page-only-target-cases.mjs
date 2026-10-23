// Target cases for the PAGE-ONLY actions the exhaustive runner graded
// "ungradeable" (no minted hint, no target case, no assertion - the action
// could not fail by construction), minted by the journeys-regrade lane on
// 2026-10-23.
//
// SOURCE LIST. The run .runtime/exhaustive/2026-10-23-regrade-before/run.md
// (source e8b70ad3, clean) names 58 actions graded "ungradeable" out of 190.
// This module mints a case for the 23 of them whose claim is a page-state
// contract the runner's affordance ladder cannot express, because the claim
// names no control on the page:
//
//   create-route family (11): ACT-017, ACT-025, ACT-026, ACT-027, ACT-028,
//                             ACT-029, ACT-030, ACT-031, ACT-112, ACT-114,
//                             ACT-115
//   session family (4):        ACT-004, ACT-005, ACT-006, ACT-007
//   hygiene family (3):        ACT-009, ACT-010, ACT-065
//   history family (3):        ACT-038, ACT-054, ACT-095
//   name-exists family (2):    ACT-052, ACT-070
//   member-session family (1): ACT-060
//
// WHY THESE CLAIMS ARE NOT AFFORDANCE CLAIMS. The runner's ladder grades an
// action from an exact-control hit on a label the page carries (adversarial
// finding F3). These actions say what the PAGE must show or what a WRITE
// must answer ("create route shows signed-in chrome and a card form: /new/
// Basic", "stays signed in after browser Back", "the history page lists the
// card's acts (not just a 200)"), not which label to click. The extractor's
// verb list mints nothing from them, so the runner minted no case at all.
//
// CONTRACT. Same shape as lib/exhaustive-affordance-targets.mjs and
// lib/exhaustive-ungradeable-batch2-targets.mjs: every entry a case pushes
// carries the case's id, every "assert-present" entry is a REQUIRED leg (the
// runner fails the action unless every required leg read > 0), witnesses are
// diagnostics, and write-shaped cases go through the live-walk gate so a
// restricted mode turns them into "write-skipped" (the run declines to grade,
// never passes on an unexercised claim).
//
// THE FACTS EACH CASE IS WRITTEN AGAINST (measured 2026-10-23 on the ts
// engine over synthetic-v1, local, the same tip; probe receipts under
// .runtime/exhaustive/2026-10-23-pageonly-probe/):
//   - Every create route named by these actions answers 200 and renders the
//     signed-in chrome (a.signout-link) plus a card form
//     (form[action="/card/create"] carrying input[name="card[name]"] and a
//     submit control): /new/RichText, /new/Basic, /new/Date,
//     /Some_New_Name, /new, /new?view=new, /card/new, /Razmatazz, /20261015,
//     /*new.
//   - The /new/RichText form's own submit POSTs /card/create, the POST
//     answers 200, the browser lands on the new card's own page, and the
//     card's .json answers 200 carrying the name.
//   - The session survives a navigation, the browser's Back, a reload and a
//     round trip off the origin (about:blank and back): a.signout-link
//     renders on every one of those pages.
//   - The signed-in home page answers with no console error, no failed
//     request and no response at or above 400.
//   - A card's own /history view answers 200, renders the .history-view
//     wrapper, and lists the card's acts (the .accordion-item list).
//   - POST /card/create with an existing name is refused 422 with the
//     engine's name-conflict error, and the existing card is untouched.
//   - The member's own sign-in lands on a signed-in page (a.signout-link).
//
// Every trigger below is an exact substring of ONE matrix action text; the
// lane checked each against all 190 texts (the table under TRIGGERS), so no
// case fires on an action it was not written for.

import { decideWrite } from "./live-walk-profile.mjs";

/** Gates one write-shaped case. Same contract as the sibling modules'
 *  gateWrite: true to run it; when the profile refuses, pushes the skip into
 *  the sequence and returns false. */
function gateWrite(sequence, writeGate, { verb, cardName, detail }) {
  if (!writeGate || writeGate.profile.mode === "full") return true;
  const decision = decideWrite(writeGate.profile, { verb, cardName, detail });
  if (decision.allowed) return true;
  sequence.push({
    interaction: "write-skipped",
    verb,
    cardName: cardName ?? null,
    mode: writeGate.profile.mode,
    reason: decision.reason,
  });
  return false;
}

/** The fixture card whose history view the history family drives. synthetic-v1
 *  holds "Topic 001" (the deck's own topic card); its history view answers
 *  200 and lists its acts. */
const HISTORY_CARD = "Topic 001";

/** The fixture card whose name the name-exists family tries to reuse. Home is
 *  the deck's own home card; the create route refuses its name. */
const EXISTING_NAME = "Home";

/** The create route each create-route action names, keyed by the exact
 *  substring of that action's text. Every key is a substring of exactly one
 *  matrix action text (checked against all 190). */
const CREATE_ROUTE_PATHS = [
  ["card form: /new/RichText", "/new/RichText"],
  ["card form: /new/Basic", "/new/Basic"],
  ["card form: /new/Date", "/new/Date"],
  ["card form: unknown card name (/Some_New_Name)", "/Some_New_Name"],
  ["card form: unknown card name /new", "/new"],
  ["card form: unknown card ?view=new", "/new?view=new"],
  ["card form: /card/new", "/card/new"],
  ["unknown name /Razmatazz offers", "/Razmatazz"],
  ["unknown name /20261015 offers", "/20261015"],
  ["/*new serves Decko's new-card page", "/*new"],
];

/**
 * Drives the page-only target cases for one action. Same ctx contract as
 * affordanceTargetProbes; returns the sequence entries to append (empty when
 * the action needs none of these cases).
 */
export async function pageOnlyTargetCases({
  text, base, goto, settle, countSelector, evaluate, page, pageRequest, newActorRequest, writeGate = null, stepTimeout = 30_000,
}) {
  const ctx = { text, base, goto, settle, countSelector, evaluate, page, pageRequest, newActorRequest, writeGate, stepTimeout };
  const sequence = [];
  const t = String(text ?? "");
  let currentCase = null;
  const push = (entry) => {
    const tagged = { case: currentCase, ...entry };
    if (tagged.interaction === "assert-present") tagged.required = true;
    sequence.push(tagged);
  };
  const witness = (entry) => sequence.push({ case: currentCase, interaction: "witness", ...entry });

  // ---------------------------------------------------------------------
  // create-route family (ACT-017, ACT-025..031, ACT-112, ACT-114,
  // ACT-115): the named route answers with the signed-in chrome and a card
  // form a person can fill and submit.
  const routeEntry = CREATE_ROUTE_PATHS.find(([needle]) => t.includes(needle));
  if (routeEntry) {
    const route = routeEntry[1];
    currentCase = `page-only case 1 create route chrome and card form (${route})`;
    if (!page) throw new Error("create-route family needs the runner's page helper");
    // The case drives its own navigation so it owns the response object and
    // the status it grades on.
    const res = await page.goto(base + route, { waitUntil: "load", timeout: stepTimeout }).catch(() => null);
    await settle();
    const navStatus = res && typeof res.status === "function" ? res.status() : null;
    const signout = await countSelector("a.signout-link");
    const createForms = await countSelector("form[action='/card/create']");
    const nameFields = await countSelector("form[action='/card/create'] input[name='card[name]']");
    const submits = await countSelector("form[action='/card/create'] .create-submit-button, form[action='/card/create'] input[type=submit], form[action='/card/create'] button[type=submit]");
    push({
      interaction: "assert-present",
      selector: `${route} answers the create route (status ${navStatus})`,
      count: navStatus === 200 ? 1 : 0,
      status: navStatus,
    });
    push({
      interaction: "assert-present",
      selector: `${route} renders the signed-in chrome (a.signout-link)`,
      count: signout,
      count_detail: { signoutLinks: signout },
    });
    push({
      interaction: "assert-present",
      selector: `${route} renders a card form (form[action='/card/create'] with a card[name] field and a submit control)`,
      count: createForms > 0 && nameFields > 0 && submits > 0 ? 1 : 0,
      createForms,
      nameFields,
      submits,
    });
  }

  // ---------------------------------------------------------------------
  // create-route family, the WRITE half (ACT-017): a RichText card created
  // through /new/RichText's own form lands on the new card's own page.
  if (/create a RichText card via \/new\/RichText and land on it/i.test(t)) {
    currentCase = "page-only case 2 create a RichText card through the form and land on it (ACT-017)";
    const stamp = Date.now().toString(36);
    const name = `Harness_exhaustive_pageonly_${stamp}`;
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: name, detail: "ACT-017 the probe's own scratch RichText card" })) {
      return sequence;
    }
    if (!page) throw new Error("ACT-017 probe needs the runner's page helper");
    await goto("/new/RichText");
    await settle();
    const form = page.locator("form.card-form").filter({ has: page.locator(".create-submit-button") }).filter({ has: page.locator("input[name='card[name]']") }).first();
    const formCount = await form.count().catch(() => 0);
    push({
      interaction: "assert-present",
      selector: "/new/RichText renders the create form the person fills (form.card-form with card[name] and a .create-submit-button)",
      count: formCount,
      formCount,
    });
    if (formCount === 0) return sequence;
    await form.locator("input[name='card[name]']").first().fill(name, { timeout: stepTimeout }).catch(() => {});
    const box = form.locator("textarea[name='card[content]']").first();
    if ((await box.count().catch(() => 0)) > 0) await box.fill(`page-only probe body ${stamp}`, { timeout: stepTimeout }).catch(() => {});
    const pending = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: stepTimeout }).catch(() => null);
    await form.locator(".create-submit-button").first().click({ timeout: stepTimeout }).catch(() => {});
    const res = await pending;
    await page.waitForTimeout(800);
    await settle();
    const postStatus = res ? res.status() : null;
    const landed = decodeURIComponent(page.url());
    const landedName = landed.slice(landed.lastIndexOf("/") + 1);
    const json = await page.request?.get?.(`${base}/${encodeURIComponent(name)}.json`, { maxRedirects: 0 }).catch(() => null);
    const jsonStatus = json ? json.status() : null;
    const jsonName = json && json.ok() ? (await json.json().catch(() => ({}))).name ?? null : null;
    push({
      interaction: "assert-present",
      selector: `the create form's own submit POSTs /card/create and the POST answers (status ${postStatus})`,
      count: postStatus !== null && postStatus < 400 ? 1 : 0,
      postStatus,
      postUrl: res ? res.url() : null,
    });
    push({
      interaction: "assert-present",
      selector: `the browser lands on the new card's own page (${landedName})`,
      count: landedName === name ? 1 : 0,
      landedUrl: landed,
    });
    push({
      interaction: "assert-present",
      selector: `the new card's own .json answers with its name (status ${jsonStatus}, name ${jsonName})`,
      count: jsonStatus === 200 && jsonName === name ? 1 : 0,
      jsonStatus,
      jsonName,
    });
  }

  // ---------------------------------------------------------------------
  // session family (ACT-004, ACT-005, ACT-006, ACT-007): the signed-in
  // session survives the transition the action names. The runner's own page
  // is already signed in as the surface's actor when the case runs, so the
  // session marker is the signed-out link the chrome renders.
  const sessionFamily =
    /\bstays signed in across navigation\b/i.test(t) ? "navigation" :
    /\bstays signed in after browser Back\b/i.test(t) ? "back" :
    /\bstays signed in after reload\b/i.test(t) ? "reload" :
    /\bstays signed in after leaving the site and returning\b/i.test(t) ? "leave-and-return" :
    null;
  if (sessionFamily) {
    currentCase = `page-only case 3 the session survives ${sessionFamily} (${t.slice(0, 60)})`;
    if (!page) throw new Error("session family needs the runner's page helper");
    await goto("/");
    await settle();
    const before = await countSelector("a.signout-link");
    push({
      interaction: "assert-present",
      selector: "the signed-in home page renders the session marker (a.signout-link)",
      count: before,
    });
    let after = 0;
    let where = null;
    if (sessionFamily === "navigation") {
      await goto("/Date_1");
      await settle();
      after = await countSelector("a.signout-link");
      where = "the navigation target";
    } else if (sessionFamily === "back") {
      await goto("/Date_1");
      await settle();
      await page.goBack({ waitUntil: "load", timeout: stepTimeout }).catch(() => {});
      await page.waitForTimeout(600);
      await settle();
      after = await countSelector("a.signout-link");
      where = "the page the browser's Back returned to";
    } else if (sessionFamily === "reload") {
      await page.reload({ waitUntil: "load", timeout: stepTimeout }).catch(() => {});
      await page.waitForTimeout(600);
      await settle();
      after = await countSelector("a.signout-link");
      where = "the reloaded page";
    } else {
      // "leaving the site and returning": the browser leaves the origin
      // entirely (about:blank is a different origin) and comes back to the
      // page it left.
      await page.goto("about:blank", { waitUntil: "load", timeout: stepTimeout }).catch(() => {});
      await page.waitForTimeout(300);
      await page.goBack({ waitUntil: "load", timeout: stepTimeout }).catch(() => {});
      await page.waitForTimeout(700);
      await settle();
      after = await countSelector("a.signout-link");
      where = "the page the browser returned to after leaving the origin";
    }
    push({
      interaction: "assert-present",
      selector: `the session survives ${sessionFamily}: ${where} still renders a.signout-link`,
      count: after,
      where,
    });
  }

  // ---------------------------------------------------------------------
  // hygiene family (ACT-009, ACT-010, ACT-065): the signed-in page answers
  // with no console error, no failed request and no response at or above
  // 400 (ACT-065 names the 5xx half).
  const hygieneFamily =
    /\bno blocked or 4xx\/5xx subresource on the signed-in page\b/i.test(t) ? "subresource" :
    /\bno console errors on the signed-in page\b/i.test(t) ? "console" :
    /\bno request returned a 5xx\b/i.test(t) ? "5xx" :
    null;
  if (hygieneFamily) {
    currentCase = `page-only case 4 the signed-in page answers clean (${hygieneFamily})`;
    if (!page) throw new Error("hygiene family needs the runner's page helper");
    const consoleErrors = [];
    const failedRequests = [];
    const responses = [];
    const onConsole = (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); };
    const onRequestFailed = (r) => failedRequests.push({ url: r.url(), failure: r.failure()?.errorText ?? null });
    const onResponse = (r) => responses.push({ url: r.url(), status: r.status(), type: r.request().resourceType() });
    page.on("console", onConsole);
    page.on("requestfailed", onRequestFailed);
    page.on("response", onResponse);
    await goto("/");
    await page.waitForTimeout(1200);
    await settle();
    page.off("console", onConsole);
    page.off("requestfailed", onRequestFailed);
    page.off("response", onResponse);
    // A request the run itself aborted (the runner's own navigations racing a
    // settle) is not a broken subresource; a BLOCKED one is.
    const blocked = failedRequests.filter((f) => /BLOCKED/i.test(f.failure ?? ""));
    const errored = responses.filter((r) => r.status >= 400);
    const server5xx = responses.filter((r) => r.status >= 500);
    if (hygieneFamily === "console") {
      push({
        interaction: "assert-present",
        selector: `the signed-in page raises no console error (${consoleErrors.length})`,
        count: consoleErrors.length === 0 ? 1 : 0,
        consoleErrors: consoleErrors.slice(0, 10),
      });
    } else if (hygieneFamily === "subresource") {
      push({
        interaction: "assert-present",
        selector: `the signed-in page's subresources are neither blocked nor 4xx/5xx (${blocked.length} blocked, ${errored.length} at or above 400)`,
        count: blocked.length === 0 && errored.length === 0 ? 1 : 0,
        blocked: blocked.slice(0, 10),
        errored: errored.slice(0, 10),
      });
    } else {
      push({
        interaction: "assert-present",
        selector: `the signed-in page's requests return no 5xx (${server5xx.length})`,
        count: server5xx.length === 0 ? 1 : 0,
        server5xx: server5xx.slice(0, 10),
      });
    }
    witness({
      selector: "every response the signed-in page drew",
      responses: responses.map((r) => `${r.status} ${r.type} ${r.url}`).slice(0, 30),
      failedRequests: failedRequests.slice(0, 10),
    });
  }

  // ---------------------------------------------------------------------
  // history family (ACT-038, ACT-054, ACT-095): a card's own history view
  // renders and lists the card's acts.
  const historyFamily =
    /\ba card's history view renders\b/i.test(t) ? "renders" :
    /\bthe history page lists the card's acts\b/i.test(t) ? "lists-acts" :
    /\bH1 View a card's history page\b/i.test(t) ? "renders" :
    null;
  if (historyFamily) {
    currentCase = `page-only case 5 the card's own history view (${historyFamily})`;
    const path = `/${encodeURIComponent(HISTORY_CARD)}/history`;
    if (!page) throw new Error("history family needs the runner's page helper");
    const res = await page.goto(base + path, { waitUntil: "load", timeout: stepTimeout }).catch(() => null);
    await settle();
    const status = res && typeof res.status === "function" ? res.status() : null;
    const historyView = await countSelector(".history-view");
    const acts = await countSelector(".history-view .accordion-item");
    push({
      interaction: "assert-present",
      selector: `${path} answers 200 and renders the history view (status ${status})`,
      count: status === 200 && historyView > 0 ? 1 : 0,
      status,
      historyViews: historyView,
    });
    if (historyFamily === "lists-acts") {
      push({
        interaction: "assert-present",
        selector: `the history view lists the card's acts (${acts} act entries)`,
        count: acts,
        acts,
      });
    } else {
      witness({ selector: "the act entries the history view lists", acts });
    }
  }

  // ---------------------------------------------------------------------
  // name-exists family (ACT-052, ACT-070): creating a card whose name
  // already exists is refused, with the engine's name-conflict error, and
  // the existing card is untouched.
  if (/creating a card whose name already exists is refused/i.test(t)) {
    currentCase = "page-only case 6 a card whose name already exists is refused (ACT-052, ACT-070)";
    if (!gateWrite(sequence, writeGate, { verb: "create", cardName: EXISTING_NAME, detail: "ACT-052/ACT-070 the probe's refused duplicate-name create" })) {
      return sequence;
    }
    if (!pageRequest) throw new Error("name-exists family needs the runner's pageRequest helper");
    const before = await pageRequest.get(`${base}/${encodeURIComponent(EXISTING_NAME)}.json`, { maxRedirects: 0 }).catch(() => null);
    const beforeName = before && before.ok() ? (await before.json().catch(() => ({}))).name ?? null : null;
    const res = await pageRequest
      .post(`${base}/card/create`, {
        headers: { origin: base },
        form: { "card[name]": EXISTING_NAME, "card[type]": "Basic", "card[content]": "page-only duplicate-name probe", "success[redirect]": "true" },
        maxRedirects: 0,
      })
      .catch((e) => ({ error: String(e?.message ?? e) }));
    const status = res && typeof res.status === "function" ? res.status() : null;
    const body = res && typeof res.text === "function" ? await res.text().catch(() => "") : "";
    const conflict = /name-conflict/i.test(body);
    const after = await pageRequest.get(`${base}/${encodeURIComponent(EXISTING_NAME)}.json`, { maxRedirects: 0 }).catch(() => null);
    const afterName = after && after.ok() ? (await after.json().catch(() => ({}))).name ?? null : null;
    push({
      interaction: "assert-present",
      selector: `the duplicate-name create is refused with the engine's name-conflict error (status ${status})`,
      count: status === 422 && conflict ? 1 : 0,
      status,
      conflict,
      bodyHead: body.replace(/\s+/g, " ").slice(0, 200),
    });
    push({
      interaction: "assert-present",
      selector: `the existing card is untouched (${beforeName} -> ${afterName})`,
      count: beforeName === EXISTING_NAME && afterName === EXISTING_NAME ? 1 : 0,
      beforeName,
      afterName,
    });
  }

  // ---------------------------------------------------------------------
  // member-session family (ACT-060): the member's own sign-in lands on a
  // signed-in page.
  if (/\bthe member is signed in\b/i.test(t)) {
    currentCase = "page-only case 7 the member is signed in (ACT-060)";
    if (!newActorRequest) throw new Error("member-session family needs the runner's newActorRequest helper");
    const member = await newActorRequest("member");
    const res = await member.get(`${base}/`, { maxRedirects: 0 }).catch(() => null);
    const status = res && typeof res.status === "function" ? res.status() : null;
    const body = res && typeof res.text === "function" ? await res.text().catch(() => "") : "";
    // The signed-in chrome renders the signed-out link; the signed-out page
    // renders the sign-in form instead.
    const signout = (body.match(/class="[^"]*signout-link/g) ?? []).length;
    const signinForm = /name="card\[subcards\]\[\+\*email\]\[content\]"/.test(body);
    push({
      interaction: "assert-present",
      selector: `the member's own signed-in home answers ${status} with the signed-in chrome`,
      count: status === 200 && signout > 0 && !signinForm ? 1 : 0,
      status,
      signoutLinks: signout,
      signinForm,
    });
  }

  return sequence;
}

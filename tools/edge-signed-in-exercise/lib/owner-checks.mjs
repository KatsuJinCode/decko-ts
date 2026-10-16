// owner-checks.mjs — the REQUIRED checks taken from the site owner's failures on
// 2026-10-15, and his session replayed as one scripted journey.
//
// Source: C:/localProjects/brandonDojoTech/recovery/release/brandon-bunny-deploy/
// demo-2026-10-15-audit/ (README.md and brandon-timeline.md, rebuilt from the Bunny
// request logs). Each check below names the audit row it answers. Every card these
// checks create is named Harness_owner_* and pushed on the run's cleanup list.

import { deleteOutcome } from './delete-outcome.mjs';

const SIGNED_IN_RE = /decko\.signed_in"[^>]*value="true"|decko\.signed_in\s*=\s*true/;
const NEW_CARD_FORM_RE = /<form[^>]*class="[^"]*card-form/;

/** The required checks. ctx: { stack, page, creds, record, attempt, linesSince, visit,
 *  signIn, created, launchBrowser, assetHosts, database }. */
export async function ownerRequiredChecks(ctx) {
  const { stack, page, creds, record, attempt, linesSince, visit, signIn, created, launchBrowser, assetHosts, database } = ctx;
  const O = stack.origin;
  const ownerCard = "Brandon WilliamsCraig";

  // ---- row 1: search box suggestions, signed in and signed out -----------------
  const timedSuggest = (p, term) =>
    p.evaluate(async ({ origin, term }) => {
      const t0 = performance.now();
      const r = await fetch(`${origin}/*search/search_box_complete.json?term=${encodeURIComponent(term)}`, {
        credentials: "include",
        headers: { "x-requested-with": "XMLHttpRequest" },
      });
      const body = await r.text();
      return { term, status: r.status, ms: Math.round(performance.now() - t0), head: body.slice(0, 60) };
    }, { origin: O, term });
  const TERMS = ["202", "2026", "202609"]; // the owner's three keystrokes

  await attempt("row 1 search box suggestions (signed in)", async () => {
    const results = [];
    for (const term of TERMS) results.push(await timedSuggest(page, term));
    const ok = results.every((r) => r.status === 200 && r.ms < 1000);
    record("row 1: search box suggestions answer within 1 s, signed in", ok, { results });
  });

  await attempt("row 1 search box suggestions (signed out)", async () => {
    // A fresh anonymous session, so the FIRST keystroke is the owner's first
    // keystroke: that cold request is the one the client gave up on.
    const anon = await launchBrowser({ origin: O, assetHosts });
    try {
      await anon.page.goto(`${O}/*search`, { waitUntil: "load" });
      const results = [];
      for (const term of TERMS) results.push(await timedSuggest(anon.page, term));
      const cold = results[0];
      const warm = results.slice(1);
      const ok = results.every((r) => r.status === 200 && r.ms < 1000);
      record("row 1: search box suggestions answer within 1 s, signed out (first keystroke cold)",
        ok, { cold, warm, note: "cold = first keystroke in a fresh session, the request the client abandoned" });
    } finally {
      await anon.close().catch(() => undefined);
    }
  });

  // ---- row 2: unknown names and /*new in signed-in chrome ----------------------
  for (const path of ["/Razmatazz", "/deletethistest", "/20261015"]) {
    await attempt(`row 2 unknown name ${path}`, async () => {
      const seen = await visit(path);
      const ok = seen.status === 200 && seen.signedIn && seen.hasSignOut && NEW_CARD_FORM_RE.test(seen.html);
      record(`row 2: unknown name ${path} offers the new-card form in signed-in chrome`, ok,
        { status: seen.status, signedIn: seen.signedIn, hasSignOut: seen.hasSignOut, form: NEW_CARD_FORM_RE.test(seen.html) });
    });
  }

  await attempt("row 2 /*new", async () => {
    const seen = await visit("/*new");
    const ok = seen.status === 200 && seen.signedIn && seen.hasSignOut && NEW_CARD_FORM_RE.test(seen.html);
    record("row 2: /*new serves Decko's new-card page in signed-in chrome", ok,
      { status: seen.status, signedIn: seen.signedIn, form: NEW_CARD_FORM_RE.test(seen.html), title: seen.title });
  });

  // ---- row 3: editor name suggestions ------------------------------------------
  const nameMatch = (p, path) =>
    p.evaluate(async ({ origin, path }) => {
      const r = await fetch(`${origin}${path}`, { credentials: "include", headers: { "x-requested-with": "XMLHttpRequest" } });
      const text = await r.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* not JSON */ }
      return { status: r.status, isArray: Array.isArray(parsed), count: Array.isArray(parsed) ? parsed.length : null, head: text.slice(0, 80) };
    }, { origin: O, path });
  const mainParam = `main=${encodeURIComponent(ownerCard)}`;

  await attempt("row 3 *all name_match", async () => {
    const results = [];
    for (const term of ["delete", "delet", "a", "b", "c"]) {
      results.push({ term, ...(await nameMatch(page, `/*all.json?view=name_match&${mainParam}&term=${term}`)) });
    }
    record("row 3: `*all.json?view=name_match` answers suggestions (the owner's editor, five keystrokes)",
      results.every((r) => r.status === 200 && r.isArray), { results });
  });

  await attempt("row 3 rule content_options name_match", async () => {
    const result = await nameMatch(page, `/Project_s_Organizing+*right+*content_options.json?view=name_match&${mainParam}&term=Gu`);
    record("row 3: the rule's `+*right+*content_options` name_match answers suggestions",
      result.status === 200 && result.isArray, result);
  });

  // ---- row 4: saving the owner's own card -------------------------------------
  await attempt("row 4 save the owner's card, edit flow", async () => {
    // Open the edit view and read the form's current values, then save it as the
    // owner did (Save and Close). The request log is checked for any 5xx.
    const beforeOpen = linesSince ? ctx.ledger().length : 0;
    await page.goto(`${O}/Brandon_WilliamsCraig/edit`, { waitUntil: "load" });
    // The OWNER'S edit form is #edit_card_N (the card being edited); other
    // forms on the page (new_card, search) are not it.
    const formAction = await page.locator("form[id^='edit_card']").first().getAttribute("action").catch(() => null);
    // Save and Close is data-cy="submit-modal"; the board's plain Save is data-cy="save".
    const saveButton = page.locator("form[id^='edit_card'] button[data-cy='submit-modal']").first();
    const hasSave = (await saveButton.count()) > 0;
    if (!hasSave) {
      record("row 4: the owner's card has a Save and Close control", false, { formAction });
      return;
    }
    const responded = page.waitForResponse((r) => r.url().includes("/update/") && r.request().method() === "POST", { timeout: 20_000 }).catch(() => null);
    await saveButton.click().catch(() => undefined);
    await responded;
    await page.waitForTimeout(1500);
    const writes = linesSince(beforeOpen).filter((l) => l.method !== "GET");
    const worst = writes.reduce((m, l) => Math.max(m, l.status), 0);
    record("row 4: saving the owner's card succeeds (no 5xx)", writes.length > 0 && worst < 400,
      { formAction, writes: writes.map((w) => `${w.method} ${w.path.slice(0, 60)} ${w.status}`), worst });
  });

  await attempt("row 4 POST /update/~1743 (the owner's nested pointer list)", async () => {
    // ~1743 is the Brandon WilliamsCraig+Project(s) Organizing list; the same id in the
    // local deck. Post its current value back (as the form does) and expect a redirect.
    const current = database().prepare("SELECT db_content FROM cards WHERE id = 1743").get();
    const body = new URLSearchParams({ _method: "patch", "card[content]": current?.db_content ?? "", "success[redirect]": "true" }).toString();
    const beforeOpen = ctx.ledger().length;
    // page.request shares the browser session's cookies and is not tied to the
    // page's execution context, so a navigation in progress cannot break it.
    const r = await page.request.post(`${O}/update/~1743`, {
      headers: { "content-type": "application/x-www-form-urlencoded", origin: O },
      data: body,
      maxRedirects: 0,
    });
    const result = { status: r.status(), text: (await r.text()).slice(0, 120) };
    const line = linesSince(beforeOpen).find((l) => l.path.startsWith("/update/~1743"));
    // The host ledger is the truth; a missing line is not a pass.
    record("row 4: POST /update/~1743 (owner's save) succeeds, not 500",
      result.status < 400 && line !== undefined && line.status < 400,
      { status: result.status, hostStatus: line?.status ?? null, body: result.text.slice(0, 160) });
  });

  // ---- row 5: sign-out via GET /delete/*signin --------------------------------
  await attempt("row 5 sign-out via GET /delete/*signin", async () => {
    await page.goto(`${O}/`, { waitUntil: "load" });
    // The visible navbar Sign out is a.signout-link (nav-link). The same href also
    // appears inside the Account dropdown (hidden), so the locator must name the
    // visible one, or a click waits on a hidden element.
    const link = page.locator("a.signout-link").first();
    const hasLink = (await link.count()) > 0;
    if (!hasLink) { record("row 5: the navbar has a Sign out link", false, {}); return; }
    const beforeOpen = ctx.ledger().length;
    await link.click({ timeout: 10_000 }).catch((e) => record("row 5: the Sign out link is clickable", false, { error: String(e).slice(0, 120) }));
    await page.waitForTimeout(2500);
    // The navbar Sign out link is Ruby^: the delete action on the *signin card.
    // The edge must serve it as a DELETE that ends the session, not 404.
    const line = linesSince(beforeOpen).find((l) => l.path.startsWith("/delete/*signin") || l.path.includes("/delete/") && l.path.includes("signin"));
    const cookies = await page.context().cookies(O);
    const cookieGone = !cookies.some((c) => c.name === "decko_ts_session" && c.value.length > 0);
    const after = await visit("/");
    record("row 5: Sign out (GET /delete/*signin) signs out, not 404",
      line !== undefined && line.status < 400 && cookieGone && !after.signedIn,
      { hostStatus: line?.status ?? null, cookieGone, signedInAfter: after.signedIn });
  });
  await attempt("row 5 back in after sign-out", () => signIn(creds.admin)); // back in for the rows that need it

  // ---- row 6: creating a Cardtype -----------------------------------------------
  // The owner's create-a-Cardtype path. /new/Cardtype takes a NAME the person types
  // and creates a new card of type Cardtype. /Type/new (the owner's path) prefills
  // the name with the card's own name, "Type", a hidden field: the deck already
  // has a card named Type (id 17779), so that submit is the name-conflict 422.
  // Ruby renders the same hidden name (new.rb new_name_prompt? is false for a
  // non-blank name), so the 422 is Ruby's answer for that path; the working path
  // for a new cardtype is /new/Cardtype.
  await attempt("row 6 create a Cardtype via /new/Cardtype", async () => {
    const name = `Harness_owner_Cardtype_${Date.now().toString(36)}`;
    created.push(name);
    const seen = await visit("/new/Cardtype");
    const nameField = page.locator("form[action='/card/create'] input[name='card[name]']:visible").first();
    const visibleNameField = (await nameField.count()) > 0;
    if (visibleNameField) await nameField.fill(name).catch(() => undefined);
    const beforeOpen = ctx.ledger().length;
    await page.locator("form[action='/card/create'] button[type='submit']:visible, form[action='/card/create'] input[type='submit']:visible").first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    const line = linesSince(beforeOpen).find((l) => l.path.startsWith("/card/create"));
    const row = database().prepare("SELECT id, type_id FROM cards WHERE name = ? AND trash = 0").get(name);
    const typeName = row ? database().prepare("SELECT name FROM cards WHERE id = ?").get(row.type_id)?.name : null;
    record("row 6: creating a Cardtype (a new name) succeeds, not 422", line !== undefined && line.status < 400 && row !== undefined && typeName === "Cardtype",
      { formShown: seen.status, visibleNameField, hostStatus: line?.status ?? null, storedType: typeName });
  });

  await attempt("row 6 /Type/new refuses the duplicate 'Type' with the name-conflict message", async () => {
    const seen = await visit("/Type/new");
    const hidden = await page.locator("form[action='/card/create'] input[name='card[name]']").first().getAttribute("value");
    // Read the response itself, not the ledger's 240-byte excerpt: the reason
    // sits past the alert's markup.
    const responded = page.waitForResponse((r) => r.url().includes("/card/create") && r.request().method() === "POST", { timeout: 20_000 }).catch(() => null);
    await page.locator("form[action='/card/create'] button[type='submit']:visible, form[action='/card/create'] input[type='submit']:visible").first().click().catch(() => undefined);
    const response = await responded;
    const body = response ? (await response.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : "";
    const reason = /(must be unique[^.]*|already exists[^.]*)/i.exec(body)?.[0] ?? null;
    record("row 6: /Type/new refuses the existing name 'Type' with a clear name-conflict (422, not 500)",
      seen.status === 200 && hidden === "Type" && response !== null && response.status() === 422 && reason !== null,
      { prefilledName: hidden, hostStatus: response?.status() ?? null, reason });
  });

  // ---- row 7: the Delete button deletes ----------------------------------------
  await attempt("row 7 Delete button deletes a card", async () => {
    const name = `Harness_owner_DeleteThisTest_${Date.now().toString(36)}`;
    created.push(name);
    await visit("/new/RichText");
    await page.locator("form.card-form input[name='card[name]']").first().fill(name).catch(() => undefined);
    await page.locator("form.card-form button[type='submit'], form.card-form input[type='submit']").first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    await page.goto(`${O}/${encodeURIComponent(name)}/edit`, { waitUntil: "load" });
    const beforeOpen = ctx.ledger().length;
    const responsePending = page.waitForResponse(r => {
      try { return decodeURIComponent(new URL(r.url()).pathname) === "/delete/" + name; } catch { return false; }
    }, { timeout: 20_000 }).catch(() => null);
    await page.evaluate((target) => {
      const a = [...document.querySelectorAll("a[href^='/delete/']")].find((x) => x.getAttribute("href")?.startsWith(target));
      a?.click();
    }, `/delete/${name}`).catch(() => undefined);
    const response = await responsePending;
    const responseBody = response ? await response.text() : "";
    let redirect = null;
    try { redirect = JSON.parse(responseBody).redirect; } catch { /* HTML slot response. */ }
    if (typeof redirect === "string") {
      await page.waitForURL(new URL(redirect, O).href, { waitUntil: "load", timeout: 20_000 }).catch(() => undefined);
    } else {
      await page.waitForFunction(target => [...document.querySelectorAll('.just_deleted-view')]
        .some(node => (node.getAttribute('data-card-name') ?? '').replaceAll('_', ' ') === target.replaceAll('_', ' ')), name, { timeout: 5_000 }).catch(() => undefined);
    }
    const line = linesSince(beforeOpen).find((l) => l.path.startsWith(`/delete/${name}`));
    const after = await page.content();
    const trashed = database().prepare("SELECT trash FROM cards WHERE name = ?").get(name)?.trash === 1;
    const outcome = deleteOutcome({ html: after, name, origin: O, finalUrl: page.url(), responseBody });
    const raw = ctx.captureEvidence(after, { check: "owner-delete-after", name, url: page.url(), responseStatus: response?.status() ?? null, responseBody, ...outcome });
    record("row 7: the Delete button removes the card and completes the previous-page redirect or deleted confirmation, without recreating that target",
      line !== undefined && line.status < 400 && response !== null && response.status() < 400 && trashed && outcome.pageAccepted,
      { hostStatus: line?.status ?? null, trashed, showsNewCardForm: outcome.targetCreateForm, ...outcome, raw, url: page.url().slice(O.length) });
  });
}

/** The owner's session, replayed: his request order from brandon-timeline.md, from
 *  a signed-out start, with his sign-ins and sign-outs in place. Each step is one
 *  request the owner made (assets and his 499s are not replayed; they were client
 *  aborts, not server answers). Every step's status comes from the host's own log.
 *  ctx as above, plus launchBrowser, creds. */
export async function ownerReplay(ctx) {
  const { stack, creds, record, attempt, launchBrowser, assetHosts, created, ledger } = ctx;
  const O = stack.origin;
  const replay = await launchBrowser({ origin: O, assetHosts });
  const page = replay.page;
  const steps = [];
  // asset requests: /mod/* (the TinyMCE dist redirects to cdnjs), /files, favicon
  const ASSET_RE = /^\/(mod|files)\//;
  const step = async (label, expect, fn) => {
    const before = ledger().length;
    let note = null;
    try { note = await fn(); } catch (e) { note = `threw: ${String(e?.message ?? e).slice(0, 120)}`; }
    await page.waitForTimeout(400);
    const lines = ledger().slice(before);
    // The status is the step's OWN request. Assets the page then pulls (TinyMCE,
    // fonts, /mod/ files) land in the same window and answer 302 or 200; taking
    // the last line of the window would grade the asset, not the step.
    const hint = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s]*)/.exec(label);
    const request = note?.request ?? (hint ? {method:hint[1],path:hint[2]} : undefined);
    const last = request && lines.find(line => line.method === request.method &&
      new URL(line.path,O).pathname === new URL(request.path,O).pathname);
    const status = last?.status ?? null;
    const threw = typeof note === 'string' && note.startsWith('threw:');
    const ok = !threw && (typeof expect === "function" ? expect(status, note) : status !== null && status === expect);
    steps.push({ label, status, ok, method:last?.method, path: last?.path?.slice(0, 70), note: typeof note === "string" ? note.slice(0, 80) : note?.summary });
    return ok;
  };
  const nav = (path) => async () => { await page.goto(`${O}${path}`, { waitUntil: "load", timeout: 60000 }); return {request:{method:'GET',path}}; };
  const json = (path) => async () => { const summary = await page.evaluate(async ({ origin, path }) => {
    const r = await fetch(`${origin}${path}`, { credentials: "include", headers: { "x-requested-with": "XMLHttpRequest" } });
    return `${r.status} ${(await r.text()).length}B`;
  }, { origin: O, path }); return {request:{method:'GET',path},summary}; };
  const signInForm = (acct) => async () => {
    await page.goto(`${O}/*signin`, { waitUntil: "load" });
    await page.fill('input[name="card[subcards][+*email][content]"]', acct.email);
    await page.fill('input[name="card[subcards][+*password][content]"]', acct.password);
    const observed = page.waitForResponse(response => new URL(response.url()).pathname === '/update/*signin' && response.request().method() === 'POST');
    await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
    await (await observed).finished();
    return {request:{method:'POST',path:'/update/*signin'}};
  };
  // page.request: shares the replay browser's session cookies, independent of any
  // navigation the page is in the middle of.
  const post = (path, body) => async () => {
    const r = await page.request.post(`${O}${path}`, { headers: { "content-type": "application/x-www-form-urlencoded", origin: O }, data: body, maxRedirects: 0 });
    return {request:{method:'POST',path},summary:`status ${r.status()}`};
  };

  const stamp = Date.now().toString(36);
  const cardtypeName = `Harness_owner_Cardtype_r${stamp}`;
  const deleteName = `Harness_owner_DeleteThisTest_r${stamp}`;
  created.push(cardtypeName, deleteName);

  await attempt("owner replay", async () => {
    // signed out start
    await step("GET /  (signed out)", 200, nav("/"));
    await step("GET /*search  (signed out)", 200, nav("/*search"));
    await step("GET /*signin", 200, nav("/*signin"));
    await step("POST sign-in as the owner (form)", 200, () => signInForm(creds.admin)());
    await step("GET /  (signed in)", 200, nav("/"));
    await step("GET /*search", 200, nav("/*search"));
    await step("GET search_box_complete term=202", 200, json("/*search/search_box_complete.json?term=202"));
    await step("GET search_box_complete term=2026", 200, json("/*search/search_box_complete.json?term=2026"));
    await step("GET search_box_complete term=202609", 200, json("/*search/search_box_complete.json?term=202609"));
    await step("GET /*search?query[keyword]=202609", 200, nav("/*search?utf8=%E2%9C%93&query%5Bkeyword%5D=202609"));
    await step("GET /*search paging offset=100", 200, nav("/*search?limit=20&offset=100&main=*search"));
    await step("GET /Razmatazz (unknown name)", 200, nav("/Razmatazz"));
    await step("GET /deletethistest (unknown name)", 200, nav("/deletethistest"));
    await step("GET /20261015 (unknown name)", 200, nav("/20261015"));
    await step("GET /*new", 200, nav("/*new"));
    await step("GET /Brandon_WilliamsCraig", 200, nav("/Brandon_WilliamsCraig"));
    await step("GET /Brandon_WilliamsCraig/edit", 200, nav("/Brandon_WilliamsCraig/edit"));
    for (const term of ["delete", "delet", "a", "b", "c"]) {
      await step(`GET *all.json name_match term=${term}`, 200, json(`/*all.json?view=name_match&main=Brandon%20WilliamsCraig&term=${term}`));
    }
    await step("GET Project_s_Organizing+*right+*content_options name_match", 200, json("/Project_s_Organizing+*right+*content_options.json?view=name_match&main=Brandon%20WilliamsCraig&term=Gu"));
    // the owner's save, twice (the audit shows two 500s)
    const body = new URLSearchParams({ _method: "patch", "card[content]": "replayed value", "success[redirect]": "true" }).toString();
    await step("POST /update/~1743 (save #1)", (s) => s !== null && s < 400, post("/update/~1743", body));
    await step("POST /update/~1743 (save #2)", (s) => s !== null && s < 400, post("/update/~1743", body));
    await step("GET /Conflict_Done_Well", 200, nav("/Conflict_Done_Well"));
    await step("GET /  (signed in)", 200, nav("/"));
    await step("GET /*new", 200, nav("/*new"));
    await step("GET /delete/*signin  (sign out)", (s) => s !== null && s < 400, nav("/delete/*signin"));
    await step("GET /*signin (signed out again)", 200, nav("/*signin"));
    await step("POST sign-in again (form)", 200, () => signInForm(creds.admin)());
    await step("GET /*new", 200, nav("/*new"));
    await step("GET /*search", 200, nav("/*search"));
    await step("GET /Type/new", 200, nav("/Type/new"));
    await step("POST /card/create (Cardtype)", (s) => s !== null && s < 400, async () => {
      await page.goto(`${O}/Type/new`, { waitUntil: "load" });
      await page.locator("form.card-form input[name='card[name]']").first().fill(cardtypeName).catch(() => undefined);
      await page.locator("form.card-form button[type='submit'], form.card-form input[type='submit']").first().click().catch(() => undefined);
      await page.waitForTimeout(2500);
    });
    await step("GET /DeleteThisTest/new (owner's new card)", 200, nav(`/${deleteName}/new`));
    await step("POST /card/create (the card)", (s) => s !== null && s < 400, async () => {
      await page.goto(`${O}/${deleteName}/new`, { waitUntil: "load" });
      await page.locator("form.card-form input[name='card[name]']").first().fill(deleteName).catch(() => undefined);
      await page.locator("form.card-form button[type='submit'], form.card-form input[type='submit']").first().click().catch(() => undefined);
      await page.waitForTimeout(2500);
    });
    await step(`GET /${deleteName}`, 200, nav(`/${deleteName}`));
    await step(`GET /${deleteName}/edit`, 200, nav(`/${deleteName}/edit`));
    await step(`GET /${deleteName}/board`, 200, nav(`/${deleteName}/board`));
    await step(`Delete button GET /delete/${deleteName}`, (s) => s !== null && s < 400, async () => {
      await page.goto(`${O}/${deleteName}/edit`, { waitUntil: "load" });
      await page.evaluate((target) => {
        const a = [...document.querySelectorAll("a[href^='/delete/']")].find((x) => x.getAttribute("href")?.startsWith(target));
        a?.click();
      }, `/delete/${deleteName}`).catch(() => undefined);
      await page.waitForTimeout(2500);
    });
    await step("GET /  (after delete)", 200, nav("/"));
    await step("GET /*search  (after delete)", 200, nav("/*search"));
  });

  await replay.close().catch(() => undefined);

  const failed = steps.filter((s) => !s.ok);
  record("owner replay: every step of the owner's session answers as the owner's did not (no 404, 422, 499 or 500)",
    steps.length > 0 && failed.length === 0,
    { steps: steps.length, failed: failed.map((s) => `${s.label} -> ${s.status}${s.note ? " (" + s.note + ")" : ""}`), table: steps.map((s) => `${s.ok ? "ok" : "FAIL"} ${s.status} ${s.label}`) });
  return steps;
}

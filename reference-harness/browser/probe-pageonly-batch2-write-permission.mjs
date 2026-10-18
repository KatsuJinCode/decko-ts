#!/usr/bin/env node
// probe-pageonly-batch2-write-permission.mjs
//
// Batch 2 of the page-only witnessed actions of the 2026-10-18 exhaustive
// re-grade (.runtime/exhaustive/2026-10-18-regrade: 101 of 190 actions graded
// "page-only" — visited and observed, no affordance exercised). The first
// batch was probe-pageonly-top10-write-permission.mjs (ACT-060/032/033/166/
// 168/170/177/068/069/127). This lane takes actions 11-20 of the same value
// ranking — write-path and permission actions no other committed instrument
// measures. Skipped as already instrumented, on a direct read of the checks
// modules (not the top10 header): C8/C10/C12/C16/C18 and E6/E8/E10/E12/E17
// (ACT-070/071/074/072/073, ACT-079/080, ACT-081/082, ACT-076 — all driven by
// tools/edge-signed-in-exercise/checks-cover-b.mjs:253-602), E23's edit-tail
// (checks-cover-b.mjs:377-387 unchecks and re-stores an existing pointer),
// and ACT-128/129/134/135 (checks-catalog-edit-create.mjs). The batch:
//
//   ACT-046  the account password can be changed and the new one signs in  (write/auth)
//   ACT-047  the account email can be changed and the new one signs in     (write/auth)
//   ACT-121  creating a Cardtype (a new name) succeeds, not 422            (write)
//   ACT-179  C22 creating a card that differs only by letter case is refused (write guard)
//   ACT-041  GET /_signout revokes the session (session cookie gone)       (permission)
//   ACT-043  signing back in works                                         (permission)
//   ACT-004  stays signed in across navigation                             (session)
//   ACT-015  the page shows the new date (long form)                       (write)
//   ACT-016  the original date is restored afterwards (long form)          (write)
//   ACT-118  row 4: saving the owner's card succeeds (no 5xx)              (write)
//
// Every leg drives the affordance the way a person does — the account rows'
// own edit forms, the sign-in form, the /new/<type> create forms, the Date
// card's edit form, the signout link — on the same engine and fixture the
// exhaustive runner grades (reference-harness/browser/engines/ts.json on
// reference-harness/fixtures/synthetic-v1). ACT-046/047 change MIRA MEMBER's
// credentials (never the admin's mid-probe) and restore the originals through
// the same forms before moving on, so a failure leaves the staged deck
// legible; ACT-015/016 edit Date 1 and restore it; ACT-118 appends to the
// owner card's content and restores it. The engine stages a private copy of
// the fixture deck (lib/engines.mjs), so every write this probe makes dies
// with the staging directory regardless. Exits non-zero if any leg is RED.
//
//   node reference-harness/browser/probe-pageonly-batch2-write-permission.mjs \
//     [--engine reference-harness/browser/engines/ts.json] \
//     [--fixture reference-harness/fixtures/synthetic-v1] [--out <dir>]

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
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
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-pageonly-batch2");
const T = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);

mkdirSync(out, { recursive: true });
const report = { out, fixture: fixtureDir, legs: [], failures: 0 };

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[batch2] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 900)}`);
}

const stamp = () => Date.now().toString(36);
const urlKey = (name) => name.replaceAll(" ", "_");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const engine = loadEngine(engineManifest);
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
const spec = readJson(path.join(fixtureDir, "deck.json"));
console.log(`[batch2] engine ${engine.name} on ${server.base} (boot ${server.bootMs}ms)`);

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(T);
page.on("dialog", (d) => d.accept().catch(() => {}));
const api = ctx.request;
if (!["127.0.0.1", "localhost"].includes(new URL(server.base).hostname)) throw Error("batch2 probe requires the loopback engine");

const signIn = async (who, creds) => {
  const a = spec.actors[who];
  const email = creds?.email ?? a.email;
  const password = creds?.password ?? a.password;
  await ctx.clearCookies();
  await page.goto(server.base + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(email, { timeout: T });
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(password, { timeout: T });
  await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
  await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
  await page.waitForTimeout(600);
  const cookies = await ctx.cookies(server.base);
  return {
    signedInChrome: (await page.locator("a.signout-link").first().count().catch(() => 0)) > 0,
    hasSessionCookie: cookies.some((c) => c.name === "decko_ts_session" && c.value.length > 0),
    url: page.url(),
  };
};
const visit = async (p) => {
  const r = await page.goto(server.base + p, { waitUntil: "load", timeout: T }).catch(() => null);
  await page.waitForTimeout(700);
  return { status: r ? r.status() : null, url: page.url() };
};
const evalPage = async (fn, arg) => page.evaluate(fn, arg).catch((e) => ({ error: String(e?.message ?? e) }));
/** The first card-form that is not the navbox/nav forms, as a locator. */
const mainForm = () => page.locator("#main form.card-form").first();
/** Edit form for a card, scoped by its action (edit forms render outside #main). */
const editForm = (name) => page.locator(`form.card-form[action='/update/${urlKey(name)}']`).first();
/** Submit a form the way the person's button does, watching the POST it fires. */
const submitWatching = async (form, urlPart) => {
  const responded = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(urlPart), { timeout: T }).catch(() => null);
  const submit = form.locator("button[type=submit], input[type=submit], .submit-button").first();
  if ((await submit.count().catch(() => 0)) > 0) await submit.click({ timeout: T }).catch(() => {});
  else await form.locator("textarea[name='card[content]'], input[name='card[content]']").first().press("Enter", { timeout: T }).catch(() => {});
  return await responded;
};
const db = () => new DatabaseSync(server.db, { readOnly: true });
/** A junction child row (+*email, +*password) under a holder's +*account, by ids. */
const accountChildRow = (holderName, rightName) => {
  const d = db();
  const row = d.prepare(`
    SELECT child.id, child.db_content FROM cards child
    WHERE child.left_id = (SELECT id FROM cards WHERE right_id=(SELECT id FROM cards WHERE name='*account') AND left_id=(SELECT id FROM cards WHERE name=?) AND trash=0)
      AND child.right_id = (SELECT id FROM cards WHERE name=?) AND child.trash=0
  `).get(holderName, rightName);
  d.close();
  return row ?? null;
};

try {
  await signIn("admin"); // every write leg runs as the administrator unless stated

  // ---------------------------------------------------------------- ACT-121
  // "creating a Cardtype (a new name) succeeds, not 422" (owner audit row 6).
  // The top10 probe's ACT-032 leg proved the add-type LINK opens this form;
  // this leg submits it and requires the new type to be stored as a Cardtype.
  {
    const d0 = db();
    const cardtypeId = d0.prepare("SELECT id FROM cards WHERE name='Cardtype' AND trash=0").get()?.id ?? null;
    d0.close();
    const seen = await visit("/new/Cardtype");
    const form = mainForm();
    const formPresent = (await form.count().catch(() => 0)) > 0;
    const name = "Harness_B2_Kind_" + stamp();
    let post = null, row = null;
    if (formPresent) {
      await form.locator("input[name='card[name]']").first().fill(name, { timeout: T }).catch(() => {});
      const resp = await submitWatching(form, "/card/create");
      post = resp ? { status: resp.status(), location: resp.headers()?.location ?? null } : null;
      await page.waitForTimeout(1500);
      const d = db();
      row = d.prepare("SELECT id, type_id, trash FROM cards WHERE name=? AND trash=0").get(name) ?? null;
      d.close();
    }
    grade("ACT-121", "creating a Cardtype (a new name) succeeds, not 422",
      formPresent && post !== null && post.status < 400 && post.status !== 422 && !!row && String(row.type_id) === String(cardtypeId),
      { cardtypeId, seen, formPresent, post, row });
  }

  // ---------------------------------------------------------------- ACT-179
  // "C22 case-handling on names: creating a card that differs only by letter
  // case is refused". Drive the create form with the name HOME while Home
  // exists; a refusal is an error answer (4xx or an error message on the
  // form) AND no second name-equivalent row AND Home untouched.
  {
    const d0 = db();
    const homeRow = d0.prepare("SELECT id, db_content, type_id FROM cards WHERE name='Home' AND trash=0").get() ?? null;
    d0.close();
    const caseName = "HOME";
    const seen = await visit(`/new/Basic?card%5Bname%5D=${caseName}`);
    const form = mainForm();
    const formPresent = (await form.count().catch(() => 0)) > 0;
    let post = null, errorShown = null, equivalents = null, homeAfter = null;
    if (formPresent) {
      const nameField = form.locator("input[name='card[name]']").first();
      if ((await nameField.count().catch(() => 0)) > 0) await nameField.fill(caseName, { timeout: T }).catch(() => {});
      const ta = form.locator("textarea[name='card[content]']:visible").first();
      if ((await ta.count().catch(() => 0)) > 0) await ta.fill("C22 case probe body " + stamp(), { timeout: T }).catch(() => {});
      const resp = await submitWatching(form, "/card/create");
      post = resp ? { status: resp.status(), location: resp.headers()?.location ?? null } : null;
      await page.waitForTimeout(1500);
      errorShown = await evalPage(() =>
        [...document.querySelectorAll(".form-error, .alert-danger, .error, .invalid-feedback")].map((e) => e.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 4));
      const d = db();
      equivalents = d.prepare("SELECT id, name, trash FROM cards WHERE LOWER(name)=LOWER('Home') ORDER BY id").all();
      homeAfter = d.prepare("SELECT id, db_content, trash FROM cards WHERE name='Home' AND trash=0").get() ?? null;
      d.close();
    }
    const noNewRow = Array.isArray(equivalents) && equivalents.filter((r) => r.id !== homeRow?.id).length === 0;
    const homeUntouched = !!homeAfter && homeRow !== null && homeAfter.id === homeRow.id && homeAfter.db_content === homeRow.db_content && homeAfter.trash === 0;
    grade("ACT-179", "C22 creating a card that differs only by letter case is refused",
      formPresent && post !== null && (post.status >= 400 || (Array.isArray(errorShown) && errorShown.length > 0)) && noNewRow && homeUntouched,
      { homeRowId: homeRow?.id ?? null, seen, post, errorShown, equivalents, noNewRow, homeUntouched });
  }

  // ---------------------------------------------------------------- ACT-015
  // "the page shows the new date (long form)" — edit Date 1 through its own
  // edit form to a new ISO date; the card's core view renders
  // Date.parse(content).strftime("%B %-d, %Y") (views.ts formatDateCore).
  {
    const NEW = "2026-07-04";
    const seen = await visit("/Date_1?view=edit");
    const form = editForm("Date 1");
    const formPresent = (await form.count().catch(() => 0)) > 0;
    let post = null, stored = null, longForm = null;
    if (formPresent) {
      const field = form.locator("input[name='card[content]']:visible").first();
      const ta = form.locator("textarea[name='card[content]']:visible").first();
      const box = (await field.count().catch(() => 0)) > 0 ? field : ta;
      await box.fill(NEW, { timeout: T }).catch(() => {});
      const resp = await submitWatching(form, "/update/Date_1");
      post = resp ? resp.status() : null;
      await page.waitForTimeout(1200);
      const d = db();
      stored = d.prepare("SELECT db_content FROM cards WHERE name='Date 1' AND trash=0").get()?.db_content ?? null;
      d.close();
      const after = await visit("/Date_1");
      longForm = await evalPage(() => document.body.innerText.replace(/\s+/g, " ").match(/July\s+4,\s+2026/)?.[0] ?? null);
      longForm = { shown: longForm, afterStatus: after.status };
    }
    grade("ACT-015", "the page shows the new date (long form)",
      post === 200 && stored === NEW && longForm?.shown === "July 4, 2026",
      { seen, formPresent, post, stored, longForm });
  }

  // ---------------------------------------------------------------- ACT-016
  // "the original date is restored afterwards (long form)" — the same form
  // puts 2026-01-11 back and the card shows "January 11, 2026" again.
  {
    const ORIG = "2026-01-11";
    await visit("/Date_1?view=edit");
    const form = editForm("Date 1");
    let post = null, stored = null, longForm = null;
    if ((await form.count().catch(() => 0)) > 0) {
      const field = form.locator("input[name='card[content]']:visible").first();
      const ta = form.locator("textarea[name='card[content]']:visible").first();
      await ((await field.count().catch(() => 0)) > 0 ? field : ta).fill(ORIG, { timeout: T }).catch(() => {});
      const resp = await submitWatching(form, "/update/Date_1");
      post = resp ? resp.status() : null;
      await page.waitForTimeout(1200);
      const d = db();
      stored = d.prepare("SELECT db_content FROM cards WHERE name='Date 1' AND trash=0").get()?.db_content ?? null;
      d.close();
      await visit("/Date_1");
      longForm = await evalPage(() => document.body.innerText.replace(/\s+/g, " ").match(/January\s+11,\s+2026/)?.[0] ?? null);
    }
    grade("ACT-016", "the original date is restored afterwards (long form)",
      post === 200 && stored === ORIG && longForm === "January 11, 2026",
      { post, stored, longForm });
  }

  // ---------------------------------------------------------------- ACT-118
  // "row 4: saving the owner's card succeeds (no 5xx)" — the owner is the
  // fixture administrator actor and the owner's card is Ada Admin (the row 4
  // shape the sibling ACT-119 recorded: POST /update/~1743 not 500). The
  // User card's edit form carries no plain content field (its fields are the
  // account structure); saving the card is submitting that form, so the leg
  // submits it as rendered and requires a non-5xx write that leaves the row
  // intact.
  {
    const holder = "Ada_Admin";
    const d0 = db();
    const before = d0.prepare("SELECT id, db_content FROM cards WHERE name='Ada Admin' AND trash=0").get() ?? null;
    d0.close();
    const seen = await visit(`/${holder}/edit`);
    const form = editForm("Ada Admin");
    const formPresent = (await form.count().catch(() => 0)) > 0;
    let post = null, rowAfter = null;
    if (formPresent) {
      const resp = await submitWatching(form, `/update/${holder}`);
      post = resp ? resp.status() : null;
      await page.waitForTimeout(1200);
      const d = db();
      rowAfter = d.prepare("SELECT id, trash FROM cards WHERE name='Ada Admin' AND trash=0").get() ?? null;
      d.close();
    }
    grade("ACT-118", "row 4: saving the owner's card succeeds (no 5xx)",
      formPresent && post !== null && post < 500 && !!rowAfter && rowAfter.id === before?.id,
      { seen, formPresent, post, rowBeforeId: before?.id ?? null, rowAfter });
  }

  // ---------------------------------------------------------------- ACT-046
  // "the account password can be changed and the new one signs in". The
  // account OWNER drives her own +*account+*password row edit form — the
  // account_field.rb:15-17 override (`own_account? && clean`) that the write
  // gate ports (read-override.ts:319-336) — then signs in THROUGH THE FORM
  // with the new password, restores the original through the same form, and
  // proves the restore with a second form sign-in.
  {
    const holder = "Mira_Member";
    const route = `/${holder}+*account+*password/edit`;
    const before = accountChildRow("Mira Member", "*password");
    // Mira signs in (her own session — the person changing her own password)
    const asMira = await signIn("member");
    const seen = await visit(route);
    const form = editForm(`${holder}+*account+*password`);
    const formPresent = (await form.count().catch(() => 0)) > 0;
    const newPw = "Batch2 new pass 5#" + stamp();
    let post = null, storedAfter = null, signInNew = null, restore = null, signInOrig = null;
    if (formPresent) {
      const field = form.locator("input[name='card[content]']:visible").first();
      const ta = form.locator("textarea[name='card[content]']:visible").first();
      const box = (await field.count().catch(() => 0)) > 0 ? field : ta;
      if ((await box.count().catch(() => 0)) > 0) {
        await box.fill(newPw, { timeout: T }).catch(() => {});
        const resp = await submitWatching(form, `/update/${holder}+*account+*password`);
        post = resp ? resp.status() : null;
        await page.waitForTimeout(1200);
        storedAfter = accountChildRow("Mira Member", "*password");
        // the new password signs in, through the form
        signInNew = await signIn("member", { email: spec.actors.member.email, password: newPw });
        // restore the original through the same owner-driven form (the
        // change revoked the old secret, so the session that re-edits the
        // row must sign in with the NEW password)
        await signIn("member", { email: spec.actors.member.email, password: newPw });
        await visit(route);
        const rform = editForm(`${holder}+*account+*password`);
        const rfield = rform.locator("input[name='card[content]']:visible").first();
        const rta = rform.locator("textarea[name='card[content]']:visible").first();
        const rbox = (await rfield.count().catch(() => 0)) > 0 ? rfield : rta;
        if ((await rbox.count().catch(() => 0)) > 0) {
          await rbox.fill(spec.actors.member.password, { timeout: T }).catch(() => {});
          const rresp = await submitWatching(rform, `/update/${holder}+*account+*password`);
          await page.waitForTimeout(1200);
          restore = { post: rresp ? rresp.status() : null, changed: accountChildRow("Mira Member", "*password")?.db_content !== storedAfter?.db_content };
          signInOrig = await signIn("member", { email: spec.actors.member.email, password: spec.actors.member.password });
        }
      }
    }
    grade("ACT-046", "the account password can be changed and the new one signs in",
      asMira.signedInChrome === true && formPresent && post !== null && post < 400
        && !!storedAfter && storedAfter.db_content !== before?.db_content
        && signInNew?.signedInChrome === true && signInNew?.hasSessionCookie === true
        && restore?.post !== null && restore?.post < 400 && restore?.changed === true
        && signInOrig?.signedInChrome === true && signInOrig?.hasSessionCookie === true,
      { route: seen, formPresent, post, changed: !!storedAfter && storedAfter.db_content !== before?.db_content, signInNew, restore, signInOrig });
  }

  // ---------------------------------------------------------------- ACT-047
  // "the account email can be changed and the new one signs in". Same owner
  // path on Mira's +*email row (own_account read+update per email.rb's
  // own_email? — read-override.ts:201-212): change it, sign in with the NEW
  // address, restore, sign in with the original.
  {
    const holder = "Mira_Member";
    const route = `/${holder}+*account+*email/edit`;
    const before = accountChildRow("Mira Member", "*email");
    const newEmail = `batch2.${stamp()}@example.test`;
    const asMira = await signIn("member");
    const seen = await visit(route);
    const form = editForm(`${holder}+*account+*email`);
    const formPresent = (await form.count().catch(() => 0)) > 0;
    let post = null, storedAfter = null, signInNew = null, restore = null, signInOrig = null;
    if (formPresent) {
      const field = form.locator("input[name='card[content]']:visible").first();
      if ((await field.count().catch(() => 0)) > 0) {
        await field.fill(newEmail, { timeout: T }).catch(() => {});
        const resp = await submitWatching(form, `/update/${holder}+*account+*email`);
        post = resp ? resp.status() : null;
        await page.waitForTimeout(1200);
        storedAfter = accountChildRow("Mira Member", "*email");
        signInNew = await signIn("member", { email: newEmail, password: spec.actors.member.password });
        // the stored address is now the new one: the session that re-edits
        // the row must sign in with the NEW email
        await signIn("member", { email: newEmail, password: spec.actors.member.password });
        await visit(route);
        const rform = editForm(`${holder}+*account+*email`);
        const rfield = rform.locator("input[name='card[content]']:visible").first();
        if ((await rfield.count().catch(() => 0)) > 0) {
          await rfield.fill(spec.actors.member.email, { timeout: T }).catch(() => {});
          const rresp = await submitWatching(rform, `/update/${holder}+*account+*email`);
          await page.waitForTimeout(1200);
          restore = { post: rresp ? rresp.status() : null, row: accountChildRow("Mira Member", "*email") };
          signInOrig = await signIn("member", { email: spec.actors.member.email, password: spec.actors.member.password });
        }
      }
    }
    grade("ACT-047", "the account email can be changed and the new one signs in",
      asMira.signedInChrome === true && formPresent && post !== null && post < 400
        && storedAfter?.db_content === newEmail
        && signInNew?.signedInChrome === true && signInNew?.hasSessionCookie === true
        && restore?.post !== null && restore?.post < 400 && restore?.row?.db_content === spec.actors.member.email
        && signInOrig?.signedInChrome === true,
      { route: seen, formPresent, post, storedAfter, signInNew, restore, signInOrig });
  }

  // ---------------------------------------------------------------- ACT-004
  // "stays signed in across navigation" — with the ADMIN session live (the
  // account legs above end on Mira's restored session; the admin signs back
  // in here), move between pages (card page, home, another card) and require
  // the session cookie and signed-in chrome to survive every hop. The
  // witnessed family (ACT-005 Back, ACT-006 reload, ACT-007 leave-and-return)
  // is driven in the same pass and recorded, but the graded action is
  // ACT-004.
  {
    await signIn("admin");
    const hops = [];
    for (const p of ["/", "/Date_1", "/Home", "/Topic_001", "/"]) {
      const h = await visit(p);
      const chrome = await evalPage(() => ({ signout: !!document.querySelector("a.signout-link"), signin: !!document.querySelector("a[href*='*signin']") }));
      const cookies = await ctx.cookies(server.base);
      hops.push({ path: p, status: h.status, ...chrome, hasSessionCookie: cookies.some((c) => c.name === "decko_ts_session" && c.value.length > 0) });
    }
    // family context, not graded
    const reload = await page.reload({ waitUntil: "load", timeout: T }).catch(() => null);
    await page.waitForTimeout(600);
    const afterReload = { status: reload ? reload.status() : null, chrome: await evalPage(() => !!document.querySelector("a.signout-link")) };
    await page.goBack({ waitUntil: "load", timeout: T }).catch(() => {});
    await page.waitForTimeout(600);
    const afterBack = { url: page.url(), chrome: await evalPage(() => !!document.querySelector("a.signout-link")) };
    const leave = await page.goto("about:blank").then(() => true).catch(() => false);
    const back = await visit("/");
    const afterReturn = { left: leave, chrome: await evalPage(() => !!document.querySelector("a.signout-link")) };
    grade("ACT-004", "stays signed in across navigation",
      hops.length === 5 && hops.every((h) => h.status === 200 && h.signout === true && h.hasSessionCookie === true),
      { hops, family: { afterReload, afterBack, afterReturn } });
  }

  // ---------------------------------------------------------------- ACT-041
  // "GET /_signout revokes the session (session cookie gone)" — drive the
  // signout link a person clicks (its href is /_signout), then require the
  // session cookie gone from the context and the signed-out chrome.
  {
    const cookieBefore = (await ctx.cookies(server.base)).some((c) => c.name === "decko_ts_session" && c.value.length > 0);
    const link = page.locator("a.signout-link").first();
    const linkFound = (await link.count().catch(() => 0)) > 0;
    const linkHref = linkFound ? await link.getAttribute("href") : null;
    let nav = null;
    if (linkFound) {
      const r = await page.goto(server.base + (linkHref ?? "/_signout"), { waitUntil: "load", timeout: T }).catch(() => null);
      await page.waitForTimeout(900);
      nav = { followedHref: linkHref, status: r ? r.status() : null, url: page.url() };
    }
    const cookies = await ctx.cookies(server.base);
    const sessionGone = !cookies.some((c) => c.name === "decko_ts_session" && c.value.length > 0);
    const chrome = await evalPage(() => ({ signout: !!document.querySelector("a.signout-link"), signinLink: !!document.querySelector("a[href*='*signin']") }));
    grade("ACT-041", "GET /_signout revokes the session (session cookie gone)",
      cookieBefore === true && linkFound && nav?.status !== null && nav?.status < 400 && sessionGone && chrome?.signout === false,
      { cookieBefore, nav, sessionGone, cookies: cookies.map((c) => c.name), chrome });
  }

  // ---------------------------------------------------------------- ACT-043
  // "signing back in works" — the admin signs back in THROUGH THE FORM after
  // the signout and holds the session again.
  {
    const back = await signIn("admin");
    const home = await visit("/");
    const chrome = await evalPage(() => ({ signout: !!document.querySelector("a.signout-link"), myCard: document.querySelector("a.my-card")?.getAttribute("href") ?? null }));
    grade("ACT-043", "signing back in works",
      back.signedInChrome === true && back.hasSessionCookie === true && home.status === 200 && chrome?.signout === true,
      { signIn: back, home, chrome });
  }
} catch (err) {
  report.fatal = String(err?.stack ?? err);
  report.failures += 1;
  console.error(`[batch2] FATAL ${err?.stack ?? err}`);
}

await bh.close().catch(() => {});
await server.stop().catch(() => {});

writeFileSync(path.join(out, "probe-batch2-result.json"), JSON.stringify(report, null, 2));
console.log(`[batch2] ${report.failures === 0 ? "ALL LEGS GREEN" : report.failures + " LEG(S) RED"} - evidence ${path.join(out, "probe-batch2-result.json")}`);
process.exit(report.failures === 0 ? 0 : 1);

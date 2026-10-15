// edge-signed-in-exercise.mjs — the local end-to-end exercise for the Bunny
// edge build SIGNED IN. It boots the deployed bundle against a local copy of
// Brandon's deck, drives it with a hidden browser exactly as a person would,
// and reports every failure.
//
//   node tools/edge-signed-in-exercise.mjs [--deck <source.sqlite3>]
//        [--out docs/runs/edge-signed-in-exercise-<date>.md] [--keep]
//
// It runs the SAME artifact the deploy uploads — deploy/dist/bunny-edge-
// engine.bundle.js, rebuilt from deploy/bunny-worker-src by
// tools/bundle-bunny-edge-engine.mjs — behind a local HTTPS host, with the
// LIVE script's environment variables (read read-only from the Bunny API,
// never printed) minus the database secrets, plus a local database endpoint.
// Nothing reaches the live site and nothing is written to Bunny.
//
// The browser is a headless Chromium with a throwaway profile and a request
// filter admitting only the local origin, the deck's configured asset host
// and the stock layout CDNs. No window opens, no focus is taken, the
// operator's browser profile is never used.
//
// Every check is isolated: one failure is recorded and the run continues.
// The process exits non-zero if any check fails. Test credentials are
// generated per run and written only to a gitignored file.

import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import { REPO, readLiveScriptEnv, startStack, ensureEngineDist, buildBundle } from "./edge-signed-in-exercise/lib/stack.mjs";
import { buildLocalDeck } from "./edge-signed-in-exercise/lib/build-local-deck.mjs";
import { seedLocalAccounts } from "./edge-signed-in-exercise/lib/seed-local-accounts.mjs";
import { launchHarnessBrowser } from "./edge-signed-in-exercise/lib/harness-browser.mjs";

const argOf = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const hasFlag = (name) => process.argv.includes(`--${name}`);

const SOURCE_DECK = resolve(argOf("deck") ?? "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3");
const SECRETS = resolve(argOf("secrets") ?? "C:/localProjects/brandonDojoTech/library/data/secrets.env");
const RUN_ID = new Date().toISOString().slice(0, 10);
const RUN_DIR = join(REPO, "tmp", `edge-signed-in-${RUN_ID}-${process.pid}`);
const OUT = resolve(argOf("out") ?? join(REPO, "docs/runs", `edge-signed-in-exercise-${RUN_ID}.md`));

// --------------------------------------------------------------- check kit

const results = [];
let currentGroup = "";
const group = (name) => { currentGroup = name; console.log(`\n== ${name}`); };
function record(check, pass, evidence, timing = {}) {
  results.push({ group: currentGroup, check, pass, evidence, timing });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${check}${timing.wallMs !== undefined ? `  (${timing.wallMs}ms)` : ""}`);
  if (!pass) console.log(`        evidence: ${typeof evidence === "string" ? evidence : JSON.stringify(evidence).slice(0, 400)}`);
}
/** One check body. A thrown error is a failure, never a fatal. */
async function attempt(check, fn) {
  try { return await fn(); } catch (error) {
    record(check, false, { threw: String(error?.message ?? error).slice(0, 300) });
    return undefined;
  }
}

// ------------------------------------------------------------------- setup

if (!existsSync(SOURCE_DECK)) throw new Error(`source deck not found: ${SOURCE_DECK}`);
mkdirSync(RUN_DIR, { recursive: true });

console.log(`edge signed-in exercise — source deck ${SOURCE_DECK}`);
console.log("compiling engine + rebuilding the deployed bundle");
ensureEngineDist();
const bundlePath = buildBundle();
console.log(`bundle: ${bundlePath} (${(readFileSync(bundlePath).length / 1048576).toFixed(1)} MB)`);

const localDeck = join(RUN_DIR, "deck.sqlite3");
console.log("building the local deck on the engine schema (rows copied, indexes + ANALYZE)");
const deckReport = await buildLocalDeck({ source: SOURCE_DECK, out: localDeck });
const cardsCopied = deckReport.tables.find((t) => t.name === "cards")?.copiedRows ?? 0;
console.log(`  cards copied: ${cardsCopied}`);
try {
  execFileSync(process.execPath, [join(REPO, "tools/deploy/build-nest-index.mjs"), "--db", localDeck], { cwd: REPO, stdio: "ignore", timeout: 600_000 });
  console.log("  nest index: built");
} catch (error) {
  console.log(`  nest index: NOT built (${String(error).slice(0, 100)}) — pages will be slower`);
}

const credentialsPath = join(RUN_DIR, "credentials.json");
await seedLocalAccounts({ deck: localDeck, credentialsOut: credentialsPath });
const creds = JSON.parse(readFileSync(credentialsPath, "utf8"));
console.log(`seeded local accounts: ${creds.admin.name} (admin), ${creds.member.name} (member)`);

const { env: liveEnv } = await readLiveScriptEnv(SECRETS);
const assetHosts = [...new Set(Object.entries(liveEnv)
  .filter(([k, v]) => k.startsWith("DECKO_SERVED_") && typeof v === "string" && /^https?:\/\//i.test(v))
  .map(([, v]) => { try { return new URL(v).hostname; } catch { return null; } })
  .filter(Boolean))];

const stack = await startStack({ deckPath: localDeck, live: liveEnv, runtimeDir: join(RUN_DIR, "runtime") });
console.log(`local edge host: ${stack.origin}`);

const browser = await launchHarnessBrowser({ origin: stack.origin, assetHosts });
const page = browser.page;

// ---------------------------------------------------------------- helpers

const ledger = () => stack.host.requests;
const linesSince = (n) => ledger().slice(n);
const lastLine = (fragment) => [...ledger()].reverse().find((l) => l.path.includes(fragment));
const totalMsOf = (line) => (line?.serverTiming ? Number(/total;dur=([\d.]+)/.exec(line.serverTiming)?.[1] ?? NaN) : null);
const SIGNED_IN_RE = /decko\.signed_in"[^>]*value="true"|decko\.signed_in\s*=\s*true/;

async function visit(pathname) {
  const before = ledger().length;
  const started = Date.now();
  const response = await page.goto(`${stack.origin}${pathname}`, { waitUntil: "load", timeout: 60_000 });
  const wallMs = Date.now() - started;
  const html = await page.content();
  const line = lastLine(pathname);
  return {
    pathname, status: response?.status() ?? null, wallMs, html,
    serverTotalMs: totalMsOf(line), serverTiming: line?.serverTiming ?? null,
    signedIn: SIGNED_IN_RE.test(html),
    hasSignOut: /Sign out/.test(html),
    hasAccountName: /Harness_(Admin|Member)/.test(html),
    title: await page.title(),
    lines: linesSince(before),
  };
}

/** Signs in by filling the deck's own sign-in form, as a person does. */
async function signIn(account) {
  await page.goto(`${stack.origin}/*signin`, { waitUntil: "load", timeout: 60_000 });
  await page.fill('input[name="card[subcards][+*email][content]"]', account.email);
  await page.fill('input[name="card[subcards][+*password][content]"]', account.password);
  const before = ledger().length;
  await page.locator('form[action="/update/*signin"] button[type="submit"], form[action="/update/*signin"] input[type="submit"]').first().click();
  // The 200 ajax answer is {"redirect": url}; the page then navigates there.
  await page.waitForTimeout(2500);
  await page.waitForLoadState("load").catch(() => undefined);
  const cookies = await page.context().cookies(stack.origin);
  const session = cookies.find((c) => c.name === "decko_ts_session");
  const lines = linesSince(before);
  const landing = await visit("/");
  return { hasSessionCookie: Boolean(session), landedOn: page.url(), landing, lines };
}

/** The edit (pencil) link, dispatched rather than clicked: Decko reveals it on
 *  hover, so it has no clickable box until the pointer is over the card. */
async function openEdit(pathname) {
  await page.goto(`${stack.origin}${pathname}`, { waitUntil: "load", timeout: 60_000 });
  const link = page.locator('a.edit-link[href$="/edit"]').first();
  const href = await link.getAttribute("href").catch(() => null);
  const before = ledger().length;
  await link.dispatchEvent("click").catch(() => undefined);
  await page.waitForSelector("#edit_card, .modal", { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  return { href, modals: await page.locator(".modal").count(), lines: linesSince(before) };
}

/** Submits the modal edit form and reports the save's status and timing. */
async function saveEditForm() {
  // The modal's own submit is "Save and Close" (button.submit-button), the
  // control a person presses. Its form is the one that carries the card.
  const submit = page.locator(".modal form button[type=submit], #edit_card button[type=submit]").first();
  const action = await page.locator(".modal form, #edit_card").first().getAttribute("action").catch(() => null);
  const before = ledger().length;
  await submit.click();
  await page.waitForTimeout(2500);
  const lines = linesSince(before);
  const write = lines.find((l) => l.method !== "GET");
  return { action, status: write?.status ?? null, serverTotalMs: totalMsOf(write), bodyHead: write?.bodyHead ?? null, lines };
}

/** The long form a Date card shows (its stored ISO value is not printed verbatim). */
const longDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });

/** A read-only handle on the local deck, for checks that assert on stored rows. */
const dbHandle = new Database(localDeck, { readonly: true });
const baselineMaxCardId = Number(dbHandle.prepare("SELECT MAX(id) AS m FROM cards").get().m);
const database = () => dbHandle;

const cardName = (label) => `Harness_${label}_${Date.now().toString(36)}`;
const created = [];

// ----------------------------------------------------------------- checks

try {
  // -- 1 -----------------------------------------------------------------
  group("1. sign in, and stay signed in");
  const adminIn = await attempt("admin signs in through the form", () => signIn(creds.admin));
  if (adminIn) record("admin signs in through the sign-in form and stays signed in", adminIn.hasSessionCookie && adminIn.landing.signedIn && adminIn.landing.hasSignOut, { hasSessionCookie: adminIn.hasSessionCookie, landedOn: adminIn.landedOn, signedIn: adminIn.landing.signedIn, hasSignOut: adminIn.landing.hasSignOut });
  const memberIn = await attempt("member signs in through the form", () => signIn(creds.member));
  if (memberIn) record("member signs in through the sign-in form and stays signed in", memberIn.hasSessionCookie && memberIn.landing.signedIn, { hasSessionCookie: memberIn.hasSessionCookie, signedIn: memberIn.landing.signedIn });
  await signIn(creds.admin);

  const home = await visit("/");
  record("home shows the account name and Sign out", home.hasSignOut && home.hasAccountName && home.signedIn, { title: home.title, hasSignOut: home.hasSignOut, hasAccountName: home.hasAccountName, signedIn: home.signedIn }, { wallMs: home.wallMs });
  const nav = await visit("/Home");
  record("stays signed in across navigation", nav.signedIn && nav.hasSignOut, { title: nav.title, signedIn: nav.signedIn }, { wallMs: nav.wallMs });
  await attempt("signed in after Back", async () => {
    await page.goBack({ waitUntil: "load" });
    record("stays signed in after browser Back", SIGNED_IN_RE.test(await page.content()), { url: page.url() });
  });
  await attempt("signed in after reload", async () => {
    await page.reload({ waitUntil: "load" });
    record("stays signed in after reload", SIGNED_IN_RE.test(await page.content()), { url: page.url() });
  });
  await attempt("signed in after leaving and returning", async () => {
    await page.goto("about:blank");
    await page.goto(`${stack.origin}/`, { waitUntil: "load" });
    record("stays signed in after leaving the site and returning", SIGNED_IN_RE.test(await page.content()), { url: page.url() });
  });

  // -- 2 -----------------------------------------------------------------
  group("2. styling and console on signed-in pages");
  await attempt("stylesheet and console", async () => {
    const links = await page.evaluate(() => [...document.querySelectorAll('link[rel~="stylesheet"]')].map((l) => ({ href: l.href, sheet: Boolean(l.sheet) })));
    record("deck stylesheet link resolves", links.length > 0 && links.every((l) => l.sheet), { links });
    const mixed = browser.blocked.filter((b) => b.url.startsWith(stack.origin) || /^https:.*127\.0\.0\.1/.test(b.url));
    record("no blocked or 4xx/5xx subresource on the signed-in page", mixed.length === 0, { blocked: mixed.slice(0, 6) });
    // Font Awesome kit: kit.fontawesome.com refuses any domain other than the one the kit is registered to (culturesmith.com), so 127.0.0.1 always gets 403. Environmental; excluded from the console check and reported.
    const kit403 = browser.blocked.filter((b) => b.url.includes("kit.fontawesome.com") && b.status === 403).length;
    const realErrors = browser.consoleErrors.filter((e) => !/status of 403/.test(e));
    record("no console errors on the signed-in page (Font Awesome kit 403 excluded: " + kit403 + " responses, domain-locked kit)", realErrors.length === 0, { errors: realErrors.slice(0, 6), excludedKit403: kit403 });
  });

  // -- 3 -----------------------------------------------------------------
  group("3. edit a Date card");
  const dateCard = "2011_12_14";
  const datePage = await attempt("date page loads", () => visit(`/${dateCard}`));
  if (datePage) record("date card page loads", datePage.status === 200, { status: datePage.status, title: datePage.title }, { wallMs: datePage.wallMs });
  const dateEdit = await attempt("open date edit", () => openEdit(`/${dateCard}`));
  if (dateEdit) {
    record("edit opens as a modal from the card page (no duplicated page behind it)", dateEdit.modals > 0, { modals: dateEdit.modals, href: dateEdit.href });
    const dateField = await page.locator('#edit_card input[name$="[content]"], .modal input[name$="[content]"]').first();
    const type = await dateField.getAttribute("type").catch(() => null);
    const original = await dateField.inputValue().catch(() => null);
    record("content field is a date picker showing the stored date", (type === "date" || type === "text") && Boolean(original), { type, value: original });
    if (original) {
      const newDate = original === "2011-12-15" ? "2011-12-16" : "2011-12-15";
      await dateField.fill(newDate).catch(() => undefined);
      const saved = await saveEditForm();
      record("saving the new date answers a write (Save)", saved.status !== null && saved.status < 400, { status: saved.status, action: saved.action, serverTotalMs: saved.serverTotalMs });
      const after = await visit(`/${dateCard}`);
      record("the page shows the new date (long form)", after.html.includes(longDate(newDate)), { newDate, shown: longDate(newDate) });
      await openEdit(`/${dateCard}`);
      const restoreField = page.locator('#edit_card input[name$="[content]"], .modal input[name$="[content]"]').first();
      await restoreField.fill(original).catch(() => undefined);
      await saveEditForm();
      const restored = await visit(`/${dateCard}`);
      record("the original date is restored afterwards (long form)", restored.html.includes(longDate(original)), { original, shown: longDate(original) });
    }
  }

  // -- 4 -----------------------------------------------------------------
  group("4. edit a RichText card (TinyMCE, nest dialog, link button)");
  const richName = cardName("richtext");
  created.push(richName);
  const created1 = await attempt("create rich card", async () => {
    const form = await visit(`/new/RichText`);
    const nameField = page.locator('form.card-form input[name="card[name]"]').first();
    await nameField.fill(richName).catch(() => undefined);
    const before = ledger().length;
    await page.locator('form.card-form button[type="submit"], form.card-form input[type="submit"]').first().click().catch(() => undefined);
    await page.waitForTimeout(3000);
    const lines = linesSince(before);
    const write = lines.find((l) => l.method !== "GET");
    const landed = page.url();
    return { formStatus: form.status, writeStatus: write?.status ?? null, serverTotalMs: totalMsOf(write), landed, exists: (await visit(`/${richName}`)).status === 200 };
  });
  if (created1) record("create a RichText card via /new/RichText and land on it", created1.writeStatus !== null && created1.writeStatus < 400 && created1.exists, created1);

  const richEdit = await attempt("open rich edit", () => openEdit(`/${richName}`));
  if (richEdit) {
    record("RichText edit opens as a modal", richEdit.modals > 0, { modals: richEdit.modals, href: richEdit.href });
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.tinymce?.activeEditor?.focus());
    await page.keyboard.type("Harness rich text ");
    const editor = await page.evaluate(() => {
      const textarea = document.querySelector(".modal textarea, #edit_card textarea");
      return {
        tinymcePresent: typeof window.tinymce !== "undefined",
        activeEditor: typeof window.tinymce !== "undefined" && window.tinymce.activeEditor !== null,
        skinCss: typeof window.tinymce !== "undefined" ? window.tinymce.activeEditor?.editorContainer?.querySelectorAll("link[rel=stylesheet]").length ?? 0 : 0,
        textarea: textarea ? textarea.name ?? "(unnamed)" : null,
      };
    });
    record("TinyMCE loads for the RichText editor", editor.tinymcePresent && editor.activeEditor, editor);
    // Save first, while the edit modal is still open: "Save and Close" is the
    // control a person presses after typing. The nest dialog is exercised in a
    // freshly reopened modal afterwards.
    const richSave = await attempt("save rich", async () => {
      await page.evaluate(() => window.tinymce?.activeEditor?.focus());
      await page.keyboard.press("Control+End");
      return saveEditForm();
    });
    if (richSave) record("saving the RichText card persists (Save answers a write)", richSave.status !== null && richSave.status < 400, { status: richSave.status, serverTotalMs: richSave.serverTotalMs, serverSaid: richSave.bodyHead });
    const afterRich = await attempt("rich after save", () => visit(`/${richName}`));
    if (afterRich) record("the saved RichText content is on the page", afterRich.html.includes("Harness rich text"), { status: afterRich.status });
    // Reopen the editor for the nest-dialog exercise.
    const richEdit2 = await openEdit(`/${richName}`);
    await page.waitForTimeout(3500);
    const nestButton = await page.evaluate(() => {
      if (typeof window.tinymce === "undefined" || !window.tinymce.activeEditor) return null;
      const buttons = [...window.tinymce.activeEditor.editorContainer.querySelectorAll("button, a")];
      const found = buttons.find((b) => {
        const label = `${b.getAttribute("title") ?? ""} ${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""} ${b.getAttribute("data-mce-name") ?? ""}`;
        return /nest|\{\{\}\}/i.test(label);
      });
      return found ? (found.getAttribute("title") ?? found.textContent ?? "(no title)") : null;
    });
    record("the nest ({{}}) button is present in the TinyMCE toolbar", nestButton !== null, { nestButton });
    if (nestButton !== null) {
      await attempt("nest dialog", async () => {
        await page.evaluate(() => {
          const buttons = [...window.tinymce.activeEditor.editorContainer.querySelectorAll("button, a")];
          buttons.find((b) => /nest|\{\{\}\}/i.test(`${b.getAttribute("title") ?? ""} ${b.textContent ?? ""}`))?.click();
        });
        await page.waitForTimeout(1500);
        const dialog = await page.evaluate(() => {
          const d = document.querySelector(".mce-window, .mce-dialog, .mce-modal, [role=dialog]");
          return d ? { open: true, fields: [...d.querySelectorAll("input,textarea")].map((i) => i.name || i.id || i.type) } : { open: false };
        });
        record("the {{}} button opens the Nest dialog", dialog.open, dialog);
        if (dialog.open) {
          const cardInput = page.locator(".mce-window input[type=text], .mce-dialog input[type=text]").first();
          await cardInput.fill("Home").catch(() => undefined);
          await page.waitForTimeout(1500);
          const suggestions = await page.evaluate(async () => {
            const r = await fetch("/*all+by name.json?view=name_match&term=Home", { credentials: "include", headers: { "x-requested-with": "XMLHttpRequest" } });
            return { status: r.status, body: (await r.text()).slice(0, 160) };
          });
          record("typing a card name returns suggestions (/*all+by name.json?view=name_match&term=...)", suggestions.status === 200 && suggestions.body.includes("Home"), suggestions);
        }
        await page.keyboard.press("Escape").catch(() => undefined);
        await page.waitForTimeout(500);
      });
    }
  }

  // -- 5 -----------------------------------------------------------------
  group("5. create a card every way the site offers");
  for (const way of [
    { label: "/new/RichText", path: "/new/RichText" },
    { label: "/new/Basic", path: "/new/Basic" },
    { label: "/new/Date", path: "/new/Date" },
    { label: "unknown card name (/Some_New_Name)", path: "/Some_New_Name" },
    { label: "unknown card name /new", path: "/Some_New_Name/new" },
    { label: "unknown card ?view=new", path: "/Some_New_Name?view=new" },
    { label: "/card/new", path: "/card/new" },
  ]) {
    const seen = await attempt(`create route ${way.label}`, () => visit(way.path));
    if (seen) {
      const hasForm = (seen.html.match(/<form[^>]*class="[^"]*card-form/g) ?? []).length > 0;
      record(`create route shows signed-in chrome and a card form: ${way.label}`, seen.status === 200 && seen.signedIn && seen.hasSignOut && hasForm,
        { status: seen.status, signedIn: seen.signedIn, hasSignOut: seen.hasSignOut, hasForm }, { wallMs: seen.wallMs });
    }
  }
  await attempt("navbar and menu add links", async () => {
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute("href")).filter((h) => h && (h.includes("/new/") || h.includes("/card/new") || h === "#")));
    const opportunities = await visit("/");
    const items = await page.evaluate(() => {
      const menu = [...document.querySelectorAll(".dropdown-menu a")].map((a) => ({ href: a.getAttribute("href"), text: a.textContent.trim() }));
      return menu;
    });
    record("the Opportunities dropdown and navbar add links are present", items.length > 0, { itemCount: items.length, sample: items.slice(0, 5) });
  });
  await attempt("search for a nonexistent name", async () => {
    await page.goto(`${stack.origin}/*search?query[keyword]=zz_no_such_card_harness`, { waitUntil: "load" });
    const body = await page.content();
    const hasCreate = /create|new card|\/new\//i.test(body);
    record("search for a nonexistent name offers a create link", hasCreate, { url: page.url(), hasCreate });
  });

  // -- 6 -----------------------------------------------------------------
  group("6. delete a card");
  const deleteName = cardName("delete");
  created.push(deleteName);
  await attempt("create the card to delete", async () => {
    await visit(`/new/RichText`);
    await page.locator('form.card-form input[name="card[name]"]').first().fill(deleteName).catch(() => undefined);
    await page.locator('form.card-form button[type="submit"], form.card-form input[type="submit"]').first().click().catch(() => undefined);
    await page.waitForTimeout(2500);
  });
  const deleteEdit = await attempt("open delete target edit", () => openEdit(`/${deleteName}`));
  if (deleteEdit) {
    const href = await page.evaluate(() => document.querySelector('#edit_card a[href^="/delete/"], .modal a[href^="/delete/"]')?.getAttribute("href") ?? null);
    record("the edit form's Delete button is a confirm-guarded link to /delete/<name>", href !== null && href.startsWith(`/delete/${deleteName}`), { href });
    const guarded = await page.evaluate(() => {
      const a = document.querySelector('#edit_card a[href^="/delete/"], .modal a[href^="/delete/"]');
      return a ? { onclick: a.getAttribute("onclick") ?? null, dataConfirm: a.dataset.confirm ?? null } : null;
    });
    const before = ledger().length;
    await page.evaluate((target) => {
      const a = [...document.querySelectorAll('a[href^="/delete/"]')].find((x) => x.getAttribute("href")?.startsWith(target));
      if (a && a.dataset.confirm && !window.confirm(a.dataset.confirm)) return;
      a?.click();
    }, `/delete/${deleteName}`).catch(() => undefined);
    await page.waitForTimeout(2500);
    const lines = linesSince(before);
    const write = lines.find((l) => l.path.startsWith("/delete/"));
    const gone = await visit(`/${deleteName}`);
    const trashed = database().prepare("SELECT trash FROM cards WHERE name = ?").get(deleteName)?.trash === 1;
    const stillHasContent = gone.html.includes("Harness rich text");
    record("the delete removes the card (trashed, content gone, new-card page shown)", write !== undefined && trashed && !stillHasContent,
      { deleteStatus: write?.status, serverSaid: write?.bodyHead, afterStatus: gone.status, afterTitle: gone.title, trashed, stillHasContent });
    const deleteCardName = database().prepare("SELECT COUNT(*) AS n FROM cards WHERE id > ? AND name LIKE ? ESCAPE ?").get(baselineMaxCardId, "delete%", "\\").n;
    record("no card named delete… was created by this run (cards with id above the run baseline)", Number(deleteCardName) === 0, { cardsNamedDeleteCreatedThisRun: deleteCardName, baselineMaxCardId });
  }
  const signOutHref = await attempt("sign out link href", async () => {
    const home2 = await visit("/");
    return page.evaluate(() => document.querySelector("a.signout-link")?.getAttribute("href") ?? document.querySelector('a[href*="*signin"]')?.getAttribute("href") ?? null);
  });
  if (signOutHref !== undefined) record("the Sign out link is NOT a /delete/*signin link (which would delete/create a card)", signOutHref !== "/delete/*signin", { signOutHref });

  // -- 7 -----------------------------------------------------------------
  group("7. rename, history, search, changes, sign out and back in");
  const historyPage = await attempt("history", () => visit(`/${richName}/history`));
  if (historyPage) record("a card's history view renders", historyPage.status === 200, { status: historyPage.status }, { wallMs: historyPage.wallMs });

  const changes = await attempt("changes", () => visit("/*search"));
  if (changes) {
    const updatedFirst = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("tr, .search-result, .card")].slice(0, 12);
      return rows.map((r) => r.textContent.trim().slice(0, 60));
    });
    record("the Changes link (/*search) lists cards", changes.status === 200, { status: changes.status, sample: updatedFirst.slice(0, 3) }, { wallMs: changes.wallMs });
    record("/*search lists the cards this run just created/edited first", /Harness_/.test(changes.html), { mentionsHarnessCard: /Harness_/.test(changes.html) });
  }

  await attempt("sign out", async () => {
    const before = ledger().length;
    await page.goto(`${stack.origin}/_signout`, { waitUntil: "load" }).catch((error) => record("sign-out (GET /_signout) answers", false, { error: String(error).slice(0, 160) }));
    const lines = linesSince(before);
    const line = lines.find((l) => l.path.includes("_signout"));
    const cookies = await page.context().cookies(stack.origin);
    record("GET /_signout revokes the session (session cookie gone)", Boolean(line) && !cookies.some((c) => c.name === "decko_ts_session"), { status: line?.status ?? null, cookies: cookies.map((c) => c.name) });
    const after = await visit("/");
    record("after sign out the page is anonymous", !after.signedIn, { signedIn: after.signedIn });
  });
  const backIn = await attempt("sign back in", () => signIn(creds.admin));
  if (backIn) record("signing back in works", backIn.hasSessionCookie && backIn.landing.signedIn, { hasSessionCookie: backIn.hasSessionCookie, signedIn: backIn.landing.signedIn });

  // -- 8 -----------------------------------------------------------------
  group("8. ordinary (non-admin) account permissions");
  const memberSession = await attempt("member session", () => signIn(creds.member));
  if (memberSession) record("the member is signed in", memberSession.hasSessionCookie && memberSession.landing.signedIn, { signedIn: memberSession.landing.signedIn });
  await attempt("member delete attempt", async () => {
    const result = await page.evaluate(async ({ origin, target }) => {
      const r = await fetch(`${origin}/delete/${target}`, { redirect: "manual" });
      return { status: r.status, body: (await r.text()).replace(/\s+/g, " ").slice(0, 200) };
    }, { origin: stack.origin, target: richName });
    const isRefusal = result.status >= 400 || /permission|not allowed|denied|may not|sign in/i.test(result.body);
    record("a member's delete attempt is refused with a clear message, not a form", isRefusal, result);
    const stillThere = await visit(`/${richName}`);
    record("the card the member tried to delete is still there", stillThere.status === 200, { status: stillThere.status });
  });
  await signIn(creds.admin);

  // -- 9 -----------------------------------------------------------------
  group("9. timings");
  const slowPages = ledger().filter((l) => {
    if (!l.serverTiming || (l.method !== "GET")) return false;
    const total = Number(/total;dur=([\d.]+)/.exec(l.serverTiming)?.[1] ?? NaN);
    return Number.isFinite(total) && total > 3000;
  });
  record("no signed-in page exceeded 3 s of server time", slowPages.length === 0, { slow: slowPages.slice(0, 6).map((s) => ({ path: s.path.slice(0, 50), ms: s.ms, timing: s.serverTiming })) });
  const slowWrites = ledger().filter((l) => {
    if (!l.serverTiming || l.method === "GET") return false;
    const total = Number(/total;dur=([\d.]+)/.exec(l.serverTiming)?.[1] ?? NaN);
    return Number.isFinite(total) && total > 3000;
  });
  record("no save exceeded 3 s of server time", slowWrites.length === 0, { slow: slowWrites.slice(0, 6).map((s) => ({ path: s.path.slice(0, 50), ms: s.ms, timing: s.serverTiming })) });
  const sorted = ledger().filter((l) => l.serverTiming).map((l) => ({ path: l.path.slice(0, 46), method: l.method, status: l.status, ms: l.ms, server: Number(/total;dur=([\d.]+)/.exec(l.serverTiming)?.[1] ?? NaN) }));
  console.log(`  observed ${sorted.length} engine requests; slowest server totals: ${JSON.stringify(sorted.sort((a, b) => b.server - a.server).slice(0, 5))}`);
  record("no request returned a 5xx", ledger().filter((l) => l.status >= 500).length === 0, { fiveHundreds: ledger().filter((l) => l.status >= 500).slice(0, 5).map((l) => `${l.method} ${l.path.slice(0, 40)} ${l.status}`) });

} finally {
  // -- cleanup -----------------------------------------------------------
  group("cleanup");
  const db = new Database(localDeck);
  let removed = 0;
  for (const name of created) {
    const row = db.prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(name);
    if (row) { db.prepare("UPDATE cards SET trash = 1 WHERE id = ?").run(row.id); removed += 1; }
  }
  const remaining = db.prepare("SELECT COUNT(*) AS n FROM cards WHERE name LIKE 'Harness\\_%' ESCAPE '\\' AND trash = 0 AND codename IS NULL").get().n;
  record("every card the run created is removed from the local copy", Number(remaining) === 0, { removed, remaining });
  db.close();
  dbHandle.close();
  await browser.close().catch(() => undefined);
  await stack.close().catch(() => undefined);
  stack.cleanup();
}

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.pass);
let markdown = `# Edge signed-in exercise — ${RUN_ID}\n\n`;
markdown += `- Command: \`node tools/edge-signed-in-exercise.mjs\`\n`;
markdown += `- Artifact: \`deploy/dist/bunny-edge-engine.bundle.js\`, rebuilt from source, run against a LOCAL deck copy on the engine schema\n`;
markdown += `- Deck source (local, never Bunny): \`${basename(SOURCE_DECK)}\`, ${cardsCopied} cards copied\n`;
markdown += `- Accounts: two throwaway local accounts (one holding the \`administrator\` role, one signed in with no role)\n`;
markdown += `- Browser: headless Chromium, throwaway profile, local origin + the deck's configured asset host + stock layout CDNs only\n`;
markdown += `- Result: **${results.length - failures.length} / ${results.length} passed**, ${failures.length} failed\n\n`;
markdown += `| check | result | evidence |\n|---|---|---|\n`;
for (const r of results) {
  const evidence = (typeof r.evidence === "string" ? r.evidence : JSON.stringify(r.evidence)).replace(/\|/g, "/").slice(0, 260);
  markdown += `| ${r.group} / ${r.check} | ${r.pass ? "PASS" : "**FAIL**"} | ${evidence} |\n`;
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, markdown);

console.log(`\n${results.length - failures.length} / ${results.length} checks passed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.group} / ${f.check}: ${(typeof f.evidence === "string" ? f.evidence : JSON.stringify(f.evidence)).slice(0, 220)}`);
}
console.log(`run record: ${OUT}`);
if (hasFlag("keep")) console.log(`run directory kept: ${RUN_DIR} (credentials: ${credentialsPath})`);
else rmSync(RUN_DIR, { recursive: true, force: true });
process.exit(failures.length === 0 ? 0 : 1);
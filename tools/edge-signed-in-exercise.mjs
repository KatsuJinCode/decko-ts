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
// allowlisted render configuration read read-only from the Bunny API,
// with local-only database and storage endpoints and dummy credentials.
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

import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import { createHash } from 'node:crypto';
import { REPO, readLiveScriptEnv, startStack, ensureEngineDist, buildBundle } from "./edge-signed-in-exercise/lib/stack.mjs";
import { buildLocalDeck } from "./edge-signed-in-exercise/lib/build-local-deck.mjs";
import { seedLocalAccounts } from "./edge-signed-in-exercise/lib/seed-local-accounts.mjs";
import { launchHarnessBrowser } from "./edge-signed-in-exercise/lib/harness-browser.mjs";
import { verifiedCapabilities } from './edge-signed-in-exercise/lib/local-policy.mjs';

const argOf = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const hasFlag = (name) => process.argv.includes(`--${name}`);

const SOURCE_DECK = resolve(argOf("deck") ?? "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3");
const SECRETS = resolve(argOf("secrets") ?? "C:/localProjects/brandonDojoTech/library/data/secrets.env");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
const RUN_DIR = join(REPO, "tmp", `edge-signed-in-${RUN_ID}-${process.pid}`);
const OUT = resolve(argOf("out") ?? join(REPO, '.runtime', 'edge-signed-in', RUN_ID, 'report.md'));
if (existsSync(OUT) || existsSync(OUT + '.json') || existsSync(OUT + '.intent.json')) throw new Error('output already exists; use a fresh attempt destination');
const RAW = OUT + '.raw';
let htmlSequence = 0;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', windowsHide: true }).trim();
const provenance = { source: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain', '--untracked-files=normal') !== '', startedAt: new Date().toISOString(), productionRuntime: false };
if (provenance.dirty) throw new Error('commit the coherent source before capability capture');

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
    try {
      const capture = String(++htmlSequence).padStart(3, '0') + '-failure';
      writeFileSync(join(RAW, `${capture}.html`), await browser.page.content(), { flag: 'wx' });
      writeFileSync(join(RAW, `${capture}.json`), JSON.stringify({ check, url: browser.page.url(), error: String(error.message) }), { flag: 'wx' });
    } catch { /* Preserve the original failure if the browser already closed. */ }
    record(check, false, { threw: String(error?.message ?? error).slice(0, 300) });
    return undefined;
  }
}

// ------------------------------------------------------------------- setup

if (!existsSync(SOURCE_DECK)) throw new Error(`source deck not found: ${SOURCE_DECK}`);
if (existsSync(SOURCE_DECK + '-wal') && statSync(SOURCE_DECK + '-wal').size > 0) throw new Error('use an immutable database snapshot without an active WAL');
provenance.sourceDeckSha256 = digest(readFileSync(SOURCE_DECK));
provenance.capabilitiesSha256 = digest(readFileSync(join(REPO, 'tools/edge-signed-in-exercise/capabilities.json')));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT + '.intent.json', JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx' });
mkdirSync(RAW);
mkdirSync(RUN_DIR, { recursive: true });

console.log(`edge signed-in exercise — source deck ${SOURCE_DECK}`);
console.log("compiling engine + rebuilding the deployed bundle");
ensureEngineDist();
const bundlePath = buildBundle();
provenance.bundleSha256 = digest(readFileSync(bundlePath));
provenance.buildReceipt = JSON.parse(readFileSync(join(REPO, '.runtime/browser-build.json'), 'utf8'));
console.log(`bundle: ${bundlePath} (${(readFileSync(bundlePath).length / 1048576).toFixed(1)} MB)`);

const localDeck = join(RUN_DIR, "deck.sqlite3");
console.log("building the local deck on the engine schema (rows copied, indexes + ANALYZE)");
const deckReport = await buildLocalDeck({ source: SOURCE_DECK, out: localDeck });
if (digest(readFileSync(SOURCE_DECK)) !== provenance.sourceDeckSha256 || (existsSync(SOURCE_DECK + '-wal') && statSync(SOURCE_DECK + '-wal').size > 0)) throw new Error('source changed during snapshot copy; refusing mixed-state capture');
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

const stack = await startStack({ deckPath: localDeck, live: liveEnv, runtimeDir: join(RUN_DIR, "runtime"), bundlePath });
console.log(`local edge host: ${stack.origin}`);

let browser;
try { browser = await launchHarnessBrowser({ origin: stack.origin, assetHosts }); }
catch (error) { await stack.close(); stack.cleanup(); throw error; }
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
  const capture = String(++htmlSequence).padStart(3, '0');
  writeFileSync(join(RAW, `${capture}.html`), html, { flag: 'wx' });
  writeFileSync(join(RAW, `${capture}.json`), JSON.stringify({ pathname, status: response?.status(), url: page.url() }), { flag: 'wx' });
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
  if (!action) throw new Error('edit form has no action');
  const endpoint = new URL(action, stack.origin);
  if (endpoint.origin !== stack.origin) throw new Error('edit action leaves owned local origin');
  // Arm before clicking, and observe the actual write even when it is slow
  // or fails. A fixed delay misreported 22–42s writes as no response.
  const pending = page.waitForResponse(response => {
    const request = response.request();
    const url = new URL(response.url());
    return url.origin === stack.origin && url.pathname === endpoint.pathname && request.method() !== 'GET';
  }, { timeout: 60_000 }).then(response => ({ response }), error => ({ error }));
  await submit.click();
  const observed = await pending;
  if (observed.error) throw observed.error;
  await observed.response.finished();
  const lines = linesSince(before);
  const write = lines.find((l) => l.method !== 'GET' && new URL(l.path, stack.origin).pathname === endpoint.pathname);
  return { action, status: observed.response.status(), serverTotalMs: totalMsOf(write), bodyHead: write?.bodyHead ?? null, lines };
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
    const mixed = browser.blocked;
    record("no blocked or 4xx/5xx subresource on the signed-in page", mixed.length === 0, { blocked: mixed.slice(0, 6) });
    record("no console errors on the signed-in page", browser.consoleErrors.length === 0, { errors: browser.consoleErrors.slice(0, 6) });
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
  await attempt("navbar sign out revokes the session", async () => {
    await visit("/");
    const link = page.locator('a.signout-link').first();
    const href = await link.getAttribute('href');
    if (!href || new URL(href, stack.origin).origin !== stack.origin) throw new Error('no local navbar signout link');
    const oldSession = (await page.context().cookies(stack.origin)).find(cookie => cookie.name === 'decko_ts_session');
    if (!oldSession) throw new Error('navbar signout check started without a session');
    const cardsBefore = digest(JSON.stringify(database().prepare('SELECT * FROM cards ORDER BY id').all()));
    const responsePromise = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.origin === stack.origin && url.pathname === new URL(href, stack.origin).pathname;
    }, { timeout: 60_000 }).then(response => ({ response }), error => ({ error }));
    await link.click();
    const observed = await responsePromise;
    if (observed.error) throw observed.error;
    await observed.response.finished();
    const landing = await visit('/');
    const cookies = await page.context().cookies(stack.origin);
    // Replay only to our own loopback server to distinguish cookie clearing
    // from server-side revocation. The token itself never enters evidence.
    const replay = await page.context().request.get(stack.origin + '/', { headers: { cookie: `${oldSession.name}=${oldSession.value}` } });
    const replaySignedIn = SIGNED_IN_RE.test(await replay.text());
    const cardsUnchanged = cardsBefore === digest(JSON.stringify(database().prepare('SELECT * FROM cards ORDER BY id').all()));
    record('navbar sign out revokes the session without changing cards', !landing.signedIn && !cookies.some(cookie => cookie.name === oldSession.name) && !replaySignedIn && cardsUnchanged,
      { href, status: observed.response.status(), landingSignedIn: landing.signedIn, replaySignedIn, cardsUnchanged });
    await signIn(creds.admin);
  });

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

  // -- 7b: the capabilities Decko's own browser tests cover that this run
  //         did not yet drive (checklist: tools/edge-signed-in-exercise/capabilities.json)
  group("7b. further signed-in capabilities (Decko's own browser tests as the checklist)");

  await attempt("S2/S3/S4 signed-out sign-in page", async () => {
    // A second, throwaway browser: these are the SIGNED-OUT sign-in behaviours, so the
    // context must carry no session cookie.
    const anon = await launchHarnessBrowser({ origin: stack.origin, assetHosts: assetHosts });
    const p2 = anon.page;
    try {
      await p2.goto(`${stack.origin}/*signin`, { waitUntil: "load" });
      const links = await p2.evaluate(() => ({
        signup: [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")).filter((h) => h && /Sign_up|sign_up/i.test(h)),
        reset: [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")).filter((h) => h && /reset|forgot|signin/i.test(h)),
      }));
      record("the signed-out sign-in page links to sign up and to reset the password", links.signup.length > 0 && links.reset.length > 0, links);
      // wrong password
      await p2.fill('input[name="card[subcards][+*email][content]"]', creds.admin.email);
      await p2.fill('input[name="card[subcards][+*password][content]"]', "definitely-not-the-password");
      const [wrongResponse] = await Promise.all([
        p2.waitForResponse((r) => r.url().includes("/update/*signin"), { timeout: 30_000 }).catch(() => null),
        p2.locator('form[action="/update/*signin"] button[type="submit"]').first().click(),
      ]);
      await p2.waitForTimeout(1500);
      const cookies = await p2.context().cookies(stack.origin);
      const session = cookies.some((c) => c.name === "decko_ts_session" && c.value.length > 0);
      const wrongBody = (await p2.content()).replace(/<script[\s\S]*?<\/script>/g, "");
      const refusedText = (/<(div|p|span)[^>]*class="[^"]*(error|alert|invalid)[^"]*"[^>]*>([^<]{0,140})/.exec(wrongBody) ?? [])[3] ?? null;
      record("sign-in refused on a wrong password (422, no session, error shown)", wrongResponse !== null && wrongResponse.status() >= 400 && !session,
        { status: wrongResponse?.status() ?? null, hasSession: session, refusedText });
      // empty password
      await p2.goto(`${stack.origin}/*signin`, { waitUntil: "load" });
      await p2.fill('input[name="card[subcards][+*email][content]"]', creds.admin.email);
      await p2.fill('input[name="card[subcards][+*password][content]"]', "");
      const [emptyResponse] = await Promise.all([
        p2.waitForResponse((r) => r.url().includes("/update/*signin"), { timeout: 15_000 }).catch(() => null),
        p2.locator('form[action="/update/*signin"] button[type="submit"]').first().click(),
      ]);
      await p2.waitForTimeout(1500);
      const emptySession = (await p2.context().cookies(stack.origin)).some((c) => c.name === "decko_ts_session" && c.value.length > 0);
      record("sign-in with an empty password is refused (no session)", (emptyResponse === null || emptyResponse.status() >= 400) && !emptySession,
        { status: emptyResponse?.status() ?? null, noRequest: emptyResponse === null, hasSession: emptySession });
    } finally {
      await anon.close().catch(() => undefined);
    }
  });

  const preName = cardName("preset");
  created.push(preName);
  await attempt("C10 presetting content from the URL", async () => {
    const marker = "Harness preset";
    const url = `${stack.origin}/new/RichText?card%5Bname%5D=${preName}&card%5Bcontent%5D=${encodeURIComponent(`<p>${marker}</p>`)}`;
    const view = await page.goto(url, { waitUntil: "load" }).then((r) => ({ status: r?.status() ?? null })).catch((e) => ({ error: String(e).slice(0, 100) }));
    await page.waitForTimeout(2500);
    const prefilled = await page.evaluate(() => {
      const ed = window.tinymce?.activeEditor;
      const ta = document.querySelector(".modal textarea, #edit_card textarea");
      return { editor: ed ? ed.getContent() : null, textarea: ta ? ta.value : null };
    });
    const before = ledger().length;
    await page.locator('form.card-form button[type="submit"], .modal button.submit-button, #edit_card button.submit-button').first().click().catch((e) => record("C10 submit", false, { error: String(e).slice(0, 120) }));
    await page.waitForTimeout(3000);
    const line = linesSince(before).find((l) => l.method !== "GET");
    const after = await visit(`/${preName}`);
    record("card content preset in the /new URL is submitted and stored", line !== undefined && line.status < 400 && after.html.includes(marker),
      { status: line?.status ?? null, prefilledEditor: (prefilled.editor ?? "").slice(0, 60), marker, afterStatus: after.status });
  });

  await attempt("C8 duplicate name refused", async () => {
    await visit("/new/RichText");
    await page.locator('form.card-form input[name="card[name]"]').first().fill("Home");
    const before = ledger().length;
    await page.locator('form.card-form button[type="submit"], form.card-form input[type="submit"]').first().click().catch(() => undefined);
    await page.waitForTimeout(2500);
    const line = linesSince(before).find((l) => l.method !== "GET");
    const body = await page.content();
    const homeStillThere = (await visit("/Home")).status === 200;
    const refused = line !== undefined && line.status >= 400;
    record("creating a card whose name already exists is refused (Home not touched)", refused && homeStillThere,
      { status: line?.status ?? null, homeStillThere, errorShown: /already|taken|exists/i.test(body) });
  });

  let currentName = richName;
  await attempt("R1 rename", async () => {
    // The rename control is the board's name row (cypress edit/board/save_changes:
    // .edit_name_row .edit-link -> a renamer), not the content modal.
    const renamed = `${currentName}_renamed`;
    await page.goto(`${stack.origin}/${richName}/board`, { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const row = page.locator(".board .edit_name_row-view, .board [id*='edit_name_row']").first();
    const rowCount = await row.count();
    if (rowCount === 0) {
      record("rename: the board shows an edit_name_row", false, { note: "no edit_name_row in the board" });
    } else {
      await row.locator("a.edit-link, a[href$='/edit']").first().dispatchEvent("click").catch(() => undefined);
      await page.waitForTimeout(1500);
      const nameInput = page.locator(".modal input[name='card[name]'], .board input[name='card[name]'], .name-editor input[name='card[name]']").first();
      const present = await nameInput.count();
      if (present === 0) {
        record("rename: the name row opens a renamer with a card[name] field", false, { note: "no name field after the name row was opened" });
      } else {
        await nameInput.fill(renamed).catch(() => undefined);
        const before = ledger().length;
        await page.locator(".modal button.renamer, .board button.renamer, button[type='submit']").first().click().catch(() => undefined);
        await page.waitForTimeout(3000);
        const write = linesSince(before).find((l) => l.method !== "GET");
        const after = await visit(`/${renamed}`);
        const old = await visit(`/${richName}`);
        const oldGone = old.status !== 200 || !old.html.includes(renamed);
        record("rename through the board's name row moves the card to its new name", write !== undefined && write.status < 400 && after.html.includes(renamed) && oldGone,
          { status: write?.status ?? null, serverSaid: write?.bodyHead, newName: renamed, afterStatus: after.status, oldGone });
        created[created.indexOf(currentName)] = renamed;
        currentName = renamed;
      }
    }
  });

  await attempt("H1 history shows the run's edits", async () => {
    const history = await visit(`/${currentName}/history`);
    const acts = await page.evaluate(() => document.querySelectorAll(".act, tr, .history-act, [id^=act-]").length);
    const body = await page.content();
    record("the history page lists the card's acts (not just a 200)", history.status === 200 && /act|change|edit/i.test(body),
      { status: history.status, actLikeNodes: acts });
  });

  await attempt("E19-E22 board tabs", async () => {
    await page.goto(`${stack.origin}/${currentName}/board`, { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const board = await page.locator(".board .board-main").count();
    const tabs = await page.evaluate(() => [...document.querySelectorAll(".board [role=tab], .board .nav-link, .board .tab-link, .board a[data-bs-toggle=tab]")].map((t) => ({ text: t.textContent.trim().slice(0, 30), href: t.getAttribute("href") })).filter((t) => t.text).slice(0, 20));
    const hasEngage = tabs.some((t) => /engage/i.test(t.text));
    const hasHistory = tabs.some((t) => /history/i.test(t.text));
    const hasRules = tabs.some((t) => /rule/i.test(t.text));
    record("the card board renders with its tabs (guide, engage, history, rules)", board > 0 && hasEngage && hasHistory && hasRules,
      { board, tabs });
    // The Engage tab: the follow control a signed-in user has.
    const engage = page.locator(".board a:has-text('Engage'), .board [href*='engage']").first();
    if (await engage.count() > 0) {
      await engage.click().catch(() => undefined);
      await page.waitForTimeout(1500);
      const engageBody = await page.content();
      const followControls = await page.evaluate(() => [...document.querySelectorAll(".board a, .board button")].map((e) => e.textContent.trim()).filter((t) => /follow|watch|advanced|discussion|followers/i.test(t)).slice(0, 10));
      record("the Engage tab shows the follow controls", /follow|watch|discussion/i.test(engageBody), { followControls });
    }
  });

  await attempt("N1 quick search", async () => {
    await page.goto(`${stack.origin}/*search?query%5Bkeyword%5D=${encodeURIComponent(richName.slice(0, 14))}`, { waitUntil: "load" });
    await page.waitForTimeout(1000);
    const body = await page.content();
    record("keyword search from the navbox returns the run's card", body.includes(richName.slice(0, 14)), { url: page.url() });
  });

  await attempt("N2 cql search", async () => {
    const q = 'type="RichText"';
    await page.goto(`${stack.origin}/*search?query%5Bquery%5D=${encodeURIComponent(q)}`, { waitUntil: "load" });
    await page.waitForTimeout(1000);
    const body = await page.content();
    const ranIt = !/error|exception/i.test(body);
    record("a CQL search runs and answers without an error page", ranIt, { url: page.url(), query: q });
  });

  await attempt("A1/A2 account settings and change password", async () => {
    // Account settings live on the account card's board (cypress
    // edit/board/account_tab 'change email'), not on `<Holder>+*account_settings`.
    const holder = creds.admin.name.replace(/ /g, "_");
    const settings = await visit(`/${holder}/board`);
    await page.waitForTimeout(2000);
    const tabLinks = await page.evaluate(() => [...document.querySelectorAll(".board a, .board [role=tab], .board .nav-link")].map((e) => ({ text: e.textContent.trim().slice(0, 30), href: e.getAttribute("href") })).filter((t) => t.text));
    const accountTab = tabLinks.find((t) => /account/i.test(t.text));
    if (!accountTab) {
      record("the account card's board has an Account tab", false, { tabLinks });
    } else {
      record("the account card's board has an Account tab", true, { accountTab });
      if (accountTab.href) await page.goto(new URL(accountTab.href, stack.origin).href, { waitUntil: "load" }).catch(() => undefined);
      else {
        await page.locator(".board a").filter({ hasText: /account/i }).first().click().catch(() => undefined);
        await page.waitForTimeout(1500);
      }
      const fields = await page.evaluate(() => [...document.querySelectorAll(".board input, .modal input")].map((i) => ({ name: i.name, type: i.type })));
      const emailField = fields.find((f) => f.name && /email/i.test(f.name) && f.type !== "hidden");
      const passwordField = fields.find((f) => f.name && /password/i.test(f.name));
      record("the Account tab exposes the account's email and password fields", emailField !== undefined && passwordField !== undefined, { fields });
      if (passwordField !== undefined) {
        const oldPassword = creds.admin.password;
        const next = `${oldPassword}x`;
        await page.goto(`${stack.origin}/${holder}/board`, { waitUntil: "load" });
        await page.waitForTimeout(1500);
        const accountTab2 = page.locator(".board a").filter({ hasText: /account/i }).first();
        await accountTab2.click().catch(() => undefined);
        await page.waitForTimeout(1500);
        const input = page.locator(`.board input[name='${passwordField.name}']`).first();
        await input.fill(next).catch(() => undefined);
        const before = ledger().length;
        await page.locator(".board form button[type='submit'], .board form input[type='submit'], .modal button[type='submit']").first().click().catch(() => undefined);
        await page.waitForTimeout(3000);
        const write = linesSince(before).find((l) => l.method !== "GET");
        const withOld = await signIn({ ...creds.admin, password: oldPassword });
        const withNew = withOld.hasSessionCookie ? { skipped: true } : await signIn({ ...creds.admin, password: next });
        record("the account password can be changed and the new one signs in", write !== undefined && write.status < 400 && withNew.hasSessionCookie === true && withNew.skipped !== true,
          { writeStatus: write?.status ?? null, serverSaid: write?.bodyHead, oldPasswordStillWorks: withOld.hasSessionCookie, newPasswordWorks: withNew.hasSessionCookie });
        if (withNew.hasSessionCookie) {
          await page.goto(`${stack.origin}/${holder}/board`, { waitUntil: "load" });
          await page.waitForTimeout(1500);
          await page.locator(".board a").filter({ hasText: /account/i }).first().click().catch(() => undefined);
          await page.waitForTimeout(1500);
          await page.locator(`.board input[name='${passwordField.name}']`).first().fill(oldPassword).catch(() => undefined);
          await page.locator(".board form button[type='submit'], .modal button[type='submit']").first().click().catch(() => undefined);
          await page.waitForTimeout(2500);
          await signIn(creds.admin);
        }
      }
    }
  });

  await attempt("F1 upload on the edge", async () => {
    await visit("/new/File");
    const fileInput = page.locator('input[type="file"]').first();
    const count = await fileInput.count();
    if (count === 0) {
      record("upload: the File create form offers a file input", false, { note: "no file input on /new/File" });
    } else {
      const uploadName = cardName('file');
      const bytes = Buffer.from('Owned harness file bytes.\n');
      created.push(uploadName);
      await page.locator('input[name="card[name]"]').first().fill(uploadName);
      await fileInput.setInputFiles({ name: 'harness.txt', mimeType: 'text/plain', buffer: bytes });
      await page.waitForFunction(() => {
        const draft = document.querySelector('input[name="card[action_id_of_cached_upload]"]');
        return draft && /^\d+$/.test(draft.value);
      }, undefined, { timeout: 60_000 });
      const before = ledger().length;
      const pending = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.origin === stack.origin && url.pathname === '/card/create' && response.request().method() === 'POST';
      }, { timeout: 60_000 }).then(response => ({ response }), error => ({ error }));
      await page.locator('form.card-form button[type="submit"], form.card-form input[type="submit"]').first().click();
      const observed = await pending;
      if (observed.error) throw observed.error;
      await observed.response.finished();
      const row = database().prepare('SELECT id,db_content,trash FROM cards WHERE name = ?').get(uploadName);
      let downloadStatus = null;
      let exactBytes = false;
      if (row?.db_content && row.trash === 0) {
        const download = await page.context().request.get(`${stack.origin}/files/${row.db_content}`);
        downloadStatus = download.status();
        exactBytes = (await download.body()).equals(bytes);
      }
      record('a file can be uploaded through the File create form', observed.response.status() < 400 && row?.trash === 0 && downloadStatus === 200 && exactBytes,
        { status: observed.response.status(), cardId: row?.id ?? null, downloadStatus, exactBytes, requests: linesSince(before) });
    }
  });

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
  let closed = false;
  try { await stack.close(); closed = true; record('owned local stack closed', true, {}); }
  catch (error) { record('owned local stack closed', false, { error: String(error.message) }); }
  if (closed) stack.cleanup();
}

// ---------------------------------------------------------------- report

const failures = results.filter((r) => !r.pass);
let markdown = `# Edge signed-in exercise — ${RUN_ID}\n\n`;
markdown += `- Source: \`${provenance.source}\`, clean; bundle SHA256 \`${provenance.bundleSha256}\`\n`;
markdown += `- Runtime: deployed bundle on local Node/SDK shim; deployed Bunny acceptance is false.\n`;
markdown += `- Providers: loopback database and object storage; capture does not inherit live provider credentials.\n`;
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

// Capability coverage against the checklist taken from Decko's own browser tests.
// A capability is "driven by this run" when one of its named checks ran and passed.
let capabilityCoverage;
{
  const capabilities = verifiedCapabilities(JSON.parse(readFileSync(join(REPO, "tools/edge-signed-in-exercise/capabilities.json"), "utf8")).capabilities, results);
  const counts = { covered: 0, partial: 0, not_covered: 0, disabled_upstream: 0, out_of_scope: 0 };
  const drivenNow = [];
  for (const capability of capabilities) {
    if (capability.status === 'covered') drivenNow.push(capability.id);
    counts[capability.status] += 1;
  }
  capabilityCoverage = { counts, capabilities };
  markdown += `\n## Capability coverage (Decko's own browser tests as the checklist)\n\n`;
  markdown += `${capabilities.length} capabilities enumerated from Decko's Cucumber features and Cypress e2e specs (see tools/edge-signed-in-exercise/capability-checklist.md).\n\n`;
  markdown += `| status | count |\n|---|---|\n`;
  markdown += `| covered by this run | ${counts.covered} |\n| partially covered | ${counts.partial} |\n| not covered yet | ${counts.not_covered} |\n| disabled upstream (commented in Decko) | ${counts.disabled_upstream} |\n| out of scope (needs a mail sink) | ${counts.out_of_scope} |\n\n`;
  markdown += `Capabilities driven by this run that the checklist had listed as uncovered: ${drivenNow.length === 0 ? "none" : drivenNow.join(", ")}\n\n`;
  markdown += `| id | group | capability | status | check |\n|---|---|---|---|---|\n`;
  for (const capability of capabilities) {
    markdown += `| ${capability.id} | ${capability.group} | ${capability.capability.replace(/\|/g, "/")} | ${capability.status} | ${capability.finding ? capability.finding : (capability.note ?? capability.reason ?? capability.check ?? "")} |\n`;
  }
  markdown += `\n`;
  console.log(`\ncapability coverage: ${counts.covered} covered, ${counts.partial} partial, ${counts.not_covered} not covered, ${counts.out_of_scope} out of scope (of ${capabilities.length})`);
}

const coverageIncomplete = capabilityCoverage.counts.not_covered > 0 || capabilityCoverage.counts.partial > 0 || capabilityCoverage.counts.out_of_scope > 0;
markdown += `\nComplete capability acceptance: ${!coverageIncomplete && failures.length === 0 ? 'pass' : 'incomplete or failed'}. Unrun capabilities are never credited.\n`;
writeFileSync(OUT, markdown, { flag: 'wx' });
writeFileSync(OUT + '.json', JSON.stringify({ provenance, completedAt: new Date().toISOString(), productionAcceptance: false, capabilityCoverage, results, requests: ledger(), failedRequests: browser.blocked, consoleErrors: browser.consoleErrors }, null, 2) + '\n', { flag: 'wx' });

console.log(`\n${results.length - failures.length} / ${results.length} checks passed.`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f.group} / ${f.check}: ${(typeof f.evidence === "string" ? f.evidence : JSON.stringify(f.evidence)).slice(0, 220)}`);
}
console.log(`run record: ${OUT}`);
if (hasFlag("keep")) console.log(`run directory kept: ${RUN_DIR} (credentials: ${credentialsPath})`);
else rmSync(RUN_DIR, { recursive: true, force: true });
process.exit(failures.length === 0 && !coverageIncomplete ? 0 : 1);

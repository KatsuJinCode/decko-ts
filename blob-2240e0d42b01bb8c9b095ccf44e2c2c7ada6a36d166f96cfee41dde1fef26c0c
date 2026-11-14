// probe-editor-toolbar.mjs — what the RichText editor's toolbar actually
// carries, and which asset requests it made.
//
// WHY THIS SCRIPT EXISTS. The caps-legs M1 leg grades the RichText editor's
// toolbar (formats, lists, table, insert menu). The leg records that the
// deck's own *TinyMCE setting names the table plugin and the table menubar
// entry, and that the opened editor offered NO control matching /table/i.
// That is two facts and no mechanism: the leg never says whether the table
// plugin's script was requested, whether it loaded, or what the editor's
// resolved configuration was.
//
// This probe boots the same local stack the signed-in exercise boots, signs
// the seeded administrator in, opens the editor on a fixture card, and
// records the editor's own configuration, the controls it rendered, and the
// asset URLs the browser requested. It never deploys and never writes
// outside the throwaway deck copy.
//
//   node tools/probe-editor-toolbar.mjs [--out <report.json>]

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { REPO, readLiveScriptEnv, startStack, buildBundle, ensureEngineDist } from "./edge-signed-in-exercise/lib/stack.mjs";
import { buildLocalDeck } from "./edge-signed-in-exercise/lib/build-local-deck.mjs";
import { seedLocalAccounts } from "./edge-signed-in-exercise/lib/seed-local-accounts.mjs";
import { launchHarnessBrowser } from "./edge-signed-in-exercise/lib/harness-browser.mjs";
import { focusRichEditor } from "./edge-signed-in-exercise/lib/rich-editor.mjs";

const argOf = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const SOURCE_DECK = resolve(argOf("deck") ?? "C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3");
const SECRETS = resolve(argOf("secrets") ?? "C:/localProjects/brandonDojoTech/library/data/secrets.env");
const STAMP = Date.now().toString(36);
const RUN_DIR = join(REPO, "tmp", `probe-editor-toolbar-${STAMP}-${process.pid}`);
const OUT = resolve(argOf("out") ?? join(REPO, "tmp", `probe-editor-toolbar-${STAMP}.json`));

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
mkdirSync(RUN_DIR, { recursive: true });
const report = { stamp: STAMP };
let stack = null;
const exit = async (code) => {
  try { await stack?.close(); } catch { /* the probe reports what it measured */ }
  try { rmSync(RUN_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* leave it */ }
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nprobe report: ${OUT}`);
  process.exit(code);
};

try {
  ensureEngineDist();
  const bundlePath = buildBundle();
  const localDeck = join(RUN_DIR, "deck.sqlite3");
  await buildLocalDeck({ source: SOURCE_DECK, out: localDeck });
  const credentialsPath = join(RUN_DIR, "credentials.json");
  await seedLocalAccounts({ deck: localDeck, credentialsOut: credentialsPath });
  const creds = JSON.parse(readFileSync(credentialsPath, "utf8"));
  const { env: liveEnv } = await readLiveScriptEnv(SECRETS);
  stack = await startStack({ deckPath: localDeck, live: liveEnv, runtimeDir: join(RUN_DIR, "runtime"), bundlePath });
  const origin = stack.origin;
  console.log(`local edge host: ${origin}`);

  const signin = await fetch(origin + "/update/*signin", {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      "card[subcards][+*email][content]": creds.admin.email,
      "card[subcards][+*password][content]": creds.admin.password,
    }).toString(),
    redirect: "manual",
  });
  const cookie = (signin.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  console.log(`sign-in: ${signin.status}`);

  const cardName = `HarnessToolbarProbe${STAMP}`;
  const deck = new Database(localDeck, { readonly: true });
  const create = await fetch(origin + "/card/create", {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams({
      "card[name]": cardName,
      "card[type]": "RichText",
      "card[content]": "probe body",
      "success[redirect]": "true",
    }).toString(),
    redirect: "manual",
  });
  console.log(`fixture create: ${create.status}`);
  const fixtureRow = deck.prepare("SELECT id,name FROM cards WHERE name=? AND trash=0").get(cardName);
  deck.close();

  const browser = await launchHarnessBrowser({ origin, assetHosts: [] });
  try {
    const page = browser.page;
    // The browser must carry the session: an anonymous visitor is offered no
    // edit form, so the editor would never open.
    await page.goto(`${origin}/*signin`, { waitUntil: "load" });
    await page.fill('input[name="card[subcards][+*email][content]"]', creds.admin.email);
    await page.fill('input[name="card[subcards][+*password][content]"]', creds.admin.password);
    await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
    await page.goto(`${origin}/${encodeURIComponent(cardName)}`, { waitUntil: "load" });
    await page.locator('a.edit-link[href$="/edit"]').first().dispatchEvent("click").catch(() => undefined);
    await page.waitForSelector("#edit_card, .modal", { timeout: 20_000 }).catch(() => undefined);
    const editorId = await focusRichEditor(page);
    await page.waitForTimeout(4000);
    const editor = await page.evaluate((id) => {
      const instance = window.tinymce?.activeEditor;
      if (!instance) return { loaded: false, tinymcePresent: Boolean(window.tinymce), editorId: id ?? null };
      const container = instance.editorContainer ?? instance.getContainer?.();
      const controls = [...(container?.querySelectorAll("[title], [aria-label]") ?? [])]
        .map((el) => `${el.getAttribute("title") ?? ""} ${el.getAttribute("aria-label") ?? ""}`.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const menuTexts = [...(container?.querySelectorAll(".tox-mbtn, .tox-menubar button, .tox-mbtn-selector select, [role=menuitem]") ?? [])]
        .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      return {
        loaded: true,
        editorId: id ?? null,
        plugins: instance.settings?.plugins ?? null,
        menubar: instance.settings?.menubar ?? null,
        menu: instance.settings?.menu ?? null,
        baseUrl: instance.baseURL ?? null,
        suffix: instance.suffix ?? null,
        menuTexts: [...new Set(menuTexts)].slice(0, 40),
        controls: [...new Set(controls)].slice(0, 60),
        tableControl: controls.some((t) => /table/i.test(t)),
        tableText: menuTexts.some((t) => /table/i.test(t)),
        resources: performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((name) => /tinymce|plugins|skins|themes|icons/i.test(name)),
      };
    }, editorId);
    report.editor = editor;
    report.deckTinyMceConfig = (() => {
      const db = new Database(localDeck, { readonly: true });
      const row = db.prepare("SELECT db_content FROM cards WHERE codename='tiny_mce' AND trash=0").get();
      db.close();
      return row?.db_content ?? null;
    })();
    console.log(JSON.stringify(report.editor, null, 1).slice(0, 3000));
  } finally {
    await browser.close?.().catch(() => undefined);
  }
  await exit(0);
} catch (error) {
  report.error = String(error?.stack ?? error);
  console.error(report.error);
  await exit(1);
}

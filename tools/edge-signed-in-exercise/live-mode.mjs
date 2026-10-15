// live-mode.mjs — drives an EXISTING signed-in session on the live site, in a
// browser profile the operator signed into by hand. Built for the lead to run;
// it is never run from the local harness.
//
//   node tools/edge-signed-in-exercise/live-mode.mjs --profile <dedicated profile dir> [--url https://culturesmith-edge.bunny.run] [--headed]
//
// THE OPERATOR'S ONE-TIME STEP (done by hand, not by this script):
//   1. Create a DEDICATED profile folder (not the operator's everyday browser profile).
//   2. Run `node tools/edge-signed-in-exercise/live-mode.mjs --profile <that folder> --sign-in-only`.
//      A window opens on the site's sign-in page. The operator signs in there by
//      hand, closes the window, and the profile keeps the session cookie.
//   3. Later runs reuse that profile and never see a password.
//
// SAFETY RULES THE CODE ENFORCES:
//   - Only the URL given to --url is driven, and it must be https on the exact
//     host culturesmith-edge.bunny.run (or a loopback host for testing this code).
//   - Every card this run creates is named with a unique prefix
//     `HarnessLive_<runId>_` and recorded in a ledger BEFORE it is created.
//   - Cleanup deletes ONLY cards in that ledger, and only after confirming, on the
//     card's own page, that the run's marker text is present (so a card that
//     happens to share the name, or that a person changed, is never deleted).
//   - No account is created, no password or email is changed, and the operator's
//     own sign-out is never clicked (it would end the session the run depends on).
//   - Existing cards are never edited, renamed or deleted. Edit checks run on the
//     card the run itself created.
//   - Any leftover card after cleanup is reported by name, never deleted by a
//     guess or a pattern.
//   - Writes go only through the site's own forms, as the operator would make them.

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");

const argOf = (name) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const hasFlag = (name) => process.argv.includes(`--${name}`);

const LIVE_HOST = "culturesmith-edge.bunny.run";
const URL_ARG = argOf("url") ?? `https://${LIVE_HOST}`;
const PROFILE = argOf("profile");
const SIGN_IN_ONLY = hasFlag("sign-in-only");
const HEADED = hasFlag("headed") || SIGN_IN_ONLY;

if (!PROFILE) throw new Error("--profile <dedicated profile folder> is required");
const target = new URL(URL_ARG);
const LOOPBACK = new Set(["127.0.0.1", "localhost"]);
if (!(target.hostname === LIVE_HOST || LOOPBACK.has(target.hostname))) {
  throw new Error(`refusing to drive ${target.hostname}: only ${LIVE_HOST} or a loopback test host is allowed`);
}
if (target.protocol !== "https:") throw new Error("refusing a non-https target");
if (target.hostname === LIVE_HOST && process.env.HARNESS_LIVE_CONFIRM !== "yes") {
  throw new Error("refusing to drive the live site without HARNESS_LIVE_CONFIRM=yes (set by the operator for the run)");
}

// Playwright from the repo's node_modules, as the local harness does.
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

// An installed Chrome or Edge, as the local harness uses; nothing is downloaded.
const BROWSERS = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"];
const executablePath = BROWSERS.find((p) => existsSync(p));
if (!executablePath) throw new Error("no installed Chrome or Edge found");

const RUN_ID = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const PREFIX = `HarnessLive_${RUN_ID}_`;
const LEDGER_PATH = join(REPO, "tmp", `live-ledger-${RUN_ID}.json`);
const ledger = { runId: RUN_ID, host: target.hostname, prefix: PREFIX, created: [], deleted: [], leftover: [], startedAt: new Date().toISOString() };
const saveLedger = () => { mkdirSync(dirname(LEDGER_PATH), { recursive: true }); writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2)); };

const STOCK_CDNS = new Set(["code.jquery.com", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com", "kit.fontawesome.com", "ka-f.fontawesome.com"]);
const SITE_ASSETS = new Set(["culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com"]);

mkdirSync(PROFILE, { recursive: true });
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: !HEADED,
  executablePath,
  ignoreHTTPSErrors: LOOPBACK.has(target.hostname), // loopback test host only: its throwaway certificate
  viewport: { width: 1280, height: 900 },
  acceptDownloads: false,
  args: ["--no-first-run", "--no-default-browser-check", "--mute-audio"],
});
// Only the live host, its own asset host and the stock layout CDNs load.
await context.route(
  (url) => /^(https?|wss?):$/.test(url.protocol) && url.hostname !== target.hostname && !SITE_ASSETS.has(url.hostname) && !STOCK_CDNS.has(url.hostname) && !LOOPBACK.has(url.hostname),
  (route) => route.abort("blockedbyclient"),
);
const page = context.pages()[0] ?? (await context.newPage());
page.on("dialog", (d) => d.accept().catch(() => undefined));
// Confirm dialogs (the delete link's confirm) are accepted, as a person would.

if (SIGN_IN_ONLY) {
  await page.goto(`${target.origin}/*signin`, { waitUntil: "load" });
  console.log("A window is open on the sign-in page of the dedicated profile. Sign in there by hand, then close the window.");
  await page.waitForEvent("close", { timeout: 60 * 60 * 1000 }).catch(() => undefined);
  await context.close();
  console.log("profile saved. Later runs reuse it.");
  process.exit(0);
}

const results = [];
const record = (check, pass, evidence = {}) => {
  results.push({ check, pass, evidence });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${check}`);
  if (!pass) console.log(`        evidence: ${JSON.stringify(evidence).slice(0, 300)}`);
};
const attempt = async (check, fn) => { try { return await fn(); } catch (e) { record(check, false, { threw: String(e.message ?? e).slice(0, 200) }); return undefined; } };
const SIGNED_IN = /decko\.signed_in\s*=\s*true|decko\.signed_in"[^>]*value="true"/;

async function visit(path) {
  const started = Date.now();
  const response = await page.goto(`${target.origin}${path}`, { waitUntil: "load", timeout: 60_000 });
  const html = await page.content();
  return { status: response?.status() ?? null, wallMs: Date.now() - started, html, signedIn: SIGNED_IN.test(html), hasSignOut: /Sign out/.test(html) };
}

/** Creates a card this run owns: recorded in the ledger first, then created. */
async function createOwned(label, typePath, content) {
  const name = `${PREFIX}${label}`;
  ledger.created.push(name);
  saveLedger();
  await page.goto(`${target.origin}${typePath}`, { waitUntil: "load" });
  await page.locator('form.card-form input[name="card[name]"]').first().fill(name);
  if (content !== undefined) {
    await page.waitForTimeout(1500);
    await page.evaluate((html) => window.tinymce?.activeEditor?.setContent(html), content).catch(() => undefined);
  }
  await page.locator('form.card-form button[type="submit"], form.card-form input[type="submit"]').first().click();
  await page.waitForTimeout(3000);
  const after = await visit(`/${name}`);
  return { name, status: after.status, html: after.html };
}

/** Deletes a card this run created, but only after its marker text is seen on its page. */
async function deleteOwned(name, markerText) {
  if (!ledger.created.includes(name) || !name.startsWith(PREFIX)) {
    throw new Error(`refusing to delete ${name}: not created by this run`);
  }
  const page1 = await visit(`/${name}`);
  if (page1.status !== 200 || !page1.html.includes(markerText)) {
    ledger.leftover.push({ name, reason: "marker not found on the card's page; left in place for the operator" });
    saveLedger();
    return false;
  }
  await page.goto(`${target.origin}/delete/${encodeURIComponent(name)}`, { waitUntil: "load" }).catch(() => undefined);
  await page.waitForTimeout(2000);
  const gone = await visit(`/${name}`);
  if (!gone.html.includes(markerText)) {
    ledger.deleted.push(name);
    saveLedger();
    return true;
  }
  ledger.leftover.push({ name, reason: "delete did not remove the card's content" });
  saveLedger();
  return false;
}

console.log(`live exercise, run ${RUN_ID}, target ${target.origin}, profile ${PROFILE}`);
try {
  // 1. the operator's session is still there
  const home = await attempt("the dedicated profile is still signed in", () => visit("/"));
  if (home) record("the dedicated profile is signed in on /", home.signedIn && home.hasSignOut, { status: home.status, signedIn: home.signedIn, hasSignOut: home.hasSignOut, wallMs: home.wallMs });
  if (!home || !home.signedIn) throw new Error("not signed in: run --sign-in-only first, then rerun");

  // 2. create a card this run owns, with a marker, and check it is shown
  const marker = `live-marker-${RUN_ID}`;
  const made = await attempt("create", () => createOwned("note", "/new/RichText", `<p>${marker}</p>`));
  if (made) record("create a RichText card through /new/RichText and see it", made.status === 200 && made.html.includes(marker), { name: made.name, status: made.status });

  // 3. the navbar and read pages stay signed in
  await attempt("navigate", async () => {
    const r = await visit(`/${made?.name ?? "Home"}`);
    record("stays signed in on a card page", r.signedIn, { status: r.status, wallMs: r.wallMs });
  });

  // 4. cleanup of everything this run created
  for (const name of ledger.created) {
    await attempt(`cleanup ${name}`, async () => {
      const ok = await deleteOwned(name, marker);
      record(`cleanup removes the card this run created (${name})`, ok, { name });
    });
  }
} finally {
  const leftovers = ledger.created.filter((n) => !ledger.deleted.includes(n));
  record("no card created by this run is left behind", leftovers.length === 0, { leftover: leftovers });
  ledger.finishedAt = new Date().toISOString();
  saveLedger();
  await context.close();
  const failures = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failures.length} / ${results.length} checks passed. Ledger: ${LEDGER_PATH}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

// modal-stack-probe.mjs — reproduces the S1 stacked-modal inversion with
// lifecycle taps. ONE deck + ONE stack; each iteration reloads
// /CARD?view=edit (a full navigation resets the DOM), resets the tap
// counters, clicks the page's own menu edit link after DELAY ms from the
// modal form turning visible, and records every bootstrap modal event plus
// the resulting DOM state.

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
const RUN_ID = `modal-probe-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const RUN_DIR = join(REPO, "tmp", RUN_ID);
mkdirSync(RUN_DIR, { recursive: true });
const DELAYS = JSON.parse(process.env.MODAL_STACK_PROBE_DELAYS ?? "[0,60,150,400,900,2500]");

const stackLib = await load("tools/edge-signed-in-exercise/lib/stack.mjs");
const { buildLocalDeck } = await load("tools/edge-signed-in-exercise/lib/build-local-deck.mjs");
const { seedLocalAccounts } = await load("tools/edge-signed-in-exercise/lib/seed-local-accounts.mjs");
const { launchHarnessBrowser } = await load("tools/edge-signed-in-exercise/lib/harness-browser.mjs");

const { env: liveEnv } = await stackLib.readLiveScriptEnv(SECRETS);
const assetHosts = [...new Set(Object.entries(liveEnv)
  .filter(([k, v]) => k.startsWith("DECKO_SERVED_") && typeof v === "string" && /^https?:\/\//i.test(v))
  .map(([, v]) => { try { return new URL(v).hostname; } catch { return null; } })
  .filter(Boolean))];
const bundlePath = join(REPO, "deploy/dist/bunny-edge-engine.bundle.js");
const bundleSha256 = createHash("sha256").update(readFileSync(bundlePath)).digest("hex");

const TAP = `(() => {
  window.__modalEvents = [];
  window.__t0 = performance.now();
  const snap = () => [...document.querySelectorAll("body > .modal, body > ._modal-slot, body > ._modal-stack")].map(m => ({
    id: m.id || null, cls: m.className.slice(0, 90), display: getComputedStyle(m).display, show: m.classList.contains("show"),
  }));
  for (const type of ["show.bs.modal", "shown.bs.modal", "hide.bs.modal", "hidden.bs.modal"]) {
    window.addEventListener(type, (e) => {
      const target = e.target;
      if (!(target instanceof Element) || !target.matches("body > *")) return;
      window.__modalEvents.push({ t: Math.round(performance.now() - window.__t0), type, targetId: (target.id || target.className).slice(0, 50), defaultPrevented: e.defaultPrevented });
    }, true);
  }
})()`;

const localDeck = join(RUN_DIR, "deck.sqlite3");
console.log("building local deck copy…");
await buildLocalDeck({ source: SOURCE_DECK, out: localDeck });
const credentialsPath = join(RUN_DIR, "credentials.json");
await seedLocalAccounts({ deck: localDeck, credentialsOut: credentialsPath });
const creds = JSON.parse(readFileSync(credentialsPath, "utf8"));
const stack = await stackLib.startStack({ deckPath: localDeck, live: liveEnv, runtimeDir: join(RUN_DIR, "runtime"), bundlePath, expectedBundleSha256: bundleSha256 });
console.log(`stack up: ${stack.origin}`);

const harness = await launchHarnessBrowser({ origin: stack.origin, assetHosts });
const page = harness.page;
await page.addInitScript(TAP);
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("ERR_BLOCKED_BY_CLIENT")) errors.push(m.text().slice(0, 200)); });

await page.goto(stack.origin + "/*signin", { waitUntil: "load" });
const form = page.locator("form.card-form").filter({ has: page.locator("input[type=\"password\"]") }).first();
await form.locator("input[name=\"card[subcards][+*email][content]\"]").fill(creds.admin.email);
await form.locator("input[type=\"password\"]").fill(creds.admin.password);
await form.locator("button[type=\"submit\"]").first().click();
await page.waitForTimeout(1500);

const TS = Date.now().toString(36);
const CARD = `ModalProbe_${TS}`;
const resp = await page.context().request.post(stack.origin + "/card/create", {
  headers: { origin: stack.origin, "Content-Type": "application/x-www-form-urlencoded" },
  data: new URLSearchParams({ "card[name]": CARD, "card[type]": "Basic", "card[content]": "PROBE_BASE", "success[redirect]": "true" }).toString(),
  maxRedirects: 0,
});
if (resp.status() >= 400) throw new Error(`probe create refused ${resp.status()}`);

const results = [];
for (const clickDelayMs of DELAYS) {
  await page.goto(stack.origin + "/" + CARD + "?view=edit", { waitUntil: "load" });
  await page.locator("#modal-container form.card-form").first().waitFor({ state: "visible", timeout: 20000 });
  await page.evaluate(() => { window.__modalEvents = []; window.__t0 = performance.now(); });
  if (clickDelayMs > 0) await page.waitForTimeout(clickDelayMs);
  const menuEdit = page.locator("#main a.edit-link[href$='/edit']").first();
  await menuEdit.dispatchEvent("click");
  await page.waitForTimeout(3000);
  const events = await page.evaluate(() => window.__modalEvents);
  const domState = await page.evaluate(() => ({
    modals: [...document.querySelectorAll("body > .modal, body > ._modal-slot, body > ._modal-stack")].map((m) => ({
      id: m.id || null, cls: m.className.slice(0, 90), display: getComputedStyle(m).display, show: m.classList.contains("show"),
      formCount: m.querySelectorAll("form.card-form").length,
    })),
    backdrops: [...document.querySelectorAll(".modal-backdrop")].map((b) => b.className.slice(0, 40)),
    bodyModalOpen: document.body.classList.contains("modal-open"),
  }));
  const top = domState.modals[0];
  const inverted = !(top && top.id === "modal-container" && top.display === "block" && top.show === true);
  results.push({ clickDelayMs, events, domState, inverted, errorsThisRound: errors.splice(0) });
  console.log(`delay=${clickDelayMs}: inverted=${inverted} events=${JSON.stringify(events.map((e) => `${e.t}ms ${e.type} prev=${e.defaultPrevented}`))}`);
  console.log(`  dom: ${JSON.stringify(domState.modals)} backdrops=${JSON.stringify(domState.backdrops)}`);
}

writeFileSync(join(HERE, `${RUN_ID}-probe-receipt.json`), JSON.stringify({ runId: RUN_ID, delays: DELAYS, results }, null, 2));
console.log("PROBE RECEIPT", join(HERE, `${RUN_ID}-probe-receipt.json`));
await harness.close();
await stack.close().catch(() => undefined);
process.exit(0);

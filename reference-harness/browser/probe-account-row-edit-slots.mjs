// ACT-077 (E19) leg, part 2: settle the row-modal leg deterministically.
//
// The probe's modal leg (probe-exhaustive-affordance-reds.mjs) opens the
// labeled row's pencil and waits for a visible input inside the modal; on
// this tree the modal opens (div.modal fade _modal-slot show) but its body
// stays empty past a 45s wait, while the named instrument measured the same
// capability PASS this morning
// (.runtime/edge-signed-in/2026-10-18T-fixerr-three-defects-repro/report.md:73,
// fields email card[content]/text and password card[content]/password).
//
// The pencil is a modal slotter whose href IS the row's edit route
// (the capture: a.edit-link.slotter data-slotter-mode=modal
// href="/Ada_Admin+*account+*email/edit"), so this leg requests that route
// directly and asserts the editor it serves: one visible content input per
// row, with the email right rendering type=text and the password right
// rendering type=password. That separates the engine's rendering from the
// modal's delivery.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";

const repo = "C:/localProjects/decko-ts-release-lead";
const engineManifest = path.join(repo, "reference-harness/browser/engines/ts.json");
const fixtureDir = path.join(repo, "reference-harness/fixtures/synthetic-v1");
const out = path.join(repo, ".runtime/exhaustive/2026-10-18-lane6-act-077-row-edit");
mkdirSync(out, { recursive: true });
const STEP_TIMEOUT = 30_000;

const spec = JSON.parse((await import("node:fs")).readFileSync(path.join(fixtureDir, "deck.json"), "utf8"));
const server = await startEngine(loadEngine(engineManifest), fixtureDir, { logFile: path.join(out, "server.log") });
const base = server.base;
const holder = spec.actors.admin.card.replaceAll(" ", "_");
const results = [];
try {
  const browser = await launchBrowser();
  try {
    const page = browser.context.pages()[0] ?? (await browser.context.newPage());
    page.setDefaultTimeout(STEP_TIMEOUT);
    await page.goto(base + "/*signin", { waitUntil: "load", timeout: STEP_TIMEOUT });
    await page.fill("input[name='card[subcards][+*email][content]']", spec.actors.admin.email);
    await page.fill("input[name='card[subcards][+*password][content]']", spec.actors.admin.password);
    const pending = page.waitForResponse((r) => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: STEP_TIMEOUT });
    await page.locator("form[action='/update/*signin'] button[type='submit']").first().click();
    const response = await pending;
    await response.finished();
    const signedIn = (await browser.context.cookies(base)).some((c) => c.name === "decko_ts_session" && c.value);
    results.push({ leg: "signin", pass: response.status() < 400 && signedIn, postStatus: response.status(), signedIn });

    for (const [right, expectedType] of [["email", "text"], ["password", "password"]]) {
      const route = `/${holder}+*account+*${right}/edit`;
      const res = await page.goto(base + route, { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => null);
      const facts = await page.evaluate((r) => {
        const slot = document.querySelector(`.RIGHT-X${r}`);
        const inputs = [...document.querySelectorAll(`[name='card[content]']`)].filter((i) => i.closest(`.RIGHT-X${r}`) !== null || i.closest("form")?.getAttribute("action")?.includes(`+*${r}`));
        const all = [...document.querySelectorAll("[name='card[content]']")];
        return {
          status: null,
          slotPresent: slot !== null,
          slotClass: slot?.className?.slice(0, 140) ?? null,
          rightContentInputs: inputs.map((i) => ({
            type: i.getAttribute("type"),
            visible: i.getClientRects().length > 0,
            value: (i.getAttribute("value") ?? "").slice(0, 40),
            form: i.closest("form")?.getAttribute("action") ?? null,
          })),
          pageContentInputs: all.length,
          visiblePageContentInputs: all.filter((i) => i.getClientRects().length > 0).length,
          textareas: document.querySelectorAll("textarea").length,
          formActions: [...document.querySelectorAll("form.card-form")].map((f) => f.getAttribute("action")).slice(0, 6),
        };
      }, right).catch((e) => ({ error: String(e?.message ?? e) }));
      facts.status = res ? res.status() : null;
      writeFileSync(path.join(out, `row-${right}.html`), await page.content());
      const visible = facts.rightContentInputs?.find((i) => i.visible) ?? null;
      const pass = facts.status === 200 && visible !== null && visible.type === expectedType && String(visible.form ?? "").includes(`+*${right}`);
      results.push({ leg: `ACT-077-row-edit-${right}`, pass, route, expectedType, ...facts });
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.stop();
}
for (const r of results) console.log(`[act077-row] ${r.pass ? "PASS" : "FAIL"} ${r.leg} ${JSON.stringify(r).slice(0, 420)}`);
writeFileSync(path.join(out, "row-edit-results.json"), JSON.stringify(results, null, 2));
console.log("[act077-row] verdicts:", JSON.stringify(Object.fromEntries(results.map((r) => [r.leg, r.pass]))));
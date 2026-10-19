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
//
// WHY EACH ROW IS WAITED FOR, NOT SAMPLED AT `load` (measured 2026-10-20 on
// d8050251, this probe's own receipts as the failing case):
//   The editor is served INSIDE #modal-container, and the engine renders
//   that container CLOSED — byte-identical to Ruby's
//   card-mod-layout-0.20.0/set/all/modal/modal_dialog.haml:1
//   (`#modal-container.modal.fade._modal-slot{ role: "dialog" }`, no
//   `show`), for BOTH rows. Raw-HTTP comparison of the two engines on
//   /<card>+*account+*password/edit returned byte-identical modal-container
//   and password-input tags, and both engines serve the identical client
//   assets (/files/~307 sha256 53efb75374566e03, /files/~447 sha256
//   e9dbcbbb1bf1aa32). Nothing opens the container but the Decko client JS
//   (`el.modal("show", $slotter)` on contentLoaded), which runs AFTER the
//   load event. So at `waitUntil: "load"` the input legitimately has no
//   client rects on BOTH engines, and a few seconds later it has one on
//   BOTH engines. Sampling at load graded that race, not the capability:
//   it is why the email row read PASS and the password row FAIL in one run
//   on one tree.
//   So: wait for the row's content input to become visible (bounded), THEN
//   measure. The assertions below are unchanged — the input still has to be
//   genuinely visible, with the right type and the right form action.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";

// Resolved from this file's own location, so the probe measures whichever
// checkout it is run from. It used to name one other worktree outright,
// which meant a run graded that worktree's build no matter where it was
// invoked from. Same --engine/--fixture/--out shape as the sibling probes
// (probe-exhaustive-affordance-reds.mjs).
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
}
const engineManifest = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? path.join(repo, ".runtime/exhaustive/act-077-row-edit"));
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
      // Settle: the editor is inside #modal-container, which the Decko
      // client JS opens after the load event (see the header note). Wait
      // for this row's content input to be VISIBLE before reading anything
      // - that is the capability under test, and it is what the old
      // sample-at-load read mistook for a broken engine.
      const inputLocator = page
        .locator(`#modal-container [name='card[content]']:not([type=hidden]), form[action*='+*${right}'] [name='card[content]']:not([type=hidden])`)
        .first();
      const inputSettledVisible = await inputLocator
        .waitFor({ state: "visible", timeout: STEP_TIMEOUT })
        .then(() => true, () => false);
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
      facts.inputSettledVisible = inputSettledVisible;
      writeFileSync(path.join(out, `row-${right}.html`), await page.content());
      const visible = facts.rightContentInputs?.find((i) => i.visible) ?? null;
      const pass = facts.status === 200 && inputSettledVisible && visible !== null && visible.type === expectedType && String(visible.form ?? "").includes(`+*${right}`);
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
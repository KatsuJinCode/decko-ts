#!/usr/bin/env node
// Re-drives the six affordance-not-found reds of the 2026-10-18 exhaustive
// run's lane-6 slice (ACT-018, ACT-044, ACT-077, ACT-100, ACT-126, ACT-147)
// against each action's named contract, on the same engine (ts.json) and the
// same fixture (synthetic-v1) the exhaustive runner uses.
//
// Purpose: distinguish an ENGINE red (the capability is genuinely broken or
// absent on this tree) from an INSTRUMENT red (the exhaustive runner's probe
// drove the wrong page, the wrong actor, or no session). Each leg mirrors the
// capability's named instrument where one exists:
//   ACT-018  battery B-018  "RichText edit opens as a modal"
//   ACT-044  (edge-signed-in-exercise.mjs account-tab rows)
//   ACT-077  E19            (edge-signed-in-exercise.mjs:430-480)
//   ACT-100  P3             (tools/edge-signed-in-exercise/checks-permissions.mjs)
//   ACT-126  A5             (tools/edge-signed-in-exercise/checks-mail-reset.mjs)
//   ACT-147  F6             (tools/edge-signed-in-exercise/checks-upload-image-change.mjs)
// plus a session-fidelity pair that replays run-exhaustive.mjs's own signIn()
// verbatim and reports exactly what the engine renders afterwards.
//
//   node reference-harness/browser/probe-exhaustive-affordance-reds.mjs \
//     --engine reference-harness/browser/engines/ts.json \
//     --fixture reference-harness/fixtures/synthetic-v1 \
//     --out .runtime/exhaustive/<dir>
//
// The engine stages a private copy of the fixture deck (lib/engines.mjs), so
// every write this probe makes dies with the staging directory.

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
}
const engineManifest = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-exhaustive-affordance-reds");
mkdirSync(out, { recursive: true });

const STEP_TIMEOUT = 30_000;
const results = [];
const record = (leg, pass, details) => {
  results.push({ leg, pass, ...details });
  console.log(`[probe] ${pass ? "PASS" : "FAIL"} ${leg} ${JSON.stringify(details).slice(0, 400)}`);
};

/** The runner's own sign-in (run-exhaustive.mjs:456-464), verbatim, with the
 *  thrown error captured instead of propagating. */
async function runnerSignIn(page, base, actor) {
  const post = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST",
    { timeout: STEP_TIMEOUT },
  ).then((r) => ({ r }), (e) => ({ e }));
  await page.goto(base + "/*signin", { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => {});
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(actor.email, { timeout: STEP_TIMEOUT });
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(actor.password, { timeout: STEP_TIMEOUT });
  await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: STEP_TIMEOUT });
  const observed = await post;
  if (observed.e) return { error: "no sign-in POST observed: " + observed.e.message, postStatus: null };
  await observed.r.finished().catch(() => {});
  await page
    .waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: STEP_TIMEOUT })
    .catch(() => {});
  let signoutError = null;
  const out2 = page.locator("a.signout-link").first();
  await out2.waitFor({ state: "attached", timeout: STEP_TIMEOUT }).catch((e) => { signoutError = String(e?.message ?? e).split("\n")[0]; });
  return {
    error: signoutError,
    postStatus: observed.r.status(),
    landedOn: page.url(),
    cookies: (await page.context().cookies(base)).map((c) => c.name),
  };
}

/** Chrome inventory of the current page: what session affordances render. */
async function chromeInventory(page) {
  return page.evaluate(() => ({
    signoutLinks: document.querySelectorAll("a.signout-link").length,
    signinLinks: [...document.querySelectorAll("a")].filter((a) => a.textContent.trim() === "Sign in").length,
    signupLinks: [...document.querySelectorAll("a")].filter((a) => a.textContent.trim() === "Sign up").length,
    myCardLinks: document.querySelectorAll("#my-card-link, a.my-card").length,
    accountDropdownItems: [...document.querySelectorAll("a.dropdown-item")].map((a) => a.textContent.trim()).slice(0, 8),
    accountTabLinks: [...document.querySelectorAll("a")].filter((a) => a.textContent.trim() === "Account").map((a) => a.getAttribute("href")).slice(0, 5),
    loggingDiv: document.querySelector("#logging")?.className ?? null,
    editAffordances: {
      editTextLinks: [...document.querySelectorAll("a, button, input[type=submit], input[type=button], a.btn")].filter((el) => /^edit$/i.test(el.textContent.trim())).length,
      editLinkClass: document.querySelectorAll("a.edit-link").length,
      cardMenu: document.querySelectorAll(".card-menu, .d0-card-menu, .type-dropdown, .menu-header").length,
      navbarEdit: [...document.querySelectorAll("li.nav-item a")].map((a) => a.textContent.trim()).slice(0, 12),
    },
  }));
}

async function main() {
  const engine = loadEngine(engineManifest);
  const spec = JSON.parse((await import("node:fs")).readFileSync(path.join(fixtureDir, "deck.json"), "utf8"));
  const actors = spec.actors;
  const serverLog = path.join(out, "server.log");
  const server = await startEngine(engine, fixtureDir, { logFile: serverLog });
  const base = server.base;
  console.log(`[probe] engine ${engine.name} on ${base}`);
  try {
    // ------------------------------------------------------------------
    // Leg 1: the runner's own signIn, verbatim, as admin.
    // ------------------------------------------------------------------
    const adminBrowser = await launchBrowser();
    try {
      const page = adminBrowser.context.pages()[0] ?? (await adminBrowser.context.newPage());
      page.setDefaultTimeout(STEP_TIMEOUT);
      const admin = actors.admin;
      const signIn = await runnerSignIn(page, base, admin);
      const cookies = (await adminBrowser.context.cookies(base)).map((c) => c.name);
      const sessionCookie = cookies.includes("decko_ts_session");
      record("leg1-runner-signin-admin", signIn.error === null && signIn.postStatus !== null && signIn.postStatus < 400 && sessionCookie, {
        signInError: signIn.error, postStatus: signIn.postStatus, landedOn: signIn.landedOn, cookies,
      });
      // What the engine renders on / for this (possibly signed-in) session.
      await page.goto(base + "/", { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => {});
      const inv = await chromeInventory(page);
      record("leg1-home-chrome-after-runner-signin", inv.signoutLinks > 0, {
        ...inv, sessionCookie,
      });
      writeFileSync(path.join(out, "leg1-home.html"), await page.content());
    } finally {
      await adminBrowser.close();
    }

    // ------------------------------------------------------------------
    // Leg 2: the named instruments' signIn (form's own submit button), admin.
    // ------------------------------------------------------------------
    const namedBrowser = await launchBrowser();
    try {
      const page = namedBrowser.context.pages()[0] ?? (await namedBrowser.context.newPage());
      page.setDefaultTimeout(STEP_TIMEOUT);
      await page.goto(base + "/*signin", { waitUntil: "load", timeout: STEP_TIMEOUT });
      await page.fill("input[name='card[subcards][+*email][content]']", actors.admin.email);
      await page.fill("input[name='card[subcards][+*password][content]']", actors.admin.password);
      const pending = page.waitForResponse((r) => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: STEP_TIMEOUT });
      await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
      const response = await pending;
      await response.finished();
      const sessionCookie = (await namedBrowser.context.cookies(base)).some((c) => c.name === "decko_ts_session" && c.value);
      record("leg2-named-signin-admin", response.status() < 400 && sessionCookie, { postStatus: response.status(), sessionCookie });
      await page.goto(base + "/", { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => {});
      const inv = await chromeInventory(page);
      record("leg2-home-chrome-named-signin", inv.signoutLinks > 0, { ...inv });
      writeFileSync(path.join(out, "leg2-home.html"), await page.content());

      // ----------------------------------------------------------------
      // ACT-018: "RichText edit opens as a modal" — the edit affordance on
      // a rich-text card for a signed-in admin, then the modal.
      // ----------------------------------------------------------------
      const act018 = {};
      await page.goto(base + "/", { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => {});
      act018.home = await chromeInventory(page);
      // The create/edit surface the SURFACES table itself names for surface 4.
      await page.goto(base + "/new?card[type]=RichText", { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => {});
      act018.newRichTextStatus = await page.evaluate(() => fetch("/new?card[type]=RichText").then((r) => r.status)).catch(() => null);
      act018.newRichText = await chromeInventory(page);
      const tinyMceLoaded = await page.evaluate(() => !!window.tinyMCE).catch(() => false);
      // The direct edit view of the home card (rich text), the way Decko's
      // own update path reaches it.
      const editResp = await page.goto(base + "/Home?view=edit", { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => ({ status: () => null }));
      act018.homeEditViewStatus = typeof editResp.status === "function" ? editResp.status() : null;
      act018.homeEditView = await chromeInventory(page);
      act018.homeEditForm = await page.evaluate(() => {
        const form = document.querySelector("form.card-form");
        return form ? { action: form.getAttribute("action"), hasTextarea: !!form.querySelector("textarea, .tinymce-area, [id*='_content']") } : null;
      }).catch(() => null);
      const modalCount = await page.locator(".modal, [role=dialog]").count().catch(() => 0);
      record("ACT-018-richtext-edit-modal", (act018.homeEditViewStatus === 200 || act018.homeEditViewStatus === null) && act018.homeEditForm !== null && modalCount > 0 && tinyMceLoaded, {
        ...act018, modalCount, tinyMceLoaded,
      });
      writeFileSync(path.join(out, "act018-home-edit.html"), await page.content());

      // ----------------------------------------------------------------
      // ACT-044 / ACT-077: the account card's board and its Account tab.
      // ----------------------------------------------------------------
      const actorName = actors.admin.card; // "Ada Admin" in the synthetic fixture
      const acct = {};
      const acctResp = await page.goto(base + "/" + actorName.replaceAll(" ", "_"), { waitUntil: "load", timeout: STEP_TIMEOUT }).catch(() => null);
      acct.boardStatus = acctResp ? acctResp.status() : null;
      acct.tabs = await page.evaluate(() => [...document.querySelectorAll(".nav-tabs a, .board .nav-tabs a")].map((a) => a.textContent.trim()));
      acct.accountTabHref = await page.evaluate(() => [...document.querySelectorAll("a")].filter((a) => a.textContent.trim() === "Account").map((a) => a.getAttribute("href"))[0] ?? null);
      let acct077 = { ...acct };
      if (acct.accountTabHref) {
        await page.locator("a").filter({ hasText: /^Account$/ }).first().click({ timeout: STEP_TIMEOUT }).catch(() => {});
        await page.waitForLoadState("load", { timeout: STEP_TIMEOUT }).catch(() => {});
        const emailCount = await page.locator("input[name='card[subcards][+*email][content]'], .RIGHT-Xemail input.d0-card-content").count().catch(() => 0);
        const pwCount = await page.locator("input[name='card[subcards][+*password][content]'], .RIGHT-Xpassword input[type=password], .RIGHT-Xpassword input.d0-card-content").count().catch(() => 0);
        acct077 = { ...acct077, emailCount, pwCount, landedOn: page.url() };
        writeFileSync(path.join(out, "act077-account-tab.html"), await page.content());
      }
      record("ACT-044-account-tab", acct.boardStatus === 200 && acct.tabs.includes("Account"), acct);
      record("ACT-077-e19-account-tab-fields", acct077.boardStatus === 200 && acct077.tabs.includes("Account") && acct077.emailCount > 0 && acct077.pwCount > 0, acct077);
    } finally {
      await namedBrowser.close();
    }

    // ------------------------------------------------------------------
    // ACT-100: P3 — a member is denied edit of an update-restricted card.
    // Mirrors checks-permissions.mjs (the named instrument).
    // ------------------------------------------------------------------
    const adminBrowser2 = await launchBrowser();
    const memberBrowser = await launchBrowser();
    try {
      const adminPage = adminBrowser2.context.pages()[0] ?? (await adminBrowser2.context.newPage());
      const memberPage = memberBrowser.context.pages()[0] ?? (await memberBrowser.context.newPage());
      adminPage.setDefaultTimeout(STEP_TIMEOUT);
      memberPage.setDefaultTimeout(STEP_TIMEOUT);
      for (const [page, actor] of [[adminPage, actors.admin], [memberPage, actors.member]]) {
        await page.goto(base + "/*signin", { waitUntil: "load", timeout: STEP_TIMEOUT });
        await page.fill("input[name='card[subcards][+*email][content]']", actor.email);
        await page.fill("input[name='card[subcards][+*password][content]']", actor.password);
        const pending = page.waitForResponse((r) => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: STEP_TIMEOUT });
        await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
        const response = await pending;
        await response.finished();
        const signedIn = (await page.context().cookies(base)).some((c) => c.name === "decko_ts_session" && c.value);
        if (!(response.status() < 400 && signedIn)) throw new Error(`ACT-100 actor ${actor.card} sign-in failed: ${response.status()}`);
      }
      const stamp = Date.now().toString(36);
      const writeName = "HarnessPolicyUpdate_" + stamp;
      const post = async (pathName, fields) =>
        adminBrowser2.context.request.post(base + pathName, {
          headers: { origin: base, "Content-Type": "application/x-www-form-urlencoded" },
          data: new URLSearchParams(fields).toString(),
          maxRedirects: 0,
        });
      for (const [name, content, type] of [
        [writeName, "UNCHANGED_UPDATE_" + stamp, "Basic"],
        [writeName + "+*self+*update", "[[Administrator]]", "Phrase"],
      ]) {
        const response = await post("/card/create", { "card[name]": name, "card[type]": type, "card[content]": content, "success[redirect]": "true" });
        if (response.status() >= 400) throw new Error(`ACT-100 fixture create refused: ${name} (${response.status()})`);
      }
      const memberRead = await memberPage.goto(base + "/" + writeName, { waitUntil: "load", timeout: STEP_TIMEOUT });
      const memberEdit = await memberPage.goto(base + "/" + writeName + "?view=edit", { waitUntil: "load", timeout: STEP_TIMEOUT });
      const editInputs = await memberPage.locator("[name='card[content]']").count().catch(() => -1);
      const deniedPost = await memberPage.evaluate(async ({ origin, name }) => {
        const r = await fetch(origin + "/update/" + name, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ "card[content]": "UNAUTHORIZED_ATTEMPT", "success[redirect]": "true" }),
        });
        return r.status;
      }, { origin: base, name: writeName });
      const adminSees = await adminPage.goto(base + "/" + writeName, { waitUntil: "load", timeout: STEP_TIMEOUT });
      const storedUnchanged = (await adminPage.content()).includes("UNCHANGED_UPDATE_" + stamp);
      record("ACT-100-p3-member-denied-edit",
        memberRead.status() === 200 && memberEdit.status() === 403 && editInputs === 0 && deniedPost === 403 && adminSees.status() === 200 && storedUnchanged,
        { memberReadStatus: memberRead.status(), memberEditStatus: memberEdit.status(), editInputs, deniedPostStatus: deniedPost, adminViewStatus: adminSees.status(), storedUnchanged });
    } finally {
      await memberBrowser.close().catch(() => {});
      await adminBrowser2.close().catch(() => {});
    }

    // ------------------------------------------------------------------
    // ACT-126: A5 — password reset through the captured mail.
    // Mirrors checks-mail-reset.mjs (the named instrument); the engine's
    // /__harness/mail endpoint is the sink.
    // ------------------------------------------------------------------
    const anonBrowser = await launchBrowser();
    try {
      const page = anonBrowser.context.pages()[0] ?? (await anonBrowser.context.newPage());
      page.setDefaultTimeout(STEP_TIMEOUT);
      await server.mail(); // drain
      await page.goto(base + "/*signin", { waitUntil: "load", timeout: STEP_TIMEOUT });
      const resetHref = await page.locator("a").filter({ hasText: /Reset password/i }).first().getAttribute("href");
      let leg = { resetHref };
      let ok = false;
      if (resetHref) {
        await page.goto(new URL(resetHref, base).href, { waitUntil: "load", timeout: STEP_TIMEOUT });
        const resetForm = page.locator("form.card-form").filter({ has: page.locator("input[name='card[trigger]'][value='send_reset_password_token']") });
        await resetForm.locator("input[name='card[subcards][+*email][content]']").fill(actors.member.email);
        const pending = page.waitForResponse((r) => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: STEP_TIMEOUT }).then((r) => ({ r }), (e) => ({ e }));
        await resetForm.locator("button").filter({ hasText: /^Reset password$/ }).first().click();
        const observed = await pending;
        if (!observed.e) await observed.r.finished();
        const mail = await server.mail();
        const message = mail.filter((m) => m.to === actors.member.email && String(m.subject).startsWith("reset password for")).at(-1);
        const link = message ? /https?:\/\/[^\s"<>]+\/update\/[^\s"<>]+/.exec(String(message.textBody ?? message.text ?? ""))?.[0] : undefined;
        leg = { ...leg, postStatus: observed.e ? null : observed.r.status(), mailMessages: mail.length, mailTo: message?.to, subject: message?.subject, link };
        if (link) {
          const landed = await page.goto(link, { waitUntil: "load", timeout: STEP_TIMEOUT });
          const field = page.locator("form.card-form input[type='password']:visible").first();
          await field.waitFor({ state: "visible", timeout: STEP_TIMEOUT }).catch(() => {});
          const session = (await anonBrowser.context.cookies(base)).some((c) => c.name === "decko_ts_session" && c.value);
          const nextPassword = "Probe reset pass 3#";
          let saved = null;
          if (await field.isVisible().catch(() => false)) {
            await field.fill(nextPassword);
            const savePending = page.waitForResponse((r) => new URL(r.url()).origin === base && r.request().method() === "POST", { timeout: STEP_TIMEOUT }).then((r) => ({ r }), (e) => ({ e }));
            await page.locator("form.card-form").filter({ has: page.locator("input[type='password']:visible") }).locator("button[type='submit'], input[type='submit']").first().click();
            const done = await savePending;
            if (!done.e) { await done.r.finished(); saved = done.r.status(); } else saved = "no-post";
            // old credential refused / new accepted: fresh contexts
            const oldTry = await launchBrowser();
            const newTry = await launchBrowser();
            try {
              const trySignIn = async (browser, password) => {
                const p = browser.context.pages()[0] ?? (await browser.context.newPage());
                p.setDefaultTimeout(STEP_TIMEOUT);
                await p.goto(base + "/*signin", { waitUntil: "load", timeout: STEP_TIMEOUT });
                await p.fill("input[name='card[subcards][+*email][content]']", actors.member.email);
                await p.fill("input[name='card[subcards][+*password][content]']", password);
                const pr = p.waitForResponse((r) => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: STEP_TIMEOUT }).then((r) => ({ r }), (e) => ({ e }));
                await p.locator("form[action='/update/*signin'] button[type='submit']").first().click();
                const observed = await pr;
                if (observed.e) return false;
                await observed.r.finished();
                const landed = await p.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: 8000 }).then(() => true, () => false);
                return landed && observed.r.status() < 400;
              };
              const oldRefused = !(await trySignIn(oldTry, actors.member.password));
              const newAccepted = await trySignIn(newTry, nextPassword);
              leg = { ...leg, landedStatus: landed.status(), resetSession: session, savedStatus: saved, oldRefused, newAccepted };
              ok = landed.status() < 400 && session && saved !== null && saved !== "no-post" && saved < 400 && oldRefused && newAccepted;
            } finally {
              await oldTry.close(); await newTry.close();
            }
          }
        }
      }
      record("ACT-126-a5-password-reset", ok, leg);
    } finally {
      await anonBrowser.close().catch(() => {});
    }

    // ------------------------------------------------------------------
    // ACT-147: F6 — upload a file as a field in a form; update it; submit
    // without updating. Mirrors checks-upload-image-change.mjs's File leg.
    // ------------------------------------------------------------------
    const fileBrowser = await launchBrowser();
    try {
      const page = fileBrowser.context.pages()[0] ?? (await fileBrowser.context.newPage());
      page.setDefaultTimeout(STEP_TIMEOUT);
      await page.goto(base + "/*signin", { waitUntil: "load", timeout: STEP_TIMEOUT });
      await page.fill("input[name='card[subcards][+*email][content]']", actors.admin.email);
      await page.fill("input[name='card[subcards][+*password][content]']", actors.admin.password);
      const pending = page.waitForResponse((r) => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: STEP_TIMEOUT });
      await page.locator("form[action='/update/*signin'] button[type='submit']").first().click();
      const signedIn = await pending;
      await signedIn.finished();
      const name = "HarnessProbeF6_" + Date.now().toString(36);
      const first = "Probe F6 first body.\n";
      const second = "Probe F6 replaced body.\n";
      const upload = (body) => ({ name: "minutes.txt", mimeType: "text/plain", buffer: Buffer.from(body, "utf8") });
      const createResp = await page.goto(base + "/new/File", { waitUntil: "load", timeout: STEP_TIMEOUT });
      const fileInputCount = await page.locator("form.card-form input[type='file']").count();
      let leg = { createFormStatus: createResp.status(), fileInputCount, signInStatus: signedIn.status() };
      let ok = false;
      if (fileInputCount > 0) {
        await page.locator("form.card-form input[name='card[name]']").first().fill(name);
        await page.locator("form.card-form input[type='file']").first().setInputFiles(upload(first));
        await page.waitForFunction(() => {
          const draft = document.querySelector("input[name='card[action_id_of_cached_upload]']");
          return draft !== null && /^\d+$/.test(draft.value);
        }, undefined, { timeout: STEP_TIMEOUT }).catch(() => {});
        const createPending = page.waitForResponse((r) => new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST", { timeout: STEP_TIMEOUT }).then((r) => ({ r }), (e) => ({ e }));
        await page.locator("form.card-form button[type='submit']").first().click({ timeout: 15_000 });
        const created = await createPending;
        if (created.e) throw created.e;
        await created.r.finished();
        await page.goto(base + "/" + name, { waitUntil: "load", timeout: STEP_TIMEOUT });
        const anchor = await page.evaluate(() => {
          const a = [...document.querySelectorAll("#main a[href]")].find((x) => /^\/files\//.test(new URL(x.href, location.href).pathname));
          return a ? new URL(a.href, location.href).pathname : null;
        });
        const servedA = anchor ? await page.request.get(base + anchor) : null;
        // update: replace the upload through the edit form
        await page.goto(base + "/" + name + "?view=edit", { waitUntil: "load", timeout: STEP_TIMEOUT });
        const updateForm = page.locator("form.card-form").filter({ has: page.locator("input[type='file']") }).first();
        const editFileInputs = await updateForm.count();
        let replacedStatus = null;
        let resubmitStatus = null;
        let servedBFirst = null;
        let servedCResubmit = null;
        if (editFileInputs > 0) {
          await updateForm.locator("input[type='file']").first().setInputFiles(upload(second));
          await page.waitForFunction(() => {
            const draft = document.querySelector("input[name='card[action_id_of_cached_upload]']");
            return draft !== null && /^\d+$/.test(draft.value);
          }, undefined, { timeout: STEP_TIMEOUT }).catch(() => {});
          const actionPath = new URL(await updateForm.getAttribute("action"), base).pathname;
          const sub = page.waitForResponse((r) => new URL(r.url()).pathname === actionPath && r.request().method() !== "GET", { timeout: STEP_TIMEOUT }).then((r) => ({ r }), (e) => ({ e }));
          await updateForm.locator("button.submit-button, button[type='submit'], input[type='submit']").first().click({ timeout: 15_000 });
          const done = await sub;
          if (done.e) throw done.e;
          await done.r.finished();
          replacedStatus = done.r.status();
          await page.goto(base + "/" + name, { waitUntil: "load", timeout: STEP_TIMEOUT });
          const anchorB = await page.evaluate(() => {
            const a = [...document.querySelectorAll("#main a[href]")].find((x) => /^\/files\//.test(new URL(x.href, location.href).pathname));
            return a ? new URL(a.href, location.href).pathname : null;
          });
          const rb = anchorB ? await page.request.get(base + anchorB) : null;
          servedBFirst = rb ? (await rb.body()).toString("utf8") : null;
          // resubmit WITHOUT touching the file input
          await page.goto(base + "/" + name + "?view=edit", { waitUntil: "load", timeout: STEP_TIMEOUT });
          const form2 = page.locator("form.card-form").filter({ has: page.locator("input[type='file']") }).first();
          const actionPath2 = new URL(await form2.getAttribute("action"), base).pathname;
          const sub2 = page.waitForResponse((r) => new URL(r.url()).pathname === actionPath2 && r.request().method() !== "GET", { timeout: STEP_TIMEOUT }).then((r) => ({ r }), (e) => ({ e }));
          await form2.locator("button.submit-button, button[type='submit'], input[type='submit']").first().click({ timeout: 15_000 });
          const done2 = await sub2;
          if (done2.e) throw done2.e;
          await done2.r.finished();
          resubmitStatus = done2.r.status();
          await page.goto(base + "/" + name, { waitUntil: "load", timeout: STEP_TIMEOUT });
          const anchorC = await page.evaluate(() => {
            const a = [...document.querySelectorAll("#main a[href]")].find((x) => /^\/files\//.test(new URL(x.href, location.href).pathname));
            return a ? new URL(a.href, location.href).pathname : null;
          });
          const rc = anchorC ? await page.request.get(base + anchorC) : null;
          servedCResubmit = rc ? (await rc.body()).toString("utf8") : null;
        }
        leg = { ...leg, createdStatus: created.r.status(), servedAStatus: servedA?.status() ?? null, servedABody: servedA ? (await servedA.body()).toString("utf8") : null, editFileInputs, replacedStatus, servedAfterReplace: servedBFirst, resubmitStatus, servedAfterResubmit: servedCResubmit };
        ok = leg.servedABody === first && servedBFirst === second && resubmitStatus !== null && resubmitStatus < 400 && servedCResubmit === second;
      }
      record("ACT-147-f6-file-upload-update-resubmit", ok, leg);
    } finally {
      await fileBrowser.close().catch(() => {});
    }
  } finally {
    await server.stop();
  }
  const verdicts = Object.fromEntries(results.map((r) => [r.leg, r.pass]));
  writeFileSync(path.join(out, "probe-results.json"), JSON.stringify(results, null, 2));
  console.log("[probe] verdicts:", JSON.stringify(verdicts));
  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[probe] FATAL ${err?.stack ?? err}`);
  process.exit(1);
});

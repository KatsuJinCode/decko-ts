#!/usr/bin/env node
// Runs browser journeys (user flows written as plain data) against one engine.
//
//   node reference-harness/browser/run-journeys.mjs --engine reference-harness/browser/engines/ruby.json \
//     --fixture reference-harness/fixtures/synthetic-v1 \
//     --journeys reference-harness/browser/journeys/synthetic-v1.json \
//     --out <dir> [--filter <regex>] [--signin form|direct] [--html 1]
//
// --html 1 also saves each observed page's DOM under <out>/<journey id>/.
//
// Every journey runs on a fresh deck copy, a freshly started engine server
// and a fresh hidden browser with a throwaway profile, one at a time. For
// each journey it writes <out>/<id>.json: the steps and their outcome, every
// observation (what the user sees, normalised by lib/observe.mjs), the mail
// sent, and the row delta the journey left in Decko's card tables.

import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import { SNAPSHOT_JS, normalizeObservation } from "./lib/observe.mjs";
import { snapshot, delta } from "../runner/deck-state.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
  for (const k of ["engine", "fixture", "journeys", "out"]) if (!args[k]) throw new Error(`--${k} is required`);
  return args;
}

// A step's wait for its target, its navigation or the page to settle. A cold
// Ruby deck on a loaded machine can take well over 15 s for one page.
const STEP_TIMEOUT = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);

/** Waits until the page has finished loading and jQuery has no request in flight. */
async function settle(page) {
  await page.waitForLoadState("load", { timeout: STEP_TIMEOUT }).catch(() => {});
  const deadline = Date.now() + STEP_TIMEOUT;
  let quiet = 0;
  while (Date.now() < deadline) {
    const busy = await page
      .evaluate(() => (typeof window.jQuery === "function" ? window.jQuery.active : 0) + (document.readyState === "complete" ? 0 : 1))
      .catch(() => 1);
    quiet = busy === 0 ? quiet + 1 : 0;
    if (quiet >= 3) return;
    await page.waitForTimeout(100);
  }
}

const exact = (s) => new RegExp(`^\\s*${String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

/**
 * A link or button by its visible text, as Capybara finds one: an exact match
 * when the page has one, otherwise the first whose text contains it (Decko's
 * buttons often carry an icon's ligature text beside their label, as in
 * "delete Delete").
 */
async function byText(scope, selector, text) {
  const exactMatch = scope.locator(selector).filter({ hasText: exact(text), visible: true });
  if ((await exactMatch.count()) > 0) return exactMatch.first();
  return scope.locator(selector).filter({ hasText: text, visible: true }).first();
}

/** Resolves a target description to a Playwright locator. */
async function locate(page, target) {
  const scope = target.within ? page.locator(target.within).first() : page;
  if (target.css) return scope.locator(target.css).filter({ visible: target.hidden ? undefined : true }).first();
  if (target.link) return byText(scope, "a", target.link);
  if (target.button) {
    const submit = scope.locator(`input[type=submit][value="${target.button}"]`).filter({ visible: true });
    if ((await submit.count()) > 0) return submit.first();
    return byText(scope, "button, input[type=button], a.btn", target.button);
  }
  if (target.name) {
    const named = scope.locator(`[name="${target.name}"]:not([type=hidden])`);
    return (target.hidden ? named : named.filter({ visible: true })).first();
  }
  // A Decko field by its card name, as Decko's own steps address it:
  // ".RIGHT-<safe key> input.d0-card-content".
  // The safe key of "*email" is "Xemail": the key, lower case, with "*" as "X".
  if (target.field) {
    const safeKey = target.field.toLowerCase().replace(/\s+/g, "_").replace(/\*/g, "X");
    return scope.locator(`.RIGHT-${safeKey} input.d0-card-content, .RIGHT-${safeKey} textarea.d0-card-content`).first();
  }
  if (target.text) return scope.getByText(target.text, { exact: false }).first();
  throw new Error(`no target in ${JSON.stringify(target)}`);
}

/** Sets an editor's content the way Decko's own steps do: ace, then TinyMCE, then the plain field. */
async function setEditor(page, name, value) {
  await settle(page);
  const done = await page.evaluate(
    ([n, v]) => {
      // A form can carry a hidden field of the same name beside the editor.
      const all = [...document.querySelectorAll(`textarea[name="${n}"], input[name="${n}"]:not([type=hidden])`)];
      const ta = all.find((e) => e.tagName === "TEXTAREA") ?? all[0];
      if (!ta) return "missing";
      if (window.tinyMCE && ta.id && window.tinyMCE.get(ta.id)) {
        window.tinyMCE.get(ta.id).setContent(v);
        window.tinyMCE.get(ta.id).save();
        return "tinymce";
      }
      const aceBox = ta.closest(".card-editor, form")?.querySelector(".ace_editor");
      if (window.ace && aceBox && ta.classList.contains("ace-editor-textarea")) {
        window.ace.edit(aceBox).getSession().setValue(v);
        return "ace";
      }
      return "plain";
    },
    [name, value],
  );
  if (done === "missing") throw new Error(`no editor named ${name}`);
  if (done === "plain") await page.locator(`[name="${name}"]:not([type=hidden])`).filter({ visible: true }).first().fill(value);
}

async function runStep(ctx, step) {
  const { page, fixtureDir, actors } = ctx;
  const [kind] = Object.keys(step).filter((k) => k !== "note");
  const arg = step[kind];
  switch (kind) {
    case "visit":
      await page.goto(ctx.base + arg, { waitUntil: "load", timeout: STEP_TIMEOUT });
      break;
    case "signin": {
      const a = actors[arg];
      if (!a?.email) throw new Error(`actor ${arg} has no account`);
      if (ctx.signinMode === "direct") {
        // Decko's sign-in request itself, as the form would send it, without
        // the form: lets the rest of a journey run on an engine whose sign-in
        // page differs.
        await page.request.post(ctx.base + "/update/*signin", {
          form: {
            "card[subcards][+*email][content]": a.email,
            "card[subcards][+*password][content]": a.password,
          },
          maxRedirects: 0,
        });
        await page.goto(ctx.base + "/", { waitUntil: "load", timeout: STEP_TIMEOUT });
        break;
      }
      await page.goto(ctx.base + "/*signin", { waitUntil: "load", timeout: STEP_TIMEOUT });
      await (await locate(page, { field: "*email" })).fill(a.email, { timeout: STEP_TIMEOUT });
      await (await locate(page, { field: "*password" })).fill(a.password, { timeout: STEP_TIMEOUT });
      await (await locate(page, { button: "Sign in" })).click({ timeout: STEP_TIMEOUT });
      break;
    }
    case "click":
      await (await locate(page, arg)).click({ timeout: STEP_TIMEOUT });
      break;
    case "fill":
      await (await locate(page, arg)).fill(String(step.value), { timeout: STEP_TIMEOUT });
      break;
    case "type":
      await (await locate(page, arg)).pressSequentially(String(step.value), { timeout: STEP_TIMEOUT });
      break;
    case "editor":
      await setEditor(page, arg, String(step.value));
      break;
    case "check":
      await (await locate(page, arg)).check({ timeout: STEP_TIMEOUT });
      break;
    case "uncheck":
      await (await locate(page, arg)).uncheck({ timeout: STEP_TIMEOUT });
      break;
    case "select":
      await (await locate(page, { ...arg, hidden: true })).selectOption({ label: step.option }, { timeout: STEP_TIMEOUT });
      break;
    case "upload":
      // Upload files live beside the journeys (browser/files/), not in the fixture.
      await (await locate(page, { ...arg, hidden: true })).setInputFiles(path.join(ctx.filesDir, step.file), { timeout: STEP_TIMEOUT });
      break;
    case "window": {
      // A second window of the same browser (same cookies), as a user opening a tab.
      if (!ctx.windows[arg]) {
        const p = await page.context().newPage();
        p.on("dialog", (d) => d.accept().catch(() => {}));
        ctx.windows[arg] = p;
      }
      ctx.page = ctx.windows[arg];
      return;
    }
    case "close_window": {
      await ctx.windows[arg].close();
      delete ctx.windows[arg];
      ctx.page = ctx.windows.main;
      return;
    }
    case "mail_link": {
      // Follows a link from the most recent mail matching `subject`, as a user
      // clicking it in their inbox. The deck's own origin is mapped to the server.
      ctx.mailSeen.push(...(await ctx.mail()));
      const re = new RegExp(arg.subject);
      const m = [...ctx.mailSeen].reverse().find((x) => re.test(x.subject));
      if (!m) throw new Error(`no mail with subject ${arg.subject}`);
      const links = String(m.text).match(/https?:\/\/[^\s"<>)\]]+/g) ?? [];
      const link = links.find((l) => !arg.contains || l.includes(arg.contains));
      if (!link) throw new Error(`no link in mail "${m.subject}"`);
      const u = new URL(link);
      await page.goto(ctx.base + u.pathname + u.search, { waitUntil: "load", timeout: STEP_TIMEOUT });
      break;
    }
    case "press":
      await page.keyboard.press(arg);
      break;
    case "wait":
      if (arg.text) await page.getByText(arg.text).first().waitFor({ timeout: STEP_TIMEOUT });
      else await page.locator(arg.css).first().waitFor({ timeout: STEP_TIMEOUT });
      break;
    case "observe": {
      await settle(page);
      const raw = await page.evaluate(SNAPSHOT_JS);
      ctx.observations.push({ label: arg, ...normalizeObservation({ ...raw, url: page.url(), status: ctx.lastStatus }) });
      if (ctx.htmlDir) {
        // The page's DOM as the user saw it, for diagnosing a difference.
        mkdirSync(ctx.htmlDir, { recursive: true });
        const file = `${String(ctx.observations.length).padStart(2, "0")}-${arg.replace(/[^A-Za-z0-9]+/g, "-")}.html`;
        writeFileSync(path.join(ctx.htmlDir, file), await page.content());
      }
      return;
    }
    default:
      throw new Error(`unknown step ${kind}`);
  }
  await settle(page);
}

// Values a save draws at random: password digests and salts (Ruby's hex
// digest, bcrypt, and the port's PBKDF2 envelope).
function maskRows(rows) {
  const mask = (v) =>
    (typeof v === "string" && (/^[0-9a-f]{32,}$/i.test(v) || /^\$2[aby]\$/.test(v) || /^pbkdf2_sha256\$/.test(v))
      ? "<digest>"
      : v);
  const TIME = new Set(["created_at", "updated_at", "acted_at"]);
  const fix = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, TIME.has(k) ? "<time>" : mask(v)]));
  const out = {};
  for (const [table, d] of Object.entries(rows)) {
    const updated = d.updated
      .map((u) => ({
        id: u.id,
        changes: Object.fromEntries(
          Object.entries(u.changes)
            .filter(([k]) => !TIME.has(k))
            .map(([k, [a, b]]) => [k, [mask(a), mask(b)]])
            .filter(([, [a, b]]) => String(a) !== String(b)),
        ),
      }))
      .filter((u) => Object.keys(u.changes).length > 0);
    const t = { inserted: d.inserted.map(fix), updated, deleted: d.deleted.map(fix) };
    if (t.inserted.length || t.updated.length || t.deleted.length) out[table] = t;
  }
  return out;
}

async function runJourney(engine, args, journey, spec, logFile) {
  const result = { id: journey.id, engine: engine.name, steps: [], observations: [], completed: false };
  const server = await startEngine(engine, args.fixture, { logFile });
  let browser;
  try {
    const before = snapshot(server.db);
    await server.mail(); // drain anything the boot sent
    browser = await launchBrowser();
    const page = browser.context.pages()[0] ?? (await browser.context.newPage());
    page.setDefaultTimeout(STEP_TIMEOUT);
    const ctx = {
      page,
      windows: { main: page },
      base: server.base,
      fixtureDir: args.fixture,
      filesDir: path.join(path.dirname(path.resolve(args.journeys)), "..", "files"),
      actors: spec.actors,
      observations: result.observations,
      lastStatus: null,
      signinMode: args.signin ?? "form",
      mail: server.mail,
      mailSeen: [],
      htmlDir: args.html === "1" ? path.join(args.out, journey.id) : null,
    };
    // The HTTP status of the last page load in any window.
    browser.context.on("response", (r) => {
      if (r.request().isNavigationRequest() && r.frame() === r.frame().page().mainFrame()) ctx.lastStatus = r.status();
    });
    page.on("dialog", (d) => d.accept().catch(() => {}));
    let failed = false;
    for (const [i, step] of journey.steps.entries()) {
      if (failed) {
        result.steps.push({ i, step, outcome: "skipped" });
        continue;
      }
      try {
        await runStep(ctx, step);
        result.steps.push({ i, step, outcome: "ok" });
      } catch (err) {
        failed = true;
        result.steps.push({ i, step, outcome: "failed", error: String(err?.message ?? err).split("\n")[0] });
        // What the user was looking at when the step failed.
        try {
          await runStep(ctx, { observe: `failed at step ${i}` });
        } catch {
          /* page gone */
        }
      }
    }
    result.completed = !failed;
    result.mail = [...ctx.mailSeen, ...(await server.mail())].map((m) => ({
      to: m.to,
      subject: m.subject,
      text: String(m.text ?? "").replace(/[ \t]+$/gm, "").replace(/\r\n/g, "\n").trim(),
    }));
    await browser.close();
    browser = undefined;
    // The row delta is read after the browser is gone and the last request answered.
    result.rows = maskRows(delta(before, snapshot(server.db)));
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.stop();
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const engine = loadEngine(args.engine);
const spec = JSON.parse(readFileSync(path.join(args.fixture, "deck.json"), "utf8"));
const { journeys } = JSON.parse(readFileSync(args.journeys, "utf8"));
const filter = args.filter ? new RegExp(args.filter) : null;
mkdirSync(args.out, { recursive: true });
const logFile = path.join(args.out, "server.log");
writeFileSync(logFile, "");
const summary = [];
for (const journey of journeys) {
  if (filter && !filter.test(journey.id)) continue;
  const t0 = Date.now();
  let result;
  try {
    result = await runJourney(engine, args, journey, spec, logFile);
  } catch (err) {
    result = { id: journey.id, engine: engine.name, error: String(err?.message ?? err), completed: false, steps: [], observations: [] };
  }
  result.ms = Date.now() - t0;
  writeFileSync(path.join(args.out, `${journey.id}.json`), JSON.stringify(result, null, 1));
  const failedStep = result.steps.find((s) => s.outcome === "failed");
  const line = `${result.completed ? "ok  " : "FAIL"} ${journey.id} (${result.ms} ms)${failedStep ? ` step ${failedStep.i}: ${failedStep.error}` : ""}${result.error ? ` ${result.error}` : ""}`;
  console.log(line);
  appendFileSync(path.join(args.out, "progress.txt"), line + "\n");
  summary.push({ id: journey.id, completed: result.completed, ms: result.ms });
}
writeFileSync(path.join(args.out, "run-meta.json"), JSON.stringify({ engine: engine.name, fixture: path.basename(args.fixture), journeys: summary }, null, 1));

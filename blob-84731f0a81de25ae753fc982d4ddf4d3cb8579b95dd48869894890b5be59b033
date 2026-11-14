// Walks one journey list against ONE pre-running base URL (or one engine
// manifest + fixture), capturing for every journey:
//   - every same-origin HTTP exchange (method, url, status, request headers,
//     response headers incl. each Set-Cookie separately, full body) — the
//     byte-level evidence;
//   - a full-page screenshot at every visit, signin, click and observe step
//     (and at the page a failed step left the browser on) — the pixel
//     evidence;
//   - the steps' outcomes.
// The step executor is ported from reference-harness/browser/run-journeys.mjs
// (settle/locate/byText/setEditor/assertSignedIn) so a journey means the same
// thing here as it does in the browser-journeys instrument; the differences
// are this instrument's: raw bodies instead of normalized observations, and
// screenshots instead of DOM snapshots.
//
// SAFETY (the point of the gate): the harness may only put traffic on the
// machine's loopback. assertWalkableBase refuses every other hostname unless
// that exact hostname was passed to --allow-live-walk on this run's command
// line — a decision that belongs to the operator, in the open, once per host.
// The browser's route guard below is the second lock: it refuses every
// navigation this run did not name, so a walked page cannot send the browser
// to a third host (the stock layout CDNs excepted, as the sibling
// browser/lib/launch.mjs allows; HARNESS_OFFLINE=1 refuses those too).

import path from "node:path";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { launchBrowser } from "../../browser/lib/launch.mjs";
import { editorReady, richEditorsReady } from "../../browser/lib/editor-ready.mjs";
import { bodyKindFor, redactForStorage } from "./normalize-exchange.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
// Paths this harness itself drives (mail drain, readiness). They are
// machinery, not site behavior; the comparison excludes them by a named rule
// in the report, never by silence.
export const HARNESS_PATH_PREFIXES = ["/__harness/", "/_mail-log"];

export function isLoopbackUrl(urlString) {
  try {
    const url = new URL(urlString);
    return (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/** The gate. Every base URL passes through here before a single request is
 *  sent. A non-loopback host is refused unless it is named, exactly, in
 *  allowLiveWalk — the operator's explicit per-host yes. */
export function assertWalkableBase(urlString, allowLiveWalk, label) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`${label}: not a URL: ${urlString}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${label}: only http/https base URLs are walked, got ${url.protocol}`);
  if (LOOPBACK_HOSTS.has(url.hostname)) return url.origin;
  if ((allowLiveWalk ?? []).includes(url.hostname)) return url.origin;
  throw new Error(
    `${label}: refusing to walk non-local host "${url.hostname}" (${url.origin}). ` +
    `This harness sends real traffic. If — and only if — the operator has said go for this host in this run's scope, ` +
    `pass --allow-live-walk ${url.hostname} to accept it explicitly.`,
  );
}

/** The walk's browser: the sibling launcher, with a route guard naming the
 *  walk's own hosts (both sides) besides the loopback and the stock CDNs. */
export async function launchWalkBrowser({ allowedHostnames, offline }) {
  const browser = await launchBrowser({ viewport: { width: 1280, height: 900 } });
  const allow = new Set([...(allowedHostnames ?? []), ...LOOPBACK_HOSTS]);
  const stockCdnNames = new Set(["code.jquery.com", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com", "kit.fontawesome.com", "ka-f.fontawesome.com", "www.google.com", "www.gstatic.com", "recaptcha.google.com"]);
  const guardHosts = offline ? allow : new Set([...allow, ...stockCdnNames]);
  await browser.context.route(
    (url) => /^(https?|wss?):$/.test(url.protocol) && !guardHosts.has(url.hostname),
    (route) => route.abort("blockedbyclient"),
  );
  return browser;
}

const STEP_TIMEOUT = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);

/** Waits until the page has finished loading and jQuery has no request in
 *  flight (ported from run-journeys.mjs settle). */
async function settle(page) {
  await page.waitForLoadState("load", { timeout: STEP_TIMEOUT }).catch(() => {});
  const deadline = Date.now() + STEP_TIMEOUT;
  let quiet = 0;
  while (Date.now() < deadline) {
    const busy = await page
      .evaluate(() => (typeof window.jQuery === "function" ? window.jQuery.active : 0) + (document.readyState === "complete" ? 0 : 1))
      .catch(() => 1);
    quiet = busy === 0 ? quiet + 1 : 0;
    if (quiet >= 3) {
      if (process.env.HARNESS_EDITOR_SETTLE === "1") {
        await page.waitForFunction(richEditorsReady, null, { timeout: STEP_TIMEOUT });
      }
      await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: STEP_TIMEOUT }).catch(() => {});
      return;
    }
    await page.waitForTimeout(100);
  }
}

const exact = (s) => new RegExp(`^\\s*${String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

async function byText(scope, selector, text) {
  const exactMatch = scope.locator(selector).filter({ hasText: exact(text), visible: true });
  if ((await exactMatch.count()) > 0) return exactMatch.first();
  return scope.locator(selector).filter({ hasText: text, visible: true }).first();
}

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
  if (target.field) {
    const safeKey = target.field.toLowerCase().replace(/\s+/g, "_").replace(/\*/g, "X");
    return scope.locator(`.RIGHT-${safeKey} input.d0-card-content, .RIGHT-${safeKey} textarea.d0-card-content`).first();
  }
  if (target.text) return scope.getByText(target.text, { exact: false }).first();
  throw new Error(`no target in ${JSON.stringify(target)}`);
}

async function setEditor(page, name, value) {
  await settle(page);
  if (process.env.HARNESS_EDITOR_SETTLE === "1") {
    await page.waitForFunction(editorReady, [name], { timeout: STEP_TIMEOUT });
  }
  const done = await page.evaluate(
    ([n, v]) => {
      const all = [...document.querySelectorAll(`textarea[name="${n}"], input[name="${n}"]:not([type=hidden])`)];
      const ta = all.find((e) => e.tagName === "TEXTAREA") ?? all[0];
      if (!ta) return "missing";
      if (window.tinyMCE && ta.id && window.tinyMCE.get(ta.id)) {
        const editor = window.tinyMCE.get(ta.id);
        if (!editor.initialized || !editor.getBody()) return "uninitialized";
        editor.setContent(v);
        editor.save();
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
  if (done === "uninitialized") throw new Error(`rich editor ${name} is not initialized`);
  if (done === "plain") await page.locator(`[name="${name}"]:not([type=hidden])`).filter({ visible: true }).first().fill(value);
  return done;
}

async function assertSignedIn(page, label, actor) {
  const link = page.locator("a.signout-link").first();
  try {
    await link.waitFor({ state: "attached", timeout: STEP_TIMEOUT });
  } catch {
    throw new Error(`sign-in as ${label} (${actor.card ?? actor.email}) did not take: no Sign out link at ${page.url()}`);
  }
}

const safeFilePart = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "unnamed";

// Exchange redaction does not cover the journey's step/error metadata. Keep
// execution inputs intact and redact only the copies returned for storage.
export function stepTargetsCredentialField(step) {
  const kind = Object.keys(step ?? {}).filter((k) => k !== "note" && k !== "value" && k !== "option" && k !== "file" && k !== "within" && k !== "hidden")[0];
  if (!["fill", "type", "editor"].includes(kind)) return false;
  const target = step[kind];
  if (!target || typeof target !== "object") return false;
  return Object.values(target).some((v) => typeof v === "string" && /password|passwort|passphrase|passcode|token|secret|credential|api[-_ ]?key|one[-_ ]?time/i.test(v));
}

function traceRedactor(actors, journey) {
  const credential = /password|passwort|passphrase|passcode|token|secret|credential|api[-_ ]?key|one[-_ ]?time/i;
  const secrets = new Set();
  const remember = (value) => { if (typeof value === "string" && value.length) secrets.add(value); };
  const collect = (object) => {
    if (!object || typeof object !== "object") return;
    for (const [key, value] of Object.entries(object)) {
      if (credential.test(key)) remember(value);
      collect(value);
    }
  };
  collect(actors);
  for (const step of journey.steps) {
    const target = step.fill ?? step.type ?? step.editor;
    if (target !== undefined && credential.test(JSON.stringify(target))) remember(step.value);
  }
  const text = (value) => {
    if (value === "R1#redacted" || !secrets.size) return value;
    const escaped = [...secrets].sort((a, b) => b.length - a.length)
      .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return value.replace(new RegExp(escaped.join("|"), "g"), "R1#redacted");
  };
  const scrub = (value) => {
    if (typeof value === "string") return text(value);
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)]));
    return value;
  };
  return {
    text, scrub,
    async step(step, page) {
      const target = step.fill ?? step.type ?? (step.editor !== undefined ? (typeof step.editor === "object" ? step.editor : { name: step.editor }) : undefined);
      if (target !== undefined && typeof step.value === "string") {
        let sensitive = credential.test(JSON.stringify(target));
        if (!sensitive) {
          try {
            const control = await locate(page, target);
            // A failed/skipped step may have no live field to classify. Its
            // unexecuted value must not become a credential leak by default.
            sensitive = await control.count() !== 1 || await control.evaluate(el =>
              /password|passwort|passphrase|passcode|token|secret|credential|api[-_ ]?key|one[-_ ]?time/i.test(
                [el.type, el.name, el.id, el.autocomplete].join(" ")));
          } catch { sensitive = true; }
        }
        if (sensitive) remember(step.value);
      }
      return scrub(step);
    },
  };
}

/** Exchange capture for one browser context. Response bodies are read
 *  asynchronously and drained by drain(); every read failure is recorded on
 *  the exchange, never swallowed. writeEvidence writes each body under
 *  <dir>/ and an exchanges.jsonl of metas (bodies by file, redaction R1
 *  already applied), then strips the raw buffers from memory. */
function attachExchangeCapture({ context, origin, extraSessionNames }) {
  const exchanges = [];
  const pending = [];
  let seq = 0;
  const listener = (response) => {
    const request = response.request();
    const mySeq = ++seq;
    const url = response.url();
    let sameOrigin = false;
    try { sameOrigin = new URL(url).origin === origin; } catch { /* stays third-party */ }
    const record = {
      seq: mySeq,
      url,
      method: request.method(),
      status: response.status(),
      resourceType: request.resourceType(),
      navigation: request.isNavigationRequest(),
      sameOrigin,
      thirdParty: !sameOrigin,
      fromCache: response.fromCache?.() ?? null,
      fromServiceWorker: response.fromServiceWorker?.() ?? null,
      requestHeaders: {},
      headersArray: null,
      setCookieRaw: [],
      bodyKind: null,
      bodyFile: null,
      bodyBytes: null,
      bodySha256: null,
      bodyText: null,
      bodyError: null,
      postData: null,
    };
    exchanges.push(record);
    pending.push(
      (async () => {
        try { record.requestHeaders = await request.allHeaders(); } catch (err) { record.requestHeaders = request.headers(); record.requestHeadersError = String(err?.message ?? err); }
        try {
          const arr = await response.headersArray();
          record.headersArray = arr.filter((h) => h.name.toLowerCase() !== "set-cookie");
          record.setCookieRaw = arr.filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
        } catch (err) { record.headersError = String(err?.message ?? err); }
        try { record.postData = request.postData(); } catch { /* no body or unavailable */ }
        try {
          const body = await response.body();
          record.bodyBytes = body;
          record.bodySha256 = createHash("sha256").update(body).digest("hex");
          const contentType = record.headersArray?.find((h) => h.name.toLowerCase() === "content-type")?.value ?? response.headers()["content-type"] ?? "";
          record.bodyKind = bodyKindFor(contentType);
          if (record.bodyKind !== "binary") record.bodyText = body.toString("utf8");
        } catch (err) {
          record.bodyError = String(err?.message ?? err);
        }
        // R1: redact before anything is stored. The record keeps bodyBytes in
        // memory until writeEvidence; the JSONL and every serialized form
        // carry metas only.
        Object.assign(record, redactForStorage(record, extraSessionNames));
      })(),
    );
  };
  context.on("response", listener);
  return {
    exchanges,
    addExchange(record) {
      exchanges.push(record);
      pending.push(Promise.resolve(Object.assign(record, redactForStorage(record, extraSessionNames))));
    },
    drain: async () => { await Promise.allSettled([...pending]); pending.length = 0; },
    detach: () => context.off("response", listener),
    writeEvidence(dir) {
      mkdirSync(dir, { recursive: true });
      const metas = [];
      for (const ex of exchanges) {
        if (ex.bodyBytes) {
          const file = `${String(ex.seq).padStart(4, "0")}-${safeFilePart(`${ex.method}-${ex.url}`)}.body`;
          writeFileSync(path.join(dir, file), ex.bodyBytes);
          ex.bodyFile = file;
        }
        metas.push({ ...ex, bodyBytes: undefined, bodyText: undefined });
      }
      writeFileSync(path.join(dir, "exchanges.jsonl"), metas.map((m) => JSON.stringify(m)).join("\n") + "\n");
      for (const ex of exchanges) delete ex.bodyBytes; // bytes live in the evidence file now
      return metas;
    },
  };
}

/** Walks one journey against one base. Returns the side's journey record;
 *  `exchangesInMemory` carries bodyText for the in-process comparison. */
export async function walkJourney({ base, journey, actors, outDir, browserFactory, label, side, mailFn, restartFn, filesDir }) {
  const redaction = traceRedactor(actors, journey);
  const result = {
    id: journey.id, side, label, base, startedAt: new Date().toISOString(),
    steps: [], completed: false, screenshots: [], mail: [], error: null,
  };
  const shotDir = path.join(outDir, side, journey.id, "shots");
  const exDir = path.join(outDir, side, journey.id, "exchanges");
  let browser;
  let captures = [];
  try {
    browser = await browserFactory();
    result.browserVersion = browser.version;
    let capture = attachExchangeCapture({ context: browser.context, origin: new URL(base).origin, extraSessionNames: [] });
    captures = [capture];
    let page = browser.context.pages()[0] ?? (await browser.context.newPage());
    page.setDefaultTimeout(STEP_TIMEOUT);
    const ctx = {
      page,
      windows: { main: page },
      base,
      filesDir,
      actors,
      signinMode: journey.signinMode ?? "form",
      mail: mailFn,
      restart: restartFn,
      mailSeen: [],
      lastStatus: null,
      captureExchange: (record) => capture.addExchange(record),
      screenshot: async (name) => {
        name = redaction.text(String(name));
        const n = result.screenshots.length + 1;
        const file = `${String(n).padStart(2, "0")}-${safeFilePart(name)}.png`;
        mkdirSync(shotDir, { recursive: true });
        await ctx.page.screenshot({ path: path.join(shotDir, file), fullPage: true, type: "png" });
        result.screenshots.push({ step: result.steps.length, name, file, url: redaction.text(ctx.page.url()) });
      },
    };
    ctx.freshSession = async () => {
      await Promise.allSettled(captures.map((c) => c.drain()));
      await browser.close();
      browser = await browserFactory();
      capture = attachExchangeCapture({ context: browser.context, origin: new URL(base).origin, extraSessionNames: [] });
      captures.push(capture);
      page = browser.context.pages()[0] ?? (await browser.context.newPage());
      page.setDefaultTimeout(STEP_TIMEOUT);
      page.on("dialog", (d) => d.accept().catch(() => {}));
      browser.context.on("response", (r) => {
        if (r.request().isNavigationRequest() && r.frame() === r.frame().page().mainFrame()) ctx.lastStatus = r.status();
      });
      ctx.page = page;
      ctx.windows = { main: page };
    };
    browser.context.on("response", (r) => {
      if (r.request().isNavigationRequest() && r.frame() === r.frame().page().mainFrame()) ctx.lastStatus = r.status();
    });
    page.on("dialog", (d) => d.accept().catch(() => {}));
    if (mailFn) {
      try { ctx.mailSeen.push(...(await mailFn())); } catch (err) { result.error = `mail drain failed: ${err.message}`; }
    }
    let failed = false;
    for (const [i, step] of journey.steps.entries()) {
      const storedStep = await redaction.step(step, ctx.page);
      if (failed) { result.steps.push({ i, step: storedStep, outcome: "skipped" }); continue; }
      const stepStarted = Date.now();
      try {
        await runStep(ctx, step);
        await settle(ctx.page);
        await Promise.allSettled(captures.map((c) => c.drain()));
        const kind = Object.keys(step).filter((k) => k !== "note" && k !== "value" && k !== "option" && k !== "file" && k !== "within" && k !== "hidden")[0];
        if (step.observe !== undefined || step.screenshot !== undefined || ["visit", "signin", "click", "mail_link"].includes(kind)) {
          await ctx.screenshot(step.observe ?? step.screenshot ?? `step-${i}`);
        }
        result.steps.push({ i, step: storedStep, outcome: "ok", ms: Date.now() - stepStarted });
      } catch (err) {
        failed = true;
        result.steps.push({ i, step: storedStep, outcome: "failed", ms: Date.now() - stepStarted, error: redaction.text(String(err?.message ?? err).split("\n")[0]) });
        try { await ctx.screenshot(`failed-at-step-${i}`); } catch { /* page gone */ }
      }
    }
    result.completed = !failed;
    await Promise.allSettled(captures.map((c) => c.drain()));
    if (mailFn) {
      try { ctx.mailSeen.push(...(await mailFn())); } catch (err) { result.error = `mail observation failed: ${err.message}`; result.completed = false; }
    }
    result.mail = ctx.mailSeen.map((m) => ({ to: m.to, subject: m.subject, text: String(m.text ?? "").replace(/[ \t]+$/gm, "").replace(/\r\n/g, "\n").trim() }));
    const metas = [];
    for (const c of captures) {
      c.detach();
      metas.push(...c.writeEvidence(exDir));
    }
    result.exchanges = metas;
    result.exchangesInMemory = captures.flatMap((c) => c.exchanges);
    await browser.close();
    browser = null;
  } catch (err) {
    result.error = String(err?.message ?? err);
    result.completed = false;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  // Later skipped steps can introduce a credential also present in an earlier
  // error. Re-scrub metadata with the final set, without changing verdicts or
  // exchange bodies used by the comparison.
  result.steps = result.steps.map(entry => ({ ...entry, step: redaction.scrub(entry.step), ...(entry.error !== undefined ? { error: redaction.text(entry.error) } : {}) }));
  if (result.error !== null) result.error = redaction.text(result.error);
  return result;
}

async function runStep(ctx, step) {
  const { page, actors } = ctx;
  const [kind] = Object.keys(step).filter((k) => k !== "note" && k !== "value" && k !== "option" && k !== "file" && k !== "within" && k !== "hidden");
  const arg = step[kind];
  switch (kind) {
    case "fresh_session":
      await ctx.freshSession();
      return;
    case "restart":
      if (!ctx.restart) throw new Error("restart needs engine mode (an engine manifest), not a bare base URL");
      ctx.mailSeen.push(...(await ctx.mail()));
      await ctx.restart();
      return;
    case "assert": {
      if (arg.signedIn !== undefined) {
        const signedIn = await page.locator("a.signout-link").first().isVisible();
        if (signedIn !== arg.signedIn) throw new Error(`expected signedIn=${arg.signedIn}, observed ${signedIn}`);
        if (!arg.signedIn && !(await (await locate(page, { field: "*password" })).isVisible())) {
          throw new Error("credential refusal did not leave a visible sign-in password field");
        }
      } else {
        const field = await locate(page, arg);
        if (arg.checked !== undefined) {
          const checked = await field.isChecked({ timeout: STEP_TIMEOUT });
          if (checked !== arg.checked) throw new Error(`expected checkbox checked=${arg.checked}, observed ${checked}`);
          return;
        }
        const actual = await field.inputValue({ timeout: STEP_TIMEOUT });
        if (arg.value !== undefined && actual !== String(arg.value)) throw new Error(`field value differs: expected ${JSON.stringify(arg.value)}, observed ${JSON.stringify(actual)}`);
        if (arg.contains !== undefined && !actual.includes(String(arg.contains))) throw new Error("persisted editor does not contain the expected content");
      }
      return;
    }
    case "visit":
      await page.goto(ctx.base + arg, { waitUntil: "load", timeout: STEP_TIMEOUT });
      break;
    case "signin": {
      const a = actors?.[arg];
      if (!a?.email) throw new Error(`actor ${arg} has no account (the journey list's actors block, --actors-json, or the fixture's deck.json)`);
      if (ctx.signinMode === "direct") {
        const resp = await page.request.post(ctx.base + "/update/*signin", {
          form: { "card[subcards][+*email][content]": a.email, "card[subcards][+*password][content]": a.password },
          maxRedirects: 0,
        });
        // The direct sign-in's own exchange, captured by hand (the API
        // context does not fire page response events). R1 applies to it like
        // to any other exchange.
        const arr = await resp.headersArray();
        ctx.captureExchange({
          seq: null, url: ctx.base + "/update/*signin", method: "POST", status: resp.status(),
          resourceType: "fetch", navigation: true, sameOrigin: true, thirdParty: false,
          fromCache: false, fromServiceWorker: false,
          requestHeaders: {},
          headersArray: arr.filter((h) => h.name.toLowerCase() !== "set-cookie"),
          setCookieRaw: arr.filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value),
          bodyKind: "text",
          bodyBytes: Buffer.from(await resp.body()),
          bodyText: await resp.text(),
          bodyError: null,
          postData: `card[subcards][+*email][content]=${encodeURIComponent(a.email)}&card[subcards][+*password][content]=R1%23redacted`,
        });
        await page.goto(ctx.base + "/", { waitUntil: "load", timeout: STEP_TIMEOUT });
        await assertSignedIn(page, arg, a);
        break;
      }
      await page.goto(ctx.base + "/*signin", { waitUntil: "load", timeout: STEP_TIMEOUT });
      await (await locate(page, { field: "*email" })).fill(a.email, { timeout: STEP_TIMEOUT });
      await (await locate(page, { field: "*password" })).fill(a.password, { timeout: STEP_TIMEOUT });
      await (await locate(page, { button: "Sign in" })).click({ timeout: STEP_TIMEOUT });
      await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: STEP_TIMEOUT }).catch(() => {});
      await assertSignedIn(page, arg, a);
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
      return;
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
      await (await locate(page, { ...arg, hidden: true })).setInputFiles(path.join(ctx.filesDir, step.file), { timeout: STEP_TIMEOUT });
      return;
    case "window": {
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
      if (!ctx.mail) throw new Error("mail_link needs engine mode (the harness mail drain); on a bare base URL, visit the link with a visit step instead");
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
      return;
    case "wait":
      if (arg.text) await page.getByText(arg.text).first().waitFor({ timeout: STEP_TIMEOUT });
      else await page.locator(arg.css).first().waitFor({ timeout: STEP_TIMEOUT });
      return;
    case "observe":
      return;
    default:
      throw new Error(`unknown step ${kind}`);
  }
}

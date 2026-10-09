// The browser side of the Capybara driver in playwright_driver.rb.
//
// One JSON request per line on stdin ({id, cmd, ...}), one JSON answer per
// line on stdout ({id, ok, result} or {id, ok:false, error:{class, message}}).
// It holds one hidden browser with a throwaway profile, its windows, the
// current frame, and a table of element handles the Ruby side refers to by id.

import fs from "node:fs";
import readline from "node:readline";
import { launchBrowser } from "../lib/launch.mjs";

const KEY_NAMES = {
  return: "Enter", enter: "Enter", tab: "Tab", escape: "Escape", backspace: "Backspace",
  delete: "Delete", space: " ", up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft",
  right: "ArrowRight", home: "Home", end: "End", page_up: "PageUp", page_down: "PageDown",
  shift: "Shift", control: "Control", ctrl: "Control", alt: "Alt", meta: "Meta", command: "Meta",
};

const { context, close } = await launchBrowser();
context.setDefaultTimeout(5000);
context.setDefaultNavigationTimeout(60000);
const windows = []; // [{ handle, page }]
let windowSeq = 0;
let current = null; // { handle, page }
let frame = null; // current Frame
const elements = new Map();
let elementSeq = 0;

function register(page) {
  const w = { handle: `window-${++windowSeq}`, page };
  windows.push(w);
  page.on("dialog", (d) => d.accept().catch(() => {}));
  if (process.env.HARNESS_BROWSER_DEBUG) {
    page.on("console", (m) => process.stderr.write(`console.${m.type()}: ${m.text()}\n`));
    page.on("pageerror", (e) => process.stderr.write(`pageerror: ${e.message}\n`));
    page.on("requestfailed", (r) => process.stderr.write(`requestfailed: ${r.method()} ${r.url()} ${r.failure()?.errorText}\n`));
    page.on("response", (r) => r.status() >= 400 && process.stderr.write(`http ${r.status()}: ${r.request().method()} ${r.url()}\n`));
  }
  page.on("close", () => {
    const i = windows.indexOf(w);
    if (i >= 0) windows.splice(i, 1);
  });
  return w;
}
context.on("page", (page) => {
  if (!windows.some((w) => w.page === page)) register(page);
});
for (const p of context.pages()) register(p);
if (!windows.length) register(await context.newPage());
current = windows[0];
frame = current.page.mainFrame();

class Stale extends Error {
  constructor(message) {
    super(message);
    this.name = "StaleElement";
  }
}

function el(id) {
  const h = elements.get(id);
  if (!h) throw new Stale(`unknown element ${id}`);
  return h;
}

function staleWrap(err) {
  const m = String(err?.message ?? err);
  if (/not attached|detached|Execution context was destroyed|Cannot find context|Target closed|has been closed/i.test(m)) {
    return new Stale(m);
  }
  return err;
}

async function handlesFromArray(arrayHandle) {
  const props = await arrayHandle.getProperties();
  const ids = [];
  for (const [, v] of props) {
    const e = v.asElement();
    if (e) {
      const id = `e${++elementSeq}`;
      elements.set(id, e);
      ids.push(id);
    } else {
      await v.dispose();
    }
  }
  await arrayHandle.dispose();
  return ids;
}

async function find({ kind, query, from }) {
  const fn = (root, [k, q]) => {
    const ctx = root || document;
    if (k === "css") return Array.from(ctx.querySelectorAll(q));
    const r = document.evaluate(q, ctx, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const out = [];
    for (let i = 0; i < r.snapshotLength; i++) {
      const n = r.snapshotItem(i);
      if (n.nodeType === 1) out.push(n);
    }
    return out;
  };
  const arr = from
    ? await el(from).evaluateHandle(fn, [kind, query])
    : await frame.evaluateHandle(() => document).then((doc) => doc.evaluateHandle(fn, [kind, query]));
  return handlesFromArray(arr);
}

// Script arguments: {"__el": id} becomes the element handle.
function unwrapArgs(args) {
  return (args || []).map((a) => (a && typeof a === "object" && a.__el ? el(a.__el) : a));
}

async function wrapResult(handle) {
  const kind = await handle.evaluate((v) => {
    if (v instanceof Element) return "element";
    if (Array.isArray(v) && v.length && v.every((x) => x instanceof Element)) return "elements";
    return "value";
  });
  if (kind === "element") {
    const id = `e${++elementSeq}`;
    elements.set(id, handle.asElement());
    return { __el: id };
  }
  if (kind === "elements") return { __els: await handlesFromArray(handle) };
  const v = await handle.jsonValue().catch(() => null);
  await handle.dispose();
  return v === undefined ? null : v;
}

async function runScript(req) {
  // A script sent while the page is navigating runs on the page that loads,
  // as WebDriver does: wait for it and try again.
  for (let attempt = 0; ; attempt++) {
    try {
      return await runScriptOnce(req);
    } catch (err) {
      if (attempt >= 3 || !/Execution context was destroyed|Cannot find context/.test(String(err.message))) throw err;
      await current.page.waitForLoadState("load").catch(() => {});
      frame = current.page.mainFrame();
    }
  }
}

async function runScriptOnce({ script, args, returns }) {
  const body = returns ? `return (${script}\n);` : script;
  const h = await frame.evaluateHandle(
    ([src, argv]) => new Function(src).apply(null, argv),
    [body, unwrapArgs(args)],
  );
  return returns ? wrapResult(h) : (await h.dispose(), null);
}

async function setValue(id, value) {
  const h = el(id);
  const info = await h.evaluate((n) => ({
    tag: n.tagName.toLowerCase(),
    type: (n.getAttribute("type") || "").toLowerCase(),
    editable: n.isContentEditable,
    checked: !!n.checked,
  }));
  if (info.tag === "input" && info.type === "file") {
    await h.setInputFiles(Array.isArray(value) ? value : [value]);
    return;
  }
  if (info.tag === "input" && (info.type === "checkbox" || info.type === "radio")) {
    if (Boolean(value) !== info.checked) await h.click();
    return;
  }
  if (info.tag === "input" || info.tag === "textarea" || info.editable) {
    const text = String(value ?? "");
    await h.fill("");
    if (text.length > 30) {
      await h.fill(text);
    } else {
      await h.type(text);
    }
    return;
  }
  throw new Error(`cannot set a <${info.tag}>`);
}

function keySequence(keys) {
  const out = [];
  for (const k of keys) {
    if (typeof k === "string" && !k.startsWith(":")) out.push({ text: k });
    else if (typeof k === "string") out.push({ key: KEY_NAMES[k.slice(1)] ?? k.slice(1) });
    else if (Array.isArray(k)) {
      const mods = k.slice(0, -1).map((m) => KEY_NAMES[String(m).replace(/^:/, "")] ?? m);
      const last = String(k[k.length - 1]);
      const key = last.startsWith(":") ? KEY_NAMES[last.slice(1)] ?? last.slice(1) : last;
      out.push({ key: [...mods, key].join("+") });
    }
  }
  return out;
}

async function sendKeys(target, keys) {
  if (target) await target.focus();
  const kb = current.page.keyboard;
  for (const step of keySequence(keys)) {
    if (step.text) await kb.type(step.text);
    else await kb.press(step.key);
  }
}

function modifiersOf(keys) {
  return (keys || []).map((k) => KEY_NAMES[String(k).replace(/^:/, "")]).filter(Boolean);
}

const NODE_JS = {
  visible_text: (n) => (n.innerText ?? n.textContent ?? ""),
  all_text: (n) => n.textContent ?? "",
  tag_name: (n) => n.tagName.toLowerCase(),
  checked: (n) => !!n.checked,
  selected: (n) => !!n.selected,
  disabled: (n) => {
    if (n.disabled) return true;
    const fs = n.closest("fieldset[disabled]");
    if (fs) {
      const legend = fs.querySelector(":scope > legend");
      return !(legend && legend.contains(n));
    }
    return n.tagName === "OPTION" && !!n.closest("select")?.disabled;
  },
  readonly: (n) => !!n.readOnly,
  multiple: (n) => !!n.multiple,
  value: (n) => {
    if (n.tagName === "SELECT" && n.multiple) {
      return Array.from(n.selectedOptions).map((o) => o.value);
    }
    return n.value ?? null;
  },
  path: (n) => {
    const parts = [];
    for (let e = n; e && e.nodeType === 1; e = e.parentNode) {
      let i = 1;
      for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName) i++;
      parts.unshift(`${e.tagName.toLowerCase()}[${i}]`);
    }
    return "/" + parts.join("/");
  },
  rect: (n) => {
    const r = n.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  },
};

const handlers = {
  async visit({ url }) {
    frame = current.page.mainFrame();
    // A navigation the page started itself (a redirect after a submit) can
    // interrupt this one; WebDriver's get waits it out, so wait and retry.
    for (let attempt = 0; ; attempt++) {
      try {
        await current.page.goto(url, { waitUntil: "load" });
        break;
      } catch (err) {
        if (attempt >= 2 || !/ERR_ABORTED|interrupted by another navigation/.test(String(err.message))) throw err;
        await current.page.waitForLoadState("load").catch(() => {});
      }
    }
    frame = current.page.mainFrame();
  },
  async refresh() {
    await current.page.reload({ waitUntil: "load" });
    frame = current.page.mainFrame();
  },
  async go_back() {
    await current.page.goBack({ waitUntil: "load" });
    frame = current.page.mainFrame();
  },
  async go_forward() {
    await current.page.goForward({ waitUntil: "load" });
    frame = current.page.mainFrame();
  },
  current_url: async () => current.page.url(),
  frame_url: async () => frame.url(),
  title: async () => current.page.title(),
  frame_title: async () => frame.title(),
  html: async () => frame.content(),
  find: (req) => find(req),
  script: (req) => runScript(req),
  async node(req) {
    const h = el(req.el);
    const fn = NODE_JS[req.prop];
    if (!fn) throw new Error(`unknown node property ${req.prop}`);
    return h.evaluate(fn);
  },
  async attr({ el: id, name }) {
    return el(id).evaluate((n, attr) => {
      const props = ["checked", "selected", "disabled", "readonly", "multiple", "value", "href", "src"];
      if (props.includes(attr)) {
        const v = attr === "readonly" ? n.readOnly : n[attr];
        if (typeof v === "boolean") return v ? "true" : null;
        if (v !== undefined && v !== null && v !== "") return String(v);
      }
      const a = n.getAttribute(attr);
      if (a !== null) return a;
      const p = n[attr];
      return p === undefined || p === null || typeof p === "object" || typeof p === "function" ? null : String(p);
    }, name);
  },
  async style({ el: id, names }) {
    return el(id).evaluate((n, ns) => {
      const cs = getComputedStyle(n);
      return Object.fromEntries(ns.map((k) => [k, cs.getPropertyValue(k)]));
    }, names);
  },
  async visible({ el: id, atom }) {
    return el(id).evaluate((n, src) => new Function(`return (${src}).apply(null, arguments)`)(n), atom);
  },
  async obscured({ el: id }) {
    return el(id).evaluate((n) => {
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height) return true;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return !(top && (top === n || n.contains(top)));
    });
  },
  set: ({ el: id, value }) => setValue(id, value),
  async select_option({ el: id }) {
    await el(id).evaluate((o) => {
      const sel = o.closest("select");
      if (sel && !sel.multiple) for (const x of sel.options) x.selected = false;
      o.selected = true;
      (sel || o).dispatchEvent(new Event("input", { bubbles: true }));
      (sel || o).dispatchEvent(new Event("change", { bubbles: true }));
    });
  },
  async unselect_option({ el: id }) {
    await el(id).evaluate((o) => {
      o.selected = false;
      const sel = o.closest("select");
      (sel || o).dispatchEvent(new Event("change", { bubbles: true }));
    });
  },
  async click({ el: id, keys, offset }) {
    const opts = { modifiers: modifiersOf(keys), timeout: 10000 };
    if (offset) opts.position = offset;
    await el(id).click(opts);
  },
  async right_click({ el: id, keys }) {
    await el(id).click({ button: "right", modifiers: modifiersOf(keys), timeout: 10000 });
  },
  async double_click({ el: id, keys }) {
    await el(id).dblclick({ modifiers: modifiersOf(keys), timeout: 10000 });
  },
  async hover({ el: id }) {
    await el(id).hover({ timeout: 10000 });
  },
  async trigger({ el: id, event }) {
    await el(id).dispatchEvent(event);
  },
  async scroll_into_view({ el: id }) {
    await el(id).scrollIntoViewIfNeeded();
  },
  send_keys: ({ el: id, keys }) => sendKeys(id ? el(id) : null, keys),
  async same({ a, b }) {
    return el(a).evaluate((x, y) => x === y, el(b));
  },
  async active_element() {
    const h = await frame.evaluateHandle(() => document.activeElement);
    return wrapResult(h);
  },
  async switch_frame({ to, el: id }) {
    if (to === "top") frame = current.page.mainFrame();
    else if (to === "parent") frame = frame.parentFrame() || current.page.mainFrame();
    else {
      const f = await el(id).contentFrame();
      if (!f) throw new Error("element is not a frame");
      frame = f;
    }
  },
  async window_handles() {
    // A window closed by its own script reports its close a moment later;
    // WebDriver no longer lists it, so let the close land first.
    await new Promise((r) => setTimeout(r, 250));
    return windows.filter((w) => !w.page.isClosed()).map((w) => w.handle);
  },
  current_window_handle: async () => current.handle,
  async switch_window({ handle }) {
    const w = windows.find((x) => x.handle === handle);
    if (!w) throw Object.assign(new Error(`no window ${handle}`), { name: "NoSuchWindow" });
    current = w;
    frame = w.page.mainFrame();
  },
  async open_window() {
    const page = await context.newPage();
    const w = windows.find((x) => x.page === page) || register(page);
    return w.handle;
  },
  async close_window({ handle }) {
    const w = windows.find((x) => x.handle === handle);
    if (!w) throw Object.assign(new Error(`no window ${handle}`), { name: "NoSuchWindow" });
    await w.page.close();
  },
  async window_size({ handle }) {
    const w = windows.find((x) => x.handle === handle) || current;
    const s = w.page.viewportSize();
    return [s.width, s.height];
  },
  async resize_window({ handle, width, height }) {
    const w = windows.find((x) => x.handle === handle) || current;
    await w.page.setViewportSize({ width, height });
  },
  async screenshot({ path }) {
    await current.page.screenshot({ path, fullPage: true });
  },
  async reset() {
    for (const w of windows.slice(1)) await w.page.close().catch(() => {});
    current = windows[0];
    await context.clearCookies();
    await current.page.goto("about:blank");
    frame = current.page.mainFrame();
    for (const h of elements.values()) h.dispose().catch(() => {});
    elements.clear();
  },
  async release({ ids }) {
    for (const id of ids || []) {
      const h = elements.get(id);
      if (h) h.dispose().catch(() => {});
      elements.delete(id);
    }
  },
};

const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
// HARNESS_BROWSER_LOG: one line per command, for diagnosing a stalled run.
const trace = process.env.HARNESS_BROWSER_LOG
  ? (line) => fs.appendFileSync(process.env.HARNESS_BROWSER_LOG, `${new Date().toISOString()} ${line}\n`)
  : () => {};
process.on("unhandledRejection", (err) => trace(`unhandled rejection: ${err?.message ?? err}`));
out({ ready: true });

const rl = readline.createInterface({ input: process.stdin });
let chain = Promise.resolve();
rl.on("line", (line) => {
  chain = chain.then(async () => {
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      return;
    }
    if (req.cmd === "quit") {
      await close().catch(() => {});
      out({ id: req.id, ok: true, result: null });
      process.exit(0);
    }
    const t0 = Date.now();
    trace(`-> ${req.id} ${req.cmd} ${JSON.stringify(req).slice(0, 160)}`);
    try {
      const h = handlers[req.cmd];
      if (!h) throw new Error(`unknown command ${req.cmd}`);
      const result = await h(req);
      out({ id: req.id, ok: true, result: result === undefined ? null : result });
      trace(`<- ${req.id} ok ${Date.now() - t0}ms`);
    } catch (err) {
      const e = staleWrap(err);
      out({ id: req.id, ok: false, error: { class: e.name || "Error", message: String(e.message || e) } });
      trace(`<- ${req.id} error ${Date.now() - t0}ms ${String(e.message || e).slice(0, 160)}`);
    }
  });
});
rl.on("close", () => {
  chain.then(() => close().catch(() => {})).finally(() => process.exit(0));
});

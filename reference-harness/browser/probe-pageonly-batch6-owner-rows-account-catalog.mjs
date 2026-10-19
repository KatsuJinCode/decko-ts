#!/usr/bin/env node
// probe-pageonly-batch6-owner-rows-account-catalog.mjs
//
// Batch 6 of the page-only witnessed actions of the 2026-10-18 exhaustive
// re-grade (.runtime/exhaustive/2026-10-18-regrade: 101 of 190 actions graded
// "page-only" — visited and observed, no affordance exercised). Boundary
// coordination, stated so batches never overlap: this lane takes ranks 61-70
// of the canonical witnessed-only list (the regrade's 101 page-only ids in id
// order, tmp/pageonly-101-ids.json on the coordination tree). The window is:
//
//   ACT-115  owner-audit row 2: /*new serves the new-card page in signed-in chrome
//   ACT-118  owner-audit row 4: saving the owner's card succeeds (no 5xx)
//   ACT-121  owner-audit row 6: creating a Cardtype (a new name) succeeds, not 422
//   ACT-124  owner replay: every step of the owner's session answers (no 404/422/499/500)
//   ACT-127  S9 first-run setup of the first admin account
//   ACT-128  C7 create a plain-input card through the editor
//   ACT-129  C9 invalid number refused in the editor
//   ACT-132  C15 radio input in a new card
//   ACT-133  C17 multiselect input in a new card
//   ACT-134  E7 nest rules editor
//
// Sibling windows already committed (dedup record, not re-claims):
// ranks 1-10 bc81fbb5, 11-20 5bdda29f, 21-30 cacce253, 31-40 93771deb,
// 41-50 7deabd7e; the capability-catalog ids also carry the official
// exhaustive receipts .runtime/exhaustive/2026-10-18-batch1-ungradeable-mint-proof
// (ACT-128/129/132/133/134 pass at e50b2a48, clean tree) and
// .runtime/exhaustive/2026-10-18-ungradeable-batch2-proof-run4 (ACT-163..190).
// This lane re-drives its whole window at the current tip so the batch's
// verdict is self-contained and current rather than inherited.
//
// Every leg drives the affordance the way a person does — the /*new page in
// real chrome, the owner card's own edit form, the /new/Cardtype create form,
// the 43-step owner-session replay, the zero-account first-run /setup form,
// the /new/PlainText create form, the Number refusal and its valid control,
// the radio and multiselect editors driven by their option controls, and the
// nest rules editor's own view — on the same engine and fixture the exhaustive
// runner grades (reference-harness/browser/engines/ts.json on
// reference-harness/fixtures/synthetic-v1). The engine stages a private copy
// of the fixture deck (lib/engines.mjs), so every write this probe makes dies
// with the staging directory; ACT-127 boots a SECOND engine on a staged
// zero-account variant with DECKO_FIRST_RUN=1 + a known DECKO_SETUP_TOKEN
// (the top10 probe's proven machinery). Exits non-zero if any leg is RED.
//
//   node reference-harness/browser/probe-pageonly-batch6-owner-rows-account-catalog.mjs \
//     [--engine reference-harness/browser/engines/ts.json] \
//     [--fixture reference-harness/fixtures/synthetic-v1] [--out <dir>]

import { mkdirSync, writeFileSync, readFileSync, cpSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const engineManifest = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-pageonly-batch6");
const T = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);

mkdirSync(out, { recursive: true });

// --- provenance (the runner's own receipt fields, run-exhaustive.mjs:185-215) ---
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function execGit(...gitArgs) {
  return spawnSync("git", ["-C", repo, ...gitArgs], { encoding: "utf8", windowsHide: true }).stdout?.trim() ?? "";
}
function treeDigest(root) {
  if (!existsSync(root)) return null;
  const hash = createHash("sha256");
  const visit = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) visit(file);
      else hash.update(path.relative(root, file).replaceAll("\\", "/") + "\0" + sha256(readFileSync(file)) + "\n");
    }
  };
  visit(root);
  return hash.digest("hex");
}
const sourceCommit = execGit("rev-parse", "HEAD");
const dirtyPorcelain = execGit("status", "--porcelain", "--untracked-files=normal");

// The ENGINE's build record: the engine may boot from a different checkout
// (--engine), so record its manifest path and its build provenance verbatim.
let engineBuild = null;
try {
  const engineRepo = path.resolve(path.dirname(engineManifest), "..", "..", "..");
  engineBuild = JSON.parse(readFileSync(path.join(engineRepo, ".runtime", "browser-build.json"), "utf8"));
} catch {}

const report = {
  out,
  fixture: fixtureDir,
  source: {
    commit: sourceCommit,
    dirty: !!dirtyPorcelain,
    // Disclosed, not hidden: this checkout's working tree may carry OTHER
    // lanes' uncommitted writes. They are listed here and are NOT part of the
    // measurement — the engine boots from engineBuild (its own record below);
    // the pure-tip build carries sourceDiffSha256 e3b0c442… (sha256 of empty,
    // the clean-tree value) at this probe's tip commit.
    dirtyPorcelain: dirtyPorcelain || "",
    repoDistSha256: treeDigest(path.join(repo, "dist")),
    engineManifest,
    engineBuild,
    fixtureSha256: treeDigest(fixtureDir),
  },
  legs: [],
  failures: 0,
};

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[batch6] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 900)}`);
}

const stamp = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const urlKey = (name) => name.replaceAll(" ", "_");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** The mods' public dir (TinyMCE theme, ace modes) is a gitignored Ruby-setup
 *  artifact, not engine code (ts-server.mjs:69-77 — "both engines serve the
 *  same files"). A checkout missing it (e.g. a fresh pure-tip build worktree)
 *  gets a wrapper manifest that boots THAT checkout's server with
 *  DECKO_MOD_PUBLIC_DIR pointed at this repo's copy; the engine dist stays
 *  the target checkout's own build. */
function resolveEngineManifest() {
  const engineRepo = path.resolve(path.dirname(engineManifest), "..", "..", "..");
  const modDir = (r) => path.join(r, "reference-harness", "oracle", "app", "public");
  if (existsSync(path.join(modDir(engineRepo), "mod"))) return engineManifest;
  if (!existsSync(path.join(modDir(repo), "mod"))) return engineManifest;
  const manifest = JSON.parse(readFileSync(engineManifest, "utf8"));
  const serverScript = path.join(path.dirname(engineManifest), "ts-server.mjs");
  const wrapperPath = path.join(out, "engine-with-mod-dir.json");
  writeFileSync(wrapperPath, JSON.stringify({
    ...manifest,
    description: manifest.description + " (batch6 wrapper: boots this checkout's server with DECKO_MOD_PUBLIC_DIR from the probe repo — the target checkout lacks the gitignored mod-public artifact)",
    command: ["node", serverScript],
    env: { ...(manifest.env ?? {}), DECKO_MOD_PUBLIC_DIR: modDir(repo) },
  }, null, 2));
  return wrapperPath;
}

const engine = loadEngine(resolveEngineManifest());
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
const spec = readJson(path.join(fixtureDir, "deck.json"));
const O = server.base;
console.log(`[batch6] engine ${engine.name} on ${O} (boot ${server.bootMs}ms) commit ${sourceCommit.slice(0, 8)}`);

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(T);
page.on("dialog", (d) => d.accept().catch(() => {}));
const api = ctx.request;
if (!["127.0.0.1", "localhost"].includes(new URL(O).hostname)) throw Error("batch6 probe requires the loopback engine");

const db = () => new DatabaseSync(server.db, { readOnly: true });

const signIn = async (who, creds) => {
  const a = spec.actors[who];
  const email = creds?.email ?? a.email;
  const password = creds?.password ?? a.password;
  await ctx.clearCookies();
  await page.goto(O + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(email, { timeout: T });
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(password, { timeout: T });
  await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
  await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
  await page.waitForTimeout(600);
  const cookies = await ctx.cookies(O);
  return {
    signedInChrome: (await page.locator("a.signout-link").first().count().catch(() => 0)) > 0,
    hasSessionCookie: cookies.some((c) => c.name === "decko_ts_session" && c.value.length > 0),
    url: page.url(),
  };
};
const visit = async (p) => {
  const r = await page.goto(O + p, { waitUntil: "load", timeout: T }).catch(() => null);
  await page.waitForTimeout(700);
  return { status: r ? r.status() : null, url: page.url() };
};
const evalPage = async (fn, arg) => page.evaluate(fn, arg).catch((e) => ({ error: String(e?.message ?? e) }));
/** The first card-form that is not the navbox/nav forms, as a locator. */
const mainForm = () => page.locator("#main form.card-form").first();
/** Edit form for a card, scoped by its action (edit forms render outside #main). */
const editForm = (name) => page.locator(`form.card-form[action='/update/${urlKey(name)}']`).first();
/** Submit a form the way the person's button does, watching the POST it fires. */
const submitWatching = async (form, urlPart) => {
  const responded = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(urlPart), { timeout: T }).catch(() => null);
  const submit = form.locator("button[type=submit], input[type=submit], .submit-button").first();
  if ((await submit.count().catch(() => 0)) > 0) await submit.click({ timeout: T }).catch(() => {});
  else await form.evaluate((f) => f.requestSubmit?.() ?? f.submit()).catch(() => {});
  const resp = await responded;
  if (resp) await resp.finished().catch(() => {});
  return resp;
};
/** The /new/<type> create form the way case 17/createThroughNewCardForm drives it. */
const createThroughNewCardForm = async ({ newPath, name, content }) => {
  const params = new URLSearchParams({});
  if (name !== undefined && name !== "") params.set("card[name]", name);
  if (content !== undefined) params.set("card[content]", content);
  const opened = await page.goto(`${O}${newPath}?${params.toString()}`, { waitUntil: "domcontentloaded", timeout: T }).catch(() => null);
  if (!opened || opened.status() >= 400) return { ok: false, status: opened ? opened.status() : null };
  let form = page.locator("form.card-form").filter({ has: page.locator(".create-submit-button") });
  form = form.filter({ has: page.locator("input[name='card[name]']") }).first();
  if ((await form.count()) === 0) return { ok: false, status: opened.status() };
  const action = new URL(await form.getAttribute("action"), O);
  const pending = page.waitForResponse(
    (r) => new URL(r.url()).origin === O && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST",
    { timeout: T },
  ).then((response) => ({ response }), (error) => ({ error }));
  await form.locator(".create-submit-button").first().click({ timeout: T });
  const seen = await pending;
  if (seen.error) return { ok: false, status: null, error: String(seen.error).slice(0, 120) };
  await seen.response.finished().catch(() => {});
  return { ok: seen.response.status() < 400, status: seen.response.status() };
};
const settle = () => page.waitForTimeout(900);
const countSelector = async (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel).catch(() => 0);
/** A page.goto that survives a pending save-navigation: waits the current page
 *  out, retries once, and never swallows the error silently (run-3 lesson:
 *  after a modal save, an immediate goto can throw and leave the page stale —
 *  every later leg then reads the WRONG page while context-level requests
 *  still succeed). */
const gotoPage = async (p) => {
  await page.waitForLoadState("load", { timeout: T }).catch(() => {});
  let r = await page.goto(O + p, { waitUntil: "load", timeout: T }).catch((e) => ({ error: String(e?.message ?? e).slice(0, 160) }));
  if (r && r.error) {
    await page.waitForTimeout(1500);
    r = await page.goto(O + p, { waitUntil: "load", timeout: T }).catch((e) => ({ error: String(e?.message ?? e).slice(0, 160) }));
  }
  await page.waitForTimeout(400);
  return r && !r.error ? { status: r.status(), url: page.url() } : { status: null, url: page.url(), error: r?.error ?? "goto returned nothing" };
};
const fetchJson = async (name) => fetch(`${O}/${encodeURIComponent(name)}.json`, { headers: { connection: "close" } })
  .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null) }))
  .catch(() => ({ status: null, parsed: null }));

try {
  // ---------------------------------------------------------------- ACT-115
  // "row 2: /*new serves Decko's new-card page in signed-in chrome" (owner
  // audit row 2 — the whole-harness family graded it on the Culturesmith deck,
  // .runtime/edge-signed-in/2026-10-18-runner-harness-full-run/report.md:92;
  // this is the affordance's first person-shaped drive on synthetic-v1).
  // Legs: signed-in GET /*new answers 200 carrying the new-card page's create
  // form (a card-form with a name input) and the signed-in chrome; the
  // signed-out answer is recorded as a witness (must not 5xx).
  {
    const admin = await signIn("admin");
    const seen = await visit("/*new");
    const pageShape = await evalPage(() => ({
      title: document.title,
      createForm: !!document.querySelector("form.card-form input[name='card[name]']"),
      formAction: document.querySelector("form.card-form")?.getAttribute("action") ?? null,
      signout: !!document.querySelector("a.signout-link"),
    }));
    await ctx.clearCookies();
    const signedOut = await visit("/*new");
    const signedOutShape = await evalPage(() => ({
      createForm: !!document.querySelector("form.card-form input[name='card[name]']"),
      signinForm: !!document.querySelector("form[action='/update/*signin']"),
    }));
    grade("ACT-115", "row 2: /*new serves Decko's new-card page in signed-in chrome",
      admin.signedInChrome === true && seen.status === 200 && pageShape?.createForm === true && pageShape?.signout === true
        && signedOut.status !== null && signedOut.status < 500,
      { seen, pageShape, signedOut: { status: signedOut.status, ...signedOutShape } });
    // the witness cleared the session; restore the admin sign-in for the
    // write legs that follow (run-1 lesson: ACT-118/121 must not inherit the
    // signed-out context)
    await signIn("admin");
  }

  // ---------------------------------------------------------------- ACT-118
  // "row 4: saving the owner's card succeeds (no 5xx)" — the owner is the
  // fixture administrator actor and the owner's card is Ada Admin (batch2's
  // committed leg shape, probe-pageonly-batch2-write-permission.mjs:259-292):
  // submit the User card's edit form as rendered and require a non-5xx write
  // that leaves the row intact.
  {
    const holder = "Ada_Admin";
    const d0 = db();
    const before = d0.prepare("SELECT id, db_content FROM cards WHERE name='Ada Admin' AND trash=0").get() ?? null;
    d0.close();
    const seen = await visit(`/${holder}/edit`);
    const form = editForm("Ada Admin");
    const formPresent = (await form.count().catch(() => 0)) > 0;
    let post = null, rowAfter = null;
    if (formPresent) {
      const resp = await submitWatching(form, `/update/${holder}`);
      post = resp ? resp.status() : null;
      await page.waitForTimeout(1200);
      const d = db();
      rowAfter = d.prepare("SELECT id, trash FROM cards WHERE name='Ada Admin' AND trash=0").get() ?? null;
      d.close();
    }
    grade("ACT-118", "row 4: saving the owner's card succeeds (no 5xx)",
      formPresent && post !== null && post < 500 && !!rowAfter && rowAfter.id === before?.id,
      { seen, formPresent, post, rowBeforeId: before?.id ?? null, rowAfter });
  }

  // ---------------------------------------------------------------- ACT-121
  // "row 6: creating a Cardtype (a new name) succeeds, not 422" (batch2's
  // committed leg shape, probe-pageonly-batch2-write-permission.mjs:140-167):
  // submit /new/Cardtype's form with a scratch name; the new type must store
  // as a Cardtype row.
  {
    const d0 = db();
    const cardtypeId = d0.prepare("SELECT id FROM cards WHERE name='Cardtype' AND trash=0").get()?.id ?? null;
    d0.close();
    const seen = await visit("/new/Cardtype");
    const form = mainForm();
    const formPresent = (await form.count().catch(() => 0)) > 0;
    const name = "Harness_B6_Kind_" + stamp();
    let post = null, row = null;
    if (formPresent) {
      await form.locator("input[name='card[name]']").first().fill(name, { timeout: T }).catch(() => {});
      const resp = await submitWatching(form, "/card/create");
      post = resp ? { status: resp.status(), location: resp.headers()?.location ?? null } : null;
      await page.waitForTimeout(1500);
      const d = db();
      row = d.prepare("SELECT id, type_id, trash FROM cards WHERE name=? AND trash=0").get(name) ?? null;
      d.close();
    }
    grade("ACT-121", "creating a Cardtype (a new name) succeeds, not 422",
      formPresent && post !== null && post.status < 400 && post.status !== 422 && !!row && String(row.type_id) === String(cardtypeId),
      { cardtypeId, seen, formPresent, post, row });
  }

  // ---------------------------------------------------------------- ACT-124
  // The owner's session, replayed on this fixture with the fixture
  // administrator actor (batch3's committed 43-step replay shape,
  // probe-pageonly-batch3-create-routes-owner-replay.mjs:200-335; subject
  // mapping disclosed in its header: his card -> Ada Admin, his duplicate-name
  // refusal -> /Topic/new as served, unknown names stay unknown).
  {
    await ctx.clearCookies();
    const steps = [];
    const step = async (label, expect, fn) => {
      let note = null;
      try { note = await fn(); } catch (e) { note = { threw: String(e?.message ?? e).slice(0, 160) }; }
      const status = note?.status ?? null;
      const ok = !(typeof note?.threw === "string") && (typeof expect === "function" ? expect(status, note) : status !== null && status === expect);
      steps.push({ label, status, ok, summary: typeof note?.summary === "string" ? note.summary.slice(0, 120) : (note?.summary ?? null) });
      return ok;
    };
    const nav = (p) => async () => { const r = await page.goto(O + p, { waitUntil: "load", timeout: 60_000 }); return { status: r ? r.status() : null }; };
    const json = (p) => async () => page.evaluate(async ({ origin, path }) => {
      const r = await fetch(`${origin}${path}`, { credentials: "include", headers: { "x-requested-with": "XMLHttpRequest" } });
      return { status: r.status, summary: `${r.status} ${(await r.text()).length}B` };
    }, { origin: O, path: p });
    const signInForm = (who) => async () => {
      const a = spec.actors[who];
      await page.goto(O + "/*signin", { waitUntil: "load", timeout: 60_000 });
      await page.fill("input[name='card[subcards][+*email][content]']", a.email);
      await page.fill("input[name='card[subcards][+*password][content]']", a.password);
      const observed = page.waitForResponse((r) => new URL(r.url()).pathname === "/update/*signin" && r.request().method() === "POST", { timeout: 30_000 });
      await page.locator("form[action='/update/*signin'] button[type='submit'], form[action='/update/*signin'] input[type='submit']").first().click();
      const resp = await observed;
      await resp.finished().catch(() => {});
      return { status: resp.status() };
    };
    const post = (p, body) => async () => {
      const r = await page.request.post(O + p, { headers: { "content-type": "application/x-www-form-urlencoded", origin: O }, data: body, maxRedirects: 0 });
      return { status: r.status(), summary: `status ${r.status()}` };
    };

    const adaId = (() => { const d = new DatabaseSync(server.db, { readOnly: true }); const row = d.prepare("SELECT id FROM cards WHERE name='Ada Admin' AND trash=0").get(); d.close(); return row?.id ?? null; })();
    if (adaId == null) throw Error("fixture administrator card row (Ada Admin) not found in the staged deck");
    const deleteName = `Harness_owner_DeleteThisTest_b6_${stamp()}`;
    const saveBody = new URLSearchParams({ _method: "patch", "card[content]": "replayed value", "success[redirect]": "true" }).toString();
    const mainAda = `main=${encodeURIComponent("Ada Admin")}`;

    await step("GET /  (signed out)", 200, nav("/"));
    await step("GET /*search  (signed out)", 200, nav("/*search"));
    await step("GET /*signin", 200, nav("/*signin"));
    await step("POST /update/*signin (sign in as the fixture administrator, form)", 200, signInForm("admin"));
    await step("GET /  (signed in)", 200, nav("/"));
    await step("GET /*search", 200, nav("/*search"));
    await step("GET search_box_complete term=202", 200, json("/*search/search_box_complete.json?term=202"));
    await step("GET search_box_complete term=2026", 200, json("/*search/search_box_complete.json?term=2026"));
    await step("GET search_box_complete term=202609", 200, json("/*search/search_box_complete.json?term=202609"));
    await step("GET /*search?query[keyword]=202609", 200, nav("/*search?utf8=%E2%9C%93&query%5Bkeyword%5D=202609"));
    await step("GET /*search paging offset=100", 200, nav("/*search?limit=20&offset=100&main=*search"));
    await step("GET /Razmatazz (unknown name)", 200, nav("/Razmatazz"));
    await step("GET /deletethistest (unknown name)", 200, nav("/deletethistest"));
    await step("GET /20261015 (unknown name)", 200, nav("/20261015"));
    await step("GET /*new", 200, nav("/*new"));
    await step("GET /Ada_Admin (the administrator's card)", 200, nav("/Ada_Admin"));
    await step("GET /Ada_Admin/edit", 200, nav("/Ada_Admin/edit"));
    for (const term of ["delete", "delet", "a", "b", "c"]) {
      await step(`GET *all.json name_match term=${term}`, 200, json(`/*all.json?view=name_match&${mainAda}&term=${term}`));
    }
    await step("GET Topic_001+tags+*content_options name_match (witness: fixture has no *content_options rule; must not 5xx)",
      (s) => s !== null && s < 500, json("/Topic_001+tags+*content_options.json?view=name_match&main=Ada%20Admin&term=Tag"));
    await step("POST /update/~" + adaId + " (save #1)", (s) => s !== null && s < 400, post(`/update/~${adaId}`, saveBody));
    await step("POST /update/~" + adaId + " (save #2)", (s) => s !== null && s < 400, post(`/update/~${adaId}`, saveBody));
    await step("GET /Topic_001 (read a fixture card)", 200, nav("/Topic_001"));
    await step("GET /  (signed in)", 200, nav("/"));
    await step("GET /*new", 200, nav("/*new"));
    await step("GET /delete/*signin  (sign out)", (s) => s !== null && s < 400, nav("/delete/*signin"));
    await step("GET /*signin (signed out again)", 200, nav("/*signin"));
    await step("POST /update/*signin (sign in again, form)", 200, signInForm("admin"));
    await step("GET /*new", 200, nav("/*new"));
    await step("GET /*search", 200, nav("/*search"));
    await step("GET /Topic/new (the existing Cardtype's new route)", 200, nav("/Topic/new"));
    await step("POST /card/create (duplicate name as served by that form: refusal with a visible error)",
      (s, note) => s === 422 && note?.visibleError === true,
      async () => {
        await page.goto(`${O}/Topic/new`, { waitUntil: "load", timeout: 60_000 });
        const prefilled = await page.locator("form.card-form input[name='card[name]']").first().inputValue().catch(() => null);
        const responded = page.waitForResponse((r) => new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null);
        await page.locator("form.card-form button[type='submit'], form.card-form input[type='submit']").first().click().catch(() => undefined);
        const response = await responded;
        const body = response ? (await response.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : "";
        const reason = /(must be unique[^.]*|already exists[^.]*)/i.exec(body)?.[0] ?? null;
        return { status: response ? response.status() : null, summary: `status ${response?.status() ?? null}; ${reason ?? "no error shown"}; prefilled=${JSON.stringify(prefilled)}`, visibleError: reason !== null };
      });
    await step(`GET /${deleteName}/new (the administrator's new card form)`, 200, nav(`/${deleteName}/new`));
    await step("POST /card/create (the card)", (s) => s !== null && s < 400,
      async () => {
        await page.goto(`${O}/${deleteName}/new`, { waitUntil: "load", timeout: 60_000 });
        await page.locator("form.card-form input[name='card[name]']").first().fill(deleteName).catch(() => undefined);
        const responded = page.waitForResponse((r) => new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null);
        await page.locator("form.card-form button[type='submit'], form.card-form input[type='submit']").first().click().catch(() => undefined);
        const response = await responded;
        await page.waitForTimeout(1500);
        return { status: response ? response.status() : null, summary: `status ${response?.status() ?? null}` };
      });
    await step(`GET /${deleteName}`, 200, nav(`/${deleteName}`));
    await step(`GET /${deleteName}/edit`, 200, nav(`/${deleteName}/edit`));
    await step(`GET /${deleteName}/board`, 200, nav(`/${deleteName}/board`));
    await step(`Delete link GET /delete/${deleteName}`, (s) => s !== null && s < 400,
      async () => {
        await page.goto(`${O}/${deleteName}/edit`, { waitUntil: "load", timeout: 60_000 });
        const href = await page.evaluate((target) => {
          const a = [...document.querySelectorAll("a[href^='/delete/']")].find((x) => x.getAttribute("href")?.startsWith(target));
          if (!a) return null;
          a.click();
          return a.getAttribute("href");
        }, `/delete/${deleteName}`);
        if (!href) return { status: null, summary: "no /delete/ link found on the edit page" };
        await page.waitForTimeout(2500);
        const r = await page.request.get(O + href, { maxRedirects: 0 }).catch(() => null);
        return { status: r ? r.status() : null, summary: `link ${href} -> ${r?.status() ?? null}` };
      });
    await step("GET /  (after delete)", 200, nav("/"));
    await step("GET /*search  (after delete)", 200, nav("/*search"));

    const failed = steps.filter((s) => !s.ok);
    grade("ACT-124", "owner replay: every step of the owner's session answers as the owner's did not (no 404, 422, 499 or 500)",
      steps.length > 0 && failed.length === 0,
      { steps: steps.length, adaId, failed: failed.map((s) => `${s.label} -> ${s.status}${s.summary ? " (" + s.summary + ")" : ""}`), table: steps.map((s) => `${s.ok ? "ok" : "FAIL"} ${s.status ?? "-"} ${s.label}`) });
  }

  // ---------------------------------------------------------------- ACT-128
  // "C7 Create a plain-input card through the editor" — the editor is the
  // create FORM at /new/PlainText (mint case 29's committed contract,
  // lib/exhaustive-affordance-targets.mjs:1837-1864): fill the form in the
  // page, submit it, grade the STORED card (/<name>.json 200, type PlainText,
  // the exact content the editor held).
  {
    const s = stamp();
    const scratch = `Harness_b6_c7_plain_${s}`;
    const content = `plain text body ${s}`;
    const submitted = await createThroughNewCardForm({ newPath: "/new/PlainText", name: scratch, content });
    const stored = await fetchJson(scratch);
    grade("ACT-128", "C7 create a plain-input card through the editor",
      submitted.ok === true && submitted.status !== null && submitted.status < 400 && stored.status === 200
        && stored.parsed?.type_name === "PlainText" && stored.parsed?.db_content === content,
      { submitted, storedJsonStatus: stored.status, storedType: stored.parsed?.type_name ?? null, storedContent: stored.parsed?.db_content ?? null });
  }

  // ---------------------------------------------------------------- ACT-129
  // "C9 Invalid number refused in the editor" (mint case 30's committed
  // contract, lib/exhaustive-affordance-targets.mjs:1866-1913): the Number
  // cardtype validates content; the refusal is a WRITE answer — 4xx AND the
  // card not stored (/<name>.json 404) — proven content-specific by a valid
  // control that must store "42".
  {
    const s = stamp();
    const bad = `Harness_b6_c9_bad_${s}`;
    const good = `Harness_b6_c9_good_${s}`;
    const badPost = await page.request.post(`${O}/card/create`, {
      headers: { origin: O },
      form: { "card[name]": bad, "card[type]": "Number", "card[content]": `not a number ${s}`, "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const badStatus = badPost.error ? null : badPost.status();
    const badJson = await fetch(`${O}/${encodeURIComponent(bad)}.json`, { headers: { connection: "close" } }).then((r) => r.status).catch(() => null);
    grade("ACT-129", "C9 invalid number refused in the editor (4xx + not stored)",
      badStatus !== null && badStatus >= 400 && badJson === 404,
      { badStatus, badJson });
    const goodPost = await page.request.post(`${O}/card/create`, {
      headers: { origin: O },
      form: { "card[name]": good, "card[type]": "Number", "card[content]": "42", "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    const goodJson = await fetchJson(good);
    grade("ACT-129", "C9 refusal is content-specific: a valid number stores (control)",
      !goodPost.error && goodPost.status() < 400 && goodJson.status === 200 && goodJson.parsed?.db_content === "42",
      { goodStatus: goodPost.error ? null : goodPost.status(), goodJsonStatus: goodJson.status, goodContent: goodJson.parsed?.db_content ?? null });
  }

  // ---------------------------------------------------------------- ACT-132
  // "C15 Radio input in a new card" (mint case 31's committed contract,
  // lib/exhaustive-affordance-targets.mjs:1915-1990): stage a scratch host +
  // +tags Pointer and the tags+*right input-type=radio / options rules, open
  // the field's edit modal, require the Tag options to render as radio
  // inputs, choose Tag 03, save, and require the driven choice stored.
  {
    const s = stamp();
    const host = `Harness_b6_c15_${s}`;
    const pointer = `${host}+tags`;
    const staging = [];
    for (const form of [
      { "card[name]": host, "card[type]": "Basic", "card[content]": "radio host", "success[redirect]": "true" },
      { "card[name]": pointer, "card[type]": "Pointer", "card[content]": "[[Tag 01]]", "success[redirect]": "true" },
      { "card[name]": "tags+*right+*input_type", "card[type]": "Phrase", "card[content]": "radio", "success[redirect]": "true" },
      { "card[name]": "tags+*right+*options", "card[type]": "Search", "card[content]": JSON.stringify({ type: "Tag", sort: "name" }), "success[redirect]": "true" },
    ]) {
      const r = await page.request.post(`${O}/card/create`, { headers: { origin: O }, form, maxRedirects: 0 }).catch(() => null);
      staging.push({ name: form["card[name]"], status: r ? r.status() : null });
    }
    const rules = {
      inputType: await fetchJson("tags+*right+*input_type"),
      options: await fetchJson("tags+*right+*options"),
    };
    const editSeen = await gotoPage(`/${encodeURIComponent(pointer)}?view=edit`);
    // readiness wait (run-1/run-2 flap lesson: the editor boots client-side;
    // query only after a control exists or the wait times out)
    await Promise.race([
      page.waitForSelector("input[type=radio]", { timeout: T }).catch(() => null),
      page.waitForSelector("select[multiple]", { timeout: T }).catch(() => null),
      page.waitForSelector("#main form.card-form textarea, #main form.card-form input[name='card[content]']", { timeout: T }).catch(() => null),
    ]);
    await settle();
    const editShape = await evalPage(() => ({
      modal: !!document.querySelector(".modal.show"),
      anyModal: !!document.querySelector(".modal"),
      radios: [...document.querySelectorAll("input[type=radio]")].map((r) => r.value),
      selects: [...document.querySelectorAll("select")].map((s) => s.name),
      editorHead: (document.querySelector(".modal.show, .card-form, #main")?.textContent ?? document.body.textContent).replace(/\s+/g, " ").slice(0, 300),
    }));
    const radioValues = editShape?.radios ?? [];
    let saveStatus = null;
    if (Array.isArray(radioValues) && radioValues.includes("Tag 03")) {
      await page.locator("input[type=radio][value='Tag 03']").first().check().catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() !== "GET" && new URL(r.url()).pathname.startsWith("/update/"), { timeout: T }).catch(() => null);
      await page.locator(".modal.show button.submit-button, form button.submit-button").first().click().catch(() => {});
      const answered = await responded;
      saveStatus = answered ? answered.status() : null;
      await settle();
    }
    const stored = await fetchJson(pointer);
    grade("ACT-132", "C15 radio input in a new card (radios render, driven choice stored)",
      Array.isArray(radioValues) && radioValues.length > 0 && radioValues.includes("Tag 03")
        && saveStatus !== null && saveStatus < 400 && stored.status === 200
        && String(stored.parsed?.db_content ?? "") === "Tag 03",
      { staging, rules: { inputTypeStatus: rules.inputType.status, inputTypeContent: rules.inputType.parsed?.db_content ?? null, optionsStatus: rules.options.status }, editSeen, editShape, saveStatus, storedContent: stored.parsed?.db_content ?? null });
  }

  // ---------------------------------------------------------------- ACT-133
  // "C17 Multiselect input in a new card" (mint case 32's committed contract,
  // lib/exhaustive-affordance-targets.mjs:1992-2075): same staging with the
  // input-type rule flipped to multiselect (the rule card's own update route
  // when it already exists — case 31 just created it), the edit modal must
  // render select[multiple] with the Tag options, and both driven choices
  // must store ("Tag 02" and "Tag 04").
  {
    const s = stamp();
    const host = `Harness_b6_c17_${s}`;
    const pointer = `${host}+tags`;
    for (const form of [
      { "card[name]": host, "card[type]": "Basic", "card[content]": "multiselect host", "success[redirect]": "true" },
      { "card[name]": pointer, "card[type]": "Pointer", "card[content]": "", "success[redirect]": "true" },
    ]) {
      await page.request.post(`${O}/card/create`, { headers: { origin: O }, form, maxRedirects: 0 }).catch(() => null);
    }
    const ruleExisting = await fetch(`${O}/${encodeURIComponent("tags+*right+*input_type")}.json`, { headers: { connection: "close" } }).then((r) => r.status).catch(() => null);
    let updateStatus = null;
    if (ruleExisting === 200) {
      const upd = await page.request.post(`${O}/update/${encodeURIComponent("tags+*right+*input_type")}`, {
        headers: { origin: O },
        form: { "card[content]": "multiselect", "success[redirect]": "true" },
        maxRedirects: 0,
      }).catch((e) => ({ error: String(e?.message ?? e) }));
      updateStatus = upd.error ? `error: ${upd.error}` : upd.status();
    } else {
      const crt = await page.request.post(`${O}/card/create`, {
        headers: { origin: O },
        form: { "card[name]": "tags+*right+*input_type", "card[type]": "Phrase", "card[content]": "multiselect", "success[redirect]": "true" },
        maxRedirects: 0,
      }).catch((e) => ({ error: String(e?.message ?? e) }));
      updateStatus = crt.error ? `error: ${crt.error}` : crt.status();
    }
    const ruleAfter = await fetchJson("tags+*right+*input_type");
    await page.request.post(`${O}/card/create`, {
      headers: { origin: O },
      form: { "card[name]": "tags+*right+*options", "card[type]": "Search", "card[content]": JSON.stringify({ type: "Tag", sort: "name" }), "success[redirect]": "true" },
      maxRedirects: 0,
    }).catch(() => null);
    const editOpened = await gotoPage(`/${encodeURIComponent(pointer)}?view=edit`);
    // wait for the editor control the way the mint cases wait for the modal —
    // a readiness wait, not an assert change: whichever control this editor
    // renders (radio inputs, a multiple select, or any card-form editor)
    await Promise.race([
      page.waitForSelector("select[multiple]", { timeout: T }).catch(() => null),
      page.waitForSelector("input[type=radio]", { timeout: T }).catch(() => null),
      page.waitForSelector("#main form.card-form textarea, #main form.card-form input[name='card[content]']", { timeout: T }).catch(() => null),
    ]);
    await settle();
    const editShape17 = await evalPage(() => ({
      url: location.pathname,
      modal: !!document.querySelector(".modal.show"),
      multi: (() => { const sel = document.querySelector(".modal.show select[multiple], select[multiple]"); return sel ? { name: sel.name, options: [...sel.options].map((o) => o.value) } : null; })(),
      radios: [...document.querySelectorAll("input[type=radio]")].length,
      mainForms: [...document.querySelectorAll("#main form.card-form")].map((f) => f.getAttribute("action")),
      mainHead: (document.querySelector("#main")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 300),
    }));
    const multi = editShape17?.multi ?? null;
    let saveStatus = null;
    if (multi && multi.name) {
      await page.locator(`select[name="${multi.name}"]`).first().selectOption(["Tag 04", "Tag 02"]).catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() !== "GET" && new URL(r.url()).pathname.startsWith("/update/"), { timeout: T }).catch(() => null);
      await page.locator(".modal.show button.submit-button, form button.submit-button").first().click().catch(() => {});
      const answered = await responded;
      saveStatus = answered ? answered.status() : null;
      await settle();
    }
    const stored = await fetchJson(pointer);
    const storedContent = typeof stored.parsed?.db_content === "string" ? stored.parsed.db_content : null;
    grade("ACT-133", "C17 multiselect input in a new card (multiple select renders, both choices stored)",
      multi !== null && multi.name && saveStatus !== null && saveStatus < 400
        && storedContent !== null && storedContent.includes("Tag 02") && storedContent.includes("Tag 04"),
      { ruleExisting, updateStatus, ruleAfterContent: ruleAfter.parsed?.db_content ?? null, ruleAfterStatus: ruleAfter.status,
        editOpened, editShape: editShape17, saveStatus, storedContent });
  }

  // ---------------------------------------------------------------- ACT-134
  // "E7 Nest rules editor" (mint case 33's committed contract,
  // lib/exhaustive-affordance-targets.mjs:2077-2116): the editor is a SET
  // card's :nest_rules view — .nest_rules-view with ._setting-list li rows
  // carrying the rules' update forms. Read-only on the seeded type-set
  // Topic+*type (a scratch self set renders no nest_rules view on this engine
  // — the mint case's measured note — so the seeded set is the editor's real
  // host).
  {
    const setMark = "Topic+*type";
    const nestSeen2 = await gotoPage(`/${encodeURIComponent(setMark)}?view=nest_rules`);
    await settle();
    const nestShape = await evalPage(() => ({
      title: document.title,
      nestRulesView: document.querySelectorAll(".nest_rules-view").length,
      settingList: document.querySelectorAll(".nest_rules-view ._setting-list li").length,
      updateForms: document.querySelectorAll(".nest_rules-view form[action^='/update/']").length,
      bodyHead: document.body.textContent.replace(/\s+/g, " ").slice(0, 300),
    }));
    const viewCount = nestShape?.nestRulesView ?? 0;
    const listItems = nestShape?.settingList ?? 0;
    const updateForms = nestShape?.updateForms ?? 0;
    grade("ACT-134", "E7 nest rules editor (view renders, setting list populated, rows wired to update routes)",
      viewCount > 0 && listItems > 0 && updateForms > 0,
      { nestSeen: nestSeen2, nestShape });
  }
} catch (err) {
  report.fatal = String(err?.stack ?? err);
  report.failures += 1;
  console.error(`[batch6] FATAL ${err?.stack ?? err}`);
}

await bh.close().catch(() => {});
await server.stop().catch(() => {});

// ---------------------------------------------------------------- ACT-127
// "S9 First-run setup of the first admin account" — needs a deck with ZERO
// user accounts and the first-run env armed; boots its own engine on a staged
// zero-account variant (the top10 probe's committed machinery,
// probe-pageonly-top10-write-permission.mjs:496-606). Legs: /setup renders
// the armed form, the POST creates the owner (active account, Administrator
// membership), the owner signs in THROUGH THE FORM and reads an
// Administrator-only Brief card, and the window closes for good.
try {
  const fixture = path.join(out, "zero-account-fixture");
  mkdirSync(path.join(fixture, "deck"), { recursive: true });
  cpSync(path.join(fixtureDir, "deck.json"), path.join(fixture, "deck.json"));
  cpSync(path.join(fixtureDir, "deck", "deck.sqlite3"), path.join(fixture, "deck", "deck.sqlite3"));

  const dbz = new DatabaseSync(path.join(fixture, "deck", "deck.sqlite3"));
  const account = dbz.prepare("SELECT id FROM cards WHERE name='*account' AND trash=0").get()?.id;
  const shipped = dbz.prepare("SELECT id FROM cards WHERE name IN ('Decko Bot','Anonymous')").all().map((r) => r.id);
  const junctions = dbz.prepare(`SELECT id FROM cards WHERE right_id=${account} AND trash=0 AND left_id NOT IN (${shipped.join(",")})`).all().map((r) => r.id);
  dbz.exec(`BEGIN;
    UPDATE cards SET trash=1 WHERE right_id=${account} AND trash=0 AND left_id NOT IN (${shipped.join(",")});
    ${junctions.length ? `UPDATE cards SET trash=1 WHERE left_id IN (${junctions.join(",")});` : ""}
  COMMIT;`);
  const census = dbz.prepare(`SELECT COUNT(*) AS n FROM cards WHERE right_id=${account} AND trash=0 AND NOT (left_id IN (${shipped.join(",")}))`).get().n;
  dbz.close();

  const manifestPath = path.join(out, "engine-ts-firstrun.json");
  // The firstrun engine boots the SAME server checkout the main legs booted
  // (the resolved engine manifest's dir), with the first-run env armed and —
  // when that checkout lacks the gitignored mod-public artifact — the probe
  // repo's DECKO_MOD_PUBLIC_DIR (the same wrapper the main engine got).
  const resolvedManifestPath = resolveEngineManifest();
  const resolvedManifest = JSON.parse(readFileSync(resolvedManifestPath, "utf8"));
  // engines.mjs spawns a manifest's command with cwd = THAT manifest's dir
  // (engines.mjs:159 cwd: engine.dir). The resolved source manifest (e.g.
  // engines/ts.json) carries its command relative to ITS OWN dir
  // (["node","ts-server.mjs"]), so copying the array verbatim into a
  // manifest written under the run's out dir re-anchors those relative
  // entries onto the out dir — where no ts-server.mjs exists. That exact
  // defect was the ACT-127 RED in the Fleet B smell rerun (lane c,
  // 2026-10-19): MODULE_NOT_FOUND at <out>/ts-server.mjs. Re-anchor each
  // non-absolute entry against the resolved manifest's dir before writing
  // — the same working shape the sibling top10 probe uses
  // (probe-pageonly-top10-write-permission.mjs absolute path.join(here,
  // "engines", "ts-server.mjs"), whose ACT-127 passes on the same tree).
  const resolvedManifestDir = path.dirname(path.resolve(resolvedManifestPath));
  const firstrunCommand = resolvedManifest.command.map((part, i) =>
    i > 0 && !path.isAbsolute(part) ? path.join(resolvedManifestDir, part) : part,
  );
  const firstrunEnv = { ...(resolvedManifest.env ?? {}), DECKO_FIRST_RUN: "1", DECKO_WRITE_PATH: "1", DECKO_SETUP_TOKEN: "batch6-probe-setup-token" };
  writeFileSync(manifestPath, JSON.stringify({
    name: "ts-firstrun",
    description: "The harness ts engine with the first-run surface armed (DECKO_FIRST_RUN=1) and a known setup token.",
    command: firstrunCommand,
    ready: "/__harness/ready",
    env: firstrunEnv,
  }, null, 2));
  const engine2 = loadEngine(manifestPath);
  const server2 = await startEngine(engine2, fixture, { logFile: path.join(out, "server-firstrun.log") });
  const bh2 = await launchBrowser();
  const ctx2 = bh2.context;
  const page2 = ctx2.pages()[0] ?? (await ctx2.newPage());
  page2.setDefaultTimeout(T);
  page2.on("dialog", (d) => d.accept().catch(() => {}));
  const O2 = server2.base;
  const visit2 = async (p) => {
    const r = await page2.goto(O2 + p, { waitUntil: "load", timeout: T }).catch(() => null);
    await page2.waitForTimeout(700);
    return { status: r ? r.status() : null, url: page2.url() };
  };

  const ownerEmail = `owner.${stamp()}@example.test`;
  const ownerPassword = "First run pass 3#";
  const setupPage = await visit2("/setup");
  const formPresent = await page2.evaluate(() => !!document.querySelector("form.first-run-setup-form")).catch(() => false);
  let posted = null, dbProof = null, signInProof = null, adminProof = null, windowClosed = null;
  if (formPresent) {
    await page2.locator("#setup_token").fill("batch6-probe-setup-token", { timeout: T });
    await page2.locator("#setup_email").fill(ownerEmail, { timeout: T });
    await page2.locator("#setup_password").fill(ownerPassword, { timeout: T });
    const responded = page2.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/setup", { timeout: T }).catch(() => null);
    await page2.locator("form.first-run-setup-form button[type=submit]").click({ timeout: T });
    const resp = await responded;
    await page2.waitForTimeout(1500);
    posted = { status: resp ? resp.status() : null, url: page2.url(), bodyHasError: await page2.evaluate(() => !!document.querySelector(".form-error")).catch(() => null) };
    // stored rows — resolved by ids, because the junction children carry a
    // null name column. Two hops up from the +*email row: its left_id is
    // the +*account junction, and the JUNCTION's left_id is the holder.
    const db2 = new DatabaseSync(server2.db, { readOnly: true });
    const emailRow = db2.prepare("SELECT id, left_id FROM cards WHERE db_content=? AND right_id=(SELECT id FROM cards WHERE name='*email') AND trash=0").get(ownerEmail);
    const junctionId = emailRow?.left_id ?? null;
    const holderId = junctionId ? db2.prepare("SELECT left_id FROM cards WHERE id=?").get(junctionId)?.left_id ?? null : null;
    const holderName = holderId ? db2.prepare("SELECT name FROM cards WHERE id=?").get(holderId)?.name ?? null : null;
    const statusRow = junctionId ? db2.prepare("SELECT db_content FROM cards WHERE left_id=? AND right_id=(SELECT id FROM cards WHERE name='*status') AND trash=0").get(junctionId) : null;
    const adminRole = db2.prepare(`
      SELECT role_members.db_content FROM cards role_members
      WHERE role_members.left_id = (SELECT id FROM cards WHERE name='Administrator' AND trash=0)
        AND role_members.right_id = (SELECT id FROM cards WHERE name='*members') AND role_members.trash=0
    `).get();
    db2.close();
    dbProof = {
      ownerEmailRowId: emailRow?.id ?? null, holderId, holderName,
      status: statusRow?.db_content ?? null,
      inAdministrators: String(adminRole?.db_content ?? "").includes(`~${holderId}`),
    };
    // the new owner signs in THROUGH THE FORM and holds the admin keys
    await ctx2.clearCookies();
    await page2.goto(O2 + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
    await page2.locator("input[name='card[subcards][+*email][content]']").first().fill(ownerEmail, { timeout: T });
    await page2.locator("input[name='card[subcards][+*password][content]']").first().fill(ownerPassword, { timeout: T });
    await page2.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
    await page2.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
    await page2.waitForTimeout(800);
    signInProof = await page2.evaluate(() => ({ signout: !!document.querySelector("a.signout-link") })).catch((e) => ({ error: String(e) }));
    // Brief cards are Administrator-only read (Brief+*type+*read=[[Administrator]])
    const brief = await visit2("/Brief_01");
    adminProof = { briefStatus: brief.status };
    // the window closes for good
    await ctx2.clearCookies();
    const again = await visit2("/setup");
    windowClosed = { status: again.status, stillOffersForm: await page2.evaluate(() => !!document.querySelector("form.first-run-setup-form")).catch(() => null) };
  }
  await bh2.close().catch(() => {});
  await server2.stop().catch(() => {});
  grade("ACT-127", "S9 first-run setup of the first admin account (form setup, owner signs in, admin keys, window closes)",
    Number(census) === 0 && setupPage.status === 200 && formPresent === true
      && posted !== null && posted.status !== null && posted.status < 400 && posted.bodyHasError === false
      && !!dbProof && dbProof.status === "active" && dbProof.inAdministrators === true
      && !!signInProof && signInProof.signout === true
      && adminProof !== null && adminProof.briefStatus === 200
      && windowClosed !== null && windowClosed.stillOffersForm === false,
    { censusAfterZeroing: Number(census), setupPage, formPresent, posted, dbProof, signInProof, adminProof, windowClosed });
} catch (err) {
  report.failures += 1;
  console.error(`[batch6] ACT-127 FATAL ${err?.stack ?? err}`);
  report.legs.push({ act: "ACT-127", name: "S9 first-run setup of the first admin account", ok: false, detail: { fatal: String(err?.stack ?? err).slice(0, 400) } });
}

writeFileSync(path.join(out, "probe-batch6-result.json"), JSON.stringify(report, null, 2));
console.log(`[batch6] ${report.failures === 0 ? "ALL LEGS GREEN" : report.failures + " LEG(S) RED"} - evidence ${path.join(out, "probe-batch6-result.json")}`);
process.exit(report.failures === 0 ? 0 : 1);

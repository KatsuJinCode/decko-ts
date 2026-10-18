#!/usr/bin/env node
// probe-pageonly-batch3-create-routes-owner-replay.mjs
//
// Batch 3 of the page-only witnessed actions of the 2026-10-18 exhaustive
// re-grade (.runtime/exhaustive/2026-10-18-regrade: 101 of 190 actions graded
// "page-only" — visited and observed, no affordance exercised). Boundary
// coordination so the sibling lanes never overlap, stated as the lane asks:
//
//   ranks 1-10  (batch 1, committed bc81fbb5): ACT-060/032/033/166/168/170/
//               177/068/069/127 (probe-pageonly-top10-write-permission.mjs)
//   ranks 11-20 (batch 2, probe-pageonly-batch2-write-permission.mjs, read on
//               disk before this file was written): ACT-046/047/121/179/041/
//               043/004/015/016/118
//   ranks 21-30 (THIS LANE — the value-ranked list continues write-path and
//               permission actions no committed instrument drives as a real
//               browser affordance): ACT-017/021/025/026/027/028/029/030/031/
//               124
//
// This batch:
//
//   ACT-025  create route shows signed-in chrome and a card form: /new/RichText
//   ACT-026  create route shows signed-in chrome and a card form: /new/Basic
//   ACT-027  create route shows signed-in chrome and a card form: /new/Date
//   ACT-028  create route ...: unknown card name (/Some_New_Name)
//   ACT-029  create route ...: unknown card name /new (/Some_New_Name/new)
//   ACT-030  create route ...: unknown card ?view=new (/Some_New_Name?view=new)
//   ACT-031  create route ...: /card/new
//   ACT-017  create a RichText card via /new/RichText and land on it   (write)
//   ACT-021  the saved RichText content is on the page                 (write read-back)
//   ACT-124  owner replay: every step of the owner's session answers as the
//            owner's did not (no 404, 422, 499 or 500)          (permission/replay)
//
// The create-route legs carry the original battery's contract (status 200,
// signed-in marker, Sign out link, a form.card-form on the page) driven as a
// person's visit; the ACT-017/021 pair drives the create form the way a person
// does — fill the name, type into the TinyMCE editor (textarea fallback is
// recorded, never silently substituted), submit, land on the stored card —
// and grades the write's answer and the content's read-back. ACT-124 replays
// the owner-session shape of tools/edge-signed-in-exercise/lib/owner-checks.mjs
// (ownerReplay) against this fixture with the fixture administrator actor:
// every step's subject that named the owner's own deck resources is mapped to
// its fixture equivalent (his card -> Ada Admin; his pointer's content_options
// -> Topic 001+tags, which has NO content_options rule on this fixture, so
// that one step carries a disclosed witness-grade expectation of "the server
// must not 5xx", not the owner deck's 200), and the steps whose subjects are
// unknown names stay unknown. Every step grades its own request's status.
//
// Every leg drives the affordance the way a person does on the same engine and
// fixture the exhaustive runner grades (reference-harness/browser/engines/ts.json
// on reference-harness/fixtures/synthetic-v1). The engine stages a private copy
// of the fixture deck (lib/engines.mjs), so every write this probe makes dies
// with the staging directory. Exits non-zero if any leg is RED.
//
//   node reference-harness/browser/probe-pageonly-batch3-create-routes-owner-replay.mjs \
//     [--engine reference-harness/browser/engines/ts.json] \
//     [--fixture reference-harness/fixtures/synthetic-v1] [--out <dir>]

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import { richEditorsReady } from "./lib/editor-ready.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const engineManifest = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-pageonly-batch3");
const T = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);

mkdirSync(out, { recursive: true });
const report = { out, fixture: fixtureDir, boundary: {
  ranks_1_10_batch1_committed_bc81fbb5: ["ACT-060", "ACT-032", "ACT-033", "ACT-166", "ACT-168", "ACT-170", "ACT-177", "ACT-068", "ACT-069", "ACT-127"],
  ranks_11_20_batch2_on_disk_probe: ["ACT-046", "ACT-047", "ACT-121", "ACT-179", "ACT-041", "ACT-043", "ACT-004", "ACT-015", "ACT-016", "ACT-118"],
  ranks_21_30_this_lane: ["ACT-017", "ACT-021", "ACT-025", "ACT-026", "ACT-027", "ACT-028", "ACT-029", "ACT-030", "ACT-031", "ACT-124"],
}, legs: [], failures: 0 };

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[batch3] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 900)}`);
}

const stamp = () => Date.now().toString(36);
const urlKey = (name) => name.replaceAll(" ", "_");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const engine = loadEngine(engineManifest);
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
const spec = readJson(path.join(fixtureDir, "deck.json"));
console.log(`[batch3] engine ${engine.name} on ${server.base} (boot ${server.bootMs}ms)`);

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(T);
page.on("dialog", (d) => d.accept().catch(() => {}));
if (!["127.0.0.1", "localhost"].includes(new URL(server.base).hostname)) throw Error("batch3 probe requires the loopback engine");
const O = server.base;

const SIGNED_IN_RE = /decko\.signed_in"[^>]*value="true"|decko\.signed_in\s*=\s*true/;

const signIn = async (who) => {
  const a = spec.actors[who];
  await ctx.clearCookies();
  await page.goto(O + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email, { timeout: T });
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password, { timeout: T });
  await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
  await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
  await page.waitForTimeout(600);
  const cookies = await ctx.cookies(O);
  return { hasSessionCookie: cookies.some((c) => c.name === "decko_ts_session" && c.value.length > 0), url: page.url() };
};
/** A person's visit: the navigation's own answer plus what the page then shows. */
const visit = async (p) => {
  const r = await page.goto(O + p, { waitUntil: "load", timeout: T }).catch(() => null);
  await page.waitForTimeout(500);
  const html = await page.content();
  return {
    path: p,
    status: r ? r.status() : null,
    url: page.url().startsWith(O) ? page.url().slice(O.length - 1) : page.url(),
    signedIn: SIGNED_IN_RE.test(html),
    hasSignOut: /Sign out/.test(html),
    cardForms: await page.locator("form.card-form").count().catch(() => -1),
    html,
  };
};

try {
  const adminIn = await signIn("admin"); // the create routes and the replay run as the fixture administrator

  // ------------------------------------------------------- ACT-025..ACT-031
  // The battery's surface-5 contract per route: 200, signed-in marker, Sign
  // out link, and a form.card-form on the page. The unknown-name routes are
  // GETs — they render a create form but store nothing.
  const ROUTES = [
    ["ACT-025", "/new/RichText"],
    ["ACT-026", "/new/Basic"],
    ["ACT-027", "/new/Date"],
    ["ACT-028", "/Some_New_Name"],
    ["ACT-029", "/Some_New_Name/new"],
    ["ACT-030", "/Some_New_Name?view=new"],
    ["ACT-031", "/card/new"],
  ];
  for (const [act, route] of ROUTES) {
    const seen = await visit(route);
    const namePrefill = await page.locator("form.card-form input[name='card[name]']").first().inputValue().catch(() => null);
    grade(act, `create route shows signed-in chrome and a card form: ${route}`,
      seen.status === 200 && seen.signedIn === true && seen.hasSignOut === true && seen.cardForms > 0,
      { status: seen.status, signedIn: seen.signedIn, hasSignOut: seen.hasSignOut, cardForms: seen.cardForms, namePrefill, url: seen.url });
  }

  // --------------------------------------------- ACT-017 + ACT-021 (write)
  // Create a RichText card through /new/RichText the way a person does: fill
  // the name, type into the rich editor, submit, land on the stored card;
  // then the typed content is on the page.
  {
    const richName = `Harness_Rich_b3_${stamp()}`;
    const marked = `Harness rich text batch3 ${stamp()}`;
    const form = await visit("/new/RichText");
    await page.locator("form.card-form input[name='card[name]']").first().fill(richName, { timeout: T });
    const editorReady = await page.waitForFunction(richEditorsReady, null, { timeout: 20_000 }).then(() => true).catch(() => false);
    let typedVia = null;
    if (editorReady) {
      const iframe = page.locator(".tox-edit-area iframe, iframe.tox-edit-area__iframe").first();
      await iframe.click({ timeout: T });
      await page.keyboard.type(marked, { delay: 5 });
      typedVia = "tinymce";
    } else {
      await page.locator("form.card-form textarea[name='card[content]']").first().fill(marked, { timeout: T });
      typedVia = "textarea-fallback";
    }
    const responded = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/card/create", { timeout: T }).catch(() => null);
    await page.locator("form.card-form button[type=submit], form.card-form input[type=submit]").first().click({ timeout: T }).catch(() => {});
    const post = await responded;
    const postStatus = post ? post.status() : null;
    const landed = await page.waitForURL((u) => decodeURIComponent(u.pathname).endsWith(urlKey(richName)), { timeout: T }).then(() => true).catch(() => false);
    await page.waitForTimeout(800);
    const landedUrl = page.url();
    const landedStatus = landed ? (await visit(`/${urlKey(richName)}`)).status : null;
    grade("ACT-017", "create a RichText card via /new/RichText and land on it",
      form.status === 200 && postStatus !== null && postStatus < 400 && landed === true && landedStatus === 200,
      { formStatus: form.status, postStatus, landed, landedUrl, landedStatus, richName, typedVia });
    // The typed content read back from a fresh load of the stored card.
    const after = await visit(`/${urlKey(richName)}`);
    const dbRow = (() => { try { const d = new DatabaseSync(server.db, { readOnly: true }); const row = d.prepare("SELECT id, name, type_id FROM cards WHERE name=? AND trash=0").get(richName); d.close(); return row ?? null; } catch { return null; } })();
    grade("ACT-021", "the saved RichText content is on the page",
      after.status === 200 && after.html.includes(marked) && dbRow !== null,
      { status: after.status, marker: marked, foundInHtml: after.html.includes(marked), dbRow, typedVia });
  }

  // ------------------------------------------------------------ ACT-124
  // The owner's session, replayed on this fixture with the fixture
  // administrator actor (the shape of owner-checks.mjs ownerReplay; every
  // step grades its own request's status; assets and client aborts are not
  // replayed). Subject mapping, disclosed: his card -> Ada Admin; his
  // pointer's content_options -> Topic 001+tags (no *content_options rule
  // exists on this fixture — that step's expectation is the disclosed
  // witness-grade "must not 5xx", not the owner deck's 200); his /Type/new
  // duplicate-name refusal -> /Topic/new submitting the form as served
  // (Topic is this fixture's existing Cardtype); unknown names stay unknown.
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
    const json = (p) => async () => {
      const out = await page.evaluate(async ({ origin, path }) => {
        const r = await fetch(`${origin}${path}`, { credentials: "include", headers: { "x-requested-with": "XMLHttpRequest" } });
        return { status: r.status, summary: `${r.status} ${(await r.text()).length}B` };
      }, { origin: O, path: p });
      return out;
    };
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
    const deleteName = `Harness_owner_DeleteThisTest_b3_${stamp()}`;
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
} catch (err) {
  report.fatal = String(err?.stack ?? err);
  report.failures += 1;
  console.error(`[batch3] FATAL ${err?.stack ?? err}`);
}

await bh.close().catch(() => {});
await server.stop().catch(() => {});

writeFileSync(path.join(out, "probe-batch3-result.json"), JSON.stringify(report, null, 2));
console.log(`[batch3] ${report.failures === 0 ? "ALL LEGS GREEN" : report.failures + " LEG(S) RED"} - evidence ${path.join(out, "probe-batch3-result.json")}`);
process.exit(report.failures === 0 ? 0 : 1);

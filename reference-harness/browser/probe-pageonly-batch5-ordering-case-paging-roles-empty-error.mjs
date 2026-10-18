#!/usr/bin/env node
// probe-pageonly-batch5-ordering-case-paging-roles-empty-error.mjs
//
// Batch 5 of the page-only witnessed actions of the 2026-10-18 exhaustive
// re-grade (.runtime/exhaustive/2026-10-18-regrade: 101 of 190 actions graded
// "page-only" — visited and observed, no affordance exercised). Boundary
// coordination so the sibling lanes never overlap, stated as the lane asks:
//
//   ranks 1-10  (batch 1, committed bc81fbb5): ACT-060/032/033/166/168/170/
//               177/068/069/127
//   ranks 11-20 (batch 2, committed 5bdda29f): ACT-046/047/121/179/041/043/
//               004/015/016/118
//   ranks 21-30 (batch 3, committed cacce253): ACT-017/021/025/026/027/028/
//               029/030/031/124
//   ranks 31-40 (sibling lane pageonly-31-40, in flight — THIS LANE'S
//               derivation of the next ten by the same value criterion, the
//               write-guard / session-persistence / history-reads cluster of
//               the remaining pool): ACT-051/052/005/006/007/038/054/095/039/
//               040. Not driven here; every leg below is disjoint from it.
//   ranks 41-50 (THIS LANE): ACT-181, ACT-184, ACT-186, ACT-188, ACT-189 —
//               the cross-cutting test-type-gap group. The naive ten-window
//               shrank to five OPEN items because the evidence state moved
//               under the batch plan today: the 10:19:23Z 241-check full run
//               (source c9d7d2ea) turned fresh local passes for ACT-009/010/
//               058/063/065 (matrix recomputed 17:10:43Z cites its per-check
//               rows), and ACT-066/067 are run-cleanup meta-actions with
//               recorded passes and no member-facing affordance to drive.
//
// Skipped as already instrumented (direct reads, this session):
//
//   ACT-089 (C6)  tools/edge-signed-in-exercise/checks-cover-b.mjs:972-984
//   ACT-091 (M1)  checks-cover-b.mjs:1013-1030
//   ACT-095 (H1)  checks-cover-b.mjs:1110-1116
//   ACT-096 (N5)  checks-cover-b.mjs:1118-1159
//   ACT-104 (N3)  checks-cover-b.mjs:749-773
//   ACT-105 (N8)  checks-cover-b.mjs:775-788
//   ACT-106 (N11) checks-cover-b.mjs:790-800
//   ACT-110/111/112/114/115 (owner-audit rows 1-2) — committed owner-checks
//                 (lib/owner-checks.mjs:21-74), measured PASS on the local
//                 target at today's source: .runtime/edge-signed-in/
//                 2026-10-18-runner-harness-full-run/report.md:87-92
//
// This batch:
//
//   ACT-181  result ordering: newest-first ordering of the Changes feed and
//            search results. The matrix's whole-harness entry is FAIL (last
//            graded 2026-10-16 at 50717cca; the 17:10:43Z recompute note:
//            "no run since the 2026-10-16 native run grades 'result
//            ordering'/'newest-first'") — the one standing RED in the pool.
//   ACT-184  case-insensitivity guarantees across search, names, and slugs
//            (only prior verdict: the 2026-10-16 private-probe run).
//   ACT-186  pagination math: offsets, limits, and page counts beyond
//            page-2-differs (same stale-verdict status).
//   ACT-188  affordance visibility per role: which controls render for which
//            actor (same status, plus an open instrument-gap marker at
//            docs/handoffs/edge-demo-coordination.md:920).
//   ACT-189  empty-vs-error rendering: empty result sets must not render as
//            errors and vice versa (same stale-verdict status).
//
// Every leg drives the affordance the way a person does — creating and
// editing cards through the real /new/PlainText forms, reading the feed the
// navbar's own Recent Changes link opens, submitting the navbox search,
// following the search page's own Next control, switching actor sessions —
// on the same engine and fixture the exhaustive runner grades
// (reference-harness/browser/engines/ts.json on
// reference-harness/fixtures/synthetic-v1). Every graded assertion carries a
// positive control (the marker must exist for the role/page that should show
// it), so no leg can pass vacuously. The engine stages a private copy of the
// fixture deck (lib/engines.mjs), so every write this probe makes dies with
// the staging directory. Exits non-zero if any leg is RED.
//
//   node reference-harness/browser/probe-pageonly-batch5-ordering-case-paging-roles-empty-error.mjs \
//     [--engine reference-harness/browser/engines/ts.json] \
//     [--fixture reference-harness/fixtures/synthetic-v1] [--out <dir>]

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
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
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-pageonly-batch5");
const T = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);

mkdirSync(out, { recursive: true });
const report = { out, fixture: fixtureDir, boundary: {
  ranks_1_10_batch1_committed_bc81fbb5: ["ACT-060", "ACT-032", "ACT-033", "ACT-166", "ACT-168", "ACT-170", "ACT-177", "ACT-068", "ACT-069", "ACT-127"],
  ranks_11_20_batch2_committed_5bdda29f: ["ACT-046", "ACT-047", "ACT-121", "ACT-179", "ACT-041", "ACT-043", "ACT-004", "ACT-015", "ACT-016", "ACT-118"],
  ranks_21_30_batch3_committed_cacce253: ["ACT-017", "ACT-021", "ACT-025", "ACT-026", "ACT-027", "ACT-028", "ACT-029", "ACT-030", "ACT-031", "ACT-124"],
  ranks_31_40_sibling_lane_this_lanes_derivation: ["ACT-051", "ACT-052", "ACT-005", "ACT-006", "ACT-007", "ACT-038", "ACT-054", "ACT-095", "ACT-039", "ACT-040"],
  ranks_41_50_this_lane: ["ACT-181", "ACT-184", "ACT-186", "ACT-188", "ACT-189"],
  skips_already_instrumented: {
    "ACT-089": "checks-cover-b.mjs:972-984", "ACT-091": "checks-cover-b.mjs:1013-1030",
    "ACT-095": "checks-cover-b.mjs:1110-1116", "ACT-096": "checks-cover-b.mjs:1118-1159",
    "ACT-104": "checks-cover-b.mjs:749-773", "ACT-105": "checks-cover-b.mjs:775-788",
    "ACT-106": "checks-cover-b.mjs:790-800",
    "ACT-110": "owner-checks.mjs:21-74 via 2026-10-18-runner-harness-full-run/report.md:87",
    "ACT-111": "same full run, report.md:88", "ACT-112": "same full run, report.md:89",
    "ACT-114": "same full run, report.md:91", "ACT-115": "same full run, report.md:92",
    "ACT-009": "full-run fresh local pass at c9d7d2ea (matrix recompute 17:10:43Z)",
    "ACT-010": "same", "ACT-058": "same", "ACT-063": "same", "ACT-065": "same",
    "ACT-066": "run-cleanup meta-action, recorded pass, no member affordance",
    "ACT-067": "same",
  },
}, legs: [], failures: 0 };

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[batch5] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 900)}`);
}

const stamp = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const urlKey = (name) => name.replaceAll(" ", "_");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
/** Card-name keying: rendered rows print canonical spaces, URLs carry
 *  underscores; row matching is space/underscore- and case-insensitive
 *  (the row-reader contract checks-cover-b.mjs:1146-1149 records). */
const key = (t) => String(t ?? "").replace(/_/g, " ").trim().toLowerCase();

const engine = loadEngine(engineManifest);
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
const spec = readJson(path.join(fixtureDir, "deck.json"));
console.log(`[batch5] engine ${engine.name} on ${server.base} (boot ${server.bootMs}ms)`);

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(T);
page.on("dialog", (d) => d.accept().catch(() => {}));
if (!["127.0.0.1", "localhost"].includes(new URL(server.base).hostname)) throw Error("batch5 probe requires the loopback engine");
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
  return { hasSessionCookie: cookies.some((c) => c.name === "decko_ts_session" && c.value.length > 0) };
};

/** A person's visit: status, signed-in marker, page HTML. */
const visit = async (p) => {
  const r = await page.goto(O + p, { waitUntil: "load", timeout: T }).catch(() => null);
  await page.waitForTimeout(500);
  const html = await page.content();
  return { path: p, status: r ? r.status() : null, html, signedIn: SIGNED_IN_RE.test(html) };
};

/** Create a PlainText card through the real /new/PlainText form (its content
 *  control is a visible textarea — verified this session; RichText/Basic hide
 *  theirs behind TinyMCE). Witnesses the create POST and the landing. */
const createPlainText = async (name, body) => {
  const form = await visit("/new/PlainText");
  await page.locator("form.card-form input[name='card[name]']").first().fill(name, { timeout: T });
  await page.locator("form.card-form textarea[name='card[content]']").first().fill(body, { timeout: T });
  const responded = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/card/create", { timeout: T }).catch(() => null);
  await page.locator("form.card-form button[type=submit], form.card-form input[type=submit]").first().click({ timeout: T }).catch(() => {});
  const post = await responded;
  const postStatus = post ? post.status() : null;
  const dbRow = (() => { try { const d = new DatabaseSync(server.db, { readOnly: true }); const row = d.prepare("SELECT id, name, type_id FROM cards WHERE name=? AND trash=0").get(name); d.close(); return row ?? null; } catch { return null; } })();
  return { formStatus: form.status, postStatus, dbRow };
};

/** Edit a PlainText card through its own edit form, appending a marker. */
const editAppend = async (name, marker) => {
  const form = await visit(`/${urlKey(name)}?view=edit`);
  const box = page.locator("form.card-form textarea[name='card[content]']").first();
  const current = await box.inputValue().catch(() => null);
  if (current === null) return { formStatus: form.status, updated: false, note: "no visible content textarea" };
  await box.fill(`${current}\n${marker}`, { timeout: T });
  const responded = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/update/${urlKey(name)}`, { timeout: T }).catch(() => null);
  await page.locator("form.card-form button[type=submit], form.card-form input[type=submit]").first().click({ timeout: T }).catch(() => {});
  const post = await responded;
  return { formStatus: form.status, postStatus: post ? post.status() : null, updated: true };
};

/** The search results page's own row reader: the rendered result list is
 *  cardListView's .search-result-list > .search-result-item children; names
 *  come off [data-card-name] (checks-cover-b.mjs:1143-1149 records why). */
const searchRows = () => page.evaluate(() =>
  [...document.querySelectorAll("#main .search-result-list > .search-result-item")]
    .map((row) => row.querySelector("[data-card-name]")?.getAttribute("data-card-name"))
    .filter(Boolean));

/** The Recent Changes feed's row reader: #main [data-card-name] in DOM order,
 *  excluding the *recent card itself (the feed's own slot). Verified against
 *  the rendered feed this session (discovery pass 3). */
const feedRows = () => page.evaluate(() =>
  [...document.querySelectorAll("#main [data-card-name]")]
    .map((n) => n.getAttribute("data-card-name"))
    .filter((t) => t && t !== "*recent"));

/** The navbox search, submitted the way a person submits it. */
const navboxSearch = async (term) => {
  await page.goto(O + "/", { waitUntil: "load", timeout: T }).catch(() => {});
  await page.waitForTimeout(400);
  const input = page.locator("form.search-box-form input[name='query[keyword]']:visible").first();
  await input.fill(term, { timeout: T });
  const responded = page.waitForResponse((r) => new URL(r.url()).pathname === "/*search" || new URL(r.url()).pathname === "/%2Asearch", { timeout: T }).catch(() => null);
  await input.press("Enter", { timeout: T }).catch(() => {});
  await responded.catch(() => {});
  await page.waitForTimeout(700);
  return { url: page.url(), rows: await searchRows() };
};

/** The create-form type control's options, for the per-role census. */
const typeOptions = async () => page.evaluate(() => {
  const sel = [...document.querySelectorAll("form.card-form select")].find((s) => s.getAttribute("name") === "card[type]");
  return sel ? [...sel.querySelectorAll("option")].map((o) => o.textContent.trim()) : null;
});

try {
  const adminIn = await signIn("admin");
  if (!adminIn.hasSessionCookie) throw Error("batch5 admin sign-in failed");

  // ------------------------------------------------------------ ACT-181
  // Result ordering: newest-first across the Changes feed (the navbar's own
  // Recent Changes link) and the search results. Setup: card A created, then
  // card B created (B newer than A's creation), then A edited (A's update is
  // the newest act of the three). Both cards carry a shared search term.
  {
    const s = stamp();
    const term = `OrdTerm${s}`;
    const nameA = `Harness Order b5 A ${s}`;
    const nameB = `Harness Order b5 B ${s}`;
    const mkA = await createPlainText(nameA, `${term} alpha first creation`);
    const mkB = await createPlainText(nameB, `${term} beta second creation`);
    const editA = await editAppend(nameA, `${term} gamma third act — A edited last`);
    // the Changes feed, driven through the navbar's own link
    await page.goto(O + "/", { waitUntil: "load", timeout: T }).catch(() => {});
    await page.waitForTimeout(400);
    const feedLink = page.locator("nav a", { hasText: /recent changes/i }).first();
    let feedDrive = { via: null };
    if ((await feedLink.count()) > 0) {
      await feedLink.click({ timeout: T }).catch(() => {});
      await page.waitForTimeout(900);
      feedDrive.via = "navbar link click";
    } else {
      await visit("/*recent");
      feedDrive.via = "direct /*recent fallback";
    }
    feedDrive.url = page.url();
    feedDrive.rows = await feedRows();
    const ka = key(nameA), kb = key(nameB);
    const iA = feedDrive.rows.findIndex((t) => key(t) === ka);
    const iB = feedDrive.rows.findIndex((t) => key(t) === kb);
    grade("ACT-181", "the Changes feed lists the most recently updated card first",
      mkA.postStatus !== null && mkA.postStatus < 400 && mkB.postStatus !== null && mkB.postStatus < 400
        && editA.updated && editA.postStatus !== null && editA.postStatus < 400
        && iA >= 0 && iB >= 0 && iA < iB,
      { nameA, nameB, mkA, mkB, editA, feedDrive, indexA: iA, indexB: iB });
    // search results, driven through the navbox
    const search = await navboxSearch(term);
    const jA = search.rows.findIndex((t) => key(t) === ka);
    const jB = search.rows.findIndex((t) => key(t) === kb);
    grade("ACT-181", "the keyword search results list the most recently updated card first",
      jA >= 0 && jB >= 0 && jA < jB,
      { term, searchUrl: search.url, rows: search.rows.slice(0, 8), indexA: jA, indexB: jB });
  }

  // ------------------------------------------------------------ ACT-184
  // Case-insensitivity across names, slugs, and search. One PlainText card
  // with a mixed-case name and a mixed-case content token; each leg visits
  // the case-variant the claim names, with the exact-case render as the
  // positive control.
  {
    const s = stamp();
    const name = `Harness Case Probe b5 ${s}`;
    const token = `Br5CaseToken${s}`;
    const mk = await createPlainText(name, `body with ${token} inside`);
    const control = await visit(`/${urlKey(name)}`);
    const controlOk = control.status === 200 && control.html.includes(token);
    const lower = await visit(`/${urlKey(name).toLowerCase()}`);
    // The not-the-create-form discriminator is a VISIBLE card[name] prompt
    // (the unknown-name fallback renders one; a resolved card page does not).
    // A bare /card-form/ substring is the wrong instrument here: signed-in
    // page chrome (the navbox slot) also carries form.card-form nodes — run 1
    // REDed on exactly that while tokenFound proved the card HAD resolved.
    const lowerCreatePrompts = await page.locator("form.card-form input[name='card[name]']:visible").count().catch(() => -1);
    grade("ACT-184", "a card's name resolves case-insensitively (lowercase URL shows the same card)",
      controlOk && lower.status === 200 && lower.html.includes(token) && lowerCreatePrompts === 0,
      { name, urlTried: `/${urlKey(name).toLowerCase()}`, controlStatus: control.status, lowerStatus: lower.status, tokenFound: lower.html.includes(token), visibleCreateNamePrompts: lowerCreatePrompts });
    const spaced = await visit(`/${encodeURIComponent(name)}`);
    grade("ACT-184", "the slug round-trips (percent-encoded spaces resolve to the same card)",
      controlOk && spaced.status === 200 && spaced.html.includes(token),
      { urlTried: `/${encodeURIComponent(name)}`, spacedStatus: spaced.status, tokenFound: spaced.html.includes(token) });
    const loSearch = await navboxSearch(token.toLowerCase());
    const hiSearch = await navboxSearch(token.toUpperCase());
    const inLo = loSearch.rows.some((t) => key(t) === key(name));
    const inHi = hiSearch.rows.some((t) => key(t) === key(name));
    grade("ACT-184", "keyword search matches regardless of the query's letter case",
      controlOk && inLo && inHi,
      { token, lowerRows: loSearch.rows.slice(0, 6), upperRows: hiSearch.rows.slice(0, 6), foundLower: inLo, foundUpper: inHi });
  }

  // ------------------------------------------------------------ ACT-186
  // Pagination math beyond page-2-differs: window disjointness, offset
  // advance, page-count arithmetic, and graceful oversized offset — driven
  // on the fixture's own Topic result set through the page's own Next
  // control (the same surface probe-search-paging.mjs witnessed page 2 on).
  {
    const first = await visit("/*search?query[keyword]=Topic");
    await page.waitForTimeout(700);
    const snap = () => page.evaluate(() => ({
      active: document.querySelector(".paging .page-item.active")?.textContent.trim() ?? null,
      ids: [...document.querySelectorAll("#main .search-result-list > .search-result-item")].map((i) => i.querySelector("[data-card-id]")?.getAttribute("data-card-id")).filter(Boolean),
      pageItems: [...document.querySelectorAll(".paging .page-item")].map((i) => i.textContent.trim()),
    }));
    const p1 = await snap();
    const windows = [p1.ids];
    const offsets = [];
    let hasNext = await page.locator("a.card-paging-link[aria-label='Next']").first().isVisible().catch(() => false);
    const nextHrefs = [];
    let guard = 0;
    while (hasNext && guard < 15) {
      const href = await page.locator("a.card-paging-link[aria-label='Next']").first().getAttribute("href", { timeout: T }).catch(() => null);
      nextHrefs.push(href);
      if (href) offsets.push(new URL(href, O).searchParams.get("offset"));
      await page.locator("a.card-paging-link[aria-label='Next']").first().click({ timeout: T }).catch(() => {});
      await page.waitForTimeout(800);
      const p = await snap();
      windows.push(p.ids);
      hasNext = await page.locator("a.card-paging-link[aria-label='Next']").first().isVisible().catch(() => false);
      guard += 1;
    }
    const pLast = await snap();
    const flat = windows.flat();
    const dupes = flat.length - new Set(flat).size;
    const walkedPages = windows.length;
    const numericPageItems = pLast.pageItems.map((t) => parseInt(t, 10)).filter((n) => Number.isFinite(n));
    const lastPageInControl = numericPageItems.length ? Math.max(...numericPageItems) : null;
    const size = p1.ids.length;
    const total = flat.length;
    const countMathOk = lastPageInControl !== null
      ? walkedPages === lastPageInControl && total > (lastPageInControl - 1) * size && total <= lastPageInControl * size
      : false;
    grade("ACT-186", "pagination windows are disjoint, advance by offset, and the control's page count matches the walked pages",
      first.status === 200 && p1.active === "1" && pLast.active === String(walkedPages)
        && dupes === 0 && walkedPages >= 2 && offsets.length === walkedPages - 1
        && new Set(offsets).size === offsets.length && countMathOk,
      { pagesWalked: walkedPages, windowSizes: windows.map((w) => w.length), duplicateRows: dupes, offsets, pageItems: pLast.pageItems, lastPageInControl, total, size, countMathOk });
    // an oversized signed-in offset must degrade gracefully, not 5xx
    const over = await page.evaluate(async ({ origin }) => {
      const r = await fetch(`${origin}/*search?query[keyword]=Topic&offset=100000`, { credentials: "include" });
      return { status: r.status, head: (await r.text()).slice(0, 120) };
    }, { origin: O });
    grade("ACT-186", "an offset beyond the last page degrades gracefully (never a 5xx)",
      over.status !== null && over.status < 500,
      { requested: "/*search?query[keyword]=Topic&offset=100000", ...over });
  }

  // ------------------------------------------------------------ ACT-189
  // Empty-vs-error: a zero-match search renders the empty search surface;
  // a missing card renders an error; neither shape leaks into the other.
  {
    const gib = `ZqxNoMatch${stamp()}`;
    const empty = await visit(`/*search?query[keyword]=${gib}`);
    const emptyRows = await searchRows();
    const emptyShape = await page.evaluate(() => ({
      hasSearchBox: !!document.querySelector("form.search-box-form input[name='query[keyword]'], input[name='query[keyword]']"),
      heading: [...document.querySelectorAll("#main h1, #main h2")].map((h) => h.textContent.trim()).slice(0, 2),
      jsonErrorInPage: document.documentElement.innerHTML.includes('"error"'),
    }));
    grade("ACT-189", "an empty result set renders as the search surface with zero rows, not an error",
      empty.status === 200 && emptyRows.length === 0 && emptyShape.hasSearchBox && !emptyShape.jsonErrorInPage,
      { term: gib, status: empty.status, rows: emptyRows.length, ...emptyShape });
    const missing = await page.evaluate(async ({ origin, path }) => {
      const r = await fetch(`${origin}${path}`, { credentials: "include" });
      let body = null;
      try { body = JSON.parse(await r.text()); } catch { /* not json */ }
      return { status: r.status, error: body?.error ?? null };
    }, { origin: O, path: `/No_Such_Card_${stamp()}.json` });
    grade("ACT-189", "a missing card renders an error answer, not an empty success",
      missing.status === 404 && typeof missing.error === "string" && missing.error.length > 0,
      missing);
    grade("ACT-189", "the empty and error renders stay distinct (no shape leaks either way)",
      empty.status === 200 && emptyRows.length === 0 && !emptyShape.jsonErrorInPage && missing.status === 404,
      { emptyStatus: empty.status, emptyRows: emptyRows.length, emptyJsonError: emptyShape.jsonErrorInPage, missingStatus: missing.status });
  }

  // ------------------------------------------------------------ ACT-188
  // Affordance visibility per role: the create-form type control renders a
  // role-scoped option set. Positive controls: the structure types MUST be
  // present for the administrator and the shared types MUST be present for
  // both roles — a leg whose positive control fails is RED, not pass.
  {
    const adminVisit = await visit("/new/Basic");
    const adminTypes = await typeOptions();
    const adminShared = adminTypes?.includes("RichText");
    await signIn("member");
    const memberVisit = await visit("/new/Basic");
    const memberTypes = await typeOptions();
    const memberShared = memberTypes?.includes("RichText");
    const structure = ["Cardtype", "Layout", "Skin", "CSS", "SCSS", "JavaScript", "CoffeeScript"];
    const leakedIntoMember = structure.filter((t) => memberTypes?.includes(t));
    const adminHasStructure = structure.every((t) => adminTypes?.includes(t));
    grade("ACT-188", "the create-form type control renders per role (structure types admin-only)",
      adminVisit.status === 200 && memberVisit.status === 200
        && adminHasStructure && adminShared && memberShared && leakedIntoMember.length === 0
        && memberVisit.signedIn,
      { adminTypeCount: adminTypes?.length ?? null, memberTypeCount: memberTypes?.length ?? null, structureTypesRequiredForAdmin: structure, leakedIntoMember, adminSharedRichText: adminShared, memberSharedRichText: memberShared, adminTypes, memberTypes });
  }
} catch (e) {
  report.fatal = String(e?.stack ?? e);
  console.error("[batch5] FATAL", report.fatal);
} finally {
  writeFileSync(path.join(out, "probe-batch5-result.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`[batch5] legs ${report.legs.length}, failures ${report.failures}, evidence ${path.join(out, "probe-batch5-result.json")}`);
  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
  process.exit(report.failures > 0 || report.fatal ? 1 : 0);
}

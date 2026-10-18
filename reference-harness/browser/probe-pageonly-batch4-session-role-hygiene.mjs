#!/usr/bin/env node
// probe-pageonly-batch4-session-role-hygiene.mjs
//
// Batch 4 of the page-only witnessed actions of the 2026-10-18 exhaustive
// re-grade (.runtime/exhaustive/2026-10-18-regrade: 101 of 190 actions graded
// "page-only" — visited and observed, no affordance exercised). Boundary
// coordination with the committed sibling lanes, read off their files before
// this one was written:
//
//   ranks 1-10  batch 1, committed bc81fbb5 (probe-pageonly-top10-write-permission.mjs):
//               ACT-060/032/033/166/168/170/177/068/069/127
//   ranks 11-20 batch 2 (probe-pageonly-batch2-write-permission.mjs):
//               ACT-046/047/121/179/041/043/004/015/016/118
//   ranks 21-30 batch 3 (probe-pageonly-batch3-create-routes-owner-replay.mjs):
//               ACT-017/021/025/026/027/028/029/030/031/124
//   ranks 31-40 (THIS LANE): ACT-005/006/007/188/184/189/186/010/009/065
//
// Every candidate between ranks 31 and 40 that another committed instrument
// already measures was dropped, on a direct read of that instrument this
// session: ACT-051≈C10 and ACT-052≈C8 (checks-cover-b.mjs:253-284), ACT-089≈C6
// (batch 1's ACT-033 leg), ACT-091≈M1/095≈H1/096≈N5/104≈N3/105≈N8/106≈N11
// (checks-cover-b.mjs meta.capabilityIds line 1235 and the record() legs at
// 765/785/797/1026/1114/1157), ACT-110/111/112/114/115
// (tools/edge-signed-in-exercise/lib/owner-checks.mjs:34-72), ACT-039/040≈N5
// (the same checks-cover-b leg), ACT-058≈N2 (checks-cql-member.mjs +
// checks-cql-navbox.mjs), ACT-181 (composition of batch 1's ACT-170 feed leg
// and the N5 search leg). ACT-038/054 are the card-history path another
// session is profiling right now — out of this lane by instruction. Left for
// a later batch: ACT-063 (timing aggregate) and ACT-066/067 (harness-cleanup
// contracts, not person affordances).
//
// This batch:
//
//   ACT-005  stays signed in after browser Back                        (session)
//   ACT-006  stays signed in after reload                              (session)
//   ACT-007  stays signed in after leaving the site and returning      (session)
//   ACT-188  affordance visibility per role: which controls render for
//            which actor (the fixture's Brief+*type+*read=Administrator
//            rule — rule row 639, id-resolved in the fixture db — must put
//            the read+edit affordances in the admin's set and in neither
//            the member's page nor her edit route)          (permission)
//   ACT-184  case-insensitivity guarantees across search, names, and
//            slugs (a case-mangled /hOmE resolves the canonical Home card,
//            the navbox suggests it for "hOmE", and the search results
//            list it for "hOmE")                          (guard)
//   ACT-189  empty-vs-error rendering: an empty result set renders as an
//            empty result surface (not an error), and a denial renders as
//            an error (not an empty result list)          (guard)
//   ACT-186  pagination math: offsets, limits, and page counts beyond
//            page-2-differs (declared count vs page count, paging-context
//            offset arithmetic, pairwise-disjoint pages, last-page
//            remainder math)                              (cross-cutting)
//   ACT-010  no console errors on the signed-in pages this walk visits  (hygiene)
//   ACT-009  no blocked or 4xx/5xx subresource on those pages           (hygiene)
//   ACT-065  no request returned a 5xx anywhere in this run             (hygiene)
//
// The session trio is graded here as first-class actions: batch 2 drove the
// same family (reload, Back, leave-and-return) but explicitly recorded it as
// "family context, not graded" beside its ACT-004 grade.
//
// Every leg drives the affordance the way a person does — real Back/reload/
// leave-return navigations, the navbox typed into and submitted with Enter,
// the pager's own links clicked — on the same engine and fixture the
// exhaustive runner grades (reference-harness/browser/engines/ts.json on
// reference-harness/fixtures/synthetic-v1). The engine stages a private copy
// of the fixture deck (lib/engines.mjs), so nothing this probe writes
// survives the run. Exits non-zero if any leg is RED.
//
//   node reference-harness/browser/probe-pageonly-batch4-session-role-hygiene.mjs \
//     [--engine reference-harness/browser/engines/ts.json] \
//     [--fixture reference-harness/fixtures/synthetic-v1] [--out <dir>]

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const engineManifest = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-pageonly-batch4");
const T = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);

mkdirSync(out, { recursive: true });
const report = { out, fixture: fixtureDir, boundary: {
  ranks_1_10_batch1_committed_bc81fbb5: ["ACT-060", "ACT-032", "ACT-033", "ACT-166", "ACT-168", "ACT-170", "ACT-177", "ACT-068", "ACT-069", "ACT-127"],
  ranks_11_20_batch2_on_disk_probe: ["ACT-046", "ACT-047", "ACT-121", "ACT-179", "ACT-041", "ACT-043", "ACT-004", "ACT-015", "ACT-016", "ACT-118"],
  ranks_21_30_batch3_committed: ["ACT-017", "ACT-021", "ACT-025", "ACT-026", "ACT-027", "ACT-028", "ACT-029", "ACT-030", "ACT-031", "ACT-124"],
  ranks_31_40_this_lane: ["ACT-005", "ACT-006", "ACT-007", "ACT-188", "ACT-184", "ACT-189", "ACT-186", "ACT-010", "ACT-009", "ACT-065"],
}, legs: [], failures: 0 };

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[batch4] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 900)}`);
}

const stamp = () => Date.now().toString(36);
const urlKey = (name) => name.replaceAll(" ", "_");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const engine = loadEngine(engineManifest);
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
const spec = readJson(path.join(fixtureDir, "deck.json"));
console.log(`[batch4] engine ${engine.name} on ${server.base} (boot ${server.bootMs}ms)`);

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(T);
page.on("dialog", (d) => d.accept().catch(() => {}));
if (!["127.0.0.1", "localhost"].includes(new URL(server.base).hostname)) throw Error("batch4 probe requires the loopback engine");
const O = server.base;

const SIGNED_IN_RE = /decko\.signed_in"[^>]*value="true"|decko\.signed_in\s*=\s*true/;

// ---------------------------------------------------------------- collectors
// Whole-run hygiene evidence: every response the context sees is screened for
// 5xx (ACT-065); subresource (non-navigation) 4xx/5xx/aborted loads and
// console/page errors are recorded per named surface (ACT-009/010).
let surface = "boot";
const consoleErrors = [];
const badSubresources = [];
const serverErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push({ surface, type: msg.type(), text: String(msg.text()).slice(0, 300) });
});
page.on("pageerror", (err) => consoleErrors.push({ surface, type: "pageerror", text: String(err).slice(0, 300) }));
ctx.on("response", (r) => {
  try {
    const status = r.status();
    const nav = r.request().isNavigationRequest();
    if (status >= 500) serverErrors.push({ surface, url: r.url(), status, nav });
    if (!nav && status >= 400) badSubresources.push({ surface, url: r.url(), status });
  } catch { /* closing contexts */ }
});
page.on("requestfailed", (req) => {
  try {
    if (!req.isNavigationRequest()) {
      badSubresources.push({ surface, url: req.url(), status: `failed:${req.failure()?.errorText ?? "unknown"}` });
    }
  } catch { /* closing contexts */ }
});

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
  surface = p;
  const r = await page.goto(O + p, { waitUntil: "load", timeout: T }).catch(() => null);
  await page.waitForTimeout(600);
  const html = await page.content();
  return {
    path: p,
    status: r ? r.status() : null,
    url: page.url().startsWith(O) ? page.url().slice(O.length - 1) : page.url(),
    signedIn: SIGNED_IN_RE.test(html),
    hasSignOut: /Sign out/.test(html),
    html,
  };
};
/** The signed-in proof a person's own chrome shows: the sign-out link in the
 *  live DOM and the session cookie in the jar. */
const chromeProof = async () => {
  const got = await page.evaluate(() => ({
    signout: !!document.querySelector("a.signout-link"),
    signinLink: !!document.querySelector("a[href*='*signin']"),
  })).catch(() => ({ signout: false, signinLink: null }));
  const cookies = await ctx.cookies(O);
  return { ...got, sessionCookie: cookies.some((c) => c.name === "decko_ts_session" && c.value.length > 0) };
};

try {
  const memberIn = await signIn("member"); // the session, case, search and pagination legs run as the ordinary member

  // ------------------------------------------------- ACT-005 / 006 / 007
  // The session-survival family as first-class graded legs (batch 2 drove the
  // same three moves as ungraded family context beside ACT-004). Contract per
  // move: after the navigation, the member is still signed in — the sign-out
  // link is in the chrome, the session cookie is in the jar, and the answer
  // was not an error.
  {
    await visit("/");
    await visit("/Home");
    // ACT-005 — browser Back
    const backResp = await page.goBack({ waitUntil: "load", timeout: T }).catch(() => null);
    await page.waitForTimeout(600);
    const afterBack = await chromeProof();
    grade("ACT-005", "stays signed in after browser Back",
      page.url() === O + "/" && (backResp === null || backResp.status() < 400)
        && afterBack.signout === true && afterBack.sessionCookie === true,
      { backUrl: page.url(), backStatus: backResp ? backResp.status() : null, ...afterBack });

    // ACT-006 — reload
    const reloadResp = await page.reload({ waitUntil: "load", timeout: T }).catch(() => null);
    await page.waitForTimeout(600);
    const afterReload = await chromeProof();
    grade("ACT-006", "stays signed in after reload",
      (reloadResp ? reloadResp.status() : null) === 200
        && afterReload.signout === true && afterReload.sessionCookie === true,
      { reloadStatus: reloadResp ? reloadResp.status() : null, ...afterReload });

    // ACT-007 — leave the site entirely, come back
    const left = await page.goto("about:blank", { timeout: T }).then(() => true).catch(() => false);
    const back = await visit("/");
    const afterReturn = await chromeProof();
    grade("ACT-007", "stays signed in after leaving the site and returning",
      left === true && back.status === 200
        && afterReturn.signout === true && afterReturn.sessionCookie === true,
      { left, returnStatus: back.status, ...afterReturn });
  }

  // --------------------------------------------- ACT-009 + ACT-010 (walk)
  // The signed-in page contract, walked as the member across the run's main
  // surfaces: no console/page errors (ACT-010), no blocked or 4xx/5xx
  // subresource (ACT-009). The collectors above record per surface; this walk
  // window is snapshotted so the deliberate denial legs later in the run can
  // never pollute these grades.
  {
    const surfaces = ["/", "/Home", "/Topic_001", "/*recent", "/Mira_Member"];
    const ce0 = consoleErrors.length, bs0 = badSubresources.length;
    const walked = [];
    for (const p of surfaces) {
      const v = await visit(p);
      walked.push({ path: p, status: v.status, signedIn: v.signedIn });
    }
    const ce = consoleErrors.slice(ce0), bs = badSubresources.slice(bs0);
    grade("ACT-010", "no console errors on the signed-in page",
      walked.every((w) => w.status === 200 && w.signedIn === true) && ce.length === 0,
      { walked, consoleErrors: ce });
    grade("ACT-009", "no blocked or 4xx/5xx subresource on the signed-in page",
      bs.length === 0,
      { badSubresources: bs.slice(0, 12), count: bs.length });
  }

  // ------------------------------------------------------------- ACT-184
  // Case-insensitivity across the three surfaces a person touches, on the
  // contract both engines implement (the key is ActiveSupport's underscore of
  // the name: "HOME"/"home"/"Home" all fold to key "home"; a mixed-case
  // variant like "hOmE" folds to "h_om_e" — a DIFFERENT key, verified against
  // the installed activesupport this session: ruby -ractive_support ... puts
  // "hOmE".underscore → h_om_e, and the port's inflect.ts underscore returns
  // the byte-identical forms). So: the slug folds case for same-key variants
  // (/HOME and /home both resolve the canonical Home card, neither renders
  // the create surface), the navbox suggests the card for a same-key variant
  // ("HOME" offers the goto item), and the search surface folds case fully
  // ("hOmE" — a different key — still LISTS Home in the results).
  {
    const capSlug = await visit("/HOME");
    const capShape = await page.evaluate(() => ({
      homeSlot: [...document.querySelectorAll("#main [data-card-name='Home'], [data-card-name='Home']")].length,
      createOffer: [...document.querySelectorAll("form.card-form input[name='card[name]']")].some((i) => ["HOME", "home"].includes(i.value)),
    })).catch(() => null);
    const lowSlug = await visit("/home");
    const lowShape = await page.evaluate(() => ({
      homeSlot: [...document.querySelectorAll("#main [data-card-name='Home'], [data-card-name='Home']")].length,
      createOffer: [...document.querySelectorAll("form.card-form input[name='card[name]']")].some((i) => ["HOME", "home"].includes(i.value)),
    })).catch(() => null);
    // recorded context, not graded: the mixed-case variant is a different key
    // in both engines (h_om_e), so the original renders create for it too
    const mixSlug = await visit("/hOmE");
    const mixRendersCreate = await page.evaluate(() =>
      [...document.querySelectorAll(".card-slot")].some((s) => s.className.includes("new-view")),
    ).catch(() => null);

    surface = "navbox-suggest";
    await visit("/");
    const input = page.locator("form.search-box-form input[name='query[keyword]']:visible").first();
    await input.click({ timeout: T }).catch(() => {});
    await input.pressSequentially("HOME", { delay: 40 }).catch(() => {});
    await page.waitForTimeout(2500);
    const menu = await page.evaluate(() =>
      [...document.querySelectorAll(".ui-menu-item, .ui-autocomplete li, .ui-autocomplete a, .autocomplete-item")].slice(0, 12).map((el) => {
        const a = el.matches("a") ? el : el.querySelector("a");
        return { t: el.textContent.replace(/\s+/g, " ").trim().slice(0, 60), h: a?.getAttribute("href") ?? null, cls: el.className.slice(0, 80) };
      }),
    ).catch(() => null);
    // the goto suggestion's rendered label carries the material icon ligature
    // ("arrow_forward Home") and its item class is autocomplete-item-goto —
    // match the class, not the href (the menu items carry none)
    const suggestsHome = (Array.isArray(menu) ? menu : []).some((m) =>
      /goto/.test(m.cls ?? "") && /home/i.test(m.t ?? ""));

    // the search leg: the member submits her own search for a mixed-case (different-key)
    // word, and the search surface still lists the canonical card
    await input.fill("hOmE", { timeout: T }).catch(() => {});
    await input.press("Enter", { timeout: T }).catch(() => {});
    await page.waitForURL((u) => u.searchParams.get("query[keyword]") === "hOmE", { timeout: T }).catch(() => {});
    await page.waitForTimeout(1200);
    const searchUrl = page.url();
    const resultNames = await page.evaluate(() =>
      [...document.querySelectorAll("#main .search-result-item")].map((row) => row.querySelector("[data-card-name]")?.getAttribute("data-card-name")).filter(Boolean).slice(0, 10),
    ).catch(() => null);
    grade("ACT-184", "case-insensitivity guarantees across search, names, and slugs",
      capSlug.status === 200 && capShape?.homeSlot > 0 && capShape?.createOffer === false
        && lowSlug.status === 200 && lowShape?.homeSlot > 0 && lowShape?.createOffer === false
        && suggestsHome === true
        && Array.isArray(resultNames) && resultNames.some((n) => String(n).toLowerCase() === "home"),
      { capSlug: { status: capSlug.status, ...capShape }, lowSlug: { status: lowSlug.status, ...lowShape }, mixSlugContext: { status: mixSlug.status, rendersCreate: mixRendersCreate }, suggestMenu: menu, suggestsHome, searchUrl: searchUrl.slice(O.length - 1), resultNames });
  }

  // ------------------------------------------------------------- ACT-189
  // Empty-vs-error rendering, both directions. Empty: the member's search for
  // a gibberish keyword answers 200, renders the results surface with ZERO
  // result rows, and does not render an error. Vice versa: the member's read
  // of a card the fixture denies her (Brief 01 — the deck's Brief+*type+*read
  // rule names Administrator, fixture rule row 639) renders a DENIAL, not an
  // empty result list.
  {
    const gib = "zzqx" + stamp() + "vw";
    surface = "empty-search";
    await visit("/");
    const input = page.locator("form.search-box-form input[name='query[keyword]']:visible").first();
    await input.click({ timeout: T }).catch(() => {});
    await input.fill(gib, { timeout: T }).catch(() => {});
    await input.press("Enter", { timeout: T }).catch(() => {});
    await page.waitForURL((u) => (u.searchParams.get("query[keyword]") ?? "").includes(gib), { timeout: T }).catch(() => {});
    await page.waitForTimeout(1500);
    const empty = await page.evaluate(() => {
      const main = document.querySelector("#main");
      const rows = main ? main.querySelectorAll(".search-result-item").length : -1;
      const text = main ? main.textContent.replace(/\s+/g, " ").trim().slice(0, 300) : null;
      return { rows, mainText: text, errorText: /sorry|exception|internal error|something went wrong/i.test(main ? main.textContent : "") };
    }).catch(() => null);
    const emptyStatus = await page.evaluate(() => null).then(() => null).catch(() => null);

    surface = "denied-brief";
    const denial = await visit("/Brief_01");
    const denialShape = await page.evaluate(() => {
      const main = document.querySelector("#main");
      const text = main ? main.textContent.replace(/\s+/g, " ").trim().slice(0, 300) : null;
      const rows = main ? main.querySelectorAll(".search-result-item").length : -1;
      return { deniedText: /sorry|permission|denied|not allowed/i.test(main ? main.textContent : ""), resultRowsPresent: rows, mainText: text };
    }).catch(() => null);
    grade("ACT-189", "empty result sets must not render as errors and vice versa",
      empty !== null && empty.rows === 0 && empty.errorText === false
        && (denial.status !== null && denial.status < 500)
        && denialShape !== null && (denial.status >= 400 || denialShape.deniedText === true)
        && denialShape.resultRowsPresent === 0,
      { gib, emptyPage: { rows: empty?.rows, errorText: empty?.errorText, mainText: empty?.mainText }, emptyStatus, denialStatus: denial.status, denialShape });
  }

  // ------------------------------------------------------------- ACT-186
  // Pagination math on the member's own /*search listing (the deck's match-all
  // search): the declared count must imply the pager's page count, the paging
  // context must carry the offset arithmetic, consecutive pages must be
  // pairwise disjoint, and the last page must hold exactly the remainder.
  {
    surface = "/*search-paging";
    const first = await visit("/*search");
    await page.waitForTimeout(1200);
    const page1 = await page.evaluate(() => {
      const ctxEl = document.querySelector("#main .paging-context");
      const nums = ctxEl ? (ctxEl.textContent.match(/\d+/g) ?? []).map(Number) : null;
      const links = [...document.querySelectorAll("#main .card-paging-link")].map((a) => {
        const off = new URLSearchParams(a.search).get("offset");
        return { text: a.textContent.trim(), offset: off === null ? null : Number(off), limit: Number(new URLSearchParams(a.search).get("limit") ?? NaN) };
      });
      const rows = [...document.querySelectorAll("#main .search-result-item")].map((row) => row.querySelector("[data-card-name]")?.getAttribute("data-card-name")).filter(Boolean);
      return { context: nums, links, rowNames: rows };
    }).catch(() => null);
    // context format: "1 - 20 of <count>"
    const count = Array.isArray(page1?.context) && page1.context.length >= 3 ? page1.context[page1.context.length - 1] : null;
    const limit = page1?.links?.find((l) => Number.isFinite(l.limit))?.limit ?? null;
    const maxOffset = page1?.links?.reduce((m, l) => (l.offset !== null && l.offset > m ? l.offset : m), 0) ?? null;

    let page2 = null, last = null;
    if (count !== null && limit !== null && maxOffset !== null && maxOffset >= limit) {
      // page 2: click the pager's own link
      const link2 = page.locator("#main .card-paging-link").filter({ hasText: /^2$/ }).first();
      if ((await link2.count().catch(() => 0)) > 0) {
        await link2.click({ timeout: T }).catch(() => {});
        await page.waitForTimeout(2200);
        page2 = await page.evaluate(() => {
          const ctxEl = document.querySelector("#main .paging-context");
          const nums = ctxEl ? (ctxEl.textContent.match(/\d+/g) ?? []).map(Number) : null;
          const active = document.querySelector("#main .pagination .page-item.active .page-link")?.textContent.trim() ?? null;
          const rows = [...document.querySelectorAll("#main .search-result-item")].map((row) => row.querySelector("[data-card-name]")?.getAttribute("data-card-name")).filter(Boolean);
          return { context: nums, active, rowNames: rows };
        }).catch(() => null);
      }
      // last page: the pager's max-offset link
      const lastLink = page.locator(`#main .card-paging-link[href*='offset=${maxOffset}']`).first();
      if ((await lastLink.count().catch(() => 0)) > 0) {
        await lastLink.click({ timeout: T }).catch(() => {});
        await page.waitForTimeout(2200);
        last = await page.evaluate(() => {
          const ctxEl = document.querySelector("#main .paging-context");
          const nums = ctxEl ? (ctxEl.textContent.match(/\d+/g) ?? []).map(Number) : null;
          const active = document.querySelector("#main .pagination .page-item.active .page-link")?.textContent.trim() ?? null;
          const rows = [...document.querySelectorAll("#main .search-result-item")].map((row) => row.querySelector("[data-card-name]")?.getAttribute("data-card-name")).filter(Boolean);
          return { context: nums, active, rowNames: rows };
        }).catch(() => null);
      }
    }
    const expectedPages = count !== null && limit !== null ? Math.ceil(count / limit) : null;
    const lastOffset = maxOffset;
    const remainderOk = last !== null && count !== null ? last.rowNames.length === Math.max(0, count - lastOffset) : false;
    const disjoint = (() => {
      if (!page1?.rowNames?.length || !page2?.rowNames?.length) return false;
      const s1 = new Set(page1.rowNames.map((n) => n.toLowerCase()));
      const s2 = new Set(page2.rowNames.map((n) => n.toLowerCase()));
      if (page2.rowNames.some((n) => s1.has(n.toLowerCase()))) return false;
      if (last?.rowNames?.length && [...s1].concat([...s2]).some((n) => last.rowNames.some((m) => m.toLowerCase() === n))) return false;
      return true;
    })();
    const contextArithmetic = page2 !== null && Array.isArray(page2.context) && page2.context.length >= 3
      ? page2.context[0] === limit + 1 && page2.context[1] === 2 * limit
      : false;
    grade("ACT-186", "pagination math: offsets, limits, and page counts beyond page-2-differs",
      first.status === 200 && count !== null && limit !== null && expectedPages !== null
        && Number.isFinite(expectedPages) && maxOffset === (expectedPages - 1) * limit
        && page2 !== null && contextArithmetic === true
        && disjoint === true && remainderOk === true,
      { firstStatus: first.status, count, limit, expectedPages, maxOffset, page2, last, contextArithmetic, disjoint, remainderOk });
  }

  // ------------------------------------------------------------- ACT-188
  // Affordance visibility per role, on the surface the fixture's own rules
  // gate: Brief+*type+*read = Administrator (fixture rule row 639,
  // id-resolved: cards.id 639 left=Brief right=*type). The admin must hold
  // the read and edit affordances (page 200 presenting Brief 01; the edit
  // route's form carrying an editable content field), the member must hold
  // NEITHER: her page read denies, and her edit route's /update/Brief_01
  // form carries NO editable content field. (The committed S5 check pins the
  // denial-inside-edit-chrome rendering as the designed denial surface, so
  // the role line is the editable field, not the form chrome.)
  {
    const briefFormShape = () => page.evaluate(() => {
      const form = [...document.querySelectorAll("form.card-form")].find((f) => /\/update\/Brief_01$/.test(f.getAttribute("action") ?? ""));
      return {
        formPresent: !!form,
        editableContentFields: form ? form.querySelectorAll("textarea[name='card[content]'], input[name='card[content]']").length : null,
      };
    }).catch(() => null);
    surface = "member-brief";
    const mPage = await visit("/Brief_01");
    const mPageShape = await page.evaluate(() => {
      const main = document.querySelector("#main");
      return {
        deniedText: /sorry|permission|denied|not allowed/i.test(main ? main.textContent : ""),
        presented: document.querySelector("#main .card-slot.titled-view")?.getAttribute("data-card-name") ?? null,
      };
    }).catch(() => null);
    const mEdit = await visit("/Brief_01/edit");
    const mEditShape = await briefFormShape();
    const mEditDenied = await page.evaluate(() =>
      /sorry|permission|denied|not allowed/i.test(document.body.textContent.slice(0, 4000)),
    ).catch(() => null);

    surface = "admin-brief";
    await signIn("admin");
    const aPage = await visit("/Brief_01");
    const aPageShape = await page.evaluate(() => ({
      presented: document.querySelector("#main .card-slot.titled-view")?.getAttribute("data-card-name") ?? null,
    })).catch(() => null);
    const aEdit = await visit("/Brief_01/edit");
    const aEditShape = await briefFormShape();

    const memberHoldsNeither =
      (mPage.status >= 400 || mPageShape?.deniedText === true)
      && mPageShape?.presented !== "Brief 01"
      && mEditDenied === true
      && mEditShape?.formPresent === true
      && mEditShape?.editableContentFields === 0;
    const adminHoldsBoth = aPage.status === 200 && aPageShape?.presented === "Brief 01"
      && aEditShape?.formPresent === true && (aEditShape?.editableContentFields ?? 0) > 0;
    grade("ACT-188", "affordance visibility per role: which controls render for which actor",
      memberHoldsNeither === true && adminHoldsBoth === true,
      { rule: "Brief+*type+*read=Administrator (fixture rule row 639)", member: { pageStatus: mPage.status, ...mPageShape, editStatus: mEdit.status, editDeniedText: mEditDenied, ...mEditShape }, admin: { pageStatus: aPage.status, ...aPageShape, editStatus: aEdit.status, ...aEditShape } });
  }

  // ------------------------------------------------------------- ACT-065
  // Whole-run aggregate: no request this run saw — navigation or subresource,
  // member or admin — answered 5xx.
  grade("ACT-065", "no request returned a 5xx",
    serverErrors.length === 0,
    { serverErrors: serverErrors.slice(0, 12), count: serverErrors.length });

  report.memberIn = memberIn;
} catch (err) {
  report.fatal = String(err?.stack ?? err);
  report.failures += 1;
  console.error(`[batch4] FATAL ${err?.stack ?? err}`);
}

report.collectors = { consoleErrors, badSubresources, serverErrors };
await bh.close().catch(() => {});
await server.stop().catch(() => {});
writeFileSync(path.join(out, "probe-batch4-result.json"), JSON.stringify(report, null, 2));
console.log(`[batch4] ${report.failures === 0 ? "ALL LEGS GREEN" : report.failures + " LEG(S) RED"} - evidence ${path.join(out, "probe-batch4-result.json")}`);
process.exit(report.failures === 0 ? 0 : 1);

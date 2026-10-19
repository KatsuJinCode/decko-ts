#!/usr/bin/env node
// probe-pageonly-batch7-ranks81-90.mjs
//
// Batch 7 of the page-only witnessed actions of the 2026-10-18 exhaustive
// re-grade (101 of 190 actions graded "page-only" - visited and observed, no
// affordance exercised). Boundary coordination, stated so the sibling lanes
// never overlap: this lane takes ranks 81-90 of the canonical witnessed-only
// list (the regrade's 101 page-only ids in id order). The window is:
//
//   ACT-164  CM1  comment on a card
//   ACT-166  C19  create a wanted-card offer from a search miss
//   ACT-167  C20  create a plus card (+right) from the UI
//   ACT-168  C21  type-scoped create route
//   ACT-170  N13  recent-changes feed renders as a feed
//   ACT-171  N15  hashtag/reference navigation
//   ACT-172  N16  RSS format view of a search or card
//   ACT-174  UI2  help popover on editor fields
//   ACT-175  A6   role checkbox editing on account/rules surfaces
//   ACT-177  REL1 related-cards panel content
//
// Sibling windows already committed (dedup record, not re-claims): ranks 1-10
// bc81fbb5, 11-20 5bdda29f, 21-30 cacce253, 31-40 93771deb, 41-50 7deabd7e,
// 61-70 47915f69; ranks 51-60 rode the tip commit d69c2369; ranks 71-80 and
// 91-100 are in flight on their own tip worktrees. This lane drives only the
// ten ids above.
//
// Every leg drives the affordance the way a person does - the card's own
// comment box, the search box's own autocomplete offer, the wanted card's own
// pre-named create form, the /new/Note create route, the navbar's Recent
// Changes link, a [[reference]] link in a card's own body, the .rss format
// mark, the rule editor's help popover, the navbar's role checkboxes, and
// the related panel's own accordion - on the same engine and fixture the
// exhaustive runner grades (reference-harness/browser/engines/ts.json on
// reference-harness/fixtures/synthetic-v1). Leg shapes are mirrored from the
// measured drives recorded in
// reference-harness/browser/lib/exhaustive-ungradeable-batch2-targets.mjs
// (cases 2-11) and probe-pageonly-top10-write-permission.mjs; the selectors
// and thresholds are those files', not fresh guesses. Every graded assertion
// carries a positive control, so no leg can pass vacuously. The engine stages
// a private copy of the fixture deck (lib/engines.mjs), so every write this
// probe makes dies with the staging directory. Exits non-zero if any leg is
// RED.
//
//   node reference-harness/browser/probe-pageonly-batch7-ranks81-90.mjs \
//     [--engine reference-harness/browser/engines/ts.json] \
//     [--fixture reference-harness/fixtures/synthetic-v1] [--out <dir>]

import { mkdirSync, writeFileSync, readFileSync, cpSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const engineManifest = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-pageonly-ranks81-90");
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

// The ENGINE's own build record. The engine boots from its own checkout (the
// disposable pure-tip worktree), so its provenance is recorded verbatim and
// is the measurement's build identity: sourceDiffSha256 e3b0c442... is the
// clean-tree value, i.e. the built tree carries NO uncommitted source.
const engineRepo = path.resolve(path.dirname(engineManifest), "..", "..", "..");
let engineBuild = null;
try {
  engineBuild = JSON.parse(readFileSync(path.join(engineRepo, ".runtime", "browser-build.json"), "utf8"));
} catch { /* recorded as null */ }
// The A6 leg decodes the visitor session with the ENGINE's own decoder, so the
// dist under measurement is the engine worktree's dist, never this repo's.
const engineDist = path.resolve(args["engine-dist"] ?? path.join(engineRepo, "dist"));

const report = {
  out,
  fixture: fixtureDir,
  boundary: {
    ranks_81_90_this_lane: ["ACT-164", "ACT-166", "ACT-167", "ACT-168", "ACT-170", "ACT-171", "ACT-172", "ACT-174", "ACT-175", "ACT-177"],
    sibling_windows_not_driven: {
      "ranks 1-10": "batch1 committed bc81fbb5",
      "ranks 11-20": "batch2 committed 5bdda29f",
      "ranks 21-30": "batch3 committed cacce253",
      "ranks 31-40": "batch4 committed 93771deb",
      "ranks 41-50": "batch5 committed 7deabd7e",
      "ranks 51-60": "tip commit d69c2369",
      "ranks 61-70": "batch6-owner-rows committed 47915f69",
      "ranks 71-80": "sibling lane, its own tip worktree",
      "ranks 91-100": "sibling lane, its own tip worktree",
      "rank 101 (ACT-190)": "out of window",
    },
  },
  source: {
    probeCommit: sourceCommit,
    dirty: !!dirtyPorcelain,
    // Disclosed, not hidden: this checkout's working tree may carry OTHER
    // lanes' uncommitted writes. They are NOT part of the measurement - the
    // engine boots from engineBuild's own record below.
    dirtyPorcelain: dirtyPorcelain || "",
    engineManifest,
    engineRepo,
    engineBuild,
    engineSourceCommit: engineBuild?.sourceCommit ?? null,
    engineSourceDiffSha256: engineBuild?.sourceDiffSha256 ?? null,
    engineDistSha256: engineBuild?.distSha256 ?? null,
    fixtureSha256: treeDigest(fixtureDir),
  },
  legs: [],
  witnesses: [],
  failures: 0,
};

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[batch7] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 700)}`);
}
/** A non-graded observation (recorded, never a pass/fail). */
function witness(selector, detail) {
  report.witnesses.push({ selector, detail });
  console.log(`[batch7] witness ${selector}: ${JSON.stringify(detail).slice(0, 500)}`);
}

const stamp = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const urlKey = (name) => name.replaceAll(" ", "_");
const spaceForm = (name) => name.replaceAll("_", " ");
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** The mods' public dir (TinyMCE theme, ace modes) is a gitignored Ruby-setup
 *  artifact, not engine code (ts-server.mjs:69-77 - "both engines serve the
 *  same files"). A checkout missing it (a fresh pure-tip build worktree) gets
 *  a wrapper manifest that boots THAT checkout's server with
 *  DECKO_MOD_PUBLIC_DIR pointed at this repo's copy; the engine dist stays the
 *  target checkout's own build. */
function resolveEngineManifest() {
  const modDir = (r) => path.join(r, "reference-harness", "oracle", "app", "public");
  if (existsSync(path.join(modDir(engineRepo), "mod"))) return engineManifest;
  if (!existsSync(path.join(modDir(repo), "mod"))) return engineManifest;
  const manifest = JSON.parse(readFileSync(engineManifest, "utf8"));
  const wrapperPath = path.join(out, "engine-with-mod-dir.json");
  writeFileSync(wrapperPath, JSON.stringify({
    ...manifest,
    description: (manifest.description ?? "") + " (batch7 wrapper: boots the engine checkout's server with DECKO_MOD_PUBLIC_DIR from the probe repo - the engine checkout lacks the gitignored mod-public artifact)",
    command: ["node", path.join(path.dirname(engineManifest), "ts-server.mjs")],
    env: { ...(manifest.env ?? {}), DECKO_MOD_PUBLIC_DIR: modDir(repo) },
  }, null, 2));
  return wrapperPath;
}

const engine = loadEngine(resolveEngineManifest());
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
const spec = readJson(path.join(fixtureDir, "deck.json"));
const O = server.base;
console.log(`[batch7] engine ${engine.name} on ${O} (boot ${server.bootMs}ms)`);

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(T);
page.on("dialog", (d) => d.accept().catch(() => {}));
if (!["127.0.0.1", "localhost"].includes(new URL(O).hostname)) throw Error("batch7 probe requires the loopback engine");

const signIn = async (who) => {
  const a = spec.actors[who];
  await ctx.clearCookies();
  await page.goto(O + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email, { timeout: T });
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password, { timeout: T });
  await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
  await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
  await page.waitForTimeout(700);
  return { signedInChrome: (await page.locator("a.signout-link").first().count().catch(() => 0)) > 0 };
};
const visit = async (p) => {
  const r = await page.goto(O + p, { waitUntil: "load", timeout: T }).catch(() => null);
  await page.waitForTimeout(800);
  return { status: r ? r.status() : null, url: page.url() };
};
const evalPage = (fn, arg) => page.evaluate(fn, arg).catch((e) => ({ error: String(e?.message ?? e) }));
const settle = () => page.waitForTimeout(900);
const mainText = () => page.evaluate(() => document.querySelector("#main")?.innerText ?? document.body.innerText).catch(() => "");
const jsonRead = (name) =>
  fetch(`${O}/${encodeURIComponent(name)}.json`, { headers: { connection: "close" } })
    .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null) }))
    .catch(() => ({ status: null, parsed: null }));

/** Create a card the way a person does: open /new/<type>, fill the form's own
 *  fields, press its own submit, and witness the POST plus the stored row. */
const createCard = async (name, type, content) => {
  const opened = await visit(`/new/${type}`);
  const form = page.locator("form.card-form").filter({ has: page.locator(".create-submit-button") })
    .filter({ has: page.locator("input[name='card[name]']") }).first();
  if ((await form.count().catch(() => 0)) === 0) return { ok: false, status: opened.status, note: "no create form", name };
  await form.locator("input[name='card[name]']").first().fill(name, { timeout: T }).catch(() => {});
  const box = form.locator("textarea[name='card[content]']").first();
  if ((await box.count().catch(() => 0)) > 0) await box.fill(content ?? "").catch(() => {});
  const pending = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/card/create",
    { timeout: T },
  ).then((r) => ({ r }), (e) => ({ error: String(e?.message ?? e) }));
  await form.locator(".create-submit-button").first().click({ timeout: T }).catch(() => {});
  const seen = await pending;
  if (seen.error) return { ok: false, status: opened.status, note: String(seen.error).slice(0, 140), name };
  await seen.r.finished().catch(() => {});
  await settle();
  const stored = await jsonRead(name);
  return { ok: seen.r.status() < 400, status: seen.r.status(), name, storedStatus: stored.status, storedName: stored.parsed?.name ?? null };
};

/** A second, independently signed-in request channel (the member's own
 *  context). C19's offer requires ok?(:create), which the anonymous surface
 *  measures false by design, so the offer is driven through this channel. */
const newActorRequest = async (who) => {
  const a = spec.actors[who];
  const actorCtx = await ctx.browser().newContext();
  const actorPage = await actorCtx.newPage();
  actorPage.setDefaultTimeout(T);
  await actorPage.goto(O + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
  await actorPage.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email, { timeout: T });
  await actorPage.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password, { timeout: T });
  await actorPage.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
  await actorPage.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
  return { request: actorCtx.request, ctx: actorCtx, close: () => actorCtx.close().catch(() => {}) };
};

try {
  const admin = await signIn("admin");
  if (!admin.signedInChrome) throw Error("batch7 admin sign-in failed");

  // ---------------------------------------------------------------- ACT-164
  // CM1 "comment on a card" (batch2 case 2): the comment box is the card's own
  // ?view=comment_box form - textarea[name="card[comment]"] posting to
  // /update/<parent> - and the contract is "the comment is on the card's page
  // afterwards", graded on the fresh page's #main AND the stored content.
  {
    const s = stamp();
    const parent = `Harness_exhaustive_cm1_${s}`;
    const commentText = `CM1 exhaustive comment ${s}`;
    const created = await createCard(parent, "RichText", `CM1 parent ${s}`);
    const boxView = await visit(`/${encodeURIComponent(parent)}?view=comment_box`);
    const form = page.locator("form.card-form").filter({ has: page.locator('textarea[name="card[comment]"]') }).first();
    const formCount = await form.count().catch(() => 0);
    let action = null;
    let postStatus = null;
    if (formCount > 0 && created.ok) {
      action = await form.getAttribute("action").catch(() => null);
      await form.locator('textarea[name="card[comment]"]').fill(commentText, { timeout: T }).catch(() => {});
      const pending = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/update/"), { timeout: T })
        .then((r) => ({ r }), (e) => ({ error: String(e?.message ?? e) }));
      await form.getByRole("button", { name: "Comment", exact: true }).click({ timeout: T }).catch(() => {});
      const seen = await pending;
      postStatus = seen.r ? seen.r.status() : null;
      await settle();
    }
    await visit(`/${encodeURIComponent(parent)}`);
    const shows = await mainText();
    const stored = await jsonRead(parent);
    grade("ACT-164", "the card's comment box posts a comment and the comment is on the card's page afterwards",
      created.ok && boxView.status === 200 && formCount > 0
        && postStatus !== null && postStatus < 400
        && shows.includes(commentText) && stored.status === 200 && String(stored.parsed?.db_content ?? "").includes(commentText),
      { parent, commentText, createStatus: created.status, boxView, formCount, action, postStatus, rendered: shows.includes(commentText), storedJsonStatus: stored.status, stored: String(stored.parsed?.db_content ?? "").includes(commentText) });
  }

  // ---------------------------------------------------------------- ACT-166
  // C19 "create a wanted-card offer from a search miss" (batch2 case 3): the
  // search box's own search_box_complete JSON `add` item is the offer; its url
  // is the new card's own path, which serves a create form pre-named for the
  // missing card; submitting stores it.
  {
    const wanted = `zz_wanted_${stamp()}`;
    const member = await newActorRequest("member");
    const completeRes = await member.request
      .get(`${O}/*search/search_box_complete.json?term=${encodeURIComponent(wanted)}`)
      .catch((e) => ({ error: String(e?.message ?? e) }));
    const completeBody = completeRes.error ? "" : await completeRes.text().catch(() => "");
    let items = [];
    try { items = JSON.parse(completeBody) ?? []; } catch { items = []; }
    if (!Array.isArray(items)) items = [];
    const addItem = items.find((i) => i?.action === "add") ?? null;
    const addItemUrl = typeof addItem?.url === "string" ? addItem.url : null;
    let formStatus = null;
    let prefilled = [];
    if (addItemUrl) {
      const formRes = await member.request.get(addItemUrl.startsWith("/") ? O + addItemUrl : addItemUrl).catch((e) => ({ error: String(e?.message ?? e) }));
      formStatus = formRes.error ? null : formRes.status();
      const formHtml = formRes.error ? "" : await formRes.text().catch(() => "");
      prefilled = (formHtml.match(/name="card\[name\]"[^>]*value="([^"]*)"/g) ?? []).map((m) => /value="([^"]*)"/.exec(m)?.[1] ?? "");
      if (prefilled.length === 0) {
        prefilled = (formHtml.match(/value="([^"]*)"[^>]*name="card\[name\]"/g) ?? []).map((m) => /value="([^"]*)"/.exec(m)?.[1] ?? "");
      }
    }
    let replay = { status: null, json: { status: null, parsed: null } };
    if (addItem) {
      const res = await member.request.post(`${O}/card/create`, {
        headers: { origin: O },
        form: { "card[name]": wanted, "card[type]": "Basic", "card[content]": `C19 wanted card body ${stamp()}`, "success[redirect]": "true" },
        maxRedirects: 0,
      }).catch((e) => ({ error: String(e?.message ?? e) }));
      replay.status = res.error ? null : res.status();
      replay.json = await jsonRead(wanted);
    }
    await member.close();
    grade("ACT-166", "the search miss's own offer names the missing card and the offered create stores it",
      !completeRes.error && completeRes.status() === 200 && addItem !== null && addItemUrl !== null
        && String(addItemUrl).toLowerCase().includes(wanted)
        && formStatus !== null && formStatus < 400
        && prefilled.some((v) => v.replaceAll("_", " ") === spaceForm(wanted) || v === wanted)
        && replay.status !== null && replay.status < 400 && replay.json.status === 200
        && (replay.json.parsed?.name === wanted || replay.json.parsed?.name === spaceForm(wanted)),
      { wanted, completeStatus: completeRes.error ? null : completeRes.status(), actions: items.map((i) => i?.action), addItemUrl, addItemValue: addItem?.value ?? null, formStatus, prefilled, replayStatus: replay.status, jsonStatus: replay.json.status, storedName: replay.json.parsed?.name ?? null, requestedSpellings: [wanted, spaceForm(wanted)] });
  }

  // ---------------------------------------------------------------- ACT-167
  // C20 "create a plus card (+right) from the UI" (batch2 case 4): a RichText
  // card nesting an unknown +*right member renders it as a.wanted-card; that
  // link's own page serves a create form PRE-NAMED for the +*right name;
  // submitting stores it; a fresh read renders it as a known card. Fixture
  // names carry NO underscore (the C20 urlKey lesson: a literal underscore
  // cannot round-trip a URL).
  {
    const s = stamp();
    const cardName = `HarnessExhaustiveC20${s}`;
    const rightName = `${cardName}+*right+${s}`;
    // PlainText, not RichText: the /new/RichText form's content control is
    // TinyMCE-owned and its textarea stays empty (measured this session -
    // hidden.value "" after fill), so a body a reference link must render out
    // of is only storable through the PlainText form's own live textarea.
    const card = await createCard(cardName, "PlainText", `[[${rightName}]]`);
    const setSeed = await createCard(`${cardName}+*right`, "List", "");
    await visit(`/${encodeURIComponent(cardName)}`);
    const wantedLink = await evalPage((name) =>
      [...document.querySelectorAll("a.wanted-card")]
        .map((a) => ({ href: a.getAttribute("href"), text: (a.textContent ?? "").trim().slice(0, 60) }))
        .filter((a) => decodeURIComponent(a.href ?? "").includes(name)), rightName);
    let servedName = null;
    let postStatus = null;
    if ((wantedLink ?? []).length > 0 && card.ok) {
      await page.locator("a.wanted-card").first().click({ timeout: T }).catch(() => {});
      await page.waitForTimeout(1500);
      await settle();
      servedName = await evalPage(() => document.querySelector("form.card-form input[name='card[name]']")?.value ?? null);
      if (servedName !== null) {
        const pending = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: T }).catch(() => null);
        await page.locator("form.card-form .create-submit-button").first().click({ timeout: T }).catch(() => {});
        const res = await pending;
        postStatus = res ? res.status() : null;
        await page.waitForTimeout(1000);
      }
    }
    const rightJson = await jsonRead(rightName);
    await visit(`/${encodeURIComponent(cardName)}`);
    const knownAfter = await evalPage((name) =>
      [...document.querySelectorAll("a")].some((a) => decodeURIComponent(a.getAttribute("href") ?? "").includes(name) && (a.getAttribute("class") ?? "").includes("known-card")), rightName);
    grade("ACT-167", "a +*right member is offered as a wanted card, its own create form is pre-named, and submitting stores it as a known card",
      card.ok && setSeed.ok && (wantedLink ?? []).length > 0 && servedName === rightName
        && postStatus !== null && postStatus < 400 && rightJson.status === 200 && knownAfter === true,
      { cardName, rightName, createStatus: card.status, setSeedStatus: setSeed.status, wantedLink, servedName, postStatus, rightJsonStatus: rightJson.status, knownAfter });
  }

  // ---------------------------------------------------------------- ACT-168
  // C21 "type-scoped create route" (batch2 case 5): /new/Note serves the create
  // form already typed as Note, and the card the form stores carries that type
  // - witnessed by the stored row's own .json type_name.
  {
    const name = `Harness_exhaustive_c21_${stamp()}`;
    const res = await visit("/new/Note");
    const formShape = await evalPage(() => {
      const form = [...document.querySelectorAll("form.card-form")].find((f) => (f.getAttribute("action") ?? "").includes("/card/create")) ?? null;
      return form
        ? { action: form.getAttribute("action"), typeId: form.querySelector("[name='card[type_id]']")?.value ?? null, hasNameField: !!form.querySelector("input[name='card[name]']") }
        : null;
    });
    let postStatus = null;
    if (formShape && formShape.typeId !== null && formShape.hasNameField) {
      await page.locator("form.card-form input[name='card[name]']").first().fill(name, { timeout: T }).catch(() => {});
      const pending = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: T }).catch(() => null);
      await page.locator("form.card-form .create-submit-button").first().click({ timeout: T }).catch(() => {});
      const seen = await pending;
      postStatus = seen ? seen.status() : null;
      await page.waitForTimeout(1000);
    }
    const stored = await jsonRead(name);
    grade("ACT-168", "the type-scoped create route serves the form carrying its type and the stored card carries that type",
      res.status !== null && res.status < 400 && formShape && formShape.typeId !== null && formShape.hasNameField
        && postStatus !== null && postStatus < 400 && stored.status === 200 && stored.parsed?.type_name === "Note",
      { route: "/new/Note", name, status: res.status, formShape, postStatus, jsonStatus: stored.status, storedTypeName: stored.parsed?.type_name ?? null });
  }

  // ---------------------------------------------------------------- ACT-170
  // N13 "recent-changes feed renders as a feed" (batch2 case 6): after a real
  // write, /*recent renders accordion entries with card links, the fresh act
  // FIRST, and the first entry expands into the act's action list. Scoped to
  // #main (the N5 lesson, e184dcaa).
  {
    const name = `Harness_exhaustive_n13_${stamp()}`;
    const newContent = `N13 edited body ${stamp()}`;
    const created = await createCard(name, "Basic", "feed seed");
    let updateStatus = null;
    if (created.ok) {
      const upd = await page.evaluate(async ({ origin, card, content }) => {
        const body = new URLSearchParams({ "card[content]": content, "success[redirect]": "true" });
        const r = await fetch(`${origin}/update/${encodeURIComponent(card)}`, {
          method: "POST", body, credentials: "include", redirect: "manual", headers: { origin },
        });
        return r.status;
      }, { origin: O, card: name, content: newContent }).catch(() => null);
      updateStatus = upd;
    }
    await visit("/*recent");
    const feed = await evalPage(() =>
      [...document.querySelectorAll("#main .accordion .accordion-item")].slice(0, 6).map((it) => ({
        title: (it.querySelector(".col-8")?.textContent ?? "").replace(/\s+/g, " ").trim(),
        links: [...it.querySelectorAll(".accordion-header a.known-card")].map((a) => a.getAttribute("href")).slice(0, 4),
      })));
    let expanded = null;
    const firstBtn = page.locator("#main .accordion-item .accordion-button").first();
    if ((await firstBtn.count().catch(() => 0)) > 0) {
      await firstBtn.click({ timeout: T }).catch(() => {});
      await page.waitForTimeout(2000);
      await settle();
      expanded = await evalPage(() => {
        const body = document.querySelector("#main .accordion-item .accordion-collapse .accordion-body, #main .accordion-item .accordion-body");
        return {
          bodyText: body ? body.textContent.replace(/\s+/g, " ").trim().slice(0, 200) : null,
          hasActionList: !!document.querySelector("#main .accordion-item .action-list, #main .accordion-item .action_summary-view"),
        };
      });
    }
    grade("ACT-170", "the recent-changes feed renders as a feed: the fresh act is first, entries carry card links, and the first entry expands into its act list",
      created.ok && updateStatus !== null && updateStatus < 400 && (feed ?? []).length > 0 && feed[0].title.includes(name)
        && (feed ?? []).some((f) => f.links.length > 0)
        && expanded && expanded.bodyText !== null && expanded.hasActionList,
      { name, createStatus: created.status, updateStatus, feedTitles: (feed ?? []).map((f) => f.title), entryCount: (feed ?? []).length, entriesWithLinks: (feed ?? []).filter((f) => f.links.length > 0).length, expanded });
  }

  // ---------------------------------------------------------------- ACT-171
  // N15 "hashtag/reference navigation" (batch2 case 7): a card whose body is
  // [[Target]] renders a reference link; following it lands on the referenced
  // card, which renders its own main slot.
  {
    const s = stamp();
    const target = `Harness_exhaustive_n15_target_${s}`;
    const referrer = `Harness_exhaustive_n15_referrer_${s}`;
    const targetCard = await createCard(target, "PlainText", `N15 target content ${s}`);
    // PlainText, not RichText: /new/RichText's content control is TinyMCE-owned
    // and stays empty through a fill (measured this session), so only the
    // PlainText form's own live textarea stores the [[reference]] body.
    const referrerCard = await createCard(referrer, "PlainText", `Before [[${target}]] after`);
    await visit(`/${encodeURIComponent(referrer)}`);
    const link = await evalPage((tgt) =>
      [...document.querySelectorAll("#main a")].map((a) => a.getAttribute("href"))
        .filter((h) => h !== null && (h.endsWith("/" + tgt) || h.endsWith("/" + encodeURIComponent(tgt)) || h.includes(tgt) || h.includes(encodeURIComponent(tgt)))), target);
    let landed = { url: null, presented: null, mentions: false };
    if ((link ?? []).length > 0) {
      await page.locator(`#main a[href='${link[0]}']`).first().click({ timeout: T }).catch(() => {});
      await page.waitForLoadState("load", { timeout: T }).catch(() => {});
      await settle();
      landed.url = page.url();
      landed.presented = await evalPage(() => document.querySelector(".card-slot.titled-view")?.getAttribute("data-card-name") ?? null);
      landed.mentions = (await mainText()).includes(target);
    }
    grade("ACT-171", "a [[reference]] in a card body renders as a link and following it presents the referenced card",
      targetCard.ok && referrerCard.ok && (link ?? []).length > 0
        && (landed.presented === target || new RegExp(`/${esc(urlKey(target))}(/|$|\\?)`).test(landed.url ?? "")) && landed.mentions,
      { target, referrer, createStatuses: [targetCard.status, referrerCard.status], candidateHrefs: (link ?? []).slice(0, 6), landed });
  }

  // ---------------------------------------------------------------- ACT-172
  // N16 "RSS format view of a search or card" (batch2 case 8): BOTH the card
  // mark's .rss format and the search's format=rss answer, graded by the
  // check's own looksRss predicate - which accepts EXACTLY what stock Ruby
  // answers at these two shapes, MEASURED TWICE against the oracle deck booted
  // from reference-harness/browser/engines/ruby.json on this same synthetic-v1
  // fixture (receipts: C:/localProjects/brandonDojoTech/tmp/act172-175-evidence/
  // ruby-reference-act172-act175.json and .../ruby-reference-missing-mark.json,
  // written by tmp/act172-175-evidence/measure-ruby-reference.mjs):
  //
  //   /Brief.rss                  200  text/html; charset=utf-8  "RSS feeds disabled"
  //   /*search?format=rss&term=.. 200  text/html; charset=utf-8  "RSS feeds disabled"
  //
  // Both receipts record length 18 and body "RSS feeds disabled". Ruby ITSELF
  // answers text/html on the rss format: RssFormat < HtmlFormat
  // (mod/format/lib/card/format/rss_format.rb:6) overrides nothing, so
  // Card::Format#mime_type resolves to HtmlFormat's "text/html"
  // (html_format.rb:24-26) and response.rb:17 renders with format.mime_type;
  // the RSS mimes register on the REQUEST side only
  // (actionpack-7.2.4 http/mime_types.rb:40). So a predicate demanding an XML
  // body or an xml content-type was demanding a shape stock Ruby does not
  // answer here - it could only ever pass against an ENABLED feed
  // (rss_enabled true), which this fixture never is
  // (mod/format/lib/card/mod/format.rb:3 default FALSE).
  //
  // The prior note's cause - "the serving layer recognizes only .json as a
  // format mark, so /Brief.rss resolves as the card name 'Brief.rss'" - is
  // FALSE as of a5bc4702: the (.:format) arm is served (vm-staging-server.mjs
  // :3139 cardFormatRequest, :3171 cardFormatShowResponse, rssEnabled: false
  // :3216, RSS_DISABLED_BYTES src/card/render/format-families.ts:264), and the
  // rssShape slot ids below now come back EMPTY because the arm answers a
  // format body rather than a card page. The arm was already right; the
  // instrument measured the wrong contract. No enabled-feed acceptance is
  // claimed below - the enabled-feed arm is kept only so a deck that DOES
  // enable feeds still grades green on its real feed document.
  {
    const card = "Brief";
    // Ruby's measured rss answer for a card that exists: EXACTLY these bytes
    // (length 18) at EXACTLY this content type. Exact equality, not `includes`
    // - a longer body, another content type, or the ordinary HTML results page
    // all fail, so the predicate cannot be satisfied by "some text mentioning
    // RSS".
    const RUBY_RSS_DISABLED_BODY = "RSS feeds disabled";
    const RUBY_RSS_DISABLED_CONTENT_TYPE = /^text\/html;\s*charset=utf-8$/i;
    const ask = async (p) => {
      const res = await page.request.get(O + p, { maxRedirects: 0 }).catch((e) => ({ error: String(e?.message ?? e) }));
      if (res.error) return { path: p, status: null, contentType: null, body: "", looksRss: false, disclosesDisabled: false };
      const body = await res.text().catch(() => "");
      const contentType = res.headers()?.["content-type"] ?? null;
      const matchesRubyDisabled = body === RUBY_RSS_DISABLED_BODY && RUBY_RSS_DISABLED_CONTENT_TYPE.test(contentType ?? "");
      // The enabled-feed arm, unchanged: a real XML/RDF document, or an
      // xml-ish content type.
      const isFeedDocument = /<\?xml/i.test(body) || /<rss[\s>]/i.test(body) || /<rdf:RDF/i.test(body)
        || /application\/(rss\+xml|atom\+xml|xml)/i.test(contentType ?? "");
      return {
        path: p,
        status: res.status(),
        contentType,
        bodyLength: body.length,
        matchesRubyDisabledAnswer: matchesRubyDisabled,
        isFeedDocument,
        looksRss: matchesRubyDisabled || isFeedDocument,
        disclosesDisabled: body.includes(RUBY_RSS_DISABLED_BODY),
        head: body.replace(/\s+/g, " ").slice(0, 200),
      };
    };
    const cardRss = await ask(`/${encodeURIComponent(card)}.rss`);
    const searchRss = await ask(`/*search?format=rss&term=${encodeURIComponent("rss card body")}`);
    const cardJson = await ask(`/${encodeURIComponent(card)}.json`);
    // WHAT the surface did with the .rss mark, so the receipt carries the
    // dispatch decision rather than only the verdict: the served slot ids
    // name the card the mark resolved to.
    const rssShape = await (async () => {
      await visit(`/${encodeURIComponent(card)}.rss`);
      return evalPage(() => ({
        slotIds: [...document.querySelectorAll("#main .card-slot")].map((s) => s.getAttribute("id")).slice(0, 6),
        slotCardNames: [...document.querySelectorAll("#main .card-slot")].map((s) => s.getAttribute("data-card-name")).slice(0, 6),
        mainHead: (document.querySelector("#main")?.innerText ?? "").slice(0, 120),
      }));
    })();
    witness("format-dispatch control: the same mark's .json answers JSON while the .rss answer is recorded exactly as the surface gave it",
      { jsonStatus: cardJson.status, jsonContentType: cardJson.contentType, jsonLooksRss: cardJson.looksRss, cardRssHead: cardRss.head, searchRssHead: searchRss.head });
    // POSITIVE CONTROL, now graded rather than witnessed: the same mark and the
    // same card must still answer JSON on the .json arm. Without this the leg
    // could pass vacuously - any answer at all, including two identical
    // answers, would satisfy the two looksRss clauses.
    const jsonArmIsJson = cardJson.status === 200 && /^application\/json\b/i.test(cardJson.contentType ?? "") && cardJson.looksRss === false;
    grade("ACT-172", "the card mark's .rss and the search's format=rss both answer an RSS-format view",
      cardRss.status === 200 && cardRss.looksRss && searchRss.status === 200 && searchRss.looksRss
        && cardRss.matchesRubyDisabledAnswer === true && searchRss.matchesRubyDisabledAnswer === true
        && jsonArmIsJson,
      { cardRss, searchRss, rssShape, jsonControl: { status: cardJson.status, contentType: cardJson.contentType, looksRss: cardJson.looksRss, isJson: jsonArmIsJson },
      note: "looksRss = Ruby's measured default-disabled answer (body EXACTLY 'RSS feeds disabled', length 18, content-type EXACTLY text/html; charset=utf-8 - receipts C:/localProjects/brandonDojoTech/tmp/act172-175-evidence/ruby-reference-act172-act175.json and .../ruby-reference-missing-mark.json, oracle booted from reference-harness/browser/engines/ruby.json on synthetic-v1) OR a real enabled feed (XML declaration / <rss> / <rdf:RDF>, or an application/rss+xml|atom+xml|xml content-type). Both .rss arms here take the first branch, because Ruby itself answers exactly that with rss_enabled FALSE (mod/format/lib/card/mod/format.rb:3). The grade is pinned to the measured bytes: matchesRubyDisabledAnswer must be true on BOTH arms, and the same mark's .json arm must still answer application/json and NOT look like an RSS answer (the positive control). No enabled-feed acceptance is claimed - nothing here observes a real feed document. What this leg DOES now establish: the (.:format) route arms are served with Ruby's bytes rather than resolved as a card name (a5bc4702; vm-staging-server.mjs:3139/:3171/:3216), which is why rssShape.slotIds is now empty - the format arm answers no card page." });
  }

  // ---------------------------------------------------------------- ACT-174
  // UI2 "help popover on editor fields" (batch2 case 9): the stock rule
  // editor's Set-selection field registers a bootstrap popover with the exact
  // help string; hovering the popover anchor must show it with that body.
  {
    const s = stamp();
    const name = `Harness_exhaustive_ui2_${s}`;
    const rule = `${name}+*self+*read`;
    const expected = "Each rule applies to a set of cards. Rules for more specific sets override rules for more general ones.";
    const card = await createCard(name, "RichText", "help popover fixture");
    const ruleCard = await createCard(rule, "Phrase", "[[Anyone]]");
    const res = await visit(`/${encodeURIComponent(rule)}/rule_form`);
    const selector = 'form.card-rule-form a[data-bs-toggle="popover"]:not(._card-menu-popover)';
    const anchor = page.locator(selector).first();
    const anchorCount = await anchor.count().catch(() => 0);
    const setControls = await page.locator('form.card-rule-form input[name="card[name]"]').count().catch(() => 0);
    let registered = null;
    let shown = null;
    let interactionError = null;
    if (anchorCount > 0) {
      registered = await anchor.getAttribute("data-bs-content").catch(() => null);
      try {
        await anchor.hover({ timeout: 5000 });
        await page.waitForFunction(
          ({ sel, exp }) => {
            const a = document.querySelector(sel);
            const id = a?.getAttribute("aria-describedby");
            const node = id ? document.getElementById(id) : null;
            return node?.classList.contains("popover") && node.getClientRects().length > 0 && node.querySelector(".popover-body")?.textContent?.trim() === exp;
          },
          { sel: selector, exp: expected },
          { timeout: 5000 },
        );
      } catch (error) {
        interactionError = String(error?.message ?? error).split("\n")[0];
      }
      shown = await anchor.evaluate((el) => {
        const id = el.getAttribute("aria-describedby");
        const node = id ? document.getElementById(id) : null;
        return { describedBy: id, body: node?.querySelector(".popover-body")?.textContent?.trim() ?? null, visible: !!node?.getClientRects().length };
      }).catch(() => null);
    }
    grade("ACT-174", "the rule editor's Set-selection field registers the help popover and hovering the anchor shows that registered text",
      res.status === 200 && card.ok && ruleCard.ok && setControls > 0 && anchorCount > 0 && registered === expected
        && shown?.visible === true && shown?.body === expected && interactionError === null,
      { rule, status: res.status, createStatuses: [card.status, ruleCard.status], anchorCount, setControls, registered, expected, shown, interactionError });
  }

  // ---------------------------------------------------------------- ACT-175
  // A6 "role checkbox editing on account/rules surfaces" (batch2 case 10):
  // the navbar's autosave form action="/update/<actor>+*enabled_roles"; the
  // click IS the post. PERSISTENCE WITNESS: the control's write target is the
  // visitor-session card `<actor>+*enabled roles`, decoded by the ENGINE's own
  // readVisitorSession/sessionCardContent from the dist under measurement - so
  // the flip and restore legs grade on the SESSION CONTENT moving and
  // returning, not on the rendered checkbox (ensure_roles re-fills the current
  // roles at render time).
  {
    const visitorSession = await import(
      pathToFileURL(path.join(engineDist, "src", "card", "session", "visitor-session.js")).href
    ).catch(() => null);
    const cookieHeader = async () => {
      const cookies = await ctx.cookies();
      const visitCookie = cookies.find((c) => c.name === "decko_visit");
      return visitCookie === undefined ? undefined : `decko_visit=${visitCookie.value}`;
    };
    const readSessionRoles = async (actorSegment) => {
      if (!visitorSession?.readVisitorSession || !visitorSession?.sessionCardContent) return { available: false, candidates: [] };
      const header = await cookieHeader();
      if (!header) return { available: true, candidates: [], cookiePresent: false };
      const state = visitorSession.readVisitorSession(header);
      const candidates = [];
      for (const n of [`${actorSegment}+*enabled roles`, `${spaceForm(actorSegment)}+*enabled roles`]) {
        const raw = visitorSession.sessionCardContent(state, n);
        if (raw !== undefined && raw !== null) candidates.push({ cardName: n, raw: String(raw) });
      }
      return { available: true, candidates, cookiePresent: true, sessionKeys: Object.keys(state.cards) };
    };
    const formSel = '.navbar form.card-form[action$="+*enabled_roles"]';
    const openEditor = async () => {
      await visit("/");
      const form = page.locator(formSel).first();
      if ((await form.count().catch(() => 0)) > 0) {
        await page.locator('.navbar [data-bs-toggle="dropdown"]').last().click({ timeout: 5000 }).catch(() => {});
        await page.locator(".navbar .dropdown-menu.show").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
      }
      return form;
    };
    const readBoxes = (form) =>
      form.evaluate((f) => [...f.querySelectorAll("input.pointer-checkbox-button")].map((b) => ({
        name: b.getAttribute("name"), value: b.value, checked: b.checked,
        display: getComputedStyle(b).display, visible: b.offsetParent !== null,
      }))).catch(() => []);
    let restoredVerified = null;
    let clickHappened = false;
    let postStatus = null;
    let postBody = null;
    let formTypeId = null;
    let formCount = 0;
    let boxes = [];
    let clickable = [];
    let beforeJson = "[]";
    let afterJson = "[]";
    let restoreStatus = null;
    let checkedBefore = null;
    let checkedAfter = null;
    let sessionKeysBefore = null;
    let sessionKeysAfter = null;
    let cookieBefore = null;
    try {
      const form = await openEditor();
      formCount = await form.count().catch(() => 0);
      boxes = formCount > 0 ? await readBoxes(form) : [];
      clickable = boxes.filter((b) => b.visible && b.display !== "none");
      formTypeId = formCount > 0
        ? await form.evaluate((f) => f.querySelector("input[name='card[type_id]']")?.value ?? null).catch(() => null)
        : null;
      const boxInfo = clickable[0] ?? null;
      const actionPath = formCount > 0 ? await form.getAttribute("action").catch(() => null) : null;
      const actorSegment = actionPath ? decodeURIComponent(new URL(actionPath, O).pathname.split("/update/")[1] ?? "").replace(/\+\*enabled_roles$/, "") : null;
      const sessionBefore = boxInfo ? await readSessionRoles(actorSegment) : { available: null, candidates: [] };
      beforeJson = JSON.stringify(sessionBefore.candidates.map((c) => c.raw).sort());
      sessionKeysBefore = sessionBefore.sessionKeys ?? null;
      cookieBefore = sessionBefore.cookiePresent ?? null;
      checkedBefore = boxInfo?.checked ?? null;
      let sessionAfter = null;
      if (boxInfo && actionPath) {
        clickHappened = true;
        const spy = (req) => {
          if (req.method() === "POST" && req.url().includes("enabled_roles")) {
            try { postBody = String(req.postData() ?? "").slice(0, 400); } catch { postBody = "<unreadable>"; }
          }
        };
        page.on("request", spy);
        const pending = page.waitForResponse(
          (r) => r.request().method() === "POST" && new URL(r.url()).pathname === new URL(actionPath, O).pathname,
          { timeout: 15_000 },
        ).then((r) => ({ r }), (e) => ({ error: String(e?.message ?? e) }));
        await form.locator(`input.pointer-checkbox-button[name="${boxInfo.name}"][value="${boxInfo.value}"]`).first().click({ timeout: 10_000 }).catch(() => {});
        const seen = await pending;
        page.off("request", spy);
        postStatus = seen.r ? seen.r.status() : null;
        if (postStatus !== null) {
          await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(1500);
          const form2 = await openEditor();
          const afterFirst = (await readBoxes(form2)).find((b) => b.value === boxInfo.value) ?? null;
          checkedAfter = afterFirst?.checked ?? null;
          sessionAfter = await readSessionRoles(actorSegment);
          sessionKeysAfter = sessionAfter.sessionKeys ?? null;
          afterJson = JSON.stringify((sessionAfter?.candidates ?? []).map((c) => c.raw).sort());
          if (postStatus < 400 && afterJson !== beforeJson) {
            const form3 = await openEditor();
            const restoreActionPath = new URL(await form3.getAttribute("action").catch(() => null) ?? "", O).pathname;
            const pending2 = page.waitForResponse(
              (r) => r.request().method() === "POST" && new URL(r.url()).pathname === restoreActionPath,
              { timeout: 15_000 },
            ).then((r) => ({ r }), () => ({ error: "no restore response" }));
            await form3.locator(`input.pointer-checkbox-button[name="${boxInfo.name}"][value="${boxInfo.value}"]`).first().click({ timeout: 10_000 }).catch(() => {});
            const seen2 = await pending2;
            restoreStatus = seen2.r ? seen2.r.status() : null;
            if (restoreStatus !== null) {
              await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
              await page.waitForTimeout(1500);
              const form4 = await openEditor();
              const sessionRestored = await readSessionRoles(actorSegment);
              restoredVerified = JSON.stringify((sessionRestored?.candidates ?? []).map((c) => c.raw).sort()) === beforeJson;
            }
          }
        }
      }
    } finally {
      if (!clickHappened) restoredVerified = true;
      // Fixture hygiene: the visitor-session selection must end where the leg
      // found it. Re-click until the pre-click session content is verified
      // restored; record whatever the last read saw.
      try {
        for (let attempt = 0; attempt < 3 && clickHappened && restoredVerified !== true; attempt += 1) {
          const form = await openEditor();
          if ((await form.count().catch(() => 0)) === 0) break;
          const target = (await readBoxes(form)).find((b) => b.visible && b.display !== "none");
          if (!target) break;
          const pending = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 10_000 }).catch(() => null);
          await form.locator(`input.pointer-checkbox-button[name="${target.name}"][value="${target.value}"]`).first().click({ timeout: 8000 }).catch(() => {});
          await pending;
          await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(1200);
          const form2 = await openEditor();
          const now = (await readBoxes(form2)).find((b) => b.value === target.value) ?? null;
          if (now && now.checked === true) { restoredVerified = true; break; }
        }
      } catch { /* recorded below */ }
    }
    grade("ACT-175", "the inline role-checkbox editor posts on click, the visitor-session enabled-roles selection moves, and the same click restores it",
      formCount > 0 && clickable.length > 0 && clickHappened && postStatus !== null && postStatus < 400
        && afterJson !== beforeJson && restoreStatus !== null && restoreStatus < 400 && restoredVerified === true,
      { formCount, boxCount: boxes.length, clickable: clickable.length, formTypeId, postStatus, postBody,
        sessionBefore: beforeJson, sessionAfter: afterJson, sessionMoved: afterJson !== beforeJson,
        sessionKeysBefore, sessionKeysAfter, cookiePresentBefore: cookieBefore,
        restoreStatus, restoredVerified, checkedBefore, checkedAfter,
        decoderFrom: path.join(engineDist, "src", "card", "session", "visitor-session.js"), decoderAvailable: !!visitorSession?.readVisitorSession });
  }

  // ---------------------------------------------------------------- ACT-177
  // REL1 "related-cards panel content" (batch2 case 11): Topic 001's +related
  // closed panel expands on its accordion button, lists BOTH pointed-at cards
  // (Topic 002, Topic 012), and following one presents that card. The panel is
  // located by the classes the served page's own structure excerpt carries.
  {
    const panelCard = "Topic 001";
    await visit(`/${urlKey(panelCard)}`);
    const panelShape = await evalPage(() => {
      const panel = document.querySelector("#main .card-slot.closed-view.RIGHT-related");
      if (!panel) return { found: false, id: null, button: 0 };
      return { found: true, id: panel.getAttribute("id"), button: panel.querySelectorAll("button.accordion-button").length };
    });
    const panelSel = () => "#main .card-slot.closed-view.RIGHT-related";
    let expanded = false;
    let content = null;
    let followed = null;
    if (panelShape?.found && panelShape.button > 0) {
      await page.locator(`${panelSel()} button.accordion-button`).first().click({ timeout: T }).catch(() => {});
      await page.waitForTimeout(2500);
      await settle();
      expanded = await evalPage((sel) =>
        !!document.querySelector(`${sel} button.accordion-button:not(.collapsed)`) && !!document.querySelector(`${sel} .accordion-body`), panelSel());
      content = await evalPage((sel) => {
        const body = document.querySelector(`${sel} .accordion-body`);
        return body ? {
          bodyText: body.textContent.replace(/\s+/g, " ").trim().slice(0, 250),
          links: [...body.querySelectorAll("a.known-card")].map((a) => ({ t: a.textContent.replace(/\s+/g, " ").trim(), h: a.getAttribute("href") })),
          bars: [...body.querySelectorAll(".bar[data-card-link-name]")].map((b) => b.getAttribute("data-card-link-name")),
        } : null;
      }, panelSel());
      const topic2 = page.locator(`${panelSel()} .accordion-body .bar[data-card-link-name='Topic_002']`).first();
      if ((await topic2.count().catch(() => 0)) > 0) {
        await topic2.click({ timeout: T }).catch(() => {});
        await page.waitForLoadState("load", { timeout: T }).catch(() => {});
        await page.waitForTimeout(1500);
        followed = {
          url: page.url(),
          presented: await evalPage(() => document.querySelector(".card-slot.titled-view")?.getAttribute("data-card-name") ?? null),
        };
        followed.isTopic2 = followed.presented === "Topic 002" || /\/Topic_002($|\?)/.test(followed.url ?? "");
      }
    }
    const bothListed = (!!content?.links && content.links.some((l) => /Topic 002|Topic_002/.test(l.t + l.h)) && content.links.some((l) => /Topic 012|Topic_012/.test(l.t + l.h)))
      || (!!content?.bars && content.bars.includes("Topic_002") && content.bars.includes("Topic_012"));
    grade("ACT-177", "the related panel expands to its content, lists both pointed-at cards, and a related link presents its card",
      panelShape?.found === true && panelShape.button > 0 && expanded === true
        && content !== null && (content?.links?.length ?? 0) > 0 && bothListed && followed?.isTopic2 === true,
      { panelCard, panelFound: panelShape?.found ?? false, panelSlotId: panelShape?.id ?? null, panelButtons: panelShape?.button ?? 0, expanded, panelBodyHead: content?.bodyText ?? null, links: content?.links ?? [], bars: content?.bars ?? [], bothListed, followed });
  }
} catch (e) {
  report.fatal = String(e?.stack ?? e);
  console.error("[batch7] FATAL", report.fatal);
} finally {
  writeFileSync(path.join(out, "probe-pageonly-batch7-ranks81-90-result.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`[batch7] legs ${report.legs.length}, failures ${report.failures}, evidence ${path.join(out, "probe-pageonly-batch7-ranks81-90-result.json")}`);
  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
  process.exit(report.failures > 0 || report.fatal ? 1 : 0);
}
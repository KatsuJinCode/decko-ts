#!/usr/bin/env node
// probe-pageonly-ranks91-100.mjs
//
// Ranks 91-100 of the canonical witnessed-only list — the 2026-10-18
// exhaustive re-grade's 101 page-only ids in id order
// (tmp/pageonly-101-ids.json on the coordination tree; the same set is
// .runtime/exhaustive/2026-10-18-regrade/actions/*.json graded "page-only").
// This lane's window, verbatim, in id order:
//
//   ACT-178  ERR1 error pages render as error pages, not create forms
//   ACT-179  C22 case-handling on names: a create differing only by letter
//            case is refused
//   ACT-180  S11 plurality/slug pinning: name variants round-trip to the
//            same card
//   ACT-181  result ordering: newest-first ordering of the Changes feed and
//            search results
//   ACT-184  case-insensitivity guarantees across search, names, and slugs
//   ACT-185  plurality/slug pinning: name variants resolving to one card
//   ACT-186  pagination math: offsets, limits, and page counts beyond
//            page-2-differs
//   ACT-187  feed dedup: the same act must not repeat in a feed
//   ACT-188  affordance visibility per role: which controls render for which
//            actor
//   ACT-189  empty-vs-error rendering: empty result sets must not render as
//            errors and vice versa
//
// Sibling windows already committed (dedup record, not re-claims): ranks
// 1-10 bc81fbb5, 11-20 5bdda29f, 21-30 cacce253, 31-40 93771deb, 41-50
// 7deabd7e, 51-60 d69c2369, 61-70 47915f69. ACT-181/184/186/188/189 also
// carry earlier legs in 93771deb and 7deabd7e; this lane re-drives its whole
// window at the current tip so the batch's verdict is self-contained and
// current rather than inherited.
//
// ENGINE PROVENANCE. The shared checkout carries other lanes' uncommitted
// writes, so this probe boots a DISPOSABLE PURE-TIP worktree's engine (a clean
// detached checkout of the tip, built with tools/dist/build-engine.mjs) and
// records that build's own record — sourceDiffSha256 (e3b0c442… on a clean
// tree) and distSha256, the latter RECOMPUTED here, not copied — in every
// receipt. The engine boots with DECKO_MOD_PUBLIC_DIR pointed at this repo's
// copy of the gitignored mods' public dir, because a fresh worktree lacks
// that Ruby-setup artifact and ts-server.mjs:76 refuses to boot without it
// (the same wrapper probe-pageonly-batch6 builds).
//
// SELECTORS ARE PINNED FROM BYTES, not memory. Two discovery passes against
// this engine established, and the graded legs depend on:
//   - the not_found error view renders `.card-slot.not_found-view` with an
//     h1 "Not Found", "Could not find <em>name</em>", and the signin/signup
//     line ONLY when signed out (src/card/render/format.ts:1584-1591 gates
//     that line on `signedIn !== true`);
//   - a signed-in actor WITH create rights gets status 200 and the /new page
//     at the unknown address instead — that is the oracle-pinned
//     page_view_for_unknown branch (src/card/render/page.ts:309-351:
//     "an unknown card whose actor may create renders the :new page at the
//     requested address (status 200)"; without create permission the
//     card-not-found raise stands, 404), NOT an error-page defect. ACT-178 is
//     therefore graded on the branches that ARE error pages, and the
//     signed-in create-form is recorded as a witness against its source.
//   - the /*recent act rows are `#main .card-slot .card-slot` inside
//     `ul.action-list > li.create`, each carrying its act's identity as
//     `action_id` inside its `data-slot` JSON — the dedup instrument for
//     ACT-187 (the feed's first #main slot is *recent's own titled-view and
//     is excluded by its data-card-name).
//
// Every leg drives the affordance the way a person does. The engine stages a
// private copy of the fixture deck (lib/engines.mjs), so every write this
// probe makes dies with the staging directory. Exits non-zero if any leg is
// RED.
//
//   node reference-harness/browser/probe-pageonly-ranks91-100.mjs \
//     [--engine reference-harness/browser/engines/ts.json] \
//     [--fixture reference-harness/fixtures/synthetic-v1] [--out <dir>]

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const engineManifestArg = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-pageonly-ranks91-100");
const T = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);

mkdirSync(out, { recursive: true });

// --- provenance (the runner's own receipt fields, run-exhaustive.mjs) ----
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

// The ENGINE's own build record, read from the checkout it boots out of —
// NOT this repo's, because the whole point is that the engine is the pure-tip
// worktree's. The engine build's distSha256 is RE-computed below and asserted
// against the recorded value, so a receipt cannot claim a build it does not
// have.
const engineRepo = path.resolve(path.dirname(engineManifestArg), "..", "..", "..");
let engineBuild = null;
try {
  engineBuild = JSON.parse(readFileSync(path.join(engineRepo, ".runtime", "browser-build.json"), "utf8"));
} catch {}
const engineDistSha256Recomputed = treeDigest(path.join(engineRepo, "dist"));
const engineCleanTreeDiffSha256 = (() => {
  const d = spawnSync("git", ["-C", engineRepo, "status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8", windowsHide: true }).stdout?.trim() ?? "";
  return { porcelain: d, isClean: d === "" };
})();

const report = {
  out,
  fixture: fixtureDir,
  window: { ranks: "91-100", ids: ["ACT-178", "ACT-179", "ACT-180", "ACT-181", "ACT-184", "ACT-185", "ACT-186", "ACT-187", "ACT-188", "ACT-189"] },
  source: {
    commit: sourceCommit,
    dirty: !!dirtyPorcelain,
    // Disclosed, not hidden: THIS checkout's working tree may carry OTHER
    // lanes' uncommitted writes. They are listed here and are NOT part of the
    // measurement — the engine boots from the pure-tip worktree recorded below.
    dirtyPorcelain: dirtyPorcelain || "",
    repoDistSha256: treeDigest(path.join(repo, "dist")),
    engineManifest: engineManifestArg,
    engineRepo,
    engineBuild,
    engineDistSha256Recomputed,
    engineDistSha256MatchesBuildRecord: engineBuild?.distSha256 === engineDistSha256Recomputed,
    // e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 is
    // sha256 of the empty string — the clean-tree git-diff hash. A pure-tip
    // engine's sourceDiffSha256 MUST equal it.
    pureTipSourceDiffSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    engineIsPureTip:
      engineBuild?.sourceDiffSha256 === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      && engineCleanTreeDiffSha256.isClean,
    engineWorkingTreePorcelain: engineCleanTreeDiffSha256.porcelain,
    fixtureSha256: treeDigest(fixtureDir),
  },
  legs: [],
  failures: 0,
};

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[ranks91-100] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 700)}`);
}

const stamp = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const urlKey = (name) => name.replaceAll(" ", "_");
const key = (t) => String(t ?? "").replaceAll(" ", "_").toLowerCase();
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** The mods' public dir (TinyMCE theme, ace modes) is a gitignored Ruby-setup
 *  artifact, not engine code (ts-server.mjs:69-77 — "both engines serve the
 *  same files"). A fresh pure-tip worktree lacks it and ts-server.mjs:76
 *  refuses to boot, so the engine gets a wrapper manifest that boots THAT
 *  checkout's server with DECKO_MOD_PUBLIC_DIR pointed at this repo's copy.
 *  The engine's dist stays the target checkout's own build. */
function resolveEngineManifest() {
  const modDir = (r) => path.join(r, "reference-harness", "oracle", "app", "public");
  if (existsSync(path.join(modDir(engineRepo), "mod"))) return engineManifestArg;
  if (!existsSync(path.join(modDir(repo), "mod"))) return engineManifestArg;
  const manifest = JSON.parse(readFileSync(engineManifestArg, "utf8"));
  const wrapperPath = path.join(out, "engine-with-mod-dir.json");
  writeFileSync(wrapperPath, JSON.stringify({
    ...manifest,
    description: manifest.description + " (ranks91-100 wrapper: boots the pure-tip worktree's server with DECKO_MOD_PUBLIC_DIR from the probe repo — a fresh worktree lacks the gitignored mod-public artifact)",
    command: ["node", path.join(path.dirname(engineManifestArg), "ts-server.mjs")],
    env: { ...(manifest.env ?? {}), DECKO_MOD_PUBLIC_DIR: modDir(repo) },
  }, null, 2));
  return wrapperPath;
}

const engine = loadEngine(resolveEngineManifest());
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
const spec = readJson(path.join(fixtureDir, "deck.json"));
const O = server.base;
console.log(`[ranks91-100] engine ${engine.name} on ${O} (boot ${server.bootMs}ms) engineRepo ${engineRepo}`);
console.log(`[ranks91-100] engine pure-tip=${report.source.engineIsPureTip} distSha256=${engineDistSha256Recomputed}`);

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(T);
page.on("dialog", (d) => d.accept().catch(() => {}));
const api = ctx.request;
if (!["127.0.0.1", "localhost"].includes(new URL(O).hostname)) throw Error("ranks91-100 probe requires the loopback engine");

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
  await page.waitForTimeout(1500);
  const cookies = await ctx.cookies(O);
  return {
    signedInChrome: (await page.locator("a.signout-link").first().count().catch(() => 0)) > 0,
    hasSessionCookie: cookies.some((c) => c.name === "decko_ts_session" && c.value.length > 0),
  };
};
const visit = async (p) => {
  const r = await page.goto(O + p, { waitUntil: "load", timeout: T }).catch(() => null);
  await page.waitForTimeout(600);
  const html = await page.content().catch(() => "");
  return { path: p, status: r ? r.status() : null, html, signedIn: /class="[^"]*signout-link/.test(html) };
};
const evalPage = async (fn, arg) => page.evaluate(fn, arg).catch((e) => ({ error: String(e?.message ?? e) }));
const settle = () => page.waitForTimeout(900);

/** Create a PlainText card through the real /new/PlainText form (its content
 *  control is a visible textarea; RichText/Basic hide theirs behind TinyMCE).
 *  Witnesses the create POST and the stored row. */
const createPlainText = async (name, body) => {
  const form = await visit("/new/PlainText");
  await page.locator("form.card-form input[name='card[name]']").first().fill(name, { timeout: T });
  await page.locator("form.card-form textarea[name='card[content]']").first().fill(body, { timeout: T });
  const responded = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/card/create", { timeout: T }).catch(() => null);
  await page.locator("form.card-form button[type=submit], form.card-form input[type=submit]").first().click({ timeout: T }).catch(() => {});
  const post = await responded;
  if (post) await post.finished().catch(() => {});
  await page.waitForTimeout(1200);
  const row = (() => { try { const d = db(); const r2 = d.prepare("SELECT id, name, type_id FROM cards WHERE name=? AND trash=0").get(name); d.close(); return r2 ?? null; } catch { return null; } })();
  return { formStatus: form.status, postStatus: post ? post.status() : null, row };
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
  if (post) await post.finished().catch(() => {});
  await page.waitForTimeout(1200);
  return { formStatus: form.status, postStatus: post ? post.status() : null, updated: true };
};

/** The search results page's own row reader: cardListView's
 *  .search-result-list > .search-result-item children; names off
 *  [data-card-name] (checks-cover-b.mjs:1143-1149 records why). */
const searchRows = () => page.evaluate(() =>
  [...document.querySelectorAll("#main .search-result-list > .search-result-item")]
    .map((row) => row.querySelector("[data-card-name]")?.getAttribute("data-card-name"))
    .filter(Boolean));

/** The Recent Changes feed's ROWS as acts: the act entries are the
 *  `#main .card-slot .card-slot` slots inside `ul.action-list`, each
 *  carrying its act's identity as `action_id` inside its `data-slot` JSON.
 *  The feed's own *recent titled-view slot is excluded by data-card-name. */
const feedActRows = () => page.evaluate(() =>
  [...document.querySelectorAll("#main .card-slot .card-slot")].map((el) => {
    let slot = null;
    try { slot = JSON.parse(el.getAttribute("data-slot")); } catch { slot = null; }
    return {
      actionId: slot?.action_id ?? null,
      view: slot?.view ?? null,
      cardId: el.getAttribute("data-card-id"),
      cardName: el.getAttribute("data-card-name"),
      text: el.innerText.replace(/\s+/g, " ").slice(0, 120),
    };
  }));
/** The feed's card-name sequence in DOM order, for the ordering leg. The
 *  act entry slot carries data-card-name ITSELF (discovery pass 3: each act
 *  row is `div.card-slot` with data-card-id / data-card-name / data-slot
 *  action_id); run 1 of this probe searched for a DESCENDANT [data-card-name]
 *  and read zero rows off a perfectly good feed. */
const feedRows = () => page.evaluate(() =>
  [...document.querySelectorAll("#main .card-slot .card-slot")]
    .map((n) => n.getAttribute("data-card-name"))
    .filter((t) => t && t !== "*recent"));

/** The navbox search, submitted the way a person submits it.
 *  Run 2 of the first version of this probe read the result list after a FIXED
 *  800 ms sleep and got zero rows on a correctly-navigated /*search page
 *  (searchUrl carried the right query; the list had not rendered yet) — the
 *  same legs were green in run 1. So the read now WAITS for the result list to
 *  exist (bounded), and reports whether it waited, so a zero-row result is a
 *  measurement and not a race. */
const navboxSearch = async (term) => {
  await page.goto(O + "/", { waitUntil: "load", timeout: T }).catch(() => {});
  await page.waitForTimeout(500);
  const input = page.locator("form.search-box-form input[name='query[keyword]']:visible").first();
  await input.fill(term, { timeout: T });
  const responded = page.waitForResponse((r) => new URL(r.url()).pathname === "/*search" || new URL(r.url()).pathname === "/%2Asearch", { timeout: T }).catch(() => null);
  await input.press("Enter", { timeout: T }).catch(() => {});
  await responded.catch(() => {});
  const startedAt = Date.now();
  const listAppeared = await page
    .waitForSelector("#main .search-result-list", { timeout: T })
    .then(() => true)
    .catch(() => false);
  const waitedMs = Date.now() - startedAt;
  await page.waitForTimeout(400);
  return { url: page.url(), listAppeared, waitedMs, rows: await searchRows() };
};

/** The create-form type control's options, for the per-role census. */
const typeOptions = async () => page.evaluate(() => {
  const sel = [...document.querySelectorAll("form.card-form select")].find((s) => s.getAttribute("name") === "card[type]");
  return sel ? [...sel.querySelectorAll("option")].map((o) => o.textContent.trim()) : null;
});

/** The identity a rendered card page presents: the root card slot's
 *  data-card-id + the canonical name it titles itself with. This is the
 *  instrument for "these name variants are ONE card" (ACT-180/ACT-185) —
 *  a 200 alone would not distinguish one card from two. */
const cardIdentity = async () => page.evaluate(() => {
  const root = document.querySelector("#main .card-slot") ?? document.querySelector(".card-slot");
  return {
    cardId: root?.getAttribute("data-card-id") ?? null,
    cardName: root?.getAttribute("data-card-name") ?? null,
    linkName: root?.getAttribute("data-card-link-name") ?? null,
    title: document.querySelector("#main h1")?.innerText.replace(/\s+/g, " ").trim() ?? null,
    docTitle: document.title,
  };
});

try {
  // ------------------------------------------------------------ ACT-178
  // ERR1: error pages render as error pages, not create forms. Graded on the
  // branches that ARE error pages — see the header: a signed-in actor WITH
  // create rights gets the oracle-pinned :new page at the unknown address
  // (page.ts:309-351), so that answer is a WITNESS, not a RED. The
  // no-create-permission branch (page.ts:345-351) is what an anonymous
  // request exercises.
  {
    await ctx.clearCookies();
    const unknown = `No Such Card R91 ${stamp()}`;
    const anon = await visit(`/${encodeURIComponent(unknown)}`);
    const shape = await evalPage(() => ({
      notFoundViews: document.querySelectorAll(".not_found-view").length,
      newViews: document.querySelectorAll(".new-view").length,
      createForms: document.querySelectorAll("form[action='/card/create']").length,
      createSubmits: document.querySelectorAll(".create-submit-button").length,
      visibleCreateNamePrompts: [...document.querySelectorAll("form input[name='card[name]']")].filter((i) => i.offsetParent || i.getClientRects().length).length,
      anyCreateNameInputs: document.querySelectorAll("form input[name='card[name]']").length,
      signinLinks: document.querySelectorAll("a.signin-link").length,
      signupLinks: document.querySelectorAll("a.signup-link").length,
      heading: document.querySelector("#main h1")?.innerText.replace(/\s+/g, " ").trim() ?? null,
      mentionsCouldNotFind: document.body.innerText.replace(/\s+/g, " ").includes("Could not find"),
    }));
    grade("ACT-178", "an unknown card's page renders as the not_found error page, never a create form",
      anon.status === 404 && shape.notFoundViews === 1 && shape.newViews === 0
        && shape.createForms === 0 && shape.createSubmits === 0
        && shape.visibleCreateNamePrompts === 0 && shape.anyCreateNameInputs === 0
        && shape.heading === "Not Found" && shape.mentionsCouldNotFind === true,
      { unknown, status: anon.status, ...shape });
    // the same error's .json answer is an ERROR, not a create-form payload
    const jsonErr = await page.evaluate(async ({ origin, name }) => {
      const r = await fetch(`${origin}/${encodeURIComponent(name)}.json`, { credentials: "include" });
      const text = await r.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      return {
        status: r.status, parsed,
        carriesCreateFormMarkup: /card\[name\]|\/card\/create|create-submit-button/.test(text),
      };
    }, { origin: O, name: unknown });
    grade("ACT-178", "an unknown card's .json answer is an error, not a create-form payload",
      jsonErr.status === 404 && typeof jsonErr.parsed?.error === "string" && jsonErr.parsed.error.length > 0
        && jsonErr.carriesCreateFormMarkup === false,
      { requested: `/${unknown}.json`, ...jsonErr });
    // WITNESS (not graded): the signed-in create-permission branch, recorded
    // with the source that pins it, so the reader can see why it is not a RED.
    const adminIn = await signIn("admin");
    const signedInUnknown = await visit(`/${encodeURIComponent(unknown + " signedin")}`);
    const siShape = await evalPage(() => ({
      notFoundViews: document.querySelectorAll(".not_found-view").length,
      newViews: document.querySelectorAll(".new-view").length,
      createForms: document.querySelectorAll("form[action='/card/create']").length,
    }));
    report.witnesses = report.witnesses ?? [];
    report.witnesses.push({
      act: "ACT-178",
      note: "a signed-in actor WITH create rights is answered the :new page at an unknown address (status 200), which is the oracle-pinned page_view_for_unknown branch, not an error-page defect",
      source: "src/card/render/page.ts:309-351 — 'an unknown card whose actor may create renders the :new page at the requested address (status 200) ... Without create permission the card-not-found raise stands (page_status_for_unknown's 404)'; unknownCardCreatable = card.ok?(:create) at src/card/render/views.ts:5787-5792",
      adminSignedIn: adminIn.signedInChrome === true,
      status: signedInUnknown.status,
      ...siShape,
    });
    console.log(`[ranks91-100] ACT-178 WITNESS signed-in unknown-name: status ${signedInUnknown.status} newViews ${siShape?.newViews} (page.ts:309-351 branch)`);
  }

  // ------------------------------------------------------------ ACT-179
  // C22 case-handling on names: creating a card that differs only by letter
  // case is refused. Drive the real create form with HOME while Home exists;
  // a refusal is an error answer (4xx or an error message on the form) AND
  // no second name-equivalent row AND Home untouched. Leg shape is batch2's
  // committed ACT-179 leg (probe-pageonly-batch2-write-permission.mjs:167-206).
  {
    const d0 = db();
    const homeRow = d0.prepare("SELECT id, db_content, type_id FROM cards WHERE name='Home' AND trash=0").get() ?? null;
    d0.close();
    const caseName = "HOME";
    const seen = await visit(`/new/Basic?card%5Bname%5D=${caseName}`);
    const form = page.locator("#main form.card-form").first();
    const formPresent = (await form.count().catch(() => 0)) > 0;
    let post = null, errorShown = null, equivalents = null, homeAfter = null;
    if (formPresent) {
      const nameField = form.locator("input[name='card[name]']").first();
      if ((await nameField.count().catch(() => 0)) > 0) await nameField.fill(caseName, { timeout: T }).catch(() => {});
      const ta = form.locator("textarea[name='card[content]']:visible").first();
      if ((await ta.count().catch(() => 0)) > 0) await ta.fill("C22 case probe body " + stamp(), { timeout: T }).catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/card/create", { timeout: T }).catch(() => null);
      await form.locator("button[type=submit], input[type=submit], .submit-button").first().click({ timeout: T }).catch(() => {});
      post = await responded;
      if (post) await post.finished().catch(() => {});
      await settle();
      errorShown = await evalPage(() =>
        [...document.querySelectorAll(".form-error, .alert-danger, .error, .invalid-feedback")].map((e) => e.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 4));
      const d = db();
      equivalents = d.prepare("SELECT id, name, trash FROM cards WHERE LOWER(name)=LOWER('Home') ORDER BY id").all();
      homeAfter = d.prepare("SELECT id, db_content, trash FROM cards WHERE name='Home' AND trash=0").get() ?? null;
      d.close();
    }
    const noNewRow = Array.isArray(equivalents) && equivalents.filter((r) => r.id !== homeRow?.id).length === 0;
    const homeUntouched = !!homeAfter && homeRow !== null && homeAfter.id === homeRow.id && homeAfter.db_content === homeRow.db_content && homeAfter.trash === 0;
    grade("ACT-179", "C22 creating a card that differs only by letter case is refused",
      formPresent && post !== null && (post.status() >= 400 || (Array.isArray(errorShown) && errorShown.length > 0)) && noNewRow && homeUntouched,
      { caseName, homeRowId: homeRow?.id ?? null, seen: { status: seen.status }, formPresent, post: post ? post.status() : null, errorShown, equivalents, noNewRow, homeUntouched });
  }

  // ------------------------------------------------------------ ACT-180
  // S11 plurality/slug pinning: name variants round-trip to the SAME card.
  // One PlainText card with a mixed-case, multi-word name. Each variant is
  // visited by a person typing/cliking that URL, and the leg requires the
  // round trip: variant -> the card's own identity (data-card-id) -> the
  // canonical title -> the page's own self-link (data-card-link-name) ->
  // following that link lands on the same identity again. A 200 alone would
  // not distinguish one card from several; the id is the instrument.
  {
    const s = stamp();
    const name = `Harness Roundtrip R91 ${s}`;
    const token = `Rt91Token${s}`;
    const mk = await createPlainText(name, `body with ${token} inside`);
    const control = await visit(`/${urlKey(name)}`);
    const controlId = await cardIdentity();
    // the four person-facing slug variants of that one name
    const variants = [
      { label: "underscore slug", url: `/${urlKey(name)}` },
      { label: "percent-encoded spaces", url: `/${encodeURIComponent(name)}` },
      { label: "lowercase slug", url: `/${urlKey(name).toLowerCase()}` },
      { label: "mixed-case spaces", url: `/${encodeURIComponent(name.toLowerCase())}` },
    ];
    const resolved = [];
    for (const v of variants) {
      const r = await visit(v.url);
      const id = await cardIdentity();
      resolved.push({ ...v, status: r.status, tokenFound: r.html.includes(token), ...id });
    }
    const ids = resolved.map((r) => r.cardId);
    const allSameCard = ids.every((id) => id !== null && id === ids[0]) && ids[0] !== null;
    grade("ACT-180", "every name variant of a card resolves to the SAME card (identity, not just a 200)",
      mk.postStatus !== null && mk.postStatus < 400 && !!mk.row
        && control.status === 200 && allSameCard
        && resolved.every((r) => r.status === 200 && r.tokenFound === true)
        && String(controlId.cardId) === String(mk.row.id),
      { name, createdRow: mk.row, controlId, resolved, allSameCard, distinctIds: [...new Set(ids)] });
    // the round trip proper: the card's OWN self-link reproduces the slug and
    // lands back on the same card
    const selfLink = controlId.linkName;
    const back = await visit(`/${selfLink}`);
    const backId = await cardIdentity();
    grade("ACT-180", "the card's own self-link round-trips back to the same card (slug pins)",
      selfLink !== null && back.status === 200 && String(backId.cardId) === String(controlId.cardId) && back.html.includes(token),
      { selfLinkFromControl: selfLink, backUrl: `/${selfLink}`, backStatus: back.status, backCardId: backId.cardId, controlCardId: controlId.cardId, tokenFound: back.html.includes(token) });
  }

  // ------------------------------------------------------------ ACT-181
  // Result ordering: newest-first across the Changes feed (through the
  // navbar's own Recent Changes link) and the search results (through the
  // navbox). Setup: card A created, card B created (B newer than A's
  // creation), then A edited (A's update is the newest act of the three).
  {
    const s = stamp();
    const term = `Ord91Term${s}`;
    const nameA = `Harness Order R91 A ${s}`;
    const nameB = `Harness Order R91 B ${s}`;
    const mkA = await createPlainText(nameA, `${term} alpha first creation`);
    const mkB = await createPlainText(nameB, `${term} beta second creation`);
    const editA = await editAppend(nameA, `${term} gamma third act — A edited last`);
    await page.goto(O + "/", { waitUntil: "load", timeout: T }).catch(() => {});
    await page.waitForTimeout(500);
    const feedLink = page.locator("nav a", { hasText: /recent changes/i }).first();
    const feedDrive = { via: null };
    if ((await feedLink.count().catch(() => 0)) > 0) {
      await feedLink.click({ timeout: T }).catch(() => {});
      await page.waitForTimeout(1000);
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
      { nameA, nameB, mkA: { postStatus: mkA.postStatus }, mkB: { postStatus: mkB.postStatus }, editA, feedVia: feedDrive.via, indexA: iA, indexB: iB, rowsHead: feedDrive.rows.slice(0, 6) });
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
  // positive control. Leg shapes from batch5 7deabd7e (probe-pageonly-
  // batch5-ordering-case-paging-roles-empty-error.mjs:278-311).
  {
    const s = stamp();
    const name = `Harness Case R91 ${s}`;
    const token = `Cs91Token${s}`;
    const mk = await createPlainText(name, `body with ${token} inside`);
    const control = await visit(`/${urlKey(name)}`);
    const controlOk = control.status === 200 && control.html.includes(token);
    const lower = await visit(`/${urlKey(name).toLowerCase()}`);
    // The not-the-create-form discriminator is a VISIBLE card[name] prompt.
    // A bare /card-form/ substring is the wrong instrument: signed-in page
    // chrome (the navbox slot) also carries form.card-form nodes (batch5
    // run-1 REDed on exactly that while tokenFound proved the card resolved).
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

  // ------------------------------------------------------------ ACT-185
  // Plurality/slug pinning: name variants resolve to ONE card. The same
  // identity instrument as ACT-180, driven for the one-card guarantee rather
  // than the round trip: every variant lands on the SAME id, the card titles
  // itself with the ONE canonical name (not a variant echo), and the stored
  // deck holds exactly ONE non-trashed row for that name — so no variant
  // quietly created a second card. Plus the id mark as a cross-check.
  //
  // The name here is FIXED, not stamped. Run 1 of this probe stamped the name
  // and drew an all-caps RED that was an artifact of the random suffix, not a
  // property of the claim; the all-caps spelling is pinned deliberately in the
  // NEXT leg instead, on a name chosen to exercise it.
  {
    const name = "Harness Plurality Caseprobe 91";
    const token = "PluralityTokenCaseprobe91";
    const mk = await createPlainText(name, `body with ${token} inside`);
    const variants = [
      { label: "underscore slug", url: `/${urlKey(name)}` },
      { label: "lowercase slug", url: `/${urlKey(name).toLowerCase()}` },
      { label: "percent-encoded spaces", url: `/${encodeURIComponent(name)}` },
      { label: "uppercase slug", url: `/${urlKey(name).toUpperCase()}` },
    ];
    const resolved = [];
    for (const v of variants) {
      const r = await visit(v.url);
      resolved.push({ ...v, status: r.status, ...(await cardIdentity()) });
    }
    const ids = resolved.map((r) => r.cardId);
    const distinct = [...new Set(ids)];
    const d = db();
    const rows = d.prepare("SELECT id, name, trash FROM cards WHERE LOWER(name)=LOWER(?) ORDER BY id").all(name);
    d.close();
    const liveRows = rows.filter((r) => r.trash === 0);
    const oneCardInDeck = liveRows.length === 1 && String(liveRows[0].id) === String(mk.row?.id);
    grade("ACT-185", "name variants all pin to ONE card (one identity, one canonical title, one stored row)",
      mk.postStatus !== null && mk.postStatus < 400
        && resolved.every((r) => r.status === 200 && r.cardId !== null)
        && distinct.length === 1 && distinct[0] !== null && String(distinct[0]) === String(mk.row?.id)
        && resolved.every((r) => r.cardName === name)
        && oneCardInDeck,
      { name, createdRow: mk.row, resolved, distinctIds: distinct, deckRows: rows, liveRowCount: liveRows.length, oneCardInDeck });
    // cross-check: the id mark addresses that same card
    const idMark = await visit(`/~${mk.row?.id}`);
    const idMarkIdentity = await cardIdentity();
    grade("ACT-185", "the card's id mark addresses the same card as its name variants",
      idMark.status === 200 && String(idMarkIdentity.cardId) === String(mk.row?.id) && idMarkIdentity.cardName === name,
      { urlTried: `/~${mk.row?.id}`, status: idMark.status, ...idMarkIdentity });

    // The all-caps spelling of a name whose FINAL TOKEN ENDS IN DIGIT+C.
    // This is the narrow, measured divergence run 1 tripped over by accident,
    // pinned here on purpose so the cause is attributable rather than random.
    // Case folding itself is FINE — DeckoName.parse("HOME").key === "home",
    // and the all-caps slug of a name ending in a plain word resolves to the
    // same card (the leg above). What breaks is the KEY of an uppercase token
    // ending in digit+C: DeckoName.parse("MVEMONUT31C").key === "mvemonut31_c"
    // while parse("mvemonut31c").key === "mvemonut31c" — a spurious "_"
    // injected by the NOT_OK_FOR_KEY fold in simpleKeyUncached
    // (src/card/name.ts:128-135) after stableKey. The by-key lookup
    // (src/card/fetch/retrieve.ts:293, "SELECT * FROM cards WHERE key = ?"
    // against a plain `varchar` key column with no COLLATE NOCASE) then
    // misses, and the page falls into the unknown-card :new branch
    // (src/card/render/page.ts:309-351) — silently answering a CREATE FORM at
    // status 200 where the card should be. Measured with the engine's own
    // code; the trigger table is in the detail.
    {
      const digitCName = `Harness Plurality Digit 9c ${Date.now().toString(36)}`;
      const mkD = await createPlainText(digitCName, "plurality digit-C probe body");
      const canonical = await visit(`/${urlKey(digitCName)}`);
      const canonicalId = await cardIdentity();
      const shouted = await visit(`/${urlKey(digitCName).toUpperCase()}`);
      const shoutedId = await cardIdentity();
      // the engine's own key algebra for both spellings, computed in-process
      // from the ENGINE worktree's built dist (a Node-side dynamic import —
      // the browser context cannot import server modules)
      const keyAlgebra = await (async () => {
        try {
          const nameUrl = pathToFileURL(path.join(engineRepo, "dist", "src", "card", "name.js")).href;
          const surfaceUrl = pathToFileURL(path.join(engineRepo, "dist", "src", "server", "worker-shared-surface.js")).href;
          const nameMod = await import(nameUrl);
          const surfaceMod = await import(surfaceUrl);
          const a = nameMod.DeckoName.parse(digitCName);
          const b = nameMod.DeckoName.parse(surfaceMod.decodeName(urlKey(digitCName).toUpperCase()) ?? "");
          const trigger = {};
          for (const w of ["AB1C", "AB99C", "ABC", "CARDC", "STATUSC", "mvemonut31c", "MVEMONUT31C", "HOME", "FOCUS"]) {
            trigger[w] = nameMod.DeckoName.parse(w).key;
          }
          return { exactKey: a.key, shoutedKey: b.key, keysMatch: a.key === b.key, triggerTable: trigger };
        } catch (e) {
          return { error: String(e?.message ?? e) };
        }
      })();
      grade("ACT-185", "the all-caps spelling of a name ending digit+C resolves to that same card",
        mkD.postStatus !== null && mkD.postStatus < 400
          && canonical.status === 200 && canonicalId.cardId !== null
          && shouted.status === 200 && String(shoutedId.cardId) === String(canonicalId.cardId),
        {
          name: digitCName,
          canonicalUrl: `/${urlKey(digitCName)}`, canonicalStatus: canonical.status, canonicalCardId: canonicalId.cardId,
          shoutedUrl: `/${urlKey(digitCName).toUpperCase()}`, shoutedStatus: shouted.status,
          shoutedCardId: shoutedId.cardId, shoutedCardName: shoutedId.cardName,
          servedCreateFormInstead: shouted.status === 200 && shoutedId.cardId === null,
          keyAlgebra,
          cause: "DeckoName key algebra injects a spurious '_' into an uppercase token ending in digit+C (src/card/name.ts:128-135 simpleKeyUncached NOT_OK_FOR_KEY fold after stableKey); the by-key lookup at src/card/fetch/retrieve.ts:293 compares against a varchar key column with no COLLATE NOCASE, misses, and src/card/render/page.ts:309-351 answers the unknown-card :new page at status 200",
          measuredTrigger: "parse('AB1C').key==='ab1_c', parse('AB99C').key==='ab99_c' (DIFFER); parse('ABC').key==='abc', parse('CARDC').key==='cardc', parse('STATUSC').key==='statusc', parse('mvemonut31c').key==='mvemonut31c', parse('HOME').key==='home' (SAME) — so it is uppercase AND a final digit+C, not all-caps alone",
        });
    }
  }

  // ------------------------------------------------------------ ACT-186
  // Pagination math beyond page-2-differs: window disjointness, offset
  // advance, page-count arithmetic, and graceful oversized offset — driven on
  // the fixture's own Topic result set through the page's own Next control.
  {
    const first = await visit("/*search?query[keyword]=Topic");
    await page.waitForTimeout(800);
    const snap = () => page.evaluate(() => ({
      active: document.querySelector(".paging .page-item.active")?.textContent.trim() ?? null,
      ids: [...document.querySelectorAll("#main .search-result-list > .search-result-item")].map((i) => i.querySelector("[data-card-id]")?.getAttribute("data-card-id")).filter(Boolean),
      pageItems: [...document.querySelectorAll(".paging .page-item")].map((i) => i.textContent.trim()),
    }));
    const p1 = await snap();
    const windows = [p1.ids];
    const offsets = [];
    let hasNext = await page.locator("a.card-paging-link[aria-label='Next']").first().isVisible().catch(() => false);
    let guard = 0;
    while (hasNext && guard < 15) {
      const href = await page.locator("a.card-paging-link[aria-label='Next']").first().getAttribute("href", { timeout: T }).catch(() => null);
      if (href) offsets.push(new URL(href, O).searchParams.get("offset"));
      await page.locator("a.card-paging-link[aria-label='Next']").first().click({ timeout: T }).catch(() => {});
      await page.waitForTimeout(900);
      windows.push((await snap()).ids);
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
    const over = await page.evaluate(async ({ origin }) => {
      const r = await fetch(`${origin}/*search?query[keyword]=Topic&offset=100000`, { credentials: "include" });
      return { status: r.status, head: (await r.text()).slice(0, 120) };
    }, { origin: O });
    grade("ACT-186", "an offset beyond the last page degrades gracefully (never a 5xx)",
      over.status !== null && over.status < 500,
      { requested: "/*search?query[keyword]=Topic&offset=100000", ...over });
  }

  // ------------------------------------------------------------ ACT-187
  // Feed dedup: the same act must not repeat in a feed. Setup: four
  // DISTINCT acts on the feed (create A, edit A, edit A again, create B), so
  // the leg can tell "deduped" from "hidden everything" — the feed must carry
  // each act exactly once while carrying no act twice. The instrument is each
  // row's `action_id` (from its data-slot JSON), which is the act's identity:
  // two edits of one card are two DIFFERENT acts and must both appear.
  {
    const s = stamp();
    const nameA = `Harness Dedup R91 A ${s}`;
    const nameB = `Harness Dedup R91 B ${s}`;
    const mkA = await createPlainText(nameA, `dedup create A ${s}`);
    const edit1 = await editAppend(nameA, `dedup edit one ${s}`);
    const edit2 = await editAppend(nameA, `dedup edit two ${s}`);
    const mkB = await createPlainText(nameB, `dedup create B ${s}`);
    const driveOk = [mkA, edit1, edit2, mkB].every((r) => r.postStatus !== null && r.postStatus < 400);
    const first = await visit("/*recent");
    const rows = await feedActRows();
    const withIds = rows.filter((r) => r.actionId !== null);
    const actionIds = withIds.map((r) => r.actionId);
    const repeated = actionIds.filter((v, i) => actionIds.indexOf(v) !== i);
    const mine = (n) => rows.filter((r) => key(r.cardName) === key(n));
    const mineA = mine(nameA), mineB = mine(nameB);
    grade("ACT-187", "no act repeats in the Changes feed (every action_id appears exactly once)",
      first.status === 200 && driveOk && withIds.length > 0 && actionIds.length === new Set(actionIds).size && repeated.length === 0,
      { feedStatus: first.status, totalActRows: rows.length, rowsWithActionId: withIds.length, distinctActionIds: new Set(actionIds).size, repeatedActionIds: repeated });
    grade("ACT-187", "the acts just driven each appear, and the three acts on one card are three distinct acts",
      driveOk && mineA.length === 3 && mineB.length === 1
        && new Set(mineA.map((r) => r.actionId)).size === 3
        && new Set([...mineA, ...mineB].map((r) => r.actionId)).size === 4,
      { nameA, nameB, actsOnA: mineA.map((r) => ({ actionId: r.actionId, view: r.view, text: r.text })), actsOnB: mineB.map((r) => ({ actionId: r.actionId, view: r.view, text: r.text })), driveOk });
    // re-reading the same feed must not introduce a repeat
    const second = await visit("/*recent");
    const rows2 = await feedActRows();
    const ids2 = rows2.map((r) => r.actionId).filter((v) => v !== null);
    const repeated2 = ids2.filter((v, i) => ids2.indexOf(v) !== i);
    grade("ACT-187", "re-reading the feed repeats no act (the dedup holds across reads)",
      second.status === 200 && ids2.length > 0 && repeated2.length === 0 && ids2.length === ids2.length,
      { secondFeedStatus: second.status, rowsWithActionId: ids2.length, repeatedActionIds: repeated2 });
  }

  // ------------------------------------------------------------ ACT-189
  // Empty-vs-error: a zero-match search renders the empty search surface; a
  // missing card renders an error; neither shape leaks into the other.
  {
    const gib = `ZqxNoMatch91${stamp()}`;
    const empty = await visit(`/*search?query[keyword]=${gib}`);
    // MEASURED, recorded, NOT required: a ZERO-match search renders NO
    // .search-result-list container at all (resultListRendered: false) — that
    // is the empty surface's own shape, not a missing render. The legs that
    // expect rows (ACT-181/184) DO wait for the list; this leg expects none,
    // so requiring the container here would fail the correct behaviour.
    const listAppeared = await page.waitForSelector("#main .search-result-list", { timeout: 5_000 }).then(() => true).catch(() => false);
    const emptyRows = await searchRows();
    const emptyShape = await page.evaluate(() => ({
      hasSearchBox: !!document.querySelector("form.search-box-form input[name='query[keyword]'], input[name='query[keyword]']"),
      notFoundViews: document.querySelectorAll(".not_found-view").length,
      jsonErrorInPage: document.documentElement.innerHTML.includes('"error"'),
    }));
    grade("ACT-189", "an empty result set renders as the search surface with zero rows, not an error",
      empty.status === 200 && emptyRows.length === 0 && emptyShape.hasSearchBox && !emptyShape.jsonErrorInPage,
      { term: gib, status: empty.status, resultListRendered: listAppeared, rows: emptyRows.length, ...emptyShape });
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
      empty.status === 200 && emptyRows.length === 0 && !emptyShape.jsonErrorInPage && emptyShape.notFoundViews === 0 && missing.status === 404,
      { emptyStatus: empty.status, emptyRows: emptyRows.length, emptyJsonError: emptyShape.jsonErrorInPage, emptyNotFoundViews: emptyShape.notFoundViews, missingStatus: missing.status });
  }

  // ------------------------------------------------------------ ACT-188
  // Affordance visibility per role: the create-form type control renders a
  // role-scoped option set. Positive controls both ways: the structure types
  // MUST be present for the administrator and the shared types MUST be
  // present for both roles — a leg whose positive control fails is RED, not
  // pass.
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
      { adminTypeCount: adminTypes?.length ?? null, memberTypeCount: memberTypes?.length ?? null, structureTypesRequiredForAdmin: structure, leakedIntoMember, adminSharedRichText: adminShared, memberSharedRichText: memberShared, adminVisitStatus: adminVisit.status, memberVisitStatus: memberVisit.status, memberSignedIn: memberVisit.signedIn, adminTypes, memberTypes });
  }
} catch (err) {
  report.fatal = String(err?.stack ?? err);
  console.error("[ranks91-100] FATAL", report.fatal);
} finally {
  writeFileSync(path.join(out, "probe-ranks91-100-result.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`[ranks91-100] legs ${report.legs.length}, failures ${report.failures}, evidence ${path.join(out, "probe-ranks91-100-result.json")}`);
  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
  process.exit(report.failures > 0 || report.fatal ? 1 : 0);
}
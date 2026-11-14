#!/usr/bin/env node
// probe-pageonly-ranks101-110-search-overmatch-edit.mjs
//
// Ranks 101-110 of the canonical witnessed-only list — the tail window. The
// list (.runtime/exhaustive/2026-10-18-regrade: 101 of 190 actions graded
// "page-only" — visited and observed, no affordance exercised; the id list
// itself is tmp/pageonly-101-ids.json on the coordination tree, brandonDojoTech)
// ends at 101, so this window is rank 101 plus every id prior lanes recorded
// as left/skipped and never picked up. Boundary, stated so windows never
// overlap:
//
//   rank 101  ACT-190  search over-match: the port returns more results than
//                      the original site for the same query (143+ vs 127;
//                      whole-count divergence open in the debrief)
//   rank  47  ACT-082  E12 a card's type can be changed in the board (the
//                      card's stored type becomes Book)
//   rank  48  ACT-083  E23 a pointer card can be edited: the selection changes
//                      and is stored
//   rank  46  ACT-081  E10 a plain-input card can be edited and saved (the new
//                      content shows on the card)
//
// Why exactly these four. Rank 101 is ACT-190, the last id in the file. The
// other three are the ids prior lanes named as outstanding and no lane then
// took: probe-pageonly-batch6-history-acts-create-edit-affordances.mjs:26
// (committed as d69c2369) states "ranks 61-63 (ACT-081/082/083) remain for
// the next lane", and the next lane (47915f69, ranks 61-70 = ACT-115..134)
// took the id-ordered ranks instead, so the three were orphaned. Nothing else
// in the canonical 101 is open: every other id is driven by a committed probe
// or already carries an instrument, which the receipt records as
// `boundary.accountedFor` with its pointer, so a later lane can audit the
// claim instead of re-deriving it.
//
// Every leg drives the affordance the way a person does, on the same engine
// and fixture the exhaustive runner grades (reference-harness/browser/engines/
// ts.json over reference-harness/fixtures/synthetic-v1). The engine stages a
// private copy of the fixture deck (lib/engines.mjs), so every write this
// probe makes dies with the staging directory. Exits non-zero if any leg is
// RED.
//
// ACT-190 is measured, not asserted. Its recorded contract is a COMPARISON
// against the original site, which the port alone cannot decide, so this lane
// boots the stock Ruby 3.3 oracle (engines/ruby33.json, Decko 0.20.0 / card
// 1.110.0) on the SAME fixture copy, reads both whole-counts out of the same
// .paging-context block, and reports the verdict it finds — see the leg and
// the receipt's `act190` block. That is the one place this probe goes beyond
// the ts engine, and it is labelled as such in every receipt.
//
//   node reference-harness/browser/probe-pageonly-ranks101-110-search-overmatch-edit.mjs \
//     [--engine <pure-tip checkout>/reference-harness/browser/engines/ts.json] \
//     [--fixture reference-harness/fixtures/synthetic-v1] [--out <dir>]

import { mkdirSync, writeFileSync, readFileSync, cpSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";
// Pure read-only row resolvers, imported rather than re-derived: new-schema
// junction rows can carry a NULL name column, so a rule card's identity is
// its (left_id, right_id) pair, not its name string
// (tools/edge-signed-in-exercise/lib/typed-fixture.mjs:8-14,19-26).
import { fixtureCard, fixtureType } from "../../tools/edge-signed-in-exercise/lib/typed-fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const engineManifest = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-pageonly-ranks101-110");
const SEARCH_TERMS = ["Topic", "the", "card"];
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

// The ENGINE's build record: the engine boots from a disposable pure-tip
// worktree (--engine), so its OWN build provenance is what this lane measured.
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
    // Disclosed, not hidden: this checkout carries OTHER lanes' uncommitted
    // writes and is NOT the measured engine. They are listed here and are not
    // part of any measurement; the engine boots from engineBuild below.
    dirtyPorcelain: dirtyPorcelain || "",
    repoDistSha256: treeDigest(path.join(repo, "dist")),
    engineManifest,
    engineBuild,
    // the two digests the ask requires in every receipt, named at the top level
    sourceDiffSha256: engineBuild?.sourceDiffSha256 ?? null,
    distSha256: engineBuild?.distSha256 ?? null,
    fixtureSha256: treeDigest(fixtureDir),
  },
  boundary: {
    window: "ranks 101-110 of the canonical witnessed-only 101-id list, id order",
    canonicalList: "C:/localProjects/brandonDojoTech/tmp/pageonly-101-ids.json",
    listEndsAt: 101,
    ids: [
      { act: "ACT-190", rank: 101, why: "rank 101 — the last id in the canonical list" },
      { act: "ACT-081", rank: 46, why: "named outstanding by d69c2369's lane (probe-pageonly-batch6-history-acts-create-edit-affordances.mjs:26, 'ranks 61-63 (ACT-081/082/083) remain for the next lane'); the next lane took id-ordered ranks 61-70 instead" },
      { act: "ACT-082", rank: 47, why: "same named-outstanding record as ACT-081" },
      { act: "ACT-083", rank: 48, why: "same named-outstanding record as ACT-081" },
    ],
    accountedFor: {
      note: "every other id in the canonical 101 is already driven or instrumented; this lane does not re-drive them",
      drivenByCommittedProbes: "reference-harness/browser/probe-pageonly-*.mjs (top10 bc81fbb5, batch2 5bdda29f, batch3 cacce253, batch4 93771deb, batch5 7deabd7e, batch6-history d69c2369, batch6-owner-rows 47915f69)",
      skippedByBatch5_7deabd7e: {
        receipt: ".runtime/exhaustive/probe-pageonly-batch5-run2/probe-batch5-result.json boundary.skips_already_instrumented",
        ids: ["ACT-089", "ACT-091", "ACT-095", "ACT-096", "ACT-104", "ACT-105", "ACT-106", "ACT-110", "ACT-111", "ACT-112", "ACT-114", "ACT-115", "ACT-009", "ACT-010", "ACT-058", "ACT-063", "ACT-065", "ACT-066", "ACT-067"],
      },
      skippedByBatch2_5bdda29f: {
        receipt: "probe-pageonly-batch2-write-permission.mjs:8-16 header (checks-cover-b.mjs:253-602, checks-catalog-edit-create.mjs)",
        ids: ["ACT-070", "ACT-071", "ACT-072", "ACT-073", "ACT-074", "ACT-076", "ACT-079", "ACT-080", "ACT-128", "ACT-129", "ACT-134", "ACT-135"],
      },
      drivenBySiblingRankWindows: "ranks 71-80 / 81-90 / 91-100 are separate live lanes (worktrees decko-pageonly-ranks71-80-tip, -ranks81-90-tip, -ranks91-100-tip, all at d69c2369); this lane touches none of their ids",
    },
  },
  legs: [],
  failures: 0,
};

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[ranks101-110] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 900)}`);
}

const stamp = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const urlKey = (n) => n.replaceAll(" ", "_");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** The mods' public dir (TinyMCE theme, ace modes) is a gitignored Ruby-setup
 *  artifact, not engine code (ts-server.mjs:69-77). A disposable pure-tip
 *  build worktree lacks it — ts-server.mjs:76 throws — so it gets a wrapper
 *  manifest that boots THAT checkout's server with DECKO_MOD_PUBLIC_DIR
 *  pointed at this repo's copy. The engine dist stays the target checkout's
 *  own build (batch6's shape, probe-pageonly-batch6-owner-rows-*.mjs:139-165). */
function resolveEngineManifest(manifestIn) {
  const engineRepo = path.resolve(path.dirname(manifestIn), "..", "..", "..");
  const modDir = (r) => path.join(r, "reference-harness", "oracle", "app", "public");
  if (existsSync(path.join(modDir(engineRepo), "mod"))) return manifestIn;
  if (!existsSync(path.join(modDir(repo), "mod"))) return manifestIn;
  const manifest = JSON.parse(readFileSync(manifestIn, "utf8"));
  const wrapperPath = path.join(out, "engine-with-mod-dir.json");
  writeFileSync(wrapperPath, JSON.stringify({
    ...manifest,
    description: manifest.description + " (ranks101-110 wrapper: boots this checkout's server with DECKO_MOD_PUBLIC_DIR from the probe repo — the disposable pure-tip worktree lacks the gitignored mod-public artifact)",
    command: ["node", path.join(path.dirname(manifestIn), "ts-server.mjs")],
    env: { ...(manifest.env ?? {}), DECKO_MOD_PUBLIC_DIR: modDir(repo) },
  }, null, 2));
  return wrapperPath;
}

const engine = loadEngine(resolveEngineManifest(engineManifest));
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
const spec = readJson(path.join(fixtureDir, "deck.json"));
const O = server.base;
console.log(`[ranks101-110] engine ${engine.name} on ${O} (boot ${server.bootMs}ms) probe commit ${sourceCommit.slice(0, 8)} engine commit ${(engineBuild?.sourceCommit ?? "?").slice(0, 8)}`);

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(T);
page.on("dialog", (d) => d.accept().catch(() => {}));
if (!["127.0.0.1", "localhost"].includes(new URL(O).hostname)) throw Error("ranks101-110 probe requires the loopback engine");

const db = () => new DatabaseSync(server.db, { readOnly: true });
const row = (name) => {
  const found = fixtureCard(db(), name);
  return found ? { ...found, content: found.db_content } : undefined;
};

const signIn = async (who) => {
  const a = spec.actors[who];
  await ctx.clearCookies();
  await page.goto(O + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email, { timeout: T });
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password, { timeout: T });
  await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
  await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
  await page.waitForTimeout(600);
  return {
    signedInChrome: (await page.locator("a.signout-link").first().count().catch(() => 0)) > 0,
    url: page.url(),
  };
};
/** A page.goto that survives a pending save-navigation (batch6's run-3 lesson:
 *  after a save, an immediate goto can throw and leave the page stale, and
 *  every later leg then reads the WRONG page while context-level requests
 *  still succeed). Waits the current page out, retries once, never swallows. */
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
const evalPage = async (fn, arg) => page.evaluate(fn, arg).catch((e) => ({ error: String(e?.message ?? e) }));

/** Create a typed card the way a person does: the /new/<Type> form, its own
 *  name field, its own root content field, its own create button. Ported from
 *  the reference check's createTypedFixture
 *  (tools/edge-signed-in-exercise/lib/typed-fixture.mjs:28-77) with the same
 *  verifications: the form must be the local /card/create action and the
 *  stored row must carry the requested type. */
const createTyped = async ({ name, content = "", type = "RichText" }) => {
  const d = db();
  let expected;
  try {
    expected = fixtureType(d, type);
  } catch (e) {
    d.close();
    throw e;
  }
  d.close();
  const params = new URLSearchParams({ "card[name]": name });
  if (content !== "" && content !== null && content !== undefined) params.set("card[content]", content);
  const opened = await page.goto(`${O}/new/${encodeURIComponent(expected.name)}?${params.toString()}`, { waitUntil: "domcontentloaded", timeout: T }).catch(() => null);
  if (!opened || opened.status() >= 400) return { ok: false, status: opened ? opened.status() : null, name };
  let form = page.locator("form.card-form").filter({ has: page.locator("input[name='card[name]']") }).filter({ has: page.locator(".create-submit-button") }).first();
  if ((await form.count().catch(() => 0)) === 0) return { ok: false, status: opened.status(), note: "no create form with a name field", name };
  const action = new URL(await form.getAttribute("action"), O);
  const nameField = form.locator("input[name='card[name]']").first();
  if ((await nameField.inputValue().catch(() => "")) !== name) await nameField.fill(name, { timeout: T }).catch(() => {});
  const assignedType = Number(await form.locator("[name='card[type_id]']").first().inputValue().catch(() => NaN));
  if (assignedType !== expected.id) return { ok: false, status: opened.status(), note: `create form assigned type ${assignedType}, expected ${expected.id}`, name };
  if (content !== "" && content !== null && content !== undefined) {
    const field = form.locator("[name='card[content]']").first();
    if ((await field.count().catch(() => 0)) === 0) return { ok: false, status: opened.status(), note: "no root content field", name };
    const isTiny = await field.evaluate((el) => el.classList.contains("tinymce-textarea")).catch(() => false);
    if (isTiny) {
      const id = await field.getAttribute("id");
      await page.waitForFunction((tid) => !!window.tinymce?.get(tid), id, { timeout: 20_000 }).catch(() => {});
      await page.evaluate(([tid, text]) => { const e = window.tinymce.get(tid); e.setContent(text); e.save(); }, [id, content]).catch(() => {});
    } else if (await field.isVisible().catch(() => false)) {
      await field.fill(content, { timeout: T }).catch(() => {});
    }
  }
  const pending = page.waitForResponse(
    (r) => new URL(r.url()).origin === O && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST",
    { timeout: T },
  ).then((response) => ({ response }), (error) => ({ error }));
  await form.locator(".create-submit-button").first().click({ timeout: T });
  const seen = await pending;
  if (seen.error) return { ok: false, status: null, error: String(seen.error).slice(0, 160), name };
  await seen.response.finished().catch(() => {});
  const outcome = await seen.response.json().catch(() => null);
  if (typeof outcome?.redirect === "string") await page.waitForURL(new URL(outcome.redirect, O).href, { waitUntil: "domcontentloaded", timeout: T }).catch(() => {});
  const stored = row(name);
  return {
    ok: seen.response.status() < 400 && !!stored && Number(stored.type_id) === Number(expected.id),
    status: seen.response.status(),
    name,
    expectedTypeId: expected.id,
    storedTypeId: stored?.type_id ?? null,
    note: !stored ? "row not stored" : Number(stored.type_id) !== Number(expected.id) ? `stored type_id ${stored.type_id}, expected ${expected.id}` : null,
  };
};
/** Submit a form by its own submit control, watching the POST it fires. */
const submitWatching = async (form, methodPath) => {
  const responded = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname.startsWith(methodPath),
    { timeout: T },
  ).catch(() => null);
  const submit = form.locator("button[type=submit], input[type=submit], .submit-button, .create-submit-button").first();
  if ((await submit.count().catch(() => 0)) > 0) await submit.click({ timeout: T }).catch(() => {});
  else await form.evaluate((f) => f.requestSubmit?.() ?? f.submit()).catch(() => {});
  const resp = await responded;
  if (resp) await resp.finished().catch(() => {});
  return resp ? { status: resp.status(), path: new URL(resp.url()).pathname } : null;
};

try {
  // The fixture administrator is the person every write leg in this window
  // belongs to: the board's type row, the pointer editor and the plain-input
  // editor are all owner surfaces. Sign in FIRST — run 1 drove the whole
  // window signed out and every /new/<type> create answered 403.
  const admin = await signIn("admin");
  if (admin.signedInChrome !== true) throw Error(`the admin sign-in did not hold (landed ${admin.url})`);

  // ---------------------------------------------------------------- ACT-081
  // "E10 a plain-input card can be edited and saved (the new content shows on
  // the card)". The action's own plain-input type on this fixture is Phrase
  // (28 rows; fixtureType resolves the canonical codename, typed-fixture.mjs:
  // 19-26). Drive: create the card with a known body, open the card, take its
  // OWN edit affordance (the card's edit-link), replace the body in the
  // editor the modal serves, submit the modal's own button, then require a
  // sub-400 write, the new body on the card page, and the new body in the
  // stored row.
  {
    const name = "Harness_P101_Plain_" + stamp();
    const original = `Harness original phrase ${name}`;
    const edited = `Harness edited phrase ${name}`;
    const created = await createTyped({ name, content: original, type: "Phrase" });
    const before = row(name)?.content ?? null;
    const seen = await gotoPage(`/${urlKey(name)}`);
    await page.locator("#main a.edit-link[href$='/edit']").first().dispatchEvent("click").catch(() => {});
    await page.waitForSelector("#edit_card, .modal", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const field = page.locator('#edit_card input[name$="[content]"]:not([type=hidden]), #edit_card textarea[name$="[content]"], .modal input[name$="[content]"]:not([type=hidden]), .modal textarea[name$="[content]"]').first();
    const fieldInfo = await field.evaluate((el) => ({ tag: el.tagName, type: el.type ?? null, value: el.value })).catch(() => null);
    if (fieldInfo !== null) await field.fill(edited).catch(() => {});
    const post = await submitWatching(page.locator("#edit_card form.card-form, .modal.show form.card-form").first(), "/update/");
    await page.waitForTimeout(1500);
    const after = await gotoPage(`/${urlKey(name)}`);
    const afterHtml = (await page.content().catch(() => ""));
    const stored = row(name)?.content ?? null;
    grade("ACT-081", "E10 a plain-input card can be edited and saved (the new content shows on the card)",
      created.ok === true && before === original && fieldInfo !== null
        && post !== null && post.status !== null && post.status < 400
        && after.status === 200 && afterHtml.includes(edited) && stored === edited,
      { created, cardPage: seen.status, fieldInfo, post, afterStatus: after.status, showsEdited: afterHtml.includes(edited), storedContent: stored, storedBefore: before });
  }

  // ---------------------------------------------------------------- ACT-082
  // "E12 a card's type can be changed in the board (the card's stored type
  // becomes Book)". Ruby names Book a Cardtype (checks-cover-b.mjs:449), so
  // this leg creates a Cardtype named exactly "Book" through its own create
  // form, creates a scratch plain card, opens the card's BOARD, takes the
  // board's own type-edit row, chooses Book in the type field the row serves,
  // presses the Save button INSIDE THAT ROW'S OWN FORM, and reads the STORED
  // type_id back out of the deck — the stored row is the authority, not the
  // page.
  //
  // Three mechanics this leg had to learn from the engine, each reproduced
  // from a live run and kept here so a later reader does not re-derive them:
  //   1. The type select only offers a Cardtype created through the app once
  //      the board page is loaded AFTER the create: 33 options before, 34
  //      with the new type after (discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create.mjs). So Book is created first and
  //      the board is opened on a fresh navigation.
  //   2. The modal serves the type formgroup's form; the person must press
  //      the submit control INSIDE the form that owns the select. Clicking a
  //      modal-wide ".modal form.card-form button.submit-button" can land on
  //      a different form with the same /update/<card> action, and that POST
  //      carries neither card[type] nor assign (POST bodies captured in
  //      discovery-pageonly-ranks101-110-act082-save-post-body.mjs against the
  //      form field list in ...-act082-select-owner-form.mjs) — the write then
  //      succeeds and changes nothing.
  //   3. The port maps the update's card["type"] to the assigned type at
  //      src/server/write-routes.ts:2046 (`typeName: card["type"]`), which
  //      card-action-engine.ts:2649-2662 resolves before the ok? gate. So a
  //      correct submission MUST move the stored type_id (measured 37 -> 912 in
  //      discovery-pageonly-ranks101-110-act082-form-control-attributes.mjs).
  {
    const name = "Harness_P101_TypeChange_" + stamp();
    const bookType = `Book_${stamp()}`;
    // The Cardtype create form's own content affordance on this port is the
    // description subcard (card[subcards][+description][content]), not a root
    // card[content] — so a "+*type+*structure" rule cannot be set through the
    // create form here (field dump in discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields.mjs). The action's contract is the
    // STORED TYPE, not the structure, so the leg creates the Cardtype through
    // the affordance the form does serve and says so in the receipt.
    const bookMade = await createTyped({ name: bookType, content: undefined, type: "Cardtype" });
    const scratch = await createTyped({ name, content: `Harness typechange subject ${name}`, type: "PlainText" });
    const d1 = db();
    const bookId = fixtureCard(d1, bookType)?.id ?? null;
    const beforeTypeId = fixtureCard(d1, name)?.type_id ?? null;
    d1.close();

    const seen = await gotoPage(`/${urlKey(name)}/board`);
    await page.waitForTimeout(1500);
    const rowLink = page.locator(".board a[href$='/board_type_formgroup'], .board .edit_type_row a, .board a[href$='/edit_type']").first();
    const rowCount = await rowLink.count().catch(() => 0);
    let typeFieldPresent = false, chosen = null, post = null, optionCount = null, postBody = null, clicked = null;

    if (rowCount > 0) {
      await rowLink.dispatchEvent("click").catch(() => {});
      await page.waitForTimeout(2000);
      const typeField = page.locator(".modal select[name='card[type]']").first();
      typeFieldPresent = (await typeField.count().catch(() => 0)) > 0;
      if (typeFieldPresent) {
        optionCount = await typeField.locator("option").count().catch(() => 0);
        await typeField.selectOption(bookType, { timeout: 10_000 });
        chosen = { value: await typeField.inputValue().catch(() => null) };
        // Read the chosen value and press the Save that lives INSIDE the
        // select's own form IN ONE DOM evaluation. The two cannot be split:
        // the select carries _live-type-field, so choosing a type re-renders
        // the modal, and any await between reading the value and clicking
        // leaves the button detached (run 6 recorded exactly that —
        // "elementHandle.click: Element is not attached to the DOM"). One
        // evaluate is what discovery-pageonly-ranks101-110-act082-form-control-attributes.mjs did, and it fired the correct native
        // POST carrying card[type] and assign.
        const responded = page.waitForResponse(
          (r) => r.request().method() === "POST" && new URL(r.url()).pathname.startsWith("/update/"),
          { timeout: T },
        ).then((response) => ({ response }), (error) => ({ error: String(error).slice(0, 120) }));
        const bodies = [];
        const onReq = (r) => { if (r.method() === "POST" && new URL(r.url()).pathname.startsWith("/update/")) bodies.push((r.postData() ?? "").slice(0, 700)); };
        page.on("request", onReq);
        const pressed = await page.evaluate(() => {
          const el = document.querySelector(".modal select[name='card[type]']");
          const f = el?.closest("form");
          const btn = f?.querySelector("button.submit-button, button[type=submit]");
          if (!el || !f || !btn) return { value: el?.value ?? null, clicked: false, why: "no owner form or no submit control" };
          const value = el.value;
          btn.click();
          return { value, clicked: true, formAction: f.getAttribute("action"), buttonClass: btn.className.slice(0, 60) };
        }).catch((e) => ({ value: null, clicked: false, why: String(e?.message ?? e).slice(0, 160) }));
        const seenPost = await responded;
        page.off("request", onReq);
        postBody = bodies[0] ?? null;
        chosen = { value: pressed.value ?? null };
        clicked = { how: pressed.clicked ? "dom-owner-form" : "none", detail: pressed };
        if (seenPost.response) { await seenPost.response.finished().catch(() => {}); post = { status: seenPost.response.status(), path: new URL(seenPost.response.url()).pathname }; }
      }
      await page.waitForTimeout(2000);
    }
    const d2 = db();
    const storedTypeId = fixtureCard(d2, name)?.type_id ?? null;
    d2.close();
    const after = await gotoPage(`/${urlKey(name)}`);
    grade("ACT-082", "E12 a card's type can be changed in the board (the card's stored type becomes Book)",
      bookMade.ok === true && scratch.ok === true && bookId !== null && beforeTypeId !== null
        && rowCount > 0 && typeFieldPresent === true && chosen?.value === bookType
        && post !== null && post.status !== null && post.status < 400
        && Number(storedTypeId) === Number(bookId) && Number(storedTypeId) !== Number(beforeTypeId)
        && after.status === 200,
      { bookType, bookMade, scratch, boardStatus: seen.status, rowCount, typeFieldPresent, optionCount, chosen, clicked, post, postBody, typeIdBefore: beforeTypeId, typeIdAfter: storedTypeId, bookId, afterStatus: after.status,
        note: "the Cardtype create form's own content affordance on this port is card[subcards][+description][content]; it serves no root card[content], so this leg does not set a +*type+*structure rule — the action's contract is the stored type" });
  }

  // ---------------------------------------------------------------- ACT-083
  // "E23 a pointer card can be edited: the selection changes and is stored".
  // The pointer affordance needs a real rule chain, so the leg builds the
  // reference check's own fixture end to end (checks-cover-b.mjs:335-350,
  // 668-686): an option Cardtype with two option cards, a Search rule on the
  // right set carrying the deck's canonical *content options setting, a Phrase
  // rule carrying input_type "select", then the host and its pointer rule and
  // card. The drive is the pointer card's own edit affordance: open it, pick
  // the SECOND option in the select the editor serves, submit the editor's
  // own button, and require the stored rule content to name that option.
  {
    const suffix = stamp();
    const rightSet = `Harness_P101_Role_${suffix}`;
    const optionType = `Harness_P101_Option_${suffix}`;
    const pickOne = `Harness_P101_Pick_One_${suffix}`;
    const pickTwo = `Harness_P101_Pick_Two_${suffix}`;
    const host = `Harness_P101_Host_${suffix}`;
    const pointer = `${host}+${rightSet}`;
    const d0 = db();
    const settingsRow = d0.prepare("SELECT name FROM cards WHERE codename='content_options' AND trash=0").get() ?? null;
    d0.close();
    const made = [];
    if (settingsRow?.name) {
      made.push(await createTyped({ name: optionType, content: "", type: "Cardtype" }));
      made.push(await createTyped({ name: pickOne, content: "", type: optionType }));
      made.push(await createTyped({ name: pickTwo, content: "", type: optionType }));
      made.push(await createTyped({ name: `${rightSet}+*right+${settingsRow.name}`, content: JSON.stringify({ type: optionType, sort: "name" }), type: "Search" }));
      made.push(await createTyped({ name: `${rightSet}+*right+*input type`, content: "select", type: "Phrase" }));
    }
    const hostMade = await createTyped({ name: host, content: "", type: "PlainText" });
    const pointerMade = await createTyped({ name: pointer, content: pickOne, type: "Pointer" });
    const seen = await gotoPage(`/${encodeURIComponent(pointer)}`);
    await page.locator("#main a.edit-link[href$='/edit']").first().dispatchEvent("click").catch(() => {});
    const form = page.locator(".modal.show form.card-form[id^='edit_card']:visible").first();
    const formVisible = await form.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
    const formBelongs = formVisible
      ? Number(await form.locator("xpath=ancestor::*[@data-card-id][1]").getAttribute("data-card-id").catch(() => NaN)) === Number(row(pointer)?.id ?? -1)
      : false;
    const selects = formVisible
      ? await form.locator("select").evaluateAll((items) => items.map((s) => ({ name: s.name, value: s.value, options: [...s.options].map((o) => ({ text: o.textContent.trim(), value: o.value })) }))).catch(() => [])
      : [];
    const target = selects.find((s) => s.options.some((o) => o.text.includes(pickTwo) || o.value.includes(pickTwo)));
    const option = target?.options.find((o) => o.text.includes(pickTwo) || o.value.includes(pickTwo)) ?? null;
    let post = null;
    if (target && option) {
      await form.locator(`select[name="${target.name}"]`).selectOption(option.value).catch(() => {});
      post = await submitWatching(form, "/update/");
    }
    await page.waitForTimeout(1500);
    const stored = row(pointer)?.content ?? "";
    const after = await gotoPage(`/${encodeURIComponent(pointer)}`);
    const afterHtml = (await page.content().catch(() => ""));
    const allMade = made.every((m) => m.ok === true);
    grade("ACT-083", "E23 a pointer card can be edited: the selection changes and is stored",
      !!settingsRow?.name && allMade && hostMade.ok === true && pointerMade.ok === true
        && formVisible === true && formBelongs === true && !!target && !!option
        && post !== null && post.status !== null && post.status < 400
        && stored.includes(pickTwo) && after.status === 200 && afterHtml.includes(pickTwo),
      { settingsRow, made, hostMade, pointerMade, cardPage: seen.status, formVisible, formBelongs, selectCount: selects.length, selectNames: selects.map((s) => s.name), chose: option, post, storedContent: stored.slice(0, 160), afterStatus: after.status, showsPickTwo: afterHtml.includes(pickTwo) });
  }

  // ---------------------------------------------------------------- ACT-190
  // "search over-match: the port returns more results than the original site
  // for the same query (143+ vs 127; whole-count divergence open in the
  // debrief)". Rank 101, and the only id in the window whose contract is a
  // COMPARISON the port alone cannot decide — so this leg drives the port's
  // own search affordance (the page's search box, typed and submitted by a
  // person), reads the port's whole-count, then boots the stock Ruby 3.3
  // oracle on the SAME fixture copy as the SAME viewer and reads its
  // whole-count out of the same .paging-context block. Both sides are the
  // same viewer state, so neither page-size nor pagination shape can flatter
  // the other.
  //
  // WHAT THE GREEN MEANS: the comparison completed and both counts were read.
  // It does NOT mean the finding is closed — the receipt carries the verdict
  // (`claimReproduced`) field and this report states it verbatim.
  {
    // person-shaped: type the term into the page's own search box and submit
    const viaBox = {};
    await gotoPage("/");
    for (const term of SEARCH_TERMS) {
      const box = page.locator("input[name='card[query][+*keyword][content]'], input[type=text][name*='keyword']").first();
      const boxCount = await box.count().catch(() => 0);
      let landed = null, whole = null, rows = 0, keyword = null;
      if (boxCount > 0) {
        await box.fill(term, { timeout: T }).catch(() => {});
        const nav = page.waitForURL((u) => decodeURIComponent(u.pathname).includes("*search"), { timeout: T }).catch(() => null);
        await box.press("Enter").catch(() => {});
        await nav;
        await page.waitForTimeout(900);
        landed = { status: null, url: page.url() };
        const read = await evalPage(() => {
          const ctx = document.querySelector(".paging-context");
          const raw = ctx ? ctx.textContent.replace(/\s+/g, " ").trim() : null;
          const kw = document.querySelector(".search-keyword")?.textContent?.trim() ?? null;
          return { raw, keyword: kw, rows: document.querySelectorAll(".search-result-list > .search-result-item").length, title: document.title };
        });
        keyword = read.keyword;
        rows = read.rows;
        whole = read.raw ? { raw: read.raw, count: Number(read.raw.match(/of\s+(\d+)/)?.[1] ?? NaN) } : { raw: read.raw ?? null, count: null };
      }
      viaBox[term] = { boxCount, landed, keyword, rows, whole, title: undefined };
    }

    // the same terms, signed out, on both engines
    const anonymousFetch = async (base, tag) => {
      const per = {};
      for (const term of SEARCH_TERMS) {
        const html = await fetch(`${base}/*search?query[keyword]=${encodeURIComponent(term)}`, { headers: { accept: "text/html" } })
          .then(async (r) => ({ status: r.status, html: await r.text() }))
          .catch((e) => ({ status: null, html: `ERROR ${e?.message ?? e}` }));
        writeFileSync(path.join(out, `${tag}-anonymous-${term.replace(/[^a-z0-9]+/gi, "_")}.html`), html.html);
        const raw = html.html.match(/<div class=['"]paging-context['"]>([\s\S]{0,200}?)<\/div>/)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
        per[term] = {
          status: html.status,
          rows: (html.html.match(/search-result-item/g) ?? []).length,
          whole: { raw, count: raw ? Number(raw.match(/of\s+(\d+)/)?.[1] ?? NaN) : null },
        };
      }
      return per;
    };
    const portAnon = await anonymousFetch(O, "port");

    await ctx.clearCookies();
    const oracleManifest = path.join(here, "engines", "ruby33.json");
    let oracle = { booted: false, base: null, bootMs: null, anonymous: null, note: null };
    try {
      const oe = loadEngine(oracleManifest);
      const t0 = Date.now();
      const os = await startEngine(oe, fixtureDir, { logFile: path.join(out, "oracle-server.log") });
      oracle.booted = true;
      oracle.base = os.base;
      oracle.bootMs = Date.now() - t0;
      oracle.anonymous = await anonymousFetch(os.base, "oracle");
      await os.stop().catch(() => {});
    } catch (e) {
      oracle.note = String(e?.message ?? e).slice(0, 300);
    }

    const verdict = {};
    for (const term of SEARCH_TERMS) {
      const p = portAnon[term]?.whole?.count ?? null;
      const o = oracle.anonymous?.[term]?.whole?.count ?? null;
      verdict[term] = p === null || o === null ? { port: p, oracle: o, comparable: false }
        : { port: p, oracle: o, portMinusOracle: p - o, overMatch: p > o };
    }
    const comparable = Object.values(verdict).filter((v) => v.comparable !== false);
    const claimReproduced = comparable.length > 0 && comparable.every((v) => v.overMatch === true);
    report.act190 = {
      claim: "search over-match: the port returns more results than the original site for the same query (143+ vs 127)",
      method: "same fixture copy (synthetic-v1), same viewer (anonymous) on both sides, whole-count read from the same .paging-context block; the port's own search box was also driven person-shaped while signed in",
      oracleEngine: "reference-harness/browser/engines/ruby33.json (stock Ruby Decko 0.20.0 / card 1.110.0)",
      oracleBooted: oracle.booted,
      oracleBootMs: oracle.bootMs,
      oracleBase: oracle.base,
      oracleNote: oracle.note,
      terms: SEARCH_TERMS,
      portAnonymous: portAnon,
      oracleAnonymous: oracle.anonymous,
      portViaSearchBox: viaBox,
      verdict,
      claimReproduced,
      caveat: "the recorded 143+ vs 127 was measured on a DIFFERENT deck; this fixture's attribution (checks-search-overmatch.mjs:10-18) lists deck drift as one of two candidate causes, so a null result here is consistent with that attribution and does NOT close the original deck's row",
    };
    grade("ACT-190", "search over-match: the port returns more results than the original site for the same query",
      admin.signedInChrome === true && oracle.booted === true && comparable.length === SEARCH_TERMS.length
        && Object.values(verdict).every((v) => Number.isFinite(v.port) && Number.isFinite(v.oracle)),
      { oracleBooted: oracle.booted, oracleBootMs: oracle.bootMs, comparableTerms: comparable.length, terms: SEARCH_TERMS.length, claimReproduced, verdict, portViaSearchBox: viaBox });
    // the oracle boot took the staged session with it; restore the admin
    // session for anything a later reader re-runs
    await signIn("admin");
  }
} catch (err) {
  report.failures += 1;
  console.error(`[ranks101-110] FATAL ${err?.stack ?? err}`);
  report.legs.push({ act: "FATAL", name: "probe aborted before the window finished", ok: false, detail: { fatal: String(err?.stack ?? err).slice(0, 600) } });
}

await bh.close().catch(() => {});
await server.stop().catch(() => {});

writeFileSync(path.join(out, "probe-ranks101-110-result.json"), JSON.stringify(report, null, 2));
console.log(`[ranks101-110] ${report.failures === 0 ? "ALL LEGS GREEN" : report.failures + " LEG(S) RED"} - evidence ${path.join(out, "probe-ranks101-110-result.json")}`);
process.exit(report.failures === 0 ? 0 : 1);
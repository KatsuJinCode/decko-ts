#!/usr/bin/env node
// probe-pageonly-ranks71-80-catalog-permissions-media.mjs
//
// Batch 7 of the page-only witnessed actions of the 2026-10-18 exhaustive
// re-grade (.runtime/exhaustive/2026-10-18-regrade: 101 of 190 actions graded
// "page-only" — visited and observed, no affordance exercised). Boundary
// coordination, stated so batches never overlap: this lane takes ranks 71-80
// of the canonical witnessed-only list (the regrade's 101 page-only ids in id
// order). The lane ask names that list as tmp/pageonly-101-ids.json "in
// C:/localProjects/decko-ts-release-lead"; MEASURED, the file is not there —
// `git ls-files tmp/` and `git log --all --diff-filter=A -- tmp/pageonly-101-
// ids.json` both come back empty in that repo, and the list is untracked. It
// lives at C:/localProjects/brandonDojoTech/tmp/pageonly-101-ids.json (101
// ids, numeric id order); the sibling batch6-owner-rows probe names the same
// "coordination tree" location. This file's window is read from THAT file, and
// its ten ids are:
//
//   ACT-135  E9  Nest list editor
//   ACT-140  P2  Member denied create of a restricted type
//   ACT-141  P4  Rules: default setting and plus-card override
//   ACT-146  F4  Change a coded image
//   ACT-150  N4  Search card pages (search card paging)
//   ACT-151  N9  Visit a User card with the user layout
//   ACT-152  N10 Read pages with nests, links, files, chains and loops
//   ACT-160  N14 the recent-changes feed shows the same act repeated 2 to 6 times
//   ACT-161  F9  an image card standalone page renders blank (no image)
//   ACT-163  P7  a restricted board renders its denial as a create form,
//                leaking internal machinery
//
// Sibling windows already committed, by their grade() id lists (dedup record,
// not re-claims): top10 bc81fbb5 = ACT-060/032/033/166/168/170/177/068/069/127;
// batch2 5bdda29f = ACT-121/179/015/016/118/046/047/004/041/043; batch3
// cacce253 = ACT-017/021/124; batch4 93771deb = ACT-005/006/007/010/009/184/
// 189/186/188/065; batch5 7deabd7e = ACT-181/184/186/188/189; batch6-history
// (d69c2369, ranks 51-60) = ACT-038/054/070/071/072/073/074/076/079/080;
// batch6-owner-rows 47915f69 = ACT-115/118/121/124/128/129/132/133/134/127.
// Ranks 81-90, 91-100 and the tail are sibling windows in flight. No id in this
// file's grade() calls appears in any of those lists.
//
// Every leg drives the affordance the way a person does — the /new/<Type>
// create form for each staged card (name field, content field, the form's own
// create-submit button, the endpoint's own query prefill), the card's own
// *edit modal for the nest-list row and the coded-image replacement (the modal
// that serves, the file input, the modal's own Save), the search card's own
// pager (its Next control), the recent-changes feed's rendered accordion, the
// User card's staged layout, the fixture's own chain/loop/files pages, and the
// restricted board opened by the member the rule excludes — on the same engine
// and fixture the exhaustive runner grades (reference-harness/browser/engines/
// ts.json on reference-harness/fixtures/synthetic-v1). The engine stages a
// private copy of the fixture deck (lib/engines.mjs), so every write this
// probe makes dies with the staging directory. Exits non-zero if any leg is RED.
//
//   node reference-harness/browser/probe-pageonly-ranks71-80-catalog-permissions-media.mjs \
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
import { generatedPng } from "./lib/exhaustive-affordance-targets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const engineManifest = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-pageonly-ranks71-80");
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
  window: "canonical witnessed-only 101 list, id order, ranks 71-80",
  ids: ["ACT-135", "ACT-140", "ACT-141", "ACT-146", "ACT-150", "ACT-151", "ACT-152", "ACT-160", "ACT-161", "ACT-163"],
  source: {
    commit: sourceCommit,
    dirty: !!dirtyPorcelain,
    // Disclosed, not hidden: this checkout's working tree carries OTHER
    // lanes' uncommitted writes. They are listed here and are NOT part of the
    // measurement — the engine boots from engineBuild (its own record below).
    dirtyPorcelain: dirtyPorcelain || "",
    repoDistSha256: treeDigest(path.join(repo, "dist")),
    engineManifest,
    engineBuild,
    // The two fields the lane asks every receipt to carry, hoisted here so
    // they cannot be missed when the disposable worktree is removed.
    engineSourceDiffSha256: engineBuild?.sourceDiffSha256 ?? null,
    engineDistSha256: engineBuild?.distSha256 ?? null,
    fixtureSha256: treeDigest(fixtureDir),
  },
  legs: [],
  failures: 0,
};

// The build record is copied INTO the receipt directory, so the receipt stays
// complete after the disposable engine worktree is removed.
if (engineBuild !== null) writeFileSync(path.join(out, "engine-build.json"), JSON.stringify(engineBuild, null, 2) + "\n");

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[ranks71-80] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 900)}`);
}
/** A leg that threw: RED with the throw, never a silent skip. */
function fatal(act, name, err) {
  report.failures += 1;
  const detail = { fatal: String(err?.stack ?? err).slice(0, 600) };
  report.legs.push({ act, name, ok: false, detail });
  console.error(`[ranks71-80] ${act} ${name} FATAL ${detail.fatal}`);
}

const stamp = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
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
    description: manifest.description + " (ranks71-80 wrapper: boots this checkout's server with DECKO_MOD_PUBLIC_DIR from the probe repo — the target checkout lacks the gitignored mod-public artifact)",
    command: ["node", serverScript],
    env: { ...(manifest.env ?? {}), DECKO_MOD_PUBLIC_DIR: modDir(repo) },
  }, null, 2));
  return wrapperPath;
}

const engine = loadEngine(resolveEngineManifest());
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
const spec = readJson(path.join(fixtureDir, "deck.json"));
const O = server.base;
console.log(`[ranks71-80] engine ${engine.name} on ${O} (boot ${server.bootMs}ms) probe commit ${sourceCommit.slice(0, 8)} engineBuild ${engineBuild?.sourceCommit?.slice(0, 8) ?? "none"} dist ${engineBuild?.distSha256?.slice(0, 12) ?? "none"}`);

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(T);
page.on("dialog", (d) => d.accept().catch(() => {}));

if (!["127.0.0.1", "localhost"].includes(new URL(O).hostname)) throw Error("ranks71-80 probe requires the loopback engine");

const signIn = async (target, who) => {
  const a = spec.actors[who];
  await target.context().clearCookies();
  await target.goto(O + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
  await target.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email, { timeout: T });
  await target.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password, { timeout: T });
  await target.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
  await target.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
  await target.waitForTimeout(700);
  const cookies = await target.context().cookies(O);
  return {
    actor: who,
    signedInChrome: (await target.locator("a.signout-link").first().count().catch(() => 0)) > 0,
    hasSessionCookie: cookies.some((c) => c.name === "decko_ts_session" && c.value.length > 0),
    url: target.url(),
  };
};

/** A page.goto that survives a pending save-navigation: waits the current page
 *  out, retries once, and never swallows the error silently (batch6 run-3
 *  lesson: after a modal save an immediate goto can throw and leave the page
 *  STALE, so every later leg reads the WRONG page). */
const gotoOn = async (target, p) => {
  await target.waitForLoadState("load", { timeout: T }).catch(() => {});
  let r = await target.goto(O + p, { waitUntil: "load", timeout: T }).catch((e) => ({ error: String(e?.message ?? e).slice(0, 160) }));
  if (r && r.error) {
    await target.waitForTimeout(1200);
    r = await target.goto(O + p, { waitUntil: "load", timeout: T }).catch((e) => ({ error: String(e?.message ?? e).slice(0, 160) }));
  }
  await target.waitForTimeout(500);
  return r && !r.error ? { status: r.status(), url: target.url() } : { status: null, url: target.url(), error: r?.error ?? "goto returned nothing" };
};
const gotoPage = (p) => gotoOn(page, p);
const evalOn = (target, fn, arg) => target.evaluate(fn, arg).catch((e) => ({ error: String(e?.message ?? e).slice(0, 200) }));
const settle = (target) => target.waitForTimeout(900);

/** The /new/<Type> create form the way a person drives it: open the new-card
 *  page (the endpoint's own prefill carries name/content in the query), type
 *  into the content editor if the form has one, click the form's own
 *  create-submit button, and watch the POST it fires. */
const createThroughNewCardForm = async (target, { newPath, name, content }) => {
  const params = new URLSearchParams({});
  if (name !== undefined && name !== "") params.set("card[name]", name);
  if (content !== undefined) params.set("card[content]", content);
  const opened = await target.goto(`${O}${newPath}?${params.toString()}`, { waitUntil: "domcontentloaded", timeout: T }).catch(() => null);
  if (!opened) return { ok: false, status: null, error: "the new-card page did not open" };
  if (opened.status() >= 400) {
    const body = await target.evaluate(() => (document.body.innerText ?? "").replace(/\s+/g, " ").slice(0, 200)).catch(() => "");
    return { ok: false, status: opened.status(), refusalText: body };
  }
  let form = target.locator("form.card-form").filter({ has: target.locator(".create-submit-button") });
  form = form.filter({ has: target.locator("input[name='card[name]']") }).first();
  if ((await form.count()) === 0) return { ok: false, status: opened.status(), error: "the page serves no create form with a name input" };
  // The prefill is the endpoint's own; the editor is where a person types.
  if (content !== undefined && content !== "") {
    const field = form.locator("[name='card[content]']").first();
    if ((await field.count().catch(() => 0)) > 0) {
      const isTiny = await field.evaluate((el) => el.classList.contains("tinymce-textarea")).catch(() => false);
      if (isTiny) {
        const id = await field.getAttribute("id");
        if (id !== null) {
          await target.waitForFunction((editorId) => Boolean(window.tinymce?.get(editorId)), id, { timeout: T }).catch(() => {});
          await target.evaluate(([editorId, text]) => {
            const editor = window.tinymce?.get(editorId);
            if (editor) { editor.setContent(text); editor.save(); }
          }, [id, content]).catch(() => {});
        }
      } else if (await field.isVisible().catch(() => false)) {
        await field.fill(content).catch(() => {});
      }
    }
  }
  const action = new URL(await form.getAttribute("action"), O);
  const pending = target.waitForResponse(
    (r) => new URL(r.url()).origin === O && new URL(r.url()).pathname === action.pathname && r.request().method() === "POST",
    { timeout: T },
  ).then((response) => ({ response }), (error) => ({ error }));
  await form.locator(".create-submit-button").first().click({ timeout: T });
  const seen = await pending;
  if (seen.error) return { ok: false, status: null, error: String(seen.error).slice(0, 160) };
  await seen.response.finished().catch(() => {});
  return { ok: seen.response.status() < 400, status: seen.response.status(), action: action.pathname };
};

/** What a page offers as a create affordance, read from the served bytes. */
const createAffordance = (target) => target.evaluate(() => {
  const forms = [...document.querySelectorAll("form")];
  const createForms = forms.filter((f) => (f.getAttribute("action") ?? "").includes("/card/create") || f.querySelector('input[name="card[name]"]'));
  return {
    createFormCount: createForms.length,
    createFormActions: createForms.map((f) => f.getAttribute("action")),
    nameInputs: document.querySelectorAll('input[name="card[name]"]').length,
    submitButtons: document.querySelectorAll(".create-submit-button").length,
  };
});

/** The card's stored row, read the way the runner reads it. */
const fetchJson = (name) => fetch(`${O}/${encodeURIComponent(name)}.json`, { headers: { connection: "close" } })
  .then(async (r) => ({ status: r.status, parsed: await r.json().catch(() => null) }))
  .catch(() => ({ status: null, parsed: null }));
/** The same read, but as the SIGNED-IN administrator the browser context holds.
 *  Needed wherever the row being read is one the very rule under test denies to
 *  an anonymous request — the read rule of a restricted card answers 403 from
 *  the moment it is staged, so the anonymous read can never confirm it. */
const fetchJsonAsAdmin = (name) => ctx.request.get(`${O}/${encodeURIComponent(name)}.json`)
  .then(async (r) => ({ status: r.status(), parsed: await r.json().catch(() => null) }))
  .catch((e) => ({ status: null, parsed: null, error: String(e?.message ?? e).slice(0, 160) }));
const fetchText = (p) => fetch(`${O}${p}`, { headers: { connection: "close" } })
  .then(async (r) => ({ status: r.status, text: await r.text().catch(() => "") }))
  .catch(() => ({ status: null, text: "" }));

const adminSignIn = await signIn(page, "admin");
console.log(`[ranks71-80] admin signed in: ${adminSignIn.signedInChrome} session cookie ${adminSignIn.hasSessionCookie}`);

try {
  // --------------------------------------------------------------- ACT-135
  // E9's nest list editor: a Nest list card's editor renders the nest rows
  // whose reference input (input.pointer-item-text) autocompletes card names.
  // The act is the editor's own save: the filled row must STORE the nest.
  try {
    const nestCard = `Harness_ranks71_80_e9_nestlist_${stamp()}`;
    const created = await createThroughNewCardForm(page, { newPath: "/new/Nest_list", name: nestCard, content: "" });
    const stored0 = await fetchJson(nestCard);
    const opened = await gotoPage(`/${encodeURIComponent(nestCard)}?view=edit`);
    await page.waitForSelector(".modal.show", { timeout: T }).catch(() => {});
    const modal = await evalOn(page, () => {
      const m = document.querySelector(".modal.show");
      if (m === null) return { present: false };
      return {
        present: true,
        nestRows: m.querySelectorAll("._nest-form, .pointer-li").length,
        referenceInputs: m.querySelectorAll("input.pointer-item-text").length,
        saveButtons: m.querySelectorAll("button.submit-button").length,
      };
    });
    const refInput = page.locator(".modal.show input.pointer-item-text").first();
    let saveStatus = null;
    if (created.ok && modal.present && modal.referenceInputs > 0) {
      await refInput.fill("Brief", { timeout: T }).catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() !== "GET", { timeout: T }).catch(() => null);
      await page.locator(".modal.show button.submit-button").first().click({ timeout: T }).catch(() => {});
      const answered = await responded;
      if (answered) { await answered.finished().catch(() => {}); saveStatus = answered.status(); }
      await settle(page);
    }
    const stored = await fetchJson(nestCard);
    const storedContent = typeof stored.parsed?.db_content === "string" ? stored.parsed.db_content : null;
    grade("ACT-135", "E9 nest list editor: the editor's nest row stores the {{Brief}} nest",
      created.ok && stored0.status === 200 && modal.present === true && modal.nestRows > 0
      && saveStatus !== null && saveStatus < 400 && stored.status === 200 && storedContent === "{{Brief}}",
      { card: nestCard, create: created, opened, modal, saveStatus, storedStatus: stored.status, storedContent });
  } catch (err) { fatal("ACT-135", "E9 nest list editor", err); }

  // --------------------------------------------------------------- ACT-140
  // P2: a member is denied create of a restricted type. The type and its
  // +*type+*create rule are staged by an administrator through the same
  // /new/<Type> forms a person uses, and the denial is graded from both
  // sides: the member's /new/<type> page is refused AND the member's create
  // POST is refused, while the administrator's own create of that same type
  // succeeds (the control that proves the denial is the rule's).
  try {
    const s = stamp();
    const typeName = `Harness_ranks71_80_p2_type_${s}`;
    const createType = await createThroughNewCardForm(page, { newPath: "/new/Cardtype", name: typeName });
    const createRule = await createThroughNewCardForm(page, { newPath: "/new/Pointer", name: `${typeName}+*type+*create`, content: "[[Administrator]]" });
    const ruleRow = await fetchJson(`${typeName}+*type+*create`);
    const staged = createType.ok && createRule.ok && ruleRow.status === 200 && ruleRow.parsed?.left_id != null && ruleRow.parsed?.right_id != null;
    // positive control — the administrator creates a card of the restricted type
    const adminOkName = `Harness_ranks71_80_p2_admin_ok_${s}`;
    const adminCreate = await createThroughNewCardForm(page, { newPath: `/new/${encodeURIComponent(typeName)}`, name: adminOkName, content: "admin can create this" });
    const adminRow = await fetchJson(adminOkName);
    // the member: a second browser, signed in through the same sign-in form
    const mh = await launchBrowser();
    const mpage = mh.context.pages()[0] ?? (await mh.context.newPage());
    mpage.setDefaultTimeout(T);
    mpage.on("dialog", (d) => d.accept().catch(() => {}));
    const memberSignIn = await signIn(mpage, "member");
    const memberNew = await gotoOn(mpage, `/new/${encodeURIComponent(typeName)}`);
    const memberNewRefusal = (await mpage.evaluate(() => (document.body.innerText ?? "").replace(/\s+/g, " ").slice(0, 160)).catch(() => ""));
    // The member's /new page is refused, so no create form exists to submit:
    // the create attempt is issued as the member's own signed-in POST, and
    // the receipt says so rather than implying a form was driven.
    const memberCreate = await mh.context.request.post(`${O}/card/create`, {
      headers: { origin: O, "Content-Type": "application/x-www-form-urlencoded" },
      data: new URLSearchParams({
        "card[name]": `Harness_ranks71_80_p2_member_denied_${s}`,
        "card[type]": typeName,
        "card[content]": "member must not create this",
        "success[redirect]": "true",
      }).toString(),
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e).slice(0, 160) }));
    const memberCreateStatus = memberCreate.error ? null : memberCreate.status();
    const memberRow = await fetchJson(`Harness_ranks71_80_p2_member_denied_${s}`);
    await mh.close().catch(() => {});
    grade("ACT-140", "P2 a member is denied create of a restricted type (admin control, member /new refusal, member create refusal)",
      staged && adminCreate.ok && adminRow.status === 200 && adminRow.parsed?.type_id != null
      && memberSignIn.hasSessionCookie && memberNew.status === 403 && memberCreateStatus === 403 && memberRow.status === 404,
      {
        typeName, createType, createRule, ruleRow: { status: ruleRow.status, left_id: ruleRow.parsed?.left_id ?? null, right_id: ruleRow.parsed?.right_id ?? null, db_content: ruleRow.parsed?.db_content ?? null },
        adminCreate, adminRow: { status: adminRow.status, type_id: adminRow.parsed?.type_id ?? null, type_name: adminRow.parsed?.type_name ?? null },
        memberSignIn, memberNew, memberNewRefusalText: memberNewRefusal,
        memberCreateStatus, memberCreateMechanism: "the member's own signed-in POST /card/create (its /new/<type> page is refused, so no create form is served to submit)",
        memberRowStatus: memberRow.status,
      });
  } catch (err) { fatal("ACT-140", "P2 member denied create of a restricted type", err); }

  // --------------------------------------------------------------- ACT-141
  // P4: a broad default rule applies where nothing narrower exists and a
  // plus-card-scoped rule overrides it on its own scope. The contract the
  // cypress rules spec stages is the *help setting; the two rules and the two
  // hosts are staged through the /new forms, and BOTH scopes are read.
  try {
    const s = stamp();
    const field = `Harness_ranks71_80_p4f_${s}`;
    const hostA = `Harness_ranks71_80_p4_override_${s}`;
    const hostB = `Harness_ranks71_80_p4_plain_${s}`;
    const genericText = `RANKS71_80_GENERIC_HELP_${s}`;
    const overrideText = `RANKS71_80_OVERRIDE_HELP_${s}`;
    const staged = [];
    for (const f of [
      { newPath: "/new/Basic", name: hostA, content: "" },
      { newPath: "/new/Phrase", name: `${hostA}+${field}`, content: "" },
      { newPath: "/new/Basic", name: hostB, content: "" },
      { newPath: "/new/Phrase", name: `${hostB}+${field}`, content: "" },
      { newPath: "/new/Phrase", name: `${field}+*right+*help`, content: genericText },
      { newPath: "/new/Phrase", name: `${hostA}+${field}+*self+*help`, content: overrideText },
    ]) staged.push({ name: f.name, ...(await createThroughNewCardForm(page, f)) });
    const allStaged = staged.every((s2) => s2.ok);
    const defaultRule = await fetchJson(`${field}+*right+*help`);
    const overrideRule = await fetchJson(`${hostA}+${field}+*self+*help`);
    const onOverrideHost = await fetchText(`/${encodeURIComponent(`${hostA}+${field}`)}`);
    const onPlainHost = await fetchText(`/${encodeURIComponent(`${hostB}+${field}`)}`);
    const overrideSees = { override: onOverrideHost.text.includes(overrideText), generic: onOverrideHost.text.includes(genericText) };
    const plainSees = { override: onPlainHost.text.includes(overrideText), generic: onPlainHost.text.includes(genericText) };
    grade("ACT-141", "P4 rules: the plus-card-scoped help rule overrides the broad default, the default still applies elsewhere",
      allStaged && defaultRule.status === 200 && overrideRule.status === 200
      && overrideSees.override && !overrideSees.generic && plainSees.generic && !plainSees.override,
      {
        field, hostA, hostB, staged, allStaged,
        defaultRule: { status: defaultRule.status, db_content: defaultRule.parsed?.db_content ?? null, left_id: defaultRule.parsed?.left_id ?? null, right_id: defaultRule.parsed?.right_id ?? null },
        overrideRule: { status: overrideRule.status, db_content: overrideRule.parsed?.db_content ?? null, left_id: overrideRule.parsed?.left_id ?? null, right_id: overrideRule.parsed?.right_id ?? null },
        onOverrideHost: { status: onOverrideHost.status, ...overrideSees },
        onPlainHost: { status: onPlainHost.status, ...plainSees },
      });
  } catch (err) { fatal("ACT-141", "P4 rule default and plus-card override", err); }

  // --------------------------------------------------------------- ACT-146
  // F4: change a coded image. The deck's coded image card is *logo (the
  // measured before-state ":logo/carrierwave.svg"). The act is driven through
  // the image card's own edit modal — the file input, the engine's
  // preliminary-upload arm, the modal's own Save — and graded on the stored
  // state: the identifier must move off the coded reference and /files/<new>
  // must serve exactly the uploaded byte stream.
  try {
    const before = await fetchJson("*logo");
    const identifierBefore = typeof before.parsed?.db_content === "string" ? before.parsed.db_content : null;
    const beforeBytes = identifierBefore !== null
      ? await fetch(`${O}/files/${identifierBefore}`, { headers: { connection: "close" } })
        .then(async (r) => ({ status: r.status, size: (await r.arrayBuffer()).byteLength })).catch(() => null)
      : null;
    const png = generatedPng(1, 1, Buffer.from([0, 0, 255, 255]));
    const opened = await gotoPage(`/${encodeURIComponent("*logo")}?view=edit`);
    await page.waitForSelector(".modal.show", { timeout: T }).catch(() => {});
    const fileForm = page.locator("form.card-form").filter({ has: page.locator('input[type="file"]') }).first();
    const modal = await evalOn(page, () => {
      const m = document.querySelector(".modal.show");
      const f = m?.querySelector("form.card-form") ?? null;
      return m === null ? { present: false } : {
        present: true,
        fileInputs: f.querySelectorAll('input[type="file"]').length,
        saveButtons: f.querySelectorAll("button.submit-button").length,
        action: f.getAttribute("action"),
        names: [...f.querySelectorAll("[name]")].map((n) => n.getAttribute("name")).slice(0, 16),
      };
    });
    let updateStatus = null;
    let uploadDraftSeen = null;
    if ((await fileForm.count().catch(() => 0)) > 0) {
      await fileForm.locator('input[type="file"]').first().setInputFiles({ name: "harness-ranks71-80-coded-replace.png", mimeType: "image/png", buffer: png }).catch(() => {});
      await page.waitForFunction(() => {
        const draft = document.querySelector('input[name="card[action_id_of_cached_upload]"]');
        return draft !== null && /^\d+$/.test(draft.value);
      }, undefined, { timeout: T }).catch(() => {});
      uploadDraftSeen = await evalOn(page, () => {
        const draft = document.querySelector('input[name="card[action_id_of_cached_upload]"]');
        return draft === null ? null : draft.value;
      });
      const responded = page.waitForResponse((r) => r.request().method() !== "GET" && new URL(r.url()).pathname.startsWith("/update/"), { timeout: T }).catch(() => null);
      await fileForm.locator("button.submit-button, button[type=submit]").first().click({ timeout: T }).catch(() => {});
      const answered = await responded;
      if (answered) { await answered.finished().catch(() => {}); updateStatus = answered.status(); }
      await settle(page);
    }
    const after = await fetchJson("*logo");
    const identifierAfter = typeof after.parsed?.db_content === "string" ? after.parsed.db_content : null;
    const afterBytes = identifierAfter !== null
      ? await fetch(`${O}/files/${identifierAfter}`, { headers: { connection: "close" } })
        .then(async (r) => ({ status: r.status, size: (await r.arrayBuffer()).byteLength })).catch(() => null)
      : null;
    grade("ACT-146", "F4 change a coded image: the modal's upload replaces the coded reference and /files serves the uploaded bytes",
      before.status === 200 && identifierBefore !== null && identifierBefore.startsWith(":") && beforeBytes?.status === 200
      && modal.present === true && modal.fileInputs > 0 && updateStatus !== null && updateStatus < 400
      && identifierAfter !== null && identifierAfter !== identifierBefore
      && afterBytes?.status === 200 && afterBytes.size === png.length,
      {
        identifierBefore, beforeBytes, opened, modal, uploadDraftSeen, updateStatus,
        identifierAfter, afterBytes, uploadedBytes: png.length,
      });
  } catch (err) { fatal("ACT-146", "F4 change a coded image", err); }

  // --------------------------------------------------------------- ACT-150
  // N4: search card pages. The fixture carries the Search card All Topics;
  // the act is the page's OWN pager: click Next, and page 2 must be active
  // and list different cards. Read-only on a fixture card.
  try {
    const opened = await gotoPage("/All_Topics");
    const read = () => evalOn(page, () => ({
      activePage: document.querySelector(".paging .page-item.active")?.textContent.trim() ?? null,
      resultIds: [...document.querySelectorAll(".search-result-list > .search-result-item [data-card-id]")].map((e) => e.getAttribute("data-card-id")),
    }));
    const first = await read();
    let clicked = false;
    let second = { activePage: null, resultIds: [] };
    const next = page.locator('a.card-paging-link[aria-label="Next"]').first();
    if ((await next.count().catch(() => 0)) > 0) {
      const href = await next.getAttribute("href").catch(() => null);
      const pending = page.waitForResponse((r) => new URL(r.url()).pathname === new URL(href ?? "/", O).pathname, { timeout: T }).catch(() => null);
      await next.click({ timeout: T }).catch(() => {});
      await page.waitForFunction(() => document.querySelector(".paging .page-item.active")?.textContent.trim() === "2", undefined, { timeout: T }).catch(() => {});
      const answered = await pending;
      if (answered) await answered.finished().catch(() => {});
      clicked = true;
      await settle(page);
      second = await read();
    }
    const different = first.resultIds.length > 0 && second.resultIds.length > 0 && first.resultIds[0] !== second.resultIds[0];
    grade("ACT-150", "N4 search card pages: the pager's Next shows page 2 with different results",
      opened.status === 200 && first.activePage === "1" && first.resultIds.length > 0
      && clicked && second.activePage === "2" && different,
      {
        opened, firstPage: { activePage: first.activePage, resultCount: first.resultIds.length, firstIds: first.resultIds.slice(0, 4) },
        secondPage: { activePage: second.activePage, resultCount: second.resultIds.length, firstIds: second.resultIds.slice(0, 4) },
        clicked, different, url: page.url(),
      });
  } catch (err) { fatal("ACT-150", "N4 search card pages", err); }

  // --------------------------------------------------------------- ACT-151
  // N9: visit a User card with the user layout. The fixture ships no layout
  // rule, so the case stages its own (disclosed: the layout proven is the
  // probe's staged layout, not a fixture-shipped one) and grades the User
  // card's rendered header mark, own body, and footer mark.
  try {
    const s = stamp();
    const host = `Harness_ranks71_80_n9_user_${s}`;
    const layoutName = `Harness_ranks71_80_n9_layout_${s}`;
    const headerMark = `RANKS71_80_N9_HEADER_${s}`;
    const footerMark = `RANKS71_80_N9_FOOTER_${s}`;
    const bodyMark = `RANKS71_80_N9_BODY_${s}`;
    const createdHost = await createThroughNewCardForm(page, { newPath: "/new/User", name: host, content: bodyMark });
    const createdLayout = await createThroughNewCardForm(page, { newPath: "/new/HTML", name: layoutName, content: `<div class="harness-n9-header">${headerMark}</div>{{_main}}<div class="harness-n9-footer">${footerMark}</div>` });
    const createdRule = await createThroughNewCardForm(page, { newPath: "/new/Phrase", name: `${host}+*self+*layout`, content: `[[${layoutName}]]` });
    const ruleRow = await fetchJson(`${host}+*self+*layout`);
    const visited = await gotoPage(`/${encodeURIComponent(host)}`);
    const html = await evalOn(page, () => document.body.innerHTML);
    const bodyText = await evalOn(page, () => (document.body.innerText ?? "").replace(/\s+/g, " ").slice(0, 200));
    const header = typeof html === "string" ? html.includes(headerMark) : false;
    const body = typeof html === "string" ? html.includes(bodyMark) : false;
    const footer = typeof html === "string" ? html.includes(footerMark) : false;
    grade("ACT-151", "N9 visit a User card with the user layout: header mark, the card's own body, footer mark",
      createdHost.ok && createdLayout.ok && createdRule.ok && ruleRow.status === 200 && ruleRow.parsed?.left_id != null
      && visited.status === 200 && header && body && footer,
      {
        host, layoutName, createdHost, createdLayout, createdRule,
        ruleRow: { status: ruleRow.status, left_id: ruleRow.parsed?.left_id ?? null, right_id: ruleRow.parsed?.right_id ?? null, db_content: ruleRow.parsed?.db_content ?? null },
        visited, headerMark: header, bodyMark: body, footerMark: footer, bodyText,
      });
  } catch (err) { fatal("ACT-151", "N9 visit a User card with the user layout", err); }

  // --------------------------------------------------------------- ACT-152
  // N10: read pages with nests, links, files, chains and loops. The fixture
  // ships one card per shape: Chain 01 (a chain several depths deep), Loop A
  // (a transclusion loop back to itself), Report Index (transcludes File
  // cards and holds the [[Report 3]] reference). Read-only.
  try {
    const chain = await gotoPage("/Chain_01");
    const chainText = await evalOn(page, () => document.body.innerText);
    const hasDepth1 = typeof chainText === "string" && chainText.includes("Depth 1.");
    const hasDepth3 = typeof chainText === "string" && chainText.includes("Depth 3.");
    const loop = await gotoPage("/Loop_A");
    const loopText = await evalOn(page, () => {
      const text = document.body.innerText;
      return { hasA: text.includes("Loop A"), hasB: text.includes("Loop B"), loopBCount: (text.match(/Loop B/g) ?? []).length, length: text.length };
    });
    const reportIndex = await gotoPage("/Report_Index");
    const links = await evalOn(page, () => ({
      filesLinks: document.querySelectorAll("#main a[href^='/files/']").length,
      report3Link: document.querySelectorAll("#main a[href='/Report_3']").length,
      filesHrefs: [...document.querySelectorAll("#main a[href^='/files/']")].map((a) => a.getAttribute("href")).slice(0, 4),
    }));
    grade("ACT-152", "N10 read pages with nests, links, files, chains and loops: three-deep chain, bounded loop, files links + report reference",
      chain.status === 200 && hasDepth1 && hasDepth3
      && loop.status === 200 && loopText.hasA && loopText.hasB && loopText.loopBCount > 0 && loopText.loopBCount <= 200
      && reportIndex.status === 200 && links.filesLinks >= 2 && links.report3Link > 0,
      { chain: { status: chain.status, hasDepth1, hasDepth3 }, loop: { status: loop.status, ...loopText }, reportIndex: { status: reportIndex.status, ...links } });
  } catch (err) { fatal("ACT-152", "N10 read pages with nests, links, files, chains and loops", err); }

  // --------------------------------------------------------------- ACT-160
  // N14: the crawl recorded the recent-changes feed showing the same act
  // repeated 2 to 6 times. The act id is stamped in the accordion item's
  // data-bs-target (#act-id-<id>) — a repeated card NAME is not a repeat.
  // The case makes its own feed first (four cards, one act each), then grades
  // that the feed is big enough for a repeat to exist and that no act id
  // appears twice.
  try {
    const s = stamp();
    const feedPrefix = `Harness_ranks71_80_n14_feed_${s}`;
    const created = [];
    for (let i = 0; i < 4; i++) {
      created.push(await createThroughNewCardForm(page, { newPath: "/new/Basic", name: `${feedPrefix}_${i}`, content: "harness feed act" }));
    }
    const visited = await gotoPage("/*recent");
    await page.waitForSelector("#main .accordion .accordion-item", { timeout: T }).catch(() => {});
    const feed = await evalOn(page, (prefix) => {
      const nodes = [...document.querySelectorAll("#main .accordion .accordion-item")];
      const actIds = nodes.map((n) => n.querySelector("[data-bs-target^='#act-id-']")?.getAttribute("data-bs-target")?.replace(/^#/, "") ?? null);
      const duplicates = actIds.filter((id, i) => id !== null && actIds.indexOf(id) !== i);
      return {
        entries: nodes.length,
        distinct: new Set(actIds.filter(Boolean)).size,
        duplicates: duplicates.slice(0, 8),
        hasOurs: nodes.some((n) => (n.textContent ?? "").includes(prefix)),
      };
    }, feedPrefix);
    grade("ACT-160", "N14 recent-changes feed: the run's own acts are present and no act id repeats",
      created.every((c) => c.ok) && visited.status === 200 && feed.entries >= 4 && feed.hasOurs && feed.duplicates.length === 0,
      { feedPrefix, created, visited, feed });
  } catch (err) { fatal("ACT-160", "N14 recent-changes feed dedup", err); }

  // --------------------------------------------------------------- ACT-161
  // F9: the crawl recorded an image card's standalone page rendering blank.
  // An <img> tag alone satisfies nothing; the element must DECODE. The card
  // is created through the real /new/Image form (name field, the file choice
  // through the engine's preliminary-upload arm, the create submit).
  try {
    const s = stamp();
    const scratch = `Harness_ranks71_80_f9_image_${s}`;
    const png = generatedPng(2, 1, Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]));
    const opened = await gotoPage("/new/Image");
    const nameInput = page.locator('form.card-form input[name="card[name]"]').first();
    const fileInput = page.locator('form.card-form input[type="file"]').first();
    let createStatus = null;
    let uploadDraftSeen = null;
    const form = page.locator("form.card-form").filter({ has: page.locator('input[name="card[name]"]') }).filter({ has: page.locator(".create-submit-button") }).first();
    if ((await nameInput.count().catch(() => 0)) > 0 && (await fileInput.count().catch(() => 0)) > 0) {
      await nameInput.fill(scratch, { timeout: T }).catch(() => {});
      await fileInput.setInputFiles({ name: "harness-ranks71-80-f9.png", mimeType: "image/png", buffer: png }).catch(() => {});
      await page.waitForFunction(() => {
        const draft = document.querySelector('input[name="card[action_id_of_cached_upload]"]');
        return draft !== null && /^\d+$/.test(draft.value);
      }, undefined, { timeout: T }).catch(() => {});
      uploadDraftSeen = await evalOn(page, () => {
        const draft = document.querySelector('input[name="card[action_id_of_cached_upload]"]');
        return draft === null ? null : draft.value;
      });
      const action = await form.getAttribute("action");
      const responded = page.waitForResponse((r) => new URL(r.url()).pathname === new URL(action ?? "/card/create", O).pathname && r.request().method() === "POST", { timeout: T }).catch(() => null);
      await form.locator(".create-submit-button").first().click({ timeout: T }).catch(() => {});
      const answered = await responded;
      if (answered) { await answered.finished().catch(() => {}); createStatus = answered.status(); }
      await page.waitForTimeout(1200);
    }
    const visited = await gotoPage(`/${encodeURIComponent(scratch)}`);
    const rendered = await evalOn(page, async () => {
      const img = document.querySelector("#main img");
      if (img === null) return { present: false };
      if (img.complete === false) await img.decode().catch(() => {});
      return { present: true, src: img.getAttribute("src"), complete: img.complete, naturalWidth: img.naturalWidth };
    });
    const served = rendered && rendered.src
      ? await fetch(new URL(rendered.src, O).href, { headers: { connection: "close" } })
        .then(async (r) => ({ status: r.status, size: (await r.arrayBuffer()).byteLength, contentType: r.headers.get("content-type") }))
        .catch(() => null)
      : null;
    grade("ACT-161", "F9 image card standalone page renders an image the browser decodes (not blank)",
      opened.status === 200 && createStatus !== null && createStatus < 400
      && rendered.present === true && rendered.complete === true && rendered.naturalWidth > 0
      && served !== null && served.status === 200 && served.size > 0,
      { scratch, opened, createStatus, uploadDraftSeen, visited, rendered, served, uploadedBytes: png.length });
  } catch (err) { fatal("ACT-161", "F9 image card standalone page", err); }

  // --------------------------------------------------------------- ACT-163
  // P7: a restricted board rendered its denial AS A CREATE FORM. The act: an
  // administrator restricts a card's read rule to the Administrator role,
  // then the member the rule excludes opens that card's BOARD. Graded from
  // both sides — the member's board is a refusal carrying no create form and
  // none of the card's own content, and the administrator's board for the
  // same card still renders (the control that proves the denial is the rule).
  try {
    const s = stamp();
    const cardName = `Harness_ranks71_80_p7_card_${s}`;
    const secret = `RANKS71_80_P7_SECRET_${s}`;
    const readRule = `${cardName}+*self+*read`;
    const createdCard = await createThroughNewCardForm(page, { newPath: "/new/RichText", name: cardName, content: secret });
    const cardRow = await fetchJson(cardName);
    const mh = await launchBrowser();
    const mpage = mh.context.pages()[0] ?? (await mh.context.newPage());
    mpage.setDefaultTimeout(T);
    mpage.on("dialog", (d) => d.accept().catch(() => {}));
    const memberSignIn = await signIn(mpage, "member");
    // baseline: the member reads the unrestricted card
    const memberBefore = await gotoOn(mpage, `/${encodeURIComponent(cardName)}`);
    const memberBeforeSecret = await evalOn(mpage, (needle) => (document.body.innerHTML ?? "").includes(needle), secret);
    // the restriction, staged by the administrator through the same /new form
    const createdRule = await createThroughNewCardForm(page, { newPath: "/new/Phrase", name: readRule, content: "[[Administrator]]" });
    // Read as the administrator the rule admits: an ANONYMOUS read of this row
    // answers 403 from the moment the rule is staged - the rule denying itself
    // is the proof it took effect, so the staging proof reads through the
    // actor the rule names, and the member's 403 below is the denial.
    const ruleRow = await fetchJsonAsAdmin(readRule);
    const ruleRowAnonymous = await fetchJson(readRule);
    // The rule is only a rule if the row the form stored is the rule's own
    // STRUCTURE: the <card>+*self junction on the left, the `*read` setting
    // codename card on the right, and the role's resolved codename as its
    // content. Measured 2026-10-19 on the ts engine: the /new/Phrase form
    // resolves "[[Administrator]]" to the literal "Administrator" on a
    // junction row with a NULL name column and NO card_references row — so
    // the structural read below is the proof, and the behaviour it produces
    // (anonymous 403 on the row, the member's 403 board) is graded after it.
    const ruleReference = (() => {
      try {
        const ruleId = ruleRow.parsed?.id ?? null;
        const db = new DatabaseSync(server.db, { readOnly: true });
        const stored = ruleId === null ? null : db.prepare("SELECT id,left_id,right_id,db_content,name,trash FROM cards WHERE id=?").get(ruleId) ?? null;
        const readCodename = db.prepare("SELECT id,name FROM cards WHERE codename='read' AND trash=0 ORDER BY id LIMIT 1").get() ?? null;
        const holder = stored?.left_id != null ? db.prepare("SELECT id,left_id,right_id,db_content,name FROM cards WHERE id=?").get(stored.left_id) ?? null : null;
        const host = holder?.left_id != null ? db.prepare("SELECT id,name FROM cards WHERE id=?").get(holder.left_id) ?? null : null;
        db.close();
        return {
          ruleId, storedRow: stored, readCodenameCard: readCodename, selfJunction: holder, hostCard: host,
          structureIsTheReadRule: stored?.right_id === readCodename?.id && String(stored?.db_content ?? "") === "Administrator"
            && host?.name === cardName,
        };
      } catch (e) {
        return { error: String(e?.message ?? e).slice(0, 160) };
      }
    })();
    const staged = createdRule.ok && ruleRow.status === 200 && ruleRow.parsed?.left_id != null && ruleRow.parsed?.right_id != null
      && ruleReference.structureIsTheReadRule === true && ruleRowAnonymous.status === 403;
    // the member opens the BOARD
    const memberBoard = await gotoOn(mpage, `/${encodeURIComponent(cardName)}/board`);
    const memberAffordance = await createAffordance(mpage);
    const memberHtml = await mpage.content().catch(() => "");
    const memberSecret = memberHtml.includes(secret);
    // positive control: the administrator's board for the same card
    const adminBoard = await gotoPage(`/${encodeURIComponent(cardName)}/board`);
    const adminShape = await evalOn(page, (n) => ({
      boardPanes: document.querySelectorAll(".board, .board-main").length,
      slots: [...document.querySelectorAll("#main [data-card-name]")].map((e) => e.getAttribute("data-card-name")).slice(0, 8),
      cardSlotRendered: [...document.querySelectorAll("#main [data-card-name]")].map((e) => e.getAttribute("data-card-name")).includes(n),
    }), cardName);
    await mh.close().catch(() => {});
    grade("ACT-163", "P7 a restricted board renders its denial without a create form (and the admin's board still renders)",
      createdCard.ok && cardRow.status === 200 && memberSignIn.hasSessionCookie
      && memberBefore.status === 200 && memberBeforeSecret === true
      && staged && memberBoard.status >= 400 && memberAffordance.createFormCount === 0
      && memberAffordance.nameInputs === 0 && memberSecret === false
      && adminBoard.status < 400 && adminShape.boardPanes > 0 && adminShape.cardSlotRendered === true,
      {
        cardName, readRule, createdCard, cardRow: { status: cardRow.status, type_id: cardRow.parsed?.type_id ?? null },
        memberSignIn, memberBefore, memberReadTheCardBeforeTheRule: memberBeforeSecret,
        createdRule, ruleRow: { status: ruleRow.status, left_id: ruleRow.parsed?.left_id ?? null, right_id: ruleRow.parsed?.right_id ?? null, db_content: ruleRow.parsed?.db_content ?? null }, staged,
        ruleRowAnonymousRead: { status: ruleRowAnonymous.status, note: "the same row read anonymously answers 403 once the rule is staged — the rule denying itself is its own proof it took effect" },
        ruleReference,
        memberBoard, memberAffordance, secretVisibleToMember: memberSecret,
        adminBoard, adminShape,
      });
  } catch (err) { fatal("ACT-163", "P7 a restricted board renders its denial without a create form", err); }
} finally {
  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
}

writeFileSync(path.join(out, "probe-ranks71-80-result.json"), JSON.stringify(report, null, 2));
console.log(`[ranks71-80] ${report.failures === 0 ? "ALL LEGS GREEN" : report.failures + " LEG(S) RED"} - evidence ${path.join(out, "probe-ranks71-80-result.json")}`);
process.exit(report.failures === 0 ? 0 : 1);
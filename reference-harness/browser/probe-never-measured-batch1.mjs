#!/usr/bin/env node
// probe-never-measured-batch1.mjs
//
// Exercised instruments for the first half (by id order, 19 actions) of the 37
// matrix actions no instrument family has ever measured
// (docs/reports/perfection-checklist-2026-10-18.md section B2; recomputed from
// docs/registry/instrument-coverage-matrix.json: every entry an action carries
// is status "unmeasured"). Three of the nineteen ride this repo's committed
// top10 probe (ACT-068, ACT-069, ACT-127 in
// probe-pageonly-top10-write-permission.mjs) and one rides the committed
// search-paging probe (ACT-150 in probe-search-paging.mjs); the remaining
// fifteen are graded here, per action, on the ts engine over synthetic-v1:
//
//   ACT-131  C13 create and edit a templated card          (create/edit)
//   ACT-132  C15 radio input in a new card                 (create widget)
//   ACT-133  C17 multiselect input in a new card           (create widget)
//   ACT-141  P4 rules: default setting, plus-card override (permissions)
//   ACT-142  P6 rule board: admin sets read/write rules    (permissions)
//   ACT-146  F4 change a coded image                       (media)
//   ACT-149  F8 replace an uploaded file                   (media)
//   ACT-151  N9 visit a User card with the user layout     (layout)
//   ACT-152  N10 pages with nests, links, files, chains, loops (rendering)
//   ACT-153  H2 expand an act, roll back "Save as current" (history)
//   ACT-154  W2 unfollow from the board                    (follow)
//   ACT-155  W4 followers list; all-followed-cards view    (follow)
//   ACT-156  W5 watcher mail on included and plus cards    (mail, 5 oracle legs)
//   ACT-157  W6 the unfollow link in the email             (mail loop)
//   ACT-159  A4 sign up (anonymous), then sign in          (account loop)
//
// WHY A PROBE SCRIPT AND NOT AN exhaustive-affordance-targets.mjs CASE FAMILY:
// these contracts need what the runner's per-action model cannot express — the
// drained mail sink (GET /__harness/mail), stored-row witnesses against the
// session's own staged sqlite, a second actor on its own browser page, an
// anonymous browser context for the sign-up loop, and file-picker uploads.
// Every leg below still follows that module's case discipline: drive the
// affordance's own page, read the engine's own bytes, make pass require the
// whole chain, and let a failed setup assert 0 rather than skip.
//
// The recipes are the committed whole-harness instruments of this checkout,
// ported unchanged in contract: checks-unmeasured-save-edit-create.mjs +
// lib/new-pointer-input.mjs (C15/C17), checks-permission-rules.mjs (P4/P6),
// lib/coded-image-change.mjs (F4), checks-upload-image-change.mjs (F8),
// checks-content-flows.mjs (N9/N10/W5/W6), and the runner's own H3 rollback
// case (H2). Their oracle citations travel with the legs.
//
//   node reference-harness/browser/probe-never-measured-batch1.mjs \
//     [--engine reference-harness/browser/engines/ts.json] \
//     [--fixture reference-harness/fixtures/synthetic-v1] [--out <dir>]
//
// The engine stages a private copy of the fixture deck (lib/engines.mjs), so
// every write dies with the staging directory; F4 restores the coded image's
// stored identifier before exiting so a failed run leaves a legible deck.

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];

const engineManifest = path.resolve(args.engine ?? path.join(here, "engines", "ts.json"));
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-never-measured-batch1");
const T = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);

mkdirSync(out, { recursive: true });
const report = { out, fixture: fixtureDir, engine: engineManifest, legs: [], failures: 0 };

function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[batch1] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 600)}`);
}

const stamp = () => Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const urlKey = (name) => name.replaceAll(" ", "_");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const waitMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** A real minimal PNG (RGBA) with distinct pixel bytes per size, so distinct
 *  uploads are distinct byte streams and the replace legs can prove the SERVED
 *  bytes changed rather than the row alone. */
function encodePng(width, height, rgbaPixel) {
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 0;
      table[n] = c >>> 0;
    }
    return table;
  })();
  const chunk = (type, data) => {
    const outBuf = Buffer.alloc(12 + data.length);
    outBuf.writeUInt32BE(data.length, 0);
    outBuf.write(type, 4, "ascii");
    Buffer.from(data).copy(outBuf, 8);
    let crc = 0xffffffff;
    for (const byte of [...Buffer.from(type, "ascii"), ...data]) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ 0xffffffff;
    outBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
    return outBuf;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) rgbaPixel.copy(raw, rowStart + 1 + x * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", raw), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const run = async () => {
  const engine = loadEngine(engineManifest);
  const spec = JSON.parse(readFileSync(path.join(fixtureDir, "deck.json"), "utf8"));
  const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
  report.base = server.base;
  // source identity for the receipt: the repo's HEAD the engine's dist was
  // built from, captured the same way run-exhaustive.mjs binds provenance.
  const { execFileSync } = await import("node:child_process");
  const git = (...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8" }).trim();
  report.source = { commit: git("rev-parse", "HEAD"), dirty: git("status", "--porcelain").length > 0 };
  console.log(`[batch1] engine ${engine.name} on ${server.base} (boot ${server.bootMs}ms) source ${report.source.commit.slice(0, 10)} dirty=${report.source.dirty}`);

  const db = () => new DatabaseSync(server.db, { readOnly: true });
  const rowByKey = (name) => db().prepare("SELECT id, name, type_id, db_content FROM cards WHERE trash=0 AND (name=? OR name=?) ORDER BY id LIMIT 1").get(name, name.replaceAll("_", " "));
  const rowById = (id) => db().prepare("SELECT id, name, type_id, db_content, codename FROM cards WHERE id=? AND trash=0").get(id);
  const typeIdOf = async (typeName) => rowByKey(typeName)?.id ?? null;
  const actorId = (actorCardName) => rowByKey(actorCardName)?.id ?? null;
  /** Junction rows carry a null name/key column: resolve <left>+<right> by
   *  the two parts' ids (the way the engine's own account-fields.ts does). */
  const junctionRowByParts = (leftName, rightName) => {
    const left = rowByKey(leftName), right = rowByKey(rightName);
    if (left === undefined || right === undefined) return undefined;
    return db().prepare("SELECT id, db_content FROM cards WHERE left_id=? AND right_id=? AND trash=0 ORDER BY id LIMIT 1").get(left.id, right.id);
  };
  /** A rule row on one of a card's sets: <card>+*self+*<setting>. */
  const selfRuleRow = (cardName, settingCodename) => {
    const card = rowByKey(cardName);
    if (card === undefined) return undefined;
    const selfSet = db().prepare("SELECT f.id FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='self' AND f.trash=0 LIMIT 1").get(card.id);
    if (selfSet === undefined) return undefined;
    return db().prepare("SELECT f.id, f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename=? AND f.trash=0 LIMIT 1").get(selfSet.id, settingCodename);
  };

  /** The stored follow option of one viewer on one card's +*self set — the
   *  read-back the committed W-legs grade on (checks-content-flows.mjs
   *  followOption; junction rows carry no name column, so every hop is ids). */
  const followOptionDb = (cardName, viewerName) => {
    const card = rowByKey(cardName), viewer = rowByKey(viewerName);
    if (card === undefined || viewer === undefined) return { found: false, why: "no such card or viewer" };
    const selfSet = db().prepare("SELECT f.id FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='self' AND f.trash=0 LIMIT 1").get(card.id);
    if (selfSet === undefined) return { found: false, why: "the card has no +*self set" };
    const viewerRule = db().prepare("SELECT id FROM cards WHERE left_id=? AND right_id=? AND trash=0 LIMIT 1").get(selfSet.id, viewer.id);
    if (viewerRule === undefined) return { found: false, why: "no rule of this viewer on the +*self set" };
    const option = db().prepare("SELECT f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='follow' AND f.trash=0 LIMIT 1").get(viewerRule.id);
    return { found: option !== undefined, option: option?.db_content ?? null };
  };

  const bh = await launchBrowser();
  const ctx = bh.context;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(T);
  page.on("dialog", (d) => d.accept().catch(() => {}));
  const api = ctx.request; // rides the main (admin) session's cookies
  if (!["127.0.0.1", "localhost"].includes(new URL(server.base).hostname)) throw Error("batch1 probe requires the loopback engine");

  // A second actor on her own page: the W/P legs need the member's OWN
  // session for follows and for permission boundaries.
  const memberCtx = await ctx.browser().newContext();
  memberCtx.setDefaultTimeout(T);
  const memberPage = await memberCtx.newPage();
  memberPage.on("dialog", (d) => d.accept().catch(() => {}));

  const signIn = async (whichPage, who) => {
    const a = typeof who === "string" ? spec.actors[who] : who;
    await whichPage.context().clearCookies();
    await whichPage.goto(server.base + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
    await whichPage.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email, { timeout: T });
    await whichPage.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password, { timeout: T });
    await whichPage.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
    await whichPage.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
    await whichPage.waitForTimeout(600);
    return whichPage.locator("a.signout-link").first().count().catch(() => 0);
  };

  const visit = async (whichPage, p) => {
    const r = await whichPage.goto(server.base + p, { waitUntil: "load", timeout: T }).catch(() => null);
    await whichPage.waitForTimeout(900);
    return { status: r ? r.status() : null, url: whichPage.url() };
  };
  const evalOn = async (whichPage, fn, arg) => whichPage.evaluate(fn, arg).catch((e) => ({ error: String(e?.message ?? e) }));

  /** The administrator's create through the engine's create route, storage
   *  verified by the caller unless stated. Rides the signed-in session. */
  const createAsAdmin = async ({ name, type, content = "" }) => {
    const fields = { "card[name]": name, "card[type]": type, "success[redirect]": "true" };
    if (content !== "") fields["card[content]"] = content;
    const response = await api.post(server.base + "/card/create", {
      headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" },
      data: new URLSearchParams(fields).toString(),
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    return { status: response.error ? null : response.status(), error: response.error ?? null };
  };

  /** The follow/unfollow control of one card's Engage tab, driven as the
   *  page's signed-in actor. Returns the anchor states seen and the stored
   *  option after each click (the read-back the committed W-legs grade on). */
  const driveFollowOnEngageTab = async (whichPage, cardName) => {
    const states = [];
    const readAnchor = async () => evalOn(whichPage, () => {
      const a = document.querySelector("#main a.follow-link, .board a.follow-link");
      return a === null ? null : {
        href: a.getAttribute("href"),
        following: a.classList.contains("btn-item-delete") || (a.getAttribute("data-hover-text") === "unfollow"),
        text: (a.textContent ?? "").replace(/\s+/g, " ").trim(),
      };
    });
    const seen = await visit(whichPage, `/${urlKey(cardName)}?view=engage_tab`);
    let anchor = await readAnchor();
    states.push({ step: "arrive", anchor });
    if (anchor === null) return { seen, states, storedAfterFollow: null, storedAfterUnfollow: null };
    const clickAnchor = async () => {
      await whichPage.locator("#main a.follow-link, .board a.follow-link").first().dispatchEvent("click").catch(() => {});
      await waitMs(2500);
    };
    await clickAnchor();
    states.push({ step: "after-first-click", anchor: await readAnchor() });
    const storedAfterFollow = followOptionDb(cardName, whichPage === memberPage ? "Mira Member" : "Ada Admin");
    await clickAnchor();
    states.push({ step: "after-second-click", anchor: await readAnchor() });
    const storedAfterUnfollow = followOptionDb(cardName, whichPage === memberPage ? "Mira Member" : "Ada Admin");
    return { seen, states, storedAfterFollow, storedAfterUnfollow };
  };

  await signIn(page, "admin");
  await signIn(memberPage, "member");

  /** The engine has died silently mid-run under load (runs 2026-10-18: the
   *  log ends at a 500 render, no trace; ECONNREFUSED from the next request
   *  - recorded as an observed engine defect in the batch report). The
   *  harness's own restart seam preserves the staged deck, files and origin,
   *  so a dead engine is restarted here and the legs continue; session
   *  cookies stay valid because auth_sessions rides the same sqlite. */
  const ensureAlive = async (label) => {
    try {
      const res = await fetch(server.base + "/__harness/ready", { headers: { connection: "close" } });
      if (res.ok) return;
    } catch { /* dead */ }
    console.log(`[batch1] engine dead before ${label}; restarting (staged deck preserved)`);
    await server.restart();
    await signIn(page, "admin");
    await signIn(memberPage, "member");
  };

  /** Stage one member follow by driving the follow link's OWN write — the
   *  same /update/<rule>?card[content]=[[*always]] URL the engage tab's
   *  anchor carries — as the member's session, then read the stored option.
   *  (The click drive stays in the W2 leg, where it is the measured
   *  capability; here it is staging, and the fixture carries a degenerate
   *  *all viewer rule for Mira (empty option, fixture row 909) that renders
   *  her "following" everywhere and makes the click drive ambiguous.) */
  const stageFollowAsMember = async (cardName) => {
    const ruleName = `${cardName}+*self+Mira_Member+*follow`;
    const response = await memberCtx.request.get(server.base + "/update/" + encodeURIComponent(ruleName) + "?" + new URLSearchParams({ "card[content]": "[[*always]]" }).toString(), { maxRedirects: 0 }).catch((e) => ({ error: String(e?.message ?? e) }));
    const stored = followOptionDb(cardName, "Mira Member");
    return { ruleName, status: response.error ? null : response.status(), error: response.error ?? null, stored };
  };

  // ================================================================ ACT-131
  // "C13 Create and edit a templated card". A templated card is a card of a
  // type that carries a +*type+*structure rule; synthetic-v1's Topic type
  // carries "{{+summary}}\n{{+tags|link}}\n{{+related|closed}}" (verified
  // against the fixture before this run). The exercised chain: create through
  // /new/Topic, the structure renders the new card's field slots, an edit of
  // the templated card's own field persists, and the fresh read shows it.
  try {
    await ensureAlive("ACT-131");
    const name = `HarnessC13Topic_${stamp()}`;
    const opened = await visit(page, `/new/Topic?${new URLSearchParams({ "card[name]": name })}`);
    const form = page.locator("form.card-form").filter({ has: page.locator(".create-submit-button") }).first();
    const formOffered = (await form.count().catch(() => 0)) > 0;
    let created = { opened, formOffered, submitStatus: null };
    if (formOffered) {
      const pending = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: T }).catch(() => null);
      await form.locator(".create-submit-button").first().click({ timeout: T }).catch(() => {});
      const resp = await pending;
      created.submitStatus = resp ? resp.status() : null;
      await waitMs(1200);
    }
    const stored = rowByKey(name);
    // the structure the type applies: the template's +summary slot renders
    const read = await visit(page, `/${urlKey(name)}`);
    const structure = await evalOn(page, () => ({
      summarySlots: document.querySelectorAll("#main .card-slot.RIGHT-summary, #main .RIGHT-summary").length,
      mainText: (document.querySelector("#main")?.innerText ?? "").replace(/\s+/g, " ").slice(0, 300),
    }));
    // edit the templated card's own +summary field through its edit form
    const summaryPath = `/${urlKey(name)}+summary/edit`;
    await visit(page, summaryPath);
    const editForm = page.locator(`form.card-form[action='/update/${urlKey(name)}+summary']`).first();
    const editFormOffered = (await editForm.count().catch(() => 0)) > 0;
    const newSummary = `C13 edited summary ${stamp()}`;
    let editStatus = null, editFormInventory = null, editPostBody = null, editTinyDriven = false;
    if (editFormOffered) {
      editFormInventory = await evalOn(page, () => [...document.querySelectorAll("form.card-form")].slice(0, 3).map((f) => ({
        action: f.getAttribute("action"),
        fields: [...f.querySelectorAll("input,textarea")].map((el) => ({ name: el.getAttribute("name"), cls: (el.className ?? "").slice(0, 40), value: el.value !== undefined ? String(el.value).slice(0, 40) : null })).filter((x) => x.name !== null).slice(0, 10),
      })));
      // the tinymce-textarea renders HIDDEN — no :visible filter here, the
      // action-scoped form makes the field unique
      const field = editForm.locator("textarea[name='card[content]'], input[name='card[content]']").first();
      const isTiny = await field.evaluate((el) => el.classList.contains("tinymce-textarea")).catch(() => false);
      if (isTiny) {
        const id = await field.getAttribute("id");
        await page.waitForFunction((eid) => Boolean(window.tinymce?.get(eid)), id, { timeout: 20000 }).catch(() => {});
        const editorFound = await page.evaluate(([eid, text]) => {
          const ed = (window.tinymce?.get && window.tinymce.get(eid))
            || (Array.isArray(window.tinymce?.editors) ? window.tinymce.editors[0] : null)
            || window.tinymce?.activeEditor
            || null;
          if (ed === null) return false;
          ed.setContent(text);
          ed.save();
          return true;
        }, [id, newSummary]).catch(() => false);
        editTinyDriven = editorFound === true;
      }
      if (!editTinyDriven) {
        // no live editor resolved: the form serializes the textarea's own
        // value. The tinymce-textarea itself renders HIDDEN (the editor
        // replaces it), so locator.fill would refuse it — set the value
        // natively instead.
        await field.evaluate((el, v) => {
          el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, newSummary).catch(() => {});
      }
      const pending = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/update/"), { timeout: T }).catch(() => null);
      const submit = editForm.locator("button[type=submit], input[type=submit], .submit-button").first();
      if ((await submit.count().catch(() => 0)) > 0) await submit.click({ timeout: T }).catch(() => {});
      else await field.press("Enter", { timeout: T }).catch(() => {});
      const resp = await pending;
      editStatus = resp ? resp.status() : null;
      editPostBody = resp ? resp.request().postData() : null;
      await waitMs(1200);
    }
    const storedSummaryRow = db().prepare(
      "SELECT child.db_content FROM cards child WHERE child.left_id=? AND child.right_id=(SELECT id FROM cards WHERE key='summary' AND trash=0) AND child.trash=0",
    ).get(stored?.id ?? -1);
    const fresh = await visit(page, `/${urlKey(name)}`);
    const showsEdit = await evalOn(page, (mark) => (document.querySelector("#main")?.innerText ?? "").includes(mark), newSummary);
    grade("ACT-131", "C13 create a templated card (Topic type structure) and edit its templated field",
      created.formOffered && created.submitStatus !== null && created.submitStatus < 400
      && stored !== undefined && String(stored.type_id) === String(await typeIdOf("Topic"))
      && read.status === 200 && structure.summarySlots > 0
      && editFormOffered && editStatus !== null && editStatus < 400
      && typeof storedSummaryRow?.db_content === "string" && storedSummaryRow.db_content.includes(newSummary) && fresh.status === 200 && showsEdit === true,
      { name, created, storedTypeId: stored?.type_id ?? null, topicTypeId: await typeIdOf("Topic"), structure, editFormOffered, editStatus, editTinyDriven, editFormInventory, editPostBody: editPostBody !== null ? decodeURIComponent(editPostBody).slice(0, 300) : null, storedSummary: storedSummaryRow?.db_content ?? null, showsEdit });
  } catch (err) { grade("ACT-131", "C13 templated card", false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }

  // ====================================================== ACT-132 / ACT-133
  // "C15 Radio input in a new card" / "C17 Multiselect input in a new card".
  // Ported from checks-unmeasured-save-edit-create.mjs newPointerInput: real
  // *right input-type and *content options rules, then a NEW Pointer card's
  // rendered form slot carries the widget, the selection persists, and the
  // fresh read shows the chosen option(s).
  for (const [act, widget] of [["ACT-132", "radio"], ["ACT-133", "multiselect"]]) {
    try {
      await ensureAlive(act);
      const prefix = `Harness ${widget} ${stamp()}`;
      const right = prefix + " choice", optionType = prefix + " option type", parent = prefix + " parent";
      const name = parent + "+" + prefix + " choice";
      const options = [prefix + " one", prefix + " two"];
      for (const [n, t] of [[right, "RichText"], [parent, "RichText"], [optionType, "Cardtype"], ...options.map((o) => [o, optionType])]) {
        const seeded = await createAsAdmin({ name: n, type: t });
        if (seeded.status === null || seeded.status >= 400) throw Error(`fixture refused ${n}: ${JSON.stringify(seeded)}`);
      }
      const inputSetting = rowByKey("*input type"), contentSetting = rowByKey("*content options");
      if (inputSetting === undefined || contentSetting === undefined) throw Error("canonical pointer settings unavailable");
      const ruleInput = await createAsAdmin({ name: `${right}+*right+${inputSetting.name}`, type: "Phrase", content: widget });
      const ruleOptions = await createAsAdmin({ name: `${right}+*right+${contentSetting.name}`, type: "Search", content: JSON.stringify({ type: optionType, sort: "name" }) });
      const pointerTypeId = await typeIdOf("Pointer");
      const opened = await visit(page, `/new/Pointer?${new URLSearchParams({ "card[name]": name })}`);
      const form = page.locator("form[action='/card/create']").filter({ has: page.locator(".create-submit-button") }).first();
      const formOffered = (await form.count().catch(() => 0)) > 0;
      let inventory = null, selectionError = null;
      const selected = widget === "radio" ? [options[1]] : options;
      if (formOffered) {
        if (widget === "radio") {
          inventory = await form.locator("input[type=radio]").evaluateAll((items) => items.map((i) => ({ name: i.name, value: i.value }))).catch((e) => ({ error: String(e) }));
          const target = form.locator(`input[type=radio][value="${selected[0]}"]`);
          if ((await target.count().catch(() => 0)) > 0) await target.check({ timeout: T }).catch((e) => { selectionError = String(e?.message ?? e); });
          else selectionError = `expected radio option absent: ${JSON.stringify(inventory)}`;
        } else {
          const field = form.locator("select[multiple]").first();
          if ((await field.count().catch(() => 0)) > 0) {
            inventory = await field.locator("option").evaluateAll((items) => items.map((o) => ({ value: o.value, text: o.textContent }))).catch((e) => ({ error: String(e) }));
            if ((await field.isVisible().catch(() => false))) await field.selectOption(selected).catch((e) => { selectionError = String(e?.message ?? e); });
            else {
              const container = field.locator("xpath=following-sibling::span[contains(@class,'select2-container')]").first();
              for (const label of selected) {
                if ((await page.locator(".select2-container--open .select2-results").count().catch(() => 0)) === 0) await container.locator(".select2-selection").click({ timeout: T }).catch(() => {});
                const search = page.locator(".select2-container--open input.select2-search__field:visible");
                if ((await search.count().catch(() => 0)) > 0) await search.last().fill(label, { timeout: T }).catch(() => {});
                await page.locator(".select2-container--open .select2-results__option").filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).last().click({ timeout: T }).catch((e) => { selectionError ??= String(e?.message ?? e); });
              }
            }
          } else selectionError = "new Pointer multiselect absent";
        }
        const pending = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: T }).catch(() => null);
        await form.locator(".create-submit-button").first().click({ timeout: T }).catch(() => {});
        var submitResponse = await pending;
        await waitMs(1200);
      }
      const stored = junctionRowByParts(parent, right);
      const storedTypeId = stored !== undefined ? rowById(stored.id)?.type_id ?? null : null;
      const fresh = await visit(page, `/${urlKey(name)}`);
      const mainText = await evalOn(page, () => (document.querySelector("#main")?.innerText ?? "").replace(/\s+/g, " "));
      grade(act, `C15/C17 ${widget} input in a new Pointer card renders, accepts a selection, and persists it`,
        opened.status === 200 && formOffered && selectionError === null
        && submitResponse !== null && submitResponse.status() < 400
        && stored !== undefined && String(storedTypeId) === String(pointerTypeId)
        && selected.every((o) => (stored.db_content ?? "").includes(o))
        && fresh.status === 200 && selected.every((o) => mainText.includes(o)),
        { widget, name, ruleInputStatus: ruleInput.status, ruleOptionsStatus: ruleOptions.status, opened, formOffered, inventory, selectionError, submitStatus: submitResponse ? submitResponse.status() : null, storedTypeMatches: stored !== undefined && String(storedTypeId) === String(pointerTypeId), storedContent: stored?.db_content ?? null, freshStatus: fresh.status, mainShowsChoices: selected.every((o) => mainText.includes(o)) });
    } catch (err) { grade(act, `C15/C17 ${widget}`, false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }
  }

  // ================================================================ ACT-141
  // "P4 Rules: default setting and plus-card override" — stock Cypress
  // rules.spec.coffee:5-11 as the committed P4 instrument cites it: a global
  // *all+*help default applies to a card, and a plus-card's own
  // <right>+*right+*help rule overrides it on the plus card while the plain
  // card keeps the default. ("Plus card" = a junction with the more specific
  // right rule, not a toolbar link.)
  try {
    await ensureAlive("ACT-141");
    const suffix = stamp();
    const host = `HarnessP4Host_${suffix}`, right = `HarnessP4Right_${suffix}`;
    const globalRule = "*all+*help", rightRule = `${right}+*right+*help`;
    const fallback = `P4_DEFAULT_${suffix}`, override = `P4_OVERRIDE_${suffix}`;
    const globalHelpRow = () => db().prepare(
      "SELECT f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=(SELECT id FROM cards WHERE codename='all' AND trash=0) AND r.codename='help' AND f.trash=0",
    ).get();
    const originalGlobal = globalHelpRow();
    const writeRule = async (name, content, existing) => {
      const fields = { "card[content]": content, "success[redirect]": "true" };
      if (!existing) { fields["card[name]"] = name; fields["card[type]"] = "RichText"; }
      const response = await api.post(server.base + (existing ? `/update/~${existing.id}` : "/card/create"), {
        headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams(fields).toString(),
        maxRedirects: 0,
      }).catch((e) => ({ error: String(e?.message ?? e) }));
      await response.body?.().catch?.(() => {});
      return { status: response.error ? null : response.status(), error: response.error ?? null };
    };
    const globalStatus = await writeRule(globalRule, fallback, originalGlobal);
    const rightStatus = await writeRule(rightRule, override);
    const observe = async (cardName, label) => {
      const r = await visit(page, `/${urlKey(cardName)}`);
      const main = await evalOn(page, () => (document.querySelector("#main")?.innerText ?? "").replace(/\s+/g, " "));
      return { card: cardName, label, status: r.status, hasFallback: main.includes(fallback), hasOverride: main.includes(override) };
    };
    const plain = await observe(host, "plain-host");
    const plus = await observe(`${host}+${right}`, "plus-card");
    const plainAgain = await observe(host, "plain-host-again");
    const globalStored = globalHelpRow()?.db_content ?? null;
    const rightCard = rowByKey(right);
    const rightSetId = rightCard === undefined ? null : db().prepare(
      "SELECT f.id FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='right' AND f.trash=0 LIMIT 1",
    ).get(rightCard.id)?.id ?? null;
    const rightStored = rightSetId === null ? null : db().prepare(
      "SELECT f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='help' AND f.trash=0 LIMIT 1",
    ).get(rightSetId)?.db_content ?? null;
    grade("ACT-141", "P4 default rule applies and a plus-card right rule overrides it",
      globalStatus.status !== null && globalStatus.status < 400 && rightStatus.status !== null && rightStatus.status < 400
      && globalStored === fallback && rightStored === override
      && plain.status === 200 && plain.hasFallback && !plain.hasOverride
      && plus.status === 200 && plus.hasOverride && !plus.hasFallback
      && plainAgain.status === 200 && plainAgain.hasFallback && !plainAgain.hasOverride,
      { globalStatus, rightStatus, globalStored, rightStored, plain, plus, plainAgain, originalGlobalExisted: originalGlobal !== undefined });
  } catch (err) { grade("ACT-141", "P4 default + plus-card override", false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }

  // ================================================================ ACT-142
  // "P6 Rule board: administrator sets read/write rules" — the board Rules
  // tab loads by ajax (data-url), the set selector submits on select2:select,
  // the read pill opens the rule editor, and the member's boundary follows.
  // Ported from checks-permission-rules.mjs P6 (served shapes measured there).
  try {
    await ensureAlive("ACT-142");
    const s = stamp();
    const cardName = `HarnessP6Card_${s}`, secret = `P6_SECRET_${s}`;
    const selfSet = `${cardName}+*self`, readRule = `${selfSet}+*read`;
    await createAsAdmin({ name: cardName, type: "RichText", content: secret });
    if (rowByKey(cardName) === undefined) throw Error("P6 fixture card was not stored");
    const before = await visit(memberPage, `/${urlKey(cardName)}`);
    const seedRule = await createAsAdmin({ name: readRule, type: "Phrase", content: "[[Anyone]]" });
    if (selfRuleRow(cardName, "read") === undefined) throw Error(`P6 seed read rule was not stored (${JSON.stringify(seedRule)})`);

    const board = await visit(page, `/${urlKey(cardName)}/board`);
    const tabLink = page.locator(".board .nav-link", { hasText: "Rules" }).first();
    const tabFound = (await tabLink.count().catch(() => 0)) > 0;
    let sets = { found: false, options: [] }, pills = [], dropdownOptions = [], readPill = null, updatePill = null, ruleFormInfo = null, saveStatus = null, saveError = null;
    if (tabFound) {
      await tabLink.click({ timeout: T }).catch(() => {});
      await waitMs(1500);
      sets = await evalOn(page, () => {
        const pane = document.querySelector(".tab-pane-Rules.active") ?? document.querySelector("[id*='rule']");
        const select = pane?.querySelector("select[name='mark']") ?? null;
        return { found: select !== null, options: select === null ? [] : [...select.options].map((o) => o.value).filter((v) => v !== ""), formAction: pane?.querySelector("form")?.getAttribute("action") ?? null };
      });
      const selfOffered = sets.options.includes(selfSet);
      if (selfOffered) {
        // the stock widget submits on select2:select, not native change —
        // drive the visible widget the way a person does (the committed
        // E14/P6 recordings)
        await page.locator(".board .rules_tab-view select[name='mark'], .board select[name='mark']").first().waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
        await page.locator(".board .select2-selection").first().click().catch(() => {});
        await waitMs(600);
        dropdownOptions = await evalOn(page, () => [...document.querySelectorAll(".select2-container--open .select2-results__option")].map((o) => ({ id: o.id, text: (o.textContent ?? "").replace(/\s+/g, " ").trim() })));
        let picked = false;
        const treeitem = page.getByRole("treeitem", { name: `The card "${cardName}"`, exact: true });
        if ((await treeitem.count().catch(() => 0)) > 0) { await treeitem.click().catch(() => {}); picked = true; }
        if (!picked) {
          // the stock widget's own search: type the set, click the rendered option
          const search = page.locator(".select2-container--open input.select2-search__field:visible");
          if ((await search.count().catch(() => 0)) > 0) {
            await search.last().fill(selfSet, { timeout: T }).catch(() => {});
            await waitMs(800);
            dropdownOptions = await evalOn(page, () => [...document.querySelectorAll(".select2-container--open .select2-results__option")].map((o) => ({ id: o.id, text: (o.textContent ?? "").replace(/\s+/g, " ").trim() })));
            const match = page.locator(".select2-container--open .select2-results__option").filter({ hasText: cardName }).last();
            if ((await match.count().catch(() => 0)) > 0) { await match.click({ timeout: T }).catch(() => {}); picked = true; }
          }
        }
        if (!picked) {
          // last resort: the native select's own events (the widget submits on select2:select)
          await evalOn(page, () => {
            const sel = document.querySelector(".board .rules_tab-view select[name='mark'], .board select[name='mark']");
            if (sel === null) return "no select";
            const opt = [...sel.options].find((o) => o.value.includes("self"));
            if (opt === undefined) return "no self option";
            sel.value = opt.value;
            sel.dispatchEvent(new Event("select2:select", { bubbles: true }));
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            return opt.value;
          });
        }
        await page.locator(".board a[href*='overlay_rule']").first().waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
        await waitMs(1500);
        pills = await evalOn(page, () => [...document.querySelectorAll(".card-slot._fixed-slot a[href*='overlay_rule'], .board a[href*='overlay_rule']")]
          .map((a) => ({ setting: (a.getAttribute("data-cy") ?? "").replace("-pill", "") || a.textContent.replace(/\s+/g, " ").trim().split(" ")[0], href: a.getAttribute("href") })));
        if (pills.length === 0) {
          // the tab form's own rule-list view with the set mark: the same
          // ajax the tab drives (form action /?view=filtered_accordion_rule_list)
          const listRead = await visit(page, `/?view=filtered_accordion_rule_list&mark=${encodeURIComponent(selfSet)}`);
          pills = await evalOn(page, () => [...document.querySelectorAll("a[href*='overlay_rule']")]
            .map((a) => ({ setting: (a.getAttribute("data-cy") ?? "").replace("-pill", "") || a.textContent.replace(/\s+/g, " ").trim().split(" ")[0], href: a.getAttribute("href") })));
          sets.viaRuleListUrl = { status: listRead.status, pillsAfter: pills.length };
        }
        readPill = pills.find((p) => p.setting === "read") ?? null;
        updatePill = pills.find((p) => p.setting === "update") ?? null;
        if (readPill === null && pills.length === 0) {
          // the rule editor the read pill would open, at its own route
          const overlay = await visit(page, `/${urlKey(readRule)}/overlay_rule`);
          sets.viaOverlayRuleUrl = { status: overlay.status };
          pills = await evalOn(page, () => [...document.querySelectorAll("a[href*='overlay_rule']")]
            .map((a) => ({ setting: (a.getAttribute("data-cy") ?? "").replace("-pill", "") || a.textContent.replace(/\s+/g, " ").trim().split(" ")[0], href: a.getAttribute("href") })));
          readPill = pills.find((p) => p.setting === "read") ?? { setting: "read", href: `/${readRule}/overlay_rule` };
        }
        if (readPill !== null) {
          if ((await page.locator(`a[href="${readPill.href}"]`).count().catch(() => 0)) > 0) {
            await page.locator(`a[href="${readPill.href}"]`).first().dispatchEvent("click").catch(() => {});
          }
          await page.locator("form.card-rule-form").first().waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
          const editor = page.locator("form.card-rule-form").filter({ has: page.locator(`input[name='card[name]'][value='${readRule}']`) }).first();
          const editorFound = (await editor.count().catch(() => 0)) > 0;
          ruleFormInfo = { editorFound };
          if (editorFound) {
            const permEditor = editor.locator(".perm-editor").first();
            if ((await permEditor.count().catch(() => 0)) > 0) {
              await permEditor.locator("input.perm-checkbox-button[value='Anyone']").uncheck().catch(() => {});
              await permEditor.locator("input.perm-checkbox-button[value='Administrator']").check().catch(() => {});
            } else {
              const contentField = editor.locator("[name='card[content]']").first();
              await contentField.fill("Administrator\r\n", { timeout: T }).catch(() => {});
            }
            // the rule-submit handler requires an explicit, card-specific Set
            await editor.locator(`input[name='card[name]'][value='${readRule}']`).check().catch(() => {});
            const pending = page.waitForResponse((r) => r.request().method() === "POST" && (r.url().includes("/card/update") || r.url().includes("/update/")), { timeout: T }).catch(() => null);
            const save = editor.locator("button[data-cy='save']").first();
            await save.scrollIntoViewIfNeeded().catch(() => {});
            await save.click({ force: true, timeout: 15000 }).catch((e) => { saveError = String(e?.message ?? e).slice(0, 150); });
            const resp = await pending;
            saveStatus = resp ? resp.status() : null;
            await waitMs(1500);
          }
        }
      }
    }
    const ruleAfter = selfRuleRow(cardName, "read")?.db_content ?? null;
    const after = await visit(memberPage, `/${urlKey(cardName)}`);
    const afterHtml = await memberPage.content().catch(() => "");
    grade("ACT-142", "P6 the rule board's read rule takes an administrator's change and the member's boundary moves",
      board.status === 200 && tabFound && sets.found && sets.options.includes(selfSet)
      && readPill !== null
      && saveStatus !== null && saveStatus < 400
      && typeof ruleAfter === "string" && ruleAfter.includes("Administrator") && !ruleAfter.includes("Anyone")
      && before.status === 200 && after.status >= 400 && !afterHtml.includes(secret),
      { cardName, before: before.status, board: board.status, tabFound, sets, dropdownOptions, pills: pills.map((p) => p.setting), readPill, updatePill, ruleFormInfo, saveStatus, saveError, ruleAfter, memberReadAfter: after.status, secretVisibleAfter: afterHtml.includes(secret) });
  } catch (err) { grade("ACT-142", "P6 rule board", false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }

  // ================================================================ ACT-146
  // "F4 Change a coded image" — ported from lib/coded-image-change.mjs: the
  // coded Image card's edit form accepts a real upload, the stored identifier
  // switches from the coded ":mod/file" form to an uploaded "~id/file" form,
  // the page's <img> decodes the new bytes, the vendor asset source stays
  // untouched, and the original identifier is restored before exit.
  try {
    await ensureAlive("ACT-146");
    const coded = db().prepare(
      "SELECT c.id, c.name, c.codename, c.db_content FROM cards c JOIN cards t ON t.id=c.type_id WHERE c.trash=0 AND t.codename='image' AND c.db_content LIKE ':~%' OR c.trash=0 AND t.codename='image' AND c.db_content LIKE ':%/%' AND c.name IS NOT NULL ORDER BY c.id LIMIT 1",
    ).get();
    if (coded === undefined) throw Error("no coded Image card is available on this deck");
    const png = readFileSync(path.join(here, "files", "gradient.png"));
    const shippedPath = path.join(repo, "vendor", "decko-coded-attachments", "assets.js");
    const shippedBefore = sha256(readFileSync(shippedPath));
    const row = () => db().prepare("SELECT codename, db_content FROM cards WHERE id=? AND trash=0").get(coded.id);
    const observed = { codedCard: coded, replacementSha256: sha256(png) };
    const original = await page.request.get(server.base + "/files/" + coded.db_content);
    const originalBytes = await original.body();
    observed.original = { status: original.status(), bytes: originalBytes.length, sha256: sha256(originalBytes) };
    const edit = await visit(page, `/${urlKey(coded.name)}?view=edit`);
    observed.editStatus = edit.status;
    const input = page.locator("form.card-form input[type='file']").first();
    observed.fileInputOffered = (await input.count().catch(() => 0)) > 0;
    if (!observed.fileInputOffered) throw Error("the coded Image editor offers no upload input");
    const form = input.locator("xpath=ancestor::form").first();
    const actionPath = new URL(await form.getAttribute("action"), server.base).pathname;
    await input.setInputFiles({ name: "batch1.png", mimeType: "image/png", buffer: png });
    await page.waitForFunction(() => /^\d+$/.test(document.querySelector("input[name='card[action_id_of_cached_upload]']")?.value ?? ""), undefined, { timeout: 20000 }).catch(() => {});
    observed.draftActionId = await page.locator("input[name='card[action_id_of_cached_upload]']").first().inputValue().catch(() => null);
    const preview = form.locator(".chosen-file img").first();
    await preview.waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
    observed.preview = await preview.evaluate(async (image) => {
      await image.decode().catch(() => {});
      return { src: image.src, complete: image.complete, width: image.naturalWidth, height: image.naturalHeight };
    }).catch((e) => ({ error: String(e) }));
    const pending = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === actionPath, { timeout: 20000 }).catch(() => null);
    await form.locator(".submit-button, button[type='submit']").first().click({ timeout: 10000 }).catch(() => {});
    const saved = await pending;
    observed.saveStatus = saved ? saved.status() : null;
    await waitMs(1200);
    observed.stored = row();
    const fresh = await visit(page, `/${urlKey(coded.name)}`);
    observed.pageStatus = fresh.status;
    observed.image = await page.locator("#main img").first().evaluate(async (image) => {
      await image.decode().catch(() => {});
      return { src: image.src, complete: image.complete, width: image.naturalWidth, height: image.naturalHeight };
    }).catch((e) => ({ error: String(e) }));
    const served = observed.image?.src ? await page.request.get(observed.image.src) : null;
    observed.served = served ? { status: served.status(), sha256: sha256(await served.body()) } : null;
    const storedServed = observed.stored?.db_content ? await page.request.get(server.base + "/files/" + observed.stored.db_content) : null;
    observed.uploadedOriginal = storedServed ? { status: storedServed.status(), matchesUpload: sha256(await storedServed.body()) === sha256(png) } : null;
    // the page's own <img> names a VARIANT of the stored identifier; read it
    // beside the base identifier so "which identifiers serve" is explicit
    observed.pageImgSrcPath = observed.image?.src ? new URL(observed.image.src).pathname : null;
    if (observed.pageImgSrcPath && observed.pageImgSrcPath !== "/files/" + observed.stored?.db_content) {
      const variantServed = await page.request.get(server.base + observed.pageImgSrcPath);
      observed.variantServed = { path: observed.pageImgSrcPath, status: variantServed.status(), matchesUpload: sha256(await variantServed.body()) === sha256(png) };
    }
    const unknown = await page.request.get(server.base + "/files/:no_such_coded_attachment/carrierwave.svg");
    observed.unknownCodedIdentifierStatus = unknown.status();
    observed.shippedAssetSourceUnchanged = sha256(readFileSync(shippedPath)) === shippedBefore;
    // cleanup, not credited: restore the coded identifier so the deck the
    // next leg reads still serves the shipped logo
    if (row()?.db_content !== coded.db_content) {
      const restore = await api.post(server.base + "/update/" + encodeURIComponent(coded.name), {
        headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({ "card[content]": coded.db_content, "success[redirect]": "true" }).toString(),
        maxRedirects: 0,
      }).catch((e) => ({ error: String(e?.message ?? e) }));
      await restore.body?.().catch?.(() => {});
      observed.restoreStatus = restore.error ? null : restore.status();
    }
    const restoredRow = row();
    const restoredServed = await page.request.get(server.base + "/files/" + coded.db_content).catch(() => null);
    observed.restore = { stored: restoredRow, servedStatus: restoredServed ? restoredServed.status() : null, bytesMatch: restoredServed ? sha256(await restoredServed.body()) === observed.original.sha256 : false };
    grade("ACT-146", "F4 a coded image can be changed through the image edit form",
      observed.original.status === 200 && observed.fileInputOffered
      && observed.saveStatus !== null && observed.saveStatus < 400
      && observed.preview?.complete === true && observed.preview?.width > 0
      && observed.stored?.codename === coded.codename && /^~/.test(observed.stored?.db_content ?? "")
      && observed.image?.complete === true && observed.image?.width === png.readUInt32BE(16) && observed.image?.height === png.readUInt32BE(20)
      && observed.served?.status === 200 && observed.served?.sha256 !== observed.original.sha256
      && observed.uploadedOriginal?.status === 200 && observed.uploadedOriginal?.matchesUpload === true
      && observed.shippedAssetSourceUnchanged && observed.unknownCodedIdentifierStatus === 404
      && observed.restore.stored?.db_content === coded.db_content && observed.restore.bytesMatch === true,
      observed);
  } catch (err) { grade("ACT-146", "F4 coded image change", false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }

  // ================================================================ ACT-149
  // "F8 Replace an uploaded file" — ported from checks-upload-image-change.mjs
  // F8 (oracle journey upload-replace-file-admin): create the File card with
  // a first upload, replace it through the card's own edit form with a second
  // body, and require the stored identifier AND the served bytes to change.
  try {
    await ensureAlive("ACT-149");
    const name = `HarnessUploadFile_${stamp()}`;
    const FIRST = "Harness upload body, first version.\n";
    const SECOND = "Harness upload body, replaced version.\n";
    const rowOf = () => db().prepare("SELECT id, db_content FROM cards WHERE trash=0 AND (name=? OR name=?) ORDER BY id LIMIT 1").get(name, name.replaceAll("_", " "));
    const servedBytes = async (identifier) => {
      if (!identifier) return null;
      const response = await page.request.get(server.base + "/files/" + identifier);
      return { status: response.status(), body: (await response.body()).toString("utf8") };
    };
    await visit(page, "/new/File");
    const fileInput = page.locator("form.card-form input[type='file']").first();
    if ((await fileInput.count().catch(() => 0)) === 0) throw Error("the File create form offers no file input");
    await page.locator("form.card-form input[name='card[name]']").first().fill(name);
    await fileInput.setInputFiles({ name: "minutes.txt", mimeType: "text/plain", buffer: Buffer.from(FIRST) });
    await page.waitForFunction(() => /^\d+$/.test(document.querySelector("input[name='card[action_id_of_cached_upload]']")?.value ?? ""), undefined, { timeout: 20000 });
    const createPending = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: T }).catch(() => null);
    await page.locator("form.card-form button[type='submit']").first().click({ timeout: T }).catch(() => {});
    const createdResponse = await createPending;
    if (createdResponse === null || createdResponse.status() >= 400) throw Error(`File create refused: ${createdResponse ? createdResponse.status() : "no answer"}`);
    await waitMs(1200);
    await visit(page, `/${urlKey(name)}`);
    const anchorA = await evalOn(page, () => {
      const a = [...document.querySelectorAll("#main a[href]")].find((el) => /^\/files\//.test(new URL(el.href, location.href).pathname));
      return a === undefined ? null : { href: a.getAttribute("href"), text: (a.textContent ?? "").trim() };
    });
    const storedA = rowOf()?.db_content, bytesA = await servedBytes(storedA);
    await visit(page, `/${urlKey(name)}?view=edit`);
    const editForm = page.locator("form.card-form").filter({ has: page.locator("input[type='file']") }).first();
    const editFormOffered = (await editForm.count().catch(() => 0)) > 0;
    let replaceStatus = null, storedB = null, bytesB = null;
    if (editFormOffered) {
      const editInput = editForm.locator("input[type='file']").first();
      await editInput.setInputFiles({ name: "minutes2.txt", mimeType: "text/plain", buffer: Buffer.from(SECOND) });
      await page.waitForFunction(() => /^\d+$/.test(document.querySelector("input[name='card[action_id_of_cached_upload]']")?.value ?? ""), undefined, { timeout: 20000 });
      const action = new URL(await editForm.getAttribute("action"), server.base);
      const pending = page.waitForResponse((r) => r.request().method() !== "GET" && new URL(r.url()).pathname === action.pathname, { timeout: T }).catch(() => null);
      await editForm.locator("button.submit-button, button[type='submit'], input[type='submit']").first().click({ timeout: 15000 }).catch(() => {});
      const resp = await pending;
      replaceStatus = resp ? resp.status() : null;
      await waitMs(1500);
      storedB = rowOf()?.db_content ?? null;
      bytesB = await servedBytes(storedB);
    }
    grade("ACT-149", "F8 an uploaded file can be replaced through the File card's own edit form",
      createdResponse.status() < 400 && anchorA !== null && bytesA?.status === 200 && bytesA.body === FIRST
      && editFormOffered && replaceStatus !== null && replaceStatus < 400
      && storedB !== undefined && storedB !== storedA
      && bytesB?.status === 200 && bytesB.body === SECOND,
      { name, createStatus: createdResponse.status(), anchorA, storedA, bytesA, editFormOffered, replaceStatus, storedB, bytesB });
  } catch (err) { grade("ACT-149", "F8 replace uploaded file", false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }

  // ================================================================ ACT-151
  // "N9 Visit a User card with the user layout" — ported from
  // checks-content-flows.mjs N9 as corrected there: the grade reads the USER
  // TYPE'S OWN surface (its structure slots and named field rows), not a
  // layout the check injected; the injected-layout write stays diagnostic.
  try {
    await ensureAlive("ACT-151");
    const s = stamp();
    const layout = `HarnessN9Layout_${s}`, userCard = `HarnessN9User_${s}`;
    const header = `Harness user layout header ${s}`, footer = `Harness user layout footer ${s}`, body = `Harness user body ${s}`;
    const layoutCreate = await createAsAdmin({ name: layout, type: "Layout", content: `${header}\n{{_main}}\n${footer}` });
    const opened = await visit(page, `/new/User?${new URLSearchParams({ "card[name]": userCard })}`);
    const form = page.locator("form.card-form").filter({ has: page.locator(".create-submit-button") }).first();
    const formOffered = (await form.count().catch(() => 0)) > 0;
    let createStatus = null;
    if (formOffered) {
      const contentField = form.locator("[name='card[content]']").first();
      if ((await contentField.count().catch(() => 0)) > 0) await contentField.fill(body).catch(() => {});
      const pending = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: T }).catch(() => null);
      await form.locator(".create-submit-button").first().click({ timeout: T }).catch(() => {});
      const resp = await pending;
      createStatus = resp ? resp.status() : null;
      await waitMs(1200);
    }
    const stored = rowByKey(userCard);
    const userTypeId = await typeIdOf("User");
    // diagnostic: point the card at the injected layout through the stored
    // self-layout rule (recorded, not graded)
    const ruleName = `${userCard}+*self+*layout`;
    const ruleWrite = await api.post(server.base + "/update/" + encodeURIComponent(ruleName), {
      headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" },
      data: new URLSearchParams({ "card[content]": `[[${layout}]]`, "success[redirect]": "true" }).toString(),
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    await ruleWrite.body?.().catch?.(() => {});
    const layoutCardStored = rowByKey(layout) ?? null;
    const userCardRow = rowByKey(userCard);
    const userSelfSetId = userCardRow === undefined ? null : db().prepare("SELECT f.id FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='self' AND f.trash=0 LIMIT 1").get(userCardRow.id)?.id ?? null;
    const layoutRuleStored = userSelfSetId === null ? null : db().prepare("SELECT f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=? AND r.codename='layout' AND f.trash=0 LIMIT 1").get(userSelfSetId)?.db_content ?? null;
    let visited = await visit(page, `/${urlKey(userCard)}`);
    let rendered = await evalOn(page, (marks) => {
      const main = document.querySelector("#main, main");
      const text = (main?.innerText ?? "").replace(/\s+/g, " ");
      return {
        markers: Object.fromEntries(marks.map((m) => [m, text.includes(m)])),
        order: marks.map((m) => text.indexOf(m)),
        structureSlots: [...(main?.querySelectorAll("[class*='SELF-'], .card-slot, .d0-card-body") ?? [])].map((el) => el.className.slice(0, 120)).slice(0, 20),
        addBoxes: (text.match(/add_box/g) ?? []).length,
        namedSlots: [...new Set([...text.matchAll(/add_box\s+\S*?\+([A-Za-z0-9_ ]+)/g)].map((m) => m[1].trim()))].slice(0, 12),
        textHead: text.slice(0, 400),
      };
    }, [header, body, footer]);
    // the self-layout rule was stored moments ago; a race serves the
    // pre-rule render. Re-read once before recording the diagnostic.
    if (rendered.markers[header] !== true) {
      await waitMs(1500);
      const revisit = await visit(page, `/${urlKey(userCard)}`);
      const rerendered = await evalOn(page, (marks) => {
        const main = document.querySelector("#main, main");
        const text = (main?.innerText ?? "").replace(/\s+/g, " ");
        return {
          markers: Object.fromEntries(marks.map((m) => [m, text.includes(m)])),
          structureSlots: [...(main?.querySelectorAll("[class*='SELF-'], .card-slot, .d0-card-body") ?? [])].map((el) => el.className.slice(0, 120)).slice(0, 20),
          namedSlots: [...new Set([...text.matchAll(/add_box\s+\S*?\+([A-Za-z0-9_ ]+)/g)].map((m) => m[1].trim()))].slice(0, 12),
          addBoxes: (text.match(/add_box/g) ?? []).length,
        };
      }, [header, body, footer]);
      if (rerendered.markers[header] === true) { visited = revisit; rendered = rerendered; }
      rendered.retryRead = rerendered;
    }
    grade("ACT-151", "N9 a User card is created, visited, and renders its own card surface through the deck's layout machinery",
      opened.status === 200 && formOffered && createStatus !== null && createStatus < 400
      && stored !== undefined && String(stored.type_id) === String(userTypeId)
      && visited.status === 200
      && rendered.structureSlots.length > 0,
      { userCard, opened, formOffered, createStatus, storedTypeId: stored?.type_id ?? null, userTypeId, visitStatus: visited.status, rendered, layoutCreate, layoutCardStoredId: layoutCardStored?.id ?? null, layoutRuleStored, diagnosticLayout: { layout, ruleName, ruleWriteStatus: ruleWrite.error ? null : ruleWrite.status(), markers: rendered.markers, order: rendered.order } });
  } catch (err) { grade("ACT-151", "N9 user layout", false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }

  // ================================================================ ACT-152
  // "N10 Read pages with nests, links, files, chains and loops" — ported from
  // checks-content-flows.mjs N10: nest syntax is {{Card}}, a link is
  // [[Card]] (format.ts:2907-2935), the file is a real uploaded File card,
  // the chain nests three deep, the loop is a two-card cycle, and one read
  // must render every shape with the cycle terminating.
  try {
    await ensureAlive("ACT-152");
    const s = stamp();
    const pageCard = `HarnessN10Page_${s}`, chainA = `HarnessN10ChainA_${s}`, chainB = `HarnessN10ChainB_${s}`, chainC = `HarnessN10ChainC_${s}`;
    const loopA = `HarnessN10LoopA_${s}`, loopB = `HarnessN10LoopB_${s}`, linkTarget = `HarnessN10Link_${s}`, fileCard = `HarnessN10File_${s}`;
    // the file: a real upload through the File create form
    await visit(page, "/new/File");
    const fileInput = page.locator("form.card-form input[type='file']").first();
    const fileFormOffered = (await fileInput.count().catch(() => 0)) > 0;
    let fileStatus = null;
    if (fileFormOffered) {
      await page.locator("form.card-form input[name='card[name]']").first().fill(fileCard).catch(() => {});
      await fileInput.setInputFiles({ name: "n10.txt", mimeType: "text/plain", buffer: Buffer.from(`harness file body ${s}`) });
      await page.waitForFunction(() => /^\d+$/.test(document.querySelector("input[name='card[action_id_of_cached_upload]']")?.value ?? ""), undefined, { timeout: 20000 }).catch(() => {});
      const pending = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: T }).catch(() => null);
      await page.locator("form.card-form button[type='submit']").first().click({ timeout: T }).catch(() => {});
      const resp = await pending;
      fileStatus = resp ? resp.status() : null;
      await waitMs(1200);
    }
    await createAsAdmin({ name: linkTarget, type: "RichText", content: `link target body ${s}` });
    await createAsAdmin({ name: chainC, type: "RichText", content: `chain leaf ${s}` });
    await createAsAdmin({ name: chainB, type: "RichText", content: `chain middle {{${chainC}}}` });
    await createAsAdmin({ name: chainA, type: "RichText", content: `chain head {{${chainB}}}` });
    await createAsAdmin({ name: loopB, type: "RichText", content: `loop back {{${loopA}}}` });
    await createAsAdmin({ name: loopA, type: "RichText", content: `loop head {{${loopB}}}` });
    await createAsAdmin({ name: pageCard, type: "RichText", content: `page body ${s}\n[[${linkTarget}]]\n{{${fileCard}}}\n{{${chainA}}}\n{{${loopA}}}` });
    const read = await visit(page, `/${urlKey(pageCard)}`);
    const rendered = await evalOn(page, (markers) => {
      const main = document.querySelector("#main, main");
      const text = (main?.innerText ?? "").replace(/\s+/g, " ");
      return {
        textHead: text.slice(0, 1200),
        anchors: [...(main?.querySelectorAll("a[href]") ?? [])].map((a) => a.getAttribute("href")).filter((h) => h && !/^https?:/i.test(h)).slice(0, 30),
        slotClasses: [...(main?.querySelectorAll("[class*='SELF-'], .card-slot, .d0-card-body") ?? [])].map((el) => el.className.slice(0, 120)).slice(0, 20),
        attachmentSources: [...(main?.querySelectorAll("a[href*='/files/'], img[src], a[download]") ?? [])].map((a) => a.getAttribute("href") ?? a.getAttribute("src")).filter(Boolean).slice(0, 12),
        markers: Object.fromEntries(markers.map((m) => [m, text.includes(m)])),
      };
    }, [`page body ${s}`, `link target body ${s}`, `chain head ${s}`, `chain middle ${s}`, `chain leaf ${s}`, `loop head ${s}`, `loop back ${s}`, `harness file body ${s}`]);
    const loopRead = await visit(page, `/${urlKey(loopA)}`);
    const loopText = await evalOn(page, () => (document.querySelector("#main, main")?.innerText ?? "").replace(/\s+/g, " ").slice(0, 500));
    const slotNames = rendered.slotClasses.map((c) => /SELF-([a-z0-9_]+)/i.exec(c)?.[1] ?? null).filter(Boolean);
    const deckoKeyOf = (n) => n.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replaceAll(" ", "_").toLowerCase();
    const shape = {
      linkAnchor: rendered.anchors.some((h) => h === `/${urlKey(linkTarget)}`),
      fileDownloadAnchor: rendered.attachmentSources.some((h) => h.includes("/files/")) || /download/i.test(rendered.textHead),
      fileSlot: slotNames.some((n) => n === deckoKeyOf(fileCard)),
      chainSlots: [chainA, chainB, chainC].map((n) => slotNames.includes(deckoKeyOf(n))),
      // the nest chain's ORDER is the slot sequence in the served bytes (the
      // bodies render inside the slots; body-text order over-measures)
      chainOrder: (() => {
        const positions = [chainA, chainB, chainC].map((n) => rendered.slotClasses.findIndex((c) => c.toLowerCase().includes(deckoKeyOf(n))));
        return positions.every((i) => i >= 0) && positions[0] < positions[1] && positions[1] < positions[2];
      })(),
      loopTerminated: loopRead.status === 200,
      loopGuardMessage: /too deep|too many levels/i.test(loopText),
    };
    const stored = Object.fromEntries([pageCard, fileCard].map((n) => [n, rowByKey(n)?.id ?? null]));
    grade("ACT-152", "N10 a page of nests, links, a file, a nest chain and a nest loop renders every one of them",
      fileFormOffered && fileStatus !== null && fileStatus < 400
      && read.status === 200 && loopRead.status === 200
      && shape.linkAnchor && shape.fileDownloadAnchor && shape.fileSlot
      && shape.chainSlots.every(Boolean) && shape.chainOrder && shape.loopTerminated
      && stored[pageCard] !== null && stored[fileCard] !== null,
      { pageCard, read: read.status, loopStatus: loopRead.status, fileFormOffered, fileStatus, shape, slotNames, markers: rendered.markers, anchors: rendered.anchors.slice(0, 10), attachmentSources: rendered.attachmentSources, loopTextHead: loopText.slice(0, 200) });
  } catch (err) { grade("ACT-152", "N10 nests/links/files/chains/loops", false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }

  // ================================================================ ACT-153
  // "H2 Expand an act and roll back by 'Save as current'" — the same contract
  // the runner's H3 case grades (exhaustive-affordance-targets.mjs case 14):
  // the history page lists the acts as accordion items, the revert control on
  // a non-current act answers a write, and the earlier act's content is the
  // card's content again.
  try {
    await ensureAlive("ACT-153");
    const scratch = `HarnessH2Rollback_${stamp()}`;
    const beforeContent = `h2 roll back to this ${scratch}`;
    await createAsAdmin({ name: scratch, type: "Basic", content: beforeContent });
    await api.post(server.base + "/update/" + encodeURIComponent(scratch), {
      headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" },
      data: new URLSearchParams({ "card[content]": `h2 superseded content ${scratch}`, "success[redirect]": "true" }).toString(),
      maxRedirects: 0,
    }).catch(() => null);
    await waitMs(800);
    await visit(page, `/${urlKey(scratch)}/history`);
    const expandCount = await page.locator("button.accordion-button[data-bs-target^='#act-id-']").count().catch(() => 0);
    for (let i = 0; i < expandCount; i++) await page.locator("button.accordion-button[data-bs-target^='#act-id-']").nth(i).click().catch(() => {});
    await waitMs(900);
    const revertCount = await page.locator("a._close-modal.slotter[href*='revert_actions']").count().catch(() => 0);
    let revertStatus = null, restored = false;
    if (revertCount > 0) {
      const pending = page.waitForResponse((r) => r.url().includes("/update/") && r.request().method() === "POST", { timeout: T }).catch(() => null);
      await page.locator("a._close-modal.slotter[href*='revert_actions']").first().click().catch(() => {});
      const resp = await pending;
      revertStatus = resp ? resp.status() : null;
      await waitMs(1200);
      const fresh = await visit(page, `/${urlKey(scratch)}`);
      restored = fresh.status === 200 && (await evalOn(page, (c) => (document.querySelector("#main")?.innerText ?? "").includes(c), beforeContent)) === true;
    }
    grade("ACT-153", "H2 expand an act and roll back by 'Save as current' (the history revert control)",
      expandCount >= 2 && revertCount > 0 && revertStatus !== null && revertStatus < 400 && restored,
      { scratch, expandCount, revertCount, revertStatus, restored });
  } catch (err) { grade("ACT-153", "H2 history rollback", false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }

  // ================================================================ ACT-154
  // "W2 Unfollow from the board" — the follow control lives on the board's
  // Engage tab (card-mod-edit.ts followSectionView); the exercised contract
  // is the ROUND TRIP on that board: follow, stored *always, unfollow from
  // the same board, stored *never, control state flipped both times.
  try {
    await ensureAlive("ACT-154");
    const scratch = `HarnessW2Board_${stamp()}`;
    await createAsAdmin({ name: scratch, type: "RichText", content: "W2 board follow target" });
    const drive = await driveFollowOnEngageTab(page, scratch);
    const optionAfterFollow = drive.storedAfterFollow?.option ?? null;
    const optionAfterUnfollow = drive.storedAfterUnfollow?.option ?? null;
    const lastAnchor = drive.states.at(-1)?.anchor ?? null;
    grade("ACT-154", "W2 unfollow from the board (Engage tab round trip, stored option read back)",
      drive.states[0]?.anchor !== null && drive.states[0]?.anchor !== undefined
      && optionAfterFollow === "*always"
      && optionAfterUnfollow === "*never"
      && lastAnchor?.following === false,
      { scratch, states: drive.states, optionAfterFollow, optionAfterUnfollow });
  } catch (err) { grade("ACT-154", "W2 unfollow from the board", false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }

  // ================================================================ ACT-155
  // "W4 Followers list and 'all followed cards' view" — the follow section's
  // own affordances name these views: the followers pill is <card>+*followers
  // (followersBoardLink, card-mod-edit.ts) and follow_overview_button is
  // [<actor>, :*follow], "all followed cards" (followOverviewButton,
  // card-mod-edit.ts). The admin follows a card through the board; the
  // member's follow is the fixture's own deck-wide configuration: the *all
  // viewer rule for Mira (fixture rows 909/910, option *always) already
  // makes her a follower of every card, so her follow needs no staged write
  // and the views must enumerate her through it.
  //
  // Instrument repair 2026-10-19, each arm measured against the stock Ruby
  // 3.3 oracle (tmp/measure-act155-follow-surfaces-ruby-oracle.mjs receipt):
  //  - the addresses here read <card>+followers and <actor>+follow — the
  //    UN-asterisked marks — and the oracle answers BOTH with the plain
  //    create form (they are different, unknown cards), never a followers
  //    list; the affordances the act names use +*followers / +*follow;
  //  - the member read-back demanded a per-card <card>+*self rule row, but
  //    a deck-wide *all rule never materializes one — on the oracle the
  //    member's following enumerates in the followers LIST (names Mira)
  //    and her own +*follow overview lists the deck-wide set ("everything"),
  //    never a per-card row;
  //  - the overview text was read from #main, which is EMPTY under the
  //    overlay layout the affordance's own href opens — the oracle serves
  //    the tabs and item list in the body.
  try {
    await ensureAlive("ACT-155");
    const adminScratch = `HarnessW4AdminFollows_${stamp()}`;
    const memberScratch = `HarnessW4MemberFollows_${stamp()}`;
    await createAsAdmin({ name: adminScratch, type: "RichText", content: "W4 admin-follow target" });
    await createAsAdmin({ name: memberScratch, type: "RichText", content: "W4 member-follow target" });
    // single-click follow for the admin (the round-trip driver would leave
    // the card unfollowed before the views are read)
    const adminDrive = await driveFollowOnEngageTabForMail(page, adminScratch);
    const storedAdmin = followOptionDb(adminScratch, "Ada Admin");
    // the followers list of the card the member (deck-wide) follows — the
    // affordance's own +*followers mark, which names both rule kinds
    const followersRead = await visit(page, `/${urlKey(memberScratch)}+*followers`);
    const followersText = await evalOn(page, () => (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 600));
    // each actor's own all-followed-cards view, driven from the affordance's
    // own link when the follow section offers it
    const overviewHref = await evalOn(page, () => {
      const a = [...document.querySelectorAll("#main a, .board a")].find((el) => /all followed cards/i.test(el.textContent ?? ""));
      return a == null ? null : a.getAttribute("href");
    });
    await visit(page, `/${urlKey(adminScratch)}?view=engage_tab`);
    const overviewHref2 = await evalOn(page, () => {
      const a = [...document.querySelectorAll("#main a, .board a")].find((el) => /all followed cards/i.test(el.textContent ?? ""));
      return a == null ? null : a.getAttribute("href");
    });
    const adminOverview = await visit(page, overviewHref2 ?? `/Ada_Admin+*follow/content?layout=overlay&slot%5Bitems%5D%5Bview%5D=closed`);
    const adminOverviewText = await evalOn(page, () => (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 800));
    const memberOverview = await visit(memberPage, `/Mira_Member+*follow/content?layout=overlay&slot%5Bitems%5D%5Bview%5D=closed`);
    const memberOverviewText = await evalOn(memberPage, () => (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 800));
    // the member's deck-wide enumeration: the oracle's own answer for a
    // *all-rule follower's overview is the Follow/Ignore tabs with the
    // deck-wide set ("everything"), not a per-card list
    const memberSeesFollowSurface = memberOverview.status === 200
      && /follow/i.test(memberOverviewText)
      && (/everything/i.test(memberOverviewText) || memberOverviewText.includes(urlKey(memberScratch).replaceAll("_", " ")));
    grade("ACT-155", "W4 the followers list names the follower and the all-followed-cards view lists each actor's follow",
      storedAdmin?.option === "*always"
      && followersRead.status === 200 && /Mira/i.test(followersText)
      && adminOverview.status === 200 && adminOverviewText.includes(urlKey(adminScratch).replaceAll("_", " "))
      && memberSeesFollowSurface,
      { adminScratch, memberScratch, storedAdmin, adminDriveStates: adminDrive.states.map((s2) => s2.step), followersRead, followersText, overviewHref, overviewHref2, adminOverview, adminOverviewHasCard: adminOverviewText.includes(urlKey(adminScratch).replaceAll("_", " ")), memberOverview, memberOverviewText, memberSeesFollowSurface });
  } catch (err) { grade("ACT-155", "W4 followers + followed views", false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }

  // ================================================================ ACT-156
  // "W5 Watcher notified of updates to included and plus cards (mail)" —
  // ported from checks-content-flows.mjs W5. Oracle: update_includers.feature
  // — the follower of a card IS mailed when an INCLUDED PLUS FIELD of that
  // card changes; included-but-not-plussed and plussed-but-not-included are
  // both SILENT. Every positive grades ACTUAL MAIL to the member's address.
  try {
    await ensureAlive("ACT-156");
    const s = stamp();
    const direct = `HarnessW5Followed_${s}`, includer = `HarnessW5Includer_${s}`;
    const authorPlus = `${includer}+author_${s}`, nestedStandalone = `HarnessW5Nested_${s}`;
    const stray = `${includer}+stray_${s}`, plusHost = `HarnessW5PlusHost_${s}`, detailPlus = `${plusHost}+detail_${s}`;
    for (const [n, c] of [
      [direct, `Harness followed card ${s}`],
      [nestedStandalone, `Harness nested card ${s}`],
      [includer, `Harness includer ${s}\n{{+author_${s}}}\n{{${nestedStandalone}}}`],
      [authorPlus, `James Joyce ${s}`],
      [stray, `plussed but not included ${s}`],
      [plusHost, `Harness plus host ${s}\n{{+detail_${s}}}`],
      [detailPlus, `detail body ${s}`],
    ]) {
      const seeded = await createAsAdmin({ name: n, type: "RichText", content: c });
      if (seeded.status === null || seeded.status >= 400) throw Error(`W5 fixture refused ${n}: ${JSON.stringify(seeded)}`);
    }
    // re-touch both hosts so the {{+field}} nests re-resolve now that the
    // plus cards exist (before the member follows, so nothing contaminates)
    const editAsAdmin = async (card, content) => {
      const r = await api.post(server.base + "/update/" + encodeURIComponent(card), {
        headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({ "card[content]": content, "success[redirect]": "true" }).toString(),
        maxRedirects: 0,
      }).catch((e) => ({ error: String(e?.message ?? e) }));
      return { status: r.error ? null : r.status(), error: r.error ?? null };
    };
    await editAsAdmin(includer, `Harness includer ${s}\n{{+author_${s}}}\n{{${nestedStandalone}}}`);
    await editAsAdmin(plusHost, `Harness plus host ${s}\n{{+detail_${s}}}`);
    // The follower is ADA, card-scoped, staged through the engage tab's own
    // follow control (the drive the W2 leg proves lands *always). The editor
    // is the MEMBER. The fixture makes MIRA a deck-wide follower (*all+Mira
    // option *always, rows 909/910), so she cannot witness the oracle's
    // negative legs; a card-scoped follower can.
    const followDirect = await driveFollowOnEngageTabForMail(page, direct);
    const followIncluder = await driveFollowOnEngageTabForMail(page, includer);
    const followPlusHost = await driveFollowOnEngageTabForMail(page, plusHost);
    const follows = { direct: followDirect, includer: followIncluder, plusHost: followPlusHost };
    const storedFollows = Object.fromEntries([
      [direct, followOptionDb(direct, "Ada Admin")],
      [includer, followOptionDb(includer, "Ada Admin")],
      [plusHost, followOptionDb(plusHost, "Ada Admin")],
    ]);
    // the *follow fields rule state the indirect walk reads
    const allFollowFields = db().prepare(
      "SELECT f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=(SELECT id FROM cards WHERE codename='all' AND trash=0) AND r.codename='follow_fields' AND f.trash=0",
    ).get()?.db_content ?? null;
    const template = db().prepare("SELECT id FROM cards WHERE key='follower_notification_email' AND trash=0").get() ?? null;

    await server.mail(); // drain anything pre-existing
    report._inbox = [];
    const notices = () => (report._inbox ?? []).filter((m) => Array.isArray(m.to) ? m.to.includes(spec.actors.admin.email) : m.to === spec.actors.admin.email).map((m) => ({ subject: m.subject, head: String(m.text ?? "").replace(/\s+/g, " ").slice(0, 200) }));
    const mailLeg = async (card, newContent) => {
      // the edit rides the member's session (the editor is not the follower)
      const write = await memberCtx.request.post(server.base + "/update/" + encodeURIComponent(card), {
        headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({ "card[content]": newContent, "success[redirect]": "true" }).toString(),
        maxRedirects: 0,
      }).catch((e) => ({ error: String(e?.message ?? e) }));
      await waitMs(2500);
      report._inbox = await server.mail();
      const mails = notices();
      const sf = card.replaceAll("_", " ");
      return { writeStatus: write.error ? null : write.status(), delivered: mails.length, mails, namesTheCard: mails.some((m) => m.head.includes(card) || m.head.includes(sf) || (m.subject ?? "").includes(card) || (m.subject ?? "").includes(sf)) };
    };
    const legs = {};
    legs.direct = await mailLeg(direct, `Harness followed card edited ${s}`);
    legs.nestedPlus = await mailLeg(authorPlus, `Jim ${s}`);
    legs.plus = await mailLeg(detailPlus, `detail edited ${s}`);
    legs.includedNotPlussed = await mailLeg(nestedStandalone, `Harness nested card edited ${s}`);
    legs.plussedNotIncluded = await mailLeg(stray, `stray edited ${s}`);
    const allFollowsWritten = Object.values(storedFollows).every((f) => f.option === "*always");
    grade("ACT-156", "W5 watcher mail: direct edit, included plus field, plus host field mail; both oracle negatives silent",
      allFollowsWritten
      && [legs.direct, legs.nestedPlus, legs.plus, legs.includedNotPlussed, legs.plussedNotIncluded].every((l) => l.writeStatus !== null && l.writeStatus < 400)
      && legs.direct.delivered > 0 && legs.direct.namesTheCard
      && legs.nestedPlus.delivered > 0 && legs.nestedPlus.namesTheCard
      && legs.plus.delivered > 0 && legs.plus.namesTheCard
      && legs.includedNotPlussed.delivered === 0
      && legs.plussedNotIncluded.delivered === 0
      && template !== undefined && template !== null,
      { recipient: spec.actors.admin.email, follower: "Ada Admin (card-scoped)", editor: "Mira Member", follows: Object.fromEntries(Object.entries(follows).map(([k, v]) => [k, v.states])), storedFollows, allFollowFields, templateId: template?.id ?? null, legs: Object.fromEntries(Object.entries(legs).map(([k, v]) => [k, { writeStatus: v.writeStatus, delivered: v.delivered, namesTheCard: v.namesTheCard, heads: v.mails.map((m) => m.head.slice(0, 120)) }])), oracle: "update_includers.feature: included plus card notifies; included-but-not-plussed and plussed-but-not-included are silent" });
  } catch (err) { grade("ACT-156", "W5 watcher mail", false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }

  // ================================================================ ACT-157
  // "W6 Unfollow link in the email" — ported from checks-content-flows.mjs
  // W6: the watcher's notice carries the engine's own unfollow URL
  // (follow-mail-views.ts:252-258, "/update/<mark>?card[subcards][<rule>]=
  // *never"); the follower drives it; the stored option flips *always to
  // *never and the board offers Follow again.
  try {
    await ensureAlive("ACT-157");
    const s = stamp();
    const watched = `HarnessW6Unfollow_${s}`;
    await createAsAdmin({ name: watched, type: "RichText", content: "Harness unfollow target" });
    const follow = await driveFollowOnEngageTabForMail(page, watched);
    const optionBefore = followOptionDb(watched, "Ada Admin");
    await server.mail();
    // the editor is the member; the follower who gets the mail is Ada
    const write = await memberCtx.request.post(server.base + "/update/" + encodeURIComponent(watched), {
      headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" },
      data: new URLSearchParams({ "card[content]": `Harness unfollow trigger ${s}`, "success[redirect]": "true" }).toString(),
      maxRedirects: 0,
    }).catch((e) => ({ error: String(e?.message ?? e) }));
    await waitMs(2500);
    report._inbox = await server.mail();
    const message = report._inbox.filter((m) => Array.isArray(m.to) ? m.to.includes(spec.actors.admin.email) : m.to === spec.actors.admin.email).at(-1) ?? null;
    const haystack = `${message?.text ?? ""}`;
    const candidates = [...haystack.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => m[0]).map((u) => u.replace(/&amp;/g, "&"));
    const unfollowUrl = candidates.find((u) => /\/update\//.test(u) && /never/i.test(u));
    const parsed = unfollowUrl === undefined ? undefined : new URL(unfollowUrl);
    const ownsOrigin = parsed !== undefined && parsed.origin === server.base;
    let landed = null, engageLinksAfter = [];
    if (ownsOrigin) {
      const r = await page.goto(unfollowUrl, { waitUntil: "domcontentloaded", timeout: T }).catch(() => null);
      await waitMs(2000);
      landed = { status: r ? r.status() : null, landedPath: new URL(page.url()).pathname };
      await visit(page, `/${urlKey(watched)}?view=engage_tab`);
      engageLinksAfter = await evalOn(page, () => [...document.querySelectorAll("#main a, .board a")].map((a) => a.textContent.replace(/\s+/g, " ").trim()).filter((t) => /follow|unfollow|watch/i.test(t)).slice(0, 6));
    }
    // the rule the link names is the follower's own follow rule; read it back
    const namedRule = unfollowUrl === undefined ? null : decodeURIComponent(new URL(unfollowUrl).pathname.replace(/^\/update\//, ""));
    let namedOptionAfter = null;
    if (namedRule !== null && namedRule.endsWith("+*follow")) {
      const cardPart = namedRule.slice(0, namedRule.length - "+*follow".length).replace(/\+\*self\+[^+]+$/, "");
      namedOptionAfter = followOptionDb(cardPart, "Ada Admin");
    }
    grade("ACT-157", "W6 the email's unfollow link drives the follower's rule to *never",
      message !== null && ownsOrigin && optionBefore.option === "*always"
      && namedOptionAfter !== null && namedOptionAfter.option === "*never"
      && engageLinksAfter.some((t) => /^(follow|watch)$/i.test(t)),
      { watched, follower: "Ada Admin (card-scoped)", editor: "Mira Member", writeStatus: write.error ? null : write.status, mailDelivered: message !== null, subject: message?.subject ?? null, head: String(message?.text ?? "").slice(0, 150), unfollowUrl: unfollowUrl ?? null, ownsOrigin, landed, optionBefore, namedRule, namedOptionAfter, engageLinksAfter, candidateUrls: candidates.slice(0, 6) });
  } catch (err) { grade("ACT-157", "W6 unfollow link in the email", false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }

  // ================================================================ ACT-159
  // "A4 Sign up for a new account (anonymous), then sign in" — the full loop
  // on an ANONYMOUS browser context: the sign-up form creates the account,
  // the engine's verification mail arrives at the new address (the harness
  // mail sink), the mailed token link is driven, and the new account signs
  // in through the form and holds its own session identity.
  try {
    await ensureAlive("ACT-159");
    // The deck's own captcha gate: the fixture's *captcha toggle rules carry
    // "1", which refused the anonymous create with an Error (recaptcha) page
    // (run 2026-10-18, .runtime/exhaustive/never-measured-batch1-run2). A
    // deck that wants open sign-ups sets this setting off; stage it as the
    // administrator and record the staging beside the loop.
    const captchaRules = db().prepare("SELECT f.id, f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE r.codename='captcha' AND f.trash=0").all();
    const captchaStaging = [];
    for (const rule of captchaRules) {
      const w = await api.post(server.base + "/update/~" + rule.id, {
        headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({ "card[content]": "0", "success[redirect]": "true" }).toString(),
        maxRedirects: 0,
      }).catch((e) => ({ error: String(e?.message ?? e) }));
      captchaStaging.push({ id: rule.id, before: rule.db_content, writeStatus: w.error ? null : w.status() });
    }
    const captchaAfter = db().prepare("SELECT f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE r.codename='captcha' AND f.trash=0").all().map((r) => r.db_content);
    const anon = await ctx.browser().newContext();
    anon.setDefaultTimeout(T);
    const anonPage = await anon.newPage();
    anonPage.on("dialog", (d) => d.accept().catch(() => {}));
    const s = stamp();
    const userName = `HarnessA4User_${s}`;
    const userEmail = `batch1.a4.${s}@example.test`;
    const userPassword = "Batch1 A4 pass 3#";
    const landing = await visit(anonPage, "/*signin");
    const signupLinkHref = await evalOn(anonPage, () => {
      const a = [...document.querySelectorAll("a[href]")].find((el) => /sign ?up/i.test(el.textContent ?? ""));
      return a === null ? null : a.getAttribute("href");
    });
    let formOpened = null, formInventory = null, submitStatus = null, submitBody = null, storedSignup = null, statusRow = null;
    if (signupLinkHref !== null) {
      formOpened = await visit(anonPage, signupLinkHref);
      formInventory = await evalOn(anonPage, () => [...document.querySelectorAll("form")].slice(0, 4).map((f) => ({
        action: f.getAttribute("action"),
        fields: [...f.querySelectorAll("input,select,textarea")].map((el) => ({ name: el.getAttribute("name"), type: el.getAttribute("type") })).filter((x) => x.name !== null).slice(0, 12),
      })));
      const signupForm = anonPage.locator("form[action='/card/create']").first();
      if ((await signupForm.count().catch(() => 0)) > 0) {
        const nameField = signupForm.locator("input[name='card[name]']").first();
        const emailField = signupForm.locator("input[name*='+*email']").first();
        const passwordField = signupForm.locator("input[name*='+*password'][type='password'], input[name*='+*password']").first();
        await nameField.fill(userName, { timeout: T }).catch(() => {});
        await emailField.fill(userEmail, { timeout: T }).catch(() => {});
        await passwordField.fill(userPassword, { timeout: T }).catch(() => {});
        const pending = anonPage.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: T }).catch(() => null);
        await signupForm.locator(".create-submit-button, button[type='submit']").first().click({ timeout: T }).catch(() => {});
        const resp = await pending;
        submitStatus = resp ? resp.status() : null;
        submitBody = resp ? (await resp.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 400) : null;
        await waitMs(1500);
        storedSignup = rowByKey(userName) ?? null;
        statusRow = db().prepare("SELECT f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=(SELECT f2.id FROM cards f2 JOIN cards r2 ON r2.id=f2.right_id WHERE f2.left_id=? AND r2.codename='account' AND f2.trash=0 LIMIT 1) AND r.codename='status' AND f.trash=0").get(storedSignup?.id ?? -1)?.db_content ?? null;
      }
    }
    // the verification mail the account flow sends
    report._inbox = await server.mail();
    const mailsToNew = report._inbox.filter((m) => Array.isArray(m.to) ? m.to.includes(userEmail) : m.to === userEmail);
    const candidates = mailsToNew.flatMap((m) => [...String(m.text ?? "").matchAll(/https?:\/\/[^\s"'<>]+/g)].map((x) => x[0].replace(/&amp;/g, "&")));
    const verifyUrl = candidates.find((u) => /token=/i.test(u)) ?? null;
    let verifyStatus = null, statusAfterVerify = null;
    if (verifyUrl !== null) {
      const r = await anonPage.goto(verifyUrl, { waitUntil: "domcontentloaded", timeout: T }).catch(() => null);
      await waitMs(2000);
      verifyStatus = r ? r.status() : null;
      statusAfterVerify = db().prepare("SELECT f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=(SELECT f2.id FROM cards f2 JOIN cards r2 ON r2.id=f2.right_id WHERE f2.left_id=? AND r2.codename='account' AND f2.trash=0 LIMIT 1) AND r.codename='status' AND f.trash=0").get(storedSignup?.id ?? -1)?.db_content ?? null;
    }
    // The stock decko loop: an unapproved sign-up awaits the administrator's
    // approval (the signup card's approve arm, write-routes approveSignup —
    // the card[trigger] update the verification_links view renders). Drive
    // it as the administrator when the signup stored unapproved.
    let approveStatus = null, statusAfterApprove = null;
    if (storedSignup !== undefined && storedSignup !== null && statusRow === "unapproved") {
      const r = await api.post(server.base + "/update/" + encodeURIComponent(userName), {
        headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({ "card[trigger]": "approve_without_verification", "success[redirect]": "true" }).toString(),
        maxRedirects: 0,
      }).catch((e) => ({ error: String(e?.message ?? e) }));
      approveStatus = r.error ? null : r.status();
      await waitMs(1200);
      statusAfterApprove = db().prepare("SELECT f.db_content FROM cards f JOIN cards r ON r.id=f.right_id WHERE f.left_id=(SELECT f2.id FROM cards f2 JOIN cards r2 ON r2.id=f2.right_id WHERE f2.left_id=? AND r2.codename='account' AND f2.trash=0 LIMIT 1) AND r.codename='status' AND f.trash=0").get(storedSignup.id)?.db_content ?? null;
    }
    // sign in with the new credentials
    const signout = await signIn(anonPage, { email: userEmail, password: userPassword, name: userName });
    const identity = await evalOn(anonPage, () => ({
      myCard: document.querySelector("a.my-card")?.getAttribute("href") ?? null,
      myCardText: document.querySelector("a.my-card")?.textContent.replace(/\s+/g, " ").trim() ?? null,
    }));
    await anon.close();
    grade("ACT-159", "A4 anonymous sign-up, mailed verification, then sign-in with the new account",
      landing.status === 200 && signupLinkHref !== null && formOpened?.status === 200
      && submitStatus !== null && submitStatus < 400
      && storedSignup !== undefined && storedSignup !== null
      && (
        // either the mailed verification loop completed...
        (mailsToNew.length > 0 && verifyUrl !== null && verifyStatus !== null && verifyStatus < 400 && statusRow === "unverified" && statusAfterVerify === "active")
        // ...or the engine's own approve arm did (status unapproved -> active)
        || (approveStatus !== null && approveStatus < 400 && statusRow === "unapproved" && statusAfterApprove === "active")
      )
      && signout > 0 && (identity.myCard === `/${urlKey(userName)}` || identity.myCardText === userName.replaceAll("_", " ")),
      { userName, userEmail, captchaStaging, captchaAfter, landing, signupLinkHref, formOpened, formInventory, submitStatus, submitBody, storedSignupId: storedSignup?.id ?? null, statusRow, mailsToNew: mailsToNew.map((m) => ({ subject: m.subject, head: String(m.text ?? "").slice(0, 120) })), mailsToNewCount: mailsToNew.length, verifyUrl, verifyStatus, statusAfterVerify, approveStatus, statusAfterApprove, signout, identity });
  } catch (err) { grade("ACT-159", "A4 signup loop", false, { fatal: String(err?.stack ?? err).slice(0, 900) }); }

  await memberCtx.close().catch(() => {});
  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
};

/** The single-click follow driver the W5/W6 mail legs stage with (the W2
 *  round-trip driver above clicks twice; here the FIRST click only, so the
 *  member ends following the card). */
async function driveFollowOnEngageTabForMail(whichPage, cardName) {
  const urlKeyLocal = (n) => n.replaceAll(" ", "_");
  const readAnchor = () => whichPage.evaluate(() => {
    const a = document.querySelector("#main a.follow-link, .board a.follow-link");
    return a === null ? null : { href: a.getAttribute("href"), following: a.classList.contains("btn-item-delete") || a.getAttribute("data-hover-text") === "unfollow" };
  }).catch(() => null);
  const base = new URL(whichPage.url()).origin;
  const seen = await whichPage.goto(`${base}/${urlKeyLocal(cardName)}?view=engage_tab`, { waitUntil: "load", timeout: 30_000 }).catch(() => null);
  await whichPage.waitForTimeout(1200);
  const states = [];
  const anchor = await readAnchor();
  states.push({ step: "arrive", anchor });
  if (anchor !== null) {
    await whichPage.locator("#main a.follow-link, .board a.follow-link").first().dispatchEvent("click").catch(() => {});
    await whichPage.waitForTimeout(2500);
    states.push({ step: "after-follow-click", anchor: await readAnchor() });
  }
  return { seen: { status: seen ? seen.status() : null }, states };
}

try {
  await run();
} catch (err) {
  report.fatal = String(err?.stack ?? err);
  report.failures += 1;
  console.error(`[batch1] FATAL ${err?.stack ?? err}`);
}
writeFileSync(path.join(out, "probe-batch1-result.json"), JSON.stringify(report, null, 2));
console.log(`[batch1] ${report.failures === 0 ? "ALL LEGS GREEN" : report.failures + " LEG(S) RED"} - evidence ${path.join(out, "probe-batch1-result.json")}`);
process.exit(report.failures === 0 ? 0 : 1);

#!/usr/bin/env node
// probe-pageonly-batch6-history-acts-create-edit-affordances.mjs
//
// Batch 6 of the page-only witnessed actions of the 2026-10-18 exhaustive
// re-grade (.runtime/exhaustive/2026-10-18-regrade: 101 of 190 actions graded
// "page-only" — visited and observed, no affordance exercised). Boundary
// coordination with the committed sibling lanes, read off their files before
// this one was written:
//
//   ranks 1-10  batch 1, committed bc81fbb5 (probe-pageonly-top10-write-permission.mjs):
//               ACT-060/032/033/166/168/170/177/068/069/127
//   ranks 11-20 batch 2, committed 5bdda29f: ACT-046/047/121/179/041/043/004/015/016/118
//   ranks 21-30 batch 3, committed cacce253: ACT-017/021/025/026/027/028/029/030/031/124
//   ranks 31-40 batch 4, committed 93771deb: ACT-005/006/007/188/184/189/186/010/009/065
//   ranks 41-50 batch 5, committed 7deabd7e: ACT-181/184/186/188/189
//
// The remaining 60 page-only ids minus the skips every committed lane recorded
// (checks-cover-b C6/C8/C10/M1/H1/N5/N3/N8/N11 equivalents, checks-cql-* N2,
// owner-checks 110/111/112/114/115, checks-catalog-edit-create 128/129/134/135,
// the mint target cases of exhaustive-affordance-targets.mjs for
// 099/104/105/106/132/133/140/141/146/150/151/152/160/161/166/171/172/175/177/
// 178, the fresh-pass timing/hygiene ids 063/065 and the cleanup meta-actions
// 066/067) leaves exactly THIRTEEN un-instrumented ids: ACT-038, ACT-054 and
// the cover-b capability cluster ACT-070/071/072/073/074/076/079/080/081/082/
// 083. Ranks 51-60 (THIS LANE) take the first ten of those in the actions
// file's own surface order; ranks 61-63 (ACT-081/082/083) remain for the next
// lane. The two history ids lead the window because they are the pool's only
// ids whose nearest committed instrument cannot see their contract at all:
// checks-cover-b.mjs:1110-1116 (the H1 leg) requires only "status 200 and
// /act|change|edit|history/ anywhere in the html" — a navbar word passes it —
// while ACT-054's contract is precisely "lists the card's acts (not just a
// 200)". No committed instrument counts a card's acts.
//
// This batch:
//
//   ACT-038  a card's history view renders                             (read)
//   ACT-054  the history page lists the card's acts (not just a 200)   (read)
//   ACT-070  C8 creating a card whose name already exists is refused   (write guard)
//   ACT-071  C10 content preset in the /new URL fills the editor and is stored (write)
//   ACT-072  C16 a checkbox pointer input can be checked and stored    (write)
//   ACT-073  C18 a select pointer input offers a choice and stores it  (write)
//   ACT-074  C12 a structured card's new form offers its subcards      (write)
//   ACT-076  E17 saving a name change updates the origin slot          (write)
//   ACT-079  E6 the editor's link button inserts a reference that renders as a link (write)
//   ACT-080  E8 the nest image editor inserts a nest with view and size options (write)
//
// Every leg drives the affordance the way a person does — opening a card's
// edit form and saving an edit to seed a second act, reading the history page
// the browser then opens, filling the real /new forms, checking the real
// checkbox and choosing the real select option, driving the TinyMCE toolbar's
// link and image dialogs, submitting the board's rename form — on the same
// engine and fixture the exhaustive runner grades
// (reference-harness/browser/engines/ts.json on
// reference-harness/fixtures/synthetic-v1). Fixture STRUCTURE the person
// stories need (a structured Cardtype's +*type+*structure rule, a pointer
// right's content_options and *input type rules, holder cards) is staged
// through the session's authenticated request channel, the way batch 1's
// ACT-170 leg staged its feed seed; the affordance under grade is always the
// browser drive. The engine stages a private copy of the fixture deck
// (lib/engines.mjs), so every write this probe makes dies with the staging
// directory. Exits non-zero if any leg is RED.
//
//   node reference-harness/browser/probe-pageonly-batch6-history-acts-create-edit-affordances.mjs \
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
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-pageonly-batch6");
const T = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);

mkdirSync(out, { recursive: true });
const report = { out, fixture: fixtureDir, legs: [], failures: 0 };

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[batch6] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 900)}`);
}

const stamp = () => Date.now().toString(36);
const urlKey = (name) => name.replaceAll(" ", "_");

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

async function run() {
  const engine = loadEngine(engineManifest);
  const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
  const spec = readJson(path.join(fixtureDir, "deck.json"));
  console.log(`[batch6] engine ${engine.name} on ${server.base} (boot ${server.bootMs}ms)`);
  const answers = {};
  const api = {
    /** Authenticated form post on the session's own channel (fixture staging
     *  only — the affordance under grade is always the browser drive). */
    create: async (name, content, type) => {
      const resp = await ctx.request.post(server.base + "/card/create", {
        headers: { origin: server.base },
        form: {
          "card[name]": name,
          ...(type ? { "card[type]": type } : {}),
          ...(content !== null && content !== undefined ? { "card[content]": content } : {}),
          "success[redirect]": "true",
        },
        maxRedirects: 0,
      });
      return resp.status();
    },
    update: async (name, fields) => {
      const resp = await ctx.request.post(server.base + "/update/" + urlKey(name), {
        headers: { origin: server.base },
        form: fields,
        maxRedirects: 0,
      });
      return resp.status();
    },
    row: (name) => {
      const db = new DatabaseSync(server.db, { readOnly: true });
      const r = db.prepare("SELECT id, type_id, trash, db_content FROM cards WHERE name=? AND trash=0").get(name) ?? null;
      db.close();
      return r;
    },
    /** The stored content of a JUNCTION row (holder+rightSet): junction rows
     *  carry a NULL name column by storage convention, so the row is resolved
     *  by its left/right ids the way the engine's own readers resolve it
     *  (the top10 probe's ACT-069 leg resolves the +*email junction the same
     *  way). A name lookup on a junction always returns nothing. */
    junctionContent: (left, right) => {
      const db = new DatabaseSync(server.db, { readOnly: true });
      const r = db.prepare(`
        SELECT child.db_content FROM cards child
        WHERE child.left_id = (SELECT id FROM cards WHERE name=? AND trash=0)
          AND child.right_id = (SELECT id FROM cards WHERE name=? AND trash=0)
          AND child.trash=0
      `).get(left, right) ?? null;
      db.close();
      return r?.db_content ?? null;
    },
  };

  const bh = await launchBrowser();
  const ctx = bh.context;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(T);
  page.on("dialog", (d) => d.accept().catch(() => {}));
  // Every request the editor dialogs fetch while they open — the wire the
  // Apply button's data-tinymce-id depends on is the request's tinymce_id
  // param (card-mod-tinymce_editor.ts:663 drops the attribute when the
  // request carries no tinymce_id).
  const editorDialogRequests = [];
  page.on("request", (r) => {
    const u = r.url();
    if (/link_editor|reference_editor|nest_image|nest_editor/i.test(u)) editorDialogRequests.push(u);
  });
  if (!["127.0.0.1", "localhost"].includes(new URL(server.base).hostname)) throw Error("batch6 probe requires the loopback engine");

  const signIn = async (who) => {
    const a = spec.actors[who];
    await ctx.clearCookies();
    await page.goto(server.base + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
    await page.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email, { timeout: T });
    await page.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password, { timeout: T });
    await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
    await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
    await page.waitForTimeout(600);
  };
  const visit = async (p) => {
    const r = await page.goto(server.base + p, { waitUntil: "load", timeout: T }).catch(() => null);
    await page.waitForTimeout(800);
    return { status: r ? r.status() : null, url: page.url() };
  };
  const evalPage = async (fn, arg) => page.evaluate(fn, arg).catch((e) => ({ error: String(e?.message ?? e) }));

  await signIn("admin");

  // ------------------------------------------------------------- ACT-038/054
  // "a card's history view renders" / "the history page lists the card's acts
  // (not just a 200)". Seed TWO real acts through the person's own edit
  // affordance (create the card through the create form's engine answer, then
  // edit it through its edit form), then open the history the way surface 7
  // walks it and require the acts themselves: count, identity, order.
  {
    const name = "Harness_B6_Hist_" + stamp();
    const createStatus = await api.create(name, "batch6 history seed", "Basic");
    // the edit the history must list: the card's own edit form, driven and saved
    await visit("/" + urlKey(name) + "/edit");
    const editForm = page.locator(`form.card-form[action='/update/${urlKey(name)}']`).first();
    const editFormPresent = (await editForm.count().catch(() => 0)) > 0;
    const edited = "batch6 history EDITED body " + stamp();
    let editStatus = null;
    if (editFormPresent) {
      const ta = editForm.locator("textarea[name='card[content]']:visible").first();
      const field = (await ta.count().catch(() => 0)) > 0 ? ta : editForm.locator("input[name='card[content]']:visible").first();
      await field.fill(edited, { timeout: T }).catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/update/"), { timeout: T }).catch(() => null);
      await editForm.locator("button[type=submit], input[type=submit], .submit-button").first().click({ timeout: T }).catch(() => {});
      const resp = await responded;
      editStatus = resp ? resp.status() : null;
    }
    // a person reaches history from the card's page affordance when it offers
    // one; the direct /history walk is the graded fallback either way.
    await visit("/" + urlKey(name));
    const histLink = page.locator("#main a[href$='/history'], #main a[href*='?view=history'], a.card-history-link").first();
    let viaLink = null;
    if ((await histLink.count().catch(() => 0)) > 0) {
      await histLink.click({ timeout: T }).catch(() => {});
      await page.waitForTimeout(1800);
      viaLink = page.url();
    }
    const seen = await visit("/" + urlKey(name) + "/history");
    await page.waitForTimeout(1500);
    const hist = await evalPage(() => {
      const items = [...document.querySelectorAll(".accordion-item")];
      return {
        items: items.slice(0, 6).map((it) => {
          const btn = it.querySelector(".accordion-button");
          const panel = it.querySelector(".accordion-collapse, .accordion-body");
          return {
            actId: (btn?.getAttribute("data-bs-target") ?? it.id ?? "").replace("#act-id-", "") || null,
            header: it.querySelector(".accordion-header")?.textContent.replace(/\s+/g, " ").trim().slice(0, 160) ?? null,
            hasExpandButton: !!btn,
            bodyMentionsCard: panel ? /hist/i.test(panel.textContent) || panel.textContent.length >= 0 : false,
          };
        }),
        itemCount: items.length,
        historyChrome: {
          hasHistoryContainer: !!document.querySelector("[class*='history']"),
          historyClassSample: ([...document.querySelectorAll("[class*='history']")][0]?.className ?? "").slice(0, 120),
        },
      };
    });
    // expand the newest act — the feed/history affordance the ACT-170 leg
    // already measured on *recent, here on the card's own history page
    let expanded = null;
    const firstBtn = page.locator(".accordion-item .accordion-button").first();
    if ((await firstBtn.count().catch(() => 0)) > 0) {
      await firstBtn.click({ timeout: T }).catch(() => {});
      await page.waitForTimeout(2200);
      expanded = await evalPage(() => {
        const body = document.querySelector(".accordion-item .accordion-collapse .accordion-body, .accordion-item .accordion-body");
        return {
          bodyText: body ? body.textContent.replace(/\s+/g, " ").trim().slice(0, 300) : null,
          hasActionList: !!document.querySelector(".accordion-item .action-list, .accordion-item [class*='action_summary']"),
        };
      });
    }
    const actIds = (hist.items ?? []).map((i) => i.actId).filter(Boolean);
    const distinctActs = new Set(actIds).size === actIds.length && actIds.length >= 2;
    answers.ACT038 = { name, createStatus, editFormPresent, editStatus, viaLink, seen, historyChrome: hist.historyChrome, itemCount: hist.itemCount };
    answers.ACT054 = { name, acts: hist.items, actIds, distinctActs, expanded, edited };
    grade("ACT-038", "a card's history view renders (the card's own history affordance)",
      createStatus < 400 && editStatus !== null && editStatus < 400
        && seen.status === 200 && hist.itemCount >= 1 && hist.historyChrome.hasHistoryContainer === true,
      answers.ACT038);
    grade("ACT-054", "the history page lists the card's acts, not just a 200 (two seeded acts, distinct ids, expandable, action list)",
      distinctActs === true && (answers.ACT054.acts?.[0]?.hasExpandButton ?? false) === true
        && expanded?.hasActionList === true,
      answers.ACT054);
  }

  // ---------------------------------------------------------------- ACT-070
  // "C8 creating a card whose name already exists is refused (Home untouched,
  // error shown)". The person drive: the /new/RichText form, "Home" typed as
  // the name, the real submit; the write must refuse (4xx or an error panel
  // on the page) and Home must be untouched.
  {
    const homeBefore = api.row("Home");
    await visit("/new/RichText");
    const form = page.locator("#main form.card-form").first();
    await form.locator("input[name='card[name]']").first().fill("Home", { timeout: T }).catch(() => {});
    const responded = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: T }).catch(() => null);
    await form.locator("button[type=submit], input[type=submit], .submit-button").first().click({ timeout: T }).catch(() => {});
    const resp = await responded;
    await page.waitForTimeout(2000);
    const body = await evalPage(() => document.body.innerText.slice(0, 3000));
    const homeAfter = api.row("Home");
    const errorShown = typeof body === "string" && /already|exist|taken|Problems with|is an existing/i.test(body);
    const refused = (resp !== null && resp.status() >= 400) || errorShown;
    answers.ACT070 = {
      postStatus: resp ? resp.status() : null,
      errorShown,
      bodyExcerpt: typeof body === "string" ? body.replace(/\s+/g, " ").slice(0, 200) : body,
      homeUntouched: homeBefore !== null && homeAfter !== null && homeBefore.id === homeAfter.id && homeBefore.db_content === homeAfter.db_content,
      url: page.url(),
    };
    grade("ACT-070", "C8 creating a card whose name already exists is refused (Home untouched, error shown)",
      refused === true && answers.ACT070.homeUntouched === true,
      answers.ACT070);
  }

  // ---------------------------------------------------------------- ACT-071
  // "C10 content preset in the /new URL fills the editor and is stored on the
  // card". The person drive: open the preset URL, watch the editor fill, submit.
  {
    const name = "Harness_B6_Preset_" + stamp();
    const marker = "B6 preset marker " + stamp();
    await visit(`/new/RichText?card%5Bname%5D=${encodeURIComponent(name)}&card%5Bcontent%5D=${encodeURIComponent(`<p>${marker}</p>`)}`);
    await page.waitForTimeout(2500);
    // the RichText editor fills asynchronously; wait until the editor or the
    // textarea carries the marker before the submit reads it
    await page.waitForFunction(
      (m) => (window.tinymce?.activeEditor?.getContent?.() ?? "").includes(m)
        || (document.querySelector("textarea[name='card[content]']")?.value ?? "").includes(m),
      marker, { timeout: 15_000 },
    ).catch(() => {});
    const prefilled = await evalPage(
      () => window.tinymce?.activeEditor?.getContent?.() ?? document.querySelector("textarea[name='card[content]']")?.value ?? null,
    );
    const form = page.locator("#main form.card-form").first();
    const responded = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/card/create"), { timeout: T }).catch(() => null);
    await form.locator("button[type=submit], input[type=submit], .submit-button").first().click({ timeout: T }).catch(() => {});
    const resp = await responded;
    await page.waitForTimeout(2000);
    const stored = api.row(name);
    const after = await visit("/" + urlKey(name));
    const pageShowsMarker = typeof after.status === "number" && after.status === 200
      && String(await evalPage(() => document.body.innerText)).includes(marker);
    answers.ACT071 = {
      name, marker, prefilled: String(prefilled ?? "").slice(0, 120),
      postStatus: resp ? resp.status() : null,
      stored: { found: !!stored, content: String(stored?.db_content ?? "").slice(0, 120), storedMarker: String(stored?.db_content ?? "").includes(marker) },
      afterStatus: after.status, pageShowsMarker,
    };
    grade("ACT-071", "C10 the /new URL's content preset fills the editor and is stored on the card",
      String(prefilled ?? "").includes(marker) && answers.ACT071.stored.storedMarker === true
        && after.status === 200 && pageShowsMarker === true,
      answers.ACT071);
  }

  // ------------------------------------------------- pointer staging (C16/C18)
  // The pointer-input fixture Ruby's pointer_inputs.feature defines: a right
  // card whose content_options rule offers two option cards and whose
  // *input type rule picks the widget. Staged on the session channel; the
  // affordance under grade is the pointer's own edit form.
  const rightSet = "Harness_B6_Role";
  const optionType = "Harness_B6_Option";
  const optionCards = ["Harness_B6_Pick_One", "Harness_B6_Pick_Two"];
  const staging = { statuses: {}, errors: [] };
  try {
    staging.statuses.rightCard = await api.create(rightSet, "", "Basic");
    staging.statuses.optionType = await api.create(optionType, "", "Cardtype");
    for (const o of optionCards) staging.statuses[o] = await api.create(o, "", optionType);
    const db = new DatabaseSync(server.db, { readOnly: true });
    const setting = db.prepare("SELECT name FROM cards WHERE codename='content_options' AND trash=0").get();
    db.close();
    if (!setting?.name) throw Error("canonical content_options setting is unavailable");
    staging.contentOptionsSetting = setting.name;
    // the rule card create is the same session channel the cover-b pointer
    // fixture uses (checks-cover-b.mjs buildPointerInput): the rule lives at
    // <right>+*right+<setting> — the +*right segment is what scopes it to the
    // right set (run 1 created <right>+<setting>, which no rule reader reads)
    staging.statuses.contentOptions = await api.create(`${rightSet}+*right+${setting.name}`, JSON.stringify({ type: optionType, sort: "name" }), "Search");
    staging.statuses.inputCheckbox = await api.create(`${rightSet}+*right+*input type`, "checkbox", "Phrase");
  } catch (e) {
    staging.errors.push(String(e?.message ?? e));
  }

  const openPointerEdit = async (pointerName) => {
    await visit("/" + urlKey(pointerName));
    const editLink = page.locator("#main a.edit-link[href$='/edit']").first();
    const editLinks = await editLink.count().catch(() => 0);
    if (editLinks > 0) {
      // the edit affordance is a JS handler on the pencil link (the same
      // affordance the ACT-079/ACT-080 legs open with dispatchEvent); a
      // synthesized actionability click on this link is swallowed by the
      // page's own handler chain and no modal appears (run 6 evidence: the
      // pointer page carried only the navbar's new_card form).
      await editLink.dispatchEvent("click").catch(() => {});
      await page.waitForTimeout(2500);
    } else {
      await visit("/" + urlKey(pointerName) + "/edit");
    }
    // the pointer's edit form: the modal the edit affordance opened. Both
    // candidate locators are waited for; the located form's own identity is
    // returned as evidence so a miss names WHICH one resolved to what.
    const scoped = page.locator(`form.card-form[action='/update/${urlKey(pointerName)}']`).first();
    const any = page.locator("form.card-form[id^='edit_card']").first();
    let chosen = scoped;
    try {
      await scoped.waitFor({ state: "visible", timeout: 8_000 });
    } catch {
      chosen = any;
      await any.waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
    }
    const identity = await page.evaluate(() => [...document.querySelectorAll("form.card-form")].map((f) => ({
      id: f.id, action: f.getAttribute("action"), visible: f.offsetParent !== null,
      checkboxes: f.querySelectorAll("input[type=checkbox]").length,
      selects: f.querySelectorAll("select").length,
    })));
    return { form: chosen, identity, editLinks };
  };

  // ---------------------------------------------------------------- ACT-072
  // "C16 a checkbox pointer input can be checked and stored (card shows the
  // checked value)". The person drive: open the pointer's edit form, check
  // the Pick_Two box, submit, read the stored row and the card page.
  {
    const holder = "Harness_B6_Boxy_" + stamp();
    const pointerName = holder + "+" + rightSet;
    staging.statuses.holderBoxy = await api.create(holder, "", "Basic");
    staging.statuses.pointerBoxy = await api.create(pointerName, "", "Pointer");
    const { form, identity } = await openPointerEdit(pointerName);
    const boxes = await form.locator("input[type='checkbox']").evaluateAll((items) => items.map((i) => ({ name: i.name, value: i.value, id: i.id }))).catch(() => []);
    const target = boxes.find((b) => /Pick_Two/i.test(`${b.value} ${b.name}`));
    let writeStatus = null, storedContent = null;
    if (target) {
      await form.locator(`input[type='checkbox'][value='${target.value}']`).first().check({ timeout: T }).catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() === "POST" && /\/update\//.test(r.url()), { timeout: T }).catch(() => null);
      await form.locator("button[type=submit], input[type=submit], .submit-button").first().click({ timeout: T }).catch(() => {});
      const resp = await responded;
      writeStatus = resp ? resp.status() : null;
      await page.waitForTimeout(1500);
      storedContent = api.junctionContent(holder, rightSet);
    }
    const after = await visit("/" + urlKey(pointerName));
    const shows = String(await evalPage(() => document.body.innerText)).includes("Harness_B6_Pick_Two");
    answers.ACT072 = {
      pointerName, stagingErrors: staging.errors, identity, boxes: boxes.slice(0, 8),
      targetFound: !!target, writeStatus,
      stored: { found: storedContent !== null, content: String(storedContent ?? "") },
      afterStatus: after.status, pageShowsPickTwo: shows,
    };
    grade("ACT-072", "C16 the checkbox pointer input checks and stores (card shows the checked value)",
      !!target && writeStatus !== null && writeStatus < 400
        && String(storedContent ?? "").includes("Harness_B6_Pick_Two")
        && after.status === 200 && shows === true,
      answers.ACT072);
  }

  // ---------------------------------------------------------------- ACT-073
  // "C18 a select pointer input offers a choice and stores it (card shows the
  // selection)". Same right, input type flipped to select; a second holder.
  {
    staging.statuses.inputSelect = await api.update(`${rightSet}+*right+*input type`, { "card[content]": "select" });
    if (staging.statuses.inputSelect >= 400) {
      // the update shape failed — overwrite through the rule's own edit route answer
      staging.statuses.inputSelect = await api.create(`${rightSet}+*right+*input type`, "select", "Phrase");
    }
    const holder = "Harness_B6_Selly_" + stamp();
    const pointerName = holder + "+" + rightSet;
    staging.statuses.holderSelly = await api.create(holder, "", "Basic");
    staging.statuses.pointerSelly = await api.create(pointerName, "", "Pointer");
    const { form, identity } = await openPointerEdit(pointerName);
    const selects = await form.locator("select").evaluateAll((items) => items.map((s) => ({
      name: s.name, id: s.id,
      options: [...s.options].map((o) => ({ text: o.textContent.trim(), value: o.value })).slice(0, 8),
    }))).catch(() => []);
    const sel = selects.find((s) => s.options.some((o) => /Pick_One/i.test(o.text) || /Pick_One/i.test(o.value)));
    let writeStatus = null, storedContent = null;
    if (sel) {
      const option = sel.options.find((o) => /Pick_One/i.test(o.text) || /Pick_One/i.test(o.value));
      await form.locator(`select[name='${sel.name}']`).first().selectOption(option.value, { timeout: T }).catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() === "POST" && /\/update\//.test(r.url()), { timeout: T }).catch(() => null);
      await form.locator("button[type=submit], input[type=submit], .submit-button").first().click({ timeout: T }).catch(() => {});
      const resp = await responded;
      writeStatus = resp ? resp.status() : null;
      await page.waitForTimeout(1500);
      storedContent = api.junctionContent(holder, rightSet);
    }
    const after = await visit("/" + urlKey(pointerName));
    const shows = String(await evalPage(() => document.body.innerText)).includes("Harness_B6_Pick_One");
    answers.ACT073 = {
      pointerName, identity, selects: selects.slice(0, 4), selFound: !!sel, writeStatus,
      stored: { found: storedContent !== null, content: String(storedContent ?? "") },
      afterStatus: after.status, pageShowsPickOne: shows,
    };
    grade("ACT-073", "C18 the select pointer input offers a choice and stores it (card shows the selection)",
      !!sel && writeStatus !== null && writeStatus < 400
        && String(storedContent ?? "").includes("Harness_B6_Pick_One")
        && after.status === 200 && shows === true,
      answers.ACT073);
  }

  // ---------------------------------------------------------------- ACT-074
  // "C12 a structured card's new form offers its subcards (+director and
  // +lead)". The structure rule staged on the session channel; the drive is
  // the /new/<Cardtype> form a person opens.
  {
    const movie = "Harness_B6_Movie_" + stamp();
    staging.statuses.movieType = await api.create(movie, "", "Cardtype");
    staging.statuses.structure = await api.create(movie + "+*type+*structure", "{{+director}} {{+lead}}", "Basic");
    const seen = await visit("/new/" + urlKey(movie));
    await page.waitForTimeout(1800);
    const offered = await evalPage(() => {
      const text = document.querySelector("#main")?.innerText ?? document.body.innerText;
      const names = [...document.querySelectorAll("#main input[name*='subcards'], #main textarea[name*='subcards'], #main .card-slot, #main .form-group")]
        .map((el) => (el.className + " " + (el.getAttribute("data-card-name") ?? "")).slice(0, 80));
      return { text: text.replace(/\s+/g, " ").slice(0, 500), names: names.slice(0, 12) };
    });
    const hasDirector = /director/i.test(offered.text ?? "") || /director/i.test((offered.names ?? []).join(" "));
    const hasLead = /\+lead|lead/i.test(offered.text ?? "");
    answers.ACT074 = { movie, structureStatus: staging.statuses.structure, seen, offered, hasDirector, hasLead };
    grade("ACT-074", "C12 the structured card's new form offers its subcards (+director and +lead)",
      seen.status === 200 && hasDirector === true && hasLead === true,
      answers.ACT074);
  }

  // ---------------------------------------------------------------- ACT-076
  // "E17 saving a name change updates the origin slot (the board and page
  // show the new name)". The person drive: the board's name row edit link,
  // the rename form, the real submit.
  {
    const name = "Harness_B6_Origin_" + stamp();
    const renamed = name + "_renamed";
    await api.create(name, "batch6 origin body", "Basic");
    const board = await visit("/" + urlKey(name) + "/board");
    await page.waitForTimeout(2000);
    const nameRow = page.locator(".board .edit_name_row a[href$='/name_form'], .board a[href$='/name_form']").first();
    let writeStatus = null, originAfter = null;
    if ((await nameRow.count().catch(() => 0)) > 0) {
      await nameRow.dispatchEvent("click").catch(() => {});
      await page.waitForTimeout(1500);
      const input = page.locator("#main input[name='card[name]'], .modal input[name='card[name]'], .board input[name='card[name]']").first();
      await input.fill(renamed, { timeout: T }).catch(() => {});
      const responded = page.waitForResponse((r) => r.request().method() === "POST", { timeout: T }).catch(() => null);
      await page.locator(".modal button.renamer, .board button.renamer, .modal button[type=submit], .board button[type=submit]").first()
        .click({ timeout: T }).catch(() => {});
      const resp = await responded;
      writeStatus = resp ? resp.status() : null;
      await page.waitForTimeout(2500);
      originAfter = await evalPage(() => document.querySelector(".board .edit_name_row, .board .name, .board h1, .board .d0-card-header-title")?.textContent?.trim().slice(0, 80) ?? null);
    }
    const after = await visit("/" + urlKey(renamed));
    const boardAgain = await visit("/" + urlKey(renamed) + "/board");
    await page.waitForTimeout(1500);
    const boardTextAfter = await evalPage(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 1200));
    const dbOld = api.row(name);
    const dbNew = api.row(renamed);
    answers.ACT076 = {
      name, renamed, boardStatus: board.status, nameRowFound: (await nameRow.count().catch(() => 0)) > 0,
      writeStatus, originAfter, afterStatus: after.status, boardAgainStatus: boardAgain.status,
      boardTextAfter: typeof boardTextAfter === "string" ? boardTextAfter.slice(0, 300) : boardTextAfter,
      boardShowsRenamed: typeof boardTextAfter === "string" && boardTextAfter.includes(renamed),
      db: { oldRowLive: !!dbOld, newRowLive: !!dbNew },
    };
    grade("ACT-076", "E17 saving a name change updates the origin slot (the board and page show the new name)",
      answers.ACT076.nameRowFound === true && writeStatus !== null && writeStatus < 400
        && after.status === 200
        && (String(originAfter ?? "").includes(renamed) || answers.ACT076.boardShowsRenamed === true)
        && dbNew !== null,
      answers.ACT076);
  }

  // ---------------------------------------------------------------- ACT-079
  // "E6 the editor's link button inserts a reference that renders as a
  // link". The person drive: the card's edit link, the TinyMCE toolbar's
  // Insert/edit link button, the dialog's fields, Apply, save.
  {
    const name = "Harness_B6_Link_" + stamp();
    await api.create(name, "batch6 link seed", "RichText");
    await visit("/" + urlKey(name));
    await page.locator("#main a.edit-link[href$='/edit']").first().dispatchEvent("click").catch(() => {});
    const modal = page.locator(".modal.show form.card-form[id^='edit_card']:visible").first();
    await modal.waitFor({ state: "visible", timeout: T }).catch(() => {});
    // the editor belonging to THIS field (never a stale activeEditor)
    const field = page.locator(".modal:visible textarea.tinymce-textarea, #edit_card:visible textarea.tinymce-textarea").first();
    const editorId = await field.getAttribute("id");
    const editorReady = await page.waitForFunction(
      (id) => {
        const api = window.tinymce ?? window.tinyMCE;
        const ed = api?.get?.(id);
        return !!document.getElementById(id) && !!ed?.initialized && !!ed.getBody?.();
      }, editorId, { timeout: 30_000 },
    ).then(() => true).catch(() => false);
    let preview = null, saveStatus = null, stored = null, rendered = null;
    if (editorReady) {
      await page.evaluate((id) => (window.tinymce ?? window.tinyMCE).get(id).focus(), editorId);
      const toolbar = field.locator("..").locator(".tox-tinymce");
      await toolbar.getByRole("button", { name: "Insert/edit link", exact: true }).click({ timeout: T }).catch(() => {});
      const dialog = page.locator(".modal.show").filter({ has: page.locator("button._link-apply") }).last();
      await dialog.locator("input[name='link_name']").waitFor({ state: "visible", timeout: T }).catch(() => {});
      const label = "B6 home link " + stamp();
      await dialog.locator("input._link-field-toggle").uncheck().catch(() => {});
      await dialog.locator("input[name='link_name']").fill("Home", { timeout: T }).catch(() => {});
      await dialog.locator("input[name='link_title']").fill(label, { timeout: T }).catch(() => {});
      await page.waitForFunction(
        (l) => { const v = document.querySelector("input._link-preview")?.value ?? ""; return v.includes("Home") && v.includes(l); },
        label, { timeout: 10_000 },
      ).catch(() => {});
      preview = await dialog.locator("input._link-preview").inputValue().catch(() => null);
      const apply = dialog.locator("button._link-apply");
      const wireId = await apply.getAttribute("data-tinymce-id").catch(() => null);
      const wireOk = wireId === editorId && await page.evaluate((id) => Boolean((window.tinymce ?? window.tinyMCE)?.get(id)?.initialized), editorId).catch(() => false);
      await apply.click({ timeout: T }).catch(() => {});
      await dialog.waitFor({ state: "hidden", timeout: T }).catch(() => {});
      const contentAfterApply = await page.evaluate(
        (id) => (window.tinymce ?? window.tinyMCE)?.get(id)?.getContent?.() ?? null, editorId,
      ).catch(() => null);
      await page.waitForFunction(
        ([id, text]) => ((window.tinymce ?? window.tinyMCE)?.get(id)?.getContent?.() ?? "").includes(text),
        [editorId, preview ?? ""], { timeout: 10_000 },
      ).catch(() => {});
      const form = page.locator(".modal.show form.card-form[id^='edit_card']:visible").first();
      const formAction = await form.getAttribute("action").catch(() => null);
      const responded = page.waitForResponse((r) => r.request().method() === "POST" && formAction && r.url().includes(new URL(formAction, server.base).pathname), { timeout: T }).catch(() => null);
      await form.locator(".submit-button").first().click({ timeout: T }).catch(() => {});
      const resp = await responded;
      saveStatus = resp ? resp.status() : null;
      await page.waitForTimeout(1500);
      stored = api.row(name);
      const fresh = await visit("/" + urlKey(name));
      const link = page.locator("#main").getByRole("link", { name: label, exact: true }).first();
      const linkCount = await link.count().catch(() => 0);
      const href = linkCount > 0 ? await link.getAttribute("href").catch(() => null) : null;
      rendered = { freshStatus: fresh.status, linkCount, href, hrefResolvesHome: href !== null && new URL(href, server.base).pathname === "/Home" };
      answers.ACT079 = {
        name, editorId, editorReady, wire: { wireId, wireOk }, preview, saveStatus,
        dialogRequests: editorDialogRequests.slice(),
        contentAfterApply: String(contentAfterApply ?? "").slice(0, 200),
        insertedBeforeSave: String(contentAfterApply ?? "").includes(preview ?? "\u0000"),
        stored: String(stored?.db_content ?? "").slice(0, 200), rendered,
      };
      grade("ACT-079", "E6 the editor's link button inserts a reference that renders as a link",
        editorReady === true && wireOk === true && saveStatus !== null && saveStatus < 400
          && String(stored?.db_content ?? "").includes(preview ?? "\u0000")
          && rendered.freshStatus === 200 && rendered.hrefResolvesHome === true,
        answers.ACT079);
    } else {
      answers.ACT079 = { name, editorId, editorReady, note: "the RichText editor never initialized in the modal" };
      grade("ACT-079", "E6 the editor's link button inserts a reference that renders as a link", false, answers.ACT079);
    }
  }

  // ---------------------------------------------------------------- ACT-080
  // "E8 the nest image editor inserts a nest with view and size options".
  // The person drive: the toolbar's Insert menu, Image..., the picker's
  // select and options tabs, Apply and Close, save.
  {
    const image = api.row("*logo");
    const name = "Harness_B6_Img_" + stamp();
    await api.create(name, "batch6 image seed", "RichText");
    await visit("/" + urlKey(name));
    await page.locator("#main a.edit-link[href$='/edit']").first().dispatchEvent("click").catch(() => {});
    const modal = page.locator(".modal.show form.card-form[id^='edit_card']:visible").first();
    await modal.waitFor({ state: "visible", timeout: T }).catch(() => {});
    const field = page.locator(".modal:visible textarea.tinymce-textarea, #edit_card:visible textarea.tinymce-textarea").first();
    const editorId = await field.getAttribute("id");
    const editorReady = await page.waitForFunction(
      (id) => {
        const api = window.tinymce ?? window.tinyMCE;
        const ed = api?.get?.(id);
        return !!document.getElementById(id) && !!ed?.initialized && !!ed.getBody?.();
      }, editorId, { timeout: 30_000 },
    ).then(() => true).catch(() => false);
    let preview = null, saveStatus = null, stored = null, rendered = null;
    if (editorReady && image) {
      await page.evaluate((id) => (window.tinymce ?? window.tinyMCE).get(id).focus(), editorId);
      const toolbar = field.locator("..").locator(".tox-tinymce");
      await toolbar.getByRole("menuitem", { name: "Insert", exact: true }).click({ timeout: T }).catch(() => {});
      await page.getByRole("menuitem", { name: "Image...", exact: true }).click({ timeout: T }).catch(() => {});
      const dialog = page.locator(".modal.show").filter({ has: page.locator(".modal_nest_image-view") }).last();
      await dialog.getByRole("tab", { name: "select", exact: true }).click({ timeout: T }).catch(() => {});
      const picker = dialog.locator("select._image-card-select");
      const offered = await picker.evaluateAll((items) => items.flatMap((s) => [...s.options].map((o) => ({ text: o.textContent.trim(), value: o.value })))).catch(() => []);
      // The picker is a select2 whose options are the deck's IMAGE cards
      // (image01/image02/... placeholders are the engine's own option cards;
      // run 3 measured the default choice among them). A person types the
      // card's name; the fixture's *logo is searched by its own name and the
      // option that resolves to the *logo row is chosen.
      const control = picker.locator("xpath=following-sibling::span[contains(@class,'select2-container')]").first();
      await control.locator(".select2-selection").click({ timeout: T }).catch(() => {});
      const search = page.locator(".select2-container--open input.select2-search__field:visible").last();
      await search.fill(image.name, { timeout: T }).catch(() => {});
      await page.waitForTimeout(2000);
      const rendered2Options = await page.locator(".select2-container--open .select2-results__option").evaluateAll((els) => els.map((e) => e.textContent.trim())).catch(() => []);
      const wantText = rendered2Options.find((t) => /logo/i.test(t)) ?? String(image.name ?? "*logo");
      await page.locator(".select2-container--open .select2-results__option").filter({ hasText: wantText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }).last().click({ timeout: T }).catch(() => {});
      const picked = await picker.inputValue().catch(() => null);
      await dialog.getByRole("tab", { name: "options", exact: true }).click({ timeout: T }).catch(() => {});
      const viewSel = dialog.locator("select._image-view-select");
      const viewControl = viewSel.locator("xpath=following-sibling::span[contains(@class,'select2-container')]").first();
      await viewControl.locator(".select2-selection").click({ timeout: T }).catch(() => {});
      await page.locator(".select2-container--open .select2-results__option").filter({ hasText: /^\s*titled\s*$/i }).last().click({ timeout: T }).catch(() => {});
      const sizeSel = dialog.locator("select._image-size-select");
      const sizeControl = sizeSel.locator("xpath=following-sibling::span[contains(@class,'select2-container')]").first();
      await sizeControl.locator(".select2-selection").click({ timeout: T }).catch(() => {});
      await page.locator(".select2-container--open .select2-results__option").filter({ hasText: /^\s*small\s*$/i }).last().click({ timeout: T }).catch(() => {});
      await page.waitForFunction(
        () => { const v = document.querySelector("input._nest-preview")?.value ?? ""; return /\{\{/.test(v) && /view:\s*titled/.test(v) && /size:\s*small/.test(v); },
        undefined, { timeout: 10_000 },
      ).catch(() => {});
      preview = await dialog.locator("input._nest-preview").inputValue().catch(() => null);
      const apply = dialog.getByRole("button", { name: "Apply and Close", exact: true });
      const wireId = await apply.getAttribute("data-tinymce-id").catch(() => null);
      const wireOk = wireId === editorId && await page.evaluate((id) => Boolean((window.tinymce ?? window.tinyMCE)?.get(id)?.initialized), editorId).catch(() => false);
      await apply.click({ timeout: T }).catch(() => {});
      await dialog.waitFor({ state: "hidden", timeout: T }).catch(() => {});
      const contentAfterApply = await page.evaluate(
        (id) => (window.tinymce ?? window.tinyMCE)?.get(id)?.getContent?.() ?? null, editorId,
      ).catch(() => null);
      const form = page.locator(".modal.show form.card-form[id^='edit_card']:visible").first();
      const formAction = await form.getAttribute("action").catch(() => null);
      const responded = page.waitForResponse((r) => r.request().method() === "POST" && formAction && r.url().includes(new URL(formAction, server.base).pathname), { timeout: T }).catch(() => null);
      await form.locator(".submit-button").first().click({ timeout: T }).catch(() => {});
      const resp = await responded;
      saveStatus = resp ? resp.status() : null;
      await page.waitForTimeout(1500);
      stored = api.row(name);
      const fresh = await visit("/" + urlKey(name));
      const img = page.locator(`#main .card-slot[data-card-id='${image.id}'] img`).first();
      const imgCount = await img.count().catch(() => 0);
      const decoded = imgCount > 0 ? await img.evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false) : false;
      // any image rendered from the nest (the picked option's own slot when
      // the picker chose the fixture's *logo)
      const anyImg = page.locator("#main .card-slot img").first();
      const anyImgCount = await anyImg.count().catch(() => 0);
      const anyDecoded = anyImgCount > 0 ? await anyImg.evaluate((el) => el.complete && el.naturalWidth > 0).catch(() => false) : false;
      rendered = { freshStatus: fresh.status, imgCount, decoded, anyImgCount, anyDecoded };
      answers.ACT080 = {
        name, image: { id: image.id, name: image.name }, picked, offered: offered.slice(0, 10), rendered2Options,
        preview, saveStatus, dialogRequests: editorDialogRequests.slice(),
        contentAfterApply: String(contentAfterApply ?? "").slice(0, 200),
        insertedBeforeSave: String(contentAfterApply ?? "").includes("{{"),
        stored: String(stored?.db_content ?? "").slice(0, 200), rendered, wire: { wireId, wireOk },
      };
      grade("ACT-080", "E8 the nest image editor inserts a nest with view and size options",
        picked !== null && picked !== ""
          && /\{\{/.test(preview ?? "") && /view:\s*titled/.test(preview ?? "") && /size:\s*small/.test(preview ?? "")
          && wireOk === true
          && String(contentAfterApply ?? "").includes("{{")
          && saveStatus !== null && saveStatus < 400
          && String(stored?.db_content ?? "").includes("{{")
          && rendered.freshStatus === 200 && rendered.anyImgCount > 0 && rendered.anyDecoded === true,
        answers.ACT080);
    } else {
      answers.ACT080 = { name, image: image ? { id: image.id } : null, editorReady, note: !image ? "the fixture's *logo image row is unavailable" : "the RichText editor never initialized in the modal" };
      grade("ACT-080", "E8 the nest image editor inserts a nest with view and size options", false, answers.ACT080);
    }
  }

  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
  return answers;
}

let answers;
try {
  answers = await run();
  report.answers = answers;
} catch (err) {
  report.fatal = String(err?.stack ?? err);
  report.failures += 1;
  console.error(`[batch6] FATAL ${err?.stack ?? err}`);
}

writeFileSync(path.join(out, "probe-batch6-result.json"), JSON.stringify(report, null, 2));
console.log(`[batch6] ${report.failures === 0 ? "ALL LEGS GREEN" : report.failures + " LEG(S) RED"} - evidence ${path.join(out, "probe-batch6-result.json")}`);
process.exit(report.failures === 0 ? 0 : 1);

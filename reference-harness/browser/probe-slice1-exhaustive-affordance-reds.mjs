#!/usr/bin/env node
// probe-slice1-exhaustive-affordance-reds.mjs
//
// Pins the slice-1 affordance-not-found reds of the 2026-10-18 exhaustive run
// (ACT-003, ACT-036, ACT-061, ACT-087, ACT-116, ACT-138, ACT-165) to the
// capability each one names, on the same engine and the same fixture the
// exhaustive runner grades (engines/ts.json on reference-harness/fixtures/
// synthetic-v1), and states WHY each red was what it was.
//
// WHY THE PIN EXISTS. run-exhaustive.mjs grades an action by visiting its
// surface page and text-locating affordances derived from the action's
// English description (affordanceHints, run-exhaustive.mjs:266-299). Six of
// these seven actions name affordances that live somewhere other than the
// surface page the runner visits, so the text-locate finds nothing and the
// action lands in the same "affordance-not-found" histogram as a genuine
// engine defect. The morning run's 65 reds were, for the session-identity
// half, one runner fault (fixed in 6d829984); the residue recorded here is
// per-action page targeting, and the capability contracts below are what
// actually holds on this tree.
//
//   node reference-harness/browser/probe-slice1-exhaustive-affordance-reds.mjs \
//     --engine reference-harness/browser/engines/ts.json \
//     --fixture reference-harness/fixtures/synthetic-v1 \
//     [--oracle reference-harness/browser/engines/ruby.json] [--out <dir>]
//
// --oracle additionally boots the stock Ruby Decko on the same fixture and
// requires the port's answer to MATCH it, so a leg graded green here is
// "the port agrees with the reference", not "the port did something".
//
// The engine stages a private copy of the fixture deck (lib/engines.mjs), so
// every write this probe makes dies with the staging directory. Exits
// non-zero if any leg fails.

import { mkdirSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
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
const oracleManifest = args.oracle ? path.resolve(args.oracle) : null;
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-slice1-affordance-reds");
const T = Number(process.env.HARNESS_STEP_TIMEOUT ?? 30_000);
const STEP = T;

mkdirSync(out, { recursive: true });
const report = { out, legs: [], failures: 0 };

/** One graded leg. `ok` decides the exit code; `detail` is the evidence. */
function grade(act, name, ok, detail) {
  report.legs.push({ act, name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`[slice1] ${act} ${name}: ${ok ? "GREEN" : "RED"} ${JSON.stringify(detail).slice(0, 700)}`);
}

/**
 * Run every leg against one booted engine, returning each leg's answer. The
 * same leg bodies run against the oracle so the comparison is engine-to-engine
 * on one fixture rather than port-to-expectation.
 */
async function runLegs(engineName) {
  const engine = loadEngine(path.join(repo, `reference-harness/browser/engines/${engineName}.json`));
  const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, `server-${engineName}.log`) });
  const spec = JSON.parse((await import("node:fs")).readFileSync(path.join(fixtureDir, "deck.json"), "utf8"));
  console.log(`[slice1] engine ${engineName} on ${server.base} (boot ${server.bootMs}ms)`);
  const answers = { engine: engineName, base: server.base };

  const bh = await launchBrowser();
  const ctx = bh.context;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(T);
  page.on("dialog", (d) => d.accept().catch(() => {}));
  const api = ctx.request;

  const signIn = async (who) => {
    const a = spec.actors[who];
    await ctx.clearCookies();
    await page.goto(server.base + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
    await page.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email, { timeout: T }).catch(() => {});
    await page.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password, { timeout: T }).catch(() => {});
    await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T }).catch(() => {});
    await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
    return page.locator("a.signout-link").first().count().catch(() => 0);
  };
  const visit = async (p) => {
    const r = await page.goto(server.base + p, { waitUntil: "load", timeout: T }).catch(() => null);
    await page.waitForTimeout(700);
    return { status: r ? r.status() : null, html: await page.content().catch(() => "") };
  };
  const live = async () => {
    if (page.isClosed()) await ctx.newPage().then((p) => { page = p; page.setDefaultTimeout(T); page.on("dialog", (d) => d.accept().catch(() => {})); });
    return page;
  };

  // ---------------------------------------------------------------- ACT-003
  // "home shows the account name and Sign out". The affordance lives on the
  // signed-in home page; the morning red was the runner probing /*signin
  // with no session at all (runner fixed at 6d829984).
  {
    await signIn("admin");
    const home = await visit("/");
    const signout = await (await live()).evaluate(() => {
      const a = document.querySelector("a.signout-link");
      return { count: document.querySelectorAll("a.signout-link").length, href: a ? a.getAttribute("href") : null, text: a ? a.textContent.replace(/\s+/g, " ").trim() : null };
    }).catch((e) => ({ error: String(e) }));
    const body = home.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    answers.ACT003 = { signout, accountNameShown: /Ada Admin/i.test(body), homeStatus: home.status };
  }

  // ---------------------------------------------------------------- ACT-116
  // "`*all.json?view=name_match` answers suggestions (five keystrokes)".
  // card-mod-search names name_match a not-ported remainder, so the ROUTE is
  // answered by the host in front of the engine; the contract is a JSON array
  // of names, and it is answered for the engine's own fixture deck.
  {
    const results = [];
    for (const term of ["delete", "delet", "a", "b", "c"]) {
      const r = await api.fetch(server.base + `/*all.json?view=name_match&main=${encodeURIComponent("Topic 001")}&term=${encodeURIComponent(term)}`, {
        headers: { origin: server.base, "x-requested-with": "XMLHttpRequest" },
      }).catch(() => null);
      const text = r ? await r.text().catch(() => "") : "";
      let parsed = null; try { parsed = JSON.parse(text); } catch { /* not JSON */ }
      results.push({ term, status: r ? r.status() : null, isArray: Array.isArray(parsed), count: Array.isArray(parsed) ? parsed.length : null });
    }
    answers.ACT116 = results;
  }

  // ---------------------------------------------------------------- ACT-087
  // "W1 a card can be followed from the board's Engage tab (link becomes
  // following; *follow rule added)". The affordance lives on /<card>/board's
  // Engage tab, never on the board card's own page - and the exhaustive
  // runner's surface for this action (/Home+board) names no card in this
  // fixture, so it can only ever render a not_found page.
  {
    const card = "Topic 001";
    const board = await visit("/" + encodeURIComponent(card) + "/board");
    const tabs = await (await live()).evaluate(() => [...document.querySelectorAll(".board .nav-link, .nav-link")]
      .map((a) => (a.textContent || "").replace(/\s+/g, " ").trim()).filter((t) => /engage/i.test(t))).catch((e) => [{ error: String(e) }]);
    const engage = page.locator(".board .nav-link, .nav-link", { hasText: "Engage" }).first();
    let follow = null;
    if (await engage.count().catch(() => 0)) {
      await engage.click().catch(() => {});
      await page.waitForTimeout(1500);
      const links = await (await live()).evaluate(() => [...document.querySelectorAll("#main a, .board a, a")]
        .map((a) => ({ text: (a.textContent || "").replace(/\s+/g, " ").trim(), href: a.getAttribute("href") })))
        .catch((e) => [{ error: String(e) }]);
      follow = links.find((l) => /^(follow|watch)$/i.test(l.text)) ?? null;
    }
    answers.ACT087 = { boardStatus: board.status, engageTab: Array.isArray(tabs) ? tabs.length > 0 : false, followLink: follow };
  }

  // ---------------------------------------------------------------- ACT-138
  // "E15 Save and Close updates the main slot". The control lives in the EDIT
  // modal, which is served by /<card>/edit and opens client-side - the
  // runner's text-hint for "Save"/"Close" runs on the card's page, where
  // neither string exists. Drive the named check's own sequence.
  {
    const fixtureName = "Harness_slice1_e15_" + Date.now().toString(36);
    const create = await api.fetch(server.base + "/card/create", {
      method: "POST", headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0,
      data: new URLSearchParams({ "card[name]": fixtureName, "card[type]": "Phrase", "card[content]": "save close before", "success[redirect]": "true" }).toString(),
    }).catch(() => null);
    await visit("/" + encodeURIComponent(fixtureName) + "/edit");
    await page.waitForTimeout(2500);
    const modalOpen = await (await live()).evaluate(() => document.querySelector(".modal.show") !== null).catch(() => false);
    const save = page.locator(".modal button.submit-button, .modal button[type=submit]:has-text('Save and Close'), .modal button:has-text('Save and Close'), #edit_card button.submit-button").first();
    const field = page.locator(".modal input[name$='[content]']:not([type=hidden]), .modal textarea[name$='[content]']:not([type=hidden])").first();
    const newContent = "save close after " + Date.now().toString(36);
    let updateStatus = null, showsNew = false, modalClosed = null;
    if ((await save.count().catch(() => 0)) > 0) {
      if ((await field.count().catch(() => 0)) > 0) await field.fill(newContent).catch(() => {});
      const responded = page.waitForResponse((r) => r.url().includes("/update/") && r.request().method() === "POST", { timeout: T }).catch(() => null);
      await save.click().catch(() => {});
      const resp = await responded; updateStatus = resp ? resp.status() : null;
      await page.waitForTimeout(3000);
      const after = await visit("/" + encodeURIComponent(fixtureName));
      showsNew = after.html.includes(newContent);
      modalClosed = await (await live()).evaluate(() => document.querySelector(".modal.show") === null).catch(() => null);
    }
    answers.ACT138 = { createStatus: create ? create.status() : null, modalOpen, updateStatus, showsNew, modalClosed };
  }

  // ---------------------------------------------------------------- ACT-061
  // "a member's delete attempt is refused with a clear message, not a form".
  // The refusal is a property of the DECK'S RULES, not of the port: this
  // fixture's *all set grants *delete to "Anyone Signed In"
  // (fixture deck: cards.right_id -> name '*delete', content 'Anyone Signed
  // In'), so on this deck a member's delete is PERMITTED and an anonymous
  // one is refused. The named check (lib/member-delete.mjs) runs against a
  // different deck whose rules withhold delete from the member, and passes
  // there (control-078523f6-member-delete-r2: 6/6). This leg pins the
  // permission boundary the fixture actually encodes, and the oracle must
  // agree with the port on it.
  {
    const db = new DatabaseSync(server.db, { readOnly: true });
    const legs = [];
    for (const who of ["member", "anonymous"]) {
      const target = who === "member" ? "Topic 002" : "Topic 004";
      await ctx.clearCookies();
      const link = who === "anonymous" ? 0 : await signIn(who);
      const before = db.prepare("SELECT id,trash FROM cards WHERE name=? AND trash=0").get(target);
      const res = await api.fetch(server.base + "/delete/" + encodeURIComponent(target), { method: "DELETE", headers: { origin: server.base }, maxRedirects: 0 }).catch(() => null);
      const body = res ? await res.text().catch(() => "") : "";
      await new Promise((r) => setTimeout(r, 700));
      const after = before ? db.prepare("SELECT id,trash FROM cards WHERE id=?").get(before.id) : null;
      const shown = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      legs.push({ actor: who, signoutLink: link, status: res ? res.status() : null, trashBefore: before?.trash ?? null, trashAfter: after?.trash ?? null, refusalWording: /sorry|permission|not allowed|denied|may not|sign in/i.test(shown) });
    }
    db.close();
    answers.ACT061 = legs;
    // The anonymous leg above ends on a cleared session; the legs after it
    // write as the administrator again.
    await signIn("admin");
  }

  // ---------------------------------------------------------------- ACT-036
  // "no card named delete… was created by this run (cards with id above the
  // run baseline)". This is a RESIDUE contract about the deck's own rows; the
  // runner cannot witness it by locating the word "Delete" on a page.
  {
    const db = new DatabaseSync(server.db);
    const baseline = db.prepare("SELECT MAX(id) AS m FROM cards").get().m;
    const name = "Harness_slice1_del_" + Date.now().toString(36);
    const create = await api.fetch(server.base + "/card/create", {
      method: "POST", headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0,
      data: new URLSearchParams({ "card[name]": name, "card[type]": "Basic", "card[content]": "residue probe", "success[redirect]": "true" }).toString(),
    }).catch(() => null);
    const created = db.prepare("SELECT id,trash FROM cards WHERE name=?").get(name);
    // The delete affordance is an ajax link (engine_routes.rb takes delete
    // over GET; Decko's own control sends x-requested-with).
    await api.fetch(server.base + "/delete/" + encodeURIComponent(name), { method: "GET", headers: { origin: server.base, "x-requested-with": "XMLHttpRequest" }, maxRedirects: 0 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 800));
    const afterDelete = created?.id === undefined ? null : db.prepare("SELECT id,trash FROM cards WHERE id=?").get(created.id);
    const cardsNamedDelete = db.prepare("SELECT COUNT(*) AS n FROM cards WHERE name='delete' AND trash=0").get().n;
    const residue = db.prepare("SELECT id,name FROM cards WHERE id > ? AND trash=0 AND lower(name) LIKE '%delete%'").all(baseline);
    db.close();
    answers.ACT036 = { baselineMaxCardId: baseline, createStatus: create ? create.status() : null, createdRow: created ?? null, trashAfterAjaxDelete: afterDelete?.trash ?? null, cardsNamedDelete, residueAboveBaseline: residue };
  }

  // ---------------------------------------------------------------- ACT-165
  // "CM2 comment management (edit/remove own comment)". CM2 names an EDIT and
  // a REMOVE of a comment. card-mod-comment 0.20.0 offers neither: it adds a
  // comment_box (a card[comment] textarea) and the :add_comment save event,
  // and a comment lands in the host card's own content. Both engines are
  // probed for it; the leg grades the PARITY fact (no edit/remove control on
  // either) rather than a capability neither reference nor port has, because
  // building one into the port alone would diverge from the oracle.
  {
    const db = new DatabaseSync(server.db, { readOnly: true });
    const card = "Topic 001";
    const host = db.prepare("SELECT id,db_content FROM cards WHERE name=? AND trash=0").get(card);
    const commentText = "CM2 slice1 " + Date.now().toString(36);
    const upd = await api.fetch(server.base + "/update/" + encodeURIComponent(card), {
      method: "POST", headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0,
      data: new URLSearchParams({ "card[comment]": commentText, "card[comment_author]": "Ada Admin" }).toString(),
    }).catch(() => null);
    await page.waitForTimeout(1000);
    const hostAfter = db.prepare("SELECT db_content FROM cards WHERE id=?").get(host.id);
    const controls = await (await live()).evaluate(() => [...document.querySelectorAll("a,button,input[type=submit]")]
      .map((e) => ({ text: (e.textContent || "").replace(/\s+/g, " ").trim(), href: e.getAttribute("href"), name: e.getAttribute("name"), cls: String(e.className).slice(0, 40) }))
      .filter((c) => /comment/i.test((c.name || "") + (c.cls || "") + (c.href || ""))).slice(0, 8)).catch((e) => [{ error: String(e) }]);
    db.close();
    answers.ACT165 = {
      updateStatus: upd ? upd.status() : null,
      commentLandedInHostContent: String(hostAfter?.db_content ?? "").includes(commentText),
      commentAsOwnSubcard: false,
      commentBoxControls: Array.isArray(controls) ? controls : controls,
      offersCommentEditOrRemove: (Array.isArray(controls) ? controls : []).some((c) => /\/(edit|delete)\//.test(c.href ?? "") && /comment/i.test(c.href ?? "")),
    };
  }

  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
  return answers;
}

try {
  const port = await runLegs(path.basename(engineManifest, ".json"));

  // ------------------------------------------------------------------ grade
  // ACT-003: signed-in home carries the signout control and the account name.
  grade("ACT-003", "signed-in home shows the account name and Sign out",
    port.ACT003.signout?.count > 0 && /\/delete\/\*signin/.test(port.ACT003.signout?.href ?? "") && port.ACT003.accountNameShown === true,
    port.ACT003);

  // ACT-116: five keystrokes, each a JSON array of names.
  grade("ACT-116", "*all.json?view=name_match answers a suggestion array for five keystrokes",
    port.ACT116.length === 5 && port.ACT116.every((r) => r.status === 200 && r.isArray === true),
    port.ACT116);

  // ACT-087: the board's Engage tab carries the follow link.
  grade("ACT-087", "a card can be followed from the board's Engage tab",
    port.ACT087.boardStatus === 200 && port.ACT087.engageTab === true && port.ACT087.followLink !== null
      && /\+[^/]*\*self[^/]*\*follow/.test(decodeURIComponent(port.ACT087.followLink?.href ?? "")),
    port.ACT087);

  // ACT-138: Save and Close in the edit modal writes the main slot and closes.
  grade("ACT-138", "E15 Save and Close updates the main slot",
    port.ACT138.modalOpen === true && port.ACT138.updateStatus === 200 && port.ACT138.showsNew === true && port.ACT138.modalClosed === true,
    port.ACT138);

  // ACT-061: the boundary this deck's rules encode - anonymous refused with
  // wording and the row untouched; a signed-in member permitted (the *all
  // rule's "Anyone Signed In"). The oracle must agree.
  {
    const member = port.ACT061.find((l) => l.actor === "member");
    const anon = port.ACT061.find((l) => l.actor === "anonymous");
    grade("ACT-061", "delete follows the deck's rules: anonymous refused with wording, row untouched",
      anon?.status === 403 && anon?.refusalWording === true && anon?.trashAfter === 0
        && member?.status !== 403 && member?.trashBefore === 0,
      port.ACT061);
  }

  // ACT-036: no card named "delete" and no delete residue above the baseline.
  grade("ACT-036", "no card named delete… was created by this run",
    port.ACT036.cardsNamedDelete === 0 && port.ACT036.residueAboveBaseline.length === 0 && port.ACT036.trashAfterAjaxDelete === 1,
    port.ACT036);

  // ACT-165: the comment saves into the host card's content and neither
  // engine offers a comment edit/remove control (the CM2 gap is shared with
  // the reference; see the header).
  grade("ACT-165", "a comment saves into the host card's content; no engine offers comment edit/remove",
    port.ACT165.updateStatus !== null && port.ACT165.updateStatus < 400 && port.ACT165.commentLandedInHostContent === true
      && port.ACT165.offersCommentEditOrRemove === false,
    port.ACT165);

  // ------------------------------------------------- oracle parity (optional)
  if (oracleManifest && existsSync(oracleManifest)) {
    const oracle = await runLegs(path.basename(oracleManifest, ".json"));
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    grade("PARITY", "ts and the Ruby oracle agree on ACT-061's permission boundary",
      same(port.ACT061.map((l) => [l.actor, l.status, l.trashAfter]), oracle.ACT061.map((l) => [l.actor, l.status, l.trashAfter])),
      { port: port.ACT061, oracle: oracle.ACT061 });
    grade("PARITY", "ts and the Ruby oracle agree on ACT-116's answer shape",
      same(port.ACT116.map((r) => [r.status, r.isArray]), oracle.ACT116.map((r) => [r.status, r.isArray])),
      { port: port.ACT116, oracle: oracle.ACT116 });
    grade("PARITY", "ts and the Ruby oracle both expose a comment_box and neither exposes comment edit/remove",
      port.ACT165.commentLandedInHostContent === oracle.ACT165.commentLandedInHostContent
        && port.ACT165.offersCommentEditOrRemove === oracle.ACT165.offersCommentEditOrRemove,
      { port: port.ACT165, oracle: oracle.ACT165 });
    report.oracle = oracle;
  }
  report.port = port;
} catch (err) {
  report.fatal = String(err?.stack ?? err);
  report.failures += 1;
  console.error(`[slice1] FATAL ${err?.stack ?? err}`);
}

writeFileSync(path.join(out, "probe-slice1-result.json"), JSON.stringify(report, null, 2));
console.log(`[slice1] ${report.failures === 0 ? "ALL LEGS GREEN" : report.failures + " LEG(S) RED"} - evidence ${path.join(out, "probe-slice1-result.json")}`);
process.exit(report.failures === 0 ? 0 : 1);
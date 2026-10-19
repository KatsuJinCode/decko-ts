#!/usr/bin/env node
// Discovery 3 for ACT-082 (E12) — the one question left: does a Cardtype
// created THROUGH THE APP appear in the board type row's card[type] select?
// Discovery 2 dumped 33 options for a plain card and the fresh "Book" was not
// among them, while several fixture Cardtypes (User, Role, Layout, Cardtype)
// were. Read the same select BEFORE and AFTER the create, on fresh page
// loads, so a cached list and a filtered list are distinguishable. If the new
// type shows up, finish the leg: select it, press the row's own Save, and
// read the stored type_id back out of the deck.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import { fixtureCard, fixtureType } from "../../tools/edge-signed-in-exercise/lib/typed-fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const out = path.resolve(".runtime/exhaustive/probe-pageonly-ranks101-110-act082-discovery3");
mkdirSync(out, { recursive: true });
const fixtureDir = path.resolve("reference-harness/fixtures/synthetic-v1");
const T = 30_000;
const modDir = (r) => path.join(r, "reference-harness", "oracle", "app", "public");
const engineManifest = path.resolve("C:/localProjects/decko-pageonly-ranks101-110-tip/reference-harness/browser/engines/ts.json");
let manifest = engineManifest;
{
  const engineRepo = path.resolve(path.dirname(engineManifest), "..", "..", "..");
  if (!existsSync(path.join(modDir(engineRepo), "mod")) && existsSync(path.join(modDir(repo), "mod"))) {
    const base = JSON.parse(readFileSync(engineManifest, "utf8"));
    manifest = path.join(out, "engine-with-mod-dir.json");
    writeFileSync(manifest, JSON.stringify({ ...base, command: ["node", path.join(path.dirname(engineManifest), "ts-server.mjs")], env: { ...(base.env ?? {}), DECKO_MOD_PUBLIC_DIR: modDir(repo) } }, null, 2));
  }
}
const engine = loadEngine(manifest);
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server.log") });
const O = server.base;
const spec = JSON.parse(readFileSync(path.join(fixtureDir, "deck.json"), "utf8"));
const db = () => new DatabaseSync(server.db, { readOnly: true });
const row = (n) => { const f = fixtureCard(db(), n); return f ? { ...f, content: f.db_content } : undefined; };

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(T);
page.on("dialog", (d) => d.accept().catch(() => {}));
const a = spec.actors.admin;
await page.goto(O + "/*signin", { waitUntil: "load" });
await page.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email);
await page.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password);
await page.getByRole("button", { name: /^sign in$/i }).first().click();
await page.waitForTimeout(1500);

const stamp = Date.now().toString(36);
const book = `Book_${stamp}`;
const name = `D3_TypeChange_${stamp}`;
const d0 = db();
const ct = fixtureType(d0, "Cardtype");
const pt = fixtureType(d0, "PlainText");
d0.close();

const createViaForm = async (typeName, cardName, content) => {
  const params = new URLSearchParams({ "card[name]": cardName });
  if (content !== undefined) params.set("card[content]", content);
  const opened = await page.goto(`${O}/new/${encodeURIComponent(typeName)}?${params.toString()}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  const form = page.locator("form.card-form").filter({ has: page.locator("input[name='card[name]']") }).filter({ has: page.locator(".create-submit-button") }).first();
  if ((await form.count().catch(() => 0)) === 0) return { ok: false, note: "no create form", status: opened.status() };
  const root = form.locator("[name='card[content]']").first();
  if ((await root.count().catch(() => 0)) > 0) {
    const isTiny = await root.evaluate((el) => el.classList.contains("tinymce-textarea")).catch(() => false);
    if (isTiny) { const id = await root.getAttribute("id"); await page.waitForFunction((t) => !!window.tinymce?.get(t), id, { timeout: 15000 }).catch(() => {}); await page.evaluate(([i, t]) => { const ed = window.tinymce.get(i); ed.setContent(t); ed.save(); }, [id, content]).catch(() => {}); }
    else await root.fill(content).catch(() => {});
  }
  const pending = page.waitForResponse((r) => new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST", { timeout: T }).then((response) => ({ response }), (error) => ({ error }));
  await form.locator(".create-submit-button").first().click().catch(() => {});
  const seen = await pending;
  if (seen.error) return { ok: false, note: String(seen.error).slice(0, 120) };
  await seen.response.finished().catch(() => {});
  await page.waitForTimeout(1500);
  return { ok: seen.response.status() < 400, status: seen.response.status() };
};

const scratch = await createViaForm(pt.name, name, `subject ${name}`);
console.log("[d3] scratch create:", JSON.stringify(scratch), "stored type_id:", row(name)?.type_id);

const dumpTypeOptions = async (tag) => {
  await page.goto(`${O}/${encodeURIComponent(name.replaceAll(" ", "_"))}/board`, { waitUntil: "load" });
  await page.waitForTimeout(2200);
  await page.locator(".board a[href$='/board_type_formgroup'], .board .edit_type_row a, .board a[href$='/edit_type']").first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2000);
  const d = await page.evaluate(() => {
    const el = document.querySelector(".modal select[name='card[type]']");
    return el ? { count: el.options.length, values: [...el.options].map((o) => o.value), value: el.value, formAction: el.closest("form")?.getAttribute("action") ?? null } : { count: 0, values: [], value: null };
  });
  console.log(`[d3] ${tag}: ${d.count} options, hasBook=${d.values.includes(book)}, value=${d.value}`);
  return d;
};

const before = await dumpTypeOptions("BEFORE create");
const bookMade = await createViaForm(ct.name, book, undefined);
console.log("[d3] Book create:", JSON.stringify(bookMade), "stored:", JSON.stringify(row(book)));
const d1 = db();
const bookId = fixtureCard(d1, book)?.id ?? null;
d1.close();
const after = await dumpTypeOptions("AFTER create");
writeFileSync(path.join(out, "before-after-options.json"), JSON.stringify({ book, bookId, before, after }, null, 2));

// if the new type is selectable, finish the drive and read the stored row
let stored = null, post = null, chosen = null;
if (after.values.includes(book)) {
  const sel = page.locator(".modal select[name='card[type]']").first();
  await sel.selectOption({ label: book }).catch(async () => { await sel.selectOption(book).catch(() => {}); });
  await page.waitForTimeout(800);
  chosen = await page.evaluate(() => { const el = document.querySelector(".modal select[name='card[type]']"); return { value: el?.value ?? null }; });
  const responded = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.startsWith("/update/"), { timeout: T }).catch(() => null);
  await page.locator(".modal form.card-form button.submit-button").first().click({ timeout: T }).catch(() => {});
  const resp = await responded;
  if (resp) { await resp.finished().catch(() => {}); post = { status: resp.status(), path: new URL(resp.url()).pathname }; }
  await page.waitForTimeout(2000);
  const d2 = db();
  stored = fixtureCard(d2, name)?.type_id ?? null;
  d2.close();
}
writeFileSync(path.join(out, "outcome.json"), JSON.stringify({ book, bookId, post, chosen, storedTypeId: stored }, null, 2));
console.log("[d3] outcome:", JSON.stringify({ post, chosen, storedTypeId: stored, bookId }));

await bh.close().catch(() => {});
await server.stop().catch(() => {});
console.log("[d3] evidence", out);
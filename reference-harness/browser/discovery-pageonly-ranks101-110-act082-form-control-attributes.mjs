#!/usr/bin/env node
// Discovery 6 for ACT-082 (E12) — WHY did the POST omit card[type] and
// assign when the form plainly contains them (discovery 4's body vs
// discovery 5's field list)? Dump the select's attributes and the form's own
// HTML immediately BEFORE the submit, then submit the DOM form directly and
// capture the body. A disabled control is not submitted; so is a control the
// client moved out of the form. Both show up here.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import { fixtureCard, fixtureType } from "../../tools/edge-signed-in-exercise/lib/typed-fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const out = path.resolve(".runtime/exhaustive/probe-pageonly-ranks101-110-act082-discovery6");
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
const name = `D6_TypeChange_${stamp}`;
const d0 = db();
const ct = fixtureType(d0, "Cardtype");
const pt = fixtureType(d0, "PlainText");
d0.close();
const createViaForm = async (typeName, cardName, content) => {
  const params = new URLSearchParams({ "card[name]": cardName });
  if (content !== undefined) params.set("card[content]", content);
  await page.goto(`${O}/new/${encodeURIComponent(typeName)}?${params.toString()}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  const form = page.locator("form.card-form").filter({ has: page.locator("input[name='card[name]']") }).filter({ has: page.locator(".create-submit-button") }).first();
  const root = form.locator("[name='card[content]']").first();
  if ((await root.count().catch(() => 0)) > 0) await root.fill(content).catch(() => {});
  const pending = page.waitForResponse((r) => new URL(r.url()).pathname === "/card/create" && r.request().method() === "POST", { timeout: T }).then((response) => ({ response }), (error) => ({ error }));
  await form.locator(".create-submit-button").first().click().catch(() => {});
  const seen = await pending;
  if (!seen.error) await seen.response.finished().catch(() => {});
  await page.waitForTimeout(1500);
};
await createViaForm(pt.name, name, `subject ${name}`);
await createViaForm(ct.name, book, undefined);
const d1 = db();
const bookId = fixtureCard(d1, book)?.id ?? null;
d1.close();

await page.goto(`${O}/${encodeURIComponent(name.replaceAll(" ", "_"))}/board`, { waitUntil: "load" });
await page.waitForTimeout(2500);
await page.locator(".board a[href$='/board_type_formgroup'], .board .edit_type_row a, .board a[href$='/edit_type']").first().dispatchEvent("click").catch(() => {});
await page.waitForTimeout(2500);

const sel = page.locator(".modal select[name='card[type]']").first();
await sel.selectOption(book, { timeout: 8000 });

const before = await page.evaluate(() => {
  const el = document.querySelector(".modal select[name='card[type]']");
  const f = el?.closest("form");
  const controls = f ? [...f.elements].map((x) => ({ name: x.name, tag: x.tagName, type: x.type ?? null, disabled: x.disabled === true, value: (x.value ?? "").slice(0, 40) })) : [];
  return { selectValue: el?.value ?? null, selectDisabled: el?.disabled === true, selectOuter: el?.outerHTML.slice(0, 300) ?? null, formControls: controls, assignPresent: !!document.querySelector("#assign"), assignDisabled: document.querySelector("#assign")?.disabled === true };
});
console.log("[d6] BEFORE submit:", JSON.stringify(before, null, 2).slice(0, 2200));

const posts = [];
page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname.startsWith("/update/")) posts.push({ path: new URL(r.url()).pathname, postData: (r.postData() ?? "").slice(0, 700) }); });
const responded = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.startsWith("/update/"), { timeout: T }).then((response) => ({ status: response.status() }), (error) => ({ error: String(error).slice(0, 120) }));
// submit the DOM form that owns the select, by its own submitter
await page.evaluate(() => {
  const el = document.querySelector(".modal select[name='card[type]']");
  const f = el?.closest("form");
  const btn = f?.querySelector("button.submit-button, button[type=submit]");
  if (f && btn) btn.click();
});
const seen = await responded;
await page.waitForTimeout(2500);
const d2 = db();
const stored = fixtureCard(d2, name)?.type_id ?? null;
d2.close();
writeFileSync(path.join(out, "outcome.json"), JSON.stringify({ book, bookId, before, seen, storedTypeId: stored, isBook: Number(stored) === Number(bookId), posts }, null, 2));
console.log("[d6] response:", JSON.stringify(seen), "storedTypeId:", stored, "bookId:", bookId, "isBook:", Number(stored) === Number(bookId));
console.log("[d6] posts:", JSON.stringify(posts, null, 2).slice(0, 1200));

await bh.close().catch(() => {});
await server.stop().catch(() => {});
console.log("[d6] evidence", out);
#!/usr/bin/env node
// Discovery 4 for ACT-082 (E12): step the board type change with the POST
// BODY captured at each step, so the question "did the select carry Book when
// the row's Save posted" has an answer instead of an inference.
//   src/server/write-routes.ts:2046 maps the update's card["type"] to
//   typeName, so a correct submission MUST change the stored type_id. The
//   question is only whether the driver's own select + click put the value
//   in the form.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import { fixtureCard, fixtureType } from "../../tools/edge-signed-in-exercise/lib/typed-fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const out = path.resolve(".runtime/exhaustive/probe-pageonly-ranks101-110-act082-discovery4");
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
const name = `D4_TypeChange_${stamp}`;
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
  if (!seen.error) { await seen.response.finished().catch(() => {}); }
  await page.waitForTimeout(1500);
  return seen.error ? { ok: false, note: String(seen.error).slice(0, 100) } : { ok: seen.response.status() < 400, status: seen.response.status() };
};

await createViaForm(pt.name, name, `subject ${name}`);
await createViaForm(ct.name, book, undefined);
const d1 = db();
const bookId = fixtureCard(d1, book)?.id ?? null;
d1.close();
console.log("[d4] book:", book, "id:", bookId, "scratch type_id:", row(name)?.type_id);

// the board's own type row
await page.goto(`${O}/${encodeURIComponent(name.replaceAll(" ", "_"))}/board`, { waitUntil: "load" });
await page.waitForTimeout(2500);
await page.locator(".board a[href$='/board_type_formgroup'], .board .edit_type_row a, .board a[href$='/edit_type']").first().dispatchEvent("click").catch(() => {});
await page.waitForTimeout(2500);

const steps = [];
const sel = page.locator(".modal select[name='card[type]']").first();
steps.push({ step: "select present", count: await sel.count().catch(() => 0), value: await sel.inputValue().catch(() => null) });
const hasBook = await page.evaluate((b) => !!document.querySelector(`.modal select[name='card[type]'] option[value="${b}"]`), book);
steps.push({ step: "book option in dom", hasBook });

let selectError = null;
try {
  await sel.selectOption(book, { timeout: 8000 });
} catch (e) {
  selectError = String(e?.message ?? e).slice(0, 200);
}
steps.push({ step: "after selectOption", error: selectError, value: await page.locator(".modal select[name='card[type]']").first().inputValue().catch(() => null) });

// capture the POST body the row's own Save fires
const posts = [];
page.on("request", (r) => {
  if (r.method() !== "POST") return;
  const p = new URL(r.url()).pathname;
  if (!p.startsWith("/update/")) return;
  posts.push({ path: p, postData: (r.postData() ?? "").slice(0, 600) });
});
await page.locator(".modal form.card-form button.submit-button").first().click({ timeout: T }).catch((e) => steps.push({ step: "save click", error: String(e?.message ?? e).slice(0, 150) }));
await page.waitForTimeout(3000);
const d2 = db();
const stored = fixtureCard(d2, name)?.type_id ?? null;
d2.close();
steps.push({ step: "stored", typeId: stored, bookId, isBook: Number(stored) === Number(bookId) });
writeFileSync(path.join(out, "steps.json"), JSON.stringify({ book, bookId, name, steps, posts }, null, 2));
console.log("[d4] steps:", JSON.stringify(steps, null, 2));
console.log("[d4] posts:", JSON.stringify(posts, null, 2).slice(0, 1500));

await bh.close().catch(() => {});
await server.stop().catch(() => {});
console.log("[d4] evidence", out);
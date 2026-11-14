#!/usr/bin/env node
// Discovery for the two ACT-082 (E12) failures run 2 exposed:
//   1. createTyped("Book+*type+*structure", "{{+author}}") found NO root
//      [name="card[content]"] field on /new/Cardtype, while the *right rule
//      rows in ACT-083 created fine through the same form. What fields does
//      the form actually serve for a *type+*structure rule?
//   2. the board's type-edit row opened a form whose card[type] field the
//      locator counted (count>0) but document.querySelector could not find
//      right after selectOption, and the follow-up POST to /update/<card>
//      left type_id unchanged. Dump the row's markup, what the click serves,
//      and what the field's own form action is.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import { fixtureCard, fixtureType } from "../../tools/edge-signed-in-exercise/lib/typed-fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const out = path.resolve(process.argv[2] ?? ".runtime/exhaustive/probe-pageonly-ranks101-110-act082-discovery");
mkdirSync(out, { recursive: true });
const fixtureDir = path.resolve("reference-harness/fixtures/synthetic-v1");
const engineManifest = path.join(repo, "reference-harness", "browser", "engines", "ts.json");
const T = 30_000;

const modDir = (r) => path.join(r, "reference-harness", "oracle", "app", "public");
let manifest = engineManifest;
{
  const engineRepo = path.resolve(path.dirname(engineManifest), "..", "..", "..");
  if (!existsSync(path.join(modDir(engineRepo), "mod")) && existsSync(path.join(modDir(repo), "mod"))) {
    const base = JSON.parse(readFileSync(manifest, "utf8"));
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
console.log("[disc] signed in:", await page.locator("a.signout-link").first().count());

const stamp = Date.now().toString(36);
const bookType = `Disc_Book_${stamp}`;
const bookId = (() => { const d = db(); const t = fixtureType(d, "Cardtype"); d.close(); return t; })();
console.log("[disc] cardtype row:", JSON.stringify(bookId));

// --- Q1: what does /new/Cardtype serve for a *type+*structure rule? ---
{
  const d = db();
  const ct = fixtureType(d, "Cardtype");
  d.close();
  const url = `${O}/new/${encodeURIComponent(ct.name)}?card%5Bname%5D=${encodeURIComponent(bookType)}&card%5Bcontent%5D=%7B%7B%2Bauthor%7D%7D`;
  const r = await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const shape = await page.evaluate(() => {
    const forms = [...document.querySelectorAll("form.card-form")];
    return {
      status: null,
      formCount: forms.length,
      forms: forms.map((f) => ({
        action: f.getAttribute("action"),
        fields: [...f.querySelectorAll("input,textarea,select")].map((el) => ({ name: el.name, type: el.type ?? el.tagName, value: (el.value ?? "").slice(0, 60), hidden: el.type === "hidden", cls: el.className.slice(0, 40) })),
      })),
    };
  });
  shape.status = r.status();
  writeFileSync(path.join(out, "q1-structure-rule-form.json"), JSON.stringify(shape, null, 2));
  console.log("[disc] Q1 /new/Cardtype for a *type+*structure rule:", JSON.stringify(shape, null, 2).slice(0, 3000));

  // and what a *right rule looks like, for contrast (ACT-083's path)
  const url2 = `${O}/new/${encodeURIComponent(ct.name)}?card%5Bname%5D=${encodeURIComponent(bookType)}+*right+*input type")}&card%5Bcontent%5D=select`;
  await page.goto(url2, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1500);
  const shape2 = await page.evaluate(() => [...document.querySelectorAll("form.card-form")].map((f) => ({ action: f.getAttribute("action"), names: [...f.querySelectorAll("input,textarea,select")].map((el) => el.name + ":" + el.type) })));
  console.log("[disc] Q1b /new/Cardtype for a *right rule:", JSON.stringify(shape2, null, 2).slice(0, 1500));
}

// --- Q2: the board's type-edit row ---
{
  const d0 = db();
  const pt = fixtureType(d0, "PlainText");
  d0.close();
  const name = `Disc_TypeChange_${stamp}`;
  const params = new URLSearchParams({ "card[name]": name, "card[content]]:": "" });
  params.delete("card[content]:");
  params.set("card[content]", `subject ${name}`);
  const opened = await page.goto(`${O}/new/${encodeURIComponent(pt.name)}?${params.toString()}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const form = page.locator("form.card-form").filter({ has: page.locator("input[name='card[name]']") }).filter({ has: page.locator(".create-submit-button") }).first();
  await form.locator(".create-submit-button").first().click().catch(() => {});
  await page.waitForTimeout(2500);
  console.log("[disc] Q2 scratch created:", JSON.stringify(row(name)?.type_id), "open status", opened.status());

  await page.goto(`${O}/${encodeURIComponent(name.replaceAll(" ", "_"))}/board`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const boardShape = await page.evaluate(() => ({
    links: [...document.querySelectorAll(".board a")].map((x) => ({ href: x.getAttribute("href"), text: (x.textContent ?? "").trim().slice(0, 20) })).slice(0, 25),
    rows: [...document.querySelectorAll(".board .edit_name_row, .board .row, .board .form-group")].map((r) => r.className.slice(0, 70)).slice(0, 12),
  }));
  writeFileSync(path.join(out, "q2-board-links.json"), JSON.stringify(boardShape, null, 2));
  console.log("[disc] Q2 board links:", JSON.stringify(boardShape, null, 2).slice(0, 1800));

  const rowLink = page.locator(".board a[href$='/board_type_formgroup'], .board .edit_type_row a, .board a[href$='/edit_type']").first();
  console.log("[disc] Q2 rowLink count:", await rowLink.count(), "href:", await rowLink.getAttribute("href").catch(() => null));
  await rowLink.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2000);
  const afterClick = await page.evaluate(() => ({
    modalPresent: !!document.querySelector(".modal.show"),
    mainText: (document.querySelector("#main")?.innerText ?? "").slice(0, 300),
    typeFields: [...document.querySelectorAll("select[name='card[type]'], input[name='card[type]'], select[name*='type'], input[name*='type_id']")].map((el) => ({ name: el.name, tag: el.tagName, value: el.value, options: el.tagName === "SELECT" ? [...el.options].slice(0, 8).map((o) => o.value) : null, formAction: el.closest("form")?.getAttribute("action") ?? null, inModal: !!el.closest(".modal") })),
    allForms: [...document.querySelectorAll("form")].map((f) => ({ action: f.getAttribute("action"), cls: f.className.slice(0, 50), inModal: !!f.closest(".modal"), fields: [...f.querySelectorAll("input,select,textarea")].map((el) => el.name).slice(0, 12) })).slice(0, 10),
  }));
  writeFileSync(path.join(out, "q2-after-type-row-click.json"), JSON.stringify(afterClick, null, 2));
  console.log("[disc] Q2 after type-row click:", JSON.stringify(afterClick, null, 2).slice(0, 3000));
}

await bh.close().catch(() => {});
await server.stop().catch(() => {});
console.log("[disc] evidence", out);
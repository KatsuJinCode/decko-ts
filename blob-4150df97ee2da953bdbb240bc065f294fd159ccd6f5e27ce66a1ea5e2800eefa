#!/usr/bin/env node
// Discovery 2 for ACT-082 (E12), narrowing the two unknowns run 2 left:
//   Q1  /new/Cardtype with the FULL rule name "<Book>+*type+*structure" —
//       run 2's createTyped found no [name="card[content]"] there. Which
//       fields does that form actually serve?
//   Q2  the board type row's card[type] select — discovery 1 truncated the
//       options at 8 and "Book" was not among the first. Dump EVERY option,
//       and try the select with "Book" present as a Cardtype.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import { fixtureCard, fixtureType } from "../../tools/edge-signed-in-exercise/lib/typed-fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const out = path.resolve(".runtime/exhaustive/probe-pageonly-ranks101-110-act082-discovery2");
mkdirSync(out, { recursive: true });
const fixtureDir = path.resolve("reference-harness/fixtures/synthetic-v1");
const T = 30_000;
const modDir = (r) => path.join(r, "reference-harness", "oracle", "app", "public");
const engineManifest = path.join(repo, "reference-harness", "browser", "engines", "ts.json");
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
const d0 = db();
const ct = fixtureType(d0, "Cardtype");
const pt = fixtureType(d0, "PlainText");
d0.close();

// --- Q1: the FULL rule name on /new/Cardtype -------------------------------
{
  const ruleName = `${book}+*type+*structure`;
  const url = `${O}/new/${encodeURIComponent(ct.name)}?${new URLSearchParams({ "card[name]": ruleName, "card[content]": "{{+author}}" })}`;
  const r = await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const shape = await page.evaluate(() => [...document.querySelectorAll("form.card-form")].map((f) => ({
    action: f.getAttribute("action"),
    fields: [...f.querySelectorAll("input,textarea,select")].map((el) => ({ name: el.name, type: el.type ?? el.tagName, value: (el.value ?? "").slice(0, 50), cls: el.className.slice(0, 45) })),
  })));
  writeFileSync(path.join(out, "q1-full-rule-name.json"), JSON.stringify({ url, status: r.status(), forms: shape }, null, 2));
  console.log("[d2] Q1 status", r.status());
  for (const f of shape) { console.log("[d2] Q1 form", f.action); for (const x of f.fields) console.log("      ", x.name, "|", x.type, "|", JSON.stringify(x.value), "|", x.cls); }
}

// --- Q2: EVERY option in the board type row --------------------------------
{
  const name = `D2_TypeChange_${stamp}`;
  await page.goto(`${O}/new/${encodeURIComponent(pt.name)}?${new URLSearchParams({ "card[name]": name, "card[content]": `subject ${name}` })}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const form = page.locator("form.card-form").filter({ has: page.locator("input[name='card[name]']") }).filter({ has: page.locator(".create-submit-button") }).first();
  await form.locator(".create-submit-button").first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await page.goto(`${O}/${encodeURIComponent(name.replaceAll(" ", "_"))}/board`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.locator(".board a[href$='/board_type_formgroup'], .board .edit_type_row a, .board a[href$='/edit_type']").first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2000);
  const sel = page.locator(".modal select[name='card[type]']").first();
  const dump = await page.evaluate(() => {
    const el = document.querySelector(".modal select[name='card[type]']");
    const form = el?.closest("form");
    return {
      found: !!el,
      value: el?.value ?? null,
      optionCount: el?.options?.length ?? null,
      options: el ? [...el.options].map((o) => ({ v: o.value, t: o.textContent.trim(), sel: o.selected })) : [],
      formAction: form?.getAttribute("action") ?? null,
      formFields: form ? [...form.querySelectorAll("input,select,textarea")].map((x) => ({ name: x.name, type: x.type ?? x.tagName, value: (x.value ?? "").slice(0, 40) })) : [],
      submitControls: form ? [...form.querySelectorAll("button,input[type=submit]")].map((b) => ({ tag: b.tagName, type: b.type, cls: b.className.slice(0, 40), text: (b.textContent ?? "").trim().slice(0, 30) })) : [],
    };
  });
  writeFileSync(path.join(out, "q2-all-options.json"), JSON.stringify(dump, null, 2));
  console.log("[d2] Q2 select found:", dump.found, "options:", dump.optionCount, "value:", dump.value);
  console.log("[d2] Q2 options:", dump.options.map((o) => o.v).join(", "));
  console.log("[d2] Q2 formAction:", dump.formAction);
  console.log("[d2] Q2 formFields:", JSON.stringify(dump.formFields));
  console.log("[d2] Q2 submitControls:", JSON.stringify(dump.submitControls));

  // does a freshly created Cardtype show up, and does selecting it store?
  const bookMade = await page.evaluate(() => null);
  void bookMade;
  const d1 = db();
  const bookId = fixtureCard(d1, book)?.id ?? null;
  d1.close();
  console.log("[d2] Q2 'Book' cardtype in deck:", book);
  // try selecting the harness Cardtype if present in options
  const candidate = dump.options.find((o) => o.v === book) ?? dump.options.find((o) => /Book/.test(o.v)) ?? null;
  console.log("[d2] Q2 candidate option:", JSON.stringify(candidate));
}

await bh.close().catch(() => {});
await server.stop().catch(() => {});
console.log("[d2] evidence", out);
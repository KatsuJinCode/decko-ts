#!/usr/bin/env node
// Boots the INSTRUMENTED CLONE of the harness server
// (.runtime/exhaustive/probe-pageonly-batch2/livecopy — vm-staging-server.mjs
// + dist with a B2_TRACE patch in view-task-rules.js) on a fresh staged
// fixture, signs in as Mira, seeds a holder + its +*help child, updates the
// child, and prints the server-side permission trace. Evidence for whether
// the live composition resolves the right-pattern rule the engine's gate
// needs.
import { mkdirSync, cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const out = path.join(repo, ".runtime", "exhaustive", "probe-pageonly-batch2");
const cloneRoot = path.join(out, "livecopy");

const manifestPath = path.join(out, "engine-b2-clone.json");
mkdirSync(out, { recursive: true });
const { writeFileSync } = await import("node:fs");
writeFileSync(manifestPath, JSON.stringify({
  name: "ts-b2-clone",
  description: "Instrumented clone of the harness ts server (B2_TRACE patched into dist view-task-rules.js)",
  command: ["node", path.join(cloneRoot, "reference-harness", "browser", "engines", "ts-server.mjs")],
  ready: "/__harness/ready",
  env: { B2_TRACE: "1" },
}, null, 2));

const engine = loadEngine(manifestPath);
const fixtureDir = path.join(here, "..", "fixtures", "synthetic-v1");
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server-clone.log") });
const spec = JSON.parse((await import("node:fs")).readFileSync(path.join(fixtureDir, "deck.json"), "utf8"));
console.log("[clone] booted", server.base);

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
try {
  await page.goto(server.base + "/*signin", { waitUntil: "load" });
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(spec.actors.admin.email);
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(spec.actors.admin.password);
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"));
  const req = ctx.request;
  const post = async (p, data) => {
    const r = await req.fetch(server.base + p, {
      method: "POST", headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0,
      data: new URLSearchParams(data).toString(),
    }).catch((e) => ({ error: String(e) }));
    return typeof r.status === "function" ? r.status() : r.status ?? r.error;
  };
  const holder = "B2CloneProbe" + Date.now().toString(36);
  console.log("[clone] admin create holder:", await post("/card/create", { "card[name]": holder, "card[type]": "Basic", "card[content]": "b", "success[redirect]": "true" }));
  console.log("[clone] admin create child:", await post("/card/create", { "card[name]": `${holder}+*help`, "card[type]": "Phrase", "card[content]": "first", "success[redirect]": "true" }));
  // switch to Mira
  await ctx.clearCookies();
  await page.goto(server.base + "/*signin", { waitUntil: "load" });
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(spec.actors.member.email);
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(spec.actors.member.password);
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"));
  await page.waitForTimeout(400);
  console.log("[clone] mira update child:", await post(`/update/${holder}+*help`, { "card[content]": "second", "success[redirect]": "true" }));
  const db = new DatabaseSync(server.db, { readOnly: true });
  console.log("[clone] stored:", db.prepare("SELECT db_content FROM cards WHERE db_content='second' AND trash=0").all());
  db.close();
} finally {
  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
}
console.log("[clone] trace lines:");
const { readFileSync } = await import("node:fs");
const log = readFileSync(path.join(out, "server-clone.log"), "utf8");
for (const line of log.split("\n").filter((l) => l.includes("[b2trace]"))) console.log("  ", line.trim().slice(0, 400));

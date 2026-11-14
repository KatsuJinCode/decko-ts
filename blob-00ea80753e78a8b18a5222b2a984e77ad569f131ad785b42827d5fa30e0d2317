#!/usr/bin/env node
// Head-to-head: the REAL harness ts server vs the livecopy clone, same
// scenario (admin seeds holder + +*help child; Mira updates the child),
// same script, one process. Prints both statuses + the 403 body head.
import { DatabaseSync } from "node:sqlite";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const out = path.join(repo, ".runtime", "exhaustive", "probe-pageonly-batch2");
const fixtureDir = path.join(here, "..", "fixtures", "synthetic-v1");
const spec = JSON.parse((await import("node:fs")).readFileSync(path.join(fixtureDir, "deck.json"), "utf8"));

const run = async (label, manifestPath) => {
  const engine = loadEngine(manifestPath);
  const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, `server-h2h-${label}.log`) });
  const bh = await launchBrowser();
  const ctx = bh.context;
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    const post = async (p, data) => {
      const r = await ctx.request.fetch(server.base + p, {
        method: "POST", headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0,
        data: new URLSearchParams(data).toString(),
      }).catch((e) => ({ error: String(e) }));
      const status = typeof r.status === "function" ? r.status() : r.status ?? r.error;
      let bodyHead = "";
      if (status !== 303) bodyHead = (await r.text?.().catch(() => ""))?.replace(/\s+/g, " ").slice(0, 140) ?? "";
      return { status, bodyHead };
    };
    // sign in admin via form
    await page.goto(server.base + "/*signin", { waitUntil: "load" });
    await page.locator("input[name='card[subcards][+*email][content]']").first().fill(spec.actors.admin.email);
    await page.locator("input[name='card[subcards][+*password][content]']").first().fill(spec.actors.admin.password);
    await page.getByRole("button", { name: /^sign in$/i }).first().click();
    await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"));
    const holder = "B2H2H" + Date.now().toString(36);
    await post("/card/create", { "card[name]": holder, "card[type]": "Basic", "card[content]": "b", "success[redirect]": "true" });
    const childCreate = await post("/card/create", { "card[name]": `${holder}+*help`, "card[type]": "Phrase", "card[content]": "first", "success[redirect]": "true" });
    // switch to Mira
    await ctx.clearCookies();
    await page.goto(server.base + "/*signin", { waitUntil: "load" });
    await page.locator("input[name='card[subcards][+*email][content]']").first().fill(spec.actors.member.email);
    await page.locator("input[name='card[subcards][+*password][content]']").first().fill(spec.actors.member.password);
    await page.getByRole("button", { name: /^sign in$/i }).first().click();
    await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"));
    await page.waitForTimeout(400);
    const upd = await post(`/update/${holder}+*help`, { "card[content]": "second", "success[redirect]": "true" });
    const db = new DatabaseSync(server.db, { readOnly: true });
    const stored = db.prepare("SELECT db_content FROM cards WHERE db_content='second' AND trash=0").all();
    db.close();
    console.log(`[h2h] ${label}: childCreate=${childCreate.status} miraUpdate=${upd.status} body=${upd.bodyHead} storedSecondRows=${stored.length}`);
  } finally {
    await bh.close().catch(() => {});
    await server.stop().catch(() => {});
  }
};

await run("real", path.join(here, "engines", "ts.json"));
await run("clone", path.join(out, "engine-b2-clone.json"));

#!/usr/bin/env node
// One-shot: as Mira, GET her own +*email and +*password edit routes; print
// status + body head of the 403 (which layer's denial page is it?).
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const engine = loadEngine(path.join(here, "engines", "ts.json"));
const server = await startEngine(engine, path.join(here, "..", "fixtures", "synthetic-v1"), { logFile: path.join(here, "../../.runtime/exhaustive/probe-pageonly-batch2", "server-email-edit.log") });
const spec = JSON.parse((await import("node:fs")).readFileSync(path.join(here, "..", "fixtures", "synthetic-v1", "deck.json"), "utf8"));
const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
try {
  await page.goto(server.base + "/*signin", { waitUntil: "load" });
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(spec.actors.member.email);
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(spec.actors.member.password);
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"));
  await page.waitForTimeout(400);
  const req = ctx.request;
  for (const p of ["/Mira_Member+*account+*email/edit", "/Mira_Member+*account+*password/edit", "/Mira_Member+*account+*email", "/Mira_Member+*account+*email.json"]) {
    const r = await req.fetch(server.base + p, { headers: { accept: "text/html" } }).catch((e) => ({ error: String(e) }));
    const status = typeof r.status === "function" ? r.status() : r.status;
    const body = (await r.text?.().catch(() => ""))?.replace(/\s+/g, " ").slice(0, 220) ?? "";
    console.log(`[email-edit] GET ${p} -> ${status} | ${body}`);
  }
} finally {
  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
}

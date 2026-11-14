#!/usr/bin/env node
// Decisive actor-resolution test for the batch2 lane: as MIRA (Member, no
// Help Desk, not the owner of Ada's rows), attempt writes that the rule walk
// must DENY. If they succeed, the signed-in write path runs as an alwaysOk
// actor, not as the session's account.
//   1. POST /update/Ada_Admin+*account+*password  (Help Desk rule; owner=Ada)
//   2. POST /update/*help                          (*star+*update=Administrator)
// Both must deny for a correct gate.
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const engine = loadEngine(path.join(here, "engines", "ts.json"));
const out = path.join(here, "../../.runtime/exhaustive/probe-pageonly-batch2");
const server = await startEngine(engine, path.join(here, "..", "fixtures", "synthetic-v1"), { logFile: path.join(out, "server-actor.log") });
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
  await page.waitForTimeout(500);
  const chrome = await page.evaluate(() => !!document.querySelector("a.signout-link"));
  console.log("[actor] mira signed in:", chrome);
  const req = ctx.request;
  const post = async (label, p, data) => {
    const r = await req.fetch(server.base + p, {
      method: "POST", headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0,
      data: new URLSearchParams(data).toString(),
    }).catch((e) => ({ error: String(e) }));
    console.log(`[actor] ${label} -> ${typeof r.status === "function" ? r.status() : r.status ?? r.error}`);
    return typeof r.status === "function" ? r.status() : r.status;
  };
  const s1 = await post("mira POST ada's +*password", "/update/Ada_Admin+*account+*password", { "card[content]": "Mira touch 9#", "success[redirect]": "true" });
  const s2 = await post("mira POST *help setting card", "/update/*help", { "card[content]": "help desk only", "success[redirect]": "true" });
  console.log("[actor] VERDICT ada-pw:", s1, " *help:", s2, "=> signed-in writes run as:", (s1 === 303 || s1 === 200) && (s2 === 303 || s2 === 200) ? "ALWAYS-OK ACTOR (break)" : "the session's account (correct)");
} finally {
  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
}

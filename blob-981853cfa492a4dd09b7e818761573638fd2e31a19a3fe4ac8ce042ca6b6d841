#!/usr/bin/env node
// One-shot: does the live write route allow an ANONYMOUS write? If yes, the
// write surface runs as an always-ok actor and every permission measurement
// in this lane is an artifact of that, not of rule resolution.
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const engine = loadEngine(path.join(here, "engines", "ts.json"));
const server = await startEngine(engine, path.join(here, "..", "fixtures", "synthetic-v1"), { logFile: path.join(here, "../../.runtime/exhaustive/probe-pageonly-batch2", "server-anon.log") });
const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
const req = ctx.request;
try {
  await ctx.clearCookies();
  // confirm signed-out chrome
  await page.goto(server.base + "/", { waitUntil: "load" });
  const signedOut = await page.evaluate(() => !document.querySelector("a.signout-link"));
  const r1 = await req.fetch(server.base + "/update/Date_1", {
    method: "POST", headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0,
    data: new URLSearchParams({ "card[content]": "2000-01-01", "success[redirect]": "true" }).toString(),
  }).catch((e) => ({ error: String(e) }));
  console.log("[anon] signedOut:", signedOut, "| anonymous POST /update/Date_1 ->", typeof r1.status === "function" ? r1.status() : r1.status ?? r1.error);
  const r2 = await req.fetch(server.base + "/card/create", {
    method: "POST", headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" }, maxRedirects: 0,
    data: new URLSearchParams({ "card[name]": "AnonMade" + Date.now().toString(36), "card[type]": "Basic", "card[content]": "x", "success[redirect]": "true" }).toString(),
  }).catch((e) => ({ error: String(e) }));
  console.log("[anon] anonymous POST /card/create ->", typeof r2.status === "function" ? r2.status() : r2.status ?? r2.error);
} finally {
  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
}

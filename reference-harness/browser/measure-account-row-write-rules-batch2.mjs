#!/usr/bin/env node
// measure-account-row-write-rules-batch2.mjs
//
// One-shot permission measurement for the batch2 page-only lane: which
// actors' writes do the +*account child rows (+*email, +*password) accept,
// and does the generic write-task walk honor a RIGHT-pattern *update rule
// ("*help+*right"+*update = Help Desk) that no override layer touches.
// Evidence for the ACT-046/047 affordance choice (owner row edit) and for
// the Ada password-write anomaly the first probe run surfaced.
//
//   node reference-harness/browser/measure-account-row-write-rules-batch2.mjs [--out <dir>]

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchBrowser } from "./lib/launch.mjs";
import { loadEngine, startEngine } from "./lib/engines.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
const fixtureDir = path.resolve(args.fixture ?? path.join(here, "..", "fixtures", "synthetic-v1"));
const out = path.resolve(args.out ?? ".runtime/exhaustive/probe-pageonly-batch2");
mkdirSync(out, { recursive: true });

const engine = loadEngine(path.join(here, "engines", "ts.json"));
const server = await startEngine(engine, fixtureDir, { logFile: path.join(out, "server-measure.log") });
const spec = JSON.parse((await import("node:fs")).readFileSync(path.join(fixtureDir, "deck.json"), "utf8"));
const results = [];

const bh = await launchBrowser();
const ctx = bh.context;
const page = ctx.pages()[0] ?? (await ctx.newPage());
const T = 30_000;

/** Sign in through the form as an actor; answers the request-scoped API. */
const signInApi = async (who) => {
  await ctx.clearCookies();
  const a = spec.actors[who];
  await page.goto(server.base + "/*signin", { waitUntil: "load", timeout: T }).catch(() => {});
  await page.locator("input[name='card[subcards][+*email][content]']").first().fill(a.email, { timeout: T });
  await page.locator("input[name='card[subcards][+*password][content]']").first().fill(a.password, { timeout: T });
  await page.getByRole("button", { name: /^sign in$/i }).first().click({ timeout: T });
  await page.waitForURL((u) => !decodeURIComponent(u.pathname).endsWith("*signin"), { timeout: T }).catch(() => {});
  await page.waitForTimeout(400);
  return ctx.request;
};

const probeRoute = async (req, label, method, pathName, data) => {
  const resp = await req.fetch(server.base + pathName, {
    method,
    headers: { origin: server.base, "Content-Type": "application/x-www-form-urlencoded" },
    maxRedirects: 0,
    ...(data ? { data: new URLSearchParams(data).toString() } : {}),
  }).catch((e) => ({ error: String(e?.message ?? e) }));
  const rec = {
    label, method, path: pathName,
    status: typeof resp?.status === "function" ? resp.status() : (resp?.status ?? null),
    bodyHead: resp?.error ? resp.error.slice(0, 80) : (await resp?.text?.().catch(() => ""))?.replace(/\s+/g, " ").slice(0, 160) ?? "",
  };
  results.push(rec);
  console.log(`[measure] ${label}: ${rec.status} ${rec.bodyHead}`);
  return rec;
};

const dbRow = (q, ...p) => { const d = new DatabaseSync(server.db, { readOnly: true }); const r = d.prepare(q).get(...p); d.close(); return r ?? null; };
const accountChild = (holder, right) => dbRow(`
  SELECT child.id, child.db_content FROM cards child
  WHERE child.left_id = (SELECT id FROM cards WHERE right_id=(SELECT id FROM cards WHERE name='*account') AND left_id=(SELECT id FROM cards WHERE name=?) AND trash=0)
    AND child.right_id = (SELECT id FROM cards WHERE name=?) AND child.trash=0`, holder, right);

try {
  // ---- Q1: the OWNER (Mira) drives her own rows — the override-allowed path.
  const mira = await signInApi("member");
  const emailBefore = accountChild("Mira Member", "*email");
  const newEmail = `measure.${Date.now().toString(36)}@example.test`;
  await probeRoute(mira, "Q1a mira GET own +*email edit", "GET", "/Mira_Member+*account+*email/edit");
  await probeRoute(mira, "Q1b mira POST own +*email (owner)", "POST", "/update/Mira_Member+*account+*email", { "card[content]": newEmail, "success[redirect]": "true" });
  const emailAfter = accountChild("Mira Member", "*email");
  console.log(`[measure] Q1b stored: ${JSON.stringify({ before: emailBefore?.db_content, after: emailAfter?.db_content, isNew: emailAfter?.db_content === newEmail })}`);
  // restore
  await probeRoute(mira, "Q1c mira POST own +*email restore", "POST", "/update/Mira_Member+*account+*email", { "card[content]": spec.actors.member.email, "success[redirect]": "true" });
  console.log(`[measure] Q1c stored now: ${accountChild("Mira Member", "*email")?.db_content}`);

  const pwBefore = accountChild("Mira Member", "*password");
  await probeRoute(mira, "Q1d mira GET own +*password edit", "GET", "/Mira_Member+*account+*password/edit");
  const newPw = "Measure pass 7#" + Date.now().toString(36);
  await probeRoute(mira, "Q1e mira POST own +*password (owner)", "POST", "/update/Mira_Member+*account+*password", { "card[content]": newPw, "success[redirect]": "true" });
  const pwAfter = accountChild("Mira Member", "*password");
  console.log(`[measure] Q1e stored changed: ${pwAfter?.db_content !== pwBefore?.db_content} (digest head ${String(pwAfter?.db_content).slice(0, 12)})`);
  // restore original password through the same owner path
  await probeRoute(mira, "Q1f mira POST own +*password restore", "POST", "/update/Mira_Member+*account+*password", { "card[content]": spec.actors.member.password, "success[redirect]": "true" });
  const pwRestored = accountChild("Mira Member", "*password");
  console.log(`[measure] Q1f digest changed again: ${pwRestored?.db_content !== pwAfter?.db_content}`);

  // ---- Q2: ADA (non-owner) POSTs Mira's rows directly.
  const ada = await signInApi("admin");
  const adaEmail = `admin.touch.${Date.now().toString(36)}@example.test`;
  await probeRoute(ada, "Q2a ada GET mira +*email edit", "GET", "/Mira_Member+*account+*email/edit");
  await probeRoute(ada, "Q2b ada POST mira +*email", "POST", "/update/Mira_Member+*account+*email", { "card[content]": adaEmail, "success[redirect]": "true" });
  console.log(`[measure] Q2b stored still: ${accountChild("Mira Member", "*email")?.db_content}`);
  await probeRoute(ada, "Q2c ada POST mira +*password", "POST", "/update/Mira_Member+*account+*password", { "card[content]": "Ada touch pass 3#", "success[redirect]": "true" });
  console.log(`[measure] Q2c stored changed: ${accountChild("Mira Member", "*password")?.db_content !== pwRestored?.db_content}`);

  // ---- Q3: control with NO override layer — "*help+*right"+*update = Help
  // Desk (a role nobody holds). MIRA updating a +*help child must be DENIED
  // if the generic walk honors right-pattern rules.
  const holder = "B2RightProbe_" + Date.now().toString(36);
  await probeRoute(mira, "Q3a mira create holder card", "POST", "/card/create", { "card[name]": holder, "card[type]": "Basic", "card[content]": "probe", "success[redirect]": "true" });
  await probeRoute(mira, "Q3b mira create +*help child", "POST", "/card/create", { "card[name]": `${holder}+*help`, "card[type]": "Phrase", "card[content]": "first", "success[redirect]": "true" });
  await probeRoute(mira, "Q3c mira POST +*help update (rule: Help Desk)", "POST", `/update/${holder}+*help`, { "card[content]": "second", "success[redirect]": "true" });
  const helpRow = dbRow("SELECT db_content FROM cards WHERE left_id=(SELECT id FROM cards WHERE name=?) AND right_id=(SELECT id FROM cards WHERE name='*help') AND trash=0", holder);
  console.log(`[measure] Q3c stored: ${helpRow?.db_content}`);

  // ---- Q4: a SELF-pattern rule control the instrumented P1 pair already
  // exercises — skipped here; ACT-099's instrument covers that leg.
} finally {
  await bh.close().catch(() => {});
  await server.stop().catch(() => {});
}
writeFileSync(path.join(out, "measure-account-row-rules-result.json"), JSON.stringify(results, null, 2));
console.log(`[measure] evidence ${path.join(out, "measure-account-row-rules-result.json")}`);

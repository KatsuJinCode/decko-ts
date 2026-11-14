// Supplemental actual page-2 interaction. The historical navbox-paging
// definition observes page1 only and is deliberately left unchanged.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import { launchBrowser } from "./lib/launch.mjs";
import { captureProvenance } from "./lib/journey-provenance.mjs";
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, values) => i % 2 ? pairs : [...pairs, [value.replace(/^--/, ""), values[i + 1]]], []));
if (!args.engine || !args.out) throw new Error("--engine and new --out are required");
args.fixture ??= "reference-harness/fixtures/synthetic-v1";
args.journeys ??= "reference-harness/browser/journeys/synthetic-v1.json";
const engine = loadEngine(args.engine), provenance = captureProvenance(args, engine);
if (provenance.source.dirty || provenance.buildReceipt?.sourceCommit !== provenance.source.commit || provenance.buildReceipt?.distSha256 !== provenance.artifacts.distSha256) throw new Error("requires clean exact-source build");
mkdirSync(args.out, { recursive: false });
const started = Date.now();
const evidence = { format: "decko-second-search-page/1", productionAcceptance: false, provenance, requests: [], assetFailures: [], problems: [] };
let host, browser;
try {
  host = await startEngine(engine, args.fixture, { logFile: path.resolve(args.out, "server.log") });
  evidence.runtime = await (await fetch(host.base + "/__harness/runtime")).json();
  browser = await launchBrowser(); evidence.browserVersion = browser.version;
  browser.context.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith("*search")) evidence.requests.push({ offset: url.searchParams.get("offset"), keyword: url.searchParams.get("query[keyword]"), method: request.method() });
  });
  browser.context.on("response", response => {
    if (response.status() >= 400 && ["script", "stylesheet", "font", "image"].includes(response.request().resourceType())) evidence.assetFailures.push({ path: new URL(response.url()).pathname, status: response.status() });
  });
  browser.context.on("requestfailed", request => {
    if (["script", "stylesheet", "font", "image"].includes(request.resourceType())) evidence.assetFailures.push({ path: new URL(request.url()).pathname, failure: request.failure()?.errorText });
  });
  const page = await browser.context.newPage();
  evidence.firstStatus = (await page.goto(host.base + "/*search?query[keyword]=Topic", { waitUntil: "networkidle" })).status();
  const snapshot = () => page.evaluate(() => ({
    activePage: document.querySelector(".paging .page-item.active")?.textContent.trim(),
    resultIds: [...document.querySelectorAll(".search-result-list > .search-result-item")].map(item => item.querySelector("[data-card-id]")?.getAttribute("data-card-id")).filter(Boolean),
    text: document.body.innerText.replace(/\s+/g, " "),
    navbars: document.querySelectorAll("nav.navbar").length,
  }));
  evidence.first = await snapshot();
  const next = page.locator('a.card-paging-link[aria-label="Next"]').first();
  const nextHref = await next.getAttribute("href", { timeout: 8000 });
  evidence.nextOffset = new URL(nextHref, host.base).searchParams.get("offset");
  await next.click({ timeout: 8000 });
  await page.waitForFunction(() => document.querySelector(".paging .page-item.active")?.textContent.trim() === "2", null, { timeout: 8000 });
  evidence.second = await snapshot();
  if (evidence.firstStatus !== 200 || evidence.first.activePage !== "1" || evidence.second.activePage !== "2") evidence.problems.push("page1/page2 state incorrect");
  if (!evidence.first.resultIds.length || !evidence.second.resultIds.length || evidence.first.resultIds[0] === evidence.second.resultIds[0]) evidence.problems.push("second page did not advance result window");
  if (!evidence.requests.some(request => request.offset === evidence.nextOffset && request.keyword === "Topic")) evidence.problems.push("paging request lost the keyword constraint");
  if (!evidence.second.text.includes("Results for Topic")) evidence.problems.push("second page lost the keyword heading");
  if (evidence.second.navbars !== evidence.first.navbars) evidence.problems.push("XHR paging duplicated page chrome");
  evidence.oversizedAnonymousOffsetStatus = (await fetch(host.base + "/*search?query[keyword]=Topic&offset=1001")).status;
  if (evidence.oversizedAnonymousOffsetStatus !== 403) evidence.problems.push("anonymous offset1001 did not retain the stock403 cap");
  if (evidence.assetFailures.length) evidence.problems.push("required assets failed");
} catch (error) { evidence.problems.push(error.stack ?? String(error)); }
finally {
  try { await browser?.close(); await host?.stop(); } catch (error) { evidence.problems.push(`owned closeout: ${error.message}`); }
  evidence.durationMs = Date.now() - started;
  evidence.passed = evidence.problems.length === 0;
  writeFileSync(path.resolve(args.out, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
}
console.log(JSON.stringify({ passed: evidence.passed, problems: evidence.problems, out: args.out }));
if (!evidence.passed) process.exitCode = 1;

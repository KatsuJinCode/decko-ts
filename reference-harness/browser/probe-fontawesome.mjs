// Actual owned host/browser export: no interception, fixture rewrite or CDN waiver.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadEngine, startEngine } from "./lib/engines.mjs";
import { launchBrowser } from "./lib/launch.mjs";
import { captureProvenance } from "./lib/journey-provenance.mjs";
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, values) => i % 2 ? pairs : [...pairs, [value.replace(/^--/, ""), values[i + 1]]], []));
if (!args.engine || !args.out) throw new Error("--engine and a new --out directory are required");
args.fixture ??= "reference-harness/fixtures/synthetic-v1";
args.journeys ??= "reference-harness/browser/journeys/synthetic-v1.json";
const engine = loadEngine(args.engine), provenance = captureProvenance(args, engine);
if (provenance.source.dirty || provenance.buildReceipt?.sourceCommit !== provenance.source.commit || provenance.buildReceipt?.distSha256 !== provenance.artifacts.distSha256) throw new Error("probe requires clean exact-source distribution");
mkdirSync(path.resolve(args.out), { recursive: false });
const evidence = { format: "decko-fontawesome-browser-probe/1", provenance, engine: engine.name, complete: false, requests: [], problems: [] };
const bytesManifest = JSON.parse(readFileSync(new URL("../../vendor/fontawesome-free-6.7.2/provenance.json", import.meta.url)));
let host, browser;
try {
  host = await startEngine(engine, args.fixture, { logFile: path.resolve(args.out, "server.log") });
  evidence.bootMs = host.bootMs;
  evidence.runtime = await (await fetch(host.base + "/__harness/runtime")).json();
  browser = await launchBrowser();
  evidence.browserVersion = browser.version;
  const pending = [];
  browser.context.on("response", response => {
    const url = new URL(response.url());
    if (url.hostname === "kit.fontawesome.com") evidence.problems.push("external kit requested");
    if (url.pathname.includes("/fontawesome-6.7.2/")) pending.push((async () => {
      const body = await response.body();
      const relative = url.pathname.split("/fontawesome-6.7.2/")[1];
      const sha256 = createHash("sha256").update(body).digest("hex");
      const official = bytesManifest.files.find(file => file.path === relative);
      evidence.requests.push({ path: url.pathname, status: response.status(), bytes: body.length, sha256, officialBytes: official?.sha256 === sha256 });
      if (response.status() !== 200 || official?.sha256 !== sha256) evidence.problems.push(`vendor bytes/status failed: ${relative}`);
    })());
  });
  browser.context.on("request", request => { if (new URL(request.url()).hostname === "kit.fontawesome.com") evidence.problems.push("external kit requested"); });
  const page = await browser.context.newPage();
  evidence.status = (await page.goto(host.base + "/Home?view=icons", { waitUntil: "networkidle" })).status();
  evidence.glyph = await page.evaluate(async () => {
    await document.fonts.ready;
    const icon = document.querySelector("i.fa-magnifying-glass");
    if (!icon) return { present: false };
    const style = getComputedStyle(icon), before = getComputedStyle(icon, "::before");
    return { present: true, family: style.fontFamily, content: before.content, loadedFaces: [...document.fonts].filter(font => font.status === "loaded").map(font => ({ family: font.family, weight: font.weight })) };
  });
  await Promise.all(pending);
  if (evidence.status !== 200 || !evidence.glyph.present || !evidence.glyph.family?.includes("Font Awesome") || !evidence.glyph.loadedFaces?.some(font => font.family.includes("Font Awesome"))) evidence.problems.push("actual icon view did not load the local glyph font");
  if (!evidence.requests.some(request => request.path.endsWith(".css")) || !evidence.requests.some(request => request.path.endsWith(".woff2"))) evidence.problems.push("missing CSS/font network proof");
  evidence.missingAssetStatus = (await fetch(host.base + "/mod/bootstrap/fontawesome-6.7.2/webfonts/missing.woff2")).status;
  if (evidence.missingAssetStatus !== 404) evidence.problems.push("missing font did not fail closed");
  evidence.complete = true;
} catch (error) { evidence.problems.push(error.stack ?? String(error)); }
finally {
  try { await browser?.close(); await host?.stop(); } catch (error) { evidence.problems.push(`owned closeout: ${error.message}`); }
  evidence.passed = evidence.complete && evidence.problems.length === 0;
  writeFileSync(path.resolve(args.out, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
}
console.log(JSON.stringify({ passed: evidence.passed, problems: evidence.problems, out: args.out }));
if (!evidence.passed) process.exitCode = 1;

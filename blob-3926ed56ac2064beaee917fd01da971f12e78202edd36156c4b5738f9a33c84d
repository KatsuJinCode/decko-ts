// capture-the-faithful-thumbnail.mjs
//
// PURPOSE
// Recapture the demos index thumbnail for the front door entry from the LIVE
// published faithful snapshot (https://demos.culturesmith.help/front-door-in-
// decko-2/index.html), one navigation, nothing clicked, nothing shown, hidden
// headless browser with a throwaway profile, at 1280x900 (the shape every
// other thumbnail in the set carries and the page's own img attributes
// declare). The capture lands in the new r5 thumbnails folder; the other
// seven PNGs move into r5 byte for byte from r4 by the copy script.
//
// The screenshot set never changes once published: the r4 folder stays as it
// is, and the changed entry's capture goes to the new dated folder r5.
//
// Usage: node capture-the-faithful-thumbnail.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const LIVE_URL = "https://demos.culturesmith.help/front-door-in-decko-2/index.html";
const OUT = "C:/localProjects/brandonDojoTech/tmp/demo-index-thumbnails-20261025-r5/front-door-in-decko.png";
const VIEWPORT = { width: 1280, height: 900 };

const PLAYWRIGHT_CORE = "C:/localProjects/decko-ts-demo-scratch-20261025/node_modules/playwright-core";
const require = createRequire(import.meta.url);
const { chromium } = require(PLAYWRIGHT_CORE);

const findBrowser = () => {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ];
  const found = process.env.HARNESS_CHROME ?? candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("no installed Chrome or Edge found; set HARNESS_CHROME");
  return found;
};

// Only the demos host may be fetched: the thumbnail is a capture of that one
// page, which is fully self-contained (zero external resource references, so
// the render needs nothing else).
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decko-browser-profile-faithful-thumb-"));
fs.writeFileSync(path.join(profile, ".decko-owner.json"), JSON.stringify({ pid: process.pid }));
let browser;
try {
  browser = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: findBrowser(),
    viewport: VIEWPORT,
    acceptDownloads: false,
    args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio"],
  });
  const page = browser.pages()[0] ?? (await browser.newPage());
  await page.setViewportSize(VIEWPORT);
  await page.route(
    (url) => /^(https?|wss?):$/.test(url.protocol) && !url.hostname.endsWith("demos.culturesmith.help"),
    (route) => route.abort("blockedbyclient"),
  );
  await page.goto(LIVE_URL, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(800);
  const external = await page.evaluate(() =>
    [...document.querySelectorAll("link[href], img[src]")]
      .map((el) => el.getAttribute("href") ?? el.getAttribute("src"))
      .filter((u) => u && /^https?:\/\//.test(u) && !u.includes("demos.culturesmith.help")).length,
  );
  if (external > 0) throw new Error(`the live page carries ${external} external resource references; capture refused`);
  await page.screenshot({ path: OUT });
  console.log(`thumbnail captured from the live page: ${OUT}`);
} finally {
  await browser.close().finally(() => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
}

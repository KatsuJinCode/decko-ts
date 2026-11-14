#!/usr/bin/env node
// check-forced-dark.mjs: capture the four front-door directions under
// Chromium's forced dark mode (the reading condition Brandon's own browser
// forces, per brandonDojoTech docs/plans/writing-for-brandon.md rule 2), to
// verify every page keeps its contrast when the browser inverts it.
//
//   node scripts/frontdoor-design-pass/check-forced-dark.mjs
//     [--base-url http://127.0.0.1:3118]
//     [--out-dir tmp/frontdoor-design-pass-20261026/dark-check]
//
// Viewport shots only (the check is contrast, not layout); hidden throwaway
// browser, nothing published.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_BASE_URL = "http://127.0.0.1:3118";
const DEFAULT_OUT_DIR = join(repoRoot, "tmp", "frontdoor-design-pass-20261026", "dark-check");
const VIEWPORT = { width: 1440, height: 900 };

const BROWSER_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

const PAGES = [
  { name: "library-first", path: `/Culturesmith%2BFront%20Door%20Library`, marker: ".w-lib-hero" },
  { name: "editorial", path: `/Culturesmith%2BFront%20Door%20Editorial`, marker: ".w-ed-page" },
  { name: "product-grid", path: `/Culturesmith%2BProduct%20Grid%20Door`, marker: ".pgd-main" },
  { name: "three-doors", path: `/Culturesmith%2BThree%20Doors`, marker: ".td-main" },
];

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL, outDir: DEFAULT_OUT_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--base-url": args.baseUrl = value.replace(/\/+$/, ""); i += 1; break;
      case "--out-dir": args.outDir = resolve(value); i += 1; break;
      default:
        console.error(`check-forced-dark: unknown argument ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const executablePath = BROWSER_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error("check-forced-dark: no installed Chrome or Edge found");
  process.exit(2);
}

const ASSET_HOST = "production-storage.r1.cdn.objectstore.example";
const ASSET_PREFIX_FROM = `https://${ASSET_HOST}/files/`;

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

mkdirSync(args.outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--enable-features=WebContentsForceDark", "--force-dark-mode"],
});
try {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const steps = [];
  for (const shot of PAGES) {
    await page.route(`**${shot.path}`, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).split(ASSET_PREFIX_FROM).join(`${args.baseUrl}/files/~`);
      await route.fulfill({ response, body }).catch(() => {});
    });
    const response = await page.goto(`${args.baseUrl}${shot.path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const status = response?.status() ?? 0;
    await page.waitForSelector(shot.marker, { timeout: 15000 }).catch(() => {});
    await page
      .waitForFunction(() => Array.from(document.images).every((img) => img.complete), { timeout: 20000 })
      .catch(() => {});
    await page.waitForTimeout(2200);
    const out = join(args.outDir, `${shot.name}-forced-dark.png`);
    await page.screenshot({ path: out, fullPage: false });
    steps.push({ label: shot.name, status, out });
    console.log(`${status === 200 ? "PASS" : "FAIL"}  ${shot.name}: -> ${status}, ${out}`);
    await page.unroute(`**${shot.path}`);
  }
  writeFileSync(join(args.outDir, "dark-check-receipt.json"), JSON.stringify({ checkedAt: new Date().toISOString(), steps }, null, 2) + "\n");
  process.exit(steps.every((s) => s.status === 200) ? 0 : 1);
} finally {
  await browser.close();
}

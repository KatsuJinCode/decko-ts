#!/usr/bin/env node
// render-design-pass.mjs: capture the four front-door directions after the
// 2026-10-26 design pass, as full-page screenshots plus motion-state shots,
// in a hidden throwaway browser.
//
//   node scripts/frontdoor-design-pass/render-design-pass.mjs
//     [--base-url http://127.0.0.1:3118]
//     [--out-dir tmp/frontdoor-design-pass-20261026]
//
// The browser is headless Chromium (the installed Chrome or Edge binary) with
// a throwaway in-memory profile: nothing visible opens, the machine's own
// browser is never touched. Viewport 1440x900. For every direction this
// script writes two PNGs:
//   <name>-1440x900-fullpage.png  the whole scroll height, animations settled
//   <name>-motion-state.png       the viewport with every CSS entrance
//                                 animation frozen mid-flight (all
//                                 document.getAnimations() seeked to one
//                                 timestamp and paused), so the still shows
//                                 the motion state deterministically
// and one render-receipt.json. Nothing here publishes anything: the PNGs
// land in the checkout's tmp folder.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_BASE_URL = "http://127.0.0.1:3118";
const DEFAULT_OUT_DIR = join(repoRoot, "tmp", "frontdoor-design-pass-20261026");
const VIEWPORT = { width: 1440, height: 900 };
const MOTION_FREEZE_MS = 550;

const BROWSER_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

const SHOTS = [
  {
    name: "library-first",
    label: "Library-first",
    path: `/Culturesmith%2BFront%20Door%20Library`,
    marker: ".w-lib-hero",
  },
  {
    name: "editorial",
    label: "Editorial",
    path: `/Culturesmith%2BFront%20Door%20Editorial`,
    marker: ".w-ed-page",
  },
  {
    name: "product-grid",
    label: "Product grid",
    path: `/Culturesmith%2BProduct%20Grid%20Door`,
    marker: ".pgd-main",
  },
  {
    name: "three-doors",
    label: "Three doors",
    path: `/Culturesmith%2BThree%20Doors`,
    marker: ".td-main",
  },
];

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL, outDir: DEFAULT_OUT_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--base-url": args.baseUrl = value.replace(/\/+$/, ""); i += 1; break;
      case "--out-dir": args.outDir = resolve(value); i += 1; break;
      case "--help":
        console.log(
          "render-design-pass: full-page and motion-state screenshots of the four directions\n" +
          "  --base-url <url>   the running deck (default http://127.0.0.1:3118)\n" +
          "  --out-dir <dir>    where the PNGs land (default tmp/frontdoor-design-pass-20261026)",
        );
        process.exit(0);
        break;
      default:
        console.error(`render-design-pass: unknown argument ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const executablePath = BROWSER_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error("render-design-pass: no installed Chrome or Edge found");
  process.exit(2);
}

// Served pages name their assets on the deck's production CDN host
// (vm-staging-server.mjs rewrites every asset URL to SPACES_HOST for
// fidelity with the deployed deck's bytes). That host has no local DNS: the
// .example TLD is unroutable. The staging server itself serves the same
// assets on its own origin at the /files/~<cardId>/<action>.<ext> route.
// This harness rewrites that one absolute prefix in the document's HTML to
// the serving origin's ~ form before the browser loads it.
const ASSET_HOST = "production-storage.r1.cdn.objectstore.example";
const ASSET_PREFIX_FROM = `https://${ASSET_HOST}/files/`;

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

mkdirSync(args.outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const failedRequests = [];
  page.on("requestfailed", (request) => {
    failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "failed" });
  });

  /** Open a direction page with the deck's asset host mapped to the server. */
  async function open(shot) {
    await page.route(`**${shot.path}`, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).split(ASSET_PREFIX_FROM).join(`${args.baseUrl}/files/~`);
      await route.fulfill({ response, body }).catch(() => {});
    });
    const response = await page.goto(`${args.baseUrl}${shot.path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const status = response?.status() ?? 0;
    await page.waitForSelector(shot.marker, { timeout: 15000 }).catch(() => {});
    return status;
  }

  /** Wait until every <img> has finished (or failed) loading, then settle. */
  async function settleImages() {
    await page
      .waitForFunction(() => Array.from(document.images).every((img) => img.complete), { timeout: 20000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
  }

  /** Freeze every running CSS animation at one timestamp, deterministically. */
  async function freezeAt(ms) {
    return page.evaluate((at) => {
      let frozen = 0;
      for (const animation of document.getAnimations()) {
        try {
          animation.pause();
          animation.currentTime = at;
          frozen += 1;
        } catch {
          // an animation that cannot seek is left as-is
        }
      }
      return frozen;
    }, ms);
  }

  const steps = [];
  for (const shot of SHOTS) {
    const status = await open(shot);
    await settleImages();
    const skinLive = await page.evaluate(
      (marker) => document.querySelector(marker) !== null,
      shot.marker,
    );

    const fullPageOut = join(args.outDir, `${shot.name}-1440x900-fullpage.png`);
    await page.screenshot({ path: fullPageOut, fullPage: true });

    // Motion state: re-open the page so the entrance animations restart,
    // freeze them all at one timestamp, and capture the viewport.
    const status2 = await open(shot);
    await page.waitForTimeout(150);
    const frozen = await freezeAt(MOTION_FREEZE_MS);
    await page.waitForTimeout(120);
    const motionOut = join(args.outDir, `${shot.name}-motion-state.png`);
    await page.screenshot({ path: motionOut, fullPage: false });
    await page.unroute(`**${shot.path}`);

    const ok = status === 200 && status2 === 200 && skinLive;
    steps.push({ label: shot.label, url: `${args.baseUrl}${shot.path}`, status, status2, skinLive, frozen, fullPageOut, motionOut });
    console.log(`${ok ? "PASS" : "FAIL"}  ${shot.label}: GET -> ${status}/${status2}, skin live ${skinLive}, animations frozen ${frozen}`);
    console.log(`      ${fullPageOut}`);
    console.log(`      ${motionOut}`);
  }
  writeFileSync(
    join(args.outDir, "render-receipt.json"),
    JSON.stringify(
      {
        renderedAt: new Date().toISOString(),
        baseUrl: args.baseUrl,
        viewport: VIEWPORT,
        fullPage: true,
        headless: true,
        executablePath,
        motionFreezeMs: MOTION_FREEZE_MS,
        assetHostMapped: ASSET_HOST,
        failedRequests,
        steps,
      },
      null,
      2,
    ) + "\n",
  );
  process.exit(steps.every((s) => s.status === 200 && s.status2 === 200 && s.skinLive) ? 0 : 1);
} finally {
  await browser.close();
}

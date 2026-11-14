#!/usr/bin/env node
// render-directions-b.mjs: capture the two front-door directions as full-page
// screenshots in a hidden throwaway browser.
//
//   node scripts/frontdoor-directions-b/render-directions-b.mjs
//     [--base-url http://127.0.0.1:3118]
//     [--out-dir tmp/frontdoor-directions-b-20261026]
//
// The browser is headless Chromium (the installed Chrome or Edge binary) with
// a throwaway in-memory profile: nothing visible opens, the machine's own
// browser is never touched, and the pattern is the checkout's own harness
// pattern (tools/edge-signed-in-exercise/lib/harness-browser.mjs). Viewport
// 1440x900; the screenshot is full-page (the whole scroll height), per the
// direction brief. Nothing here publishes anything: the PNGs land in the
// checkout's tmp folder.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const DEFAULT_BASE_URL = "http://127.0.0.1:3118";
const DEFAULT_OUT_DIR = join(repoRoot, "tmp", "frontdoor-directions-b-20261026");
const VIEWPORT = { width: 1440, height: 900 };

const BROWSER_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

const SHOTS = [
  {
    file: "product-grid.png",
    path: `/Culturesmith%2BProduct%20Grid%20Door`,
    marker: "pgd-main",
    label: "Direction 1, Product grid",
  },
  {
    file: "three-doors.png",
    path: `/Culturesmith%2BThree%20Doors`,
    marker: "td-main",
    label: "Direction 2, Three doors",
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
          "render-directions-b: full-page screenshots of the two directions\n" +
          "  --base-url <url>   the running deck (default http://127.0.0.1:3118)\n" +
          "  --out-dir <dir>    where the PNGs land (default tmp/frontdoor-directions-b-20261026)",
        );
        process.exit(0);
        break;
      default:
        console.error(`render-directions-b: unknown argument ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const executablePath = BROWSER_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error("render-directions-b: no installed Chrome or Edge found");
  process.exit(2);
}

// Served pages name their assets on the deck's production CDN host
// (vm-staging-server.mjs rewrites every asset URL to SPACES_HOST for
// fidelity with the deployed deck's bytes). That host has no local DNS: the
// .example TLD is unroutable. The staging server itself serves the same
// assets on its own origin at the /files/~<cardId>/<action>.<ext> route
// (probe: /files/~45514/<any>.css -> 200, /files/~50617/<any>.js -> 200).
// This harness rewrites that one absolute prefix in the document's HTML to
// the serving origin's ~ form before the browser loads it, so the render
// loads the deck's own stylesheet and script and nothing is invented: the
// document bytes are the server's own response, and the mapped assets are
// the same cards' asset routes. The corpus's historical image attachments
// are not in this local deck copy (boot-demo-scratch.mjs), so image URLs
// answer 404 and the navbar logo shows its alt text: the local deck's own
// state, unchanged.
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
  const steps = [];
  for (const shot of SHOTS) {
    const url = `${args.baseUrl}${shot.path}`;
    // The page's load event waits on third-party kit scripts that may stall;
    // the render needs the document, the deck's own assets and the icon
    // font, so it waits for the DOM, then for the skin marker, then settles.
    await page.route(`**${shot.path}`, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).split(ASSET_PREFIX_FROM).join(`${args.baseUrl}/files/~`);
      await route.fulfill({ response, body }).catch(() => {});
    });
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    const status = response?.status() ?? 0;
    await page.waitForSelector("article[role=main]", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500); // let the stylesheet, script and icon font settle
    const skinLive = await page.evaluate((marker) => document.body.innerHTML.includes(marker), shot.marker);
    const out = join(args.outDir, shot.file);
    await page.screenshot({ path: out, fullPage: true });
    const ok = status === 200 && skinLive;
    steps.push({ label: shot.label, url, status, skinLive, out });
    console.log(`${ok ? "PASS" : "FAIL"}  ${shot.label}: GET ${url} -> ${status}, skin live ${skinLive}, shot ${out}`);
    await page.unroute(`**${shot.path}`);
  }
  writeFileSync(join(args.outDir, "render-receipt.json"), JSON.stringify({
    renderedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    viewport: VIEWPORT,
    fullPage: true,
    headless: true,
    executablePath,
    assetHostMapped: ASSET_HOST,
    failedRequests,
    steps,
  }, null, 2) + "\n");
  process.exit(steps.every((s) => s.status === 200 && s.skinLive) ? 0 : 1);
} finally {
  await browser.close();
}

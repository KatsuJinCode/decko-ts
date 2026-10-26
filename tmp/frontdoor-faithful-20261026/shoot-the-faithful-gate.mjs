// shoot-the-faithful-gate.mjs
//
// PURPOSE
// The acceptance gate the 2026-10-26 ship order names: render the rebuilt
// snapshot and the site's real front page side by side in a hidden
// throwaway browser at 1280x900, save both images, and record the measured
// facts (nav, container width, typography, spacing, colors) the verdict
// rests on. A CSS-rule count is not acceptance; this run produces the two
// pictures and the numbers, and the verdict itself is written after the
// pictures are actually looked at.
//
// THE REAL FRONT PAGE
// The site's fixed edge copy of / (https://culturesmith-edge.bunny.run/),
// reachable this run (HTTP 200). The reference harness's own launcher is
// not used for it because its request policy allows only the stock layout
// CDNs and would abort the edge page's own stylesheet and images, which are
// the very thing being judged. This script drives playwright-core directly
// with the same hidden headless throwaway-profile rules and a tight host
// allowlist: the edge host, its asset CDN, and the Google font hosts the
// page's icon stylesheets reference. Every other outside host is refused.
//
// Usage: node shoot-the-faithful-gate.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = "C:/localProjects/decko-ts-frontdoor-faithful-20261026/tmp/frontdoor-faithful-20261026";
const SNAPSHOT = `${HERE}/index.html`;
const REAL_FRONT_PAGE = "https://culturesmith-edge.bunny.run/";
const VIEWPORT = { width: 1280, height: 900 };

// playwright-core comes from a sibling checkout's installed node_modules; this
// fresh worktree has none and nothing is downloaded or installed for the gate.
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

const ALLOWED_HOST_SUFFIXES = [
  "culturesmith-edge.bunny.run",
  "culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

const hostAllowed = (url) => {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
};

const collectFacts = async (page) =>
  page.evaluate(() => {
    const cs = (el, props) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, s[p]]));
    };
    const header = document.querySelector("header");
    const navbar = document.querySelector("header nav.navbar, header .navbar");
    const navContainer = document.querySelector("header nav .container, header .navbar .container");
    const searchInput = document.querySelector('form[role="search"] input[type="text"]');
    const signup = document.querySelector(".signup-link");
    const signin = document.querySelector(".signin-link");
    const article = document.querySelector("article");
    const h2 = document.querySelector("article h2");
    const body = document.body;
    const footer = document.querySelector("footer");
    return {
      title: document.title,
      headerPresent: Boolean(header),
      headerHeightPx: header ? Math.round(header.getBoundingClientRect().height) : null,
      navbarBg: navbar ? cs(navbar, ["backgroundColor", "borderColor"]) : null,
      navLinkCount: document.querySelectorAll("header a").length,
      navTextSample: [...document.querySelectorAll("header a")].slice(0, 6).map((a) => a.textContent.trim()).filter(Boolean),
      searchPresent: Boolean(searchInput),
      signupPresent: Boolean(signup),
      signinPresent: Boolean(signin),
      navContainerMaxWidth: navContainer ? getComputedStyle(navContainer).maxWidth : null,
      articleMaxWidth: article ? getComputedStyle(article).maxWidth : null,
      articlePaddingX: article ? cs(article, ["paddingLeft", "paddingRight"]) : null,
      h2: h2 ? cs(h2, ["fontSize", "fontFamily", "fontWeight", "color", "marginTop", "marginBottom"]) : null,
      bodyBg: getComputedStyle(body).backgroundColor,
      bodyFont: (() => { const s = getComputedStyle(body); return `${s.fontSize} ${s.fontFamily.slice(0, 60)}`; })(),
      bodyColor: getComputedStyle(body).color,
      linkColor: (() => { const a = document.querySelector("article a"); return a ? getComputedStyle(a).color : null; })(),
      footerPresent: Boolean(footer),
      logoVisible: (() => {
        const img = document.querySelector("header img");
        if (!img) return false;
        const r = img.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && img.complete && img.naturalWidth > 0;
      })(),
    };
  });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decko-browser-profile-faithful-gate-"));
fs.writeFileSync(path.join(profile, ".decko-owner.json"), JSON.stringify({ pid: process.pid }));
const closeProfile = () => fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

let browser;
try {
  browser = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: findBrowser(),
    viewport: VIEWPORT,
    acceptDownloads: false,
    args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio"],
  });
} catch (err) {
  closeProfile();
  throw err;
}

try {
  // --- page 1: the rebuilt snapshot (fully inline, zero network) --------------
  const p1 = browser.pages()[0] ?? (await browser.newPage());
  await p1.setViewportSize(VIEWPORT);
  await p1.goto(pathToFileURL(SNAPSHOT).href, { waitUntil: "load" });
  await p1.waitForTimeout(800);
  await p1.screenshot({ path: `${HERE}/gate-snapshot-1280x900.png` });
  const snapshotFacts = await collectFacts(p1);
  console.log("snapshot facts:", JSON.stringify(snapshotFacts, null, 1));

  // --- page 2: the site's real front page (the fixed edge copy of /) ---------
  const p2 = await browser.newPage();
  await p2.setViewportSize(VIEWPORT);
  await p2.route(
    (url) => /^(https?|wss?):$/.test(url.protocol) && !hostAllowed(url),
    (route) => route.abort("blockedbyclient"),
  );
  const blocked = [];
  p2.on("requestfailed", (req) => { if (req.failure()?.errorText === "blockedbyclient") blocked.push(req.url()); });
  await p2.goto(REAL_FRONT_PAGE, { waitUntil: "load", timeout: 45000 });
  await p2.waitForTimeout(2500);
  await p2.screenshot({ path: `${HERE}/gate-real-front-page-1280x900.png` });
  const realFacts = await collectFacts(p2);
  console.log("real front page facts:", JSON.stringify(realFacts, null, 1));
  console.log(`blocked request count (outside the allowlist): ${blocked.length}`);

  // --- the side-by-side picture ----------------------------------------------
  // The composite is written to a real file beside the screenshots and opened
  // by its file:// URL: a setContent page keeps an about:blank origin, and
  // Chromium refuses file:// subresources from a non-file origin.
  const composite = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; background:#222; color:#fff; font:14px/1.4 sans-serif; }
    .row { display:flex; }
    .cell { width:1280px; }
    .cell img { display:block; width:1280px; height:900px; }
    .cell .cap { padding:4px 10px; background:#000; }
  </style></head><body><div class="row">
    <div class="cell"><div class="cap">NEW SNAPSHOT (front-door-in-decko-2, local build)</div><img src="gate-snapshot-1280x900.png"></div>
    <div class="cell"><div class="cap">REAL FRONT PAGE (culturesmith-edge.bunny.run/)</div><img src="gate-real-front-page-1280x900.png"></div>
  </div></body></html>`;
  fs.writeFileSync(`${HERE}/gate-side-by-side.html`, composite);
  const p3 = await browser.newPage();
  await p3.setViewportSize({ width: 2600, height: 940 });
  await p3.goto(pathToFileURL(`${HERE}/gate-side-by-side.html`).href, { waitUntil: "load" });
  await p3.waitForTimeout(500);
  const imgsOk = await p3.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  if (!imgsOk) throw new Error("the side-by-side composite did not load both screenshots");
  await p3.screenshot({ path: `${HERE}/gate-side-by-side.png`, fullPage: true });
  console.log("side-by-side composite written (both images loaded)");

  fs.writeFileSync(`${HERE}/gate-facts.json`, JSON.stringify({ generatedAt: new Date().toISOString(), snapshot: snapshotFacts, realFrontPage: realFacts, blockedRequestCount: blocked.length }, null, 2) + "\n");
  console.log("facts written: gate-facts.json");
} finally {
  await browser.close().finally(closeProfile);
}
console.log("gate screenshots complete");

// render-home-variants.mjs: render the two home-page design variants in a
// hidden throwaway browser at 1440x900, save the full-page screenshots next
// to the live reference, and compose the side-by-side picture the lane brief
// asks for.
//
//   node scripts/homepage-variants/render-home-variants.mjs
//     [--base-url http://127.0.0.1:3118]
//     [--out <dir>]          default tmp/homepage-variants-20261026
//
// The browser is headless with a throwaway profile that is removed when the
// run ends (the automated-test posture: hidden, silent, no real profile).
// The network is restricted to the loopback demo surface: every other host
// the pages name (the anonymized storage host in the head, the Material
// Icons stylesheet) is refused, and the refusal count is recorded, so the
// pictures show what the pages stand on locally.
//
// Nothing here deploys anywhere and nothing outside the loopback address is
// contacted.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = "C:/localProjects/decko-ts-demo-scratch-20261025";
const PLAYWRIGHT_CORE = `${HERE}/node_modules/playwright-core`;
const REFERENCE = "C:/localProjects/brandonDojoTech/tmp/demo-index-audit-20261025/reference-live-home-signed-in.png";

function parseArgs(argv) {
  const args = { baseUrl: "http://127.0.0.1:3118", out: `${HERE}/tmp/homepage-variants-20261026` };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--base-url": args.baseUrl = value.replace(/\/+$/, ""); i += 1; break;
      case "--out": args.out = resolve(value); i += 1; break;
      default:
        console.error(`render-home-variants: unknown argument ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const VIEWPORT = { width: 1440, height: 900 };

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

const hostAllowed = (url) => {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost";
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
    const body = document.body;
    const article = document.querySelector("article");
    const slots = [...document.querySelectorAll("article [data-card-name]")];
    const intro = slots.map((s) => s.dataset.cardName).find((n) => n.includes("Intro"));
    const heroImg = document.querySelector("article img");
    const link = document.querySelector("article a");
    return {
      title: document.title,
      bodyClass: body.className,
      bodyBg: getComputedStyle(body).backgroundColor,
      bodyFont: (() => { const s = getComputedStyle(body); return `${s.fontSize} ${s.fontFamily.slice(0, 48)}`; })(),
      articleMaxWidth: article ? getComputedStyle(article).maxWidth : null,
      cardCount: slots.length,
      cardNames: slots.map((s) => s.dataset.cardName),
      introType: intro ? cs(document.querySelector(`[data-card-name="${intro}"] p`), ["fontSize", "lineHeight", "fontWeight", "color"]) : null,
      heroImgNatural: heroImg ? `${heroImg.naturalWidth}x${heroImg.naturalHeight}` : null,
      heroImgDisplayed: heroImg ? `${Math.round(heroImg.getBoundingClientRect().width)}x${Math.round(heroImg.getBoundingClientRect().height)}` : null,
      heroLoaded: heroImg ? Boolean(heroImg.complete && heroImg.naturalWidth > 0) : false,
      linkColor: link ? getComputedStyle(link).color : null,
      pageHeight: Math.round(document.documentElement.scrollHeight),
      logoShownByCss: (() => {
        const brand = document.querySelector(".nav-logo");
        if (!brand) return false;
        const before = getComputedStyle(brand, "::before");
        return before.content !== "none" && before.backgroundImage.includes("data:image");
      })(),
    };
  });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decko-browser-profile-home-variants-"));
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
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  throw err;
}

const facts = {};
try {
  // --- the two variant pages, signed out, loopback only ----------------------
  for (const [label, urlPath] of [
    ["A", "/Culturesmith+Home_Variant_A"],
    ["B", "/Culturesmith+Home_Variant_B"],
  ]) {
    const page = browser.pages()[0] ?? (await browser.newPage());
    await page.setViewportSize(VIEWPORT);
    const blocked = [];
    page.on("requestfailed", (req) => { if (req.failure()?.errorText === "blockedbyclient") blocked.push(req.url()); });
    await page.route(
      (url) => /^(https?|wss?):$/.test(url.protocol) && !hostAllowed(url),
      (route) => route.abort("blockedbyclient"),
    );
    await page.goto(`${args.baseUrl}${urlPath}`, { waitUntil: "load", timeout: 45000 });
    await page.waitForTimeout(900);
    const shot = `${args.out}/variant-${label.toLowerCase()}-1440x900-fullpage.png`;
    await page.screenshot({ path: shot, fullPage: true });
    facts[label] = await collectFacts(page);
    facts[label].blockedOutsideLoopback = blocked.length;
    facts[label].screenshot = shot;
    console.log(`variant ${label}: ${shot} (${fs.statSync(shot).size} bytes, page height ${facts[label].pageHeight}px, blocked outside loopback: ${blocked.length})`);
  }

  // --- the reference beside them --------------------------------------------
  fs.copyFileSync(REFERENCE, `${args.out}/reference-live-home-signed-in.png`);

  // --- the side-by-side picture ---------------------------------------------
  // Written to a real file and opened by its file:// URL: a setContent page
  // keeps an about:blank origin, and Chromium refuses file:// subresources
  // from a non-file origin.
  const composite = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; background:#1b1d20; color:#e8e9eb; font:13px/1.4 sans-serif; }
    .row { display:flex; align-items:flex-start; }
    .cell { width:730px; margin:0 4px 8px; }
    .cell img { display:block; width:730px; height:auto; border:1px solid #000; }
    .cell .cap { padding:5px 10px; background:#000; }
  </style></head><body><div class="row">
    <div class="cell"><div class="cap">VARIANT A - the same site, sharper (127.0.0.1:3118/Culturesmith+Home_Variant_A, full page)</div><img src="variant-a-1440x900-fullpage.png"></div>
    <div class="cell"><div class="cap">VARIANT B - the decko-native home (127.0.0.1:3118/Culturesmith+Home_Variant_B, full page)</div><img src="variant-b-1440x900-fullpage.png"></div>
    <div class="cell"><div class="cap">REFERENCE - the live Home page (culturesmith.com, signed in, captured 2026-10-25)</div><img src="reference-live-home-signed-in.png"></div>
  </div></body></html>`;
  fs.writeFileSync(`${args.out}/side-by-side.html`, composite);
  const p3 = await browser.newPage();
  await p3.setViewportSize({ width: 2280, height: 950 });
  await p3.goto(pathToFileURL(`${args.out}/side-by-side.html`).href, { waitUntil: "load" });
  await p3.waitForTimeout(600);
  const imgsOk = await p3.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  if (!imgsOk) throw new Error("the side-by-side composite did not load all three pictures");
  await p3.screenshot({ path: `${args.out}/side-by-side.png`, fullPage: true });
  console.log(`side-by-side composite written (${fs.statSync(`${args.out}/side-by-side.png`).size} bytes)`);

  fs.writeFileSync(`${args.out}/render-facts.json`, JSON.stringify({ generatedAt: new Date().toISOString(), viewport: VIEWPORT, baseUrl: args.baseUrl, variants: facts }, null, 2) + "\n");
  console.log("facts written: render-facts.json");
} finally {
  await browser.close().finally(() => {
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // the throwaway profile is regenerable scratch; never fail the run over its cleanup
    }
  });
}
console.log("variant renders complete");

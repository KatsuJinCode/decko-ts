#!/usr/bin/env node
// capture-storefront-home.mjs: render the storefront home page in a hidden
// throwaway browser and photograph it, full page and mid-hover.
//
//   node scripts/storefront-home/capture-storefront-home.mjs
//     [--url http://127.0.0.1:3118/Storefront%20Home]
//     [--out-dir tmp/homepage-storefront-20261026]
//
// The browser: the machine's installed Chrome via playwright-core, headless,
// a throwaway profile directory, nothing visible opens, the operator's own
// browser is never touched (the reference-harness launch pattern). The
// request filter lets the page load only from the local origin, the stock
// layout CDNs, the deck's asset host, and the library's Bunny pull zone
// (the hero video and its poster); everything else is blocked and recorded.
//
// Evidence, not vibes: the receipt records the video's muted/volume/
// currentTime before the hover, while hovered, and after the pointer leaves,
// plus the audio pill's visible text, so the hover-for-audio behavior is a
// measured fact and not a claim.
//
// Exit 0 when both photographs and the hover evidence landed, 1 otherwise.

import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const DEFAULT_URL = "http://127.0.0.1:3118/Storefront%20Home";
const DEFAULT_OUT_DIR = resolve("tmp/homepage-storefront-20261026");

const BROWSER_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

const ALLOWED_HOST_SUFFIXES = [
  "127.0.0.1",
  "localhost",
  "production-storage.r1.cdn.objectstore.example",
  "code.jquery.com",
  "cdnjs.cloudflare.com",
  "kit.fontawesome.com",
  "ka-f.fontawesome.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "vz-177c889c-f94.b-cdn.net",
];

function parseArgs(argv) {
  const args = { url: DEFAULT_URL, outDir: DEFAULT_OUT_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--url") { args.url = argv[i + 1]; i += 1; }
    else if (argv[i] === "--out-dir") { args.outDir = resolve(argv[i + 1]); i += 1; }
    else { console.error(`capture-storefront-home: unknown argument ${argv[i]}`); process.exit(2); }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
mkdirSync(args.outDir, { recursive: true });

const exe = BROWSER_CANDIDATES.find((p) => {
  try { return require("node:fs").existsSync(p); } catch { return false; }
});
if (!exe) {
  console.error("capture-storefront-home: no installed Chrome or Edge found");
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), "cs-storefront-capture-"));
const blocked = [];

const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: ["--window-size=1440,900", "--mute-audio"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await context.route("**/*", (route) => {
    let host = "";
    try {
      host = new URL(route.request().url()).hostname;
    } catch {
      blocked.push({ url: String(route.request().url), host: "(unparseable)" });
      return route.abort();
    }
    if (ALLOWED_HOST_SUFFIXES.includes(host)) return route.continue();
    blocked.push({ url: route.request().url, host });
    return route.abort();
  });

  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  const badResponses = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("requestfailed", (req) => failedRequests.push({ url: req.url(), error: req.failure()?.errorText }));
  page.on("response", (res) => { if (res.status() >= 400) badResponses.push({ url: res.url(), status: res.status() }); });

  // The hero video is a several-hundred-MB stream; the load event would wait
  // on it. domcontentloaded plus the bounded video-playing wait below is the
  // honest signal that the page is up and the video plays.
  await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 45000 });

  // Wait until the hero video is actually playing (frames advancing), bounded.
  const videoState = async () => page.evaluate(() => {
    const v = document.querySelector("video.cs-ambient");
    if (!v) return null;
    return {
      muted: v.muted,
      volume: v.volume,
      currentTime: v.currentTime,
      paused: v.paused,
      readyState: v.readyState,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
    };
  });

  let played = false;
  for (let i = 0; i < 40 && !played; i += 1) {
    const s = await videoState();
    played = Boolean(s && !s.paused && s.currentTime > 0.05 && s.readyState >= 2);
    if (!played) await page.waitForTimeout(250);
  }
  const stateBeforeHover = await videoState();
  const pillBefore = await page.evaluate(() => {
    const pill = document.querySelector(".cs-audio-pill");
    return pill ? pill.textContent.trim() : null;
  });

  await page.waitForTimeout(400);
  const shotFull = join(args.outDir, "storefront-home-full.png");
  await page.screenshot({ path: shotFull, fullPage: true });

  // Mid-hover: pointer over the video area (upper part of the stage, clear of
  // the copy and the doors), let the fade run, then photograph.
  const stage = await page.locator(".cs-hero-stage").boundingBox();
  if (!stage) {
    console.error("capture-storefront-home: no .cs-hero-stage on the page");
    process.exit(1);
  }
  const hoverX = stage.x + stage.width / 2;
  const hoverY = stage.y + Math.min(stage.height * 0.28, 220);
  await page.mouse.move(hoverX, hoverY, { steps: 8 });
  await page.waitForTimeout(1400);
  const stateHover = await videoState();
  const pillHover = await page.evaluate(() => {
    const stageEl = document.querySelector(".cs-hero-stage");
    const pill = document.querySelector(".cs-audio-pill");
    return {
      audibleClass: stageEl ? stageEl.classList.contains("is-audible") : null,
      pillText: pill ? pill.textContent.trim() : null,
      mutedLineShown: pill ? getComputedStyle(pill.querySelector(".cs-pill-muted")).display : null,
      liveLineShown: pill ? getComputedStyle(pill.querySelector(".cs-pill-live")).display : null,
    };
  });
  // The pill is a flex container: a flex item's computed display is
  // blockified, so "shown" here means not-none, not a specific keyword.
  const pillHoverOk = pillHover.audibleClass === true && pillHover.liveLineShown !== "none" && pillHover.mutedLineShown === "none";
  const shotHover = join(args.outDir, "storefront-home-hero-hover.png");
  await page.screenshot({ path: shotHover, fullPage: true });

  // Pointer out: the audio must fade back to silent.
  await page.mouse.move(hoverX, 10, { steps: 6 });
  await page.waitForTimeout(1400);
  const stateAfterOut = await videoState();
  const pillAfter = await page.evaluate(() => {
    const stageEl = document.querySelector(".cs-hero-stage");
    return stageEl ? stageEl.classList.contains("is-audible") : null;
  });

  const hoverOk = Boolean(
    stateHover && !stateHover.muted && stateHover.volume > 0.4 && pillHoverOk,
  );
  const outOk = Boolean(stateAfterOut && stateAfterOut.muted === true && pillAfter === false);
  const playedOk = Boolean(stateBeforeHover && !stateBeforeHover.paused && stateBeforeHover.currentTime > 0.05);

  const receipt = {
    capturedAt: new Date().toISOString(),
    url: args.url,
    viewport: { width: 1440, height: 900 },
    browser: { executable: exe, headless: true, profile: "throwaway (mkdtemp, removed context)" },
    screenshots: { fullPage: shotFull, midHover: shotHover },
    video: { beforeHover: stateBeforeHover, whileHovered: stateHover, afterPointerOut: stateAfterOut },
    audioPill: { beforeHover: pillBefore, whileHovered: pillHover, afterPointerOutAudible: pillAfter },
    checks: { videoPlaying: playedOk, hoverFadesAudioIn: hoverOk, pointerOutFadesBackToSilent: outOk },
    consoleErrors,
    failedRequests,
    badResponses,
    blockedRequests: blocked,
    passed: playedOk && hoverOk && outOk,
  };
  writeFileSync(join(args.outDir, "storefront-capture-receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(`video playing: ${playedOk}`);
  console.log(`hover fades audio in: ${hoverOk} (muted=${stateHover?.muted}, volume=${stateHover?.volume?.toFixed(2)}, pill=${pillHover.pillText})`);
  console.log(`pointer out fades back to silent: ${outOk}`);
  console.log(`console errors: ${consoleErrors.length}`);
  console.log(`failed requests: ${failedRequests.length} ${JSON.stringify(failedRequests).slice(0, 600)}`);
  console.log(`4xx/5xx responses: ${badResponses.length} ${JSON.stringify(badResponses).slice(0, 600)}`);
  console.log(`blocked requests: ${blocked.length}`);
  console.log(`screenshots: ${shotFull} + ${shotHover}`);
  process.exit(receipt.passed ? 0 : 1);
} finally {
  await browser.close();
}

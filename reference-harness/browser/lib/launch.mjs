// Launches a hidden (headless) Chromium-family browser with a throwaway
// profile, through playwright-core, using a browser already installed on the
// machine. Nothing is downloaded.
//
//   HARNESS_PLAYWRIGHT_CORE  directory of an installed playwright-core package
//                            (default: resolve "playwright-core" from here)
//   HARNESS_CHROME           browser executable (default: the first installed
//                            Chrome, Edge or Chromium found in the usual places)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export async function loadPlaywright() {
  const dir = process.env.HARNESS_PLAYWRIGHT_CORE;
  if (dir) {
    const entry = path.join(dir, "index.mjs");
    return import(pathToFileURL(fs.existsSync(entry) ? entry : path.join(dir, "index.js")).href);
  }
  try {
    return await import("playwright-core");
  } catch {
    const require = createRequire(import.meta.url);
    return require("playwright-core");
  }
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const STOCK_LAYOUT_CDNS = new Set([
  "code.jquery.com",
  "cdnjs.cloudflare.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "kit.fontawesome.com",
  "ka-f.fontawesome.com",
]);

const CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

export function findBrowser() {
  if (process.env.HARNESS_CHROME) return process.env.HARNESS_CHROME;
  const found = CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error("no installed Chrome, Edge or Chromium found; set HARNESS_CHROME to a browser executable");
  }
  return found;
}

// Returns { context, close }. The profile directory is created empty and
// removed on close, whatever happened in between.
export async function launchBrowser({ viewport = { width: 1280, height: 900 } } = {}) {
  const { chromium } = await loadPlaywright();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decko-browser-profile-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      executablePath: findBrowser(),
      viewport,
      acceptDownloads: false,
      args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio"],
    });
  } catch (err) {
    fs.rmSync(profile, { recursive: true, force: true });
    throw err;
  }
  // Requests leave the machine only for the public script and font CDNs a
  // stock Decko layout itself links (jQuery, jquery-ujs, ace, select2, icon
  // fonts); without them Decko's editors and forms do not run, on any engine.
  // Every other outside host is refused in the browser. HARNESS_OFFLINE=1
  // refuses the CDNs too.
  const offline = process.env.HARNESS_OFFLINE === "1";
  await context.route(
    (url) =>
      /^(https?|wss?):$/.test(url.protocol) &&
      !LOCAL_HOSTS.has(url.hostname) &&
      (offline || !STOCK_LAYOUT_CDNS.has(url.hostname)),
    (route) => route.abort("blockedbyclient"),
  );
  const close = async () => {
    try {
      await context.close();
    } finally {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  };
  return { context, close, version: context.browser()?.version() ?? "" };
}

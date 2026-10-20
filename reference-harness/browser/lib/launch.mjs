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
import { spawnSync } from "node:child_process";
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


// Google's documented reCAPTCHA script/frame/connect paths. Keep every
// unrelated Google path blocked, and retain the explicit offline policy.
export function allowedBrowserRequest(url, offline = false) {
  if (LOCAL_HOSTS.has(url.hostname)) return true;
  if (offline) return false;
  if (STOCK_LAYOUT_CDNS.has(url.hostname)) return true;
  return url.protocol === "https:" &&
    ["www.google.com", "www.gstatic.com", "recaptcha.google.com"].includes(url.hostname) &&
    url.pathname.startsWith("/recaptcha/");
}

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

const PROFILE_PREFIX = "decko-browser-profile-";
const OWNER_FILE = ".decko-owner.json";

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === "EPERM"; }
}

// A run that is killed (a timeout, an aborted agent) never reaches close(), and its
// hidden browser outlives it: 7 such browsers were found running on 2026-10-20. Every
// launch therefore ends the browsers of earlier runs whose owning process is gone
// (the whole process tree, since ending Chrome's parent leaves its renderers) and
// removes their profiles. A profile whose owner is still alive is never touched.
export function reapOrphanedBrowsers({ tmp = os.tmpdir(), list = listBrowserRoots, kill = killTree } = {}) {
  let names;
  try { names = fs.readdirSync(tmp).filter((n) => n.startsWith(PROFILE_PREFIX)); } catch { return []; }
  const orphaned = names.map((n) => path.join(tmp, n)).filter((profile) => {
    try {
      const { pid } = JSON.parse(fs.readFileSync(path.join(profile, OWNER_FILE), "utf8"));
      return !processAlive(pid);
    } catch {
      return false; // no owner record: written by a version without one; leave it
    }
  });
  if (!orphaned.length) return [];
  const roots = list();
  for (const profile of orphaned) {
    for (const r of roots) if (r.commandLine.toLowerCase().includes(profile.toLowerCase())) kill(r.pid);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return orphaned;
}

function listBrowserRoots() {
  if (process.platform !== "win32") {
    const r = spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
    return (r.stdout || "").split("\n").map((l) => l.trim().match(/^(\d+)\s+(.*)$/)).filter(Boolean)
      .filter((m) => m[2].includes(PROFILE_PREFIX) && !m[2].includes("--type=")).map((m) => ({ pid: Number(m[1]), commandLine: m[2] }));
  }
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command",
    "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*" + PROFILE_PREFIX + "*' -and $_.CommandLine -notlike '*--type=*' } | ForEach-Object { '' + $_.ProcessId + [char]9 + $_.CommandLine }"],
    { encoding: "utf8", windowsHide: true, timeout: 20000 });
  return (r.stdout || "").split(/\r?\n/).filter(Boolean).map((l) => {
    const [pid, ...rest] = l.split("\t");
    return { pid: Number(pid), commandLine: rest.join("\t") };
  });
}

function killTree(pid) {
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { windowsHide: true, timeout: 20000 });
  else { try { process.kill(pid, "SIGKILL"); } catch {} }
}

// Returns { context, close }. The profile directory is created empty and
// removed on close, whatever happened in between.
export async function launchBrowser({ viewport = { width: 1280, height: 900 } } = {}) {
  const { chromium } = await loadPlaywright();
  reapOrphanedBrowsers();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), PROFILE_PREFIX));
  fs.writeFileSync(path.join(profile, OWNER_FILE), JSON.stringify({ pid: process.pid }));
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
      !allowedBrowserRequest(url, offline),
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

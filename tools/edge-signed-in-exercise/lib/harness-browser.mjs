// harness-browser.mjs — the browser driver for the signed-in edge exercise.
//
// A hidden Chromium (headless, throwaway profile, installed Chrome — the
// pattern in reference-harness/browser/lib/launch.mjs) against the local
// HTTPS edge host. Nothing visible opens; the machine's own browser is never
// touched. The request filter lets the page load only from the local origin
// and the stock layout CDNs the editor and fonts need, exactly as the
// journeys harness does; the deck's own asset host (the configured
// DECKO_SERVED_* URLs) is allowed over https so a signed-in page's styling
// and TinyMCE assets can actually load and be checked.
//
// Every observation a check needs is captured as evidence: the page's title,
// whether the account name and "Sign out" are in the navbar, the
// decko.signed_in flag, the Server-Timing header, any console errors, and
// any failed (blocked) subresource requests.

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const STOCK_LAYOUT_CDNS = new Set([
  "code.jquery.com",
  "cdnjs.cloudflare.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "kit.fontawesome.com",
  "ka-f.fontawesome.com",
]);

const BROWSER_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

function findBrowser() {
  for (const p of BROWSER_CANDIDATES) if (existsSync(p)) return p;
  throw new Error("no installed Chrome/Edge found for the harness browser");
}

// playwright-core, resolved from the repo's node_modules.
async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  return require("playwright-core");
}

/** Reads the deck's configured asset host so the browser may load it. */
function assetHostsFromEnv(env) {
  const hosts = new Set();
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith("DECKO_SERVED_") || typeof v !== "string" || !/^https?:\/\//i.test(v)) continue;
    try { hosts.add(new URL(v).hostname); } catch { /* not a url */ }
  }
  return [...hosts];
}

/**
 * Launches the throwaway browser and returns { page, close, consoleErrors, blocked }.
 * @param {{ origin: string, assetHosts: string[] }} opts
 */
export async function launchHarnessBrowser({ origin, assetHosts }) {
  const { chromium } = await loadPlaywright();
  const executablePath = findBrowser();
  const profile = mkdtempSync(join(tmpdir(), "edge-signed-in-profile-"));
  const allowedAssets = new Set(assetHosts);
  const consoleErrors = [];
  const dialogs = [];
  const blocked = [];
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      executablePath,
      ignoreHTTPSErrors: true, // the harness origin's throwaway self-signed certificate
      viewport: { width: 1280, height: 900 },
      acceptDownloads: false,
      args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio"],
    });
  } catch (error) {
    rmSync(profile, { recursive: true, force: true });
    throw error;
  }
  // Requests may reach the local origin, the deck's configured asset host and
  // the stock layout CDNs. Anything else is blocked, so the page can never
  // reach the live site.
  await context.route(
    (url) => /^(https?|wss?):$/.test(url.protocol) && !LOCAL_HOSTS.has(url.hostname) && !allowedAssets.has(url.hostname) && !STOCK_LAYOUT_CDNS.has(url.hostname),
    (route) => route.abort("blockedbyclient"),
  );
  const page = await context.newPage();
  // Delete links are confirm-guarded; the harness answers the confirm as a
  // person who pressed OK, and records that it did.
  page.on("dialog", (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message().slice(0, 120) });
    dialog.accept().catch(() => undefined);
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      blocked.push({ url: response.url(), status: response.status() });
    }
  });
  page.on("requestfailed", (request) => {
    blocked.push({ url: request.url(), status: `failed:${request.failure()?.errorText ?? "unknown"}` });
  });

  return {
    page,
    consoleErrors,
    dialogs,
    blocked,
    close: async () => {
      try { await context.close(); } finally { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    },
  };
}

/** One page visit, with the evidence the checks grade. */
export async function visit(page, url, { waitFor = "load" } = {}) {
  const started = Date.now();
  const response = await page.goto(url, { waitUntil: waitFor, timeout: 60_000 });
  const wallMs = Date.now() - started;
  const html = await page.content();
  const timing = await page.evaluate(() => {
    // The edge sets Server-Timing; Playwright exposes response headers, but the
    // navigation entry also carries it, so read the header the harness sees.
    return performance.getEntriesByType("navigation")[0]?.responseStatus ?? null;
  }).catch(() => null);
  void timing;
  return {
    url: page.url(),
    status: response?.status() ?? null,
    wallMs,
    title: await page.title(),
    html,
    signedIn: /decko\.signed_in/.test(html) || /name="decko\.signed_in"[^>]*value="true"/.test(html),
    hasSignOut: /Sign out/.test(html),
    hasAccountLink: /Harness (Admin|Member)/.test(html),
    serverTiming: null, // filled by the caller from the host ledger
  };
}

/** The signed-in flag as the page itself reports it (the cookie's JS view). */
export async function readSignedInFlag(page) {
  return page.evaluate(() => {
    if (typeof window.decko === "undefined") return { present: false };
    return { present: true, signed_in: window.decko.signed_in === true, keys: Object.keys(window.decko) };
  });
}
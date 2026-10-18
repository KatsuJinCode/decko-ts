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

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { externalBrowserRequestAllowed } from './local-policy.mjs';
import { installWriteGateRoute } from '../../../reference-harness/browser/lib/live-walk-profile.mjs';

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

/** Include child sessions: a blank coordinator page cannot vouch for them. */
export function browserAssetFailures(browsers) {
 return browsers.flatMap((browser,contextIndex)=>browser.blocked
  .filter(item=>['script','stylesheet','font','image'].includes(item.resourceType))
  .map(item=>({...item,contextIndex})));
}

/**
 * True when a console message is Chromium's echo of this harness's own
 * request blocking. The two context.route handlers below abort with
 * 'blockedbyclient', which Chromium reports to the page as
 * net::ERR_BLOCKED_BY_CLIENT (suffixed '.Inspector' on current Chromium,
 * marking CDP-initiated blocking) and logs as a console error. In this
 * browser that error can come only from those handlers: the launch is a
 * throwaway profile with --disable-extensions, so no other client-side
 * blocker exists. Every aborted request is already recorded per-request in
 * `blocked` (url, status, resourceType, context) and graded by the
 * subresource and final-asset checks; recording the echo again as a page
 * console error made the signed-in console check grade the harness's own
 * request policy as a page defect (2026-10-16 and 2026-10-17 runs failed on
 * exactly that echo). Genuine page errors never carry this token.
 */
export function isHarnessRequestAbortEcho(text) {
 return typeof text === 'string' && text.includes('net::ERR_BLOCKED_BY_CLIENT');
}

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
 * @param {{ origin: string, assetHosts: string[], writeGate?: object, ledgerSink?: (line: object) => void }} opts
 *   writeGate  — a live-walk profile (reference-harness/browser/lib/live-walk-profile.mjs).
 *                When present, EVERY context this function creates (main and
 *                isolated children) registers the write-mode backstop route
 *                first: any page-driven write the profile does not admit is
 *                aborted before the ordinary request policy runs. Absent/full
 *                mode -> no gate, the local stack runs as always.
 *   ledgerSink — when present (host-override targets: the owned request ledger
 *                does not exist), every same-origin response is summarized
 *                into it, so ledger-reading checks see the browser's own view
 *                of real traffic and never invented evidence.
 */
export async function launchHarnessBrowser({ origin, assetHosts, allowedFaviconUrls = [], sharedBrowser, writeGate, ledgerSink }) {
  const { chromium } = await loadPlaywright();
  const executablePath = findBrowser();
  const allowedAssets = new Set(assetHosts);
  const consoleErrors = [];
  const dialogs = [];
  const blocked = [];
  let context;
  let browser = sharedBrowser;
  try {
    browser ??= await chromium.launch({
      headless: true,
      executablePath,
      args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio"],
    });
    context = await browser.newContext({
      ignoreHTTPSErrors: true, // the harness origin's throwaway self-signed certificate
      viewport: { width: 1280, height: 900 },
      acceptDownloads: false,
    });
  } catch (error) {
    if (!sharedBrowser) await browser?.close().catch(() => undefined);
    throw error;
  }
  // A non-loopback host-override target must be reachable at all: the two
  // policy routes below admit only loopback origins, asset hosts and stock
  // CDNs. The admit route continues the target origin's own requests; the
  // write-mode gate (registered LAST, so it runs FIRST) has already aborted
  // the writes its mode refuses before anything reaches this route.
  if (writeGate?.override && !LOCAL_HOSTS.has(new URL(origin).hostname)) {
    await context.route((url) => url.origin === origin, (route) => route.continue());
  }
  if (ledgerSink) {
    context.on("requestfinished", async (request) => {
      try {
        const url = new URL(request.url());
        if (url.origin !== origin) return;
        const response = await request.response();
        if (!response) return;
        const t = request.timing();
        // The owned request ledger records what a write answered (bodyHead);
        // the browser-observed stand-in carries the same surface, or checks
        // like sign-in lose their redirect evidence on a host-override run
        // (Chromium can evict a navigated-away XHR body from the response
        // object, but the finished response's text is usually still here).
        let bodyHead;
        if (request.method() !== "GET" && request.method() !== "HEAD") {
          const text = await response.text().catch(() => null);
          if (typeof text === "string") bodyHead = text.replace(/\s+/g, " ").slice(0, 240);
        }
        ledgerSink({
          method: request.method(),
          path: url.pathname + url.search,
          status: response.status(),
          ms: Number.isFinite(t?.responseEnd) ? Math.round(t.responseEnd - t.startTime) : null,
          serverTiming: response.headers()["server-timing"] ?? null,
          ...(bodyHead !== undefined ? { bodyHead } : {}),
          channel: "browser-observed",
        });
      } catch { /* a context closing mid-request must not kill the run */ }
    });
  }
  // Requests may reach the local origin, the deck's configured asset host and
  // the stock layout CDNs. Anything else is blocked, so the page can never
  // reach the live site.
  await context.route(
    (url) => /^(https?|wss?):$/.test(url.protocol) && !LOCAL_HOSTS.has(url.hostname) && !allowedAssets.has(url.hostname) && !STOCK_LAYOUT_CDNS.has(url.hostname),
    (route) => route.abort("blockedbyclient"),
  );
  await context.route('**/*', route => {
    const hosts = new Set([...allowedAssets, ...STOCK_LAYOUT_CDNS]);
    return externalBrowserRequestAllowed(route.request(), { origin, allowedHosts: hosts, allowedFaviconUrls }) ? route.fallback() : route.abort('blockedbyclient');
  });
  // The live-walk write gate is registered LAST, so it runs FIRST: it aborts
  // the writes its mode refuses and defers (route.fallback) everything else
  // to the routes above. context.route covers page forms and page fetches;
  // the context.request channel is guarded separately at call sites
  // (guardRequest), because APIRequestContext bypasses routing (measured).
  if (writeGate) await installWriteGateRoute(context, writeGate);
  const page = await context.newPage();
  // Delete links are confirm-guarded; the harness answers the confirm as a
  // person who pressed OK, and records that it did.
  page.on("dialog", (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message().slice(0, 120) });
    dialog.accept().catch(() => undefined);
  });
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !isHarnessRequestAbortEcho(text)) consoleErrors.push(text);
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const request = response.request();
      blocked.push({ url: response.url(), status: response.status(), method: request.method(),
        resourceType: request.resourceType(), navigation: request.isNavigationRequest() });
    }
  });
  page.on("requestfailed", (request) => {
    blocked.push({ url: request.url(), status: `failed:${request.failure()?.errorText ?? "unknown"}`,
      method: request.method(), resourceType: request.resourceType(), navigation: request.isNavigationRequest() });
  });

  return {
    page,
    consoleErrors,
    dialogs,
    blocked,
    // Independent cookies/storage, one owned browser process for the run.
    // Isolated children inherit the write gate and the ledger sink: a child
    // context must never be a side door around the run's write mode.
    newContext: options => launchHarnessBrowser({ origin, assetHosts, allowedFaviconUrls, writeGate, ledgerSink, ...options, sharedBrowser: browser }),
    close: async () => {
      try { await context.close(); } finally { if (!sharedBrowser) await browser.close(); }
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

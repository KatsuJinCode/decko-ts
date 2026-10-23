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
import { classifyRequestOutcome } from './page-render-subresources.mjs';
import { createThirdPartyAssetCache } from './third-party-asset-cache.mjs';
import { installWriteGateRoute } from '../../../reference-harness/browser/lib/live-walk-profile.mjs';
import { withShutdownWindow } from './bounded-wait.mjs';

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

/**
 * The graceful window the browser's own shutdown gets.
 *
 * MEASURED: in the tranche-7 whole-family run (about 30 minutes, 242 checks)
 * every browser context and the browser process itself closed in well under
 * a second. The window is twenty seconds: far above what a clean close
 * needs, and far below a wait an operator would have to sit through. When
 * the window expires the owner's forced path runs and the run records that
 * the close was forced, so a report never claims a clean shutdown that did
 * not happen.
 */
const CLOSE_GRACE_MS = 20_000;

/** Include child sessions: a blank coordinator page cannot vouch for them. */
export function browserAssetFailures(browsers) {
 return browsers.flatMap((browser,contextIndex)=>browser.blocked
  .filter(item=>['script','stylesheet','font','image'].includes(item.resourceType))
  .map(item=>({...item,contextIndex})));
}

/**
 * The asset failures of a run, split by WHOSE asset failed.
 *
 * The raw list (browserAssetFailures) is every script, stylesheet, font or
 * image the browser could not load, across every context. That list mixes
 * three different things, and the audit that grades it must not charge the
 * deployment for the two the deployment does not own:
 *
 *   - DEPLOYMENT FAILURE: an asset the deployment itself serves failed (a
 *     4xx/5xx from the local origin or from a declared DECKO_SERVED_* asset
 *     host). That is the engine's own asset; the audit fails on it.
 *   - THIRD-PARTY FAILURE: a host the deployment does not serve failed (the
 *     TinyMCE skin on cdnjs.cloudflare.com, the icon font on
 *     fonts.gstatic.com). Its availability is not the engine's. It is still
 *     reported, by name, beside the verdict.
 *   - NAVIGATION ABORT: the browser cancelled a request it no longer needed
 *     (net::ERR_ABORTED when the page moved on). Nothing failed to be
 *     delivered and nothing was broken.
 *
 * The classes are the ones this repository already owns
 * (lib/page-render-subresources.mjs), so the final asset audit and the
 * page-render instrument cannot drift apart on what a failed asset MEANS.
 *
 * ONE REFINEMENT, FOR THE HOST'S OWN SOCKET POOL. The shared classifier
 * reads a transport failure on an owned host as a deployment failure, and
 * for the page-render instrument that is right: its question is "did the
 * deployment DELIVER every subresource the render needs", and a request
 * that never got carried was not delivered. This audit's question is
 * different: "did an ASSET fail". net::ERR_NO_BUFFER_SPACE is the operating
 * system refusing to allocate a socket buffer (WSAENOBUFS): no request was
 * carried, so no asset was served and no asset was missed, and no Node HTTP
 * server can answer that - a server that is not listening answers
 * ERR_CONNECTION_REFUSED, and a server that errors answers 5xx. MEASURED at
 * the tranche-7 tip: one request of the 152 the run made for
 * /mod/tinymce_editor/plugins/code/plugin.min.js failed that way, and the
 * engine served the same URL 151 times in the same run. Such a refusal is
 * counted and reported by name, beside the verdict, and never charged to
 * the deployment's assets.
 *
 * MEASURED, at the tranche-6 tip: the tranche-6 whole-family run failed this
 * audit on three copies of
 * https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.7/skins/ui/oxide/content.min.css
 * (status failed:net::ERR_ABORTED) and the tranche-5 whole-family run failed
 * the same leg on a different third-party host entirely
 * (https://fonts.gstatic.com/.../flUhRq6tzZclQEJ-Vdg-IuiaDsNc.woff2, status
 * failed:net::ERR_CONNECTION_CLOSED). Two different third-party hosts, two
 * different transport failures, the same verdict: the leg was measuring the
 * public internet, not the deployment.
 */
export function classifyBrowserAssetFailures(failures, { origin, assetHosts = [] } = {}) {
 const classified = (failures ?? []).map((item) => {
  const outcome = classifyRequestOutcome(item, { origin, assetHosts });
  if (outcome === 'deployment-failure' && typeof item?.status === 'string' && item.status.includes('ERR_NO_BUFFER_SPACE')) {
   return { ...item, outcome: 'host-resource-refusal' };
  }
  return { ...item, outcome };
 });
 const byOutcome = {};
 for (const item of classified) byOutcome[item.outcome] = (byOutcome[item.outcome] ?? 0) + 1;
 return {
  deploymentFailures: classified.filter((item) => item.outcome === 'deployment-failure'),
  otherFailures: classified.filter((item) => item.outcome !== 'deployment-failure'),
  byOutcome,
 };
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
export async function launchHarnessBrowser({ origin, assetHosts, allowedFaviconUrls = [], sharedBrowser, writeGate, ledgerSink, thirdPartyAssets }) {
  const { chromium } = await loadPlaywright();
  const executablePath = findBrowser();
  const allowedAssets = new Set(assetHosts);
  // One cache per RUN, shared by every context the run opens: the stock
  // layout CDNs are fetched once per URL, not once per page.
  const thirdPartyCache = thirdPartyAssets ?? createThirdPartyAssetCache();
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
    // Wall-clock request duration per request object: request.timing() can
    // answer partial garbage before the profile settles (observed: a ~1.8e12
    // ms figure), so the start is recorded here and subtracted at finish.
    const requestStarts = new Map();
    context.on("request", (request) => {
      if (new URL(request.url()).origin === origin) requestStarts.set(request, Date.now());
    });
    context.on("requestfinished", async (request) => {
      try {
        const url = new URL(request.url());
        if (url.origin !== origin) return;
        const response = await request.response();
        if (!response) return;
        const startedAt = requestStarts.get(request);
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
          ms: startedAt !== undefined ? Date.now() - startedAt : null,
          serverTiming: response.headers()["server-timing"] ?? null,
          ...(bodyHead !== undefined ? { bodyHead } : {}),
          channel: "browser-observed",
        });
      } catch { /* a context closing mid-request must not kill the run */ }
      finally { requestStarts.delete(request); }
    });
  }
  // Requests may reach the local origin, the deck's configured asset host and
  // the stock layout CDNs. Anything else is blocked, so the page can never
  // reach the live site.
  //
  // AND the stock layout CDNs are served by the HARNESS, out of its own
  // per-run cache: one live fetch per third-party URL per run, and every
  // later request for that URL is answered from memory. See
  // lib/third-party-asset-cache.mjs for why the run must not leave the
  // browser fetching the public internet once per page: the engine, the
  // local database endpoint and the browser client share ONE Node process,
  // so every third-party answer is processed on the event loop the engine's
  // handler resumes on, and the public internet's mood lands inside the
  // engine's measured db wall.
  await context.route(
    (url) => /^(https?|wss?):$/.test(url.protocol) && !LOCAL_HOSTS.has(url.hostname) && !allowedAssets.has(url.hostname) && !STOCK_LAYOUT_CDNS.has(url.hostname),
    (route) => route.abort("blockedbyclient"),
  );
  await context.route('**/*', async route => {
    const request = route.request();
    const hosts = new Set([...allowedAssets, ...STOCK_LAYOUT_CDNS]);
    if (!externalBrowserRequestAllowed(request, { origin, allowedHosts: hosts, allowedFaviconUrls })) return route.abort('blockedbyclient');
    const url = new URL(request.url());
    if (!STOCK_LAYOUT_CDNS.has(url.hostname)) return route.fallback();
    const answer = await thirdPartyCache.answer(url.href, { method: request.method() });
    return route.fulfill({ status: answer.status, headers: answer.headers, body: answer.body });
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
    // The run's third-party asset cache, so the run record can show how many
    // live fetches the run made to the public internet and how many requests
    // were answered out of memory.
    thirdPartyAssets: thirdPartyCache,
    // Independent cookies/storage, one owned browser process for the run.
    // Isolated children inherit the write gate and the ledger sink: a child
    // context must never be a side door around the run's write mode.
    newContext: options => launchHarnessBrowser({ origin, assetHosts, allowedFaviconUrls, writeGate, ledgerSink, thirdPartyAssets: thirdPartyCache, ...options, sharedBrowser: browser }),
    // The browser's own shutdown, with a window and a forced path behind it.
    //
    // WHY THE WINDOW EXISTS. The tranche-8 baseline run (2026-10-21 20:27
    // local, at the tranche-7 tip) never ended: after 205 checks it sat at
    // 0.00 s of CPU for twenty minutes with no further engine request, and
    // the run never wrote its report. The await that parked was this close:
    // a page whose navigation never settled (a third-party editor asset that
    // never arrives) cannot be closed gracefully, and `context.close()` waits
    // for the page. A battery that stops reporting is worse than a battery
    // that fails, so the close gets a window, and the window's expiry runs
    // the owner's forced path on the process the harness itself launched.
    // See lib/bounded-wait.mjs for the rule and the measured evidence.
    close: async () => {
      const report = { context: null, browser: null };
      report.context = await withShutdownWindow(
        () => context.close(),
        CLOSE_GRACE_MS,
        'the harness browser context',
        async () => {
          // A context whose graceful close expired has a page that will not
          // settle. The owner closes its pages best effort and abandons the
          // context, and the record says the close was not clean.
          for (const page of context.pages()) {
            try { await page.close({ runBeforeUnload: false }); } catch { /* the page is already gone */ }
          }
        },
      );
      if (!sharedBrowser) {
        report.browser = await withShutdownWindow(
          () => browser.close(),
          CLOSE_GRACE_MS,
          'the harness browser process',
          () => {
            // The harness launched this browser process; ending it is the
            // owner's own lifecycle, not an outside kill of someone else's
            // process.
            try { browser.process()?.kill(); } catch { /* the process is already gone */ }
          },
        );
      }
      return report;
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

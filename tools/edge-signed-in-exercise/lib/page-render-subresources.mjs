// page-render-subresources.mjs — the instrument for the highest-traffic
// failing action in the page-render flow: a signed-in page opens and every
// subresource the rendered page asks for is delivered.
//
// WHAT ACTION THIS PINS. The rendered page is the first thing every signed-in
// user sees, on every page, and its subresources (the deck stylesheet, the
// navbox scripts, TinyMCE, the deck's own logo images on the CDN asset host)
// are what turn a 200 into a page a person can use. The user action is "the
// page renders", so the instrument observes the whole chain in one browser
// page load: the rendered HTML, every request that HTML makes, and what each
// of those requests actually got.
//
// WHAT WAS RED AND UNDER-ATTRIBUTED. docs/registry/instrument-coverage-matrix.json
// row ACT-009, "no blocked or 4xx/5xx subresource on the signed-in page",
// carries a fail entry on both targets (whole-harness and live-deployment).
// In the 2026-10-17T08:22Z run (.runtime/edge-signed-in/
// 2026-10-17T08-22-24-672Z-41160/report.md:23) it graded FAIL. The graded
// predicate is tools/edge-signed-in-exercise.mjs:702 —
// `record("no blocked or 4xx/5xx subresource on the signed-in page",
// mixed.length === 0, ...)` where `mixed = browser.blocked`
// (mjs:701) — and `browser.blocked` accumulates EVERY 4xx/5xx and EVERY
// failed request of the whole browser session (lib/harness-browser.mjs:136-146).
//
// The run's own request record (report.md.json, `failedRequests`) reads: 500
// failed requests, of which 461 are `failed:net::ERR_BLOCKED_BY_CLIENT.Inspector`
// and 441 are the single URL
// `https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com/files/103/3649-small.jpg`
// — the deck's logo. 176 of the run's 184 captured page renders reference
// that URL. That is the highest-traffic failing request in the run by a wide
// margin, and it fires on every page render.
//
// WHAT THE EXISTING CHECK CANNOT SAY. It answers "was anything blocked", not
// "who blocked it and whether a person would have seen it". Chromium reports
// this harness's OWN route-policy aborts as
// `net::ERR_BLOCKED_BY_CLIENT.Inspector` — lib/harness-browser.mjs:45-58
// documents the suffix as CDP-initiated blocking and states that the launch
// carries `--disable-extensions`, so no other client-side blocker exists.
// The aborts come from lib/harness-browser.mjs:116-123, which refuses any
// host outside {loopback, DECKO_SERVED_* asset hosts, stock layout CDNs},
// and for resourceType `other` the refusal is favicon-URL-exact
// (lib/local-policy.mjs:33-38). So the same red check would appear whether
// the deployment serves a broken subresource or the harness refused to let
// the browser ask for one. Nothing in the check separates the two, and that
// is the gap this instrument closes.
//
// WHAT THIS CLOSES AND WHAT IT DOES NOT. It attributes every subresource
// failure in a real page render to one of four classes (deployment,
// harness-policy, third-party, navigation-abort), records the traffic
// (requests per render, repeats per URL), and measures the SAME page twice —
// once in the harness's policy browser, once in a browser with no request
// interception at all — so "a person would have seen it" is observed, not
// argued. It does NOT close ACT-009: that row stays red until whoever owns
// the cause acts, and this instrument reports the cause rather than
// repairing it. It also does not certify the deployed site; it runs on a
// local stack over a local deck copy, so its numbers describe this stack and
// this deck.

// The resource types a render cannot do without. A document request is the
// page itself (a 404 there is a product answer, not a broken subresource),
// and xhr/fetch carry data rather than render, so neither is a subresource.
export const RENDER_BLOCKING_TYPES = ["script", "stylesheet", "font", "image", "media", "other"];

/** Chromium's echo of a CDP-initiated abort (lib/harness-browser.mjs:49). */
export const HARNESS_ABORT_ERROR = "ERR_BLOCKED_BY_CLIENT";

/** Chromium cancels requests no longer needed after a navigation/frame teardown.
 * Keep these observations, separately from HTTP/network/policy failures. */
export function isNavigationCancellation(observation) {
  return typeof observation?.status === 'string' && observation.status.includes('ERR_ABORTED');
}

/** The graded predicate, reproduced exactly: mjs:702 grades `length === 0`. */
export function harnessCheckVerdict(blocked) {
  return Array.isArray(blocked) && blocked.length === 0;
}

/** The graded predicate's red reasons, so a red receipt says which request. */
export function harnessCheckViolations(blocked) {
  if (!Array.isArray(blocked)) return ["no blocked-request record was passed"];
  return blocked.map((b) => `${b.resourceType} ${b.url} -> ${b.status}`);
}

/**
 * One request's class. Never a guess about the cause: each branch names the
 * observation it read.
 * @param {{ url: string, status: number|string, resourceType: string, navigation?: boolean }} observation
 * @param {{ origin: string, assetHosts: Iterable<string> }} ctx
 * @returns {"ok"|"deployment-failure"|"harness-policy-abort"|"third-party-failure"|"navigation-abort"|"data-request"}
 */
export function classifyRequestOutcome(observation, { origin, assetHosts = [] } = {}) {
  if (observation?.navigation === true) return "navigation-abort";
  if (!RENDER_BLOCKING_TYPES.includes(observation?.resourceType)) return "data-request";
  const status = observation?.status;
  const host = (() => {
    try {
      return new URL(observation?.url ?? "").hostname;
    } catch {
      return null;
    }
  })();
  const owned =
    host === null ||
    (() => {
      try {
        return new URL(origin).hostname === host;
      } catch {
        return false;
      }
    })() ||
    [...assetHosts].includes(host);
  // An abort this harness issues itself: the route handlers abort with
  // 'blockedbyclient' and Chromium echoes it under this token. Named before
  // the ownership test because the abort happens before any host is reached.
  if (typeof status === "string" && status.includes(HARNESS_ABORT_ERROR)) return "harness-policy-abort";
  if (typeof status === "string") {
    // ERR_ABORTED is the browser cancelling a request it no longer needs
    // (a navigation moved on). It is neither a delivery failure nor a defect.
    if (isNavigationCancellation(observation)) return "navigation-abort";
    // Any other failed load (refused, reset, timed out) is a delivery
    // failure; whose defect it is depends on who served the host.
    return owned ? "deployment-failure" : "third-party-failure";
  }
  if (typeof status === "number" && status >= 400) {
    return owned ? "deployment-failure" : "third-party-failure";
  }
  if (typeof status === "number" && status >= 200 && status < 400) return "ok";
  return "third-party-failure";
}

/** Every request the page made that it could not render without. */
export function renderBlockingRequests(observations) {
  return (Array.isArray(observations) ? observations : []).filter(
    (o) => o?.navigation !== true && RENDER_BLOCKING_TYPES.includes(o?.resourceType),
  );
}

/**
 * The user-truth verdict: did every subresource this page needs arrive from
 * a host the deployment controls? A third-party host's failure and the
 * harness's own policy abort are reported beside it, never inside it.
 */
export function pageRenderComplete(observations, ctx) {
  return renderBlockingRequests(observations)
    .map((o) => ({ ...o, outcome: classifyRequestOutcome(o, ctx) }))
    .filter((o) => o.outcome === "deployment-failure").length === 0;
}

/** The red reasons for the user-truth verdict, one line per broken subresource. */
export function pageRenderViolations(observations, ctx) {
  return renderBlockingRequests(observations)
    .map((o) => ({ ...o, outcome: classifyRequestOutcome(o, ctx) }))
    .filter((o) => o.outcome === "deployment-failure")
    .map((o) => `${o.resourceType} ${o.url} -> ${o.status}`);
}

/**
 * Traffic and shape of one page render: what it asked for, what failed, and
 * which URL it asked for more than once. Repeat counts are the traffic
 * measure — a URL requested N times in one render costs N round trips.
 */
export function summarisePageRender(observations, ctx) {
  const all = Array.isArray(observations) ? observations : [];
  const blocking = renderBlockingRequests(all);
  const byOutcome = {};
  const byResourceType = {};
  const byUrl = new Map();
  for (const o of blocking) {
    const outcome = classifyRequestOutcome(o, ctx);
    byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
    byResourceType[o.resourceType] = (byResourceType[o.resourceType] ?? 0) + 1;
    byUrl.set(o.url, (byUrl.get(o.url) ?? 0) + 1);
  }
  return {
    requestsObserved: all.length,
    renderBlockingRequests: blocking.length,
    byOutcome,
    byResourceType,
    repeated: [...byUrl.entries()]
      .filter(([, n]) => n > 1)
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * The external subresource URLs a rendered page references, with how many
 * times each appears in the bytes. Read off the render, never assumed.
 */
export function externalReferencesFrom(html) {
  const refs = [...String(html ?? "").matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  const counts = new Map();
  for (const url of refs) counts.set(url, (counts.get(url) ?? 0) + 1);
  return [...counts.entries()].map(([url, count]) => ({ url, count })).sort((a, b) => b.count - a.count);
}

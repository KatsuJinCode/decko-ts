// third-party-asset-cache.mjs — the harness serves the stock layout CDNs
// itself, out of its own per-run cache, so a whole-family run makes AT MOST
// ONE live fetch per third-party URL.
//
// WHY. The engine does not serve the TinyMCE distribution or the icon font:
// it answers every `/mod/tinymce_editor/...` request with a 302 to
// cdnjs.cloudflare.com (deploy/bunny-worker-src/bunny-edge-engine-handler.ts,
// TINYMCE_DIST_BASE) and the page's layout points at fonts.gstatic.com. The
// browser therefore fetched those assets from the public internet, again and
// again: the tranche-7 run made 152 requests for one TinyMCE URL, and the
// tranche-9 runs each failed 21 live fetches of the ace editor's
// worker-json.js.
//
// THE MEASUREMENT THAT FOLLOWED. The engine, the local database endpoint and
// the Playwright client share ONE Node process. While the engine waits on a
// database round trip, every third-party answer the browser receives is
// processed by the same event loop the engine's handler resumes on, so the
// public internet's mood lands inside the engine's measured db wall. At the
// tranche-9 tip that is what made the "9. timings" leg flake: the same page
// measured 24.2 ms per statement in one whole-family run and 15.5 ms in the
// next, on the same tree, the same bundle and the same source deck.
//
// THE RULE. One live fetch per URL per run, then the bytes are served from
// memory. A URL that cannot be fetched is answered with a 502 and an empty
// body, so the asset fails the way a failed asset fails - the page's load
// event still fires - instead of hanging the way a hanging fetch hangs. The
// asset audit (lib/harness-browser.mjs, classifyBrowserAssetFailures)
// classifies that failure as the third party's, which is where it belongs.
//
// WHAT IS NOT SERVED FROM HERE. The deck's own origin, the deck's configured
// asset hosts and every other host stay on the browser's own network path;
// only the stock layout CDNs are served from this cache.

/** The headers that must not be copied through: the body here is already decoded. */
const DROPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

/**
 * Creates a per-run cache of third-party assets.
 *
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} opts
 */
export function createThirdPartyAssetCache({ fetchImpl, timeoutMs = 10000 } = {}) {
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  /** url -> { status, headers, body } */
  const cached = new Map();
  /** host -> how many live fetches this run made to that host. */
  const fetchedByHost = new Map();
  /** host -> how many requests this run served out of the cache. */
  const servedFromCacheByHost = new Map();
  /** The URLs this run could not fetch, with the reason. */
  const failures = [];

  const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

  /**
   * Fetches one URL, once, and returns the answer the browser is given.
   * @param {string} url
   * @param {{ method?: string }} opts
   */
  async function fetchOnce(url, { method = "GET" } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(url, { method, signal: controller.signal, redirect: "follow" });
      const body = Buffer.from(await response.arrayBuffer());
      const headers = {};
      response.headers.forEach((value, key) => {
        if (!DROPPED_RESPONSE_HEADERS.has(key.toLowerCase())) headers[key] = value;
      });
      return { status: response.status, headers, body };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Answers one third-party request out of the cache, fetching it first if
   * this run has not seen the URL.
   * @param {string} url
   * @param {{ method?: string }} opts
   */
  async function answer(url, { method = "GET" } = {}) {
    const known = cached.get(url);
    if (known) {
      bump(servedFromCacheByHost, new URL(url).hostname);
      return known;
    }
    const host = new URL(url).hostname;
    bump(fetchedByHost, host);
    try {
      const answer = await fetchOnce(url, { method });
      cached.set(url, answer);
      return answer;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ url, reason });
      // A 502 with an empty body: the asset is missing, the page's load event
      // still fires, and the audit grades the failure as the third party's.
      const failed = { status: 502, headers: { "content-type": "text/plain" }, body: Buffer.from("", "utf8") };
      cached.set(url, failed);
      return failed;
    }
  }

  /** The run's own receipt of what it fetched from the public internet. */
  function stats() {
    return {
      hosts: [...new Set([...fetchedByHost.keys(), ...servedFromCacheByHost.keys()])].sort(),
      liveFetches: Object.fromEntries([...fetchedByHost.entries()].sort()),
      servedFromCache: Object.fromEntries([...servedFromCacheByHost.entries()].sort()),
      distinctUrls: cached.size,
      failures: failures.map((failure) => ({ url: failure.url, reason: failure.reason })),
    };
  }

  return { answer, stats, cached, failures };
}

// The Worker's whole-response cache (deploy/src/worker-edge-cache.ts), tested
// against an in-memory Cache API. The rules under test:
//   - a request carrying the session cookie is never matched against the cache
//     and its response is never stored, so a signed-in response cannot reach
//     an anonymous visitor through the cache, in either order;
//   - an anonymous card render is stored under the URL and the deck stamp, so
//     a committed write (a new stamp) misses;
//   - only status-200 card renders and card JSON are stored; no Set-Cookie
//     response is stored;
//   - unarmed, the wrapper is the render and nothing else.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDGE_CACHE_TTL_SECONDS,
  EDGE_CACHE_DIAGNOSTIC_HEADER,
  SESSION_COOKIE_NAME,
  edgeCacheKey,
  edgeRouteCacheClass,
  hasSessionCookie,
  serveWithEdgeCache,
  type EdgeCacheDeps,
  type EdgeCacheLike,
} from "../../deploy/src/worker-edge-cache.js";
import { SESSION_COOKIE_NAME as WRITE_SURFACE_COOKIE } from "../../src/server/write-routes.js";

/** An in-memory Cache API: stores clones, returns fresh copies, records calls. */
class FakeCache implements EdgeCacheLike {
  readonly entries = new Map<string, { body: string; headers: [string, string][] }>();
  matchCalls = 0;
  putCalls: string[] = [];

  async match(request: Request | URL | string): Promise<Response | undefined> {
    this.matchCalls++;
    const entry = this.entries.get(String(request instanceof Request ? request.url : request));
    if (entry === undefined) return undefined;
    return new Response(entry.body, { headers: entry.headers });
  }

  async put(request: Request | URL | string, response: Response): Promise<void> {
    const key = String(request instanceof Request ? request.url : request);
    this.putCalls.push(key);
    const body = await response.text();
    this.entries.set(key, { body, headers: [...response.headers.entries()] });
  }
}

const ARMED = { DECKO_EDGE_CACHE: "1" };

/** Deps whose render counts its calls and returns a 200 card body. */
function makeDeps(
  cache: EdgeCacheLike | undefined,
  options: { stamp?: number | undefined; status?: number; setCookie?: boolean; body?: string } = {},
): { deps: EdgeCacheDeps; renders: () => number } {
  let renders = 0;
  const deps: EdgeCacheDeps = {
    cache,
    stamp: async () => options.stamp ?? 7,
    render: async () => {
      renders++;
      const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };
      if (options.setCookie) headers["Set-Cookie"] = `${SESSION_COOKIE_NAME}=signed-in; Path=/`;
      return new Response(options.body ?? `<html>render ${renders}</html>`, {
        status: options.status ?? 200,
        headers,
      });
    },
  };
  return { deps, renders: () => renders };
}

function getRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://deck.test${path}`, { method: "GET", headers });
}

describe("worker edge cache: arming", () => {
  it("unarmed, the wrapper is the render: no cache contact, no diagnostic header", async () => {
    const cache = new FakeCache();
    const { deps, renders } = makeDeps(cache);
    const response = await serveWithEdgeCache(getRequest("/Home"), {}, deps);
    expect(renders()).toBe(1);
    expect(cache.matchCalls).toBe(0);
    expect(cache.putCalls).toEqual([]);
    expect(response.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBeNull();
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it("arms only on the exact value \"1\"", async () => {
    const cache = new FakeCache();
    const { deps, renders } = makeDeps(cache);
    await serveWithEdgeCache(getRequest("/Home"), { DECKO_EDGE_CACHE: "true" }, deps);
    expect(renders()).toBe(1);
    expect(cache.putCalls).toEqual([]);
  });
});

describe("worker edge cache: anonymous card renders", () => {
  it("stores the first render and serves the second from the cache, byte for byte", async () => {
    const cache = new FakeCache();
    const { deps, renders } = makeDeps(cache, { body: "<html>card body</html>" });
    const first = await serveWithEdgeCache(getRequest("/Home"), ARMED, deps);
    expect(await first.text()).toBe("<html>card body</html>");
    expect(first.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe(
      `armed; cache=miss+stored; ttl=${DEFAULT_EDGE_CACHE_TTL_SECONDS}`,
    );
    expect(cache.putCalls).toHaveLength(1);

    const second = await serveWithEdgeCache(getRequest("/Home"), ARMED, deps);
    expect(await second.text()).toBe("<html>card body</html>");
    expect(second.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=hit");
    expect(renders()).toBe(1);
    expect(second.headers.get(`${"X-Decko-Stored-At"}`)).toBeNull();
  });

  it("a new deck stamp is a new key, so a write invalidates the stored page", async () => {
    const cache = new FakeCache();
    const before = makeDeps(cache, { stamp: 7, body: "<html>before write</html>" });
    await serveWithEdgeCache(getRequest("/Home"), ARMED, before.deps);
    const after = makeDeps(cache, { stamp: 8, body: "<html>after write</html>" });
    const response = await serveWithEdgeCache(getRequest("/Home"), ARMED, after.deps);
    expect(await response.text()).toBe("<html>after write</html>");
    expect(after.renders()).toBe(1);
    expect(cache.putCalls[0]).not.toBe(cache.putCalls[1]);
  });

  it("bypasses dynamic history-view query parameters", async () => {
    const cache = new FakeCache();
    const { deps } = makeDeps(cache);
    await serveWithEdgeCache(getRequest("/Home?view=history&act_id=1"), ARMED, deps);
    await serveWithEdgeCache(getRequest("/Home?view=history&act_id=2"), ARMED, deps);
    expect(cache.putCalls).toEqual([]);
  });

  it("an entry older than the TTL is a miss", async () => {
    const cache = new FakeCache();
    const { deps } = makeDeps(cache);
    await serveWithEdgeCache(getRequest("/Home"), { ...ARMED, DECKO_EDGE_CACHE_TTL: "1" }, deps);
    const realNow = Date.now;
    Date.now = () => realNow() + 5_000;
    try {
      const again = makeDeps(cache, { body: "<html>fresh</html>" });
      const response = await serveWithEdgeCache(getRequest("/Home"), { ...ARMED, DECKO_EDGE_CACHE_TTL: "1" }, again.deps);
      expect(await response.text()).toBe("<html>fresh</html>");
      expect(again.renders()).toBe(1);
    } finally {
      Date.now = realNow;
    }
  });

  it("card JSON is classified separately and bypasses the HTML cache", async () => {
    const cache = new FakeCache();
    const { deps, renders } = makeDeps(cache);
    await serveWithEdgeCache(getRequest("/Scale%20Page%201x.json"), ARMED, deps);
    await serveWithEdgeCache(getRequest("/Scale%20Page%201x.json"), ARMED, deps);
    expect(renders()).toBe(2);
    expect(cache.putCalls).toEqual([]);
    expect(edgeRouteCacheClass("GET", "/Scale%20Page%201x.json")).toBe("content-json");
  });
});

describe("worker edge cache: the signed-in bypass", () => {
  const SIGNED_IN = { Cookie: `${SESSION_COOKIE_NAME}=an-opaque-session-token` };

  it("a session-cookie request is never matched against the cache", async () => {
    const cache = new FakeCache();
    const anonymous = makeDeps(cache, { body: "<html>anonymous</html>" });
    await serveWithEdgeCache(getRequest("/Home"), ARMED, anonymous.deps);
    expect(cache.entries.size).toBe(1);

    const signedIn = makeDeps(cache, { body: "<html>signed in</html>" });
    const matchesBefore = cache.matchCalls;
    const response = await serveWithEdgeCache(getRequest("/Home", SIGNED_IN), ARMED, signedIn.deps);
    expect(cache.matchCalls).toBe(matchesBefore);
    expect(await response.text()).toBe("<html>signed in</html>");
    expect(signedIn.renders()).toBe(1);
  });

  it("a session-cookie response is never stored, and is marked private, no-store", async () => {
    const cache = new FakeCache();
    const signedIn = makeDeps(cache, { body: "<html>signed in</html>" });
    const response = await serveWithEdgeCache(getRequest("/Home", SIGNED_IN), ARMED, signedIn.deps);
    expect(cache.putCalls).toEqual([]);
    expect(cache.entries.size).toBe(0);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=per-viewer-bypass");
  });

  it("a signed-in response is never served to an anonymous request afterwards", async () => {
    const cache = new FakeCache();
    const signedIn = makeDeps(cache, { body: "<html>SIGNED IN ONLY</html>" });
    await serveWithEdgeCache(getRequest("/Home", SIGNED_IN), ARMED, signedIn.deps);

    const anonymous = makeDeps(cache, { body: "<html>anonymous render</html>" });
    const response = await serveWithEdgeCache(getRequest("/Home"), ARMED, anonymous.deps);
    expect(await response.text()).toBe("<html>anonymous render</html>");
    expect(anonymous.renders()).toBe(1);
    expect(response.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe(
      `armed; cache=miss+stored; ttl=${DEFAULT_EDGE_CACHE_TTL_SECONDS}`,
    );
  });

  it("the cookie name is matched exactly: a look-alike cookie stays anonymous", async () => {
    const cache = new FakeCache();
    const { deps } = makeDeps(cache);
    await serveWithEdgeCache(getRequest("/Home", { Cookie: `x${SESSION_COOKIE_NAME}=1` }), ARMED, deps);
    expect(cache.putCalls).toHaveLength(1);
    expect(hasSessionCookie(getRequest("/Home", { Cookie: `a=1; ${SESSION_COOKIE_NAME}=2` }))).toBe(true);
    expect(hasSessionCookie(getRequest("/Home", { Cookie: `x${SESSION_COOKIE_NAME}=1` }))).toBe(false);
  });

  it("the session cookie name is the write surface's own (not a copy that drifted)", () => {
    expect(SESSION_COOKIE_NAME).toBe(WRITE_SURFACE_COOKIE);
  });
});

describe("worker edge cache: what is never stored", () => {
  it("non-200 responses are not stored", async () => {
    const cache = new FakeCache();
    const { deps } = makeDeps(cache, { status: 404, body: "<html>Not found</html>" });
    const response = await serveWithEdgeCache(getRequest("/Missing"), ARMED, deps);
    expect(response.status).toBe(404);
    expect(cache.putCalls).toEqual([]);
  });

  it("a response that sets a cookie is not stored", async () => {
    const cache = new FakeCache();
    const { deps } = makeDeps(cache, { setCookie: true });
    await serveWithEdgeCache(getRequest("/Home"), ARMED, deps);
    expect(cache.putCalls).toEqual([]);
  });

  it("uncacheable classes never touch the cache", async () => {
    const cache = new FakeCache();
    for (const [method, path] of [
      ["GET", "/_status"],
      ["GET", "/__metrics"],
      ["POST", "/api/query"],
      ["GET", "/Home.csv"],
      ["GET", "/Home.rss"],
      ["HEAD", "/Home"],
    ] as const) {
      const { deps, renders } = makeDeps(cache);
      await serveWithEdgeCache(new Request(`https://deck.test${path}`, { method }), ARMED, deps);
      expect(renders()).toBe(1);
    }
    expect(cache.matchCalls).toBe(0);
    expect(cache.putCalls).toEqual([]);
  });

  it("an unreadable stamp renders uncached rather than keying on a guess", async () => {
    const cache = new FakeCache();
    const deps: EdgeCacheDeps = {
      cache,
      stamp: async () => {
        throw new Error("deck_data_version unreadable");
      },
      render: async () => new Response("<html>render</html>", { status: 200 }),
    };
    const response = await serveWithEdgeCache(getRequest("/Home"), ARMED, deps);
    expect(await response.text()).toBe("<html>render</html>");
    expect(response.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=stamp-unavailable");
    expect(cache.putCalls).toEqual([]);
  });

  it("no Cache API in the runtime: renders, and says so", async () => {
    const { deps, renders } = makeDeps(undefined);
    const response = await serveWithEdgeCache(getRequest("/Home"), ARMED, deps);
    expect(renders()).toBe(1);
    expect(response.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=unavailable");
  });
});

describe("worker edge cache: keys", () => {
  it("the key carries the origin, the path, the query and the stamp", () => {
    const key = edgeCacheKey(new URL("https://deck.test/Home?view=x"), 42);
    expect(key.href).toBe("https://deck.test/__decko_edge_cache/v42/Home?view=x");
  });

  it("classifies card pages and card JSON, and nothing else as cacheable", () => {
    expect(edgeRouteCacheClass("GET", "/")).toBe("content-html");
    expect(edgeRouteCacheClass("GET", "/Home")).toBe("content-html");
    expect(edgeRouteCacheClass("GET", "/Home/view/content")).toBe("content-html");
    expect(edgeRouteCacheClass("GET", "/Home.json")).toBe("content-json");
    expect(edgeRouteCacheClass("GET", "/_status")).toBe("uncacheable");
    expect(edgeRouteCacheClass("GET", "/__metrics")).toBe("uncacheable");
    expect(edgeRouteCacheClass("POST", "/Home")).toBe("uncacheable");
  });
});

describe("worker edge cache: credential and response-policy boundaries", () => {
  it("Authorization credentials never match or populate the anonymous cache", async () => {
    const cache = new FakeCache();
    const { deps } = makeDeps(cache, { body: "viewer-only" });
    const response = await serveWithEdgeCache(getRequest("/Home", { Authorization: "Bearer opaque" }), ARMED, deps);
    expect(cache.matchCalls).toBe(0);
    expect(cache.putCalls).toEqual([]);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("token query parameters bypass the anonymous cache", async () => {
    const cache = new FakeCache();
    const { deps } = makeDeps(cache);
    for (const query of ["token=opaque", "_token=opaque"]) {
      await serveWithEdgeCache(getRequest(`/Home?${query}`), ARMED, deps);
    }
    expect(cache.matchCalls).toBe(0);
    expect(cache.putCalls).toEqual([]);
  });

  it("preserves private/no-store and Vary policies rather than overriding them", async () => {
    const policies: Array<Record<string, string>> = [{ "Cache-Control": "private, no-store" }, { "Cache-Control": "no-store" }, { Vary: "Cookie" }];
    for (const headers of policies) {
      const cache = new FakeCache();
      const { deps } = makeDeps(cache);
      deps.render = async () => new Response("policy-specific", { headers });
      const response = await serveWithEdgeCache(getRequest("/Home"), ARMED, deps);
      expect(cache.putCalls).toEqual([]);
      if ("Cache-Control" in headers) expect(response.headers.get("Cache-Control")).toBe(headers["Cache-Control"]);
    }
  });

  it("explicit request revalidation never replays a stored body", async () => {
    const cache = new FakeCache();
    const { deps } = makeDeps(cache);
    await serveWithEdgeCache(getRequest("/Home", { "Cache-Control": "no-cache" }), ARMED, deps);
    expect(cache.matchCalls).toBe(0);
    expect(cache.putCalls).toEqual([]);
  });

  it("operational and auth routes never touch the response cache", async () => {
    const cache = new FakeCache();
    const { deps } = makeDeps(cache);
    for (const route of ["/api/status", "/api/card/Secret", "/setup", "/_signin", "/_signout", "/delete/*signin", "/update/Home", "/files/1/name.txt"]) {
      await serveWithEdgeCache(getRequest(route), ARMED, deps);
    }
    expect(cache.matchCalls).toBe(0);
    expect(cache.putCalls).toEqual([]);
  });
});

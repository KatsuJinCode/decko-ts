// Tests for deploy/bunny-worker-src/bunny-edge-content-cache.ts — the L2
// script-side edge cache (Cache API) behind DECKO_EDGE_CACHE.
//
// Scope: everything verifiable offline. The runtime Cache API is substituted
// with an in-memory fake implementing the same match/put surface, so these
// tests prove the decision logic (hit/miss/store/bypass/unavailable) without
// any runtime or network. The live armed behavior on the trial edge is
// asserted through the X-Decko-Edge-Cache diagnostic header by the
// measurement runs (this lane's receipt); these tests pin what the module
// must do so the live observation has an unambiguous contract to check.

import { describe, expect, it } from "vitest";

import {
  EDGE_CACHE_DIAGNOSTIC_HEADER,
  resolveEdgeContentCache,
  serveWithEdgeCache,
  type EdgeCacheLike,
} from "../../deploy/bunny-worker-src/bunny-edge-content-cache.js";

const ARMED = { DECKO_EDGE_CACHE: "1" };

/** In-memory Cache API fake: keyed by URL string, records puts. */
function fakeCache(): EdgeCacheLike & { puts: string[]; store: Map<string, Response> } {
  const store = new Map<string, Response>();
  return {
    puts: [],
    store,
    async match(request) {
      return store.get(String(request));
    },
    async put(request, response) {
      const key = String(request);
      this.puts.push(key);
      store.set(key, response);
    },
  };
}

function makeRender(body: string, status = 200) {
  const state = { calls: 0 };
  return {
    state,
    render: async () => {
      state.calls += 1;
      return new Response(body, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    },
  };
}

describe("serveWithEdgeCache — flag OFF (default)", () => {
  it("renders every time, never touches the cache, adds no diagnostic header", async () => {
    const cache = fakeCache();
    const { render, state } = makeRender("<html>one</html>");
    const r1 = await serveWithEdgeCache(new Request("https://edge.example/About"), {}, render, cache);
    const r2 = await serveWithEdgeCache(new Request("https://edge.example/About"), {}, render, cache);
    expect(state.calls).toBe(2);
    expect(cache.puts).toHaveLength(0);
    expect(r1.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBeNull();
    expect(r2.headers.get("Cache-Control")).toBe("no-store");
    expect(await r1.text()).toBe("<html>one</html>");
  });

  it("renders even when the cache already holds the entry", async () => {
    const cache = fakeCache();
    const { render, state } = makeRender("fresh");
    await serveWithEdgeCache(new Request("https://edge.example/About"), ARMED, render, cache);
    // arm a second call then disarm: unarmed must bypass the cache entirely
    const r = await serveWithEdgeCache(new Request("https://edge.example/About"), {}, render, cache);
    expect(state.calls).toBe(2);
    expect(r.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBeNull();
  });
});

describe("serveWithEdgeCache — armed", () => {
  it("miss: renders, stores cacheable 200s, labels miss+stored with the ttl", async () => {
    const cache = fakeCache();
    const { render, state } = makeRender("<html>page</html>");
    const r = await serveWithEdgeCache(new Request("https://edge.example/About"), ARMED, render, cache);
    expect(state.calls).toBe(1);
    expect(cache.puts).toEqual(["https://edge.example/About"]);
    expect(r.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=miss+stored; ttl=300");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=300");
  });

  it("hit: second identical request returns the stored bytes without rendering, normalized to the L1 browser shape", async () => {
    const cache = fakeCache();
    const { render, state } = makeRender("<html>page</html>");
    await serveWithEdgeCache(new Request("https://edge.example/About"), ARMED, render, cache);
    const r2 = await serveWithEdgeCache(new Request("https://edge.example/About"), ARMED, render, cache);
    expect(state.calls).toBe(1); // render ran exactly once
    expect(r2.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=hit");
    expect(await r2.text()).toBe("<html>page</html>");
    expect(r2.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=300");
    expect(r2.headers.get("X-Decko-Stored-At")).toBeNull();
  });

  it("cache key includes the query string (history-view params are distinct entries)", async () => {
    const cache = fakeCache();
    const { render, state } = makeRender("h");
    await serveWithEdgeCache(new Request("https://edge.example/Cards/history?act_id=7&page=1"), ARMED, render, cache);
    await serveWithEdgeCache(new Request("https://edge.example/Cards/history?act_id=7&page=2"), ARMED, render, cache);
    expect(state.calls).toBe(2);
    expect(cache.puts).toHaveLength(2);
  });

  it("non-200s are never stored (error shape renders fresh every time)", async () => {
    const cache = fakeCache();
    const { render, state } = makeRender("<pre>render error</pre>", 500);
    await serveWithEdgeCache(new Request("https://edge.example/Nope"), ARMED, render, cache);
    await serveWithEdgeCache(new Request("https://edge.example/Nope"), ARMED, render, cache);
    expect(state.calls).toBe(2);
    expect(cache.puts).toHaveLength(0);
    expect((await cache.match("https://edge.example/Nope")) === undefined).toBe(true);
  });

  it("health/status routes are never stored (classification holds through the cache wrapper)", async () => {
    const cache = fakeCache();
    const status = makeRender("{}", 200);
    const r = await serveWithEdgeCache(new Request("https://edge.example/api/status"), ARMED, status.render, cache);
    expect(cache.puts).toHaveLength(0);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("HEAD bypasses the cache (no match, no put), labeled bypass-head", async () => {
    const cache = fakeCache();
    const { render, state } = makeRender("<html>page</html>");
    const r = await serveWithEdgeCache(new Request("https://edge.example/About", { method: "HEAD" }), ARMED, render, cache);
    expect(state.calls).toBe(1);
    expect(cache.puts).toHaveLength(0);
    expect(r.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=bypass-head");
  });

  it("cache unavailable: renders every time, labels unavailable, never throws", async () => {
    const { render, state } = makeRender("<html>page</html>");
    const r1 = await serveWithEdgeCache(new Request("https://edge.example/About"), ARMED, render, undefined);
    const r2 = await serveWithEdgeCache(new Request("https://edge.example/About"), ARMED, render, undefined);
    expect(state.calls).toBe(2);
    expect(r1.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=unavailable");
    expect(r2.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=unavailable");
  });

  it("a failed put does not fail the request and names the reason in the diagnostic", async () => {
    const cache = fakeCache();
    cache.put = async () => {
      throw new Error("storage full");
    };
    const { render } = makeRender("<html>page</html>");
    const r = await serveWithEdgeCache(new Request("https://edge.example/About"), ARMED, render, cache);
    expect(r.status).toBe(200);
    expect(r.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=miss; store-error=storage full");
  });

  it("the STORED copy carries a positive max-age (max-age=0 is expired-on-arrival for the Cache API)", async () => {
    const cache = fakeCache();
    const { render } = makeRender("<html>page</html>");
    await serveWithEdgeCache(new Request("https://edge.example/About"), ARMED, render, cache);
    const stored = await cache.match("https://edge.example/About");
    expect(stored).toBeDefined();
    expect(stored!.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=300");
    // ...while the client-facing response keeps the L1 browser shape.
  });

  it("a stale entry (past the stored ttl) is treated as a miss and overwritten", async () => {
    const cache = fakeCache();
    const { render, state } = makeRender("v2");
    // Prime with an entry stamped 400 s ago under ttl 300 -> stale.
    const stale = new Response("v1", { status: 200, headers: { "Cache-Control": "public, s-maxage=300" } });
    stale.headers.set("X-Decko-Stored-At", String(Date.now() - 400_000));
    await cache.put("https://edge.example/About", stale);
    const r = await serveWithEdgeCache(new Request("https://edge.example/About"), ARMED, render, cache);
    expect(state.calls).toBe(1);
    expect(await r.text()).toBe("v2");
    expect(r.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=miss+stored; ttl=300");
  });

  it("a fresh entry within a LOWERED ttl is still served (stored ttl governs, current ttl only bounds new writes)", async () => {
    const cache = fakeCache();
    const { render, state } = makeRender("kept");
    const fresh = new Response("kept", { status: 200, headers: { "Cache-Control": "public, s-maxage=300" } });
    fresh.headers.set("X-Decko-Stored-At", String(Date.now() - 10_000));
    await cache.put("https://edge.example/About", fresh);
    const r = await serveWithEdgeCache(
      new Request("https://edge.example/About"),
      { DECKO_EDGE_CACHE: "1", DECKO_EDGE_CACHE_TTL: "30" },
      render,
      cache,
    );
    expect(state.calls).toBe(0);
    expect(await r.text()).toBe("kept");
    expect(r.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=hit");
  });
});

describe("resolveEdgeContentCache", () => {
  it("returns undefined when the runtime has no caches object (loud unavailable, no crash)", () => {
    expect(resolveEdgeContentCache({})).toBeUndefined();
  });

  it("returns caches.default at epoch 0/absent", () => {
    const def = { match: async () => undefined, put: async () => {} };
    (globalThis as { caches?: unknown }).caches = { default: def };
    try {
      expect(resolveEdgeContentCache({})).toBe(def);
      expect(resolveEdgeContentCache({ DECKO_EDGE_CACHE_EPOCH: "0" })).toBe(def);
    } finally {
      delete (globalThis as { caches?: unknown }).caches;
    }
  });

  it("opens an epoch-scoped cache name when the epoch is set", async () => {
    const opened: string[] = [];
    (globalThis as { caches?: unknown }).caches = {
      default: { match: async () => undefined, put: async () => {} },
      open: async (name: string) => {
        opened.push(name);
        return { match: async () => undefined, put: async () => {} };
      },
    };
    try {
      const cache = resolveEdgeContentCache({ DECKO_EDGE_CACHE_EPOCH: "7" });
      expect(cache).toBeDefined();
      await cache!.put("https://edge.example/x", new Response("x"));
      expect(opened).toEqual(["decko-content:v7"]);
    } finally {
      delete (globalThis as { caches?: unknown }).caches;
    }
  });
});

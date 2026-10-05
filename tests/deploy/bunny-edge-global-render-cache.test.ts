// Tests for deploy/bunny-worker-src/bunny-edge-global-render-cache.ts — the
// L3 GLOBAL rendered-HTML tier (BunnyDB-backed) behind
// DECKO_EDGE_GLOBAL_CACHE=1.
//
// Scope: everything verifiable offline. The BunnyDB pipeline endpoint is
// substituted with a fetchImpl fake that answers protocol-shaped pipeline
// responses (the same Hrana-v2 decode shapes src/card/drivers/bunny-db.ts
// pins), so these tests prove the decision logic — hit/miss/store/bypass/
// self-heal/epoch — with no network. The live armed behavior on the trial
// edge is asserted through the X-Decko-Edge-Global-Cache diagnostic header
// by the measurement runs (edge-speed-global-cache-lane receipt); these
// tests pin the contract that observation checks against.

import { describe, expect, it } from "vitest";

import { BunnyDbError } from "../../src/card/drivers/bunny-db.js";
import {
  EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER,
  EDGE_GLOBAL_CACHE_ENV_VAR,
  EDGE_GLOBAL_CACHE_AGE_HEADER,
  EDGE_GLOBAL_CACHE_EPOCH_ENV_VAR,
  GLOBAL_RENDER_CACHE_CLEANUP_SQL,
  GLOBAL_RENDER_CACHE_CREATE_SQL,
  GLOBAL_RENDER_CACHE_LOOKUP_SQL,
  GLOBAL_RENDER_CACHE_LOOKUP_TIMEOUT_MS,
  GLOBAL_RENDER_CACHE_STORE_SQL,
  GLOBAL_RENDER_CACHE_STORE_TIMEOUT_MS,
  GLOBAL_RENDER_CACHE_TABLE,
  GlobalRenderCache,
  getGlobalRenderCache,
  globalCacheEpoch,
  globalRenderCacheArmed,
  resetGlobalRenderCacheForTests,
  withGlobalRenderCache,
} from "../../deploy/bunny-worker-src/bunny-edge-global-render-cache.js";

const ARMED = { DECKO_EDGE_GLOBAL_CACHE: "1" };
const PAGE_URL = "https://edge.example/About";

/** One execute result shaped the way BunnyDB answers (Hrana tags, string
 *  integers). */
function executeResult(cols: string[], rows: unknown[][]): unknown {
  return {
    type: "ok",
    response: {
      type: "execute",
      result: {
        cols: cols.map((name) => ({ name })),
        rows,
        affected_row_count: 0,
        last_insert_rowid: null,
      },
    },
  };
}

function closeResult(): unknown {
  return { type: "ok", response: { type: "close" } };
}

interface FetchCall {
  url: string;
  body: string;
  headers: Record<string, string>;
}

/** A fake pipeline endpoint. `plan` maps call index -> response body (or a
 *  thrown error). Records every call for the SQL-shape pins. */
function fakeEndpoint(plan: Array<unknown | Error>): {
  calls: FetchCall[];
  fetchImpl: typeof fetch;
} {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: FetchCall = {
      url: String(input),
      body: String(init?.body ?? ""),
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const next = plan[calls.length - 1];
    if (next instanceof Error) throw next;
    if (next !== undefined) {
      return new Response(JSON.stringify(next), { status: 200 });
    }
    // Default: answer 1:1 with the request count (one empty execute result
    // per execute, one close), matching the driver's count check.
    const sent = (JSON.parse(call.body) as {
      requests: Array<{ type: string }>;
    }).requests;
    const results = sent.map((r) => (r.type === "close" ? closeResult() : executeResult([], [])));
    return new Response(JSON.stringify({ results }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function makeRender(body: string, status = 200, contentType = "text/html; charset=utf-8") {
  const state = { calls: 0 };
  return {
    state,
    render: async () => {
      state.calls += 1;
      return new Response(body, {
        status,
        headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
      });
    },
  };
}

function makeCache(fetchImpl: typeof fetch): GlobalRenderCache {
  return new GlobalRenderCache(
    { url: "https://db.example/v2/pipeline", authToken: "test-token" },
    { fetchImpl },
  );
}

/** Decode a Hrana wire value the way the driver encodes params (text ->
 *  string, integer -> number) so assertions read as values, not tags. */
function wireArg(arg: unknown): string | number {
  const tagged = arg as { type: string; value?: unknown };
  if (tagged.type === "text") return tagged.value as string;
  if (tagged.type === "integer") return Number(tagged.value);
  throw new Error(`unexpected wire arg type ${tagged.type}`);
}

describe("flag resolution", () => {
  it("arms strictly on \"1\" — true/yes/empty stay off", () => {
    expect(globalRenderCacheArmed(ARMED)).toBe(true);
    expect(globalRenderCacheArmed({})).toBe(false);
    expect(globalRenderCacheArmed({ DECKO_EDGE_GLOBAL_CACHE: "true" })).toBe(false);
    expect(globalRenderCacheArmed({ DECKO_EDGE_GLOBAL_CACHE: "" })).toBe(false);
  });

  it("epoch: shared DECKO_EDGE_CACHE_EPOCH variable, absent/garbage/negative -> 0", () => {
    expect(globalCacheEpoch({})).toBe(0);
    expect(globalCacheEpoch({ [EDGE_GLOBAL_CACHE_EPOCH_ENV_VAR]: "7" })).toBe(7);
    expect(globalCacheEpoch({ [EDGE_GLOBAL_CACHE_EPOCH_ENV_VAR]: "abc" })).toBe(0);
    expect(globalCacheEpoch({ [EDGE_GLOBAL_CACHE_EPOCH_ENV_VAR]: "-2" })).toBe(0);
    expect(globalCacheEpoch({ [EDGE_GLOBAL_CACHE_EPOCH_ENV_VAR]: "1.5" })).toBe(0);
  });

  it("getGlobalRenderCache: undefined when disarmed or config errored, instance when armed", () => {
    resetGlobalRenderCacheForTests();
    expect(getGlobalRenderCache({}, { url: "https://db.example", authToken: "t" })).toBeUndefined();
    expect(
      getGlobalRenderCache(ARMED, { error: "no database credentials in env" }),
    ).toBeUndefined();
    const instance = getGlobalRenderCache(ARMED, { url: "https://db.example", authToken: "t" });
    expect(instance).toBeInstanceOf(GlobalRenderCache);
    // memoized: the same isolate asks twice, one instance
    expect(getGlobalRenderCache(ARMED, { url: "https://other.example", authToken: "x" })).toBe(
      instance,
    );
    resetGlobalRenderCacheForTests();
  });
});

describe("withGlobalRenderCache — disarmed / bypass", () => {
  it("undefined cache: the inner render verbatim, no diagnostic header, no tier contact", async () => {
    const { render, state } = makeRender("<html>page</html>");
    const wrapped = withGlobalRenderCache(new Request(PAGE_URL), {}, undefined, render);
    const response = await wrapped();
    expect(state.calls).toBe(1);
    expect(response.headers.get(EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER)).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("<html>page</html>");
  });

  it("HEAD bypasses the tier (render, bypass-method, no lookup, no store)", async () => {
    const { calls, fetchImpl } = fakeEndpoint([]);
    const cache = makeCache(fetchImpl);
    const { render, state } = makeRender("<html>page</html>");
    const wrapped = withGlobalRenderCache(
      new Request(PAGE_URL, { method: "HEAD" }),
      ARMED,
      cache,
      render,
    );
    const response = await wrapped();
    expect(state.calls).toBe(1);
    expect(calls).toHaveLength(0);
    expect(response.headers.get(EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER)).toBe("bypass-method");
  });
});

describe("withGlobalRenderCache — armed hit", () => {
  it("serves the stored bytes with the L1 anon cache shape, without rendering", async () => {
    const storedAt = Date.now() - 5_000;
    const { calls, fetchImpl } = fakeEndpoint([
      {
        results: [
          executeResult(
            ["content_type", "body", "stored_at"],
            [
              [
                { type: "text", value: "text/html; charset=utf-8" },
                { type: "text", value: "<html>stored page</html>" },
                { type: "integer", value: String(storedAt) },
              ],
            ],
          ),
          closeResult(),
        ],
      },
    ]);
    const cache = makeCache(fetchImpl);
    const { render, state } = makeRender("<html>fresh render</html>");
    const wrapped = withGlobalRenderCache(new Request(PAGE_URL), ARMED, cache, render);
    const response = await wrapped();
    expect(state.calls).toBe(0); // the render never ran
    expect(await response.text()).toBe("<html>stored page</html>");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=300");
    expect(response.headers.get(EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER)).toBe("hit");
    expect(Number(response.headers.get(EDGE_GLOBAL_CACHE_AGE_HEADER))).toBeGreaterThanOrEqual(4);
    // the lookup was ONE pipeline POST with the pinned SQL + args
    expect(calls).toHaveLength(1);
    const sent = JSON.parse(calls[0].body) as {
      requests: Array<{ type: string; stmt?: { sql: string; args: unknown[] } }>;
    };
    expect(sent.requests[0]?.stmt?.sql).toBe(GLOBAL_RENDER_CACHE_LOOKUP_SQL);
    const lookupArgs = (sent.requests[0]?.stmt?.args ?? []).map(wireArg);
    expect(lookupArgs).toEqual([PAGE_URL, 0]);
    expect(sent.requests.at(-1)?.type).toBe("close");
  });

  it("hit Cache-Control honors the env TTL override, same variable the L2/L1 read", async () => {
    const { fetchImpl } = fakeEndpoint([
      {
        results: [
          executeResult(
            ["content_type", "body", "stored_at"],
            [
              [
                { type: "text", value: "text/html; charset=utf-8" },
                { type: "text", value: "<html>stored</html>" },
                { type: "integer", value: String(Date.now()) },
              ],
            ],
          ),
          closeResult(),
        ],
      },
    ]);
    const cache = makeCache(fetchImpl);
    const { render } = makeRender("<html>fresh</html>");
    const wrapped = withGlobalRenderCache(
      new Request(PAGE_URL),
      { ...ARMED, DECKO_EDGE_CACHE_TTL: "86400" },
      cache,
      render,
    );
    const response = await wrapped();
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=86400");
  });

  it("lookup carries the env epoch — a bump misses instead of serving the old epoch", async () => {
    const { calls, fetchImpl } = fakeEndpoint([
      { results: [executeResult(["content_type", "body", "stored_at"], []), closeResult()] },
      { results: [executeResult([], []), executeResult([], []), closeResult()] },
    ]);
    const cache = makeCache(fetchImpl);
    const { render, state } = makeRender("<html>fresh</html>");
    const wrapped = withGlobalRenderCache(
      new Request(PAGE_URL),
      { ...ARMED, [EDGE_GLOBAL_CACHE_EPOCH_ENV_VAR]: "9" },
      cache,
      render,
    );
    const response = await wrapped();
    expect(state.calls).toBe(1);
    const lookup = JSON.parse(calls[0].body) as {
      requests: Array<{ stmt?: { args: unknown[] } }>;
    };
    expect((lookup.requests[0]?.stmt?.args ?? []).map(wireArg)).toEqual([PAGE_URL, 9]);
    // the miss wrote through under the SAME epoch
    const store = JSON.parse(calls[1].body) as {
      requests: Array<{ stmt?: { sql: string; args?: unknown[] } }>;
    };
    expect(store.requests[0]?.stmt?.sql).toBe(GLOBAL_RENDER_CACHE_STORE_SQL);
    expect(wireArg(store.requests[0]?.stmt?.args?.[1])).toBe(9);
    expect(response.headers.get(EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER)).toBe("miss+stored");
  });
});

describe("withGlobalRenderCache — armed miss (write-through)", () => {
  it("renders, stores cacheable 200s (store + old-epoch cleanup in ONE POST), labels miss+stored", async () => {
    const { calls, fetchImpl } = fakeEndpoint([
      { results: [executeResult(["content_type", "body", "stored_at"], []), closeResult()] },
      { results: [executeResult([], []), executeResult([], []), closeResult()] },
    ]);
    const cache = makeCache(fetchImpl);
    const { render, state } = makeRender("<html>fresh page</html>");
    const wrapped = withGlobalRenderCache(new Request(PAGE_URL), ARMED, cache, render);
    const response = await wrapped();
    expect(state.calls).toBe(1);
    expect(await response.text()).toBe("<html>fresh page</html>");
    expect(calls).toHaveLength(2); // lookup + store; the store is ONE POST
    const store = JSON.parse(calls[1].body) as {
      requests: Array<{ stmt?: { sql: string; args?: unknown[] } }>;
    };
    expect(store.requests).toHaveLength(3); // insert + cleanup + close
    expect(store.requests[0]?.stmt?.sql).toBe(GLOBAL_RENDER_CACHE_STORE_SQL);
    expect(wireArg(store.requests[0]?.stmt?.args?.[0])).toBe(PAGE_URL);
    expect(wireArg(store.requests[0]?.stmt?.args?.[2])).toBe("text/html; charset=utf-8");
    expect(wireArg(store.requests[0]?.stmt?.args?.[3])).toBe("<html>fresh page</html>");
    expect(store.requests[1]?.stmt?.sql).toBe(GLOBAL_RENDER_CACHE_CLEANUP_SQL);
    expect(response.headers.get(EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER)).toBe("miss+stored");
  });

  it("non-200 renders are looked up but never stored", async () => {
    const { calls, fetchImpl } = fakeEndpoint([
      { results: [executeResult(["content_type", "body", "stored_at"], []), closeResult()] },
    ]);
    const cache = makeCache(fetchImpl);
    const { render } = makeRender("<html>missing</html>", 404);
    const wrapped = withGlobalRenderCache(new Request(PAGE_URL), ARMED, cache, render);
    const response = await wrapped();
    expect(calls).toHaveLength(1); // lookup only
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get(EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER)).toBe("miss; store=skip-404");
  });

  it("/_status-class routes are never stored (same edgeRouteCacheClass the L2 uses)", async () => {
    const { calls, fetchImpl } = fakeEndpoint([
      { results: [executeResult(["content_type", "body", "stored_at"], []), closeResult()] },
    ]);
    const cache = makeCache(fetchImpl);
    const { render } = makeRender("{}", 200, "application/json; charset=utf-8");
    const wrapped = withGlobalRenderCache(
      new Request("https://edge.example/_status"),
      ARMED,
      cache,
      render,
    );
    const response = await wrapped();
    expect(calls).toHaveLength(1);
    expect(response.headers.get(EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER)).toBe(
      "miss; store=skip-uncacheable",
    );
  });

  it("a failing store never fails the request — the label names the reason", async () => {
    const { calls, fetchImpl } = fakeEndpoint([
      { results: [executeResult(["content_type", "body", "stored_at"], []), closeResult()] },
      // a plain cause error: the driver frames it as a transport failure
      new Error("reset"),
    ]);
    const cache = makeCache(fetchImpl);
    const { render, state } = makeRender("<html>fresh</html>");
    const wrapped = withGlobalRenderCache(new Request(PAGE_URL), ARMED, cache, render);
    const response = await wrapped();
    expect(state.calls).toBe(1);
    expect(await response.text()).toBe("<html>fresh</html>");
    expect(response.headers.get(EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER)).toBe(
      "miss; store-error=BunnyDb pipeline transport failed: reset",
    );
  });

  it("a failing lookup never fails the request — the render takes over", async () => {
    const { calls, fetchImpl } = fakeEndpoint([new Error("abort")]);
    const cache = makeCache(fetchImpl);
    const { render, state } = makeRender("<html>fresh</html>");
    const wrapped = withGlobalRenderCache(new Request(PAGE_URL), ARMED, cache, render);
    const response = await wrapped();
    expect(state.calls).toBe(1);
    expect(calls).toHaveLength(1);
    expect(response.headers.get(EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER)).toBe(
      "lookup-error=BunnyDb pipeline transport failed: abort",
    );
    // a lookup error must not enable a store of this render (the tier is
    // degraded, not half-populated by an error path)
    expect(calls).toHaveLength(1);
  });
});

describe("GlobalRenderCache self-heal", () => {
  it("a 'no such table' store failure creates the table once and retries the write", async () => {
    const { calls, fetchImpl } = fakeEndpoint([
      // an in-band server error entry (the shape a missing table really
      // arrives in) — result count matches the 3-request store pipeline
      {
        results: [
          { type: "error", error: { message: "no such table: decko_edge_render_cache" } },
          executeResult([], []),
          closeResult(),
        ],
      },
      { results: [executeResult([], []), closeResult()] }, // CREATE
      { results: [executeResult([], []), executeResult([], []), closeResult()] }, // retry
    ]);
    const cache = makeCache(fetchImpl);
    await cache.store("https://edge.example/A", 2, "text/html; charset=utf-8", "<html>a</html>");
    expect(calls).toHaveLength(3);
    const create = JSON.parse(calls[1].body) as {
      requests: Array<{ stmt?: { sql: string } }>;
    };
    expect(create.requests[0]?.stmt?.sql).toBe(GLOBAL_RENDER_CACHE_CREATE_SQL);
    // second store on the same instance goes straight through (no re-create)
    await cache.store("https://edge.example/B", 2, "text/html; charset=utf-8", "<html>b</html>");
    expect(calls).toHaveLength(4);
  });
});

describe("pins — the contract the live measurement and the bundle check assert through", () => {
  it("env var, table, header names, SQL literals, and the timeout bounds are the pinned literals", () => {
    expect(EDGE_GLOBAL_CACHE_ENV_VAR).toBe("DECKO_EDGE_GLOBAL_CACHE");
    expect(EDGE_GLOBAL_CACHE_EPOCH_ENV_VAR).toBe("DECKO_EDGE_CACHE_EPOCH");
    expect(EDGE_GLOBAL_CACHE_DIAGNOSTIC_HEADER).toBe("X-Decko-Edge-Global-Cache");
    expect(EDGE_GLOBAL_CACHE_AGE_HEADER).toBe("X-Decko-Global-Age-Seconds");
    expect(GLOBAL_RENDER_CACHE_TABLE).toBe("decko_edge_render_cache");
    expect(GLOBAL_RENDER_CACHE_LOOKUP_SQL).toContain("FROM decko_edge_render_cache");
    expect(GLOBAL_RENDER_CACHE_LOOKUP_SQL).toContain("WHERE url = ? AND epoch = ?");
    expect(GLOBAL_RENDER_CACHE_STORE_SQL).toContain("ON CONFLICT(url) DO UPDATE");
    expect(GLOBAL_RENDER_CACHE_CLEANUP_SQL).toContain("WHERE epoch < ?");
    expect(GLOBAL_RENDER_CACHE_CREATE_SQL).toContain("CREATE TABLE IF NOT EXISTS");
    expect(GLOBAL_RENDER_CACHE_LOOKUP_TIMEOUT_MS).toBe(1_500);
    expect(GLOBAL_RENDER_CACHE_STORE_TIMEOUT_MS).toBe(3_000);
  });

  it("the tier driver never retries (a retried lookup doubles the stall before the render takes over)", async () => {
    // Two consecutive transport failures -> the lookup throws after exactly
    // ONE attempt (retries: 0); a retried driver would have made a second.
    const { calls, fetchImpl } = fakeEndpoint([
      new BunnyDbError("transport one"),
      new BunnyDbError("transport two"),
    ]);
    const cache = makeCache(fetchImpl);
    await expect(cache.lookup(PAGE_URL, 0)).rejects.toThrow("transport one");
    expect(calls).toHaveLength(1);
  });
});

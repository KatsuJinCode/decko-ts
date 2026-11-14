// The cold-render reliability deadline
// (deploy/bunny-worker-src/bunny-edge-engine-request.ts —
// DEFAULT_EDGE_RENDER_BUDGET_MS / resolveEdgeRenderBudgetMs /
// handleEngineRequest's options) and the per-hop bounds in the driver
// (src/card/drivers/bunny-db.ts — DEFAULT_PIPELINE_TIMEOUT_MS,
// DEFAULT_PIPELINE_RETRIES).
//
// WHAT IS BEING PINNED, and why each case is red without the change:
//
//  1. The 503 shape. A render that overruns its budget answers 503, not 500,
//     and carries Retry-After. This is the whole point of the change: the
//     operator saw a page return 500 after ~40 s and 200 on retry, and the
//     fix's contract is that the slow case now returns a retry-able status
//     the client can act on. Without the deadline there is no 503 path at
//     all — the request either renders (200) or throws (500).
//  2. The 503's cache class. `Cache-Control: no-store`, so a transient slow
//     render can never be cemented into the L2 script cache or an outer CDN.
//     This is the regression guard on the change's own constraint: adding a
//     new response shape must not move any existing caching class.
//  3. Fast renders are untouched. A render that finishes inside its budget
//     returns byte-identically — same status, same body, no budget header.
//     Without this the deadline would be a silent behavior change on the
//     99% path, which is the only way a change like this can do real damage.
//  4. A late rejection after the budget fired is still a 503, not a 500. The
//     abandoned render keeps running and eventually throws; that throw must
//     not replace the clean answer already sent.
//  5. The default is opt-out-able in both directions: budgetMs <= 0 means
//     unbounded (the previous behavior), so the rollback needs no code.
//  6. The env resolver: absent -> default; "0" -> unbounded; garbage ->
//     default; negative -> default. A typo in the edge variable must fail
//     SAFE (to the default), not to "no deadline".
//  7. The driver: a stalled hop aborts at the default timeout instead of
//     waiting forever, and one transport failure is retried rather than
//     becoming a 500 error page.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_EDGE_RENDER_BUDGET_MS,
  EDGE_BUDGET_DIAGNOSTIC_HEADER,
  EDGE_BUDGET_RETRY_AFTER_SECONDS,
  EDGE_RENDER_BUDGET_ENV_VAR,
  handleEngineRequest,
  resolveEdgeRenderBudgetMs,
  type Deck,
} from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  BunnyDbDriver,
  DEFAULT_PIPELINE_RETRIES,
  DEFAULT_PIPELINE_TIMEOUT_MS,
} from "../../src/card/drivers/bunny-db.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

function edgeGet(pathname: string): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`);
}

/** A deck whose render takes `ms` milliseconds and then succeeds with a
 *  known body — the shape of "a long but legitimate cold render". The
 *  200-path's render entry is
 *  renderPageBytes, whose first statement wraps the page assembly in
 *  engine.runWithPageConfig — the stub delays THERE and answers with the
 *  body the original stub produced (the thing under test is the budget, not
 *  the page assembly, so no deck data is needed). */
function deckWithRenderDelay(storage: RenderTestStorage, ms: number) {
  return {
    fetcher: storage.fetcher,
    render: {
      runWithPageConfig: async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return `<p>Some+Card open</p>`;
      },
    } as unknown as RenderTestStorage["engine"],
  };
}

/** A deck whose render hangs past the budget and then rejects — the shape of
 *  "the abandoned render blew up after we stopped waiting for it". Same seam
 *  as deckWithRenderDelay. */
function deckThatHangsThenThrows(storage: RenderTestStorage, ms: number, message: string) {
  return {
    fetcher: storage.fetcher,
    render: {
      runWithPageConfig: async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        throw new Error(message);
      },
    } as unknown as RenderTestStorage["engine"],
  };
}

describe("bunny edge — cold-render deadline", () => {
  it("a render that overruns its budget answers 503 with Retry-After, not 500", async () => {
    const storage = await createRenderTestStorage();
    try {
      const response = await handleEngineRequest(
        edgeGet("/Some+Card"),
        deckWithRenderDelay(storage, 400),
        { budgetMs: 40 },
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe(String(EDGE_BUDGET_RETRY_AFTER_SECONDS));
      expect(response.headers.get(EDGE_BUDGET_DIAGNOSTIC_HEADER)).toMatch(/^exceeded; budget_ms=40$/);
    } finally {
      await storage.close();
    }
  });

  it("the budget-exceeded response is no-store — no caching class moves", async () => {
    const storage = await createRenderTestStorage();
    try {
      const response = await handleEngineRequest(
        edgeGet("/Some+Card"),
        deckWithRenderDelay(storage, 400),
        { budgetMs: 40 },
      );
      // The constructor's no-store survives: the budget path builds its
      // response through the same html() helper as every other error page,
      // so a transient slow render can never be cached at any layer.
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const body = await response.text();
      // Same layout shell + same escaping convention as every other page.
      expect(body).toContain("<title>Slow render</title>");
      expect(body).toContain("retrying in a few seconds");
    } finally {
      await storage.close();
    }
  });

  it("a render that finishes inside its budget is byte-identical and carries no budget header", async () => {
    const storage = await createRenderTestStorage();
    try {
      const deck = deckWithRenderDelay(storage, 5);
      const insideBudget = await handleEngineRequest(edgeGet("/Some+Card"), deck, {
        budgetMs: 5_000,
      });
      expect(insideBudget.status).toBe(200);
      expect(insideBudget.headers.get(EDGE_BUDGET_DIAGNOSTIC_HEADER)).toBeNull();
      expect(insideBudget.headers.get("Retry-After")).toBeNull();
      const insideBody = await insideBudget.text();
      expect(insideBody).toContain("<p>Some+Card open</p>");

      // The same deck with the deadline OFF produces the same bytes: the
      // guard against the deadline changing the 99% path.
      const unbounded = await handleEngineRequest(edgeGet("/Some+Card"), deck);
      expect(unbounded.status).toBe(insideBudget.status);
      expect(await unbounded.text()).toBe(insideBody);
    } finally {
      await storage.close();
    }
  });

  it("budgetMs <= 0 disables the deadline — the pre-lane behavior, no code rollback needed", async () => {
    const storage = await createRenderTestStorage();
    try {
      for (const budgetMs of [0, -1]) {
        const response = await handleEngineRequest(
          edgeGet("/Some+Card"),
          deckWithRenderDelay(storage, 120),
          { budgetMs },
        );
        expect(response.status).toBe(200);
        expect(response.headers.get(EDGE_BUDGET_DIAGNOSTIC_HEADER)).toBeNull();
      }
    } finally {
      await storage.close();
    }
  });

  it("a rejection that arrives AFTER the budget fired is still the clean 503, never a 500", async () => {
    const storage = await createRenderTestStorage();
    try {
      const response = await handleEngineRequest(
        edgeGet("/Some+Card"),
        // Throws at 200 ms, budget trips at 30 ms: the throw lands after the
        // deadline has already answered.
        deckThatHangsThenThrows(storage, 200, "boom after the budget"),
        { budgetMs: 30 },
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe(String(EDGE_BUDGET_RETRY_AFTER_SECONDS));
    } finally {
      await storage.close();
    }
  });

  it("a rejection BEFORE the budget still maps through the existing error mapping (500)", async () => {
    const storage = await createRenderTestStorage();
    try {
      const response = await handleEngineRequest(
        edgeGet("/Some+Card"),
        deckThatHangsThenThrows(storage, 1, "boom immediately"),
        { budgetMs: 5_000 },
      );
      // The deadline does not swallow real render errors; it only bounds how
      // long the answer takes. This is the pre-existing 500 path.
      // The 500 body is the error builder's shape now — this storage seeds
      // no default layout, so the
      // builder's minimal fallback stub answers ("Render error"); the
      // original message no longer rides the page when the chrome builds.
      expect(response.status).toBe(500);
      expect(await response.text()).toContain("<h1>Render error</h1>");
    } finally {
      await storage.close();
    }
  });

  it("the deadline wraps the /api/card read gate too, not only the HTML render", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCard(storage, { name: "Budget Card", dbContent: "hello" });
      const slowDeck = {
        fetcher: {
          fetchByName: async () => {
            await new Promise((resolve) => setTimeout(resolve, 400));
            return undefined;
          },
        },
        render: storage.engine,
      } as unknown as Deck;
      const response = await handleEngineRequest(
        edgeGet("/api/card/Budget+Card"),
        slowDeck,
        { budgetMs: 40 },
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    } finally {
      await storage.close();
    }
  });

  it("the 503 escapes like every other error page (no raw markup from the request)", async () => {
    const storage = await createRenderTestStorage();
    try {
      const response = await handleEngineRequest(
        // A crafted single-segment name that reaches the page title on a 200
        // must reach it as TEXT on a 503 too — the budget page is built by
        // the same layoutPage/escapeHtml pair.
        edgeGet("/%3Cscript%3Ealert(1)%3C%2Fscript%3E"),
        deckWithRenderDelay(storage, 400),
        { budgetMs: 40 },
      );
      expect(response.status).toBe(503);
      const body = await response.text();
      expect(body).not.toContain("<script>alert(1)</script>");
    } finally {
      await storage.close();
    }
  });
});

describe("bunny edge — render budget env resolver", () => {
  it("absent keeps the measured default", () => {
    expect(resolveEdgeRenderBudgetMs({})).toBe(DEFAULT_EDGE_RENDER_BUDGET_MS);
  });

  it("an explicit 0 disables the deadline (operator rollback, no republish)", () => {
    expect(resolveEdgeRenderBudgetMs({ [EDGE_RENDER_BUDGET_ENV_VAR]: "0" })).toBe(0);
  });

  it("a positive integer is honored", () => {
    expect(resolveEdgeRenderBudgetMs({ [EDGE_RENDER_BUDGET_ENV_VAR]: "30000" })).toBe(30000);
  });

  it("garbage, empty, and negative values FAIL SAFE to the default, never to unbounded", () => {
    for (const bad of ["", "   ", "soon", "-1", "NaN", "1e999"]) {
      expect(resolveEdgeRenderBudgetMs({ [EDGE_RENDER_BUDGET_ENV_VAR]: bad })).toBe(
        DEFAULT_EDGE_RENDER_BUDGET_MS,
      );
    }
  });

  it("the default sits above the worst legitimate cold render", () => {
    // The bound must clear the heaviest real cold renders (the worst cards
    // reproducibly build in the tens of seconds) — a deadline at or below
    // that number would 503 renders that work.
    expect(DEFAULT_EDGE_RENDER_BUDGET_MS).toBeGreaterThan(13_500);
    // ...and below the ~40 s at which the platform takes the request over
    // and answers with an opaque 5xx instead.
    expect(DEFAULT_EDGE_RENDER_BUDGET_MS).toBeLessThan(40_000);
  });
});

describe("bunny-db driver — per-hop bounds (cold-render chain safety)", () => {
  const okResponse = () =>
    new Response(
      JSON.stringify({
        results: [
          {
            type: "ok",
            response: { type: "execute", result: { cols: [{ name: "n" }], rows: [[{ type: "integer", value: "1" }]], affected_row_count: 0 } },
          },
          { type: "ok", response: null },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  it("DEFAULT_PIPELINE_TIMEOUT_MS is on unless the caller names a timeout — a chain of ~1,000 hops has no unbounded term", () => {
    const withDefault = new BunnyDbDriver({ url: "https://db.example", authToken: "t" });
    // Reaching the private field is the point: the guarantee is about what
    // pipeline() sends to fetch, and that is exactly this value.
    expect((withDefault as unknown as { timeoutMs?: number }).timeoutMs).toBe(
      DEFAULT_PIPELINE_TIMEOUT_MS,
    );
    const named = new BunnyDbDriver({
      url: "https://db.example",
      authToken: "t",
      timeoutMs: 1_234,
    });
    expect((named as unknown as { timeoutMs?: number }).timeoutMs).toBe(1_234);
    const optedOut = new BunnyDbDriver({
      url: "https://db.example",
      authToken: "t",
      timeoutMs: 0,
    });
    expect((optedOut as unknown as { timeoutMs?: number }).timeoutMs).toBeUndefined();
  });

  it("one transport failure is retried once, and a clean retry is returned to the caller", async () => {
    let calls = 0;
    const driver = new BunnyDbDriver({
      url: "https://db.example",
      authToken: "t",
      fetchImpl: (async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("connection reset by peer");
        return okResponse();
      }) as typeof fetch,
    });
    const result = await driver.query("SELECT 1 AS n", []);
    expect(calls).toBe(2);
    expect(result.rows).toEqual([{ n: 1 }]);
  });

  it("a 500 from the database is retried; a 400 is not (the request is wrong, retrying just doubles the latency)", async () => {
    let calls = 0;
    const retrying = new BunnyDbDriver({
      url: "https://db.example",
      authToken: "t",
      fetchImpl: (async () => {
        calls += 1;
        return new Response("upstream boom", { status: 503, statusText: "Service Unavailable" });
      }) as typeof fetch,
    });
    await expect(retrying.query("SELECT 1", [])).rejects.toThrow(/HTTP 503/);
    expect(calls).toBe(DEFAULT_PIPELINE_RETRIES + 1);

    calls = 0;
    const notRetrying = new BunnyDbDriver({
      url: "https://db.example",
      authToken: "t",
      fetchImpl: (async () => {
        calls += 1;
        return new Response("bad statement", { status: 400, statusText: "Bad Request" });
      }) as typeof fetch,
    });
    await expect(notRetrying.query("SELECT 1", [])).rejects.toThrow(/HTTP 400/);
    expect(calls).toBe(1);
  });

  it("a persistent failure is thrown after the retry budget, not after an unbounded wait", async () => {
    let calls = 0;
    const driver = new BunnyDbDriver({
      url: "https://db.example",
      authToken: "t",
      retries: 2,
      fetchImpl: (async () => {
        calls += 1;
        throw new TypeError("ECONNRESET");
      }) as typeof fetch,
    });
    await expect(driver.query("SELECT 1", [])).rejects.toThrow(/transport failed/);
    expect(calls).toBe(3);
  });

  it("retries: 0 disables retrying entirely", async () => {
    let calls = 0;
    const driver = new BunnyDbDriver({
      url: "https://db.example",
      authToken: "t",
      retries: 0,
      fetchImpl: (async () => {
        calls += 1;
        throw new TypeError("ECONNRESET");
      }) as typeof fetch,
    });
    await expect(driver.query("SELECT 1", [])).rejects.toThrow(/transport failed/);
    expect(calls).toBe(1);
  });

  it("an in-band Hrana statement error is NOT retried — the SQL is wrong, not the network", async () => {
    let calls = 0;
    const driver = new BunnyDbDriver({
      url: "https://db.example",
      authToken: "t",
      fetchImpl: (async () => {
        calls += 1;
        return new Response(
          JSON.stringify({
            results: [
              { type: "error", error: { message: "no such table: nope", code: "SQLITE_UNKNOWN" } },
              { type: "ok", response: null },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });
    await expect(driver.query("SELECT * FROM nope", [])).rejects.toThrow(/no such table/);
    expect(calls).toBe(1);
  });

  it("the retry never puts the token in an error message", async () => {
    const driver = new BunnyDbDriver({
      url: "https://db.example",
      authToken: "super-secret-token-value",
      retries: 1,
      fetchImpl: (async () => {
        throw new TypeError("ECONNRESET");
      }) as typeof fetch,
    });
    await expect(driver.query("SELECT 1", [])).rejects.toThrow(
      expect.not.stringContaining("super-secret-token-value") as unknown as RegExp,
    );
    await driver.query("SELECT 1", []).catch((err: Error) => {
      expect(err.message).not.toContain("super-secret-token-value");
    });
  });
});

// The read-only Bunny edge script's routing: what it serves itself and what
// it forwards to the full engine script (bunny-edge-read-handler.ts).
//
// The page bytes it serves are gated elsewhere (the 40-page byte gate runs
// the built read bundle); this file pins the forwarding contract, which is
// what keeps sign-in, sessions and writes working when the read script fronts
// the site.
import { afterEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME } from "../../src/server/write-routes.js";
import {
  READ_EDGE_SESSION_COOKIE,
  forwardToFullEngine,
  handleBunnyReadRequest,
  readEdgeForwards,
} from "../../deploy/bunny-worker-src/bunny-edge-read-handler.js";

const SITE = "https://site.example";
const FULL = "https://full-engine.example";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readEdgeForwards", () => {
  it("uses the write surface's session cookie name", () => {
    expect(READ_EDGE_SESSION_COOKIE).toBe(SESSION_COOKIE_NAME);
  });

  it("serves cookieless GET and HEAD reads itself", () => {
    for (const path of ["/", "/About", "/About/core", "/About?view=core", "/new/RichText", "/api/status", "/_status"]) {
      expect(readEdgeForwards(new Request(SITE + path))).toBe(false);
      expect(readEdgeForwards(new Request(SITE + path, { method: "HEAD" }))).toBe(false);
    }
    expect(readEdgeForwards(new Request(`${SITE}/About`, { headers: { cookie: "other=1" } }))).toBe(false);
  });

  it("forwards every other method", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(readEdgeForwards(new Request(`${SITE}/update/*signin`, { method, body: method === "OPTIONS" ? undefined : "x" }))).toBe(true);
    }
  });

  it("forwards session-cookie requests and the auth and setup paths", () => {
    expect(readEdgeForwards(new Request(`${SITE}/About`, { headers: { cookie: `a=1; ${SESSION_COOKIE_NAME}=tok` } }))).toBe(true);
    for (const path of ["/_signin", "/_signout", "/_signout/", "/setup"]) {
      expect(readEdgeForwards(new Request(SITE + path))).toBe(true);
    }
  });
});

describe("forwardToFullEngine", () => {
  it("answers 500 when the full script's address is missing", async () => {
    const r = await forwardToFullEngine(new Request(`${SITE}/_signin`), {});
    expect(r.status).toBe(500);
  });

  it("passes method, path, query, headers and body through, and maps redirects back to the site", async () => {
    const seen: { url: string; method: string; body: string; cookie: string | null; fwd: string | null; redirect: RequestRedirect | undefined }[] = [];
    vi.stubGlobal("fetch", async (input: URL | string, init: RequestInit) => {
      const h = new Headers(init.headers);
      seen.push({
        url: String(input),
        method: init.method ?? "GET",
        body: init.body ? new TextDecoder().decode(init.body as ArrayBuffer) : "",
        cookie: h.get("cookie"),
        fwd: h.get("x-forwarded-host"),
        redirect: init.redirect,
      });
      return new Response("", {
        status: 303,
        headers: [
          ["location", `http://full-engine.example/About?x=1`],
          ["set-cookie", `${SESSION_COOKIE_NAME}=abc; Path=/; HttpOnly`],
          ["content-encoding", "gzip"],
        ],
      });
    });
    const r = await forwardToFullEngine(
      new Request(`${SITE}/update/*signin?success=About`, {
        method: "POST",
        headers: { cookie: "a=1", "content-type": "application/x-www-form-urlencoded" },
        body: "card%5Bsubcards%5D=x",
      }),
      { DECKO_EDGE_FULL_URL: FULL },
    );
    expect(seen).toEqual([{
      url: `${FULL}/update/*signin?success=About`,
      method: "POST",
      body: "card%5Bsubcards%5D=x",
      cookie: "a=1",
      fwd: "site.example",
      redirect: "manual",
    }]);
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("http://site.example/About?x=1");
    expect(r.headers.get("set-cookie")).toBe(`${SESSION_COOKIE_NAME}=abc; Path=/; HttpOnly`);
    expect(r.headers.get("content-encoding")).toBeNull();
  });

  it("leaves a redirect to another host alone", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 302, headers: { location: "https://elsewhere.example/x" } }));
    const r = await forwardToFullEngine(new Request(`${SITE}/_signout`), { DECKO_EDGE_FULL_URL: FULL });
    expect(r.headers.get("location")).toBe("https://elsewhere.example/x");
  });
});

describe("handleBunnyReadRequest", () => {
  it("forwards a write through the handler and labels it with Server-Timing", async () => {
    vi.stubGlobal("fetch", async () => new Response("forwarded", { status: 403 }));
    const r = await handleBunnyReadRequest(new Request(`${SITE}/card/create`, { method: "POST", body: "x" }), { DECKO_EDGE_FULL_URL: FULL });
    expect(r.status).toBe(403);
    expect(await r.text()).toBe("forwarded");
    expect(r.headers.get("server-timing")).toMatch(/total;dur=/);
  });

  it("serves a cookieless read itself (no forward)", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (input: URL | string) => {
      fetched.push(String(input));
      return new Response("{}", { status: 500 });
    });
    // No database credentials: the read path answers its own 500, and
    // nothing is sent to the full script.
    const r = await handleBunnyReadRequest(new Request(`${SITE}/About`), { DECKO_EDGE_FULL_URL: FULL });
    expect(r.status).toBe(500);
    expect(fetched.filter((u) => u.startsWith(FULL))).toEqual([]);
  });
});

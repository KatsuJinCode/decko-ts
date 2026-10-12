// Tests for deploy/bunny-worker-src/bunny-edge-cache-headers.ts — the CDN
// cacheability decision behind the DECKO_EDGE_CACHE flag.
//
// Scope: everything verifiable offline, no account, no network. The module is
// pure decision logic (the entry wires it at exactly one wrap site), so these
// tests drive the exported functions directly with constructed Response
// objects. This file pins the decision table; the armed runtime behavior on a
// live edge is a deployment concern and is not covered here.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_EDGE_CACHE_TTL_SECONDS,
  applyEdgeCacheHeaders,
  cacheControlFor,
  edgeCacheArmed,
  edgeCacheTtlSeconds,
  edgeRouteCacheClass,
} from "../../deploy/bunny-worker-src/bunny-edge-cache-headers.js";

const NO_STORE = "no-store";

function htmlResponse(status: number, body = "<html></html>"): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": NO_STORE },
  });
}

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": NO_STORE },
  });
}

describe("edgeCacheArmed", () => {
  it("arms strictly on \"1\" (same convention as the write surface's DECKO_WRITE_PATH)", () => {
    expect(edgeCacheArmed({ DECKO_EDGE_CACHE: "1" })).toBe(true);
  });

  it("does not arm on look-alike values or absence", () => {
    for (const value of ["true", "yes", "on", "0", "", undefined]) {
      expect(edgeCacheArmed({ DECKO_EDGE_CACHE: value })).toBe(false);
    }
    expect(edgeCacheArmed({})).toBe(false);
  });
});

describe("edgeCacheTtlSeconds", () => {
  it("defaults to the 300 s backstop", () => {
    expect(edgeCacheTtlSeconds({})).toBe(DEFAULT_EDGE_CACHE_TTL_SECONDS);
    expect(DEFAULT_EDGE_CACHE_TTL_SECONDS).toBe(300);
  });

  it("honors a positive integer override", () => {
    expect(edgeCacheTtlSeconds({ DECKO_EDGE_CACHE_TTL: "60" })).toBe(60);
    expect(edgeCacheTtlSeconds({ DECKO_EDGE_CACHE_TTL: "3600" })).toBe(3600);
  });

  it("falls back to the default on zero, negative, fractional or garbage values", () => {
    for (const value of ["0", "-5", "3.5", "abc", ""]) {
      expect(edgeCacheTtlSeconds({ DECKO_EDGE_CACHE_TTL: value })).toBe(300);
    }
  });
});

describe("edgeRouteCacheClass", () => {
  it("classifies card page renders (root, name, name/view) as content-html", () => {
    for (const path of ["/", "/About", "/Hello%20World", "/About/title", "/Home/history"]) {
      expect(edgeRouteCacheClass(path, 200)).toBe("content-html");
    }
  });

  it("classifies card metadata JSON as content-json", () => {
    expect(edgeRouteCacheClass("/api/card/About", 200)).toBe("content-json");
  });

  it("keeps health/status routes uncacheable even on 200", () => {
    expect(edgeRouteCacheClass("/_status", 200)).toBe("uncacheable");
    expect(edgeRouteCacheClass("/api/status", 200)).toBe("uncacheable");
  });

  it("keeps every non-200 uncacheable (errors must never be cemented)", () => {
    expect(edgeRouteCacheClass("/Eagle", 500)).toBe("uncacheable");
    expect(edgeRouteCacheClass("/NoSuchCard", 500)).toBe("uncacheable");
    expect(edgeRouteCacheClass("/About/nosuchview", 404)).toBe("uncacheable");
    expect(edgeRouteCacheClass("/About/badview", 422)).toBe("uncacheable");
    expect(edgeRouteCacheClass("/api/card/missing", 404)).toBe("uncacheable");
    expect(edgeRouteCacheClass("/", 403)).toBe("uncacheable");
  });

  it("normalizes trailing slashes before classifying", () => {
    expect(edgeRouteCacheClass("/About/", 200)).toBe("content-html");
    expect(edgeRouteCacheClass("/api/status/", 200)).toBe("uncacheable");
  });
});

describe("cacheControlFor", () => {
  it("emits public, max-age=0, s-maxage=<ttl>", () => {
    expect(cacheControlFor("content-html", 300)).toBe("public, max-age=0, s-maxage=300");
    expect(cacheControlFor("content-json", 60)).toBe("public, max-age=0, s-maxage=60");
  });
});

describe("applyEdgeCacheHeaders", () => {
  it("flag OFF: returns the response untouched (byte-identical pass-through)", () => {
    const response = htmlResponse(200, "<html>page</html>");
    const out = applyEdgeCacheHeaders(response, "/About", {});
    expect(out).toBe(response);
    expect(out.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(out.status).toBe(200);
  });

  it("armed: card page renders get public, max-age=0, s-maxage=300", () => {
    const response = applyEdgeCacheHeaders(htmlResponse(200), "/About", { DECKO_EDGE_CACHE: "1" });
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=300");
  });

  it("armed: the root page is cached like any card page", () => {
    const response = applyEdgeCacheHeaders(htmlResponse(200), "/", { DECKO_EDGE_CACHE: "1" });
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=300");
  });

  it("armed: card metadata JSON gets the same cacheable header", () => {
    const response = applyEdgeCacheHeaders(jsonResponse(200), "/api/card/About", { DECKO_EDGE_CACHE: "1" });
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=300");
  });

  it("armed: TTL override flows into the header", () => {
    const env = { DECKO_EDGE_CACHE: "1", DECKO_EDGE_CACHE_TTL: "60" };
    const response = applyEdgeCacheHeaders(htmlResponse(200), "/About", env);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=60");
  });

  it("armed: health/status responses keep no-store", () => {
    const env = { DECKO_EDGE_CACHE: "1" };
    for (const path of ["/_status", "/api/status"]) {
      const response = applyEdgeCacheHeaders(jsonResponse(200), path, env);
      expect(response.headers.get("Cache-Control")).toBe(NO_STORE);
    }
  });

  it("armed: non-200 responses keep no-store", () => {
    const env = { DECKO_EDGE_CACHE: "1" };
    for (const [path, status] of [["/Eagle", 500], ["/Nope", 500], ["/About/zzz", 404]] as const) {
      const response = applyEdgeCacheHeaders(htmlResponse(status), path, env);
      expect(response.headers.get("Cache-Control")).toBe(NO_STORE);
    }
    const apiMiss = applyEdgeCacheHeaders(jsonResponse(404), "/api/card/missing", env);
    expect(apiMiss.headers.get("Cache-Control")).toBe(NO_STORE);
  });

  it("armed: the header mutation is real (not a copy), and the body survives", () => {
    const response = htmlResponse(200, "<html>body</html>");
    const out = applyEdgeCacheHeaders(response, "/About", { DECKO_EDGE_CACHE: "1" });
    expect(out).toBe(response);
    expect(out.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=300");
  });
});

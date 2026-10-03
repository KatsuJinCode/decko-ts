// Worker URL-routing parser tests — the parsePath function exported by the
// Cloudflare demo entry, exercised directly as a pure function.
//
// worker.ts is the entry wrangler bundles (wrangler.toml `main`), and it is
// the only copy: the hand-maintained worker.js twin that used to sit beside
// it drifted — it routed 13 views where worker.ts routes 17, and it dropped
// the query-parameter passthrough — while still bundling cleanly, so the
// Deploy-to-Cloudflare button shipped the stale copy. The twin is gone; the
// tests import the maintained entry, so the pins assert on the shipped
// parser, not a re-implementation and not a second copy. The grammar: the
// ":mark/:view" read route and its fallbacks (the demo's routing
// counterpart of config/engine_routes.rb:51
// `get ":mark/:view(.:format)" => "card#read"`), with the api/* prefixes
// answering before any card lookup.
//
// workerd boot + real D1 coverage lives in
// tests/deploy/deploy-worker-miniflare.test.ts; the alternate in-process
// route-grammar pins live in tests/deploy/deploy-worker-view-routes.test.ts;
// the constant-queries-per-render claim at any depth is locked by
// tests/card/render/depth-sweep.test.ts.

import { beforeAll, describe, expect, it } from "vitest";

let parsePath: typeof import("../worker.js").parsePath;

beforeAll(async () => {
  const mod = await import("../worker.js");
  parsePath = mod.parsePath;
});

describe("worker URL parser (worker entry parsePath)", () => {
  it("routes / to Home, view-less (the query fills it: rest.rb:100-103)", () => {
    expect(parsePath("/")).toEqual({ name: "Home" });
  });

  it("routes /<name> to a view-less card route (the query fills it)", () => {
    expect(parsePath("/Hello+World")).toEqual({ name: "Hello+World" });
    expect(parsePath("/A")).toEqual({ name: "A" });
  });

  it("routes /<name>/<view> to <name> <view>, verbatim (engine_routes.rb:51 constrains nothing)", () => {
    expect(parsePath("/Hello+World/content")).toEqual({ name: "Hello+World", view: "content" });
    expect(parsePath("/Home/open")).toEqual({ name: "Home", view: "open" });
    expect(parsePath("/Home/closed")).toEqual({ name: "Home", view: "closed" });
    expect(parsePath("/Home/menu")).toEqual({ name: "Home", view: "menu" });
  });

  it("routes /<name>/view/<view> (engine_routes.rb:24)", () => {
    expect(parsePath("/Home/view/closed")).toEqual({ name: "Home", view: "closed" });
  });

  it("any view rides verbatim — the ENGINE raises for unregistered ones (the former allowlist was a twin divergence)", () => {
    expect(parsePath("/Home/nonsense")).toEqual({ name: "Home", view: "nonsense" });
    expect(parsePath("/Home/open/extra")).toEqual({ kind: "notFound" });
  });

  it("flags api routes distinctly", () => {
    expect(parsePath("/api/status")).toEqual({ kind: "api" });
    expect(parsePath("/api/card/Hello+World")).toEqual({ kind: "api" });
  });

  it("decodes URL-encoded names", () => {
    expect(parsePath("/Hello%20World")).toEqual({ name: "Hello World" });
  });

  it("a MALFORMED %-encoding answers notFound instead of throwing (the shared hardened decode)", () => {
    expect(parsePath("/%E0%A4%A")).toEqual({ kind: "notFound" });
    expect(parsePath("/Home/%E0%A4%A")).toEqual({ kind: "notFound" });
  });

  it("handles trailing slashes", () => {
    expect(parsePath("/Home/")).toEqual({ name: "Home" });
    expect(parsePath("/Hello+World/content/")).toEqual({ name: "Hello+World", view: "content" });
  });
});

describe("worker module — contract check", () => {
  it("worker entry exports a default object with a fetch handler plus the named parsePath (loadable as ESM)", async () => {
    // The entry wrangler bundles. `.js` is this tree's import convention —
    // tsconfig is NodeNext, so every specifier names the emitted extension
    // and the resolver maps it onto the .ts source (worker.ts here). If this
    // loads without throwing the module graph is wired correctly — same path
    // the Workers runtime takes.
    const mod = await import("../worker.js");
    expect(typeof mod.default).toBe("object");
    expect(typeof mod.default.fetch).toBe("function");
    expect(typeof mod.parsePath).toBe("function");
  });
});

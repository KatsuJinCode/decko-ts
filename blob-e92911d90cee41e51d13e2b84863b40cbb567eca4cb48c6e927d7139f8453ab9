// The read path's location history — the save_current_location event the page
// dispatch now carries (card-mod-session set/all/location_history.rb:6-8,
// `event :save_current_location, before: :show_page, on: :read`, over
// lib/card/env/location_history.rb save_location). A page show of a KNOWN
// card pushes the request's original URL onto the visitor session's history
// (the decko_visit Set-Cookie), so the sign-in form's *previous success mark
// (card-mod-account set/self/signin.rb:170-174 `{ redirect: true, mark:
// "*previous" }`) lands the visitor back on the card a denial came from.
// Pinned here because the deny-then-sign-in journey's official instrument
// (cover-b S5) uses target Home, whose canonical URL "/" is indistinguishable
// from the history default the bug answered — the 2026-10-16 native-whole S5
// fail (landedOn "/") printed evidence identical to a PASS on that target.
//
// Also pinned: the shared content cache never stores a response that carries
// Set-Cookie (the visitor cookie is per-visitor state; a shared entry would
// replay one visitor's history to every later visitor).

import { describe, expect, it } from "vitest";

import { handleEngineRequest } from "../../deploy/bunny-worker-src/bunny-edge-engine-request.js";
import {
  EDGE_CACHE_DIAGNOSTIC_HEADER,
  serveWithEdgeCache,
  type EdgeCacheLike,
} from "../../deploy/bunny-worker-src/bunny-edge-content-cache.js";
import {
  readVisitorSession,
  VISITOR_COOKIE_NAME,
} from "../../src/card/session/visitor-session.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../card/render/render-test-storage.js";

function edgeGet(pathname: string, headers?: Record<string, string>): Request {
  return new Request(`https://script-placeholder.bunny.run${pathname}`, { headers });
}

async function seedDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 1, name: "Decko Bot", typeId: 2 });
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 15, name: "*anon", codename: "anonymous", typeId: 14 });
  await seedCard(s, { id: 16, name: "*read", codename: "read", typeId: 14 });
  await seedCard(s, { id: 17, name: "*all+*read", leftId: 10, rightId: 16, typeId: 14, dbContent: "[[Anyone]]" });
  await seedCard(s, { id: 18, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedReference(s, 17, 18, "anyone");
  await seedCard(s, { id: 21, name: "*signin", codename: "signin", typeId: 2 });
  await seedCard(s, { id: 19, name: "*email", codename: "email", typeId: 2 });
  await seedCard(s, { id: 20, name: "*password", codename: "password", typeId: 2 });
  await seedCard(s, { id: 22, name: "Sign up", codename: "signup", typeId: 2 });
  await seedCard(s, { id: 30, name: "Readable Thing", typeId: 2, dbContent: "readable body", readRuleId: 17, readRuleClass: "*all" });

  await seedCard(s, { id: 55, name: "*title", codename: "title", typeId: 14, dbContent: "Test Site" });
  await seedCard(s, { id: 400, name: "*ace", codename: "ace", typeId: 14, dbContent: "{}" });
  await seedCard(s, { id: 401, name: "*tiny_mce", codename: "tiny_mce", typeId: 14, dbContent: "{}" });
  await seedCard(s, { id: 50, name: "Html", codename: "html", typeId: 5 });
  await seedCard(s, { id: 600, name: "*layout", codename: "layout", typeId: 14 });
  await seedCard(s, { id: 22746, name: "*all+*layout", leftId: 10, rightId: 600, typeId: 14, dbContent: "Default Layout" });
  await seedCard(s, {
    id: 22747,
    name: "Default Layout",
    typeId: 50,
    dbContent:
      `<body class="d-flex flex-column h-100">\n` +
      `  <article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n` +
      `</body>`,
  });
  await seedCard(s, { id: 22748, name: "*header", codename: "header", typeId: 50, dbContent: `<nav class="navbar"><a href="/">Site</a></nav>` });
  await seedCard(s, { id: 22749, name: "*footer", codename: "footer", typeId: 50, dbContent: `<footer><a href="/:latest">Decko v</a></footer>` });

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}

/** The history the response's Set-Cookie carries, or undefined when the
 *  response sets none. */
async function historyOf(response: Response): Promise<string[] | undefined> {
  const setCookie = response.headers.get("Set-Cookie");
  if (setCookie === null) return undefined;
  const pair = setCookie.split(";")[0] ?? "";
  const eq = pair.indexOf("=");
  if (!pair.startsWith(VISITOR_COOKIE_NAME) || eq < 0) return undefined;
  return readVisitorSession(`${VISITOR_COOKIE_NAME}=${pair.slice(eq + 1)}`).history;
}

async function pageGet(
  pathname: string,
  options: { anonymous?: boolean; headers?: Record<string, string> },
): Promise<{ status: number; body: string; history: string[] | undefined }> {
  const storage = await createRenderTestStorage();
  try {
    await seedDeck(storage);
    const res = await handleEngineRequest(edgeGet(pathname, options.headers), { fetcher: storage.fetcher, render: storage.engine }, options);
    return { status: res.status, body: await res.text(), history: await historyOf(res) };
  } finally {
    storage.close();
  }
}

describe("the page dispatch saves the read location into the visitor session", () => {
  it("a known card's page pushes its request URL onto the history (normal render)", async () => {
    const { status, history } = await pageGet("/Readable_Thing", {});
    expect(status).toBe(200);
    expect(history?.at(-1)).toBe("https://script-placeholder.bunny.run/Readable_Thing");
  });

  it("the live render path saves the location too — the denial page is the saved page", async () => {
    // Anonymous view=edit is denied: the denial page answers 403, and the
    // card is known, so THIS page — the one the visitor is stuck on — joins
    // the history. That entry is the *previous the sign-in form redirects to.
    const { status, history } = await pageGet("/Readable_Thing?view=edit", { anonymous: true });
    expect(status).toBe(403);
    expect(history?.at(-1)).toBe("https://script-placeholder.bunny.run/Readable_Thing?view=edit");
  });

  it("the *signin card's page never joins the history (save_location? codename != signin)", async () => {
    // The card's own codename is what save_location? reads, so the pin uses
    // the card's titled view — the codename branch — without the account
    // form's editor machinery the core view pulls in.
    const { status, history } = await pageGet("/%2Asignin/titled", {});
    expect(status).toBe(200);
    expect(history).toBeUndefined();
  });

  it("an unknown card's page never joins the history (save_location? card.known?)", async () => {
    const { status, history } = await pageGet("/Never_Seeded_Thing", {});
    expect(status).toBe(404);
    expect(history).toBeUndefined();
  });

  it("an ajax slot read never joins the history (save_location? !Env.ajax?)", async () => {
    const { history } = await pageGet("/Readable_Thing?view=open", {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    expect(history).toBeUndefined();
  });

  it("an existing history is extended, not replaced", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      const cookie = `decko_visit=${Buffer.from(JSON.stringify({ h: ["/", "/Somewhere_Else"] }), "utf8").toString("base64url")}`;
      const res = await handleEngineRequest(
        edgeGet("/Readable_Thing", { cookie }),
        { fetcher: storage.fetcher, render: storage.engine },
        {},
      );
      await res.text();
      const history = await historyOf(res);
      expect(history).toEqual(["/", "/Somewhere_Else", "https://script-placeholder.bunny.run/Readable_Thing"]);
    } finally {
      storage.close();
    }
  });
});

describe("the shared content cache never stores a Set-Cookie response", () => {
  it("a page that sets the visitor cookie is not stored and is labeled not-stored", async () => {
    const store = new Map<string, Response>();
    const cache: EdgeCacheLike = {
      async match(request) {
        return store.get(String(request));
      },
      async put(request, response) {
        store.set(String(request), response);
      },
    };
    const renderCalls: number[] = [];
    const render = async (): Promise<Response> => {
      renderCalls.push(renderCalls.length);
      return new Response("<html>page</html>", {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Set-Cookie": `${VISITOR_COOKIE_NAME}=abc; Path=/`,
        },
      });
    };
    const first = await serveWithEdgeCache(new Request("https://edge.example/Readable_Thing"), { DECKO_EDGE_CACHE: "1" }, render, cache);
    expect(first.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=miss; not-stored");
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");
    expect(store.size).toBe(0);
    // The second request re-renders: no shared entry can answer it.
    await serveWithEdgeCache(new Request("https://edge.example/Readable_Thing"), { DECKO_EDGE_CACHE: "1" }, render, cache);
    expect(renderCalls.length).toBe(2);
  });

  it("a Set-Cookie-free page still stores exactly as before (non-regression)", async () => {
    const store = new Map<string, Response>();
    const cache: EdgeCacheLike = {
      async match(request) {
        return store.get(String(request));
      },
      async put(request, response) {
        store.set(String(request), response);
      },
    };
    let calls = 0;
    const render = async (): Promise<Response> => {
      calls += 1;
      return new Response("<html>page</html>", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    };
    await serveWithEdgeCache(new Request("https://edge.example/About"), { DECKO_EDGE_CACHE: "1" }, render, cache);
    expect(store.size).toBe(1);
    const second = await serveWithEdgeCache(new Request("https://edge.example/About"), { DECKO_EDGE_CACHE: "1" }, render, cache);
    expect(calls).toBe(1);
    expect(second.headers.get(EDGE_CACHE_DIAGNOSTIC_HEADER)).toBe("armed; cache=hit");
  });
});

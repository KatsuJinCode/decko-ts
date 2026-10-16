// The same-origin check on writes and sign-in (src/server/request-origin.ts;
// docs/SECURITY.md, "Cross-site requests").
//
// Security divergence from Ruby: Ruby Decko arms no forgery protection, so a
// page on another site can submit a form that edits a card or signs a
// visitor in. The port refuses those with 403 before any card machinery runs,
// and keeps accepting same-origin forms and non-browser clients exactly as
// before.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRenderTestStorage, seedCard, seedReference, type RenderTestStorage } from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";
import { handleWriteRequest, type WriteRouteContext, type WriteRouteRequest } from "../../src/server/write-routes.js";
import { checkRequestOrigin, originPolicyFromEnv } from "../../src/server/request-origin.js";
import { handleWorkersWriteSurface } from "../../src/server/cloudflare-write-routes.js";
import { DeckoName } from "../../src/card/name.js";

const SET_TYPE_ID = 2;
const JOE_ID = 90;
const HOST = "deck.example";

let storage: RenderTestStorage;
let ctx: WriteRouteContext;
let token = "";

async function seedRuleDeck(s: RenderTestStorage): Promise<void> {
  const byId = (id: number, name: string, extra: Omit<Parameters<typeof seedCard>[1], "id" | "name"> = {}) =>
    seedCard(s, { id, name, ...extra });
  await byId(1, "*all", { codename: "all", typeId: SET_TYPE_ID });
  await byId(2, "Set", { codename: "set" });
  await byId(3, "*update", { codename: "update" });
  await byId(4, "*create", { codename: "create" });
  await byId(5, "*delete", { codename: "delete" });
  await byId(6, "Anyone", { codename: "anyone" });
  await byId(7, "Anyone Signed In", { codename: "anyone_signed_in" });
  await byId(8, "*type", { codename: "type" });
  await byId(9, "*self", { codename: "self" });
  await byId(18, "*default", { codename: "default" });
  for (const [id, right] of [[10, 3], [11, 4], [12, 5]] as const) {
    await seedCard(s, { id, leftId: 1, rightId: right, dbContent: "[[Anyone Signed In]]" });
    await seedReference(s, id, 7, "anyone signed in");
  }
  await seedCard(s, { id: 17, leftId: 1, rightId: 18, typeId: SET_TYPE_ID });
  await byId(13, "Widget", { typeId: 14, dbContent: "original" });
  await byId(14, "Basic");
  await seedCard(s, { id: 15, leftId: 14, rightId: 8, typeId: SET_TYPE_ID });
  await byId(16, "RichText");
  await byId(JOE_ID, "Joe User");
}

function save(content: string, headers: Record<string, string>): WriteRouteRequest {
  return {
    method: "PUT",
    pathname: "/Widget.json",
    host: HOST,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...headers },
    body: JSON.stringify({ card: { content } }),
  };
}

async function widget(): Promise<string | null | undefined> {
  storage.fetcher.expireName("Widget");
  return (await storage.fetcher.fetchByKey(DeckoName.parse("Widget").key))?.dbContent;
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedRuleDeck(storage);
  ctx = { driver: storage.counting, fetcher: storage.fetcher, originPolicy: originPolicyFromEnv({}) };
  token = (await new SessionStore({ driver: storage.counting }).createSession(JOE_ID)).token;
}, 60_000);

afterAll(() => storage?.close());

describe("writes from another site are refused", () => {
  it.each([
    ["an Origin on another site", { origin: "https://attacker.example" }],
    ["an opaque (null) Origin", { origin: "null" }],
    ["Sec-Fetch-Site: cross-site", { "sec-fetch-site": "cross-site" }],
    ["Sec-Fetch-Site: same-site (a sibling subdomain)", { "sec-fetch-site": "same-site", origin: "https://other.deck.example" }],
    ["a Referer on another site, without Origin", { referer: "https://attacker.example/page" }],
    ["an Origin on the same host name but another port", { origin: "http://deck.example:8080" }],
  ])("%s: 403, and the card is unchanged", async (_label, headers) => {
    const before = await widget();
    const res = await handleWriteRequest(ctx, save("cross-site edit", headers as Record<string, string>));
    expect(res?.status).toBe(403);
    expect(JSON.parse(res!.body)).toMatchObject({ error: { code: "cross-origin" } });
    expect(await widget()).toBe(before);
  });

  it("an HTML form from another site gets an HTML 403", async () => {
    const res = await handleWriteRequest(ctx, {
      method: "POST",
      pathname: "/update/Widget",
      host: HOST,
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://attacker.example", cookie: "x=1" },
      body: "card%5Bcontent%5D=cross-site",
    });
    expect(res?.status).toBe(403);
    expect(res?.body).toContain("Error (cross-origin)");
  });
});

describe("writes from this deck, and from non-browser clients, still work", () => {
  it.each([
    ["Origin: this deck", { origin: "http://deck.example" }],
    ["Origin: this deck over https", { origin: "https://deck.example" }],
    ["Sec-Fetch-Site: same-origin", { "sec-fetch-site": "same-origin", origin: "http://deck.example" }],
    ["Referer on this deck, without Origin", { referer: "http://deck.example/Widget?view=edit" }],
    ["no Origin, Referer or Sec-Fetch-Site (an API client)", {}],
  ])("%s: saved", async (label, headers) => {
    const res = await handleWriteRequest(ctx, save(`saved via ${label}`, headers as Record<string, string>));
    expect(res?.status).toBe(200);
    expect(await widget()).toBe(`saved via ${label}`);
  });

  it("a configured trusted origin may post", async () => {
    const trusted = { ...ctx, originPolicy: originPolicyFromEnv({ DECKO_TRUSTED_ORIGINS: "https://editor.example" }) };
    const res = await handleWriteRequest(trusted, save("from the trusted editor", { origin: "https://editor.example" }));
    expect(res?.status).toBe(200);
  });

  it("DECKO_ORIGIN_CHECK=off restores Ruby's behaviour", async () => {
    const off = { ...ctx, originPolicy: originPolicyFromEnv({ DECKO_ORIGIN_CHECK: "off" }) };
    const res = await handleWriteRequest(off, save("cross-site with the check off", { origin: "https://attacker.example" }));
    expect(res?.status).toBe(200);
  });
});

describe("sign-in from another site is refused", () => {
  const signin = (headers: Record<string, string>): WriteRouteRequest => ({
    method: "POST",
    pathname: "/update/*signin",
    host: HOST,
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body:
      "_method=patch&success%5Bredirect%5D=true&success%5Bmark%5D=*previous" +
      "&card%5Bsubcards%5D%5B%2B*email%5D%5Bcontent%5D=joe%40example.org" +
      "&card%5Bsubcards%5D%5B%2B*password%5D%5Bcontent%5D=Whatever-1",
  });
  const sessionCount = async (): Promise<number> =>
    Number((await storage.counting.query<{ n: number }>("SELECT COUNT(*) AS n FROM auth_sessions", [])).rows[0]?.n ?? 0);

  it("a cross-site sign-in POST is refused before authentication, and mints no session", async () => {
    const before = await sessionCount();
    const res = await handleWriteRequest(ctx, signin({ origin: "https://attacker.example" }));
    expect(res?.status).toBe(403);
    expect(await sessionCount()).toBe(before);
  });

  it("a same-site sign-in POST reaches authentication (here: an unknown email, 422)", async () => {
    const res = await handleWriteRequest(ctx, signin({ origin: "http://deck.example" }));
    expect(res?.status).toBe(422);
  });

  it("the edge hosts' auth-only arm refuses it too (write path off, sign-in on)", async () => {
    const res = await handleWorkersWriteSurface(
      { fetcher: storage.fetcher, renderEngine: storage.engine, driver: storage.counting },
      {
        method: "POST",
        pathname: "/update/*signin",
        search: "",
        host: HOST,
        headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://attacker.example" },
        body: signin({}).body,
        secure: true,
        scheme: "https",
      },
      {},
    );
    expect(res?.status).toBe(403);
  });
});

describe("checkRequestOrigin", () => {
  const policy = originPolicyFromEnv({});
  it("compares host and port, ignoring the default port", () => {
    expect(checkRequestOrigin({ headers: { origin: "https://deck.example" }, host: "deck.example:443" }, policy).ok).toBe(true);
    expect(checkRequestOrigin({ headers: { origin: "https://deck.example:8443" }, host: "deck.example" }, policy).ok).toBe(false);
    expect(checkRequestOrigin({ headers: { origin: "https://evil.deck.example.attacker.test" }, host: "deck.example" }, policy).ok).toBe(false);
  });

  it("refuses a request whose Host is unknown when it carries an Origin", () => {
    expect(checkRequestOrigin({ headers: { origin: "https://deck.example" }, host: undefined }, policy).ok).toBe(false);
  });

  it("refuses bad configuration loudly", () => {
    expect(() => originPolicyFromEnv({ DECKO_ORIGIN_CHECK: "maybe" })).toThrow(/DECKO_ORIGIN_CHECK/);
    expect(() => originPolicyFromEnv({ DECKO_TRUSTED_ORIGINS: "javascript:alert(1)" })).toThrow(/DECKO_TRUSTED_ORIGINS/);
  });
});

describe("the shared host dispatches stock GET update links without bypassing gates", () => {
  const request = (method = "GET", pathname = "/update/Widget", headers: Record<string, string> = {}) => ({
    method, pathname, search: "?card%5Bcontent%5D=via-get", host: HOST,
    headers: { authorization: `Bearer ${token}`, accept: "application/json", ...headers },
    body: "", secure: false, scheme: "http" as const,
  });
  const surface = (req: ReturnType<typeof request>, armed = true) => handleWorkersWriteSurface(
    { fetcher: storage.fetcher, renderEngine: storage.engine, driver: storage.counting }, req,
    armed ? { DECKO_WRITE_PATH: "1" } : {},
  );
  it("routes explicit GET update through the actual save and keeps cross-origin refusal atomic", async () => {
    expect((await surface(request()))?.status).toBe(200);
    expect(await widget()).toBe("via-get");
    const before = await widget();
    const denied = await surface({ ...request("GET", "/update/Widget", { origin: "https://attacker.example" }), search: "?card%5Bcontent%5D=cross-site" });
    expect(denied?.status).toBe(403); expect(await widget()).toBe(before);
  });
  it("leaves disarmed GET, HEAD, bare reads and unrelated action routes untouched", async () => {
    const before = await widget();
    expect(await surface(request(), false)).toBeNull();
    for (const req of [request("HEAD"), request("GET", "/Widget"), request("GET", "/update"), request("GET", "/delete/Widget")]) {
      expect(await surface(req)).toBeNull();
    }
    expect(await widget()).toBe(before);
  });
});

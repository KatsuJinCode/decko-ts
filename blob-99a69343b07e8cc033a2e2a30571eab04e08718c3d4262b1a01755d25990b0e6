// The hard redirect's two flavors (response.rb:40-50), measured against the
// PINNED DECK's own method.
//
// The completeness register's C2 row grades the port on hard_redirect's ajax
// flavor - `render json: { redirect: url }` - and on what surrounds it.
// Three facts ride this method:
//
//   1. THE URL IS MADE ABSOLUTE FIRST: `url = card_url url` runs BEFORE the
//      ajax test, so the ajax flavor's JSON carries the ABSOLUTE url too.
//      The URL helper is the PINNED card gem's own
//      (card-1.110.0/lib/card/env/location.rb:19-21): an already-absolute
//      url is left alone, a relative one is made absolute against the deck
//      origin.
//   2. THE TWO FLAVORS: an ajax request gets `render json: {redirect: url}`
//      (the client resets its own window location), and every other request
//      gets `redirect_to url, status: status`.
//   3. THE STATUS IS THE NON-AJAX ARM'S: the ajax arm carries no status at
//      all, and the non-ajax arm carries the one it was handed -
//      hard_redirect's own default is 302 (response.rb:40), while the CUD
//      success hands it 303 (response.rb:31).
//
// This file pins both sides:
//
//   fixtures/captured/hard-redirect-ajax-flavor-ruby-oracle.json is what
//   oracle-capture-hard-redirect-ajax-flavor-ruby.rb (tests/server/)
//   recorded by EXECUTING the pinned hard_redirect over the loading rig's
//   recording doubles, with the PINNED card gem's own URL module loaded (so
//   the absolute url is the pinned method's answer, not a stand-in).
//
//   The port's side: the ajax flavor is the port's 200 + {redirect: url}
//   JSON (src/server/write-routes.ts:2259-2271, the CUD success's own
//   success[redirect] arm), and the plain flavor is the port's 303 +
//   absolute Location. Measured over the real HTTP write surface in this
//   row's parity test.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { createRenderTestStorage, seedCard, seedReference } from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/hard-redirect-ajax-flavor-ruby-oracle.json"), "utf8"),
) as {
  hardRedirect: Array<{
    label: string;
    urlArg: string;
    ajax: boolean;
    statusArg: number | null;
    error: string | null;
    rendered: { json: { redirect: string } } | null;
    redirected: { url: string; status: number } | null;
  }>;
  rigArtifacts: string[];
  sources: Record<string, Array<{ line: number; text: string }>>;
};

let storage: Awaited<ReturnType<typeof createRenderTestStorage>>;
let ctx: WriteRouteContext;
let bridge: BridgeServer;
let joeToken = "";

// The rule deck the write surface needs (the write-routes suite's own
// seed): *all, Set, *update, *create, *delete, Anyone, Anyone Signed In,
// *type, *self, *default, the three *all -> *update / *create / *delete
// rules, the *all -> *default type rule, Basic, RichText and Joe User.
async function seedRedirectDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: 2 });
  await seedCard(s, { id: 2, name: "Set", codename: "set", typeId: 2 });
  await seedCard(s, { id: 3, name: "*update", codename: "update", typeId: 2 });
  await seedCard(s, { id: 4, name: "*create", codename: "create", typeId: 2 });
  await seedCard(s, { id: 5, name: "*delete", codename: "delete", typeId: 2 });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedCard(s, { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 2 });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 2 });
  await seedCard(s, { id: 9, name: "*self", codename: "self", typeId: 2 });
  await seedCard(s, { id: 18, name: "*default", codename: "default", typeId: 2 });
  await seedCard(s, { id: 10, leftId: 1, rightId: 3, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 10, 7, "anyone signed in");
  await seedCard(s, { id: 11, leftId: 1, rightId: 4, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 11, 7, "anyone signed in");
  await seedCard(s, { id: 12, leftId: 1, rightId: 5, dbContent: "[[Anyone Signed In]]" });
  await seedReference(s, 12, 7, "anyone signed in");
  await seedCard(s, { id: 17, leftId: 1, rightId: 18, typeId: 14 });
  await seedCard(s, { id: 14, name: "Basic", typeId: 14 });
  await seedCard(s, { id: 16, name: "RichText", typeId: 16 });
  await seedCard(s, { id: 90, name: "Joe User" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedRedirectDeck(storage);
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
  joeToken = (await new SessionStore({ driver: storage.counting }).createSession(90)).token;
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  storage?.close();
});

async function save(
  form: Record<string, string>,
  ajax: boolean,
): Promise<{ status: number; location: string | undefined; body: string }> {
  const res = await fetch(`${bridge.url}/`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Bearer ${joeToken}`,
      ...(ajax ? { "x-requested-with": "XMLHttpRequest" } : {}),
    },
    body: new URLSearchParams(form).toString(),
    redirect: "manual",
  });
  return {
    status: res.status,
    location: res.headers.get("location") ?? undefined,
    body: await res.text(),
  };
}

describe("the hard redirect, against the pinned deck gem", () => {
  it("the url is made ABSOLUTE first, before the ajax test", () => {
    const plain = ORACLE.hardRedirect[0]!;
    expect(plain.error).toBeNull();
    expect(plain.redirected).toEqual({ url: "https://deck.test/Front", status: 302 });
    // The pinned body, quoted: the card_url call comes first.
    const hardRedirect = ORACLE.sources["hardRedirect"]!.map((row) => row.text).join("\n");
    expect(hardRedirect).toContain("url = card_url url");
    expect(hardRedirect.indexOf("url = card_url url")).toBeLessThan(hardRedirect.indexOf("if Card::Env.ajax?"));
    // And the URL helper is the PINNED one.
    const cardUrl = ORACLE.sources["pinnedCardUrl"]!.map((row) => row.text).join("\n");
    expect(cardUrl).toContain("def card_url rel");
    expect(cardUrl).toContain('rel.match?(/^https?:/) ? rel : "#{Env.origin}#{card_path rel}"');
  });

  it("a plain request REDIRECTS with the status it was handed, and the default is 302", () => {
    const plain = ORACLE.hardRedirect[0]!;
    expect(plain.ajax).toBe(false);
    expect(plain.redirected!.status).toBe(302);
    expect(plain.rendered).toBeNull();
    // The CUD success's own status: 303 (response.rb:31).
    const withStatus = ORACLE.hardRedirect[1]!;
    expect(withStatus.statusArg).toBe(303);
    expect(withStatus.redirected!.status).toBe(303);
  });

  it("an ajax request answers the JSON {redirect: url} - with the ABSOLUTE url", () => {
    const ajax = ORACLE.hardRedirect[2]!;
    expect(ajax.ajax).toBe(true);
    expect(ajax.rendered).toEqual({ json: { redirect: "https://deck.test/Front" } });
    expect(ajax.redirected).toBeNull();
  });

  it("the ajax arm IGNORES the status argument", () => {
    const ajax = ORACLE.hardRedirect[3]!;
    expect(ajax.statusArg).toBe(303);
    expect(ajax.rendered).toEqual({ json: { redirect: "https://deck.test/Front" } });
    expect(ajax.redirected).toBeNull();
  });

  it("an already-absolute url is left alone by the url helper", () => {
    const absolute = ORACLE.hardRedirect[4]!;
    expect(absolute.redirected).toEqual({ url: "https://other.example/Front", status: 302 });
  });
});

describe("the port's redirect flavors, against the pinned hard_redirect", () => {
  it("the AJAX flavor: 200 with the JSON {redirect: url}, and the url is absolute", async () => {
    const res = await save(
      { "card[name]": "C2 Ajax", "card[content]": "c2 body", "success[redirect]": "hard" },
      true,
    );
    expect(res.status, res.body).toBe(200);
    const payload = JSON.parse(res.body) as { redirect: string };
    expect(Object.keys(payload)).toEqual(["redirect"]);
    expect(payload.redirect).toMatch(/^https?:\/\//);
    expect(payload.redirect).toContain("C2_Ajax");
    expect(res.location).toBeUndefined();
  });

  it("the plain flavor: 303 with an absolute Location", async () => {
    const res = await save({ "card[name]": "C2 Plain", "card[content]": "c2 body" }, false);
    expect(res.status, res.body).toBe(303);
    expect(res.location).toBeDefined();
    expect(res.location).toMatch(/^https?:\/\//);
    expect(res.location).toContain("C2_Plain");
  });
});

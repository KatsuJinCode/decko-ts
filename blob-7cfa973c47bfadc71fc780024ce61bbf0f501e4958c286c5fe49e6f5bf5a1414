// The respond ladder (response.rb:10-19), measured against the PINNED
// DECK's own method.
//
// The completeness register's C1 row grades the port on `respond` - the
// method every rendered answer goes through. Its three arms are not equally
// obvious, and their PRIORITY is measurable:
//
//   1. A REDIRECT STATUS REDIRECTS: `if status.in? [302, 303]`, and the
//      redirect it makes is `hard_redirect result` with NO status argument,
//      so hard_redirect's 302 default (response.rb:40) answers. A 303 that
//      reaches respond answers a 302.
//   2. A FILE FORMAT AT 200 SENDS THE FILE: the is_a? check is against the
//      PINNED mod's own Card::Format::FileFormat.
//   3. EVERYTHING ELSE RENDERS: `render_response result.to_s.html_safe,
//      status, format.mime_type`.
//
// This file pins both sides:
//
//   fixtures/captured/respond-ladder-ruby-oracle.json is what
//   oracle-capture-respond-ladder-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned respond over the loading rig's recording doubles:
//   the 302 arm, the 303 arm (and the 302 it answers), the file arm, the
//   file arm outranked by the redirect, the render arm with the format's
//   mime type, a 404 rendering with its own status, and the cache log line.
//
//   The port's side: the port's redirect answer is the 303 + absolute
//   Location of its success response (src/server/write-routes.ts:1359-1365,
//   the absoluteTarget of the card_url shape), and its render arm answers
//   the format's content type - a JSON save answers 200 with
//   application/json. Measured over the real HTTP write surface in this
//   row's parity test.
//
//   THE REDIRECT ARM IS UNREACHABLE FROM THE PINNED DECK'S OWN CALL PATH,
//   and that is why the two sides are not in conflict: the statuses that
//   can reach respond are 200 (the status show passes),
//   @format.error_status (404 for an unknown card, 403 for the focal root -
//   card-1.110.0/lib/card/format/error.rb:20, :29) and nothing else, so
//   neither 302 nor 303 ever reaches the arm from the deck's own code. The
//   pinned deck's redirects come from the CUD success's own hard_redirect
//   (response.rb:31, `hard_redirect success.to_url, 303`) - a different
//   call path, and the one the port's 303 answers.
//
//   The file arm is rows A2/A3's own evidence and the mime types are rows
//   D2/D3's; this row quotes the arm and does not re-grade them.

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
  readFileSync(path.join(REPO, "fixtures/captured/respond-ladder-ruby-oracle.json"), "utf8"),
) as {
  respondLadder: Array<{
    label: string;
    statusArg: number;
    error: string | null;
    rendered: { body: string; status: number; content_type: string } | null;
    redirected: { url: unknown; status: number } | null;
    sentFile: unknown[] | null;
    logged: string[];
  }>;
  registeredFormats: string[];
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
async function seedRespondDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
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
  await seedRespondDeck(storage);
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
  joeToken = (await new SessionStore({ driver: storage.counting }).createSession(90)).token;
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  storage?.close();
});

describe("the respond ladder, against the pinned deck gem", () => {
  it("a 302 status REDIRECTS", () => {
    const row = ORACLE.respondLadder[0]!;
    expect(row.statusArg).toBe(302);
    expect(row.error).toBeNull();
    expect(row.redirected).not.toBeNull();
    expect(row.redirected!.status).toBe(302);
    expect(row.rendered).toBeNull();
    expect(row.sentFile).toBeNull();
  });

  it("a 303 status REDIRECTS TOO, and the redirect answers 302 - the status is not carried", () => {
    // The arm calls `hard_redirect result` with no status argument, so
    // hard_redirect's own 302 default (response.rb:40) answers.
    const row = ORACLE.respondLadder[1]!;
    expect(row.statusArg).toBe(303);
    expect(row.redirected).not.toBeNull();
    expect(row.redirected!.status).toBe(302);
    expect(row.rendered).toBeNull();
  });

  it("a file format at 200 SENDS THE FILE instead of rendering", () => {
    const row = ORACLE.respondLadder[2]!;
    expect(row.statusArg).toBe(200);
    expect(row.sentFile).toEqual(["FILE-PAGE"]);
    expect(row.rendered).toBeNull();
    expect(row.redirected).toBeNull();
  });

  it("the arms are PRIORITY ORDERED: a file format at 302 REDIRECTS, it does not send the file", () => {
    const row = ORACLE.respondLadder[3]!;
    expect(row.statusArg).toBe(302);
    expect(row.redirected).not.toBeNull();
    expect(row.sentFile).toBeNull();
    expect(row.rendered).toBeNull();
  });

  it("anything else RENDERS with the format's mime type and the status it was given", () => {
    const ok = ORACLE.respondLadder[4]!;
    expect(ok.rendered).toEqual({ body: "PAGE", status: 200, content_type: "text/html" });
    const notFound = ORACLE.respondLadder[5]!;
    expect(notFound.statusArg).toBe(404);
    expect(notFound.rendered).toEqual({ body: "NOT-FOUND", status: 404, content_type: "text/html" });
    expect(notFound.redirected).toBeNull();
    expect(notFound.sentFile).toBeNull();
  });

  it("the cache log line fires only when the config asks for it", () => {
    expect(ORACLE.respondLadder[6]!.logged.length).toBe(1);
    expect(ORACLE.respondLadder[4]!.logged).toEqual([]);
    const respond = ORACLE.sources["respond"]!.map((row) => row.text).join("\n");
    expect(respond).toContain("Rails.logger.info Card::Cache.tallies if Cardio.config.cache_log_level");
  });

  it("the arms are the pinned source, in the pinned order", () => {
    const respond = ORACLE.sources["respond"]!.map((row) => row.text).join("\n");
    const redirectAt = respond.indexOf("status.in? [302, 303]");
    const fileAt = respond.indexOf("Card::Format::FileFormat");
    const renderAt = respond.indexOf("render_response");
    expect(redirectAt).toBeGreaterThan(-1);
    expect(fileAt).toBeGreaterThan(redirectAt);
    expect(renderAt).toBeGreaterThan(fileAt);
    // The redirect arm calls hard_redirect with NO status argument.
    expect(respond).toContain("hard_redirect result");
    const hardRedirect = ORACLE.sources["hardRedirectDefault"]!.map((row) => row.text).join("\n");
    expect(hardRedirect).toContain("def hard_redirect url, status=302");
  });
});

describe("the port's response shapes, against the pinned respond", () => {
  it("a save answers the redirect shape: 303 + an ABSOLUTE Location", async () => {
    // The pinned deck's own redirects come from the CUD success's
    // hard_redirect(success.to_url, 303) (response.rb:31), not from
    // respond's unreachable redirect arm - and the port answers that path
    // with a 303 and an absolute Location (the card_url shape).
    const res = await fetch(`${bridge.url}/`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${joeToken}`,
      },
      body: new URLSearchParams({ "card[name]": "C1 Created", "card[content]": "c1 body" }).toString(),
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    const location = res.headers.get("location") ?? "";
    expect(location).toMatch(/^https?:\/\//);
    expect(location).toContain("C1_Created");
  });

  it("a JSON save answers the render arm: 200 with the format's content type", async () => {
    const res = await fetch(`${bridge.url}/C1_Json.json`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${joeToken}` },
      body: JSON.stringify({ card: { content: "c1 json body" } }),
      redirect: "manual",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    await res.text();
  });
});

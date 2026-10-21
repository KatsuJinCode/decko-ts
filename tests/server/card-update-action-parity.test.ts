// The update ACTION, card#update (rest.rb:14-16), measured against the
// PINNED DECK's own method.
//
// The completeness register's B3 row grades the port on the CONTROLLER
// METHOD `card#update`, not on a route line. The method carries two
// decisions of its own:
//
//   1. THE NEW-CARD FORK: `card.new_card? ? create : ...` - an update whose
//      target card does not exist SAVES a new card (the create action's own
//      save ask), it does not update one.
//
//   2. WHAT THE UPDATE ASKS FOR: `card.update! params[:card]&.to_unsafe_h`
//      - the body's card hash, converted with to_unsafe_h (Rails'
//      ActionController::Parameters#to_unsafe_h returns the parameters as a
//      plain Hash with the permitted-status guard REMOVED, so the update is
//      not filtered by the controller), and the safe navigation `&.` makes a
//      request with NO card hash pass nil to the model instead of raising.
//
// This file pins both sides:
//
//   fixtures/captured/card-update-action-ruby-oracle.json is what
//   oracle-capture-card-update-action-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned update action over the loading rig's recording
//   doubles, three ways:
//
//     the existing card  the call list is ["new_card?", "update!"], and the
//                  update ask carries the body's card hash verbatim.
//     the new card  the call list is ["new_card?", "save!"] - the CREATE
//                  arm runs, so the update of a missing card SAVES a card
//                  and never asks the model to update one.
//     the body with no card hash  the call list is ["new_card?", "update!"]
//                  and the ask carries nil - the safe navigation's job.
//
//   The port's side: the update arm of src/server/write-routes.ts asks
//   whether the target card exists and, when it does not, falls back to
//   the create path - the port's own create fallback
//   (write-routes.ts:2024-2032). Measured over the real HTTP write surface
//   in this row's parity test: a PUT of an existing card answers the
//   update verb, a PUT of a missing mark answers the CREATE verb, and a
//   form PUT of an existing card answers the 303 + absolute Location.
//
//   The recorded redirect URL is the RIG's shape, not the pinned one (the
//   rig's SuccessDouble answers to_url from the envelope's own name, while
//   the PINNED envelope resolves its TARGET card,
//   card-1.110.0/lib/card/env/success.rb:19-22). The fixture labels that
//   on its face (rigArtifacts); the recorded redirect STATUS is pinned.
//
//   The params double is a CAPTURE-LOCAL stand-in for Rails' own
//   ActionController::Parameters (the rig holds plain Hashes, and a plain
//   Hash has no to_unsafe_h). The fixture labels that too.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { type WriteRouteContext, matchRoute } from "../../src/server/write-routes.js";
import { createRenderTestStorage, seedCard, seedReference } from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/card-update-action-ruby-oracle.json"), "utf8"),
) as {
  updateAction: Array<{
    label: string;
    error: string | null;
    cardCalls: string[];
    updateArgs: Record<string, unknown> | null;
    redirected: { url: string; status: number } | null;
    rendered: unknown;
  }>;
  rigArtifacts: string[];
  sources: Record<string, Array<{ line: number; text: string }>>;
};

let storage: Awaited<ReturnType<typeof createRenderTestStorage>>;
let ctx: WriteRouteContext;
let bridge: BridgeServer;
let joeToken = "";

// The rule deck the update arm needs (the write-routes suite's own seed):
//   1 *all (Set)  2 Set  3 *update  4 *create  5 *delete  6 Anyone
//   7 Anyone Signed In  8 *type  9 *self  18 *default
//   10/11/12: *all -> *update / *create / *delete, each [[Anyone Signed In]]
//   17: *all -> *default, typeId 14 (the default prose create's type)
//   14 Basic (typeId 14)   16 RichText   100 Target (the card under test)
//   90 Joe User (the session's holder)
async function seedUpdateDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
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
  await seedCard(s, { id: 100, name: "Target", typeId: 16, dbContent: "target body original" });
  await seedCard(s, { id: 90, name: "Joe User" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await runAuthMigrations(storage.counting);
  await seedUpdateDeck(storage);
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
  joeToken = (await new SessionStore({ driver: storage.counting }).createSession(90)).token;
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  storage?.close();
});

async function putJson(mark: string, body: Record<string, unknown>): Promise<{
  status: number;
  body: string;
  json: () => Record<string, unknown>;
}> {
  const res = await fetch(`${bridge.url}/${encodeURIComponent(mark)}.json`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: `Bearer ${joeToken}` },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  return { status: res.status, body: text, json: () => JSON.parse(text) as Record<string, unknown> };
}

async function putForm(mark: string, form: Record<string, string>): Promise<{
  status: number;
  location: string | undefined;
  body: string;
}> {
  const res = await fetch(`${bridge.url}/${encodeURIComponent(mark)}`, {
    method: "PUT",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Bearer ${joeToken}`,
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

describe("the update action, against the pinned deck gem", () => {
  it("the pinned action's body is the new-card fork over one update ask", () => {
    const update = ORACLE.sources["update"]!.map((row) => row.text).join("\n");
    expect(update).toContain("def update");
    expect(update).toContain("card.new_card? ? create : handle { card.update! params[:card]&.to_unsafe_h }");
  });

  it("an update of an EXISTING card asks the model to update, with the body's card hash", () => {
    const row = ORACLE.updateAction[0]!;
    expect(row.error).toBeNull();
    expect(row.cardCalls).toEqual(["new_card?", "update!"]);
    expect(row.updateArgs).toEqual({ name: "Front", content: "body" });
    expect(row.redirected!.status).toBe(303);
  });

  it("an update of a NEW card takes the CREATE arm: the call list is save!, never update!", () => {
    const row = ORACLE.updateAction[1]!;
    expect(row.error).toBeNull();
    expect(row.cardCalls).toEqual(["new_card?", "save!"]);
    expect(row.cardCalls).not.toContain("update!");
    expect(row.updateArgs).toBeNull();
    // The arm the fork takes is the create action's own body, quoted.
    const create = ORACLE.sources["create"]!.map((row) => row.text).join("\n");
    expect(create).toContain("handle { card.save! }");
  });

  it("a body with NO card hash passes nil to the model - the safe navigation's job", () => {
    const row = ORACLE.updateAction[2]!;
    expect(row.error).toBeNull();
    expect(row.cardCalls).toEqual(["new_card?", "update!"]);
    expect(row.updateArgs).toBeNull();
  });

  it("the update ask is the RAW card hash: to_unsafe_h removes the permitted-status guard", () => {
    // The pinned body calls to_unsafe_h, Rails' ActionController::Parameters
    // method that returns the parameters as a plain Hash with the guard
    // removed. The recorded ask carries every posted card attribute, with
    // no filtering in front of it.
    expect(ORACLE.updateAction[0]!.updateArgs).toEqual({ name: "Front", content: "body" });
    expect(ORACLE.rigArtifacts.join(" ")).toContain("CAPTURE-LOCAL params double");
  });
});

describe("the port's update action, against the pinned update", () => {
  it("PUT /<mark> classifies as the update verb (the route grammar is row A11's)", () => {
    expect(matchRoute("PUT", "/Target")).toEqual({ verb: "update", mark: "Target", json: false });
  });

  it("an update of an EXISTING card answers the update verb and lands the card's bytes", async () => {
    const res = await putJson("Target", { card: { content: "b3 updated body" } });
    expect(res.status, res.body).toBe(200);
    expect(res.json().verb).toBe("update");
    const record = await storage.fetcher.fetchByKey("target");
    expect(record?.dbContent).toContain("b3 updated body");
  });

  it("an update of a MISSING card answers the CREATE verb - the port's own new-card fallback", async () => {
    // The pinned fork: card.new_card? is true for a card that does not
    // exist, so the create arm saves it. The port's fallback
    // (write-routes.ts:2024-2032) answers the same thing, and the verb it
    // reports is the fork's own answer.
    const res = await putJson("B3 Fresh From Put", { card: { content: "b3 via update-as-create" } });
    expect(res.status, res.body).toBe(200);
    expect(res.json().verb).toBe("create");
    const record = await storage.fetcher.fetchByKey("b3_fresh_from_put");
    expect(record?.dbContent).toContain("b3 via update-as-create");
  });

  it("a form update answers the success envelope's target: 303 + absolute Location", async () => {
    const res = await putForm("Target", { "card[content]": "b3 form body" });
    expect(res.status, res.body).toBe(303);
    expect(res.location).toBeDefined();
    expect(res.location).toContain("Target");
  });
});

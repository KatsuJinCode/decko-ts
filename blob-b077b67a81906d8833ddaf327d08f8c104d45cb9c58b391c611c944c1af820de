// The create ACTION, card#create (rest.rb:6-8), measured against the
// PINNED DECK's own method.
//
// The completeness register's B2 row grades the port on the CONTROLLER
// METHOD `card#create`, not on a route line. Every create route in this
// family (A10, A13, A14, A18) funnels into this method, and the method
// carries two decisions of its own:
//
//   1. WHAT IT DOES: `handle { card.save! }` - ONE save ask on the card.
//
//   2. WHAT handle DOES (rest.rb:74-77):
//          def handle
//            Card::Env.success card.name
//            yield ? cud_success : raise(Card::Error::UserError)
//          end
//      The success envelope is created with the card's NAME, and the
//      BLOCK'S VALUE decides the outcome: a truthy save goes to cud_success,
//      a falsey save raises Card::Error::UserError - the 422 class
//      (card-1.110.0/lib/card/error.rb:20-21, 68-75).
//
// This file pins both sides:
//
//   fixtures/captured/card-create-action-ruby-oracle.json is what
//   oracle-capture-card-create-action-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned create action over the loading rig's recording
//   doubles:
//
//     the action   rest.rb:6-8 - the body is one save ask through handle.
//     the handle   rest.rb:74-77 - the envelope is created with the card's
//                  name, and the block's value is the fork.
//     the envelope card-1.110.0/lib/card/env.rb:31-33 - ONE envelope per
//                  request, MEMOIZED, seeded with params[:success]. That is
//                  why the second `Card::Env.success` in cud_success
//                  (rest.rb:81) is the SAME envelope handle created.
//     the falsey   the recorded raise is Card::Error::UserError, the class
//                  whose status_code is 422 and whose view is :errors.
//
//   The port's side: the create arm of src/server/write-routes.ts calls the
//   engine's createCard (the one save ask the pinned action makes), and the
//   success envelope's own target is the saved card - the port's success
//   answer is the 303 + absolute Location of successResponse. The port's
//   refusal for a create that cannot land is the 422 user-error class, the
//   same class the pinned falsey arm raises.
//
//   The recorded redirect URL is the RIG's shape, not the pinned one: the
//   rig's SuccessDouble answers to_url from the envelope's own name, while
//   the PINNED envelope resolves its TARGET card (card-1.110.0/lib/card/
//   env/success.rb:19-22). The fixture labels that on its face
//   (rigArtifacts). The recorded redirect STATUS is the pinned one
//   (response.rb:31 `hard_redirect success.to_url, 303`).
//
//   The success lattice the create's cud_success rides (reload? /
//   slotter_magic? / redirect_cud_success) is rows C4/C5's own evidence and
//   is quoted here, not re-graded.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { makeWriteRouteServer, type BridgeServer } from "./write-routes-test-bridge.js";
import { type WriteRouteContext } from "../../src/server/write-routes.js";
import { matchRoute } from "../../src/server/write-routes.js";
import { createRenderTestStorage, seedCard, seedReference } from "../card/render/render-test-storage.js";
import { runAuthMigrations, SessionStore } from "../../src/card/auth/index.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/card-create-action-ruby-oracle.json"), "utf8"),
) as {
  createAction: Array<{
    label: string;
    cardName: string;
    error: string | null;
    cardCalls: string[];
    redirected: { url: string; status: number } | null;
    rendered: unknown;
    sentFile: unknown[] | null;
    envelopeNames: Array<string | null>;
  }>;
  rigArtifacts: string[];
  sources: Record<string, Array<{ line: number; text: string }>>;
};

let storage: Awaited<ReturnType<typeof createRenderTestStorage>>;
let ctx: WriteRouteContext;
let bridge: BridgeServer;
let joeToken = "";

// The rule deck the create arm needs (the write-routes suite's own seed):
//   1 *all (Set)  2 Set  3 *update  4 *create  5 *delete  6 Anyone
//   7 Anyone Signed In  8 *type  9 *self  18 *default
//   10/11/12: *all -> *update / *create / *delete, each [[Anyone Signed In]]
//   17: *all -> *default, typeId 14 (the default prose create's type)
//   14 Basic (typeId 14)   16 RichText   90 Joe User (the session's holder)
async function seedCreateDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
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
  await seedCreateDeck(storage);
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
  joeToken = (await new SessionStore({ driver: storage.counting }).createSession(90)).token;
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  storage?.close();
});

async function postCreate(form: Record<string, string>): Promise<{
  status: number;
  location: string | undefined;
  body: string;
}> {
  const res = await fetch(`${bridge.url}/`, {
    method: "POST",
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

describe("the create action, against the pinned deck gem", () => {
  it("the pinned action's body is ONE save ask through handle", () => {
    const create = ORACLE.sources["create"]!.map((row) => row.text).join("\n");
    expect(create).toContain("def create");
    expect(create).toContain("handle { card.save! }");
    const row = ORACLE.createAction[0]!;
    expect(row.error).toBeNull();
    expect(row.cardCalls).toEqual(["save!"]);
  });

  it("the handle creates the success envelope with the card's NAME", () => {
    const handle = ORACLE.sources["handle"]!.map((row) => row.text).join("\n");
    expect(handle).toContain("Card::Env.success card.name");
    expect(handle).toContain("yield ? cud_success : raise(Card::Error::UserError)");
    // The recorded envelope names: the handle's own call carries the card's
    // name, and cud_success's second lookup carries none - the PINNED
    // Card::Env.success memoizes ONE envelope per request
    // (card-1.110.0/lib/card/env.rb:31-33), so the two calls are the same
    // envelope.
    expect(ORACLE.createAction[0]!.envelopeNames).toEqual(["Front", null]);
    const envSuccess = ORACLE.sources["pinnedEnvSuccess"]!.map((row) => row.text).join("\n");
    expect(envSuccess).toContain("@success ||= Env::Success.new(cardname, params[:success])");
  });

  it("a truthy save goes to cud_success, and the success answers a 303 redirect", () => {
    const row = ORACLE.createAction[0]!;
    expect(row.redirected).not.toBeNull();
    expect(row.redirected!.status).toBe(303);
    expect(row.rendered).toBeNull();
    expect(row.sentFile).toBeNull();
  });

  it("a falsey save raises Card::Error::UserError - the 422 class", () => {
    const row = ORACLE.createAction[1]!;
    expect(row.cardCalls).toEqual(["save!"]);
    expect(row.error).toContain("Card::Error::UserError");
    expect(row.redirected).toBeNull();
    // The class the raise names, quoted from the pinned gem: the UserError
    // subclass of Card::Error, whose status_code is 422 and whose view is
    // :errors.
    const userError = ORACLE.sources["pinnedUserError"]!.map((row) => row.text).join("\n");
    expect(userError).toContain("class UserError < Error");
    const errorStatus = ORACLE.sources["pinnedErrorStatus"]!.map((row) => row.text).join("\n");
    expect(errorStatus).toContain("self.status_code = 422");
    expect(errorStatus).toContain("self.view = :errors");
  });

  it("the recorded redirect URL is the RIG's shape, and the fixture says so", () => {
    // The rig's SuccessDouble answers to_url from the envelope's own name;
    // the PINNED envelope resolves its TARGET card (env/success.rb:19-22).
    // The status is the pinned one. The fixture names the artifact, so a
    // reader never mistakes the rig's shape for the pinned one.
    expect(ORACLE.rigArtifacts.join(" ")).toContain("rig's shape");
    const toUrl = ORACLE.sources["pinnedSuccessToUrl"]!.map((row) => row.text).join("\n");
    expect(toUrl).toContain("target = target name_context");
  });
});

describe("the port's create action, against the pinned create", () => {
  it("POST / classifies as the create verb (the route grammar is row A10's)", () => {
    expect(matchRoute("POST", "/")).toEqual({ verb: "create", json: false });
  });

  it("the create action saves the card and answers the success envelope's target: 303 + absolute Location", async () => {
    const res = await postCreate({ "card[name]": "B2 Created", "card[content]": "b2 body" });
    expect(res.status, res.body).toBe(303);
    expect(res.location).toBeDefined();
    // The envelope's target is the SAVED card, and the Location is absolute
    // (card_url, response.rb:41).
    expect(res.location).toContain("B2_Created");
    const record = await storage.fetcher.fetchByKey("b2_created");
    expect(record?.dbContent).toContain("b2 body");
  });

  it("a create that cannot land answers the 422 user-error class, the class the pinned falsey arm raises", async () => {
    // The pinned handle raises Card::Error::UserError when the save answers
    // falsey; the port's own refusal for a create with no name is the same
    // class (errorStatus: user-error -> 422).
    const res = await postCreate({ "card[content]": "nameless" });
    expect(res.status, res.body).toBe(422);
  });
});

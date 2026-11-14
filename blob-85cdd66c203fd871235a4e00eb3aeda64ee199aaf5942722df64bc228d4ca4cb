// The delete ACTION, card#delete (rest.rb:18-20), measured against the
// PINNED DECK's own method and the PINNED MODEL's own delete!.
//
// The completeness register's B4 row grades the port on the CONTROLLER
// METHOD `card#delete`. The method is a one-liner, and the one thing worth
// measuring is what that one line does for a card that does not exist -
// because the port answers 422 for that case and the reason has to be the
// pinned one.
//
// This file pins both sides:
//
//   fixtures/captured/card-delete-action-ruby-oracle.json is what
//   oracle-capture-card-delete-action-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned delete action over the loading rig's recording
//   doubles, and the PINNED CARD GEM's own trash set
//   (card-1.110.0/mod/core/set/all/trash.rb) over the same doubles:
//
//     the action  rest.rb:18-20 - ONE arm, no fork on new_card? (the
//                  update action, row B3, has two).
//     the delete  trash.rb:17-21 - delete! asks add_to_trash to update the
//                  model, and the helper (trash.rb:70-72) yields
//                  `args.merge(trash: true)` UNLESS new_card?.
//     the existing card the recorded call list is ["new_card?", "update!"]
//                  and the recorded update ask is {"trash": true}: a delete
//                  is a TRASH, not a row removal - the card keeps its row.
//     the card that does not exist the recorded call list is
//                  ["new_card?"] alone - the model is asked NOTHING, the
//                  pinned delete! returns nil, and the handle's fork
//                  (`yield ? cud_success : raise(Card::Error::UserError)`)
//                  turns that nil into the 422 class. The pinned 422 for a
//                  missing card is NOT a model exception: it is the
//                  handle's own truthiness fork answering a nil delete.
//
//   The port's side: the delete arm of src/server/write-routes.ts asks the
//   engine to delete the card and answers the delete verb; a delete of a
//   card that does not exist answers the 422 user-error class - the class
//   the pinned fork raises. Measured over the real HTTP write surface in
//   this row's parity test: a DELETE of an existing card answers the
//   delete verb and the card stops being readable (it is trashed), and a
//   DELETE of a missing mark answers 422.
//
//   The recorded redirect URL is the RIG's shape (the rig's SuccessDouble
//   answers to_url from the envelope's own name, while the PINNED envelope
//   resolves its TARGET card,
//   card-1.110.0/lib/card/env/success.rb:19-22); the fixture labels that
//   on its face, and the recorded redirect STATUS is pinned.
//
//   The PINNED card gem's trash set file is evaluated into a module by the
//   capture, with its task registration and event registrations absorbed by
//   two stand-ins. The fixture labels that too: the delete! and
//   add_to_trash bodies are the pinned ones and they execute.

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
  readFileSync(path.join(REPO, "fixtures/captured/card-delete-action-ruby-oracle.json"), "utf8"),
) as {
  deleteAction: Array<{
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

// The rule deck the delete arm needs (the write-routes suite's own seed):
//   1 *all (Set)  2 Set  3 *update  4 *create  5 *delete  6 Anyone
//   7 Anyone Signed In  8 *type  9 *self  18 *default
//   10/11/12: *all -> *update / *create / *delete, each [[Anyone Signed In]]
//   17: *all -> *default, typeId 14 (the default prose create's type)
//   14 Basic (typeId 14)  16 RichText  100 Target (the card under test)
//   90 Joe User (the session's holder)
async function seedDeleteDeck(s: Awaited<ReturnType<typeof createRenderTestStorage>>): Promise<void> {
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
  await seedDeleteDeck(storage);
  ctx = { driver: storage.counting, fetcher: storage.fetcher };
  bridge = await makeWriteRouteServer(storage, ctx, { get: "record-404" });
  joeToken = (await new SessionStore({ driver: storage.counting }).createSession(90)).token;
}, 90_000);

afterAll(() => {
  bridge?.server.close();
  storage?.close();
});

async function deleteMark(mark: string): Promise<{
  status: number;
  body: string;
  json: () => Record<string, unknown>;
}> {
  const res = await fetch(`${bridge.url}/${encodeURIComponent(mark)}.json`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${joeToken}` },
    redirect: "manual",
  });
  const text = await res.text();
  return { status: res.status, body: text, json: () => JSON.parse(text) as Record<string, unknown> };
}

describe("the delete action, against the pinned deck gem", () => {
  it("the pinned action's body is ONE arm, and it asks the model to delete", () => {
    const del = ORACLE.sources["delete"]!.map((row) => row.text).join("\n");
    expect(del).toContain("def delete");
    expect(del).toContain("handle { card.delete! }");
    // The update action beside it, so the one-arm shape is a finding and not
    // a paraphrase: the update has a new_card? fork, the delete has none.
    const update = ORACLE.sources["update"]!.map((row) => row.text).join("\n");
    expect(update).toContain("card.new_card? ? create");
  });

  it("a delete of an EXISTING card is a TRASH: the model is asked to update with trash: true", () => {
    const row = ORACLE.deleteAction[0]!;
    expect(row.error).toBeNull();
    expect(row.cardCalls).toEqual(["new_card?", "update!"]);
    expect(row.updateArgs).toEqual({ trash: true });
    expect(row.redirected!.status).toBe(303);
    // The pinned mechanism, quoted: delete! asks add_to_trash, and the
    // helper yields the trash: true merge UNLESS the card is new.
    const pinnedDelete = ORACLE.sources["pinnedTrashDelete"]!.map((row) => row.text).join("\n");
    expect(pinnedDelete).toContain("def delete! args={}");
    expect(pinnedDelete).toContain("update! delete_args");
    const pinnedHelper = ORACLE.sources["pinnedTrashHelper"]!.map((row) => row.text).join("\n");
    expect(pinnedHelper).toContain("yield args.merge(trash: true) unless new_card?");
  });

  it("a delete of a card that does NOT exist asks the model NOTHING and raises the 422 class", () => {
    const row = ORACLE.deleteAction[1]!;
    // The model is never asked to update: the guard skipped the yield.
    expect(row.cardCalls).toEqual(["new_card?"]);
    expect(row.cardCalls).not.toContain("update!");
    expect(row.updateArgs).toBeNull();
    // The nil delete answers the handle's fork, and the fork raises.
    expect(row.error).toContain("Card::Error::UserError");
    expect(row.redirected).toBeNull();
    const handle = ORACLE.sources["handle"]!.map((row) => row.text).join("\n");
    expect(handle).toContain("yield ? cud_success : raise(Card::Error::UserError)");
    const userError = ORACLE.sources["pinnedUserError"]!.map((row) => row.text).join("\n");
    expect(userError).toContain("self.status_code = 422");
  });

  it("the recorded redirect URL is the RIG's shape, and the fixture says so", () => {
    expect(ORACLE.rigArtifacts.join(" ")).toContain("the rig's SuccessDouble");
    expect(ORACLE.rigArtifacts.join(" ")).toContain("the recorded redirect STATUS is the pinned one");
  });
});

describe("the port's delete action, against the pinned delete", () => {
  it("DELETE /<mark> classifies as the delete verb (the route grammar is row A12's)", () => {
    expect(matchRoute("DELETE", "/Target")).toEqual({ verb: "delete", mark: "Target", json: false });
  });

  it("a delete of an EXISTING card answers the delete verb and the card stops being readable", async () => {
    // The pinned delete is a TRASH (the model is asked to update with
    // trash: true), so the card's row stays and the card stops answering
    // reads - the port's own shape of the same thing.
    const res = await deleteMark("Target");
    expect(res.status, res.body).toBe(200);
    expect(res.json().verb).toBe("delete");
    const record = await storage.fetcher.fetchByKey("target");
    expect(record).toBeUndefined();
  });

  it("a delete of a MISSING card answers the 422 user-error class - the class the pinned fork raises", async () => {
    const res = await deleteMark("B4 Never Was");
    expect(res.status, res.body).toBe(422);
  });
});

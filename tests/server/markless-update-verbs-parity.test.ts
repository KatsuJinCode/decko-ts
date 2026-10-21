// The markless update route PAIR, measured against the PINNED DECK's own
// route table and update dispatch.
//
// The completeness register's A11 row grades the port on engine_routes.rb
// lines 29-30: `put "/" => "card#update"` AND `patch "/" => "card#update"`
// - two registrations of the same action, one per verb. This file pins both
// sides:
//
//   fixtures/captured/markless-update-verbs-ruby-oracle.json is what
//   oracle-capture-markless-update-verbs-ruby.rb (tests/server/) recorded
//   by EXECUTING the pinned deck's own route table against a recording
//   Draw, the pinned controller's before_action table, the pinned card
//   gem's own uri_fetch and the pinned update action over doubles:
//
//     the routes  orders 12 and 13 of 29, inside the markless write block
//                 (post 11, delete 14); identical requirements, identical
//                 action - there is no verb-specific behavior anywhere in
//                 the deck's controller
//     the table   update rides setup, authenticate, load_card, refresh_card
//     the fetch   the body's card hash IS the mark; body-less, the EMPTY
//                 name is the mark (fetch "")
//     the action  new_card? false -> card.update! with the body's card
//                 hash; new_card? true -> the branch IS create (card.save!),
//                 the C7 row's measured chain
//
//   The port's route table folds the two verbs at one place
//   (src/server/write-routes.ts matchRoute: `method === "PUT" ||
//   method === "PATCH"`), so both verbs classify identically - the synonymy
//   the Rails form override rides. The live-HTTP behavior (the 303 update,
//   the _method=patch override) is the write-routes suites' own pin
//   (tests/server/write-routes.test.ts: "form update with a token session"
//   posts _method=patch; "PUT update (RESTful verb) ... per the Ruby
//   grammar").

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchRoute } from "../../src/server/write-routes.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/markless-update-verbs-ruby-oracle.json"), "utf8"),
) as {
  updateRoutes: Array<{ verb: string; patterns: string[]; requirements: Record<string, string>; action: string; order: number }>;
  marklessWriteRoutes: Array<{ verb: string; order: number }>;
  beforeActionsForUpdate: string[];
  uriFetch: Array<{ label: string; params: Record<string, unknown>; fetchAsks: Array<Record<string, unknown>>; error: string | null }>;
  updateAction: Array<{ label: string; newCard: boolean; error: string | null; cardCalls: string[]; redirected: { url: string; status: number } | null }>;
};

describe("the markless update route pair, against the pinned deck gem", () => {
  it("the pinned deck registers BOTH verbs to card#update, identically", () => {
    expect(ORACLE.updateRoutes).toEqual([
      { verb: "put", patterns: ["/"], requirements: {}, action: "card#update", order: 12 },
      { verb: "patch", patterns: ["/"], requirements: {}, action: "card#update", order: 13 },
    ]);
    expect(ORACLE.marklessWriteRoutes.map((route) => route.order)).toEqual([11, 12, 13, 14]);
  });

  it("update rides refresh_card: setup, authenticate, load_card, refresh_card", () => {
    expect(ORACLE.beforeActionsForUpdate).toEqual([
      "setup",
      "authenticate",
      "load_card",
      "refresh_card",
    ]);
  });

  it("the pinned fetch: the body's card hash IS the mark; body-less the EMPTY name", () => {
    const named = ORACLE.uriFetch[0]!;
    expect(named.error).toBeNull();
    expect(named.fetchAsks).toEqual([
      { mark: "Target", new: { name: "Target" }, skipModules: true, lookInTrash: null },
    ]);
    const nameless = ORACLE.uriFetch[1]!;
    expect(nameless.error).toBeNull();
    expect(nameless.fetchAsks[0]!.mark).toBe("");
  });

  it("the pinned update dispatch: found -> update!, missing -> the create branch", () => {
    const found = ORACLE.updateAction[0]!;
    expect(found.error).toBeNull();
    expect(found.cardCalls).toEqual(["new_card?", "update!"]);
    expect(found.redirected).toEqual({ url: "/", status: 303 });
    const missing = ORACLE.updateAction[1]!;
    expect(missing.error).toBeNull();
    expect(missing.cardCalls).toEqual(["new_card?", "save!"]);
  });
});

describe("the port's route table, against the pinned update pair", () => {
  it("BOTH verbs classify as the markless update - the synonymy at one fold", () => {
    expect(matchRoute("PUT", "/")).toEqual({ verb: "update", json: false });
    expect(matchRoute("PATCH", "/")).toEqual({ verb: "update", json: false });
  });

  it("the update pair carries no mark: the name rides the body's card hash", () => {
    for (const method of ["PUT", "PATCH"]) {
      expect(matchRoute(method, "/")?.mark).toBeUndefined();
    }
  });

  it("the verb fold covers the marked update routes too", () => {
    expect(matchRoute("PATCH", "/Target")).toMatchObject({ verb: "update", mark: "Target" });
    expect(matchRoute("PUT", "/Target")).toMatchObject({ verb: "update", mark: "Target" });
  });
});

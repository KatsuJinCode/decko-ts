// The markless create route, measured against the PINNED DECK's own route
// table, fetch branch and create action.
//
// The completeness register's A10 row grades the port on
// `post "/" => "card#create"` (engine_routes.rb:28). This file pins both
// sides:
//
//   fixtures/captured/markless-create-route-ruby-oracle.json is what
//   oracle-capture-markless-create-route-ruby.rb (tests/server/) recorded
//   by EXECUTING the pinned deck's own route table against a recording
//   Draw, the pinned controller's before_action table, the pinned card
//   gem's own uri_fetch (card_class.rb:106-115) with the Card.new ask
//   recorded, and the pinned create action over doubles:
//
//     the route  engine_routes.rb:28, order 11 of 29, the first of the four
//                markless write arms (post 11, put 12, patch 13, delete 14)
//     the table  create rides setup, authenticate, load_card, refresh_card
//                - NO load_mark (a write never resolves the implicit mark,
//                the A12 row's measured fact, re-recorded for this arm)
//     the fetch  params[:action] == "create" -> Card.new card_opts, NOT a
//                fetch (the deck's own FIXME: otherwise the save would act
//                like a normal update); the name rides the body's card
//                hash, and with neither, Name[nil] is the EMPTY name
//     the action create is handle { card.save! } - the save ask through the
//                success envelope, and the 303 hard redirect on success
//
//   The port's route table (src/server/write-routes.ts matchRoute, the
//   named export under test) answers the same shape: POST / -> create; the
//   name rides the body's card hash and an empty name is the engine's
//   validation 422. The live-HTTP behavior (rows, auth, responses) is the
//   write-routes suites' own pin (tests/server/write-routes.test.ts:
//   "PUT update (RESTful verb) and POST create both work per the Ruby
//   grammar", "create with no name: 422").

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchRoute } from "../../src/server/write-routes.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/markless-create-route-ruby-oracle.json"), "utf8"),
) as {
  createRoute: { verb: string; patterns: string[]; requirements: Record<string, string>; action: string; order: number };
  marklessWriteRoutes: Array<{ verb: string; order: number }>;
  beforeActionsForCreate: string[];
  uriFetch: Array<{ label: string; params: Record<string, unknown>; newAsks: Array<Record<string, unknown>>; error: string | null }>;
  createAction: Array<{ label: string; cardName: string; error: string | null; cardCalls: string[]; redirected: { url: string; status: number } | null }>;
};

describe("the markless create route, against the pinned deck gem", () => {
  it("the pinned deck registers POST / as card#create, order 11 of the markless write block", () => {
    expect(ORACLE.createRoute.verb).toBe("post");
    expect(ORACLE.createRoute.patterns).toEqual(["/"]);
    expect(ORACLE.createRoute.action).toBe("card#create");
    expect(ORACLE.createRoute.order).toBe(11);
    expect(ORACLE.marklessWriteRoutes.map((route) => route.verb)).toEqual([
      "post",
      "put",
      "patch",
      "delete",
    ]);
  });

  it("create rides NO load_mark: setup, authenticate, load_card, refresh_card", () => {
    expect(ORACLE.beforeActionsForCreate).toEqual([
      "setup",
      "authenticate",
      "load_card",
      "refresh_card",
    ]);
  });

  it("the create branch builds a NEW card, it does not fetch", () => {
    const named = ORACLE.uriFetch[0]!;
    expect(named.error).toBeNull();
    expect(named.newAsks).toEqual([{ name: "Target", content: "body" }]);
    const nameless = ORACLE.uriFetch[1]!;
    expect(nameless.error).toBeNull();
    expect(nameless.newAsks).toEqual([{ name: "" }]);
  });

  it("the pinned create action asks card.save! and hard-redirects 303 on success", () => {
    const row = ORACLE.createAction[0]!;
    expect(row.error).toBeNull();
    expect(row.cardCalls).toEqual(["save!"]);
    expect(row.redirected).toEqual({ url: "/", status: 303 });
  });
});

describe("the port's route table, against the pinned create route", () => {
  it("POST / classifies as the markless create", () => {
    expect(matchRoute("POST", "/")).toEqual({ verb: "create", json: false });
    expect(matchRoute("POST", "")).toEqual({ verb: "create", json: false });
  });

  it("the create route is POST-only on /: PUT and PATCH are the update arm, DELETE the delete arm", () => {
    expect(matchRoute("PUT", "/")).toMatchObject({ verb: "update" });
    expect(matchRoute("PATCH", "/")).toMatchObject({ verb: "update" });
    expect(matchRoute("DELETE", "/")).toMatchObject({ verb: "delete" });
  });

  it("the markless create carries no mark: the name rides the body's card hash", () => {
    const match = matchRoute("POST", "/");
    expect("mark" in match ? match.mark : undefined).toBeUndefined();
  });
});

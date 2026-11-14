// The MARKED delete route, measured against the PINNED DECK's own route
// table, verb matcher, fetch branch and action.
//
// The completeness register's A16 row grades the port on
// `match ":mark(.:format)" => "card#delete", via: :delete`
// (engine_routes.rb:38). This file pins both sides:
//
//   fixtures/captured/marked-delete-route-ruby-oracle.json is what
//   oracle-capture-marked-delete-route-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned deck's own route table against a recording Draw,
//   the pinned controller's before_action table, the pinned card gem's own
//   uri_fetch with the FETCH ask recorded, and the pinned delete action over
//   both new_card? answers:
//
//     the route  engine_routes.rb:38, order 18 of 29 - the last of the three
//                marked write arms, after the marked update (17). The
//                markless delete is line 31, order 14, and answers the bare
//                "/" only.
//     the verb   via: :delete. The PINNED actionpack turns that into
//                @via.map { Journey::Route.verb_matcher(v) }
//                (routing/mapper.rb:207-209) and the route matches only when
//                @request_method_match.any? { |m| m.call request }
//                (journey/route.rb:183-185), where each matcher class is
//                `req.<verb>?` from the VERBS template (journey/route.rb:
//                14-24). So this arm answers DELETE only; every other write
//                verb to the same one-segment path belongs to another arm.
//     the table  delete runs setup, authenticate, load_card, refresh_card
//                and NO load_mark (card_controller.rb:22 `only: [:read]`).
//     the fetch a delete is NOT the create branch, so uri_fetch FETCHES the
//                mark the way the update does. The mark rides RAW; the
//                FOLDED name rides the new: opts.
//     the action ONE arm, no new_card? branch: `handle { card.delete! }`
//                asks delete! whether or not the card exists. That is the
//                measured difference from the update action (rest.rb:14-16,
//                quoted beside it in the capture), which asks new_card? and
//                branches.
//
//   The port's route table (src/server/write-routes.ts matchRoute) answers
//   the same shape: DELETE is the only verb that classifies as the marked
//   delete, and the arm's single-segment constraint is enforced.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchRoute } from "../../src/server/write-routes.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/marked-delete-route-ruby-oracle.json"), "utf8"),
) as {
  markedDeleteRoute: { verb: string; patterns: string[]; requirements: Record<string, string | string[]>; action: string; order: number };
  markedDeleteVia: string[];
  precedence: {
    markedUpdateBefore: { order: number; action: string };
    marklessDelete: { order: number; action: string; patterns: string[] };
  };
  beforeActionsForDelete: string[];
  uriFetch: Array<{
    label: string;
    params: Record<string, unknown>;
    fetchAsks: Array<{ mark: unknown; new: Record<string, unknown> | null; skipModules: unknown; lookInTrash: unknown }>;
    error: string | null;
  }>;
  deleteAction: Array<{ label: string; newCard: boolean; cardCalls: string[]; redirected: { url: string; status: number } | null; error: string | null }>;
  sources: Record<string, Array<{ line: number; text: string }>>;
};

describe("the marked delete route, against the pinned deck gem", () => {
  it("the pinned deck registers match :mark(.:format) => card#delete at order 18", () => {
    expect(ORACLE.markedDeleteRoute.verb).toBe("match");
    expect(ORACLE.markedDeleteRoute.patterns).toEqual([":mark(.:format)"]);
    expect(ORACLE.markedDeleteRoute.action).toBe("card#delete");
    expect(ORACLE.markedDeleteRoute.order).toBe(18);
    expect(ORACLE.markedDeleteRoute.requirements).toEqual({ via: "delete" });
    expect(ORACLE.markedDeleteVia).toEqual(["delete"]);
  });

  it("precedence: the marked update is 17; the markless delete is order 14 on the bare \"/\"", () => {
    expect(ORACLE.precedence.markedUpdateBefore.order).toBe(17);
    expect(ORACLE.markedDeleteRoute.order).toBe(18);
    expect(ORACLE.precedence.marklessDelete.order).toBe(14);
    expect(ORACLE.precedence.marklessDelete.patterns).toEqual(["/"]);
  });

  it("the verb is carried by the pinned actionpack's own matcher source", () => {
    const verbSource = ORACLE.sources["pinnedVerbMatcher"]!.map((row) => row.text).join("\n");
    expect(verbSource).toContain("VERBS = %w{ DELETE GET HEAD OPTIONS LINK PATCH POST PUT TRACE UNLINK }");
    expect(verbSource).toContain("def self.call(req); req.#{v.downcase}?; end");
    expect(verbSource).toContain("@request_method_match.any? { |m| m.call request }");
    const via = ORACLE.sources["pinnedViaToRequestMethod"]!.map((row) => row.text).join("\n");
    expect(via).toContain("Journey::Route.verb_matcher");
  });

  it("delete rides NO load_mark: setup, authenticate, load_card, refresh_card", () => {
    expect(ORACLE.beforeActionsForDelete).toEqual([
      "setup",
      "authenticate",
      "load_card",
      "refresh_card",
    ]);
    expect(ORACLE.beforeActionsForDelete).not.toContain("load_mark");
  });

  it("a delete FETCHES the mark (it is not the Card.new create branch)", () => {
    const fetched = ORACLE.uriFetch[0]!;
    expect(fetched.error).toBeNull();
    expect(fetched.fetchAsks).toHaveLength(1);
    expect(fetched.fetchAsks[0]).toEqual({
      mark: "Target",
      new: { name: "Target" },
      skipModules: true,
      lookInTrash: null,
    });
  });

  it("the mark rides RAW and the FOLDED name rides the new: opts", () => {
    const folded = ORACLE.uriFetch[1]!;
    expect(folded.fetchAsks[0]!.mark).toBe("My_Card");
    expect(folded.fetchAsks[0]!.new).toEqual({ name: "My Card" });
  });

  it("no URL mark: the body's card[name] is the mark", () => {
    const fromBody = ORACLE.uriFetch[2]!;
    expect(fromBody.fetchAsks[0]!.mark).toBe("Target");
  });

  it("the (.:format) capture separates the suffix before params[:mark] is read", () => {
    const suffixed = ORACLE.uriFetch[3]!;
    expect(suffixed.params["format"]).toBe("json");
    expect(suffixed.fetchAsks[0]!.mark).toBe("Target");
  });

  it("look_in_trash rides params straight through to the fetch", () => {
    const trash = ORACLE.uriFetch[4]!;
    expect(trash.fetchAsks[0]!.lookInTrash).toBe(true);
  });

  it("the delete action is ONE arm: delete! whatever new_card? answers", () => {
    // Contrast with the update action quoted beside it in the capture
    // (rest.rb:14-16), which asks new_card? and branches to update! or
    // save!. The delete never asks - this is the measurement.
    const existing = ORACLE.deleteAction[0]!;
    expect(existing.newCard).toBe(false);
    expect(existing.error).toBeNull();
    expect(existing.cardCalls).toEqual(["delete!"]);
    const missing = ORACLE.deleteAction[1]!;
    expect(missing.newCard).toBe(true);
    expect(missing.cardCalls).toEqual(["delete!"]);
    // And the recorded contrast source proves the two arms differ in shape.
    const contrast = ORACLE.sources["updateForContrast"]!.map((row) => row.text).join("\n");
    expect(contrast).toContain("card.new_card?");
    expect(ORACLE.sources["delete"]!.map((row) => row.text).join("\n")).not.toContain("new_card?");
  });
});

describe("the port's route table, against the pinned marked delete", () => {
  it("DELETE to a one-segment path classifies as the marked delete", () => {
    expect(matchRoute("DELETE", "/Target")).toEqual({ verb: "delete", mark: "Target", json: false });
  });

  it("the verb set is closed: POST is the marked create, PUT/PATCH the marked update", () => {
    expect(matchRoute("POST", "/Target")).toEqual({ verb: "create", mark: "Target", json: false });
    expect(matchRoute("PUT", "/Target")).toEqual({ verb: "update", mark: "Target", json: false });
    expect(matchRoute("PATCH", "/Target")).toEqual({ verb: "update", mark: "Target", json: false });
  });

  it("the arm is ONE segment: a two-segment path is not the marked delete", () => {
    expect(matchRoute("DELETE", "/a/b")).toBeNull();
  });

  it("the bare \"/\" is the MARKLESS delete (order 14), a different arm", () => {
    expect(ORACLE.precedence.marklessDelete.patterns).toEqual(["/"]);
    expect(matchRoute("DELETE", "/")).toEqual({ verb: "delete", json: false });
    expect(matchRoute("DELETE", "")).toEqual({ verb: "delete", json: false });
  });

  it("the .json suffix rides the mark until markToName, the same name the oracle's split resolves", () => {
    expect(matchRoute("DELETE", "/Target.json")).toEqual({
      verb: "delete",
      mark: "Target.json",
      json: false,
    });
    expect(matchRoute("DELETE", "/My_Card")).toEqual({ verb: "delete", mark: "My_Card", json: false });
  });
});
// The MARKED update route, measured against the PINNED DECK's own route
// table, verb matcher, fetch branch and action dispatch.
//
// The completeness register's A15 row grades the port on
// `match ":mark(.:format)" => "card#update", via: %i[put patch]`
// (engine_routes.rb:37). This file pins both sides:
//
//   fixtures/captured/marked-update-route-ruby-oracle.json is what
//   oracle-capture-marked-update-route-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned deck's own route table against a recording Draw,
//   the pinned controller's before_action table, the pinned card gem's own
//   uri_fetch with the FETCH ask recorded, and the pinned update action over
//   both of its new_card? arms:
//
//     the route  engine_routes.rb:37, order 17 of 29, between the marked
//                create (16) and the marked delete (18). ONE registration
//                carrying TWO verbs - unlike the markless update pair on
//                lines 29-30, which is two registrations of one action.
//     the verb   via: [:put, :patch]. The PINNED actionpack turns that into
//                @via.map { Journey::Route.verb_matcher(v) }
//                (routing/mapper.rb:207-209) and the route matches only when
//                @request_method_match.any? { |m| m.call request }
//                (journey/route.rb:183-185), where each matcher class is
//                `req.<verb>?` from the VERBS template (journey/route.rb:
//                14-24). So this arm answers PUT and PATCH only: a POST to
//                the same path is the L36 marked create.
//     the table  update runs setup, authenticate, load_card, refresh_card
//                and NO load_mark (card_controller.rb:22 `only: [:read]`).
//     the fetch an update is NOT the create branch, so uri_fetch reaches
//                standard_uri_fetch and FETCHES the mark with
//                new: card_opts, skip_modules: true. The mark rides RAW;
//                the FOLDED name rides the new: opts.
//     the action new_card? ? create : handle { card.update! ... } - a found
//                card updates, a missing card's update IS the create.
//
//   The port's route table (src/server/write-routes.ts matchRoute) answers
//   the same shape: PUT and PATCH to one one-segment path classify as the
//   marked update, POST is the marked create and DELETE the marked delete,
//   and the arm's single-segment constraint is enforced. The
//   found/missing dispatch lives in the write-path engine, whose own suites
//   are the pin for it.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchRoute } from "../../src/server/write-routes.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/marked-update-route-ruby-oracle.json"), "utf8"),
) as {
  markedUpdateRoute: { verb: string; patterns: string[]; requirements: Record<string, string | string[]>; action: string; order: number };
  markedUpdateVia: string[];
  precedence: {
    markedCreateBefore: { order: number; action: string };
    markedDeleteAfter: { order: number; action: string };
  };
  beforeActionsForUpdate: string[];
  uriFetch: Array<{
    label: string;
    params: Record<string, unknown>;
    fetchAsks: Array<{ mark: unknown; new: Record<string, unknown> | null; skipModules: unknown; lookInTrash: unknown }>;
    error: string | null;
  }>;
  updateAction: Array<{ label: string; newCard: boolean; cardCalls: string[]; redirected: { url: string; status: number } | null; error: string | null }>;
  sources: Record<string, Array<{ line: number; text: string }>>;
};

describe("the marked update route, against the pinned deck gem", () => {
  it("the pinned deck registers match :mark(.:format) => card#update at order 17, ONE registration", () => {
    expect(ORACLE.markedUpdateRoute.verb).toBe("match");
    expect(ORACLE.markedUpdateRoute.patterns).toEqual([":mark(.:format)"]);
    expect(ORACLE.markedUpdateRoute.action).toBe("card#update");
    expect(ORACLE.markedUpdateRoute.order).toBe(17);
    // ONE route entry carrying both verbs - the markless pair on lines
    // 29-30 is two entries, this arm is one.
    expect(ORACLE.markedUpdateRoute.requirements).toEqual({ via: ["put", "patch"] });
    expect(ORACLE.markedUpdateVia).toEqual(["put", "patch"]);
  });

  it("precedence: the marked create is 16 and the marked delete is 18, this arm between them", () => {
    expect(ORACLE.precedence.markedCreateBefore.order).toBe(16);
    expect(ORACLE.markedUpdateRoute.order).toBe(17);
    expect(ORACLE.precedence.markedDeleteAfter.order).toBe(18);
  });

  it("the verb set is carried by the pinned actionpack's own matcher source", () => {
    const verbSource = ORACLE.sources["pinnedVerbMatcher"]!.map((row) => row.text).join("\n");
    expect(verbSource).toContain("VERBS = %w{ DELETE GET HEAD OPTIONS LINK PATCH POST PUT TRACE UNLINK }");
    expect(verbSource).toContain("def self.call(req); req.#{v.downcase}?; end");
    expect(verbSource).toContain("@request_method_match.any? { |m| m.call request }");
    const via = ORACLE.sources["pinnedViaToRequestMethod"]!.map((row) => row.text).join("\n");
    expect(via).toContain("Journey::Route.verb_matcher");
  });

  it("update rides NO load_mark: setup, authenticate, load_card, refresh_card", () => {
    expect(ORACLE.beforeActionsForUpdate).toEqual([
      "setup",
      "authenticate",
      "load_card",
      "refresh_card",
    ]);
    expect(ORACLE.beforeActionsForUpdate).not.toContain("load_mark");
  });

  it("an update FETCHES the mark (it is not the Card.new create branch)", () => {
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
    expect(fromBody.fetchAsks[0]!.new).toEqual({ name: "Target" });
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

  it("the update action is two-armed: found updates, missing IS the create", () => {
    const found = ORACLE.updateAction[0]!;
    expect(found.newCard).toBe(false);
    expect(found.error).toBeNull();
    expect(found.cardCalls).toEqual(["new_card?", "update!"]);
    expect(found.redirected).toEqual({ url: "/", status: 303 });
    const missing = ORACLE.updateAction[1]!;
    expect(missing.newCard).toBe(true);
    expect(missing.cardCalls).toEqual(["new_card?", "save!"]);
    expect(missing.redirected).toEqual({ url: "/", status: 303 });
  });
});

describe("the port's route table, against the pinned marked update", () => {
  it("PUT and PATCH to one one-segment path classify as the marked update", () => {
    expect(matchRoute("PUT", "/Target")).toEqual({ verb: "update", mark: "Target", json: false });
    expect(matchRoute("PATCH", "/Target")).toEqual({ verb: "update", mark: "Target", json: false });
  });

  it("the verb set is closed: POST is the marked create, DELETE the marked delete", () => {
    // via: [:put, :patch] (engine_routes.rb:37). The port folds both verbs
    // at one comparison (write-routes.ts:915 `put = method === "PUT" ||
    // method === "PATCH"`) and admits neither other write verb here.
    expect(matchRoute("POST", "/Target")).toEqual({ verb: "create", mark: "Target", json: false });
    expect(matchRoute("DELETE", "/Target")).toEqual({ verb: "delete", mark: "Target", json: false });
  });

  it("the arm is ONE segment: a two-segment path is not the marked update", () => {
    expect(matchRoute("PUT", "/a/b")).toBeNull();
    expect(matchRoute("PATCH", "/a/b")).toBeNull();
  });

  it("the .json suffix rides the mark until markToName, the same name the oracle's split resolves", () => {
    // This route DOES declare (.:format), so Rails splits the suffix before
    // params[:mark] is read (the oracle's fourth row). The port keeps the
    // suffix on the mark and strips it in markToName, which also owns the
    // underscore fold the oracle's second row measures - but note the
    // oracle's own split: the FETCHED mark is raw and only the new: name is
    // folded, which the port's markToName-then-fetch order reproduces.
    expect(matchRoute("PUT", "/Target.json")).toEqual({
      verb: "update",
      mark: "Target.json",
      json: false,
    });
    expect(matchRoute("PUT", "/My_Card")).toEqual({ verb: "update", mark: "My_Card", json: false });
  });
});
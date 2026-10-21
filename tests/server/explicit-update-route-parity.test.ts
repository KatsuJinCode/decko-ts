// The "super-explicit" (card)/update route, measured against the PINNED
// DECK's own route table, verb matcher, fetch branch and action dispatch.
//
// The completeness register's A19 row grades the port on
// `match "(card)/update(/:mark(.:format))" => "card#update", via: %i[post put patch]`
// (engine_routes.rb:47). This file pins both sides:
//
//   fixtures/captured/explicit-update-route-ruby-oracle.json is what
//   oracle-capture-explicit-update-route-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned deck's own route table against a recording Draw,
//   the pinned controller's before_action table, the pinned card gem's own
//   uri_fetch with the FETCH ask recorded, the pinned update action over
//   both new_card? arms, and the shared candidate reduction (see
//   pinned-route-table-candidate-reduction-ruby.rb) that lists every route in
//   the pinned table able to match each probe path, with the verbs each
//   admits:
//
//     the route  engine_routes.rb:47, order 25, between the (card)/create arm
//                (24) and the (card)/delete arm (26). Both segments are
//                optional, so "update" alone and "/card/update" are the arm.
//     the verb   via: [:post, :put, :patch] - the WIDEST write arm in the
//                table, and the one that makes a PUT|PATCH fold correct here
//                while row A18's create arm showed it wrong there. The
//                PINNED actionpack maps via to the route's matchers
//                (routing/mapper.rb:207-209), requires a verb match when they
//                are not all VerbMatchers::All (journey/route.rb:170-172),
//                and matches on any matcher answering true
//                (journey/route.rb:183-185), each matcher being `req.<verb>?`
//                (journey/route.rb:14-24).
//     the reach  DELETE is admitted by NO route for these paths, so
//                DELETE /update/Foo and DELETE /card/update/Foo match nothing.
//                For the BARE "/update" the first POST-admitting route is 16,
//                the MARKED create: a one-segment path is claimed by the
//                marked arms before this one is reached.
//     the fetch an update FETCHES the mark; the mark rides raw and the FOLDED
//                name rides the new: opts.
//     the action new_card? ? create : handle { card.update! ... }.
//
//   The port's route table (src/server/write-routes.ts matchRoute) answers
//   the same shape, including the PUT|PATCH fold this arm needs and the
//   bare-/update fall-through the reduction shows. No port change.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchRoute } from "../../src/server/write-routes.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/explicit-update-route-ruby-oracle.json"), "utf8"),
) as {
  filesWebPath: string;
  explicitUpdateRoute: { verb: string; patterns: string[]; requirements: Record<string, string | string[]>; action: string; order: number };
  explicitUpdateVia: string[];
  precedence: {
    explicitCreateBefore: { order: number; action: string };
    explicitDeleteAfter: { order: number; action: string };
  };
  beforeActionsForUpdate: string[];
  patternExpansions: Array<{ pattern: string; matches: Array<Array<Array<string>>> }>;
  verbCandidates: Array<{
    path: string;
    candidates: Array<{ order: number; admitsVerbs: string[] }>;
    firstRouteAdmittingGet: number | null;
    firstRouteAdmittingPost: number | null;
    firstRouteAdmittingPut: number | null;
    firstRouteAdmittingPatch: number | null;
    firstRouteAdmittingDelete: number | null;
  }>;
  uriFetch: Array<{
    fetchAsks: Array<{ mark: unknown; new: Record<string, unknown> | null; skipModules: unknown; lookInTrash: unknown }>;
    error: string | null;
  }>;
  updateAction: Array<{ newCard: boolean; cardCalls: string[]; redirected: { url: string; status: number } | null; error: string | null }>;
  sources: Record<string, Array<{ line: number; text: string }>>;
};

function candidatesFor(probePath: string) {
  const entry = ORACLE.verbCandidates.find((candidate) => candidate.path === probePath);
  expect(entry, `no recorded candidate reduction for ${probePath}`).toBeDefined();
  return entry!;
}

describe("the (card)/update route, against the pinned deck gem", () => {
  it("the pinned deck registers match (card)/update(/:mark(.:format)) at order 25", () => {
    expect(ORACLE.filesWebPath).toBe("files");
    expect(ORACLE.explicitUpdateRoute.verb).toBe("match");
    expect(ORACLE.explicitUpdateRoute.patterns).toEqual(["(card)/update(/:mark(.:format))"]);
    expect(ORACLE.explicitUpdateRoute.action).toBe("card#update");
    expect(ORACLE.explicitUpdateRoute.order).toBe(25);
  });

  it("the verb set is POST, PUT and PATCH - the widest write arm in the table", () => {
    expect(ORACLE.explicitUpdateRoute.requirements).toEqual({ via: ["post", "put", "patch"] });
    expect(ORACLE.explicitUpdateVia).toEqual(["post", "put", "patch"]);
    const verbSource = ORACLE.sources["pinnedVerbMatcher"]!.map((row) => row.text).join("\n");
    expect(verbSource).toContain("VERBS = %w{ DELETE GET HEAD OPTIONS LINK PATCH POST PUT TRACE UNLINK }");
    expect(verbSource).toContain("def self.call(req); req.#{v.downcase}?; end");
    expect(verbSource).toContain("@request_method_match.any? { |m| m.call request }");
    expect(verbSource).toContain("VerbMatchers::All");
    const via = ORACLE.sources["pinnedViaToRequestMethod"]!.map((row) => row.text).join("\n");
    expect(via).toContain("Journey::Route.verb_matcher");
  });

  it("precedence: the (card)/create arm is 24 and the (card)/delete arm is 26", () => {
    expect(ORACLE.precedence.explicitCreateBefore.order).toBe(24);
    expect(ORACLE.explicitUpdateRoute.order).toBe(25);
    expect(ORACLE.precedence.explicitDeleteAfter.order).toBe(26);
  });

  it("both segments are optional: the expansion admits four shapes", () => {
    const expansion = ORACLE.patternExpansions.find(
      (entry) => entry.pattern === "(card)/update(/:mark(.:format))",
    );
    expect(expansion).toBeDefined();
    expect(expansion!.matches).toHaveLength(4);
    expect(expansion!.matches.map((segments) => segments.join("/"))).toEqual(
      expect.arrayContaining([expect.stringContaining("update")]),
    );
  });

  it("POST, PUT and PATCH all reach order 25 for the two-segment update shapes", () => {
    for (const probePath of ["/update/Foo", "/card/update/Foo"]) {
      const entry = candidatesFor(probePath);
      expect(entry.firstRouteAdmittingPost, probePath).toBe(25);
      expect(entry.firstRouteAdmittingPut, probePath).toBe(25);
      expect(entry.firstRouteAdmittingPatch, probePath).toBe(25);
    }
  });

  it("DELETE is admitted by NO route for these paths", () => {
    for (const probePath of ["/update/Foo", "/card/update/Foo"]) {
      expect(candidatesFor(probePath).firstRouteAdmittingDelete, probePath).toBeNull();
    }
  });

  it("the BARE /update is claimed by the MARKED arms first (16/17/18)", () => {
    const entry = candidatesFor("/update");
    expect(entry.firstRouteAdmittingPost).toBe(16);
    expect(entry.firstRouteAdmittingPut).toBe(17);
    expect(entry.firstRouteAdmittingPatch).toBe(17);
    expect(entry.firstRouteAdmittingDelete).toBe(18);
  });

  it("update rides NO load_mark, FETCHES the mark, and the name rides the new: opts", () => {
    expect(ORACLE.beforeActionsForUpdate).toEqual([
      "setup",
      "authenticate",
      "load_card",
      "refresh_card",
    ]);
    expect(ORACLE.beforeActionsForUpdate).not.toContain("load_mark");
    const fetched = ORACLE.uriFetch[0]!;
    expect(fetched.error).toBeNull();
    expect(fetched.fetchAsks[0]).toEqual({
      mark: "Target",
      new: { name: "Target" },
      skipModules: true,
      lookInTrash: null,
    });
    const folded = ORACLE.uriFetch[1]!;
    expect(folded.fetchAsks[0]!.mark).toBe("My_Card");
    expect(folded.fetchAsks[0]!.new).toEqual({ name: "My Card" });
    const fromBody = ORACLE.uriFetch[2]!;
    expect(fromBody.fetchAsks[0]!.mark).toBe("Target");
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
  });
});

describe("the port's route table, against the pinned (card)/update", () => {
  it("POST, PUT and PATCH to the update shapes classify as the (card)/update", () => {
    for (const method of ["POST", "PUT", "PATCH"]) {
      expect(matchRoute(method, "/update/Foo"), method).toEqual({ verb: "update", mark: "Foo", json: false });
      expect(matchRoute(method, "/card/update/Foo"), method).toEqual({ verb: "update", mark: "Foo", json: false });
    }
    expect(matchRoute("POST", "/card/update")).toEqual({ verb: "update", mark: undefined, json: false });
    expect(matchRoute("PUT", "/card/update")).toEqual({ verb: "update", mark: undefined, json: false });
    expect(matchRoute("PATCH", "/card/update")).toEqual({ verb: "update", mark: undefined, json: false });
  });

  it("DELETE is admitted by no route, so these paths are no match", () => {
    expect(matchRoute("DELETE", "/update/Foo")).toBeNull();
    expect(matchRoute("DELETE", "/card/update/Foo")).toBeNull();
    expect(matchRoute("DELETE", "/card/update")).toBeNull();
  });

  it("the BARE /update falls to the marked arms, exactly as the reduction shows", () => {
    // One segment: POST is the marked CREATE (16) of the card named
    // "update", PUT and PATCH the marked update (17), DELETE the marked
    // delete (18). None of them reaches order 25.
    expect(matchRoute("POST", "/update")).toEqual({ verb: "create", mark: "update", json: false });
    expect(matchRoute("PUT", "/update")).toEqual({ verb: "update", mark: "update", json: false });
    expect(matchRoute("PATCH", "/update")).toEqual({ verb: "update", mark: "update", json: false });
    expect(matchRoute("DELETE", "/update")).toEqual({ verb: "delete", mark: "update", json: false });
  });

  it("this arm is why the port's PUT|PATCH fold is right HERE and wrong on A18", () => {
    // engine_routes.rb:47 is `%i[post put patch]`, so folding PATCH into the
    // PUT comparison is exactly right for this arm. Row A18's
    // engine_routes.rb:46 is `%i[post patch]`, which is why that arm's verb
    // test uses its own `patch` and not the `put` fold. The two rows pin
    // opposite halves of the same mechanism, and both are green.
    expect(ORACLE.explicitUpdateVia).toContain("put");
    expect(matchRoute("PUT", "/update/Foo").verb).toBe("update");
    expect(matchRoute("PUT", "/create/Foo")).toBeNull();
  });
});
// The "super-explicit" (card)/delete route, measured against the PINNED
// DECK's own route table, verb matcher, fetch branch and action.
//
// The completeness register's A20 row grades the port on
// `match "(card)/delete(/:mark(.:format))" => "card#delete", via: :delete`
// (engine_routes.rb:48). This file pins both sides:
//
//   fixtures/captured/explicit-delete-route-ruby-oracle.json is what
//   oracle-capture-explicit-delete-route-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned deck's own route table against a recording Draw,
//   the pinned controller's before_action table, the pinned card gem's own
//   uri_fetch with the FETCH ask recorded, the pinned delete action over both
//   new_card? answers, and the shared candidate reduction (see
//   pinned-route-table-candidate-reduction-ruby.rb):
//
//     the route  engine_routes.rb:48, order 26 - the last of the three (card)
//                write arms, after (card)/create (24) and (card)/update (25),
//                and before the super-lazy :mark/:view arm (27). Both
//                segments are optional.
//     the verb   via: :delete - ONE verb, the narrowest write arm in the
//                table. The PINNED actionpack maps via to the route's
//                matchers (routing/mapper.rb:207-209), requires a verb match
//                when they are not all VerbMatchers::All
//                (journey/route.rb:170-172), and matches on any matcher
//                answering true (journey/route.rb:183-185), each matcher
//                being `req.<verb>?` (journey/route.rb:14-24).
//     the reach  for /delete/Foo, /card/delete/Foo and /card/delete, DELETE
//                first reaches order 26 and POST/PUT/PATCH reach NO route at
//                all - so those writes match nothing. For the BARE "/delete"
//                the marked arms claim it first: POST 16, PUT/PATCH 17,
//                DELETE 18.
//     the fetch a delete FETCHES the mark; the mark rides raw and the FOLDED
//                name rides the new: opts.
//     the action ONE arm: `handle { card.delete! }` asks delete! whether or
//                not the card exists, so the recorded call list is
//                ["delete!"] for BOTH new_card? answers.
//
//   The port's route table (src/server/write-routes.ts matchRoute) answers
//   the same shape: DELETE is the only verb this arm admits, the writes it
//   does not admit are no matches, and the bare /delete falls to the marked
//   arms. No port change.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchRoute } from "../../src/server/write-routes.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/explicit-delete-route-ruby-oracle.json"), "utf8"),
) as {
  filesWebPath: string;
  explicitDeleteRoute: { verb: string; patterns: string[]; requirements: Record<string, string | string[]>; action: string; order: number };
  explicitDeleteVia: string[];
  precedence: {
    explicitUpdateBefore: { order: number; action: string };
    markViewArmAfter: { order: number; patterns: string[] };
  };
  beforeActionsForDelete: string[];
  patternExpansions: Array<{ pattern: string; matches: Array<Array<Array<string>>> }>;
  verbCandidates: Array<{
    path: string;
    candidates: Array<{ order: number; admitsVerbs: string[] }>;
    firstRouteAdmittingPost: number | null;
    firstRouteAdmittingPut: number | null;
    firstRouteAdmittingPatch: number | null;
    firstRouteAdmittingDelete: number | null;
  }>;
  uriFetch: Array<{ fetchAsks: Array<{ mark: unknown; new: Record<string, unknown> | null; skipModules: unknown }>; error: string | null }>;
  deleteAction: Array<{ newCard: boolean; cardCalls: string[]; redirected: { url: string; status: number } | null; error: string | null }>;
  sources: Record<string, Array<{ line: number; text: string }>>;
};

function candidatesFor(probePath: string) {
  const entry = ORACLE.verbCandidates.find((candidate) => candidate.path === probePath);
  expect(entry, `no recorded candidate reduction for ${probePath}`).toBeDefined();
  return entry!;
}

describe("the (card)/delete route, against the pinned deck gem", () => {
  it("the pinned deck registers match (card)/delete(/:mark(.:format)) at order 26", () => {
    expect(ORACLE.filesWebPath).toBe("files");
    expect(ORACLE.explicitDeleteRoute.verb).toBe("match");
    expect(ORACLE.explicitDeleteRoute.patterns).toEqual(["(card)/delete(/:mark(.:format))"]);
    expect(ORACLE.explicitDeleteRoute.action).toBe("card#delete");
    expect(ORACLE.explicitDeleteRoute.order).toBe(26);
  });

  it("the verb set is DELETE alone - the narrowest write arm in the table", () => {
    expect(ORACLE.explicitDeleteRoute.requirements).toEqual({ via: "delete" });
    expect(ORACLE.explicitDeleteVia).toEqual(["delete"]);
    const verbSource = ORACLE.sources["pinnedVerbMatcher"]!.map((row) => row.text).join("\n");
    expect(verbSource).toContain("VERBS = %w{ DELETE GET HEAD OPTIONS LINK PATCH POST PUT TRACE UNLINK }");
    expect(verbSource).toContain("def self.call(req); req.#{v.downcase}?; end");
    expect(verbSource).toContain("@request_method_match.any? { |m| m.call request }");
    const via = ORACLE.sources["pinnedViaToRequestMethod"]!.map((row) => row.text).join("\n");
    expect(via).toContain("Journey::Route.verb_matcher");
  });

  it("precedence: the (card)/update arm is 25 and the :mark/:view arm is 27", () => {
    expect(ORACLE.precedence.explicitUpdateBefore.order).toBe(25);
    expect(ORACLE.explicitDeleteRoute.order).toBe(26);
    expect(ORACLE.precedence.markViewArmAfter.order).toBe(27);
    expect(ORACLE.precedence.markViewArmAfter.patterns).toEqual([":mark/:view(.:format)"]);
  });

  it("both segments are optional: the expansion admits four shapes", () => {
    const expansion = ORACLE.patternExpansions.find(
      (entry) => entry.pattern === "(card)/delete(/:mark(.:format))",
    );
    expect(expansion).toBeDefined();
    expect(expansion!.matches).toHaveLength(4);
    expect(expansion!.matches.map((segments) => segments.join("/"))).toEqual(
      expect.arrayContaining([expect.stringContaining("delete")]),
    );
  });

  it("only DELETE reaches order 26 for the delete shapes; the writes reach nothing", () => {
    for (const probePath of ["/delete/Foo", "/card/delete/Foo", "/card/delete"]) {
      const entry = candidatesFor(probePath);
      expect(entry.firstRouteAdmittingDelete, probePath).toBe(26);
      expect(entry.firstRouteAdmittingPost, probePath).toBeNull();
      expect(entry.firstRouteAdmittingPut, probePath).toBeNull();
      expect(entry.firstRouteAdmittingPatch, probePath).toBeNull();
    }
  });

  it("the BARE /delete is claimed by the MARKED arms first (16/17/18)", () => {
    const entry = candidatesFor("/delete");
    expect(entry.firstRouteAdmittingPost).toBe(16);
    expect(entry.firstRouteAdmittingPut).toBe(17);
    expect(entry.firstRouteAdmittingPatch).toBe(17);
    expect(entry.firstRouteAdmittingDelete).toBe(18);
  });

  it("delete rides NO load_mark, FETCHES the mark, and the action is one-armed", () => {
    expect(ORACLE.beforeActionsForDelete).toEqual([
      "setup",
      "authenticate",
      "load_card",
      "refresh_card",
    ]);
    expect(ORACLE.beforeActionsForDelete).not.toContain("load_mark");
    const fetched = ORACLE.uriFetch[0]!;
    expect(fetched.error).toBeNull();
    expect(fetched.fetchAsks[0]).toMatchObject({ mark: "Target", new: { name: "Target" }, skipModules: true });
    const folded = ORACLE.uriFetch[1]!;
    expect(folded.fetchAsks[0]!.mark).toBe("My_Card");
    expect(folded.fetchAsks[0]!.new).toEqual({ name: "My Card" });
    const fromBody = ORACLE.uriFetch[2]!;
    expect(fromBody.fetchAsks[0]!.mark).toBe("Target");

    // One arm: delete! whatever new_card? answers, and new_card? is never
    // asked. The same finding row A16 recorded on the marked delete.
    const existing = ORACLE.deleteAction[0]!;
    expect(existing.error).toBeNull();
    expect(existing.cardCalls).toEqual(["delete!"]);
    expect(existing.redirected).toEqual({ url: "/", status: 303 });
    const missing = ORACLE.deleteAction[1]!;
    expect(missing.cardCalls).toEqual(["delete!"]);
    expect(ORACLE.sources["delete"]!.map((row) => row.text).join("\n")).not.toContain("new_card?");
  });
});

describe("the port's route table, against the pinned (card)/delete", () => {
  it("DELETE to the delete shapes classifies as the (card)/delete", () => {
    expect(matchRoute("DELETE", "/delete/Foo")).toEqual({ verb: "delete", mark: "Foo", json: false });
    expect(matchRoute("DELETE", "/card/delete/Foo")).toEqual({ verb: "delete", mark: "Foo", json: false });
    expect(matchRoute("DELETE", "/card/delete")).toEqual({ verb: "delete", mark: undefined, json: false });
  });

  it("POST, PUT and PATCH are admitted by no route, so these paths are no match", () => {
    for (const method of ["POST", "PUT", "PATCH"]) {
      expect(matchRoute(method, "/delete/Foo"), method).toBeNull();
      expect(matchRoute(method, "/card/delete/Foo"), method).toBeNull();
      expect(matchRoute(method, "/card/delete"), method).toBeNull();
    }
  });

  it("the BARE /delete falls to the marked arms, exactly as the reduction shows", () => {
    // One segment: POST is the marked create (16) of the card named
    // "delete", PUT/PATCH the marked update (17), DELETE the marked delete
    // (18). None of them reaches order 26.
    expect(matchRoute("POST", "/delete")).toEqual({ verb: "create", mark: "delete", json: false });
    expect(matchRoute("PUT", "/delete")).toEqual({ verb: "update", mark: "delete", json: false });
    expect(matchRoute("PATCH", "/delete")).toEqual({ verb: "update", mark: "delete", json: false });
    expect(matchRoute("DELETE", "/delete")).toEqual({ verb: "delete", mark: "delete", json: false });
  });

  it("the three (card)/ arms together cover the whole write verb surface", () => {
    // create %i[post patch] (A18), update %i[post put patch] (A19), delete
    // :delete (A20). The port's answers below are the measured consequence of
    // all three, not a paraphrase of them.
    expect(ORACLE.explicitDeleteVia).toEqual(["delete"]);
    expect(matchRoute("PATCH", "/create/Foo")?.verb).toBe("create");
    expect(matchRoute("PUT", "/create/Foo")).toBeNull();
    expect(matchRoute("PUT", "/update/Foo")?.verb).toBe("update");
    expect(matchRoute("PUT", "/delete/Foo")).toBeNull();
  });
});
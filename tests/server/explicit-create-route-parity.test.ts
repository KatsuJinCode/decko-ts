// The "super-explicit" (card)/create route, measured against the PINNED
// DECK's own route table, verb matcher and fetch branch.
//
// The completeness register's A18 row grades the port on
// `match "(card)/create(/:mark(.:format))" => "card#create", via: %i[post patch]`
// (engine_routes.rb:46). This file pins both sides, and this is the one row
// of the eight that CHANGED the port:
//
//   fixtures/captured/explicit-create-route-ruby-oracle.json is what
//   oracle-capture-explicit-create-route-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned deck's own route table against a recording Draw,
//   the pinned controller's before_action table and the pinned card gem's own
//   uri_fetch with the Card.new ask recorded - plus, because this row's whole
//   decision is the VERB SET, a CANDIDATE REDUCTION: for each probe path the
//   fixture lists every route in the executed pinned table whose registered
//   pattern can match that path, together with the verbs each admits.
//
//     the route  engine_routes.rb:46, order 24. BOTH segments are optional:
//                `(card)` is a Rails optional group and `(/:mark(.:format))`
//                is optional too, so "create" alone and "/card/create" are
//                both this arm.
//     the verb   via: [:post, :patch]. The PINNED actionpack turns that into
//                @via.map { Journey::Route.verb_matcher(v) }
//                (routing/mapper.rb:207-209), a route whose matchers are not
//                all VerbMatchers::All REQUIRES a verb match
//                (journey/route.rb:170-172), and it matches only when
//                @request_method_match.any? { |m| m.call request }
//                (journey/route.rb:183-185) where each matcher is
//                `req.<verb>?` (journey/route.rb:14-24).
//     the reach  the reduction shows NO route in the pinned table admits PUT
//                for /create/Foo, /card/create/Foo or /card/create: the only
//                candidates are the three GET asset globs, the GET
//                transaction alternative (19), the marked arms where the path
//                is one segment, the legacy card/:view arm, the :mark/:view
//                arm, and the wildcard - every one of them GET. So a PUT to
//                those paths matches no route at all.
//     the shape  for the BARE "/create" the reduction shows the opposite and
//                important fact: the first route admitting POST is 16, the
//                MARKED create - "(card)" is optional, so "/create" is the
//                create of the card literally named "create" (this arm is
//                only reached at 24 if nothing earlier matched, and a
//                one-segment path never reaches the literal "create").
//
//   THE COMPLETION this row makes. The port folded PATCH into its `put`
//   variable (write-routes.ts `put = method === "PUT" || method === "PATCH"`),
//   and that fold is RIGHT for engine_routes.rb:47's `%i[post put patch]` arm
//   but WRONG for this row's `%i[post patch]`: the create arm's verb test
//   therefore admitted PUT, so `PUT /create/Foo`, `PUT /card/create/Foo` and
//   `PUT /card/create` classified as a CREATE where the pinned table routes
//   them nowhere. The arm now tests `post || patch` against its own
//   `patch`, and the measured verb outcomes are pinned below.
//
//   files_web_path: the capture primes PinnedDeck.files_web_path BEFORE
//   drawing the table, because engine_routes.rb:10,13 interpolate `#{files}`
//   and the real deck has loaded the PINNED carrierwave mod by then. Drawn
//   without it those two routes would register as bare "/:mark/..." - two
//   dynamic segments that match every two-segment path and pollute this
//   row's candidate reduction.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchRoute } from "../../src/server/write-routes.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type Candidate = {
  order: number;
  verb: string;
  patterns: string[];
  via: string[];
  admitsVerbs: string[];
  action: string;
};

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/explicit-create-route-ruby-oracle.json"), "utf8"),
) as {
  filesWebPath: string;
  explicitCreateRoute: { verb: string; patterns: string[]; requirements: Record<string, string | string[]>; action: string; order: number };
  explicitCreateVia: string[];
  precedence: {
    markedCreateBefore: { order: number; action: string };
    markedUpdateBefore: { order: number; action: string };
  };
  beforeActionsForCreate: string[];
  patternExpansions: Array<{ pattern: string; matches: Array<Array<Array<string>>> }>;
  verbCandidates: Array<{
    path: string;
    segments: string[];
    candidates: Candidate[];
    firstRouteAdmittingPut: number | null;
    firstRouteAdmittingPost: number | null;
    firstRouteAdmittingPatch: number | null;
    firstRouteAdmittingDelete: number | null;
  }>;
  uriFetch: Array<{ label: string; newAsks: Array<Record<string, unknown>>; error: string | null }>;
  sources: Record<string, Array<{ line: number; text: string }>>;
};

function candidatesFor(probePath: string) {
  const entry = ORACLE.verbCandidates.find((candidate) => candidate.path === probePath);
  expect(entry, `no recorded candidate reduction for ${probePath}`).toBeDefined();
  return entry!;
}

describe("the (card)/create route, against the pinned deck gem", () => {
  it("the pinned deck registers match (card)/create(/:mark(.:format)) at order 24", () => {
    expect(ORACLE.filesWebPath).toBe("files");
    expect(ORACLE.explicitCreateRoute.verb).toBe("match");
    expect(ORACLE.explicitCreateRoute.patterns).toEqual(["(card)/create(/:mark(.:format))"]);
    expect(ORACLE.explicitCreateRoute.action).toBe("card#create");
    expect(ORACLE.explicitCreateRoute.order).toBe(24);
  });

  it("the verb set is POST and PATCH, and the pinned matcher source carries the rule", () => {
    expect(ORACLE.explicitCreateRoute.requirements).toEqual({ via: ["post", "patch"] });
    expect(ORACLE.explicitCreateVia).toEqual(["post", "patch"]);
    const verbSource = ORACLE.sources["pinnedVerbMatcher"]!.map((row) => row.text).join("\n");
    expect(verbSource).toContain("VERBS = %w{ DELETE GET HEAD OPTIONS LINK PATCH POST PUT TRACE UNLINK }");
    expect(verbSource).toContain("def self.call(req); req.#{v.downcase}?; end");
    expect(verbSource).toContain("@request_method_match.any? { |m| m.call request }");
    // A route whose matchers are not all VerbMatchers::All REQUIRES a verb
    // match - which is what makes an unlisted verb fall THROUGH this route
    // instead of matching it.
    expect(verbSource).toContain("VerbMatchers::All");
    const via = ORACLE.sources["pinnedViaToRequestMethod"]!.map((row) => row.text).join("\n");
    expect(via).toContain("Journey::Route.verb_matcher");
  });

  it("precedence: the marked create is 16 and the marked update is 17, both before 24", () => {
    expect(ORACLE.precedence.markedCreateBefore.order).toBe(16);
    expect(ORACLE.precedence.markedUpdateBefore.order).toBe(17);
    expect(ORACLE.explicitCreateRoute.order).toBe(24);
  });

  it("both segments are optional: the expansion admits four shapes", () => {
    const expansion = ORACLE.patternExpansions.find(
      (entry) => entry.pattern === "(card)/create(/:mark(.:format))",
    );
    expect(expansion).toBeDefined();
    // ["card","create",dyn] ["card","create"] ["create",dyn] ["create"]
    expect(expansion!.matches.map((segments) => segments.join("/"))).toEqual(
      expect.arrayContaining([expect.stringContaining("card")]),
    );
    expect(expansion!.matches).toHaveLength(4);
  });

  it("NO route in the pinned table admits PUT for the two-segment create shapes", () => {
    for (const probePath of ["/create/Foo", "/card/create/Foo"]) {
      const entry = candidatesFor(probePath);
      expect(entry.firstRouteAdmittingPut, `${probePath} admits a PUT route`).toBeNull();
      // No candidate admits PUT. The only non-GET candidate is this arm
      // itself (order 24, via post+patch); the rest are the three asset
      // globs, the GET transaction alternative, and the wildcard.
      expect(
        entry.candidates.flatMap((candidate) => candidate.admitsVerbs),
        `${probePath} admits a PUT verb somewhere in the pinned table`,
      ).not.toContain("put");
      expect(
        entry.candidates.filter((candidate) => !candidate.admitsVerbs.every((verb) => verb === "get")).map((candidate) => candidate.order),
      ).toEqual([24]);
      expect(entry.firstRouteAdmittingPost).toBe(24);
      expect(entry.firstRouteAdmittingPatch).toBe(24);
      expect(entry.firstRouteAdmittingDelete).toBeNull();
    }
  });

  it("NO route admits PUT for /card/create either, while POST and PATCH reach order 24", () => {
    const entry = candidatesFor("/card/create");
    expect(entry.firstRouteAdmittingPut).toBeNull();
    expect(entry.firstRouteAdmittingPost).toBe(24);
    expect(entry.firstRouteAdmittingPatch).toBe(24);
  });

  it("the BARE /create is the MARKED create (16), not this arm: the first POST is 16", () => {
    // "(card)" is optional, so the one-segment path is matched by the
    // marked create first - the create of the card named "create".
    const entry = candidatesFor("/create");
    expect(entry.firstRouteAdmittingPost).toBe(16);
    expect(entry.firstRouteAdmittingPut).toBe(17);
    expect(entry.firstRouteAdmittingPatch).toBe(17);
    expect(entry.firstRouteAdmittingDelete).toBe(18);
  });

  it("create rides NO load_mark, and the URL mark names the new card", () => {
    expect(ORACLE.beforeActionsForCreate).toEqual([
      "setup",
      "authenticate",
      "load_card",
      "refresh_card",
    ]);
    expect(ORACLE.beforeActionsForCreate).not.toContain("load_mark");
    const named = ORACLE.uriFetch[0]!;
    expect(named.error).toBeNull();
    expect(named.newAsks).toEqual([{ name: "Target" }]);
    const empty = ORACLE.uriFetch[1]!;
    expect(empty.newAsks).toEqual([{ name: "" }]);
  });
});

describe("the port's route table, against the pinned (card)/create", () => {
  it("POST and PATCH to the create shapes classify as the (card)/create", () => {
    expect(matchRoute("POST", "/create/Foo")).toEqual({ verb: "create", mark: "Foo", json: false });
    expect(matchRoute("PATCH", "/create/Foo")).toEqual({ verb: "create", mark: "Foo", json: false });
    expect(matchRoute("POST", "/card/create/Foo")).toEqual({ verb: "create", mark: "Foo", json: false });
    expect(matchRoute("PATCH", "/card/create/Foo")).toEqual({ verb: "create", mark: "Foo", json: false });
    expect(matchRoute("POST", "/card/create")).toEqual({ verb: "create", mark: undefined, json: false });
    expect(matchRoute("PATCH", "/card/create")).toEqual({ verb: "create", mark: undefined, json: false });
  });

  it("COMPLETION: PUT is NOT a create verb here - those paths are no route", () => {
    // The pinned arm is via: [:post, :patch] (engine_routes.rb:46) and the
    // candidate reduction shows no other route admits PUT for any of these
    // three paths. Before this row the arm rode the `put` fold
    // (PUT || PATCH) that engine_routes.rb:47's `%i[post put patch]` arm
    // wants, so all three classified as a CREATE.
    expect(matchRoute("PUT", "/create/Foo")).toBeNull();
    expect(matchRoute("PUT", "/card/create/Foo")).toBeNull();
    expect(matchRoute("PUT", "/card/create")).toBeNull();
  });

  it("DELETE is not admitted either", () => {
    expect(matchRoute("DELETE", "/create/Foo")).toBeNull();
    expect(matchRoute("DELETE", "/card/create/Foo")).toBeNull();
  });

  it("the BARE /create falls to the marked arms, exactly as the reduction shows", () => {
    // One segment: the marked create (16) for POST, the marked update (17)
    // for PUT and PATCH, the marked delete (18) for DELETE.
    expect(matchRoute("POST", "/create")).toEqual({ verb: "create", mark: "create", json: false });
    expect(matchRoute("PUT", "/create")).toEqual({ verb: "update", mark: "create", json: false });
    expect(matchRoute("PATCH", "/create")).toEqual({ verb: "update", mark: "create", json: false });
    expect(matchRoute("DELETE", "/create")).toEqual({ verb: "delete", mark: "create", json: false });
  });
});
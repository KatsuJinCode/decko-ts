// The super-lazy :mark/:view(.:format) read route, measured against the
// PINNED DECK's own route table, mark method and view method.
//
// The completeness register's A21 row grades the port on
// `get ":mark/:view(.:format)" => "card#read"` (engine_routes.rb:51). This
// file pins both sides:
//
//   fixtures/captured/mark-view-route-ruby-oracle.json is what
//   oracle-capture-mark-view-route-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned deck's own route table against a recording Draw,
//   the pinned interpret_mark and view_from_params over each probe path's own
//   params shape, the pinned card gem's own uri_fetch with the FETCH ask
//   recorded, and the shared candidate reduction:
//
//     the route  engine_routes.rb:51, order 27 of 29 - the LAST named read
//                route, immediately before the wildcard (line 54, order 28,
//                view: "bad_address"). It sets no `view:` option, so the view
//                comes from the URL segment alone.
//     the shape  EXACTLY two segments, and the lowest-precedence named route:
//                for /Front/related the reduction shows orders 3/4/5 (the
//                deprecated asset globs) before 27, and 27 before the
//                wildcard 28. For /read/Front the GET transaction
//                alternative (order 20) claims the path first; for
//                /new/Sign_up the new/:type arm (order 7) does. That is why
//                the reduction needs the whole table: a claim about what this
//                arm does NOT answer cannot be read off line 51.
//     the mark   interpret_mark sends a PRESENT mark down explicit_mark,
//                which returns it VERBATIM (no fold, no implicit ladder).
//                "My_Card" stays "My_Card" here; the underscore fold belongs
//                to the fetch's uri_fetch_opts, where the capture records it.
//     the view   view_from_params is `%i[view v].each { |k| return params[k]
//                if params[k].present? }; nil` - so :view first, :v second,
//                a BLANK value skipped, and nil when neither is present.
//     the format the (.:format) capture rides the VIEW segment: the capture's
//                suffixed row shows params[:format] carrying it with the view
//                still clean.
//     the params PINNED actionpack merges path_parameters LAST
//                (action_dispatch/http/parameters.rb:56-61,
//                `request_parameters.merge(query_parameters)` then
//                `params.merge!(path_parameters)`), so a `?view=` query does
//                NOT override the view in the URL. The port's answers match.
//
//   The port's URL parser (deploy/bunny-worker-src/
//   bunny-edge-lineage-worker-surface.ts parsePath) answers the same shape for
//   the paths this arm owns, and routes /read/<mark> and /new/<type> to the
//   earlier arms the reduction identifies. One named divergence, stated
//   below rather than glossed: /update/<mark>.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/mark-view-route-ruby-oracle.json"), "utf8"),
) as {
  filesWebPath: string;
  markViewRoute: { verb: string; patterns: string[]; requirements: Record<string, string>; action: string; order: number };
  precedence: {
    previousArm: { order: number; patterns: string[] };
    wildcardArm: { order: number; patterns: string[]; requirements: Record<string, string> };
  };
  routeTableSize: number;
  patternExpansions: Array<{ pattern: string; matches: Array<Array<Array<string>>> }>;
  verbCandidates: Array<{
    path: string;
    candidates: Array<{ order: number; verb: string; patterns: string[]; action: string }>;
    firstRouteAdmittingGet: number | null;
  }>;
  routeRequests: Array<{
    label: string;
    params: Record<string, unknown>;
    markAnswer: string | null;
    viewFromParams: string | null;
  }>;
  uriFetch: Array<{
    params: Record<string, unknown>;
    fetchAsks: Array<{ mark: unknown; new: Record<string, unknown> | null; skipModules: unknown }>;
    error: string | null;
  }>;
  sources: Record<string, Array<{ line: number; text: string }>>;
};

function candidatesFor(probePath: string) {
  const entry = ORACLE.verbCandidates.find((candidate) => candidate.path === probePath);
  expect(entry, `no recorded candidate reduction for ${probePath}`).toBeDefined();
  return entry!;
}

describe("the :mark/:view route, against the pinned deck gem", () => {
  it("the pinned deck registers get :mark/:view(.:format) at order 27 of 29", () => {
    expect(ORACLE.routeTableSize).toBe(29);
    expect(ORACLE.markViewRoute.verb).toBe("get");
    expect(ORACLE.markViewRoute.patterns).toEqual([":mark/:view(.:format)"]);
    expect(ORACLE.markViewRoute.action).toBe("card#read");
    expect(ORACLE.markViewRoute.order).toBe(27);
    // The route sets no `view:` option, so the view is the URL segment alone.
    expect(ORACLE.markViewRoute.requirements).toEqual({});
  });

  it("it is the last named read route, immediately before the wildcard", () => {
    expect(ORACLE.precedence.previousArm.order).toBe(26);
    expect(ORACLE.markViewRoute.order).toBe(27);
    expect(ORACLE.precedence.wildcardArm.order).toBe(28);
    expect(ORACLE.precedence.wildcardArm.patterns).toEqual(["*mark"]);
    expect(ORACLE.precedence.wildcardArm.requirements).toEqual({ view: "bad_address" });
  });

  it("the reduction shows this arm is what answers /<mark>/<view>, after the asset globs", () => {
    const entry = candidatesFor("/Front/related");
    expect(entry.candidates.map((candidate) => candidate.order)).toContain(27);
    // Nothing named before 27 claims a two-segment card path except the three
    // deprecated asset globs (orders 3/4/5).
    expect(entry.candidates.filter((candidate) => candidate.order < 27).map((candidate) => candidate.order)).toEqual([3, 4, 5]);
  });

  it("earlier routes claim their own shapes: /read/<mark> is order 20, /new/<type> is order 7", () => {
    const read = candidatesFor("/read/Front");
    expect(read.candidates.map((candidate) => candidate.order)).toContain(20);
    const readArm = read.candidates.find((candidate) => candidate.order === 20)!;
    expect(readArm.patterns).toEqual(["(card)/read(/:mark(.:format))"]);
    const newType = candidatesFor("/new/Sign_up");
    expect(newType.candidates.map((candidate) => candidate.order)).toContain(7);
    const newArm = newType.candidates.find((candidate) => candidate.order === 7)!;
    expect(newArm.patterns).toEqual(["new/:type"]);
  });

  it("interpret_mark returns a present mark VERBATIM: no fold, no implicit ladder", () => {
    const plain = ORACLE.routeRequests[0]!;
    expect(plain.markAnswer).toBe("Front");
    expect(plain.viewFromParams).toBe("related");
    const underscored = ORACLE.routeRequests[5]!;
    expect(underscored.params["mark"]).toBe("My_Card");
    expect(underscored.markAnswer).toBe("My_Card");
  });

  it("view_from_params: :view first, :v second, blank skipped, nil when neither", () => {
    // The suffixed row proves the (.:format) capture rides the VIEW segment:
    // params[:format] carries "json" and the view is still "related".
    const suffixed = ORACLE.routeRequests[1]!;
    expect(suffixed.params["format"]).toBe("json");
    expect(suffixed.viewFromParams).toBe("related");
    // The `v` alias answers when :view is absent.
    expect(ORACLE.routeRequests[2]!.params["v"]).toBe("related");
    expect(ORACLE.routeRequests[2]!.viewFromParams).toBe("related");
    // No view at all answers nil, which is what leaves render_page's default.
    expect(ORACLE.routeRequests[3]!.viewFromParams).toBeNull();
    // A BLANK :view is not `present?`, so the alias is tried next.
    const blank = ORACLE.routeRequests[4]!;
    expect(blank.params["view"]).toBe("");
    expect(blank.viewFromParams).toBe("related");
  });

  it("a read FETCHES the mark; the underscore fold lands in the new: name, not the route", () => {
    const fetched = ORACLE.uriFetch[0]!;
    expect(fetched.error).toBeNull();
    // The FETCHED mark is the raw segment; the FOLDED name rides new:.
    expect(fetched.fetchAsks[0]).toMatchObject({ mark: "My_Card", new: { name: "My Card" }, skipModules: true });
    // The view is a render-time param: it does not reach the fetch at all.
    const withView = ORACLE.uriFetch[1]!;
    expect(withView.params["view"]).toBe("search_box_complete");
    expect(Object.keys(withView.fetchAsks[0]!.new!)).toEqual(["name"]);
  });
});

describe("the port's URL parser, against the pinned :mark/:view arm", () => {
  it("/<mark>/<view> classifies as the arm, with the view verbatim", () => {
    expect(parsePath("/Front/related")).toEqual({ name: "Front", view: "related" });
  });

  it("the .:format capture rides the VIEW segment, exactly L51's rule", () => {
    // The same split row A8 completed on the three-segment :mark/view/:view
    // arm; this arm's own suffix lands in the format too.
    expect(parsePath("/Front/related.json")).toEqual({
      name: "Front",
      view: "related",
      format: "json",
    });
  });

  it("the mark segment is folded for the name, the view is NOT folded", () => {
    // Ruby's interpret_mark returns "My_Card" verbatim and the fold happens in
    // uri_fetch_opts; the port folds the name at parse time. Both resolve the
    // card named "My Card". A FOLDED VIEW would miss the registered-view
    // table (the port's own note), so the view stays literal.
    expect(parsePath("/My_Card/related")).toEqual({ name: "My Card", view: "related" });
    expect(parsePath("/Front/search_box_complete")).toEqual({
      name: "Front",
      view: "search_box_complete",
    });
  });

  it("a ?view= query does NOT override the view in the URL", () => {
    // PINNED actionpack merges path_parameters LAST
    // (action_dispatch/http/parameters.rb:56-61), so the URL segment wins.
    for (const query of ["view=search_box_complete", "v=search_box_complete"]) {
      const url = new URL(`http://x/Front/related?${query}`);
      expect(parsePath(url.pathname, url.searchParams), query).toEqual({
        name: "Front",
        view: "related",
      });
    }
  });

  it("the shapes earlier routes claim are routed to their own arms", () => {
    // The reduction says /read/<mark> is order 20 and /new/<type> is order 7,
    // both before 27.
    expect(parsePath("/read/Front")).toEqual({ kind: "actionRead", rawMark: "Front" });
    expect(parsePath("/new/Sign_up")).toEqual({ kind: "new", typeName: "Sign up" });
  });

  it("NAMED DIVERGENCE: /update/<mark> is NOT the arm in the port", () => {
    // The reduction says /update/Front is claimed by order 21, the
    // `(card)/update(/:mark(.:format))` GET alternative, which dispatches
    // card#update. The port's edge parser does not admit that alternative
    // here and falls through to this arm instead, rendering the card "update"
    // in view "Front".
    //
    // THIS IS NOT A NEW FINDING AND NOT SILENTLY HELD. The port's own header
    // names it: bunny-edge-lineage-worker-surface.ts:114-118 records that the
    // state-changing GET alternatives are deliberately NOT admitted on the
    // edge's plain-link surface, because they are state-changing GETs in Ruby
    // and the recorded C16 hardening keeps them off plain links. The WRITE
    // surface does admit GET /update/<mark> (write-routes.ts matchRoute:927),
    // so which surface answers is the host's choice. Row A17 owns that
    // remainder and this tranche does not move it; A21's own subject - the
    // two-segment mark/view arm and its .:format capture - is unaffected,
    // because the divergent path never reaches this arm in Ruby either.
    const update = parsePath("/update/Front");
    expect(update).toEqual({ name: "update", view: "Front" });
    // And the arm's own subject is untouched by that divergence.
    expect(parsePath("/Front/related")).toEqual({ name: "Front", view: "related" });
  });
});
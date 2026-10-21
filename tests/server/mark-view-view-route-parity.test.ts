// The :mark/view/:view read route, measured against the PINNED DECK's own
// route table and its own mark/view/fetch chain.
//
// The completeness register's A8 row grades the port on
// `get ":mark/view/:view(.:format)" => "card#read"` (engine_routes.rb:24,
// the route whose own comment says it "simplifies API documentation"). This
// file pins both sides:
//
//   fixtures/captured/mark-view-view-route-ruby-oracle.json is what
//   oracle-capture-mark-view-view-route-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned deck's own route table against a recording Draw,
//   the pinned mark/view methods and the pinned card gem's own fetch:
//
//     the route  engine_routes.rb:24, order 9 of 29 - between the type
//                route (8) and the legacy card/:view arm (10), ahead of the
//                generic :mark/:view arm (27)
//     the mark   interpret_mark answers the mark as given
//     the view   the :view segment IS params[:view] (view_from_params)
//     the format the .:format capture rides the VIEW segment: the suffix
//                lands in params[:format], never in the view's name
//     the fetch  the standard read's fetch: <mark>, new: {name: <folded
//                mark>}, skip_modules: true
//
//   The port's three-segment arm now carries the same format split: a
//   .json suffix on the view segment parses as the view plus the json
//   format (THE COMPLETION this row makes - the pre-port arm kept the
//   suffix in the view segment, where it reached the engine as an
//   unsupported view and 422'd even for json-registered views like
//   search_box_complete). The served json-format view dispatch is the
//   engine's own (bunny-edge-engine-request.ts's format === "json" arm),
//   whose unsupported-view 422 is Ruby's answer for a non-json view.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/mark-view-view-route-ruby-oracle.json"), "utf8"),
) as {
  markViewViewRoute: { verb: string; patterns: string[]; requirements: Record<string, string>; action: string; order: number };
  neighbourRoutes: Array<{ patterns: string[]; order: number }>;
  routeTableSize: number;
  registeredFormats: string[];
  routeRequests: Array<{ label: string; params: Record<string, unknown>; markAnswer: string; viewFromParams: string }>;
  uriFetch: { params: Record<string, unknown>; fetchAsks: Array<Record<string, unknown>>; error: string | null };
};

describe("the :mark/view/:view route, against the pinned deck gem", () => {
  it("the pinned deck registers it at order 9, between the type and legacy card/:view arms", () => {
    expect(ORACLE.markViewViewRoute.verb).toBe("get");
    expect(ORACLE.markViewViewRoute.patterns).toEqual([":mark/view/:view(.:format)"]);
    expect(ORACLE.markViewViewRoute.action).toBe("card#read");
    expect(ORACLE.markViewViewRoute.order).toBe(9);
    const orders = ORACLE.neighbourRoutes.map((route) => route.order);
    expect(orders).toEqual([8, 9, 10]);
    expect(ORACLE.routeTableSize).toBe(29);
  });

  it("the pinned mark answers as given and the :view segment IS params[:view]", () => {
    const plain = ORACLE.routeRequests[0]!;
    expect(plain.markAnswer).toBe("Front");
    expect(plain.viewFromParams).toBe("related");
  });

  it("the .:format suffix lands in params[:format], the view segment clean of it", () => {
    const suffixed = ORACLE.routeRequests[1]!;
    expect(suffixed.params.format).toBe("json");
    expect(suffixed.params.view).toBe("related");
    expect(suffixed.viewFromParams).toBe("related");
  });

  it("the pinned fetch is the standard read's: the unfolded mark, the folded new-card name", () => {
    expect(ORACLE.uriFetch.error).toBeNull();
    expect(ORACLE.uriFetch.fetchAsks).toEqual([
      { mark: "My_Card", new: { name: "My Card" }, skipModules: true, lookInTrash: null },
    ]);
  });

  it("json is a registered format in the pinned mod's own registry", () => {
    expect(ORACLE.registeredFormats).toContain("json");
  });
});

describe("the port's three-segment arm, against the pinned route", () => {
  it("/<mark>/view/<view> resolves the card and the view", () => {
    expect(parsePath("/Front/view/related")).toEqual({ name: "Front", view: "related" });
  });

  it("COMPLETION: the .json suffix on the view segment is the format, not the view's name", () => {
    // The pre-port arm kept the suffix in the view segment (unsupported
    // view, 422 even for json-registered views); the pinned route puts the
    // suffix in params[:format]. The split matches L51's arm.
    expect(parsePath("/Front/view/related.json")).toEqual({
      name: "Front",
      view: "related",
      format: "json",
    });
    expect(parsePath("/My_Card/view/search_box_complete.json")).toEqual({
      name: "My Card",
      view: "search_box_complete",
      format: "json",
    });
  });

  it("a middle segment that is not view/ is the wildcard class, not this arm", () => {
    expect(parsePath("/Front/wat/related")).toEqual({ kind: "wildcard" });
  });
});

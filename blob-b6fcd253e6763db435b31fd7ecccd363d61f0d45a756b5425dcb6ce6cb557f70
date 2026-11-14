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

// The PINNED deck's route table, RECOGNIZED by the PINNED actionpack's own
// matcher (fixtures/captured/rails-route-recognition-ruby-oracle.json,
// recorded by tests/server/oracle-capture-rails-route-recognition-ruby.rb).
// The capture above builds the params hash by hand; this one lets the
// pinned matcher build it, which is what settles how a .:format suffix
// splits.
const ROUTE_RECOGNITION = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/rails-route-recognition-ruby-oracle.json"), "utf8"),
) as {
  routeTableSize: number;
  recognitions: Array<{
    verb: string;
    path: string;
    matched: boolean;
    routeOrder: number | null;
    routeSpec: string | null;
    params: Record<string, string> | null;
  }>;
};

function RECOGNITION(pathname: string, verb = "GET") {
  const row = ROUTE_RECOGNITION.recognitions.find(
    (entry) => entry.path === pathname && entry.verb === verb,
  );
  if (row === undefined) throw new Error(`no recognition recorded for ${verb} ${pathname}`);
  return row;
}

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

  it("CLOSED: an .rss suffix on this arm is the format, not the view's name", () => {
    // The pinned route's .:format capture rides the VIEW segment for EVERY
    // format, not only for json. The executed PINNED matcher says so
    // outright (fixtures/captured/rails-route-recognition-ruby-oracle.json,
    // the case "GET /Front/view/open.rss"): the view is "open" and the
    // format is "rss", on the same route (order 9) as the bare read.
    //
    // The port's arm used to split .json and leave every other suffix in
    // the view segment, so an .rss suffix on THIS arm arrived at the
    // engine as a view named "<view>.rss" and answered the engine's
    // unsupported-view 422 where the pinned deck answers through its rss
    // format. The arm now splits the two formats the port serves: json
    // and rss.
    expect(ORACLE.markViewViewRoute.patterns[0]).toBe(":mark/view/:view(.:format)");
    expect(RECOGNITION("/Front/view/open.rss")!.params).toMatchObject({
      mark: "Front",
      view: "open",
      format: "rss",
    });
    expect(RECOGNITION("/Front/view/related.rss")!.params).toMatchObject({
      mark: "Front",
      view: "related",
      format: "rss",
    });
    // The port's side, now the same answer.
    expect(parsePath("/Front/view/open.rss")).toEqual({
      name: "Front",
      view: "open",
      format: "rss",
    });
    expect(parsePath("/Front/view/related.rss")).toEqual({
      name: "Front",
      view: "related",
      format: "rss",
    });
    // The control: the same shape without the suffix is this arm.
    expect(parsePath("/Front/view/related")).toEqual({ name: "Front", view: "related" });
  });

  it("a suffix the port does not serve stays in the view segment", () => {
    // The engine's unsupported-view answer, which is the pinned deck's
    // answer for a view no format declares.
    expect(parsePath("/Front/view/related.yaml")).toEqual({
      name: "Front",
      view: "related.yaml",
    });
  });
});

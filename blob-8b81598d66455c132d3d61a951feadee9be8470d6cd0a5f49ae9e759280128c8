// The new/:type card-creation route, measured against the PINNED DECK's own
// route table, its own view registration and its own mark/fetch chain.
//
// The completeness register's A6 row grades the port on
// `get "new/:type" => "card#read", view: "new"` (engine_routes.rb:22). The
// route's "view: new" is a String-valued non-segment key - a route DEFAULT:
// params[:view] is "new" for every request the arm admits, and the pinned
// machinery reads that value twice (view_from_params; and
// view_does_not_require_name?, which sends the mark ladder to the EMPTY
// mark once the pinned `view :new` registration has seated unknown_ok[:new]).
//
// fixtures/captured/new-type-route-ruby-oracle.json is what
// oracle-capture-new-type-route-ruby.rb (tests/server/) recorded by
// EXECUTING the pinned deck's own route table against a recording Draw, the
// pinned ViewOpts registration (view_opts.rb:49-57 running the pinned
// `view :new` definition's own options, card-mod-edit set/all/new.rb:4),
// the pinned mark ladder and the pinned fetch:
//
//   the route    engine_routes.rb:22, order 7 of 29 - BEFORE the generic
//                :mark/:view arm (order 27), so /new/<anything> never
//                renders the card "new" in view <anything>
//   the view     the route default's "new" IS what view_from_params answers
//   the mark     view_does_not_require_name? true (the pinned registration)
//                -> the mark is "" - the fetched card is a NEW card; the
//                contrast row shows the ladder falling home without the
//                registration
//   the fetch    fetch "", new: {type: <segment>, name: ""} - the
//                new-card fallback of the requested type
//
// The port's grammar (bunny-edge-lineage-worker-surface.ts, the new/:type
// arm) answers the same precedence and the no-format-capture shape; the
// served new-card form on both hosts is the edge's own pin
// (tests/deploy/bunny-edge-engine-request-new-card-route.test.ts).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/new-type-route-ruby-oracle.json"), "utf8"),
) as {
  newTypeRoute: { verb: string; patterns: string[]; requirements: Record<string, string>; action: string; order: number };
  genericViewRoute: { patterns: string[]; order: number };
  routeTableSize: number;
  pinnedNewViewRegistration: { definitionOpts: Record<string, unknown>; unknownOkNew: boolean };
  implicitMark: Array<{ label: string; params: Record<string, unknown>; mark: string; error: string | null }>;
  viewFromParams: string;
  viewDoesNotRequireName: boolean | null;
  uriFetch: { params: Record<string, unknown>; fetchAsks: Array<Record<string, unknown>>; error: string | null };
};

describe("the new/:type route, against the pinned deck gem", () => {
  it("the pinned deck registers it at order 7, before the generic :mark/:view arm", () => {
    expect(ORACLE.newTypeRoute.verb).toBe("get");
    expect(ORACLE.newTypeRoute.patterns).toEqual(["new/:type"]);
    expect(ORACLE.newTypeRoute.action).toBe("card#read");
    expect(ORACLE.newTypeRoute.order).toBe(7);
    expect(ORACLE.genericViewRoute.order).toBe(27);
    expect(ORACLE.routeTableSize).toBe(29);
  });

  it("the route default's view IS params[:view]: the route carries requirements {view: new}", () => {
    expect(ORACLE.newTypeRoute.requirements).toEqual({ view: "new" });
    expect(ORACLE.viewFromParams).toBe("new");
  });

  it("the pinned view :new registration seats unknown_ok[:new] from the definition's own opts", () => {
    expect(ORACLE.pinnedNewViewRegistration.definitionOpts).toEqual({
      perms: "create",
      unknown: true,
      cache: "never",
    });
    expect(ORACLE.pinnedNewViewRegistration.unknownOkNew).toBe(true);
    expect(ORACLE.viewDoesNotRequireName).toBe(true);
  });

  it("the pinned mark ladder: the seated registration empties the mark; without it the ladder falls home", () => {
    expect(ORACLE.implicitMark[0]!.error).toBeNull();
    expect(ORACLE.implicitMark[0]!.mark).toBe("");
    expect(ORACLE.implicitMark[1]!.mark).toBe("Home");
  });

  it("the pinned fetch asks for the EMPTY mark with the type as the new-card fallback", () => {
    expect(ORACLE.uriFetch.error).toBeNull();
    expect(ORACLE.uriFetch.fetchAsks).toEqual([
      { mark: "", new: { type: "Sign_up", name: "" }, skipModules: true, lookInTrash: null },
    ]);
  });
});

describe("the port's new/:type arm, against the pinned route", () => {
  it("/new/<type> classifies as the new-card route, never the card 'new' in a view", () => {
    // The pinned arm's segment rides params[:type] UNFOLDED (the oracle's
    // fetch ask: new {type: "Sign_up"}); the port folds at the parse (the
    // same uri_fetch_opts fold, applied one step earlier - outcome
    // equivalent, the type resolves by its key either way).
    expect(parsePath("/new/Sign_up")).toEqual({ kind: "new", typeName: "Sign up" });
  });

  it("the route carries NO .:format capture: the whole second segment is the :type param", () => {
    expect(parsePath("/new/Sign_up.json")).toEqual({ kind: "new", typeName: "Sign up.json" });
  });

  it("the bare /new stays the standard card arm (order: the generic arm is 27th)", () => {
    const parsed = parsePath("/new");
    expect(parsed).toMatchObject({ name: "new", view: "open" });
  });
});

// The root route, measured against the PINNED DECK's own route table and
// its own read dispatch.
//
// The completeness register's A1 row grades the port on
// `root "card#read"` - GET / renders the home card. The pinned root arm is
// the deck's FIRST registration (the order is the matching precedence), it
// dispatches card#read, and the request rides load_mark + load_card +
// load_action (the read before_action table). This file pins both sides:
//
//   fixtures/captured/root-route-ruby-oracle.json is what
//   oracle-capture-root-route-ruby.rb (tests/server/) recorded by EXECUTING
//   the pinned deck's own route table against a recording Draw and the
//   pinned deck's own fetch (card-1.110.0/lib/card/fetch/card_class.rb:
//   106-121) over recording doubles:
//
//     the route  engine_routes.rb:7  root "card#read" - order 0
//     the mark   mark.rb:10-19  interpret_mark(nil) -> implicit_mark ->
//                home_mark (the ladder's own arms are row B9's evidence:
//                implicit-mark-ruby-oracle.json + home-mark-ruby-oracle.json)
//     the fetch  card_class.rb:116-119  fetch <resolved mark>,
//                new: {name: <mark>}, skip_modules: true
//     the view   rest.rb:10-12  read is show(nil): the ?view=/?v= query
//                (view_from_params, rest.rb:106-109) decides the view
//
//   The port's grammar (deploy/bunny-worker-src/
//   bunny-edge-lineage-worker-surface.ts, the bare-arm branch) answers the
//   same shape: / resolves to the home name with the bare "open" view
//   default, and the ?mark= query names the card. The home MARK's own rule
//   read (the *home rule over the seed) is row C6's evidence
//   (tests/deploy/bunny-edge-home-mark.test.ts), and the ladder's mark
//   answer is row B9's; this file pins the route and the arm's grammar.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/root-route-ruby-oracle.json"), "utf8"),
) as {
  rootRoute: { verb: string; patterns: string[]; requirements: Record<string, string>; action: string; order: number };
  routeTableSize: number;
  standardReadRoutes: Array<{ patterns: string[]; action: string; order: number }>;
  beforeActionsForRead: string[];
  uriFetch: Array<{ label: string; params: Record<string, unknown>; fetchAsks: Array<Record<string, unknown>>; error: string | null }>;
  viewFromParams: Array<{ label: string; params: Record<string, unknown>; viewFromParams: string | null }>;
};

describe("the root route, against the pinned deck gem", () => {
  it("the pinned deck registers the root as card#read, the table's first entry", () => {
    expect(ORACLE.rootRoute.verb).toBe("root");
    expect(ORACLE.rootRoute.patterns).toEqual([]);
    expect(ORACLE.rootRoute.action).toBe("card#read");
    expect(ORACLE.rootRoute.requirements).toEqual({});
    expect(ORACLE.rootRoute.order).toBe(0);
    expect(ORACLE.routeTableSize).toBe(29);
  });

  it("the root arm dispatches the READ chain: setup, authenticate, load_mark, load_card, load_action", () => {
    expect(ORACLE.beforeActionsForRead).toEqual([
      "setup",
      "authenticate",
      "load_mark",
      "load_card",
      "load_action",
    ]);
  });

  it("the pinned fetch asks for the mark load_mark resolved, as a new-card-capable fetch", () => {
    const settled = ORACLE.uriFetch[0]!;
    expect(settled.error).toBeNull();
    expect(settled.fetchAsks).toEqual([
      { mark: "Home", new: { name: "Home" }, skipModules: true, lookInTrash: null },
    ]);
    const queried = ORACLE.uriFetch[1]!;
    expect(queried.error).toBeNull();
    expect(queried.fetchAsks[0]!.mark).toBe("Target");
  });

  it("the pinned read carries no route view: the query decides", () => {
    expect(ORACLE.viewFromParams[0]!.viewFromParams).toBeNull();
    expect(ORACLE.viewFromParams[1]!.viewFromParams).toBe("open");
    expect(ORACLE.viewFromParams[2]!.viewFromParams).toBe("related");
  });

  it("the standard /:mark(.:format) arm sits behind the root, at order 6", () => {
    const arm = ORACLE.standardReadRoutes[0]!;
    expect(arm.patterns).toEqual(["/:mark(.:format)"]);
    expect(arm.action).toBe("card#read");
    expect(arm.order).toBe(6);
  });
});

describe("the port's root arm, against the pinned route", () => {
  it("GET / resolves the home name with the bare view default", () => {
    expect(parsePath("/")).toEqual({ name: "Home", view: "open" });
    expect(parsePath("")).toEqual({ name: "Home", view: "open" });
  });

  it("GET /?mark=<x> names the queried card (Ruby's params[:mark], mark.rb:17-18)", () => {
    expect(parsePath("/", new URLSearchParams("mark=Target"))).toEqual({
      name: "Target",
      view: "open",
    });
    // The underscore fold is uri_fetch_opts' (card_class.rb:132,
    // Name[mark].tr "_", " "): the port's bare arm applies the same fold in
    // the parser, so the queried name arrives folded either way.
    expect(parsePath("/", new URLSearchParams("mark=My_Card"))).toEqual({
      name: "My Card",
      view: "open",
    });
  });

  it("a trailing slash is still the root arm, not a bad address", () => {
    expect(parsePath("/")).toEqual({ name: "Home", view: "open" });
  });
});

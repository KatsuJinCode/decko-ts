// The standard page read, measured against the PINNED DECK's own route
// table, mark method and fetch.
//
// The completeness register's A5 row grades the port on
// `get "/:mark(.:format)" => "card#read"` (engine_routes.rb:19, the line's
// own comment: "/decko is deprecated"). This file pins both sides:
//
//   fixtures/captured/standard-read-route-ruby-oracle.json is what
//   oracle-capture-standard-read-route-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned deck's own route table against a recording Draw,
//   the pinned deck's own mark method (mark.rb:10-26) and the pinned card
//   gem's own fetch (card_class.rb:106-121) over recording doubles:
//
//     the route  engine_routes.rb:19, order 6 of 29 - behind the root and
//                the file/asset arms, before new/:type (order 7)
//     the mark   interpret_mark answers the mark AS GIVEN (explicit_mark,
//                mark.rb:22-26): no folding at the controller
//     the fetch  the UNFOLDED mark reaches the fetch (standard_uri_fetch's
//                `mark = params[:mark] || card_opts[:name]`); the FOLDED
//                name rides only the new-card fallback opts
//                (uri_fetch_opts' Name[mark].tr "_", " ")
//     the format the .:format capture lands in params[:format], never the
//                mark; the registry recorded here is the pinned format
//                mod's own
//
//   The port's grammar (bunny-edge-lineage-worker-surface.ts, the
//   single-segment arm) answers the same shape with the fold applied in the
//   parser: /<mark> resolves the card, the bare "open" view default carries
//   (show(nil), the query decides), and the .json suffix is the format, not
//   part of the name.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/standard-read-route-ruby-oracle.json"), "utf8"),
) as {
  standardRoute: { verb: string; patterns: string[]; requirements: Record<string, string>; action: string; order: number };
  routeTableHead: Array<{ patterns: string[]; order: number }>;
  routeTableSize: number;
  registeredFormats: string[];
  interpretMark: Array<{ label: string; mark: string; answer: string }>;
  uriFetch: Array<{ label: string; params: Record<string, unknown>; fetchAsks: Array<Record<string, unknown>>; error: string | null }>;
  viewFromParams: Array<{ label: string; viewFromParams: string | null }>;
};

describe("the standard page read, against the pinned deck gem", () => {
  it("the pinned deck registers it at order 6, behind the file and asset arms", () => {
    expect(ORACLE.standardRoute.verb).toBe("get");
    expect(ORACLE.standardRoute.patterns).toEqual(["/:mark(.:format)"]);
    expect(ORACLE.standardRoute.action).toBe("card#read");
    expect(ORACLE.standardRoute.requirements).toEqual({});
    expect(ORACLE.standardRoute.order).toBe(6);
    expect(ORACLE.routeTableSize).toBe(29);
    const orders = ORACLE.routeTableHead.map((route) => route.order);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("the pinned mark method answers the mark AS GIVEN, unfolded", () => {
    expect(ORACLE.interpretMark.map((row) => row.answer)).toEqual([
      "My_Card",
      "My Card",
      "*home",
    ]);
  });

  it("the pinned fetch asks for the UNFOLDED mark; the folded name rides the new-card opts", () => {
    const row = ORACLE.uriFetch[0]!;
    expect(row.error).toBeNull();
    expect(row.fetchAsks).toEqual([
      { mark: "My_Card", new: { name: "My Card" }, skipModules: true, lookInTrash: null },
    ]);
  });

  it("the .json suffix lands in params[:format], not the mark", () => {
    const row = ORACLE.uriFetch[2]!;
    expect(row.error).toBeNull();
    expect(row.params.format).toBe("json");
    expect(row.fetchAsks[0]!.mark).toBe("My_Card");
  });

  it("the arm carries no view: the query decides", () => {
    expect(ORACLE.viewFromParams[0]!.viewFromParams).toBeNull();
    expect(ORACLE.viewFromParams[1]!.viewFromParams).toBe("related");
  });

  it("json is a registered format in the pinned mod's own registry", () => {
    expect(ORACLE.registeredFormats).toContain("json");
    expect(ORACLE.registeredFormats).toContain("rss");
  });
});

describe("the port's single-segment arm, against the pinned route", () => {
  it("/<mark> resolves the card with the fold applied and the bare view default", () => {
    expect(parsePath("/My_Card")).toEqual({ name: "My Card", view: "open" });
    expect(parsePath("/Home")).toEqual({ name: "Home", view: "open" });
  });

  it("NAMED DIVERGENCE: the one-segment .json suffix stays in the name", () => {
    // The pinned route splits the suffix into params[:format] (the oracle's
    // third uriFetch row: mark My_Card, format json - the deck renders the
    // card's json-format show, whose view defaults :molecule). The port's
    // one-segment arm holds the suffix in the NAME, the posture the
    // registered-format-negotiation row pinned
    // (registered-format-negotiation-parity.test.ts: "the suffix stays in
    // the name on the one-segment arm for .json too: the port's json
    // handling is the TWO-segment arm"). Completing the split here would
    // move that row's pinned evidence, so the divergence is named, not
    // silently held: Ruby parity for the .:format suffix lives on the
    // two-segment arm (L51, next test) and on the query-view arm below.
    expect(parsePath("/My_Card.json")).toEqual({ name: "My Card.json", view: "open" });
  });

  it("the two-segment arm's .json suffix IS the format (L51's own capture)", () => {
    expect(parsePath("/My_Card/open.json")).toEqual({
      name: "My Card",
      view: "open",
      format: "json",
    });
  });

  it("the .json suffix with a query view reaches the JSON dispatch (the typeahead arm)", () => {
    expect(parsePath("/My_Card.json", new URLSearchParams("view=image_complete"))).toEqual({
      name: "My Card",
      view: "image_complete",
      format: "json",
    });
  });

  it("the query's view rides the request core, not the parse (view_from_params)", () => {
    // The pinned arm carries no view; show(nil) reads params[:view]
    // (rest.rb:106-109). parsePath's "open" is its pinned bare default; the
    // page path re-derives bareness and reads ?view=/?v= through
    // queryViewFromUrl - "the shared view_from_params shape, rest.rb:100-103"
    // (bunny-edge-engine-request.ts:880-885), whose parity its own pin
    // carries ("?view= fills the view-less arm").
    expect(parsePath("/My_Card", new URLSearchParams("view=related"))).toEqual({
      name: "My Card",
      view: "open",
    });
  });
});

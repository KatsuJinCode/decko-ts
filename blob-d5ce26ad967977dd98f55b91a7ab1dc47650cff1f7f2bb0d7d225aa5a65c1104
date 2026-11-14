// The type/:type read route, measured against the PINNED DECK's own route
// table, its own mark method and its own fetch options.
//
// The completeness register's A7 row grades the port on
// `get "type/:type" => "card#read"`. The register's suggested fix ("renders
// the type's Search card") MISREAD the pinned deck, and so did the CF
// shell's own comment: nothing in the pinned gemset reads params[:type]
// except the card's own fetch options. The pinned deck answers the HOME
// CARD's page.
//
// fixtures/captured/type-route-ruby-oracle.json is what
// oracle-capture-type-route-ruby.rb (tests/server/) recorded by EXECUTING
// the PINNED DECK's own route table, the PINNED DECK's own mark method
// (decko-0.20.0/lib/card_controller/mark.rb:28-44) and the PINNED DECK's
// own fetch options (card-1.110.0/lib/card/fetch/card_class.rb:128-133):
//
//   the route  decko-0.20.0/config/engine_routes.rb:23
//                get "type/:type" => "card#read"
//   the mark   mark.rb:28-44  implicit_mark -> home_mark
//                (Card::Rule.global_setting(:home) || "Home")
//   the type   card_class.rb:128-133  opts[:type] ||= params[:type]

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/type-route-ruby-oracle.json"), "utf8"),
) as {
  routeTableSize: number;
  typeRoute: { verb: string; patterns: string[]; requirements: Record<string, string>; action: string; order: number };
  neighbourRoutes: Array<{ patterns: string[]; action: string; order: number }>;
  implicitMark: Array<{ label: string; mark: string }>;
  fetchOptions: Array<{ label: string; opts: Record<string, unknown> }>;
};

const byMarkLabel = new Map(ORACLE.implicitMark.map((row) => [row.label, row]));
const byFetchLabel = new Map(ORACLE.fetchOptions.map((row) => [row.label, row]));

describe("the type/:type read route, against the pinned deck gem", () => {
  it("the pinned deck registers type/:type as a plain read with no view", () => {
    expect(ORACLE.typeRoute.verb).toBe("get");
    expect(ORACLE.typeRoute.patterns).toEqual(["type/:type"]);
    expect(ORACLE.typeRoute.action).toBe("card#read");
    // No view requirement, so the route renders the card's own view.
    expect(ORACLE.typeRoute.requirements).toEqual({});
  });

  it("the pinned deck matches it before the generic :mark/:view arm and the wildcard", () => {
    const orders = new Map(ORACLE.neighbourRoutes.map((route) => [route.patterns[0]!, route.order]));
    // The type route is the deck's ninth route; the generic two-segment arm
    // is its 28th and the wildcard its 29th. That order is why /type/<x>
    // is NOT the card "type" in view "<x>".
    expect(ORACLE.typeRoute.order).toBe(8);
    expect(orders.get("type/:type")).toBe(8);
    expect(orders.get(":mark/:view(.:format)")).toBe(27);
    expect(orders.get("*mark")).toBe(28);
    expect(ORACLE.routeTableSize).toBe(29);
  });

  it("the pinned deck's own mark method answers the home mark for a markless read", () => {
    expect(byMarkLabel.get("no mark, no card hash, no view (the type route's case)")!.mark).toBe("Home");
    // The *home rule wins over the literal "Home".
    expect(byMarkLabel.get("the *home global rule names another card")!.mark).toBe("Target");
    // The two arms that come before home_mark.
    expect(byMarkLabel.get("a card hash names the card")!.mark).toBe("Other");
    expect(byMarkLabel.get("a view that needs no name")!.mark).toBe("");
  });

  it("the pinned deck's own fetch options put the type segment in opts[:type]", () => {
    expect(byFetchLabel.get("the type segment alone")!.opts.type).toBe("Style");
    // The mark becomes the card's name, with the deck's own underscore
    // folding.
    expect(byFetchLabel.get("the type segment with a mark")!.opts.name).toBe("My Card");
  });

  it("the port's grammar classifies /type/<x> as the type route, not a card view", () => {
    expect(parsePath("/type/Style")).toEqual({ kind: "typeHome", typeName: "Style" });
    // The pinned route carries NO .:format capture, so the whole second
    // segment is the :type param.
    expect(parsePath("/type/Style.json")).toEqual({ kind: "typeHome", typeName: "Style.json" });
  });

  it("and the bare /type stays the standard card arm", () => {
    // One segment is the /:mark(.:format) arm: the card named "type".
    const parsed = parsePath("/type");
    expect("kind" in parsed ? parsed.kind : "card-arm").not.toBe("typeHome");
    expect(parsed).toMatchObject({ name: "type", view: "open" });
  });
});

// The legacy card/:view route, measured against the PINNED DECK's own route
// table, its own view constraint and its own view selection.
//
// The completeness register's A9 row grades the port on
// `get "card/:view(/:mark(.:format))" => "card#read", view: /new|edit/`.
// The row's note named the route and its view constraint but never asked the
// pinned deck what the constraint ADMITS or what the route renders, and both
// decide the port's grammar.
//
// fixtures/captured/card-view-route-ruby-oracle.json is what
// oracle-capture-card-view-route-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own route table, the PINNED requirement
// itself, the PINNED DECK's own mark method and the PINNED DECK's own view
// selection:
//
//   the route   decko-0.20.0/config/engine_routes.rb:25
//                 get "card/:view(/:mark(.:format))" => "card#read", view: /new|edit/
//   the mark    decko-0.20.0/lib/card_controller/mark.rb:28-44
//                 implicit_mark -> home_mark (Card::Rule.global_setting(:home) || "Home")
//   the view    decko-0.20.0/lib/card_controller/rest.rb:99-109
//                 render_page -> view ||= view_from_params
//                 view_from_params -> %i[view v].each { |k| return params[k] if params[k].present? }

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/card-view-route-ruby-oracle.json"), "utf8"),
) as {
  routeTableSize: number;
  cardViewRoute: {
    verb: string;
    patterns: string[];
    requirements: Record<string, string>;
    action: string;
    order: number;
  };
  viewRequirement: { source: string; matches: Array<{ segment: string; matches: boolean }> };
  fallthroughRoutes: Array<{ patterns: string[]; order: number }>;
  implicitMark: Array<{ label: string; mark: string }>;
  viewFromParams: Array<{ label: string; viewFromParams: string | null }>;
  renderPage: Array<{
    label: string;
    error: string | null;
    result: string;
    pageCalls: Array<{ view: string; format: string }>;
  }>;
};

const byMatch = new Map(ORACLE.viewRequirement.matches.map((row) => [row.segment, row.matches]));
const byMarkLabel = new Map(ORACLE.implicitMark.map((row) => [row.label, row]));

describe("the legacy card/:view route, against the pinned deck gem", () => {
  it("the pinned deck registers the card/:view route with the /new|edit/ constraint", () => {
    expect(ORACLE.cardViewRoute.verb).toBe("get");
    expect(ORACLE.cardViewRoute.patterns).toEqual(["card/:view(/:mark(.:format))"]);
    expect(ORACLE.cardViewRoute.action).toBe("card#read");
    expect(ORACLE.cardViewRoute.requirements.view).toBe("new|edit");
    // The deck's eleventh route: ahead of the generic two-segment arm and
    // the wildcard, which is where a refused view segment falls through.
    expect(ORACLE.cardViewRoute.order).toBe(10);
    const fallthrough = new Map(ORACLE.fallthroughRoutes.map((route) => [route.patterns[0]!, route.order]));
    expect(fallthrough.get(":mark/:view(.:format)")).toBe(27);
    expect(fallthrough.get("*mark")).toBe(28);
  });

  it("the pinned constraint admits new and edit, and refuses open", () => {
    expect(ORACLE.viewRequirement.source).toBe("new|edit");
    expect(byMatch.get("new")).toBe(true);
    expect(byMatch.get("edit")).toBe(true);
    expect(byMatch.get("open")).toBe(false);
  });

  it("the pinned constraint is UNANCHORED, so it admits more than the two words", () => {
    // The pinned Regexp is /new|edit/ with no anchors, so a segment that
    // CONTAINS "new" or "edit" satisfies it. The port's grammar is
    // stricter (it admits the exact segment "edit"), and the difference is
    // named below rather than taken.
    expect(byMatch.get("editing")).toBe(true);
    expect(byMatch.get("newer")).toBe(true);
  });

  it("the pinned mark method answers the home mark for the markless shape", () => {
    expect(byMarkLabel.get("the markless /card/edit case")!.mark).toBe("Home");
    expect(
      byMarkLabel.get("the markless /card/edit case, the *home rule names another card")!.mark,
    ).toBe("Target");
  });

  it("the pinned view selection renders the captured :view segment", () => {
    expect(
      ORACLE.viewFromParams.find((row) => row.label === "the captured :view segment")!.viewFromParams,
    ).toBe("edit");
    expect(ORACLE.viewFromParams.find((row) => row.label === "the v alias")!.viewFromParams).toBe("edit");
    expect(ORACLE.viewFromParams.find((row) => row.label === "no view at all")!.viewFromParams).toBeNull();
    // The read calls render_page with NO view, so the view comes from
    // params[:view] - the captured segment.
    const edit = ORACLE.renderPage.find((row) => row.label.includes("edit arm"))!;
    expect(edit.error).toBeNull();
    expect(edit.pageCalls[0]!.view).toBe('"edit"');
  });

  it("the port's grammar answers /card/edit/<mark> as that card's edit view", () => {
    expect(parsePath("/card/edit/Front")).toMatchObject({ name: "Front", view: "edit" });
  });

  it("NAMED DIVERGENCE: the markless /card/edit shape and the unanchored constraint", () => {
    // 1. The markless shape. In the pinned deck the route's :mark is
    //    OPTIONAL, so /card/edit has no mark and implicit_mark lands on the
    //    home mark: the HOME card's edit view. The port's two-segment arm
    //    answers the card named "card" in view "edit".
    // 2. The constraint. The pinned /new|edit/ admits "editing" and
    //    "newer" too; the port admits the exact segment "edit" (and
    //    handles "new" on its own new-card arm).
    //
    //    Both are named, not closed: the markless shape needs the async
    //    home resolution the request core's bare arm owns, and widening
    //    the constraint would collide with the new-card arm.
    const markless = parsePath("/card/edit");
    expect(markless).toMatchObject({ name: "card", view: "edit" });
    expect(byMarkLabel.get("the markless /card/edit case")!.mark).toBe("Home");
  });
});

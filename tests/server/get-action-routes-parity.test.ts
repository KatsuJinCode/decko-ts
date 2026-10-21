// The GET action routes, measured against the PINNED DECK's own route table,
// its own action methods and its own before_action table.
//
// The completeness register's A17 row grades the port on the five GET action
// alternatives (engine_routes.rb:41-43). The row's note did not say what
// those routes ANSWER, and the answer is not one thing: three of them are
// state-changing GETs (a plain link click saves or deletes a card) and two
// are reads.
//
// fixtures/captured/get-action-routes-ruby-oracle.json is what
// oracle-capture-get-action-routes-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own route table, the PINNED DECK's own action
// methods and the PINNED DECK's own before_action table:
//
//   the routes  decko-0.20.0/config/engine_routes.rb:40-43
//                 %w[create read update delete asset].each do |action|
//                   get "(card)/#{action}(/:mark(.:format))" => "card", action: action
//                 end
//   the actions decko-0.20.0/lib/card_controller/rest.rb:6-27
//                 read -> show, create -> card.save!, update -> new_card? ?
//                 create : card.update!, delete -> card.delete!,
//                 asset -> the fixed installation-error 404
//   the table   decko-0.20.0/lib/card_controller.rb:20-25

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/get-action-routes-ruby-oracle.json"), "utf8"),
) as {
  routeTableSize: number;
  actionRoutes: Array<{
    verb: string;
    patterns: string[];
    requirements: Record<string, string>;
    action: string;
    order: number;
  }>;
  laterRoutes: Array<{ patterns: string[]; order: number }>;
  actionsByAction: Array<{ action: string; beforeActions: string[] }>;
  actionMethods: Array<{
    label: string;
    action: string;
    error: string | null;
    cardCalls: string[];
    cardAction: string | null;
    formatName: string | null;
    pageCalls: Array<{ view: string; format: string }>;
    rendered: { body: string; status: number } | null;
    redirected: { url: string; status: number } | null;
  }>;
};

const byMethodLabel = new Map(ORACLE.actionMethods.map((row) => [row.label, row]));
const byAction = new Map(ORACLE.actionsByAction.map((row) => [row.action, row.beforeActions]));

describe("the GET action routes, against the pinned deck gem", () => {
  it("the pinned deck registers five GET action routes, in its own order", () => {
    expect(ORACLE.actionRoutes.map((route) => route.requirements.action)).toEqual([
      "create",
      "read",
      "update",
      "delete",
      "asset",
    ]);
    for (const route of ORACLE.actionRoutes) {
      expect(route.verb).toBe("get");
      expect(route.action).toBe("card");
    }
    // The deck's twentieth through twenty-fourth routes: ABOVE the generic
    // two-segment arm (28th) and the wildcard (29th), which is why /read/<x>
    // is card#read OF <x> and not the card "read" in view "<x>".
    expect(ORACLE.actionRoutes.map((route) => route.order)).toEqual([19, 20, 21, 22, 23]);
    const later = new Map(ORACLE.laterRoutes.map((route) => [route.patterns[0]!, route.order]));
    expect(later.get(":mark/:view(.:format)")).toBe(27);
    expect(later.get("*mark")).toBe(28);
  });

  it("the pinned deck's read action renders the card's page with NO view default", () => {
    const read = byMethodLabel.get("the read action")!;
    expect(read.error).toBeNull();
    expect(read.cardAction).toBe("read");
    expect(read.formatName).toBe("html");
    // The view is nil: the read calls show(nil), so the view comes from the
    // query (?view=/?v=), not from a default.
    expect(read.pageCalls[0]!.view).toBe("nil");
    expect(read.rendered!.status).toBe(200);
  });

  it("the pinned deck's create, update and delete actions are STATE-CHANGING GETs", () => {
    const create = byMethodLabel.get("the create action")!;
    expect(create.cardCalls).toContain("save!");
    expect(create.redirected!.status).toBe(303);

    const update = byMethodLabel.get("the update action on an existing card")!;
    expect(update.cardCalls).toEqual(["new_card?", "update!"]);

    // An update of a MISSING card is a create (rest.rb:15).
    const missing = byMethodLabel.get("the update action on a missing card")!;
    expect(missing.cardCalls).toEqual(["new_card?", "save!"]);

    const del = byMethodLabel.get("the delete action")!;
    expect(del.cardCalls).toContain("delete!");
    expect(del.redirected!.status).toBe(303);
  });

  it("the pinned deck's asset action is the fixed installation-error 404", () => {
    const asset = byMethodLabel.get("the asset action")!;
    expect(asset.error).toBeNull();
    expect(asset.rendered).toEqual({
      body: "Decko installation error: missing public directory symlinks",
      status: 404,
    });
  });

  it("the pinned before_action table splits the actions", () => {
    // The read action resolves the mark and the action; the write actions
    // refresh the card; the asset action runs none of them.
    expect(byAction.get("read")).toEqual([
      "setup",
      "authenticate",
      "load_mark",
      "load_card",
      "load_action",
    ]);
    expect(byAction.get("create")).toEqual(["setup", "authenticate", "load_card", "refresh_card"]);
    expect(byAction.get("update")).toEqual(["setup", "authenticate", "load_card", "refresh_card"]);
    expect(byAction.get("delete")).toEqual(["setup", "authenticate", "load_card", "refresh_card"]);
    expect(byAction.get("asset")).toEqual([]);
  });

  it("the port's grammar answers the read and asset spellings", () => {
    expect(parsePath("/read/Front")).toMatchObject({ kind: "actionRead", rawMark: "Front" });
    expect(parsePath("/read")).toMatchObject({ kind: "actionRead" });
    expect(parsePath("/card/read/Front")).toMatchObject({ kind: "actionRead", rawMark: "Front" });
    expect(parsePath("/card/read")).toMatchObject({ kind: "actionRead" });
    expect(parsePath("/asset")).toEqual({ kind: "assetStub" });
    expect(parsePath("/card/asset")).toEqual({ kind: "assetStub" });
  });

  it("NAMED DIVERGENCE: the port does not admit the create and delete GET spellings", () => {
    // The pinned deck's create and delete GET alternatives SAVE and DELETE
    // a card on a plain link click (measured above). The port keeps them
    // off the plain-link surface: its recorded hardening (the C16 posture,
    // same-origin-XHR-only GET mutations) is a deliberate divergence, so
    // /create/<x> and /delete/<x> fall through to the generic two-segment
    // arm and are read as a card named "create" in view "<x>".
    //
    // This is named, not closed: admitting them would remove the port's
    // recorded hardening, and the register's own suggested fix (admit the
    // plain-link GET verbs behind the write-path gate) is a hardening
    // change, not a port.
    const create = parsePath("/create/New");
    expect("kind" in create ? create.kind : "card-arm").not.toBe("actionRead");
    expect(create).toMatchObject({ name: "create", view: "New" });
    const del = parsePath("/delete/Front");
    expect(del).toMatchObject({ name: "delete", view: "Front" });
  });
});

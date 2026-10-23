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

// The PINNED deck's route table, RECOGNIZED by the PINNED actionpack's own
// matcher (fixtures/captured/rails-route-recognition-ruby-oracle.json,
// recorded by tests/server/oracle-capture-rails-route-recognition-ruby.rb).
// The capture above stands the pinned ACTION methods up over recording
// doubles; this one lets the pinned MATCHER decide which route answers a
// path, which is what settles the precedence between the action arm and
// the earlier :mark(.:format) arm.
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
    expect(parsePath("/card/read/Front")).toMatchObject({ kind: "actionRead", rawMark: "Front" });
    expect(parsePath("/card/read")).toMatchObject({ kind: "actionRead" });
    expect(parsePath("/asset/Front")).toEqual({ kind: "assetStub" });
    expect(parsePath("/card/asset")).toEqual({ kind: "assetStub" });
  });

  it("CLOSED: the MARKLESS one-segment spellings are the card, not the action", () => {
    // The action arm (engine_routes.rb:41-43) sits at table order 20, but
    // the :mark(.:format) arm sits at order 6 and comes FIRST. So the
    // one-segment "/read" and "/asset" are the cards named "read" and
    // "asset". The executed PINNED matcher says so
    // (fixtures/captured/rails-route-recognition-ruby-oracle.json):
    // "GET /read" answers the card "read" on route 6, and only
    // "GET /read/Front" reaches the action arm.
    expect(RECOGNITION("/read")!.routeOrder).toBe(6);
    expect(RECOGNITION("/read")!.params).toMatchObject({ mark: "read" });
    expect(RECOGNITION("/asset")!.routeOrder).toBe(6);
    expect(RECOGNITION("/asset")!.params).toMatchObject({ mark: "asset" });
    // And the spellings that DO reach the action arm:
    expect(RECOGNITION("/read/Front")!.routeOrder).toBe(20);
    expect(RECOGNITION("/card/read")!.routeOrder).toBe(20);
    expect(RECOGNITION("/card/asset")!.routeOrder).toBe(23);

    // The port's side: the markless spellings fall to the ordinary
    // one-segment arm, which reads the card of that name.
    expect(parsePath("/read")).toEqual({ name: "read", view: "open" });
    expect(parsePath("/asset")).toEqual({ name: "asset", view: "open" });
  });

  it("NAMED DIVERGENCE: the port does not admit the create and delete GET spellings", () => {
    // The pinned deck's create and delete GET alternatives SAVE and DELETE
    // a card on a plain link click (measured above, and by the executed
    // matcher: "GET /create/New" answers the create ACTION on route 19 and
    // "GET /delete/Front" the delete action on route 22). The port keeps
    // them off the plain-link surface: its recorded hardening (the C16
    // posture, same-origin-XHR-only GET mutations) is a deliberate
    // divergence, so /create/<x> and /delete/<x> fall through to the
    // generic two-segment arm and are read as a card named "create" in
    // view "<x>".
    //
    // This is named, not closed: admitting them would remove the port's
    // recorded hardening, and the register's own suggested fix (admit the
    // plain-link GET verbs behind the write-path gate) is a hardening
    // change, not a port.
    expect(RECOGNITION("/create/New")!.params).toMatchObject({ action: "create", mark: "New" });
    expect(RECOGNITION("/delete/Front")!.params).toMatchObject({ action: "delete", mark: "Front" });
    const create = parsePath("/create/New");
    expect("kind" in create ? create.kind : "card-arm").not.toBe("actionRead");
    expect(create).toMatchObject({ name: "create", view: "New" });
    const del = parsePath("/delete/Front");
    expect(del).toMatchObject({ name: "delete", view: "Front" });
  });

  it("CLOSED: the marked asset spellings are the asset action, and the bare prefix is the card", () => {
    // The executed PINNED matcher (round five's eleven new cases):
    // GET /asset/Front and GET /card/asset/Front answer the ASSET action
    // on order 23 with mark Front - the two-segment and three-segment
    // marked spellings reach the action arm, the arm the one-segment
    // "/asset" cannot reach (route 6 answers the card "asset" there). The
    // port's asset arm admits exactly the same set.
    expect(RECOGNITION("/asset/Front")!.routeOrder).toBe(23);
    expect(RECOGNITION("/asset/Front")!.params).toMatchObject({ action: "asset", mark: "Front" });
    expect(RECOGNITION("/card/asset/Front")!.routeOrder).toBe(23);
    expect(RECOGNITION("/card/asset/Front")!.params).toMatchObject({ action: "asset", mark: "Front" });
    expect(parsePath("/asset/Front")).toEqual({ kind: "assetStub" });
    expect(parsePath("/card/asset/Front")).toEqual({ kind: "assetStub" });
    // And the bare deprecated prefix is NOT the asset action: the glob
    // needs a segment after the prefix, so "/assets" is the card named
    // "assets" on order 6 - the port's own grammar comment's claim, now in
    // the executed matcher's words.
    expect(RECOGNITION("/assets")!.routeOrder).toBe(6);
    expect(RECOGNITION("/assets")!.params).toMatchObject({ mark: "assets" });
    expect(parsePath("/assets")).toEqual({ name: "assets", view: "open" });
  });

  it("CLOSED: the .:format suffix rides the action arm's MARK segment", () => {
    // The action arm's own pattern is "(card)/#{action}(/:mark(.:format))",
    // so the suffix splits off the MARK, the same ride the view arms take:
    // the executed matcher answers GET /read/Front.json and
    // GET /card/read/Front.json with mark "Front" and format "json" on
    // order 20, and GET /card/asset/Front.json with mark "Front" and
    // format "json" on order 23. The port's read arm rewrites to the bare
    // arm with the segment verbatim ("/Front.json"), whose own format
    // split lands the same place; the asset arm answers the stub whatever
    // the suffix (the pinned asset action reads no format).
    expect(RECOGNITION("/read/Front.json")!.routeOrder).toBe(20);
    expect(RECOGNITION("/read/Front.json")!.params).toMatchObject({ mark: "Front", format: "json" });
    expect(RECOGNITION("/card/read/Front.json")!.routeOrder).toBe(20);
    expect(RECOGNITION("/card/read/Front.json")!.params).toMatchObject({ mark: "Front", format: "json" });
    expect(RECOGNITION("/card/asset/Front.json")!.routeOrder).toBe(23);
    expect(RECOGNITION("/card/asset/Front.json")!.params).toMatchObject({ mark: "Front", format: "json" });
    expect(parsePath("/read/Front.json")).toEqual({ kind: "actionRead", rawMark: "Front.json" });
    expect(parsePath("/card/read/Front.json")).toEqual({ kind: "actionRead", rawMark: "Front.json" });
    expect(parsePath("/card/asset/Front.json")).toEqual({ kind: "assetStub" });
  });

  it("NAMED DIVERGENCE, whole shape set: the marked create, delete and update GET spellings are the ACTION in the pinned deck", () => {
    // Round five's instrument cases put the WHOLE create/delete/update
    // shape set in the matcher's own words: every marked spelling reaches
    // the state-changing action. GET /card/create answers the create
    // action with NO mark (order 19), GET /card/create/Front with mark
    // Front, GET /card/delete the delete action (order 22),
    // GET /card/delete/Front with mark Front, GET /card/update/X the
    // update action with mark X (order 21). The port admits none of them:
    // the two-segment spellings are read as the card "card" in the view
    // named by the second segment (an unknown card, 404 at render), and
    // the three-segment spellings fall to the wildcard's bad_address
    // class. The recorded hardening (the C16 posture) is why; same named
    // cell as the one-segment spellings above, now for the whole set.
    expect(RECOGNITION("/card/create")!.routeOrder).toBe(19);
    expect(RECOGNITION("/card/create")!.params).toMatchObject({ action: "create" });
    expect(RECOGNITION("/card/create/Front")!.routeOrder).toBe(19);
    expect(RECOGNITION("/card/create/Front")!.params).toMatchObject({ action: "create", mark: "Front" });
    expect(RECOGNITION("/card/delete")!.routeOrder).toBe(22);
    expect(RECOGNITION("/card/delete")!.params).toMatchObject({ action: "delete" });
    expect(RECOGNITION("/card/delete/Front")!.routeOrder).toBe(22);
    expect(RECOGNITION("/card/delete/Front")!.params).toMatchObject({ action: "delete", mark: "Front" });
    expect(RECOGNITION("/card/update/X")!.routeOrder).toBe(21);
    expect(RECOGNITION("/card/update/X")!.params).toMatchObject({ action: "update", mark: "X" });
    expect(parsePath("/card/create")).toMatchObject({ name: "card", view: "create" });
    expect(parsePath("/card/delete")).toMatchObject({ name: "card", view: "delete" });
    expect(parsePath("/card/create/Front")).toEqual({ kind: "wildcard" });
    expect(parsePath("/card/delete/Front")).toEqual({ kind: "wildcard" });
    expect(parsePath("/card/update/X")).toEqual({ kind: "wildcard" });
  });
});

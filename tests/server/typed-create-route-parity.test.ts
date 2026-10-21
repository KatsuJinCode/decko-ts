// The typed create route, measured against the PINNED DECK's own route
// table and fetch branch.
//
// The completeness register's A13 row grades the port on
// `post "/type/:type" => "card#create"` (engine_routes.rb:33). This file
// pins both sides:
//
//   fixtures/captured/typed-create-route-ruby-oracle.json is what
//   oracle-capture-typed-create-route-ruby.rb (tests/server/) recorded by
//   EXECUTING the pinned deck's own route table against a recording Draw,
//   the pinned controller's before_action table and the pinned card gem's
//   own uri_fetch with the Card.new ask recorded:
//
//     the route  engine_routes.rb:33, order 15 of 29, BEFORE the marked
//                create (line 36, order 16) - POST /type/<x> is the typed
//                create, never a create of the card "type" at mark <x>
//     the type   uri_fetch_opts' ||= : the body's card[type] WINS, the URL
//                segment is the fallback, the name rides the body or the
//                EMPTY name (the A10 branch)
//     the format the route declares NO .:format capture: a suffixed
//                segment stays IN the type ("Foo.json" is a type literally
//                named that)
//
//   The port's route table (src/server/write-routes.ts matchRoute) answers
//   the same shape - THE COMPLETION this row makes: the typed branch now
//   carries the decoded segment verbatim (no .json strip, no fold - the
//   pre-port branch ran it through markToName, whose .json strip belongs to
//   the :mark(.:format) routes; Ruby's params[:type] is unfolded and the
//   type resolves by name key downstream). The live-HTTP create behavior
//   stays the write-routes suites' own pin.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchRoute } from "../../src/server/write-routes.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/typed-create-route-ruby-oracle.json"), "utf8"),
) as {
  typedCreateRoute: { verb: string; patterns: string[]; requirements: Record<string, string>; action: string; order: number };
  markedCreateRoute: { verb: string; patterns: string[]; requirements: Record<string, string>; action: string; order: number };
  beforeActionsForCreate: string[];
  uriFetch: Array<{ label: string; params: Record<string, unknown>; newAsks: Array<Record<string, unknown>>; error: string | null }>;
};

describe("the typed create route, against the pinned deck gem", () => {
  it("the pinned deck registers POST /type/:type at order 15, before the marked create", () => {
    expect(ORACLE.typedCreateRoute.verb).toBe("post");
    expect(ORACLE.typedCreateRoute.patterns).toEqual(["/type/:type"]);
    expect(ORACLE.typedCreateRoute.action).toBe("card#create");
    expect(ORACLE.typedCreateRoute.order).toBe(15);
    expect(ORACLE.markedCreateRoute.order).toBe(16);
    expect(ORACLE.markedCreateRoute.requirements).toEqual({ via: "post" });
  });

  it("create rides NO load_mark: setup, authenticate, load_card, refresh_card", () => {
    expect(ORACLE.beforeActionsForCreate).toEqual([
      "setup",
      "authenticate",
      "load_card",
      "refresh_card",
    ]);
  });

  it("the type rides uri_fetch_opts' ||= : the body's card[type] wins, the segment is the fallback", () => {
    const segment = ORACLE.uriFetch[0]!;
    expect(segment.error).toBeNull();
    expect(segment.newAsks).toEqual([{ type: "Foo", name: "" }]);
    const bodyWins = ORACLE.uriFetch[1]!;
    expect(bodyWins.error).toBeNull();
    expect(bodyWins.newAsks).toEqual([{ type: "Bar", name: "Target" }]);
  });

  it("the route declares no .:format capture: a suffixed segment stays IN the type", () => {
    expect(ORACLE.typedCreateRoute.patterns).toEqual(["/type/:type"]);
    const suffixed = ORACLE.uriFetch[2]!;
    expect(suffixed.error).toBeNull();
    expect(suffixed.newAsks).toEqual([{ type: "Foo.json", name: "" }]);
  });
});

describe("the port's route table, against the pinned typed create", () => {
  it("POST /type/<x> classifies as the typed create, before the marked create", () => {
    expect(matchRoute("POST", "/type/Foo")).toEqual({
      verb: "create",
      typeShortcut: "Foo",
      json: false,
    });
    // Precedence: the BARE /type is the marked create of the card literally
    // named "type" (Ruby's L36 match :mark via post - the typed route needs
    // two segments), never a typed create.
    expect(matchRoute("POST", "/type")).toEqual({ verb: "create", mark: "type", json: false });
  });

  it("COMPLETION: the segment rides verbatim - a suffix stays IN the type", () => {
    // The pre-port branch ran the segment through markToName, stripping a
    // .json suffix the pinned route never declares a capture for.
    expect(matchRoute("POST", "/type/Foo.json")).toEqual({
      verb: "create",
      typeShortcut: "Foo.json",
      json: false,
    });
  });

  it("the underscore fold is the name-resolution layer's: the segment is unfolded", () => {
    // Ruby's params[:type] is unfolded (the oracle's ask carries
    // "Sign_up"-shaped segments verbatim); the type resolves by name key.
    expect(matchRoute("POST", "/type/Sign_up")).toEqual({
      verb: "create",
      typeShortcut: "Sign_up",
      json: false,
    });
  });
});

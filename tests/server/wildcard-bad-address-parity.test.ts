// The WILDCARD route, measured against the PINNED DECK's own route table
// and its own view machinery.
//
// The completeness register's A22 row grades the port on
// `get *mark => "card#read", view: "bad_address"`, the deck's LAST route
// and the class that answers every address the table's earlier arms did
// not. The row's note named the route but never asked the pinned deck what
// the wildcard's view does, and the answer is three different things
// depending on the card.
//
// fixtures/captured/wildcard-bad-address-ruby-oracle.json is what
// oracle-capture-wildcard-bad-address-ruby.rb (tests/server/) recorded by
// EXECUTING the PINNED DECK's own route table and the PINNED card gem's own
// unknown-card view replacement, and by READING the PINNED MOD's own
// bad_address view body (the set DSL that registers it needs the whole card
// gem, so the capture quotes the view's own lines and says so):
//
//   the route  decko-0.20.0/config/engine_routes.rb:53-54
//                get "*mark" => "card#read", view: "bad_address"
//   the view   card-mod-format-0.20.0/set/all/error.rb:23-26
//                root.error_status = 404
//                t(:format_bad_address)
//   the unknown card's replacement
//              card-1.110.0/lib/card/format/error.rb:18-25
//                view_for_unknown -> root.error_status = 404 and
//                page_view_for_unknown (:not_found)

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/wildcard-bad-address-ruby-oracle.json"), "utf8"),
) as {
  routeTableSize: number;
  wildcardRoute: {
    verb: string;
    patterns: string[];
    requirements: Record<string, string>;
    action: string;
    order: number;
  };
  routesBeforeWildcard: Array<{ patterns: string[]; order: number }>;
  badAddressViewSource: Array<{ line: number; text: string }>;
  badAddressErrorSource: Array<{ line: number; text: string }>;
  unknownCardViews: Array<{ label: string; error: string | null; view: string | null; rootErrorStatus: number | null }>;
};

const byViewLabel = new Map(ORACLE.unknownCardViews.map((row) => [row.label, row]));

describe("the wildcard route, against the pinned deck gem", () => {
  it("the pinned deck registers the wildcard as its LAST route", () => {
    expect(ORACLE.wildcardRoute.verb).toBe("get");
    expect(ORACLE.wildcardRoute.patterns).toEqual(["*mark"]);
    expect(ORACLE.wildcardRoute.action).toBe("card#read");
    expect(ORACLE.wildcardRoute.requirements.view).toBe("bad_address");
    // The deck's twenty-ninth route, right after the generic two-segment
    // arm: it answers every address the earlier arms did not.
    expect(ORACLE.wildcardRoute.order).toBe(28);
    expect(ORACLE.routeTableSize).toBe(29);
    const before = new Map(ORACLE.routesBeforeWildcard.map((route) => [route.patterns[0]!, route.order]));
    expect(before.get(":mark/:view(.:format)")).toBe(27);
  });

  it("the pinned bad_address view sets the 404 on the page root", () => {
    const statusLine = ORACLE.badAddressViewSource.find((row) => row.text.includes("error_status"));
    expect(statusLine).toBeDefined();
    expect(statusLine!.text).toContain("root.error_status = 404");
    // The deck's own BadAddress error class carries the same status and view.
    const errorView = ORACLE.badAddressErrorSource.find((row) => row.text.includes("self.view"));
    expect(errorView).toBeDefined();
    expect(errorView!.text).toContain("self.view = :bad_address");
  });

  it("a KNOWN card keeps the bad_address view; an UNKNOWN card's view is replaced", () => {
    const known = byViewLabel.get("a KNOWN card keeps the bad_address view")!;
    expect(known.error).toBeNull();
    expect(known.view).toBe("bad_address");

    const unknown = byViewLabel.get("an UNKNOWN card's view is replaced")!;
    expect(unknown.error).toBeNull();
    expect(unknown.view).toBe("not_found");
    expect(unknown.rootErrorStatus).toBe(404);
  });

  it("the port's grammar answers the unmatched addresses with the wildcard", () => {
    expect(parsePath("/no/such/path")).toEqual({ kind: "wildcard" });
    expect(parsePath("/a/b/c/d")).toEqual({ kind: "wildcard" });
    expect(parsePath("/card/delete/Front")).toEqual({ kind: "wildcard" });
  });

  it("and a malformed % stays the router's no-route class", () => {
    // A bad request is not a bad address: the hardened decode keeps the
    // malformed path out of the wildcard class.
    const parsed = parsePath("/bad%zz");
    expect("kind" in parsed ? parsed.kind : "card-arm").toBe("notFound");
  });
});

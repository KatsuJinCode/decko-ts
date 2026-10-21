// The DEPRECATED old-file route, measured against the PINNED DECK's own
// route table and its own segment requirements.
//
// The completeness register's A3 row grades the port on
// `get "#{files}/:mark(-:size)-:rev_id.:format"` (engine_routes.rb:13).
// The pinned route packs mark(-:size)-:rev_id into ONE segment, with the
// mark and rev_id constrained dash-free (file_matchers, engine_routes.rb:5)
// and the size unconstrained. Rails anchors each segment requirement, so a
// legacy URL's segment splits at the FIRST dash after the mark and the
// LAST dash before the format - exactly the split the port's parser
// implements (src/server/file-routes.ts parseFileRouteSegments, the
// one-segment arm).
//
// fixtures/captured/deprecated-file-route-ruby-oracle.json is what
// oracle-capture-deprecated-file-route-ruby.rb (tests/server/) recorded by
// EXECUTING the pinned deck's own route table against a recording Draw and
// asking the pinned Regexp requirements themselves (anchored, the way
// Rails applies them):
//
//   the route     engine_routes.rb:13, order 2 of 29 - BEFORE the standard
//                 page read (order 6), so a /files/... path is a file
//                 request, never the card "files"
//   the web path  the PINNED carrierwave mod's own files_web_path
//                 (card-mod-carrierwave-0.20.0/lib/card/mod/carrierwave.rb:2)
//   the dispatch  shared with the current route via explicit_file - row
//                 A2's evidence (explicit-file-route-ruby-oracle.json,
//                 "dispatch" rows); the serving parity - the deprecated
//                 shape answering the same stored bytes - is pinned by
//                 tests/server/file-routes.test.ts ("deprecated legacy
//                 route /files/:mark-:action.:format serves the same
//                 bytes"), re-run green on this branch.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseFileRouteSegments } from "../../src/server/file-routes.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/deprecated-file-route-ruby-oracle.json"), "utf8"),
) as {
  filesWebPath: string;
  deprecatedRoute: { verb: string; patterns: string[]; requirements: Record<string, string>; action: string; order: number };
  currentRoute: { patterns: string[]; order: number };
  standardPageRoute: { patterns: string[]; order: number };
  routeTableSize: number;
  requirements: {
    mark: { source: string; matches: Array<{ segment: string; matches: boolean }> };
    revId: { source: string; matches: Array<{ segment: string; matches: boolean }> };
    explicitFile: boolean;
  };
};

const bySegment = (rows: Array<{ segment: string; matches: boolean }>) =>
  new Map(rows.map((row) => [row.segment, row.matches]));

describe("the deprecated old-file route, against the pinned deck gem", () => {
  it("the pinned deck registers it at order 2, before the standard page read", () => {
    expect(ORACLE.deprecatedRoute.verb).toBe("get");
    expect(ORACLE.deprecatedRoute.patterns).toEqual(["/:mark(-:size)-:rev_id.:format"]);
    expect(ORACLE.deprecatedRoute.action).toBe("card#read");
    expect(ORACLE.deprecatedRoute.order).toBe(2);
    expect(ORACLE.standardPageRoute.order).toBe(6);
    expect(ORACLE.routeTableSize).toBe(29);
  });

  it("the two file shapes differ in SEGMENT ORDER, not in requirements", () => {
    // current:  :mark/:rev_id(-:size).:format  - the rev in its own segment
    // deprecated: :mark(-:size)-:rev_id.:format - one packed segment
    expect(ORACLE.currentRoute.order).toBe(1);
    expect(ORACLE.deprecatedRoute.requirements).toEqual(ORACLE.currentRoute.requirements);
  });

  it("the pinned requirements admit no dash in the mark or the rev_id", () => {
    expect(ORACLE.requirements.mark.source).toBe("[^-]+");
    expect(ORACLE.requirements.revId.source).toBe("[^-]+");
    expect(bySegment(ORACLE.requirements.mark.matches).get("card")).toBe(true);
    expect(bySegment(ORACLE.requirements.mark.matches).get("my-card")).toBe(false);
    expect(bySegment(ORACLE.requirements.revId.matches).get("99")).toBe(true);
    expect(bySegment(ORACLE.requirements.revId.matches).get("9-9")).toBe(false);
    expect(ORACLE.requirements.explicitFile).toBe(true);
  });

  it("the pinned web path is the carrierwave mod's own value", () => {
    expect(ORACLE.filesWebPath).toBe("files");
  });
});

describe("the port's one-segment parse, against the pinned route shape", () => {
  it("the plain legacy spelling: mark-rev.format", () => {
    expect(parseFileRouteSegments(["card-99.png"])).toEqual({
      mark: "card",
      revId: "99",
      format: "png",
    });
  });

  it("the variant spelling: mark-size-rev.format, the size between the dashes", () => {
    expect(parseFileRouteSegments(["card-medium-99.png"])).toEqual({
      mark: "card",
      size: "medium",
      revId: "99",
      format: "png",
    });
  });

  it("a dash-bearing path splits at the constraints' dash-free tails", () => {
    // The mark admits no dash and the rev_id admits no dash, so a path of
    // dash-separated parts puts the mark up to the FIRST dash and the rev
    // after the LAST one, everything between riding the unconstrained size.
    expect(parseFileRouteSegments(["my-card-5-99.png"])).toEqual({
      mark: "my",
      size: "card-5",
      revId: "99",
      format: "png",
    });
  });

  it("a segment with no revision dash is not the deprecated file route", () => {
    // "/files/card.png" has no rev_id, so the route does not admit it: the
    // request stays on the other arms (undefined = not a file request).
    expect(parseFileRouteSegments(["card.png"])).toBeUndefined();
    expect(parseFileRouteSegments(["card"])).toBeUndefined();
  });

  it("the current route's two-segment shape puts the rev BEFORE the size", () => {
    // The segment-order contrast the two pinned registrations carry:
    // current :mark/:rev_id(-:size) vs deprecated :mark(-:size)-:rev_id.
    expect(parseFileRouteSegments(["card", "99-medium.png"])).toEqual({
      mark: "card",
      revId: "99",
      size: "medium",
      format: "png",
    });
  });
});

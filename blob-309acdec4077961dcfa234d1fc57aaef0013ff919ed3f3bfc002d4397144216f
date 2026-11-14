// The deck app template's conditional Jasmine engine mount (row A23),
// measured against the PINNED card gem's own generator template and the
// PINNED gemset itself.
//
// The register's A23 row grades the port on the Deck app template's
// conditional `mount JasmineRails::Engine => "#{rel_root}/specs"`: a
// non-production-only mount, taken only when the JasmineRails constant is
// defined. The register's own basis for the row is that it is a
// skip-and-name, and this file MEASURES that basis instead of restating
// it.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   THE MOUNT CAN NEVER FIRE IN THE PINNED DECK. The template's mount
//   sits behind two conjuncts, and one of them is a constant that no
//   installed gem defines: the scan of the WHOLE pinned gemset finds the
//   constant in three places, and all three are the pinned card gem's
//   own files (the template's own two lines and the card gem's test
//   environment's asset line). No gem in the pinned gemset is a jasmine
//   gem, so `Object.const_defined?(:JasmineRails)` is false in a deck
//   generated from this template, and the mount line is never reached.
//
//   THE MOUNT IS NOT THE DECK'S ENGINE ROUTES. The template mounts a
//   SECOND engine in the generated deck APP's routes file; the deck's own
//   engine routes (engine_routes.rb) are the file the family grades. The
//   row's surface is the app template, not the engine.
//
//   THE PINNED DECK'S OWN ANSWER at the mount's path is a CARD READ: the
//   PINNED router, asked to recognize /specs/spec_helper, answers the
//   two-segment read arm. The /jasmine prefix is one of the deck's own
//   DEPRECATED asset arms, so /jasmine/... is card#asset, whose answer is
//   the fixed installation-error 404.
//
//   THE PORT HAS NO COUNTERPART TO IMPLEMENT. The port's own jasmine
//   surface is the same deprecated asset prefix, answered with the same
//   fixed installation error, and the port has no spec runner engine.
//
// The oracle fixture is what
// tests/server/oracle-capture-register-routes-remaining-eight-ruby.rb
// recorded.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface RouterAnswer {
  path: string;
  verb: string;
  matched: boolean;
  answer: { path: string; defaults: Record<string, string> } | null;
}

interface Oracle {
  routerAnswers: Record<string, RouterAnswer[]>;
  pinnedMethods: {
    A23: {
      templateFile: string;
      templateLines: Array<{ line: number; text: string }>;
      constant: string;
      constantHits: Array<{ file: string; line: number; text: string }>;
      jasmineGems: string[];
    };
  };
  portSurface: Record<
    string,
    Array<{ host: string; file: string; lines: Array<{ line: number; text: string }> }>
  >;
}

const ORACLE = JSON.parse(
  readFileSync(
    path.join(REPO, "fixtures/captured/register-routes-remaining-eight-ruby-oracle.json"),
    "utf8",
  ),
) as Oracle;

/** The port's own source, re-read at the line numbers the capture quoted:
 *  a port that moved the surface breaks this test instead of quietly
 *  contradicting the fixture. */
function expectQuotedLines(
  file: string,
  quotes: Array<{ line: number; text: string }>,
): void {
  const source = readFileSync(path.join(REPO, file), "utf8").split("\n");
  for (const quote of quotes) {
    expect(source[quote.line - 1], `${file}:${quote.line}`).toBe(quote.text);
  }
}

/** The PINNED deck's route table, RECOGNIZED by the PINNED actionpack's own
 *  matcher (fixtures/captured/rails-route-recognition-ruby-oracle.json). The
 *  reduction above reads the table statically; this one lets the pinned
 *  MATCHER route the request, which is what settles that the /jasmine
 *  prefix is the deck's own deprecated asset arm and not a mounted
 *  engine. */
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

describe("the pinned deck app template's Jasmine mount (A23)", () => {
  it("the capture read the PINNED card gem's own generator template", () => {
    expect(ORACLE.pinnedMethods.A23.templateFile).toBe(
      "card-1.110.0/lib/generators/deck/templates/config/routes.rb.erb",
    );
  });

  it("the mount is behind the constant, and the whole gemset names it three times", () => {
    const hits = ORACLE.pinnedMethods.A23.constantHits;
    expect(hits.length).toBe(3);
    for (const hit of hits) {
      expect(hit.text).toContain("JasmineRails");
    }
    // Every hit is inside the PINNED card gem's own files.
    for (const hit of hits) {
      expect(hit.file.startsWith("card-1.110.0/"), hit.file).toBe(true);
    }
  });

  it("no gem in the pinned gemset is a jasmine gem, so the constant is never defined", () => {
    expect(ORACLE.pinnedMethods.A23.jasmineGems).toEqual([]);
  });

  it("the template's own mount line is the one the card gem's test environment guards", () => {
    const template = ORACLE.pinnedMethods.A23.templateLines.find(
      (row) => row.text.includes("const_defined?") && row.text.includes("JasmineRails"),
    );
    expect(template?.line).toBe(5);
    expect(template?.text).toContain("!Rails.env.production?");
  });
});

describe("the pinned deck's own answer at the mount's paths (A23)", () => {
  it("the mount's path is a CARD READ in the pinned deck", () => {
    const answer = ORACLE.routerAnswers["A23"].find((row) => row.path === "/specs/spec_helper");
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.defaults["action"]).toBe("read");
    expect(answer?.answer?.path).toBe("/:mark/:view(.:format)");
  });

  it("the /jasmine prefix is the deck's own DEPRECATED asset arm", () => {
    const answer = ORACLE.routerAnswers["A23"].find(
      (row) => row.path === "/jasmine/specs/jasmine.js",
    );
    expect(answer?.matched).toBe(true);
    expect(answer?.answer?.defaults["action"]).toBe("asset");
  });

  it("the EXECUTED PINNED matcher agrees: /jasmine/... is the deprecated asset arm, not a mounted engine", () => {
    // The reduction above reads the table statically; the executed PINNED
    // matcher routes the request itself. The /jasmine prefix is the deck's
    // own deprecated asset route (engine_routes.rb:14-16), so a request
    // under it answers card#asset and never reaches a mounted engine.
    const row = ROUTE_RECOGNITION.recognitions.find(
      (entry) => entry.path === "/jasmine/specs/x_spec" && entry.verb === "GET",
    );
    expect(row).toBeDefined();
    expect(row!.matched).toBe(true);
    expect(row!.routeOrder).toBe(5);
    expect(row!.params).toMatchObject({ action: "asset", mark: "specs/x_spec" });
  });
});

describe("the port's own surface (A23)", () => {
  it("the port answers the same deprecated asset prefixes, jasmine included", () => {
    const hosts = ORACLE.portSurface["A23"];
    expect(hosts.length).toBeGreaterThan(0);
    for (const entry of hosts) {
      expectQuotedLines(entry.file, entry.lines);
    }
    const text = hosts
      .flatMap((entry) => entry.lines.map((line) => line.text))
      .join("\n");
    expect(text).toContain("jasmine");
  });

  it("the port's own source names no spec-runner engine", () => {
    // The port's own surface for the row: the deprecated asset prefixes.
    // There is no second engine and no /specs mount anywhere in the port's
    // serving code.
    const source = readFileSync(path.join(REPO, "src/server/worker-shared-surface.ts"), "utf8");
    expect(source).toContain('DEPRECATED_ASSET_ROUTE_PREFIXES = ["assets", "javascripts", "jasmine"]');
    expect(source).not.toContain("JasmineRails");
  });
});

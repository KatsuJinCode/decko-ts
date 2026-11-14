// The REGISTERED format suffixes, measured against the PINNED MOD's own
// registry and the PINNED DECK's own dispatch.
//
// The completeness register's D5 row (register-routes) grades the port
// UNPORTED: "no format-negotiation arm for css, scss, js, text/txt, csv,
// xml, yaml/yml, jsonld: staging strips any suffix and serves HTML, the edge
// special-cases only .json and .rss, while Ruby renders /:style.css as
// text/css (card-mod-format-0.20.0/lib/card/format/css_format.rb:7-9)".
//
// fixtures/captured/format-registry-ruby-oracle.json is what
// oracle-capture-format-registry-ruby.rb (tests/server/) recorded by
// loading the PINNED MOD's own format files (each registers itself and
// carries its own mime type) and then running the PINNED DECK's own
// dispatch over the suffixes.
//
// WHAT THE MEASUREMENT SETTLES:
//
//   1. THE REGISTRY. The mod's own files register THIRTEEN names: css, csv,
//      html, js, json, jsonld, rss, scss, text, txt, xml, yaml and yml.
//      The names are strings (the gem's own registration stores
//      `format.to_s`), which is what the deck's `member?(rf)` check
//      compares against, and the request's format arrives as a string too.
//
//   2. THE MIME TYPES are the mod's own instance methods: css is
//      text/css (css_format.rb:7-9), js is text/javascript, json is
//      application/json, jsonld is application/ld+json, scss is
//      text/x-scss, txt and text are text/plain, xml is text/xml, yaml and
//      yml are text/x-yaml, html is text/html and rss is text/html. The csv
//      format's own mime type reads the request's params, so the capture
//      records that call as raising rather than a fixed string.
//
//   3. THE DISPATCH. Each of the row's suffixes answers its own format name
//      (not the file sender): css, scss, js, csv, xml, yaml, jsonld, txt.
//
// The port's answer, pinned below: the read grammar splits a REGISTERED
// suffix off the card URL (the row's own arm, landed in this
// round), so /Style.css is the card "Style" in the css format. The names the
// port cannot answer yet (yaml, yml, jsonld) keep their suffix in the
// name, and the .json door keeps its own shape.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/format-registry-ruby-oracle.json"), "utf8"),
) as {
  registered: string[];
  mimeTypes: Record<string, string>;
  dispatch: Array<{ label: string; requested: string; formatName: string | null }>;
};

const byLabel = new Map(ORACLE.dispatch.map((row) => [row.label, row]));

describe("the registered format suffixes, against the pinned mod", () => {
  it("the mod's own files register thirteen names", () => {
    expect(ORACLE.registered).toEqual([
      "css", "csv", "html", "js", "json", "jsonld", "rss", "scss", "text", "txt", "xml", "yaml", "yml",
    ]);
  });

  it("each of the row's formats answers its own name, not the file sender", () => {
    for (const format of ["css", "scss", "js", "csv", "xml", "yaml", "jsonld", "txt"]) {
      expect(byLabel.get(format)!.formatName, format).toBe(format);
    }
  });

  it("the mime types are the mod's own", () => {
    expect(ORACLE.mimeTypes["css"]).toBe("text/css");
    expect(ORACLE.mimeTypes["js"]).toBe("text/javascript");
    expect(ORACLE.mimeTypes["json"]).toBe("application/json");
    expect(ORACLE.mimeTypes["jsonld"]).toBe("application/ld+json");
    expect(ORACLE.mimeTypes["scss"]).toBe("text/x-scss");
    expect(ORACLE.mimeTypes["txt"]).toBe("text/plain");
    expect(ORACLE.mimeTypes["text"]).toBe("text/plain");
    expect(ORACLE.mimeTypes["xml"]).toBe("text/xml");
    expect(ORACLE.mimeTypes["yaml"]).toBe("text/x-yaml");
    expect(ORACLE.mimeTypes["yml"]).toBe("text/x-yaml");
    // The csv format's own mime type reads the request's params, so the
    // capture records the call raising rather than a fixed string.
    expect(ORACLE.mimeTypes["csv"]).toContain("RAISED");
  });

  it("the port's read grammar splits a REGISTERED suffix off the card URL", () => {
    // The row's own arm (row D5): "/Style.css" is the card
    // "Style" in the css format, and the view is the css format's own show
    // default (set/all/css.rb:8-11 `view ||= :content`).
    expect(parsePath("/Style.css")).toMatchObject({ name: "Style", view: "content", format: "css" });
    expect(parsePath("/Style.js")).toMatchObject({ name: "Style", view: "core", format: "js" });
    // And the suffix stays in the name on the one-segment arm for .json
    // too: the port's json handling is the TWO-segment arm, where the
    // suffix rides the VIEW (engine_routes.rb:51, ":mark/:view(.:format)").
    expect(parsePath("/Style.json")).toMatchObject({ name: "Style.json" });
    expect(parsePath("/Style/open.json")).toMatchObject({ name: "Style", view: "open", format: "json" });
  });
});

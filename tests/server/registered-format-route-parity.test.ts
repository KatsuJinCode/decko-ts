// The REGISTERED-FORMAT route arm (row D5), measured against
// the PINNED MOD's own registry and the PINNED DECK's own dispatch, with
// the port's own read grammar and the port's own arm table RUN.
//
// The register's D5 row grades the port UNPORTED: "no format-negotiation
// arm for css, scss, js, text/txt, csv, xml, yaml/yml, jsonld: staging
// strips any suffix and serves HTML, the edge special-cases only .json and
// .rss, while Ruby renders /:style.css as text/css
// (card-mod-format-0.20.0/lib/card/format/css_format.rb:7-9)".
//
// The pinned ground is the COMMITTED capture
// (fixtures/captured/format-registry-ruby-oracle.json, recorded by
// tests/server/oracle-capture-format-registry-ruby.rb): the PINNED mod's
// own format files register themselves, and the PINNED deck's own dispatch
// runs over every registered and unregistered suffix.
//
// WHAT THIS FILE PINS:
//
//   1. THE REGISTRY: thirteen names, and each of the row's names answers
//      its OWN format with its OWN mime type.
//   2. THE PORT'S GRAMMAR: a registered suffix is split off the card URL,
//      the mark on the one-segment arm and the view on the two- and
//      three-segment arms, and the view is the one the request names or
//      the format's own show default.
//   3. THE PORT'S ARM TABLE: the mime types are the pinned ones, and the
//      names the port cannot answer yet (yaml, yml, jsonld) keep their
//      suffix in the card's name - the NAMED remainders.
//   4. THE UNREGISTERED SUFFIX is NOT split: the pinned deck folds it to
//      the FILE sender (response.rb:102-105), which is row D4's own arm.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";
import {
  REGISTERED_FORMAT_ARMS,
  REGISTERED_ROUTE_FORMAT_NAMES,
  isRegisteredRouteFormat,
  registeredFormatDefaultView,
  registeredFormatMimeType,
  splitRegisteredFormatSuffix,
} from "../../src/server/registered-format-route.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface RegistryOracle {
  registered: string[];
  mimeTypes: Record<string, string>;
  dispatch: Array<{ label: string; requested: string; formatName: string | null }>;
}

const ORACLE = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/format-registry-ruby-oracle.json"), "utf8"),
) as RegistryOracle;

const byLabel = new Map(ORACLE.dispatch.map((row) => [row.label, row]));

/** The names the row names and the pinned dispatch ran over. */
const DISPATCHED = ["css", "scss", "js", "csv", "xml", "yaml", "jsonld", "txt"];

describe("the PINNED mod's own registry and the PINNED dispatch (D5)", () => {
  it("the registry carries THIRTEEN names", () => {
    expect(ORACLE.registered.length).toBe(13);
  });

  it("each of the row's names answers its OWN format, not the file sender", () => {
    for (const name of DISPATCHED) {
      expect(byLabel.get(name)?.formatName, name).toBe(name);
    }
  });

  it("an UNREGISTERED name answers the file sender", () => {
    // The counter-example the registered arm must not swallow.
    expect(byLabel.get("bin (unregistered)")?.formatName).toBe("file");
  });
});

describe("the port's own read grammar, RUN (D5)", () => {
  it("a registered suffix on the MARK is a format, not part of the name", () => {
    const parsed = parsePath("/Style.css");
    expect("kind" in parsed).toBe(false);
    if (!("kind" in parsed)) {
      expect(parsed.name).toBe("Style");
      expect(parsed.format).toBe("css");
      // The css format's own show default (set/all/css.rb:8-11
      // `view ||= :content`), not the html arm's "open".
      expect(parsed.view).toBe("content");
    }
  });

  it("a registered suffix on the VIEW rides the view segment", () => {
    const twoSegment = parsePath("/Alpha/open.css");
    expect("kind" in twoSegment).toBe(false);
    if (!("kind" in twoSegment)) {
      expect(twoSegment.name).toBe("Alpha");
      expect(twoSegment.view).toBe("open");
      expect(twoSegment.format).toBe("css");
    }
    const threeSegment = parsePath("/Alpha/view/open.css");
    expect("kind" in threeSegment).toBe(false);
    if (!("kind" in threeSegment)) {
      expect(threeSegment.name).toBe("Alpha");
      expect(threeSegment.view).toBe("open");
      expect(threeSegment.format).toBe("css");
    }
  });

  it("the request's own view wins over the format's show default", () => {
    const parsed = parsePath("/Style.css", new URLSearchParams("view=core"));
    expect("kind" in parsed).toBe(false);
    if (!("kind" in parsed)) {
      expect(parsed.view).toBe("core");
      expect(parsed.format).toBe("css");
    }
  });

  it("an UNREGISTERED suffix stays in the name - the file sender is D4's arm", () => {
    const parsed = parsePath("/Alpha.bin");
    expect("kind" in parsed).toBe(false);
    if (!("kind" in parsed)) {
      expect(parsed.name).toBe("Alpha.bin");
      expect(parsed.format).toBeUndefined();
    }
  });

  it("the json and rss arms keep their own doors", () => {
    // json still splits only with an explicit json view (the Select2
    // editors' /:search.json?view=image_complete shape).
    const plain = parsePath("/Alpha.json");
    expect("kind" in plain).toBe(false);
    if (!("kind" in plain)) {
      expect(plain.name).toBe("Alpha.json");
      expect(plain.format).toBeUndefined();
    }
    const rss = parsePath("/Alpha.rss");
    expect("kind" in rss).toBe(false);
    if (!("kind" in rss)) {
      expect(rss.name).toBe("Alpha");
      expect(rss.format).toBe("rss");
    }
  });
});

describe("the port's own arm table (D5)", () => {
  it("the mime types are the PINNED ones", () => {
    for (const [name, arm] of Object.entries(REGISTERED_FORMAT_ARMS)) {
      if (name === "csv") continue; // the csv mime type reads the request's params
      expect(arm.mimeType, name).toBe(ORACLE.mimeTypes[name]);
    }
  });

  it("the csv format's own mime type reads the request's params", () => {
    // csv_format.rb:7-11: `params[:disposition] == "inline" ?
    // "text/plain" : "text/comma-separated-values"`.
    expect(registeredFormatMimeType("csv")).toBe("text/comma-separated-values");
    expect(registeredFormatMimeType("csv", "inline")).toBe("text/plain");
  });

  it("the show defaults are the format's own", () => {
    // set/all/css.rb:8-11 `view ||= :content`, set/all/base.rb:3-6
    // `view ||= :core`, set/all/csv.rb:5-8 `view ||= :titled`.
    expect(registeredFormatDefaultView("css")).toBe("content");
    expect(registeredFormatDefaultView("scss")).toBe("content");
    expect(registeredFormatDefaultView("js")).toBe("core");
    expect(registeredFormatDefaultView("text")).toBe("core");
    expect(registeredFormatDefaultView("txt")).toBe("core");
    expect(registeredFormatDefaultView("xml")).toBe("core");
    expect(registeredFormatDefaultView("csv")).toBe("titled");
  });

  it("the arm answers the row's names minus the NAMED remainders", () => {
    expect([...REGISTERED_ROUTE_FORMAT_NAMES].sort()).toEqual(
      ["css", "csv", "js", "scss", "text", "txt", "xml"].sort(),
    );
    // The named remainders: yaml and yml need Ruby's `to_yaml` (the port
    // has no YAML serializer) and jsonld needs the jsonld support (the
    // port's own format mod says it is not ported).
    for (const name of ["yaml", "yml", "jsonld"]) {
      expect(isRegisteredRouteFormat(name), name).toBe(false);
      expect(splitRegisteredFormatSuffix(`Style.${name}`), name).toBeUndefined();
    }
  });

  it("the suffix rule is the LAST dot of the segment", () => {
    expect(splitRegisteredFormatSuffix("Style.css")).toEqual({ base: "Style", format: "css" });
    expect(splitRegisteredFormatSuffix("Style.min.css")).toEqual({ base: "Style.min", format: "css" });
    expect(splitRegisteredFormatSuffix("Style")).toBeUndefined();
    expect(splitRegisteredFormatSuffix("Style.")).toBeUndefined();
    expect(splitRegisteredFormatSuffix(".css")).toBeUndefined();
  });
});

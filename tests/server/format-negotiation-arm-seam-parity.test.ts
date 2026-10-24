// The URL format registry and its negotiation (row D5), measured against
// the PINNED mod's own registrations and the PINNED deck's own dispatch,
// with the port's own read grammar RUN.
//
// The register's D5 row grades the port UNPORTED: "no format-negotiation
// arm for css, scss, js, text/txt, csv, xml, yaml/yml, jsonld: staging
// strips any suffix and serves HTML, the edge special-cases only .json
// and .rss, while Ruby renders /:style.css as text/css
// (card-mod-format-0.20.0/lib/card/format/css_format.rb:7-9)".
//
// The pinned ground is the COMMITTED capture
// (tests/server/oracle-capture-format-registry-ruby.rb, whose fixture is
// fixtures/captured/format-registry-ruby-oracle.json): the PINNED mod's
// own format files register themselves, and the PINNED deck's own
// dispatch runs over every registered and unregistered suffix.
//
// WHAT THIS FILE ADDS is the row's closure: the port's own read grammar
// RUN over the named suffixes, beside the pinned answers.
//
//   THE PINNED REGISTRY CARRIES THIRTEEN NAMES, and each answers its own
//   format with its own mime type.
//
//   THE PORT'S GRAMMAR NEGOTIATES THE ARM'S NAMES: a registered suffix is
//   split off the card URL, so /Alpha.css is the card "Alpha" in the css
//   format, where the pinned deck answers the css format with text/css.
//   The json suffix keeps its own door (an explicit json view) and the rss
//   suffix its own arm; the three names the port cannot answer yet (yaml,
//   yml, jsonld) stay part of the card's name.
//
//   THE PORT CARRIES THE FORMAT VIEWS, so the arm is a dispatch seam and
//   not a missing feature: the port's own format mod holds the css, scss,
//   js, csv, xml, yaml, jsonld, text and txt format blocks.
//
//   SO THE ROW'S ARM IS LANDED, and this commit says so: the registered
//   names the port answers are split off the URL and answered in their own
//   format, and the named remainders are named.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePath } from "../../deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface RegistryOracle {
  registered: string[];
  mimeTypes: Record<string, string>;
  dispatch: Array<{ label: string; requested: string; formatName: string | null }>;
  formatFiles: string[];
}

interface Oracle {
  routerAnswers: Record<string, Array<{ path: string; verb: string; matched: boolean; answer: { path: string; defaults: Record<string, string> } | null }>>;
  portSurface: Record<
    string,
    Array<{ host: string; file: string; lines: Array<{ line: number; text: string }> }>
  >;
}

const REGISTRY = JSON.parse(
  readFileSync(path.join(REPO, "fixtures/captured/format-registry-ruby-oracle.json"), "utf8"),
) as RegistryOracle;

const ORACLE = JSON.parse(
  readFileSync(
    path.join(REPO, "fixtures/captured/register-routes-remaining-eight-ruby-oracle.json"),
    "utf8",
  ),
) as Oracle;

/** The names the row names. Every one of them is in the pinned registry;
 *  the pinned dispatch has a row for each of the eight the capture ran. */
const NAMED = ["css", "scss", "js", "text", "txt", "csv", "xml", "yaml", "yml", "jsonld"];
/** The names the port's own arm answers (row D5): the row's
 *  names less the three named remainders. */
const ARMED = ["css", "scss", "js", "text", "txt", "csv", "xml"];
/** The named remainders: yaml and yml need Ruby's `to_yaml`, jsonld needs
 *  the jsonld support. */
const REMAINDERS = ["yaml", "yml", "jsonld"];
/** The eight the pinned dispatch was run over. */
const DISPATCHED = ["css", "scss", "js", "csv", "xml", "yaml", "jsonld", "txt"];
/** The names the port's own format mod carries literally (scss and txt
 *  ride the css and text formats in the port's own vocabulary). */
const PORT_NAMED = ["css", "js", "text", "csv", "xml", "yaml", "yml", "jsonld"];

describe("the PINNED mod's own registry and the PINNED dispatch (D5)", () => {
  it("the registry carries THIRTEEN names", () => {
    expect(REGISTRY.registered.length).toBe(13);
    for (const name of NAMED) {
      expect(REGISTRY.registered, name).toContain(name);
    }
  });

  it("each registered name answers its OWN format", () => {
    const byLabel = new Map(REGISTRY.dispatch.map((row) => [row.label, row]));
    for (const name of DISPATCHED) {
      expect(byLabel.get(name)?.formatName, name).toBe(name);
    }
  });

  it("the css format's own mime type is text/css", () => {
    expect(REGISTRY.mimeTypes["css"]).toBe("text/css");
    expect(REGISTRY.mimeTypes["scss"]).toBe("text/x-scss");
    expect(REGISTRY.mimeTypes["jsonld"]).toBe("application/ld+json");
  });
});

describe("the PINNED router's own answer at those paths (D5)", () => {
  it("every registered suffix on a card URL reaches the SAME card read arm", () => {
    const answers = ORACLE.routerAnswers["D5"];
    expect(answers.length).toBe(7);
    for (const answer of answers) {
      expect(answer.matched, answer.path).toBe(true);
      expect(answer.answer?.path, answer.path).toBe("/:mark(.:format)");
      expect(answer.answer?.defaults["action"], answer.path).toBe("read");
    }
  });
});

describe("the port's own read grammar, RUN (D5)", () => {
  it("the arm's names ARE split off a one-segment card URL", () => {
    for (const name of ARMED) {
      const parsed = parsePath(`/Alpha.${name}`);
      expect("kind" in parsed, name).toBe(false);
      if (!("kind" in parsed)) {
        expect(parsed.name, name).toBe("Alpha");
        expect(parsed.format, name).toBe(name);
      }
    }
  });

  it("the NAMED REMAINDERS keep their suffix in the card's name", () => {
    // yaml and yml need Ruby's `to_yaml` (the port has no YAML
    // serializer) and jsonld needs the jsonld support (the port's own
    // format mod says it is not ported). Both are named, and both keep the
    // suffix in the name.
    for (const name of REMAINDERS) {
      const parsed = parsePath(`/Alpha.${name}`);
      expect("kind" in parsed, name).toBe(false);
      if (!("kind" in parsed)) {
        expect(parsed.name, name).toBe(`Alpha.${name}`);
        expect(parsed.format, name).toBeUndefined();
      }
    }
  });

  it("the port's grammar DOES know the rss suffix, which it splits", () => {
    const parsed = parsePath("/Alpha.rss");
    expect("kind" in parsed).toBe(false);
    if (!("kind" in parsed)) {
      expect(parsed.name).toBe("Alpha");
      expect(parsed.format).toBe("rss");
    }
  });

  it("the port CARRIES the format views, so the missing piece is the dispatch, not the formats", () => {
    const formatMod = readFileSync(
      path.join(REPO, "src/card/mod-loader/mods/card-mod-format.ts"),
      "utf8",
    );
    for (const name of PORT_NAMED) {
      expect(formatMod, name).toContain(name);
    }
  });

  it("the port's own read grammar source is the one the capture quoted", () => {
    for (const entry of ORACLE.portSurface["D5"]) {
      const source = readFileSync(path.join(REPO, entry.file), "utf8").split("\n");
      for (const quote of entry.lines) {
        expect(source[quote.line - 1], `${entry.file}:${quote.line}`).toBe(quote.text);
      }
    }
  });
});

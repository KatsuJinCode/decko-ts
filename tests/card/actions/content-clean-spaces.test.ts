// Oracle-matched pin for clean_spaces — the space_last_in_multispace
// config's one Ruby consumer.
//
// The register's red-team B-table graded the space_last_in_multispace
// railtie key UNVERIFIED on zero port-side hits in the NAME layer. The
// grep was looking in the wrong layer: the key's only Ruby consumer is the
// HTML cleaner (content/clean.rb:39, `cleaned = clean_spaces cleaned if
// Cardio.config.space_last_in_multispace`; railtie.rb:20's default true),
// and the port carries it at that layer — src/card/actions/content-clean.ts
// :34 documents the config as on (Ruby's default, baked in: the port has
// no config dial) and :565-569 implements cleanSpaces, the port of
//
//     def clean_spaces string
//       string.gsub(/(?:^|\b) ((?:&nbsp;)+)/, '\1 ')
//     end
//
// (content/clean.rb:54-56). A space immediately before a run of &nbsp;
// entities moves AFTER the run. This file pins that byte contract against
// the Ruby regex's semantics — the ^ alternative (line starts, hence the
// port's m flag) and the \b alternative (after a word character).

import { describe, expect, it } from "vitest";
import { cleanContent, cleanSpaces } from "../../../src/card/actions/content-clean.js";

describe("clean_spaces (the space_last_in_multispace consumer)", () => {
  it("a space before an &nbsp; run moves after the run (the \\b arm, after a word character)", () => {
    expect(cleanSpaces("x &nbsp;&nbsp;y")).toBe("x&nbsp;&nbsp; y");
  });

  it("the same move at the start of the string (the ^ arm)", () => {
    expect(cleanSpaces(" &nbsp;&nbsp;y")).toBe("&nbsp;&nbsp; y");
  });

  it("the ^ arm matches at every LINE start (Ruby's ^ is per-line; the port's m flag mirrors it)", () => {
    expect(cleanSpaces("a\n &nbsp;b")).toBe("a\n&nbsp; b");
  });

  it("no preceding space, no move", () => {
    expect(cleanSpaces("x&nbsp;&nbsp;y")).toBe("x&nbsp;&nbsp;y");
  });

  it("only the FIRST space-before-run moves: gsub resumes after the match, and '; ' is no boundary", () => {
    expect(cleanSpaces("w &nbsp; &nbsp;z")).toBe("w&nbsp;  &nbsp;z");
  });

  it("a run not preceded by a space or a line start is untouched", () => {
    expect(cleanSpaces("<p>&nbsp;x</p>")).toBe("<p>&nbsp;x</p>");
  });

  it("the cleaner runs clean_spaces on every save's content (content/clean.rb:39's gated call, baked on)", () => {
    expect(cleanContent("x &nbsp;y")).toBe("x&nbsp; y");
  });
});

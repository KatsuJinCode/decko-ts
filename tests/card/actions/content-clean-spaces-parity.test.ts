// Oracle-matched pin for clean_spaces — the ONLY consumer of the
// space_last_in_multispace config key in the pinned gemset, and therefore
// what the redteam row reg-redteam-cfg-space_last_in_multispace was
// actually asking about. The row was graded UNVERIFIED because its grep
// looked in the NAME layer (src/card/name*); the key's only Ruby reader is
// the HTML cleaner.
//
// Ruby (card-1.110.0/lib/card/content/clean.rb:37-41, :54-56):
//
//   def clean! string, tags=ALLOWED_TAGS
//     cleaned = clean_tags string, tags
//     cleaned = clean_spaces cleaned if Cardio.config.space_last_in_multispace
//     cleaned
//   end
//
//   def clean_spaces string
//     string.gsub(/(?:^|\b) ((?:&nbsp;)+)/, '\1 ')
//   end
//
// Semantics this file pins, one per leg:
//   - `(?:^|\b)` + ONE literal space + a run of &nbsp;, replaced by the run
//     then a space: the plain space MOVES to the end of the run.
//   - `\b` is what makes the ordinary in-text case move: a word character
//     followed by a space is a boundary.
//   - `^` in Ruby is line-start ALWAYS (no flag), so the JS port carries
//     the `m` flag to keep that; without it a line-2 run would not move.
//   - a run NOT preceded by a space, or preceded by two spaces, is left
//     alone: two spaces have no boundary between them (space/non-word to
//     space/non-word) and `^` only fires at a line start.
//   - gsub resumes AFTER each match's source text, so a second run that
//     directly follows the first is NOT moved - the scanner never re-reads
//     the replacement.
//   - the composition: cleanContent applies clean_spaces last, after tags
//     and comments (clean.rb:37-41).
//
// The config key itself: railtie.rb sets `config.space_last_in_multispace`
// default true, and the port documents the baked default (content-clean.ts
// module header, "Configuration: allow_inline_styles and
// space_last_in_multispace are on"). This file pins the ON posture, which
// is the shape a default deployment runs; the OFF posture is a named
// divergence recorded on the register row, not a silent second default.
//
// Every expectation below was read off the REAL Ruby method, not derived:
// `/c/Ruby34-x64/bin/ruby` (3.4.11) running
//   def clean_spaces(s) = s.gsub(/(?:^|\b) ((?:&nbsp;)+)/, '\1 ') end
// over the same 13 inputs, and the two composition inputs through the
// clean_tag reading at clean.rb:58-63. The port answered all 15 the same.

import { describe, expect, it } from "vitest";
import { cleanSpaces, cleanContent } from "../../../src/card/actions/content-clean.js";

describe("clean_spaces (clean.rb:54-56) — a plain space moves to the end of a &nbsp; run", () => {
  it("moves the space after a word character (the \\b arm)", () => {
    expect(cleanSpaces("a &nbsp;b")).toBe("a&nbsp; b");
    expect(cleanSpaces("word &nbsp;&nbsp;end")).toBe("word&nbsp;&nbsp; end");
  });

  it("moves the space at the string's start (the ^ arm at position 0)", () => {
    expect(cleanSpaces(" &nbsp;x")).toBe("&nbsp; x");
  });

  it("moves the space at a LINE start — Ruby's ^ needs no flag, the port's m flag is that", () => {
    expect(cleanSpaces("first\n &nbsp;second")).toBe("first\n&nbsp; second");
    expect(cleanSpaces("a\n\n &nbsp;b")).toBe("a\n\n&nbsp; b");
  });

  it("leaves a run that has no leading space alone", () => {
    expect(cleanSpaces("a&nbsp;b")).toBe("a&nbsp;b");
    expect(cleanSpaces("&nbsp;")).toBe("&nbsp;");
    expect(cleanSpaces("&nbsp;&nbsp;&nbsp;")).toBe("&nbsp;&nbsp;&nbsp;");
  });

  it("leaves a run behind TWO spaces alone: space-to-space is not a boundary", () => {
    expect(cleanSpaces("a  &nbsp;b")).toBe("a  &nbsp;b");
    expect(cleanSpaces("a   &nbsp;&nbsp;b")).toBe("a   &nbsp;&nbsp;b");
  });

  it("does not move a second run the scanner resumes past (gsub resumes after the match)", () => {
    // The first run matches and is replaced; scanning continues after the
    // SOURCE match (" &nbsp;"), where the next space sits between two
    // non-word characters - no boundary, no ^ - so the second run stays.
    // The replacement's own trailing space therefore ends up ADJACENT to
    // the unmoved run: "&nbsp;" + " " + " &nbsp;b".
    expect(cleanSpaces("a &nbsp; &nbsp;b")).toBe("a&nbsp;  &nbsp;b");
  });

  it("moves each run that carries its own leading space", () => {
    expect(cleanSpaces("a &nbsp;b c &nbsp;d")).toBe("a&nbsp; b c&nbsp; d");
  });

  it("composes through cleanContent as the last step (clean.rb:37-41)", () => {
    // A dropped tag becomes a single space (clean_tag, clean.rb:58-63:
    // `return " " unless (ok_attrs = ok_tags[tag])`; `script` is not in the
    // allowed_tags list, clean.rb:5-21), so the run after the dropped tag
    // is preceded by TWO spaces and clean_spaces leaves it alone - the
    // composition is observable only because the step order is pinned.
    expect(cleanContent("a <script>x</script> &nbsp;b")).toBe("a  x  &nbsp;b");
    expect(cleanContent("plain &nbsp;&nbsp;text")).toBe("plain&nbsp;&nbsp; text");
  });
});

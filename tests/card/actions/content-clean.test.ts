// Card content cleaning: the port's own output on ordinary and hostile markup.
//
// The assertions that compare against the recorded output of the upstream
// cleaner, on hostile markup and on ordinary content alike, are withheld until
// disclosure, in tests/withheld/stored-html-ruby-reproductions.test.ts. A
// release package excludes that file, so when it is absent this suite says so
// on stderr.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cleanContent } from "../../../src/card/actions/content-clean.js";

const WITHHELD_SUITE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../withheld/stored-html-ruby-reproductions.test.ts",
);
if (!existsSync(WITHHELD_SUITE)) {
  process.stderr.write(
    `[withheld until disclosure] NOT RUN: 34 tests (${WITHHELD_SUITE})\n`,
  );
}

describe("cleanContent", () => {
  it("drops event handlers and script elements, and a script-capable link target, keeping the link text", () => {
    const input =
      '<p onclick="x()">hi</p><script>bad()</script><b>ok</b>' +
      '<a href="javascript:evil()">l</a><div class="c" style="color:red">d</div>';
    expect(cleanContent(input)).toBe(
      '<p>hi</p> bad() <b>ok</b><a>l</a><div style="color:red">d</div>',
    );
  });

  it("keeps only w- classes, single quotes, and drops one-line comments", () => {
    expect(cleanContent("<span class='w-a b W-c'>x</span><!-- gone -->")).toBe(
      "<span class='w-a W-c'>x</span>",
    );
  });

  it("keeps a multi-line comment, as the regex `.` does not cross newlines", () => {
    expect(cleanContent("a<!--\nb-->c")).toBe("a<!--\nb-->c");
  });

  it("moves the plain space after a run of &nbsp;", () => {
    expect(cleanContent("a &nbsp;&nbsp;b")).toBe("a&nbsp;&nbsp; b");
  });

  it("allows the table attributes inline styles enable", () => {
    expect(cleanContent('<table border="1" onload="x" cellpadding="2">')).toBe(
      '<table cellpadding="2" border="1">',
    );
  });
});

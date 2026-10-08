// Card::Content.clean! (card-1.110.0 lib/card/content/clean.rb). The first
// expectation is the Ruby oracle's stored content for the same input
// (persistence probe step 20, RichText and PlainText alike), except for the
// declared security difference: the port drops the javascript: link target
// Ruby keeps (docs/SECURITY.md; content-clean-security.test.ts).

import { describe, expect, it } from "vitest";
import { cleanContent, rubyCleanContent } from "../../../src/card/actions/content-clean.js";

describe("cleanContent", () => {
  it("matches the oracle on event handlers, script, links and inline styles", () => {
    const input =
      '<p onclick="x()">hi</p><script>bad()</script><b>ok</b>' +
      '<a href="javascript:evil()">l</a><div class="c" style="color:red">d</div>';
    // The Ruby oracle's stored content.
    expect(rubyCleanContent(input)).toBe(
      '<p>hi</p> bad() <b>ok</b><a href="javascript:evil()">l</a><div style="color:red">d</div>',
    );
    // The port's: the same, without the script-capable link target.
    expect(cleanContent(input)).toBe(
      '<p>hi</p> bad() <b>ok</b><a>l</a><div style="color:red">d</div>',
    );
  });

  it("keeps only w- classes, single quotes, and drops one-line comments", () => {
    expect(cleanContent("<span class='w-a b W-c'>x</span><!-- gone -->")).toBe(
      "<span class='w-a W-c'>x</span>",
    );
  });

  it("keeps a multi-line comment, as Ruby's `.` does not cross newlines", () => {
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

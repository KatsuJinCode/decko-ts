// The content/clean.rb row's oracle battery: the pinned clean.rb executed
// under Ruby 3.4.11 (allow_inline_styles on, space_last_in_multispace on,
// the configuration this module declares), its clean! run over the inputs
// below, and the port's cleanContent compared byte for byte.
//
// The oracle run: tmp/oracle-clean-rb-probe.rb at this row's close loads the
// pinned module by its own bytes (eval, with the english alias of $~ and
// ActiveSupport 7.2.4's blank? stood in, both things the deck's runtime
// carries) and records [input, clean! output] pairs. 21 of the 22 answers
// are byte-identical in the port. The one that is not is the divergence the
// module header names: Ruby's \b-anchored attribute search reads a value for
// `style` out of `data-mce-style="..."`, and emits a phantom style attribute;
// the port's WHATWG read finds no style attribute, and the two-reads rule
// stores the browser's read. That case is pinned here as the named
// divergence, not hidden.

import { describe, expect, it } from "vitest";
import { cleanContent } from "../../../src/card/actions/content-clean.js";

// [input, the pinned clean!'s answer], verbatim from the oracle run.
const ORACLE_CASES: ReadonlyArray<readonly [string, string]> = [
  ["Hello world", "Hello world"],
  ["<p>Hello <b>world</b></p>", "<p>Hello <b>world</b></p>"],
  [
    '<a href="https://example.com" title="Ex" target="_blank">link</a>',
    '<a href="https://example.com" title="Ex" target="_blank">link</a>',
  ],
  ['<img src="/x.png" alt="an x">', '<img src="/x.png" alt="an x">'],
  ['<code lang="ruby">1 + 1</code>', '<code lang="ruby">1 + 1</code>'],
  [
    '<blockquote cite="https://q.example">quote</blockquote>',
    '<blockquote cite="https://q.example">quote</blockquote>',
  ],
  [
    '<table border="1"><tr><td scope="row">cell</td></tr></table>',
    '<table border="1"><tr><td scope="row">cell</td></tr></table>',
  ],
  ["<script>alert(1)</script>after", " alert(1) after"],
  ['<iframe src="https://evil.example"></iframe>after', "  after"],
  ['<p onclick="evil()">click</p>', "<p>click</p>"],
  ['<p class="w-xx important">classes</p>', '<p class="w-xx">classes</p>'],
  ['<p class="no-w-here other">classes two</p>', "<p>classes two</p>"],
  ['<ol type="a"><li>one</li></ol>', '<ol type="a"><li>one</li></ol>'],
  [
    '<div><span style="color: blue">styled</span></div>',
    '<div><span style="color: blue">styled</span></div>',
  ],
  ["<!-- a comment -->visible", "visible"],
  ["a&nbsp;&nbsp;b", "a&nbsp;&nbsp;b"],
  ["plain <em>both</em> ends&nbsp;", "plain <em>both</em> ends&nbsp;"],
  ["<p>unclosed", "<p>unclosed"],
  ["</p>stray close", "</p>stray close"],
  ["<P>UPPER</P>", "<p>UPPER</p>"],
  ['<p CLASS="w-1">attrs upper</p>', '<p class="w-1">attrs upper</p>'],
];

describe("clean! (content/clean.rb:37-45) against the pinned module's own answers", () => {
  it("matches the pinned clean! byte for byte on the oracle battery", () => {
    for (const [input, rubyAnswer] of ORACLE_CASES) {
      expect(cleanContent(input), JSON.stringify(input)).toBe(rubyAnswer);
    }
  });

  it("names the one divergence instead of matching it (the phantom style Ruby's \\bstyle reads out of data-mce-style)", () => {
    const input = '<td data-mce-style="color: red">mce</td>';
    // The pinned Ruby's answer, verbatim:
    //   <td data-mce-style="color: red" style="color: red">mce</td>
    // The port stores the WHATWG read: no style attribute is present in the
    // source, so none is emitted (the module header carries the mechanism).
    expect(cleanContent(input)).toBe('<td data-mce-style="color: red">mce</td>');
  });
});

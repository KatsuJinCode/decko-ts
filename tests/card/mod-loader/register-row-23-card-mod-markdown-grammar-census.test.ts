// The kramdown grammar's middle parsers, and what the port does with the
// text they would have claimed (register row 23, card-mod-markdown).
//
// RUBY (kramdown 2.5.2 parser/kramdown.rb:75-77): the block dispatch runs
// @block_parsers in order and the FIRST match claims the position, so a
// construct the dispatch knows builds its own element.
//
// THE PORT. The port implements a SUBSET of that dispatch: blank_line,
// codeblock, codeblock_fenced, blockquote, atx_header, horizontal_rule,
// list, setext_header, paragraph
// (src/card/render/kramdown.ts:126-134). The middle parsers are not
// ported, so their text reaches the paragraph parser. The port's own file
// names the cases and the exception
// (src/card/mod-loader/mods/card-mod-markdown.ts:47-58): tables,
// footnotes, definition lists, abbreviations, attribute lists, math, raw
// HTML blocks and spans, link reference definitions and EOB markers are
// unported, and the coderay TOKENIZATION of a code block is a tenth
// divergence, where the code-block wrapper is byte-exact but code that
// tokenizes gets inline-styled spans the port does not produce.
//
// This file pins the port's answer for each of those cases, so the row's
// gap cannot change silently.

import { describe, expect, it } from "vitest";

import { kramdownToHtml } from "../../../src/card/render/kramdown.js";

describe("the kramdown constructs the port's block dispatch does not claim", () => {
  it("a table falls through to the paragraph parser", () => {
    const html = kramdownToHtml("| a | b |\n|---|---|\n| 1 | 2 |\n");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<td");
    expect(html).toContain("<p");
  });

  it("a definition list falls through to the paragraph parser", () => {
    const html = kramdownToHtml("term\n: definition\n");
    expect(html).not.toContain("<dl");
    expect(html).not.toContain("<dd");
    expect(html).toContain("<p");
  });

  it("a footnote definition falls through to the paragraph parser", () => {
    const html = kramdownToHtml("[^1]: the note\n");
    expect(html).not.toContain("footnote");
    expect(html).not.toContain("<sup");
    expect(html).toContain("<p");
  });

  it("a raw HTML block falls through to the paragraph parser", () => {
    const html = kramdownToHtml("<div class=\"raw\">text</div>\n");
    expect(html).not.toContain("<div class=\"raw\">");
    expect(html).toContain("<p");
  });

  it("the code-block wrapper is byte-exact, and the tokenization is not", () => {
    // kramdown's fenced code block is the tilde fence
    // (codeblock.rb:35-52, FENCED_CODEBLOCK_START = /^~{3,}/).
    const html = kramdownToHtml("~~~ruby\ndef foo\n  1\nend\n~~~\n");
    expect(html).toContain('class="language-ruby highlighter-coderay"');
    expect(html).toContain('<div class="CodeRay">');
    // Ruby renders the keyword as an inline-styled span; the port does not.
    expect(html).not.toContain("<span style=");
  });
});

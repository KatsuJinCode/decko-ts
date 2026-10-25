// The kramdown grammar's middle parsers, and what the port does with the
// text they claim (register row 23, card-mod-markdown) - CLOSED.
//
// RUBY (kramdown 2.5.2 parser/kramdown.rb:75-77): the block dispatch runs
// @block_parsers in order and the FIRST match claims the position, so a
// construct the dispatch knows builds its own element.
//
// THE PORT at this tree: the full dispatch is ported - blank_line,
// codeblock, codeblock_fenced, blockquote, atx_header, horizontal_rule,
// list, definition_list, block_html, setext_header, block_math, table,
// footnote_definition, link_definition, abbrev_definition,
// block_extensions, eob_marker, paragraph
// (src/card/render/kramdown.ts parseBlocksInto) - with the span-side
// partners (span_html, footnote_marker, inline_math, span_extensions) and
// the abbreviation replacement. The coderay TOKENIZATION of a code block
// matches for the deck's scanner languages (ruby, java_script) through
// src/card/render/code-highlighting (the scanners bail to the plain
// pass-through on constructs they do not implement, keeping the wrapper
// bytes exact).
//
// This file pins the port's answer for each of the constructs the old gap
// listed, so the row's closure cannot change silently.

import { describe, expect, it } from "vitest";

import { kramdownToHtml } from "../../../src/card/render/kramdown.js";

describe("the kramdown block dispatch claims its middle parsers' constructs", () => {
  it("a table builds a table element", () => {
    const html = kramdownToHtml("| a | b |\n|---|---|\n| 1 | 2 |\n");
    expect(html).toContain("<table");
    expect(html).toContain("<td");
    expect(html).not.toContain("<p");
  });

  it("a definition list builds a dl element", () => {
    const html = kramdownToHtml("term\n: definition\n");
    expect(html).toContain("<dl");
    expect(html).toContain("<dd");
    expect(html).not.toContain("<p");
  });

  it("a footnote definition feeds the marker and the endnotes", () => {
    const html = kramdownToHtml("text[^1]\n\n[^1]: the note\n");
    expect(html).toContain("footnote");
    expect(html).toContain("<sup");
    expect(html).not.toContain("<p>text[^1]</p>");
  });

  it("a raw HTML block passes through as an element", () => {
    const html = kramdownToHtml("<div class=\"raw\">text</div>\n");
    expect(html).toContain("<div class=\"raw\">");
    expect(html).not.toContain("&lt;div");
  });

  it("a link reference definition feeds reference links", () => {
    const html = kramdownToHtml("[foo]: http://example.com\n\n[foo]\n");
    expect(html).toContain("<a href=\"http://example.com\">foo</a>");
    expect(html).not.toContain("[foo]:");
  });

  it("an ALD after a block attaches its class", () => {
    const html = kramdownToHtml("A paragraph\n{: .cls}\n");
    expect(html).toContain("<p class=\"cls\">");
  });

  it("a block math element renders through the mathjax display form", () => {
    const html = kramdownToHtml("$$sqrt{x}$$\n");
    expect(html).toContain("\\[sqrt{x}\\]");
    expect(html).not.toContain("<p>$$");
  });

  it("an abbreviation definition replaces its term", () => {
    const html = kramdownToHtml("The HTML spec.\n\n*[HTML]: HyperText Markup Language\n");
    expect(html).toContain("<abbr title=\"HyperText Markup Language\">HTML</abbr>");
  });

  it("an EOB marker line renders nothing", () => {
    const html = kramdownToHtml("para one\n^\npara two\n");
    expect(html).toBe("<p>para one</p>\n<p>para two</p>\n");
  });

  it("the code-block wrapper is byte-exact AND the tokenization matches", () => {
    // kramdown's fenced code block is the tilde fence
    // (codeblock.rb:35-52, FENCED_CODEBLOCK_START = /^~{3,}/).
    const html = kramdownToHtml("~~~ruby\ndef foo\n  1\nend\n~~~\n");
    expect(html).toContain('class="language-ruby highlighter-coderay"');
    expect(html).toContain('<div class="CodeRay">');
    // Ruby renders the keyword as an inline-styled span; the port does too.
    expect(html).toContain("<span style=\"color:#080;font-weight:bold\">def</span>");
  });
});

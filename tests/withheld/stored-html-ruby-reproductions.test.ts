// WITHHELD UNTIL DISCLOSURE. The assertions that show what the upstream
// stored-HTML cleaner keeps on hostile markup, and the ordinary-content cases
// that compare the port's stored bytes with that cleaner's. This file is
// excluded from every release package and is loaded only when present; when it
// is absent the public suites print `[withheld until disclosure] NOT RUN: 34
// tests` on stderr. See docs/SECURITY.md ("Stored HTML is sanitised safely").

import { describe, expect, it } from "vitest";
import { cleanContent } from "../../src/card/actions/content-clean.js";
import { rubyCleanContent } from "./ruby-clean-content.js";
import { htmlSafetyProblems } from "../card/actions/html-safety-verifier.js";

describe("stored HTML, withheld: the upstream cleaner's recorded output on hostile markup", () => {
  it("keeps the script-capable link target the port drops", () => {
    expect(
      rubyCleanContent(
        '<p onclick="x()">hi</p><script>bad()</script><b>ok</b>' +
          '<a href="javascript:evil()">l</a><div class="c" style="color:red">d</div>',
      ),
    ).toBe('<p>hi</p> bad() <b>ok</b><a href="javascript:evil()">l</a><div style="color:red">d</div>');
  });

  it("the upstream cleaner's own output fails the verifier on both inputs (the check is not vacuous)", () => {
    expect(rubyCleanContent(`<a href="javascript:alert(1)">click</a>`)).toBe(`<a href="javascript:alert(1)">click</a>`);
    expect(htmlSafetyProblems(rubyCleanContent(`<a href="javascript:alert(1)">click</a>`))).not.toEqual([]);
    expect(rubyCleanContent(`<img src=x"onerror="alert(1)>`)).toBe(`<img src="x"onerror="alert(1)">`);
    expect(htmlSafetyProblems(rubyCleanContent(`<img src=x"onerror="alert(1)>`))).not.toEqual([]);
  });

  it("the upstream cleaner's output fails the verifier on the splice, the open quote and the open tag", () => {
    for (const input of [
      `<<!-- -->img src=x onerror=alert(1)>`,
      `<a title="<!--">--> " onmouseover="alert(1)">x</a>`,
      `<a href='abc onmouseover=alert(1)>x</a>`,
      `<img src=x onerror=alert(1) `,
    ]) {
      expect({ input, problems: htmlSafetyProblems(rubyCleanContent(input)).length > 0 }).toEqual({
        input,
        problems: true,
      });
      expect(htmlSafetyProblems(cleanContent(input))).toEqual([]);
    }
  });

  it("the upstream cleaner rebuilds a malformed bare value into two attributes, and the verifier flags it", () => {
    expect(rubyCleanContent(`<img src=x"onerror="alert(1)>`)).toBe(`<img src="x"onerror="alert(1)">`);
    expect(htmlSafetyProblems(rubyCleanContent(`<img src=x"onerror="alert(1)>`))).not.toEqual([]);
  });

  // Where the upstream cleaner's attribute search misreads a tag, it stores
  // something other than what the author wrote; the port stores what the
  // author wrote.
  const RUBY_MISREADS: Array<[string, string, string]> = [
    [
      `<td scope="row" data-mce-style="width: 10px;">cell</td>`,
      `<td scope="row" data-mce-style="width: 10px;" style="width: 10px;">cell</td>`,
      `<td scope="row" data-mce-style="width: 10px;">cell</td>`,
    ],
    [
      `<a href="http://example.org/show?title=1078" title="Article">x</a>`,
      `<a href="http://example.org/show?title=1078" title="1078"">x</a>`,
      `<a href="http://example.org/show?title=1078" title="Article">x</a>`,
    ],
    [`<img src="a.png" alt="">`, `<img src="a.png" alt="""">`, `<img src="a.png">`],
  ];
  it.each(RUBY_MISREADS.map((c, i) => [i, ...c]))(
    "misread %i: the port stores what the author wrote",
    (_i, input, ruby, port) => {
      expect(rubyCleanContent(input as string)).toBe(ruby);
      expect(cleanContent(input as string)).toBe(port);
    },
  );
});

/** Ordinary content: what an editor produces. Every case must clean to
 *  exactly the bytes the upstream cleaner stores, and leave nothing a browser
 *  acts on. */
const ORDINARY: string[] = [
  "<p>Plain paragraph.</p>",
  "<p>Text with <strong>bold</strong>, <em>italic</em>, <b>b</b>, <i>i</i>, <sup>2</sup>, <sub>x</sub>, <del>old</del> and <ins>new</ins>.</p>",
  `<p><a href="http://example.org/page?a=1&amp;b=2">link</a> <a href="https://example.org/" target="_blank" title="Example">ex</a></p>`,
  `<a href="mailto:someone@example.org">mail</a> <a href="tel:510-555-0100">call</a> <a href="skype:someone?call">skype</a>`,
  `<a href="/Some_Card">card</a> <a href="Relative_Card">rel</a> <a href="#section">anchor</a> <a href="?view=edit">q</a> <a href="//cdn.example.org/x">proto</a>`,
  `<a href="Some Page: with a colon">odd but relative</a>`,
  `<img src="https://example.org/a.png" alt="An image" title="Title"> <img src="/files/~123/456-medium.jpg" alt="x">`,
  `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==">`,
  `<table border="1" cellpadding="2" cellspacing="0" style="width: 100%;"><tbody><tr><th scope="col">H</th></tr><tr><td style="text-align: center;">c</td></tr></tbody></table>`,
  `<div style="background-image: url('https://example.org/bg.png'); color: #333;">bg</div>`,
  `<ul type="disc"><li>one</li><li>two</li></ul><ol type="1"><li>a</li></ol>`,
  `<blockquote cite="https://example.org/source">quoted</blockquote> <code lang="ruby">x = 1</code> <pre>pre  text</pre>`,
  `<span class="w-highlight w-note">kept classes</span> <span class='w-a'>single</span>`,
  `<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6><hr><br><br/>`,
  "<p>a &nbsp;&nbsp;b and a &lt; b, 3 < 4 and 5 > 2, x<5 &amp; y</p>",
  "<p>Nested {{Some Card|core}} and [[Linked Card|label]] syntax.</p>",
  "<p>before</p><!--\nmulti-line comment\n--><p>after</p>",
  "<p>before</p><!-- one-line comment --><p>after</p>",
  "<!--[if gte mso 9]><xml>\n<w:WordDocument></w:WordDocument>\n</xml><![endif]--><p class=\"MsoNormal\">Word</p>",
  "<p><![if !supportLists]>1.<![endif]>Item</p>",
  "<p>Line one\r\nLine two</p>\r\n<p>CRLF</p>",
  `<p style="margin: 0px; font-family: &quot;Helvetica Neue&quot;;">quoted font</p>`,
  "<div><span>café — 日本</span></div>",
  `<a href="https://example.org/a b">space in URL</a>`,
  `<p>Removed tags become spaces: <font color="red">red</font> and <u>under</u>.</p>`,
  `<p onclick="x()">event handlers go</p><script>bad()</script>`,
  `<td colspan="2" scope="row" style="width: 10px;" data-mce-style="width: 10px;">cell</td>`,
];

describe("stored HTML, withheld: ordinary content is stored as the upstream cleaner stores it", () => {
  it.each(ORDINARY.map((s, i) => [i, s]))("ordinary case %i is byte-identical to the upstream cleaner", (_i, input) => {
    const out = cleanContent(input as string);
    expect(out).toBe(rubyCleanContent(input as string));
    expect(htmlSafetyProblems(out)).toEqual([]);
  });
});

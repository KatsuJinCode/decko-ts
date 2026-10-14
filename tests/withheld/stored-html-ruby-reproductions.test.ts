// WITHHELD UNTIL DISCLOSURE. The assertions that show what the upstream
// stored-HTML cleaner keeps on hostile markup. This file is excluded from every
// release package and is loaded only when present; when it is absent the public
// suites print `[withheld until disclosure] NOT RUN: 7 tests` on stderr.
// See docs/SECURITY.md ("Stored HTML").

import { describe, expect, it } from "vitest";
import { cleanContent, rubyCleanContent } from "../../src/card/actions/content-clean.js";
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

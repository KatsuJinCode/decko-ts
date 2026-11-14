// CRLF normalization: coderay's `to_unix` at the scan dispatch.
//
// Truth source, coderay-1.1.3:
//   lib/coderay/scanners/scanner.rb:96-98
//       def to_unix code
//         code.index(?\r) ? code.gsub(/\r\n?/, "\n") : code
//       end
//   reached from Scanner.normalize (scanner.rb:51-63) and applied on EVERY
//   scan at scanner.rb:137 `super self.class.normalize(code)`.
//
// Mechanism: CRLF-ended Layout card bodies go through the html scanner,
// whose `/\s+/m` (scanners/html.rb:101) matches the CRLF PAIR as one
// `:space` token, and the encoder escape table (encoders/html.rb:139) maps
// every control code in 0x0B-0x1F to a literal space - 0x0D (`\r`)
// included. Without `to_unix` the engine therefore emits " \n" where the
// reference emits "\n": one extra space per line inside the <pre> block.
// LF-only fixtures cannot catch it; only CRLF-ended bodies do.

import { describe, expect, it } from "vitest";

import { highlight } from "../../../../src/card/render/code-highlighting/index.js";
import { scanHtml } from "../../../../src/card/render/code-highlighting/scanners/html.js";

/** Strip the highlight spans so a comparison reads as the source text. */
function logical(pre: string): string {
  return pre.replace(/<span[^>]*>/g, "").replace(/<\/span>/g, "");
}

/** The <pre> body of a CodeRay DIV block. */
function preBlock(html: string): string {
  const start = html.indexOf("<pre>");
  expect(start, "a <pre> block in the highlighted output").toBeGreaterThan(-1);
  return html.slice(start + "<pre>".length, html.indexOf("</pre>"));
}

describe("code highlighting: coderay to_unix (CRLF -> LF at the scan dispatch)", () => {
  // --- the pure function: a CRLF-ended layout body ----------------------
  const FRAI_RAW =
    '<body id={{_MAIN|name}} align="center">\r\n{{MoKi_menus|naked}}\r\n\r\n' +
    '<div align="center" id="primary"> \r\n{{_main|naked}}\r\n</div>\r\n\r\n</body>';

  // Span-stripped <pre> from the reference render for that body.
  // Note `primary&quot;&gt; \n`: the AUTHORED space before the newline is
  // kept, which is the discriminating byte - a fix that trimmed all
  // whitespace would lose it, and a fix that kept the CR would add a space
  // to the other six lines.
  const FRAI_EXPECTED_PRE =
    '&lt;body id={{_MAIN|name}} align=&quot;center&quot;&gt;\n{{MoKi_menus|naked}}\n\n' +
    '&lt;div align=&quot;center&quot; id=&quot;primary&quot;&gt; \n{{_main|naked}}\n' +
    '&lt;/div&gt;\n\n&lt;/body&gt;';

  it("rewrites CRLF to LF so a CRLF body matches the oracle capture", () => {
    const out = highlight(FRAI_RAW, "html");
    expect(logical(preBlock(out))).toBe(FRAI_EXPECTED_PRE);
  });

  it("emits no space before the newline that followed a CRLF", () => {
    const pre = logical(preBlock(highlight(FRAI_RAW, "html")));
    // 7 CRLF in the body; the expected string has exactly ONE " \n", the
    // authored space on the `<div ...> \r\n` line.
    expect(pre.split("\n").length - 1).toBe(7);
    expect(pre.match(/ \n/g) ?? []).toHaveLength(1);
  });

  it("keeps the authored space that sits immediately before a CRLF", () => {
    // `<div ...> \r\n` - the space is authored, the CR is not. Dropping the
    // CR must not take the space with it.
    const pre = logical(preBlock(highlight(FRAI_RAW, "html")));
    expect(pre).toContain("primary&quot;&gt; \n");
  });

  it("rewrites a LONE CR as LF (the `\\r\\n?` branch of to_unix)", () => {
    const lf = highlight("<p>a\r\nb</p>", "html");
    const lone = highlight("<p>a\rb</p>", "html");
    // to_unix's regex is /\r\n?/ - the CR is consumed either way.
    expect(logical(preBlock(lone))).toBe(logical(preBlock(lf)));
  });

  it("normalizes for the css and json scanners too, not just html", () => {
    // scanner.rb:137 normalizes before dispatch, so the rewrite is a
    // property of the SCAN, not of one scanner's regexes.
    for (const lang of ["css", "json", "html"] as const) {
      const crlf = highlight("a\r\nb", lang);
      const lf = highlight("a\nb", lang);
      expect(logical(preBlock(crlf)), `lang=${lang}`).toBe(logical(preBlock(lf)));
    }
  });

  it("leaves a body with no CR byte-identical to its LF twin", () => {
    // to_unix's `code.index(?\r) ? ... : code` guard: no CR means the
    // input is returned untouched.
    const body = "<p>plain\nlines</p>";
    expect(highlight(body, "html")).toBe(highlight(body.replace(/\n/g, "\r\n"), "html"));
  });

  it("does NOT change what the raw scanner does with CRLF (the seam is the dispatch)", () => {
    // scanHtml is the scanner alone; Ruby's Scanner#initialize is what
    // normalizes. This documents that the normalization lives one level
    // up, in highlight(), and is not duplicated inside the scanner - so a
    // direct scanHtml caller keeps seeing the raw-scanner behavior.
    const raw = "<p>a\r\nb</p>";
    expect(scanHtml(raw)).toContain(" \n");
    expect(logical(preBlock(highlight(raw, "html")))).not.toContain(" \n");
  });

  it("converts every CRLF in a multi-line body, with no partial application", () => {
    // 43 lines joined with CRLF - 42 separators, so 42 newlines out. The
    // point is the ratio: every separator is rewritten, so NONE of them
    // survives as " \n". A partial fix would leave some.
    const lines = Array.from({ length: 43 }, (_, i) => `<p>line ${i}</p>`);
    const crlfBody = lines.join("\r\n");
    const pre = logical(preBlock(highlight(crlfBody, "html")));
    expect(pre.match(/ \n/g) ?? []).toHaveLength(0);
    expect(pre.split("\n").length - 1).toBe(42);
  });
});

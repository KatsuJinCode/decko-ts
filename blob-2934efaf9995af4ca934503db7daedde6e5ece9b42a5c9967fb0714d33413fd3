// autolink-seams-pins.test.ts -- pin tests for the autolink seam. Each
// expected string below is the exact output the autolinker must produce for
// that input, pinned as a literal so a refactor cannot silently reshape the
// emitted markup.
//
// Families pinned here:
//   A1  uri.rb:63-68+86-89 trailing punctuation re-emitted after the
//       anchor (source.example.org</a>.)
//   A2a uri.rb:53-55 context_ok? anchors REJECTED_PREFIX at $ - a URL in
//       the LABEL of an authored <a> autolinks (nested-anchor case)
//       while a URI inside a quoted attribute stays verbatim
import { expect, it, describe } from "vitest";
import { expandContentLinks } from "../../../src/card/render/format.js";

describe("autolink seams pins (captured oracle bytes)", () => {
  it("A1: re-emits the chopped trailing period after the anchor", () => {
    // oracle: a sample author content view - "reproduced and released under a
    // sample licence" follows the source.example.org anchor WITH its period
    // (uri.rb:88 `"#{link}#{@trailing_punctuation}"`).
    const out = expandContentLinks(
      "Reprinted at http://source.example.org. Reprinted and released under a sample licence",
      undefined,
      undefined,
    );
    expect(out).toBe(
      'Reprinted at <a target="_blank" class="external-link" href="http://source.example.org">http://source.example.org</a>. Reprinted and released under a sample licence',
    );
  });

  it("A1: re-emits the chopped closing paren (article-image oracle)", () => {
    const out = expandContentLinks(
      "reproduced in full (http://author-portal.example.org/SampleImage.htm) with permission",
      undefined,
      undefined,
    );
    expect(out).toBe(
      'reproduced in full (<a target="_blank" class="external-link" href="http://author-portal.example.org/SampleImage.htm">http://author-portal.example.org/SampleImage.htm</a>) with permission',
    );
  });

  it("A2a: autolinks a URL in the LABEL of an authored anchor (org-page oracle)", () => {
    // An authored <a> whose LABEL contains a bare URL: the outer href's URI
    // is preceded by `="` - the $-anchored REJECTED_PREFIX - so it stays
    // verbatim, while the label text is preceded by `">`, which is not
    // rejected, so the HostUri chunk autolinks the label into a nested
    // anchor.
    const out = expandContentLinks(
      'or ORG (<a href="http://example.net/">Example.net</a>). He is a fellow',
      undefined,
      undefined,
    );
    expect(out).toBe(
      'or ORG (<a href="http://example.net/"><a target="_blank" class="external-link" href="http://Example.net">Example.net</a></a>). He is a fellow',
    );
  });

  it("A2a: leaves a URI inside a quoted attribute verbatim (broadcaster oracle)", () => {
    // The uri.rb:38/54 rejection class the $-anchor must keep: a URI
    // preceded by `="` (inside the authored href) never anchors.
    const src = '<a href="http://broadcaster.example/segment/guest-essay" target="_blank">here</a>';
    expect(expandContentLinks(src, undefined, undefined)).toBe(src);
  });
});

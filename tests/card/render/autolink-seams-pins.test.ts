// autolink-seams-pins.test.ts -- the autolink seam's committed pin tests
// (branch lane-autolink over 9d72e74, 2026-10-01). Every expected byte below
// is quoted from the CAPTURED oracle bytes (expected-v2 view-lane shards;
// probe dumps tmp/lane-autolink-hl-probe in the worktree) - never
// hand-written to force green.
//
// Families pinned here (its committed seam):
//   A1  uri.rb:63-68+86-89 trailing punctuation re-emitted after the
//       anchor (sample-author oracle: source.example.org</a>.)
//   A2a uri.rb:53-55 context_ok? anchors REJECTED_PREFIX at $ - a URL in
//       the LABEL of an authored <a> autolinks (USABP nested-anchor oracle)
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
    // oracle shard-000025 <USABP card> +discussion open:
    // `or ORG (<a href="http://example.net/"><a target="_blank"
    // class="external-link" href="http://Example.net">Example.net</a></a>).`
    // The outer href's URI is context-rejected (preceded by `="` - the
    // $-anchored REJECTED_PREFIX) and stays verbatim; the LABEL text is
    // preceded by `">` - not $-rejected - so the HostUri chunk autolinks it.
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

// autolink-seams-pins.test.ts -- the autolink seam's committed pin tests
// (branch lane-autolink over 9d72e74, 2026-10-01). Every expected byte below
// is quoted from the CAPTURED oracle bytes (expected-v2 view-lane shards;
// probe dumps tmp/lane-autolink-hl-probe in the lane worktree) - never
// hand-written to force green.
//
// Families pinned here (the lane's committed seam):
//   A1  uri.rb:63-68+86-89 trailing punctuation re-emitted after the
//       anchor (sabrina mejias / Dan Williams oracle: williamscraig.com</a>.)
//   A2a uri.rb:53-55 context_ok? anchors REJECTED_PREFIX at $ - a URL in
//       the LABEL of an authored <a> autolinks (USABP nested-anchor oracle)
//       while a URI inside a quoted attribute stays verbatim
import { expect, it, describe } from "vitest";
import { expandContentLinks } from "../../../src/card/render/format.js";

describe("autolink seams pins (captured oracle bytes)", () => {
  it("A1: re-emits the chopped trailing period after the anchor", () => {
    // oracle: sabrina mejias content view - "reserved to the Commons are"
    // follows the williamscraig.com anchor WITH its period (uri.rb:88
    // `"#{link}#{@trailing_punctuation}"`).
    const out = expandContentLinks(
      "Originated at http://williamscraig.com. Also originated and reserved to the Commons",
      undefined,
      undefined,
    );
    expect(out).toBe(
      'Originated at <a target="_blank" class="external-link" href="http://williamscraig.com">http://williamscraig.com</a>. Also originated and reserved to the Commons',
    );
  });

  it("A1: re-emits the chopped closing paren (Medcalf oracle)", () => {
    const out = expandContentLinks(
      "reproduced in full (http://dlmiller.mysite.syr.edu/LegendeImage.htm) with permission",
      undefined,
      undefined,
    );
    expect(out).toBe(
      'reproduced in full (<a target="_blank" class="external-link" href="http://dlmiller.mysite.syr.edu/LegendeImage.htm">http://dlmiller.mysite.syr.edu/LegendeImage.htm</a>) with permission',
    );
  });

  it("A2a: autolinks a URL in the LABEL of an authored anchor (USABP oracle)", () => {
    // oracle shard-000025 USABP Presentation 20181102+discussion open:
    // `or ABC (<a href="http://abcglobal.net/"><a target="_blank"
    // class="external-link" href="http://ABCglobal.net">ABCglobal.net</a></a>).`
    // The outer href's URI is context-rejected (preceded by `="` - the
    // $-anchored REJECTED_PREFIX) and stays verbatim; the LABEL text is
    // preceded by `">` - not $-rejected - so the HostUri chunk autolinks it.
    const out = expandContentLinks(
      'or ABC (<a href="http://abcglobal.net/">ABCglobal.net</a>). He is a fellow',
      undefined,
      undefined,
    );
    expect(out).toBe(
      'or ABC (<a href="http://abcglobal.net/"><a target="_blank" class="external-link" href="http://ABCglobal.net">ABCglobal.net</a></a>). He is a fellow',
    );
  });

  it("A2a: leaves a URI inside a quoted attribute verbatim (Zombie oracle)", () => {
    // The uri.rb:38/54 rejection class the $-anchor must keep: a URI
    // preceded by `="` (inside the authored href) never anchors.
    const src = '<a href="http://billmoyers.com/segment/henry-giroux" target="_blank">here</a>';
    expect(expandContentLinks(src, undefined, undefined)).toBe(src);
  });
});

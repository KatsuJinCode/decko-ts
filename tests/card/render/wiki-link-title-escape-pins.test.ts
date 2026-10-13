// Wiki-link anchor escape pins.
//
// Two byte contracts at the expandWikiLinks level (engine-optional: the
// wanted path needs no storage):
//
// 1. The anchor TEXT is NOT html-escaped (title.rb wrapped_title splits
//    joints only) while the title ATTRIBUTE is. Pre-fix the text was
//    h()-escaped: a quoted label rendered
//    `>Pages tagged with &quot;...&quot;<` where the reference carries
//    the raw quotes.
// 2. The attribute escape leaves SINGLE quotes raw. Pre-fix h() emitted
//    &#39;: an apostrophe-bearing wanted link carries
//    title="<name>'<rest>" with the raw apostrophe.

import { describe, it, expect } from "vitest";
import { expandWikiLinks } from "../../../src/card/render/format.js";

describe("expandWikiLinks anchor escape contract", () => {
  it("keeps the label text raw while escaping the title attribute", () => {
    const html = expandWikiLinks(
      '[[Sample Card 168+*referred_to_by|Pages tagged with "Sample Card 168"]]',
      undefined,
      undefined,
      undefined,
    );
    expect(html).toContain('title="Pages tagged with &quot;Sample Card 168&quot;"');
    expect(html).toContain('>Pages tagged with "Sample Card 168"</span>');
    expect(html).not.toContain("&quot;Sample Card 168&quot;</span>");
  });

  it("leaves single quotes raw in the title attribute", () => {
    const html = expandWikiLinks(
      "[[Casey O'Neil]]",
      undefined,
      undefined,
      undefined,
    );
    expect(html).toContain('title="Casey O\'Neil"');
    expect(html).not.toContain("&#39;");
    // The wanted href keeps the card[name] query (the apostrophe makes the
    // name non-standardish).
    expect(html).toContain('href="/Casey_O_Neil?card%5Bname%5D=Casey+O%27Neil"');
  });
});

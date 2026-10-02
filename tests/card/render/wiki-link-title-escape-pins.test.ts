// positive-family lane (2026-10-02): wiki-link anchor escape pins.
//
// Two oracle pins drove engine fixes; this file holds their byte contracts
// at the expandWikiLinks level (engine-optional: the wanted path needs no
// storage):
//
// 1. The anchor TEXT is NOT html-escaped (title.rb wrapped_title splits
//    joints only) while the title ATTRIBUTE is. Pre-fix the text was
//    h()-escaped: Process Arts (page-lane shard-000000, offset 12658)
//    rendered `>Pages tagged with &quot;Process Arts&quot;<` where the
//    oracle carries the raw quotes — the +10 family.
// 2. The attribute escape leaves SINGLE quotes raw. Pre-fix h() emitted
//    &#39;: the Nicole Le'Strix wanted link (page-lane shard-000010,
//    Archetypal role playing discussion on Facebook Aug 2012, offset
//    10190) carries title="Nicole Le'Strix" with the raw apostrophe —
//    the +4 residual.

import { describe, it, expect } from "vitest";
import { expandWikiLinks } from "../../../src/card/render/format.js";

describe("expandWikiLinks anchor escape contract", () => {
  it("keeps the label text raw while escaping the title attribute", () => {
    const html = expandWikiLinks(
      '[[Process Arts+*referred_to_by|Pages tagged with "Process Arts"]]',
      undefined,
      undefined,
      undefined,
    );
    expect(html).toContain('title="Pages tagged with &quot;Process Arts&quot;"');
    expect(html).toContain('>Pages tagged with "Process Arts"</span>');
    expect(html).not.toContain("&quot;Process Arts&quot;</span>");
  });

  it("leaves single quotes raw in the title attribute", () => {
    const html = expandWikiLinks(
      "[[Nicole Le'Strix]]",
      undefined,
      undefined,
      undefined,
    );
    expect(html).toContain('title="Nicole Le\'Strix"');
    expect(html).not.toContain("&#39;");
    // The wanted href keeps the card[name] query (the apostrophe makes the
    // name non-standardish) — the corpus pin this must not disturb.
    expect(html).toContain('href="/Nicole_Le_Strix?card%5Bname%5D=Nicole+Le%27Strix"');
  });
});

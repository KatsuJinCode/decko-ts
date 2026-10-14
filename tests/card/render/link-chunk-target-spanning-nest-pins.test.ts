// link-chunk target-spanning nest.
//
// WHAT THIS PINS
//   Ruby's Link chunk (card-mod-content lib/card/content/chunk/link.rb:14)
//   declares `full_re /\[\[([^\]]+)\]\]/` and Content::Parser scans the RAW
//   string ONCE, in position order, asking each registered class to
//   full_match the raw remainder (card-1.110.0 lib/card/content/parser.rb:18-27).
//   The target charset is `[^\]]` — braces are ADMITTED — so a nest can sit
//   INSIDE the target, and the braces stay literal in the resulting href.
//
//   The TS nest scanner splits `{{…}}` out FIRST, so
//   `<p>[[/new/{{_self|linkname}}|add a {{_self|name}} card]]</p>` arrives as
//   five pieces and NO single text piece holds both `[[` and `|`. The port's
//   label-side span (matchLinkWrappedNestOpener) therefore never fired and the
//   raw `[[…]]` wikitext leaked into the render.
//
//   PINNED BYTES — the `content` and `open` renders of a
//   `Cardtype+*type+*default` rule card carry:
//     <a class="internal-link" href="/new/{{_self|linkname}}">add a {{_self|name}} card</a>
//   The braces are RAW on both sides — target AND label — which
//   is the byte contract, not an omission of expansion.
//
//   Seeded test-storage cards only. The target is an
//   explicit `/`-rooted resource path, so renderLinkChunk's internal-link arm
//   needs no fetch.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RenderFormat, expandWikiLinks, expandContentLinks } from "../../../src/card/render/format.js";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { setDefaultModLoader } from "../../../src/card/mod-loader.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

// The pinned source line (the
// `[[/new/…|…]]` link inside the `add a {{_self|name}} card` paragraph).
const LINK_SOURCE =
  "<p>[[/new/{{_self|linkname}}|add a {{_self|name}} card]]</p>";
// The expected bytes for that line.
const LINK_RENDERED =
  '<p><a class="internal-link" href="/new/{{_self|linkname}}">add a {{_self|name}} card</a></p>';

beforeAll(() => {
  defaultDeckLoader();
});

afterAll(() => {
  setDefaultModLoader(undefined);
});

async function seedLinkDeck(): Promise<{ storage: RenderTestStorage; fmt: RenderFormat }> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, {
    id: 88,
    name: "Link Target",
    typeId: 2,
    dbContent: "BODY",
  });
  storage.fetcher.installNameEnvironment();
  await storage.fetcher.warmLexicon([2, 88]);
  const fmtCard = await storage.engine.prepareItemForRender("Link Target");
  if (fmtCard === undefined) throw new Error("Link Target not preparable after seed");
  return { storage, fmt: new RenderFormat(fmtCard, storage.engine) };
}

describe("link chunk whose nest splits the TARGET (link.rb:14 full_re)", () => {
  it("renders the internal-link anchor with the braces raw in target and label", async () => {
    const { storage, fmt } = await seedLinkDeck();
    try {
      expect(fmt.processContent(LINK_SOURCE)).toBe(LINK_RENDERED);
    } finally {
      storage.close();
    }
  });

  it("still expands the label-side nest when pipe and [[ share one text piece", async () => {
    // The label-side span is the pre-existing path and must be untouched by
    // the target-side addition: `[[/ | {{*logo}}]]` keeps the nest inside
    // the anchor.
    const { storage, fmt } = await seedLinkDeck();
    try {
      const html = fmt.processContent("[[/ | {{*logo}}]]");
      expect(html).toContain('<a class="internal-link" href="/">');
      expect(html).toContain("</a>");
      expect(html).not.toContain("[[");
    } finally {
      storage.close();
    }
  });

  it("leaves a bare [[Target]] that spans no nest on the plain wiki-link pass", async () => {
    const { storage, fmt } = await seedLinkDeck();
    try {
      const html = fmt.processContent("[[Link Target]]");
      expect(html).toContain('<a class="known-card" href="/Link_Target">');
      expect(html).not.toContain("[[");
    } finally {
      storage.close();
    }
  });

  it("leaves an unterminated [[ opener on the pre-fix per-piece path", async () => {
    // No closer anywhere: Ruby's chunker would not have matched a Link
    // either, so no anchor is invented and the opener bytes pass through —
    // and because the walk resumes at the OPENING piece's successor, the
    // interleaved nest renders exactly as the pre-fix per-piece walk
    // rendered it (through contentNest). This assertion is the
    // no-behavior-change contract for the bail-out, not a new byte shape:
    // `{{_self|linkname}}` resolves against the format's own card.
    const { storage, fmt } = await seedLinkDeck();
    try {
      expect(fmt.processContent("<p>[[/new/{{_self|linkname}}|no closer")).toBe(
        "<p>[[/new/Link_Target|no closer",
      );
    } finally {
      storage.close();
    }
  });
});

// ---------------------------------------------------------------------------
// The SECOND half of the same mechanism: WIKI_LINK_REGEXP's target atom.
//
// processContent's piece walker above is the label/target SPLIT path. The
// plain pass is expandWikiLinks, whose target class `[^\[\]\n|]` splits at
// the first pipe EVEN WHEN THAT PIPE BELONGS TO A NEST — on the pinned
// source line it produced target `/new/{{_self`, label
// `linkname}}|add a {{_self|name}} card` (measured before the atom change).
//
// The atom is `(?:[^\[\]\n|{]|\{\{[^{}]*\}\})+?`. The `{` EXCLUSION is what
// makes it bite: with `{` left in the literal arm the lazy quantifier reaches
// `/new/{{_self` char by char and the change is a no-op (new and old agreed
// on 9/9 cases when measured that way).
// ---------------------------------------------------------------------------
describe("WIKI_LINK_REGEXP target atom admits a whole nest", () => {
  it("keeps a nest's own pipe inside the target", () => {
    const html = expandContentLinks(
      "[[/new/{{_self|linkname}}|add a {{_self|name}} card]]",
      undefined,
      undefined,
      undefined,
    );
    expect(html).toBe(
      '<a class="internal-link" href="/new/{{_self|linkname}}">add a {{_self|name}} card</a>',
    );
  });

  it("leaves every ordinary wiki link byte-identical", () => {
    // The blast-radius contract. Each of these matched the OLD class with the
    // same target and label, and must still.
    const cases: Array<[string, string]> = [
      // `Anyone` and `A` are name_standardish, so the wanted href carries no
      // ?card[name]= suffix (path.rb:84-107).
      ["[[Anyone]]", '<a class="wanted-card" href="/Anyone"><span class="card-title" title="Anyone">Anyone</span></a>'],
      ["[[A|B]]", '<a class="wanted-card" href="/A"><span class="card-title" title="B">B</span></a>'],
      ["[[A|B|C]]", '<a class="wanted-card" href="/A"><span class="card-title" title="B|C">B|C</span></a>'],
      // The label keeps objectify's leading space OFF — the nest arm already
      // carries it into the target's trailing `|\s*`.
      ["[[/ | {{*logo}}]]", '<a class="internal-link" href="/">{{*logo}}</a>'],
    ];
    for (const [source, expected] of cases) {
      expect(expandContentLinks(source, undefined, undefined, undefined)).toBe(expected);
    }
  });

  it("still renders the oracle's escaped-bracket and quote-escape pins", () => {
    expect(expandWikiLinks('[[Robin Le\'Strand]]', undefined, undefined, undefined)).toContain(
      'title="Robin Le\'Strand"',
    );
    const tagged = expandWikiLinks(
      '[[Sample Card 168+*referred_to_by|Pages tagged with "Sample Card 168"]]',
      undefined,
      undefined,
      undefined,
    );
    expect(tagged).toContain('title="Pages tagged with &quot;Sample Card 168&quot;"');
    expect(tagged).toContain('>Pages tagged with "Sample Card 168"</span>');
  });
});

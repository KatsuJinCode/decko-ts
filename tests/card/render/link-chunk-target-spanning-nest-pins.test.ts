// link-chunk target-spanning nest (viewsig lane, 2026-10-02).
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
//   ORACLE PIN — expected-v2/view-lane recapture-raw-shard-000000.jsonl,
//   `Cardtype+*type+*default`, BOTH the `content` and `open` views carry:
//     <a class="internal-link" href="/new/{{_self|linkname}}">add a {{_self|name}} card</a>
//   That card was -32 bytes on each view at base 9689bf9 (the whole anchor
//   missing). Note the braces are RAW on both sides — target AND label — which
//   is the byte contract, not an omission of expansion.
//
//   Seeded test-storage cards; nothing here reads the corpus. The target is an
//   explicit `/`-rooted resource path, so renderLinkChunk's internal-link arm
//   needs no fetch.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RenderFormat } from "../../../src/card/render/format.js";
import { defaultDeckLoader } from "../../../src/card/mod-loader/default-mod-deck.js";
import { setDefaultModLoader } from "../../../src/card/mod-loader.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

// The oracle's exact source line (Cardtype+*type+*default dbContent, the
// `[[/new/…|…]]` link inside the `add a {{_self|name}} card` paragraph).
const LINK_SOURCE =
  "<p>[[/new/{{_self|linkname}}|add a {{_self|name}} card]]</p>";
// The oracle's expected bytes for that line.
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
    // the target-side addition: `[[/ | {{*logo}}]]` (classic-layout oracle,
    // view-lane shard-000000 entry 314) keeps the nest inside the anchor.
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

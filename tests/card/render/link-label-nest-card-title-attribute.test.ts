// The card-title span's TITLE ATTRIBUTE has two branches, and one of them
// had no coverage that runs in a clean checkout.
//
// format.ts:2935 (the attribute) and :2941 (the span that carries it):
//
//   const titleAttr = labelHtmlSafe && label !== ""
//     ? label.replace(/"/g, "&quot;")
//     : h(label || target);
//
// `labelHtmlSafe` is the third argument of renderLinkChunk, and its only
// caller that passes it is format.ts:2752 — `renderLinkChunk(opener.target,
// label, sawNest)` — true when the link's LABEL contained a nest. So a
// title rendered from content with a nest is an html_safe buffer: Rails'
// tag_option escapes only its double quotes, and the nest's own markup
// survives verbatim. A plain-text label takes the other branch and is fully
// escaped. The corpus case that exercises this is
// `[[_left|{{_left+image}}]]` (the `Item+short` structure's
// `[[_left|{{_left+image}}]]` titles the raw denied-nest markup).
//
// WHY THIS SUITE EXISTS: that corpus case is pinned only by
// cql-append-virtual-item-short-corpus.test.ts, which is gated behind
// CQL_APPEND_ITEM_SHORT_REPLAY=1 and needs the key-repaired bench staged at
// tmp/raw-ground-truth (sha 305caac1). A clean checkout skips it — verified:
// `npx vitest run tests/card/render/cql-append-virtual-item-short-corpus.test.ts`
// reports 1 skipped, "corpus replay was not requested". The
// reference-harness synthetic-v1 fixture does not carry a card with a
// nest-in-link-label either, so nothing anyone can run covered the branch.
//
// Adding the card to that fixture is not possible here: its expected/ bytes
// are the Ruby oracle's own output, re-captured through the oracle Docker
// image (reference-harness/oracle/Dockerfile), and Docker is not installed
// on this machine. Oracle bytes are never hand-written. This suite covers
// the same branch from the engine's side instead.
//
// Storage: the render suite's in-memory core-schema storage. All seeded
// content is SYNTHETIC, per the stream data rule. No oracle required.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

const SET_TYPE_ID = 1;
const SETTING_TYPE_ID = 2;
const LIST_TYPE_ID = 3;
const RICH_TYPE_ID = 4;

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  await seedCard(s, { id: 4, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: SET_TYPE_ID, dbContent: "{}" });
  await seedCard(s, {
    id: 50,
    leftId: 10,
    rightId: 20,
    typeId: LIST_TYPE_ID,
    dbContent: "[[Anyone]]",
  });
  await seedReference(s, 50, 6, "anyone");
  await seedCard(s, { id: 80, name: "Link Target", typeId: RICH_TYPE_ID, dbContent: "target body" });
  await seedCard(s, { id: 81, name: "Nest Target", typeId: RICH_TYPE_ID, dbContent: "nest body" });
  // The holder whose CONTENT is the link. Its title is the attribute under
  // test; the label is `{{Nest Target}}`, so sawNest is true.
  await seedCard(s, {
    id: 82,
    name: "Titled Content",
    typeId: RICH_TYPE_ID,
    dbContent: '[[Link Target|{{Nest Target}}]]',
  });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("a link label containing a nest takes the html_safe title branch (format.ts:2935)", () => {
  // The LINK's own span, not the card's bar header — the header's
  // card-title is a different call site whose title is always plain text.
  const LINK_TITLE =
    /<a class="known-card" href="\/Link_Target"><span class="card-title" title="([^"]*)">/;

  it("keeps the nest's markup in title=, escaping only its double quotes", async () => {
    const html = await storage!.engine.render("Titled Content", "content");

    const titleAttr = html.match(LINK_TITLE)?.[1];
    expect(titleAttr).toBeDefined();
    // The branch under test is `labelHtmlSafe && label !== ""`: the label was
    // rendered from content carrying a nest, so it is an html_safe buffer and
    // Rails' tag_option escapes only its double quotes. The nest's own markup
    // therefore survives INSIDE the attribute value.
    expect(titleAttr).toMatch(/^<div id=&quot;nest_target-titled-view&quot;/);
    expect(titleAttr).toContain("Nest Target");
    // Every quote that reached the attribute was escaped — which is what lets
    // `[^"]*` read the whole value back. A bare quote escaping the replace()
    // would truncate this capture and the assertions above would not match.
    expect(titleAttr).not.toContain('"');
    expect(titleAttr!.length).toBeGreaterThan(200);
  });

  it("escapes the title fully when the label is plain text (the other branch)", async () => {
    await seedCard(storage!, {
      id: 83,
      name: "Plain Label Content",
      typeId: RICH_TYPE_ID,
      dbContent: '[[Link Target|a "quoted" label]]',
    });
    const html = await storage!.engine.render("Plain Label Content", "content");

    // No nest in the label, so sawNest is false and the whole label goes
    // through h(): the quotes become &quot; and no markup survives.
    const titleAttr = html.match(LINK_TITLE)?.[1];
    expect(titleAttr).toBeDefined();
    expect(titleAttr).toContain("&quot;quoted&quot;");
    expect(titleAttr).not.toContain("<");
  });
});
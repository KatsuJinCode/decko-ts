// External-link anchor attribute order - the "target attribute placement"
// divergence.
//
// Mechanism: Ruby renders every external resource link through
// card-mod-format set/all/links.rb#link_to_resource (html block, :128-132)
// -> add_resource_opts (:150-153): opts[:target] = "_blank" and the
// resource_type class are inserted into the opts hash BEFORE super (Rails
// link_to), and Rails' url_for inserts :href LAST - so the tag renders
// `<a target="_blank" class="external-link" href="...">`. Every external
// anchor in the recorded surface is target-first, zero target-last.
//
// The engine's bare-URL autolink path already emits target-first
// (format.ts the URI chunk scanner), but the two WIKILINK external
// emitters (renderLinkChunk + expandWikiLinks, format.ts) emitted
// `<a class="external-link" href="..." target="_blank">` - target LAST:
// the expected bytes carry `target="_blank" ` before the href while the
// defect appended ` target="_blank"` after it.
//
// The raw authored content is wikilink syntax, not HTML
// (`[[http://example.net|Association Building Community]]`), so the
// anchor shape is decided by the link renderer, not the stored bytes.

import { describe, expect, it } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

async function seedExternalLinkDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 3, name: "RichText", codename: "rich_text", typeId: 2 });
  await seedCard(storage, { id: 900, name: "*all", codename: "all", typeId: 2 });
  await seedCard(storage, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
  await seedCard(storage, { id: 904, name: "*title", codename: "title", typeId: 2 });
  await seedCard(storage, { id: 905, name: "*favicon", codename: "favicon", typeId: 2 });
  await seedCard(storage, { id: 906, name: "*ace", codename: "ace", typeId: 2 });
  await seedCard(storage, { id: 907, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
  await seedCard(storage, {
    id: 910,
    leftId: 900,
    rightId: 901,
    typeId: 2,
    dbContent: "Probe Layout",
  });
  await seedCard(storage, {
    id: 911,
    name: "Probe Layout",
    typeId: 2,
    dbContent: "{{_main|titled}}",
  });
  // The page card: both external-link shapes - the bare-URL autolink and
  // the `[[url|label]]` wikilink.
  await seedCard(storage, {
    id: 14795,
    name: "External Link Probe",
    typeId: 3,
    dbContent:
      "This resource is provided by example.com and supported by " +
      "the non-profit [[http://example.net|Association Building Community]].",
  });
  await storage.fetcher.codenames.ensureLoaded();
  return storage;
}

describe("external-link anchors render target first (links.rb opts insertion order)", () => {
  it("emits <a target=... class=... href=...> for wikilink and autolink externals", async () => {
    const storage = await seedExternalLinkDeck();
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "External Link Probe");
    // links.rb html block + add_resource_opts: target, class, href.
    expect(page).toContain(
      '<a target="_blank" class="external-link" href="http://example.net">Association Building Community</a>',
    );
    // The autolink path (bare URL) - already correct before this port; the
    // assertion pins that the wikilink fix does not touch it.
    expect(page).toContain(
      '<a target="_blank" class="external-link" href="http://example.com">example.com</a>',
    );
  });
});

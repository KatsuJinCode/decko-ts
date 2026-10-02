// Escape-family suite: the two over-escaping sites the pass-15 triage's
// "double-escape" class resolves to (58 page-lane fails at 017b182; the
// class also contains pointer-item-shape and help-content pages a pure
// escaping fix cannot flip -- see the receipt).
//
// Mechanism 1 -- URI-autolink LABEL (card-mod-content chunk/uri.rb):
//   Uri#process_uri_chunk -> format.link_to_resource @link_text, process_text
//   -> html links.rb#link_to: `text = raw(text || opts[:href])` -> the label
//   is marked html_safe and content_tag renders it VERBATIM (no escape).
//   The href is NOT safe: Rails tag_helper escapes option values with
//   ERB::Util.html_escape, so authored `&amp;` entities in the stored URL
//   double to `&amp;amp;` in the href while the label keeps the authored
//   bytes. Exemplar (Montessori Council - benefits, page-lane): oracle
//   `href="...com_content&amp;amp;view=..."` + label
//   `...com_content&amp;view=...`; the engine emitted `&amp;amp;` in BOTH.
//
// Mechanism 2 -- menu popover data-bs-title (card-mod-format
//   set/all/html/menu.rb:109-111 help_title):
//   `"#{name_parts_links} (#{render_type}) #{full_page_link}"` where
//   name_parts_links joins link_to_card part anchors whose bodies are the
//   RAW name (html link_to: `text = raw(text || opts[:href])`; no text arg
//   -> the name string, raw-marked). The anchor's attribute value escapes
//   that composite ONCE (ERB::Util.html_escape). Oracle pin (Mikko's
//   Blog+*self page-lane): data-bs-title unescapes to
//   `<a class="known-card" href="/Mikko_s_Blog">Mikko's Blog</a>+...` --
//   the apostrophe appears exactly once, as `&#39;` in the attribute
//   bytes. The engine built the title with an h()-escaped body and then
//   h()-escaped the composite, emitting `Mikko&amp;#39;s Blog`.
//
// Regression guards (the task's both-directions rule): the hrefs and the
// attribute boundary keep escaping -- a RAW `&`/`'`/`<` in content or a
// name still produces the single-escaped attribute bytes, and authored
// entities never get UNescaped.

import { describe, expect, it } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

async function seedEscapeProbeDeck(pageContent: string): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 3, name: "RichText", codename: "rich_text", typeId: 2 });
  await seedCard(storage, { id: 4, name: "Person", codename: "person", typeId: 2 });
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
  await seedCard(storage, {
    id: 14700,
    name: "Escape Probe",
    typeId: 3,
    dbContent: pageContent,
  });
  await storage.fetcher.codenames.ensureLoaded();
  return storage;
}

describe("URI-autolink anchors escape the href once and the label verbatim", () => {
  it("authored &amp; entities: href doubles once, label keeps authored bytes", async () => {
    // The Montessori Council - benefits exemplar shape: the stored Source
    // content carries HTML-escaped query separators.
    const storage = await seedEscapeProbeDeck(
      "Read http://www.montessori.org/imc/index.php?option=com_content&amp;view=article&amp;id=334 today.",
    );
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "Escape Probe");
    // href: attribute-boundary escape of the authored entities (once more).
    expect(page).toContain(
      'href="http://www.montessori.org/imc/index.php?option=com_content&amp;amp;view=article&amp;amp;id=334"',
    );
    // label: links.rb `text = raw(text)` -- the stored bytes verbatim.
    expect(page).toContain(
      ">http://www.montessori.org/imc/index.php?option=com_content&amp;view=article&amp;id=334</a>",
    );
    // the over-escape this suite fixes: the label must NOT carry &amp;amp;.
    expect(page).not.toContain(
      ">http://www.montessori.org/imc/index.php?option=com_content&amp;amp;view=",
    );
  });

  it("raw & in content: href escapes it once, label leaves it raw", async () => {
    const storage = await seedEscapeProbeDeck(
      "See http://x.org/a?b=1&c=2 and http://x.org/b?<tag> now.",
    );
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "Escape Probe");
    // href: raw & escaped once (and the raw < must not leak into the tag).
    expect(page).toContain('href="http://x.org/a?b=1&amp;c=2"');
    // label: raw bytes verbatim (Ruby emits raw(text) -- decko trusts
    // content authors; the regression direction this pins is that the
    // engine does not ADD an escape level here).
    expect(page).toContain(">http://x.org/a?b=1&c=2</a>");
  });

  it("wikilink explicit-target labels stay verbatim too (same link_to path)", async () => {
    const storage = await seedEscapeProbeDeck(
      "Q&amp;A reading: [[http://x.org/faq|Q&amp;A page]] and [[http://x.org/help|Tips & tricks]].",
    );
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "Escape Probe");
    expect(page).toContain(
      '<a target="_blank" class="external-link" href="http://x.org/faq">Q&amp;A page</a>',
    );
    expect(page).toContain(
      '<a target="_blank" class="external-link" href="http://x.org/help">Tips & tricks</a>',
    );
  });
});

describe("menu popover data-bs-title escapes the composite exactly once", () => {
  it("part anchor bodies are raw pre-attribute: apostrophe shows as &#39; once", async () => {
    // The Mikko's Blog+*self exemplar shape: a compound name with an
    // apostrophe renders the menu help popover; the data-bs-title value
    // unescapes to `<a ...>Mikko's Blog</a>+...` (raw bodies, one
    // attribute-level escape).
    const storage = await seedEscapeProbeDeck("Body text.");
    await seedCard(storage, { id: 920, name: "*self", codename: "self", typeId: 2 });
    await seedCard(storage, { id: 14703, name: "O'Brien Deck", typeId: 3, dbContent: "x" });
    await seedCard(storage, {
      id: 14704,
      leftId: 14703,
      rightId: 920,
      typeId: 2,
      dbContent: "",
    });
    await storage.fetcher.codenames.ensureLoaded();
    const page = await renderPageBytes(storage.engine, "O'Brien Deck+*self");
    // exactly one escape level on the apostrophe inside the attribute
    expect(page).toContain("&gt;O&#39;Brien Deck&lt;/a&gt;+&lt;a");
    expect(page).toContain("href=&quot;/O_Brien_Deck&quot;&gt;O&#39;Brien Deck&lt;/a&gt;");
    // and never the doubled form
    expect(page).not.toContain("O&amp;#39;Brien");
  });

  it("a name with raw < still attribute-escapes (regression direction)", async () => {
    const storage = await seedEscapeProbeDeck("Body text.");
    await seedCard(storage, { id: 920, name: "*self", codename: "self", typeId: 2 });
    await seedCard(storage, { id: 14705, name: "A<B Deck", typeId: 3, dbContent: "x" });
    await seedCard(storage, {
      id: 14702,
      leftId: 14705,
      rightId: 920,
      typeId: 2,
      dbContent: "",
    });
    await storage.fetcher.codenames.ensureLoaded();
    const setPage = await renderPageBytes(storage.engine, "A<B Deck+*self");
    // the composite escapes ONCE at the attribute boundary: the raw < of
    // the part name becomes &lt; exactly once (no &amp;lt;)
    expect(setPage).toContain("&gt;A&lt;B Deck&lt;/a&gt;+&lt;a");
    expect(setPage).not.toContain("A&amp;lt;B");
  });
});

// Escape-family lane, quote-style class (9 page-lane fails at 017b182):
// the FILE cardtype's html :core view.
//
// Ruby chain: card-mod-carrierwave set/type/file.rb -- the html-format
// core view is set/type/file/core.haml:
//     %a{ href: source }<
//       = t :carrierwave_download, title: title_in_context(voo.title)
//   - config/locales/en.yml:5 `carrierwave_download: Download %{title}`
//   - title_in_context (card-1.110.0 lib/card/format/context_names.rb:49-55)
//   - relativizes the card name against the format's context names, so the
//     file card `Daniel Ferreira+description+bio` nested inside the Paula
//     Craig page labels `Download +description+bio`.
//   - HAML renders attributes with the apostrophe attr_wrapper by default,
//     so the anchor is `<a href='SOURCE'>Download TITLE</a>`.
//
// The engine emitted `<a href="SOURCE">SOURCE</a>` (label = the URL,
// double-quoted href) -- the exact quote-style diff on all 9 exemplars
// (Werkshop Museum `Download +Documents`, David K Weinstock
// `Download +description+bio`, June Jessup `Download +description+resume`,
// Windows - JS / Daniel Ferreira considerations `Download +doc version`,
// Depth Psychology `Download +File`).
//
// Blank source still renders "" (file.rb:34-45 handle_source short
// circuit) -- the corpus's 319 anonymized file cards pin that arm.

import { describe, expect, it } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

async function seedFileCoreDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 3, name: "RichText", codename: "rich_text", typeId: 2 });
  await seedCard(storage, { id: 20, name: "File", codename: "file", typeId: 2 });
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
  return storage;
}

describe("file-type core view renders the carrierwave download anchor", () => {
  it("web-source file card: <a href='SRC'>Download +child</a> (haml shape)", async () => {
    const storage = await seedFileCoreDeck();
    await seedCard(storage, {
      id: 14710,
      name: "Werkshop Probe",
      typeId: 3,
      dbContent: "{{+Documents|core}}",
    });
    // junction rows resolve through left_id/right_id (the corpus schema's
    // compound shape): the right-part card carries the name column.
    await seedCard(storage, { id: 14712, name: "Documents", typeId: 2 });
    await seedCard(storage, {
      id: 14711,
      leftId: 14710,
      rightId: 14712,
      typeId: 20,
      dbContent: "http://s3.amazonaws.com//files/1865/12160.pdf",
    });
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "Werkshop Probe");
    // core.haml: %a{ href: source } + t(:carrierwave_download) with the
    // context-relativized title; HAML attr_wrapper = apostrophe; the
    // trailing \n is the template's own newline after the `= t` line.
    expect(page).toContain(
      "<a href='http://s3.amazonaws.com//files/1865/12160.pdf'>Download +Documents</a>\n",
    );
    // the pre-fix shape (label = the URL) is gone
    expect(page).not.toContain(
      '<a href="http://s3.amazonaws.com//files/1865/12160.pdf">http://s3.amazonaws.com//files/1865/12160.pdf</a>',
    );
  });

  it("deeper junctions relativize against the page context (+description+bio)", async () => {
    const storage = await seedFileCoreDeck();
    await seedCard(storage, {
      id: 14720,
      name: "Person Probe",
      typeId: 3,
      dbContent: "{{+description|core}}",
    });
    await seedCard(storage, { id: 14723, name: "description", typeId: 2 });
    await seedCard(storage, {
      id: 14721,
      leftId: 14720,
      rightId: 14723,
      typeId: 3,
      dbContent: "{{+bio|core}}",
    });
    await seedCard(storage, { id: 14724, name: "bio", typeId: 2 });
    await seedCard(storage, {
      id: 14722,
      leftId: 14721,
      rightId: 14724,
      typeId: 20,
      dbContent: "http://s3.amazonaws.com//files/14642/62962.pdf",
    });
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "Person Probe");
    expect(page).toContain(
      "<a href='http://s3.amazonaws.com//files/14642/62962.pdf'>Download +description+bio</a>\n",
    );
  });

  it("blank file content still renders the empty wrapper (handle_source)", async () => {
    const storage = await seedFileCoreDeck();
    await seedCard(storage, {
      id: 14730,
      name: "Empty File Probe",
      typeId: 3,
      dbContent: "{{+doc|core}}",
    });
    await seedCard(storage, { id: 14732, name: "doc", typeId: 2 });
    await seedCard(storage, {
      id: 14731,
      leftId: 14730,
      rightId: 14732,
      typeId: 20,
      dbContent: "",
    });
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "Empty File Probe");
    expect(page).not.toContain("Download +doc");
    expect(page).not.toContain("href=''");
  });
});

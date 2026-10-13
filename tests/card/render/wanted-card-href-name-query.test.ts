// The wanted-card href carries Ruby's
// ?card%5Bname%5D=<name> create-prefill query.
//
// Mechanism (card-mod-format-0.20.0/lib/card/path.rb): Card::Path#handle_unknown
// (:89-96) — a path mark naming an UNKNOWN card that is not name_standardish?
// (:107-109, `name.url_key == name.tr(" ", "_")`) stashes
// opts[:card][:name] = name, and #query (:84-87) renders it via Hash#to_param
// as `?card%5Bname%5D=<name>`. url_key (cardname-0.20.0 variants.rb:8-13)
// strips every non-OK4KEY byte ('\p{Word}\*', cardname.rb:37) — dashes
// included — so a dash-named wanted card is NOT standardish (its url_key
// differs from its name) while space-named wanted cards ARE. Known cards
// never carry the query (known_name? :98-100 is an OR: Card.known?
// short-circuits standardish).
//
// The wanted anchor must therefore carry the query:
//   <a class="wanted-card" href="/<url_key>?card%5Bname%5D=<name>">...
// The engine used to emit the bare /<url_key> href (the query alone is the
// difference).

import { describe, expect, it } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

async function seedWantedHrefDeck(pageContent: string): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 3, name: "RichText", codename: "rich_text", typeId: 2 });
  await seedCard(storage, { id: 900, name: "*all", codename: "all", typeId: 2 });
  await seedCard(storage, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
  await seedCard(storage, { id: 904, name: "*title", codename: "title", typeId: 2 });
  await seedCard(storage, { id: 905, name: "*favicon", codename: "favicon", typeId: 2 });
  await seedCard(storage, { id: 906, name: "*ace", codename: "ace", typeId: 2 });
  await seedCard(storage, { id: 907, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
  await seedCard(storage, { id: 910, leftId: 900, rightId: 901, typeId: 2, dbContent: "Probe Layout" });
  await seedCard(storage, { id: 911, name: "Probe Layout", typeId: 2, dbContent: "{{_main|titled}}" });
  await seedCard(storage, {
    id: 28173,
    name: "Href Query Probe",
    typeId: 3,
    dbContent: pageContent,
  });
  await storage.fetcher.codenames.ensureLoaded();
  return storage;
}

describe("wanted-card hrefs carry the card[name] create-prefill query for non-standardish names", () => {
  it("renders the reference anchor bytes verbatim (dash name, card absent)", async () => {
    const storage = await seedWantedHrefDeck(
      "illuminate the traditions and [[mytho-psychology]] studied to understand",
    );
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "Href Query Probe");
    // The exact anchor bytes: query present on a non-standardish name.
    expect(page).toContain(
      '<a class="wanted-card" href="/mytho_psychology?card%5Bname%5D=mytho-psychology">' +
        '<span class="card-title" title="mytho-psychology">mytho-psychology</span></a>',
    );
  });

  it("space-named wanted cards stay bare (standardish: People Green shape)", async () => {
    // "A B".tr(" ", "_") equals the url_key -> standardish -> no query.
    const storage = await seedWantedHrefDeck("a footnote on [[People Green]] here");
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "Href Query Probe");
    expect(page).toContain(
      '<a class="wanted-card" href="/People_Green">' +
        '<span class="card-title" title="People Green">People Green</span></a>',
    );
    expect(page).not.toContain("card%5B");
  });

  it("non-name bytes CGI-escape in the query value (%XX uppercase, byte-wise)", async () => {
    // "&" is not OK4KEY: url_key "Ampersand_Co" != "Ampersand&Co" -> query,
    // value CGI.escape("Ampersand&Co") = "Ampersand%26Co".
    const storage = await seedWantedHrefDeck("the [[Ampersand&Co]] reference");
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "Href Query Probe");
    expect(page).toContain('href="/Ampersand_Co?card%5Bname%5D=Ampersand%26Co"');
  });

  it("known cards never carry the query even when non-standardish", async () => {
    // known_name? (path.rb:98-100): Card.known? short-circuits the
    // standardish check — handle_unknown returns before stashing card[name].
    const storage = await seedWantedHrefDeck("the [[Ampersand&Co]] reference");
    await seedCard(storage, {
      id: 28200,
      name: "Ampersand&Co",
      typeId: 3,
      dbContent: "real card",
    });
    await storage.fetcher.codenames.ensureLoaded();
    storage.fetcher.installNameEnvironment();
    const page = await renderPageBytes(storage.engine, "Href Query Probe");
    expect(page).toContain('<a class="known-card" href="/Ampersand_Co">');
    expect(page).not.toContain("card%5B");
  });
});

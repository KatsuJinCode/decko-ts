// Codename-mark parse survives a temporary-cache reset - the page-22747
// crash class ("Default Layout", the only engine-raised page failure in the
// q2 byte-parity sweep).
//
// Mechanism (traced 2026-09-28, receipt
// brandonDojoTech/tmp/wrong-goal-hunt/default-layout-codename.md):
// Ruby's Card::Name parse of a ":codename" mark cannot fail while the
// codename exists: name.rb:65-82 resolves Codename.id! (the codehash - a
// process memo the temporary cache reset never touches, codename.rb:118-127)
// and then Lexicon.name(id), whose id_to_lex falls back to the DATABASE
// synchronously on any cache miss (lexicon.rb:71-76
// `cache.fetch(id.to_s) { Card.where(id: id)... }`).
//
// The TS port drops that db fallback on purpose (the driver is async -
// src/card/fetch/lexicon.ts:64-78) and substitutes proactive lexicon
// warming. The substitute fails whenever a parse runs while the lexicon's
// temporary cache has been reset: lib/card/cache/temporary.rb
// #within_key_counts resets the WHOLE store on a real overage, and a single
// corpus page render crosses that boundary repeatedly (observed: 8 resets
// during the page 22747 render; the *header subtree render writes enough to
// wipe the *footer lexicon entry between its own parse and the next).
//
// The port's faithful substitute for the db fallback: a ":codename" mark
// only reaches the lexicon lookup AFTER the registry confirmed the codename
// exists (src/card/name.ts idFromString), so the codehash memo - which the
// load already fetched card NAMES for (CODEHASH_SQL selects `name`;
// buildCodehash seeds the lexicon from it, the port of codename.rb
// #seed_caches) - can always serve that card's registered name
// synchronously. This test pins that a within-key-counts-style reset no
// longer turns `{{:footer|content}}` in a page card's own content into a
// CodenameNotFoundError.

import { describe, expect, it } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import { DeckoName } from "../../../src/card/name.js";
import { CodenameNotFoundError } from "../../../src/card/name/errors.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

/** The page-22747 shape in miniature: a page card whose OWN content carries
 *  codename-mark nests, so the page's main render parses `:codename` marks
 *  synchronously - the path the layout-body render only reaches after the
 *  ensureCodenameMarksResolvable re-priming on ordinary pages. */
async function seedCodenameNestDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  // Codename anchors the head path fetches by :mark (unknown codenames
  // raise at :mark parse - see page-layout-nest-warmup-referencing-context).
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 900, name: "*all", codename: "all", typeId: 2 });
  await seedCard(storage, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
  await seedCard(storage, { id: 904, name: "*title", codename: "title", typeId: 2 });
  await seedCard(storage, { id: 905, name: "*favicon", codename: "favicon", typeId: 2 });
  await seedCard(storage, { id: 906, name: "*ace", codename: "ace", typeId: 2 });
  await seedCard(storage, { id: 907, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
  // The *layout rule on *all -> the layout card.
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
  // The codenamed cards the page content nests by :mark.
  await seedCard(storage, {
    id: 930,
    name: "*header",
    codename: "header",
    typeId: 2,
    dbContent: "the-header-bytes",
  });
  await seedCard(storage, {
    id: 931,
    name: "*footer",
    codename: "footer",
    typeId: 2,
    dbContent: "the-footer-bytes",
  });
  // The page card: codename nests in its OWN content (the 22747 shape).
  await seedCard(storage, {
    id: 940,
    name: "Wipe Probe Page",
    typeId: 2,
    dbContent: "{{:header|core}}\n{{:footer|content}}",
  });
  await storage.fetcher.codenames.ensureLoaded();
  return storage;
}

describe("codename-mark parse survives a temporary-cache reset (page 22747 class)", () => {
  it("renders {{:footer|content}} after a within-key-counts-style lexicon wipe", async () => {
    const storage = await seedCodenameNestDeck();
    storage.fetcher.installNameEnvironment();
    await storage.fetcher.warmLexicon([2, 900, 901, 904, 905, 906, 907, 910, 911, 930, 931, 940]);

    // temporary.rb#within_key_counts: a real overage resets the WHOLE store
    // mid-render. Simulate the observed mid-render wipe deterministically.
    const lexiconCache = (
      storage.fetcher as unknown as { lexiconCache: { temp: { reset(): void } } }
    ).lexiconCache;
    lexiconCache.temp.reset();

    // The exact parse the page render performs inside
    // processContent -> nest -> resolveNestName for {{:footer|content}}.
    expect(DeckoName.parse(":footer").s).toBe("*footer");

    const page = await renderPageBytes(storage.engine, "Wipe Probe Page");
    expect(page).toContain("the-header-bytes");
    expect(page).toContain("the-footer-bytes");
  });

  it("keeps raising CodenameNotFound for a codename the registry does not know", async () => {
    const storage = await seedCodenameNestDeck();
    storage.fetcher.installNameEnvironment();
    await storage.fetcher.warmLexicon([2, 900, 901, 904, 905, 906, 907, 910, 911, 930, 931, 940]);
    // The db fallback this fix substitutes never rescues an UNKNOWN codename
    // (Ruby: Codename.id! raises before any Lexicon lookup - name.rb:66-68).
    expect(() => DeckoName.parse(":nosuchcodename")).toThrowError(CodenameNotFoundError);
  });
});

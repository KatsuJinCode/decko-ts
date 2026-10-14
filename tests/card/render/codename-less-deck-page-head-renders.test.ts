// A deck lacking the codename set must still render its pages: the page
// HEAD's setting reads fetch ":codename" marks (`Card::Rule.global_setting
// (:title)` in Ruby; globalSettingContent in src/card/render/page.ts) and
// an unmapped codename made the whole page 500 with CodenameNotFoundError.
//
// Ruby derivation (card-1.110.0, read from the installed gem): the head's
// codename fetches cannot 500 a page. `Codename.id` (codename.rb:35-41) and
// `Codename.card` (codename.rb:64-70) return nil for an unmapped codename;
// the raise-capable forms (`Codename.id!` via Card[] on a Symbol, mark.rb:26;
// Name.id_from_string on a ":codename" string mark, name.rb:58-63) are caught
// per-view in the page assembly - nest fetches rescue CodenameNotFound and
// render the not-found card (format/nest/fetch.rb:22-34), and every nested
// view's raise is rescued by wrap_and_render -> rescue_view -> quiet_error
// (format/render.rb:56-59, format/error.rb:69-84). Net: the page head
// assembles minus the codename-dependent bits; the page renders.
//
// The page-head fetch sites (page.ts globalSettingContent, used by
// headContent for title, favicon, ace, tiny_mce) had no such tolerance:
// DeckoName.parse(":title") -> idFromString (name.ts:257-259) raised
// CodenameNotFoundError out of renderPageBytes. This file pins the Ruby
// shape: a deck with ZERO codename rows renders, with the head entries that
// read codename-marked settings at their no-setting branch (title = the
// page's own name, no favicon tag, empty script-call configs).

import { describe, expect, it } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

/** A minimal deck MISSING THE HEAD-PATH CODENAMES: no *title, *favicon,
 *  *ace, *tiny_mce codenamed rows - the settings the page head reads through
 *  globalSettingContent. The structural codenames a runnable deck needs
 *  (the Basic cardtype's "basic", which the layout classification reads
 *  through codenames.nameForId at page.ts layout resolution - process_layout
 *  machinery OUTSIDE the head path) stay seeded, so the pin isolates exactly
 *  the head's codename dependence: any deck missing this subset 500s on
 *  EVERY page at the head read. The layout is a plain card layout reachable
 *  by NAME (the *all+*layout rule junction); its content carries no
 *  ":codename" nests (the body's mark handling is a separate render
 *  concern, not this pin's). */
async function seedCodenamelessDeck(): Promise<RenderTestStorage> {
  // No bootstrap: the stock read substrate IS five codename cards, and this
  // suite's whole subject is a deck that has none. Asking for the bootstrap
  // would put the codenames back and test nothing.
  // The stock read substrate IS codename cards (all/set/read/anyone/
// anonymous), and this suite is about the ones the HEAD reads - title,
// favicon, ace, tiny_mce, layout - which the deck below does not carry.
// Seeding the bootstrap puts back the read permission the body needs and
// none of the codenames the head looks up, so the page's subject is intact.
const storage = await createRenderTestStorage();
  // The Basic cardtype - its "basic" codename is the layout classification's
  // structural read (card_layout? type check), not a head read.
  await seedCard(storage, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  // The *all+*layout rule -> the layout card (by name, no codename).
  // *all is TYPED SET (typeId 1, this deck's Set codename card): the
  // read-rule cache join filters rule rows' left cards on sets.type_id =
  // SetID, so a catch-all left untyped never reaches read_rules_hash and
  // every card of the deck denies — the state a real deck is not in.
  await seedCard(storage, { id: 1, name: "Set", codename: "set", typeId: 2 });
  await seedCard(storage, { id: 900, name: "*all", typeId: 1 });
  await seedCard(storage, { id: 901, name: "*layout", typeId: 2 });
  await seedCard(storage, {
    id: 910,
    leftId: 900,
    rightId: 901,
    typeId: 2,
    dbContent: "Probe Layout",
  });
  // The layout: main slot only - no ":codename" nests (the body's mark
  // handling is a separate render concern, not this pin's).
  await seedCard(storage, {
    id: 911,
    name: "Probe Layout",
    typeId: 2,
    dbContent: "{{_main|titled}}",
  });
  // The page card.
  await seedCard(storage, {
    id: 914,
    name: "Probe Page",
    typeId: 2,
    dbContent: "<p>the body</p>",
  });
  // The serving boots' explicit warm (worker.ts:235-238 shape): environment
  // installed + codehash loaded - here it loads ZERO rows. The defect is not
  // a missing warm; it is the deck itself lacking the codename set.
  await storage.fetcher.codenames.ensureLoaded();
  storage.fetcher.installNameEnvironment();
  return storage;
}

describe("codename-less deck page render (residual #4)", () => {
  it("does not raise CodenameNotFoundError from the head's setting reads", async () => {
    const storage = await seedCodenamelessDeck();
    try {
      // BASE (pre-fix): this rejects with "codename doesn't exist: title" -
      // the exact 500 every page of a codename-less deck carried.
      const page = await renderPageBytes(storage.engine, "Probe Page");
      expect(page).toContain("<p>the body</p>");
    } finally {
      storage.close();
    }
  });

  it("renders the head minus the codename-dependent bits", async () => {
    const storage = await seedCodenamelessDeck();
    try {
      const page = await renderPageBytes(storage.engine, "Probe Page");
      // Full page form (the :html_page wrapper, not an error page).
      expect(page).toContain("<!DOCTYPE HTML>");
      // The title tag: the setting read yields nothing, so the title is the
      // page's own name alone (pageTitleBytes with titleSetting undefined).
      expect(page).toContain("<title>Probe Page</title>");
      // The favicon tag: no *favicon codename -> no card -> the empty branch.
      expect(page).not.toContain("shortcut icon");
      // The script-calls view: ace/tinymce settings read nil -> empty configs
      // (scriptCallsTag's ?? "" branch).
      expect(page).toContain("decko.setAceConfig('')");
      expect(page).toContain("decko.setTinyMCEConfig('')");
      // The main body rendered.
      expect(page).toContain("<p>the body</p>");
    } finally {
      storage.close();
    }
  });
});

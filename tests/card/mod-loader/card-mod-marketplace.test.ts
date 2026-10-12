// card-mod-marketplace: the marketplace-as-a-mod suite's proof.
//
// WHAT THIS TEST PROVES, in order:
//
//  1. THE MOD LOADS THROUGH THE EXISTING LOADER. A ModLoader built from the
//     composed default deck's sources PLUS the marketplace source loads, and
//     the load report names the marketplace's set module and its two NEW
//     view names. No bespoke registry, no private wiring.
//
//  2. THE CATALOG RENDERS FOR A SEEDED ENGINE. The `*marketplace` card is
//     seeded into an in-memory deck; the catalog view renders one card per
//     mod the loaded deck actually contains, and each card's counts are
//     checked against the loader's OWN registries (not against a snapshot),
//     so the numbers are the deck's, not the test's.
//
//  3. THE PROSE IS SOURCED. Every catalog entry names the mod module file
//     and line its summary was transcribed from, and the test checks those
//     files exist and carry the header the transcription claims. A mod with
//     no entry says so rather than inventing a paragraph.
//
//  4. THE PER-MOD DETAIL VIEW. cardtypes / settings / views / set modules /
//     events / content overrides render for a named mod, and an unknown mod
//     name says which mods ARE loaded rather than rendering an empty page.
//
//  5. THE v1 BOUNDARY, AND WHERE THE CLASSIFICATION COMES FROM. The
//     create-action offer is DERIVED from the loaded deck's own registrations
//     (a cardtype or a content override), not read from a field in the
//     catalog: there is no such field to read. One case sweeps EVERY mod in
//     the deck and pins the rule against the rows that same render counted,
//     so a mod can never again be described as compiled code while its card
//     lists cardtypes, or offered a form while it registers neither a
//     cardtype nor a view. A mod the deck registers no card content for gets
//     NO create action and says why, naming what it does register. A
//     content-bearing mod gets one ONLY when the write path is enabled AND
//     the viewer is signed in - both arms are exercised, plus the two
//     single-fault arms (write path off, signed out), and the assertion is
//     the negative one that matters: no arm ever renders an "Install"
//     control, because v1 cannot install.
//
//  5b. PROVENANCE. Every sourced paragraph describes the Ruby GEM the mod was
//     ported from, and the card says so next to it. The paragraphs carry gem
//     counts; the rows carry this port's, read live. The two are allowed to
//     disagree, and the page is required to say which list a number is in.
//
//  6. ZERO PINNED BYTES MOVE. The composed default deck is loaded WITHOUT
//     the marketplace and its registered-view list is compared against the
//     same load WITH it: the marketplace adds exactly its own two view names
//     and touches no existing one. That is the parity claim, checked rather
//     than asserted. (The census tests that pin exact flat-feeding row counts
//     - tests/card/mod-loader/view-dispatch-flat-record-format-scope-census
//     .test.ts:113-114 - are not restated here; they run in the canonical
//     net, which is run unchanged.)
//
// Probe cards:
//   - *marketplace (the NEW card name no shipped deck carries; a
//     `*` name is a Setting - the `self` pattern anchors on the card's own
//     name, set-patterns/registry.ts:161)
//   - Marketplace Probe (a plain card, to show the marketplace's views do
//     NOT answer for a card outside the marketplace set)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader, setDefaultModLoader } from "../../../src/card/mod-loader.js";
import { RenderFormat } from "../../../src/card/render/format.js";
import { DeckoName } from "../../../src/card/name.js";
import { SessionStore } from "../../../src/card/auth/index.js";
import { runAuthMigrations } from "../../../src/card/auth/migrations.js";
import {
  handleWriteRequest,
  type WriteRouteContext,
} from "../../../src/server/write-routes.js";
import {
  defaultDeckSources,
  portedBundleOrder,
} from "../../../src/card/mod-loader/default-mod-deck.js";
import cardModMarketplace, {
  marketplaceModSource,
  registrationSurface,
  installKindFor,
  installNote,
  MARKETPLACE_CARD_NAME,
  MARKETPLACE_VIEW,
  MOD_DETAIL_VIEW,
} from "../../../src/card/mod-loader/mods/card-mod-marketplace.js";
import { MOD_CATALOG } from "../../../src/card/mod-loader/mods/marketplace-mod-catalog.js";
import { setModuleShortname } from "../../../src/card/mod-loader/mod-registrar.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename cards (the codename registry reads cards.codename; the set /
  // setting type ids matter to the rule-cache join).
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });

  // the read-rule bootstrap the anonymous actor needs: without an update
  // rule the write verdict fail-closes and permission denies BEFORE view
  // dispatch (permission.rb:19-23 runs ahead of the view raise), which would
  // hide the registration this test is about. Same fixture shape the
  // card-mod-comment suite documents.
  await seedCard(s, { id: 121, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 122, name: "Anyone", codename: "anyone" });
  await seedCard(s, {
    id: 123,
    name: "*all+*update",
    leftId: 10,
    rightId: 121,
    typeId: 13,
    dbContent: "[[Anyone]]",
  });
  await seedReference(s, 123, 122, "anyone");

  // the marketplace's own card: a NEW name no shipped deck carries.
  await seedCard(s, {
    id: 400,
    name: MARKETPLACE_CARD_NAME,
    typeId: 14,
    dbContent: "marketplace probe body",
  });

  // a card OUTSIDE the marketplace set, to show the new views do not answer
  // for arbitrary cards.
  await seedCard(s, { id: 410, name: "Marketplace Probe", dbContent: "probe body" });

  // The deck under test: the composed default deck PLUS the marketplace mod.
  // This is the v2 seam's own input shape (ModSource[], mod-loader.ts:127-132)
  // - the marketplace is a mod a host adds, never a member of the default
  // composition.
  loader = new ModLoader([...defaultDeckSources(), marketplaceModSource()]);
  loader.resolveOrder({
    gemMods: [...portedBundleOrder(), cardModMarketplace.name],
  });
  loader.load();
  bindModLoaderToEngine(storage, loader);
}, 90_000);

afterAll(() => {
  setDefaultModLoader(undefined);
  storage?.close();
});

describe("card-mod-marketplace: the mod loads through the existing loader", () => {
  it("the load report names the marketplace set module and its two NEW views", () => {
    const report = loader!.load();
    expect(report.modNames).toContain("marketplace");
    // one set file -> one set module, the all/ pattern (mod-loader.ts:309-311)
    expect(report.registeredSetModules).toContain(
      setModuleShortname("all/marketplace"),
    );
    expect(report.registeredSetModules).toContain("All::Marketplace");
    // the two view names, both new
    expect(report.registeredViews).toContain(MARKETPLACE_VIEW);
    expect(report.registeredViews).toContain(MOD_DETAIL_VIEW);
  });

  it("registers under the all/ pattern only - the catalog is a per-deck surface", () => {
    expect(cardModMarketplace.setModules).toHaveLength(1);
    const file = cardModMarketplace.setModules![0]!;
    expect(file.setPath).toBe("all/marketplace");
    // no setting_opts, no events, no content overrides, no patterns: the
    // mod registers views and nothing else. A catalog that also declared
    // settings would be claiming surface it does not own.
    expect(file.settingOpts).toBeUndefined();
    expect(file.events).toBeUndefined();
    expect(file.contentOverrides).toBeUndefined();
    expect(cardModMarketplace.setPatterns).toBeUndefined();
    expect(cardModMarketplace.prepareEngine).toBeUndefined();
    // no gemName: the mod ships in-tree, not as a gem.
    expect(cardModMarketplace.gemName).toBeUndefined();
    // cache: never on both views - the body is read live off the registries
    expect(file.formats!.html!.views!.map((v) => v.config?.cache)).toEqual([
      "never",
      "never",
    ]);
    // unknown: NOT declared - the catalog is about the deck, not about a
    // card that failed to fetch.
    expect(
      file.formats!.html!.views!.some((v) => v.config?.unknown !== undefined),
    ).toBe(false);
  });
});

describe("card-mod-marketplace: the catalog renders one card per loaded mod", () => {
  it("renders a card per mod, in the deck's own registration order", async () => {
    const html = await renderMarketplaceView(MARKETPLACE_VIEW);
    const surfaces = registrationSurface(loader!);
    // one card div per mod the loaded deck holds
    expect(surfaces).toHaveLength(portedBundleOrder().length + 1);
    for (const surface of surfaces) {
      expect(html).toContain(`<div class="marketplace-card" data-mod="${surface.modName}">`);
    }
    // the marketplace catalogs itself - a mod about mods
    expect(html).toContain('data-mod="marketplace"');
    // the lede states the honest count and the honest state
    expect(html).toContain(`${surfaces.length} mods are loaded into this deck`);
    expect(html).toContain("Every one is compiled in");
    // every card carries the state line, verbatim and identical
    expect(html.match(/Loaded and active: this mod is part of the deck's composition/g)).toHaveLength(
      surfaces.length,
    );
  });

  it("counts every surface from the loader's OWN registries, not a table", async () => {
    const html = await renderMarketplaceView(MARKETPLACE_VIEW);
    const surface = registrationSurface(loader!).find((s) => s.modName === "help")!;
    expect(surface).toBeDefined();
    // help's registrations, cross-checked against the loader directly:
    // the mod's set modules are the basket's entries carrying modName "help"
    const basket = loader!.setModules();
    const fromBasket = [
      ...basket.base,
      ...basket.abstract,
      ...basket.allNonbase(),
    ].filter((m) => m.modName === "help");
    expect(surface.setModules).toEqual(fromBasket.map((m) => m.shortname));
    // and every one of them is rendered on the card
    for (const shortname of surface.setModules) {
      expect(html).toContain(`<code>${shortname}</code>`);
    }
    // the views are the manifest's, and the loader registered them
    const report = loader!.load();
    for (const view of surface.views) {
      expect(report.registeredViews).toContain(view);
    }
    // help declares three html views (:help, :help_text, :lead) plus the
    // popover under right/help and the guide under all/guide
    expect(surface.views).toEqual(
      expect.arrayContaining(["help", "help_text", "lead", "popover", "guide"]),
    );
    // its settings are checked against the SettingRegistry
    expect(surface.settings).toEqual(
      expect.arrayContaining(["help", "guide"]),
    );
    for (const codename of surface.settings) {
      const held = [...loader!.settingsRegistry().groups.values()].some((group) =>
        group.some((entry) => entry !== null && entry.codename === codename),
      );
      expect(held).toBe(true);
    }
    // a mod with no registrations on a surface says "none" rather than
    // rendering an empty list
    expect(html).toContain('<span class="marketplace-none">none</span>');
  });

  it("lists a mod's CARDTYPES as its set/type/* modules", async () => {
    const surfaces = registrationSurface(loader!);
    // markdown is one set file: set/type/markdown.rb
    const markdown = surfaces.find((s) => s.modName === "markdown")!;
    expect(markdown.cardtypes).toEqual(["Type::Markdown"]);
    // date declares set/type/date alongside its right/ and self/ files
    const date = surfaces.find((s) => s.modName === "date")!;
    expect(date.cardtypes).toEqual(["Type::Date"]);
    // format declares five type modules
    const format = surfaces.find((s) => s.modName === "format")!;
    expect(format.cardtypes.length).toBeGreaterThan(1);
  });

  it("carries a SOURCED one-paragraph summary per mod, with the citation", async () => {
    const html = await renderMarketplaceView(MARKETPLACE_VIEW);
    for (const entry of MOD_CATALOG) {
      expect(html).toContain(`Source: ${entry.sourceFile}:${entry.sourceLine}`);
      // the cited file exists and carries the header the prose was
      // transcribed from - the citation is checkable, not decorative
      const abs = `${REPO_ROOT}${entry.sourceFile}`;
      expect(existsSync(abs), `${entry.sourceFile} must exist`).toBe(true);
      const text = readFileSync(abs, "utf8");
      const line = text.split(/\r?\n/)[entry.sourceLine - 1] ?? "";
      expect(line).toMatch(new RegExp(`^// .*${entry.name}|^// The card-mod-|^// card-mod-`));
    }
    // the prose is a real paragraph, not a placeholder
    for (const entry of MOD_CATALOG) {
      expect(entry.summary.length).toBeGreaterThan(80);
      expect(entry.summary.endsWith(".")).toBe(true);
    }
    // PROVENANCE. The paragraph is a transcription of a header that
    // describes the RUBY GEM, and the live rows beneath it describe the PORT
    // - so the card must label which list a number belongs to, or a reader
    // holding a gem count and a port count on the same card sees a
    // contradiction. One line per sourced card, and it says both halves.
    for (const entry of MOD_CATALOG) {
      const html = await renderDetail({ mod: entry.name });
      expect(html).toContain('class="marketplace-provenance"');
      expect(html).toContain("describes the Ruby gem this mod was ported from");
      expect(html).toContain("Every list below is this deck's own registrations");
    }
    // and the catalog card carries it too
    const catalogHtml = await renderMarketplaceView(MARKETPLACE_VIEW);
    expect(catalogHtml.match(/class="marketplace-provenance"/g)).toHaveLength(
      MOD_CATALOG.length,
    );
  });

  it("says plainly when a mod has no sourced description rather than inventing one", async () => {
    // A loader with one mod the catalog does not describe: the composed
    // deck's own manifest, under a name with no catalog entry.
    const solo = new ModLoader([{ manifest: cardModMarketplace }]);
    solo.resolveOrder({ gemMods: ["marketplace"] });
    solo.load();
    const html = await withLoader(solo, () => renderMarketplaceView(MARKETPLACE_VIEW));
    // the marketplace has no entry for ITSELF, so its card says so
    expect(html).toContain("No catalog entry describes this mod");
    expect(html).toContain("marketplace-summary-unsourced");
  });
});

describe("card-mod-marketplace: the per-mod detail view", () => {
  it("renders the mod's cardtypes / settings / views / modules / events", async () => {
    const surface = registrationSurface(loader!).find((s) => s.modName === "date")!;
    const html = await renderDetail({ mod: "date" });
    expect(html).toContain('class="marketplace-detail" data-mod="date"');
    // the cardtypes section carries the type module
    expect(html).toContain('data-section="cardtypes"');
    expect(html).toContain(`<code>${surface.cardtypes[0]}</code>`);
    // the settings section
    expect(html).toContain('data-section="settings"');
    // the views section
    expect(html).toContain('data-section="views"');
    // the set modules section carries all five of date's set modules
    for (const shortname of surface.setModules) {
      expect(html).toContain(`<code>${shortname}</code>`);
    }
    // the content overrides section - date's three virtual cards
    expect(html).toContain("right/when_created");
    expect(html).toContain("right/when_last_edited");
    expect(html).toContain("self/now");
    // the sourced summary rides the detail too
    expect(html).toContain("Source: src/card/mod-loader/mods/card-mod-date.ts:1");
  });

  it("an unknown mod name says which mods ARE loaded, not an empty page", async () => {
    const html = await renderDetail({ mod: "no_such_mod" });
    expect(html).toContain("No mod named no_such_mod is loaded");
    const surfaces = registrationSurface(loader!);
    for (const surface of surfaces) {
      expect(html).toContain(`<code>${surface.modName}</code>`);
    }
    // and it shows the nest-option spelling so the reader can correct it
    expect(html).toContain("mod_detail: date");
    // THE NOT-LOADED FALLBACK CLAIMS EXACTLY THAT, AND NO MORE. It reports
    // the absence and the loaded set; it does not assert a cause, because
    // the loader records which mods a deck holds, not why one is missing.
    // A page that guessed a reason would be inventing it.
    expect(html).toContain(`This deck composes ${surfaces.length} mods`);
    expect(html).toContain("This page does not guess why");
  });

  it("with no mod named, the detail falls back to the catalog", async () => {
    const html = await renderDetail({});
    expect(html).toContain('class="marketplace-deck"');
    expect(html).toContain("mods are loaded into this deck");
    // not a "no mod named" error - the catalog IS the answer
    expect(html).not.toContain("No mod named");
  });
});

describe("card-mod-marketplace: the v1 install boundary", () => {
  it("the classification is DERIVED from the loaded deck, for every mod in it", async () => {
    // THE PIN THIS CASE EXISTS FOR. The offer is a function of the mod's own
    // registrations: card content (a cardtype or a content override) is what
    // the write path can create, and nothing else is. Sweep EVERY mod the
    // deck holds and check the rule against the very rows that render prints
    // for it, so the two cannot drift apart again.
    //
    // The misclassifications this replaces were static fields a human had to
    // keep true: format, core, list, follow and session were labelled
    // compiled code while the same card listed their cardtypes, and
    // ace_editor was labelled content-bundle and offered a create form while
    // registering no cardtype and no view. Under the rule below ace_editor
    // lands on compiled-code (one setting, no cardtype), and format, core,
    // list, follow and session land on content-bundle.
    const surfaces = registrationSurface(loader!);
    expect(surfaces.length).toBeGreaterThan(0);
    const offersForm: string[] = [];
    for (const surface of surfaces) {
      const hasCardContent =
        surface.cardtypes.length > 0 || surface.contentOverrides.length > 0;
      expect(installKindFor(surface)).toBe(
        hasCardContent ? "content-bundle" : "compiled-code",
      );
      // the note names the registrations the rule rests on, so a reader can
      // check the classification instead of taking it on the page's word
      const note = installNote(surface, installKindFor(surface));
      if (hasCardContent) {
        expect(note).toContain("card content, which is what the write path creates");
        for (const cardtype of surface.cardtypes) expect(note).toContain(cardtype);
      } else {
        expect(note).toContain("registers no cardtype and no content override");
      }
      // and the RENDERED page agrees with the derived kind, in the arm the
      // gate allows - write path on, signed in, so only the classification
      // is under test
      const html = await withWritePath("1", { signedIn: true }, () =>
        renderDetail({ mod: surface.modName }),
      );
      if (hasCardContent) {
        offersForm.push(surface.modName);
        expect(html).toContain("marketplace-apply-form");
      } else {
        expect(html).toContain('data-gate="compiled-code"');
        expect(html).not.toContain("marketplace-apply-form");
      }
    }
    // sanity on the ends of the sweep, so the loop above cannot pass by
    // classifying everything one way
    expect(offersForm).toEqual(expect.arrayContaining(["date", "format", "core", "list", "follow", "session"]));
    expect(offersForm).not.toContain("ace_editor");
    // the catalog carries no classification to fall out of step with the deck
    for (const entry of MOD_CATALOG) {
      expect("installKind" in entry).toBe(false);
    }
  });

  it("a mod with NO card content gets no create action and says why", async () => {
    // "collection" registers two views and nothing else: no cardtype, no
    // content override, so there is nothing for the write path to create.
    const surface = registrationSurface(loader!).find((s) => s.modName === "collection")!;
    expect(surface.cardtypes).toEqual([]);
    expect(surface.contentOverrides).toEqual([]);
    expect(installKindFor(surface)).toBe("compiled-code");
    const html = await renderDetail({ mod: "collection" });
    expect(html).toContain('data-gate="compiled-code"');
    expect(html).toContain("No create action is offered for this mod");
    expect(html).toContain("registers no cardtype and no content override");
    // it names what it DOES register, so the negative is as checkable as the
    // positive
    expect(html).toContain(`${surface.views.length} view`);
    expect(html).not.toContain("marketplace-apply-form");
  });

  it("a CARD-BEARING mod gets a create action only when the write path AND sign-in hold", async () => {
    // "date" registers one cardtype and three content overrides, so the
    // derived classification is content-bundle - not a field anyone recorded
    const surface = registrationSurface(loader!).find((s) => s.modName === "date")!;
    expect(surface.cardtypes.length).toBeGreaterThan(0);
    expect(installKindFor(surface)).toBe("content-bundle");

    // arm 1: write path off (the default - DECKO_WRITE_PATH unset), signed out
    const offSignedOut = await renderDetail({ mod: "date" });
    expect(offSignedOut).toContain('data-gate="write-path-disabled"');
    expect(offSignedOut).toContain("DECKO_WRITE_PATH");
    expect(offSignedOut).not.toContain("marketplace-apply-form");

    // arm 2: write path off, signed IN - still no action, and the reason is
    // the write path, not the session
    const offSignedIn = await withWritePath("0", { signedIn: true }, () =>
      renderDetail({ mod: "date" }),
    );
    expect(offSignedIn).toContain('data-gate="write-path-disabled"');
    expect(offSignedIn).not.toContain("marketplace-apply-form");

    // arm 3: write path ON, signed OUT - no action, and the reason is the
    // session
    const onSignedOut = await withWritePath("1", { signedIn: false }, () =>
      renderDetail({ mod: "date" }),
    );
    expect(onSignedOut).toContain('data-gate="signed-out"');
    expect(onSignedOut).toContain("not signed in");
    expect(onSignedOut).not.toContain("marketplace-apply-form");

    // arm 4: write path ON, signed IN - the create action renders
    const available = await withWritePath("1", { signedIn: true }, () =>
      renderDetail({ mod: "date" }),
    );
    expect(available).toContain("marketplace-apply-available");
    expect(available).toContain('class="marketplace-apply-form" method="post" action="/"');
    // the name rides in card[name], not the path: the path form would run it
    // through markToName, which turns `_` into a space
    expect(available).toContain('<input type="hidden" name="card[name]" value="date">');
    expect(available).toContain('name="card[content]"');
    // and the copy never claims to install, and never claims the form sets
    // the new card's type - it does not
    expect(available).toContain(
      "it does not install, remove, or reconfigure the mod.",
    );
    expect(available).toContain("It does not set that card's type");
    // the offer is justified by the registrations the same card lists
    for (const cardtype of surface.cardtypes) {
      expect(available).toContain(cardtype);
    }
  });

  it("NO arm anywhere renders an Install control - v1 cannot install", async () => {
    // two mods the derived rule calls content-bearing and two it calls
    // compiled-only, so both sides of the boundary are swept
    for (const writePath of ["0", "1"]) {
      for (const signedIn of [false, true]) {
        for (const modName of ["date", "markdown", "collection", "ace_editor"]) {
          const html = await withWritePath(writePath, { signedIn }, () =>
            renderDetail({ mod: modName }),
          );
          expect(html.toLowerCase()).not.toContain(">install<");
          expect(html).not.toContain('name="install"');
          expect(html).not.toContain("marketplace-install-button");
        }
      }
    }
  });
});

describe("card-mod-marketplace: the APPLY form really creates a card", () => {
  // The rule is explicit: do NOT fake an install button that does
  // nothing. So the available arm is not asserted on its markup alone - the
  // bytes the form emits are extracted from the rendered view, parsed into a
  // request body, and posted through the deck's REAL write dispatch
  // (handleWriteRequest, the same entry the staging server runs). A card
  // exists afterwards. If the form were decorative this would fail.
  it("a card exists after the rendered form is posted through the write path", async () => {
    const html = await withWritePath("1", { signedIn: true }, () =>
      renderDetail({ mod: "date" }),
    );
    // pull the form's own fields out of the rendered bytes rather than
    // re-typing them: what is posted is exactly what the view emitted
    const action = /<form class="marketplace-apply-form" method="post" action="([^"]*)"/.exec(html);
    const name = /<input type="hidden" name="card\[name\]" value="([^"]*)"/.exec(html);
    expect(action).not.toBeNull();
    expect(name).not.toBeNull();
    const content = "a card the marketplace apply action created";

    const writeStorage = await createRenderTestStorage();
    try {
      await runAuthMigrations(writeStorage.counting);
      await seedWriteRuleDeck(writeStorage);
      const sessions = new SessionStore({ driver: writeStorage.counting });
      const token = (await sessions.createSession(APPLY_ACTOR_ID)).token;

      // the form's method="post" + action="/" + card[...] fields, urlencoded
      // exactly as a browser would send them
      const response = await handleWriteRequest(
        { driver: writeStorage.counting, fetcher: writeStorage.fetcher },
        {
          method: "POST",
          pathname: action![1]!,
          host: "127.0.0.1",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            authorization: `Bearer ${token}`,
          },
          body: new URLSearchParams({
            "card[name]": name![1]!,
            "card[content]": content,
          }).toString(),
        },
      );

      // a real save, not a 405 / 403 / 422
      expect([303, 200]).toContain(response?.status);
      expect(response?.body).not.toContain("Anonymous");
      // and the card is in the database
      const record = await writeStorage.fetcher.fetchByKey(
        DeckoName.parse(name![1]!).key,
      );
      expect(record).toBeDefined();
      expect(record!.dbContent).toBe(content);
    } finally {
      writeStorage.close();
    }
  }, 90_000);

  it("the same form posted ANONYMOUSLY is denied - the gate is not decorative", async () => {
    const writeStorage = await createRenderTestStorage();
    try {
      await runAuthMigrations(writeStorage.counting);
      await seedWriteRuleDeck(writeStorage);
      const response = await handleWriteRequest(
        { driver: writeStorage.counting, fetcher: writeStorage.fetcher },
        {
          method: "POST",
          pathname: "/",
          host: "127.0.0.1",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            "card[name]": "date",
            "card[content]": "should not land",
          }).toString(),
        },
      );
      // 403 = the engine's anonymous-actor rejection (write-routes.ts:544-547
      // errorStatus maps "anonymous-actor" to 403, Ruby's PermissionDenied)
      expect(response?.status).toBe(403);
      const record = await writeStorage.fetcher.fetchByKey(DeckoName.parse("date").key);
      expect(record).toBeUndefined();
    } finally {
      writeStorage.close();
    }
  }, 90_000);
});

describe("card-mod-marketplace: zero pinned bytes move", () => {
  it("the composed default deck WITHOUT the marketplace registers what it always did", () => {
    const plain = new ModLoader(defaultDeckSources());
    plain.resolveOrder({ gemMods: portedBundleOrder() });
    const report = plain.load();
    // the census the repo pins: the deck's registered views are unchanged by
    // this deck, because the marketplace is not in defaultDeckSources()
    expect(report.modNames).toEqual(portedBundleOrder());
    expect(report.modNames).not.toContain("marketplace");
    expect(report.registeredViews).not.toContain(MARKETPLACE_VIEW);
    expect(report.registeredViews).not.toContain(MOD_DETAIL_VIEW);
  });

  it("adding the marketplace ADDS exactly its two views and touches no existing one", () => {
    const plain = new ModLoader(defaultDeckSources());
    plain.resolveOrder({ gemMods: portedBundleOrder() });
    const before = plain.load().registeredViews;

    const withMarketplace = new ModLoader([
      ...defaultDeckSources(),
      marketplaceModSource(),
    ]);
    withMarketplace.resolveOrder({
      gemMods: [...portedBundleOrder(), "marketplace"],
    });
    const after = withMarketplace.load().registeredViews;

    const added = after.filter((v) => !before.includes(v));
    expect(added.sort()).toEqual([MARKETPLACE_VIEW, MOD_DETAIL_VIEW].sort());
    // every previously-registered view is still registered: the load is
    // additive, not a replacement
    for (const view of before) expect(after).toContain(view);
  });

  it("the marketplace is NOT in the composed default deck (the census guard)", () => {
    const names = defaultDeckSources().map((s) => s.manifest.name);
    expect(names).not.toContain("marketplace");
    expect(names).toHaveLength(31);
  });

  it("the new views answer only for a card named in the marketplace set", async () => {
    // The all/ registration reaches the flat html record (mod-loader.ts:374-379
    // admits base-kind + html), so the view NAME resolves for any card. What
    // must hold is that the view body does not pretend a random card is the
    // marketplace: the catalog is about the DECK, and it renders the same
    // catalog whatever card asked. Assert both halves.
    const onProbe = await storage!.engine.render("Marketplace Probe", MARKETPLACE_VIEW);
    const onMarketplace = await renderMarketplaceView(MARKETPLACE_VIEW);
    // same body either way - the catalog describes the deck, not the card
    expect(onProbe).toBe(onMarketplace);
    expect(onMarketplace).toContain("marketplace-deck");
    // and the deck's own cards are untouched: the probe's ordinary views
    // still render their own bytes
    const probeOpen = await storage!.engine.render("Marketplace Probe", "open");
    expect(probeOpen).not.toContain("marketplace-deck");
    expect(probeOpen).toContain("Marketplace Probe");
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** The actor whose session the APPLY arm writes through. */
const APPLY_ACTOR_ID = 90;
const APPLY_SET_TYPE_ID = 2;

/** The rule deck a create needs: the codename rows, the *all+*update /
 *  *all+*create rules granting "Anyone Signed In", and the actor's account
 *  row. Same shape the write-path suites seed
 *  (tests/server/post-save-cache-expiry.test.ts seedRuleDeck) - the
 *  authenticated actor is a Signed In principal, which is exactly the
 *  population the marketplace's sign-in gate admits.
 *
 *  The ANONYMOUS arm deliberately runs against the SAME deck: its create is
 *  denied by the anonymous-actor rejection before the rule walk matters,
 *  which is the point - the gate is not decorative. */
async function seedWriteRuleDeck(s: RenderTestStorage): Promise<void> {
  const byId = async (
    id: number,
    name: string,
    extra: Omit<Parameters<typeof seedCard>[1], "id" | "name"> = {},
  ): Promise<void> => {
    await seedCard(s, { id, name, ...extra });
  };
  // The type cards first: RichText (codename "basic") and Cardtype (codename
  // "cardtype"), each typed by the cardtype — the pair
  // tests/card/actions/actions-test-storage.ts:209-217 seeds.
  await byId(500, "Cardtype", { codename: "cardtype", typeId: 500 });
  await byId(501, "RichText", { codename: "basic", typeId: 500 });
  // the setting cards
  await byId(1, "*all", { codename: "all", typeId: APPLY_SET_TYPE_ID });
  await byId(2, "Set", { codename: "set" });
  await byId(3, "*update", { codename: "update" });
  await byId(4, "*create", { codename: "create" });
  await byId(5, "*delete", { codename: "delete" });
  await byId(6, "Anyone", { codename: "anyone" });
  await byId(7, "Anyone Signed In", { codename: "anyone_signed_in" });
  await byId(8, "*type", { codename: "type" });
  await byId(9, "*self", { codename: "self" });
  await byId(18, "*default", { codename: "default", typeId: 500 });
  // The default-TYPE rule. A create with no explicit type resolves its type
  // through Card.default_type_id -> the `*all+*default` rule card's OWN
  // type_id (actions/type-resolution.ts:360-368 defaultTypeId; type.rb:3-5
  // `Card.fetch_type_id %i[all default]`). Without this rule the create fails
  // closed with 422 "no such type (default type rule is missing)" - which is
  // exactly what this suite's first APPLY run returned, before the rule was
  // seeded. Typed by RichText, the real seed's cards_011 shape.
  await seedCard(s, { id: 502, leftId: 1, rightId: 18, typeId: 501 });
  // the write rules granting the Signed In population
  await seedCard(s, {
    id: 10,
    leftId: 1,
    rightId: 3,
    dbContent: "[[Anyone Signed In]]",
  });
  await seedReference(s, 10, 7, "anyone signed in");
  await seedCard(s, {
    id: 11,
    leftId: 1,
    rightId: 4,
    dbContent: "[[Anyone Signed In]]",
  });
  await seedReference(s, 11, 7, "anyone signed in");
  await seedCard(s, {
    id: 12,
    leftId: 1,
    rightId: 5,
    dbContent: "[[Anyone Signed In]]",
  });
  await seedReference(s, 12, 7, "anyone signed in");
  await byId(13, "Widget", { typeId: 501, dbContent: "widget" });
  await byId(APPLY_ACTOR_ID, "Joe User");
}

/** Render a marketplace view WITH nest options, through the engine's own
 *  format path — `prepareItemForRender` (render.ts:2727) then
 *  `new RenderFormat(card, engine)` then `renderView(view, opts)`
 *  (format.ts:618-630, :865). That is the same three-step path the
 *  card-mod-search suite uses to drive a view with a format name
 *  (tests/card/mod-loader/card-mod-search.test.ts:416-419); the opts are the
 *  nest's render_opts, which reach the view body as ctx.voo.opts — the
 *  surface card-mod-collection.ts:310 and card-mod-edit.ts:1534 read. */
async function renderMarketplaceView(
  view: string,
  opts: Record<string, unknown> = {},
): Promise<string> {
  const s = storage!;
  const card = await s.engine.prepareItemForRender(MARKETPLACE_CARD_NAME);
  if (card === undefined) throw new Error(`${MARKETPLACE_CARD_NAME} did not prepare`);
  const fmt = new RenderFormat(card, s.engine);
  return String(fmt.renderView(view, opts) ?? "");
}

/** Render the mod_detail view with the given nest options. */
function renderDetail(opts: Record<string, unknown>): Promise<string> {
  return renderMarketplaceView(MOD_DETAIL_VIEW, opts);
}

/** Run `body` with `next` bound as the engine's mod loader and as the
 *  process-wide default, then restore the deck under test. */
async function withLoader<T>(next: ModLoader, body: () => Promise<T>): Promise<T> {
  const s = storage!;
  const previous = s.engine.modLoader;
  s.engine.modLoader = next;
  setDefaultModLoader(next);
  try {
    return await body();
  } finally {
    s.engine.modLoader = previous;
    setDefaultModLoader(loader!);
  }
}

/** Run `body` with DECKO_WRITE_PATH set to `flag` and the engine's page
 *  session set to the given signed-in state, then restore both. The write
 *  path's own gate reads the env var at call time (write-routes.ts:190-192),
 *  so this exercises the real predicate, not a stub. */
async function withWritePath<T>(
  flag: string,
  session: { signedIn: boolean },
  body: () => Promise<T>,
): Promise<T> {
  const s = storage!;
  const previousFlag = process.env.DECKO_WRITE_PATH;
  const previousSession = s.engine.pageSession;
  process.env.DECKO_WRITE_PATH = flag;
  s.engine.pageSession = session.signedIn ? { signedIn: true, actorId: 1 } : { signedIn: false };
  try {
    return await body();
  } finally {
    if (previousFlag === undefined) delete process.env.DECKO_WRITE_PATH;
    else process.env.DECKO_WRITE_PATH = previousFlag;
    s.engine.pageSession = previousSession;
  }
}

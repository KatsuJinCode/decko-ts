// The card-mod-style mod loader test: the mod loaded through the loader
// registers the three headlessly-portable html views from the compat
// report's missing list (box_bottom, box_middle, customize_button - the
// Abstract::SkinBox bodies that are complete without another gem), all
// sixteen gem-tree set modules, and the *style setting_opts. Each view
// proves its Ruby-source semantics against a probe deck with Skin,
// BootswatchSkin and plain cards.
//
// Proof shape (A/B per ported view, the card-mod-help test's shape):
//   WITHOUT the mod: the view raises UnsupportedViewError on every probe
//     (render.rb#view_method - the views do not exist on the live
//     registry).
//   WITH the mod: Skin/BootswatchSkin cards render the SkinBox bodies
//     (skin_box.rb:8/:10-12/:14-16); non-Skin cards keep raising the
//     SAME error (the ancestor fallback has no base box-family view in
//     the engine - matching the engine's pre-registration behavior byte
//     for byte); reset() restores.
//
// Probe cards:
//   - "Skin" (id 3, codename "skin") + "BootswatchSkin" (id 4, codename
//     "bootswatch_skin") - the cardtype cards data/real.yml seeds (the
//     TS seed deck plays the seed role, as in the markdown mod test)
//   - Alpha Skin (id 1169, type Skin) - no image field
//   - Beta Skin (id 1170, type Skin) + the junction field
//     "Beta Skin+image" (left 1170, right 31 "Beta Image")
//   - Bootswatch Skin Probe (id 1172, type BootswatchSkin) - proves the
//     include_set Abstract::SkinBox reach
//     (card-mod-bootstrap set/type/bootswatch_skin.rb:30)
//   - Plain Page (id 1171, RichText) - outside the SkinBox sets
//
// The remaining eight missing views (box, compiled, compressed, import,
// remote_include_tags, remote_style_tags,
// stylesheet_include_tag, stylesheet_path) are NOT ported - each is
// documented with a one-word reason in the mod file's header (super
// chain into card-mod-bar_and_box; SassC compilation; css/scss-format
// dispatch the flat html table cannot express; the Rails mod-manifest /
// asset-output-url data sources) and asserted ABSENT here: loading the
// mod registers exactly the four views above (the three skin_box ones
// plus type_plus_right/mod/style.rb's :core, the Abstract::ModAssets
    // group-list render ported and oracle-pinned),
// no more.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModStyle, {
  cssChunkList,
  cssInputType,
  cssAceMode,
  cssDefaultNestView,
  scssAceMode,
  validFileExtensions,
  styleOkItemTypes,
  hiddenSkins,
  styleInputType,
  styleDefaultItemView,
  setStyleOkToRead,
  modStyleSubpath,
  modStyleFolderGroupType,
  modStyleLocalManifestGroupType,
  skinDeletionError,
} from "../../../src/card/mod-loader/mods/card-mod-style.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // cardtype carriers (data/real.yml seeds the Skin cardtype; the
  // BootswatchSkin cardtype card is card-mod-bootstrap's seed - the TS
  // seed deck plays both roles)
  await seedCard(s, { id: 2, name: "RichText" }); // the default type card
  await seedCard(s, { id: 3, name: "Skin", codename: "skin" });
  await seedCard(s, { id: 4, name: "BootswatchSkin", codename: "bootswatch_skin" });

  // the probe cards
  await seedCard(s, {
    id: 1169,
    name: "Alpha Skin",
    typeId: 3,
    dbContent: "alpha skin body",
  });
  await seedCard(s, {
    id: 1170,
    name: "Beta Skin",
    typeId: 3,
    dbContent: "beta skin body",
  });
  // Beta Skin's "+image" field (skin_box.rb:15 `card.fetch :image`) -
  // the junction row plus the field's RIGHT card: a junction
  // "Beta Skin+image" resolves through the lexicon as [id("Beta Skin"),
  // id("image")], so the right side is the SIMPLE card named "image"
  await seedCard(s, { id: 31, name: "image", dbContent: "image body" });
  await seedCard(s, { id: 32, leftId: 1170, rightId: 31, typeId: 2 });
  // the BootswatchSkin probe (the second SkinBox set, bootstrap's include)
  await seedCard(s, {
    id: 1172,
    name: "Bootswatch Skin Probe",
    typeId: 4,
    dbContent: "bootswatch body",
  });
  // the out-of-set probe (the ancestor-fallback path)
  await seedCard(s, {
    id: 1171,
    name: "Plain Page",
    dbContent: "plain page body",
  });
}, 60_000);

afterAll(() => {
  loader?.reset(); // unregister the mod views from the live record
  storage?.close();
});

describe("card-mod-style through the mod loader (A/B)", () => {
  it("WITHOUT the mod: the MOD-ONLY view raises UnsupportedViewError on every probe", async () => {
    const s = storage!;
    // :customize_button is genuinely mod-only (card-mod-bootstrap
    // set/type/bootswatch_skin/html_views.rb:24-26) and still raises without
    // the mod.
    //
    // :box_bottom / :box_middle are NOT on this list.
    // The premise underneath them — "the engine has no base box-family
    // views" — is false: the box family
    // (card-mod-bar_and_box set/all/box.rb + box.haml) is registered in the
    // shared HTML_VIEWS table. They render for ANY card now, which is the
    // Ruby-faithful shape:
    // in Ruby the box family comes from the bar_and_box mod, not from
    // card-mod-style, so nothing has to be loaded for it to exist.
    for (const name of ["Alpha Skin", "Plain Page"]) {
      await expect(s.engine.render(name, "customize_button")).rejects.toThrow(
        UnsupportedViewError,
      );
      expect(typeof (await s.engine.render(name, "box_bottom"))).toBe("string");
      expect(typeof (await s.engine.render(name, "box_middle"))).toBe("string");
    }
  });

  it("load() registers all sixteen gem-tree set modules, exactly four views, and the *style setting", () => {
    loader = new ModLoader([{ manifest: cardModStyle }]);
    const report = loader.load();
    expect(report.modNames).toEqual(["style"]);
    // one setModules entry per gem .rb file, in the loader's walk order:
    // pattern groups outer (grouped_codes, pattern.rb:47-51 - [all],
    // [abstract], then the nonbase patterns), files path-sorted within a
    // group. 7 abstract + 5 type + 2 type_plus_right + 2 self = 16.
    expect(report.registeredSetModules).toEqual([
      "Abstract::AssetStyle",
      "Abstract::Css",
      "Abstract::Scss",
      "Abstract::AssetCss",
      "Abstract::AssetScss",
      "Abstract::SkinBox",
      "Abstract::StyleGroup",
      "Type::Css",
      "Type::LocalStyleFolderGroup",
      "Type::LocalStyleManifestGroup",
      "Type::Scss",
      "Type::Skin",
      "TypePlusRight::Mod::Style",
      "TypePlusRight::Set::Style",
      "Self::Style",
      "Self::StyleMods",
    ]);
    // exactly the four headlessly-portable views, in the loader's walk
    // order: skin_box.rb's declaration order (:8, :10, :14 - box (:2) is
    // in viewsMissing) first (Abstract::SkinBox walks in the abstract
    // group), then type_plus_right/mod/style.rb's :core (the
    // Abstract::ModAssets group-list render Ruby hosts on this
    // included module - card-mod-assets set/abstract/mod_assets.rb:171-182
    // via mod/style.rb:4-5; oracle-pinned byte-for-byte through mod:
    // format :styles in fixtures/captured/admin-view-pins.json).
    expect(report.registeredViews).toEqual([
      "box_bottom",
      "customize_button",
      "box_middle",
      "core",
    ]);
    expect(report.registeredSettings).toEqual(["style"]);
    // the three pinned `event` declarations from the gem tree, in the
    // loader's walk order (groups outer, mods, pattern codes, files
    // path-sorted - type/css (7-16) before type/scss (4-23) before
    // type/skin (13-17) because type/css < type/scss < type/skin in
    // path sort and all three share the "type" pattern code):
    // type/css.rb:7  validate_css
    // type/scss.rb:4 validate_scss_syntax
    // type/skin.rb:13 no_deletion_if_used
    expect(report.registeredEvents).toEqual([
      "validate_css",
      "validate_scss_syntax",
      "no_deletion_if_used",
    ]);
  });

  it("eventRegistry(): the three pinned event declarations land on the registry with exact stages and triggers", () => {
    const registry = loader!.eventRegistry();

    // forStage("validate") returns every event at the :validate stage
    // the gem declares (all three; the loader's SetLoader phase
    // registers them in declaration order, which is also the
    // SetLoader walk's path-sort order across the type/ pattern group).
    const validateEvents = registry.forStage("validate");
    expect(validateEvents.map((e) => e.event)).toEqual([
      "validate_css",
      "validate_scss_syntax",
      "no_deletion_if_used",
    ]);

    // forEvent(name) returns the first registration of the named event;
    // cross-check the EXACT shape the loader wrote per declaration:

    // type/css.rb:7 - validate_css at :validate, on: :save with
    // changed: [type_id, content]
    const validateCss = registry.forEvent("validate_css");
    expect(validateCss).toBeDefined();
    expect(validateCss?.at).toBe("validate");
    expect(validateCss?.on).toEqual(["save"]);
    expect(validateCss?.changed).toEqual(["type_id", "content"]);
    expect(validateCss?.setPath).toBe("type/css");
    expect(validateCss?.modName).toBe("style");
    expect(typeof validateCss?.fn).toBe("function");

    // type/scss.rb:4 - validate_scss_syntax at :validate, on: :save with
    // changed: [type_id, content]
    const validateScssSyntax = registry.forEvent("validate_scss_syntax");
    expect(validateScssSyntax).toBeDefined();
    expect(validateScssSyntax?.at).toBe("validate");
    expect(validateScssSyntax?.on).toEqual(["save"]);
    expect(validateScssSyntax?.changed).toEqual(["type_id", "content"]);
    expect(validateScssSyntax?.setPath).toBe("type/scss");
    expect(validateScssSyntax?.modName).toBe("style");
    expect(typeof validateScssSyntax?.fn).toBe("function");

    // type/skin.rb:13 - no_deletion_if_used at :validate, on: :delete
    // (no changed: gate - skin.rb:13 omits the field)
    const noDeletionIfUsed = registry.forEvent("no_deletion_if_used");
    expect(noDeletionIfUsed).toBeDefined();
    expect(noDeletionIfUsed?.at).toBe("validate");
    expect(noDeletionIfUsed?.on).toEqual(["delete"]);
    expect(noDeletionIfUsed?.changed).toBeUndefined();
    expect(noDeletionIfUsed?.setPath).toBe("type/skin");
    expect(noDeletionIfUsed?.modName).toBe("style");
    expect(typeof noDeletionIfUsed?.fn).toBe("function");

    // all() returns the three registrations in registration order
    const all = registry.all();
    expect(all.map((e) => e.event)).toEqual([
      "validate_css",
      "validate_scss_syntax",
      "no_deletion_if_used",
    ]);
    expect(registry.size()).toBe(3);

    // the other ModEventStage values the manifest surface carries
    // (per mod-manifest.ts:152-163 the full director stage list) are
    // deliberately empty for this gem - the gem declares nothing at
    // prepare_to_store, store, finalize, integrate, after_integrate,
    // integrate_with_delay, extend, extend_with_delay, or initialize.
    expect(registry.forStage("initialize")).toEqual([]);
    expect(registry.forStage("prepare_to_validate")).toEqual([]);
    expect(registry.forStage("prepare_to_store")).toEqual([]);
    expect(registry.forStage("store")).toEqual([]);
    expect(registry.forStage("finalize")).toEqual([]);
    expect(registry.forStage("integrate")).toEqual([]);
    expect(registry.forStage("after_integrate")).toEqual([]);
    expect(registry.forStage("integrate_with_delay")).toEqual([]);
    expect(registry.forStage("extend")).toEqual([]);
    expect(registry.forStage("extend_with_delay")).toEqual([]);
  });

  it("WITH the mod: :box_bottom on a Skin card renders the empty string (skin_box.rb:8 + box_bottom.haml:1)", async () => {
    const s = storage!;
    // the haml template is the single comment `-#TODO`; comments emit no
    // bytes (Haml::Engine.new('-#TODO').render == "", oracle run against
    // the installed haml gem) - the view body is ""
    const html = await s.engine.render("Alpha Skin", "box_bottom");
    expect(html).toBe("");
  });

  it("WITH the mod: :customize_button on a Skin card renders the empty string (skin_box.rb:10-12)", async () => {
    const s = storage!;
    const html = await s.engine.render("Alpha Skin", "customize_button");
    expect(html).toBe("");
  });

  it("WITH the mod: :box_middle on a Skin card without an image field renders nothing (skin_box.rb:14-16 guard)", async () => {
    const s = storage!;
    // `field_nest :image, ... if card.fetch :image` - no "+image" field
    // card exists for Alpha Skin, Ruby's fetch returns nil, the body is
    // the implicit nil -> ""
    const html = await s.engine.render("Alpha Skin", "box_middle");
    expect(html).toBe("");
  });

  it("WITH the mod: :box_middle on a Skin card WITH an image field nests it at :full_width (skin_box.rb:15)", async () => {
    const s = storage!;
    // warm the field card (the engine's hook for plain-text item reads;
    // the closure walk does not chase "+image" junctions on its own)
    const image = await s.engine.prepareItemForRender("Beta Skin+image");
    expect(image).toBeDefined();
    // field_nest :image, view: :full_width, size: :large - :full_width is
    // card-mod-bootstrap's view (not wired standalone), so the engine
    // raises the same unsupported-view error Ruby's format raises without
    // the bootstrap method
    await expect(s.engine.render("Beta Skin", "box_middle")).rejects.toThrow(
      UnsupportedViewError,
    );
    await expect(s.engine.render("Beta Skin", "box_middle")).rejects.toThrow(
      /full_width/,
    );
  });

  it("WITH the mod: the SkinBox reach covers BootswatchSkin (bootstrap type/bootswatch_skin.rb:30 include)", async () => {
    const s = storage!;
    const html = await s.engine.render("Bootswatch Skin Probe", "box_bottom");
    expect(html).toBe("");
    const button = await s.engine.render(
      "Bootswatch Skin Probe",
      "customize_button",
    );
    expect(button).toBe("");
  });

  it("WITH the mod: a non-Skin card still raises on customize_button, and the box family falls back to the shared table", async () => {
    const s = storage!;
    // :customize_button — cards outside the SkinBox sets resolve the base
    // method, and the engine has no base customize_button, so the error is
    // the SAME one the pre-registration engine raised (render.rb#view_method).
    await expect(
      s.engine.render("Plain Page", "customize_button"),
    ).rejects.toThrow(UnsupportedViewError);
    // :box_bottom / :box_middle — no longer raise here.
    // The ancestor fallback lands on the
    // shared HTML_VIEWS table, where the ported card-mod-bar_and_box box
    // family lives (set/all/box.rb, box.haml). Ruby agrees: that family is
    // bar_and_box's, not card-mod-style's, so a non-Skin card has it in Ruby
    // too. The fallback's REAL invariant — that the card does not get a
    // SKIN-specific body — still holds and is asserted below.
    const bottom = await s.engine.render("Plain Page", "box_bottom");
    const middle = await s.engine.render("Plain Page", "box_middle");
    expect(typeof bottom).toBe("string");
    expect(typeof middle).toBe("string");
    // bar_and_box box.rb's box_bottom is [_render_creator_credit,
    // _render_updated_by], NOT a skin <code> wrap.
    expect(bottom).not.toContain("code");
  });

  it("WITH the mod: the SkinBox views land in the abstract basket bucket with their contributing mod", () => {
    const basket = loader!.setModules();
    const abstractNames = basket.abstract.map((m) => m.shortname);
    expect(abstractNames).toContain("Abstract::SkinBox");
    const skinBox = basket.abstract.find((m) => m.shortname === "Abstract::SkinBox");
    expect(skinBox?.modName).toBe("style");
    expect(skinBox?.kind).toBe("abstract");
    // the nonbase buckets carry the self/type/type_plus_right modules
    const nonbaseShortnames = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(nonbaseShortnames).toContain("Self::Style");
    expect(nonbaseShortnames).toContain("Self::StyleMods");
    expect(nonbaseShortnames).toContain("Type::Css");
    expect(nonbaseShortnames).toContain("Type::Scss");
    expect(nonbaseShortnames).toContain("Type::Skin");
    expect(nonbaseShortnames).toContain("TypePlusRight::Mod::Style");
    expect(nonbaseShortnames).toContain("TypePlusRight::Set::Style");
    // no all/ files in the gem - the base bucket stays empty
    expect(basket.base).toEqual([]);
  });

  it("WITH the mod: the *style setting_opts registration matches self/style.rb:1-4", () => {
    const registry = loader!.settingsRegistry();
    const style = registry.findByCodename("style");
    expect(style?.group).toBe("webpage");
    expect(style?.ruleTypeEditable).toBe(false); // setting_opts declares none
    expect(style?.rawHelpText).toBe(
      "Skin (collection of stylesheets) for card's page. [[http://decko.org/skins|more]]",
    );
    // setting.rb:112-14 stores help_text on BOTH the Self and the Right set
    expect(style?.rightRawHelpText).toBe(
      "Skin (collection of stylesheets) for card's page. [[http://decko.org/skins|more]]",
    );
    // set_position (setting.rb:101-110): the empty registry's webpage
    // group takes the entry at position 4 with Ruby's nil holes before it
    const webpage = registry.groups.get("webpage");
    expect(webpage?.length).toBe(4);
    expect(webpage?.[0]).toBeNull();
    expect(webpage?.[1]).toBeNull();
    expect(webpage?.[2]).toBeNull();
    expect(webpage?.[3]?.codename).toBe("style");
  });

  it("WITH the mod: the seven non-portable missing views stay UNREGISTERED", () => {
    // the compat report's htmlViewsMissingNames minus the views ported
    // elsewhere - each documented in the mod file header with its reason.
    // "box" is not on this list: the box family is
    // card-mod-bar_and_box's (set/all/box.rb, box.haml), never card-mod-
    // style's, and it is registered in the shared table. The style header's
    // premise — "the engine has no base box-family views" — is false for it;
    // these are the ones still genuinely absent.
    // "labeled" is not on this list: the name is
    // registered by the CORE format layer (card-mod-format set/all/html/
    // views.rb:67 view :labeled - ported for the :view_list labeled arm,
    // byte-pinned by fixtures/captured/search-list-views.json target 152);
    // card-mod-style itself still registers no :labeled of its own.
    const views = loader!.viewsTable();
    for (const name of [
      "compiled",
      "compressed",
      "import",
      "remote_include_tags",
      "remote_style_tags",
      "stylesheet_include_tag",
      "stylesheet_path",
    ]) {
      expect(views[name]).toBeUndefined();
    }
    // and the box family IS registered in the shared table
    expect(views["box"]).toBeTypeOf("function");
  });

  it("the set-module method constants transcribe the Ruby declarations", () => {
    // 01_css.rb:17-19 / :23-25 / :27-29 / :31-33
    expect(cssChunkList).toBe("references");
    expect(cssInputType).toBe("ace_editor");
    expect(cssAceMode).toBe("css");
    expect(cssDefaultNestView).toBe("closed");
    // 02_scss.rb:33-35
    expect(scssAceMode).toBe("scss");
    // style_group.rb:17-19
    expect(validFileExtensions).toEqual(["css", "scss"]);
    // type_plus_right/set/style.rb:5-7 / :36-38 / :40-42 / :9-11
    expect(styleOkItemTypes).toEqual(["css", "scss", "skin", "bootswatch_skin"]);
    expect(styleInputType).toBe("box_select");
    expect(styleDefaultItemView).toBe("bar");
    expect(setStyleOkToRead).toBe(true);
    // type_plus_right/mod/style.rb:7-9 / :11-13 / :15-17
    expect(modStyleSubpath).toBe("style");
    expect(modStyleFolderGroupType).toBe("local_style_folder_group");
    expect(modStyleLocalManifestGroupType).toBe("local_style_manifest_group");
  });

  it("HIDDEN_SKINS keeps the Ruby source's duplicate entry verbatim (set/style.rb:24-25)", () => {
    // the Ruby array literal declares bootstrap_default_skin TWICE;
    // selectable_themes' key.in? check cannot observe the duplicate, so
    // the faithful port keeps the source's shape
    expect(hiddenSkins).toEqual([
      "bootstrap_default_skin",
      "themeless_bootstrap_skin",
      "bootstrap_default_skin",
      "classic_bootstrap_skin",
    ]);
  });

  it("skinDeletionError is the no_deletion_if_used predicate (type/skin.rb:13-17 + en.yml)", () => {
    // `if Card[:all, :style].item_keys.include? key` - a skin named by
    // the active *all+*style rule cannot be deleted
    const itemKeys = ["my_active_skin", "another_skin"];
    expect(skinDeletionError(itemKeys, "my_active_skin")).toBe(
      "Can't delete skin because it's used.",
    );
    expect(skinDeletionError(itemKeys, "unused_skin")).toBeUndefined();
    expect(skinDeletionError([], "my_active_skin")).toBeUndefined();
  });

  it("WITH the mod: a baseline :content render still works (the mod adds views, it does not alter core)", async () => {
    const s = storage!;
    const html = await s.engine.render("Alpha Skin", "content");
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("card-slot");
    expect(html).toContain("alpha skin body");
  });

  it("reset() restores the pre-load state (the MOD view raises again; the box family falls back to the shared table)", async () => {
    const s = storage!;
    loader!.reset();
    // After reset() the SkinBox registrations are gone, so a genuinely
    // mod-only view raises again. The box family does NOT raise: post-reset
    // it falls through to the shared HTML_VIEWS table, which carries the
    // card-mod-bar_and_box box family (set/all/box.rb,
    // box.haml) independently of this mod.
    await expect(s.engine.render("Alpha Skin", "customize_button")).rejects.toThrow(
      UnsupportedViewError,
    );
    expect(typeof (await s.engine.render("Alpha Skin", "box_bottom"))).toBe("string");
    expect(typeof (await s.engine.render("Alpha Skin", "box_middle"))).toBe("string");
    // a fresh load() reproduces the same registrations (idempotence) -
    // all four headlessly-portable views (see the load() pin above for
    // the walk order and the :core citation)
    const report = loader!.load();
    expect(report.registeredViews).toEqual([
      "box_bottom",
      "customize_button",
      "box_middle",
      "core",
    ]);
    // with the mod back, the SkinBox body wins over the shared table
    const html = await s.engine.render("Alpha Skin", "box_bottom");
    expect(html).toBe("");
  });
});

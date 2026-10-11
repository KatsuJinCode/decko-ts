// The async-view seam, exercised through the five head views it unblocks.
//
// WHY THIS FILE EXISTS
// `ViewFn` is synchronous (src/card/render/format.ts:291) but
// card-mod-format set/all/head.rb's :page_title / :page_title_tag /
// :favicon_tag / :stylesheet_tags / :head each need an ENGINE READ
// (Card::Rule.global_setting, nest :favicon, main_stylesheet_path).
// Before the seam those five were the "needs an async engine handle
// inside a view" remainder named in
// an internal work log's FINAL STATE.
//
// The seam is a prepare-phase prefetch: RenderEngine#preloadHeadViewReads
// batch-loads the head read-set into the render-card map, and the views
// read it through the already-public synchronous
// RenderEngineLike#fetchRenderCard (format.ts:1371). ViewFn stays sync;
// the dispatcher is untouched.
//
// THE POINT OF THE THIRD DESCRIBE BLOCK
// The bytes for these five views already exist and are exercised on
// every captured page in src/card/render/page.ts (headContent ->
// pageTitleTag / META_TAGS / faviconTag / stylesheetTags). A ViewFn-shaped
// second copy would be a third drifting surface, so the parity block below
// does NOT
// assert hand-written literals: it renders the real page, slices the
// <head> block out of the served bytes, and requires each mod view to
// equal the corresponding line of that block. If page.ts and the mod
// view ever diverge, this test fails. That is the anti-drift property
// the extraction into src/card/render/head-views.ts is supposed to buy.
//
// The A/B shape is the house proof: WITHOUT the mod each of the five
// raises UnsupportedViewError (render.rb#view_method - the view does not
// exist on the live registry); WITH the mod they render bytes.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import { DECK_DATA_VERSION_STATEMENT } from "../../../src/card/render.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import { renderPageBytes } from "../../../src/card/render/page.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";

const DECK_TITLE = "Async Head Probe Deck";
/** The carrierwave source shape page.ts#cloudAttachmentUrl parses:
 *  "(bucket)/path/file.ext" -> the paren prefix is a credential, never
 *  emitted; the :small variant rides the extension
 *  (file_card_uploader.rb:88-117). */
const FAVICON_SRC = "(probe_bucket)/103/3649.png";
const STYLE_SRC = "(probe_bucket)/assets/compiled-style.css";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

/** The served <head> block: page.ts wraps it as
 *  `        <head>\n          ${head}\n        </head>` inside the
 *  :html_page heredoc, so the block is exactly what lies between the
 *  <head> and </head> lines, dedented by its 10-space indent. */
function headBlock(pageBytes: string): string {
  const match = /^[ ]*<head>\n([\s\S]*?)\n[ ]*<\/head>$/m.exec(pageBytes);
  if (match === null) throw new Error(`no <head> block in page bytes:\n${pageBytes}`);
  return (match[1] as string).replace(/^ {10}/gm, "");
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // Codename anchors. The page path needs :layout to resolve a layout
  // rule; the head reads need :title, :favicon, :style, :script. Every
  // codename is seeded so the DeckoName :mark parse resolves (an unknown
  // codename throws CodenameNotFoundError at parse).
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 4, name: "Pointer", codename: "pointer", typeId: 2 });
  await seedCard(s, { id: 900, name: "*all", codename: "all", typeId: 2 });
  await seedCard(s, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
  await seedCard(s, { id: 903, name: "*head", codename: "head", typeId: 2 });
  await seedCard(s, { id: 904, name: "*title", codename: "title", typeId: 2, dbContent: DECK_TITLE });
  await seedCard(s, { id: 905, name: "*favicon", codename: "favicon", typeId: 2, dbContent: FAVICON_SRC });
  await seedCard(s, { id: 906, name: "*ace", codename: "ace", typeId: 2 });
  await seedCard(s, { id: 907, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
  await seedCard(s, { id: 908, name: "*style", codename: "style", typeId: 2 });
  await seedCard(s, { id: 909, name: "*script", codename: "script", typeId: 2 });

  // The *all rule cards asset_output_url walks: the universe default
  // rule (page.ts#assetOutputUrl fetches "*all+*style", then
  // "<rule name>+*asset output"). Both rules share ONE *asset output
  // card on this probe deck, so the probe's script URL equals its
  // style URL - a probe simplification, disclosed because the script
  // URL is never asserted here (the title/favicon/stylesheet bytes are
  // what the parity block compares).
  //
  // TWO shapes measured, not assumed:
  //  - The junction rows carry their corpus name+key (all 5,061
  //    junction-named records in fixtures/corpus-v2/recapture carry a
  //    key column; render-test-storage's seedCard doc requires it).
  //  - The compiled asset's IDENTIFIER lives on the JUNCTION row, not
  //    on the *asset output setting card that is its right side.
  //    card-mod-script.ts#assetOutputUrl cites the oracle directly:
  //    "oracle deck: card 307 '*all+*script+*asset output' db_content
  //    '~307/1790061390.js'", and the URL is built from that row.
  await seedCard(s, { id: 920, name: "*all+*layout", leftId: 900, rightId: 901, typeId: 2, dbContent: "Probe Layout" });
  await seedCard(s, { id: 921, name: "*all+*style", leftId: 900, rightId: 908, typeId: 2, dbContent: "*style" });
  await seedCard(s, { id: 922, name: "*all+*script", leftId: 900, rightId: 909, typeId: 2, dbContent: "*script" });
  await seedCard(s, { id: 923, name: "*asset output", codename: "asset_output", typeId: 41 });
  await seedCard(s, { id: 930, name: "*all+*style+*asset output", leftId: 921, rightId: 923, typeId: 2, dbContent: STYLE_SRC });
  await seedCard(s, { id: 931, name: "*all+*script+*asset output", leftId: 922, rightId: 923, typeId: 2, dbContent: STYLE_SRC });

  // The layout card and the page under test.
  await seedCard(s, {
    id: 910,
    name: "Probe Layout",
    typeId: 2,
    dbContent: "{{_main|titled}}",
  });
  await seedCard(s, { id: 940, name: "Async Head Probe", typeId: 2, dbContent: "<p>probe body</p>" });

  // The name environment is process-global and production installs it at
  // worker boot (deploy/worker.ts:210-212); the page tests install it
  // explicitly for the same reason. Without it `:codename` marks (and so
  // the page path's own global_settingContent) cannot parse.
  s.fetcher.installNameEnvironment();
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** Load card-mod-format into the engine under test (idempotent - the
 *  A/B block's "WITHOUT" test must see the bare registry, so the load
 *  happens inside the first "WITH" case, not in beforeAll). */
async function loadMod(): Promise<void> {
  const s = storage!;
  loader = new ModLoader([{ manifest: cardModFormat }]);
  loader.load();
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
}

describe("the async-view seam: the head read-set is warm after prepare", () => {
  it("preloads the setting cards the head views read", async () => {
    const s = storage!;
    // One ordinary render; the prepare phase must leave the head
    // read-set in the render-card map so a SYNCHRONOUS view can read
    // it. This assertion is the seam: without the prepare prefetch,
    // fetchRenderCard returns undefined and every head view degrades to
    // its empty branch.
    await s.engine.render("Async Head Probe", "core");
    expect(s.engine.fetchRenderCard(":title")?.dbContent).toBe(DECK_TITLE);
    expect(s.engine.fetchRenderCard(":favicon")?.dbContent).toBe(FAVICON_SRC);
    // The asset-output chain asset_output_url walks: the *all rule and
    // the rule's +*asset output child.
    expect(s.engine.fetchRenderCard("*all+*style")?.name.s).toBe("*all+*style");
    expect(s.engine.fetchRenderCard("*all+*style+*asset output")?.dbContent).toBe(STYLE_SRC);
  });

  it("is idempotent: a warm re-render adds no round trips beyond the freshness gate", async () => {
    const s = storage!;
    await s.engine.render("Async Head Probe", "core");
    const before = s.counting.snapshot();
    await s.engine.render("Async Head Probe", "core");
    const after = s.counting.snapshot();
    // 2026-10-06 a1-mods-validation lane: this pin previously expected a
    // zero-statement warm re-render. d19ec179 (2026-10-05, B-arm freshness
    // repair) landed the deck_data_version freshness gate AFTER that pin
    // was written: the render entry reads the stamp ONCE per request
    // (render.ts DECK_DATA_VERSION_STATEMENT, in-source comment
    // "Warm-render cost: exactly ONE statement") and
    // resets derived caches only when it moved. The gate is the documented
    // design, so the invariant is now: exactly ONE added statement, and it
    // IS the freshness stamp — anything beyond that would be a real cache
    // regression, which is what this test exists to catch.
    expect(after.statements).toBe(before.statements + 1);
    expect(after.roundTrips).toBe(before.roundTrips + 1);
    const fresh = s.counting.statements.slice(-1);
    expect(fresh).toEqual([DECK_DATA_VERSION_STATEMENT]);
  });
});

describe("the five head views through the mod (A/B)", () => {
  it("WITHOUT the mod: every head view raises UnsupportedViewError", async () => {
    const s = storage!;
    for (const view of ["page_title", "page_title_tag", "favicon_tag", "stylesheet_tags", "head"]) {
      await expect(s.engine.render("Async Head Probe", view)).rejects.toBeInstanceOf(
        UnsupportedViewError,
      );
    }
  });

  it("WITH the mod: :page_title joins safe_name and the title setting with ' - ' (head.rb:19-23)", async () => {
    const s = storage!;
    await loadMod();
    // head.rb:20-22: title_parts = [global_setting(:title)]; unshift
    // safe_name if the name is present; join " - ". The join, not a tag.
    expect(await s.engine.render("Async Head Probe", "page_title")).toBe(
      `Async Head Probe - ${DECK_TITLE}`,
    );
  });

  it("WITH the mod: :page_title_tag wraps :page_title in <title> (head.rb:33-35)", async () => {
    const s = storage!;
    // content_tag(:title) { render :page_title } - the tag is Rails'
    // content_tag: <title>...</title>, no attributes.
    expect(await s.engine.render("Async Head Probe", "page_title_tag")).toBe(
      `<title>Async Head Probe - ${DECK_TITLE}</title>`,
    );
  });

  it("WITH the mod: :favicon_tag emits the :small carrierwave link (head.rb:37-39)", async () => {
    const s = storage!;
    // nest :favicon, view: :link_tag -> the favicon card's attachment
    // URL at the :small variant; the paren credential prefix is never
    // emitted and the variant rides the extension.
    expect(await s.engine.render("Async Head Probe", "favicon_tag")).toBe(
      `<link rel="shortcut icon" href="http://s3.amazonaws.com//files/103/3649-small.png" />`,
    );
  });

  it("WITH the mod: :stylesheet_tags emits the remote tag then the main asset-output tag (head.rb:61-63)", async () => {
    const s = storage!;
    // [nest(:style_mods, :remote_style_tags), main_stylesheet_tag] joined
    // by the array's to_s newline; the main href resolves
    // *all+*style+*asset output through asset_output_url.
    expect(await s.engine.render("Async Head Probe", "stylesheet_tags")).toBe(
      `<link href="https://fonts.googleapis.com/css2?family=Material+Icons" media="all" rel="stylesheet" type="text/css" />\n` +
        `<link media="all" rel="stylesheet" type="text/css" href="http://s3.amazonaws.com//files/assets/compiled-style.css" />`,
    );
  });

  it("WITH the mod: :head joins basket[:head_views] with a newline (head.rb:29-31)", async () => {
    const s = storage!;
    const head = await s.engine.render("Async Head Probe", "head");
    // head.rb:29-31: basket[:head_views].map { render viewname }
    // .flatten.compact.join "\n" over the six names declared at
    // head.rb:1-4. The five ported here contribute; :meta_tags (a Haml
    // template) and :universal_edit_button / :rss_links are registered
    // by the other ports, so this asserts the SHAPE (one line per
    // registered head view, newline-joined) and the two pinned
    // substrings, not a six-line literal.
    expect(head.split("\n").length).toBeGreaterThanOrEqual(2);
    expect(head).toContain(`<title>Async Head Probe - ${DECK_TITLE}</title>`);
    expect(head).toContain(`<link rel="shortcut icon" href="http://s3.amazonaws.com//files/103/3649-small.png" />`);
  });
});

describe("byte parity with the page path (the anti-drift block)", () => {
  it("each head view's bytes equal the corresponding line of the served <head>", async () => {
    const s = storage!;
    const page = await renderPageBytes(s.engine, "Async Head Probe");
    const lines = headBlock(page).split("\n");

    // basket[:head_views] order: card-mod-format set/all/head.rb:1-4
    // then card-mod-script set/all/head_javascript.rb:7 appends
    // javascript_tags, script_variables, script_calls. page.ts's
    // headContent emits exactly that concatenation, and the two
    // universal_edit_button / rss_links slots are the "" blanks the
    // capture pins.
    const titleTag = await s.engine.render("Async Head Probe", "page_title_tag");
    const faviconTag = await s.engine.render("Async Head Probe", "favicon_tag");
    const styleTags = await s.engine.render("Async Head Probe", "stylesheet_tags");

    expect(lines).toContain(titleTag);
    expect(lines).toContain(faviconTag);
    // stylesheet_tags is TWO newline-joined lines, so it occupies two
    // adjacent slots in the head array.
    const styleStart = lines.indexOf(styleTags.split("\n")[0] as string);
    expect(styleStart).toBeGreaterThanOrEqual(0);
    expect(lines[styleStart + 1]).toBe(styleTags.split("\n")[1] as string);

    // NON-VACUITY: without this the parity block above can pass with
    // every data-bearing member collapsed to "" (which is exactly what
    // happened on the first run of this file, when the probe deck's
    // asset-output identifier was seeded on the wrong card). The hrefs
    // must be the real resolved URLs, not empty.
    expect(titleTag).toContain(DECK_TITLE);
    expect(faviconTag).toContain("http://s3.amazonaws.com//files/103/3649-small.png");
    expect(styleTags).toContain("http://s3.amazonaws.com//files/assets/compiled-style.css");
    // The page's own head line for the main stylesheet is the same
    // non-empty href — that is the drift this block exists to catch.
    expect(lines[styleStart + 1]).toContain("http://s3.amazonaws.com//files/assets/compiled-style.css");

    // :page_title is the tag's inner text, exactly.
    expect(titleTag).toBe(`<title>${await s.engine.render("Async Head Probe", "page_title")}</title>`);
  });
});

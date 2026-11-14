// The *css setting ADDRESS the enumeration audit's gap names
// (docs/runs/enumeration-audit-2026-10-25.md, A2 row `*css`;
// docs/runs/enumeration-audit-2026-10-25.gaps.json, the element "the *css
// setting address"):
//
//   /*css          the address itself
//   /*css/board    the board's advanced tab, which the capture's own bar
//                  menu links to
//
// The capture is fixtures/captured/sass-style-pages/oracle-main-slot-regions.json
// (the recorded main-slot region of the "customized classic skin" page),
// and it carries the *css card's bar: the card row (id 198, name "*css",
// type "CSS" 17435) and the bar menu with its four links - the page
// link (/*css), the modal link (/*css?layout=modal), the edit link
// (/*css/edit) and the advanced link (/*css/board).
//
// The capture bytes are the spec:
//   - The BAR BODY is pinned byte-for-byte: the port's own bar render at
//     the *css card must equal the capture's recorded bar body, under
//     the capture's own normalization (the slot id and the card id are
//     RANDOMIZED in the capture).
//   - The SLOT WRAPPER is pinned by its own attributes: the card
//     identity (id, name, type id, type name, link name) and the slot
//     class. The capture's slot JSON carries two keys the port's own
//     root render does not (nest_name and home_view: the capture
//     rendered the bar as a list item, a nest, and this file renders it
//     as the view's own root), and the port's nest render adds a third
//     (nest_syntax). The view/show/hide keys the two agree on are
//     pinned separately.
//
// What the port already carried: the bar view
// (src/card/render/views.ts, the :bar view fn and the bar_and_box set's
// bar machinery) and the CSS cardtype (the fresh deck's defaults corpus
// row "CSS", src/card/auth/defaults-seed-corpus.ts). What no row named,
// and what this file adds, is the ADDRESS: nothing proved that the *css
// card answers at /*css, and that its advanced tab links to /*css/board.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import { default as cardModEdit } from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import { default as cardModRules } from "../../../src/card/mod-loader/mods/card-mod-rules.js";
import { default as cardModPermissions } from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import { default as cardModLayout } from "../../../src/card/mod-loader/mods/card-mod-layout.js";
import { default as cardModFormat } from "../../../src/card/mod-loader/mods/card-mod-format.js";
import { default as cardModStyle } from "../../../src/card/mod-loader/mods/card-mod-style.js";
import { parsePath } from "../../../worker.js";

/** The capture the audit cites. */
const STYLE_CAPTURE = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../fixtures/captured/sass-style-pages/oracle-main-slot-regions.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { pages: Array<{ name: string; expected?: string }> };

/** The capture's own normalization (the capture's note: "slot-id
 *  normalization applied (data-slot-id already RANDOMIZED in the dumps)").
 *  The card id is masked on both sides for the same reason: the card id
 *  is deck state, and the capture's own dump carries it raw. */
function normalize(html: string): string {
  return html
    .replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-card-id=(["'])\d+\1/g, 'data-card-id="RANDOMIZED"');
}

/** The balanced div block that starts at `from`: the opening tag and
 *  everything it contains, up to its own closing tag. */
function divBlock(html: string, from: number): string {
  let depth = 0;
  for (let i = from; i < html.length; i += 1) {
    if (html.startsWith("<div", i)) {
      depth += 1;
      i += 3;
      continue;
    }
    if (html.startsWith("</div>", i)) {
      depth -= 1;
      if (depth === 0) return html.slice(from, i + 6);
      i += 5;
    }
  }
  throw new Error("the div block does not close");
}

/** The capture's *css bar: the slot wrapper and the bar body inside it. */
function capturedCssBar(): { wrapper: string; body: string } {
  const page = STYLE_CAPTURE.pages.find((p) => (p.expected ?? "").includes("Xcss-bar-view"));
  if (page === undefined) throw new Error("the capture records no *css bar");
  const expected = page.expected!;
  const slotAt = expected.indexOf('<div id="Xcss-bar-view"');
  if (slotAt === -1) throw new Error("the capture's *css bar slot is missing");
  const barAt = expected.indexOf("<div class='bar ", slotAt);
  if (barAt === -1) throw new Error("the capture's *css bar body is missing");
  return {
    wrapper: expected.slice(slotAt, barAt),
    body: divBlock(expected, barAt),
  };
}

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let botEngine: RenderEngine | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the actor stand-in (the "decko_bot" codename is the STORED spelling
  // the permission machinery matches: read-rules.ts DECKOBOT_CODENAME)
  await seedCard(s, { id: 1, name: "Decko Bot", codename: "decko_bot" });
  // the cardtypes: the Cardtype card itself, the RichText card, and the
  // CSS cardtype the *css card is typed by
  await seedCard(s, { id: 3, name: "Cardtype", codename: "cardtype", typeId: 3 });
  await seedCard(s, { id: 2, name: "RichText", typeId: 3 });
  await seedCard(s, { id: 17435, name: "CSS", codename: "css", typeId: 3 });
  // the *css card, with the capture's own ids: the card row the email
  // capture records (fixtures/captured/email-templates-raw-oracle.json:
  // id 198, name "*css", type_id 17435) and the bar's own data-card-id
  // ("198") in the style capture
  await seedCard(s, { id: 198, name: "*css", typeId: 17435, typeName: "CSS" });

  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();

  loader = new ModLoader([
    { manifest: cardModEdit },
    { manifest: cardModRules },
    { manifest: cardModPermissions },
    { manifest: cardModLayout },
    { manifest: cardModFormat },
    { manifest: cardModStyle },
  ]);
  loader.load();
  bindModLoaderToEngine(s, loader);

  botEngine = new RenderEngine(new FetchEngine(s.counting));
  botEngine.viewer = { signedIn: true, actorId: 1 };
  botEngine.pageSession = { signedIn: true, actorId: 1 };
  botEngine.modLoader = loader;
  await loader.installInto(modEngineHost(botEngine, s.fetcher));
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("the *css setting address", () => {
  it("the capture's bar carries the advanced tab's link to /*css/board", () => {
    const captured = capturedCssBar();
    // the four links the capture's bar menu carries, byte-for-byte
    expect(captured.body).toContain(
      '<a class="full-page-link known-card" href="/*css"><i class="notranslate material-icons">open_in_full</i> page</a>',
    );
    expect(captured.body).toContain(
      '<a data-slotter-mode="modal" data-modal-class="modal-dialog modal-dialog-centered modal-xl" size="xl" class="_modal-page-link slotter" href="/*css?layout=modal" data-remote="true"><i class="notranslate material-icons">fullscreen</i> modal</a>',
    );
    expect(captured.body).toContain(
      '<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip" data-bs-placement="bottom" data-slotter-mode="modal" data-modal-class="modal-lg" href="/*css/edit" data-remote="true"><i class="notranslate material-icons">edit</i> edit</a>',
    );
    // the audit's evidence: "the capture records the board's advanced tab
    // linking to / *css/board, and the *css address itself"
    expect(captured.body).toContain(
      '<a rel="nofollow" class="board-link slotter" title="Advanced" data-bs-toggle="tooltip" data-bs-placement="bottom" data-slotter-mode="modal-replace" href="/*css/board" data-remote="true"><i class="notranslate material-icons">space_dashboard</i> advanced</a>',
    );
  });

  it("the port renders the capture's bar body byte-for-byte at the *css card", async () => {
    const captured = capturedCssBar();
    const html = await botEngine!.render("*css", "bar");
    const barAt = html.indexOf("<div class='bar ");
    expect(barAt).toBeGreaterThan(-1);
    expect(normalize(divBlock(html, barAt))).toBe(normalize(captured.body));
  });

  it("the port's slot wrapper carries the capture's card identity and class", async () => {
    const captured = capturedCssBar();
    const html = await botEngine!.render("*css", "bar");
    const barAt = html.indexOf("<div class='bar ");
    const wrapper = html.slice(0, barAt);
    // the slot class and the card identity, as the capture records them
    expect(wrapper).toContain(
      '<div id="Xcss-bar-view" class="card-slot bar-view ALL TYPE-css STAR SELF-Xcss"',
    );
    expect(wrapper).toContain('data-card-id="198"');
    expect(wrapper).toContain('data-card-name="*css"');
    expect(wrapper).toContain('data-card-type-id="17435"');
    expect(wrapper).toContain('data-card-type-name="CSS"');
    expect(wrapper).toContain('data-card-link-name="*css"');
    // the slot JSON the two agree on: the view, the shown list and the
    // hidden list (the capture's slot JSON adds nest_name and home_view
    // because it rendered the bar as a list item, a nest)
    expect(wrapper).toContain(
      '&quot;view&quot;:&quot;bar&quot;,&quot;show&quot;:[&quot;bar&quot;],&quot;hide&quot;:[&quot;bar_middle&quot;]',
    );
    // and the capture's own wrapper carries the same card identity
    expect(captured.wrapper).toContain('data-card-name="*css"');
    expect(captured.wrapper).toContain('data-card-type-name="CSS"');
  });

  it("the port's read grammar answers the audit's two addresses", () => {
    expect(parsePath("/*css")).toEqual({ name: "*css" });
    expect(parsePath("/*css/board")).toEqual({ name: "*css", view: "board" });
    expect(parsePath("/*css/edit")).toEqual({ name: "*css", view: "edit" });
  });

  it("the port answers at the address: /*css renders the card's page, /*css/board the board", async () => {
    // the page surface at the address (the grammar's no-view arm is the
    // card's own page): the card's bar is the first thing it renders
    const page = await botEngine!.render("*css", "open");
    expect(page).toContain('<span class="card-title" title="*css">*css</span>');
    expect(page).toContain("Xcss-open-view");
    // the advanced tab's target: the board view at the same card
    const board = await botEngine!.render("*css", "board");
    expect(board.length).toBeGreaterThan(0);
    expect(board).toContain("card-slot");
  });
});

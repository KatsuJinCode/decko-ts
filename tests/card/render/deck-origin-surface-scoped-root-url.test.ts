// deck-origin-surface-scoped-root-url.test.ts — `decko.rootUrl` is a
// PER-SURFACE value (card_url("")), not a constant. This is the pin for the
// surface split.
//
// MECHANISM (gem source, REPO_ROOT/archive/decko-fork-study/decko/):
//   mod/script/set/all/head_javascript.rb:33-40 `decko_script_variables`
//     -> :35  "decko.rootUrl": card_url("")
//   card/lib/card/env/location.rb:19-21
//       def card_url rel
//         rel.match?(/^https?:/) ? rel : "#{Env.origin}#{card_path rel}"
//   card/lib/card/env/location.rb:6-16  `card_path` -> :14
//       "#{relative_url_root}/#{rel_path}"     # card_path "" -> "/"
//   card/lib/card/env/serializable.rb:20-22  `origin`
//       Cardio.config.deck_origin || "#{protocol}#{request&.host_with_port}"
//   card/lib/card/env.rb:17                  `request` = controller&.request
//   card/lib/cardio/railtie.rb:28            config.deck_origin = nil  (default)
//
// So `card_url("")` is Env.origin + "/", and Env.origin is EMPTY whenever the
// deck_origin config is unset and there is no controller — which is exactly
// the view-function surface. The two capture lanes photograph both shapes:
//
//   PAGE lane   `with_capture_page_bucket` assigns
//               Cardio.config.deck_origin = "https://example.com"
//               (capture-dual-lane-page-and-view.rb:343, restored at :348)
//               -> decko.rootUrl='https://example.com/'   6588/6588 rows
//   VIEW lane   `capture_view_lane` (:277-287) renders OUTSIDE that block and
//               `Card::Env.reset` (:439) left no controller
//               -> decko.rootUrl='/'                            cards 34754/34758
//
// THE DEFECT THIS PINS. `page.ts#scriptVariablesTag` interpolated the
// DECK_ORIGIN constant, so the value could not follow the surface. Since the
// bare-view-lane fix (RenderEngine#render seats this SAME headContent for an
// unseated root whose content nests the head card's :core — render.ts:1385),
// the view lane reaches the page-lane builder and got the page-surface bytes:
// the four *head-family view rows carried
// `decko.rootUrl='https://example.com/'` where the oracle carries `/`,
// a +24 delta that is exactly the length of "https://example.com".
//
// The fix reads the surface through the engine's own accessor
// (`engine.envOriginConfig()` -> `envOriginForSurface(pageConfigActive)`,
// render.ts:1770-1772, render/deck-origin.ts:73-75), which is TRUE only
// inside `runWithPageConfig` — i.e. only for `renderPageBytes`.
//
// WHY BOTH HALVES ARE ASSERTED. A "flip" fix (always "/" or always the
// origin) would satisfy either single test and break the other; the oracle
// pins both directions, so the pin holds both.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { headContent, renderPageBytes } from "../../../src/card/render/page.js";
import { DeckoName } from "../../../src/card/name.js";

const PAGE_ROOT_URL = "decko.rootUrl='https://example.com/';";
const VIEW_ROOT_URL = "decko.rootUrl='/';";

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  // The head read-set (page.ts#headContent -> headReadSet): *title, *favicon,
  // *style and the *all+*style+*asset output chain. Every codename is seeded
  // because a `:codename` mark throws CodenameNotFoundError at parse.
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 900, name: "*all", codename: "all", typeId: 2 });
  await seedCard(s, { id: 901, name: "*layout", codename: "layout", typeId: 2 });
  await seedCard(s, { id: 903, name: "*head", codename: "head", typeId: 2 });
  await seedCard(s, { id: 904, name: "*title", codename: "title", typeId: 2, dbContent: "Origin Probe Deck" });
  await seedCard(s, { id: 905, name: "*favicon", codename: "favicon", typeId: 2 });
  await seedCard(s, { id: 908, name: "*style", codename: "style", typeId: 2 });
  await seedCard(s, { id: 909, name: "*script", codename: "script", typeId: 2 });
  // page.ts#scriptCallsTag reads :ace and :tiny_mce (head_javascript.rb:69-73
  // script_configs over the basket's global_setting calls). Both marks are
  // parsed, so both codenames must exist or headContent throws before it
  // reaches scriptVariablesTag.
  await seedCard(s, { id: 906, name: "*ace", codename: "ace", typeId: 2 });
  await seedCard(s, { id: 907, name: "*tiny_mce", codename: "tiny_mce", typeId: 2 });
  await seedCard(s, { id: 920, name: "*all+*layout", leftId: 900, rightId: 901, typeId: 2, dbContent: "Probe Layout" });
  await seedCard(s, { id: 921, name: "*all+*style", leftId: 900, rightId: 908, typeId: 2, dbContent: "*style" });
  await seedCard(s, { id: 922, name: "*all+*script", leftId: 900, rightId: 909, typeId: 2, dbContent: "*script" });
  await seedCard(s, { id: 923, name: "*asset output", codename: "asset_output", typeId: 41 });
  await seedCard(s, { id: 930, name: "*all+*style+*asset output", leftId: 921, rightId: 923, typeId: 2, dbContent: "(probe_bucket)/assets/compiled-style.css" });
  await seedCard(s, { id: 931, name: "*all+*script+*asset output", leftId: 922, rightId: 923, typeId: 2, dbContent: "(probe_bucket)/assets/compiled-style.css" });
  await seedCard(s, { id: 910, name: "Probe Layout", typeId: 2, dbContent: "{{_main|titled}}" });
  await seedCard(s, { id: 940, name: "Origin Probe", typeId: 2, dbContent: "<p>probe body</p>" });
  s.fetcher.installNameEnvironment();
  // One ordinary render so the prepare-phase head prefetch
  // (RenderEngine#preloadHeadViewReads) has warmed the read-set that
  // headContent consumes — the same state the page path is in when it calls
  // it at page.ts:295.
  await s.engine.render("Origin Probe", "core");
}, 60_000);

afterAll(() => {
  storage?.close();
});

/** The single `decko.rootUrl` line out of a head block. */
function rootUrlLine(head: string): string {
  const line = head.split("\n").find((l) => l.startsWith("decko.rootUrl="));
  if (line === undefined) throw new Error(`no decko.rootUrl line in head:\n${head}`);
  return line;
}

describe("decko.rootUrl is surface-scoped (head_javascript.rb:35 card_url(\"\"))", () => {
  it("PAGE surface: the served page head carries the capture's deck_origin", async () => {
    const s = storage!;
    const page = await renderPageBytes(s.engine, "Origin Probe");
    expect(page).toContain(PAGE_ROOT_URL);
  });

  it("VIEW surface: headContent outside runWithPageConfig carries the bare root", async () => {
    const s = storage!;
    const rootCard = await s.engine.prepareItemForRender("Origin Probe");
    expect(rootCard).toBeDefined();
    // Bare: pageConfigActive is false, so Env.origin is "" and card_url("")
    // is "/" (railtie.rb:28 + env.rb:17 + location.rb:14/:19-21).
    const head = await headContent(s.engine, DeckoName.parse("Origin Probe"), rootCard!);
    expect(rootUrlLine(head)).toBe(VIEW_ROOT_URL);
    // The negative half, and the one the defect actually broke: the view
    // surface must not carry the page surface's origin anywhere in the
    // script_variables block.
    expect(head).not.toContain("https://example.com");
  });

  it("PAGE surface, called directly: the same builder under runWithPageConfig carries the origin", async () => {
    const s = storage!;
    const rootCard = await s.engine.prepareItemForRender("Origin Probe");
    expect(rootCard).toBeDefined();
    const head = await s.engine.runWithPageConfig(() =>
      headContent(s.engine, DeckoName.parse("Origin Probe"), rootCard!),
    );
    expect(rootUrlLine(head)).toBe(PAGE_ROOT_URL);
  });

  it("the flag is restored after runWithPageConfig (nesting-safe, render.ts:1783-1814)", async () => {
    const s = storage!;
    const rootCard = await s.engine.prepareItemForRender("Origin Probe");
    expect(rootCard).toBeDefined();
    const before = s.engine.envOriginConfig();
    await s.engine.runWithPageConfig(async () => {
      expect(s.engine.envOriginConfig()).toBe("https://example.com");
    });
    expect(s.engine.envOriginConfig()).toBe(before);
    expect(before).toBe("");
  });
});

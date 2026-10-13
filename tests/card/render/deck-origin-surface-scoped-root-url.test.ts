// deck-origin-surface-scoped-root-url.test.ts — `decko.rootUrl` is a
// PER-CONFIGURATION value (card_url("")), not a constant. This is the pin
// for the origin-follows-configuration contract.
//
// MECHANISM (gem source):
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
// So `card_url("")` is Env.origin + "/", and Env.origin is the DECK'S
// CONFIGURED deck_origin — or the requestless "" when the deck configures
// none and there is no controller. The two render surfaces exercise two
// CONFIGURATION states of the same helper:
//
//   PAGE surface   the page path renders under the deck's configured
//                  deck_origin
//                  -> decko.rootUrl='<origin>/'
//   VIEW surface   the view path renders OUTSIDE that configuration and
//                  with no controller
//                  -> decko.rootUrl='/'
//
// THE ENGINE USED TO answer the page surface from a hard-coded constant
// (DECK_ORIGIN in render/deck-origin.ts) — one private deck's identity
// baked into every deployment. The constant is gone: the engine reads the
// deck's configured origin through setDeckEnvironment, "" when nothing is
// configured, and the replay suites install the configured value through
// the shared fixture (tests/card/fixtures/capture-page-lane-deck-origin.ts).
//
// WHY BOTH HALVES ARE ASSERTED. A "flip" fix (always "/" or always a
// pinned origin) would satisfy either single test and break the other; the
// recorded surface pins both directions, so the pin holds both: a
// CONFIGURED deck carries its configured origin on both surfaces, an
// UNCONFIGURED deck carries the requestless "/" on both surfaces — and the
// value the configured deck carries is THE DECK'S OWN, not the private
// value (asserted here with a neutral origin the test configures itself).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { headContent, renderPageBytes } from "../../../src/card/render/page.js";
import { DeckoName } from "../../../src/card/name.js";
import { setDeckEnvironment } from "../../../src/card/render/deck-origin.js";
import {
  CAPTURE_PAGE_LANE_DECK_ORIGIN,
  CAPTURE_PAGE_LANE_ROOT_URL,
  resetDeckEnvironmentForViewLane,
} from "../fixtures/capture-page-lane-deck-origin.js";

/** The head byte a deck configured with THIS test's own neutral origin
 *  carries: the deck's configuration, verbatim — not any engine constant. */
const TEST_DECK_ORIGIN = "https://deck-configured-origin.example";
const TEST_DECK_ROOT_URL = `decko.rootUrl='${TEST_DECK_ORIGIN}/';`;
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
  // The origin setting is process-wide module state; leave the requestless
  // form behind so no view-lane byte in another suite renders configured.
  resetDeckEnvironmentForViewLane();
  storage?.close();
});

/** The single `decko.rootUrl` line out of a head block. */
function rootUrlLine(head: string): string {
  const line = head.split("\n").find((l) => l.startsWith("decko.rootUrl="));
  if (line === undefined) throw new Error(`no decko.rootUrl line in head:\n${head}`);
  return line;
}

describe("decko.rootUrl follows the deck's configured origin (head_javascript.rb:35 card_url(\"\"))", () => {
  it("a deck that configures ITS OWN origin carries that origin on the page head — not any engine constant", async () => {
    const s = storage!;
    setDeckEnvironment({ origin: TEST_DECK_ORIGIN });
    try {
      const page = await renderPageBytes(s.engine, "Origin Probe");
      expect(page).toContain(TEST_DECK_ROOT_URL);
      // The negative half: no hard-coded private origin remains in the
      // engine — a deck configured with its own origin never renders
      // another deck's.
      expect(page).not.toContain("https://example.org");
    } finally {
      resetDeckEnvironmentForViewLane();
    }
  });

  it("a deck that configures no origin carries the requestless '/' on BOTH lanes (railtie.rb:28 + env.rb:17-19)", async () => {
    const s = storage!;
    resetDeckEnvironmentForViewLane();
    // PAGE surface, unconfigured: renderPageBytes under no origin — the
    // requestless form (Ruby's deck_origin-nil page shape: protocol and
    // host_with_port are what Ruby would interpolate, and this engine has
    // no controller, so "").
    const page = await renderPageBytes(s.engine, "Origin Probe");
    expect(page).toContain(VIEW_ROOT_URL);
    // VIEW lane, unconfigured: the bare root the oracle pins.
    const rootCard = await s.engine.prepareItemForRender("Origin Probe");
    expect(rootCard).toBeDefined();
    const head = await headContent(s.engine, DeckoName.parse("Origin Probe"), rootCard!);
    expect(rootUrlLine(head)).toBe(VIEW_ROOT_URL);
    expect(head).not.toContain("https://example.org");
  });

  it("the CAPTURE's page-lane configuration reproduces the graded page bytes (the :391-400 assignment through the same seam)", async () => {
    const s = storage!;
    setDeckEnvironment({ origin: CAPTURE_PAGE_LANE_DECK_ORIGIN });
    try {
      const page = await renderPageBytes(s.engine, "Origin Probe");
      expect(page).toContain(CAPTURE_PAGE_LANE_ROOT_URL);
      // The builder, called directly under the same configuration — the
      // value comes from the configuration, not from which builder entry
      // the page path takes.
      const rootCard = await s.engine.prepareItemForRender("Origin Probe");
      expect(rootCard).toBeDefined();
      const head = await s.engine.runWithPageConfig(() =>
        headContent(s.engine, DeckoName.parse("Origin Probe"), rootCard!),
      );
      expect(rootUrlLine(head)).toBe(CAPTURE_PAGE_LANE_ROOT_URL);
    } finally {
      resetDeckEnvironmentForViewLane();
    }
  });

  it("the page-config flag does not corrupt the configured value (nesting-safe, render.ts runWithPageConfig)", async () => {
    const s = storage!;
    setDeckEnvironment({ origin: TEST_DECK_ORIGIN });
    try {
      const before = s.engine.envOriginConfig();
      await s.engine.runWithPageConfig(async () => {
        // Configuration answers BOTH lanes (serializable.rb reads
        // deck_origin before any lane flag) — the value inside the page
        // wrapper is the deck's own, unchanged.
        expect(s.engine.envOriginConfig()).toBe(TEST_DECK_ORIGIN);
      });
      expect(s.engine.envOriginConfig()).toBe(before);
      expect(before).toBe(TEST_DECK_ORIGIN);
    } finally {
      resetDeckEnvironmentForViewLane();
    }
  });
});

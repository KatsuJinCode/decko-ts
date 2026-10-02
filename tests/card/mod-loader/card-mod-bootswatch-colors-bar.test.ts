// The type_plus_right/bootswatch_skin/colors bar arm (surfaces-batch3
// lane): view :bar_middle (colors.rb:102-122) — the fixed colorpicker
// heredoc literal — registered so a "*colors card under a bootswatch_skin
// left" dispatches it through the TYPE_PLUS_RIGHT-bootswatch_skin-Xcolor
// set-key token (the surfaces2 X-star-marker strip's anchor-path
// expansion).
//
// Byte basis: GEM-TRANSCRIBED — the heredoc literal is the gem's own fixed
// bytes; no capture shard renders a skin *colors card's bar_middle (the
// expected-v2 accordion nests carry hide: bar_middle in their slot opts).
//
// NAMED REMAINDERS of the same file (NOT ported): view :input +
// view :core (colors.rb:74-100 — the colorpicker editor + palette haml
// templates; they need card.colors' SCSS-parse machinery) and the
// `before :bar_right do voo.show :edit_button end` hook (colors.rb:88-90;
// no before-view hook surface).

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModBootstrap from "../../../src/card/mod-loader/mods/card-mod-bootstrap.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
const SKIN = "Media Probe Skin";

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 22, name: "Bootswatch skin", codename: "bootswatch_skin", typeId: 2 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  // the *colors setting + a real junction (the set anchor needs the
  // starred right card). NO *all+*read rule — the S4 deck proved junction
  // roots render allowed under the rule-less default, and a mis-resolved
  // read rule denies them (the anonymous verdict's rule walk needs the
  // full party machinery these probe decks don't carry).
  await seedCard(s, { id: 40, name: "*colors", codename: "colors", typeId: 14 });
  await seedCard(s, { id: 30, name: SKIN, typeId: 22 });
  await seedCard(s, {
    id: 41,
    name: `${SKIN}+*colors`,
    leftId: 30,
    rightId: 40,
    typeId: 14,
  });
  loader = new ModLoader([{ manifest: cardModBootstrap }]);
  loader.load();
  bindModLoaderToEngine(s, loader);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("type_plus_right/bootswatch_skin/colors bar_middle", () => {
  it("renders the colors.rb heredoc literal byte-for-byte on a skin +*colors card", async () => {
    const s = storage!;
    const html = await s.engine.render(`${SKIN}+*colors`, "bar_middle");
    expect(html).toBe(
      "\n" +
        '      <div class="colorpicker-element">\n' +
        '        <div class="input-group-addon">\n' +
        '          <span class="bg-body border p-1">Text</span>\n' +
        '          <span class="bg-dark text-light border p-1">Nav</span>\n' +
        '            <i class="bg-primary"></i>\n' +
        '          <i class="bg-secondary"></i>\n' +
        "        </div>\n" +
        "      </div>\n",
    );
  });

  it("does not leak to a non-skin +*colors card (the TPR anchor needs the bootswatch_skin left type)", async () => {
    const s = storage!;
    // a RichText-typed left's +*colors junction carries a DIFFERENT
    // TYPE_PLUS_RIGHT anchor (rich_text-Xcolor -> rich_text/colors), which
    // registers nothing — the mod's bar_middle is unreachable there; the
    // flat bar-family arm answers instead (its non-bar shape, NOT the
    // colorpicker literal). Ruby's set-scoped dispatch: TypePlusRight::
    // RichText::Colors has no bar_middle, so the base arm renders.
    await seedCard(s, { id: 50, name: "Plain Page", typeId: 2 });
    await seedCard(s, { id: 51, name: "Plain Page+*colors", leftId: 50, rightId: 40, typeId: 14 });
    const html = await s.engine.render("Plain Page+*colors", "bar_middle");
    expect(html).not.toContain("colorpicker-element");
    expect(html).not.toContain("bg-primary");
  });
});

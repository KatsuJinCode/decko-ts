// The MULTI-SEGMENT `/<mark>/<view>` read route over the two virtual follow
// junctions, read through the PAGE seam (renderPageBytes — the entry the
// two-segment route grammar feeds: deploy/worker.ts:526-533 `/:mark/:view`).
//
// The three follow-family VIEWS landed in 47098136 (tests/card/set-modules/
// virtual-set-modules.test.ts pins them through engine.render). This file pins
// the ROUTE that carries an explicit view segment: `/Home+*followers/content`
// and `/Mira Member+*follow/content`.
//
// WHY THE PAGE SEAM IS THE WHOLE POINT: the create-form substitution is a PAGE
// behavior, not a view behavior. card-mod-format set/all/html/error.rb:81-86
// `page_view_for_unknown` (`ok?(:create) ? :new : super`) replaces the
// unknown card's REQUESTED page view with `:new`; it never runs inside
// engine.render, so a view-level pin cannot see it. src/card/render/page.ts:338
// and :457-464 are the two places the port carries that substitution, and both
// gate on `engine.virtualSetCard(record)`. If the virtuality answer is lost for
// a REQUESTED-VIEW page render, the route silently answers the create form at
// a 200 while the same card's own views still render — which is exactly the
// failure shape this file exists to catch.
//
// THE MEMBERSHIP MECHANISM THIS FILE PINS (the lane's fix): the follower set
// under test is the deck-wide rule `*all+Mira Member+*follow` (rows 909/910 of
// the synthetic-v1 fixture; here seeded directly), reached for the followers
// list through `*all` in `Home.set_names` = ["Home+*self", "RichText+*type",
// "*all"] (MEASURED in the oracle's console). `followersContentFn` is
// registered at setPath right/followers with `membership: "set-module-chain"`:
// the anchor `*followers` is a STARRED codename card whose key singularizes to
// `*follower`, so the pure-name cardBelongsToSet anchor compare can never
// match a real junction (rightName.key `*follower` vs anchor `followers`);
// the registration instead answers Ruby's own question — is Right::Followers
// in the card's set-module chain (set/pattern/base.rb:21-29 module_key over
// :40-44 anchor_codenames), read off the card's own setKeys token
// RIGHT-Xfollower. The date overrides deliberately do NOT opt in
// (date-content-override-behavior-freeze-pins.test.ts pins their frozen
// verdicts), and this file's last test pins that boundary from the route side.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModFollow from "../../../src/card/mod-loader/mods/card-mod-follow.js";
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import cardModCollection from "../../../src/card/mod-loader/mods/card-mod-collection.js";
import cardModDate from "../../../src/card/mod-loader/mods/card-mod-date.js";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  contentOverrideFor,
  setDefaultContentOverrideRegistry,
  type ContentOverrideRegistry,
} from "../../../src/card/render/content-overrides.js";
import { cardInSetModule } from "../../../src/card/set-modules/set-module-membership.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename anchors. The keys matter: Decko singularizes a codename card's
  // key, so `*followers` keys as `*follower` (the `+*followers` safe key is
  // `RIGHT-follower` — the oracle's own slot class string).
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 13 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 110, name: "*follow", key: "*follow", codename: "follow", typeId: 14 });
  await seedCard(s, { id: 130, name: "*followers", key: "*follower", codename: "followers", typeId: 14 });
  await seedCard(s, { id: 120, name: "*following", key: "*following", codename: "following", typeId: 14 });
  // the follow OPTION codenames — resolveFollowers parses each preference
  // row's db_content ("*always") through these keys, so a fixture without
  // them resolves an empty follower set (a fixture miss, not the behavior).
  await seedCard(s, { id: 112, name: "*always", codename: "always", typeId: 14 });
  await seedCard(s, { id: 113, name: "*never", codename: "never", typeId: 14 });
  await seedCard(s, { id: 114, name: "*created", codename: "created", typeId: 14 });
  await seedCard(s, { id: 115, name: "*edited", codename: "edited", typeId: 14 });
  // the DATE codename cards (the boundary leg renders the real starred date
  // junctions in this same rig)
  await seedCard(s, { id: 116, name: "*when created", key: "*when_created", codename: "when_created", typeId: 14 });
  await seedCard(s, { id: 117, name: "*when last edited", key: "*when_last_edited", codename: "when_last_edited", typeId: 14 });

  // cardtypes: RichText (the plain cards) and User (the follow dashboard's left)
  await seedCard(s, { id: 2, name: "RichText", codename: "rich_text", typeId: 13 });
  await seedCard(s, { id: 3, name: "User", codename: "user", typeId: 13 });
  await seedCard(s, { id: 4, name: "List", codename: "list", typeId: 13 });
  await seedCard(s, { id: 5, name: "Pointer", codename: "pointer", typeId: 13 });

  await seedCard(s, { id: 300, name: "Mira Member", typeId: 3 });
  await seedCard(s, { id: 301, name: "Ada Admin", typeId: 3 });

  // the default layout's four codename nests (page.ts:1060-1081
  // `codeDefaultLayoutInterior`: header / _main / sidebar / footer). Without
  // them the page render raises `codename doesn't exist: header` before it
  // ever reaches the view under test — a fixture miss, not the behavior.
  await seedCard(s, { id: 60, name: "*header", codename: "header", typeId: 2, dbContent: "<nav>HEAD</nav>" });
  await seedCard(s, { id: 61, name: "*footer", codename: "footer", typeId: 2, dbContent: "<small>FOOT</small>" });
  await seedCard(s, { id: 62, name: "*sidebar", codename: "sidebar", typeId: 2, dbContent: "" });

  // the deck-wide follow rule: *all + Mira Member, with +*follow "*always"
  await seedCard(s, { id: 400, name: "*all+Mira Member", leftId: 10, rightId: 300, typeId: 13 });
  await seedCard(s, { id: 200, name: "Home", typeId: 2 });
  await seedCard(s, { id: 201, name: "Home+*self", leftId: 200, rightId: 11, typeId: 13 });
  await seedCard(s, {
    id: 410, name: "*all+Mira Member+*follow", leftId: 400, rightId: 110, typeId: 14,
    dbContent: "*always",
  });

  s.engine.renderAbsentCards = true;
  await s.fetcher.warmLexicon([10, 11, 13, 14, 110, 120, 130, 112, 113, 114, 115, 116, 117, 2, 3, 4, 5, 60, 61, 62, 200, 300, 301, 400, 410]);
  s.fetcher.installNameEnvironment();
}, 60_000);

afterAll(() => {
  setDefaultContentOverrideRegistry(undefined as unknown as ContentOverrideRegistry);
  loader?.reset();
  storage?.close();
});

beforeEach(() => {
  // ModLoader#reset clears the virtual registry (the loader's own
  // load-generation reset), so the NEXT loadMod must re-register.
  loader?.reset();
  loader = undefined;
});

async function loadMod(): Promise<void> {
  if (loader !== undefined) return;
  loader = new ModLoader([
    { manifest: cardModFormat },
    { manifest: cardModCollection },
    { manifest: cardModEdit },
    { manifest: cardModList },
    { manifest: cardModDate },
    { manifest: cardModFollow },
  ]);
  loader.load();
  bindModLoaderToEngine(storage!, loader!);
  // the deck-boot wire (default-mod-deck.ts:189): the render consult reads
  // the process-wide DEFAULT registry, and without this line no content
  // override can fire at all — the followers route would fail for the same
  // reason the date freezes would vacuously pass.
  setDefaultContentOverrideRegistry(loader!.contentOverrideRegistry());
  await loader.installInto(modEngineHost(storage!.engine, storage!.fetcher));
}

/** The create form is the substitution under test: its submit button is the
 *  byte the port's own view pins already use to name it
 *  (virtual-set-modules.test.ts:196, :300). */
const CREATE_FORM = "create-submit-button";

/** The bytes a fired date override would emit here (Home carries the seed
 *  default timestamp 2026-09-19 00:00:00.000; card-mod-date.ts
 *  formatDayofwkMinTz renders it '%A, %B %d, %Y ...'). */
const DATE_STAMP = "Saturday, September 19, 2026";

describe("the two-segment /<mark>/<view> route over the virtual follow junctions", () => {
  it("/Home+*followers/content READS the resolved follower set, not a create form", async () => {
    await loadMod();
    const s = storage!;
    const page = await renderPageBytes(s.engine, "Home+*followers", "content");
    // right/followers.rb:13-19 — item_names = left.follow_set_card.prototype
    // .follower_names, over the SAME resolveFollowers walk the "N followers"
    // pill reads (follow-render-seam.ts:657 `followerCountInto`).
    expect(page).toContain("Mira Member");
    expect(page).toContain("pointer-list");
    expect(page).not.toContain(CREATE_FORM);
  });

  it("/Mira Member+*follow/content renders the Follow/Ignore tabs (Ruby's content -> render_core)", async () => {
    await loadMod();
    const s = storage!;
    const page = await renderPageBytes(s.engine, "Mira Member+*follow", "content");
    // NOT the pointer list. card-mod-format set/all/html/views.rb:10-17
    // `view :content { wrap { [render_menu, render_core, render_edit_button] } }`
    // — the content view RENDERS CORE. user/follow.rb:39-43's `view :core` is
    // the FOLLOW_TABS machinery, so the `content` route's bytes are the tabs,
    // and the `item_names` pointer list (user/follow.rb:13-19) is NOT what this
    // route renders in Ruby. Expecting the resolved set HERE would itself be
    // the divergence.
    expect(page).toContain("Follow");
    expect(page).toContain("Ignore");
    expect(page).not.toContain(CREATE_FORM);
  });

  it("boundary, same rig: the real starred date junctions still render NO date-stamp bytes while the followers route renders its set", async () => {
    await loadMod();
    const s = storage!;
    const followersPage = await renderPageBytes(s.engine, "Home+*followers", "content");
    expect(followersPage).toContain("Mira Member");
    const createdPage = await renderPageBytes(s.engine, "Home+*when created", "content");
    expect(createdPage).not.toContain(DATE_STAMP);
    const editedPage = await renderPageBytes(s.engine, "Home+*when last edited", "content");
    expect(editedPage).not.toContain(DATE_STAMP);
  });

  it("the route's membership scoping: the follow registrations answer through the card's set-module chain, the date registrations never opted in", async () => {
    await loadMod();
    const s = storage!;
    // warm the engine's enriched-card cache so fetchRenderCard returns the
    // render-time card (setKeys computed)
    await renderPageBytes(s.engine, "Home+*followers", "content");
    const fetchRC = (s.engine as unknown as {
      fetchRenderCard?: (n: string) => Promise<unknown>;
    }).fetchRenderCard?.bind(s.engine);
    const followers = (await fetchRC?.("Home+*followers")) as { setKeys?: string } | undefined;
    expect(followers?.setKeys).toContain("RIGHT-Xfollower");
    // the chain question the opted-in registrations answer (base.rb:21-29)
    expect(cardInSetModule("right/followers", followers!.setKeys!)).toBe(true);
    // ...and the scoping that keeps the date lane byte-frozen: no belongsTo
    // on the date entries, so resolveContentOverrideEntry still consults the
    // name-key cardBelongsToSet for them (verdict false on real starred
    // cards, unchanged from before the fix).
    expect(contentOverrideFor("right/when_created")?.belongsTo).toBeUndefined();
    expect(contentOverrideFor("right/when_last_edited")?.belongsTo).toBeUndefined();
    expect(contentOverrideFor("right/followers")?.belongsTo).toBeDefined();
    expect(contentOverrideFor("type_plus_right/user/follow")?.belongsTo).toBeDefined();
  });
});

// The date content overrides' FROZEN verdicts, pinned before and while the
// followers-route read lands.
//
// WHY THIS FILE EXISTS: the followers route fix
// (right/followers + type_plus_right/user/follow rendering the resolved
// follower set) works by giving those two registrations a different
// membership predicate (`membership: "set-module-chain"` on the manifest
// file). `cardBelongsToSet` — the predicate EVERY OTHER registration keeps —
// has a measured gap on real starred junctions: a real `A+*when created`
// card's right part keys as `*when_created` (star prefix, codename-card
// singularization), so `right/when_created`'s name-key anchor
// "when_created" never compares equal and the date override does NOT fire
// on real starred cards. That verdict is the date lane's surface. This file
// pins it so the followers fix (or any later generalization of the matcher)
// cannot move the date bytes silently:
//
//   - unit level: cardBelongsToSet says FALSE for the real starred names
//     and TRUE for the unstarred synthetic shapes — both halves are "as it
//     behaves today" (the unstarred pins are the existing
//     content-overrides.test.ts pins' territory; repeated here so this file
//     alone carries the complete today-picture);
//   - rig level: with the SAME mod load the followers fix ships in (date +
//     follow loaded, the deck-boot registry wire installed), the real
//     starred date pages render NO date-stamp bytes while the followers
//     page DOES render its follower — the fix's boundary, both sides;
//   - mechanism level: the date registrations carry no per-module
//     membership predicate (belongsTo undefined) while the follow ones do,
//     and the chain predicate WOULD match the date card — i.e. the freeze
//     rests entirely on the date mod not opting in, so flipping the date
//     manifest to "set-module-chain" later fails these pins loudly instead
//     of changing deck-wide date bytes quietly.
//
// The bytes a fired date override WOULD emit here are distinctive: the
// fixture's Home row carries cards.created_at = "2026-09-19 00:00:00.000"
// (render-test-storage.ts seed default, asserted explicitly below), and
// whenCreatedContentFn formats it "Saturday, September 19, 2026 12:00 AM
// UTC" (card-mod-date.ts formatDayofwkMinTz, '%A, %B %d, %Y %I:%M %p UTC').
// Asserting that string's ABSENCE is therefore a real verdict, not a vacuous
// pass — with an untimestampted fixture the override could fire and still
// render "".

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DeckoName } from "../../../src/card/name.js";
import type { RenderCard } from "../../../src/card/render/format.js";
import {
  cardBelongsToSet,
  contentOverrideFor,
  setDefaultContentOverrideRegistry,
  type ContentOverrideRegistry,
} from "../../../src/card/render/content-overrides.js";
import { cardInSetModule } from "../../../src/card/set-modules/set-module-membership.js";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModFollow from "../../../src/card/mod-loader/mods/card-mod-follow.js";
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import cardModCollection from "../../../src/card/mod-loader/mods/card-mod-collection.js";
import cardModDate from "../../../src/card/mod-loader/mods/card-mod-date.js";
import { renderPageBytes } from "../../../src/card/render/page.js";

// ---------------------------------------------------------------------------
// unit level — the membership verdicts, no storage
// ---------------------------------------------------------------------------

/** Synthetic RenderCard, the content-overrides.test.ts rig (the engine
 *  enrichment cardBelongsToSet reads: the DeckoName plus an empty setKeys —
 *  the pure-NAME predicate never reads setKeys). */
function makeCard(name: string, dbContent: string): RenderCard {
  const dn = DeckoName.parse(name);
  return {
    record: {
      id: 1,
      codename: undefined,
      leftId: undefined,
      rightId: undefined,
      typeId: undefined,
      dbContent,
      trash: false,
      creatorId: undefined,
      updaterId: undefined,
      createdAt: "2026-09-19 00:00:00.000",
      updatedAt: "2026-09-19 00:00:00.000",
      currentRevisionId: undefined,
      readRuleClass: undefined,
      readRuleId: undefined,
      referencesExpired: undefined,
      name: dn,
      key: dn.key,
      isNew: false,
      fromTrash: false,
      uncacheable: false,
    },
    name: dn,
    key: dn.key,
    typeName: undefined,
    typeCode: undefined,
    typeId: undefined,
    id: 1,
    dbContent,
    setKeys: "",
  };
}

describe("date content overrides, membership as it behaves today (frozen)", () => {
  it("right/when_created does NOT match a real starred junction (A+*when created keys *when_created, anchor is when_created)", () => {
    // The name-key comparison the date registrations ride:
    // rightName.key of "A+*when created" is "*when_created" (the star
    // prefix a real rule card carries), the registered anchor is
    // "when_created" — never equal. This FALSE is today's verdict for
    // every real +*when created card in the deck.
    expect(cardBelongsToSet(makeCard("A+*when created", ""), "right/when_created")).toBe(false);
  });

  it("right/when_last_edited does NOT match a real starred junction (A+*when last edited)", () => {
    expect(cardBelongsToSet(makeCard("A+*when last edited", ""), "right/when_last_edited")).toBe(false);
  });

  it("right/when_created and right/when_last_edited stay anchor-distinct on the starred shapes", () => {
    expect(cardBelongsToSet(makeCard("A+*when created", ""), "right/when_last_edited")).toBe(false);
    expect(cardBelongsToSet(makeCard("A+*when last edited", ""), "right/when_created")).toBe(false);
  });

  it("the unstarred synthetic shapes still match (the existing pins' territory, kept here for the complete today-picture)", () => {
    expect(cardBelongsToSet(makeCard("A+when_created", ""), "right/when_created")).toBe(true);
    expect(cardBelongsToSet(makeCard("A+when last edited", ""), "right/when_last_edited")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rig level — the same mod load the followers fix ships in, deck-boot wire
// ---------------------------------------------------------------------------

const DATE_STAMP = "Saturday, September 19, 2026";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the date codename cards (the +*when created / +*when last edited
  // anchors must resolve through the lexicon for the set keys to carry
  // RIGHT-Xwhen_created tokens)
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 13 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 116, name: "*when created", key: "*when_created", codename: "when_created", typeId: 14 });
  await seedCard(s, { id: 117, name: "*when last edited", key: "*when_last_edited", codename: "when_last_edited", typeId: 14 });
  // the follow family (the rig loads the follow mod and renders one
  // followers page as its WORKING control — without it a date freeze pin
  // could pass vacuously on a rig where no override can fire at all)
  await seedCard(s, { id: 110, name: "*follow", key: "*follow", codename: "follow", typeId: 14 });
  await seedCard(s, { id: 130, name: "*followers", key: "*follower", codename: "followers", typeId: 14 });
  await seedCard(s, { id: 112, name: "*always", codename: "always", typeId: 14 });
  await seedCard(s, { id: 113, name: "*never", codename: "never", typeId: 14 });
  await seedCard(s, { id: 114, name: "*created", codename: "created", typeId: 14 });
  await seedCard(s, { id: 115, name: "*edited", codename: "edited", typeId: 14 });

  // cardtypes
  await seedCard(s, { id: 2, name: "RichText", codename: "rich_text", typeId: 13 });
  await seedCard(s, { id: 3, name: "User", codename: "user", typeId: 13 });
  await seedCard(s, { id: 4, name: "List", codename: "list", typeId: 13 });
  await seedCard(s, { id: 5, name: "Pointer", codename: "pointer", typeId: 13 });

  // people
  await seedCard(s, { id: 300, name: "Mira Member", typeId: 3 });

  // the default layout's codename nests (page.ts codeDefaultLayoutInterior:
  // header / _main / sidebar / footer — without them the page render raises
  // "codename doesn't exist: header" before the view under test runs)
  await seedCard(s, { id: 60, name: "*header", codename: "header", typeId: 2, dbContent: "<nav>HEAD</nav>" });
  await seedCard(s, { id: 61, name: "*footer", codename: "footer", typeId: 2, dbContent: "<small>FOOT</small>" });
  await seedCard(s, { id: 62, name: "*sidebar", codename: "sidebar", typeId: 2, dbContent: "" });

  // Home, EXPLICITLY timestamped: the date-stamp-absence pins below are a
  // real verdict only because a firing override would have bytes to emit.
  await seedCard(s, {
    id: 200, name: "Home", typeId: 2,
    createdAt: "2026-09-19 00:00:00.000",
    updatedAt: "2026-09-19 00:00:00.000",
  });
  await seedCard(s, { id: 201, name: "Home+*self", leftId: 200, rightId: 11, typeId: 13 });

  // the deck-wide follow rule that makes Mira Member a follower of Home
  await seedCard(s, { id: 400, name: "*all+Mira Member", leftId: 10, rightId: 300, typeId: 13 });
  await seedCard(s, {
    id: 410, name: "*all+Mira Member+*follow", leftId: 400, rightId: 110, typeId: 14,
    dbContent: "*always",
  });

  s.engine.renderAbsentCards = true;
  await s.fetcher.warmLexicon([
    10, 11, 13, 14, 110, 130, 112, 113, 114, 115, 116, 117,
    2, 3, 4, 5, 60, 61, 62, 200, 201, 300, 400, 410,
  ]);
  s.fetcher.installNameEnvironment();
}, 60_000);

afterAll(() => {
  setDefaultContentOverrideRegistry(undefined as unknown as ContentOverrideRegistry);
  loader?.reset();
  storage?.close();
});

/** The mod load the followers fix ships in — date AND follow, wired the
 *  deck-boot way (default-mod-deck.ts:189
 *  setDefaultContentOverrideRegistry(loader.contentOverrideRegistry());
 *  without the wire the render consult reads an empty default registry and
 *  NO override can fire, which would make every pin here vacuous). */
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
  setDefaultContentOverrideRegistry(loader!.contentOverrideRegistry());
  await loader.installInto(modEngineHost(storage!.engine, storage!.fetcher));
}

describe("date content overrides, page bytes as they behave today (frozen)", () => {
  it("/Home+*when created/content renders NO date-stamp bytes (the override does not fire; the fixture's Home carries the timestamp a firing override would format)", async () => {
    await loadMod();
    const page = await renderPageBytes(storage!.engine, "Home+*when created", "content");
    expect(page).not.toContain(DATE_STAMP);
  });

  it("/Home+*when last edited/content renders NO date-stamp bytes (same frozen verdict)", async () => {
    await loadMod();
    const page = await renderPageBytes(storage!.engine, "Home+*when last edited", "content");
    expect(page).not.toContain(DATE_STAMP);
  });

  it("control, same rig: /Home+*followers/content DOES render the resolved follower (the rig's overrides fire, so the date absences above are real verdicts)", async () => {
    await loadMod();
    const page = await renderPageBytes(storage!.engine, "Home+*followers", "content");
    expect(page).toContain("Mira Member");
  });
});

describe("the freeze's mechanism: the date registrations are not what opted in", () => {
  it("the date entries carry NO per-module membership predicate; the follow entries do", async () => {
    await loadMod();
    expect(contentOverrideFor("right/when_created")?.belongsTo).toBeUndefined();
    expect(contentOverrideFor("right/when_last_edited")?.belongsTo).toBeUndefined();
    expect(contentOverrideFor("self/now")?.belongsTo).toBeUndefined();
    expect(contentOverrideFor("right/followers")?.belongsTo).toBeDefined();
    expect(contentOverrideFor("type_plus_right/user/follow")?.belongsTo).toBeDefined();
  });

  it("the chain predicate WOULD match the real starred date cards — the freeze rests entirely on the date mod not opting in (flip it and these fail loudly)", async () => {
    await loadMod();
    await renderPageBytes(storage!.engine, "Home+*when created", "content");
    await renderPageBytes(storage!.engine, "Home+*when last edited", "content");
    const fetchRC = (storage!.engine as unknown as {
      fetchRenderCard?: (n: string) => Promise<unknown>;
    }).fetchRenderCard?.bind(storage!.engine);
    const created = (await fetchRC?.("Home+*when created")) as { setKeys?: string } | undefined;
    const edited = (await fetchRC?.("Home+*when last edited")) as { setKeys?: string } | undefined;
    expect(created?.setKeys).toContain("RIGHT-Xwhen_created");
    expect(edited?.setKeys).toContain("RIGHT-Xwhen_last_edited");
    expect(cardInSetModule("right/when_created", created!.setKeys!)).toBe(true);
    expect(cardInSetModule("right/when_last_edited", edited!.setKeys!)).toBe(true);
  });
});

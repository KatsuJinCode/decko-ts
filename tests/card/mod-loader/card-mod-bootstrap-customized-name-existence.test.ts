// Card.exist? for html_views.rb:4-11 `new_customized_name`.
//
// `newCustomizedName` has to answer "does this card exist?" against the
// DECK. Answering it from `engine.fetchRenderCard(name)` only reaches what
// the PREFETCH NEST-CLOSURE seated, and a bootswatch skin's `<skin>
// customized` sibling is referenced by nothing on the skin page — so that
// reach reports "free" for every skin that does have a sibling, and Ruby
// would have emitted a suffixed name instead.
//
// The rule the port follows (html_views.rb:4-11): while a
// "<skin> customized" card exists, keep appending the numeric suffix —
// html_views.rb:8-9 walks String#next! so a collided candidate becomes
// "... customized 2".
//
// The third deck below exists because the existence answer has to be
// EXACT on the stored name: the canonical key folds casing, so any
// key-shaped lookup cannot distinguish a stored "Skin Customized" from a
// query for "skin customized".
//
// PIN CONVENTION: every pin below is RED-verified — each is run against the
// pre-fix tree first and MUST fail, then run against the fix. The pins that
// are ALSO expected to pass pre-fix (the case-falsifier regression guards)
// are marked and are checked as "must stay green".

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModBootstrap from "../../../src/card/mod-loader/mods/card-mod-bootstrap.js";
import { DeckoName } from "../../../src/card/name.js";

/** The bootswatch_skin TYPE card. Named `*bootswatch_skin` so the render
 *  engine's set-key chain carries the starred TYPE token that `viewChain`
 *  needs to reach the nested `set/type/bootswatch_skin/html_views.rb` module
 *  (the same shape card-mod-bootstrap.test.ts:100-105 seeds), and seeded as
 *  a codename so `peekCodenameById(record.typeId)` admits the probes into
 *  the bootswatch family warm where the existence walk runs. */
const BOOTSWATCH_SKIN_TYPE_ID = 500;

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  const s = await createRenderTestStorage();
  storage = s;
  const l = new ModLoader([{ manifest: cardModBootstrap }]);
  loader = l;
  l.load();
  bindModLoaderToEngine(s, l);
  await seedCard(s, {
    id: BOOTSWATCH_SKIN_TYPE_ID,
    name: "*bootswatch_skin",
    codename: "bootswatch_skin",
    typeId: 13,
    dbContent: "",
  });

  // ---- deck A: the SUFFIXED shapes (the existence gap itself) ---------------
  // "meridian skin" + its customized sibling, stored in lowercase.
  await seedCard(s, {
    id: 1100,
    name: "meridian skin",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "journal scss",
  });
  await seedCard(s, {
    id: 1101,
    name: "meridian skin customized",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "journal scss v2",
  });
  // "quartz skin" + its customized sibling.
  await seedCard(s, {
    id: 1102,
    name: "quartz skin",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "slate scss",
  });
  await seedCard(s, {
    id: 1103,
    name: "quartz skin customized",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "slate scss v2",
  });
  // "cobalt skin" + its customized sibling. No rendered body exists for
  // this skin, so the port's answer here is pinned from the rule rather
  // than against bytes.
  await seedCard(s, {
    id: 1104,
    name: "cobalt skin",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "litera scss",
  });
  await seedCard(s, {
    id: 1105,
    name: "cobalt skin customized",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "litera scss v2",
  });
  // A deck holding a fully-collided walk: "<skin> customized" AND
  // "<skin> customized 1" both exist, so Ruby emits "... customized 2".
  await seedCard(s, {
    id: 1106,
    name: "collide skin",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "collide scss",
  });
  await seedCard(s, {
    id: 1107,
    name: "collide skin customized",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "collide scss v2",
  });
  await seedCard(s, {
    id: 1108,
    name: "collide skin customized 1",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "collide scss v3",
  });

  // ---- deck B: the BARE control ------------------------------------------
  // No customized sibling at all. This is the shape the page-scoped map gate
  // already got right BY ACCIDENT; it is the control that proves the new
  // existence query did not start suffixing skins that have no sibling.
  await seedCard(s, {
    id: 1200,
    name: "cerulean skin",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "cerulean scss",
  });
  await seedCard(s, {
    id: 1201,
    name: "solar skin",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "solar scss",
  });

  // ---- deck C: the CASE falsifier (must stay GREEN pre-fix) ---------------
  // The stored sibling's casing DIFFERS from the proposed name's casing.
  // Rendered "Cerulean Case Skin" the walk proposes
  // "Cerulean Case Skin customized"; the deck stores "Cerulean Case Skin
  // Customized" (capital C). The canonical key folds both to
  // "cerulean_case_skin_customized", so any key/lexicon-folded existence
  // answer says TRUE here and the view would render "... customized 1" —
  // the wrong name.
  await seedCard(s, {
    id: 1300,
    name: "Cerulean Case Skin",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "case scss",
  });
  await seedCard(s, {
    id: 1301,
    name: "Cerulean Case Skin Customized",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "case scss v2",
  });
  // ... and the same deck's EXACT-cased twin: the proposed name is byte-equal
  // to the stored name, so this one MUST be suffixed. Same canonical key as
  // the probe above; the two together are the exactness pin.
  await seedCard(s, {
    id: 1302,
    name: "Cosmo Case Skin",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "case scss",
  });
  await seedCard(s, {
    id: 1303,
    name: "Cosmo Case Skin customized",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "case scss v2",
  });
});

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** The Customize button's `card[name]` query param, decoded. The view builds
 *  the href as `/card/create?card%5Bfields%5D%5Bparent%5D=<skin>&
 *  card%5Bname%5D=<newName>&card%5Btype%5D=bootswatch_skin&mark=<newName>`
 *  (buildCustomizeButtonHref), so the proposed new card name is the whole
 *  point of the view. */
function proposedName(html: string): string {
  const match = html.match(/card%5Bname%5D=([^&]*)/);
  expect(match, `no card[name] param in ${html}`).not.toBeNull();
  // Rack::Utils form encoding: space -> `+` (buildCustomizeButtonHref's
  // encodeValue replaces %20 with +), so decode the form body, not a path.
  return decodeURIComponent(
    (match as RegExpMatchArray)[1].replace(/\+/g, "%20"),
  );
}

async function renderCustomizeButton(name: string): Promise<string> {
  const s = storage;
  if (s === undefined) throw new Error("storage not seeded");
  return s.engine.render(name, "customize_button");
}

describe("Card.exist? drives new_customized_name (card-mod-bootstrap)", () => {
  // -------------------------------------------------------------------------
  // The page-scoped map gate answered "free" for all of these before the
  // existence query landed.
  // -------------------------------------------------------------------------
  it("suffixes the meridian skin whose customized card exists", async () => {
    const html = await renderCustomizeButton("meridian skin");
    expect(proposedName(html)).toBe("meridian skin customized 1");
  });

  it("suffixes the quartz skin whose customized card exists", async () => {
    const html = await renderCustomizeButton("quartz skin");
    expect(proposedName(html)).toBe("quartz skin customized 1");
  });

  it("suffixes the cobalt skin whose customized card exists even when the reference deck never captured one", async () => {
    const html = await renderCustomizeButton("cobalt skin");
    expect(proposedName(html)).toBe("cobalt skin customized 1");
  });

  it("keeps walking the numeric suffix past a collided candidate (html_views.rb:8-9 String#next!)", async () => {
    const html = await renderCustomizeButton("collide skin");
    expect(proposedName(html)).toBe("collide skin customized 2");
  });

  it("suffixes a skin whose customized sibling's stored name is byte-equal to the proposal", async () => {
    // The exactness twin of the case falsifier below: identical canonical
    // key, exact stored name => must be suffixed.
    const html = await renderCustomizeButton("Cosmo Case Skin");
    expect(proposedName(html)).toBe("Cosmo Case Skin customized 1");
  });

  // -------------------------------------------------------------------------
  // BARE CONTROLS — a customized sibling that does not exist must leave the
  // name bare. These were green before the fix as well, and they are the
  // guard that the existence query did not start suffixing skins whose
  // customized card is absent.
  // -------------------------------------------------------------------------
  it("leaves a skin with no customized sibling bare (bare control)", async () => {
    const html = await renderCustomizeButton("cerulean skin");
    expect(proposedName(html)).toBe("cerulean skin customized");
  });

  it("leaves a second bare skin bare after the suffixed skins have rendered (cache-order control)", async () => {
    // Order matters: this runs AFTER the suffixed probes on the same engine,
    // so it also pins that the memo is keyed per skin and does not leak.
    const html = await renderCustomizeButton("solar skin");
    expect(proposedName(html)).toBe("solar skin customized");
  });

  // -------------------------------------------------------------------------
  // THE CASE FALSIFIER — green before the fix, MUST stay green. Any
  // case-folded existence arm (DeckoName.parse().key, Lexicon#peekId, a
  // case-folded render-card-map read) answers TRUE for this deck and renders
  // "... customized 1", which is the wrong name.
  // -------------------------------------------------------------------------
  it("leaves a case-MISMATCHED customized sibling unsuffixed (the case-folding falsifier)", async () => {
    const html = await renderCustomizeButton("Cerulean Case Skin");
    expect(proposedName(html)).toBe("Cerulean Case Skin customized");
  });
});

describe("RenderEngine#cardExists is an EXACT stored-name query", () => {
  it("documents the case-fold a key-shaped lexicon lookup cannot distinguish", () => {
    // THE TRAP, MECHANICALLY. `DeckoName#key` is the canonical key, and
    // `Inflector#underscore` downcases (src/card/name/inflect.ts:264-271,
    // porting cardname lib/cardname.rb:106-116 simple_key). So every
    // key-shaped existence lookup — `Lexicon#peekId`, a case-folded
    // render-card-map read, Ruby's own `Card.exist?` (see the header block)
    // — says TRUE for both spellings below and cannot tell them apart. The
    // The existence gate is exact on the STORED name precisely so it can.
    expect(DeckoName.parse("Cerulean Case Skin customized").key).toBe(
      DeckoName.parse("Cerulean Case Skin Customized").key,
    );
  });

  it("answers true for a stored name that is byte-equal to the query", async () => {
    const s = storage;
    if (s === undefined) throw new Error("storage not seeded");
    expect(await s.engine.cardExists("meridian skin customized")).toBe(true);
  });

  it("answers false for a case-folded twin of a stored name (the exactness pin)", async () => {
    const s = storage;
    if (s === undefined) throw new Error("storage not seeded");
    // "Cerulean Case Skin Customized" is stored; this query differs only in
    // the case of the trailing "customized".
    expect(await s.engine.cardExists("Cerulean Case Skin customized")).toBe(false);
  });

  it("answers false for a name no card carries", async () => {
    const s = storage;
    if (s === undefined) throw new Error("storage not seeded");
    expect(await s.engine.cardExists("no such skin customized")).toBe(false);
  });

  it("answers false for a trashed card (retrieve.rb:28-33 trash = false default)", async () => {
    const s = storage;
    if (s === undefined) throw new Error("storage not seeded");
    await seedCard(s, {
      id: 1400,
      name: "trashed skin customized",
      typeId: BOOTSWATCH_SKIN_TYPE_ID,
      dbContent: "trashed",
      trash: true,
    });
    expect(await s.engine.cardExists("trashed skin customized")).toBe(false);
  });
});

describe("the customized-name memo follows save-side invalidation", () => {
  it("re-asks after a save creates the card the button had proposed", async () => {
    const s = storage;
    if (s === undefined) throw new Error("storage not seeded");
    // solar skin (1201) has no customized sibling, so the warm resolved the
    // bare base. Creating that card flips the answer — the same invalidation
    // shape as the render-card map's expireRenderCard.
    expect(proposedName(await renderCustomizeButton("solar skin"))).toBe(
      "solar skin customized",
    );
    await seedCard(s, {
      id: 1202,
      name: "solar skin customized",
      typeId: BOOTSWATCH_SKIN_TYPE_ID,
      dbContent: "solar scss v2",
    });
    s.engine.expireRenderCard("solar skin customized");
    expect(proposedName(await renderCustomizeButton("solar skin"))).toBe(
      "solar skin customized 1",
    );
  });
});

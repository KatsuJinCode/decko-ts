// M9 — Card.exist? for html_views.rb:4-11 `new_customized_name`.
//
// The gate this file pins is the ONE the negdelta lane left as a KNOWN GAP:
// `newCustomizedName` answered "does this card exist?" from
// `engine.fetchRenderCard(name)`, which is the PREFETCH NEST-CLOSURE's reach,
// not the deck. A bootswatch skin's `<skin> customized` sibling is referenced
// by nothing on the skin page, so it is never seated in the render-card map
// and the gate read "free" for every skin in the deck.
//
// The oracle says otherwise, and the rule is a corpus census rather than an
// inference. From `tmp/raw-ground-truth/expected-v2/page-lane/*.jsonl`, the
// 20 bootswatch skin pages and their `card%5Bname%5D=` parameter:
//
//   22774 cerulean skin  -> cerulean+skin+customized       (bare)
//   22794 journal skin   -> journal+skin+customized+1      (SUFFIXED)
//   22818 slate skin     -> slate+skin+customized+1        (SUFFIXED)
//   cosmo / cyborg / darkly / flatly / lumen / sandstone / simplex /
//   spacelab / superhero / united / yeti / lux / materia / minty /
//   pulse / sketchy / solar -> <skin>+skin+customized       (bare)
//
// and from the corpus (`SELECT id,name,key,trash FROM cards WHERE type_id=33929`):
//
//   34179 "journal skin customized"  trash=0
//   34530 "litera skin customized"   trash=0
//   38274 "slate skin customized"    trash=0
//
// The two SUFFIXED skin pages are exactly two of the three skins that have a
// customized card. `litera skin` (33872) is not in the oracle expected set, so
// it is unobservable there — the deck shapes below stand in for it, so this
// file pins all three customized-card shapes, not just the two the capture
// happens to carry.
//
// PIN CONVENTION (this lane's): every pin below is RED-verified — each is run
// against the pre-fix tree first and MUST fail, then run against the fix.
// The pins that are ALSO expected to pass pre-fix (the case-falsifier
// regression guards) are marked and are checked as "must stay green".

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
 *  the bootswatch family warm where the M9 existence walk runs. */
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

  // ---- deck A: the SUFFIXED shapes (the M9 gap itself) --------------------
  // "Journal Skin" + its customized sibling at the corpus's stored casing
  // (lowercase c), exactly like corpus 34179 next to 22794.
  await seedCard(s, {
    id: 1100,
    name: "journal skin",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "journal scss",
  });
  await seedCard(s, {
    id: 1101,
    name: "journal skin customized",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "journal scss v2",
  });
  // "Slate Skin" + its customized sibling (corpus 38274 next to 22818).
  await seedCard(s, {
    id: 1102,
    name: "slate skin",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "slate scss",
  });
  await seedCard(s, {
    id: 1103,
    name: "slate skin customized",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "slate scss v2",
  });
  // "Litera Skin" + its customized sibling (corpus 34530 next to 33872). The
  // corpus DOES have this card; the oracle capture has no `litera skin` page,
  // so the port's answer here is unverified against bytes and is pinned from
  // the rule instead.
  await seedCard(s, {
    id: 1104,
    name: "litera skin",
    typeId: BOOTSWATCH_SKIN_TYPE_ID,
    dbContent: "litera scss",
  });
  await seedCard(s, {
    id: 1105,
    name: "litera skin customized",
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
  // which is the negdelta lane's falsifier, verbatim.
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

describe("M9 — Card.exist? drives new_customized_name (card-mod-bootstrap)", () => {
  // -------------------------------------------------------------------------
  // RED before the fix (the page-scoped map gate answered "free" for all of
  // these), GREEN after.
  // -------------------------------------------------------------------------
  it("suffixes the journal skin whose customized card exists (corpus 34179 -> oracle 22794)", async () => {
    const html = await renderCustomizeButton("journal skin");
    expect(proposedName(html)).toBe("journal skin customized 1");
  });

  it("suffixes the slate skin whose customized card exists (corpus 38274 -> oracle 22818)", async () => {
    const html = await renderCustomizeButton("slate skin");
    expect(proposedName(html)).toBe("slate skin customized 1");
  });

  it("suffixes the litera skin whose customized card exists (corpus 34530 -> 33872, uncaptured by the oracle)", async () => {
    const html = await renderCustomizeButton("litera skin");
    expect(proposedName(html)).toBe("litera skin customized 1");
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
  // BARE CONTROLS — these are the eighteen other oracle skin pages. They were
  // green before the fix by accident; they must still be green after, and they
  // are the guard that the new live query did not start suffixing skins whose
  // customized card does not exist.
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
  it("leaves a case-MISMATCHED customized sibling unsuffixed (the negdelta falsifier)", async () => {
    const html = await renderCustomizeButton("Cerulean Case Skin");
    expect(proposedName(html)).toBe("Cerulean Case Skin customized");
  });
});

describe("M9 — RenderEngine#cardExists is an EXACT stored-name query", () => {
  it("documents the case-fold the negdelta lane's lexicon arm fell into", () => {
    // THE TRAP, MECHANICALLY. `DeckoName#key` is the canonical key, and
    // `Inflector#underscore` downcases (src/card/name/inflect.ts:264-271,
    // porting cardname lib/cardname.rb:106-116 simple_key). So every
    // key-shaped existence lookup — `Lexicon#peekId`, a case-folded
    // render-card-map read, Ruby's own `Card.exist?` (see the header block)
    // — says TRUE for both spellings below and cannot tell them apart. The
    // M9 gate is exact on the STORED name precisely so it can.
    expect(DeckoName.parse("Cerulean Case Skin customized").key).toBe(
      DeckoName.parse("Cerulean Case Skin Customized").key,
    );
  });

  it("answers true for a stored name that is byte-equal to the query", async () => {
    const s = storage;
    if (s === undefined) throw new Error("storage not seeded");
    expect(await s.engine.cardExists("journal skin customized")).toBe(true);
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

describe("M9 — the customized-name memo follows save-side invalidation", () => {
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

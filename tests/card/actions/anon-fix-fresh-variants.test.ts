// Anonymous-write bypass probes — FRESH-VARIANT attacks against the six
// anonymous-write fixes. The base probes live in
// anon-redteam-probes.test.ts; EVERY test here is a NEW attack those probes
// never ran, aimed at each fix itself. A passing assertion pins the fixed
// engine's answer (deny / allow direction as the arm states); a failing
// assertion is a BYPASS finding.
//
// Arms (the HIGH-n / MEDIUM-n / LOW-n labels match the test names below and
// in anon-redteam-probes.test.ts): HIGH-1 (side would-be type: *default
// template chain + type codename assignment), HIGH-2 (depth 5/6/7 +
// protected MIDDLE parts), MEDIUM-2 (single real-account party deck),
// MEDIUM-4 (left-part rename = the *type plus right anchor), MEDIUM-1
// (draft under the route's own config shape — default rule walk, no
// captchaRuleContent override), LOW-1 (id-keyed actor on update+delete,
// both confusion directions).

import { afterEach, describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedReference,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import {
  ANONYMOUS_ACTOR_NAME,
  type Actor,
  type CardActionError,
} from "../../../src/card/actions/types.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModRecaptcha, {
  recaptchaModEventPredicates,
} from "../../../src/card/mod-loader/mods/card-mod-recaptcha.js";
import type { ModEventRuntime } from "../../../src/card/mod-loader/mod-event-dispatch.js";
import {
  registerSetTypeAssignment,
  resetSetTypeAssignments,
} from "../../../src/card/set-patterns/set-type-assignment.js";

const SET_TYPE_ID = 2;
const ANON_CARD_ID = 11;
const EDITOR_ID = 7;
const ANYONE_ID = 6;

/** Codename + structure skeleton (same shape as anon-redteam-probes'
 *  seedSkeleton): `defaultTypeId` names the card the *all+*default rule
 *  card carries as its type_id — Card.default_type_id's source. */
async function seedSkeleton(s: ActionsTestStorage, defaultTypeId: number): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 4, name: "*create", codename: "create" });
  await seedCard(s, { id: 5, name: "*update", codename: "update" });
  await seedCard(s, { id: 16, name: "*delete", codename: "delete" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Editor" });
  await seedCard(s, { id: 8, name: "*type", codename: "type" });
  await seedCard(s, { id: 17, name: "*default", codename: "default" });
  await seedCard(s, { id: 11, name: "Anonymous User", codename: "anonymous" });
  await seedCard(s, { id: 42, name: "Rich Text", typeId: 3 });
  await seedCard(s, { id: 33, name: "*all+*default", leftId: 1, rightId: 17, typeId: defaultTypeId });
}

/** *all+*create -> [[Anyone]] fallback (id 10). */
async function seedAllCreateAnyone(s: ActionsTestStorage): Promise<void> {
  await seedCard(s, {
    id: 10, name: "*all+*create", leftId: 1, rightId: 4,
    typeId: SET_TYPE_ID, dbContent: "[[Anyone]]",
  });
  await seedReference(s, 10, ANYONE_ID, "anyone");
}

/** Signup type trio (ids 12/13/14): Signup+*type+*create -> [[Anyone]]. */
async function seedSignupTrunk(s: ActionsTestStorage): Promise<void> {
  await seedCard(s, { id: 12, name: "Signup", typeId: 3 });
  await seedCard(s, { id: 13, name: "Signup+*type", leftId: 12, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 14, name: "Signup+*type+*create", leftId: 13, rightId: 4, dbContent: "[[Anyone]]" });
  await seedReference(s, 14, ANYONE_ID, "anyone");
}

/** Depth deck: *all+*create -> Anyone, *star+*create -> Editor, nothing
 *  else — identical shape to anon-redteam-probes' seedDepthDeck. */
async function seedDepthDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, { id: 18, name: "*star", codename: "star", typeId: SET_TYPE_ID });
  await seedAllCreateAnyone(s);
  await seedCard(s, { id: 41, name: "*star+*create", leftId: 18, rightId: 4, dbContent: "[[Editor]]" });
  await seedReference(s, 41, EDITOR_ID, "editor");
  return s;
}

/** HIGH-1a deck: the *default template chain points at an EXOTIC type
 *  (id 90) — *all+*default's type_id IS Card.default_type_id (type.rb:3-5)
 *  — and Exotic Type+*type+*create locks it to Editor (protect=true) or
 *  opens it to Anyone (protect=false). Signup trunk stays Anyone-open so
 *  the junction's own verdict passes and the side walk is what decides. */
async function seedExoticDefaultDeck(protect: boolean): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 90);
  await seedCard(s, { id: 90, name: "Exotic Type", typeId: 3 });
  await seedCard(s, { id: 91, name: "Exotic Type+*type", leftId: 90, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 92, name: "Exotic Type+*type+*create", leftId: 91, rightId: 4,
    dbContent: protect ? "[[Editor]]" : "[[Anyone]]",
  });
  await seedReference(s, 92, protect ? EDITOR_ID : ANYONE_ID, protect ? "editor" : "anyone");
  await seedAllCreateAnyone(s);
  await seedSignupTrunk(s);
  return s;
}

/** HIGH-1b deck: a *right type ASSIGNMENT resolves the side part
 *  "Hatch+*all"'s would-be type through a TYPE CODENAME ("phrase") —
 *  mod/core/set/right/autoname.rb:1's `assign_type :phrase` shape,
 *  registered by the test via registerSetTypeAssignment. Phrase+*type+*create
 *  locks (Editor) or opens (Anyone). */
async function seedPhraseAssignmentDeck(protect: boolean): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, { id: 91, name: "Phrase", codename: "phrase", typeId: 3 });
  await seedCard(s, { id: 92, name: "Phrase+*type", leftId: 91, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 93, name: "Phrase+*type+*create", leftId: 92, rightId: 4,
    dbContent: protect ? "[[Editor]]" : "[[Anyone]]",
  });
  await seedReference(s, 93, protect ? EDITOR_ID : ANYONE_ID, protect ? "editor" : "anyone");
  await seedAllCreateAnyone(s);
  await seedSignupTrunk(s);
  return s;
}

/** MEDIUM-2 deck: the deck's ONLY rule card is *all+*update granting a
 *  party of ONE real account (Editor). No create/delete rules at all. */
async function seedSingleAccountDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, { id: 50, name: "Victim", typeId: 42 });
  await seedCard(s, {
    id: 61, name: "*all+*update", leftId: 1, rightId: 5,
    typeId: SET_TYPE_ID, dbContent: "[[Editor]]",
  });
  await seedReference(s, 61, EDITOR_ID, "editor");
  return s;
}

/** MEDIUM-4 left-part deck: junction anchors differ by the LEFT part's
 *  TYPE through the *type plus right pattern (anchor = left's type + the
 *  right part; there is no *left pattern): "Rich Text+Plain" -> Anyone,
 *  "Blue Type+Plain" -> Editor. Rename = left part swap. Renames target
 *  names no seeded junction holds (validate_uniqueness_of_name must not
 *  fire before the permission verdict). */
async function seedLeftRenameDeck(): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, { id: 44, name: "Blue Type", typeId: 3 });
  await seedCard(s, { id: 56, name: "*type plus right", codename: "type_plus_right", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 60, name: "Plain", typeId: 42 });
  await seedCard(s, { id: 62, name: "Holder", typeId: 42 });
  await seedCard(s, { id: 63, name: "Holder Two", typeId: 44 });
  await seedCard(s, { id: 65, name: "Holder Three", typeId: 42 });
  await seedCard(s, { id: 70, name: null, key: null, leftId: 62, rightId: 60, typeId: 42 });
  await seedCard(s, { id: 80, name: null, key: null, leftId: 63, rightId: 60, typeId: 42 });
  await seedCard(s, { id: 85, name: "Rich Text+Plain", leftId: 42, rightId: 60, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 87, name: "Rich Text+Plain+*type plus right", leftId: 85, rightId: 56, typeId: SET_TYPE_ID,
  });
  await seedCard(s, {
    id: 88, name: "Rich Text+Plain+*type plus right+*update", leftId: 87, rightId: 5,
    dbContent: "[[Anyone]]",
  });
  await seedReference(s, 88, ANYONE_ID, "anyone");
  await seedCard(s, { id: 89, name: "Blue Type+Plain", leftId: 44, rightId: 60, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 94, name: "Blue Type+Plain+*type plus right", leftId: 89, rightId: 56, typeId: SET_TYPE_ID,
  });
  await seedCard(s, {
    id: 95, name: "Blue Type+Plain+*type plus right+*update", leftId: 94, rightId: 5,
    dbContent: "[[Editor]]",
  });
  await seedReference(s, 95, EDITOR_ID, "editor");
  await seedCard(s, {
    id: 21, name: "*all+*update", leftId: 1, rightId: 5,
    typeId: SET_TYPE_ID, dbContent: "[[Anyone]]",
  });
  await seedReference(s, 21, ANYONE_ID, "anyone");
  return s;
}

/** MEDIUM-1 deck (seedDraftDeck shape) + the route-config arming card: the
 *  *all+*captcha RULE card (content "1") that arms the guard through the
 *  engine's DEFAULT rule walk — the staging host never sets
 *  captchaRuleContent (staging-server-recaptcha-env-config.ts:30). */
async function seedDraftDeck(withCaptchaRule: boolean): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, { id: 15, name: "*captcha", codename: "captcha" });
  await seedSignupTrunk(s);
  await seedCard(s, {
    id: 21, name: "*all+*update", leftId: 1, rightId: 5,
    typeId: SET_TYPE_ID, dbContent: "[[Anyone]]",
  });
  await seedReference(s, 21, ANYONE_ID, "anyone");
  await seedCard(s, { id: 20, name: "Journal Page", typeId: 42, dbContent: "original" });
  if (withCaptchaRule) {
    await seedCard(s, {
      id: 22, name: "*all+*captcha", leftId: 1, rightId: 15,
      typeId: SET_TYPE_ID, dbContent: "1",
    });
  }
  return s;
}

/** LOW-1 deck: Anyone-open update+delete over one content card, captcha
 *  rule optional (for the signed-in-skip arm). */
async function seedIdKeyedDeck(withCaptchaRule: boolean, deleteRuleAnyone: boolean): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedSkeleton(s, 42);
  await seedCard(s, {
    id: 21, name: "*all+*update", leftId: 1, rightId: 5,
    typeId: SET_TYPE_ID, dbContent: "[[Anyone]]",
  });
  await seedReference(s, 21, ANYONE_ID, "anyone");
  await seedCard(s, {
    id: 51, name: "*all+*delete", leftId: 1, rightId: 16,
    typeId: SET_TYPE_ID, dbContent: deleteRuleAnyone ? "[[Anyone]]" : "[[Editor]]",
  });
  await seedReference(s, 51, deleteRuleAnyone ? ANYONE_ID : EDITOR_ID, deleteRuleAnyone ? "anyone" : "editor");
  await seedCard(s, { id: 50, name: "Journal Page", typeId: 42, dbContent: "orig" });
  if (withCaptchaRule) {
    await seedCard(s, { id: 15, name: "*captcha", codename: "captcha" });
    await seedCard(s, {
      id: 22, name: "*all+*captcha", leftId: 1, rightId: 15,
      typeId: SET_TYPE_ID, dbContent: "1",
    });
  }
  return s;
}

function anonEngine(s: ActionsTestStorage): CardActionEngine {
  return new CardActionEngine(s.engine, { actor: null, ipAddress: "192.0.2.7" });
}

function actorEngine(s: ActionsTestStorage, actor: Actor): CardActionEngine {
  return new CardActionEngine(s.engine, { actor, ipAddress: "192.0.2.7" });
}

function stubVerify(body: unknown): {
  verify: (url: string, query: { secret: string; response: string }) => Promise<string>;
  calls: unknown[];
} {
  const calls: unknown[] = [];
  return {
    calls,
    verify: async (url, query) => {
      calls.push({ url, query });
      return JSON.stringify(body);
    },
  };
}

/** The route-config engine shape: recaptcha config WITHOUT captchaRuleContent
 *  (the route never sets it — the deck's own rule walk arms the guard) plus
 *  a runtime whose registry carries the :recaptcha event. The serving write
 *  path composes the whole deck through the deck-boot seam
 *  (write-routes.ts servingModEventRuntime -> defaultDeckEventRuntime);
 *  this helper is the minimal engine-boundary equivalent - the guard
 *  needs the event registered and the predicates resolvable, which the
 *  recaptcha-only loader supplies. */
function routeSeatEngine(
  s: ActionsTestStorage,
  verify: (url: string, query: { secret: string; response: string }) => Promise<string>,
  actor: Actor | null = null,
): CardActionEngine {
  const runtime: ModEventRuntime = {
    registry: (() => {
      const loader = new ModLoader([{ manifest: cardModRecaptcha }]);
      loader.resolveOrder({ gemMods: ["recaptcha"] });
      loader.load();
      return loader.eventRegistry();
    })(),
    predicates: recaptchaModEventPredicates,
  };
  return new CardActionEngine(s.engine, {
    actor,
    ipAddress: "192.0.2.7",
    recaptcha: { siteKey: "k", secretKey: "s", verify },
    modEvents: runtime,
  });
}

async function asError(p: Promise<unknown>): Promise<CardActionError | undefined> {
  return (await p.then(
    () => undefined,
    (e: CardActionError) => e,
  )) as CardActionError | undefined;
}

async function keyRow(s: ActionsTestStorage, key: string): Promise<{ id: number } | undefined> {
  return s.selectOne<{ id: number }>("SELECT id FROM cards WHERE `key` = ?", [key]);
}

afterEach(() => {
  resetSetTypeAssignments(); // the assignment registry is process-global
});

// -----------------------------------------------------------------------
// HIGH-1 fresh variants: the side part's WOULD-BE type
// -----------------------------------------------------------------------

describe("secverify HIGH-1: the side part's would-be type through the *default template chain", () => {
  it("FRESH (deny): exotic default type is Editor-locked — junction side judged by the chain's type is denied", async () => {
    const s = await seedExoticDefaultDeck(true);
    const engine = anonEngine(s);
    const err = await asError(engine.createCard({ name: "Paddy+Fresh Side", typeId: 12 }));
    // the side "Fresh Side" resolves its type through *all+*default (type_id
    // 90 = Exotic Type), so Exotic Type+*type+*create (Editor) must deny it
    expect(err?.code).toBe("permission-denied");
    expect(await s.count("cards")).toBe(19); // nothing written
    expect(await keyRow(s, "paddy")).toBeUndefined();
    expect(await keyRow(s, "fresh_side")).toBeUndefined();
  });

  it("FRESH (allow mirror): the same chain with the exotic type Anyone-open — sides WRITTEN with the chain's type", async () => {
    const s = await seedExoticDefaultDeck(false);
    const engine = anonEngine(s);
    const result = await engine.createCard({ name: "Paddy+Fresh Side", typeId: 12 });
    expect(result?.cardId).toBeDefined();
    expect(await s.count("cards")).toBe(22); // junction + two sides
    const side = await s.selectOne<{ type_id: number; creator_id: number }>(
      "SELECT type_id, creator_id FROM cards WHERE `key` = 'fresh_side'",
    );
    expect(side?.type_id).toBe(90); // written under the chain-resolved type — gate and write agree
    expect(side?.creator_id).toBe(ANON_CARD_ID);
    const junction = await s.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE id = ?",
      [result.cardId],
    );
    expect(junction?.type_id).toBe(12); // the act card keeps its explicit Signup type
  });
});

describe("secverify HIGH-1: the side part's would-be type through a type codename assignment", () => {
  it("FRESH (deny): Right::All assignment -> codename 'phrase' — compound side judged by Phrase+*type+*create is denied", async () => {
    registerSetTypeAssignment("Right::All", "phrase"); // mod/core/set/right/autoname.rb:1 shape
    const s = await seedPhraseAssignmentDeck(true);
    // the assignment walk resolves the *right anchor's codename through the
    // SYNC name environment (cache-warm-only, fetch.ts:661-664) — install it
    // and warm the anchor part exactly as a warm host engine has them
    await s.engine.lexicon.id("*all");
    await s.engine.codenames.ensureLoaded();
    s.engine.installNameEnvironment();
    const engine = anonEngine(s);
    const err = await asError(engine.createCard({ name: "Hatch+*all+Pod", typeId: 12 }));
    // the compound side "Hatch+*all" hits the *right type-assignment walk
    // (anchor *all carries codename "all") -> type codename "phrase" ->
    // Phrase+*type+*create (Editor) must deny
    expect(err?.code).toBe("permission-denied");
    expect(await s.count("cards")).toBe(19); // nothing written
    expect(await keyRow(s, "hatch")).toBeUndefined();
    expect(await keyRow(s, "pod")).toBeUndefined();
  });

  it("FRESH (allow mirror): assignment open — the compound side is WRITTEN with the codename-resolved type", async () => {
    registerSetTypeAssignment("Right::All", "phrase");
    const s = await seedPhraseAssignmentDeck(false);
    await s.engine.lexicon.id("*all"); // sync-env install + warm (see the deny arm)
    await s.engine.codenames.ensureLoaded();
    s.engine.installNameEnvironment();
    const engine = anonEngine(s);
    const result = await engine.createCard({ name: "Hatch+*all+Pod", typeId: 12 });
    expect(result?.cardId).toBeDefined();
    const hatch = await s.selectOne<{ id: number }>(
      "SELECT id FROM cards WHERE `key` = 'hatch'",
    );
    expect(hatch).toBeDefined();
    const side = await s.selectOne<{ type_id: number; creator_id: number }>(
      "SELECT type_id, creator_id FROM cards WHERE left_id = ? AND right_id = 1",
      [hatch?.id],
    );
    expect(side?.type_id).toBe(91); // Phrase — the codename-resolved type
    expect(side?.creator_id).toBe(ANON_CARD_ID);
  });
});

// -----------------------------------------------------------------------
// HIGH-2 fresh variants: depth 5/6/7 and protected MIDDLE parts
// -----------------------------------------------------------------------

describe("secverify HIGH-2: every prefix of a deep name is verdict-checked, middle parts included", () => {
  const cases: Array<{ label: string; name: string }> = [
    { label: "depth 5, protected leftmost", name: "*Lock+Bb Part+Cc Part+Dd Part+Ee Part" },
    { label: "depth 7, protected leftmost", name: "*Lock+Bb Part+Cc Part+Dd Part+Ee Part+Ff Part+Gg Part" },
    { label: "protected MIDDLE of 3", name: "Aa Part+*Lock+Bb Part" },
    { label: "protected MIDDLE of 5 (pos 3)", name: "Aa Part+Bb Part+*Lock+Cc Part+Dd Part" },
    { label: "protected MIDDLE of 7 (pos 4)", name: "Aa Part+Bb Part+Cc Part+*Lock+Ee Part+Ff Part+Gg Part" },
  ];
  for (const c of cases) {
    it(`FRESH (deny): ${c.label} is denied and nothing is written`, async () => {
      const s = await seedDepthDeck();
      const engine = anonEngine(s);
      const err = await asError(engine.createCard({ name: c.name }));
      expect(err?.code).toBe("permission-denied");
      expect(await s.count("cards")).toBe(15); // nothing written anywhere in the name
      expect(await keyRow(s, "*lock")).toBeUndefined();
      for (const k of ["aa_part", "bb_part", "cc_part", "dd_part", "ee_part", "ff_part", "gg_part"]) {
        expect(await keyRow(s, k)).toBeUndefined();
      }
    });
  }
});

// -----------------------------------------------------------------------
// MEDIUM-2 fresh variant: the only rule grants ONE real account
// -----------------------------------------------------------------------

describe("secverify MEDIUM-2: a deck whose only rule grants a party of one real account", () => {
  it("FRESH (deny): anonymous update AND create AND delete all denied under an Editor-only *all+*update", async () => {
    const s = await seedSingleAccountDeck();
    const engine = anonEngine(s);
    const updateErr = await asError(engine.updateCard({ cardId: 50, content: "hijacked" }));
    expect(updateErr?.code).toBe("permission-denied");
    const createErr = await asError(engine.createCard({ name: "Blank Check", content: "mine" }));
    expect(createErr?.code).toBe("permission-denied"); // no create rules AT ALL
    const deleteErr = await asError(engine.deleteCard({ cardId: 50 }));
    expect(deleteErr?.code).toBe("permission-denied"); // no delete rules AT ALL
    expect(await s.count("cards")).toBe(14); // nothing written
    const row = await s.selectOne<{ db_content: string | null; trash: number }>(
      "SELECT db_content, trash FROM cards WHERE id = 50",
    );
    expect(row?.db_content).toBeNull();
    expect(row?.trash).toBe(0);
    expect(await s.count("card_acts")).toBe(0);
  });

  it("FRESH (party-scoped control): the rule's OWN account updates fine — the deny is party resolution, not rule resolution", async () => {
    const s = await seedSingleAccountDeck();
    const engine = actorEngine(s, { id: EDITOR_ID, name: "Editor" });
    const result = await engine.updateCard({ cardId: 50, content: "editor was here" });
    expect(result?.cardId).toBe(50);
    const row = await s.selectOne<{ updater_id: number }>(
      "SELECT updater_id FROM cards WHERE id = 50",
    );
    expect(row?.updater_id).toBe(EDITOR_ID);
  });
});

// -----------------------------------------------------------------------
// MEDIUM-4 fresh variant: LEFT-part rename (the *type plus right anchor)
// -----------------------------------------------------------------------

describe("secverify MEDIUM-4: a rename that swaps the LEFT part is judged under the ASSIGNED left anchor", () => {
  it("FRESH (deny): old left anchor (Rich Text+Plain -> Anyone) allowed, new left anchor (Blue Type+Plain -> Editor) denies", async () => {
    const s = await seedLeftRenameDeck();
    const engine = anonEngine(s);
    // "Holder Two+Plain" is held by NO junction row — the verdict, not
    // validate_uniqueness_of_name, is what must stop this save
    const err = await asError(engine.updateCard({ cardId: 70, name: "Holder Two+Plain" }));
    expect(err?.code).toBe("permission-denied");
    const row = await s.selectOne<{ left_id: number; right_id: number }>(
      "SELECT left_id, right_id FROM cards WHERE id = 70",
    );
    expect(row?.left_id).toBe(62); // still under Holder
    expect(row?.right_id).toBe(60);
    expect(await s.count("card_acts")).toBe(0); // the one-shot rename wrote nothing
  });

  it("FRESH (allow mirror): old left anchor Editor-locked, new left anchor Anyone — the rename lands", async () => {
    const s = await seedLeftRenameDeck();
    const engine = anonEngine(s);
    const result = await engine.updateCard({ cardId: 80, name: "Holder Three+Plain" });
    expect(result?.cardId).toBe(80);
    const row = await s.selectOne<{ left_id: number; updater_id: number }>(
      "SELECT left_id, updater_id FROM cards WHERE id = 80",
    );
    expect(row?.left_id).toBe(65); // now under Holder Three (Rich Text type -> Anyone anchor)
    expect(row?.updater_id).toBe(ANON_CARD_ID);
  });

  it("FRESH (control deny): a NON-rename update of the Blue-anchored junction is denied by its LIVE left anchor", async () => {
    const s = await seedLeftRenameDeck();
    const engine = anonEngine(s);
    const err = await asError(engine.updateCard({ cardId: 80, content: "sneak" }));
    expect(err?.code).toBe("permission-denied");
    expect(await s.count("card_acts")).toBe(0);
  });

  it("FRESH (control allow): a NON-rename update of the RichText-anchored junction stays allowed", async () => {
    const s = await seedLeftRenameDeck();
    const engine = anonEngine(s);
    const result = await engine.updateCard({ cardId: 70, content: "fine here" });
    expect(result?.cardId).toBe(70);
  });
});

// -----------------------------------------------------------------------
// MEDIUM-1 fresh variant: the draft seam under the route's own config shape
// -----------------------------------------------------------------------

describe("secverify MEDIUM-1: the draft seam under the route-seat config (default rule walk arms the guard)", () => {
  it("FRESH (deny): armed *all+*captcha rule + draft:true — refused by the walked rule, zero rows persisted", async () => {
    const s = await seedDraftDeck(true);
    const stub = stubVerify({ success: false });
    const engine = routeSeatEngine(s, stub.verify);
    const err = await asError(engine.updateCard({ cardId: 20, content: "spam draft", draft: true }));
    expect(err?.code).toBe("recaptcha");
    expect(stub.calls).toHaveLength(1); // siteverify consulted
    expect(await s.count("card_acts")).toBe(0);
    const draftAction = await s.selectOne<{ id: number }>(
      "SELECT id FROM card_actions WHERE card_id = 20 AND draft = 1",
    );
    expect(draftAction).toBeUndefined();
    const row = await s.selectOne<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE id = 20",
    );
    expect(row?.db_content).toBe("original");
  });

  it("FRESH (control): the same route-seat engine refuses the NON-draft save (guard live through the walk)", async () => {
    const s = await seedDraftDeck(true);
    const stub = stubVerify({ success: false });
    const engine = routeSeatEngine(s, stub.verify);
    const err = await asError(engine.updateCard({ cardId: 20, content: "real edit", recaptchaToken: "tok" }));
    expect(err?.code).toBe("recaptcha");
    expect(stub.calls).toHaveLength(1);
    expect(await s.count("card_acts")).toBe(0);
  });

  it("FRESH (guard-off): NO captcha rule in the deck — the draft is NOT blanket-refused, it stores normally", async () => {
    const s = await seedDraftDeck(false);
    const stub = stubVerify({ success: false });
    const engine = routeSeatEngine(s, stub.verify);
    const result = await engine.updateCard({ cardId: 20, content: "honest draft", draft: true });
    expect(result?.cardId).toBe(20);
    expect(stub.calls).toHaveLength(0); // never consulted: toggle(nil) is false
    expect(await s.count("card_acts")).toBe(1);
    const draftAction = await s.selectOne<{ id: number }>(
      "SELECT id FROM card_actions WHERE card_id = 20 AND draft = 1",
    );
    expect(draftAction).toBeDefined();
    const row = await s.selectOne<{ db_content: string | null }>(
      "SELECT db_content FROM cards WHERE id = 20",
    );
    expect(row?.db_content).toBe("original"); // a draft never touches the row
  });
});

// -----------------------------------------------------------------------
// LOW-1 fresh variants: id-keyed actor on update and delete
// -----------------------------------------------------------------------

describe("secverify LOW-1: an account NAMED *anonymous with a real id acts as THAT account on update+delete", () => {
  it("FRESH (update): actor {id 7, name '*anonymous'} updates — recorded under id 7, never the Anonymous card", async () => {
    const s = await seedIdKeyedDeck(false, true);
    const engine = actorEngine(s, { id: EDITOR_ID, name: "*anonymous" });
    const result = await engine.updateCard({ cardId: 50, content: "editor edit" });
    expect(result?.cardId).toBe(50);
    const row = await s.selectOne<{ updater_id: number }>(
      "SELECT updater_id FROM cards WHERE id = 50",
    );
    expect(row?.updater_id).toBe(EDITOR_ID);
    const act = await s.selectOne<{ actor_id: number }>(
      "SELECT a.actor_id FROM card_acts a JOIN card_actions ca ON ca.card_act_id = a.id " +
        "WHERE ca.card_id = 50 ORDER BY ca.id DESC LIMIT 1",
    );
    expect(act?.actor_id).toBe(EDITOR_ID);
  });

  it("FRESH (delete): actor {id 7, name '*anonymous'} deletes — trash stamped by id 7", async () => {
    const s = await seedIdKeyedDeck(false, true);
    const engine = actorEngine(s, { id: EDITOR_ID, name: "*anonymous" });
    const result = await engine.deleteCard({ cardId: 50 });
    expect(result?.cardId).toBe(50);
    const row = await s.selectOne<{ trash: number; updater_id: number }>(
      "SELECT trash, updater_id FROM cards WHERE id = 50",
    );
    expect(row?.trash).toBe(1);
    expect(row?.updater_id).toBe(EDITOR_ID);
  });

  it("FRESH (captcha interplay): the same actor SKIPS the captcha guard — isAnonymousSession is id-keyed", async () => {
    const s = await seedIdKeyedDeck(true, true);
    const stub = stubVerify({ success: false });
    const engine = routeSeatEngine(s, stub.verify, { id: EDITOR_ID, name: "*anonymous" });
    // signed-in by ID (id 7 != anonymous card 11): recaptcha_on?'s
    // !Auth.signed_in? arm keeps the guard OFF — a name-keyed engine would
    // arm it and refuse this draft
    const result = await engine.updateCard({ cardId: 50, content: "no captcha for me", draft: true });
    expect(result?.cardId).toBe(50);
    expect(stub.calls).toHaveLength(0);
    expect(await s.count("card_acts")).toBe(1);
  });

  it("FRESH (reverse direction): an actor carrying the Anonymous card's ID deletes as anonymous — updater_id is the anonymous id", async () => {
    const s = await seedIdKeyedDeck(false, true);
    const engine = actorEngine(s, { id: ANON_CARD_ID, name: "Some Other Name" });
    const result = await engine.deleteCard({ cardId: 50 });
    expect(result?.cardId).toBe(50);
    const row = await s.selectOne<{ trash: number; updater_id: number }>(
      "SELECT trash, updater_id FROM cards WHERE id = 50",
    );
    expect(row?.trash).toBe(1);
    expect(row?.updater_id).toBe(ANON_CARD_ID);
  });

  it("FRESH (verdict direction): the anon-ID actor is judged by ANONYMOUS parties — Editor-only delete denies it", async () => {
    const s = await seedIdKeyedDeck(false, false); // *all+*delete -> Editor
    const engine = actorEngine(s, { id: ANON_CARD_ID, name: "Some Other Name" });
    const err = await asError(engine.deleteCard({ cardId: 50 }));
    expect(err?.code).toBe("permission-denied");
    const row = await s.selectOne<{ trash: number }>("SELECT trash FROM cards WHERE id = 50");
    expect(row?.trash).toBe(0);
    expect(await s.count("card_acts")).toBe(0);
    // the Editor account itself deletes fine under the same rule
    const editor = actorEngine(s, { id: EDITOR_ID, name: "Editor" });
    const ok = await editor.deleteCard({ cardId: 50 });
    expect(ok?.cardId).toBe(50);
  });
});

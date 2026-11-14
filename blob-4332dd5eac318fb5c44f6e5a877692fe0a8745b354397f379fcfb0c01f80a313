// RENAME GATE — the UPDATE path's created-sides permission walk
// (saveTaskVerdictForCard's rename clause, view-task-rules.ts).
//
// Upstream ground truth this suite pins: a rename onto a compound name runs
// prepare_left_and_right (mod/core/set/all/name_events.rb:67-72) in the
// store stage, and prepare_new_side (:137-142) adds each MISSING side as
// a subcard of the same act. Subcards run the director's validate stage
// (lib/card/director/all.rb:67-69), where check_permissions
// (card-mod-permissions set/all/permissions.rb:22-26) judges every card
// by its OWN action — a new sidecard's action is :create, so each created
// side is judged ok?(:create): permit(:create) under the
// template-resolved type + ok_to_create_side's junction walk
// (permissions.rb:120-137). A rename that would create a side the actor
// cannot create aborts whole. Sides that already exist are created by
// nobody and checked by nobody (prepare_new_side's `!Card[side_id]&.real?`
// early-return), so renames onto names whose sides all exist stay judged
// by permit(:update) alone.
//
// Why the rename clause exists: the create branch judges a compound
// name's sides through createSidesAllowed (direct create of a
// Crib+*update+Fan name is DENIED when a side is Editor-locked), and the
// RENAME path must give the sides it CREATES the same judgment —
// saveTaskVerdictForCard's rename clause runs each created side through
// ok?(:create), the validate-stage check_permissions
// (permissions.rb:22-26). This suite pins that gate direction and the
// non-over-gate direction (legitimate renames the upstream rules allow
// must still land).
//
// Deck fixtures share one verdict skeleton (seedVerSkeleton, verbatim with
// obstructed-self-side-rename-write.test.ts), so every verdict here is
// directly comparable across the suites that use it.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedReference,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { type CardActionError } from "../../../src/card/actions/types.js";
import { resolveTypeId } from "../../../src/card/actions/type-resolution.js";
import { resetSetTypeAssignments } from "../../../src/card/set-patterns/set-type-assignment.js";
import { setNameEnvironment } from "../../../src/card/name/environment.js";

const SET_TYPE_ID = 2;
const EDITOR_ID = 7;
const ANYONE_ID = 6;

async function seedVerSkeleton(
  s: ActionsTestStorage,
  defaultTypeId: number,
  contentTypeName = "Rich Text",
): Promise<void> {
  // The setting cards are SETTING-TYPED and the Setting cardtype card exists
  // (codename "setting") — the real-deck shape every deck bootstraps
  // (mod/core/data/fixtures/real/cards.yml:66-93: Setting id 6, *default
  // type_id = Setting's id). The rule-cache Set/Setting candidate filters
  // (lib/card/rule/cache.rb:14-22, ported in type-resolution.ts) read
  // exactly this: without it the template walk on this fixture deck is
  // closed and every created side resolves *all+*default — the pre-existing
  // RG0/RG1/RG2/RG3/RG5 rot at e8c4d6d (the decoy-shape fold landed the
  // filter; this suite is not in tests/standing-net.json, so the net stayed
  // green while the fixture modelled an impossible deck).
  await seedCard(s, { id: 21, name: "Setting", codename: "setting", typeId: 3 });
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 4, name: "*create", codename: "create", typeId: 21 });
  await seedCard(s, { id: 5, name: "*update", codename: "update", typeId: 21 });
  await seedCard(s, { id: 16, name: "*delete", codename: "delete", typeId: 21 });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Editor" });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 21 });
  await seedCard(s, { id: 17, name: "*default", codename: "default", typeId: 21 });
  await seedCard(s, { id: 11, name: "Anonymous User", codename: "anonymous" });
  await seedCard(s, { id: 42, name: contentTypeName, typeId: 3 });
  await seedCard(s, { id: 33, name: "*all+*default", leftId: 1, rightId: 17, typeId: defaultTypeId });
  await seedCard(s, { id: 10, name: "*all+*create", leftId: 1, rightId: 4, typeId: SET_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 10, ANYONE_ID, "anyone");
  await seedCard(s, { id: 15, name: "*all+*update", leftId: 1, rightId: 5, typeId: SET_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 15, ANYONE_ID, "anyone");
  await seedCard(s, { id: 12, name: "Signup", typeId: 3 });
  await seedCard(s, { id: 13, name: "Signup+*type", leftId: 12, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 14, name: "Signup+*type+*create", leftId: 13, rightId: 4, dbContent: "[[Anyone]]" });
  await seedReference(s, 14, ANYONE_ID, "anyone");
}

async function seedRightSetDefault(s: ActionsTestStorage, ruleTypeId: number): Promise<void> {
  await seedCard(s, { id: 18, name: "*right", codename: "right", typeId: 21 });
  await seedCard(s, { id: 19, name: "*update+*right", leftId: 5, rightId: 18, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 20, name: "*update+*right+*default", leftId: 19, rightId: 17, typeId: ruleTypeId });
}

async function seedCurioChain(s: ActionsTestStorage, protect: boolean, codename?: string): Promise<void> {
  await seedCard(s, { id: 70, name: "Curio Type", codename, typeId: 3 });
  await seedCard(s, { id: 71, name: "Curio Type+*type", leftId: 70, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 72, name: "Curio Type+*type+*create", leftId: 71, rightId: 4,
    dbContent: protect ? "[[Editor]]" : "[[Anyone]]",
  });
  await seedReference(s, 72, protect ? EDITOR_ID : ANYONE_ID, protect ? "editor" : "anyone");
}

async function seedRightDefaultDeck(protect: boolean): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedVerSkeleton(s, 42);
  await seedCurioChain(s, protect);
  await seedRightSetDefault(s, 70);
  return s;
}

async function seedRenameDeck(): Promise<ActionsTestStorage> {
  const s = await seedRightDefaultDeck(true);
  await seedCard(s, { id: 50, name: "Pod", typeId: 42, dbContent: "v1" });
  return s;
}

function forceColdEnvironment(): void {
  setNameEnvironment(undefined);
}

async function installWarmEnvironment(s: ActionsTestStorage): Promise<void> {
  await s.engine.lexicon.id("*all");
  await s.engine.lexicon.id("*update");
  await s.engine.codenames.ensureLoaded();
  s.engine.installNameEnvironment();
}

async function asError(p: Promise<unknown>): Promise<CardActionError | undefined> {
  return (await p.then(
    () => undefined,
    (e: CardActionError) => e,
  )) as CardActionError | undefined;
}

function anonEngine(s: ActionsTestStorage): CardActionEngine {
  return new CardActionEngine(s.engine, { actor: null, ipAddress: "192.0.2.7" });
}

async function typeIdOfKey(s: ActionsTestStorage, key: string): Promise<number | undefined> {
  const row = await s.selectOne<{ type_id: number }>(
    "SELECT type_id FROM cards WHERE `key` = ?",
    [key],
  );
  return row?.type_id;
}

async function typeIdOfCompoundSide(
  s: ActionsTestStorage,
  leftKey: string,
  rightId: number,
): Promise<number | undefined> {
  const row = await s.selectOne<{ type_id: number }>(
    "SELECT c.type_id AS type_id FROM cards c JOIN cards l ON c.left_id = l.id " +
      "WHERE l.`key` = ? AND c.right_id = ?",
    [leftKey, rightId],
  );
  return row?.type_id;
}

beforeEach(() => {
  forceColdEnvironment();
  resetSetTypeAssignments();
});

afterEach(() => {
  resetSetTypeAssignments();
  setNameEnvironment(undefined); // leave no warm env for the next file
});

describe("renamegate: rename-created sides are create-gated (the HIGH over-allow)", () => {
  it("RG0 create control on the locked deck: direct create of the junction DENIES (the deny the rename used to dodge)", async () => {
    const s = await seedRenameDeck();
    const engine = anonEngine(s);
    const before = await s.count("cards");
    const err = await asError(engine.createCard({ name: "Crib+*update+Fan", typeId: 12 }));
    expect(err?.code).toBe("permission-denied");
    expect(await s.count("cards")).toBe(before);
  });

  it("RG1 (coldver V3b, Ruby-faithful verdict) rename COLD onto the Editor-locked compound DENIES whole — no side written, nothing created", async () => {
    const s = await seedRenameDeck();
    const engine = anonEngine(s);
    // The side the rename would create resolves the Editor-locked template
    // type 70 — the same id the create gate denied RG0 on.
    expect(await resolveTypeId(s.engine, { name: "Crib+*update" })).toBe(70);
    const before = await s.count("cards");
    const err = await asError(engine.updateCard({ cardId: 50, name: "Crib+*update+Fan" }));
    expect(err?.code).toBe("permission-denied");
    // Whole-act abort: the renamed card untouched, no side rows, no subcards.
    expect(await s.count("cards")).toBe(before);
    expect(await typeIdOfKey(s, "pod")).toBe(42);
    expect(await typeIdOfCompoundSide(s, "crib", 5)).toBeUndefined();
  });

  it("RG2 (coldver V3c, Ruby-faithful verdict) the same rename on a WARM engine DENIES identically", async () => {
    const s = await seedRenameDeck();
    await installWarmEnvironment(s);
    const engine = anonEngine(s);
    expect(await resolveTypeId(s.engine, { name: "Crib+*update" })).toBe(70);
    const before = await s.count("cards");
    const err = await asError(engine.updateCard({ cardId: 50, name: "Crib+*update+Fan" }));
    expect(err?.code).toBe("permission-denied");
    expect(await s.count("cards")).toBe(before);
    expect(await typeIdOfCompoundSide(s, "crib", 5)).toBeUndefined();
  });

  it("RG5 deep compound target: the walk recurses through the virtual left (Crib+*update+Fan) and DENIES", async () => {
    const s = await seedRenameDeck();
    const engine = anonEngine(s);
    const before = await s.count("cards");
    const err = await asError(
      engine.updateCard({ cardId: 50, name: "Crib+*update+Fan+*update" }),
    );
    expect(err?.code).toBe("permission-denied");
    expect(await s.count("cards")).toBe(before);
    expect(await typeIdOfKey(s, "pod")).toBe(42);
  });
});

describe("renamegate: renames Ruby allows must still land (no over-gate)", () => {
  it("RG3 open chain: the rename onto the compound name LANDS and the side is written with the template type 70 (V1b through the rename door)", async () => {
    const s = await seedRightDefaultDeck(false);
    await seedCard(s, { id: 50, name: "Pod", typeId: 42, dbContent: "v1" });
    const engine = anonEngine(s);
    const result = await engine.updateCard({ cardId: 50, name: "Crib+*update+Fan" });
    expect(result?.cardId).toBeDefined();
    expect(await typeIdOfCompoundSide(s, "crib", 5)).toBe(70);
    expect(await typeIdOfKey(s, "fan")).toBe(42);
  });

  it("RG4 sides already exist: no create gate runs — the Editor-locked side TYPES do not deny a rename onto them", async () => {
    // prepare_new_side only creates (and check_permissions only judges) what
    // is MISSING: with Crib+*update and Fan already real, the rename is
    // judged by permit(:update) alone (permissions.rb:148-153).
    const s = await seedRenameDeck();
    await seedCard(s, { id: 51, name: "Crib", typeId: 3 });
    await seedCard(s, { id: 52, name: "Crib+*update", leftId: 51, rightId: 5, typeId: 70 });
    await seedCard(s, { id: 53, name: "Fan", typeId: 42 });
    const engine = anonEngine(s);
    const result = await engine.updateCard({ cardId: 50, name: "Crib+*update+Fan" });
    expect(result?.cardId).toBeDefined();
    const row = await s.selectOne<{ left_id: number; right_id: number }>(
      "SELECT left_id, right_id FROM cards WHERE id = 50",
    );
    expect(row?.left_id).toBe(52);
    expect(row?.right_id).toBe(53);
  });
});

// ---------------------------------------------------------------------------
// The obstructed SELF-side arm of createSidesAllowed (view-task-rules.ts:
// `existing.id !== selfId`): a side that EXISTS but IS the renamed card is
// not a bystander — the rename clears and recreates it as a fresh subcard
// (prepare_obstructed_side, name_events.rb:144-150) — so it is
// create-checked like a missing side. The verdicts above could not isolate
// this arm: their side fixtures all resolve the SAME template type, so a
// deny could not be attributed to the self-side's create-check in
// particular. These arms give the recreated side a DIFFERENT resolved type
// than its sibling: the self side "Alpha+Beta" resolves the
// Alpha+*right+*default template type 70 (Editor-locked when protect=true),
// while the sibling "Tail" resolves the *all+*default type 42 (Anyone) and
// permit(:update) is Anyone — ONLY the self-side arm can produce the deny.
// RG7 is the coarse obstructed-rename arm this suite dropped: on the open
// deck the gate-legal rename must LAND (its write-path half is pinned deep
// in obstructed-self-side-rename-write.test.ts OSS1/OSS2).

async function seedObstructedJunctionDeck(protect: boolean): Promise<ActionsTestStorage> {
  const s = await seedRightDefaultDeck(protect);
  await seedCard(s, { id: 80, name: "Alpha", typeId: 3 });
  await seedCard(s, { id: 81, name: "Beta", typeId: 3 });
  // The *right pattern anchors on the side name's RIGHT part: for junction
  // side "Alpha+Beta" the set is "Beta+*right" (the same shape the suite's
  // *update+*right template has for side "Crib+*update").
  await seedCard(s, { id: 82, name: "Beta+*right", leftId: 81, rightId: 18, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 83, name: "Beta+*right+*default", leftId: 82, rightId: 17, typeId: 70 });
  await seedCard(s, { id: 50, name: "Alpha+Beta", leftId: 80, rightId: 81, typeId: 42 });
  return s;
}

describe("renamegate: obstructed self-side — the existing.id === selfId arm", () => {
  it("RG6 the recreated SELF side's OWN template type is create-checked: Alpha+Beta -> Alpha+Beta+Tail DENIES on the Editor-locked self side while the sibling resolves Anyone", async () => {
    const s = await seedObstructedJunctionDeck(true);
    // The left side EXISTS and IS the renamed card: the arm (not a fetch
    // miss) must route it into the virtual create-check.
    expect((await s.engine.fetchByName("Alpha+Beta"))?.id).toBe(50);
    const engine = anonEngine(s);
    const before = await s.count("cards");
    const err = await asError(engine.updateCard({ cardId: 50, name: "Alpha+Beta+Tail" }));
    expect(err?.code).toBe("permission-denied");
    // Whole-act abort: nothing written, the junction row untouched.
    expect(await s.count("cards")).toBe(before);
    const row = await s.selectOne<{ left_id: number; right_id: number }>(
      "SELECT left_id, right_id FROM cards WHERE id = 50",
    );
    expect(row?.left_id).toBe(80);
    expect(row?.right_id).toBe(81);
  });

  it("RG7 (coarse obstructed-rename arm) the same rename on the open deck LANDS: the self side is recreated, not self-wired", async () => {
    const s = await seedObstructedJunctionDeck(false);
    const engine = anonEngine(s);
    const result = await engine.updateCard({ cardId: 50, name: "Alpha+Beta+Tail" });
    expect(result?.cardId).toBe(50);
    const row = await s.selectOne<{ name: string | null; left_id: number; right_id: number }>(
      "SELECT name, left_id, right_id FROM cards WHERE id = 50",
    );
    expect(row?.name).toBeNull();
    expect(row?.left_id).not.toBe(50);
    expect(row?.right_id).not.toBe(50);
    // The recreated left side is a real Alpha+Beta card with the template
    // type 70; the fresh Tail carries the default type 42.
    const recreated = await s.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE id = ?",
      [row!.left_id],
    );
    expect(recreated?.type_id).toBe(70);
    const tail = await s.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE id = ?",
      [row!.right_id],
    );
    expect(tail?.type_id).toBe(42);
  });
});

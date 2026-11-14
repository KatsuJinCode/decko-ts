// The WRITE path's obstructed self-side on a rename: ensureSides
// (card-action-engine.ts) implements the upstream prepare_obstructed_side
// clear+recreate (card-1.110.0 mod/core/set/all/name_events.rb:144-150),
// never resolving the side onto the renaming card's own row.
//
// Ground truth, mechanism chain (upstream source):
//   name= runs assign_side_ids at ASSIGNMENT time
//   (lib/card/name/all.rb:21-27 -> :76-90): each side resolves through
//   Lexicon.id right away, so a side naming the card itself gets the card's
//   OWN id and a missing side gets the -1 sentinel. The store stage then
//   routes each side (prepare_side, name_events.rb:130-135):
//   side_id == id -> prepare_obstructed_side (:144-150): clear_name
//   (:121-128 — direct SQL `name/key/left_id/right_id = NULL`, Card.expire,
//   Lexicon.cache.reset) moves the row out of the way, and the side becomes
//   a FRESH subcard in the same act (subcard, lib/card/subcards/all.rb:15-22
//   — never an existing row). side_id == -1 or unreal ->
//   prepare_new_side (:137-142). The unique-name validation of the fresh
//   side passes BECAUSE clear_name nulled the row's key and dropped the
//   lexicon entry (Lexicon.id resolves `key = ? AND trash = 0`,
//   lexicon.rb:120-128). Spec anchors: "renames simple card to its own
//   child" F->F+M and "renames plus card to its own child" A+B->A+B+T
//   (mod/core/spec/set/all/name_events_spec.rb:43-53).
//
// Why the direct self side is not a cycle edge: the peeked side ids run
// through the cycle guard (assertNotOwnAncestor,
// junction-cycle-detection.ts:31-62) with the renaming row's OWN id
// filtered out — prepare_obstructed_side (:144-150) makes that side a
// fresh card in the same act, so only the OTHER peeked sides can witness
// an ancestry cycle (the guard's own module doc :12-17 names the direct
// self case as the one the upstream code RESTRUCTURES). These tests pin
// that end state: the restructured junction, the fresh sides, and the
// lexicon/act linkage the store stage must land.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createActionsTestStorage,
  seedCard,
  seedReference,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { resetSetTypeAssignments } from "../../../src/card/set-patterns/set-type-assignment.js";
import { setNameEnvironment } from "../../../src/card/name/environment.js";

const SET_TYPE_ID = 2;
const ANYONE_ID = 6;

/** The renamegate suite's verdict skeleton, verbatim, so every deck here is
 *  directly comparable to renamegate-rename-created-sides-verdicts.test.ts.
 *  Setting cards are SETTING-TYPED with the Setting cardtype card present
 *  (cards.yml:66-93) — the real-deck shape the rule-cache Set/Setting
 *  filters (cache.rb:14-22) read; without it the template walk stays closed
 *  and the recreated sides could not resolve their template types. */
async function seedVerSkeleton(
  s: ActionsTestStorage,
  defaultTypeId: number,
  contentTypeName = "Rich Text",
): Promise<void> {
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
}

/** The Curio create-rule chain (renamegate's seedCurioChain) — unused by
 *  OSS1 (no side resolves type 70 there) but load-bearing for OSS2's
 *  template-typed recreated junction side. */
async function seedCurioChain(s: ActionsTestStorage, protect: boolean): Promise<void> {
  await seedCard(s, { id: 70, name: "Curio Type", typeId: 3 });
  await seedCard(s, { id: 71, name: "Curio Type+*type", leftId: 70, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 72, name: "Curio Type+*type+*create", leftId: 71, rightId: 4,
    dbContent: protect ? "[[Editor]]" : "[[Anyone]]",
  });
  await seedReference(s, 72, protect ? 7 : ANYONE_ID, protect ? "editor" : "anyone");
}

/** The right-anchor template that types the recreated junction side: the
 *  *right pattern anchors on the side's RIGHT part ("Beta"), so the set is
 *  `Beta+*right` (probe-verified setNames for new "Alpha+Beta":
 *  [<type_plus_right>, "Beta+*right", "*all plus", "*all"]) and the rule is
 *  `Beta+*right+*default` -> Curio Type (70). The set card must be
 *  Set-typed for the rule-cache candidate filter
 *  (lib/card/rule/cache.rb:14-22 via type-resolution.ts). */
async function seedJunctionTemplate(s: ActionsTestStorage): Promise<void> {
  await seedCard(s, { id: 18, name: "*right", codename: "right", typeId: 21 });
  await seedCard(s, { id: 60, name: "Alpha", typeId: 3 });
  await seedCard(s, { id: 61, name: "Beta", typeId: 3 });
  await seedCard(s, { id: 62, name: "Beta+*right", leftId: 61, rightId: 18, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 63, name: "Beta+*right+*default", leftId: 62, rightId: 17, typeId: 70 });
}

function forceColdEnvironment(): void {
  setNameEnvironment(undefined);
}

function anonEngine(s: ActionsTestStorage): CardActionEngine {
  return new CardActionEngine(s.engine, { actor: null, ipAddress: "192.0.2.7" });
}

beforeEach(() => {
  forceColdEnvironment();
  resetSetTypeAssignments();
});

afterEach(() => {
  resetSetTypeAssignments();
  setNameEnvironment(undefined); // leave no warm env for the next file
});

describe("obstructed self-side rename write: the clear+recreate end state", () => {
  it("OSS1 simple card onto its own child (Pod -> Crib+Pod): the right side is a FRESH Pod card, not the renamed row (name_events_spec.rb:43-45)", async () => {
    const s = await createActionsTestStorage();
    await seedVerSkeleton(s, 42);
    await seedCard(s, { id: 50, name: "Pod", typeId: 42, dbContent: "v1" });
    const engine = anonEngine(s);

    const result = await engine.updateCard({ cardId: 50, name: "Crib+Pod" });
    expect(result?.cardId).toBe(50);

    // The renamed row is a junction row: no stored name/key, sides point at
    // OTHER cards — never at itself (clear+recreate, name_events.rb:144-150).
    const row = await s.selectOne<{ name: string | null; key: string | null; left_id: number; right_id: number }>(
      "SELECT name, `key`, left_id, right_id FROM cards WHERE id = 50",
    );
    expect(row?.name).toBeNull();
    expect(row?.key).toBeNull();
    expect(row?.left_id).not.toBeNull();
    expect(row?.right_id).not.toBeNull();
    expect(row?.left_id).not.toBe(50);
    expect(row?.right_id).not.toBe(50);
    const leftId = row!.left_id;
    const rightId = row!.right_id;
    expect(rightId).not.toBe(leftId);

    // Both sides exist as real cards; the recreated Pod carries the default
    // template type (subcard -> new-card template chain, type.rb:76-78).
    const crib = await s.selectOne<{ id: number; type_id: number }>(
      "SELECT id, type_id FROM cards WHERE `key` = 'crib'",
    );
    const pod = await s.selectOne<{ id: number; type_id: number }>(
      "SELECT id, type_id FROM cards WHERE `key` = 'pod'",
    );
    expect(crib?.id).toBe(leftId);
    expect(pod?.id).toBe(rightId);
    expect(pod?.id).not.toBe(50);
    expect(pod?.type_id).toBe(42);
    expect(crib?.type_id).toBe(42);

    // Lexicon end state: the OLD key answers the FRESH card, the new
    // compound key answers the renamed row, and the row composes its name.
    expect(await s.engine.lexicon.id("crib+pod")).toBe(50);
    expect(await s.engine.lexicon.id("pod")).toBe(rightId);
    expect((await s.engine.lexicon.name(50))?.s).toBe("Crib+Pod");

    // The recreated side joined the rename's act (subcard semantics,
    // subcards/all.rb:15-22; the engine patches super_action_id).
    const sideAction = await s.selectOne<{ super_action_id: number | null }>(
      "SELECT super_action_id FROM card_actions WHERE card_id = ? ORDER BY id DESC LIMIT 1",
      [rightId],
    );
    expect(sideAction?.super_action_id).not.toBeNull();
    s.close();
  });

  it("OSS2 plus card onto its own child (Alpha+Beta -> Alpha+Beta+Tail): the LEFT side is recreated as a fresh junction with the template type (name_events_spec.rb:51-53)", async () => {
    const s = await createActionsTestStorage();
    await seedVerSkeleton(s, 42);
    await seedCurioChain(s, false);
    await seedJunctionTemplate(s);
    await seedCard(s, { id: 50, name: "Alpha+Beta", leftId: 60, rightId: 61, typeId: 42 });
    const engine = anonEngine(s);

    // The gate must see the junction row through the lexicon for the
    // obstructed-self comparison to fire on the left side at all.
    expect((await s.engine.fetchByName("Alpha+Beta"))?.id).toBe(50);

    const result = await engine.updateCard({ cardId: 50, name: "Alpha+Beta+Tail" });
    expect(result?.cardId).toBe(50);

    const row = await s.selectOne<{ name: string | null; key: string | null; left_id: number; right_id: number }>(
      "SELECT name, `key`, left_id, right_id FROM cards WHERE id = 50",
    );
    expect(row?.name).toBeNull();
    expect(row?.key).toBeNull();
    expect(row?.left_id).not.toBe(50);
    expect(row?.right_id).not.toBe(50);
    const freshJunctionId = row!.left_id;
    const tailId = row!.right_id;

    // The recreated left side is a FRESH Alpha+Beta junction: same sides as
    // the original (Alpha 60, Beta 61) and the TEMPLATE type 70
    // (Beta+*right+*default) — the subcard resolution picks up the new-card
    // template (type.rb:76-78), unlike the original row's type 42.
    const freshJunction = await s.selectOne<{ left_id: number; right_id: number; type_id: number }>(
      "SELECT left_id, right_id, type_id FROM cards WHERE id = ?",
      [freshJunctionId],
    );
    expect(freshJunction?.left_id).toBe(60);
    expect(freshJunction?.right_id).toBe(61);
    expect(freshJunction?.type_id).toBe(70);
    const tail = await s.selectOne<{ type_id: number }>(
      "SELECT type_id FROM cards WHERE id = ?",
      [tailId],
    );
    expect(tail?.type_id).toBe(42);

    // Lexicon: "alpha+beta" answers the FRESH junction, the three-part name
    // answers the renamed row, and the row composes.
    expect(await s.engine.lexicon.id("alpha+beta")).toBe(freshJunctionId);
    expect(await s.engine.lexicon.id("alpha+beta+tail")).toBe(50);
    expect((await s.engine.lexicon.name(50))?.s).toBe("Alpha+Beta+Tail");
    s.close();
  });
});

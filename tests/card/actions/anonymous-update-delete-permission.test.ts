// The anonymous-update / anonymous-delete arms (the documented remainder of
// the anonymous-create arm): the permission chain rules ALL THREE write
// tasks identically — no signed-in clause anywhere. ok_to_update?
// (card-mod-permissions set/all/permissions.rb:148-153) is permit(:update)
// plus the type-change create clause; ok_to_delete? (:155-157) is bare
// permit :delete; permit (:107-118) -> permitted? (:100-105) ->
// Auth.as_card.among? who_can(action). An anonymous session's Auth.as_id
// IS the Anonymous card (card-1.110.0 lib/card/auth/current.rb:7-9 +
// lib/card/auth/proxy.rb:33-35), so the rule verdict governs exactly as
// for any other actor.
//
// The arms are not hypothetical: a real deck's history carries thousands of
// live cards whose updater is the anonymous codename card, and trashed
// cards whose final save stamped it too — the trash save is an update save
// and re-stamps updater_id (set_stamper, card-mod-account set/all/
// account.rb:20-23). This suite's deck mirrors the same rule shape the
// create suite's open-signup arm used (a *type-scoped rule granting
// Anyone over an *all fallback granting Editor).
//
// Deck layout (ids arbitrary; shape mirrors that signup family):
//    1 *all      codename all    typeId 2 (Set)
//    2 Set       codename set
//    4 *update   codename update
//    5 *delete   codename delete
//    6 Anyone    codename anyone        - the rule party AnyoneID
//    7 Editor                           - a party Anonymous is NOT in
//    8 *type     codename type
//   10 *all+*update  left 1 right 4 [[Editor]]  - fallback: members only
//   11 Anonymous User codename anonymous   - the acting card (Auth.as_card)
//   12 Signup    typeId 3                  - the type card
//   13 Signup+*type left 12 right 8 typeId 2 (Set)
//   14 Signup+*type+*update left 13 right 4 [[<party>]] - the update rule
//   16 *all+*delete  left 1 right 5 [[Editor]]  - fallback
//   17 Signup+*type+*delete left 13 right 5 [[<party>]] - the delete rule
//   20 Petition  typeId 12, "v1"           - the target card

import { describe, expect, it } from "vitest";
import {
  actionEngine,
  createActionsTestStorage,
  seedCard,
  seedStandardDeck,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import type { CardActionError } from "../../../src/card/actions/types.js";

const SET_TYPE_ID = 2;

async function seedReference(
  storage: ActionsTestStorage,
  refererId: number,
  refereeId: number,
  refereeKey: string,
): Promise<void> {
  await storage.driver.query(
    `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)
     VALUES (?, ?, ?, 'L', NULL)`,
    [refererId, refereeKey, refereeId],
  );
}

/** The deck of the module doc. `ruleParty` is who the *type-scoped
 *  update+delete rules grant — Anyone for the rule-governed arms, Editor
 *  for the deny arms (the *all fallback always grants Editor, so a deny
 *  here proves the type rule governed). */
async function seedRuleDeck(ruleParty: { id: number; key: string }): Promise<ActionsTestStorage> {
  const s = await createActionsTestStorage();
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 4, name: "*update", codename: "update" });
  await seedCard(s, { id: 5, name: "*delete", codename: "delete" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Editor" });
  await seedCard(s, { id: 8, name: "*type", codename: "type" });
  await seedCard(s, { id: 10, leftId: 1, rightId: 4, dbContent: "[[Editor]]" });
  await seedReference(s, 10, 7, "editor");
  await seedCard(s, { id: 11, name: "Anonymous User", codename: "anonymous" });
  await seedCard(s, { id: 12, name: "Signup", typeId: SET_TYPE_ID + 1 });
  await seedCard(s, { id: 13, leftId: 12, rightId: 8, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 14, leftId: 13, rightId: 4, dbContent: `[[${ruleParty.key}]]` });
  await seedReference(s, 14, ruleParty.id, ruleParty.key);
  await seedCard(s, { id: 16, leftId: 1, rightId: 5, dbContent: "[[Editor]]" });
  await seedReference(s, 16, 7, "editor");
  await seedCard(s, { id: 17, leftId: 13, rightId: 5, dbContent: `[[${ruleParty.key}]]` });
  await seedReference(s, 17, ruleParty.id, ruleParty.key);
  await seedCard(s, { id: 20, name: "Petition", typeId: 12, dbContent: "v1" });
  return s;
}

const ANYONE = { id: 6, key: "anyone" };
const EDITOR = { id: 7, key: "editor" };

/** Anonymous-session engine (actor null — the signed-out request). */
function anonEngine(s: ActionsTestStorage): CardActionEngine {
  return actionEngine(s, null);
}

async function asError(p: Promise<unknown>): Promise<CardActionError> {
  return (await p.then(
    () => undefined,
    (e: CardActionError) => e,
  )) as CardActionError;
}

describe("anonymous update rides the update RULE check (Ruby has no signed-in clause)", () => {
  it("allows the rule-granted arm (*type -> Anyone over the *all Editor fallback) and records the act under the Anonymous card", async () => {
    const s = await seedRuleDeck(ANYONE);
    const engine = anonEngine(s);
    const result = await engine.updateCard({ cardId: 20, content: "anonymous edit" });
    expect(result?.verb).toBe("update");
    const card = await s.selectOne<{ updater_id: number; db_content: string | null }>(
      "SELECT updater_id, db_content FROM cards WHERE id = 20",
    );
    // set_stamper on the update save: updater_id = Auth.as_id — a real deck's
    // anonymous-stamped updater rows are exactly this shape
    expect(card?.updater_id).toBe(11);
    expect(card?.db_content).toBe("anonymous edit");
    const act = await s.selectOne<{ actor_id: number }>(
      "SELECT actor_id FROM card_acts WHERE card_id = 20",
    );
    // assign_actor: the act's actor_id IS the Anonymous card
    expect(act?.actor_id).toBe(11);
  });

  it("denies with permission-denied when the applicable rule grants only a role Anonymous lacks (ok_to_update? :148)", async () => {
    const s = await seedRuleDeck(EDITOR);
    const engine = anonEngine(s);
    const err = await asError(engine.updateCard({ cardId: 20, content: "nope" }));
    expect(err.code).toBe("permission-denied");
    expect(err.message).toContain("may not update card");
    const card = await s.selectOne<{ updater_id: number; db_content: string | null }>(
      "SELECT updater_id, db_content FROM cards WHERE id = 20",
    );
    expect(card?.updater_id).toBe(1); // unchanged (the seed's stamper)
    expect(card?.db_content).toBe("v1"); // nothing written
    expect(await s.count("card_acts")).toBe(0);
  });

  it("keys the session by ID, not by name: an actor NAMED *anonymous with an account id acts as THAT account", async () => {
    // Identity is the ID, not the name: the earlier pin asserted the
    // name-keyed behavior — any actor named "*anonymous" wrote as the
    // Anonymous card. The engine's identity is the id (`@as_id = Card.id
    // given_user`, auth/proxy.rb:11; signed_in? = current_id !=
    // AnonymousID, auth/current.rb:43-47); only the real Anonymous card
    // (id 11) is the anonymous session.
    const s = await seedRuleDeck(ANYONE);
    const engine = actionEngine(s, { id: 9, name: "*anonymous" });
    const result = await engine.updateCard({ cardId: 20, content: "named anon edit" });
    expect(result?.verb).toBe("update");
    const card = await s.selectOne<{ updater_id: number }>(
      "SELECT updater_id FROM cards WHERE id = 20",
    );
    expect(card?.updater_id).toBe(9); // its own id, never the Anonymous card (11)
  });

  it("permission-denied outranks the conflict check (the gate runs before detect_conflict, events.rb:19-22)", async () => {
    const s = await seedRuleDeck(EDITOR);
    // real history first: a signed-in Editor (id 7 — the party the rule
    // grants) update gives card 20 a last action whose act belongs to
    // that account — so a stale lastActionIdBeforeEdit WOULD trip
    // isEditConflict for an anonymous caller (actor id 0)
    const editor = actionEngine(s, { id: 7, name: "Editor User" });
    await editor.updateCard({ cardId: 20, content: "editor edit" });
    expect(await s.count("card_actions")).toBe(1);
    const err = await asError(
      anonEngine(s).updateCard({ cardId: 20, content: "stale anon edit", lastActionIdBeforeEdit: 999999 }),
    );
    // the RULE verdict governs: not anonymous-actor (the legacy blanket
    // gate), not conflict (detect_conflict runs after the gate) —
    // permission-denied, the Ruby PermissionDenied
    expect(err.code).toBe("permission-denied");
    const card = await s.selectOne<{ updater_id: number; db_content: string | null }>(
      "SELECT updater_id, db_content FROM cards WHERE id = 20",
    );
    expect(card?.updater_id).toBe(7); // the Editor's edit stands
    expect(card?.db_content).toBe("editor edit");
    expect(await s.count("card_actions")).toBe(1); // no new action
    expect(await s.count("card_acts")).toBe(1);
  });
});

describe("anonymous delete rides the delete RULE check (ok_to_delete? :155-157)", () => {
  it("allows the rule-granted arm: the trash flip records under the Anonymous card (a trashed card's updater is anonymous too)", async () => {
    const s = await seedRuleDeck(ANYONE);
    const engine = anonEngine(s);
    const result = await engine.deleteCard({ cardId: 20 });
    expect(result?.verb).toBe("delete");
    const card = await s.selectOne<{ trash: number; updater_id: number }>(
      "SELECT trash, updater_id FROM cards WHERE id = 20",
    );
    expect(card?.trash).toBe(1);
    // the trash save is an update save and re-stamps updater_id
    // (set_stamper) — exactly the anonymous-stamped shape
    expect(card?.updater_id).toBe(11);
    const act = await s.selectOne<{ actor_id: number }>(
      "SELECT actor_id FROM card_acts WHERE card_id = 20",
    );
    expect(act?.actor_id).toBe(11);
  });

  it("denies with permission-denied when the rule grants only Editor: nothing trashed, no act", async () => {
    const s = await seedRuleDeck(EDITOR);
    const engine = anonEngine(s);
    const err = await asError(engine.deleteCard({ cardId: 20 }));
    expect(err.code).toBe("permission-denied");
    expect(err.message).toContain("may not delete card");
    const card = await s.selectOne<{ trash: number }>("SELECT trash FROM cards WHERE id = 20");
    expect(card?.trash).toBe(0);
    expect(await s.count("card_acts")).toBe(0);
    expect(await s.count("card_actions")).toBe(0);
  });
});

describe("fragment-seed decks keep the legacy signed-in-only rejection (both tasks)", () => {
  it("no anonymous codename card: update and delete throw anonymous-actor (Ruby could not form Card[AnonymousID] either)", async () => {
    const s = await createActionsTestStorage();
    const f = await seedStandardDeck(s); // codenames basic/cardtype/all/default — NO anonymous
    const engine = anonEngine(s);
    const updErr = await asError(engine.updateCard({ cardId: f.joeCard.id, content: "x" }));
    expect(updErr.code).toBe("anonymous-actor");
    const delErr = await asError(engine.deleteCard({ cardId: f.joeCard.id }));
    expect(delErr.code).toBe("anonymous-actor");
    expect(await s.count("card_acts")).toBe(0);
  });
});

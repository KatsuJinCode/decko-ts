// Action-layer tests — SET (Card.create!): row-level conformance against
// the ActWriter contract and the Ruby save semantics. Every expectation
// cites its Ruby file:method; the
// Synthetic fixtures only (DATA RULE).

import { describe, expect, it } from "vitest";
import { DeckoName } from "../../../src/card/name.js";
import {
  CardActionError,
  CardActionEngine,
} from "../../../src/card/actions/index.js";
import {
  actionEngine,
  ANON,
  createActionsTestStorage,
  JOE,
  RICH_TEXT_ID,
  seedCard,
  seedStandardDeck,
  type StandardFixture,
} from "./actions-test-storage.js";

async function fresh(): Promise<StandardFixture> {
  const storage = await createActionsTestStorage();
  const fixture = await seedStandardDeck(storage);
  return fixture;
}

type Row = Record<string, unknown>;

async function autonameFixture(seed='auto001') {
  const fixture=await fresh(),s=fixture.storage;
  await seedCard(s,{id:340,name:'*autoname',codename:'autoname'});
  await seedCard(s,{id:341,name:'*type',codename:'type'});
  await seedCard(s,{id:342,leftId:RICH_TEXT_ID,rightId:341,typeId:300});
  await seedCard(s,{id:343,leftId:342,rightId:340,dbContent:seed});
  return fixture;
}

describe('createCard autoname rule (installed core autoname_spec.rb)',()=>{
  it('uses the seed, then advances past existing names without rule history',async()=>{
    const f=await autonameFixture();try{
      const engine=actionEngine(f.storage);
      const first=await engine.createCard({name:'',typeId:RICH_TEXT_ID,content:'first'});
      const second=await engine.createCard({name:'',typeId:RICH_TEXT_ID,content:'second'});
      expect(first.name?.s).toBe('auto001');expect(second.name?.s).toBe('auto002');
      expect((await f.storage.selectOne<Row>('SELECT db_content FROM cards WHERE id=343'))?.db_content).toBe('auto002');
      expect(await f.storage.count('card_actions')).toBe(2);
      expect(await f.storage.count('card_acts')).toBe(2);
    }finally{f.storage.close()}
  });
  it('reuses the stored seed when its previous card is trashed',async()=>{
    const f=await autonameFixture();try{
      const engine=actionEngine(f.storage),first=await engine.createCard({name:'',typeId:RICH_TEXT_ID});
      await engine.deleteCard({cardId:first.cardId});
      const revived=await engine.createCard({name:'',typeId:RICH_TEXT_ID});
      expect(revived.name?.s).toBe('auto001');expect(revived.cardId).toBe(first.cardId);
    }finally{f.storage.close()}
  });
  it('treats canonical-name collisions as occupied and uses Ruby succession',async()=>{
    const f=await autonameFixture('Auto Card 9');try{
      await seedCard(f.storage,{id:344,name:'AUTO_card_9'});
      const result=await actionEngine(f.storage).createCard({name:'',typeId:RICH_TEXT_ID});
      expect(result.name?.s).toBe('Auto Card 10');
    }finally{f.storage.close()}
  });
  it('rolls back the counter, cards and history if a child validation fails',async()=>{
    const f=await autonameFixture();try{
      const before=await f.storage.count('cards');
      await expect(actionEngine(f.storage).createCard({name:'',typeId:RICH_TEXT_ID,subcards:{'+bad+':{content:'invalid child'}}})).rejects.toMatchObject({code:'name-illegal',message:expect.stringContaining('incomplete')});
      expect((await f.storage.selectOne<Row>('SELECT db_content FROM cards WHERE id=343'))?.db_content).toBe('auto001');
      expect(await f.storage.count('cards')).toBe(before);expect(await f.storage.count('card_actions')).toBe(0);expect(await f.storage.count('card_acts')).toBe(0);
    }finally{f.storage.close()}
  });
  it('leaves the counter unchanged for an explicitly named card',async()=>{
    const f=await autonameFixture();try{
      await actionEngine(f.storage).createCard({name:'Named card',typeId:RICH_TEXT_ID});
      expect((await f.storage.selectOne<Row>('SELECT db_content FROM cards WHERE id=343'))?.db_content).toBe('auto001');
    }finally{f.storage.close()}
  });
  it('keeps blank-name validation when the rule is blank',async()=>{
    const f=await autonameFixture('  ');try{
      await expect(actionEngine(f.storage).createCard({name:'',typeId:RICH_TEXT_ID})).rejects.toMatchObject({code:'name-illegal'});
    }finally{f.storage.close()}
  });
  it('does not advance the seed or write history for a denied create',async()=>{
    const f=await autonameFixture();try{
      const engine=actionEngine(f.storage,JOE,{canWrite:()=>false});
      await expect(engine.createCard({name:'',typeId:RICH_TEXT_ID})).rejects.toMatchObject({code:'permission-denied'});
      expect((await f.storage.selectOne<Row>('SELECT db_content FROM cards WHERE id=343'))?.db_content).toBe('auto001');
      expect(await f.storage.count('card_actions')).toBe(0);expect(await f.storage.count('card_acts')).toBe(0);
    }finally{f.storage.close()}
  });
  it('allocates distinct names across concurrent saves on separate engines',async()=>{
    const f=await autonameFixture();try{
      const a=actionEngine(f.storage),b=actionEngine(f.storage);
      const results=await Promise.all([a.createCard({name:'',typeId:RICH_TEXT_ID}),b.createCard({name:'',typeId:RICH_TEXT_ID})]);
      expect(results.map(result=>result.name?.s).sort()).toEqual(['auto001','auto002']);
      expect((await f.storage.selectOne<Row>('SELECT db_content FROM cards WHERE id=343'))?.db_content).toBe('auto002');
    }finally{f.storage.close()}
  });
});

async function cardRow(f: StandardFixture, id: number): Promise<Row> {
  const row = await f.storage.selectOne<Row>("SELECT * FROM cards WHERE id = ?", [id]);
  if (row === undefined) throw new Error(`card ${id} missing`);
  return row;
}

describe("createCard — simple create (Set)", () => {
  it("writes the cards row, one act, one create action, NO change rows", async () => {
    const f = await fresh();
    const engine = actionEngine(f.storage);
    const result = await engine.createCard({ name: "Hello Page", content: "body text" });

    // cards row (set_stamper — card-mod-account set/all/account.rb:20-23;
    // manage_trash forces trash false — trash.rb:23-27; current_revision_id
    // has no runtime writer —  section 1.4)
    const card = await cardRow(f, result.cardId);
    expect(card).toMatchObject({
      name: "Hello Page",
      key: "hello_page",
      codename: null,
      left_id: null,
      right_id: null,
      current_revision_id: null,
      trash: 0,
      type_id: RICH_TEXT_ID, // default type = *all+*default rule card's type (type.rb:3-5)
      db_content: "body text",
      creator_id: JOE.id,
      updater_id: JOE.id,
    });
    expect(card.created_at).toBe(card.updated_at);

    // exactly one act, primary card claimed (finalize_act — events.rb:48-50)
    const acts = await f.storage.selectAll<Row>("SELECT * FROM card_acts ORDER BY id");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ card_id: result.cardId, actor_id: JOE.id, ip_address: "192.0.2.7" });

    // one action, type create (0), not a draft, no super action
    const actions = await f.storage.selectAll<Row>("SELECT * FROM card_actions");
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      card_id: result.cardId,
      card_act_id: acts[0].id,
      super_action_id: null,
      action_type: 0, // TYPE_OPTIONS index (action.rb:42, :90-92)
      draft: 0,
      comment: null,
    });

    // first_create? skips change storage entirely (events.rb:31-32;
    // history.rb:38-40) — seed truth: card_changes.yml is empty while
    // card_actions.yml is full of create rows.
    expect(await f.storage.count("card_changes")).toBe(0);
    expect(result.verb).toBe("create");
    expect(result.name?.equals(DeckoName.parse("Hello Page"))).toBe(true);
    expect(result.subactions).toHaveLength(0);
  });

  it("resolves an explicit type by code, by name, and falls back to the default rule", async () => {
    const f = await fresh();
    const engine = actionEngine(f.storage);
    const byCode = await engine.createCard({ name: "Typed A", typeCode: "cardtype" });
    await expect(
      f.storage.selectOne<Row>("SELECT type_id FROM cards WHERE id = ?", [byCode.cardId]),
    ).resolves.toMatchObject({ type_id: 3 });
    const byName = await engine.createCard({ name: "Typed B", typeName: "RichText" });
    await expect(
      f.storage.selectOne<Row>("SELECT type_id FROM cards WHERE id = ?", [byName.cardId]),
    ).resolves.toMatchObject({ type_id: RICH_TEXT_ID });

    // An unknown codename or type name: type_id_or_error (type.rb:104-110)
    // adds its error while attributes are assigned, and valid? clears it
    // before validation, so Ruby saves the card with the default type (the
    // side-effects parity harness measured a create with type
    // "No Such Type" answering 303 with a RichText card).
    const unknownCode = await engine.createCard({ name: "Typed C", typeCode: "nosuch" });
    await expect(
      f.storage.selectOne<Row>("SELECT type_id FROM cards WHERE id = ?", [unknownCode.cardId]),
    ).resolves.toMatchObject({ type_id: RICH_TEXT_ID });
    const unknownName = await engine.createCard({ name: "Typed D", typeName: "Ghost Type" });
    await expect(
      f.storage.selectOne<Row>("SELECT type_id FROM cards WHERE id = ?", [unknownName.cardId]),
    ).resolves.toMatchObject({ type_id: RICH_TEXT_ID });
    // an explicit id that names no live card -> validate_type (type.rb:24-30)
    await expect(engine.createCard({ name: "Typed E", typeId: 4321 })).rejects.toMatchObject({
      code: "type-unknown",
    });
  });

  it("rejects illegal names (validate_legality_of_name, name_events.rb:35-47)", async () => {
    const f = await fresh();
    const engine = actionEngine(f.storage);
    await expect(engine.createCard({ name: "" })).rejects.toMatchObject({ code: "name-illegal" });
    await expect(engine.createCard({ name: "+orphan" })).rejects.toMatchObject({ code: "name-illegal" }); // name_incomplete?
    await expect(engine.createCard({ name: "a".repeat(256) })).rejects.toMatchObject({ code: "name-illegal" });
    expect(await f.storage.count("cards")).toBe(14); // nothing written (6 base rows + 8 rule-machinery rows)
  });

  it("rejects duplicate names (validate_uniqueness_of_name, name_events.rb:19-26)", async () => {
    const f = await fresh();
    const engine = actionEngine(f.storage);
    await expect(engine.createCard({ name: "Pudding" })).rejects.toMatchObject({ code: "name-conflict" });
    // case/spacing variants share a key -> same conflict
    await expect(engine.createCard({ name: "pudding" })).rejects.toMatchObject({ code: "name-conflict" });
  });

  it("rejects anonymous actors before any row is written", async () => {
    const f = await fresh();
    const before = await f.storage.count("cards");
    // null actor on a deck that cannot form the anonymous codename card
    // (this fixture has no codename 'anonymous' row): the fragment-seed
    // legacy gate (Auth.current_id fallback to AnonymousID —
    // auth/current.rb:7-9; Card[AnonymousID] could not form here either).
    const anonEngine = actionEngine(f.storage, null);
    await expect(anonEngine.createCard({ name: "Nope" })).rejects.toMatchObject({
      code: "anonymous-actor",
    });
    expect(await f.storage.count("cards")).toBe(before);
    expect(await f.storage.count("card_acts")).toBe(0);
  });

  it("an actor NAMED *anonymous is id-keyed: it acts as its own account, never as Anonymous", async () => {
    // LOW-1 (verdict-semantics lane 2026-10-01): Ruby keys actor identity
    // on the id (Auth.as_id — auth/proxy.rb:11/:32-35; signed_in? =
    // current_id != AnonymousID, auth/current.rb:43-47). This fixture has
    // no codename 'anonymous' row, so no id can be the Anonymous card's:
    // the named actor is an ordinary account (id 2) and its create rides
    // the *all+*create [[Anyone]] fallback like any signed-in writer.
    const f = await fresh();
    const namedAnon = actionEngine(f.storage, ANON);
    const ok = await namedAnon.createCard({ name: "Named But Not Anonymous" });
    expect(ok.cardId).toBeGreaterThan(0);
    const row = await f.storage.selectOne<{ creator_id: number }>(
      "SELECT creator_id FROM cards WHERE id = ?",
      [ok.cardId],
    );
    expect(row?.creator_id).toBe(ANON.id); // 2 — its own id, never an Anonymous misattribution
  });

  it("honors the canWrite permission seam", async () => {
    const f = await fresh();
    const denying = actionEngine(f.storage, JOE, { canWrite: () => false });
    await expect(denying.createCard({ name: "Forbidden" })).rejects.toMatchObject({
      code: "permission-denied",
    });
    const allowing = actionEngine(f.storage, JOE, {
      canWrite: (card, actor) => card.isNew === true && actor.id === JOE.id,
    });
    const ok = await allowing.createCard({ name: "Allowed" });
    expect(ok.cardId).toBeGreaterThan(0);
  });
});

describe("createCard — junction create (compound names)", () => {
  it("creates a junction row with NULL name/key; missing sides become subcards", async () => {
    const f = await fresh();
    const engine = actionEngine(f.storage);
    // post-2020 junction truth: name/key columns NULL, left_id/right_id set
    // (20200718051236_compound_names_do_not_store_name_and_key.rb).
    const result = await engine.createCard({ name: "Pudding+banana", content: "mix" });
    const card = await cardRow(f, result.cardId);
    expect(card).toMatchObject({
      name: null,
      key: null,
      left_id: f.joeCard.id,
      db_content: "mix",
    });
    // the side "banana" did not exist: it became a subcard create in the
    // SAME act (prepare_new_side)
    const right = await f.storage.selectOne<Row>("SELECT * FROM cards WHERE key = ?", ["banana"]);
    expect(right).toMatchObject({ name: "banana", left_id: null });
    expect(card.right_id).toBe((right as { id: number }).id);

    // one act; junction is the act card; TWO actions: junction, then side.
    // The junction's action row is saved before its side subcards are
    // stored (the recorded action ids put the junction first), while
    // the side's CARD row is inserted first (the junction needs its id).
    const acts = await f.storage.selectAll<Row>("SELECT * FROM card_acts");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ card_id: result.cardId }); // junction claims the act
    const actions = await f.storage.selectAll<Row>("SELECT * FROM card_actions ORDER BY id");
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ card_id: result.cardId, action_type: 0 });
    expect(actions[1]).toMatchObject({ card_id: (right as { id: number }).id, action_type: 0 });
    expect((right as { id: number }).id).toBeLessThan(result.cardId);
    // side subcard's super_action_id = the junction's action
    // (super_action = the supercard's current action)
    expect(actions[1]).toMatchObject({ super_action_id: actions[0].id });
    expect(result.subactions).toHaveLength(1);
    expect(result.subactions[0]).toMatchObject({ cardId: (right as { id: number }).id });

    // the composed name round-trips through fetch
    const fetched = await f.engine.fetchByName("Pudding+banana");
    expect(fetched?.name?.s).toBe("Pudding+banana");
  });

  it("dedupes repeated sides (A+A gets ONE new side card, Director.card staging)", async () => {
    const f = await fresh();
    const engine = actionEngine(f.storage);
    const result = await engine.createCard({ name: "Pudding+Pudding" });
    const card = await cardRow(f, result.cardId);
    expect(card.left_id).toBe(f.joeCard.id);
    expect(card.right_id).toBe(f.joeCard.id);
    expect(result.subactions).toHaveLength(0); // both sides already existed
    const actions = await f.storage.selectAll<Row>("SELECT * FROM card_actions");
    expect(actions).toHaveLength(1);
  });

  it("rejects a compound create whose name already exists (live junction)", async () => {
    const f = await fresh();
    const engine = actionEngine(f.storage);
    await engine.createCard({ name: "Pudding+waffle" });
    await expect(engine.createCard({ name: "Pudding+waffle" })).rejects.toMatchObject({
      code: "name-conflict",
    });
  });
});

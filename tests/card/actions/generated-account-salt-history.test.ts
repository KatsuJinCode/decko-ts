import { describe, expect, it } from "vitest";
import { createActionsTestStorage, seedStandardDeck, seedCard, actionEngine } from "./actions-test-storage.js";
import { CardActionEngine } from '../../../src/card/actions/card-action-engine.js';

async function deck() {
  const s=await createActionsTestStorage();
  await seedStandardDeck(s);
  for(const [id,name,codename] of [[500,"*account","account"],[501,"*email","email"],[502,"*salt","salt"],[503,"*status","status"],[504,"Phrase","phrase"],[510,"Default Field Holder",null]] as const)
    await seedCard(s,{id,name,codename});
  return s;
}
async function snapshot(s:Awaited<ReturnType<typeof deck>>) {
  return Promise.all(["cards","card_actions","card_acts","card_changes","card_references","sqlite_sequence"].map(t=>s.selectAll(`SELECT * FROM ${t} ORDER BY rowid`)));
}

describe("generated account salt history",()=>{
  it('uses the anonymized holder name in the delete result and integration notices',async()=>{
    const s=await deck();try{
      await seedCard(s,{id:520,name:'User',codename:'user',typeId:3});
      const notices:Array<string|null>=[];
      const engine=new CardActionEngine(s.engine,{
        actor:{id:9,name:'Joe User'},canWrite:()=>true,
        integrationHooks:[{stage:'integrate',notable:e=>e.verb==='delete',fire:async e=>{notices.push(e.card?.name??null)}}],
      });
      const holder=await engine.createCard({name:'Notice Holder',typeId:520,subcards:{'+*account':{subcards:{'+*email':{content:'holder@example.test'}}}}});
      const result=await engine.deleteCard({cardId:holder.cardId});
      const stored=await s.selectOne<{name:string}>('SELECT name FROM cards WHERE id=?',[holder.cardId]);
      expect(stored?.name).toMatch(/^ANON-[0-9a-f]{12}$/);
      expect(result?.name?.s).toBe(stored?.name);
      expect(notices).toContain(stored?.name);
      expect(notices).not.toContain('Notice Holder');
    }finally{s.close()}
  });
  it('preserves custom account subtrees without leaving cardless history',async()=>{
    const s=await deck();try{
      const engine=actionEngine(s,undefined,{canWrite:()=>true});
      await engine.createCard({name:'Custom Holder+*account',subcards:{'+*email':{content:'custom-holder@example.test'},'+note':{content:'custom account data'}}});
      expect((await s.engine.fetchByName('Custom Holder+*account+note'))?.dbContent).toBe('custom account data');
      expect((await s.selectOne<{n:number}>('SELECT COUNT(*) AS n FROM card_actions WHERE card_id IS NULL'))?.n).toBe(0);
    }finally{s.close()}
  });
  it('records requested account fields before an automatically created holder, without renumbering or salt gaps',async()=>{
    const s=await deck();try{
      const engine=actionEngine(s,undefined,{canWrite:()=>true});
      const root=await engine.createCard({name:'New Holder+*account',subcards:{'+*email':{content:'new-holder@example.test'}}});
      const holder=await s.engine.fetchByName('New Holder');
      const email=await s.engine.fetchByName('New Holder+*account+*email');
      const status=await s.engine.fetchByName('New Holder+*account+*status');
      const actions=await s.selectAll<{id:number;card_id:number;super_action_id:number|null}>('SELECT id,card_id,super_action_id FROM card_actions ORDER BY id');
      expect(actions.map(row=>row.card_id)).toEqual([root.cardId,email!.id,status!.id,holder!.id]);
      expect(actions.map(row=>row.id)).toEqual([1,2,3,4]);
      expect(actions.slice(1).map(row=>row.super_action_id)).toEqual([root.actionId,root.actionId,root.actionId]);
    }finally{s.close()}
  });
  it('refuses closing an account on a card without AccountHolder behavior and writes nothing',async()=>{
    const s=await deck();try{
      const engine=actionEngine(s,undefined,{canWrite:()=>true});
      const account=await engine.createCard({name:'Default Field Holder+*account',subcards:{'+*email':{content:'holder@example.test'}}});
      const before=await snapshot(s);
      await expect(engine.deleteCard({cardId:account.cardId})).rejects.toMatchObject({name:'NoMethodError'});
      expect(await snapshot(s)).toEqual(before);
    }finally{s.close()}
  });
  it('still closes an account on a User holder',async()=>{
    const s=await deck();try{
      await seedCard(s,{id:520,name:'User',codename:'user',typeId:3});
      await s.driver.query('UPDATE cards SET type_id=? WHERE id=?',[520,510]);
      const engine=actionEngine(s,undefined,{canWrite:()=>true});
      const account=await engine.createCard({name:'Default Field Holder+*account',subcards:{'+*email':{content:'holder@example.test'}}});
      expect(await engine.deleteCard({cardId:account.cardId})).not.toBeNull();
      expect((await s.selectOne<{name:string}>('SELECT name FROM cards WHERE id=?',[510]))?.name).toMatch(/^ANON-[0-9a-f]{12}$/);
    }finally{s.close()}
  });
  it("stores generated defaults without allocating a salt action or an action sequence gap",async()=>{
    const s=await deck();try{
      const engine=actionEngine(s,undefined,{canWrite:()=>true});
      const r=await engine.createCard({name:"Default Field Holder+*account",subcards:{"+*email":{content:"holder@example.test"}}});
      const rows=await s.selectAll<{id:number;card_id:number}>("SELECT id,card_id FROM card_actions ORDER BY id");
      expect(rows).toHaveLength(3); // root, requested email, generated status
      expect(rows.map(x=>x.id)).toEqual([1,2,3]);
      const salt=await s.engine.fetchByName("Default Field Holder+*account+*salt");
      expect(salt?.dbContent).toMatch(/^[0-9a-f]{40}$/);
      expect(rows.some(x=>x.card_id===salt?.id)).toBe(false);
      const seq=await s.selectOne<{seq:number}>("SELECT seq FROM sqlite_sequence WHERE name = 'card_actions'");
      expect(seq?.seq).toBe(3);
      const updated=await engine.updateCard({cardId:r.cardId,subcards:{"+*email":{content:"changed@example.test"}}});
      const after=await s.selectAll<{id:number}>("SELECT id FROM card_actions ORDER BY id");
      expect(after.map(x=>x.id)).toEqual([1,2,3,4]);
      expect(updated?.cardId).toBe(r.cardId);
    }finally{s.close()}
  });
  it("keeps a refused account subtree atomic including history sequences",async()=>{
    const s=await deck();try{
      const before=await snapshot(s);
      await expect(actionEngine(s,undefined,{canWrite:()=>true}).createCard({name:"Default Field Holder+*account",subcards:{"+*email":{content:"not-an-address"}}})).rejects.toThrow();
      expect(await snapshot(s)).toEqual(before);
    }finally{s.close()}
  });
});

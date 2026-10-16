import { describe, expect, it } from "vitest";
import { createActionsTestStorage, seedStandardDeck, seedCard, actionEngine } from "./actions-test-storage.js";

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

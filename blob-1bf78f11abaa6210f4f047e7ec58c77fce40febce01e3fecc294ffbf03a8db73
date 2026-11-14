import {describe,it,expect} from 'vitest';
import {createActionsTestStorage,seedStandardDeck,seedCard,actionEngine,SET_TYPE_ID} from './actions-test-storage.js';

describe('created-card references use structured content',()=>{
 it.each([
  ['{{+description}}{{+dashboard}}{{+members}}','[[Pudding]]'],
  ['_self','[[Pudding]]'],
  [null,'[[Pudding]]'],
  [null,undefined],
 ])('resolves template %s with authored content %s',async(template,content)=>{
  const s=await createActionsTestStorage();
  try{
   await seedStandardDeck(s);
   await seedCard(s,{id:600,name:'Role',codename:'role',typeId:3});
   await seedCard(s,{id:601,name:'Setting',codename:'setting',typeId:3});
   await seedCard(s,{id:602,name:'*type',codename:'type',typeId:601});
   await seedCard(s,{id:603,name:'*structure',codename:'structure',typeId:601});
   await seedCard(s,{id:604,name:'Role+*type',leftId:600,rightId:602,typeId:SET_TYPE_ID});
   await seedCard(s,{id:605,name:'Role+*type+*structure',leftId:604,rightId:603,typeId:2,dbContent:template});
   const saved=await actionEngine(s,undefined,{canWrite:()=>true}).createCard({name:'Crew',typeId:600,content});
   const refs=await s.selectAll<{referee_key:string,ref_type:string}>('SELECT referee_key,ref_type FROM card_references WHERE referer_id=? ORDER BY referee_key,ref_type',[saved.cardId]);
   if(content===undefined)expect(refs).toEqual([]);
   else if(template && template!=='_self'){
    expect(refs.filter(r=>r.ref_type==='I').map(r=>r.referee_key)).toEqual(['crew+dashboard','crew+description','crew+member']);
    expect(refs.some(r=>r.referee_key==='pudding')).toBe(false);
   }else expect(refs).toEqual([{referee_key:'pudding',ref_type:'L'}]);
   expect((await s.selectOne<{db_content:string|null}>('SELECT db_content FROM cards WHERE id=?',[saved.cardId]))?.db_content).toBe(content??'');
  }finally{s.close()}
 });
});

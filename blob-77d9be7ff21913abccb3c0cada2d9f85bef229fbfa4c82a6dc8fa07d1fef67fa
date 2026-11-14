import {describe,it,expect} from 'vitest';
import {createActionsTestStorage,seedStandardDeck,seedCard,actionEngine} from './actions-test-storage.js';
import {NoMethodError} from '../../../src/card/render/format.js';

describe('API-key create without its left account',()=>{
 it('preserves the Ruby account_card receiver error before any write',async()=>{
  const s=await createActionsTestStorage();
  try{
   await seedStandardDeck(s);
   await seedCard(s,{id:600,name:'*api key',codename:'api_key'});
   const before=await s.selectAll('SELECT * FROM cards ORDER BY id');
   const save=actionEngine(s,undefined,{canWrite:()=>true}).createCard({name:'Missing account+*api key',content:'synthetic_api_key_1234567890'});
   await expect(save).rejects.toThrow(NoMethodError);
   await expect(save).rejects.toThrow("undefined method `right_id' for nil");
   expect(await s.selectAll('SELECT * FROM cards ORDER BY id')).toEqual(before);
   expect(await s.count('card_actions')).toBe(0);
   expect(await s.count('card_acts')).toBe(0);
  }finally{s.close()}
 });
});

import {describe,it,expect} from 'vitest';
import {createActionsTestStorage,seedStandardDeck,seedCard,actionEngine} from './actions-test-storage.js';

async function deck(){
 const s=await createActionsTestStorage();await seedStandardDeck(s);
 await seedCard(s,{id:600,name:'Setting',codename:'setting',typeId:3});
 await seedCard(s,{id:601,name:'List',codename:'list',typeId:3});
 await seedCard(s,{id:602,name:'*input type',codename:'input_type',typeId:600});
 await seedCard(s,{id:603,name:'*help',codename:'help',typeId:600});
 await seedCard(s,{id:604,name:'*recent settings',codename:'recent_settings',typeId:601,dbContent:'*help'});
 await seedCard(s,{id:605,name:'User',codename:'user',typeId:3});
 await seedCard(s,{id:606,name:'Test User',typeId:605});
 return s;
}

describe('recent setting updates use actual Rule pattern membership',()=>{
 it.each([
  ['Pudding+*input type',false],
  ['Pudding+Test User+*input type',false],
  ['*all+*input type',true],
  ['*all+Test User+*input type',true],
 ])('%s changes the recent list only when it is a rule or preference',async(name,expected)=>{
  const s=await deck();try{
   const before=await s.selectOne('SELECT * FROM cards WHERE id=604');
   await actionEngine(s,undefined,{canWrite:()=>true}).createCard({name,content:'plain text'});
   const after=await s.selectOne<{db_content:string}>('SELECT * FROM cards WHERE id=604');
   if(expected)expect(after?.db_content).toBe('*input type\n*help');
   else expect(after).toEqual(before);
  }finally{s.close()}
 });
});

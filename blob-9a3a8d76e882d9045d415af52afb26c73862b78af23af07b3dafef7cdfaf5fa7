import {afterEach,expect,it} from 'vitest';
import {actionEngine,createActionsTestStorage,seedStandardDeck,seedCard,type ActionsTestStorage} from '../actions/actions-test-storage.js';
let storage:ActionsTestStorage|undefined;
afterEach(()=>storage?.close());
async function fixture(){
 const s=storage=await createActionsTestStorage();await seedStandardDeck(s);
 await seedCard(s,{id:1000,name:'Setting',codename:'setting'});
 await seedCard(s,{id:1001,name:'*help',codename:'help',typeId:1000});
 await seedCard(s,{id:1002,name:'*read',codename:'read',typeId:1000});
 await s.driver.query('UPDATE cards SET read_rule_id=9999,read_rule_class=? WHERE id=50',['preserved drift']);
 return {s,engine:actionEngine(s)};
}
it('creating and deleting a non-read rule preserves unrelated stored read-rule columns',async()=>{
 const {s,engine}=await fixture();
 const before=await s.selectOne('SELECT read_rule_id,read_rule_class FROM cards WHERE id=50');
 const help=await engine.createCard({name:'*all+*help',content:'a help marker'});
 expect(await s.selectOne('SELECT read_rule_id,read_rule_class FROM cards WHERE id=50')).toEqual(before);
 await engine.deleteCard({cardId:help.cardId});
 expect(await s.selectOne('SELECT read_rule_id,read_rule_class FROM cards WHERE id=50')).toEqual(before);
});
it('creating and deleting read rules still updates the governed cards',async()=>{
 const {s,engine}=await fixture();
 const rule=await engine.createCard({name:'*all+*read',content:'[[Anyone]]'});
 expect(await s.selectOne('SELECT read_rule_id FROM cards WHERE id=50')).toEqual({read_rule_id:rule.cardId});
 await engine.deleteCard({cardId:rule.cardId});
 expect(await s.selectOne('SELECT read_rule_id FROM cards WHERE id=50')).toEqual({read_rule_id:null});
});
it('renaming a read rule to another setting retains its old-binding cascade',async()=>{
 const {s,engine}=await fixture();
 const rule=await engine.createCard({name:'*all+*read',content:'[[Anyone]]'});
 await s.driver.query('UPDATE cards SET read_rule_id=9999 WHERE id=50',[]);
 await engine.updateCard({cardId:rule.cardId,name:'*all+*help'});
 expect(await s.selectOne('SELECT read_rule_id FROM cards WHERE id=50')).toEqual({read_rule_id:rule.cardId});
});

import {expect,it} from 'vitest';
import {createRenderTestStorage,seedCard} from '../render/render-test-storage.js';
async function fixture(denyHelp=false){
 const s=await createRenderTestStorage();
 await seedCard(s,{id:2,name:'RichText',codename:'basic'});
 await seedCard(s,{id:10,name:'*all',codename:'all',typeId:13});
 await seedCard(s,{id:11,name:'*self',codename:'self'});
 await seedCard(s,{id:12,name:'*help',codename:'help',typeId:14});
 await seedCard(s,{id:13,name:'Set',codename:'set'});
 await seedCard(s,{id:14,name:'Setting',codename:'setting'});
 await seedCard(s,{id:15,name:'*right',codename:'right'});
 await seedCard(s,{id:21,leftId:10,rightId:12,dbContent:'GLOBAL_HELP_MARKER',...(denyHelp?{readRuleId:999999}: {})});
 await seedCard(s,{id:30,name:'Colour'});
 await seedCard(s,{id:31,leftId:30,rightId:15,typeId:13});
 await seedCard(s,{id:32,leftId:31,rightId:12,dbContent:'RIGHT_HELP_MARKER'});
 return s;
}
it('an unstored card receives default help and its plus card receives the right override',async()=>{
 const s=await fixture();try{
 const plain=await s.engine.render('New Help Host','help',{absentCard:true,newCard:{typeId:2}});
 const plus=await s.engine.render('New Help Host+Colour','help',{absentCard:true,newCard:{typeId:2}});
 expect(plain).toContain('GLOBAL_HELP_MARKER');expect(plain).not.toContain('RIGHT_HELP_MARKER');
 expect(plus).toContain('RIGHT_HELP_MARKER');expect(plus).not.toContain('GLOBAL_HELP_MARKER');
 }finally{s.close()}
});
it('unknown-card help retains the read permission gate',async()=>{
 const s=await fixture(true);try{
 const html=await s.engine.render('New Help Host','help',{absentCard:true,newCard:{typeId:2}});
 expect(html).not.toContain('GLOBAL_HELP_MARKER');
 }finally{s.close()}
});

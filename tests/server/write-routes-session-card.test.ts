import {afterEach,beforeEach,expect,it} from 'vitest';
import {createActionsTestStorage,seedStandardDeck,seedCard,type ActionsTestStorage} from '../card/actions/actions-test-storage.js';
import {runAuthMigrations,SessionStore} from '../../src/card/auth/index.js';
import {handleWriteRequest,sessionCookieHeader,type WriteRouteRequest} from '../../src/server/write-routes.js';
import {readVisitorSession,sessionCardContent,visitorSessionCookie} from '../../src/card/session/visitor-session.js';
let storage:ActionsTestStorage;let token:string;
const previous=process.env.DECKO_WRITE_PATH;
beforeEach(async()=>{
 process.env.DECKO_WRITE_PATH='1';storage=await createActionsTestStorage();await seedStandardDeck(storage);await runAuthMigrations(storage.driver);
 for(const row of [
  {id:1000,name:'Session',codename:'session',typeId:3},
  {id:1001,name:'*enabled roles',codename:'enabled_roles',typeId:1000},
  {id:1002,name:'Anyone Signed In',codename:'anyone_signed_in'},
  {id:1003,name:'Role',codename:'role',typeId:3},
  {id:1004,name:'*members',codename:'members'},
  {id:1005,name:'Neutral Role',typeId:1003},
  {id:1006,leftId:1005,rightId:1004},
  {id:1007,name:'Anonymous',codename:'anonymous'},
  {id:1008,name:'Peer'},
  {id:1009,name:'Administrator',codename:'administrator',typeId:1003},
 ])await seedCard(storage,row);
 await storage.driver.query("INSERT INTO card_references (referer_id,referee_id,referee_key,ref_type) VALUES (1006,50,NULL,'L')",[]);
 token=(await new SessionStore({driver:storage.driver}).createSession(50)).token;
});
afterEach(()=>{storage?.close();if(previous===undefined)delete process.env.DECKO_WRITE_PATH;else process.env.DECKO_WRITE_PATH=previous});
const snapshot=async()=>Object.fromEntries(await Promise.all(['cards','card_references','card_acts','card_actions','card_changes'].map(async table=>[table,await storage.selectAll('SELECT * FROM '+table+' ORDER BY id')])));
async function send(path:string,fields:Record<string,string>,ajax=false,anonymous=false,visitor?:string){
 const req:WriteRouteRequest={method:'POST',pathname:path,host:'deck.example',scheme:'https',headers:{origin:'https://deck.example','content-type':'application/x-www-form-urlencoded',...(anonymous?{}:{cookie:sessionCookieHeader(token).split(';')[0]+(visitor?'; '+visitor:'')}),...(ajax?{'x-requested-with':'XMLHttpRequest'}:{})},body:new URLSearchParams(fields).toString()};
 return handleWriteRequest({driver:storage.driver,fetcher:storage.engine,renderSlot:async()=>{throw Error('A virtual Session must reload, not render a missing database card')}},req);
}
it('explicit Session create stores visitor content without canonical/history writes',async()=>{
 const before=await snapshot();const res=await send('/card/create',{'card[name]':'Pudding+*enabled roles','card[type_id]':'1000','card[content]':'Anyone Signed In'});
 expect(res?.status).toBe(303);expect(sessionCardContent(readVisitorSession(res?.visitorCookie),'Pudding+*enabled roles')).toBe('Anyone Signed In');expect(await snapshot()).toEqual(before);
});
it('the stock enabled-role AJAX update stores the cookie and returns reload JSON',async()=>{
 const before=await snapshot();const res=await send('/update/Pudding+*enabled_roles',{'card[type_id]':'1000','card[content]':'Anyone Signed In','success[reload]':'true'},true);
 expect(res?.status).toBe(200);expect(JSON.parse(res!.body)).toEqual({reload:true});expect(sessionCardContent(readVisitorSession(res?.visitorCookie),'Pudding+*enabled roles')).toBe('Anyone Signed In');expect(await snapshot()).toEqual(before);
});
it.each(['/card/create','/update/Pudding+*enabled_roles'])('refuses an unheld enabled role through %s before cookie or canonical changes',async path=>{
 const before=await snapshot();const res=await send(path,{'card[name]':'Pudding+*enabled roles','card[type_id]':'1000','card[content]':'Administrator'});
 expect(res?.status).toBe(422);expect(res?.visitorCookie).toBeUndefined();expect(res?.body).toContain('illegal roles');expect(await snapshot()).toEqual(before);
});
it('a nonadministrator cannot edit another account enabled-role session',async()=>{
 const before=await snapshot();const res=await send('/update/Peer+*enabled_roles',{'card[type_id]':'1000','card[content]':'Anyone Signed In'});
 expect(res?.status).toBe(403);expect(res?.visitorCookie).toBeUndefined();expect(await snapshot()).toEqual(before);
});
it('a generic visitor-local Session update remains available anonymously',async()=>{
 const before=await snapshot();const res=await send('/update/Visitor_preference',{'card[type_id]':'1000','card[content]':'local value'},false,true);
 expect(res?.status).toBe(303);expect(sessionCardContent(readVisitorSession(res?.visitorCookie),'Visitor preference')).toBe('local value');expect(await snapshot()).toEqual(before);
});
it('a disabled held role loses write authority, and the same session can re-enable it',async()=>{
 await storage.driver.query('DELETE FROM card_references WHERE referer_id=306',[]);
 await storage.driver.query("INSERT INTO card_references (referer_id,referee_id,referee_key,ref_type) VALUES (306,1005,NULL,'L')",[]);
 const disabled=visitorSessionCookie({cards:{'pudding+*enabled_role':'Anyone Signed In'}}).split(';')[0];
 const before=await snapshot();
 const refused=await send('/update/Peer',{'card[content]':'must not persist','success[redirect]':'true'},false,false,disabled);
 expect(refused?.status).toBe(403);expect(await snapshot()).toEqual(before);
 const enabled=await send('/update/Pudding+*enabled_roles',{'card[type_id]':'1000','card[content]':'Anyone Signed In\nNeutral Role','success[reload]':'true'},true,false,disabled);
 expect(enabled?.status).toBe(200);expect(await snapshot()).toEqual(before);
 const accepted=await send('/update/Peer',{'card[content]':'held role restored','success[redirect]':'true'},false,false,enabled!.visitorCookie!.split(';')[0]);
 expect(accepted?.status).toBe(303);
 expect((await storage.selectAll<{db_content:string}>('SELECT db_content FROM cards WHERE id=1008'))[0].db_content).toBe('held role restored');
});

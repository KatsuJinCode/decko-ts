import {afterAll,beforeAll,expect,it} from 'vitest';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startMockHranaServer,type MockHranaServer} from '../server/drivers/mock-hrana-server.js';
import {BunnyDbDriver} from '../../src/card/drivers/bunny-db.js';
import {runAuthMigrations,SessionStore} from '../../src/card/auth/index.js';
import {ensureFreshnessStamp} from '../../src/server/freshness-stamp.js';
import {handleBunnyEngineRequest} from '../../deploy/bunny-worker-src/bunny-edge-engine-handler.js';
let root:string,hrana:MockHranaServer,driver:BunnyDbDriver;
beforeAll(async()=>{root=mkdtempSync(join(tmpdir(),'decko-json-batching-'));const db=join(root,'deck.sqlite3');copyFileSync('reference-harness/fixtures/synthetic-v1/deck/deck.sqlite3',db);hrana=await startMockHranaServer({path:db});driver=new BunnyDbDriver({url:hrana.url,authToken:'owned-test'});await runAuthMigrations(driver);await ensureFreshnessStamp(driver)});
afterAll(async()=>{await hrana?.close();if(root)rmSync(root,{recursive:true,force:true})});
const env=()=>({DECKO_DB_URL:hrana.url,DECKO_DB_TOKEN:'owned-test',DECKO_EDGE_DECK_PROFILE:'stock'});
async function get(term:string,live:string,cookie?:string){return handleBunnyEngineRequest(new Request('https://local.test/*search/search_box_complete.json?term='+encodeURIComponent(term),{headers:{'x-requested-with':'XMLHttpRequest',...(cookie?{cookie}:{})}}),{...env(),DECKO_LIVE_RENDER:live})}
it('preserves cold JSON suggestion bytes and all supported actors',async()=>{
 const rows=(await driver.query('SELECT * FROM cards ORDER BY id',[])).rows;
 const cold=await get('Home','1');const coldBody=await cold.text();
 expect(cold.status).toBe(200);expect(cold.headers.get('cache-control')).toBe('no-store');
 expect(coldBody).toBe(await (await get('Home','0')).text());
 const sessions=new SessionStore({driver});
 for(const actor of [undefined,617,611]){
  const session=actor===undefined?undefined:await sessions.createSession(actor);const cookie=session===undefined?undefined:`decko_ts_session=${session.token}`;
  for(const term of ['Topic','Home','Mira Member+*account','+*type+by name']){
   const normal=await get(term,'0',cookie),expected=await normal.text();
   const live=await get(term,'1',cookie),actual=await live.text();
   expect(live.status,JSON.stringify({actor,term,expected,actual})).toBe(normal.status);expect(live.headers.get('content-type')).toContain('application/json');expect(actual).toBe(expected);
  }
 }
 expect((await driver.query('SELECT * FROM cards ORDER BY id',[])).rows).toEqual(rows);
},30000);
it('preserves image-picker JSON and actor filtering through the complete-answer renderer',async()=>{
 const before=(await driver.query('SELECT * FROM cards ORDER BY id',[])).rows;
 const sessions=new SessionStore({driver});
 for(const actor of [undefined,617,611]){
  const session=actor===undefined?undefined:await sessions.createSession(actor);
  const cookie=session===undefined?undefined:`decko_ts_session=${session.token}`;
  for(const term of ['*log','MissingImagePickerTarget']){
   const url='https://local.test/:search.json?view=image_complete&term='+encodeURIComponent(term);
   const request=()=>new Request(url,{headers:{'x-requested-with':'XMLHttpRequest',...(cookie?{cookie}:{})}});
   const normal=await handleBunnyEngineRequest(request(),{...env(),DECKO_LIVE_RENDER:'0'}),expected=await normal.text();
   const start=hrana.requests.length;
   const batched=await handleBunnyEngineRequest(request(),{...env(),DECKO_LIVE_RENDER:'1'}),actual=await batched.text();
   expect(batched.status,JSON.stringify({actor,term,expected,actual})).toBe(normal.status);
   expect(batched.headers.get('content-type')).toContain('application/json');
   expect(actual).toBe(expected);
   expect(Array.isArray(JSON.parse(actual))).toBe(true);
   console.log(JSON.stringify({check:'image-picker-batched-trips',actor:actor??'anonymous',term,trips:hrana.requests.length-start}));
  }
 }
 expect((await driver.query('SELECT * FROM cards ORDER BY id',[])).rows).toEqual(before);
},30000);
it('reloads changed autocomplete permissions and content between requests without a response cache',async()=>{
 const before=await (await get('Home','1')).text();
 expect((await driver.query("DELETE FROM card_references WHERE referer_id=10",[])).rowsAffected).toBeGreaterThan(0);
 const expected=await (await get('Home','0')).text();
 const actual=await (await get('Home','1')).text();
 expect(actual).toBe(expected);expect(actual).not.toBe(before);
},15000);

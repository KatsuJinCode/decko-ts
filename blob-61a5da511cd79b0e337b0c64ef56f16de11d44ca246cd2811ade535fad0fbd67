import {beforeAll,afterAll,it,expect} from 'vitest';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startMockHranaServer,type MockHranaServer} from '../server/drivers/mock-hrana-server.js';
import {BunnyDbDriver} from '../../src/card/drivers/bunny-db.js';
import {runAuthMigrations,SessionStore} from '../../src/card/auth/index.js';
import {ensureFreshnessStamp} from '../../src/server/freshness-stamp.js';
import {handleBunnyEngineRequest} from '../../deploy/bunny-worker-src/bunny-edge-engine-handler.js';
import {normalizeSlotIds} from '../../src/testing/diff.js';
import {bootEdgeServingEngines} from '../../deploy/bunny-worker-src/bunny-edge-deck-boot.js';
let root:string,hrana:MockHranaServer,driver:BunnyDbDriver;
beforeAll(async()=>{root=mkdtempSync(join(tmpdir(),'decko-xhr-focal-'));const db=join(root,'deck.sqlite3');copyFileSync('reference-harness/fixtures/synthetic-v1/deck/deck.sqlite3',db);hrana=await startMockHranaServer({path:db});driver=new BunnyDbDriver({url:hrana.url,authToken:'owned-test'});await runAuthMigrations(driver);await ensureFreshnessStamp(driver);});
afterAll(async()=>{await hrana?.close();if(root)rmSync(root,{recursive:true,force:true});});
it('HTTP root edit denial is focal without layout and includes actual sign-in link',async()=>{
 const env={DECKO_DB_URL:hrana.url,DECKO_DB_TOKEN:'owned-test',DECKO_LIVE_RENDER:'0',DECKO_EDGE_DECK_PROFILE:'stock'};
 const response=await handleBunnyEngineRequest(new Request('https://local.test/Home/edit',{headers:{'x-requested-with':'XMLHttpRequest'}}),env);
 expect(response.status).toBe(403);const body=await response.text();expect(body).toContain('Sorry!');expect(body).toMatch(/class="[^"]*signin-link/);expect(body).not.toContain('<html');
 const publicRead=await handleBunnyEngineRequest(new Request('https://local.test/Home/content',{headers:{'x-requested-with':'XMLHttpRequest'}}),env);
 expect(publicRead.status).toBe(200);expect(await publicRead.text()).not.toContain('class="denied"');
});
it('direct corpus-style bare render keeps quiet nested denial semantics',async()=>{const deck=await bootEdgeServingEngines(driver);expect(await deck.render.render('Home','edit',{focalRoot:true})).toContain('signin-link');expect(deck.render.pageErrorStatus).toBe(403);expect(await deck.render.render('Home','edit')).toContain('<span class="denied">');expect(deck.render.pageErrorStatus).toBeUndefined();});

it('batches actual anonymous XHR denial and preserves restricted read and public controls',async()=>{
 const env={DECKO_DB_URL:hrana.url,DECKO_DB_TOKEN:'owned-test',DECKO_LIVE_RENDER:'1',DECKO_EDGE_DECK_PROFILE:'stock'};
 const request=(path:string)=>handleBunnyEngineRequest(new Request('https://local.test'+path,{headers:{'x-requested-with':'XMLHttpRequest'}}),env);
 const before=(await driver.query('SELECT id,db_content FROM cards ORDER BY id',[])).rows;
 const start=hrana.requests.length;const edit=await request('/Home/edit');
 expect(edit.status).toBe(403);expect(await edit.text()).toContain('signin-link');
 expect(hrana.requests.length-start).toBeLessThan(40);
 const restricted=await request('/Mira_Member+*account/content');expect(restricted.status).toBe(403);
 const readable=await request('/Home/content');expect(readable.status).toBe(200);expect(await readable.text()).not.toContain('class="denied"');
 expect((await driver.query('SELECT id,db_content FROM cards ORDER BY id',[])).rows).toEqual(before);
});

it('anonymous full-page requested views keep normal-render bytes and permission outcomes',async()=>{
 const env={DECKO_DB_URL:hrana.url,DECKO_DB_TOKEN:'owned-test',DECKO_EDGE_DECK_PROFILE:'stock'};
 const rows=(await driver.query('SELECT id,db_content FROM cards ORDER BY id',[])).rows;
 for(const path of ['/Home/titled','/*signin/titled','/Mira_Member+*account/titled']){
  const normal=await handleBunnyEngineRequest(new Request('https://local.test'+path),{...env,DECKO_LIVE_RENDER:'0'});const expected=await normal.text();
  const start=hrana.requests.length;const live=await handleBunnyEngineRequest(new Request('https://local.test'+path),{...env,DECKO_LIVE_RENDER:'1'});const actual=await live.text();
  expect(live.status).toBe(normal.status);expect(normalizeSlotIds(actual)).toBe(normalizeSlotIds(expected));expect(hrana.requests.length-start).toBeLessThan(60);
  if(path.includes('signin')){expect(live.status).toBe(200);expect(actual).toContain('card[subcards][+*email][content]');expect(actual).toContain('card[subcards][+*password][content]');}
  if(path.includes('account'))expect(live.status).toBe(403);
 }
 expect((await driver.query('SELECT id,db_content FROM cards ORDER BY id',[])).rows).toEqual(rows);
},30000);

it('invalid, expired and revoked session cookies keep anonymous batched bytes and fresh read denials',async()=>{
 const env={DECKO_DB_URL:hrana.url,DECKO_DB_TOKEN:'owned-test',DECKO_EDGE_DECK_PROFILE:'stock',DECKO_LIVE_RENDER:'1'};
 const sessions=new SessionStore({driver});
 const expired=await sessions.createSession(611,{ttlSeconds:-10});
 const revoked=await sessions.createSession(611);expect(await sessions.revokeSession(revoked.token)).toBe(true);
 const valid=await sessions.createSession(611);
 const signedIn=await handleBunnyEngineRequest(new Request('https://local.test/Home/titled',{headers:{cookie:`decko_ts_session=${valid.token}`}}),env);
 expect(signedIn.status).toBe(200);expect(await signedIn.text()).toContain('signout-link');
 const rows=(await driver.query('SELECT * FROM cards ORDER BY id',[])).rows;
 for(const path of ['/Home/titled','/*signin/titled','/Mira_Member+*account/titled']){
  const expected=await handleBunnyEngineRequest(new Request('https://local.test'+path),env);const expectedBody=await expected.text();
  for(const token of ['owned-nonexistent-session',expired.token,revoked.token]){
   const start=hrana.requests.length;
   const result=await handleBunnyEngineRequest(new Request('https://local.test'+path,{headers:{cookie:`decko_ts_session=${token}`}}),env);
   const body=await result.text();expect(result.status).toBe(expected.status);expect(normalizeSlotIds(body)).toBe(normalizeSlotIds(expectedBody));
   expect(hrana.requests.length-start).toBeLessThan(80);expect(body).not.toContain('class="signout-link"');
   if(path.includes('account'))expect(result.status).toBe(403);
  }
 }
 expect((await driver.query('SELECT * FROM cards ORDER BY id',[])).rows).toEqual(rows);
},30000);

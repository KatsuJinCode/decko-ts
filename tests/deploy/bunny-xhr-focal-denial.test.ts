import {beforeAll,afterAll,it,expect} from 'vitest';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startMockHranaServer,type MockHranaServer} from '../server/drivers/mock-hrana-server.js';
import {BunnyDbDriver} from '../../src/card/drivers/bunny-db.js';
import {runAuthMigrations} from '../../src/card/auth/index.js';
import {ensureFreshnessStamp} from '../../src/server/freshness-stamp.js';
import {handleBunnyEngineRequest} from '../../deploy/bunny-worker-src/bunny-edge-engine-handler.js';
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

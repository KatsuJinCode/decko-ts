import {it,expect} from 'vitest';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {LocalSqliteDriver} from '../../../src/server/drivers/local-sqlite.js';
import {ensureFreshnessStamp} from '../../../src/server/freshness-stamp.js';
import {bootEdgeServingEngines} from '../../../deploy/bunny-worker-src/bunny-edge-deck-boot.js';
import {liveRenderView,withLiveRenderScope} from '../../../src/card/live/live-render.js';
import type {SQLDatabaseDriver} from '../../../src/server/driver.js';

it('rechecks real data/permission versions between scoped views and isolates viewer/request ownership',async()=>{
 const root=mkdtempSync(join(tmpdir(),'decko-live-scope-'));
 copyFileSync('reference-harness/fixtures/synthetic-v1/deck/deck.sqlite3',join(root,'deck.sqlite3'));
 const driver=new LocalSqliteDriver({path:join(root,'deck.sqlite3')});
 try{
  await ensureFreshnessStamp(driver);
  const home=(await driver.query<{id:number;read_rule_id:number}>('SELECT id,read_rule_id FROM cards WHERE name=?',['Home'])).rows[0];
  expect(home.read_rule_id).toBeGreaterThan(0);
  await driver.query('UPDATE cards SET db_content=? WHERE id=?',['scope-before',home.id]);
  const boot=async(d:SQLDatabaseDriver)=>{const engines=await bootEdgeServingEngines(d);engines.render.viewer={signedIn:false};return engines;};
  await withLiveRenderScope(async requestScope=>{
   const opts={requestScope,keepScope:'anonymous-owned-request',requestedView:'content',historyParams:{focalRoot:true}};
   const first=await liveRenderView(driver,'Home',boot,opts);
   expect(first.html).toContain('scope-before');
   const firstStats={...first.stats};
   const before=(await driver.query<{version:number}>('SELECT version FROM deck_data_version WHERE id=1',[])).rows[0].version;
   await driver.query('UPDATE cards SET db_content=? WHERE id=?',['scope-after',home.id]);
   expect((await driver.query<{version:number}>('SELECT version FROM deck_data_version WHERE id=1',[])).rows[0].version).toBeGreaterThan(before);
   const changed=await liveRenderView(driver,'Home',boot,opts);
   expect(changed.html).toContain('scope-after');expect(changed.html).not.toContain('scope-before');
   expect(first.stats).toEqual(firstStats);
   // Actual rule content and party references move, not a mocked version.
   await driver.query('UPDATE cards SET db_content=? WHERE id=?',['',home.read_rule_id]);
   await driver.query('DELETE FROM card_references WHERE referer_id=?',[home.read_rule_id]);
   const denied=await liveRenderView(driver,'Home',boot,opts);
   expect(denied.status).toBe(403);expect(denied.html).not.toContain('scope-after');
   await expect(liveRenderView(driver,'Home',boot,{...opts,keepScope:'another-viewer'})).rejects.toThrow(/viewer or request boundaries/);
  });
  await withLiveRenderScope(async requestScope=>{
   const denied=await liveRenderView(driver,'Home',boot,{requestScope,keepScope:'next-request',requestedView:'content',historyParams:{focalRoot:true}});
   expect(denied.status).toBe(403);expect(denied.html).not.toContain('scope-before');
  });
 }finally{driver.close();expect(dirname(root)).toBe(resolve(tmpdir()));expect(root.startsWith(join(resolve(tmpdir()),'decko-live-scope-'))).toBe(true);rmSync(root,{recursive:true,force:true});}
},30000);

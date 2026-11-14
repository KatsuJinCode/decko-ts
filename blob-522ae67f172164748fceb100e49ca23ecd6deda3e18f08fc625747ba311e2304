import {expect,it} from 'vitest';
import {ASSET_PREFIX,assets} from '../../vendor/decko-material-icons/assets.js';
import {resolveServedEnvironmentDeltas,servedBootOptionsFromEnv} from '../../deploy/bunny-worker-src/bunny-edge-served-deltas.js';
import {applyServedEnvironmentDeltas} from '../../deploy/bunny-worker-src/bunny-edge-page-shell.js';
import {REMOTE_STYLE_TAG} from '../../src/card/render/head-views.js';
import {bootEdgeServingEngines} from '../../deploy/bunny-worker-src/bunny-edge-deck-boot.js';
import {LocalSqliteDriver} from '../../src/server/drivers/local-sqlite.js';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureFreshnessStamp} from '../../src/server/freshness-stamp.js';
import {renderPageWithStatus} from '../../src/card/render/page.js';

it('keeps stock bytes by default and requires an explicit valid material-icons mode',()=>{
  expect(applyServedEnvironmentDeltas(REMOTE_STYLE_TAG,resolveServedEnvironmentDeltas({}))).toContain(REMOTE_STYLE_TAG);
  expect(servedBootOptionsFromEnv({DECKO_MATERIAL_ICONS:'local'})).toMatchObject({materialIconsAssetMode:'local'});
  expect(servedBootOptionsFromEnv({DECKO_MATERIAL_ICONS:'stock'})).not.toHaveProperty('materialIconsAssetMode');
  expect(()=>servedBootOptionsFromEnv({DECKO_MATERIAL_ICONS:'typo'})).toThrow();
});

it('rewrites actual stock stylesheet links while preserving comments and raw-text bodies',()=>{
  const url='https://fonts.googleapis.com/css2?family=Material+Icons';
  const tag=`<LINK media='all' href='${url}' rel=stylesheet data-note='preserved'>`;
  const untouched=[`<!-- ${tag} -->`,`<script>const x=${JSON.stringify(tag)};</script>`,`<style>x::before{content:${JSON.stringify(tag)}}</style>`,`<textarea>${tag}</textarea>`,`<link data-href='${url}'>`,`<link href='https://fonts.googleapis.com/css2?family=Roboto'>`];
  const deltas=resolveServedEnvironmentDeltas({DECKO_MATERIAL_ICONS:'local'});
  expect(applyServedEnvironmentDeltas(tag,deltas)).toContain(tag.replace(url,ASSET_PREFIX+'material-icons.css'));
  const protectedTag=tag.replace('media=', 'integrity="old-digest" media=');
  expect(applyServedEnvironmentDeltas(protectedTag,deltas)).toContain('integrity="sha256-'+Buffer.from(assets['material-icons.css']!.sha256,'hex').toString('base64')+'"');
  for(const html of untouched)expect(applyServedEnvironmentDeltas(html,deltas)).toContain(html);
});

it('boots and renders the actual request-local engine with its selected local stylesheet',async()=>{
  const scratch=mkdtempSync(join(tmpdir(),'decko-material-icons-')),db=join(scratch,'deck.sqlite3');
  copyFileSync('reference-harness/fixtures/synthetic-v1/deck/deck.sqlite3',db);
  const driver=new LocalSqliteDriver({path:db});
  try {
    await ensureFreshnessStamp(driver);
    const {render}=await bootEdgeServingEngines(driver,servedBootOptionsFromEnv({DECKO_MATERIAL_ICONS:'local'}));
    const page=await renderPageWithStatus(render,'Home');
    expect(page.status).toBe(200);
    expect(page.html).toContain(ASSET_PREFIX+'material-icons.css');
    expect(page.html).not.toContain('fonts.googleapis.com/css2?family=Material+Icons');
  }finally{driver.close();rmSync(scratch,{recursive:true,force:true})}
});

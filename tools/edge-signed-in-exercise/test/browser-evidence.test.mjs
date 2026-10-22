import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {cleanupCreatedCards} from '../lib/cleanup-created-cards.mjs';
import {browserAssetFailures, classifyBrowserAssetFailures, isHarnessRequestAbortEcho} from '../lib/harness-browser.mjs';

test('cleanup includes nameless junctions and preserves every baseline card',()=>{
 const db=new Database(':memory:');
 try{
  db.exec("CREATE TABLE cards(id INTEGER PRIMARY KEY,name TEXT,trash INTEGER);INSERT INTO cards VALUES(1,'Harness_preexisting',0),(2,'New Card',0),(3,NULL,0)");
  assert.deepEqual(cleanupCreatedCards(db,1),{removed:2,remaining:0,baseline:1});
  assert.equal(db.prepare('SELECT trash FROM cards WHERE id=1').get().trash,0);
  assert.equal(db.prepare('SELECT trash FROM cards WHERE id=3').get().trash,1);
  assert.throws(()=>cleanupCreatedCards(db,-1),/invalid journey card baseline/);
  assert.equal(db.prepare('SELECT trash FROM cards WHERE id=1').get().trash,0);
 }finally{db.close()}
});

test('a child image failure cannot hide behind a clean coordinator browser',()=>{
 const failures=browserAssetFailures([{blocked:[]},{blocked:[{url:'https://local.test/missing.png',resourceType:'image',status:404},{resourceType:'fetch',status:403}]}]);
 assert.equal(failures.length,1);assert.equal(failures[0].contextIndex,1);assert.equal(failures[0].status,404);
});

test('console evidence admits page errors and refuses the echo of the harness\'s own request aborts',()=>{
 assert.equal(isHarnessRequestAbortEcho('Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector'),true);
 assert.equal(isHarnessRequestAbortEcho('Failed to load resource: net::ERR_BLOCKED_BY_CLIENT'),true);
 assert.equal(isHarnessRequestAbortEcho("pageerror: Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/worker-json.js' failed to load."),false);
 assert.equal(isHarnessRequestAbortEcho('Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)'),false);
 assert.equal(isHarnessRequestAbortEcho('Uncaught TypeError: Cannot read properties of undefined (reading \'length\')'),false);
 assert.equal(isHarnessRequestAbortEcho(undefined),false);
});

// The final browser asset audit grades the DEPLOYMENT's own assets. The two
// observations below are the measured failures of the two whole-family runs
// that failed this leg, read off their own run records:
//   tranche-6: https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.7/skins/ui/oxide/content.min.css
//              -> failed:net::ERR_ABORTED (the browser cancelled it)
//   tranche-5: https://fonts.gstatic.com/s/materialicons/v145/flUhRq6tzZclQEJ-Vdg-IuiaDsNc.woff2
//              -> failed:net::ERR_CONNECTION_CLOSED
// Two different third-party hosts, two different transport failures, one
// verdict: the leg was measuring the public internet. Pure functions over
// recorded observations: this test performs NO network call of any kind.
const ASSET_HOST='culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com';
const AUDIT_CTX={origin:'https://127.0.0.1:62314',assetHosts:[ASSET_HOST]};

test('a third-party asset failure is reported beside the asset audit, not inside it',()=>{
 const failures=[
  {url:'https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.7/skins/ui/oxide/content.min.css',status:'failed:net::ERR_ABORTED',method:'GET',resourceType:'stylesheet',navigation:false,contextIndex:0},
  {url:'https://fonts.gstatic.com/s/materialicons/v145/flUhRq6tzZclQEJ-Vdg-IuiaDsNc.woff2',status:'failed:net::ERR_CONNECTION_CLOSED',method:'GET',resourceType:'font',navigation:false,contextIndex:0},
 ];
 const audit=classifyBrowserAssetFailures(failures,AUDIT_CTX);
 assert.equal(audit.deploymentFailures.length,0,'a third-party host is not the deployment');
 assert.equal(audit.otherFailures.length,2,'neither failure is hidden: both are reported by name');
 assert.equal(audit.byOutcome['navigation-abort'],1);
 assert.equal(audit.byOutcome['third-party-failure'],1);
});

test('a failed asset the deployment itself serves fails the asset audit',()=>{
 const failures=[{url:'https://'+ASSET_HOST+'/files/103/3649-small.jpg',status:404,method:'GET',resourceType:'image',navigation:false,contextIndex:0}];
 const audit=classifyBrowserAssetFailures(failures,AUDIT_CTX);
 assert.equal(audit.deploymentFailures.length,1);
 assert.equal(audit.deploymentFailures[0].outcome,'deployment-failure');
 assert.equal(audit.otherFailures.length,0);
});

test('a failed asset on the local origin fails the asset audit',()=>{
 const failures=[{url:'https://127.0.0.1:62314/mod/bootstrap/fontawesome-6.7.2/css/all.min.css',status:'failed:net::ERR_CONNECTION_REFUSED',method:'GET',resourceType:'stylesheet',navigation:false,contextIndex:0}];
 const audit=classifyBrowserAssetFailures(failures,AUDIT_CTX);
 assert.equal(audit.deploymentFailures.length,1);
 assert.equal(audit.deploymentFailures[0].outcome,'deployment-failure');
});

test('a clean run classifies nothing and passes',()=>{
 const audit=classifyBrowserAssetFailures([],AUDIT_CTX);
 assert.equal(audit.deploymentFailures.length,0);
 assert.equal(audit.otherFailures.length,0);
 assert.deepEqual(audit.byOutcome,{});
});

test('a socket-pool refusal by the operating system is reported beside the audit, not charged to the deployment',()=>{
 // Measured at the tranche-7 tip: one request of the 152 the run made for
 // /mod/tinymce_editor/plugins/code/plugin.min.js failed with
 // net::ERR_NO_BUFFER_SPACE - the operating system's socket pool refusing to
 // allocate a buffer. The engine served the same URL 151 times in that run.
 // No request was carried, so no asset was served and no asset was missed.
 const failures=[{url:'https://127.0.0.1:62314/mod/tinymce_editor/plugins/code/plugin.min.js',status:'failed:net::ERR_NO_BUFFER_SPACE',method:'GET',resourceType:'script',navigation:false,contextIndex:14}];
 const audit=classifyBrowserAssetFailures(failures,AUDIT_CTX);
 assert.equal(audit.deploymentFailures.length,0);
 assert.equal(audit.otherFailures.length,1,'the refusal is reported by name');
 assert.equal(audit.otherFailures[0].outcome,'host-resource-refusal');
 assert.equal(audit.byOutcome['host-resource-refusal'],1);
});

test('a refused connection on the local origin still fails the asset audit',()=>{
 // Nothing listening is the deployment's own failure, and it stays one.
 const failures=[{url:'https://127.0.0.1:62314/',status:'failed:net::ERR_CONNECTION_REFUSED',method:'GET',resourceType:'script',navigation:false,contextIndex:0}];
 const audit=classifyBrowserAssetFailures(failures,AUDIT_CTX);
 assert.equal(audit.deploymentFailures.length,1);
 assert.equal(audit.deploymentFailures[0].outcome,'deployment-failure');
});

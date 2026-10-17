import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {cleanupCreatedCards} from '../lib/cleanup-created-cards.mjs';
import {browserAssetFailures, isHarnessRequestAbortEcho} from '../lib/harness-browser.mjs';

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

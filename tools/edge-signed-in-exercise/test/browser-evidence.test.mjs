import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {cleanupCreatedCards} from '../lib/cleanup-created-cards.mjs';
import {browserAssetFailures} from '../lib/harness-browser.mjs';

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

import {test} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {snapshotDeck} from '../snapshot-deck.mjs';

test('online snapshot includes committed WAL data without changing the writer WAL',async()=>{
 const base=fileURLToPath(new URL('../../../tmp/',import.meta.url));mkdirSync(base,{recursive:true});
 const dir=mkdtempSync(resolve(base,'snapshot-test-')),source=resolve(dir,'active.sqlite3'),out=resolve(dir,'snapshot.sqlite3');
 const writer=new Database(source);
 try{
  writer.pragma('journal_mode=WAL');writer.pragma('wal_autocheckpoint=0');
  writer.exec("CREATE TABLE cards(id INTEGER PRIMARY KEY,name TEXT,trash INTEGER);INSERT INTO cards VALUES(1,'Committed WAL row',0)");
  const before=readFileSync(source+'-wal');assert.ok(before.length>0);
  const receipt=await snapshotDeck({source,out});
  assert.equal(receipt.cards,1);assert.equal(receipt.sourceOpenedReadonly,true);assert.equal(receipt.sourceCheckpointRequested,false);
  assert.deepEqual(readFileSync(source+'-wal'),before);
  assert.equal(writer.pragma('journal_mode',{simple:true}),'wal');
  const copy=new Database(out,{readonly:true});
  try{assert.equal(copy.prepare('SELECT name FROM cards WHERE id=1').get().name,'Committed WAL row');assert.equal(copy.pragma('journal_mode',{simple:true}),'delete')}finally{copy.close()}
  await assert.rejects(snapshotDeck({source,out}),/already exists/);
  await assert.rejects(snapshotDeck({source,out:source}),/separate new/);
  await assert.rejects(snapshotDeck({source,out:resolve(dir,'small.sqlite3'),maxBytes:1}),/size limit/);
  await assert.rejects(snapshotDeck({source:'T:/off-limits.sqlite3',out:resolve(dir,'denied.sqlite3')}),/explicit local C:/);
 }finally{writer.close();assert.ok(resolve(dir).startsWith(resolve(base)+sep));rmSync(dir,{recursive:true})}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import {storedSessionActorId,runForVerifiedActor} from '../lib/session-actor.mjs';

test('an identity-dependent operation requires the stored cookie actor and backend acceptance',async()=>{
 const db=new Database(':memory:');
 try{
  db.exec('CREATE TABLE auth_sessions(token_hash TEXT,account_card_id INTEGER)');
  db.prepare('INSERT INTO auth_sessions VALUES (?,?)').run(createHash('sha256').update('synthetic-token').digest('hex'),2);
  assert.equal(storedSessionActorId(db,[{name:'decko_ts_session',value:'synthetic-token'}]),2);
  assert.equal(storedSessionActorId(db,[]),null);
  assert.equal(storedSessionActorId(db,[{name:'decko_ts_session',value:'unknown'}]),null);
  let operations=0;
  const perform=()=>++operations;
  await assert.rejects(runForVerifiedActor(undefined,2,perform),/not verified/);
  await assert.rejects(runForVerifiedActor({hasSessionCookie:true,landing:{signedIn:true},storedActorId:1},2,perform),/not verified/);
  await assert.rejects(runForVerifiedActor({hasSessionCookie:true,landing:{signedIn:false},storedActorId:2},2,perform),/not verified/);
  assert.equal(operations,0);
  await runForVerifiedActor({hasSessionCookie:true,landing:{signedIn:true},storedActorId:2},2,perform);
  assert.equal(operations,1);
 }finally{db.close()}
});

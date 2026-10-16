import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runCoverBChecks} from '../checks-cover-b.mjs';

const base=()=>({page:{},stack:{origin:'https://127.0.0.1:1'},creds:{admin:{},member:{}},record:()=>{},group:()=>{},created:[],signIn:async()=>{},fixtureState:{fatalReason:null}});

test('one capability diagnostic never executes the other cover-b attempts',async()=>{
 const attempted=[];
 await runCoverBChecks({...base(),coverBCase:'S2',visit:async()=>{throw Error('selected sentinel')},attempt:async(name,fn)=>{attempted.push(name);try{await fn()}catch{}}});
 assert.equal(attempted.length,1);assert.match(attempted[0],/^S2 /);
});

test('timed-out cover-b exits before a successor can use its fixture',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const context=base(),attempted=[],visits=[];
 const run=runCoverBChecks({...context,visit:async path=>{visits.push(path);return new Promise(()=>{})},attempt:async(name,fn)=>{attempted.push(name);try{await fn()}catch{}}});
 const rejected=assert.rejects(run,/cover-b aborts the rest/);
 await Promise.resolve();await Promise.resolve();
 t.mock.timers.tick(240001);
 await rejected;
 assert.equal(attempted.length,1);assert.deepEqual(visits,['/_signout']);assert.match(context.fixtureState.fatalReason,/did not settle/);
});

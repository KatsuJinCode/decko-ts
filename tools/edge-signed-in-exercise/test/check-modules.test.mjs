import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
import {loadCheckModules,runCheckModules} from '../lib/check-modules.mjs';
import {verifiedCapabilities} from '../lib/local-policy.mjs';
import {checks as permissionChecks,capabilityChecks} from '../checks-permissions.mjs';
import {checks as navboxChecks,capabilityChecks as navboxCapabilityChecks} from '../checks-navbox.mjs';
import {checks as mailChecks,capabilityChecks as mailCapabilityChecks,meta as mailMeta} from '../checks-mail-reset.mjs';

test('module loader refuses ambiguous topics',async()=>{
 const base=fileURLToPath(new URL('../../../tmp/',import.meta.url));mkdirSync(base,{recursive:true});
 const dir=mkdtempSync(resolve(base,'check-modules-'));
 try{
  for(const name of ['a','b'])writeFileSync(resolve(dir,'checks-'+name+'.mjs'),"export const meta={topic:'same'};export const checks=[{name:'probe',run:async()=>{}}];");
  await assert.rejects(loadCheckModules(dir),/duplicate topic/);
 }finally{
  assert.ok(resolve(dir).startsWith(resolve(base)+sep));rmSync(dir,{recursive:true});
 }
});

test('topic selection runs only the selected checks and records actual modules',async()=>{
 const called=[];
 const modules=[{file:'checks-a.mjs',meta:{topic:'a'},checks:[{name:'A',run:async()=>called.push('A')}]},{file:'checks-b.mjs',meta:{topic:'b'},checks:[{name:'B',run:async()=>called.push('B')}]}];
 const ran=await runCheckModules(modules,{group:()=>{},attempt:async(_,f)=>f()},'b');
 assert.deepEqual(called,['B']);assert.deepEqual(ran.map(r=>r.topic),['b']);
});

test('a poisoned fixture cannot continue into a successor check',async()=>{
 const called=[],fixtureState={fatalReason:null};
 const modules=[{file:'checks-state.mjs',meta:{topic:'state'},checks:[
  {name:'first',run:async()=>{called.push('first');fixtureState.fatalReason='credential restore failed';throw Error('save failed')}},
  {name:'successor',run:async()=>called.push('successor')},
 ]}];
 await assert.rejects(runCheckModules(modules,{fixtureState,group:()=>{},attempt:async(_,f)=>{try{await f()}catch{}}}),/fixture quarantined/);
 assert.deepEqual(called,['first']);
});

test('permission coverage requires positive controls and every repeated actor result',()=>{
 const document=JSON.parse(readFileSync(new URL('../capabilities.json',import.meta.url)));
 for(const id of ['P1','P3']){
  const capability=document.capabilities.find(c=>c.id===id);
  assert.deepEqual(capability.checks,capabilityChecks[id]);
  const results=capability.checks.map(check=>({check,pass:true}));
  assert.equal(verifiedCapabilities([capability],results)[0].status,'covered');
  assert.notEqual(verifiedCapabilities([capability],results.slice(1))[0].status,'covered');
  assert.notEqual(verifiedCapabilities([capability],[...results,{check:results[0].check,pass:false}])[0].status,'covered');
 }
});

test('permission fixtures refuse a live destination before browser or mutation',async()=>{
 let launched=false;
 await assert.rejects(permissionChecks[0].run({stack:{origin:'https://culturesmith-edge.bunny.run'},launchBrowser:async()=>{launched=true}}),/disposable loopback deck/);
 assert.equal(launched,false);
});

test('navbox fixture cannot write to a live destination or receive coverage from endpoint-only checks',async()=>{
 let signedIn=false;
 await assert.rejects(navboxChecks[0].run({stack:{origin:'https://culturesmith-edge.bunny.run'},signIn:async()=>{signedIn=true}}),/disposable loopback deck/);
 assert.equal(signedIn,false);
 const document=JSON.parse(readFileSync(new URL('../capabilities.json',import.meta.url)));
 const capability=document.capabilities.find(c=>c.id==='N1');
 assert.deepEqual(capability.checks,navboxCapabilityChecks);
 assert.notEqual(verifiedCapabilities([capability],[{check:"keyword search endpoint returns the run's card",pass:true}])[0].status,'covered');
});

test('mail journey requires capture and cannot credit an unrestored credential fixture',async()=>{
 assert.equal(mailMeta.requiresMail,true);
 await assert.rejects(mailChecks[0].run({stack:{origin:'https://culturesmith-edge.bunny.run'}}),/disposable loopback deck/);
 const document=JSON.parse(readFileSync(new URL('../capabilities.json',import.meta.url)));
 const capability=document.capabilities.find(c=>c.id==='A5');
 assert.deepEqual(capability.checks,mailCapabilityChecks);
 assert.equal(verifiedCapabilities([capability],mailCapabilityChecks.map(check=>({check,pass:true})))[0].status,'covered');
 const unRestored=mailCapabilityChecks.slice(0,-1).map(check=>({check,pass:true}));
 assert.notEqual(verifiedCapabilities([capability],unRestored)[0].status,'covered');
});

test('permission module closes its first isolated session if the second cannot open',async()=>{
 let launched=0,closed=0;
 await assert.rejects(permissionChecks[0].run({stack:{origin:'https://127.0.0.1:1'},captureEvidence:()=>{},launchBrowser:async()=>{
  if(++launched===2)throw Error('second context failed');
  return{close:async()=>{closed++}};
 }}),/second context failed/);
 assert.equal(closed,1);
});

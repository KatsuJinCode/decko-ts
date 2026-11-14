import {before,after,test} from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadEngine,startEngine} from '../lib/engines.mjs';
const repo=fileURLToPath(new URL('../../..',import.meta.url));let engine;
before(async()=>{engine=await startEngine(loadEngine(path.join(repo,'reference-harness/browser/engines/ts.json')),path.join(repo,'reference-harness/fixtures/synthetic-v1'),{logFile:path.join(repo,'.runtime/card-json-mark-test.log')})});
after(async()=>{await engine?.stop()});
test('missing numeric and codename JSON marks answer404 rather than a server failure',async()=>{
 for(const mark of ['~999999999',':definitely_missing_code']){const response=await fetch(engine.base+'/'+mark+'.json');assert.equal(response.status,404,'missing '+mark+' must be a not-found response');const body=await response.json();assert.equal(body.error,'card not found');}
});
test('the existing raw JSON exporter and malformed-mark refusal remain intact',async()=>{
 const known=await fetch(engine.base+'/Brief.json');assert.equal(known.status,200);assert.equal(typeof(await known.json()).db_content,'string');
 const named=await fetch(engine.base+'/NoSuchCardForJsonRead.json');assert.equal(named.status,404);
 const malformed=await fetch(engine.base+'/%ZZ.json');assert.equal(malformed.status,400);
});

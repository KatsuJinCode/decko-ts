import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditBindings,runtimeHarnessFiles} from '../check-bindings.mjs';

const repo=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
test('binding gate accepts explicit context/Node/DOM names and refuses unbound runtime names',()=>{
  const parent=path.join(repo,'tmp');fs.mkdirSync(parent,{recursive:true});
  const dir=fs.mkdtempSync(path.join(parent,'binding-control-'));
  try{
    const valid=path.join(dir,'valid.mjs'),bad=path.join(dir,'bad.mjs');
    fs.writeFileSync(valid,"export function run(ctx){const {database,page}=ctx;process.stdout.write(Buffer.from('x'));return page.evaluate(()=>document.title)+database();}");
    fs.writeFileSync(bad,'export function run(ctx){return database()+page.title+unboundWitness;}');
    assert.equal(auditBindings([valid]).pass,true);
    const refusal=auditBindings([bad]);assert.equal(refusal.pass,false);
    for(const name of ['database','page','unboundWitness'])assert.ok(refusal.issues.some(issue=>issue.includes("'"+name+"'")),name+' must be refused');
    const missing=auditBindings([path.join(dir,'missing.mjs')]);assert.equal(missing.pass,false);assert.ok(missing.fatal.length>0);
  }finally{
    if(path.dirname(dir)!==parent||!path.basename(dir).startsWith('binding-control-'))throw Error('Unsafe control cleanup');
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
test('all runtime edge checks have bound lexical names',()=>{
  const result=auditBindings(runtimeHarnessFiles());assert.equal(result.pass,true,JSON.stringify(result,null,2));
});

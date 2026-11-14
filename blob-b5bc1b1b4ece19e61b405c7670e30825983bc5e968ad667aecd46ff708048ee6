import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceCustody} from '../lib/source-custody.mjs';

test('clean source admits; operational marker is recorded by exact bytes',()=>{
  const dir=mkdtempSync(join(tmpdir(),'custody-proof-'));
  try{
    assert.deepEqual(sourceCustody(dir,''),{dirty:false,sourceFilesClean:true,worktreeHasOperationalMarker:false,operationalFiles:[]});
    writeFileSync(join(dir,'.keep-root'),'shared provider');
    const receipt=sourceCustody(dir,'?? .keep-root\r\n');
    assert.equal(receipt.worktreeHasOperationalMarker,true);
    assert.equal(receipt.dirty,true);
    assert.equal(receipt.sourceFilesClean,true);
    assert.equal(receipt.operationalFiles[0].bytes,15);
    assert.match(receipt.operationalFiles[0].sha256,/^[a-f0-9]{64}$/);
    for(const status of [' M src/card/render.ts','?? new-source.mjs','?? .keep-root\n M src/card/render.ts','?? .keep-root-extra',' A .keep-root']){
      assert.throws(()=>sourceCustody(dir,status),/coherent source/);
    }
  }finally{rmSync(dir,{recursive:true})}
});
test('missing, directory or oversized provider marker refuses',()=>{
  const dir=mkdtempSync(join(tmpdir(),'custody-invalid-'));
  try{
    assert.throws(()=>sourceCustody(dir,'?? .keep-root'));
    mkdirSync(join(dir,'.keep-root'));
    assert.throws(()=>sourceCustody(dir,'?? .keep-root'),/invalid operational/);
    rmSync(join(dir,'.keep-root'),{recursive:true});
    writeFileSync(join(dir,'.keep-root'),'x'.repeat(4097));
    assert.throws(()=>sourceCustody(dir,'?? .keep-root'),/invalid operational/);
  }finally{rmSync(dir,{recursive:true})}
});

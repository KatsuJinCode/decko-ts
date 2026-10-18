import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {assertOperationalCaptureOutput} from '../../tools/edge-signed-in-exercise/lib/capture-output.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url));
for(const folder of ['.runtime','tmp'])test('allows ignored active output under '+folder,()=>{
 const path=resolve(repo,folder,'capture-output-control/report.md');
 assert.equal(assertOperationalCaptureOutput(repo,path),path);assert.equal(existsSync(path),false);
});
for(const folder of ['docs/runs','src','node_modules','.runtime/../docs/runs'])test('rejects active output under '+folder,()=>{
 assert.throws(()=>assertOperationalCaptureOutput(repo,resolve(repo,folder,'capture-output-control.md')),/active capture outputs must use/);
});
test('allows an external evidence destination with a source-root-like prefix',()=>{
 const path=resolve(repo.slice(0,-1)+'-capture-evidence','report.md');
 assert.equal(assertOperationalCaptureOutput(repo,path),path);
});
test('actual CLI refuses tracked output before source capture or any artifact write',()=>{
 const output=resolve(repo,'docs/runs/capture-output-guard-control.md');
 assert.equal(existsSync(output),false);
 const result=spawnSync(process.execPath,['tools/edge-signed-in-exercise.mjs','--out',output],{cwd:repo,encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(result.status,1);assert.match(result.stderr,/active capture outputs must use/);
 for(const suffix of ['', '.json','.intent.json','.memory.jsonl','.raw'])assert.equal(existsSync(output+suffix),false);
});

if(process.platform==='win32'){
 test('handles checkout path case without walking past the root',()=>{
  const path=resolve(repo.toUpperCase(),'.runtime/capture-output-control/report.md');
  assert.equal(assertOperationalCaptureOutput(repo,path),path);
 });
 test('classifies a different drive as outside without accessing it',()=>{
  const path='D:\\capture-output-control\\report.md';
  assert.equal(assertOperationalCaptureOutput(repo,path),resolve(path));
 });
}

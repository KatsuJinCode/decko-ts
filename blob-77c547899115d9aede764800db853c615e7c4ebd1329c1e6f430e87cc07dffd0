import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startLocalHrana} from '../lib/local-hrana.mjs';

test('the actual local pipeline executes CQL REGEXP and reports invalid patterns',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'local-regexp-proof-'));
 let host;
 try{
  host=await startLocalHrana({dbPath:join(dir,'deck.sqlite3')});
  const query=async sql=>{
   const response=await fetch(host.url+'/v2/pipeline',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({requests:[{type:'execute',stmt:{sql,args:[]}},{type:'close'}]})});
   assert.equal(response.status,200);return (await response.json()).results[0];
  };
  const matching=await query("SELECT 'Alpha' REGEXP '^alpha$' AS matched, 'Beta' REGEXP '^alpha$' AS missed");
  assert.equal(matching.type,'ok');
  assert.deepEqual(matching.response.result.rows[0].map(cell=>Number(cell.value)),[1,0]);
  const invalid=await query("SELECT 'Alpha' REGEXP '[[' AS invalid");
  assert.equal(invalid.type,'error');
 }finally{await host?.close();rmSync(dir,{recursive:true})}
});

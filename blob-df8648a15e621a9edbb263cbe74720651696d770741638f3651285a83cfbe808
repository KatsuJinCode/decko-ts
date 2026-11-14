import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {walkJourney,launchWalkBrowser} from '../lib/walker.mjs';

test('stored step traces and errors redact credentials across success, failure and skipped paths',async()=>{
 const server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<html><body><input name="display_title"><input id="opaque" name="password" type="password"><input name="credential" type="password"></body></html>')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const root=mkdtempSync(path.join(tmpdir(),'decko-walk-trace-redaction-'));
 const secrets=['first-live-looking-password-81#','typed-secret-92#','editor-secret-73#','skipped-password-64#','skipped-editor-55#','unresolved-secret-46#'];
 const journey={id:'trace-control',steps:[{visit:'/'},{fill:{name:'display_title'},value:'ordinary title preserved'},{fill:{css:'#opaque'},value:secrets[0]},{type:{name:'password'},value:secrets[1]},{editor:'credential',value:secrets[2]},{assert:{css:'#opaque',value:secrets[0]}},{fill:{field:'*password'},value:secrets[3]},{editor:'credential',value:secrets[4]},{fill:{css:'#missing-after-failure'},value:secrets[5]},{fill:{name:'display_title'},value:'ordinary skipped title preserved'}]};
 try{const result=await walkJourney({base:'http://127.0.0.1:'+server.address().port,journey,actors:{},outDir:root,side:'a',label:'local trace control',browserFactory:()=>launchWalkBrowser({allowedHostnames:['127.0.0.1'],offline:true})});
  assert.equal(result.completed,false,'the deliberate mismatch must remain failed');assert.deepEqual(result.steps.map(s=>s.outcome),['ok','ok','ok','ok','ok','failed','skipped','skipped','skipped','skipped']);
  const serialized=JSON.stringify(result);for(const secret of secrets)assert.equal(serialized.includes(secret),false,'credential leaked into stored trace/error');
  assert.equal(result.steps[1].step.value,'ordinary title preserved');assert.equal(result.steps[9].step.value,'ordinary skipped title preserved');assert.match(result.steps[5].error,/field value differs/);
  assert.equal(journey.steps[2].value,secrets[0],'execution input must not be overwritten by storage redaction');
 }finally{await new Promise(resolve=>server.close(resolve));if(path.dirname(root)!==path.resolve(tmpdir())||!path.basename(root).startsWith('decko-walk-trace-redaction-'))throw Error('Unsafe test cleanup');rmSync(root,{recursive:true,force:true});}
});

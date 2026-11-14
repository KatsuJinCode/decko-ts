import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';
import {affordanceTargetProbes} from '../lib/exhaustive-affordance-targets.mjs';import {launchBrowser} from '../lib/launch.mjs';

test('required-leg recording terminates and retains a missing affordance as a required failure',async()=>{
 const sequence=await affordanceTargetProbes({text:'History board tab',base:'http://127.0.0.1:1',goto:async()=>{},settle:async()=>{},countSelector:async()=>0});
 const required=sequence.filter(entry=>entry.required===true);assert.ok(required.length>0);assert.ok(required.every(entry=>entry.count===0&&entry.case==='case 1 board tabs'),'missing History affordances must remain required failures');
});

async function control(options,check){
 const writes=[],server=createServer(async(req,res)=>{const url=new URL(req.url,'http://local');
  if(req.method==='POST'){let body='';for await(const part of req)body+=part;writes.push({path:url.pathname,entries:[...new URLSearchParams(body)]});const own=url.pathname==='/update/Brief'||options.boundId&&url.pathname==='/update/~1743';res.writeHead(own?(options.saveStatus??303):404,options.saveStatus===200?{}:{location:'/Brief'});res.end();return;}
  if(url.pathname==='/Brief.json'){res.setHeader('content-type','application/json');res.end(JSON.stringify({id:options.boundId?1743:99,name:'Brief',content:'rendered content, never a write source'}));return;}
  if(url.pathname==='/~1743.json'){res.writeHead(options.literalExists?200:404,{'content-type':'application/json'});res.end(JSON.stringify(options.literalExists?{id:1743,name:'Another owner'}:{error:'not found'}));return;}
  res.setHeader('content-type','text/html');res.end('<html><body><form class="card-form" action="/update/Navbar"><input name="card[content]" value="WRONG NAVBAR VALUE"></form><main id="main"><form class="card-form" method="post" action="'+(options.foreignForm?'/update/Other':'/update/Brief')+'"><input type="hidden" name="authenticity_token" value="fixture-csrf-token"><input type="hidden" name="card[last_action_id_before_edit]" value="7"><textarea name="card[subcards][+description][content]">&lt;p&gt;{{Raw_source}}&lt;/p&gt;</textarea><input type="hidden" name="card[subcards][+choices][content][]" value="alpha"><input type="hidden" name="card[subcards][+choices][content][]" value="beta"><button type="submit">Save</button></form></main></body></html>');
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,browser=await launchBrowser(),page=await browser.context.newPage();
 try {
  const run=()=>affordanceTargetProbes({text:"row 4: POST /update/~1743 (owner's save) succeeds, not 500",base,page,pageRequest:page.context().request,goto:p=>page.goto(base+p,{waitUntil:'load'}),settle:async()=>{},countSelector:s=>page.locator(s).count(),evaluate:(fn,arg)=>page.evaluate(fn,arg),writeGate:options.writeGate??null});
  await check({run,writes});
 } finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}

test('replays the actual owner form, preserving raw nested fields, repeated values, CSRF and revision',async()=>control({},async({run,writes})=>{
 const sequence=await run();assert.equal(sequence.filter(s=>s.required&&s.count===0).length,0);assert.equal(writes.length,2);
 const params=new URLSearchParams(writes[0].entries);assert.equal(writes[0].path,'/update/Brief');assert.equal(params.get('card[content]'),null);assert.equal(params.get('card[subcards][+description][content]'),'<p>{{Raw_source}}</p>');assert.deepEqual(params.getAll('card[subcards][+choices][content][]'),['alpha','beta']);assert.equal(params.get('authenticity_token'),'fixture-csrf-token');assert.equal(params.get('card[last_action_id_before_edit]'),'7');
 assert.equal(writes[1].path,'/update/~1743');assert.equal(writes[1].entries.some(([key])=>key.startsWith('card[')),false,'never reuse an owner form against an unrelated ID');
}));

test('refuses an edit form targeting another card before posting',async()=>control({foreignForm:true},async({run,writes})=>{await assert.rejects(run(),/form|target/i);assert.equal(writes.length,0)}));
test('does not post to an existing unrelated literal ID',async()=>control({literalExists:true},async({run,writes})=>{const sequence=await run();assert.equal(writes.some(w=>w.path==='/update/~1743'),false);assert.ok(sequence.some(s=>s.required&&s.count===0),'the unexercised negative control must not receive a pass')}));
test('read-only mode skips the whole write probe',async()=>control({writeGate:{profile:{mode:'read-only'}}},async({run,writes})=>{const sequence=await run();assert.ok(sequence.some(s=>s.interaction==='write-skipped'));assert.equal(writes.length,0)}));
test('an HTTP200 without the promised redirect is not credited as a successful save',async()=>control({saveStatus:200},async({run,writes})=>{const sequence=await run();assert.ok(sequence.some(s=>s.required&&s.count===0));assert.equal(writes.length,1)}));
test('the literal ID can replay a fresh form when identity proves it is the same owner card',async()=>control({boundId:true},async({run,writes})=>{const sequence=await run();assert.equal(sequence.some(s=>s.required&&s.count===0),false);assert.deepEqual(writes.map(w=>w.path),['/update/Brief','/update/~1743']);assert.equal(new URLSearchParams(writes[1].entries).get('authenticity_token'),'fixture-csrf-token')}));

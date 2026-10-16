export const meta={topic:'conflict',capabilityIds:['E18']};
export const capabilityChecks=[
 'conflict journey signs in both isolated browser actors',
 'both editors hold the same actual revision',
 'member saves the first edit through the visible form',
 'stale admin form receives conflict without overwriting or creating history',
 'conflict response refreshes the visible forms revision',
 'retry through the same form persists after a fresh browser read',
];

export const checks=[{name:'two browser editors resolve a real stale-save conflict',run:async ctx=>{
 const {stack,creds,database,record,created,captureEvidence,fixtureState}=ctx;
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(stack.origin).hostname))throw Error('conflict requires the disposable loopback fixture');
 const name='HarnessConflict_'+Date.now().toString(36),first='MEMBER_FIRST_'+name,last='ADMIN_RETRY_'+name;
 let admin,member;
 try{
  admin=await ctx.launchBrowser({origin:stack.origin,assetHosts:ctx.assetHosts});
  member=await ctx.launchBrowser({origin:stack.origin,assetHosts:ctx.assetHosts});
  const pages={admin:admin.page,member:member.page};
  let bothSignedIn=true;
  for(const actor of ['admin','member']){
   const p=pages[actor];await p.goto(stack.origin+'/*signin',{waitUntil:'load'});
   const form=p.locator('form.card-form').filter({has:p.locator('input[type="password"]')}).first();
   await form.locator('input[name="card[subcards][+*email][content]"]').fill(creds[actor].email);
   await form.locator('input[type="password"]').fill(creds[actor].password);
   const pending=p.waitForResponse(r=>new URL(r.url()).pathname==='/update/*signin'&&r.request().method()==='POST',{timeout:20000});
   await form.locator('button[type="submit"]').first().click();
   const response=await pending;await response.finished();
   bothSignedIn&&=response.status()<400&&(await p.context().cookies(stack.origin)).some(c=>c.name==='decko_ts_session'&&c.value);
  }
  record(capabilityChecks[0],bothSignedIn,{});if(!bothSignedIn)throw Error('conflict actors were not signed in');
  created.push(name);
  const seeded=await admin.page.context().request.post(stack.origin+'/card/create',{headers:{origin:stack.origin,'Content-Type':'application/x-www-form-urlencoded'},data:new URLSearchParams({'card[name]':name,'card[type]':'Phrase','card[content]':'BEFORE_'+name,'success[redirect]':'true'}).toString(),maxRedirects:0});
  if(seeded.status()>=400)throw Error('conflict fixture create refused: '+seeded.status());
  const row=()=>database().prepare('SELECT id,db_content FROM cards WHERE name=? AND trash=0').get(name);
  const cardId=row()?.id;if(!cardId)throw Error('conflict fixture is absent');
  const history=()=>database().prepare('SELECT id FROM card_actions WHERE card_id=? ORDER BY id').all(cardId).map(r=>r.id);
  const editors={};
  for(const actor of ['admin','member']){
   const p=pages[actor];await p.goto(stack.origin+'/'+name+'?view=edit',{waitUntil:'load'});
   const form=p.locator('form.card-form').filter({has:p.locator('[name="card[content]"]:visible')}).first();
   const field=form.locator('[name="card[content]"]:visible');await field.waitFor({state:'visible',timeout:20000});
   const revision=await form.locator('[name="card[last_action_id_before_edit]"]').inputValue();
   const action=new URL(await form.getAttribute('action'),stack.origin);
   if(action.origin!==stack.origin)throw Error('foreign conflict form action');
   editors[actor]={p,form,field,revision,action};
  }
  const same=editors.admin.revision!==''&&editors.admin.revision===editors.member.revision;
  record(capabilityChecks[1],same,{adminRevision:editors.admin.revision,memberRevision:editors.member.revision});
  if(!same)throw Error('conflict fixture revisions did not match');
  const submit=async editor=>{
   const pending=editor.p.waitForResponse(r=>new URL(r.url()).origin===stack.origin&&new URL(r.url()).pathname===editor.action.pathname&&r.request().method()==='POST',{timeout:20000}).then(response=>({response}),error=>({error}));
   await editor.form.locator('button[type="submit"],input[type="submit"]').first().click();
   const result=await pending;if(result.error)throw result.error;await result.response.finished();return result.response;
  };
  await editors.member.field.fill(first);const saved=await submit(editors.member);
  record(capabilityChecks[2],saved.status()<400&&row()?.db_content===first,{status:saved.status(),stored:row()?.db_content===first});
  const beforeHistory=history();
  await editors.admin.field.fill(last);const rejected=await submit(editors.admin);
  const html=await rejected.text(),afterHistory=history();
  record(capabilityChecks[3],rejected.status()===409&&html.includes('new-current-revision-id')&&row()?.db_content===first&&JSON.stringify(beforeHistory)===JSON.stringify(afterHistory),{status:rejected.status(),unchanged:row()?.db_content===first,historyUnchanged:JSON.stringify(beforeHistory)===JSON.stringify(afterHistory),raw:captureEvidence(html,{check:'actual-browser-conflict',name})});
  const current=String(afterHistory.at(-1));
  const refreshed=await admin.page.waitForFunction(({name,current})=>{const form=[...document.querySelectorAll('form.card-form')].find(f=>f.action.includes(name));return form?.querySelector('[name="card[last_action_id_before_edit]"]')?.value===current&&/Conflict!/i.test(form.innerText)},{name,current},{timeout:15000}).then(()=>true,()=>false);
  const ui=await admin.page.evaluate(()=>({revisions:[...document.querySelectorAll('form.card-form')].map(f=>({action:f.action,revision:f.querySelector('[name="card[last_action_id_before_edit]"]')?.value,text:f.innerText.slice(-900),slot:window.jQuery?.(f).slot?.()?.map((_,s)=>({tag:s.tagName,id:s.id,revision:window.jQuery(s).find('.current_revision_id').val(),newRevision:window.jQuery(s).find('.new-current-revision-id').text()})).get()})),spans:[...document.querySelectorAll('.new-current-revision-id')].map(e=>e.textContent),notices:[...document.querySelectorAll('.card-notice')].map(e=>e.innerText),errorHandler:String(window.jQuery?.fn.showErrorResponse).slice(0,2500)}));
  record(capabilityChecks[4],refreshed,{current,refreshed,ui,raw:captureEvidence(await admin.page.content(),{check:'conflict-visible-revision',name})});
  if(!refreshed)throw Error('conflict UI did not refresh its revision');
  const retried=await submit(editors.admin);
  const fresh=await admin.page.goto(stack.origin+'/'+name+'?harness_verify='+Date.now(),{waitUntil:'load'});
  const finalHtml=await admin.page.content();
  record(capabilityChecks[5],retried.status()<400&&row()?.db_content===last&&fresh.status()===200&&finalHtml.includes(last),{retryStatus:retried.status(),freshStatus:fresh.status(),stored:row()?.db_content===last,raw:captureEvidence(finalHtml,{check:'conflict-retry-fresh',name})});
 }catch(error){if(error?.name==='TimeoutError')fixtureState.fatalReason='conflict browser operation timed out';throw error}
 finally{await member?.close().catch(()=>{});await admin?.close().catch(()=>{})}
}}];

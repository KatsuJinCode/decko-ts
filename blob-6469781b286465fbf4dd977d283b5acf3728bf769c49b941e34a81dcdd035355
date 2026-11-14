export const meta={topic:'permissions',capabilityIds:['P1','P3']};
export const capabilityChecks={
 P1:['P1 admin can read restricted card','P1 member cannot read restricted card','P1 member can read after grant','P1 member loses access after warm revocation'],
 P3:['P3 admin update positive control','P3 member can read update-restricted card','P3 member cannot open its editor','P3 member cannot update through browser request'],
};

export const checks=[{name:'real-browser permission boundaries and warm revocation',only:'permissions',run:async ctx=>{
 const {stack,creds,record,database,created,launchBrowser,captureEvidence}=ctx;
 const origin=new URL(stack.origin);
 if(!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw Error('permission fixtures require the disposable loopback deck');
 if(typeof captureEvidence!=='function')throw Error('permission checks require raw HTML capture');
 const stamp=Date.now().toString(36),readName='HarnessPolicyRead_'+stamp,writeName='HarnessPolicyUpdate_'+stamp;
 const secret='PRIVATE_READ_'+stamp,unchanged='UNCHANGED_UPDATE_'+stamp;
 let admin,member;
 try{
  admin=await launchBrowser({origin:stack.origin,assetHosts:ctx.assetHosts});
  member=await launchBrowser({origin:stack.origin,assetHosts:ctx.assetHosts});
  const pages={admin:admin.page,member:member.page};
  for(const actor of ['admin','member']){
   const page=pages[actor];await page.goto(stack.origin+'/*signin',{waitUntil:'load'});
   await page.fill('input[name="card[subcards][+*email][content]"]',creds[actor].email);
   await page.fill('input[name="card[subcards][+*password][content]"]',creds[actor].password);
   const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/update/*signin'&&r.request().method()==='POST',{timeout:20000}).then(response=>({response}),error=>({error}));
   await page.locator('form[action="/update/*signin"] button[type="submit"]').first().click();
   const observed=await pending;if(observed.error)throw observed.error;
   const response=observed.response;await response.finished();
   const signedIn=(await page.context().cookies(stack.origin)).some(c=>c.name==='decko_ts_session'&&c.value);
   record('permission browser signs in '+actor,response.status()<400&&signedIn,{actor,status:response.status(),signedIn});
   if(!signedIn)throw Error('permission browser session absent');
  }
  const post=async(path,fields)=>admin.page.context().request.post(stack.origin+path,{headers:{origin:stack.origin,'Content-Type':'application/x-www-form-urlencoded'},data:new URLSearchParams(fields).toString(),maxRedirects:0});
  const readRule=readName+'+*self+*read',updateRule=writeName+'+*self+*update';
  // Local HTTP fixture setup; the assertions below use the real browser.
  for(const [name,content,type] of [[readName,secret,'Basic'],[writeName,unchanged,'Basic'],[readRule,'[[Administrator]]','Phrase'],[updateRule,'[[Administrator]]','Phrase']]){
   created.push(name);
   const response=await post('/card/create',{'card[name]':name,'card[type]':type,'card[content]':content,'success[redirect]':'true'});
   if(response.status()>=400)throw Error('permission fixture create refused: '+name);
  }
  const rules=database().prepare("SELECT c.id,refs.referee_id FROM cards c JOIN cards rule_set ON rule_set.id=c.left_id JOIN cards target ON target.id=rule_set.left_id JOIN cards setting ON setting.id=c.right_id JOIN card_references refs ON refs.referer_id=c.id WHERE target.name IN (?,?) AND rule_set.right_id=(SELECT id FROM cards WHERE codename='self' AND trash=0 ORDER BY id LIMIT 1) AND setting.codename IN ('read','update') AND c.trash=0").all(readName,writeName);
  const administratorId=database().prepare("SELECT id FROM cards WHERE codename='administrator' AND trash=0 ORDER BY id LIMIT 1").get()?.id;
  const referencesValid=rules.length===2&&administratorId!==undefined&&rules.every(r=>r.referee_id===administratorId);
  record('permission fixtures store actual Administrator references',referencesValid,{rules,administratorId});
  if(!referencesValid)throw Error('permission fixture references invalid');
  for(const actor of ['admin','member','admin','member']){
   const page=pages[actor],response=await page.goto(stack.origin+'/'+readName,{waitUntil:'load'});
   const html=await page.content(),secretVisible=html.includes(secret);
   const raw=captureEvidence(html,{check:'permission-read-'+actor,name:readName,status:response.status()});
   record(actor==='admin'?capabilityChecks.P1[0]:capabilityChecks.P1[1],actor==='admin'?response.status()===200&&secretVisible:response.status()===403&&!secretVisible,{actor,status:response.status(),secretVisible,raw});
  }
  const browserWrite=async(page,content)=>page.evaluate(async({origin,name,content})=>{
   const r=await fetch(origin+'/update/'+name,{method:'POST',credentials:'include',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({'card[content]':content,'success[redirect]':'true'})});return r.status;
  },{origin:stack.origin,name:writeName,content});
  const stored=()=>database().prepare('SELECT db_content FROM cards WHERE name=? AND trash=0').get(writeName)?.db_content;
  const allowed=await browserWrite(admin.page,'ADMIN_ALLOWED_'+stamp),adminStored=stored()==='ADMIN_ALLOWED_'+stamp;
  const restored=await browserWrite(admin.page,unchanged);
  record(capabilityChecks.P3[0],allowed<400&&adminStored&&restored<400&&stored()===unchanged,{actor:'admin',status:allowed,adminStored,restoreStatus:restored});
  let response=await member.page.goto(stack.origin+'/'+writeName,{waitUntil:'load'});
  record(capabilityChecks.P3[1],response.status()===200&&(await member.page.content()).includes(unchanged),{actor:'member',status:response.status()});
  response=await member.page.goto(stack.origin+'/'+writeName+'?view=edit',{waitUntil:'load'});
  const html=await member.page.content(),contentInputs=await member.page.locator('[name="card[content]"]').count();
  record(capabilityChecks.P3[2],response.status()===403&&contentInputs===0,{actor:'member',status:response.status(),contentInputs,raw:captureEvidence(html,{check:'permission-edit-member',name:writeName})});
  const denied=await browserWrite(member.page,'UNAUTHORIZED_'+stamp);
  record(capabilityChecks.P3[3],denied===403&&stored()===unchanged,{actor:'member',status:denied,unchanged:stored()===unchanged});
  for(const [rule,allowed] of [['Anyone',true],['Administrator',false]]){
   const changed=await post('/update/'+encodeURIComponent(readRule),{'card[content]':'[['+rule+']]','success[redirect]':'true'});
   if(changed.status()>=400)throw Error('local permission policy update refused');
   response=await member.page.goto(stack.origin+'/'+readName,{waitUntil:'load'});
   const html=await member.page.content(),visible=html.includes(secret);
   record(allowed?capabilityChecks.P1[2]:capabilityChecks.P1[3],allowed?response.status()===200&&visible:response.status()===403&&!visible,{actor:'member',status:response.status(),secretVisible:visible,raw:captureEvidence(html,{check:'permission-'+(allowed?'grant':'revoke'),name:readName})});
  }
 }finally{await member?.close().catch(()=>{});await admin?.close().catch(()=>{});}
}}];

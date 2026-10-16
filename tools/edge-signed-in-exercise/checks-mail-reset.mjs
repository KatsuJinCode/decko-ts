import {randomBytes} from 'node:crypto';
export const meta={topic:'mail-reset',capabilityIds:['A5'],requiresMail:true};
export const capabilityChecks=[
 'reset request reaches the captured test inbox with visible acknowledgment',
 'captured reset link signs member into the password form',
 'reset password persists and rejects the old credential',
 'reset journey restores its original fixture credential',
];

export const checks=[{name:'password reset through the captured email and browser forms',run:async ctx=>{
 const {stack,creds,record,database,captureEvidence,mail,fixtureState}=ctx;
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(stack.origin).hostname))throw Error('mail reset requires the disposable loopback deck');
 if(!mail?.enabled||!fixtureState)throw Error('mail reset requires owned capture and fixture quarantine support');
 const info=database().prepare("SELECT a.id,h.name AS holder,r.name AS account_tag,p.id AS password_id,p.db_content AS digest,tag.name AS password_tag FROM cards a JOIN cards h ON h.id=a.left_id JOIN cards r ON r.id=a.right_id AND r.codename='account' JOIN cards tag ON tag.codename='password' JOIN cards p ON p.left_id=a.id AND p.right_id=tag.id AND p.trash=0 WHERE h.id=? AND a.trash=0 LIMIT 1").get(creds.member.id);
 if(!info||info.holder!==creds.member.name)throw Error('owned member account fixture missing');
 const accountName=info.holder+'+'+info.account_tag,passwordName=accountName+'+'+info.password_tag;
 const original=creds.member.password,next=randomBytes(18).toString('base64url')+'Ax7#';
 let anon,restoreNeeded=false;
 try{
  mail.drain();anon=await ctx.launchBrowser({origin:stack.origin,assetHosts:ctx.assetHosts});const p=anon.page;
  await p.goto(stack.origin+'/*signin',{waitUntil:'load'});
  const resetHref=await p.locator('a').filter({hasText:/Reset password/i}).first().getAttribute('href');
  if(!resetHref)throw Error('signed-out reset link missing');
  await p.goto(new URL(resetHref,stack.origin).href,{waitUntil:'load'});
  await p.fill('input[name="card[subcards][+*email][content]"]',creds.member.email);
  const pending=p.waitForResponse(r=>new URL(r.url()).pathname==='/update/*signin'&&r.request().method()==='POST',{timeout:20000}).then(response=>({response}),error=>({error}));
  await p.locator('button').filter({hasText:/^Reset password$/}).first().click();
  const observed=await pending;if(observed.error)throw observed.error;await observed.response.finished();
  // sendResetPasswordToken awaits the capture transport before returning.
  const delivered=mail.inbox.filter(m=>m.to===creds.member.email&&m.subject.startsWith('reset password for '));
  const message=delivered.at(-1),link=message?/https?:\/\/[^\s"<>]+\/update\/[^\s"<>]+/.exec(message.textBody)?.[0]:undefined;
  const parsed=link?new URL(link):undefined;
  const validLink=parsed?.origin===stack.origin&&decodeURIComponent(parsed.pathname)==='/update/'+accountName.replaceAll(' ','_')&&parsed.searchParams.get('card[trigger]')==='reset_password'&&Boolean(parsed.searchParams.get('token'));
  const siteTitle=database().prepare("SELECT db_content FROM cards WHERE codename='title' AND trash=0 LIMIT 1").get()?.db_content;
  const acknowledged=await p.waitForFunction(()=>/check your email[\s\S]*link[\s\S]*reset your password/i.test(document.body.innerText),undefined,{timeout:10000}).then(()=>true,()=>false);
  record(capabilityChecks[0],observed.response.status()<400&&delivered.length===1&&message?.subject==='reset password for '+siteTitle&&validLink&&acknowledged,{status:observed.response.status(),messages:delivered.length,recipient:message?.to,subject:message?.subject,linkPath:parsed?.pathname,linkHasToken:Boolean(parsed?.searchParams.get('token')),acknowledged,mailFile:message?String(message.seq).padStart(3,'0')+'.json':null,raw:captureEvidence(await p.content(),{check:'mail-reset-request'})});
  if(!validLink)throw Error('reset mail link failed the owned account/origin contract');
  const landed=await p.goto(link,{waitUntil:'load'});
  const field=p.locator('form.card-form input[type="password"]:visible').first();
  await field.waitFor({state:'visible',timeout:20000});
  const session=(await p.context().cookies(stack.origin)).some(c=>c.name==='decko_ts_session'&&c.value);
  record(capabilityChecks[1],landed.status()<400&&session,{status:landed.status(),session,landedPath:new URL(p.url()).pathname,raw:captureEvidence(await p.content(),{check:'mail-reset-link-landing'})});
  await field.fill(next);restoreNeeded=true;
  const saved=p.waitForResponse(r=>new URL(r.url()).origin===stack.origin&&r.request().method()==='POST',{timeout:20000}).then(response=>({response}),error=>({error}));
  await p.locator('form.card-form').filter({has:field}).locator('button[type="submit"],input[type="submit"]').first().click();
  const save=await saved;if(save.error)throw save.error;await save.response.finished();
  const changed=database().prepare('SELECT db_content FROM cards WHERE id=? AND trash=0').get(info.password_id)?.db_content!==info.digest;
  const fresh=await ctx.signIn({email:creds.member.email,password:next});
  if(fresh.hasSessionCookie)creds.member.password=next;
  const old=await ctx.signIn({email:creds.member.email,password:original});
  record(capabilityChecks[2],save.response.status()<400&&changed&&fresh.hasSessionCookie&&fresh.landing.signedIn&&!old.hasSessionCookie,{status:save.response.status(),storedDigestChanged:changed,newCredentialAccepted:fresh.hasSessionCookie&&fresh.landing.signedIn,oldCredentialRefused:!old.hasSessionCookie});
 }catch(error){
  if(error?.name==='TimeoutError')fixtureState.fatalReason='password reset browser operation timed out';
  throw error;
 }finally{
  await anon?.close().catch(()=>{});
  if(restoreNeeded){
   let restored=false;
   try{
    const admin=await ctx.signIn(creds.admin);if(!admin.hasSessionCookie||!admin.landing.signedIn)throw Error('fixture admin signin failed');
    const response=await ctx.page.context().request.post(stack.origin+'/update/'+encodeURIComponent(passwordName),{headers:{origin:stack.origin,'Content-Type':'application/x-www-form-urlencoded'},data:new URLSearchParams({'card[content]':original,'success[redirect]':'true'}).toString(),maxRedirects:0});
    const verification=await ctx.signIn({email:creds.member.email,password:original});
    restored=response.status()<400&&verification.hasSessionCookie&&verification.landing.signedIn;
    if(restored)creds.member.password=original;
   }catch{ /* The explicit failed control quarantines this disposable fixture. */ }
   record(capabilityChecks[3],restored,{restored});
   if(!restored)fixtureState.fatalReason='password reset fixture credential could not be restored';
  }
  const admin=await ctx.signIn(creds.admin).catch(()=>null);
  if(!admin?.hasSessionCookie||!admin.landing.signedIn)fixtureState.fatalReason='password reset fixture actor could not be restored';
 }
}}];

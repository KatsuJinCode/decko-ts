import {verifiedActorSession} from './lib/session-actor.mjs';

export const meta={topic:'cql-member',capabilityIds:['N2']};
export const checks=[{name:'member JSON search is consistent with an independently observed card read',run:async ctx=>{
 const {stack,page,creds,signIn,database,visit,record,captureEvidence}=ctx;
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(stack.origin).hostname))throw Error('member search control requires the disposable loopback fixture');
 const member=creds.member;
 const target=database().prepare('SELECT c.name,t.name AS type FROM cards c JOIN cards t ON t.id=c.type_id WHERE c.id=? AND c.trash=0').get(member.id);
 if(target?.name!==member.name||!target.type)throw Error('owned member target is unavailable');
 const session=await signIn(member);
 if(!verifiedActorSession(session,member.id))throw Error('ordinary member actor was not verified');
 const direct=await visit('/'+encodeURIComponent(target.name));
 const focal=page.locator(`#main > .card-slot[data-card-id="${member.id}"]`);
 const title=await focal.locator(':scope > .d0-card-header .card-title').first().getAttribute('title').catch(()=>null);
 const readable=direct.status===200&&title===target.name;
 const refused=direct.status===403;
 const readRaw=captureEvidence(await page.content(),{check:'member-direct-target-read',actorId:member.id,target:target.name,status:direct.status,title});
 record('ordinary member target has an explicit fresh read verdict',readable||refused,{actorId:member.id,status:direct.status,readable,refused,title,raw:readRaw});
 if(!readable&&!refused)throw Error('member target read verdict is not established');
 await page.goto(stack.origin+'/',{waitUntil:'load'});
 const query=JSON.stringify({type:target.type,name:target.name});
 const input=page.locator('form.search-box-form input[name="query[keyword]"]:visible').first();
 await input.fill(query);
 const pending=page.waitForResponse(response=>{
  const url=new URL(response.url());
  return url.origin===stack.origin&&url.pathname==='/*search'&&url.searchParams.get('query[keyword]')===query&&response.request().method()==='GET';
 },{timeout:20000}).then(response=>({response}),error=>({error}));
 await input.press('Enter');
 const seen=await pending;if(seen.error)throw seen.error;await seen.response.finished();
 await page.waitForURL(url=>url.pathname==='/*search'&&url.searchParams.get('query[keyword]')===query,{waitUntil:'load',timeout:20000});
 const names=await page.locator('#main .search-result-item .card-slot[data-card-name]').evaluateAll(items=>items.map(item=>item.getAttribute('data-card-name')));
 const raw=captureEvidence(await page.content(),{check:'member-json-search',actorId:member.id,query,status:seen.response.status()});
 record('ordinary member JSON search agrees with the fresh target read verdict',seen.response.status()===200&&(readable?names.length===1&&names[0]===target.name:names.length===0),{actorId:member.id,query,readable,refused,names,expected:readable?[target.name]:[],status:seen.response.status(),raw});
}}];

// Based on upstream decko/features/navbox.feature:
// enter JSON into query[keyword], then press Enter. The legacy type="X"
// string under query[query] is not the upstream scenario.
import {verifiedActorSession} from './lib/session-actor.mjs';
export const meta={topic:'cql-navbox',capabilityIds:['N2']};
export const capabilityChecks=[
 'JSON CQL is submitted through the visible navbox and Enter',
 'JSON CQL returns only the expected owned member',
 'JSON CQL missing-name control returns no result cards',
];
export const checks=[{name:'JSON CQL navbox positive and negative controls',run:async ctx=>{
 const {stack,page,creds,signIn,database,record,captureEvidence,visit}=ctx;
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(stack.origin).hostname))throw Error('CQL navbox requires the disposable loopback fixture');
 const identity=database().prepare('SELECT c.name,t.name AS type FROM cards c JOIN cards t ON t.id=c.type_id WHERE c.id=? AND c.trash=0').get(creds.member.id);
 if(identity?.name!==creds.member.name||!identity.type)throw Error('owned member type fixture missing');
 const signed=await signIn(creds.admin);if(!verifiedActorSession(signed,creds.admin.id))throw Error('CQL navbox admin actor was not verified');
 const readable=await visit('/'+encodeURIComponent(identity.name));
 const visible=await page.locator(`#main .card-slot[data-card-id="${creds.member.id}"]`).count();
 if(readable.status!==200||visible===0||await page.locator('#main .denied').count()>0)throw Error('owned member is not a proven readable CQL target');
 for(const [index,name]of [identity.name,'MissingCqlFixture_'+Date.now().toString(36)].entries()){
  const query=JSON.stringify({type:identity.type,name});
  await page.goto(stack.origin+'/',{waitUntil:'load'});
  const input=page.locator('form.search-box-form input[name="query[keyword]"]:visible').first();
  await input.fill(query);
  const pending=page.waitForResponse(r=>{const u=new URL(r.url());return u.origin===stack.origin&&u.pathname==='/*search'&&u.searchParams.get('query[keyword]')===query&&r.request().method()==='GET'},{timeout:20000}).then(response=>({response}),error=>({error}));
  await input.press('Enter');
  const seen=await pending;if(seen.error)throw seen.error;await seen.response.finished();
  await page.waitForURL(u=>u.pathname==='/*search'&&u.searchParams.get('query[keyword]')===query,{waitUntil:'load',timeout:20000});
  const names=await page.locator('#main .search-result-item').evaluateAll(items=>items.map(item=>item.querySelector('.card-slot[data-card-name]')?.getAttribute('data-card-name')).filter(Boolean));
  const raw=captureEvidence(await page.content(),{check:'cql-navbox-'+index,query,status:seen.response.status()});
  record(capabilityChecks[0],seen.response.status()===200,{query,submitted:new URL(page.url()).searchParams.get('query[keyword]'),status:seen.response.status(),raw});
  record(capabilityChecks[index+1],index===0?names.length===1&&names[0]===identity.name:names.length===0,{query,names,expected:index===0?[identity.name]:[],raw});
 }
}}];

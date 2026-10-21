// Based on upstream decko/features/navbox.feature:
// enter JSON into query[keyword], then press Enter. The legacy type="X"
// string under query[query] is not the upstream scenario.
import {verifiedActorSession} from './lib/session-actor.mjs';
import {cqlFilterOperators, cqlLegCheckName, cqlOperatorLegHolds, resultCardNames} from './lib/cql-operator-breadth.mjs';
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
}},{name:'JSON CQL operator legs through the visible navbox',run:async ctx=>{
 const {stack,page,creds,signIn,database,record,captureEvidence}=ctx;
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(stack.origin).hostname))throw Error('CQL operator legs require the disposable loopback fixture');
 const identity=database().prepare('SELECT c.name,t.name AS type FROM cards c JOIN cards t ON t.id=c.type_id WHERE c.id=? AND c.trash=0').get(creds.member.id);
 if(identity?.name!==creds.member.name||!identity.type)throw Error('CQL operator fixture missing');
 const signed=await signIn(creds.admin);if(!verifiedActorSession(signed,creds.admin.id))throw Error('CQL operator admin actor was not verified');

 // One submission through the real navbox, the real Enter key and the real
 // /*search route - the same path the type+name legs above drive.
 const submit=async query=>{
  const text=JSON.stringify(query);
  await page.goto(stack.origin+'/',{waitUntil:'load'});
  const input=page.locator('form.search-box-form input[name="query[keyword]"]:visible').first();
  await input.fill(text);
  const pending=page.waitForResponse(r=>{const u=new URL(r.url());return u.origin===stack.origin&&u.pathname==='/*search'&&u.searchParams.get('query[keyword]')===text&&r.request().method()==='GET'},{timeout:20000}).then(response=>({response}),error=>({error}));
  await input.press('Enter');
  const seen=await pending;if(seen.error)throw seen.error;await seen.response.finished();
  await page.waitForURL(u=>u.pathname==='/*search'&&u.searchParams.get('query[keyword]')===text,{waitUntil:'load',timeout:20000});
  const html=await page.content();
  return {status:seen.response.status(),names:resultCardNames(html),html};
 };

 // The expected sets come from the DECK's own rows, read through the same
 // tables the engine reads, so a leg cannot pass by echoing a canned answer.
 // Every leg also carries an EXCLUDED card: a silently-ignored navbox
 // submission answers with the whole deck, a submission matching nothing
 // answers with no cards, and both look like an answer.
 const memberRight=identity.name.split('+').pop();
 const legs=[
  {name:'right',query:{right:memberRight,sort:'name'},excluded:creds.admin.name,
   expected:database().prepare('SELECT c.name FROM cards c WHERE c.trash=0 AND c.name=?').all(memberRight).map(r=>r.name)},
  {name:'not',query:{not:{name:identity.name},type:identity.type,sort:'name'},excluded:identity.name,
   expected:database().prepare('SELECT c.name FROM cards c JOIN cards t ON t.id=c.type_id WHERE c.trash=0 AND t.name=? AND c.name<>?').all(identity.type,identity.name).map(r=>r.name)},
  {name:'and',query:{type:identity.type,name:identity.name,sort:'name'},
   expected:database().prepare('SELECT c.name FROM cards c JOIN cards t ON t.id=c.type_id WHERE c.trash=0 AND t.name=? AND c.name=?').all(identity.type,identity.name).map(r=>r.name)},
  {name:'created_by',query:{created_by:identity.name,sort:'name'},
   expected:database().prepare('SELECT c.name FROM cards c JOIN cards u ON u.id=c.creator_id WHERE c.trash=0 AND u.name=?').all(identity.name).map(r=>r.name)},
 ];
 for(const [index,leg]of legs.entries()){
  const seen=await submit(leg.query);
  const checkName=cqlLegCheckName(cqlFilterOperators(leg.query));
  if(checkName===null)continue;
  const verdict=cqlOperatorLegHolds({submitted:leg.query,returned:seen.names,expected:leg.expected,excluded:leg.excluded??null});
  record(checkName,verdict.ok,{leg:leg.name,query:leg.query,operators:verdict.operators,names:verdict.names,expected:leg.expected,excluded:leg.excluded??null,failures:verdict.failures,status:seen.status,
   raw:captureEvidence(seen.html,{check:'cql-operator-'+index,query:leg.query,status:seen.status})});
 }
}}];

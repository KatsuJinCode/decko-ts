import {searchForMissingName,SEARCH_EMPTY_ANSWER_CHECKS as N6} from './lib/search-empty-answer.mjs';

// capabilityChecks stays EXACTLY the N1 row's declared names: the module
// battery asserts capabilities.json's N1 `checks` deep-equals this array
// (test/check-modules.test.mjs:65), so a name added here for another row
// would break that contract. cap-N6's three names come from the predicate
// module instead, which is where they are defined.
export const meta={topic:'navbox',capabilityIds:['N1','N6']};
export const capabilityChecks=['navbox Enter submits keyword search','navbox case variants find content-only target'];
export const searchEmptyChecks=[N6.echo,N6.empty,N6.offer];

export const checks=[{name:'keyword search through the visible navbox and Enter',only:'navbox',run:async ctx=>{
 const {stack,page,creds,signIn,record,database,created,captureEvidence}=ctx;
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(stack.origin).hostname))throw Error('navbox fixture requires the disposable loopback deck');
 const signedIn=await signIn(creds.admin);
 if(!signedIn.hasSessionCookie)throw Error('navbox browser signin failed');
 const stamp=Date.now().toString(36),name='Harness_navbox_'+stamp,needle='NavboxNeedle'+stamp;
 created.push(name);
 const createdResponse=await page.context().request.post(stack.origin+'/card/create',{
  headers:{origin:stack.origin,'Content-Type':'application/x-www-form-urlencoded'},maxRedirects:0,
  data:new URLSearchParams({'card[name]':name,'card[type]':'Basic','card[content]':needle,'success[redirect]':'true'}).toString(),
 });
 const stored=database().prepare('SELECT db_content FROM cards WHERE name=? AND trash=0').get(name)?.db_content;
 if(createdResponse.status()>=400||stored!==needle)throw Error('content-only keyword fixture was not stored');
 const canonical=s=>s.replaceAll('_',' ').toLowerCase();
 for(const [index,term] of [needle.toLowerCase(),needle.toUpperCase()].entries()){
  await page.goto(stack.origin+'/',{waitUntil:'load'});
  // Stock search_box.js.coffee binds this visible field. With no selected
  // autocomplete suggestion, Enter submits its actual GET search form.
  const input=page.locator('form.search-box-form input[name="query[keyword]"]:visible').first();
  await input.fill(term);
  const pending=page.waitForResponse(r=>{
   const u=new URL(r.url());return r.request().method()==='GET'&&u.pathname==='/*search'&&(u.searchParams.get('query[keyword]')??'').toLowerCase()===term.toLowerCase();
  },{timeout:20000}).then(response=>({response}),error=>({error}));
  await input.press('Enter');
  const observed=await pending;if(observed.error)throw observed.error;
  const response=observed.response;await response.finished();
  await page.waitForURL(u=>u.pathname==='/*search'&&(u.searchParams.get('query[keyword]')??'').toLowerCase()===term.toLowerCase(),{waitUntil:'load',timeout:20000});
  const names=await page.locator('#main .search-result-item .card-slot[data-card-name]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-card-name')));
  const html=await page.content(),url=new URL(page.url());
  const raw=captureEvidence(html,{check:'navbox-search-'+index,name,typedTerm:term,submittedTerm:url.searchParams.get('query[keyword]'),status:response.status()});
  record(capabilityChecks[0],response.status()===200&&url.pathname==='/*search',{actor:'admin',typedTerm:term,submittedTerm:url.searchParams.get('query[keyword]'),status:response.status(),raw});
  record(capabilityChecks[1],names.some(n=>n!==null&&canonical(n)===canonical(name))&&!canonical(name).includes(canonical(needle)),{actor:'admin',typedTerm:term,target:name,resultNames:names,contentOnly:true,raw});
 }
}},{name:'a search for a name that exists nowhere answers empty and offers to create it',only:'navbox',run:async ctx=>{
 const {stack,page,creds,signIn,record,database,created,captureEvidence}=ctx;
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(stack.origin).hostname))throw Error('navbox empty-answer fixture requires the disposable loopback deck');
 const signedIn=await signIn(creds.admin);
 if(!signedIn.hasSessionCookie)throw Error('navbox empty-answer browser signin failed');
 const stamp=Date.now().toString(36);
 // The term carries no card, and is verified absent from the deck BEFORE the
 // search runs - so an empty answer is a property of the SURFACE answering
 // nothing, not of a term nobody happened to create.
 const term='zz_no_such_card_'+stamp;
 const absent=database().prepare('SELECT id FROM cards WHERE name=? AND trash=0').get(term)===undefined;
 if(!absent)throw Error('the empty-answer term is not absent from the deck');

 // One pass through the visible navbox, the same field and the same Enter key
 // the legs above drive. The typeahead is read at the route Ruby renders the
 // items from (set/self/search.rb:70-72 view :search_box_complete), and the
 // page is the search the form submits.
 await page.goto(stack.origin+'/',{waitUntil:'load'});
 const input=page.locator('form.search-box-form input[name="query[keyword]"]:visible').first();
 await input.fill(term);
 const typeahead=await page.evaluate(async t=>{
  const r=await fetch(`/*search/search_box_complete.json?term=${encodeURIComponent(t)}`,{credentials:'include'});
  return {status:r.status,body:await r.text()};
 },term);
 let items=[];try{items=JSON.parse(typeahead.body);}catch{/* a non-JSON body fails noAddItem below */}
 const pending=page.waitForResponse(r=>{
  const u=new URL(r.url());return r.request().method()==='GET'&&u.pathname==='/*search'&&u.searchParams.get('query[keyword]')===term;
 },{timeout:20000}).then(response=>({response}),error=>({error}));
 await input.press('Enter');
 const observed=await pending;if(observed.error)throw observed.error;
 await observed.response.finished();
 await page.waitForURL(u=>u.pathname==='/*search'&&u.searchParams.get('query[keyword]')===term,{waitUntil:'load',timeout:20000});
 const html=await page.content();
 const verdict=searchForMissingName({page:{html,status:observed.response.status()},offer:{items},term});
 const raw=captureEvidence(html,{check:'navbox-empty-answer',term,status:observed.response.status()});
 const evidence={actor:'admin',term,status:observed.response.status(),typeaheadStatus:typeahead.status,failures:verdict.failures,echo:verdict.echo,shape:verdict.shape,raw,
  ruby:'card-mod-search-0.20.0 set/self/search/results_for_keyword.haml (the echo, `= h search_keyword`), set/abstract/0_search/views.rb (with_results -> render_no_search_results, and card_list_item\'s search-result-item wrapper per row)',
  oldCheck:'the row\'s prior check graded /create|new card|\\/new\\//i over the whole page, which the Getting-started menu\'s own [[/new/Cardtype | Add type]] link satisfies (card-mod-defaults data/real.yml:38-43) on every page, correct or not'};
 // Recorded separately: a red must name WHICH claim failed. The three are not
 // separable in one verdict - the offer can be right on a page that answered
 // everything - and one verdict would hide that.
 record(searchEmptyChecks[0],!verdict.failures.some(f=>f==='noKeywordEcho'||f==='echoLabel'||f==='echoTerm'),evidence);
 record(searchEmptyChecks[1],!verdict.failures.some(f=>f==='noEmptyResultsMarker'||f==='resultRowsRendered'),evidence);
 record(searchEmptyChecks[2],!verdict.failures.some(f=>f.startsWith('add')||f==='noAddItem'||f==='gotoItemForMissingName'),evidence);
}}];

export const meta={topic:'navbox',capabilityIds:['N1']};
export const capabilityChecks=['navbox Enter submits keyword search','navbox case variants find content-only target'];

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
}}];

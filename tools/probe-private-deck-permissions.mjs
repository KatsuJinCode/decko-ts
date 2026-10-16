// Actual private-deck permission browser journey; no live provider calls.
import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>i%2?a:[...a,[v.replace(/^--/,''),all[i+1]]],[]));
for(const key of ['harness-root','deck','source','out','render-env-secrets'])if(!args[key])throw Error(`--${key} required`);
const repo=process.cwd(),out=path.resolve(args.out),deck=path.resolve(args.deck),source=path.resolve(args.source);
if(!deck.startsWith(repo+path.sep+'.runtime'+path.sep)||deck===source||existsSync(out))throw Error('use an existing owned staged deck and fresh output under this checkout');
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',windowsHide:true}).trim();
if(git('status','--porcelain'))throw Error('commit source before actual capture');
mkdirSync(out,{recursive:true});
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const helpers=path.resolve(args['harness-root'],'tools/edge-signed-in-exercise/lib');
const load=n=>import(pathToFileURL(path.join(helpers,n)).href);
const evidence={source:git('rev-parse','HEAD'),sourceDeckSha256:hash(source),preparedDeckInitialSha256:hash(deck),scope:'Actual private deck role/read browser controls, local bundled Bunny handler over Hrana, Node SDK shim; not deployed acceptance',productionAcceptance:false,helperHashes:Object.fromEntries(['seed-local-accounts.mjs','local-hrana.mjs','edge-host.mjs','local-policy.mjs','harness-browser.mjs'].map(n=>[n,hash(path.join(helpers,n))])),checks:[],networkFailures:[]};
let hrana,host,browser;const start=Date.now();
try {
 const credentialsPath=args.credentials ? path.resolve(args.credentials) : out+'/credentials.private';
 if(!credentialsPath.startsWith(repo+path.sep+'.runtime'+path.sep))throw Error('credentials must belong to this owned runtime');
 if(!args.credentials){const {seedLocalAccounts}=await load('seed-local-accounts.mjs');await seedLocalAccounts({deck,credentialsOut:credentialsPath});}
 evidence.credentialsSha256=hash(credentialsPath);
 const creds=JSON.parse(readFileSync(credentialsPath));
 const db=new Database(deck,{readonly:true});
 const target=db.prepare("SELECT c.id,c.name,c.db_content FROM cards c JOIN cards r ON r.id=c.read_rule_id WHERE c.trash=0 AND c.name IS NOT NULL AND c.name != '' AND r.db_content LIKE 'Administrator%' AND length(c.db_content)>100").all().find(card => /[A-Za-z][A-Za-z ,.!?]{30,}/.test(card.db_content));
 if(!target)throw Error('no real Administrator read-rule target');
 const secret=target.db_content.match(/[A-Za-z][A-Za-z ,.!?]{30,}/)?.[0];if(!secret)throw Error('no stable visible content sentinel');
 db.close();evidence.targetId=target.id;evidence.targetContentSha256=createHash('sha256').update(target.db_content).digest('hex');
 const {startLocalHrana}=await load('local-hrana.mjs');hrana=await startLocalHrana({dbPath:deck});
 const {localEnv}=await load('local-policy.mjs');const {startEdgeHost}=await load('edge-host.mjs');
 const {readLiveScriptEnv}=await load('stack.mjs');const {env:live}=await readLiveScriptEnv(args['render-env-secrets']);
 const assetHosts=[...new Set(Object.entries(live).filter(([k,v])=>k.startsWith('DECKO_SERVED_')&&typeof v==='string'&&/^https?:\/\//i.test(v)).map(([,v])=>new URL(v).hostname))];
 const renderEnv=localEnv({live:{...live,DECKO_LIVE_RENDER:'1'},dbUrl:hrana.url+'/v2/pipeline',origin:'https://127.0.0.1'});
 evidence.renderConfigurationSha256=createHash('sha256').update(JSON.stringify(renderEnv)).digest('hex');evidence.renderConfigurationKeys=Object.keys(renderEnv).sort();
 evidence.bundleSha256=hash(repo+'/deploy/dist/bunny-edge-engine.bundle.js');
 host=await startEdgeHost({bundlePath:repo+'/deploy/dist/bunny-edge-engine.bundle.js',runtimeDir:out+'/edge',env:renderEnv});
 const {launchHarnessBrowser}=await load('harness-browser.mjs');browser=await launchHarnessBrowser({origin:host.url,assetHosts});
 browser.page.on('response',r=>{if(['script','stylesheet','image','font'].includes(r.request().resourceType())&&r.status()>=400)evidence.networkFailures.push({path:new URL(r.url()).pathname,status:r.status()});});
 browser.page.on('requestfailed',r=>{if(['script','stylesheet','image','font'].includes(r.resourceType()))evidence.networkFailures.push({path:new URL(r.url()).pathname,failure:r.failure()?.errorText});});
 const record=(name,pass,detail)=>{evidence.checks.push({name,pass,detail});if(!pass)console.error(name,detail);};
 const visit=async(name,url)=>{const r=await browser.page.goto(host.url+url,{waitUntil:'networkidle',timeout:60000});const html=await browser.page.content();writeFileSync(out+'/'+name+'.html',html);return {status:r.status(),html};};
 const signIn=async(account)=>{
  await browser.page.context().clearCookies();await visit('signin-'+account.name.replace(/ /g,'-'),'/*signin');
  await browser.page.fill('input[name="card[subcards][+*email][content]"]',account.email);
  await browser.page.fill('input[name="card[subcards][+*password][content]"]',account.password);
  const [response]=await Promise.all([browser.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/update/*signin'),browser.page.locator('form[action="/update/*signin"] button[type=submit]').first().click()]);
  await browser.page.waitForFunction(()=>window.decko?.signed_in===true,null,{timeout:15000});
  const cookies=await browser.page.context().cookies(host.url);record(account.name+' actually authenticated',response.status()<400&&cookies.some(c=>c.name==='decko_ts_session'&&c.value),{status:response.status()});
 };
 await signIn(creds.admin);const granted=await visit('admin-read','/'+encodeURIComponent(target.name.replace(/ /g,'_')));
 record('administrator reads actual restricted card',granted.status===200&&granted.html.includes(secret),{status:granted.status,contentPresent:granted.html.includes(secret)});
 await signIn(creds.member);const publicPage=await visit('member-public','/Home');record('member positive public read',publicPage.status===200,{status:publicPage.status});
 const denied=await visit('member-denied','/'+encodeURIComponent(target.name.replace(/ /g,'_')));
 record('P1 member denied actual restricted read',denied.status===403&&!denied.html.includes(secret),{status:denied.status,contentLeaked:denied.html.includes(secret)});
 await browser.page.context().clearCookies();const anonymous=await visit('anonymous-denied','/'+encodeURIComponent(target.name.replace(/ /g,'_')));
 record('anonymous denied actual restricted read',anonymous.status===403&&!anonymous.html.includes(secret),{status:anonymous.status,contentLeaked:anonymous.html.includes(secret)});
 record('source deck remains unchanged',hash(source)===evidence.sourceDeckSha256,{});
 evidence.complete=true;
}catch(error){evidence.error=error.stack;}finally{
 await browser?.close();await host?.close();await hrana?.close();evidence.durationMs=Date.now()-start;
 evidence.passed=evidence.complete===true&&!evidence.error&&evidence.checks.every(c=>c.pass)&&!evidence.networkFailures.length;
 writeFileSync(out+'/evidence.json',JSON.stringify(evidence,null,2)+'\n');
}
console.log(JSON.stringify({passed:evidence.passed,checks:evidence.checks,error:evidence.error,durationMs:evidence.durationMs}));if(!evidence.passed)process.exitCode=1;

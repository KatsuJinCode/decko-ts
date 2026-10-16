import test from 'node:test';
import assert from 'node:assert/strict';
import { localEnv, externalBrowserRequestAllowed, verifiedCapabilities } from '../lib/local-policy.mjs';

test('account coverage requires every named actor and rejects any failed repeat', () => {
  const capabilities = [{status:'not_covered',checks:['real save'],requiredActors:['admin','member']}];
  const admin = {check:'real save',pass:true,evidence:{actor:'admin'}};
  const member = {check:'real save',pass:true,evidence:{actor:'member'}};
  assert.equal(verifiedCapabilities(capabilities,[admin])[0].status,'not_covered');
  assert.equal(verifiedCapabilities(capabilities,[admin,{...member,evidence:{}}])[0].status,'not_covered');
  assert.equal(verifiedCapabilities(capabilities,[admin,member])[0].status,'covered');
  assert.equal(verifiedCapabilities(capabilities,[admin,member,{...member,pass:false}])[0].status,'not_covered');
});

test('local bundle environment cannot inherit production provider credentials', () => {
  const result = localEnv({ live: {
    DECKO_DB_URL: 'https://production.invalid', DECKO_DB_TOKEN: 'secret',
    BUNNY_DATABASE_URL: 'https://production.invalid', BUNNY_DATABASE_AUTH_TOKEN: 'secret',
    BUNNY_DB_URL: 'https://production.invalid', BUNNY_DB_TOKEN: 'secret',
    DECKO_STORAGE_PASSWORD: 'secret', DECKO_STORAGE_ZONE: 'production',
    AWS_SECRET_ACCESS_KEY: 'secret', DECKO_TOKEN_SECRET: 'secret', UNKNOWN_PROVIDER_KEY: 'secret',
    DECKO_LIVE_RENDER: '1', DECKO_SERVED_STYLESHEET_TO: 'https://assets.example.test/style.css',
  }, dbUrl: 'http://127.0.0.1:1234/v2/pipeline', origin: 'https://127.0.0.1:1235' });
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(JSON.stringify(result).includes('production'), false);
  assert.equal(result.DECKO_LIVE_RENDER, '1');
  assert.equal(result.DECKO_FONT_AWESOME, 'local');
  assert.equal(result.DECKO_ORIGIN, 'https://127.0.0.1:1235');
  assert.throws(() => localEnv({ live: {}, dbUrl: 'https://production.invalid', origin: 'https://127.0.0.1:1235' }), /loopback/);
});

test('browser can write only to its exact owned origin and read declared public assets', () => {
  const config = { origin: 'https://127.0.0.1:1235', allowedHosts: new Set(['assets.example.test']) };
  const request = (url, method = 'GET', resourceType = 'script') => ({ url: () => url, method: () => method, resourceType: () => resourceType });
  assert.equal(externalBrowserRequestAllowed(request(config.origin + '/update', 'POST', 'document'), config), true);
  assert.equal(externalBrowserRequestAllowed(request('https://127.0.0.1:9999/update', 'POST'), config), false);
  assert.equal(externalBrowserRequestAllowed(request('https://assets.example.test/font.woff2', 'GET', 'font'), config), true);
  assert.equal(externalBrowserRequestAllowed(request('https://assets.example.test/update', 'POST'), config), false);
  assert.equal(externalBrowserRequestAllowed(request('https://assets.example.test/api', 'GET', 'fetch'), config), false);
  assert.equal(externalBrowserRequestAllowed(request('https://other.example.test/script.js'), config), false);
});

test('coverage requires actual passing checks and never promotes failed, absent or partial evidence', () => {
  const capabilities = [
    { id: 'absent', status: 'covered', check: 'not run' },
    { id: 'failed', status: 'covered', check: 'failed' },
    { id: 'partial', status: 'partial', check: 'passed' },
    { id: 'complete', status: 'not_covered', check: 'passed' },
    { id: 'compound', status: 'covered', checks: ['passed', 'failed'] },
    { id: 'duplicate', status: 'covered', check: 'inconsistent' },
  ];
  const results = [{ check: 'failed', pass: false }, { check: 'passed', pass: true }, { check: 'inconsistent', pass: true }, { check: 'inconsistent', pass: false }];
  assert.deepEqual(verifiedCapabilities(capabilities, results).map(x => x.status), ['not_covered', 'not_covered', 'partial', 'covered', 'partial', 'not_covered']);
});

test('Chromium favicon other is limited to explicit GET resource from owned page', () => {
 const favicon='https://assets.example.test/files/103/3649-small.jpg';
 const config={origin:'https://127.0.0.1:4321',allowedHosts:new Set(['assets.example.test']),allowedFaviconUrls:[favicon]};
 const req=(changes={})=>({url:()=>favicon,method:()=> 'GET',resourceType:()=> 'other',isNavigationRequest:()=>false,frame:()=>({url:()=>config.origin+'/Home'}),...changes});
 assert.equal(externalBrowserRequestAllowed(req(),config),true);
 for(const changes of [
  {url:()=>favicon+'?token=x'}, {url:()=>favicon+'#fragment'},
  {url:()=>favicon.replace('https:','http:')}, {url:()=>favicon.replace('assets.','other.')},
  {url:()=>favicon.replace('103','104')}, {url:()=>favicon.replace('3649','%33%36%34%39')},
  {method:()=> 'POST'}, {method:()=> 'HEAD'},
  {resourceType:()=> 'fetch'}, {resourceType:()=> 'xhr'}, {resourceType:()=> 'document'},
  {isNavigationRequest:()=>true}, {isNavigationRequest:undefined},
  {frame:()=>({url:()=> 'https://unrelated.example.test/Home'})},
  {frame:()=>{throw Error('no frame');}},
 ]) assert.equal(externalBrowserRequestAllowed(req(changes),config),false);
 assert.equal(externalBrowserRequestAllowed(req(),{...config,allowedFaviconUrls:[]}),false);
 assert.equal(externalBrowserRequestAllowed(req(),{...config,allowedHosts:new Set()}),false);
});

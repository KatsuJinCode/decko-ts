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

// Row: smell-audit-candidate-production-flags. The audit's gate compares a
// four-entry expected map against what localEnv returns, and two of those four
// entries are supposed to be forced by this module rather than read from the
// live script environment. Which two, and what happens to a live flag outside
// RENDER_KEYS, is load-bearing for that gate and is pinned here.
//
// The forced set is asserted as a set rather than key by key: it is the whole
// claim, so a flag added to or dropped from the forced object is a change to
// what the audit may conclude, not a detail.
//
// [re-pinned 2026-10-20, merged tree] DECKO_MATERIAL_ICONS used to be
// dropped here, and the row's conclusion was that an audit expecting it in
// localEnv's output "can never be satisfied by this module". That is no
// longer true: commit d1cc4c5b ("Serve the existing Material Icons font
// locally under explicit deployment configuration") put DECKO_MATERIAL_ICONS
// into RENDER_KEYS, so it is now read from the live script environment and
// passed through like every other render key. The blocker the row named is
// gone; the two claims that survive are the ones below.
test('localEnv forces the write path and local icons, and drops live flags outside the render set', () => {
  const loopback = { dbUrl: 'http://127.0.0.1:1234/v2/pipeline', origin: 'https://127.0.0.1:1235' };
  const hostile = localEnv({ live: {
    DECKO_WRITE_PATH: '0', DECKO_FONT_AWESOME: 'stock', DECKO_CONFLICT_RETRY: '1',
    DECKO_MATERIAL_ICONS: 'local', DECKO_LIVE_RENDER: '1', NOT_A_RENDER_KEY: 'value',
  }, ...loopback });
  // Forced regardless of what the live environment says.
  assert.equal(hostile.DECKO_WRITE_PATH, '1');
  assert.equal(hostile.DECKO_FONT_AWESOME, 'local');
  // Passed through only because it is a render key.
  assert.equal(hostile.DECKO_CONFLICT_RETRY, '1');
  assert.equal(hostile.DECKO_LIVE_RENDER, '1');
  // Passed through because it is a render key too (d1cc4c5b) - read from the
  // live environment, never forced: the value the live script carries is the
  // value that comes out.
  assert.equal(hostile.DECKO_MATERIAL_ICONS, 'local');
  // Dropped: not a render key, and not forced either.
  assert.equal('NOT_A_RENDER_KEY' in hostile, false);
  // And the forced set is exactly these two, so an expectation built on a third
  // forced flag is wrong rather than merely unmet.
  const forced = Object.entries(hostile)
    .filter(([key]) => !key.startsWith('DECKO_DB') && !key.startsWith('DECKO_TRUSTED') &&
      !key.startsWith('DECKO_ORIGIN') && !key.startsWith('DECKO_DECK_ORIGIN') &&
      !key.startsWith('DECKO_SERVED_ROOT'))
    .map(([key]) => key).sort();
  assert.deepEqual(forced, ['DECKO_CONFLICT_RETRY', 'DECKO_FONT_AWESOME', 'DECKO_LIVE_RENDER', 'DECKO_MATERIAL_ICONS', 'DECKO_WRITE_PATH']);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { localEnv, externalBrowserRequestAllowed, verifiedCapabilities } from '../lib/local-policy.mjs';

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

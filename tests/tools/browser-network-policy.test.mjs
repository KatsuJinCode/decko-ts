import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedBrowserRequest} from '../../reference-harness/browser/lib/launch.mjs';
const allowed=[
  'http://127.0.0.1:1234/card/new',
  'https://code.jquery.com/jquery-3.5.1.min.js',
  'https://www.google.com/recaptcha/api.js?render=public-test-key',
  'https://www.gstatic.com/recaptcha/releases/version/recaptcha__en.js',
  'https://recaptcha.google.com/recaptcha/api2/anchor',
];
const blocked=[
  'http://www.google.com/recaptcha/api.js',
  'https://www.google.com/analytics.js',
  'https://www.gstatic.com/unrelated/script.js',
  'https://www.google.com.attacker.test/recaptcha/api.js',
  'https://attacker.test/recaptcha/api.js',
  'https://recaptcha.google.com/unrelated/frame',
];
for(const url of allowed)test('allows required path '+url,()=>assert.equal(allowedBrowserRequest(new URL(url)),true));
for(const url of blocked)test('blocks unrelated path '+url,()=>assert.equal(allowedBrowserRequest(new URL(url)),false));
test('offline mode admits only loopback',()=>{
  for(const url of allowed)assert.equal(allowedBrowserRequest(new URL(url),true),new URL(url).hostname==='127.0.0.1');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBrowserSigninProfile} from '../../reference-harness/browser/lib/ts-signin-profile.mjs';

test('Ruby comparison explicitly pins the three declared account divergences off',()=>{
  const env={DECKO_SIGNIN_UNIFORM_FAILURE:'on',DECKO_SIGNIN_THROTTLE:'on',DECKO_SESSION_REVOCATION:'on',KEEP:'unchanged'};
  applyBrowserSigninProfile(env,false);
  assert.deepEqual(env,{DECKO_SIGNIN_UNIFORM_FAILURE:'off',DECKO_SIGNIN_THROTTLE:'off',DECKO_SESSION_REVOCATION:'off',KEEP:'unchanged'});
});

test('production leaves defaults and explicit host configuration untouched',()=>{
  for(const env of [{},{DECKO_SIGNIN_UNIFORM_FAILURE:'on',DECKO_SIGNIN_THROTTLE:'off',DECKO_SESSION_REVOCATION:'on'}]){
    const before={...env};applyBrowserSigninProfile(env,true);assert.deepEqual(env,before);
  }
});

// The row-parity host uses the same approved account-security divergence
// switches as reference-harness/adapters/ts/adapter.ts. Production keeps its
// host policy, including defaults and explicit operator configuration.
export function applyBrowserSigninProfile(env, productionProfile) {
  if (productionProfile) return;
  env.DECKO_SIGNIN_UNIFORM_FAILURE = 'off';
  env.DECKO_SIGNIN_THROTTLE = 'off';
  env.DECKO_SESSION_REVOCATION = 'off';
}

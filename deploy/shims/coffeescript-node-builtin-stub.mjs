// Bundle-time stand-in for the three Node builtins the coffeescript package
// entry requires (fs, vm, path — its file and eval helpers use them; the
// compile() path uses none). Applied ONLY to the coffeescript subtree: by the
// esbuild plugin tools/vendor/coffeescript-edge-bundler-stubs.mjs in the two
// edge bundle builds, and by the [alias] table in wrangler.toml (the
// wrangler-bundled worker). The same idea as shims/node-crypto-shim.ts:
// the engine source stays runtime-agnostic; the bundler substitutes.
//
// Any member access throws, loudly, instead of faking an API — if a
// coffeescript code path ever reaches for these on the edge, the failure
// names itself.

const unusedNodeBuiltin = new Proxy({}, {
  get(_target, name) {
    throw new Error(
      `coffeescript edge bundle: node builtin member "${String(name)}" is not available (compile() needs none)`,
    );
  },
});

export default unusedNodeBuiltin;

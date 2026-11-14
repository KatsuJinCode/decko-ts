// The esbuild plugin the two edge bundle builds pass
// (tools/bundle-bunny-edge-engine.mjs, tools/bundle-cf-edge-engine.mjs):
// stub the three Node builtins the coffeescript package entry requires
// (fs, vm, path) for the coffeescript subtree ONLY. Every other importer of
// those specifiers stays external, exactly as before — the edge bundle graph
// has no static node: imports, and this keeps it that way instead of
// aliasing the builtins globally.
//
// The stub itself is deploy/shims/coffeescript-node-builtin-stub.mjs (see
// its header for why compile() needs none of the three).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const STUB = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "deploy", "shims", "coffeescript-node-builtin-stub.mjs");

export function coffeescriptNodeBuiltinStubs() {
  return {
    name: "coffeescript-node-builtin-stubs",
    setup(build) {
      build.onResolve({ filter: /^(fs|vm|path)$/ }, (args) => {
        if (args.importer.replace(/\\/g, "/").includes("/coffeescript/")) {
          return { path: STUB };
        }
        return { external: true };
      });
    },
  };
}

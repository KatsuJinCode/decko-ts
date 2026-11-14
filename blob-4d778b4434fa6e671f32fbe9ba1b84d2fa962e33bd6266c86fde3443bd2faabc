// Node-host CoffeeScript compiler: the npm coffeescript@1.12.2 package,
// pinned to the version the asset pipeline expects so compiled output does
// not shift under an unrelated dependency bump.
//
// The compile is synchronous (the npm compile is); a host without a Node
// module system never imports this file — the engine receives the compiler
// through its coffeeCompiler option and refuses saves that would need it.

import { compile as coffeeCompile } from "coffeescript";
import type { CoffeeCompiler } from "../card/assets/coffee-compiler.js";

/** The CoffeeCompiler a Node host passes to the write engines. */
export function coffeeNpmCompiler(): CoffeeCompiler {
  return (script: string, noWrap: boolean) => coffeeCompile(script, { bare: noWrap });
}

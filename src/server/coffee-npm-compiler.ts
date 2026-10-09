// Node-host CoffeeScript compiler: the npm coffeescript@1.12.2 package, the
// same compiler the Ruby oracle's coffee-script-source 1.12.2 gem bundles
// (the Ruby wrapper maps no_wrap: to the JS compiler's {bare:} option —
// src/card/mod-loader/sassc-coffeescript-compile-engines.ts, oracle-pinned).
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

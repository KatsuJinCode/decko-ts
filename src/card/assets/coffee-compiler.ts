// The CoffeeScript compile seam of the write path: ::CoffeeScript.compile
// script, no_wrap: bare_compile (card-mod-script 02_coffee_script.rb:26-27),
// as the script asset inputs and the validate_coffeescript_syntax event call
// it. Ruby compiles CoffeeScript with coffee-script-source 1.12.2 through
// ExecJS; the npm coffeescript@1.12.2 package is the same compiler at the
// same version, so the emitted bytes agree (see
// src/card/mod-loader/sassc-coffeescript-compile-engines.ts).
//
// A host passes the compiler it has:
//   - Node hosts: coffeeNpmCompiler (src/server/coffee-npm-compiler.ts).
//   - Edge runtimes have none today; a save that would compile CoffeeScript
//     there is refused with a named error before anything is written, as a
//     stylesheet rebuild is refused without the SCSS compiler.

/** Compile CoffeeScript source to JavaScript; throws on a syntax error, as
 *  Ruby's compile_coffee raises Card::Error from the ExecJS failure. */
export type CoffeeCompiler = (script: string, noWrap: boolean) => string;

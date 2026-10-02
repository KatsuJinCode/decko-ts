// Type declaration for the `coffeescript` npm package pinned at 1.12.2 (the
// compile-engines lane's disclosed dependency add). The 1.12.2 package
// predates TypeScript and ships no types; it is a CommonJS module whose
// export is the CoffeeScript compiler object. Only the surface the compile
// engines use is declared.
//
// Version provenance: the oracle deck compiles through the Ruby
// coffee-script 2.4.1 gem wrapping coffee-script-source **1.12.2** - the
// SAME compiler the npm `coffeescript@1.12.2` package ships. Byte parity is
// capture-verified (tests/card/mod-loader/compile-engines-pin.test.ts,
// fixtures/captured/compile-engines.json).
declare module "coffeescript" {
  /** CoffeeScript.compile(script, options) - compiles CoffeeScript source to
   *  JavaScript. `bare` (the Ruby wrapper's no_wrap:) omits the
   *  safety-var wrapper / function envelope. Throws SyntaxError with a
   *  .location on compile errors. */
  export function compile(
    script: string,
    options?: { bare?: boolean },
  ): string;
}

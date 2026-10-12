// Type declaration for the `coffeescript` npm package pinned at 1.12.2.
// The 1.12.2 package
// predates TypeScript and ships no types; it is a CommonJS module whose
// export is the CoffeeScript compiler object. Only the surface the compile
// engines use is declared.
//
// Version provenance: 1.12.2 is the version the asset pipeline expects, so
// compiled output does not shift under an unrelated dependency bump.
declare module "coffeescript" {
  /** CoffeeScript.compile(script, options) - compiles CoffeeScript source to
   *  JavaScript. `bare` omits the safety-var wrapper / function envelope.
   *  Throws SyntaxError with a .location on compile errors. */
  export function compile(
    script: string,
    options?: { bare?: boolean },
  ): string;
}

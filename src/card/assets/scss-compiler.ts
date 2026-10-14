// The SCSS compile seam of the write path: SassC::Engine.new(source, style:)
// .render, as card-mod-style calls it (set/abstract/01_css.rb compile: style
// :compressed whatever style is asked for; 02_scss.rb compile_scss).
//
// Ruby compiles SCSS with LibSass 3.6.4 (sassc-ruby 2.4.0). Only LibSass
// reproduces its output byte for byte: Dart Sass differs in number
// and colour formatting, declaration order after nested rules, selector
// order and more, so a large real-world stylesheet diverges across many
// regions. A host therefore passes the compiler it has:
//
//   - Node hosts: libsassProcessCompiler (src/server/libsass-process.ts),
//     the LibSass sources built as a program (tools/libsass/).
//   - Edge runtimes: libsassWasmCompiler (src/server/libsass-wasm.ts), the
//     same sources built to a WebAssembly module (tools/libsass/build-wasm.mjs,
//     vendored under vendor/libsass-wasm/). Both produce LibSass's bytes; the
//     edge byte-identity pin is not in this tree.

export type ScssOutputStyle = "nested" | "expanded" | "compact" | "compressed";

/** Compile SCSS source; resolves to the CSS, rejects with the compiler's
 *  error message. An empty source compiles to "" (SassC returns an empty
 *  template unchanged). */
export type ScssCompiler = (source: string, style: ScssOutputStyle) => Promise<string>;

/** Wrap a compiler so a repeated (source, style) pair answers from memory.
 *
 *  A LibSass compile is a pure function of its source and output style, so
 *  the same input always yields the same bytes and the answer may be reused.
 *  The asset refresh that runs on a request re-stores every bundle it
 *  outputs, and each store compiles the site stylesheet's input again: one
 *  first page view compiles the same ~480 KB input 19 times (battery GET /,
 *  three distinct inputs across 22 compiles). Ruby recompiles each time; the
 *  bytes it stores are the same, so the memo changes no output.
 *
 *  Only the last `maxEntries` results are kept, so the memo's size is bounded
 *  on an edge isolate too. A compile that rejects is not kept, and a repeat
 *  of a compile still in flight shares its promise. */
export function memoizeScssCompiler(compile: ScssCompiler, maxEntries = 8): ScssCompiler {
  const memo = new Map<string, Promise<string>>();
  return (source, style) => {
    const key = `${style}\u0000${source}`;
    const known = memo.get(key);
    if (known !== undefined) {
      // most recently used moves to the end of the Map's insertion order
      memo.delete(key);
      memo.set(key, known);
      return known;
    }
    const pending = compile(source, style);
    memo.set(key, pending);
    if (memo.size > maxEntries) {
      const oldest = memo.keys().next().value;
      if (oldest !== undefined) memo.delete(oldest);
    }
    pending.catch(() => {
      if (memo.get(key) === pending) memo.delete(key);
    });
    return pending;
  };
}

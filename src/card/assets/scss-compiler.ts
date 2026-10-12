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
//   - Edge runtimes have no compiler today; stylesheet rebuilds there are
//     refused with a named error instead of storing a stylesheet Ruby would
//     not have stored.

export type ScssOutputStyle = "nested" | "expanded" | "compact" | "compressed";

/** Compile SCSS source; resolves to the CSS, rejects with the compiler's
 *  error message. An empty source compiles to "" (SassC returns an empty
 *  template unchanged). */
export type ScssCompiler = (source: string, style: ScssOutputStyle) => Promise<string>;

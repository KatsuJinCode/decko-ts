// The JavaScript compression seam of the write path: the compress arm of
// card-mod-script's js :compressed view (set/abstract/00_script.rb:9-30).
//
//   view :compressed  ->  comment_with_source(compress(_render_core))
//   compress input    ->  compress? ? try_compress(input) : input
//   try_compress      ->  Uglifier.new(harmony: true).compile(input)
//   compress?         ->  Cardio.config.compress_assets
//
// compress_assets is true by default (card-1.110.0 lib/cardio/railtie.rb:35)
// and only the development environment turns it off
// (config/environments/development.rb:11), so a deployed deck stores and
// serves its script asset inputs and outputs minified, one leaf at a time.
//
// A host that runs compress_assets true passes the compressor it has:
//   - Node hosts: uglifyHarmonyCompile
//     (src/card/assets/uglify-harmony-compile-engine.ts), the five files the
//     uglifier-4.2.1 gem loads into ExecJS, vendored verbatim and run in a
//     Node vm with the option hash Uglifier.new(harmony: true) builds. Ruby's
//     ExecJS runs the same JavaScript (on Node, its runtime wherever Node is
//     installed), so the output is the same bytes.
//   - Edge runtimes can use uglify-harmony-static.ts: the same snapshot's
//     trusted constructors are precompiled at build time. Current edge
//     hosts keep compress_assets false; syntax validation is independent.

/** Minify one script leaf's core; throws on a parse error, as Uglifier
 *  raises Uglifier::Error. */
export type ScriptCompressor = (js: string) => string;

/** try_compress's failure (00_script.rb:25-38): the save or refresh stops with
 *  Ruby's message, "JavaScript::SyntaxError (<card name>): <uglifier message>". */
export class ScriptCompressionError extends Error {
  constructor(cardName: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`JavaScript::SyntaxError (${cardName}): ${message}`);
    this.name = "ScriptCompressionError";
  }
}

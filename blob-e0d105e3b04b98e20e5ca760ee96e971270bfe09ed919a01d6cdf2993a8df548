// Pure option projection shared by the original Node VM and static edge provider.
// uglifier-4.2.1 lib/uglifier.rb DEFAULTS, projected through run_uglifyjs's
// option hash for `Uglifier.new(harmony: true)` with no overrides:
// - output_options: DEFAULTS[:output] + comments: :copyright encoded as
//   encode_regexp(/(^!)|Copyright/i) = ["(^!)|Copyright", "i"] (the JS
//   wrapper builds the RegExp) + quote_style: 0.
// - compressor_options: DEFAULTS[:compress] + global_defs: {} + keep_fnames:
//   false (negate_iife_block is empty — wrap_iife is false).
// - mangle_options: DEFAULTS[:mangle] + keep_fnames: false + properties:
//   false (MANGLE_PROPERTIES_DEFAULTS under conditional_option(false)).
// - parse_options: DEFAULTS[:parse] (no source-map filename merge).
// - source_map_options: SOURCE_MAP_DEFAULTS projected (source_map: false).
// - ie8: DEFAULTS[:ie8] = true.
const COMPRESS_DEFAULTS = {
  sequences: true,
  properties: true,
  dead_code: true,
  drop_debugger: true,
  unsafe: false,
  unsafe_comps: false,
  unsafe_math: false,
  unsafe_proto: false,
  conditionals: true,
  comparisons: true,
  evaluate: true,
  booleans: true,
  loops: true,
  unused: true,
  toplevel: false,
  top_retain: [] as string[],
  hoist_funs: true,
  hoist_vars: false,
  if_return: true,
  join_vars: true,
  collapse_vars: true,
  reduce_funcs: false,
  reduce_vars: false,
  negate_iife: true,
  pure_getters: false,
  pure_funcs: null,
  drop_console: false,
  keep_fargs: false,
  keep_fnames: false,
  passes: 1,
  keep_infinity: false,
  side_effects: true,
  switches: true,
};

/** The exact option hash run_uglifyjs builds (uglifier.rb:208-222), as JSON
 *  (ExecJS serializes the same shape; arrays stay arrays so the wrapper's
 *  comments() builds the RegExp). */
export function uglifierOptionsFor(source: string) {
  return {
    source,
    output: {
      ascii_only: true,
      comments: ["(^!)|Copyright", "i"],
      inline_script: false,
      quote_keys: false,
      max_line_len: 32 * 1024,
      bracketize: false,
      semicolons: true,
      preserve_line: false,
      beautify: false,
      indent_level: 4,
      indent_start: 0,
      width: 80,
      preamble: null,
      wrap_iife: false,
      shebang: true,
      quote_style: 0,
      keep_quoted_props: false,
    },
    compress: { ...COMPRESS_DEFAULTS, global_defs: {}, keep_fnames: false },
    mangle: {
      eval: false,
      reserved: ["$super"],
      properties: false,
      toplevel: false,
      keep_fnames: false,
    },
    parse: {
      bare_returns: false,
      expression: false,
      html5_comments: true,
      shebang: true,
      strict: false,
    },
    sourceMap: {
      input: null,
      filename: null,
      root: null,
      content: null,
      url: false,
      includeSources: false,
    },
    ie8: true,
  };
}

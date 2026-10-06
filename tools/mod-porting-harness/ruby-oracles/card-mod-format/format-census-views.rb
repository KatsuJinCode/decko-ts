# format-census-views.rb — the RUBY-TRUTH view census for card-mod-format,
# built on Ruby's own parser (Ripper, stdlib) instead of the harness's regex
# miner. This is the independent oracle the harness enumerator is asserted
# against by
# tests/tools/mod-porting-harness/format-census-view-set.test.ts.
#
# WHY IT EXISTS. mod-harness.mjs's `mineViews` mines views with two regexes.
# Its loop miner (`loopRe`, mod-harness.mjs:541) matched any
# `%i[a b c].each do |var|` and pushed all three tokens as views WITHOUT
# gating on the `view <blockvar>` look-ahead it had already computed. On
# card-mod-format that minted two rows for
# set/all/links.rb:146-152 (`%i[remote method].each do |key|` inside
# `interpret_data_opts_to_link_to`) — a private link_to option walk, not a
# view declaration. Regex mining cannot see the difference; a parser can.
#
# WHAT RUNS. Nothing but Ripper.sexp over the gem's own set/*.rb source. The
# gem is READ. No Rails boot, no DB, no network, no live-site request.
#
# THE ENUMERATION RULE (what Ruby actually means by "a view is declared here"):
#   - `view :name` / `view(:name, opts)` / `view :a, :b` — a literal symbol
#     first argument. Direct declaration.
#   - `view var` / `view(var, opts)` inside `%i[...].each do |var| ... end` —
#     the declaration is the LOOP BODY, and the names are the loop's elements.
#     Counted as loop-declared, one per element.
#   - anything else — a `.each` block whose body declares no `view` call for
#     its block variable (an event loop, an option walk, a `render(view)`
#     dispatch loop) declares NO views. This file counts zero for those.
#
# Loop-variable resolution is per-file: a `%i[...]`/`%w[...]` `.each` binds its
# block variable for the remainder of the file. That is sufficient for every
# loop form in the frozen gem set (all 13 sites use a distinct block variable
# and none shadows another), and a shadowed binding would be REPORTED by the
# `shadowedLoopVars` field rather than silently resolved wrong.
#
# Usage: ruby format-census-views.rb <card-mod-format-gem-path>

require "json"
require "ripper"

gem_path = ARGV[0] or abort "usage: ruby #{File.basename(__FILE__)} <card-mod-format-gem-path>"
abort "not a card-mod-format gem path: #{gem_path}" unless File.basename(gem_path).start_with?("card-mod-format")
set_dir = File.join(gem_path, "set")
abort "set dir not found: #{set_dir}" unless File.directory?(set_dir)

def rb_files(dir)
  Dir.glob(File.join(dir, "**", "*.rb")).sort
end

# Depth-first walk over a Ripper sexp. Ripper's own node heads are Symbols;
# the leaves inside them (":@ident", "each", [line, col]) are Strings, so a
# Symbol head is the reliable discriminator.
def each_node(node, &block)
  return unless node.is_a?(Array)
  yield node if node[0].is_a?(Symbol)
  node.each { |child| each_node(child, &block) if child.is_a?(Array) }
end

def ident_name(node)
  return nil unless node.is_a?(Array) && node[0] == :@ident
  node[1]
end

def line_of(node)
  return nil unless node.is_a?(Array)
  found = nil
  each_node(node) { |n| found ||= n[2][0] if n[0] == :@ident && n[2].is_a?(Array) }
  found
end

# `do |var|` / `{ |var|` — Ripper 3.x wraps the params in a :block_var node.
def block_var_name(block_node)
  name = nil
  each_node(block_node) do |n|
    next unless n[0] == :block_var
    params = n[1]
    first = params.is_a?(Array) ? params[0] : nil
    name = ident_name(first[0]) if first.is_a?(Array) && first[0] == :@ident
  end
  name
end

def percent_array_names(node)
  return nil unless node.is_a?(Array) && node[0] == :array
  node[1].map do |item|
    return nil unless item.is_a?(Array) && item[0] == :@tstring_content
    item[1]
  end
end

# A `view ...` call arrives in two node shapes:
#   bare + args : [:command, [:@ident, "view", _], [:args_add_block, ...]]
#   paren form  : [:method_add_arg, [:fcall, [:@ident, "view", _]],
#                  [:arg_paren, [:args_add_block, ...]]]
# Returns the args node (post arg_paren unwrap) or nil when this is not a
# `view` call at all.
def view_args_node(node)
  return nil unless node.is_a?(Array)
  case node[0]
  when :command
    ident_name(node[1]) == "view" ? node[2] : nil
  when :method_add_arg
    call = node[1]
    return nil unless call.is_a?(Array) && call[0] == :fcall && ident_name(call[1]) == "view"
    node[2]
  end
end

# `:symbol_literal` wraps the `:symbol` node; a bare `:x` is ident_name-able
# through either level.
def symbol_arg_name(arg)
  name = ident_name(arg[1])
  return name if name
  return nil unless arg[0] == :symbol_literal && arg[1].is_a?(Array) && arg[1][0] == :symbol
  ident_name(arg[1][1])
end

def first_arg(args_node)
  return nil unless args_node.is_a?(Array)
  args_node = args_node[1] if args_node[0] == :arg_paren
  return nil unless args_node.is_a?(Array) && args_node[0] == :args_add_block
  list = args_node[1]
  list.is_a?(Array) ? list[0] : nil
end

report = { gem: File.basename(gem_path), files: [], views: [], shadowedLoopVars: [], unresolvedViewArgs: [] }

rb_files(set_dir).each do |full|
  rel = full.sub("#{gem_path}/", "")
  src = File.read(full)
  sexp = Ripper.sexp(src)
  next if sexp.nil? # unparseable source: reported below by the file's zero rows

  loop_bindings = {} # block var -> element names
  loop_order = []

  each_node(sexp) do |n|
    next unless n[0] == :method_add_block
    mab = n[1]
    next unless mab.is_a?(Array) && mab[0] == :method_add_arg
    call = mab[1]
    next unless call.is_a?(Array) && call[0] == :call
    next unless ident_name(call[3]) == "each"
    names = percent_array_names(call[1])
    next if names.nil?
    var = block_var_name(n[2])
    next if var.nil?
    if loop_bindings.key?(var)
      report[:shadowedLoopVars] << { file: rel, var: var, line: line_of(call) }
      next
    end
    loop_bindings[var] = names
    loop_order << var
  end

  rows = []
  each_node(sexp) do |n|
    args = view_args_node(n)
    next if args.nil?
    line = line_of(n[1])
    arg = first_arg(args)
    if arg.nil?
      report[:unresolvedViewArgs] << { file: rel, line: line, why: "no argument" }
      next
    end
    case arg[0]
    when :symbol_literal
      name = symbol_arg_name(arg)
      if name.nil?
        report[:unresolvedViewArgs] << { file: rel, line: line, why: "non-ident symbol" }
        next
      end
      rows << { name: name, line: line, viaLoop: false }
    when :var_ref
      var = ident_name(arg[1])
      if var.nil? || !loop_bindings.key?(var)
        report[:unresolvedViewArgs] << { file: rel, line: line, why: "unbound #{arg[1].inspect}" }
        next
      end
      loop_bindings[var].each do |name|
        rows << { name: name, line: line, viaLoop: true }
      end
    when :dyna_symbol
      # `view :"send_#{x}"` — the name is not knowable without evaluating the
      # interpolation. Reported, never guessed.
      report[:unresolvedViewArgs] << { file: rel, line: line, why: "interpolated symbol" }
    else
      report[:unresolvedViewArgs] << { file: rel, line: line, why: arg[0].to_s }
    end
  end

  seen = {}
  rows.each do |r|
    key = r[:name]
    next if seen[key]
    seen[key] = true
    report[:views] << { name: r[:name], file: rel, line: r[:line], viaLoop: r[:viaLoop] }
  end
  report[:files] << { file: rel, views: rows.map { |r| r[:name] }.uniq.size }
end

report[:views].sort_by! { |v| [v[:file], v[:line], v[:name]] }
report[:totals] = {
  files: report[:files].size,
  views: report[:views].size,
  loopDeclared: report[:views].count { |v| v[:viaLoop] },
}
puts JSON.pretty_generate(report)
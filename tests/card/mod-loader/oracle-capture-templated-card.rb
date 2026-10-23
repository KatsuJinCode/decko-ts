# oracle-capture-templated-card.rb - the pinned Ruby's own bytes for the
# templated-card contract (registry row cap-C13, "Create and edit a templated
# card").
#
# The row's contract: a Cardtype whose structure rule names a templated right
# creates a card whose nested subcard arrives PRE-FILLED with the right's
# template, and the nested subcard can then be edited in place. Four pinned
# files own that contract:
#
#   1. card-mod-content-0.20.0/set/abstract/templated_nests.rb - the abstract
#      set module: the core view renders in :template nest mode.
#   2. card-mod-content-0.20.0/set/right/default.rb - the *default rule's
#      right set: it includes the abstract, so a *default rule's body renders
#      as a template.
#   3. card-mod-content-0.20.0/set/right/structure.rb - the *structure rule's
#      right set: the same include, for the structure side.
#   4. card-mod-edit-0.20.0/set/all/template_nest.rb - the template nest
#      view: a field-only nest renders the SET card's own template link, and
#      any other nest renders its syntax for the template renderer.
#
# The capture records the pinned files' own bytes for those owners, the line
# ranges, the files' SHA-256 digests, and the facts the contract is written
# in. It performs ZERO writes and reads NO deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-templated-card.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "templated-card.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "templated_nests", gem: "card-mod-content-0.20.0", path: "set/abstract/templated_nests.rb",
    marker: "with_nest_mode :template", before: 2, after: 3 },
  { key: "default_right", gem: "card-mod-content-0.20.0", path: "set/right/default.rb",
    marker: "include_set Abstract::TemplatedNests", before: 0, after: 2 },
  { key: "structure_right", gem: "card-mod-content-0.20.0", path: "set/right/structure.rb",
    marker: "include_set Abstract::TemplatedNests", before: 0, after: 2 },
  { key: "template_nest_view", gem: "card-mod-edit-0.20.0", path: "set/all/template_nest.rb",
    marker: "view :template_nest", before: 1, after: 10 }
].freeze

def deep_sort(obj)
  case obj
  when Hash
    obj.keys.sort_by(&:to_s).each_with_object({}) { |k, h| h[k.to_s] = deep_sort(obj[k]) }
  when Array
    obj.map { |v| deep_sort(v) }
  else
    obj
  end
end

def capture_owner(owner)
  file = File.join(GEM_HOME, owner[:gem], owner[:path])
  raise "oracle gem file not present: #{file}" unless File.file?(file)
  lines = File.readlines(file, chomp: true)
  index = lines.index { |line| line.include?(owner[:marker]) }
  raise "oracle marker not present in #{owner[:gem]}/#{owner[:path]}: #{owner[:marker]}" if index.nil?
  first = [index - owner[:before], 0].max
  last = [index + owner[:after], lines.length - 1].min
  {
    "gem" => owner[:gem],
    "path" => owner[:path],
    "marker" => owner[:marker],
    "marker_line" => index + 1,
    "first_line" => first + 1,
    "last_line" => last + 1,
    "source" => lines[first..last].join("\n"),
    "file_sha256" => Digest::SHA256.hexdigest(File.binread(file))
  }
end

oracle = OWNERS.each_with_object({}) { |owner, h| h[owner[:key]] = capture_owner(owner) }

facts = {
  "template_mode" => oracle["templated_nests"]["source"][/with_nest_mode :template/, 0],
  "default_rule_include" => oracle["default_right"]["source"][/include_set Abstract::TemplatedNests/, 0],
  "structure_rule_include" => oracle["structure_right"]["source"][/include_set Abstract::TemplatedNests/, 0],
  "field_only_arm" => oracle["template_nest_view"]["source"][/with_nest_mode :normal/, 0],
  "syntax_arm" => oracle["template_nest_view"]["source"][/\{\{#\{voo\.nest_syntax\}\}\}/, 0]
}

raise "the pinned template mode was not found in the captured bytes" if facts["template_mode"].nil?
raise "the pinned *default rule's include was not found in the captured bytes" if facts["default_rule_include"].nil?
raise "the pinned *structure rule's include was not found in the captured bytes" if facts["structure_rule_include"].nil?
raise "the pinned field-only arm was not found in the captured bytes" if facts["field_only_arm"].nil?
raise "the pinned syntax arm was not found in the captured bytes" if facts["syntax_arm"].nil?

payload = {
  "contract" => "A Cardtype whose structure rule names a templated right creates a card whose nested subcard arrives pre-filled, and the nested subcard can be edited in place.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"

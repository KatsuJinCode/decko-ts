# oracle-capture-rule-default-content.rb - the pinned Ruby's own bytes for the
# rule-default content (registry row cap-C14, "Default content from a rule
# fills the new form").
#
# The row's contract: a card that carries a right whose *right+*default rule
# holds content gets that content in its new form. Three pinned files own that
# contract:
#
#   1. card-1.110.0/lib/card/rule/all.rb - rule(setting_code), the accessor
#      that returns the rule card a setting code names.
#   2. card-1.110.0/mod/core/set/all/content.rb - standard_db_content, the
#      branch that decides which content a card carries (a structured card
#      keeps its own db_content).
#   3. card-mod-edit-0.20.0/set/all/editor.rb - text_area_input, the editor's
#      own input, the field the default content fills.
#
# The capture records the pinned files' own bytes for those owners, the line
# ranges, the files' SHA-256 digests, and the facts the contract is written
# in. It performs ZERO writes and reads NO deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-rule-default-content.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "rule-default-content.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "rule_accessor", gem: "card-1.110.0", path: "lib/card/rule/all.rb",
    marker: "def rule setting_code", before: 2, after: 18 },
  { key: "standard_db_content", gem: "card-1.110.0", path: "mod/core/set/all/content.rb",
    marker: "def standard_db_content", before: 2, after: 9 },
  { key: "editor_input", gem: "card-mod-edit-0.20.0", path: "set/all/editor.rb",
    marker: "def text_area_input", before: 2, after: 6 }
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

rule_source = oracle["rule_accessor"]["source"]
editor_source = oracle["editor_input"]["source"]

facts = {
  "rule_accessor" => rule_source[/def rule setting_code/, 0],
  "rule_returns_a_rule_card" => rule_source.include?("rule_card") ? "rule_card" : nil,
  "editor_field" => editor_source[/text_area :content/, 0],
  "editor_field_name" => "card[content]"
}

raise "the pinned rule accessor was not found in the captured bytes" if facts["rule_accessor"].nil?
raise "the pinned rule accessor does not reach a rule card in the captured bytes" if facts["rule_returns_a_rule_card"].nil?
raise "the pinned editor's field was not found in the captured bytes" if facts["editor_field"].nil?

payload = {
  "contract" => "A card that carries a right whose *right+*default rule holds content gets that content in its new form.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"

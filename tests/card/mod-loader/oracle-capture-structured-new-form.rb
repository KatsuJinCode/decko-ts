# oracle-capture-structured-new-form.rb - the pinned Ruby's own bytes for the
# structured-card new form (registry row cap-C12, "Create a new structured
# card with its subcards (New structured card)").
#
# The row's contract: a cardtype whose structure rule names its subcards
# (the deck's own example is {{+director}} {{+lead}}) offers those subcards
# on its new form. Three pinned files own that contract:
#
#   1. card-1.110.0/mod/core/set/all/content.rb - standard_db_content: a
#      card WITH a structure keeps its own db_content and does not take the
#      structure's content over it.
#   2. card-1.110.0/mod/core/set/all/subcards.rb - the subcard surface the
#      structure's subcards live in.
#   3. card-mod-edit-0.20.0/set/all/form.rb - content_field, the form region
#      that renders the content (and the structure's subcards) on a new card.
#
# The capture records the pinned files' own bytes for those owners, the line
# ranges, the files' SHA-256 digests, and the facts the contract is written
# in. It performs ZERO writes and reads NO deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-structured-new-form.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "structured-new-form.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "standard_db_content", gem: "card-1.110.0", path: "mod/core/set/all/content.rb",
    marker: "def standard_db_content", before: 2, after: 9 },
  { key: "subcards_surface", gem: "card-1.110.0", path: "mod/core/set/all/subcards.rb",
    marker: "event :reject_empty_subcards", before: 0, after: 10 },
  { key: "content_field", gem: "card-mod-edit-0.20.0", path: "set/all/form.rb",
    marker: "def content_field", before: 2, after: 12 }
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

content_source = oracle["standard_db_content"]["source"]
form_source = oracle["content_field"]["source"]

facts = {
  "structure_branch" => content_source[/if structure/, 0],
  "structure_content_rule" => content_source[/do not override db_content with content from structure/, 0],
  "form_content_region" => form_source[/def content_field/, 0],
  "form_renders_content" => form_source.include?("_render_input") ? "_render_input" : nil
}

raise "the pinned structure branch was not found in the captured bytes" if facts["structure_branch"].nil?
raise "the pinned structure content rule was not found in the captured bytes" if facts["structure_content_rule"].nil?
raise "the pinned form's content region was not found in the captured bytes" if facts["form_content_region"].nil?
raise "the pinned form does not render the content input in the captured bytes" if facts["form_renders_content"].nil?

payload = {
  "contract" => "A cardtype whose structure rule names its subcards offers those subcards on its new form.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"

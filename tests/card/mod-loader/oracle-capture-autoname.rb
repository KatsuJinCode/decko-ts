# oracle-capture-autoname.rb - the pinned Ruby's own bytes for the autoname
# contract (registry row cap-C11, "Autoname cardtype (name generated on
# save)").
#
# The row's contract: a cardtype whose type-set autoname rule is filled
# generates the card's NAME on save, and the new-card form does not ask for a
# name it will not use. Three pinned files own that contract:
#
#   1. card-1.110.0/mod/core/set/all/autoname.rb - the event that sets the
#      name when the card is stored (on: :create, when: :autoname?) and the
#      autoname? predicate (a blank name AND a present autoname rule).
#   2. card-1.110.0/lib/card/name/all.rb - the name generator itself: a name
#      that exists (or is claimed by the Director) advances to name.next.
#   3. card-mod-edit-0.20.0/set/all/new.rb - needs_name?, the predicate that
#      decides whether the new form asks for a name at all, and new_view_name,
#      which renders the hidden card[name] field only when the card is not
#      autonamed.
#
# The capture records the pinned files' own bytes for those owners, the line
# ranges, the files' SHA-256 digests, and the three facts the contract is
# written in. It performs ZERO writes and reads NO deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-autoname.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "autoname.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "set_autoname_event", gem: "card-1.110.0", path: "mod/core/set/all/autoname.rb",
    marker: "event :set_autoname", before: 0, after: 16 },
  { key: "name_generator", gem: "card-1.110.0", path: "lib/card/name/all.rb",
    marker: "def autoname name", before: 1, after: 7 },
  { key: "needs_name", gem: "card-mod-edit-0.20.0", path: "set/all/new.rb",
    marker: "def needs_name?", before: 2, after: 3 },
  { key: "new_view_name", gem: "card-mod-edit-0.20.0", path: "set/all/new.rb",
    marker: "def new_view_name", before: 2, after: 8 }
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

event_source = oracle["set_autoname_event"]["source"]
generator_source = oracle["name_generator"]["source"]
needs_source = oracle["needs_name"]["source"]

facts = {
  "autoname_event" => event_source[/event :set_autoname,.*$/],
  "autoname_predicate" => event_source[/def autoname\?.*?end/m],
  "name_advance" => generator_source[/autoname name\.next/, 0],
  "needs_name_predicate" => needs_source[/card\.name\.blank\? && !autoname\?/, 0]
}

raise "the pinned set_autoname event was not found in the captured bytes" if facts["autoname_event"].nil?
raise "the pinned autoname? predicate was not found in the captured bytes" if facts["autoname_predicate"].nil?
raise "the pinned name advance was not found in the captured bytes" if facts["name_advance"].nil?
raise "the pinned needs_name? predicate was not found in the captured bytes" if facts["needs_name_predicate"].nil?

payload = {
  "contract" => "A cardtype with a type-set autoname rule generates the card's name on save, and the new form does not ask for a name it will not use.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"

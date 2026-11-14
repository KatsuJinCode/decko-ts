# oracle-capture-new-card-types.rb - the pinned Ruby's own bytes for the
# TYPED NEW-CARD CREATES of a Basic and a Date card (registry row cap-C2,
# "Create a Basic and a Date card through /new/<Type>").
#
# The row's contract: the typed new-card route opens the create form for that
# card type, the create is STORED as a card of that type, and the browser
# lands on the card it made. Five pinned files own it:
#
#   1. card-mod-format-0.20.0/set/type/basic.rb - THE BASIC TYPE: the whole
#      file is `def pod_type; nil; end` - the Basic card has no pod, and
#      every one of its renders comes from the All::* sets.
#   2. card-mod-date-0.20.0/set/type/date.rb - THE DATE TYPE: `input_type`
#      is `:calendar`, and the :core view renders
#      `::Date.parse(card.content).strftime "%B %-d, %Y"`.
#   3. card-mod-format-0.20.0/lib/card/path.rb - THE ROUTE'S SHAPE:
#      `new_cardtype` renders `"#{action}/#{mark}#{query}"`, so the typed
#      new-card route is "new/<mark>" for every type.
#   4. card-mod-edit-0.20.0/set/all/new.rb - THE CREATE FORM: the :new view
#      is gated on `perms: :create`, and `new_success` is
#      `{ mark: card.rule(:thanks) || "_self" }` - the card itself when no
#      thanks rule answers.
#   5. card-1.110.0/lib/card/env/success/target.rb - THE TARGET: a name
#      target is the card with that name.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-new-card-types.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "new-card-types.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "basic_type",
    gem: "card-mod-format-0.20.0",
    path: "set/type/basic.rb",
    marker: "def pod_type", before: 0, after: 2 },
  { key: "date_input_type",
    gem: "card-mod-date-0.20.0",
    path: "set/type/date.rb",
    marker: "def input_type", before: 1, after: 3 },
  { key: "date_core_view",
    gem: "card-mod-date-0.20.0",
    path: "set/type/date.rb",
    marker: "view :core do", before: 0, after: 2 },
  { key: "new_cardtype",
    gem: "card-mod-format-0.20.0",
    path: "lib/card/path.rb",
    marker: "def new_cardtype", before: 0, after: 6 },
  { key: "new_view",
    gem: "card-mod-edit-0.20.0",
    path: "set/all/new.rb",
    marker: "view :new, perms: :create, unknown: true, cache: :never do", before: 0, after: 2 },
  { key: "new_success",
    gem: "card-mod-edit-0.20.0",
    path: "set/all/new.rb",
    marker: "def new_success", before: 0, after: 2 },
  { key: "success_target_card",
    gem: "card-1.110.0",
    path: "lib/card/env/success/target.rb",
    marker: "def card name_context=@name_context", before: 0, after: 8 }
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

basic = oracle["basic_type"]["source"]
date_input = oracle["date_input_type"]["source"]
date_core = oracle["date_core_view"]["source"]
cardtype = oracle["new_cardtype"]["source"]
view = oracle["new_view"]["source"]
success = oracle["new_success"]["source"]
target_card = oracle["success_target_card"]["source"]

facts = {
  # THE BASIC TYPE
  "basic_pod_type_method" => basic[/def pod_type/, 0],
  "basic_pod_type_value" => basic[/nil/, 0],
  # THE DATE TYPE
  "date_input_type_method" => date_input[/def input_type/, 0],
  "date_input_type_value" => date_input[/:calendar/, 0],
  "date_core_view" => date_core[/view :core do/, 0],
  "date_core_render" => date_core[/::Date\.parse\(card\.content\)\.strftime "%B %-d, %Y"/, 0],
  # THE ROUTE'S SHAPE
  "new_cardtype_path" => cardtype[/"\#\{action\}\/\#\{mark\}\#\{query\}"/, 0],
  "new_cardtype_guard" => cardtype[/return unless action\.in\?\(%i\[new type\]\) && mark\.present\?/, 0],
  # THE CREATE FORM
  "new_view" => view[/view :new, perms: :create, unknown: true, cache: :never do/, 0],
  "new_success" => success[/\{ mark: card\.rule\(:thanks\) \|\| "_self" \}/, 0],
  # THE TARGET
  "success_target_card_fetch" => target_card[/Card\.fetch @name\.to_name\.absolute\(name_context\), new: @new_args/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured Basic type is not Ruby's own" unless basic.include?("def pod_type") && basic.include?("nil")
raise "the captured Date input type is not Ruby's own" unless date_input.include?(":calendar")
raise "the captured Date core view is not Ruby's own" unless date_core.include?("::Date.parse(card.content).strftime")
raise "the captured path is not action/mark" unless cardtype.include?("\"\#{action}/\#{mark}\#\{query}\"")
raise "the captured view is not gated on create" unless view.include?("perms: :create")
raise "the captured success mark is not the card itself" unless success.include?("card.rule(:thanks) || \"_self\"")
raise "the captured target does not fetch the named card" unless target_card.include?("Card.fetch @name.to_name.absolute(name_context)")

payload = {
  "contract" => "The typed new-card route opens the create form for that card type, the create is stored as a card of that type, and the browser lands on the card it made.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"

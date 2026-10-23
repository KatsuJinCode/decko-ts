# oracle-capture-edit-type-in-board.rb - the pinned Ruby's own bytes for
# the BOARD TYPE CHANGE (registry row cap-E12, "Edit type of a card in the
# board": a card's stored type becomes Book).
#
# The row's contract: a card's type can be changed in the board, and the
# card's STORED type becomes the chosen one. Five pinned files own it:
#
#   1. card-mod-edit-0.20.0/set/all/edit_type.rb - the BOARD half:
#      :edit_type_row (:18-22) renders the board's "Type" row (the
#      read-only `edit_row "Type", link_to_card(card.type),
#      :board_type_formgroup` arm), :board_type_formgroup (:24-31) renders
#      the LIVE type select in the board's slot, :type_formgroup (:37-42)
#      adds the "type-field" class and wraps the field, :type_field
#      (:44-48) is the select itself (`action_view.select_tag "card[type]",
#      type_field_options, args.merge("data-select2-id": ...)`), :raw_type_options
#      (:52-62) is the createable list PLUS the current type pushed for a
#      real card, :type_field_options (:70-76) picks the simple or the
#      grouped arm, and :current_type_value (:86-90) is the card's own
#      type_name_or_default.
#   2. card-1.110.0/mod/core/set/all/type.rb - the STORE half:
#      :validate_type (:17-24) is the :save-stage validation, `type=`
#      (:48-50) turns the chosen NAME into the type id
#      (`self.type_id = type_name.card_id`), `type_id=` (:52-54) is
#      `write_card_or_id :type_id, card_or_id`, `type_name_or_default`
#      (:40-42) is the current type's name, and `extract_type_id!` (:87-96)
#      is the arm that reads the request's own `:type` arg, with
#      `type_id_from_cardname` (:102-104) resolving the name to the id.
#   3. decko-0.20.0/lib/card_controller/rest.rb - the WRITE ROUTE: the
#      update action saves the request's own card hash through card.update!.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-edit-type-in-board.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "edit-type-in-board.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "edit_type_views", gem: "card-mod-edit-0.20.0",
    path: "set/all/edit_type.rb",
    marker: "view :edit_type_row", before: 1, after: 14 },
  { key: "edit_type_field", gem: "card-mod-edit-0.20.0",
    path: "set/all/edit_type.rb",
    marker: "def type_field args={}", before: 8, after: 48 },
  { key: "type_store", gem: "card-1.110.0",
    path: "mod/core/set/all/type.rb",
    marker: "event :validate_type, :validate", before: 0, after: 40 },
  { key: "type_extract", gem: "card-1.110.0",
    path: "mod/core/set/all/type.rb",
    marker: "def extract_type_id! args={}", before: 1, after: 25 },
  { key: "update_route", gem: "decko-0.20.0",
    path: "lib/card_controller/rest.rb",
    marker: "def update", before: 1, after: 3 }
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

views  = oracle["edit_type_views"]["source"]
field  = oracle["edit_type_field"]["source"]
store  = oracle["type_store"]["source"]
extract = oracle["type_extract"]["source"]
route  = oracle["update_route"]["source"]

facts = {
  # the BOARD half
  "edit_type_row_view" => views[/view :edit_type_row do/, 0],
  "edit_type_row_body" => views[/edit_row "Type", link_to_card\(card\.type\), :board_type_formgroup/, 0],
  "board_type_formgroup_view" => views[/view :board_type_formgroup, unknown: true, wrap: :slot do/, 0],
  "board_type_formgroup_href" => views[/view: :edit_form,/, 0],
  "board_type_formgroup_class" => views[/class: "_live-type-field",/, 0],
  "board_type_formgroup_data_remote" => views[/"data-remote": true/, 0],
  # the FIELD half
  "type_formgroup_add_class" => field[/add_class args, "type-field"/, 0],
  "type_field_select_tag" => field[/action_view\.select_tag "card\[type\]", type_field_options,/, 0],
  "type_field_args_merge" => field[/args\.merge\("data-select2-id": "\#\{unique_id\}-\#\{Time\.now\.to_i\}"\)/, 0],
  "raw_type_options_createable" => field[/options = Auth\.createable_types/, 0],
  "raw_type_options_push" => field[/options\.push\(card\.type_name\)\.sort!/, 0],
  "type_field_options_simple" => field[/options_for_select grouped_types\.flatten\[1\], current_type_value/, 0],
  "type_field_options_grouped" => field[/grouped_options_for_select grouped_types, current_type_value/, 0],
  "current_type_value" => field[/@current_type_value \|\|= card\.type_name_or_default/, 0],
  # the STORE half
  "validate_type_event" => store[/event :validate_type, :validate, changed: :type_id, on: :save do/, 0],
  "type_name_or_default" => store[/type_card\.try\(:name\) \|\| Card\.default_type_id\.cardname/, 0],
  "type_setter" => store[/self\.type_id = type_name\.card_id/, 0],
  "type_id_setter" => store[/write_card_or_id :type_id, card_or_id/, 0],
  "extract_type_id_type_arm" => extract[/when \(type_name = args\.delete :type\)/, 0],
  "type_id_from_cardname" => extract[/type_id_or_error\(type_name\) \{ type_name\.card_id \}/, 0],
  "type_id_or_error" => extract[/errors\.add :type, "\#\{val\} is not a known type\."/, 0],
  # the WRITE ROUTE
  "update_route" => route[/card\.new_card\? \? create : handle \{ card\.update! params\[:card\]&\.to_unsafe_h \}/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured board row does not render the type row" unless views.include?("edit_row \"Type\"")
raise "the captured field is not the card[type] select" unless field.include?("select_tag \"card[type]\"")
raise "the captured store does not turn a type name into a type id" unless store.include?("self.type_id = type_name.card_id")
raise "the captured route does not save the request's card hash" unless route.include?("card.update!")

payload = {
  "contract" => "A card's type can be changed in the board, and the card's stored type becomes the chosen one.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"

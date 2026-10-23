# oracle-capture-edit-type-for-new-card.rb - the pinned Ruby's own bytes for
# the NEW-CARD TYPE SELECTOR (registry row cap-E13, "Edit type for a new
# card": a /new form serves a card[type] selector the user can change).
#
# The row's contract: a /new form serves a card[type] selector the user can
# change, and the chosen type is what the new card is stored as. Four pinned
# files own it:
#
#   1. card-mod-edit-0.20.0/set/all/new.rb - the NEW half: new_view_type
#      (:128-133) renders the type formgroup when the prompt is on, else
#      the hidden card[type_id]; new_type_prompt? (:135-139) is
#      `voo.visible? :new_type_formgroup do !new_type_preset? &&
#      new_type_prompt_context? && new_type_permitted? end`;
#      new_type_preset? (:142-144) is `params[:type] || voo.type` (the
#      TYPED route presets the type, so a typed /new/:type carries no
#      selector); new_type_prompt_context? (:146-148) is `main? ||
#      card.simple? || card.is_template?`; new_type_permitted? (:150-152) is
#      `Card.new(type_id: card.type_id).ok? :create`; and the
#      :new_type_formgroup view (:154-160) is
#      `wrap_type_formgroup do type_field class: "type-field
#      _live-type-field slotter", href: path(view: :new_fields),
#      "data-remote" => true end`.
#   2. card-mod-edit-0.20.0/set/all/edit_type.rb - the SHARED FIELD:
#      type_field (:44-48) is `action_view.select_tag "card[type]",
#      type_field_options, args.merge("data-select2-id": ...)`,
#      type_field_options (:70-76) picks the simple or the grouped arm, and
#      current_type_value (:86-90) is the card's own type_name_or_default.
#   3. card-1.110.0/lib/card/fetch/card_class.rb - the FETCH: uri_fetch_opts
#      (:128-133) is `opts[:type] ||= params[:type] if params[:type]` (the
#      /new/:type shortcut) with `opts[:name] ||= Name[params[:mark]]&.tr
#      "_", " "`.
#   4. card-1.110.0/mod/core/set/all/type.rb - the STORE: `type=` (:48-50)
#      is `self.type_id = type_name.card_id`, `type_id=` (:52-54) is
#      `write_card_or_id :type_id, card_or_id`, and extract_type_id! (:87-96)
#      reads the request's own `:type` arg through type_id_from_cardname
#      (:102-104).
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-edit-type-for-new-card.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "edit-type-for-new-card.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "new_type_handling", gem: "card-mod-edit-0.20.0",
    path: "set/all/new.rb",
    marker: "def new_view_type", before: 2, after: 24 },
  { key: "new_type_formgroup", gem: "card-mod-edit-0.20.0",
    path: "set/all/new.rb",
    marker: "view :new_type_formgroup", before: 2, after: 6 },
  { key: "edit_type_field", gem: "card-mod-edit-0.20.0",
    path: "set/all/edit_type.rb",
    marker: "def type_field args={}", before: 8, after: 48 },
  { key: "uri_fetch_opts", gem: "card-1.110.0",
    path: "lib/card/fetch/card_class.rb",
    marker: "def uri_fetch_opts params", before: 1, after: 6 },
  { key: "type_store", gem: "card-1.110.0",
    path: "mod/core/set/all/type.rb",
    marker: "def type= type_name", before: 14, after: 10 },
  { key: "type_extract", gem: "card-1.110.0",
    path: "mod/core/set/all/type.rb",
    marker: "def extract_type_id! args={}", before: 1, after: 25 }
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

new_handling = oracle["new_type_handling"]["source"]
new_formgroup = oracle["new_type_formgroup"]["source"]
field  = oracle["edit_type_field"]["source"]
fetch  = oracle["uri_fetch_opts"]["source"]
store  = oracle["type_store"]["source"]
extract = oracle["type_extract"]["source"]

facts = {
  # the NEW half
  "new_view_type" => new_handling[/def new_view_type\n\s*if new_type_prompt\?\n\s*_render_new_type_formgroup\n\s*else\n\s*hidden_field_tag "card\[type_id\]", card\.type_id/, 0],
  "new_type_prompt" => new_handling[/voo\.visible\? :new_type_formgroup do\n\s*!new_type_preset\? && new_type_prompt_context\? && new_type_permitted\?/, 0],
  "new_type_preset" => new_handling[/def new_type_preset\?\n\s*params\[:type\] \|\| voo\.type/, 0],
  "new_type_prompt_context" => new_handling[/def new_type_prompt_context\?\n\s*main\? \|\| card\.simple\? \|\| card\.is_template\?/, 0],
  "new_type_permitted" => new_handling[/def new_type_permitted\?\n\s*Card\.new\(type_id: card\.type_id\)\.ok\? :create/, 0],
  "new_type_formgroup_view" => new_formgroup[/view :new_type_formgroup do/, 0],
  "new_type_formgroup_field" => new_formgroup[/type_field class: "type-field _live-type-field slotter",/, 0],
  "new_type_formgroup_href" => new_formgroup[/href: path\(view: :new_fields\),/, 0],
  "new_type_formgroup_data_remote" => new_formgroup[/"data-remote" => true/, 0],
  # the SHARED FIELD
  "type_field_select_tag" => field[/action_view\.select_tag "card\[type\]", type_field_options,/, 0],
  "type_field_args_merge" => field[/args\.merge\("data-select2-id": "\#\{unique_id\}-\#\{Time\.now\.to_i\}"\)/, 0],
  "type_field_options_simple" => field[/options_for_select grouped_types\.flatten\[1\], current_type_value/, 0],
  "type_field_options_grouped" => field[/grouped_options_for_select grouped_types, current_type_value/, 0],
  "current_type_value" => field[/@current_type_value \|\|= card\.type_name_or_default/, 0],
  # the FETCH
  "uri_fetch_type_shortcut" => fetch[/opts\[:type\] \|\|= params\[:type\] if params\[:type\] # for \/new\/:type shortcut\./, 0],
  "uri_fetch_name" => fetch[/opts\[:name\] \|\|= Name\[params\[:mark\]\]&\.tr "_", " "/, 0],
  # the STORE
  "type_setter" => store[/self\.type_id = type_name\.card_id/, 0],
  "type_id_setter" => store[/write_card_or_id :type_id, card_or_id/, 0],
  "type_name_or_default" => store[/type_card\.try\(:name\) \|\| Card\.default_type_id\.cardname/, 0],
  "extract_type_id_type_arm" => extract[/when \(type_name = args\.delete :type\)/, 0],
  "type_id_from_cardname" => extract[/type_id_or_error\(type_name\) \{ type_name\.card_id \}/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured new form does not carry the type prompt" unless new_handling.include?("new_type_preset?")
raise "the captured new formgroup is not the card[type] select" unless new_formgroup.include?("type_field class:")
raise "the captured field is not the card[type] select" unless field.include?("select_tag \"card[type]\"")
raise "the captured store does not turn a type name into a type id" unless store.include?("self.type_id = type_name.card_id")

payload = {
  "contract" => "A /new form serves a card[type] selector the user can change, and the chosen type is what the new card is stored as.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"

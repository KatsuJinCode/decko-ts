# oracle-capture-pointer-edit.rb - the pinned Ruby's own bytes for POINTER
# EDITING (registry row cap-E23, "Pointer editing (change a pointer's
# selection and save)").
#
# The row's contract: a pointer card can be edited, the selection changes, and
# the new selection is STORED. Three pinned files own it:
#
#   1. card-mod-list-0.20.0/set/abstract/01_list/html_views.rb - the SELECT
#      EDITOR: the editor view loop (lines 56-58) is `%i[autocomplete
#      checkbox radio select multiselect].each do |editor_view| view(
#      editor_view) { send "#{editor_view}_input" } end`; select_input (71-74)
#      is `select_tag "pointer_select-#{unique_id}", select_input_options,
#      class: "pointer-select form-control"`; and select_input_options
#      (108-111) is `options = { "-- Select --" => "" }.merge card.options_hash`
#      then `options_for_select options, card.first_name` - the blank first
#      option and the card's own first item selected.
#   2. card-mod-list-0.20.0/assets/script/pointer_config.js.coffee - the
#      CLIENT that turns the chosen value into the pointer's content: the
#      `'select.pointer-select': -> pointerContent @val()` handler (lines 2-3)
#      and `pointerContent: (vals) -> $.makeArray(vals).join "\n"` (lines 50-51).
#   3. card-1.110.0/mod/core/set/all/content.rb - the SAVE: the :set_content
#      event (1-5) is `self.content = prepare_db_content` and
#      prepare_db_content (44-49) is `standard_db_content || ""` then
#      `Card::Content.clean!(cont)`.
#
# The capture also MEASURES the port's own copy of the client file against
# the pinned gem's file: the port serves
# fixtures/vendor/mod-script-assets/card-mod-list/assets/script/
# pointer_config.js.coffee, and the capture records both files' digests and
# every line where they differ, so a difference is named rather than assumed
# away.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-pointer-edit.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "pointer-edit.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

PORT_CLIENT_PATH = File.join(
  REPO_ROOT, "fixtures", "vendor", "mod-script-assets", "card-mod-list",
  "assets", "script", "pointer_config.js.coffee"
)

OWNERS = [
  { key: "editor_view_loop",
    gem: "card-mod-list-0.20.0",
    path: "set/abstract/01_list/html_views.rb",
    marker: "%i[autocomplete checkbox radio select multiselect].each do |editor_view|", before: 1, after: 2 },
  { key: "select_input",
    gem: "card-mod-list-0.20.0",
    path: "set/abstract/01_list/html_views.rb",
    marker: "def select_input", before: 0, after: 3 },
  { key: "select_input_options",
    gem: "card-mod-list-0.20.0",
    path: "set/abstract/01_list/html_views.rb",
    marker: "def select_input_options", before: 1, after: 3 },
  { key: "client_select_handler",
    gem: "card-mod-list-0.20.0",
    path: "assets/script/pointer_config.js.coffee",
    marker: "'select.pointer-select': ->", before: 1, after: 2 },
  { key: "client_pointer_content",
    gem: "card-mod-list-0.20.0",
    path: "assets/script/pointer_config.js.coffee",
    marker: "pointerContent: (vals) ->", before: 0, after: 1 },
  { key: "set_content_event",
    gem: "card-1.110.0",
    path: "mod/core/set/all/content.rb",
    marker: "event :set_content, :store, on: :save do", before: 0, after: 4 },
  { key: "prepare_db_content",
    gem: "card-1.110.0",
    path: "mod/core/set/all/content.rb",
    marker: "def prepare_db_content", before: 0, after: 4 }
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

# The port's own copy of the client file against the pinned gem's file: the
# differing lines are named, and whether every difference is a comment is
# measured rather than asserted.
def compare_port_client(gem_path)
  raise "the port's client asset is not present: #{PORT_CLIENT_PATH}" unless File.file?(PORT_CLIENT_PATH)
  gem_lines = File.readlines(gem_path, chomp: true)
  port_lines = File.readlines(PORT_CLIENT_PATH, chomp: true)
  differences = []
  gem_lines.each_with_index do |line, index|
    other = port_lines[index]
    next if other == line
    differences << {
      "line" => index + 1,
      "gem" => line,
      "port" => other.to_s
    }
  end
  length_difference = gem_lines.length == port_lines.length ? nil : {
    "gem_line_count" => gem_lines.length,
    "port_line_count" => port_lines.length
  }
  comment_only = differences.all? { |d| d["gem"].strip.start_with?("#") && d["port"].strip.start_with?("#") }
  {
    "port_path" => "fixtures/vendor/mod-script-assets/card-mod-list/assets/script/pointer_config.js.coffee",
    "gem_sha256" => Digest::SHA256.hexdigest(File.binread(gem_path)),
    "port_sha256" => Digest::SHA256.hexdigest(File.binread(PORT_CLIENT_PATH)),
    "differing_lines" => differences,
    "differing_line_count" => differences.length,
    "line_count_difference" => length_difference,
    "every_difference_is_a_comment" => comment_only
  }
end

oracle = OWNERS.each_with_object({}) { |owner, h| h[owner[:key]] = capture_owner(owner) }

loop_source = oracle["editor_view_loop"]["source"]
select_input = oracle["select_input"]["source"]
select_options = oracle["select_input_options"]["source"]
client_handler = oracle["client_select_handler"]["source"]
client_content = oracle["client_pointer_content"]["source"]
set_content = oracle["set_content_event"]["source"]
prepare = oracle["prepare_db_content"]["source"]

facts = {
  # the SELECT EDITOR
  "editor_view_loop" => loop_source[/%i\[autocomplete checkbox radio select multiselect\]\.each do \|editor_view\|/, 0],
  "editor_view_send" => loop_source[/view\(editor_view\) \{ send "#\{editor_view\}_input" \}/, 0],
  "select_input_tag" => select_input[/select_tag "pointer_select-\#\{unique_id\}", select_input_options,/, 0],
  "select_input_class" => select_input[/class: "pointer-select form-control"/, 0],
  "select_input_options_blank" => select_options[/options = \{ "-- Select --" => "" \}\.merge card\.options_hash/, 0],
  "select_input_options_selected" => select_options[/options_for_select options, card\.first_name/, 0],
  # the CLIENT
  "client_select_handler" => client_handler[/'select\.pointer-select': ->/, 0],
  "client_select_body" => client_handler[/pointerContent @val\(\)/, 0],
  "client_pointer_content" => client_content[/pointerContent: \(vals\) ->/, 0],
  "client_pointer_content_join" => client_content[/\$\.makeArray\(vals\)\.join "\\n"/, 0],
  # the SAVE
  "set_content_event" => set_content[/event :set_content, :store, on: :save do/, 0],
  "set_content_body" => set_content[/self\.content = prepare_db_content/, 0],
  "prepare_db_content_default" => prepare[/cont = standard_db_content \|\| ""/, 0],
  "prepare_db_content_clean" => prepare[/clean_html\? \? Card::Content\.clean!\(cont\) : cont/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured editor does not declare the select editor" unless loop_source.include?("|editor_view|")
raise "the captured select does not carry the pointer_select name" unless select_input.include?("pointer_select-")
raise "the captured select options do not open with the blank arm" unless select_options.include?('"-- Select --"')
raise "the captured client does not read the select's value" unless client_handler.include?("pointerContent @val()")
raise "the captured client does not join the values" unless client_content.include?('join "\\n"')
raise "the captured save does not store the prepared content" unless set_content.include?("self.content = prepare_db_content")

port_client = compare_port_client(
  File.join(GEM_HOME, "card-mod-list-0.20.0", "assets", "script", "pointer_config.js.coffee")
)

payload = {
  "contract" => "A pointer card can be edited: the select editor offers the pointer's items, choosing one changes the selection, and the new selection is stored.",
  "facts" => facts,
  "oracle" => oracle,
  "port_client_asset" => port_client,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"

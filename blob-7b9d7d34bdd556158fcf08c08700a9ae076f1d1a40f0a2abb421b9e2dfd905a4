# oracle-capture-plain-input-edit-save.rb - the pinned Ruby's own bytes for
# the PLAIN INPUT edit-and-save (registry row cap-E10, "Edit a plain-input
# card; save").
#
# The row's contract: a card whose input is a plain text field can be edited
# and saved, and the new content shows on the card. Four pinned files own it:
#
#   1. card-mod-edit-0.20.0/set/all/editor.rb - the EDIT FORM half: the
#      basket offers the plain input ("text area" and "text field" are added
#      to list_input_options), input_type reads the *input type rule
#      (input_type_from_rule: card.rule(:input_type)&.gsub(/[\[\]]/, "")&
#      tr(" ", "_")), input_method turns that into "#{input_type}_input", the
#      :input view dispatches to it, default_input_type is :rich_text, and
#      the plain input's OWN body is text_field_input:
#      `text_field :content, class: classy("d0-card-content"), placeholder:
#      placeholder_text` with placeholder_text "".
#   2. decko-0.20.0/lib/card_controller/rest.rb - the WRITE ROUTE: def update
#      is `card.new_card? ? create : handle { card.update! params[:card]&.
#      to_unsafe_h }` - the request's own card hash is what gets saved.
#   3. card-1.110.0/mod/core/set/all/content.rb - the STORE event:
#      `event :set_content, :store, on: :save do self.content =
#      prepare_db_content ... end`.
#   4. card-1.110.0/lib/card/content/all.rb - the content setter:
#      `def content= value; self.db_content = standardize_content value; end`.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-plain-input-edit-save.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "plain-input-edit-save.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "editor_set_module", gem: "card-mod-edit-0.20.0",
    path: "set/all/editor.rb",
    marker: "def input_type", before: 100, after: 1000 },
  { key: "update_route", gem: "decko-0.20.0",
    path: "lib/card_controller/rest.rb",
    marker: "def update", before: 1, after: 3 },
  { key: "set_content_event", gem: "card-1.110.0",
    path: "mod/core/set/all/content.rb",
    marker: "event :set_content", before: 0, after: 5 },
  { key: "content_setter", gem: "card-1.110.0",
    path: "lib/card/content/all.rb",
    marker: "def content= value", before: 1, after: 3 }
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

editor = oracle["editor_set_module"]["source"]
route = oracle["update_route"]["source"]
event = oracle["set_content_event"]["source"]
setter = oracle["content_setter"]["source"]

facts = {
  "list_input_option_text_area" => editor[/basket\[:list_input_options\] << "text area"/, 0],
  "list_input_option_text_field" => editor[/basket\[:list_input_options\] << "text field"/, 0],
  "input_type_from_rule" => editor[/card\.rule\(:input_type\)&\.gsub\(\/\[\\\[\\\]\]\/, ""\)&\.tr\(" ", "_"\)/, 0],
  "input_method" => editor[/def input_method input_type/, 0],
  "input_method_body" => editor[/"\#\{input_type\}_input"/, 0],
  "input_view_dispatch" => editor[/try\(input_method\(input_type\)\)/, 0],
  "default_input_type" => editor[/def default_input_type/, 0],
  "default_input_type_body" => editor[/def default_input_type\n\s*:rich_text/, 0],
  "text_field_input" => editor[/text_field :content, class: classy\("d0-card-content"\), placeholder: placeholder_text/, 0],
  "text_area_input" => editor[/text_area :content, rows: 5, class: "d0-card-content",/, 0],
  "hidden_input" => editor[/hidden_field :content, class: classy\("d0-card-content"\)/, 0],
  "placeholder_text" => editor[/def placeholder_text\n\s*""/, 0],
  "update_route" => route[/card\.new_card\? \? create : handle \{ card\.update! params\[:card\]&\.to_unsafe_h \}/, 0],
  "set_content_event" => event[/event :set_content, :store, on: :save do/, 0],
  "set_content_body" => event[/self\.content = prepare_db_content/, 0],
  "content_setter" => setter[/self\.db_content = standardize_content value/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured editor does not offer the plain input" unless editor.include?("text field")
raise "the captured route does not save the request's card hash" unless route.include?("card.update!")

payload = {
  "contract" => "A card whose input is a plain text field can be edited and saved, and the new content shows on the card.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"

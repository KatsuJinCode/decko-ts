# oracle-capture-pointer-multiselect-input.rb - the pinned Ruby's own bytes for
# the pointer MULTISELECT input (registry row cap-C17, "Multiselect input in
# a new card").
#
# The row's contract: a cardtype with a multi-pointer slot renders the
# multiselect input for that pointer, and a selection persists. The pinned
# bytes that own it:
#
#   1. card-mod-list-0.20.0/set/abstract/01_list/html_views.rb - the FIVE
#      editor views are declared by ONE loop (:56-58
#      `%i[autocomplete checkbox radio select multiselect].each do
#      |editor_view| view(editor_view) { send "#{editor_view}_input" } end`),
#      so :multiselect is a real view of this set module, and :93-97
#      `def multiselect_input
#         select_tag "pointer_multiselect-#{unique_id}",
#                    options_for_select(card.options_hash, card.item_names),
#                    multiple: true, class: "pointer-multiselect form-control"
#       end` is the editor's own body.
#   2. card-1.110.0/lib/card/format/content.rb - unique_id:
#      `"#{card.name.safe_key}-#{id_counter}"`.
#   3. card-mod-layout-0.20.0/set/abstract/items/options_api.rb - options_hash
#      (the standard arm: label == name).
#   4. actionview-7.2.4 - select_tag (lib/action_view/helpers/
#      form_tag_helper.rb:201-225) and options_for_select (lib/action_view/
#      helpers/form_options_helper.rb:358-375), the two helpers that render
#      the editor's bytes.
#
# This editor has NO template of its own: its bytes ARE the two pinned
# ActionView helpers' output, so the capture RENDERS them with the pinned
# helpers rather than photographing a HAML file.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-pointer-multiselect-input.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"
require "uri"
require "cgi"
require "action_view"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "pointer-multiselect-input.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

ACTION_VIEW = File.join(GEM_HOME, "actionview-7.2.4", "lib", "action_view", "helpers")

OWNERS = [
  { key: "editor_view_loop", gem: "card-mod-list-0.20.0",
    path: "set/abstract/01_list/html_views.rb",
    marker: "%i[autocomplete checkbox radio select multiselect].each", before: 1, after: 6 },
  { key: "multiselect_input_method", gem: "card-mod-list-0.20.0",
    path: "set/abstract/01_list/html_views.rb",
    marker: "def multiselect_input", before: 1, after: 5 },
  { key: "unique_id", gem: "card-1.110.0",
    path: "lib/card/format/content.rb",
    marker: "def unique_id", before: 1, after: 3 },
  { key: "options_api", gem: "card-mod-layout-0.20.0",
    path: "set/abstract/items/options_api.rb",
    marker: "def options_hash", before: 1, after: 14 },
  { key: "select_tag", gem: "actionview-7.2.4",
    path: "lib/action_view/helpers/form_tag_helper.rb",
    marker: "def select_tag", before: 1, after: 24 },
  { key: "options_for_select", gem: "actionview-7.2.4",
    path: "lib/action_view/helpers/form_options_helper.rb",
    marker: "def options_for_select", before: 1, after: 17 }
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

# ---------------------------------------------------------------- the render
class ProbeName < String
  def to_name
    self
  end

  def key
    downcase
  end
end

class ProbeCard
  def initialize(options_hash, item_names)
    @options_hash = options_hash
    @item_names = item_names
  end

  def options_hash
    @options_hash
  end

  def item_names
    @item_names
  end
end

class Probe
  include ActionView::Helpers::FormTagHelper
  include ActionView::Helpers::TagHelper
  include ActionView::Helpers::FormOptionsHelper

  def initialize(card, unique_id)
    @card = card
    @unique_id = unique_id
  end

  attr_reader :card, :unique_id
end

# The standard arm of options_hash (options_api.rb:12-16,
# option_hash_from_names): label == name. The probe's option names are SINGLE
# LOWERCASE WORDS on purpose, so the pinned Cardname#simple_key
# (cardname-1.110.0 lib/cardname.rb:106-116) and the probe's key stub agree.
PROBE_OPTIONS = {
  "harnesspickone" => ProbeName.new("harnesspickone"),
  "harnesspicktwo" => ProbeName.new("harnesspicktwo")
}.freeze

PROBE_OPTIONS.each_key do |option_name|
  raise "probe option #{option_name} is not a single lowercase word" unless option_name.match?(/\A[a-z0-9]+\z/)
end

# The card's own selected items: one option is already picked, so the rendered
# bytes carry BOTH the plain option and the selected one.
PROBE_SELECTED = ["harnesspicktwo"].freeze
PROBE_UNIQUE_ID = "harnesspickcard-1".freeze

probe_card = ProbeCard.new(PROBE_OPTIONS, PROBE_SELECTED)
probe = Probe.new(probe_card, PROBE_UNIQUE_ID)

rendered = probe.select_tag(
  "pointer_multiselect-#{PROBE_UNIQUE_ID}",
  probe.options_for_select(probe_card.options_hash, probe_card.item_names),
  multiple: true, class: "pointer-multiselect form-control"
)

facts = {
  "editor_views" => oracle["editor_view_loop"]["source"][/%i\[autocomplete checkbox radio select multiselect\]/, 0],
  "multiselect_input_name" => oracle["multiselect_input_method"]["source"][/pointer_multiselect-#\{unique_id\}/, 0],
  "multiselect_input_options" => oracle["multiselect_input_method"]["source"][/options_for_select\(card\.options_hash, card\.item_names\)/, 0],
  "multiselect_input_class" => oracle["multiselect_input_method"]["source"][/class: "pointer-multiselect form-control"/, 0],
  "multiselect_multiple" => oracle["multiselect_input_method"]["source"][/multiple: true/, 0],
  "unique_id_owner" => oracle["unique_id"]["source"][/#\{card\.name\.safe_key\}-#\{id_counter\}/, 0],
  "options_hash_owner" => oracle["options_api"]["source"][/def options_hash/, 0],
  "select_tag_html_name" => oracle["select_tag"]["source"][/html_name = \(options\[:multiple\] == true/, 0],
  "select_tag_content_tag" => oracle["select_tag"]["source"][/content_tag "select", option_tags,/, 0],
  "select_tag_base_hash" => oracle["select_tag"]["source"][/"name" => html_name, "id" => sanitize_to_id\(name\)/, 0],
  "options_for_select_selected_before_value" => oracle["options_for_select"]["source"][/html_attributes\[:selected\] \|\|= option_value_selected\?\(value, selected\)/, 0],
  "options_for_select_join" => oracle["options_for_select"]["source"][/join\("\\n"\)\.html_safe/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the pinned helpers did not render a multiple select" unless rendered.include?('multiple="multiple"')
raise "the pinned helpers did not render the selected arm" unless rendered.include?('selected="selected"')
raise "the pinned helpers did not render the multiselect class" unless rendered.include?('class="pointer-multiselect form-control"')

payload = {
  "contract" => "A cardtype with a multi-pointer slot renders the pointer multiselect input for that pointer, and a selection persists.",
  "facts" => facts,
  "oracle" => oracle,
  "rendered" => {
    "probe_card_items" => PROBE_SELECTED,
    "probe_options" => PROBE_OPTIONS,
    "probe_unique_id" => PROBE_UNIQUE_ID,
    "bytes" => rendered
  },
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"

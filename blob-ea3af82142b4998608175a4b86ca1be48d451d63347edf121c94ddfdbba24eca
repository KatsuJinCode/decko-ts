# oracle-capture-pointer-checkbox-input.rb - the pinned Ruby's own bytes for
# the pointer CHECKBOX input (registry row cap-C16, "Checkbox input in a new
# card").
#
# The row's contract: a cardtype with a pointer slot renders the checkbox
# input for that pointer, a box can be checked, and the checked value is
# stored on the card. Four pinned files own it:
#
#   1. card-mod-list-0.20.0/set/abstract/01_list/html_views.rb - the FIVE
#      editor views are declared by ONE loop (:56-58
#      `%i[autocomplete checkbox radio select multiselect].each do
#      |editor_view| view(editor_view) { send "#{editor_view}_input" } end`),
#      so :checkbox is a real view of this set module, and :64-66
#      `def checkbox_input raw haml(:checkbox_input, submit_on_change:
#      @submit_on_change) end` renders the template below.
#   2. card-mod-list-0.20.0/set/abstract/01_list/html_views/
#      checkbox_input.haml - the template itself: the wrapper is
#      .pointer-checkbox-list, one .pointer-checkbox per option, the input's
#      id is "pointer-checkbox-#{option_name.to_name.key}", the checked arm is
#      `card.item_names.include? option_name`, and the input's name is
#      "pointer_checkbox-#{unique_id}".
#   3. card-1.110.0/lib/card/format/content.rb - unique_id:
#      `"#{card.name.safe_key}-#{id_counter}"`.
#   4. card-mod-layout-0.20.0/set/abstract/items/options_api.rb - options_hash
#      (the standard arm: label == name) and option_label (the label's own
#      bytes: class "form-check-label", for the option's id).
#
# The capture ALSO RENDERS the pinned template with the pinned ActionView
# helpers, so the capture carries Ruby's own rendered bytes and not only its
# source. The probe stands in for the deck's card (the options hash and the
# card's own item names) and for the layout's option_label (the label's own
# markup belongs to the layout's method, which the capture keeps as source);
# the contract this row is about is the INPUT's own bytes.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-pointer-checkbox-input.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"
require "uri"
require "cgi"
require "action_view"
require "haml"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "pointer-checkbox-input.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "editor_view_loop", gem: "card-mod-list-0.20.0",
    path: "set/abstract/01_list/html_views.rb",
    marker: "%i[autocomplete checkbox radio select multiselect].each", before: 1, after: 6 },
  { key: "checkbox_input_method", gem: "card-mod-list-0.20.0",
    path: "set/abstract/01_list/html_views.rb",
    marker: "def checkbox_input", before: 1, after: 3 },
  { key: "checkbox_input_template", gem: "card-mod-list-0.20.0",
    path: "set/abstract/01_list/html_views/checkbox_input.haml",
    marker: "pointer_checkbox-", before: 6, after: 3 },
  { key: "unique_id", gem: "card-1.110.0",
    path: "lib/card/format/content.rb",
    marker: "def unique_id", before: 1, after: 3 },
  { key: "options_api", gem: "card-mod-layout-0.20.0",
    path: "set/abstract/items/options_api.rb",
    marker: "def options_hash", before: 1, after: 14 },
  { key: "option_label", gem: "card-mod-layout-0.20.0",
    path: "set/abstract/items/options_api.rb",
    marker: "def option_label option_name, id", before: 1, after: 5 },
  { key: "simple_key", gem: "cardname-1.110.0",
    path: "lib/cardname.rb",
    marker: "def simple_key", before: 1, after: 10 }
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
# The probe stands in for the deck's card and for the layout's option_label.
class ProbeName < String
  # The deck's name is a String that answers to_name and carries its own
  # key; the option's name is one of those.
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

  def initialize(card, unique_id)
    @card = card
    @unique_id = unique_id
  end

  attr_reader :card, :unique_id

  def submit_on_change
    false
  end

  # The layout's own option_label (options_api.rb:70-74) wraps the label as a
  # form-check-label; the marker's shape stands in for it here, because this
  # row's contract is the INPUT's bytes.
  def option_label(label, id)
    %(<label class="form-check-label" for="#{id}">#{label}</label>)
  end
end

# The standard arm of options_hash (options_api.rb:12-16,
# option_hash_from_names): label == name, so the option NAME is also the
# label's text. The JSON arm is a different shape and is NOT probed here.
#
# The probe's option names are SINGLE LOWERCASE WORDS on purpose: the pinned
# Cardname#simple_key (cardname-1.110.0 lib/cardname.rb:106-116) is
# `decoded.underscore.gsub(/[^\p{Word}\*]+/, "_").split(/_+/).reject(&:empty?)
# .map { stable_key }.join("_")`, and for a single lowercase word that is the
# word itself - which is what the probe's `key` stub answers. The key
# ALGORITHM is not this row's contract; the input's own bytes are.
PROBE_OPTIONS = {
  "harnesspickone" => ProbeName.new("harnesspickone"),
  "harnesspicktwo" => ProbeName.new("harnesspicktwo")
}.freeze

PROBE_OPTIONS.each_key do |option_name|
  raise "probe option #{option_name} is not a single lowercase word" unless option_name.match?(/\A[a-z0-9]+\z/)
end

# The card's own selected items: the second option is already picked, so the
# rendered template carries BOTH the unchecked and the checked arm.
PROBE_SELECTED = ["harnesspicktwo"].freeze
PROBE_UNIQUE_ID = "harnesspickcard-1".freeze

template_path = File.join(GEM_HOME, "card-mod-list-0.20.0", "set/abstract/01_list/html_views/checkbox_input.haml")
template = File.read(template_path)

probe_card = ProbeCard.new(PROBE_OPTIONS, PROBE_SELECTED)
rendered = Haml::Engine.new(template).render(Probe.new(probe_card, PROBE_UNIQUE_ID))

facts = {
  "editor_views" => oracle["editor_view_loop"]["source"][/%i\[autocomplete checkbox radio select multiselect\]/, 0],
  "checkbox_input_method" => oracle["checkbox_input_method"]["source"][/def checkbox_input/, 0],
  "checkbox_input_haml_call" => oracle["checkbox_input_method"]["source"][/raw haml\(:checkbox_input, submit_on_change: @submit_on_change\)/, 0],
  "input_name_pattern" => oracle["checkbox_input_template"]["source"][/pointer_checkbox-#\{unique_id\}/, 0],
  "input_id_pattern" => oracle["checkbox_input_template"]["source"][/pointer-checkbox-#\{option_name\.to_name\.key\}/, 0],
  "input_class" => oracle["checkbox_input_template"]["source"][/pointer-checkbox-button #\{'_submit-on-change' if submit_on_change\}/, 0],
  "list_class" => oracle["checkbox_input_template"]["source"][/^\.pointer-checkbox-list$/, 0],
  "item_class" => oracle["checkbox_input_template"]["source"][/^\s*\.pointer-checkbox$/, 0],
  "checked_predicate" => oracle["checkbox_input_template"]["source"][/checked = card\.item_names\.include\? option_name/, 0],
  "unique_id_owner" => oracle["unique_id"]["source"][/#\{card\.name\.safe_key\}-#\{id_counter\}/, 0],
  "options_hash_owner" => oracle["options_api"]["source"][/def options_hash/, 0],
  "option_label_owner" => oracle["option_label"]["source"][/def option_label option_name, id/, 0],
  "option_label_class" => oracle["option_label"]["source"][/class: "form-check-label", for: id/, 0],
  "simple_key_owner" => oracle["simple_key"]["source"][/def simple_key/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the pinned template did not render a checkbox input" unless rendered.include?('type="checkbox"')
raise "the pinned template did not render the checked arm" unless rendered.include?('checked="checked"')

payload = {
  "contract" => "A cardtype with a pointer slot renders the pointer checkbox input for that pointer, a box can be checked, and the checked value is stored on the card.",
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

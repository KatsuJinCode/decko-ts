# oracle-capture-pointer-radio-input.rb - the pinned Ruby's own bytes for the
# pointer radio input (registry row cap-C15, "Radio input in a new card").
#
# The row's contract: a cardtype with a pointer slot renders the radio input
# for that pointer, and a selection persists. Three pinned files own it:
#
#   1. card-mod-list-0.20.0/set/abstract/01_list/html_views/radio_input.haml -
#      the template itself: the input's name is
#      "pointer_radio_button-#{card.key}", its id is
#      "pointer-radio-#{option_name.to_name.key}", its class is
#      "pointer-radio-button form-check-input", its value is the option's
#      NAME, and the list is ul.pointer-radio-list > li.pointer-radio.radio.form-check.
#   2. card-mod-layout-0.20.0/set/abstract/items/options_api.rb - options_hash,
#      the option names the radio renders, and option_label, the label the
#      radio carries.
#   3. card-mod-edit-0.20.0/set/type/pointer.rb - the Pointer type's own
#      input_type_content_options: select, radio, autocomplete.
#
# The capture ALSO RENDERS the pinned template, with the pinned ActionView
# helpers, so the capture carries the Ruby's own rendered bytes and not only
# its source. The probe stands in for the deck's card (the options hash, the
# card's key, the card's first name) and for the layout's option_label (the
# label's own markup belongs to the layout's method, which the capture keeps
# as source); the contract this row is about is the input's own bytes.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-pointer-radio-input.rb
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
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "pointer-radio-input.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "radio_input_template", gem: "card-mod-list-0.20.0",
    path: "set/abstract/01_list/html_views/radio_input.haml",
    marker: "pointer_radio_button-", before: 12, after: 6 },
  { key: "options_api", gem: "card-mod-layout-0.20.0",
    path: "set/abstract/items/options_api.rb",
    marker: "def options_hash", before: 1, after: 14 },
  { key: "pointer_type", gem: "card-mod-edit-0.20.0", path: "set/type/pointer.rb",
    marker: "def input_type_content_options", before: 1, after: 4 }
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
class ProbeOption < String
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
  def initialize(options_hash, key, first_name)
    @options_hash = options_hash
    @key = key
    @first_name = first_name
  end

  def options_hash
    @options_hash
  end

  def key
    @key
  end

  def first_name
    @first_name
  end
end

class Probe
  include ActionView::Helpers::FormTagHelper
  include ActionView::Helpers::TagHelper

  def initialize(card)
    @card = card
  end

  attr_reader :card

  def submit_on_change
    false
  end

  # The layout's own option_label (options_api.rb) wraps the label as a
  # form-check-label; the marker's shape stands in for it here, because this
  # row's contract is the INPUT's bytes.
  def option_label(label, id)
    %(<label class="form-check-label" for="#{id}">#{label}</label>)
  end
end

PROBE_OPTIONS = {
  "Harness Option One" => ProbeOption.new("harnessoptionone"),
  "Harness Option Two" => ProbeOption.new("harnessoptiontwo")
}.freeze

template_path = File.join(GEM_HOME, "card-mod-list-0.20.0", "set/abstract/01_list/html_views/radio_input.haml")
template = File.read(template_path)

# The template walks the options hash and calls to_name.key on each option
# NAME; the probe's hash keys are the labels and its values are the names.
probe_card = ProbeCard.new(PROBE_OPTIONS, "harnesspointer", "harnessoptionone")
rendered = Haml::Engine.new(template).render(Probe.new(probe_card))

facts = {
  "input_name_pattern" => oracle["radio_input_template"]["source"][/pointer_radio_button-#\{card\.key\}/, 0],
  "input_id_pattern" => oracle["radio_input_template"]["source"][/pointer-radio-#\{option_name\.to_name\.key\}/, 0],
  "input_class" => oracle["radio_input_template"]["source"][/"pointer-radio-button form-check-input/, 0],
  "list_class" => oracle["radio_input_template"]["source"][/%ul\.pointer-radio-list/, 0],
  "item_class" => oracle["radio_input_template"]["source"][/%li\.pointer-radio\.radio\.form-check/, 0],
  "pointer_widgets" => oracle["pointer_type"]["source"][/%w\[select radio autocomplete\]/, 0],
  "options_hash_owner" => oracle["options_api"]["source"][/def options_hash/, 0]
}

raise "the pinned input name pattern was not found in the captured bytes" if facts["input_name_pattern"].nil?
raise "the pinned input id pattern was not found in the captured bytes" if facts["input_id_pattern"].nil?
raise "the pinned input class was not found in the captured bytes" if facts["input_class"].nil?
raise "the pinned list class was not found in the captured bytes" if facts["list_class"].nil?
raise "the pinned item class was not found in the captured bytes" if facts["item_class"].nil?
raise "the pinned pointer widgets were not found in the captured bytes" if facts["pointer_widgets"].nil?
raise "the pinned options_hash owner was not found in the captured bytes" if facts["options_hash_owner"].nil?
raise "the pinned template did not render a radio input" unless rendered.include?('type="radio"')

payload = {
  "contract" => "A cardtype with a pointer slot renders the pointer radio input for that pointer, and a selection persists.",
  "facts" => facts,
  "oracle" => oracle,
  "rendered" => {
    "probe_card_key" => probe_card.key,
    "probe_options" => PROBE_OPTIONS,
    "bytes" => rendered
  },
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"

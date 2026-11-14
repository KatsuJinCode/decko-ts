# oracle-capture-rules-tab.rb - the pinned Ruby's own bytes for the RULES TAB
# (registry row cap-E22, "Edit board: rules tab (no set selected; warns when
# set 'all' selected)").
#
# The row's contract: the board's Rules tab opens with no set selected, and
# it is the place where the set 'all' warning lives. Three pinned files own
# it:
#
#   1. card-mod-edit-0.20.0/set/all/board/tab_views.rb - the TAB VIEW: view
#      :rules_tab, unknown: true (lines 20-31) is `set_list_type = :related`,
#      `class_up "card-slot", "flex-column"` and `wrap do [ set_select(
#      set_list_type) # set_alert(set_list_type) ] end`. The ALERT IS
#      COMMENTED OUT in the pinned view, so the pinned Ruby does NOT warn in
#      this tab: the set_alert helper exists, the tab does not call it.
#   2. card-mod-edit-0.20.0/set/all/board.rb - the TAB NAME: BOARD_TABS
#      (lines 1-7) is the frozen map whose "Rules" arm is :rules_tab, so the
#      board's own nav link is named Rules and renders that view.
#   3. card-mod-rules-0.20.0/set/all/set_select.rb - the SET SELECTOR:
#      set_select (lines 2-6) is `card_select card.set_list(set_list_type),
#      setting_list_view, path_opts, "Select set"` with
#      setting_list_view=:filtered_accordion_rule_list; card_select (8-19) is
#      the form_tag with remote: true, method: "get", role: "filter", the
#      "data-slot-selector" and the "nodblclick slotter" class, over
#      set_select_tag and the `card-slot _fixed-slot` div; set_select_tag
#      (27-35) is `options = cards.map(&:label_and_url_key)`, `options.unshift
#      ("") if placeholder` (the BLANK first option - no set selected) and
#      the select_tag(:mark, ...) with the "Select set" placeholder; and
#      set_alert (37-45) is the "Rules apply to:" alert the tab does not call.
#
# The capture reads the pinned gemset and writes nothing but its own JSON
# fixture. It does NOT boot the oracle deck.
#
# Run (from the repository root, with the pinned gemset on the gem path):
#   GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
#     ruby tests/card/mod-loader/oracle-capture-rules-tab.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "rules-tab.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "rules_tab_view",
    gem: "card-mod-edit-0.20.0",
    path: "set/all/board/tab_views.rb",
    marker: "view :rules_tab, unknown: true do", before: 0, after: 11 },
  { key: "board_tabs",
    gem: "card-mod-edit-0.20.0",
    path: "set/all/board.rb",
    marker: "BOARD_TABS = { \"Account\" => :account_tab,", before: 0, after: 6 },
  { key: "set_select",
    gem: "card-mod-rules-0.20.0",
    path: "set/all/set_select.rb",
    marker: "def set_select set_list_type,", before: 1, after: 5 },
  { key: "card_select",
    gem: "card-mod-rules-0.20.0",
    path: "set/all/set_select.rb",
    marker: "def card_select cards, view, path_opts={}, placeholder=nil", before: 0, after: 11 },
  { key: "set_select_tag",
    gem: "card-mod-rules-0.20.0",
    path: "set/all/set_select.rb",
    marker: "def set_select_tag cards, placeholder=nil", before: 1, after: 9 },
  { key: "set_alert",
    gem: "card-mod-rules-0.20.0",
    path: "set/all/set_select.rb",
    marker: "def set_alert set_list_type", before: 0, after: 9 }
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

tab = oracle["rules_tab_view"]["source"]
tabs = oracle["board_tabs"]["source"]
select = oracle["set_select"]["source"]
card_select = oracle["card_select"]["source"]
select_tag = oracle["set_select_tag"]["source"]
alert = oracle["set_alert"]["source"]

facts = {
  # the TAB VIEW
  "rules_tab_view" => tab[/view :rules_tab, unknown: true do/, 0],
  "rules_tab_list_type" => tab[/set_list_type = :related/, 0],
  "rules_tab_class_up" => tab[/class_up "card-slot", "flex-column"/, 0],
  "rules_tab_set_select_call" => tab[/set_select\(set_list_type\)/, 0],
  "rules_tab_alert_is_commented_out" => tab[/# set_alert\(set_list_type\)/, 0],
  # the TAB NAME
  "board_tabs_rules" => tabs[/"Rules" => :rules_tab/, 0],
  "board_tabs_frozen" => tabs[/BOARD_TABS = \{ "Account" => :account_tab,/, 0],
  # the SET SELECTOR
  "set_select_view" => select[/setting_list_view=:filtered_accordion_rule_list/, 0],
  "set_select_call" => select[/card_select card\.set_list\(set_list_type\), setting_list_view, path_opts, "Select set"/, 0],
  "card_select_form" => card_select[/form_tag path\(path_opts\.merge\(view: view, mark: ""\)\),/, 0],
  "card_select_remote" => card_select[/remote: true, method: "get", role: "filter",/, 0],
  "card_select_slot_selector" => card_select[/"data-slot-selector": "\.card-slot\._fixed-slot",/, 0],
  "card_select_class" => card_select[/class: "nodblclick slotter" do/, 0],
  "card_select_fixed_slot" => card_select[/content_tag\(:div, "", class: "card-slot _fixed-slot"\)/, 0],
  "set_select_tag_options" => select_tag[/options = cards\.map\(&:label_and_url_key\)/, 0],
  "set_select_tag_blank_first_option" => select_tag[/options\.unshift\(""\) if placeholder/, 0],
  "set_select_tag_select" => select_tag[/select_tag\(:mark, options_for_select\(options\),/, 0],
  "set_select_tag_class" => select_tag[/class: "_submit-on-select form-control _close-rule-overlay-on-select",/, 0],
  "set_select_tag_search" => select_tag[/"data-minimum-results-for-search": "Infinity",/, 0],
  "set_select_tag_placeholder" => select_tag[/"data-placeholder": "Select set",/, 0],
  # the ALERT THE TAB DOES NOT CALL
  "set_alert_wrap" => alert[/wrap_with :div, class: "alert alert-info" do/, 0],
  "set_alert_text" => alert[/"Rules apply to:",/, 0],
  "set_alert_more_sets" => alert[/link_to_card\(card, "More sets and settings",/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured tab does not carry the set_select call" unless tab.include?("set_select(set_list_type)")
raise "the captured tab calls the alert, and the pinned view does not" if tab.include?("\n        set_alert(set_list_type)")
raise "the captured tab does not list the related sets" unless tab.include?("set_list_type = :related")
raise "the captured selector does not open with a blank option" unless select_tag.include?('options.unshift("") if placeholder')
raise "the captured selector does not carry the placeholder" unless select_tag.include?('"data-placeholder": "Select set"')
raise "the captured form does not carry the fixed-slot selector" unless card_select.include?(".card-slot._fixed-slot")

payload = {
  "contract" => "The board's Rules tab opens with no set selected: the set selector renders with a blank first option and the Select set placeholder, over the board's own related set list.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"

# oracle-capture-edit-type-for-rule.rb - the pinned Ruby's own bytes for
# the RULE TYPE CHANGE (registry row cap-E14, "Edit type for a rule": a rule
# card's type can be changed in the board's Rules tab).
#
# The row's contract: a rule card's type can be changed in the board's Rules
# tab, and the rule card's STORED type becomes the chosen one. Six pinned
# files own it:
#
#   1. card-mod-rules-0.20.0/set/rule/editor.rb - the RULE EDITOR half:
#      rules_type_formgroup (:97-108) is `return unless
#      card.right.rule_type_editable` then `wrap_type_formgroup do
#      type_field(href: path(mark: success[:id], view:
#      :rule_form_card_editor, assign: true), class: "type-field
#      rule-type-field _live-type-field", "data-remote" => true) end`.
#   2. card-mod-rules-0.20.0/set/rule/rule_form.rb - the FORM half: the
#      :rule_form_card_editor view (:22-31) renders [rules_type_formgroup,
#      rule_content_formgroup] inside the "card-editor slotter" wrap.
#   3. card-mod-rules-0.20.0/set/all/cardtype_groups.rb - the GROUP TABLE:
#      GROUP (:2-12) is the cardtype groups the select lists, GROUP_MAP
#      (:18-20) is the group each cardtype belongs to, and custom_types
#      (:23-31) is the createable types NOT in GROUP_MAP.
#   4. card-mod-content-0.20.0/set/right/default.rb - the *default RULE's
#      group override: visible_cardtype_groups (:25-29) is
#      `All::CardtypeGroups::GROUP.slice("Text",  "Data", "Upload")` with
#      Organize replaced by ["List", "Pointer", "Link list", "Nest list"],
#      and quick_editor (:16-23) is the quick form's own type field.
#   5. card-mod-content-0.20.0/set/right/structure.rb - the *structure
#      RULE's group override: visible_cardtype_groups (:18-22) is
#      `All::CardtypeGroups::GROUP.slice("Text")` with Organize replaced by
#      ["Search", "Nest list"].
#   6. card-1.110.0/mod/core/set/all/type.rb - the STORE: `type=` (:48-50)
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
#     ruby tests/card/mod-loader/oracle-capture-edit-type-for-rule.rb
#
# Determinism contract: the output JSON is pretty-printed with deeply sorted
# keys and a trailing newline, and carries NO timestamp, so a re-run is
# byte-stable against what is committed.

require "json"
require "digest"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "edit-type-for-rule.json")

GEM_HOME_DEFAULT = "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
GEM_HOME = ENV.fetch("DECKO_ORACLE_GEM_HOME", GEM_HOME_DEFAULT)

OWNERS = [
  { key: "rules_type_formgroup", gem: "card-mod-rules-0.20.0",
    path: "set/rule/editor.rb",
    marker: "def rules_type_formgroup", before: 1, after: 12 },
  { key: "rule_form_card_editor", gem: "card-mod-rules-0.20.0",
    path: "set/rule/rule_form.rb",
    marker: "view :rule_form_card_editor", before: 1, after: 10 },
  { key: "cardtype_groups", gem: "card-mod-rules-0.20.0",
    path: "set/all/cardtype_groups.rb",
    marker: "GROUP = {", before: 0, after: 30 },
  { key: "right_default_groups", gem: "card-mod-content-0.20.0",
    path: "set/right/default.rb",
    marker: "def quick_editor", before: 1, after: 14 },
  { key: "right_structure_groups", gem: "card-mod-content-0.20.0",
    path: "set/right/structure.rb",
    marker: "def visible_cardtype_groups", before: 1, after: 5 },
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

rules_editor = oracle["rules_type_formgroup"]["source"]
rule_form = oracle["rule_form_card_editor"]["source"]
groups = oracle["cardtype_groups"]["source"]
right_default = oracle["right_default_groups"]["source"]
right_structure = oracle["right_structure_groups"]["source"]
store = oracle["type_store"]["source"]
extract = oracle["type_extract"]["source"]

facts = {
  # the RULE EDITOR half
  "rules_type_formgroup_guard" => rules_editor[/return unless card\.right\.rule_type_editable/, 0],
  "rules_type_formgroup_href" => rules_editor[/href: path\(mark: success\[:id\], view: :rule_form_card_editor, assign: true\),/, 0],
  "rules_type_formgroup_class" => rules_editor[/class: "type-field rule-type-field _live-type-field",/, 0],
  "rules_type_formgroup_data_remote" => rules_editor[/"data-remote" => true/, 0],
  # the FORM half
  "rule_form_card_editor_view" => rule_form[/view :rule_form_card_editor, cache: :never, unknown: true do/, 0],
  "rule_form_card_editor_body" => rule_form[/rules_type_formgroup,\n\s*rule_content_formgroup/, 0],
  "rule_form_card_editor_wrap" => rule_form[/wrap true, class: "card-editor slotter" do/, 0],
  # the GROUP TABLE
  "group_text" => groups[/"Text" => %w\[RichText PlainText Markdown Phrase HTML\]/, 0],
  "group_data" => groups[/"Data" => %w\[Number Toggle Date URI\]/, 0],
  "group_organize" => groups[/"Organize" => \["List", "Pointer", "Search", "Link list", "Nest list"\]/, 0],
  "group_map" => groups[/GROUP_MAP = GROUP\.each_with_object\(\{\}\) do \|\(cat, types\), h\|/, 0],
  "custom_types" => groups[/custom_types << type unless All::CardtypeGroups::GROUP_MAP\[type\]/, 0],
  # the *default RULE's group override
  "default_visible_cardtype_groups" => right_default[/hash = All::CardtypeGroups::GROUP\.slice\("Text",  "Data", "Upload"\)/, 0],
  "default_organize" => right_default[/hash\["Organize"\] = \["List", "Pointer", "Link list", "Nest list"\]/, 0],
  "default_quick_editor_type_field" => right_default[/type_field class: "type-field rule-type-field _submit-on-select"/, 0],
  # the *structure RULE's group override
  "structure_visible_cardtype_groups" => right_structure[/hash = All::CardtypeGroups::GROUP\.slice\("Text"\)/, 0],
  "structure_organize" => right_structure[/hash\["Organize"\] = \["Search", "Nest list"\]/, 0],
  # the STORE
  "type_setter" => store[/self\.type_id = type_name\.card_id/, 0],
  "type_id_setter" => store[/write_card_or_id :type_id, card_or_id/, 0],
  "extract_type_id_type_arm" => extract[/when \(type_name = args\.delete :type\)/, 0],
  "type_id_from_cardname" => extract[/type_id_or_error\(type_name\) \{ type_name\.card_id \}/, 0]
}

facts.each do |name, value|
  raise "the pinned fact #{name} was not found in the captured bytes" if value.nil?
end

raise "the captured rule editor does not gate on rule_type_editable" unless rules_editor.include?("rule_type_editable")
raise "the captured rule editor is not the card[type] select's caller" unless rules_editor.include?("type_field(")
raise "the captured group table does not carry the Text group" unless groups.include?("\"Text\" =>")
raise "the captured store does not turn a type name into a type id" unless store.include?("self.type_id = type_name.card_id")

payload = {
  "contract" => "A rule card's type can be changed in the board's Rules tab, and the rule card's stored type becomes the chosen one.",
  "facts" => facts,
  "oracle" => oracle,
  "gem_home" => GEM_HOME.tr("\\", "/")
}

File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "wrote #{OUT_PATH}"

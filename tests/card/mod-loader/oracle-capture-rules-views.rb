# oracle-capture-rules-views.rb - renders the card-mod-rules set-card list
# views (set/type/set/html_views/
# rule_lists.rb, filtered_rule_lists.rb, setting_filter.rb), the rule-set
# link views (set/rule/editor.rb pill_rule_link family), the board_rules_
# editor views, and the quick_edit chain (set/rule/quick_editor.rb), plus
# the set_select card_select view and the template_link view.
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-rules-views.rb
#
# Records to fixtures/captured/rules-views.json:
# 1. set_card views: rendered on "*all" (Set-typed - set/type/set modules).
#    Includes one filtered render (bar_setting_list filter: "common") - the
#    voo.filter read rule_lists.rb:12 (`voo.filter&.to_sym || :all`).
# 2. rule_card views: rendered on "*all+*read" (an EXISTING rule card -
#    the Rule-set views; find_existing_rule_card is the card itself).
# 3. new_rule_card probes: the same rule-card views on a rule card whose
#    rule does NOT exist ("*all+*layout" if unseeded) - the
#    render_mini_unknown / existing-rule-card branches.
# 4. setting_registry: Card::Setting.groups' visible codenames per group and
#    the *all prototype's visible_setting_codenames (the walks the list
#    views render; the TS port's registry is diffed against these).
# 5. The no-write proof: card_actions count before and after. The script
#    performs ZERO card writes (render only).
#
# Determinism contract (mirrors oracle-capture-bar-box-format-views.rb):
# pretty JSON with deeply sorted keys + trailing newline; data-slot-id
# normalized to RANDOMIZED. No time-relative bytes are expected on these
# views (the rule bar family carries none; card_select's select2
# data-select2-id embeds Time.now.to_i and is normalized separately).

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "rules-views.json")

# the set/type/set list views, rendered on the Set card "*all"
SET_CARD_VIEWS = %w[bar_setting_list accordion_bar_list accordion_rule_list
                    pill_setting_list modal_pill_setting_list
                    overlay_rule_list_link board_rules_tab
                    filtered_accordion_rule_list quick_edit_setting_list
                    card_select template_link].freeze

# the Rule-set views, rendered on the existing rule card "*all+*read"
RULE_CARD_VIEWS = %w[rule_board_link rule_nest_editor_link quick_edit
                     quick_edit_success rule_form rule_form_card_editor
                     modal_rule overlay_rule help_text one_line_content
                     raw_one_line_content overlay_title rule_edit].freeze

SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze
SELECT2_ID_RE = /(data-select2-id="[^"]*-)\d+(")/.freeze

def normalize(html)
  html.to_s.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
      .gsub(SELECT2_ID_RE, '\1TIME\2')
end

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def render_view(card, view, opts = {})
  raw = card.format(:html).render(view, opts)
  { "bytes" => normalize(raw) }
rescue StandardError => e
  { "error_class" => e.class.name, "message" => e.message[0, 400] }
end

def card_meta(card)
  { "id" => card.id, "key" => card.key, "name" => card.name.to_s,
    "type_id" => card.type_id, "type_name" => card.type_name.to_s,
    "type_code" => card.type_code.to_s, "db_content" => card.db_content.to_s }
end

def action_count
  ActiveRecord::Base.connection.select_value("SELECT COUNT(*) FROM card_actions").to_i
end

results = {
  "normalizations" => {
    "data-slot-id" => "RANDOMIZED",
    "select2 data-select2-id seconds suffix" => "TIME"
  },
  "no_write_discipline" =>
    "render-only capture; card_actions count asserted unchanged",
  "set_card" => {},
  "rule_card" => {},
  "new_rule_card" => {},
  "setting_registry" => {}
}

before_count = action_count

# --- the Set card "*all" ----------------------------------------------------

set_card = Card["*all"]
raise "*all card missing" unless set_card
raise "*all is not Set-typed (#{set_card.type_code})" unless set_card.type_code == :set

results["set_card"]["meta"] = card_meta(set_card)
results["set_card"]["views"] = SET_CARD_VIEWS.each_with_object({}) do |view, h|
  h[view] = render_view(set_card, view)
end
# the filtered variant (rule_lists.rb:12 voo.filter&.to_sym || :all)
results["set_card"]["filtered"] = {
  "bar_setting_list_common" => render_view(set_card, :bar_setting_list, filter: "common")
}

# --- an existing rule card "*all+*read" --------------------------------------

rule_card = Card.fetch("*all+*read", new: {})
if rule_card&.real?
  results["rule_card"]["meta"] = card_meta(rule_card)
  results["rule_card"]["views"] = RULE_CARD_VIEWS.each_with_object({}) do |view, h|
    h[view] = render_view(rule_card, view)
  end
  # the rule card's own walk inputs (the TS port's registry inputs)
  results["rule_card"]["walk"] = {
    "rule_set_key" => rule_card.rule_set_key,
    "rule_setting_codename" => rule_card.rule_setting.codename.to_s,
    "categories" => rule_card.rule_set.categories(rule_card.rule_setting.codename).map(&:to_s),
    "short_help_text" => rule_card.short_help_text.to_s,
    "rule_setting_count" => rule_card.rule_setting.count
  }
else
  results["rule_card"]["missing"] = true
end

# --- a rule card whose rule does NOT exist -----------------------------------

new_rule = Card.fetch("*all+*layout", new: {})
if new_rule && !new_rule.real?
  results["new_rule_card"]["meta"] = card_meta(new_rule)
  # the cheap members of the family only (the form views need the editor
  # runtime the same way; the unknown-card branches are what this pins)
  %w[rule_board_link rule_nest_editor_link quick_edit one_line_content
     raw_one_line_content overlay_title].each do |view|
    results["new_rule_card"]["views"][view] = render_view(new_rule, view)
  end
end

# --- the setting registry the list views walk --------------------------------

proto = set_card.prototype
results["setting_registry"]["prototype_type"] = proto.type_name.to_s
results["setting_registry"]["visible_setting_codenames"] =
  set_card.visible_setting_codenames.map(&:to_s)
results["setting_registry"]["all_settings_sorted"] =
  set_card.all_settings.map(&:to_s)
results["setting_registry"]["groups"] = Card::Setting.groups.each_with_object({}) do |(group, settings), h|
  h[group.to_s] = set_card.group_settings(group).map(&:to_s)
end
results["setting_registry"]["common_settings"] =
  set_card.category_settings(:common).map(&:to_s)
results["setting_registry"]["field_settings"] =
  set_card.category_settings(:field).map(&:to_s)

after_count = action_count
results["no_write_proof"] = {
  "actions_before" => before_count,
  "actions_after" => after_count,
  "unchanged" => before_count == after_count
}

FileUtils.mkdir_p(File.dirname(OUT_PATH))
File.write(OUT_PATH, JSON.pretty_generate(deep_sort(results)) + "\n")

puts "captured rules-views: #{OUT_PATH}"
puts "no-write proof: #{before_count} -> #{after_count} (#{before_count == after_count})"

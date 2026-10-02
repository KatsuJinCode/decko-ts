# oracle-capture-rules-nest-views.rb - oracle capture for the rules-cap
# lane: the two views the rules-views-port-3 lane could only pin by
# COMPOSITION (no captured bytes existed for them): set/type/set/
# html_views/filtered_rule_lists.rb :nest_rules + :modal_nest_rules,
# rendered on the Set card "*all" - the exact card+view combo the ported
# TS dispatch entries carry (card-mod-rules.ts assertSetCard(ctx, ...)).
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-rules-nest-views.rb
#
# Records to <lane-worktree>/fixtures/captured/rules-nest-views.json:
# 1. set_card.views.nest_rules / modal_nest_rules: the captured bytes.
# 2. set_card.views.quick_edit_setting_list: re-rendered in the SAME run
#    as the cross-check reference (the nest_rules body IS this view's
#    output; the modal body renders it after the filter form).
# 3. type_editable_rule_card.views.rule_form_card_editor: rendered on the
#    EXISTING rule card "*all+*default" - *default's setting_opts carries
#    rule_type_editable: true (card-mod-content set/self/default.rb:1),
#    so this surface triggers the rules_type_formgroup TYPE-EDITABLE
#    branch (editor.rb:93-105) the rules-views-port-3 lane could only
#    cite (the captured *read setting is not rule_type_editable).
# 4. The no-write proof: card_actions count before and after. The capture
#    performs ZERO card writes (render only) - the same discipline as the
#    rules-views capture (its proof was 4945 -> 4945).
#
# Determinism contract (mirrors oracle-capture-rules-views.rb): pretty
# JSON with deeply sorted keys + trailing newline; data-slot-id normalized
# to RANDOMIZED; select2 data-select2-id seconds suffix to TIME.

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "rules-nest-views.json")

SET_CARD_VIEWS = %w[nest_rules modal_nest_rules quick_edit_setting_list].freeze

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
  "captured_by" => "oracle-capture-rules-nest-views.rb (rules-cap lane 2026-09-29)",
  "gem_source" =>
    "card-mod-rules-0.20.0 set/type/set/html_views/filtered_rule_lists.rb:2-11",
  "normalizations" => {
    "data-slot-id" => "RANDOMIZED",
    "select2 data-select2-id seconds suffix" => "TIME"
  },
  "no_write_discipline" =>
    "render-only capture; card_actions count asserted unchanged",
  "set_card" => {},
  "type_editable_rule_card" => {}
}

before_count = action_count

set_card = Card["*all"]
raise "*all card missing" unless set_card
raise "*all is not Set-typed (#{set_card.type_code})" unless set_card.type_code == :set

results["set_card"]["meta"] = card_meta(set_card)
results["set_card"]["views"] = SET_CARD_VIEWS.each_with_object({}) do |view, h|
  h[view] = render_view(set_card, view)
end

# --- a rule card whose setting IS rule_type_editable --------------------------
# "*all+*default" exists in this deck (the *default rule); its setting's
# setting_opts carries rule_type_editable: true, so rule_form_card_editor's
# first part (rules_type_formgroup, editor.rb:93-105) renders the live
# type field instead of nil.

type_rule = Card.fetch("*all+*default", new: {})
if type_rule&.real?
  raise "*all+*default is not rule_type_editable" unless type_rule.right.rule_type_editable
  results["type_editable_rule_card"]["meta"] = card_meta(type_rule)
  results["type_editable_rule_card"]["views"] = {
    "rule_form_card_editor" => render_view(type_rule, :rule_form_card_editor)
  }
else
  results["type_editable_rule_card"]["missing"] = true
end

after_count = action_count
results["no_write_proof"] = {
  "actions_before" => before_count,
  "actions_after" => after_count,
  "unchanged" => before_count == after_count
}

FileUtils.mkdir_p(File.dirname(OUT_PATH))
File.write(OUT_PATH, JSON.pretty_generate(deep_sort(results)) + "\n")

puts "captured rules-nest-views: #{OUT_PATH}"
puts "no-write proof: #{before_count} -> #{after_count} (#{before_count == after_count})"

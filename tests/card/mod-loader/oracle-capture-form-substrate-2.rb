# oracle-capture-form-substrate-2.rb - oracle capture for the form-substrate-2
# lane: the rule_form / board_rule_set_selection / RuleSetRadio chain the two
# landed receipts (rules-views-port-3.md, rules-cap-lane.md) left as the open
# form-parity arms:
#
# 1. :rule_form (card-mod-rules set/rule/rule_form.rb:2-13) on
#    "*account+*right+*read" (id 208) - the deck's richest set_options walk
#    (5 candidates: the rule's own :current set, four broader sets of which
#    three render RuleSetRadio's narrower_warning_message arm and *all renders
#    the literal warning) - and on "*all plus+*read" - the 2-candidate walk
#    (:current + the *all literal). The board_rule_set_selection /
#    RuleSetRadio bytes inside (rule_form/set_selection.rb:2-21 +
#    rule_form/rule_set_radio.rb) carry BOTH narrower-warning shapes: the
#    singular "narrower rule for <to_sentence([\""])>" and the plural
#    "narrower rules for <to_sentence([\"\",\"\",...])>" - the accumulated
#    array holds the set cards' uncapitalized_label values, which are ALL ""
#    (the Ruby method's own local-variable shadowing bug, set/type/set.rb:43;
#    the port's uncapitalizedLabelForParsedSet already documents it).
# 2. :modal_rule (set/rule/board_rules_editor.rb:8-11) on "*all+*read"
#    rendered with hide: :modal_header - the modal wrap's voo.show? gates for
#    a hidden header (modal_dialog.haml:6-13), the second open arm; the header
#    block (title + modal-menu) is ABSENT from the bytes while the body
#    carries the single-candidate rule_form.
#
# The no-write proof: card_actions count before and after; the capture
# performs ZERO card writes (render only).
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-form-substrate-2.rb

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "form-substrate-2.json")

SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze
# RuleSetRadio's dom id is "#{format.unique_id}-#{Time.now.to_i}"
# (rule_set_radio.rb:19) - the seconds suffix is render-time data. The
# unique_id's safe_key carries underscores ("Xall_plu-...").
RADIO_SECONDS_RE = /((?:id|for)="X[a-zA-Z0-9_-]+-\d+-)\d+"/.freeze

def normalize(html)
  html.to_s.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
      .gsub(RADIO_SECONDS_RE, '\1TIME"')
end

def render_view(card, view, opts = {})
  raw = opts.empty? ? card.format(:html).render(view) : card.format(:html).render(view, opts)
  { "bytes" => normalize(raw) }
rescue StandardError => e
  { "error_class" => e.class.name, "message" => e.message[0, 400] }
end

def card_meta(card)
  { "id" => card.id, "key" => card.key, "name" => card.name.to_s,
    "type_id" => card.type_id, "type_name" => card.type_name.to_s,
    "type_code" => card.type_code.to_s, "db_content" => card.db_content.to_s,
    "last_action_id" => card.last_action_id }
end

def action_count
  ActiveRecord::Base.connection.select_value("SELECT COUNT(*) FROM card_actions").to_i
end

def sort_json(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| sort_json(v) }
  when Array then obj.map { |v| sort_json(v) }
  else obj
  end
end

before_count = action_count

results = {
  "normalizations" => {
    "data-slot-id" => "RANDOMIZED",
    "RuleSetRadio unique_id seconds suffix (rule_set_radio.rb:19)" => "TIME"
  },
  "no_write_discipline" =>
    "render-only capture; card_actions count asserted unchanged",
  "helper_facts" => {},
  "rule_card_account_right_read" => {},
  "rule_card_all_plus_read" => {},
  "rule_card_all_read_modal" => {}
}

# --- the walk's set-label facts (the TS side resolves them through the
# --- pattern registry; these are the capture deck's cross-check values) ----

["*account+*right", "*rstar", "RichText+*type", "*all plus", "*all",
 "*email+*right"].each do |set_name|
  sc = Card.fetch(set_name)
  results["helper_facts"][set_name] = {
    "label" => sc.label,
    "uncapitalized_label" => sc.uncapitalized_label,
    "follow_label" => sc.respond_to?(:follow_label) ? sc.follow_label : nil
  }
end

# --- the multi-candidate rule_form surfaces ---------------------------------

{
  "rule_card_account_right_read" => "*account+*right+*read",
  "rule_card_all_plus_read" => "*all plus+*read"
}.each do |key, name|
  card = Card.fetch(name)
  raise "#{name} not real" unless card&.real?

  results[key]["meta"] = card_meta(card)
  results[key]["views"] = { "rule_form" => render_view(card, :rule_form) }
end

# --- the modal hidden-header arm (board_rules_editor.rb:8-11 + --------------
# --- modal_dialog.haml:6-13's voo.show? :modal_header gate) -----------------

modal_card = Card.fetch("*all+*read")
raise "*all+*read not real" unless modal_card&.real?

results["rule_card_all_read_modal"]["meta"] = card_meta(modal_card)
results["rule_card_all_read_modal"]["views"] = {
  "modal_rule" => render_view(modal_card, :modal_rule),
  "modal_rule_hide_header" => render_view(modal_card, :modal_rule, hide: :modal_header)
}

after_count = action_count
results["no_write_proof"] = {
  "actions_before" => before_count,
  "actions_after" => after_count,
  "unchanged" => (before_count == after_count)
}

File.write(OUT_PATH, JSON.pretty_generate(sort_json(results)) + "\n")
puts "captured #{OUT_PATH}"
puts "no-write proof: #{before_count} -> #{after_count} (#{before_count == after_count})"

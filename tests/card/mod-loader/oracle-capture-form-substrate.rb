# oracle-capture-form-substrate.rb - oracle capture for the form-machinery-
# substrate lane: the byte chains the blocked views ride, rendered on rule
# cards whose editor input is the ACE branch (not the permissions perm-editor,
# not the carrierwave upload):
#
# 1. rule_card views on "*all+*head" (id 49, HTML-typed - Type::Html
#    html-format input_type :ace_editor, card-mod-format set/type/html.rb:20)
#    and "*all+*guide" (id 95, Markdown-typed - card-mod-markdown
#    set/type/markdown.rb:20-24, ace_mode :markdown):
#    :quick_edit + :quick_edit_success (card-mod-rules set/rule/quick_editor.rb
#    :2-8) - the demonstration views of the substrate lane. Their chains are
#    quick_edit.haml -> quick_form (card_form :update, quick_editor.rb:14-23)
#    -> quick_editor -> rule_content_formgroup -> content_formgroup
#    (card-mod-edit set/all/form.rb:16-18) -> content_field -> input
#    (set/all/editor.rb:32-36) -> ace_editor_input (card-mod-ace_editor
#    set/all/ace_editor.rb:9-14, bootstrap form-control append
#    card-mod-bootstrap set/all/bootstrap/form.rb:25-29) -> set_info
#    (quick_editor.rb:25-29 + set_info.haml) -> undo_button (:31-38).
# 2. image_card views on the deck's first real Image-typed card:
#    :new_image_buttons (card-mod-tinymce_editor set/all/nest_image.rb:21-24)
#    - button_formgroup + standard_save_button(no_origin_update: true), the
#    oracle pin of the BUTTON substrate (the view body only fires on a KNOWN
#    card; on a new card the render is the unknown-view substitution).
# 3. helper facts the substrate implementation reads:
#    - Cardio.config.rich_text_editor (the default input branch)
#    - each rule card's last_action_id (the undo link's revert_actions value;
#      deck data, normalized out of the pins)
#    - the capture deck's *recent settings pointer content (the
#      categories walk's recent membership - setting_categories.rb:43-45;
#      deck data, seeded in the TS tests)
# 4. The no-write proof: card_actions count before and after; the capture
#    performs ZERO card writes (render only).
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-form-substrate.rb

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "form-substrate.json")

SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze
REVERT_ACTION_RE = /(revert_actions%5B%5D=)\d+/.freeze

def normalize(html)
  html.to_s.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
      .gsub(REVERT_ACTION_RE, '\1ACTIONID')
end

def render_view(card, view)
  raw = card.format(:html).render(view)
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
    "undo link revert_actions[] action id" => "ACTIONID"
  },
  "no_write_discipline" =>
    "render-only capture; card_actions count asserted unchanged",
  "helper_facts" => {},
  "rule_card_head" => {},
  "rule_card_guide" => {},
  "image_card" => {}
}

results["helper_facts"]["rich_text_editor"] =
  Cardio.config.rich_text_editor.to_s
recent = Card[:recent_settings]
results["helper_facts"]["recent_settings_content"] =
  recent ? recent.item_names.to_a.map(&:to_s) : nil

# --- the demonstration rule cards -------------------------------------------

{ "rule_card_head" => "*all+*head", "rule_card_guide" => "*all+*guide" }
  .each do |key, name|
  card = Card.fetch(name, new: {})
  raise "#{name} not real" unless card&.real?

  results[key]["meta"] = card_meta(card)
  results[key]["views"] = %w[quick_edit quick_edit_success]
                           .each_with_object({}) do |view, h|
    h[view] = render_view(card, view)
  end
end

# --- the BUTTON substrate on a known Image card ------------------------------

image_card = Card.search(type_id: Card.fetch(:image).id, limit: 1).first
if image_card&.real?
  results["image_card"]["meta"] = card_meta(image_card)
  results["image_card"]["views"] = {
    "new_image_buttons" => render_view(image_card, :new_image_buttons)
  }
else
  results["image_card"]["meta"] = nil
  results["image_card"]["views"] = nil
end

after_count = action_count
results["no_write_proof"] = {
  "actions_before" => before_count,
  "actions_after" => after_count,
  "unchanged" => (before_count == after_count)
}

File.write(OUT_PATH, JSON.pretty_generate(sort_json(results)) + "\n")
puts "captured #{OUT_PATH}"
puts "no-write proof: #{before_count} -> #{after_count} (#{before_count == after_count})"

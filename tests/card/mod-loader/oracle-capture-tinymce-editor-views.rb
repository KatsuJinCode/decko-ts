# oracle-capture-tinymce-editor-views.rb - renders the
# card-mod-tinymce_editor-0.20.0 html editor views for byte fixtures
# (set/all/reference_editor/link_editor.rb:2-12,
# nest_editor.rb:10-28, nest_image.rb:2-25).
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-tinymce-editor-views.rb
#
# Records to fixtures/captured/tinymce-editor-views.json:
# 1. the set-module view registrations the tinymce_editor mod contributes
#    (the three reference_editor format modules' _view_<name> methods, with
#    source locations proving which gem file defined them - the pin links
#    the render to the gem file)
# 2. the editor chrome's helper facts the TS port must reproduce:
#    - format.view_list (nest_editor_options.rb:43 unshifts it into the
#      View select; demo.rb:14-16 is the only definition in the bundle)
#    - format.all_views COUNT + the full sorted list (nest_editor_options
#      .rb:84 feeds the show/hide TEMPLATE select; sized here so the port
#      can name its blocker precisely)
#    - [:all, :by_name].to_name.to_s (link_editor.haml:9 / nest_editor
#      .haml:10 data-options-card)
#    - Card.autoname("image01") (nest_image.rb:33) and String#next of it
# 3. rendered bytes for a RichText probe card's NINE html editor views,
#    each through a FRESH card.format (the format instance owns the
#    unique_id counter - nest_editor_options.rb:11 keys the option-name
#    selects on it, and the TS engine creates a fresh format per render,
#    so the capture must too). NO tm_snippet_raw param is set: the headless
#    TS render engine models no request params, so the absent-params arm is
#    the reachable one (the established precedent of the mod's js-view
#    port, card-mod-tinymce_editor.ts header).
# 4. new_image + new_image_buttons on a FRESH NEW image card
#    (Card.new(name: <autonamed>, type: :image)) - the shape the nest_image
#    upload tab nests - so the create_form-blocked bytes are on record.
#
# Determinism contract (mirrors oracle-capture-help-popover.rb): output JSON
# is pretty-printed with deeply sorted keys + trailing newline; the random
# data-slot-id attribute is normalized to a placeholder; probe seed cards
# are created-if-missing and DELETED (trashed) after the run so the shared
# DB returns to its prior state. The render phase is proven
# write-free with the card_actions count (before == after).

require "json"
require "fileutils"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "tinymce-editor-views.json")

PROBE = "Oracle TinyMCE Editor Probe"

SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze
CARD_ID_RE = /data-card-id=(["'])\d+\1/.freeze
# Rails authenticity_token inputs (create_form on the fresh-new image card)
# carry a per-session token - seed state, not view semantics.
TOKEN_RE = /name="authenticity_token"[^>]*value=(["'])[^"']*\1/.freeze
# select(2) tags can stamp per-element ids on the server side in some rails
# helper paths; normalized like the other per-session randomness.
SELECT2_RE = /data-select2-id=(["'])[^"']*\1/.freeze

def normalize(html)
  html.to_s
      .gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
      .gsub(CARD_ID_RE, 'data-card-id="RANDOMIZED"')
      .gsub(TOKEN_RE, 'name="authenticity_token" type="hidden" value="RANDOMIZED"')
      .gsub(SELECT2_RE, 'data-select2-id="RANDOMIZED"')
end

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def seed_card(attrs)
  existing = Card.fetch(attrs[:name], new: {})
  if existing.new_card?
    Card.create! attrs
    "created"
  else
    "present"
  end
end

def source_location_of(format_mod, method)
  return nil unless format_mod.respond_to?(:instance_method)

  format_mod.instance_method(method).source_location
rescue StandardError
  nil
end

payload = {}
seed_log = {}

# ---- seed (create-if-missing; removed again after capture) ------------------
Card::Auth.as_bot do
  seed_log[PROBE] = seed_card(name: PROBE, type: "RichText", content: "probe card body")
end

# the no-write proof brackets the RENDER phase only (the seed above and the
# cleanup below move card_actions by design - one create + one delete)
before_count = Card::Action.count

probe_card = Card.fetch(PROBE)

# ---- the nine declared html views + their gem files --------------------------
REGISTRATIONS = {
  "link_editor"       => "Card::Set::All::ReferenceEditor::LinkEditor",
  "modal_link_editor" => "Card::Set::All::ReferenceEditor::LinkEditor",
  "nest_editor"       => "Card::Set::All::ReferenceEditor::NestEditor",
  "modal_nest_editor" => "Card::Set::All::ReferenceEditor::NestEditor",
  "nest_content"      => "Card::Set::All::ReferenceEditor::NestEditor",
  "nest_image"        => "Card::Set::All::ReferenceEditor::NestImage",
  "modal_nest_image"  => "Card::Set::All::ReferenceEditor::NestImage",
  "new_image"         => "Card::Set::All::ReferenceEditor::NestImage",
  "new_image_buttons" => "Card::Set::All::ReferenceEditor::NestImage"
}.freeze

registrations = {}
REGISTRATIONS.each do |view, mod_name|
  mod = begin
    Object.const_get(mod_name).const_get(:HtmlFormat)
  rescue StandardError
    nil
  end
  registrations[view] = {
    "module" => mod_name,
    "defined" => mod&.method_defined?("_view_#{view}") || false,
    "source_location" => mod ? source_location_of(mod, "_view_#{view}") : nil
  }
end
payload["registered_views"] = registrations

# ---- the helper facts the port needs -----------------------------------------
format = probe_card.format
payload["helper_facts"] = {
  # nest_editor_options.rb:43 `options_for_select(view_list.unshift(nil), ...)`
  "view_list" => format.view_list.map(&:to_s),
  # nest_editor_options.rb:84 `options_for_select(all_views)` (the
  # ._templates.d-none show/hide select) - demo.rb:40-43
  "all_views_count" => format.all_views.size,
  "all_views" => format.all_views.map(&:to_s),
  # link_editor.haml:9 + nest_editor.haml:10 data-options-card
  "options_card_name" => [:all, :by_name].to_name.to_s,
  # nest_image.rb:33 card.autoname("image01") - lib/card/name/all.rb:39-44
  "image_autoname" => probe_card.autoname("image01"),
  "image01_next" => "image01".next,
  "image01_exists" => Card.exist?("image01"),
  # nest_editor.rb:1-3 left_type_for_nest_editor_set_selection
  "probe_left_type" => probe_card.left_type_for_nest_editor_set_selection.to_s
}

# ---- the nine renders (each through a FRESH format) ---------------------------
views = {}
%w[
  link_editor modal_link_editor
  nest_editor modal_nest_editor nest_content
  nest_image modal_nest_image
].each do |view|
  views["#{PROBE}##{view}"] = normalize(Card::Auth.as_bot { probe_card.format.render(view.to_sym) })
rescue StandardError => e
  views["#{PROBE}##{view}"] = "CAPTURE_ERROR: #{e.class}: #{e.message}"
end

# the fresh-new image card shape the upload tab nests (nest_image.rb:35)
autonamed = payload["helper_facts"]["image_autoname"]
new_image_card = Card.new(name: autonamed, type: :image)
%w[new_image new_image_buttons].each do |view|
  views["new:#{autonamed}##{view}"] =
    normalize(Card::Auth.as_bot { new_image_card.format.render(view.to_sym) })
rescue StandardError => e
  views["new:#{autonamed}##{view}"] = "CAPTURE_ERROR: #{e.class}: #{e.message}"
end
payload["rendered"] = views

# ---- cleanup: trash the probe card so the shared DB stays untouched ----------
after_count = Card::Action.count
Card::Auth.as_bot do
  card = Card.fetch(PROBE)
  if card && !card.new_card?
    begin
      card.delete!
      seed_log["deleted:#{PROBE}"] = "deleted"
    rescue StandardError => e
      seed_log["deleted:#{PROBE}"] = "DELETE_FAILED: #{e.class}: #{e.message}"
    end
  end
end

payload["no_write_proof"] = {
  "actions_before" => before_count,
  "actions_after" => after_count,
  "unchanged" => before_count == after_count
}

FileUtils.mkdir_p(File.dirname(OUT_PATH))
File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")

puts "seed_log: #{JSON.generate(deep_sort(seed_log))}"
puts "no-write proof: #{before_count} -> #{after_count} (#{before_count == after_count})"
puts "WROTE #{OUT_PATH} (#{File.size(OUT_PATH)} bytes)"
$stdout.flush

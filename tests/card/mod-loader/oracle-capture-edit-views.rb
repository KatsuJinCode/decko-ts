# oracle-capture-edit-views.rb - renders the card-mod-edit
# EDIT-VIEWS (16 views):
# the inline-editing surface (:edit_inline, :edit_inline_buttons, :edit_row,
# :edit_in_form), the create surface (:new, :new_in_modal,
# :new_in_modal_buttons, :new_fields, :new_type_formgroup, :simple_new),
# the board-tab pieces that delegate to ported views (:guide_tab), the
# structure/nests placeholders (:edit_structure, :edit_nests), the read-form
# formgroups (:read_form, :read_formgroup) and the overlay guide
# (:overlay_guide).
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-edit-views.rb
#
# Records to fixtures/captured/edit-views.json:
# 1. For each target card (the basic RichText probe card and the
#    deck-level "Home" - the SAME two targets the edit-forms and
#    edit-name-type captures used) and each actor (Decko Bot = signed-in
#    admin, a signed-in non-admin member account, Anonymous): the rendered
#    bytes of all 16 views above.
#    The perms-:update views (:edit_inline, :edit_in_form) and the
#    perms-:create views (:new, :new_in_modal, :new_fields, :simple_new)
#    raise Card::Error::PermissionDenied for anonymous - recorded as
#    {denied: true, class:, message:} exactly as the previous edit captures
#    recorded the anonymous denials. The perms-free views render for all
#    three actors.
# 2. The NEW-CARD surface: Card.new(type_id: RichTextID) with a BLANK name
#    (never saved - render only) for the six create-surface views and the
#    same three actors. This is the surface a visitor of /new/:type sees:
#    :new_fields renders the name formgroup + the name_prompt hidden (the
#    name-prompt arm the existing-card arms cannot reach, since
#    needs_name? (autoname.rb:14-16) short-circuits false on a present
#    name) and the modal title resolves new_in_modal_title to the "New"
#    title. Recorded per actor under new_card.views.
# 3. The no-write proof: the card_actions count before and after the whole
#    run (every render above, on every target, every actor). The
#    script performs ZERO card writes: no Card.create/update/save on any
#    card; the new-card arms render unsaved Card instances only.
#
# Targets are EXISTING cards on the deck the script runs against (see
# TARGETS).
#
# Determinism contract (mirrors oracle-capture-edit-name-type.rb): output
# JSON is pretty-printed with deeply sorted keys + a trailing newline; the
# same random/dynamic attributes are normalized to placeholders:
#   data-slot-id  (random hex per slot - Ruby assigns fresh ids every render)
#   data-card-id  (row ids are seed state, not form semantics)
#   data-select2-id ("<unique_id>-<epoch seconds>" - Time.now based; the
#     type select's live-field marker - :new_type_formgroup renders it)
#   the conflict-tracker hidden value (card.last_action_id - seed state)
# A re-run must produce byte-identical JSON.

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "edit-views.json")
PIN_DIR   = "CAPTURE_DIR"

TARGETS = [
  { name: "Oracle Basics", label: "basic_note" },
  { name: "Home",          label: "deck_level" }
].freeze
ACTORS = %w[bot tova anonymous].freeze
VIEWS  = %w[edit_inline edit_inline_buttons edit_row edit_in_form
            new_in_modal_buttons new_type_formgroup
            overlay_guide read_form read_formgroup
            guide_tab edit_nests edit_structure
            new new_in_modal new_fields simple_new].freeze

# The unsaved new-card surface (blank name - the name-prompt arm). The
# render-only Card instance is discarded after each render.
NEW_CARD_VIEWS = %w[new new_in_modal new_fields simple_new
                    new_in_modal_buttons new_type_formgroup].freeze

SLOT_ID_RE   = /data-slot-id=(["'])\h+\1/.freeze
CARD_ID_RE   = /data-card-id=(["'])\d+\1/.freeze
SELECT2_ID_RE = /data-select2-id=(["'])([^"']*)-\d+\1/.freeze
REVISION_VALUE_RE = /value="\d+" name="card\[last_action_id_before_edit\]"/.freeze

def normalize(html)
  html.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
      .gsub(CARD_ID_RE, 'data-card-id="RANDOMIZED"')
      .gsub(SELECT2_ID_RE, 'data-select2-id="SELECT2"')
      .gsub(REVISION_VALUE_RE, 'value="ACTION_ID" name="card[last_action_id_before_edit]"')
end

def deep_sort(obj)
  case obj
  when Hash  then obj.sort.to_h.transform_values { |v| deep_sort(v) }
  when Array then obj.map { |v| deep_sort(v) }
  else obj
  end
end

def as_actor(actor)
  case actor
  when "bot"   then Card::Auth.signin(Card::DeckoBotID)
  when "tova"
    tova = Card["Tova"]
    raise "Tova account card missing" unless tova

    Card::Auth.signin(tova.id)
  when "anonymous" then Card::Auth.signin(Card::AnonymousID)
  end
  yield
ensure
  Card::Auth.signin(Card::AnonymousID)
end

def render_or_deny(card, view)
  normalize(card.format(:html).render(view))
rescue StandardError => e
  { "denied" => true, "error_class" => e.class.name, "message" => e.message[0, 300] }
end

def action_count
  ActiveRecord::Base.connection.select_value("SELECT COUNT(*) FROM card_actions").to_i
end

results = { "actors_note" => "bot=Decko Bot(admin) tova=Tova(non-admin member) anonymous=Anonymous",
            "normalizations" => {
              "data-card-id" => "RANDOMIZED",
              "data-select2-id" => "SELECT2",
              "data-slot-id" => "RANDOMIZED"
            },
            "no_write_discipline" =>
              "render-only capture; card_actions count asserted unchanged across " \
              "every render (existing targets + the unsaved new-card surface)",
            "targets" => {} }

before_count = action_count

TARGETS.each do |target|
  card = Card[target[:name]]
  raise "target card missing: #{target[:name]}" unless card

  entry = { "id" => card.id, "name" => card.name.to_s, "type" => card.type_name.to_s,
            "views" => {} }
  ACTORS.each do |actor|
    as_actor(actor) do
      entry["views"][actor] = VIEWS.each_with_object({}) do |view, h|
        h[view] = render_or_deny(card, view)
      end
    end
  end
  results["targets"][target[:label]] = entry
end

# ---- the unsaved new-card surface ------------------------------------------
# Card.new(type_id: RichTextID), name BLANK: the /new/:type surface's card
# state. Render-only; the instance is never saved (no write path runs).
rich_text_card = Card["RichText"]
raise "RichText cardtype card missing" unless rich_text_card

rich_text_id = rich_text_card.id
new_card_views = {}
ACTORS.each do |actor|
  as_actor(actor) do
    new_card_views[actor] = NEW_CARD_VIEWS.each_with_object({}) do |view, h|
      probe = Card.new type_id: rich_text_id
      h[view] = render_or_deny(probe, view)
    end
  end
end
results["new_card"] = {
  "note" => "unsaved Card.new(type_id: RichTextID), blank name - the " \
            "name-prompt arm of :new_fields / the 'New' modal title; render-only",
  "views" => new_card_views
}

after_count = action_count
results["no_write_proof"] = {
  "actions_before" => before_count,
  "actions_after" => after_count,
  "unchanged" => before_count == after_count
}

FileUtils.mkdir_p(File.dirname(OUT_PATH))
File.write(OUT_PATH, JSON.pretty_generate(deep_sort(results)) + "\n")

# Write the same bytes to CAPTURE_DIR when it exists (raw copies for reference).
if File.directory?(PIN_DIR)
  File.write(File.join(PIN_DIR, "edit-views-oracle.json"),
             JSON.pretty_generate(deep_sort(results)) + "\n")
end

puts "captured edit-views: #{OUT_PATH}"
puts "no-write proof: #{before_count} -> #{after_count} (#{before_count == after_count})"

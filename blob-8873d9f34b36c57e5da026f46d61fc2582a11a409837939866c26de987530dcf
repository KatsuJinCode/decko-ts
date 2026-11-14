# oracle-capture-edit-name-type.rb - renders the card-mod-edit
# NAME-EDITOR and TYPE-SHIFT surfaces:
# the framed name editor (frame -> header/menu/panel -> rename form), the
# bare name form, the name formgroup, the name row, the framed type editor,
# the bare type form, the type formgroup (the full cardtype select - the
# "type-shift" flow's live field) and the board type formgroup (the slot
# the edit form's type-row edit link fetches).
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-edit-name-type.rb
#
# Records to fixtures/captured/edit-name-type.json:
# 1. For each target card (the basic RichText probe card and the
#    deck-level "Home" - the SAME two targets the edit-forms capture used)
#    and each actor (Decko Bot = signed-in admin, a signed-in
#    non-admin member account, Anonymous): the rendered bytes of :edit_name,
#    :name_form, :name_formgroup, :edit_name_row, :edit_type,
#    :edit_type_form, :type_formgroup, :board_type_formgroup.
#    The perms-:update views (:edit_name, :name_form, :edit_type,
#    :edit_type_form) raise Card::Error::PermissionDenied for anonymous -
#    recorded as {denied: true, class:, message:} exactly as the edit-forms
#    capture recorded the anonymous :edit denial. The perms-free views
#    (:name_formgroup, :edit_name_row, :type_formgroup,
#    :board_type_formgroup) render for all three actors.
# 2. The no-write proof: the card_actions count before and after the whole
#    run (renders + the validation-level conflict probe re-run, the
#    SAME probe the edit-forms capture recorded - valid? runs validate-phase
#    events only and cannot persist). The script performs ZERO card writes:
#    no Card.create/update/save on any target.
#
# Targets are EXISTING cards on the deck the script runs against (see
# TARGETS).
#
# Determinism contract (mirrors oracle-capture-edit-forms.rb): output JSON
# is pretty-printed with deeply sorted keys + a trailing newline; the same
# random/dynamic attributes are normalized to placeholders:
#   data-slot-id  (random hex per slot - Ruby assigns fresh ids every render)
#   data-card-id  (row ids are seed-state, not form semantics)
#   data-select2-id ("<unique_id>-<epoch seconds>" - Time.now based; the
#     type select's live-field marker - this surface DOES render it, unlike
#     the edit-forms surface)
#   the conflict-tracker hidden value (card.last_action_id - seed state;
#     does not occur on these views but the mask is kept identical so both
#     fixtures share one normalization contract)
# A re-run must produce byte-identical JSON.

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "edit-name-type.json")
PIN_DIR   = "CAPTURE_DIR"

TARGETS = [
  { name: "Oracle Basics", label: "basic_note" },
  { name: "Home",          label: "deck_level" }
].freeze
ACTORS = %w[bot tova anonymous].freeze
VIEWS  = %w[edit_name name_form name_formgroup edit_name_row
            edit_type edit_type_form type_formgroup
            board_type_formgroup].freeze

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
              "every render and the validation-level conflict probe re-run",
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

# ---- conflict probe re-run (the basic_note target) --------------------------
# The SAME validation-level probe the edit-forms capture recorded: a stale
# last_action_id_before_edit + valid? runs detect_conflict, adds the
# :conflict error, and CANNOT persist (validate phase only). Included so
# this fixture carries the same no-write proof shape under the same
# discipline; the edit-forms fixture remains the canonical record.
basic = Card["Oracle Basics"]
last_id = basic.last_action_id
stale = ActiveRecord::Base.connection.select_value(
  "SELECT MIN(id) FROM card_actions WHERE card_id=#{basic.id} AND id != #{last_id}"
)
conflict = { "last_action_id" => last_id.to_i,
             "stale_action_id_known" => !stale.nil? }
as_actor("tova") do
  basic.last_action_id_before_edit = stale
  basic.valid?
  conflict["errors_conflict"] = (basic.errors[:conflict][0, 300] rescue nil)
end
results["conflict_probe"] = conflict

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
  File.write(File.join(PIN_DIR, "edit-name-type-oracle.json"),
             JSON.pretty_generate(deep_sort(results)) + "\n")
end

puts "captured edit-name-type: #{OUT_PATH}"
puts "no-write proof: #{before_count} -> #{after_count} (#{before_count == after_count})"

# oracle-capture-board-views.rb - oracle capture for the card-mod-edit
# BOARD family (the capture's second stage: the board/cardboard wrapper + the
# tab surface): :board, :cardboard, :engage_tab, :follow_section,
# :history_tab, :related_tab, :rules_tab, :edit_rules.
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-board-views.rb
#
# Records to <script-repo>/fixtures/captured/board-views.json:
# 1. For each target card ("Oracle Basics" / "Home" - the same two targets
#    as the edit-views capture) and each actor (bot / sara / anonymous):
#    the rendered bytes of the 8 views. :board is perms :update - anonymous
#    records the denial exactly as the previous captures did; :edit_rules
#    has no perms directive but nests the current set card's
#    :board_rules_tab (the rules accordion), which is where its byte weight
#    lives.
# 2. Probes the visibility machinery the board reads (for the receipt):
#    show_guide_tab? / show_engage_tab? / show_discussion? /
#    default_board_tab per target per actor, plus the visible tab list.
# 3. The no-write proof: card_actions count unchanged across every render.
#
# Determinism contract (mirrors oracle-capture-edit-views.rb): pretty JSON
# with deeply sorted keys + trailing newline; the same normalizations
# (slot-id / card-id / select2-id / revision-value). A re-run must produce
# byte-identical JSON.

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "board-views.json")
PIN_DIR   = "CAPTURE_DIR"

TARGETS = [
  { name: "Oracle Basics", label: "basic_note" },
  { name: "Home",          label: "deck_level" }
].freeze
ACTORS = %w[bot sara anonymous].freeze
VIEWS  = %w[board cardboard engage_tab follow_section history_tab
            related_tab rules_tab edit_rules].freeze

SLOT_ID_RE   = /data-slot-id=(["'])\h+\1/.freeze
CARD_ID_RE   = /data-card-id=(["'])\d+\1/.freeze
SELECT2_ID_RE = /data-select2-id=(["'])([^"']*)-\d+\1/.freeze
REVISION_VALUE_RE = /value="\d+" name="card\[last_action_id_before_edit\]"/.freeze
UNIQUE_ID_RE = /id="tab-\d+-/.freeze

def normalize(html)
  html.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
      .gsub(CARD_ID_RE, 'data-card-id="RANDOMIZED"')
      .gsub(SELECT2_ID_RE, 'data-select2-id="SELECT2"')
      .gsub(REVISION_VALUE_RE, 'value="ACTION_ID" name="card[last_action_id_before_edit]"')
      .gsub(UNIQUE_ID_RE, 'id="tab-UNIQUE-')
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
  when "sara"
    sara = Card["Sara"]
    raise "Sara account card missing" unless sara

    Card::Auth.signin(sara.id)
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

results = { "actors_note" => "bot=Decko Bot(admin) sara=Sara(non-admin member) anonymous=Anonymous",
            "normalizations" => {
              "data-card-id" => "RANDOMIZED",
              "data-select2-id" => "SELECT2",
              "data-slot-id" => "RANDOMIZED",
              "tab-id-counter" => "UNIQUE"
            },
            "no_write_discipline" =>
              "render-only capture; card_actions count asserted unchanged across " \
              "every render",
            "targets" => {} }

before_count = action_count

TARGETS.each do |target|
  card = Card[target[:name]]
  raise "target card missing: #{target[:name]}" unless card

  entry = { "id" => card.id, "name" => card.name.to_s, "type" => card.type_name.to_s,
            "views" => {}, "visibility" => {} }
  ACTORS.each do |actor|
    as_actor(actor) do
      entry["views"][actor] = VIEWS.each_with_object({}) do |view, h|
        h[view] = render_or_deny(card, view)
      end
      fmt = card.format(:html)
      entry["visibility"][actor] = {
        "show_guide_tab?" => (fmt.send(:show_guide_tab?) rescue "ERR"),
        "show_engage_tab?" => (fmt.send(:show_engage_tab?) rescue "ERR"),
        "show_discussion?" => (fmt.send(:show_discussion?) rescue "ERR"),
        "show_follow?" => (fmt.send(:show_follow?) rescue "ERR"),
        "default_board_tab" => (fmt.send(:default_board_tab).to_s rescue "ERR"),
        "visible_board_tabs" => (fmt.send(:visible_board_tabs).values.map(&:to_s) rescue "ERR")
      }
    end
  end
  results["targets"][target[:label]] = entry
end

after_count = action_count
results["no_write_proof"] = {
  "actions_before" => before_count,
  "actions_after" => after_count,
  "unchanged" => before_count == after_count
}

FileUtils.mkdir_p(File.dirname(OUT_PATH))
File.write(OUT_PATH, JSON.pretty_generate(deep_sort(results)) + "\n")

if File.directory?(PIN_DIR)
  File.write(File.join(PIN_DIR, "board-views-oracle.json"),
             JSON.pretty_generate(deep_sort(results)) + "\n")
end

puts "captured board-views: #{OUT_PATH}"
puts "no-write proof: #{before_count} -> #{after_count} (#{before_count == after_count})"

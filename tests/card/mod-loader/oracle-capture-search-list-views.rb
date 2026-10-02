# oracle-capture-search-list-views.rb - oracle capture for the
# unpinned-view-captures lane, LANE B: the five mod-views-b views
# (search :checkbox_list, search :results_for_keyword, list :view_list)
# the mod-views lanes ported rendered-unpinned.
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-search-list-views.rb
#
# Records to <lane-worktree>/fixtures/captured/search-list-views.json:
# 1. For each target and each actor (Decko Bot = signed-in admin, Sara =
#    signed-in non-admin member, Anonymous - the SAME three actors the
#    edit-name-type capture used):
#    - checkbox_list + results_for_keyword on two Search-typed cards:
#      the populated arm (card 275 "Cardtype+*type+*content options",
#      cql roles-minus-codename, 4 real role items) and the empty arm
#      (card 304 "*script+*right+*content options", cql type-in
#      JavaScript/CoffeeScript, 0 items -> the bare no-search-results div).
#    - view_list on two List-family cards: the populated arm (card 152
#      "*input type+*right+*input type", Pointer-typed, 1 item "radio")
#      and the empty arm (card 193 "Shark+*members", List-typed, 0 items).
# 2. Per-item metadata (id, key, name, type, codename, db_content) for
#    every search/list item, so the TS fixture can seed byte-identical
#    cards (the checkbox_item/subformat wrap bytes carry each item's
#    data-card-id, type name, and SELF-<codename> set class).
# 3. set_scoping_probes: results_for_keyword raises Card::Error::UserError
#    on the "Search" CARDTYPE card (id 98, Type::Cardtype - NOT a member of
#    the search chain that carries the view) and checkbox_list raises on a
#    plain RichText card.
# 4. The no-write proof: card_actions count before and after the whole
#    capture. The capture performs ZERO card writes.
#
# Target ids verified by probes 1-4 recorded in
# C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/unpinned-view-captures.md.
#
# Determinism contract (mirrors oracle-capture-edit-name-type.rb): output
# JSON is pretty-printed with deeply sorted keys + a trailing newline; the
# random slot id is normalized to a placeholder. A re-run must produce
# byte-identical JSON. (The creator-credit TIME_AGO mask of the lane-A
# capture has no counterpart here: none of these views renders a relative
# time.)

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "search-list-views.json")
PIN_DIR   = "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/captures-unpinned-views"

ACTORS = %w[bot sara anonymous].freeze

SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze

def normalize(html)
  html.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
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

def render_view(card, view)
  raw = card.format(:html).render(view)
  bytes = normalize(raw.to_s)
  raw.nil? ? { "bytes" => bytes, "raw_nil" => true } : { "bytes" => bytes }
rescue StandardError => e
  { "denied" => true, "error_class" => e.class.name, "message" => e.message[0, 300] }
end

def card_meta(card)
  { "id" => card.id, "key" => card.key, "name" => card.name.to_s,
    "type_id" => card.type_id, "type_name" => card.type_name.to_s,
    "type_code" => card.type_code.to_s, "db_content" => card.db_content.to_s,
    "created_at" => card.created_at.iso8601 }
end

def item_meta(card)
  m = card_meta(card)
  m["codename"] = card.codename&.to_s
  m
end

def action_count
  ActiveRecord::Base.connection.select_value("SELECT COUNT(*) FROM card_actions").to_i
end

results = {
  "actors_note" => "bot=Decko Bot(admin) sara=Sara(non-admin member) anonymous=Anonymous",
  "normalizations" => { "data-slot-id" => "RANDOMIZED" },
  "no_write_discipline" =>
    "render-only capture; card_actions count asserted unchanged across every render",
  "targets" => {}
}

before_count = action_count

TARGETS = [
  { id: 275, label: "role_options_search",  views: %w[checkbox_list results_for_keyword] },
  { id: 304, label: "script_options_search", views: %w[checkbox_list results_for_keyword] },
  { id: 152, label: "input_type_rule_pointer", views: %w[view_list] },
  { id: 193, label: "shark_members_list",   views: %w[view_list] },
  # the Self::Search ANCHOR card: results_for_keyword renders ONLY here -
  # plain Search-typed cards DENY it (see set_scoping_probes + the DENIED
  # entries on 275/304); probe 1 rendered "" on this card
  { id: 100, label: "search_anchor_star_search", views: %w[results_for_keyword] }
].freeze

TARGETS.each do |target|
  card = Card[target[:id]]
  raise "target card missing: id #{target[:id]}" unless card
  raise "id #{target[:id]} is #{card.name}, expected stable target" if card.trash

  entry = { "meta" => card_meta(card), "views" => {},
            "items" => card.item_names.map(&:to_s).map do |nm|
              ic = Card[nm]
              ic ? item_meta(ic) : { "name" => nm.to_s, "unresolved" => true }
            end }
  ACTORS.each do |actor|
    as_actor(actor) do
      entry["views"][actor] = target[:views].each_with_object({}) do |view, h|
        h[view] = render_view(card, view)
      end
    end
  end
  results["targets"][target[:label]] = entry
end

# set-scoping probes: the dispatch boundary bytes
results["set_scoping_probes"] = {
  "results_for_keyword_on_cardtype_card_98" => begin
    Card[98].format(:html).render(:results_for_keyword)
    "RENDERED (unexpected)"
  rescue StandardError => e
    { "error_class" => e.class.name, "message" => e.message[0, 200] }
  end,
  "checkbox_list_on_richtext_card" => begin
    Card["Oracle Basics"].format(:html).render(:checkbox_list)
    "RENDERED (unexpected)"
  rescue StandardError => e
    { "error_class" => e.class.name, "message" => e.message[0, 200] }
  end
}

after_count = action_count
results["no_write_proof"] = {
  "actions_before" => before_count,
  "actions_after" => after_count,
  "unchanged" => before_count == after_count
}

FileUtils.mkdir_p(File.dirname(OUT_PATH))
File.write(OUT_PATH, JSON.pretty_generate(deep_sort(results)) + "\n")

if File.directory?(PIN_DIR)
  FileUtils.mkdir_p(PIN_DIR)
  File.write(File.join(PIN_DIR, "search-list-views-oracle.json"),
             JSON.pretty_generate(deep_sort(results)) + "\n")
end

puts "captured search-list-views: #{OUT_PATH}"
puts "no-write proof: #{before_count} -> #{after_count} (#{before_count == after_count})"

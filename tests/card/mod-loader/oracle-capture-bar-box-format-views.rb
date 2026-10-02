# oracle-capture-bar-box-format-views.rb - oracle capture for the
# unpinned-view-captures lane, LANE A: the twenty set/all bar_and_box +
# card-mod-format views the mod-views lanes ported rendered-unpinned, plus
# the two Image-type-only box views on a real Image card.
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-bar-box-format-views.rb
#
# Records to <lane-worktree>/fixtures/captured/bar-box-format-views.json:
# 1. For each target and each actor (Decko Bot = signed-in admin, Sara =
#    signed-in non-admin member, Anonymous - the SAME three actors the
#    edit-name-type capture used): the rendered bytes of the twenty set/all
#    views (bar_menu, bar_body, closed_bar, accordion_bar, open_bar,
#    expanded_bar, full_bar, box, box_top, box_middle, box_bottom,
#    title_link, title_no_link, open_content, header, header_title,
#    type_info, universal_edit_button, rss_links, meta_tags) on the two
#    RichText targets, and boxed/boxed_link (+ type_info) on the Image
#    target.
# 2. set_scoping_probes: the dispatch boundary bytes - boxed/boxed_link
#    raise Card::Error::UserError on a RichText card (set/type/image.rb is
#    not in a RichText card's chain).
# 3. The no-write proof: card_actions count before and after the whole
#    capture. The capture performs ZERO card writes.
#
# Targets (all existing cards; ids verified by probes 1-4 recorded in
# C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/unpinned-view-captures.md):
#   basic_note  "Oracle Basics" id 605 RichText (the edit2 target)
#   deck_level  "Home"          id 521 RichText (the edit2 target)
#   decko_logo  "Decko logo"    id 291 Image    (the deck's Image card)
# Target metadata (id, key, name, type, db_content, created_at) is recorded
# so the TS fixture can seed byte-identical cards; Home's nest target
# ("Getting started") is recorded too.
#
# Determinism contract (mirrors oracle-capture-edit-name-type.rb): output
# JSON is pretty-printed with deeply sorted keys + a trailing newline; the
# random slot id is normalized to a placeholder. ADDITION for this surface:
# the creator-credit relative age ("... </a> 9 days ago") is masked to
# TIME_AGO - time_ago_in_words(card.created_at) is wall-clock-relative by
# design and would drift between capture runs. A re-run must produce
# byte-identical JSON. Views whose Ruby render returns raw nil (type_info
# and rss_links on RichText cards - html.rb:10 `return unless
# card.type_code != :basic`, and head.rb's rss_link? guard) are recorded as
# "" with the raw-nil fact noted in nil_render_views.

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "bar-box-format-views.json")
PIN_DIR   = "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/captures-unpinned-views"

ACTORS = %w[bot sara anonymous].freeze

# the twenty set/all views, on both RichText targets
RICHTEXT_VIEWS = %w[bar_menu bar_body closed_bar accordion_bar open_bar
                    expanded_bar full_bar box box_top box_middle box_bottom
                    title_link title_no_link open_content header header_title
                    type_info universal_edit_button rss_links meta_tags].freeze
# the Image-type-only views (set/type/image.rb), on the Image target
IMAGE_VIEWS = %w[boxed boxed_link type_info].freeze

SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze
CREATOR_AGE_RE = /(<div class="text-muted creator-credit">Created by <a[\s\S]*?<\/a> ).*? ago(<\/div>)/.freeze

def normalize(html)
  html.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
      .gsub(CREATOR_AGE_RE, '\1TIME_AGO\2')
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

def action_count
  ActiveRecord::Base.connection.select_value("SELECT COUNT(*) FROM card_actions").to_i
end

results = {
  "actors_note" => "bot=Decko Bot(admin) sara=Sara(non-admin member) anonymous=Anonymous",
  "normalizations" => {
    "data-slot-id" => "RANDOMIZED",
    "creator_credit relative age (time_ago_in_words)" => "TIME_AGO"
  },
  "no_write_discipline" =>
    "render-only capture; card_actions count asserted unchanged across every render",
  "targets" => {}
}

before_count = action_count

TARGETS = [
  { name: "Oracle Basics", label: "basic_note", views: RICHTEXT_VIEWS },
  { name: "Home",          label: "deck_level", views: RICHTEXT_VIEWS },
  { name: "Decko logo",    label: "decko_logo", views: IMAGE_VIEWS }
].freeze

TARGETS.each do |target|
  card = Card[target[:name]]
  raise "target card missing: #{target[:name]}" unless card

  entry = { "meta" => card_meta(card), "views" => {} }
  ACTORS.each do |actor|
    as_actor(actor) do
      entry["views"][actor] = target[:views].each_with_object({}) do |view, h|
        h[view] = render_view(card, view)
      end
    end
  end
  results["targets"][target[:label]] = entry
end

# Home's nest target (Home content nests {{:getting_started|core}}; the
# box_middle/open_content bytes contain its expanded core)
getting_started = Card["Getting started"]
results["home_nest_target"] = getting_started ? card_meta(getting_started) : "MISSING"

# set-scoping probes: the Image-only views on a RichText card raise
basics = Card["Oracle Basics"]
results["set_scoping_probes"] = %w[boxed boxed_link].each_with_object({}) do |view, h|
  h[view] = begin
    basics.format(:html).render(view)
    "RENDERED (unexpected)"
  rescue StandardError => e
    { "error_class" => e.class.name, "message" => e.message[0, 200] }
  end
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
  FileUtils.mkdir_p(PIN_DIR)
  File.write(File.join(PIN_DIR, "bar-box-format-views-oracle.json"),
             JSON.pretty_generate(deep_sort(results)) + "\n")
end

puts "captured bar-box-format-views: #{OUT_PATH}"
puts "no-write proof: #{before_count} -> #{after_count} (#{before_count == after_count})"

# oracle-capture-format-remaining-views.rb - oracle capture for the
# card-mod-format views the format-views-port lane ports (the 2026-09-29
# coverage recount's remaining missing views minus :smart_label, which
# lane-follow2 9b980a5 already landed).
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-format-remaining-views.rb
#
# Records to fixtures/captured/format-remaining-views.json:
# 1. registered_views - the set-module view registrations (method defined?
#    + source_location into the card-mod-format gem tree), the pin that
#    links each live render to its gem file
# 2. rendered - the probe cards' rendered bytes for: edit_link, edit_button,
#    full_page_link, board_link, help_link, menu_block, content_panel,
#    content_with_title, flash, view_list, text_without_nests,
#    short_content (four content arms + the toggle arm), configure_link,
#    conflict, home_url (the no-host-divergence documentation arm)
#
# Determinism contract (mirrors oracle-capture-smart-label.rb): output JSON
# is pretty-printed with deeply sorted keys + trailing newline; probe seed
# cards are created-if-missing and DELETED (trashed) after capture so the
# shared oracle DB returns to its prior state (a re-run stays byte-stable).
#
# No-write proof: Card::Action.count is snapshotted after seeding and again
# after every render; renders are read-only and the count must not move
# (the seed/trash phases are create/revert cleanup around the capture, not
# part of it).

require "json"

REPO_ROOT = File.expand_path("../../..", __dir__)
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "format-remaining-views.json")

PROBE           = "Format Views Probe"
SHORT_PROBE     = "Short Probe"
LINES_PROBE     = "Lines Probe"
EMPTY_PROBE     = "Empty Probe"
FIVE_PROBE      = "Five Probe"
NEST_PROBE      = "Nest Probe"
TEXT_PROBE      = "Text Probe"
TOGGLE_PROBE    = "Toggle Views Probe"
CONFIGURE_PROBE = "Configure Probe"
CONFLICT_PROBE  = "Conflict Probe"

SEEDS = [
  { name: PROBE,           type: "RichText", content: "probe body" },
  { name: SHORT_PROBE,     type: "RichText", content: "1234567" },
  { name: LINES_PROBE,     type: "RichText", content: "line1\nline2\nline3" },
  { name: EMPTY_PROBE,     type: "RichText", content: "" },
  { name: FIVE_PROBE,      type: "RichText", content: "12345" },
  { name: NEST_PROBE,      type: "RichText", content: "before {{Nope Missing}} after" },
  { name: TEXT_PROBE,      type: "RichText", content: "Caf&eacute; &amp; <b>bold</b> tail" },
  { name: TOGGLE_PROBE,    type: "Toggle",   content: "1" },
  { name: CONFIGURE_PROBE, type: "Cardtype", content: "" }
].freeze

RENDER_TARGETS = {
  PROBE           => %i[edit_link edit_button full_page_link board_link help_link
                        menu_block content_panel content_with_title flash
                        view_list text_without_nests],
  SHORT_PROBE     => %i[short_content],
  LINES_PROBE     => %i[short_content],
  EMPTY_PROBE     => %i[short_content],
  FIVE_PROBE      => %i[short_content],
  TOGGLE_PROBE    => %i[short_content],
  NEST_PROBE      => %i[text_without_nests],
  TEXT_PROBE      => %i[text_without_nests],
  CONFIGURE_PROBE => %i[configure_link],
  "*home"         => %i[home_url]
}.freeze

SLOT_ID_RE  = /data-slot-id=(["'])\h+\1/.freeze
CARD_ID_RE  = /data-card-id=(["'])\d+\1/.freeze
ACT_ID_RE   = /act-id-\d+/.freeze
REVISION_RE = /revision-\d+/.freeze
ACT_PARAM_RE = /act_id=\d+/.freeze
ACTION_PARAM_RE = /action_id=\d+/.freeze
REVISION_SPAN_RE = /(new-current-revision-id">)\d+/.freeze
TIME_AGO_RE = /(less than a minute|less than \d+ seconds|\d+ seconds?|about \d+ (hours?|days?|months?|years?)|\d+ (minutes?|hours?|days?|months?|years?)) ago/.freeze
HOST_RE     = %r{https?://[^/]+/}.freeze

def normalize(html)
  html.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
      .gsub(CARD_ID_RE, 'data-card-id="N"')
      .gsub(ACT_ID_RE, "act-id-N")
      .gsub(REVISION_RE, "revision-N")
      .gsub(ACT_PARAM_RE, "act_id=N")
      .gsub(ACTION_PARAM_RE, "action_id=N")
      .gsub(REVISION_SPAN_RE, '\1N')
      .gsub(TIME_AGO_RE, "TIME_AGO ago")
end

def normalize_home_url(html)
  html.sub(HOST_RE, "/")
end

def deep_sort(obj)
  case obj
  when Hash  then obj.sort_by { |k, _| k.to_s }.to_h.transform_values { |v| deep_sort(v) }
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

def registration_proof(constants_and_methods)
  constants_and_methods.each_with_object({}) do |(const_path, method), h|
    mod = const_path.split("::").inject(Object) { |k, part| k.const_get(part) }
    h[method] = {
      "defined" => mod.method_defined?(:"_view_#{method}"),
      "source_location" => source_location_of(mod, :"_view_#{method}")
    }
  rescue StandardError => e
    h[method] = { "defined" => false, "error" => "#{e.class}: #{e.message}" }
  end
end

payload = {}
seed_log = {}

# ---- seed (create-if-missing; removed again after capture) ------------------
Card::Auth.as_bot do
  SEEDS.each { |attrs| seed_log[attrs[:name]] = seed_card(attrs) }
  # the conflict probe's two-act family (create + one content update), the
  # same shape the TS-side test writes through ActWriter
  conflict = Card.fetch(CONFLICT_PROBE, new: {})
  if conflict.new_card?
    Card.create! name: CONFLICT_PROBE, type: "RichText", content: "first body"
    seed_log[CONFLICT_PROBE] = "created"
  else
    seed_log[CONFLICT_PROBE] = "present"
  end
  conflict = Card.fetch(CONFLICT_PROBE)
  conflict.update! content: "second body" if conflict.content != "second body"
end

# ---- set-module view registration proof -------------------------------------
payload["registered_views"] = registration_proof(
  {
    "Card::Set::All::Html::Menu"    => %w[menu_block edit_link edit_button
                                          full_page_link board_link help_link],
    "Card::Set::All::Html::Views"   => %w[short_content content_panel
                                          content_with_title],
    "Card::Set::All::Html::Frame"   => %w[flash],
    "Card::Set::All::Demo"          => %w[view_list],
    "Card::Set::Type::Cardtype"     => %w[configure_link],
    "Card::Set::All::Text"          => %w[text_without_nests],
    "Card::Set::Self::Home"         => %w[home_url]
  }
)
# html/error.rb nests under the anchorless All set - the format module chain
# differs; probe both shapes for :conflict
conflict_mod = begin
  Card::Set::All::Html::Error.const_get(:Format)
rescue StandardError
  nil
end
payload["registered_views"]["conflict"] = if conflict_mod
  {
    "defined" => conflict_mod.method_defined?(:_view_conflict),
    "source_location" => source_location_of(conflict_mod, :_view_conflict)
  }
else
  { "defined" => false, "error" => "Card::Set::All::Html::Error::Format not found" }
end

# ---- no-write proof: actions snapshot BEFORE the render phase ---------------
actions_before = Card::Action.count

# ---- rendered probe views ---------------------------------------------------
views = {}
RENDER_TARGETS.each do |name, view_list|
  card = Card.fetch(name)
  format = card.format
  view_list.each do |view|
    bytes = format.render(view)
    bytes = normalize_home_url(bytes) if view == :home_url
    views["#{name}##{view}"] = normalize(bytes)
  rescue StandardError => e
    views["#{name}##{view}"] = "CAPTURE_ERROR: #{e.class}: #{e.message}"
  end
end
# the conflict probe LAST (its act bytes carry the ids/time-ago masks)
begin
  conflict = Card.fetch(CONFLICT_PROBE)
  views["#{CONFLICT_PROBE}#conflict"] = normalize(conflict.format.render(:conflict))
rescue StandardError => e
  views["#{CONFLICT_PROBE}#conflict"] = "CAPTURE_ERROR: #{e.class}: #{e.message}"
end
payload["rendered"] = views

# ---- no-write proof: the render phase must not move the actions table -------
actions_after = Card::Action.count
payload["no_write_proof"] = {
  "actions_before" => actions_before,
  "actions_after" => actions_after,
  "unchanged" => (actions_before == actions_after)
}

# ---- cleanup: trash the probe cards so the shared DB stays untouched --------
Card::Auth.as_bot do
  (SEEDS.map { |s| s[:name] } + [CONFLICT_PROBE]).each do |name|
    card = Card.fetch(name)
    next if card.nil? || card.new_card?

    begin
      card.delete!
      seed_log["deleted:#{name}"] = "deleted"
    rescue StandardError => e
      seed_log["deleted:#{name}"] = "DELETE_FAILED: #{e.class}: #{e.message}"
    end
  end
end
# NO card_count field: the oracle DB is shared with other streams'
# benchmarks, so a card count is racy harness telemetry, not mod-mechanism
# oracle data.

# ---- write ------------------------------------------------------------------
File.write(OUT_PATH, JSON.pretty_generate(deep_sort(payload)) + "\n")
puts "seed_log: #{JSON.generate(deep_sort(seed_log))}"
puts "WROTE #{OUT_PATH} (#{File.size(OUT_PATH)} bytes)"
$stdout.flush

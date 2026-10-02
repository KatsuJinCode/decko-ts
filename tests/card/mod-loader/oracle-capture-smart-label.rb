# oracle-capture-smart-label.rb - oracle capture for the card-mod-format
# set/all/content.rb:26-41 view :smart_label (label_with_description
# render_label, label_description - the popover_link composition the
# follow-and-label-completions lane ports).
#
# Run (from tools/oracle/decko-oracle-app):
#   RAILS_ENV=development bundle exec decko runner \
#     <repo>/tests/card/mod-loader/oracle-capture-smart-label.rb
#
# Records to fixtures/captured/smart-label.json:
# 1. the set-module view registration the card-mod-format set/all/content.rb
#    `format do` block contributes for :smart_label (with source location
#    proving set/all/content.rb defined it - the byte oracle pin links the
#    live render to the gem file)
# 2. rendered bytes for two probe cards' :smart_label views - one WITH a
#    +description card (the label + popover anchor over the description
#    core) and one WITHOUT (the bare-label arm, label_with_description's
#    nil-description branch); plus the WITH-probe's :label view (the label
#    arm alone). The byte oracle for the TS-side test pinning
#    card-mod-format.ts#smartLabelView.
#
# Determinism contract (mirrors oracle-capture-help-popover.rb): output JSON
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
OUT_PATH  = File.join(REPO_ROOT, "fixtures", "captured", "smart-label.json")

PROBE_WITH_DESC    = "Oracle Smart Label Probe"
PROBE_DESC_CARD    = "Oracle Smart Label Probe+description"
PROBE_WITHOUT_DESC = "Oracle Bare Smart Label Probe"
DESC_BODY          = "probe description body"

SEEDS = [
  { name: PROBE_WITH_DESC, type: "RichText", content: "probe body" },
  { name: PROBE_DESC_CARD, type: "RichText", content: DESC_BODY },
  { name: PROBE_WITHOUT_DESC, type: "RichText", content: "bare body" }
].freeze

RENDER_TARGETS = {
  PROBE_WITH_DESC    => %i[smart_label label],
  PROBE_WITHOUT_DESC => %i[smart_label]
}.freeze

SLOT_ID_RE = /data-slot-id=(["'])\h+\1/.freeze
CARD_ID_RE = /data-card-id=(["'])\d+\1/.freeze

def normalize(html)
  html.gsub(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"')
      .gsub(CARD_ID_RE, 'data-card-id="RANDOMIZED"')
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
  SEEDS.each { |attrs| seed_log[attrs[:name]] = seed_card(attrs) }
end

# ---- set-module view registration -------------------------------------------
# set/all/content.rb:26-28 - the :smart_label view dispatched through
# card-mod-format's all/content set module. A plain `format do` block
# defines methods on Card::Set::All::Content::Format (the base format).
content_format = Card::Set::All::Content.const_get(:Format)
payload["registered_views"] = {
  "all_content_format_view_smart_label" => {
    "defined" => content_format.method_defined?(:_view_smart_label),
    "source_location" => source_location_of(content_format, :_view_smart_label)
  }
}

# ---- no-write proof: actions snapshot BEFORE the render phase ---------------
actions_before = Card::Action.count

# ---- rendered probe views ---------------------------------------------------
# :smart_label is `cache: :never, unknown: true`, no wrap config - the byte
# shape is the bare label (+ anchor) with no slot wrapper. The :label view
# (content.rb:22-24) rides along as the label-arm pin.
views = {}
RENDER_TARGETS.each do |name, view_list|
  card = Card.fetch(name)
  format = card.format
  view_list.each do |view|
    views["#{name}##{view}"] = normalize(format.render(view))
  rescue StandardError => e
    views["#{name}##{view}"] = "CAPTURE_ERROR: #{e.class}: #{e.message}"
  end
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
# (the +description child is trashed with its left via delete! cascade
# ordering: child first, then the left cards)
Card::Auth.as_bot do
  [
    PROBE_DESC_CARD,
    PROBE_WITH_DESC,
    PROBE_WITHOUT_DESC
  ].each do |name|
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

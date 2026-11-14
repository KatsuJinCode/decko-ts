# oracle-capture-history-update-ancestor-timestamps-ruby.rb - the PINNED
# MOD's own update_ancestor_timestamps event body, EXECUTED over recording
# doubles.
#
# WHY THIS SCRIPT EXISTS. The register row (events table, card-mod-history
# `update_ancestor_timestamps`) grades the port on the body of ONE event:
#
#   card-mod-history-0.20.0/set/all/history/events.rb:1-7
#     event :update_ancestor_timestamps, :integrate do
#       ids = history_ancestor_ids
#       return unless ids.present?
#
#       Card.where(id: ids).update_all(updater_id: Auth.current_id,
#                                      updated_at: Time.now)
#       ids.map { |anc_id| Card.expire anc_id.cardname }
#     end
#
# The body does two things: a bulk UPDATE of the ancestors' updater_id and
# updated_at, and a cache expiry per ancestor. This capture runs the
# PINNED body over doubles that RECORD both, so the port's own
# ancestor-timestamp walk (CardActionEngine.bumpAncestorTimestamps) can be
# pinned against an execution: the same set of ancestors, the same
# updater_id, and one expiry per ancestor.
#
# THE STUBBING RULE: every double RECORDS. No double answers with a
# plausible value.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-history-update-ancestor-timestamps-ruby.rb \
#     > fixtures/captured/history-update-ancestor-timestamps-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

PinnedEvent.load_pinned_libs!
require "active_support/core_ext/object/blank"

EVENT_FILE = "card-mod-history-0.20.0/set/all/history/events.rb"

RECORDED = []

# An ancestor id row: the card the body expires by name.
class AncestorIdProbe
  attr_reader :id, :cardname

  def initialize(id, cardname)
    @id = id
    @cardname = cardname
  end
end

# The recording relation: Card.where(id: ids).update_all(...)
class RelationProbe
  attr_reader :where_args

  def initialize(args)
    @where_args = args
  end

  def update_all(attributes)
    RECORDED << {
      "call" => "Card.where(id:).update_all",
      "ids" => Array(where_args[:id]).map { |row| row.respond_to?(:id) ? row.id : row },
      "attributes" => attributes.transform_values { |value| value.is_a?(Time) ? "Time.now" : value },
    }
    nil
  end
end

class Card
  def self.where(args)
    RECORDED << {
      "call" => "Card.where",
      "arguments" => [{ "id" => Array(args[:id]).map { |row| row.respond_to?(:id) ? row.id : row } }],
    }
    RelationProbe.new(args)
  end

  def self.expire(cardname)
    RECORDED << { "call" => "Card.expire", "arguments" => [cardname.to_s] }
    nil
  end
end

module Auth
  def self.current_id
    42
  end
end

# The probe the pinned body runs on: the ancestor ids it walks.
class AncestorProbe
  def initialize(ids)
    @ids = ids
  end

  def history_ancestor_ids
    @ids
  end
end

event_source = PinnedEvent.event(EVENT_FILE, :update_ancestor_timestamps)

PROBES = [
  { "label" => "three ancestors", "ids" => [[11, "Host"], [12, "Child"], [13, "Grandchild"]] },
  { "label" => "no ancestors", "ids" => [] },
  { "label" => "one ancestor", "ids" => [[21, "Solo"]] },
]

results = PROBES.map do |probe_case|
  ids = probe_case["ids"].map { |id, cardname| AncestorIdProbe.new(id, cardname) }
  probe = AncestorProbe.new(ids)
  PinnedEvent.define_event_body(probe, event_source)
  RECORDED.clear
  outcome = PinnedEvent.call_event_body(probe)
  {
    "label" => probe_case["label"],
    "raised" => outcome["raised"],
    "message" => outcome["message"],
    "recorded" => RECORDED.dup,
  }
end

oracle = {
  "row" => "reg-evt-mod-history-update-ancestor-timestamps",
  "gemset" => "card-mod-history-0.20.0 (pinned)",
  "ruby_version" => RUBY_VERSION,
  "pinned_declaration" => event_source["declaration"],
  "pinned_declaration_line" => event_source["line"],
  "pinned_body" => event_source["body"],
  "pinned_history_ancestor_ids" => {
    "file" => "card-mod-history-0.20.0/set/all/history.rb",
    "body" => PinnedEvent.method("card-mod-history-0.20.0/set/all/history.rb", "history_ancestor_ids")["body"],
  },
  "probes" => results,
  "observable_effect" =>
    "for a non-empty ancestor list the body writes one bulk UPDATE (updater_id from " \
    "Auth.current_id, updated_at from Time.now) over exactly those ancestor ids, then " \
    "expires each ancestor's cache entry by its cardname; for an empty list it returns " \
    "before touching anything.",
}

puts JSON.pretty_generate(oracle)
puts

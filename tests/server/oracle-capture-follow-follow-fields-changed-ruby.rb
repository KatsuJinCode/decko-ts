# oracle-capture-follow-follow-fields-changed-ruby.rb - the PINNED MOD's own
# follow_fields_changed event body, EXECUTED, and the PINNED cache method it
# calls, executed over recording doubles.
#
# WHY THIS SCRIPT EXISTS. The register row (events table, card-mod-follow
# `follow_fields_changed`) grades the port on the body of ONE event:
#
#   card-mod-follow-0.20.0/set/right/follow_fields.rb:3-5
#     event :follow_fields_changed, :integrate do
#       Card.follow_caches_expired
#     end
#
# It is the SAME one-call body as its sibling
# `cache_expired_for_new_preference` (right/follow.rb:7-9) and the same
# pinned cache method behind it, but the DECLARATION differs: this one
# carries no `when:` clause, so it runs on every :integrate, while its
# sibling runs only on a preference. The capture records both the
# declaration's own bytes and the executed effect, so a port that wires one
# event and not the other cannot pass.
#
# THE STUBBING RULE: every double RECORDS. No double answers with a
# plausible value.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-follow-follow-fields-changed-ruby.rb \
#     > fixtures/captured/follow-follow-fields-changed-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

EVENT_FILE = "card-mod-follow-0.20.0/set/right/follow_fields.rb"
EVENT_NAME = :follow_fields_changed
CACHE_FILE = "card-mod-follow-0.20.0/set/all/follow/follower_ids.rb"

RECORDED = []

class Card
  # Card.clear_follower_ids_cache (follower_ids.rb:38-40).
  def self.clear_follower_ids_cache
    RECORDED << { "call" => "Card.clear_follower_ids_cache", "arguments" => [] }
    nil
  end

  module Rule
    # Card::Rule.clear_preference_cache.
    def self.clear_preference_cache
      RECORDED << { "call" => "Card::Rule.clear_preference_cache", "arguments" => [] }
      nil
    end
  end
end

event_source = PinnedEvent.event(EVENT_FILE, EVENT_NAME)
cache_source = PinnedEvent.method(CACHE_FILE, "follow_caches_expired")
key_line = PinnedEvent.read_pinned(CACHE_FILE).lines.find { |line| line.start_with?("FOLLOWER_IDS_CACHE_KEY") }
read_source = PinnedEvent.method(CACHE_FILE, "follower_ids_cache")

PinnedEvent.define_method(Card.singleton_class, CACHE_FILE, "follow_caches_expired")

probe = Object.new
PinnedEvent.define_event_body(probe, event_source)
outcome = PinnedEvent.call_event_body(probe)

oracle = {
  "row" => "reg-evt-mod-follow-follow-fields-changed",
  "gemset" => "card-mod-follow-0.20.0 (pinned)",
  "pinned_declaration" => event_source["declaration"],
  "pinned_declaration_line" => event_source["line"],
  "pinned_body" => event_source["body"],
  "pinned_cache_method" => {
    "file" => cache_source["file"],
    "line" => cache_source["line"],
    "body" => cache_source["body"],
  },
  "pinned_cache_key" => key_line&.chomp,
  "pinned_cache_read" => {
    "file" => read_source["file"],
    "line" => read_source["line"],
    "body" => read_source["body"],
  },
  "executed" => {
    "raised" => outcome["raised"],
    "recorded_calls" => RECORDED.map { |entry| entry["call"] },
    "recorded_call_count" => RECORDED.length,
  },
  "observable_effect" =>
    "the event's whole effect is two cache drops: Card.clear_follower_ids_cache and " \
    "Card::Rule.clear_preference_cache, and the declaration carries no when: clause, so it " \
    "runs on every :integrate. A port that holds neither cache answers the next reader the " \
    "same way a Ruby deck whose caches were just dropped answers it.",
}

puts JSON.pretty_generate(oracle)
puts

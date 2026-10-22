# oracle-capture-follow-cache-expired-for-new-preference-ruby.rb - the
# PINNED MOD's own cache_expired_for_new_preference event body, EXECUTED,
# and the PINNED cache method it calls, executed over recording doubles.
#
# WHY THIS SCRIPT EXISTS. The register row (events table,
# card-mod-follow `cache_expired_for_new_preference`) grades the port on the
# body of ONE event:
#
#   card-mod-follow-0.20.0/set/right/follow.rb:7-9
#     event :cache_expired_for_new_preference, :integrate, when: :preference? do
#       Card.follow_caches_expired
#     end
#
# The question the row asks is whether the port's answer is Ruby's answer.
# The family's own audit answered it from the source ("the port keeps no
# follower cache, so the no-op IS the faithful shape"). This capture turns
# that source reading into an EXECUTED measurement: it runs the pinned body,
# and the pinned cache method the body calls, over doubles that RECORD every
# cache drop.
#
# WHAT THE EXECUTION SHOWS. `Card.follow_caches_expired`
# (card-mod-follow-0.20.0/set/all/follow/follower_ids.rb:25-28) is two
# calls and nothing else:
#
#   Card.clear_follower_ids_cache   # writes nil under FOLLOWER_IDS
#   Card::Rule.clear_preference_cache
#
# So the event's whole observable effect is DROPPING TWO CACHES. A port
# that holds neither cache cannot answer differently from a Ruby deck whose
# caches were just dropped - the next reader sees the same rows. That is
# the equivalence the port's row claims, and this capture is the evidence
# for the claim's Ruby half.
#
# THE STUBBING RULE: every double RECORDS. No double answers with a
# plausible value.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-follow-cache-expired-for-new-preference-ruby.rb \
#     > fixtures/captured/follow-cache-expired-for-new-preference-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

EVENT_FILE = "card-mod-follow-0.20.0/set/right/follow.rb"
EVENT_NAME = :cache_expired_for_new_preference
CACHE_FILE = "card-mod-follow-0.20.0/set/all/follow/follower_ids.rb"

RECORDED = []

# The recording doubles: the two cache drops the pinned method makes.
class Card
  # Card.clear_follower_ids_cache (follower_ids.rb:38-40) - the pinned
  # method writes nil under the FOLLOWER_IDS key.
  def self.clear_follower_ids_cache
    RECORDED << { "call" => "Card.clear_follower_ids_cache", "arguments" => [] }
    nil
  end

  module Rule
    # Card::Rule.clear_preference_cache - the pinned rule cache drop.
    def self.clear_preference_cache
      RECORDED << { "call" => "Card::Rule.clear_preference_cache", "arguments" => [] }
      nil
    end
  end
end

# The pinned event, taken out of the pinned file by line, and the pinned
# cache method it calls, taken out of the pinned file by line.
event_source = PinnedEvent.event(EVENT_FILE, EVENT_NAME)
cache_source = PinnedEvent.method(CACHE_FILE, "follow_caches_expired")

# The pinned cache KEY constant and the pinned read path, so the capture
# records WHICH cache is dropped and how the next reader reads it.
key_line = PinnedEvent.read_pinned(CACHE_FILE).lines.find { |line| line.start_with?("FOLLOWER_IDS_CACHE_KEY") }
read_source = PinnedEvent.method(CACHE_FILE, "follower_ids_cache")

# The pinned cache method is defined on Card's singleton with the PINNED
# body, so the executed bytes are the gem's own.
PinnedEvent.define_method(Card.singleton_class, CACHE_FILE, "follow_caches_expired")

# The probe the pinned event body runs on.
probe = Object.new
PinnedEvent.define_event_body(probe, event_source)
outcome = PinnedEvent.call_event_body(probe)

# ---------------------------------------------------------------------------
# the oracle
# ---------------------------------------------------------------------------

oracle = {
  "row" => "reg-evt-mod-follow-cache-expired-for-new-preference",
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
    "Card::Rule.clear_preference_cache. A port that holds neither cache answers the next " \
    "reader the same way a Ruby deck whose caches were just dropped answers it.",
}

puts JSON.pretty_generate(oracle)
puts

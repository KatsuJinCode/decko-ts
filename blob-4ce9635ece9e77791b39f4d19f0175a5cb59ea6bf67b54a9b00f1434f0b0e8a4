# oracle-capture-follow-update-follow-rules-ruby.rb - the PINNED MOD's own
# update_follow_rules event body, EXECUTED over recording doubles, and the
# PINNED trigger rule that decides whether the event can fire at all.
#
# WHY THIS SCRIPT EXISTS. The register row (events table, card-mod-follow
# `update_follow_rules`) grades the port on the body of ONE event:
#
#   card-mod-follow-0.20.0/set/self/follow_defaults.rb:17-30
#     event :update_follow_rules, :finalize, on: :save, trigger: :required do
#       Auth.as_bot do
#         Card.search(type: "user").each do |user|
#           follow_defaults.each do |set_card, option|
#             follow_rule = Card.fetch(set_card.follow_rule_name(user.name), new: {})
#             next unless follow_rule
#
#             follow_rule.drop_item "*never"
#             follow_rule.drop_item "*always"
#             follow_rule.add_item option
#             follow_rule.save!
#           end
#         end
#       end
#     end
#
# The body is a BULK WRITE over every user in the deck, and the event fires
# only when the act's trigger list names it. This capture records two
# facts by EXECUTION:
#
#   1. the body's own shape: which collaborators it reaches, in which
#      order, and what it writes to each follow rule (the two drops, the
#      one add, the save) - recorded by doubles, never answered by them;
#   2. the trigger rule that decides whether the body runs at all
#      (card-1.110.0/lib/card/set/event/skip_and_trigger.rb), quoted from
#      the pinned file so the row's "the trigger never names this event"
#      claim rests on the pinned bytes.
#
# THE STUBBING RULE: every double RECORDS. No double answers with a
# plausible value.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-follow-update-follow-rules-ruby.rb \
#     > fixtures/captured/follow-update-follow-rules-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

EVENT_FILE = "card-mod-follow-0.20.0/set/self/follow_defaults.rb"
EVENT_NAME = :update_follow_rules
TRIGGER_FILE = "card-1.110.0/lib/card/set/event/skip_and_trigger.rb"

RECORDED = []

# The recording doubles.
class Card
  # Card.search(type: "user") - the pinned class method the body calls.
  def self.search(args = {})
    RECORDED << { "call" => "Card.search", "arguments" => [args] }
    [UserProbe.new("Joe User")]
  end

  # Card.fetch(name, new: {}) - the pinned fetch the body calls.
  def self.fetch(name, args = {})
    RECORDED << { "call" => "Card.fetch", "arguments" => [name, args] }
    FollowRuleProbe.new(name)
  end

  # Card.follow_caches_expired - the last line of the pinned body
  # (follow_defaults.rb:31): the same two cache drops the sibling events
  # make.
  def self.follow_caches_expired
    RECORDED << { "call" => "Card.follow_caches_expired", "arguments" => [] }
    nil
  end
end

# The pinned deck's Auth proxy - Card::Auth.as_bot (card-1.110.0/lib/card/
# auth/proxy.rb:27-29) yields with the bot's permissions. The double yields
# and records that it did.
module Auth
  module_function

  def as_bot
    RECORDED << { "call" => "Auth.as_bot", "arguments" => [] }
    yield
  end
end

# A user card in the search result.
class UserProbe
  attr_reader :name

  def initialize(name)
    @name = name
  end
end

# A follow rule card: the body drops two items, adds one, and saves.
class FollowRuleProbe
  attr_reader :name, :drops, :adds, :saved

  def initialize(name)
    @name = name
    @drops = []
    @adds = []
    @saved = false
  end

  def drop_item(item)
    @drops << item
    RECORDED << { "call" => "follow_rule.drop_item", "arguments" => [item] }
    nil
  end

  def add_item(item)
    @adds << item
    RECORDED << { "call" => "follow_rule.add_item", "arguments" => [item] }
    nil
  end

  def save!
    @saved = true
    RECORDED << { "call" => "follow_rule.save!", "arguments" => [] }
    :saved
  end
end

# The set card whose follow rule is written: its own
# follow_rule_name(user.name) is the rule's name.
class SetCardProbe
  def follow_rule_name(user_name)
    "*follow+Joe User+#{user_name}"
  end
end

event_source = PinnedEvent.event(EVENT_FILE, EVENT_NAME)

# The pinned trigger rule, quoted from the pinned file: the lines that
# decide whether a trigger-named event fires.
trigger_lines = PinnedEvent.pinned_lines(TRIGGER_FILE).select do |row|
  row["text"].match?(/trigger/i)
end

# The probe the pinned event body runs on: it supplies `follow_defaults`,
# the one card-local collaborator the body reaches.
class UpdateFollowRulesProbe
  def follow_defaults
    { SetCardProbe.new => "*always" }
  end
end

PinnedEvent.define_event_body(UpdateFollowRulesProbe.new, event_source)
probe = UpdateFollowRulesProbe.new
PinnedEvent.define_event_body(probe, event_source)
outcome = PinnedEvent.call_event_body(probe)

oracle = {
  "row" => "reg-evt-mod-follow-update-follow-rules",
  "gemset" => "card-mod-follow-0.20.0 + card-1.110.0 (pinned)",
  "pinned_declaration" => event_source["declaration"],
  "pinned_declaration_line" => event_source["line"],
  "pinned_body" => event_source["body"],
  "pinned_trigger_rule" => {
    "file" => TRIGGER_FILE,
    "lines" => trigger_lines,
  },
  "executed" => {
    "raised" => outcome["raised"],
    "recorded_calls" => RECORDED.map { |entry| entry["call"] },
    "recorded_arguments" => RECORDED,
  },
  "observable_effect" =>
    "the body is a bulk write: for every user in the deck and every follow default it " \
    "fetches the user's follow rule, drops *never and *always, adds the default option and " \
    "saves the rule, all under Auth.as_bot. The event fires only when the act's trigger " \
    "list names update_follow_rules, and the port's write route parses no such trigger, so " \
    "the body is unreachable in the port - and the bulk write it performs has no " \
    "divergence-free port, because it must ride the engine's write path (validations, " \
    "references, act rows) and the mod-event seam is single-card.",
}

puts JSON.pretty_generate(oracle)
puts

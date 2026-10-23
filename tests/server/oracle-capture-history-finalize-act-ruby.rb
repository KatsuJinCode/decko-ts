# oracle-capture-history-finalize-act-ruby.rb - the PINNED MOD's own
# finalize_act event body, EXECUTED over recording doubles.
#
# WHY THIS SCRIPT EXISTS. The register row (events table, card-mod-history
# `finalize_act`) grades the port on the body of ONE event:
#
#   card-mod-history-0.20.0/set/all/history/events.rb:48-50
#     event :finalize_act, after: :finalize_action, when: :act_card? do
#       Card::Director.act.update! card_id: id
#     end
#
# The body is one call: it writes the act row's card_id, the line the port
# has to reproduce so no act row is left with a NULL card_id. This capture
# runs the PINNED body over a recording Director, so the port's own act
# finalisation (ActWriter.finalizeActCard) can be pinned against an
# execution: the same attribute, the same value.
#
# THE DECLARATION IS PART OF THE ROW: `after: :finalize_action` is a chain
# edge, not a stage, and `when: :act_card?` is the gate. The capture
# records the pinned declaration bytes and the pinned gate's own source.
#
# THE STUBBING RULE: every double RECORDS. No double answers with a
# plausible value.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-history-finalize-act-ruby.rb \
#     > fixtures/captured/history-finalize-act-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

PinnedEvent.load_pinned_libs!

EVENT_FILE = "card-mod-history-0.20.0/set/all/history/events.rb"

RECORDED = []

# The recording Director: Card::Director.act.update!(card_id: id).
class ActDirectorProbe
  def update!(attributes)
    RECORDED << { "call" => "Card::Director.act.update!", "attributes" => attributes }
    nil
  end
end

class DirectorProbe
  def act
    RECORDED << { "call" => "Card::Director.act", "arguments" => [] }
    ActDirectorProbe.new
  end
end

class Card
  # Card::Director is a CONSTANT in the pinned deck, not a method.
  Director = DirectorProbe.new
end

# The probe the pinned body runs on: the act card's own id.
class ActCardProbe
  attr_reader :id

  def initialize(id)
    @id = id
  end
end

event_source = PinnedEvent.event(EVENT_FILE, :finalize_act)

# The pinned gate the declaration names, quoted from the pinned file.
gate_source = PinnedEvent.method("card-1.110.0/lib/card/director/all.rb", "act_card?")

PROBES = [77, 1234]

results = PROBES.map do |id|
  probe = ActCardProbe.new(id)
  PinnedEvent.define_event_body(probe, event_source)
  RECORDED.clear
  outcome = PinnedEvent.call_event_body(probe)
  {
    "id" => id,
    "raised" => outcome["raised"],
    "message" => outcome["message"],
    "recorded" => RECORDED.dup,
  }
end

oracle = {
  "row" => "reg-evt-mod-history-finalize-act",
  "gemset" => "card-mod-history-0.20.0 (pinned)",
  "ruby_version" => RUBY_VERSION,
  "pinned_declaration" => event_source["declaration"],
  "pinned_declaration_line" => event_source["line"],
  "pinned_body" => event_source["body"],
  "pinned_gate" => {
    "name" => "act_card?",
    "file" => gate_source["file"],
    "line" => gate_source["line"],
    "body" => gate_source["body"],
  },
  "probes" => results,
  "observable_effect" =>
    "the body writes the act row's card_id: one update! carrying card_id: <the act card's " \
    "own id>, and nothing else. The port's act finalisation must leave no act row with a " \
    "NULL card_id, which is the difference this body makes.",
}

puts JSON.pretty_generate(oracle)
puts

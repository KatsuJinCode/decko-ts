# oracle-capture-content-event-rows-ruby.rb - the PINNED content mod's own event
# bodies, EXECUTED over recording doubles.
#
# WHAT THIS IS. Three register rows in the events family grade the port on ONE
# pinned event body each, and all three live in the same pinned file:
#
#   card-mod-content-0.20.0/set/right/structure.rb:38-42 reset_cache_to_use_new_structure
#     event :reset_cache_to_use_new_structure, before: :update_structurees_references do
#       Card::Cache.reset_shared
#       Card::Cache.reset_temp
#     end
#   card-mod-content-0.20.0/set/right/structure.rb:25-32 update_structurees_references
#     event :update_structurees_references, :integrate, when: :update_structurees_references? do
#       return unless (query = structuree_query)
#       Auth.as_bot do
#         query.run.each(&:update_references_out)
#       end
#     end
#   card-mod-content-0.20.0/set/right/structure.rb:44-47 update_structurees_type
#     event :update_structurees_type, :finalize, changed: :type_id, when: proc { |c| c.assigns_type? } do
#       update_structurees type_id: type_id
#     end
#
# The capture EXECUTES those bytes over recording doubles and records what
# they ASKED FOR: the cache drops, the reference refreshes, and the bulk type
# write's arguments.
#
# THE PINNED HELPERS. The update_structurees_type body calls the mod's own
# `update_structurees` method, so the PINNED method (structure.rb:57-69) is
# defined on the probe with its own signature and body, and the doubles it
# reaches (structuree_query, Auth.as_bot, Card.where(...).update_all) record.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-content-event-rows-ruby.rb <row-slug> \
#     > fixtures/captured/<row-slug>-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

EVENT_FILE = "card-mod-content-0.20.0/set/right/structure.rb"

SLUG = ARGV[0]
abort("usage: ruby oracle-capture-content-event-rows-ruby.rb <row-slug>") if SLUG.nil? || SLUG.empty?

PinnedEvent.load_pinned_libs!

# The deck's cache. The reset body calls the two drops; the double RECORDS
# each one and answers nothing.
class Card
  # The shared harness has already opened Card::Cache as a module, so it is
  # reopened the same way.
  module Cache
    class << self
      attr_accessor :reset_calls

      def reset_shared
        (self.reset_calls ||= []) << "reset_shared"
        nil
      end

      def reset_temp
        (self.reset_calls ||= []) << "reset_temp"
        nil
      end
    end
  end
end

# The deck's bulk writer. The pinned update_structurees method calls
# Card.where(id: id_batch).update_all args; the double RECORDS the ids and
# the arguments it was handed.
class Card
  class << self
    attr_accessor :where_calls, :update_all_calls

    def where(args = {})
      (self.where_calls ||= []) << args
      WhereProxy.new
    end
  end
end

# The relation proxy the pinned method writes through.
class WhereProxy
  include RecordingCalls

  def update_all(args)
    record_call("update_all", args)
    (Card.update_all_calls ||= []) << args
    nil
  end
end

# The deck's bot proxy. The pinned body yields through it; the double
# RECORDS that it did and yields.
module Auth
  module_function

  def as_bot
    (@as_bot_calls ||= 0)
    @as_bot_calls += 1
    yield
  end

  def as_bot_calls
    @as_bot_calls ||= 0
  end
end

# The structuree card: the row's query returns cards, and each one is asked
# to refresh its outgoing references.
class StructureeProbe
  include RecordingCalls

  def update_references_out
    record_call("update_references_out")
    nil
  end
end

# The query the structuree_query helper returns.
class QueryProbe
  include RecordingCalls

  def initialize(cards)
    @cards = cards
  end

  def run
    record_call("run")
    @cards
  end
end

# The card-side probe.
class ContentProbe
  include RecordingCalls

  attr_reader :errors

  def initialize(structuree_query:, type_id: nil)
    @structuree_query = structuree_query
    @type_id = type_id
    @errors = RecordingErrors.new
  end

  def errors
    @errors
  end

  # the mod's own query helper. The double RECORDS the arguments it was
  # handed and answers with the scenario's query (or nil).
  def structuree_query(args = {})
    record_call("structuree_query", args)
    @structuree_query
  end

  def type_id
    @type_id
  end
end

# The pinned method, defined on the probe with the pinned SIGNATURE and body.
def define_pinned(probe, relative, name)
  source = PinnedEvent.method(relative, name)
  declaration = PinnedEvent.pinned_lines(source["file"]).find do |line|
    line["line"] == source["line"]
  end["text"]
  probe.singleton_class.class_eval(
    "#{declaration}\n#{source["body"]}\nend",
    source["file"],
    source["line"]
  )
  source
end

# The pinned event declaration and body, for a declaration that spans more
# than one line. The shared rig's extractor reads the body as the lines
# between the `event` line and the `end` at the declaration's indentation,
# which is right for a one-line declaration and stops at the declaration's
# own continuation line for a multi-line one. This capture keeps the rig's
# rule (the body runs to the first `end` at the declaration's indentation)
# and adds the declaration's own lines, so the executed bytes are still the
# gem's own.
def pinned_event(relative, name)
  lines = PinnedEvent.read_pinned(relative).lines
  pattern = /^(\s*)event\s+:#{Regexp.escape(name.to_s)}\b/
  index = lines.index { |line| line.match?(pattern) }
  raise "no `event :#{name}` in #{relative}" if index.nil?

  indent = lines[index][pattern, 1]
  declaration_end = index
  declaration_end += 1 while declaration_end < lines.length && !lines[declaration_end].rstrip.end_with?("do")
  end_index = nil
  ((declaration_end + 1)...lines.length).each do |i|
    if lines[i].rstrip == "#{indent}end"
      end_index = i
      break
    end
  end
  raise "no `end` for `event :#{name}` in #{relative}" if end_index.nil?

  {
    "file" => relative,
    "line" => index + 1,
    "declaration" => lines[index..declaration_end].map(&:chomp).join("\n"),
    "body" => lines[(declaration_end + 1)...end_index].map(&:chomp).join("\n"),
    "body_lines" => lines[(declaration_end + 1)...end_index].each_with_index.map do |line, offset|
      { "line" => declaration_end + 2 + offset, "text" => line.chomp }
    end,
  }
end

# The pinned body, defined on the probe.
def define_event_body(probe, event_source)
  probe.singleton_class.class_eval(
    "def __pinned_event_body__\n#{event_source["body"]}\nend",
    event_source["file"],
    event_source["line"]
  )
  event_source
end

def capture_reset(slug)
  event_source = pinned_event(EVENT_FILE, "reset_cache_to_use_new_structure")
  Card::Cache.reset_calls = []
  probe = ContentProbe.new(structuree_query: nil)
  define_event_body(probe, event_source)
  outcome = PinnedEvent.call_event_body(probe)
  {
    "row" => slug,
    "event" => "reset_cache_to_use_new_structure",
    "pinned_file" => EVENT_FILE,
    "pinned_declaration" => event_source["declaration"],
    "pinned_declaration_line" => event_source["line"],
    "pinned_body" => event_source["body"],
    "pinned_body_lines" => event_source["body_lines"],
    "cache_resets" => Card::Cache.reset_calls,
    "calls" => probe.calls,
    "outcome" => outcome,
  }
end

def capture_references(slug)
  event_source = pinned_event(EVENT_FILE, "update_structurees_references")
  scenarios = [
    { "name" => "no structuree query", "cards" => nil },
    { "name" => "two structurees", "cards" => 2 },
  ].freeze
  probes = scenarios.map do |scenario|
    cards = scenario["cards"].nil? ? nil : Array.new(scenario["cards"]) { StructureeProbe.new }
    query = cards.nil? ? nil : QueryProbe.new(cards)
    probe = ContentProbe.new(structuree_query: query)
    define_event_body(probe, event_source)
    outcome = PinnedEvent.call_event_body(probe)
    {
      "scenario" => scenario["name"],
      "structuree_count" => cards.nil? ? 0 : cards.length,
      "calls" => probe.calls,
      "reference_refreshes" => cards.nil? ? 0 : cards.map { |card| card.calls.length }.sum,
      "as_bot_calls" => Auth.as_bot_calls,
      "outcome" => outcome,
    }
  end
  {
    "row" => slug,
    "event" => "update_structurees_references",
    "pinned_file" => EVENT_FILE,
    "pinned_declaration" => event_source["declaration"],
    "pinned_declaration_line" => event_source["line"],
    "pinned_body" => event_source["body"],
    "pinned_body_lines" => event_source["body_lines"],
    "scenarios" => probes,
  }
end

def capture_type(slug)
  event_source = pinned_event(EVENT_FILE, "update_structurees_type")
  scenarios = [
    { "name" => "no structuree query", "cards" => nil, "type_id" => 7 },
    { "name" => "three structurees", "cards" => 3, "type_id" => 7 },
  ].freeze
  probes = scenarios.map do |scenario|
    ids = scenario["cards"].nil? ? nil : Array.new(scenario["cards"]) { |i| 101 + i }
    query = ids.nil? ? nil : QueryProbe.new(ids)
    probe = ContentProbe.new(structuree_query: query, type_id: scenario["type_id"])
    define_event_body(probe, event_source)
    define_pinned(probe, EVENT_FILE, "update_structurees")
    Card.where_calls = []
    Card.update_all_calls = []
    outcome = PinnedEvent.call_event_body(probe)
    {
      "scenario" => scenario["name"],
      "structuree_count" => ids.nil? ? 0 : ids.length,
      "structuree_ids" => ids,
      "type_id" => scenario["type_id"],
      "calls" => probe.calls,
      "where_calls" => Card.where_calls,
      "update_all_calls" => Card.update_all_calls,
      "as_bot_calls" => Auth.as_bot_calls,
      "outcome" => outcome,
    }
  end
  {
    "row" => slug,
    "event" => "update_structurees_type",
    "pinned_file" => EVENT_FILE,
    "pinned_declaration" => event_source["declaration"],
    "pinned_declaration_line" => event_source["line"],
    "pinned_body" => event_source["body"],
    "pinned_body_lines" => event_source["body_lines"],
    "pinned_helper" => PinnedEvent.method(EVENT_FILE, "update_structurees")["body"],
    "scenarios" => probes,
  }
end

case SLUG
when "reset-cache-to-use-new-structure"
  puts JSON.pretty_generate(capture_reset(SLUG))
when "update-structurees-references"
  puts JSON.pretty_generate(capture_references(SLUG))
when "update-structurees-type"
  puts JSON.pretty_generate(capture_type(SLUG))
else
  abort("no capture for slug #{SLUG}; known: reset-cache-to-use-new-structure, update-structurees-references, update-structurees-type")
end

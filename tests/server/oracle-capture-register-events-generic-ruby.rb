# oracle-capture-register-events-generic-ruby.rb - the register-events rows'
# executed Ruby oracle, driven by a per-row SPEC.
#
# WHAT THIS IS. The events family grades the port on ONE pinned event body
# per register row. Every row needs the same three things:
#
#   1. the PINNED GEMSET on the load path (no Rails, no database);
#   2. the pinned event declaration and body, extracted BY LINE from the
#      pinned file, so the executed bytes are the gem's own and not a
#      transcription of them;
#   3. recording doubles for the collaborators the body touches, so the
#      capture records WHAT THE BODY ASKED FOR and never what the port
#      wants the answer to be.
#
# The shared harness (oracle-capture-pinned-event-bodies-ruby.rb) carries
# the first two and the recording mixin. This file adds the THIRD for the
# rows whose bodies reach collaborators a bespoke script would have to name
# one by one: a SPEC file says which scenarios to run, and for each
# scenario, what a read answers, what a call answers, what a block call
# yields, and which errors are already in the bag.
#
# THE STUBBING RULE (the shared harness's own rule): every double RECORDS.
# A collaborator the SPEC does not answer is answered by the recording
# double, and the capture says so: the answer is recorded as the double's
# own name, never as a plausible value. A reader can therefore see which
# answers the SPEC supplied and which the double invented.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-register-events-generic-ruby.rb \
#     <spec.json> > fixtures/captured/<row-slug>-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The spec's scenario list is fixed, so a re-run on the same
# gemset is byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

SPEC_PATH = ARGV[0]
abort("usage: ruby oracle-capture-register-events-generic-ruby.rb <spec.json>") if SPEC_PATH.nil? || SPEC_PATH.empty?

SPEC = JSON.parse(File.read(SPEC_PATH))
abort("the spec has no row") if SPEC["row"].nil? || SPEC["row"].to_s.empty?
abort("the spec has no event_file") if SPEC["event_file"].nil?
abort("the spec has no event") if SPEC["event"].nil?
abort("the spec has no scenarios") if !SPEC["scenarios"].is_a?(Array) || SPEC["scenarios"].empty?

PinnedEvent.load_pinned_libs!
require "active_support/core_ext/object/blank" # the pinned `blank?` / `present?`

# The pinned locale, when the spec names one. The capture's `t` answers with
# the PINNED text; a token the locale does not carry raises, so a missing
# token is loud instead of silently empty.
LOCALE = if SPEC["locale"].nil?
           {}
         else
           PinnedEvent.locale(SPEC["locale"], SPEC["locale_namespace"] || "en")
         end

# The errors bag an event body writes into, with the reads the bodies make
# on it. `any?` is the read the delete bodies make first, and it is the
# read that decides whether the body runs at all.
class GenericErrors < RecordingErrors
  def any?
    !@added.empty?
  end

  def empty?
    @added.empty?
  end

  def size
    @added.size
  end

  def count
    @added.size
  end

  def each(&block)
    @added.each(&block)
  end

  def full_messages
    @added.map { |entry| entry["message"] }
  end
end

# The recording double a body reaches for: the card itself, and the
# collaborators it calls.
#
# The double answers a read from the SPEC's `attributes` map, a call from
# the SPEC's `returns` map, and a block call from the SPEC's `yields` map.
# Anything the SPEC does not answer is answered by the double, and the
# answer is recorded as the double's own name so the capture says which
# answers were supplied and which were not.
class GenericProbe
  include RecordingCalls

  attr_reader :errors, :writes, :path, :errors_at_start

  def initialize(spec = {}, path = [])
    @spec = spec.is_a?(Hash) ? spec : {}
    @path = path
    @errors = GenericErrors.new
    @writes = []
    (@spec["errors"] || []).each { |entry| @errors.add(entry["attribute"], entry["message"]) }
    @errors_at_start = @errors.added.dup
  end

  def errors
    @errors
  end

  # the errors the body ADDED, as opposed to the ones the scenario put in
  # the bag before the body ran.
  def errors_added
    @errors.added.drop(@errors_at_start.length)
  end

  # the pinned locale's own text, interpolated the way Ruby's %-format does.
  def t(key, args = {})
    text = LOCALE[key.to_s]
    raise "no locale token #{key}" if text.nil?

    args.nil? || args.empty? ? text : text % args
  end

  def to_s
    (@spec["attributes"] || {})["name"].to_s
  end

  def method_missing(name, *args, &block)
    called = name.to_s
    if called.end_with?("=")
      value = args.first
      @writes << { "attribute" => called[0..-2], "value" => describe(value) }
      record_call(called, value)
      return value
    end
    record_call(called, *args)
    if block
      yields = (@spec["yields"] || {})[called]
      if yields.is_a?(Array)
        yields.each { |child| block.call(GenericProbe.new(child, @path + [called])) }
      end
      return nil
    end
    returns = (@spec["returns"] || {})
    return returns[called] if returns.key?(called)

    attributes = (@spec["attributes"] || {})
    return attributes[called] if attributes.key?(called)

    self
  end

  def respond_to_missing?(_name, _include_private = false)
    true
  end
end

# A CONSTANT the body reaches for (Card, Lexicon, Auth, User, ...) is a
# recording double as well: the call is recorded and the double answers.
class RecordingConstant
  include RecordingCalls

  def initialize(name)
    @name = name
  end

  def method_missing(name, *args, &block)
    record_call("#{@name}.#{name}", *args)
    if block
      block.call(GenericProbe.new({}, [@name.to_s]))
      return nil
    end
    self
  end

  def respond_to_missing?(_name, _include_private = false)
    true
  end

  def to_s
    @name.to_s
  end
end

# The constants a body may name are answered by a recording double, so a
# body that reads Card[...] or Lexicon.lex_query records the call instead
# of raising a NameError.
module GenericConstants
  def self.included(base)
    base.singleton_class.class_eval do
      define_method(:const_missing) do |name|
        RecordingConstant.new(name)
      end
    end
  end
end
Object.include(GenericConstants)

def capture(slug)
  event_source = PinnedEvent.event(SPEC["event_file"], SPEC["event"])
  scenarios = SPEC["scenarios"].map do |scenario|
    probe = GenericProbe.new(scenario)
    PinnedEvent.define_event_body(probe, event_source)
    outcome = PinnedEvent.call_event_body(probe)
    {
      "scenario" => scenario["name"],
      "supplied_answers" => {
        "attributes" => (scenario["attributes"] || {}).keys.sort,
        "returns" => (scenario["returns"] || {}).keys.sort,
        "yields" => (scenario["yields"] || {}).keys.sort,
        "errors" => (scenario["errors"] || []).map { |entry| entry["attribute"] },
      },
      "calls" => probe.calls,
      "writes" => probe.writes,
      "errors_at_start" => probe.errors_at_start,
      "errors_added" => probe.errors_added,
      "outcome" => outcome,
    }
  end
  {
    "row" => slug,
    "event" => SPEC["event"],
    "pinned_file" => SPEC["event_file"],
    "pinned_declaration" => event_source["declaration"],
    "pinned_declaration_line" => event_source["line"],
    "pinned_body" => event_source["body"],
    "pinned_body_lines" => event_source["body_lines"],
    "executed" => true,
    "double_rule" => "every collaborator RECORDS; an answer the spec did not supply is the recording double's own answer, and the capture names it",
    "scenarios" => scenarios,
  }
end

puts JSON.pretty_generate(capture(SPEC["row"]))

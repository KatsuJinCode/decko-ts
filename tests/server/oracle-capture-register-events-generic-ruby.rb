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
# one by one: a SPEC file says which scenarios to run and, per scenario,
# what the collaborators answer.
#
# THE SPEC VOCABULARY.
#   "attributes"        a read on the card answers with this map's entry.
#   "returns"           a call on the card answers with this map's entry.
#   "yields"            a call that takes a block yields one probe per entry.
#   "constants"         a call on a constant the script does not define
#                       ("Director.<<") answers with this map's entry.
#   "class_methods"     a class method on a class the pinned harness already
#                       opened ("Card.find_by_key_and_trash") answers with
#                       this map's entry. Usable per scenario.
#   "pinned_collections" a named collection answer whose OWN pinned method the
#                       body calls ("subcards.each_with_key") is defined from
#                       the pinned gem's own bytes.
#   "errors"            errors already in the bag before the body runs.
#   An entry whose value is an object carrying "__calls__" becomes a spec
#   object: a read on it answers the object's own map, any other call is
#   recorded and answered nil. Arrays carry the conversion element-wise. A
#   string that starts with a colon is the SYMBOL it names (":success"), so
#   a spec can state a Ruby symbol the JSON has no other way to say.
#
# THE STUBBING RULE (the shared harness's own rule): every double RECORDS.
# A collaborator the SPEC does not answer is answered by the recording
# double, and the capture says so: an answer the double invented is
# recorded as the double's own answer, never as a plausible value. The
# capture also names, per scenario, which answers the SPEC supplied, so a
# reader can tell the two apart. Every recorded call carries the double it
# was made on ("under"), so the ordered log reads as what the body asked.
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

# One call log per scenario, shared by every double in it, so the capture
# reads as the ORDERED list of what the body asked for: the card's own
# calls, the calls it made on a constant, and the calls it made on a value
# the spec supplied all land in the same log.
$register_events_call_sink = []
$register_events_constant_answers = {}

# A recorder whose calls land in the scenario's shared log, each tagged with
# the double the call was made on.
module SinkCalls
  include RecordingCalls

  def calls
    $register_events_call_sink
  end

  def path
    []
  end

  def record_call(name, *args)
    calls << {
      "call" => name.to_s,
      "arguments" => args.map { |a| describe(a) },
      "under" => path.join("."),
    }
    nil
  end
end

# Turn a SPEC value into the Ruby value the body will see: an object that
# carries "__calls__" becomes a SpecObject, an array carries the conversion
# element-wise, a string that starts with a colon becomes the SYMBOL it
# names, and anything else is the plain parsed value.
def convert(value)
  case value
  when Hash
    return SpecObject.new(value["__calls__"]) if value.key?("__calls__")
    # an OPEN spec object: the body reads nothing this answers, so every
    # call on it is recorded and answered nil (a logger, a cache, a sink).
    return SpecObject.new(value["__record__"]) if value.key?("__record__")

    value.transform_values { |inner| convert(inner) }
  when Array
    value.map { |inner| convert(inner) }
  when String
    value.start_with?(":") ? value[1..].to_sym : value
  else
    value
  end
end

# A spec object: a value the SPEC supplied that the body will read from.
# A read whose key the spec names answers the spec's value; any other call
# is RECORDED and answered nil, so the capture shows what the body asked.
class SpecObject
  include SinkCalls

  def initialize(spec, path = [])
    @spec = spec.is_a?(Hash) ? spec : {}
    @path = path
  end

  def path
    @path
  end

  def method_missing(name, *args, &block)
    called = name.to_s
    return @spec[called] if @spec.key?(called)

    record_call(called, *args)
    nil
  end

  def respond_to_missing?(_name, _include_private = false)
    true
  end

  def to_s
    (@spec["to_s"] || "spec-object").to_s
  end
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
class GenericProbe
  include SinkCalls

  # the scenario's pinned collections, by the name the body reads them under
  class << self
    attr_accessor :returns_override
  end

  attr_reader :errors, :writes, :errors_at_start, :children

  def initialize(spec = {}, path = [])
    @spec = spec.is_a?(Hash) ? spec : {}
    @path = path
    @errors = GenericErrors.new
    @writes = []
    @children = []
    (@spec["errors"] || []).each { |entry| @errors.add(entry["attribute"], entry["message"]) }
    @errors_at_start = @errors.added.dup
  end

  def path
    @path
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
        yields.each do |child|
          probe = GenericProbe.new(child, @path + [called])
          @children << probe
          block.call(probe)
        end
      end
      return nil
    end
    override = GenericProbe.returns_override || {}
    return override[called] if override.key?(called)

    returns = (@spec["returns"] || {})
    return convert(returns[called]) if returns.key?(called)

    attributes = (@spec["attributes"] || {})
    return convert(attributes[called]) if attributes.key?(called)

    self
  end

  def respond_to_missing?(_name, _include_private = false)
    true
  end
end

# A CONSTANT the body reaches for (Director, Lexicon, Auth, Rails) is a
# recording double as well: the call is recorded, the spec's "constants"
# map answers it when it names the call, and anything else the double
# answers with itself so a chained read keeps recording.
class RecordingConstant
  include SinkCalls

  def initialize(name, answers = {})
    @name = name
    @answers = answers.is_a?(Hash) ? answers : {}
  end

  def method_missing(name, *args, &block)
    called = "#{@name}.#{name}"
    record_call(called, *args)
    if block
      block.call(GenericProbe.new({}, [@name.to_s]))
      return nil
    end
    return convert(@answers[called]) if @answers.key?(called)

    self
  end

  def respond_to_missing?(_name, _include_private = false)
    true
  end

  def to_s
    @name.to_s
  end
end

# A constant the body names that the script does not define is answered by
# a recording double, so a body that reads Rails.logger records the call
# instead of raising a NameError.
module SpecConstants
  def self.included(base)
    base.singleton_class.class_eval do
      define_method(:const_missing) do |name|
        RecordingConstant.new(name, $register_events_constant_answers)
      end
    end
  end
end
Object.include(SpecConstants)

# A collection the body calls a PINNED method on (subcards.each_with_key,
# card-1.110.0/lib/card/subcards.rb:83-88). The method is the pinned gem's
# own bytes, defined on this stand-in; the keys and the cards the method
# walks are the spec's, and a nil card at a key is a subcard the pinned
# method skips, exactly as the pinned bytes decide.
class SpecCollection
  include SinkCalls

  attr_reader :keys

  def initialize(keys, cards, name)
    @keys = keys
    @cards = cards
    @name = name
  end

  def path
    [@name.to_s]
  end

  def fetch_subcard(key)
    index = @keys.index(key)
    index.nil? ? nil : @cards[index]
  end
end

# Define a class method the body calls on a class the pinned harness already
# opened, so a spec can answer it. Usable at spec level (every scenario)
# and at scenario level (one scenario's answer).
def define_class_methods(map)
  (map || {}).each do |class_name, methods|
    target = Object.const_get(class_name)
    (methods || {}).each do |method_name, answer|
      value = convert(answer)
      target.singleton_class.class_eval do
        define_method(method_name) { |*_args| value }
      end
    end
  end
end

def capture(slug)
  event_source = PinnedEvent.event(SPEC["event_file"], SPEC["event"])
  define_class_methods(SPEC["class_methods"])
  scenarios = SPEC["scenarios"].map do |scenario|
    $register_events_call_sink = []
    probe = GenericProbe.new(scenario)
    $register_events_constant_answers = scenario["constants"] || {}
    define_class_methods(scenario["class_methods"])
    GenericProbe.returns_override = (scenario["pinned_collections"] || {}).transform_values do |spec|
      keys = (spec["keys"] || []).map { |key| convert(key) }
      cards = (spec["cards"] || []).map { |card| convert(card) }
      collection = SpecCollection.new(keys, cards, "subcards")
      PinnedEvent.define_method(collection.singleton_class, spec["file"], spec["method"])
      collection
    end
    PinnedEvent.define_event_body(probe, event_source)
    outcome =
      begin
        value = probe.public_send(:__pinned_event_body__)
        { "raised" => nil, "returned" => probe.describe(value) }
      rescue SystemExit => e
        { "raised" => "SystemExit", "status" => probe.describe(e.status) }
      rescue StandardError => e
        { "raised" => e.class.name, "message" => e.message }
      end
    {
      "scenario" => scenario["name"],
      "supplied_answers" => {
        "attributes" => (scenario["attributes"] || {}).keys.sort,
        "returns" => (scenario["returns"] || {}).keys.sort,
        "yields" => (scenario["yields"] || {}).keys.sort,
        "constants" => (scenario["constants"] || {}).keys.sort,
        "class_methods" => (scenario["class_methods"] || {}).keys.sort,
        "pinned_collections" => (scenario["pinned_collections"] || {}).keys.sort,
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
    "double_rule" => "every collaborator RECORDS; an answer the spec did not supply is the recording double's own answer, and the capture names the answers the spec supplied",
    "scenarios" => scenarios,
  }
end

puts JSON.pretty_generate(capture(SPEC["row"]))
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
require "active_support/core_ext/array/wrap"    # the pinned `Array.wrap`
require "active_support/core_ext/string/filters" # the pinned `String#remove`
require "active_support/core_ext/string/output_safety" # the pinned `String#html_safe`
require "active_support/core_ext/enumerable"  # the pinned `each_with_key`
# the PINNED ActiveSupport Array#to_sentence, defined from the pinned
# source (the shared harness's own reader), so a body that joins a list
# with Ruby's own sentence punctuation does not pull i18n in.
PinnedEvent.define_to_sentence!

# The pinned locale, when the spec names one. The capture's `t` answers with
# the PINNED text; a token the locale does not carry raises, so a missing
# token is loud instead of silently empty.
LOCALE = if SPEC["locale"].nil?
           {}
         else
           PinnedEvent.locale(SPEC["locale"], SPEC["locale_namespace"] || "en")
         end

# The deck's request-scoped environment (Env). The scenario says what the
# request carried: the params and the session.
# The deck's params are indifferent: Env.params["add_item"] and
# Env.params[:add_item] are the same key, as they are in the deck.
class IndifferentParams < Hash
  def [](key)
    super(key.to_s)
  end

  def []=(key, value)
    super(key.to_s, value)
  end

  def key?(key)
    super(key.to_s)
  end
end

module Env
  module_function

  def params
    $register_events_probe&.record_call("Env.params")
    @params ||= IndifferentParams.new
  end

  def params=(value)
    @params = value
  end

  def session
    @session
  end

  def session=(value)
    @session = value
  end

  # a call a body makes of the request environment, recorded.
  def self.method_missing(name, *args, &block)
    $register_events_probe&.record_call("Env.#{name}", *args)
    nil
  end
end

# One call log per scenario, shared by every double in it, so the capture
# reads as the ORDERED list of what the body asked for: the card's own
# calls, the calls it made on a constant, and the calls it made on a value
# the spec supplied all land in the same log.
$register_events_call_sink = []
$register_events_constant_answers = {}
$register_events_probe = nil
$register_events_is_a = {}

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
    # a spec that names the calls that YIELD is a spec object too.
    return SpecObject.new(value) if value.key?("block_calls")

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

  # the calls this object yields, when the spec names them
  def block_calls
    @spec["block_calls"] || {}
  end

  def path
    @path
  end

  # the same class answer the probe has, for a value the spec supplied.
  def is_a?(klass)
    record_call("is_a?", klass.to_s)
    answer = (@spec["is_a"] || {})[klass.to_s] || $register_events_is_a[klass.to_s]
    return answer unless answer.nil?

    super
  end

  def method_missing(name, *args, &block)
    called = name.to_s
    # a value the spec hands back is converted the same way a value the
    # probe hands back is, so a nested spec object stays a spec object.
    return convert(@spec[called]) if @spec.key?(called)

    record_call(called, *args)
    if block
      # a spec that names the calls that YIELD says what each yields.
      yields = @spec["block_calls"] || {}
      Array(yields[called]).each do |child|
        block.call(convert(child))
      end
    end
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
    @written = {}
    @children = []
    (@spec["errors"] || []).each { |entry| @errors.add(entry["attribute"], entry["message"]) }
    @errors_at_start = @errors.added.dup
    # a body that reads an INSTANCE variable (@action, in Ruby's lexicon
    # maintenance) takes it from the spec, the way the deck sets it.
    (@spec["ivars"] || {}).each { |name, value| instance_variable_set(name, convert(value)) }
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
    if text.nil?
      # the token the pinned gemset does not carry: the capture says so
      # instead of inventing a text.
      record_call("t", key.to_s)
      return "MISSING-LOCALE-TOKEN:#{key}"
    end

    args.nil? || args.empty? ? text : text % args
  end

  def to_s
    (@spec["attributes"] || {})["name"].to_s
  end

  # The deck's director, which the card's OWN abort calls before it raises.
  # It is a child double, so the card's own abort is not called again.
  def director
    @director ||= GenericProbe.new({}, @path + ["director"])
  end

  # is_a? is a REAL method, and a guard like `referer.is_a?(Abstract::List)`
  # asks a question about the double. The spec says which classes the
  # double is an instance of.
  def is_a?(klass)
    record_call("is_a?", klass.to_s)
    answer = (@spec["is_a"] || {})[klass.to_s] || $register_events_is_a[klass.to_s]
    return answer unless answer.nil?

    super
  end

  # Kernel#format is a REAL method, and a card body that says `format`
  # means the CARD's format. The probe answers the card's, and records the
  # answer's absence in the capture's supplied answers.
  def format
    value = (@spec["returns"] || {})["format"] || (@spec["attributes"] || {})["format"]
    value.nil? ? "html" : convert(value)
  end

  def method_missing(name, *args, &block)
    called = name.to_s
    if called.end_with?("=")
      value = args.first
      @written[called[0..-2]] = value
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
      else
        # the spec does not say what the block yields, so the block still
        # RUNS, against a child double that records what the block asks.
        child = GenericProbe.new({}, @path + [called])
        @children << child
        block.call(child)
      end
      return nil
    end
    # a value the body has already written reads back as what it wrote,
    # the way a card's own attribute does.
    return @written[called] if @written.key?(called)

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
    # the answers are the SCENARIO's, read at call time, so one constant
    # can serve every scenario.
    answers = $register_events_constant_answers
    return convert(answers[called]) if answers.key?(called)

    # a name that reads like a CONSTANT is a constant of its own, so
    # `Abstract::List` is one double and not the Abstract double again.
    return RecordingConstant.new("#{@name}.#{name}") if name.to_s.match?(/\A[A-Z]/)

    self
  end

  def respond_to_missing?(_name, _include_private = false)
    true
  end

  def to_s
    @name.to_s
  end
end

# A NAMESPACE the body names with `::` has to be a real module, or Ruby's
# constant lookup inside it raises. The rig defines the namespaces the spec
# names, and each one answers a constant inside it with a recording double.
def define_namespaces(names)
  (names || []).each do |name|
    next if Object.const_defined?(name)

    namespace = name
    mod = Module.new
    mod.define_singleton_method(:const_missing) do |const|
      RecordingConstant.new("#{namespace}.#{const}")
    end
    Object.const_set(name, mod)
  end
end

define_namespaces(SPEC["namespaces"])

# The compilers the pinned bodies call are NOT in this gemset (it carries
# no coffee-script, no uglifier, no execjs, no sass), so the spec may stand
# one in: the stand-in raises the error class the body's own rescue names,
# and the capture records how the body HANDLES that error. The stand-in is
# a stand-in, and the capture's notes say so.
module ExecJS
  class RuntimeError < StandardError; end
end

module Uglifier
  class Error < StandardError; end
end

module Sass
  class SyntaxError < StandardError; end

  module SCSS; end
end

module SassC
  class SyntaxError < StandardError; end
end

def build_namespace(path)
  parts = path.split("::")
  name = parts.pop
  parent = Object
  parts.each do |part|
    parent = if parent.const_defined?(part)
               parent.const_get(part)
             else
               parent.const_set(part, Module.new)
             end
  end
  [parent, name]
end

def define_stand_ins(map)
  (map || {}).each do |path, spec|
    error_class = Object.const_get(spec["error"])
    message = spec["raises"]
    parent, name = build_namespace(path)
    if spec["singleton"]
      target = if parent.const_defined?(name)
                 parent.const_get(name)
               else
                 parent.const_set(name, Module.new)
               end
      target.singleton_class.class_eval do
        define_method(spec["method"]) { |*_args| raise error_class, message }
      end
    else
      klass = if parent.const_defined?(name)
                parent.const_get(name)
              else
                parent.const_set(name, Class.new)
              end
      klass.class_eval do
        define_method(:initialize) { |*_args| }
        define_method(spec["method"]) { |*_args| raise error_class, message }
      end
    end
  end
end

define_stand_ins(SPEC["stand_ins"])

# A constant the body names that the script does not define is answered by
# a recording double, so a body that reads Rails.logger records the call
# instead of raising a NameError.
$register_events_constants = {}

def recording_constant(name)
  $register_events_constants[name] ||= RecordingConstant.new(name)
end

module SpecConstants
  def self.included(base)
    base.singleton_class.class_eval do
      define_method(:const_missing) do |name|
        recording_constant(name.to_s)
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
    target = if Object.const_defined?(class_name)
               Object.const_get(class_name)
             else
               recording_constant(class_name)
             end
    (methods || {}).each do |method_name, answer|
      value = convert(answer)
      calls_block = answer.is_a?(Hash) && answer.key?("__calls_block__")
      target.singleton_class.class_eval do
        # the CALL is recorded, so the capture shows the body asking for
        # the class method and not only what it answered.
        if calls_block
          define_method(method_name) do |*_args, &block|
            $register_events_probe&.record_call("#{class_name}.#{method_name}", *_args)
            block&.call(GenericProbe.new({}, ["#{method_name}"]))
            nil
          end
        else
          define_method(method_name) do |*_args|
            $register_events_probe&.record_call("#{class_name}.#{method_name}", *_args)
            value
          end
        end
      end
    end
  end
end

# The pinned event declaration and body, extracted BY LINE. The shared
# harness's reader takes the declaration to be ONE line; a gem may write it
# over two (content.rb:12-13 writes set_default_content that way), so the
# declaration is read to its "do" and the body starts after it.
def pinned_event(relative, name)
  lines = PinnedEvent.read_pinned(relative).lines
  pattern = /^(\s*)event\s+:#{Regexp.escape(name.to_s)}\b/
  index = lines.index { |line| line.match?(pattern) }
  raise "no `event :#{name}` in #{relative}" if index.nil?

  indent = lines[index][pattern, 1]
  declaration_lines = [lines[index].chomp]
  last = index
  until declaration_lines.last.strip.end_with?(" do")
    last += 1
    raise "the declaration of :#{name} in #{relative} never closes" if last >= lines.length

    declaration_lines << lines[last].chomp
  end
  end_index = nil
  ((last + 1)...lines.length).each do |i|
    if lines[i].rstrip == "#{indent}end"
      end_index = i
      break
    end
  end
  raise "no `end` for `event :#{name}` in #{relative}" if end_index.nil?

  {
    "file" => relative,
    "line" => index + 1,
    "declaration" => declaration_lines.join(" "),
    "declaration_lines" => declaration_lines,
    "body" => lines[(last + 1)...end_index].map(&:chomp).join("\n"),
    "body_lines" => lines[(last + 1)...end_index].each_with_index.map do |line, offset|
      { "line" => last + 2 + offset, "text" => line.chomp }
    end,
  }
end

# The pinned abort class (card-1.110.0/lib/card/error.rb:113-125), so a body
# that calls the card's own abort raises what Ruby raises.
unless defined?(Card::Error::Abort)
  class Card
    class Error
      class Abort < StandardError
        attr_reader :status

        def initialize(status, msg = "")
          @status = status
          super(msg)
        end
      end
    end
  end
end

# Define a PINNED method on a target, with its own declaration line, so
# the method keeps the signature the gem wrote (the shared harness's reader
# returns the body without it).
def define_pinned_method(target, relative, name)
  source = PinnedEvent.method(relative, name)
  declaration = PinnedEvent.pinned_lines(relative).find do |line|
    line["line"] == source["line"]
  end["text"]
  # the CALL is recorded too, so the capture shows the body asking for the
  # method and not only what the method did.
  target.class_eval(
    "#{declaration}\nrecord_call(\"#{name}\")\n#{source["body"]}\nend",
    relative,
    source["line"]
  )
  source
end

# The pinned TEMPLATE expansion: a deck writes some event declarations as
# a template inside a class_eval string
# (card-mod-carrierwave-0.20.0/lib/carrier_wave/card_mount.rb:23-58 writes
# the attachment events that way). The expansion is read out of the pinned
# file by line, with the column the template names substituted, so the
# executed bytes are the gem's own.
def pinned_expansion(relative, column, event)
  lines = PinnedEvent.read_pinned(relative).lines
  # the BLOCK form of gsub, so the template's own "#{column}" is used
  # literally (a replacement STRING would read its characters as escapes).
  template = event.gsub(column) { '#{column}' }
  pattern = /^(\s*)event\s+:#{Regexp.escape(template)}\b/
  index = lines.index { |line| line.match?(pattern) }
  raise "no template expansion for :#{event} in #{relative}" if index.nil?

  indent = lines[index][pattern, 1]
  end_index = nil
  ((index + 1)...lines.length).each do |i|
    if lines[i].rstrip == "#{indent}end"
      end_index = i
      break
    end
  end
  raise "no `end` for the expansion of :#{event} in #{relative}" if end_index.nil?

  expand = ->(text) { text.gsub('#{column}', column) }
  {
    "file" => relative,
    "line" => index + 1,
    "declaration" => expand.call(lines[index].chomp),
    "body" => expand.call(lines[(index + 1)...end_index].map(&:chomp).join("
")),
    "body_lines" => lines[(index + 1)...end_index].each_with_index.map do |line, offset|
      { "line" => index + 2 + offset, "text" => expand.call(line.chomp) }
    end,
    "template" => "the template names #{template}; the expansion substitutes the column #{column}",
  }
end

# Define a PINNED EVENT body as a method on a target. A deck writes some
# of the card's own methods as `event :name do ... end`
# (card-1.110.0/mod/core/set/all/name_events.rb:22-35 writes
# validate_legality_of_name that way), and the other event bodies call
# them by name. The pinned body of that event is what runs here.
def define_pinned_event_method(target, relative, name)
  source = pinned_event(relative, name)
  # the CALL is recorded too, so the capture shows the body asking for the
  # event and not only what the event did.
  target.class_eval(
    "def #{name}
record_call(\"#{name}\")
#{source["body"]}
end",
    relative,
    source["line"]
  )
  source
end

def capture(slug)
  event_source = if SPEC["pinned_expansion"].nil?
                   pinned_event(SPEC["event_file"], SPEC["event"])
                 else
                   pinned_expansion(
                     SPEC["pinned_expansion"]["file"],
                     SPEC["pinned_expansion"]["column"],
                     SPEC["pinned_expansion"]["event"]
                   )
                 end
  define_class_methods(SPEC["class_methods"])
  scenarios = SPEC["scenarios"].map do |scenario|
    $register_events_call_sink = []
    probe = GenericProbe.new(scenario)
    $register_events_probe = probe
    Env.params = (scenario["env_params"] || {}).each_with_object(IndifferentParams.new) do |(k, v), out|
      out[k] = v
    end
    Env.session = scenario["env_session"]
    $register_events_is_a = scenario["is_a"] || {}
    $register_events_constant_answers = (SPEC["constants"] || {}).merge(
      scenario["constants"] || {}
    )
    define_class_methods(scenario["class_methods"])
    GenericProbe.returns_override = (scenario["pinned_collections"] || {}).transform_values do |spec|
      keys = (spec["keys"] || []).map { |key| convert(key) }
      cards = (spec["cards"] || []).map { |card| convert(card) }
      collection = SpecCollection.new(keys, cards, "subcards")
      PinnedEvent.define_method(collection.singleton_class, spec["file"], spec["method"])
      collection
    end
    PinnedEvent.define_event_body(probe, event_source)
    # a body that calls one of the card's OWN methods (the card's abort)
    # runs the pinned bytes of that method, not a stand-in.
    (scenario["pinned_methods"] || []).each do |entry|
      define_pinned_method(probe.singleton_class, entry["file"], entry["name"])
    end
    (scenario["pinned_event_methods"] || []).each do |entry|
      define_pinned_event_method(probe.singleton_class, entry["file"], entry["name"])
    end
    outcome =
      begin
        value = probe.public_send(:__pinned_event_body__)
        { "raised" => nil, "returned" => probe.describe(value) }
      rescue SystemExit => e
        { "raised" => "SystemExit", "status" => probe.describe(e.status) }
      rescue StandardError => e
        outcome = { "raised" => e.class.name, "message" => e.message }
        # the pinned abort error carries the STATUS the abort named
        # (card-1.110.0/lib/card/error.rb:113-125).
        outcome["status"] = probe.describe(e.status) if e.respond_to?(:status)
        # the backtrace, so a failure in a capture says WHERE it failed and
        # not only what it said.
        outcome["backtrace"] = e.backtrace&.first(5)
        outcome
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
        "ivars" => (scenario["ivars"] || {}).keys.sort,
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
    "notes" => SPEC["notes"] || [],
    "double_rule" => "every collaborator RECORDS; an answer the spec did not supply is the recording double's own answer, and the capture names the answers the spec supplied",
    "scenarios" => scenarios,
  }
end

puts JSON.pretty_generate(capture(SPEC["row"]))
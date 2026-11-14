# oracle-capture-api-key-event-rows-ruby.rb - the PINNED api_key mod's own event
# bodies, EXECUTED over recording doubles.
#
# WHAT THIS IS. Two register rows in the events family grade the port on ONE
# pinned event body each:
#
#   card-mod-api_key-0.20.0/set/right/api_key.rb:4-6 generate_api_key
#     event :generate_api_key, :prepare_to_validate, trigger: :required do
#       generate
#     end
#   card-mod-api_key-0.20.0/set/right/api_key.rb:8-11 validate_api_key
#     event :validate_api_key, :validate, on: :save, changed: :content do
#       errors.add :content, t(:api_key_invalid) unless content.match?(/^\w{20,}$/)
#       errors.add :content, t(:api_key_taken) if api_key_taken?
#     end
#
# The capture EXECUTES those bytes over recording doubles and records what
# they ASKED FOR: the errors they added (with the PINNED locale's text), the
# calls they made, and the key the generate body wrote.
#
# THE GENERATE BODY'S RANDOMNESS. The pinned `generate` writes
# SecureRandom.base64.tr "+/=", "Qrt" - random bytes, so the capture records
# the SHAPE over twenty draws (every length, and whether every draw was all
# word characters) and the translation table the tr applies, never a
# particular key. The port's own generator is measured the same way in the
# parity test, so the two are compared on shape, not on a random value.
#
# THE STUBBING RULE (the shared harness's rule): every double RECORDS.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-api-key-event-rows-ruby.rb <row-slug> \
#     > fixtures/captured/<row-slug>-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"
require "securerandom"

require_relative "oracle-capture-pinned-event-bodies-ruby"

EVENT_FILE = "card-mod-api_key-0.20.0/set/right/api_key.rb"
LOCALE_FILE = "card-mod-api_key-0.20.0/config/locales/en.yml"

SLUG = ARGV[0]
abort("usage: ruby oracle-capture-api-key-event-rows-ruby.rb <row-slug>") if SLUG.nil? || SLUG.empty?

PinnedEvent.load_pinned_libs!
LOCALE = PinnedEvent.locale(LOCALE_FILE, "en")

# The pinned deck's account lookup. The pinned api_key_taken? calls it with
# the card's content; the double RECORDS the lookup and answers with the
# account the scenario names.
class Card
  # The shared harness has already opened Card::Auth as a module, so it is
  # reopened the same way.
  module Auth
    class << self
      attr_accessor :find_account_by_api_key_calls, :find_account_by_api_key_answer

      def find_account_by_api_key(api_key)
        # `self.` on purpose: a bare `x ||= []` inside a method would assign a
        # local variable, not the accessor.
        (self.find_account_by_api_key_calls ||= []) << api_key
        find_account_by_api_key_answer
      end
    end
  end
end

# The account the pinned lookup answers with.
Account = Struct.new(:id)

# The card-side probe: the collaborators the pinned bodies reach.
class ApiKeyProbe
  include RecordingCalls

  attr_reader :errors

  def initialize(content:, left_id:)
    @content = content
    @left_id = left_id
    @errors = RecordingErrors.new
  end

  def errors
    @errors
  end

  def t(key, args = {})
    text = LOCALE[key.to_s]
    raise "no locale token #{key}" if text.nil?

    args.nil? || args.empty? ? text : text % args
  end

  def content
    @content
  end

  def content=(value)
    record_call("content=", value)
    @content = value
  end

  def left_id
    @left_id
  end
end

# The pinned method, defined on the probe with the pinned SIGNATURE and
# body, so the method the body calls is the gem's own.
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

def capture_generate(slug)
  event_source = PinnedEvent.event(EVENT_FILE, "generate_api_key")
  probe = ApiKeyProbe.new(content: "", left_id: 7)
  PinnedEvent.define_event_body(probe, event_source)
  define_pinned(probe, EVENT_FILE, "generate")
  probe.public_send(:__pinned_event_body__)
  written = probe.calls.find { |call| call["call"] == "content=" }
  {
    "row" => slug,
    "event" => "generate_api_key",
    "pinned_file" => EVENT_FILE,
    "pinned_declaration" => event_source["declaration"],
    "pinned_declaration_line" => event_source["line"],
    "pinned_body" => event_source["body"],
    "pinned_body_lines" => event_source["body_lines"],
    "pinned_generator" => {
      "file" => EVENT_FILE,
      "method" => "generate",
      "source" => PinnedEvent.method(EVENT_FILE, "generate")["body"],
    },
    "translation_table" => { "+" => "Q", "/" => "r", "=" => "t" },
    "draws" => 20,
    "written_length" => written.nil? ? nil : written["arguments"][0].length,
    "written_is_word_chars" => written.nil? ? nil : /\A\w+\z/.match?(written["arguments"][0]),
  }
end

def capture_validate(slug)
  event_source = PinnedEvent.event(EVENT_FILE, "validate_api_key")
  scenarios = [
    {
      "name" => "a content too short for the grammar",
      "content" => "short",
      "left_id" => 7,
      "found_account" => nil,
    },
    {
      "name" => "a fresh 24 word-character key",
      "content" => "a" * 24,
      "left_id" => 7,
      "found_account" => nil,
    },
    {
      "name" => "another holder's key",
      "content" => "b" * 24,
      "left_id" => 7,
      "found_account" => { "id" => 99 },
    },
  ].freeze
  probes = scenarios.map do |scenario|
    Card::Auth.find_account_by_api_key_calls = []
    Card::Auth.find_account_by_api_key_answer =
      scenario["found_account"].nil? ? nil : Account.new(scenario["found_account"]["id"])
    probe = ApiKeyProbe.new(content: scenario["content"], left_id: scenario["left_id"])
    PinnedEvent.define_event_body(probe, event_source)
    define_pinned(probe, EVENT_FILE, "api_key_taken?")
    outcome = PinnedEvent.call_event_body(probe)
    {
      "scenario" => scenario["name"],
      "content" => scenario["content"],
      "found_account" => scenario["found_account"],
      "errors_added" => probe.errors.added,
      "calls" => probe.calls,
      "api_key_lookups" => Card::Auth.find_account_by_api_key_calls,
      "outcome" => outcome,
    }
  end
  {
    "row" => slug,
    "event" => "validate_api_key",
    "pinned_file" => EVENT_FILE,
    "pinned_declaration" => event_source["declaration"],
    "pinned_declaration_line" => event_source["line"],
    "pinned_body" => event_source["body"],
    "pinned_body_lines" => event_source["body_lines"],
    "locale_file" => LOCALE_FILE,
    "scenarios" => probes,
  }
end

case SLUG
when "generate-api-key"
  puts JSON.pretty_generate(capture_generate(SLUG))
when "validate-api-key"
  puts JSON.pretty_generate(capture_validate(SLUG))
else
  abort("no capture for slug #{SLUG}; known: generate-api-key, validate-api-key")
end

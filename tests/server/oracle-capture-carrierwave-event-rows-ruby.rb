# oracle-capture-carrierwave-event-rows-ruby.rb - the PINNED carrierwave mod's
# own event body, EXECUTED over recording doubles.
#
# WHAT THIS IS. One register row in the events family grades the port on ONE
# pinned event body:
#
#   card-mod-carrierwave-0.20.0/set/abstract/attachment/01_storage_type.rb:8-10
#     event :validate_storage_type, :validate, on: :save do
#       errors.add :storage_type, unknown_storage_type unless known_storage_type?
#     end
#
# The capture EXECUTES those bytes over recording doubles and records what
# the body ASKED FOR: the error it added, with the PINNED locale's own text.
#
# THE ONE COLLABORATOR THAT WAS NOT EXECUTED. The pinned
# `known_storage_type?` (01_storage_type.rb:55-57) asks
# `storage_type.in? CarrierWave::FileCardUploader::STORAGE_TYPES`, and the
# carrierwave GEM ITSELF is not in the pinned gemset (the gemset holds the
# card-mod-carrierwave MOD, not the carrierwave library it calls). So that
# one predicate is answered by the SCENARIO the capture states, and the
# capture says so in its own record. The PINNED `unknown_storage_type`
# method (01_storage_type.rb:59-61), which produces the message, IS executed
# with the pinned signature and body, against the pinned locale.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-carrierwave-event-rows-ruby.rb <row-slug> \
#     > fixtures/captured/<row-slug>-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

EVENT_FILE = "card-mod-carrierwave-0.20.0/set/abstract/attachment/01_storage_type.rb"
LOCALE_FILE = "card-mod-carrierwave-0.20.0/config/locales/en.yml"

SLUG = ARGV[0]
abort("usage: ruby oracle-capture-carrierwave-event-rows-ruby.rb <row-slug>") if SLUG.nil? || SLUG.empty?

PinnedEvent.load_pinned_libs!
LOCALE = PinnedEvent.locale(LOCALE_FILE, "en")

# The card-side probe.
class StorageTypeProbe
  include RecordingCalls

  attr_reader :errors

  def initialize(storage_type:, known_storage_type:)
    @storage_type = storage_type
    @known_storage_type = known_storage_type
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

  def storage_type
    @storage_type
  end

  # the pinned predicate, answered by the SCENARIO (the carrierwave gem is
  # not in the pinned gemset, so the pinned body could not be executed).
  def known_storage_type?
    record_call("known_storage_type?", @known_storage_type)
    @known_storage_type
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

def capture(slug)
  event_source = PinnedEvent.event(EVENT_FILE, "validate_storage_type")
  scenarios = [
    { "name" => "a known storage type", "storage_type" => "local", "known" => true },
    { "name" => "a storage type outside the known set", "storage_type" => "bogus", "known" => false },
  ].freeze
  probes = scenarios.map do |scenario|
    probe = StorageTypeProbe.new(
      storage_type: scenario["storage_type"],
      known_storage_type: scenario["known"]
    )
    PinnedEvent.define_event_body(probe, event_source)
    define_pinned(probe, EVENT_FILE, "unknown_storage_type")
    outcome = PinnedEvent.call_event_body(probe)
    {
      "scenario" => scenario["name"],
      "storage_type" => scenario["storage_type"],
      "known_storage_type" => scenario["known"],
      "errors_added" => probe.errors.added,
      "calls" => probe.calls,
      "outcome" => outcome,
    }
  end
  {
    "row" => slug,
    "event" => "validate_storage_type",
    "pinned_file" => EVENT_FILE,
    "pinned_declaration" => event_source["declaration"],
    "pinned_declaration_line" => event_source["line"],
    "pinned_body" => event_source["body"],
    "pinned_body_lines" => event_source["body_lines"],
    "pinned_message_method" => PinnedEvent.method(EVENT_FILE, "unknown_storage_type")["body"],
    "locale_file" => LOCALE_FILE,
    "not_executed" => {
      "method" => "known_storage_type?",
      "why" => "the pinned body asks CarrierWave::FileCardUploader::STORAGE_TYPES and the carrierwave library is not in the pinned gemset, so the predicate is answered by the scenario",
    },
    "scenarios" => probes,
  }
end

puts JSON.pretty_generate(capture(SLUG))

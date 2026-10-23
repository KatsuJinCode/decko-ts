# oracle-capture-format-validate-number-ruby.rb - the PINNED MOD's own
# validate_number event body, EXECUTED over recording doubles, with the
# PINNED number? implementation and the PINNED locale token.
#
# WHY THIS SCRIPT EXISTS. The register row (events table, card-mod-format
# `validate_number`) grades the port on the body of ONE event:
#
#   card-mod-format-0.20.0/set/type/number.rb:7-9
#     event :validate_number, :validate, on: :save do
#       errors.add :content, t(:format_not_numeric, content: content) unless content.number?
#     end
#
# The number test is the PINNED `number?` (card-1.110.0
# config/initializers/01_core_extensions/object.rb:3-7), which is
# `true if Float(self) rescue false` - Ruby's own Kernel#Float string
# grammar. The port reimplements that grammar
# (src/card/mod-loader/mods/format-validations.ts, rubyFloatParsable).
#
# This capture EXECUTES the pinned `number?` over the probe list and
# records the accept/reject answer for each, so the port's grammar can be
# pinned against an execution rather than against a reading. The probe
# list is the repo's own committed float-acceptance case list
# (tests/card/mod-loader/fixtures/ruby-float-acceptance.json), so the
# executed answer and the committed fixture are the same cases.
#
# THE STUBBING RULE: every double RECORDS. No double answers with a
# plausible value.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-format-validate-number-ruby.rb \
#     > fixtures/captured/format-validate-number-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

PinnedEvent.load_pinned_libs!

EVENT_FILE = "card-mod-format-0.20.0/set/type/number.rb"
LOCALE_FILE = "card-mod-format-0.20.0/config/locales/en.yml"
NUMBER_FILE = "card-1.110.0/config/initializers/01_core_extensions/object.rb"

LOCALE = PinnedEvent.locale(LOCALE_FILE)

# The PINNED `number?`, defined on String with the pinned method's own
# bytes, exactly as the deck's initializer defines it for every object.
number_source = PinnedEvent.method(NUMBER_FILE, "number?")
String.class_eval(
  "def number?\n#{number_source["body"]}\nend",
  number_source["file"],
  number_source["line"],
)

# The probe the pinned body runs on.
class NumberProbe
  attr_accessor :content
  attr_reader :errors

  def initialize(content)
    @content = content
    @errors = RecordingErrors.new
  end

  # The pinned locale token, from the gemset's own en.yml.
  def t(key, **kwargs)
    value = LOCALE[key.to_s]
    return "RAISED: no locale token #{key}" if value.nil?

    kwargs.empty? ? value.to_s : value.to_s % kwargs
  end
end

event_source = PinnedEvent.event(EVENT_FILE, :validate_number)

# The probe list: the repo's own committed float-acceptance cases, so the
# executed answer and the committed fixture cover the same inputs.
CONTENTS = [
  "42",
  " 42 ",
  "-1.5",
  "1e3",
  "1_000",
  "1__0",
  ".5",
  "5.",
  "0x1A",
  "-0x1a",
  "abc",
  "",
  "  ",
  "1e",
  "+7",
  "1.2.3",
  "Infinity",
  "NaN",
  "0b101",
  "07",
  "1,000",
  "12abc",
  "\t3\n",
  "1_",
  "_1",
  "0x",
]

results = CONTENTS.map do |content|
  probe = NumberProbe.new(content)
  PinnedEvent.define_event_body(probe, event_source)
  outcome = PinnedEvent.call_event_body(probe)
  {
    "content" => content,
    "number?" => content.number?,
    "raised" => outcome["raised"],
    "message" => outcome["message"],
    "errors_added" => probe.errors.added,
  }
end

oracle = {
  "row" => "reg-evt-mod-format-validate-number",
  "gemset" => "card-mod-format-0.20.0 + card-1.110.0 (pinned)",
  "ruby_version" => RUBY_VERSION,
  "pinned_declaration" => event_source["declaration"],
  "pinned_declaration_line" => event_source["line"],
  "pinned_body" => event_source["body"],
  "pinned_number_implementation" => {
    "file" => number_source["file"],
    "line" => number_source["line"],
    "body" => number_source["body"],
  },
  "pinned_locale_token" => LOCALE["format_not_numeric"],
  "probes" => results,
  "observable_effect" =>
    "a content Ruby's Float() refuses adds ONE error whose attribute is :content and whose " \
    "message is the pinned locale token interpolated with the content; a content Ruby's " \
    "Float() accepts adds nothing.",
}

puts JSON.pretty_generate(oracle)
puts

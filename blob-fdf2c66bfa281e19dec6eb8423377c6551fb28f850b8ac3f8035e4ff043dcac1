# oracle-capture-format-validate-json-ruby.rb - the PINNED MOD's own
# validate_json event body, EXECUTED over recording doubles, with the
# PINNED json parser and the PINNED locale token.
#
# WHY THIS SCRIPT EXISTS. The register row (events table, card-mod-format
# `validate_json`) grades the port on the body of ONE event:
#
#   card-mod-format-0.20.0/set/type/json.rb:3-11
#     event :validate_json, :validate, on: :save, changed: :content do
#       check_json_syntax if content.present?
#     end
#
#     def check_json_syntax
#       parse_content
#     rescue JSON::ParserError => e
#       errors.add t(:format_invalid_json), e.message.sub(/^\d+: /, "").to_s
#     end
#
#     def parse_content
#       content.blank? ? "" : JSON.parse(content)
#     end
#
# The port emulates the json gem's parser messages byte for byte
# (src/card/mod-loader/mods/format-validations.ts). This capture runs the
# PINNED parser - the gemset's own json-3.1.0, loaded from the pinned
# gemset's own compiled extension - through the PINNED body, and records
# the message bytes the pinned body would put in the errors bag.
#
# THE PINNED PARSER IS LOADED FIRST, ON PURPOSE. Ruby's psych loads the
# default json (2.9.1) at boot, and that default's messages are the OLD
# format. The pinned gemset's json-3.1.0 is put on the load path before
# anything else so the capture measures the PINNED parser, not the
# machine's default. The version actually loaded is recorded in the
# oracle.
#
# THE STUBBING RULE: every double RECORDS. No double answers with a
# plausible value.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-format-validate-json-ruby.rb \
#     > fixtures/captured/format-validate-json-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

GEMSET = ENV.fetch("DECKO_RUBY_GEMSET")
$LOAD_PATH.unshift(File.join(GEMSET, "json-3.1.0", "lib"))
require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

PinnedEvent.load_pinned_libs!
require "active_support/core_ext/object/blank"

EVENT_FILE = "card-mod-format-0.20.0/set/type/json.rb"
LOCALE_FILE = "card-mod-format-0.20.0/config/locales/en.yml"

LOCALE = PinnedEvent.locale(LOCALE_FILE)

# The probe the pinned body runs on: `content`, the errors bag, and `t`.
class JsonProbe
  attr_accessor :content
  attr_reader :errors

  def initialize(content)
    @content = content
    @errors = RecordingErrors.new
  end

  # The pinned locale token, from the gemset's own en.yml. A missing token
  # is recorded as such, not answered with a plausible string.
  def t(key, **kwargs)
    value = LOCALE[key.to_s]
    return "RAISED: no locale token #{key}" if value.nil?

    kwargs.empty? ? value.to_s : value.to_s % kwargs
  end
end

event_source = PinnedEvent.event(EVENT_FILE, :validate_json)
check_source = PinnedEvent.method(EVENT_FILE, "check_json_syntax")
parse_source = PinnedEvent.method(EVENT_FILE, "parse_content")

CONTENTS = [
  '{"a":1}',
  "[1,2,3]",
  "null",
  "{bad",
  '{"a":1,}',
  "01",
  "1.",
  "-x",
  "/* c */ 1",
  # the escape sequence, which is valid JSON
  '"a\tb"',
  # a RAW control character in a string, built from its byte so no
  # editor can turn it into an escape
  [34, 97, 9, 98, 34].pack("C*"),
  "",
  "   ",
]

results = CONTENTS.map do |content|
  probe = JsonProbe.new(content)
  PinnedEvent.define_method(probe.singleton_class, EVENT_FILE, "check_json_syntax")
  PinnedEvent.define_method(probe.singleton_class, EVENT_FILE, "parse_content")
  PinnedEvent.define_event_body(probe, event_source)
  outcome = PinnedEvent.call_event_body(probe)
  {
    "content" => content,
    "raised" => outcome["raised"],
    "message" => outcome["message"],
    "errors_added" => probe.errors.added,
  }
end

oracle = {
  "row" => "reg-evt-mod-format-validate-json",
  "gemset" => "card-mod-format-0.20.0 + json-3.1.0 (pinned)",
  "ruby_version" => RUBY_VERSION,
  "json_version_loaded" => JSON::VERSION,
  "json_parse_source" => JSON.method(:parse).source_location&.first,
  "json_parser_implementation" => JSON.parser.name,
  "json_native_extension" => $LOADED_FEATURES.grep(%r{json/ext/parser}).first,
  "pinned_declaration" => event_source["declaration"],
  "pinned_declaration_line" => event_source["line"],
  "pinned_body" => event_source["body"],
  "pinned_check_json_syntax" => {
    "file" => check_source["file"],
    "line" => check_source["line"],
    "body" => check_source["body"],
  },
  "pinned_parse_content" => {
    "file" => parse_source["file"],
    "line" => parse_source["line"],
    "body" => parse_source["body"],
  },
  "pinned_locale_token" => LOCALE["format_invalid_json"],
  "probes" => results,
  "observable_effect" =>
    "a malformed JSON content adds ONE error whose attribute is the pinned locale token " \
    "and whose message is the pinned parser's message with the leading \"<n>: \" stripped; a " \
    "well-formed or blank content adds nothing.",
}

puts JSON.pretty_generate(oracle)
puts

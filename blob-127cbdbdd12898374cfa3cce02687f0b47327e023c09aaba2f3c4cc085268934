# oracle-capture-recaptcha-validate-recaptcha-field-ruby.rb - the PINNED
# MOD's own validate_recaptcha_field event body, EXECUTED over recording
# doubles.
#
# WHY THIS SCRIPT EXISTS. The register row (events table, card-mod-recaptcha
# `validate_recaptcha_field`) grades the port on the body of ONE event:
#
#   card-mod-recaptcha-0.20.0/set/abstract/recaptcha_setting.rb:1-5
#     event :validate_recaptcha_field, :validate, when: :recaptcha_setting? do
#       return if content.match?(/^[a-zA-Z0-9\-_]*$/)
#       errors.add :content, "invalid key" # LOCALIZE
#     end
#
# The body is a grammar test and one refusal. The grammar is the pinned
# regex, and the refusal's message is a literal in the pinned file. This
# capture runs the PINNED body over a recording errors bag, over the same
# seven probes the family's own audit used, so the port's grammar is pinned
# against an EXECUTION rather than against a reading.
#
# THE PROBES MATTER: Ruby's ^ and $ are LINE anchors, so a content with a
# newline is judged line by line, and the capture records which way each
# probe falls. The port's own pattern (/m) has to agree.
#
# THE STUBBING RULE: every double RECORDS. No double answers with a
# plausible value.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-recaptcha-validate-recaptcha-field-ruby.rb \
#     > fixtures/captured/recaptcha-validate-recaptcha-field-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

PinnedEvent.load_pinned_libs!

EVENT_FILE = "card-mod-recaptcha-0.20.0/set/abstract/recaptcha_setting.rb"

# The probe the pinned body runs on.
class RecaptchaProbe
  attr_accessor :content
  attr_reader :errors

  def initialize(content)
    @content = content
    @errors = RecordingErrors.new
  end
end

event_source = PinnedEvent.event(EVENT_FILE, :validate_recaptcha_field)

# The seven probes the family's own audit used (commit fa42552b).
CONTENTS = [
  "bad key!",
  "abc-DEF_123",
  "",
  "space here",
  "trailing\n",
  "bad\nkey",
  "abc\n\n",
]

results = CONTENTS.map do |content|
  probe = RecaptchaProbe.new(content)
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
  "row" => "reg-evt-mod-recaptcha-validate-recaptcha-field",
  "gemset" => "card-mod-recaptcha-0.20.0 (pinned)",
  "ruby_version" => RUBY_VERSION,
  "pinned_declaration" => event_source["declaration"],
  "pinned_declaration_line" => event_source["line"],
  "pinned_body" => event_source["body"],
  "probes" => results,
  "observable_effect" =>
    "a content the pinned grammar refuses adds ONE error whose attribute is :content and whose " \
    "message is the pinned literal 'invalid key'; a content it accepts adds nothing. Ruby's ^ " \
    "and $ are line anchors, so a content with a newline is judged line by line.",
}

puts JSON.pretty_generate(oracle)
puts

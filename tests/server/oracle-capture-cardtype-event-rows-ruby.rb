# oracle-capture-cardtype-event-rows-ruby.rb - the PINNED card gem's own cardtype
# event bodies, EXECUTED over recording doubles.
#
# WHAT THIS IS. Three register rows in the events family grade the port on ONE
# pinned event body each, and all three live in the same pinned file:
#
#   card-1.110.0/mod/core/set/type/cardtype.rb:15-17 check_for_cards_of_type
#     event :check_for_cards_of_type, after: :validate_delete do
#       errors.add :cardtype, t(:core_cards_exist, cardname: name) if cards_of_type_exist?
#     end
#   card-1.110.0/mod/core/set/type/cardtype.rb:19-24 check_for_cards_of_type_when_type_changed
#     event :check_for_cards_of_type_when_type_changed,
#           :validate, changing: :type, when: :was_cardtype? do
#       if cards_of_type_exist?
#         errors.add :cardtype, t(:core_error_cant_alter, name: name_before_act)
#       end
#     end
#   card-1.110.0/mod/core/set/type/cardtype.rb:26-30 validate_cardtype_name
#     event :validate_cardtype_name, :validate, on: :save, changed: :name do
#       if %r{[<>/]}.match?(name)
#         errors.add :name, t(:core_error_invalid_character_in_cardtype, banned: "<, >, /")
#       end
#     end
#
# The capture EXECUTES those bytes (extracted BY LINE from the pinned gemset,
# so the executed text is the gem's own and not a transcription) over
# recording doubles, and records what the body ASKED FOR: the errors it
# added, with the attribute and the message the PINNED locale produced.
#
# THE STUBBING RULE (the shared harness's rule): every double RECORDS. The
# one collaborator the bodies consult for their decision, cards_of_type_exist?,
# is answered by the SCENARIO the capture states, and the answer is recorded
# with the scenario's name, so a reader sees which scenario produced which
# error.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-cardtype-event-rows-ruby.rb <row-slug> \
#     > fixtures/captured/<row-slug>-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

EVENT_FILE = "card-1.110.0/mod/core/set/type/cardtype.rb"
LOCALE_FILE = "card-1.110.0/mod/core/config/locales/en.yml"

SLUG = ARGV[0]
abort("usage: ruby oracle-capture-cardtype-event-rows-ruby.rb <row-slug>") if SLUG.nil? || SLUG.empty?

PinnedEvent.load_pinned_libs!
LOCALE = PinnedEvent.locale(LOCALE_FILE, "en")

# The card-side probe: the collaborators the pinned bodies reach. Every one
# of them RECORDS; nothing is answered with a plausible value.
class CardtypeProbe
  include RecordingCalls

  attr_reader :scenario

  def initialize(scenario, name:, name_before_act:, cards_of_type_exist:)
    @scenario = scenario
    @name = name
    @name_before_act = name_before_act
    @cards_of_type_exist = cards_of_type_exist
    @errors = RecordingErrors.new
  end

  def errors
    @errors
  end

  # the pinned locale's own text, interpolated the way Ruby's %-format does.
  def t(key, args = {})
    text = LOCALE[key.to_s]
    raise "no locale token #{key}" if text.nil?

    args.nil? || args.empty? ? text : text % args
  end

  def name
    @name
  end

  def name_before_act
    @name_before_act
  end

  # the one decision the bodies consult. The answer is the SCENARIO's, and it
  # is recorded so the capture says which scenario produced which error.
  def cards_of_type_exist?
    record_call("cards_of_type_exist?", @cards_of_type_exist)
    @cards_of_type_exist
  end
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

# One row's capture: the pinned declaration and body, the scenarios, and what
# each scenario recorded.
def capture(slug, event_name, scenarios)
  event_source = pinned_event(EVENT_FILE, event_name)
  probes = scenarios.map do |scenario|
    probe = CardtypeProbe.new(
      scenario["name"],
      name: scenario["name"],
        name_before_act: scenario["name_before_act"] || scenario["name"],
      cards_of_type_exist: scenario["cards_of_type_exist"],
    )
    define_event_body(probe, event_source)
    outcome = PinnedEvent.call_event_body(probe)
    {
      "scenario" => scenario["name"],
      "cards_of_type_exist" => scenario["cards_of_type_exist"],
      "errors_added" => probe.errors.added,
      "calls" => probe.calls,
      "outcome" => outcome,
    }
  end
  {
    "row" => slug,
    "event" => event_name,
    "pinned_file" => EVENT_FILE,
    "pinned_declaration" => event_source["declaration"],
    "pinned_declaration_line" => event_source["line"],
    "pinned_body" => event_source["body"],
    "pinned_body_lines" => event_source["body_lines"],
    "locale_file" => LOCALE_FILE,
    "scenarios" => probes,
  }
end

CARDTYPE_SCENARIOS = [
  {
    "name" => "Cardtype",
    "name_before_act" => "Cardtype",
    "cards_of_type_exist" => true,
  },
  {
    "name" => "Cardtype",
    "name_before_act" => "Cardtype",
    "cards_of_type_exist" => false,
  },
].freeze

NAME_SCENARIOS = [
  { "name" => "Bad/Name", "name_before_act" => "Bad/Name", "cards_of_type_exist" => true },
  { "name" => "Good Name", "name_before_act" => "Good Name", "cards_of_type_exist" => true },
].freeze

CAPTURES = {
  "check-for-cards-of-type" => ["check_for_cards_of_type", CARDTYPE_SCENARIOS],
  "check-for-cards-of-type-when-type-changed" => [
    "check_for_cards_of_type_when_type_changed",
    CARDTYPE_SCENARIOS,
  ],
  "validate-cardtype-name" => ["validate_cardtype_name", NAME_SCENARIOS],
}.freeze

entry = CAPTURES[SLUG]
abort("no capture for slug #{SLUG}; known: #{CAPTURES.keys.join(", ")}") if entry.nil?

puts JSON.pretty_generate(capture(SLUG, entry[0], entry[1]))

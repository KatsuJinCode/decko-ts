# oracle-capture-core-event-rows-ruby.rb - the PINNED card gem's own core event
# bodies, EXECUTED over recording doubles.
#
# WHAT THIS IS. Three register rows in the events family grade the port on ONE
# pinned event body each:
#
#   card-1.110.0/mod/core/set/all/trash.rb:29-44 validate_delete
#   card-1.110.0/mod/core/set/all/type.rb:17-24 validate_type
#   card-1.110.0/mod/core/set/self/admin.rb:24-38 admin_tasks
#
# The capture EXECUTES those bytes (extracted BY LINE from the pinned gemset,
# so the executed text is the gem's own and not a transcription) over
# recording doubles, and records what the body ASKED FOR: the errors it
# added (with the PINNED locale's own text), the calls it made, and the
# outcome it produced (a raise, or an abort).
#
# THE STUBBING RULE (the shared harness's rule): every double RECORDS. The
# collaborators the bodies consult for their decisions are answered by the
# SCENARIO the capture states, and each answer is recorded with the
# scenario's name, so a reader sees which scenario produced which error.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-core-event-rows-ruby.rb <row-slug> \
#     > fixtures/captured/<row-slug>-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The probe list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-event-bodies-ruby"

PinnedEvent.load_pinned_libs!
require "active_support/core_ext/object/blank" # the pinned `codename.blank?`

LOCALE_FILE = "card-1.110.0/mod/core/config/locales/en.yml"
LOCALE = PinnedEvent.locale(LOCALE_FILE, "en")

SLUG = ARGV[0]
abort("usage: ruby oracle-capture-core-event-rows-ruby.rb <row-slug>") if SLUG.nil? || SLUG.empty?

# The pinned deck's error class. The body raises it by name, so the capture
# needs it to exist; it carries no behaviour of its own. The shared harness
# has already opened Card::Error as a class, so it is reopened the same way.
class Card
  class Error
    class PermissionDenied < Error; end

    # the pinned abort error (card-1.110.0/lib/card/error.rb:113-123): it
    # carries the STATUS the abort named, which is what the save's
    # abortable wrapper reads.
    class Abort < Error
      attr_reader :status

      def initialize(status, msg = "")
        @status = status
        super(msg)
      end
    end
  end
end

# The pinned deck's per-request environment. The body reads Env.params.
module Env
  module_function

  def params
    @params ||= {}
  end

  def params=(value)
    @params = value
  end
end

# The pinned deck's permission proxy. The body asks Auth.always_ok?.
module Auth
  module_function

  def always_ok?
    @always_ok == true
  end

  def always_ok=(value)
    @always_ok = value
  end
end

# The card-side probe: the collaborators the pinned bodies reach.
class CoreProbe
  include RecordingCalls

  attr_reader :scenario, :errors

  def initialize(scenario, **attrs)
    @scenario = scenario
    @attrs = attrs
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
    @attrs[:name]
  end

  def codename
    @attrs[:codename]
  end

  def compound?
    record_call("compound?", @attrs[:compound])
    @attrs[:compound] == true
  end

  def left
    @attrs[:left]
  end

  def right
    @attrs[:right]
  end

  def account
    @attrs[:account]
  end

  def has_edits?
    record_call("has_edits?", @attrs[:has_edits])
    @attrs[:has_edits] == true
  end

  def type_name
    @attrs[:type_name]
  end

  def type_id
    @attrs[:type_id]
  end

  def structure
    @attrs[:structure]
  end

  # the basket the admin body reads: basket[:tasks]
  def basket
    @attrs[:basket] || {}
  end

  # the admin body's runner call. It RECORDS the task and the task config it
  # was handed, and answers nothing else.
  def run_task_from_task_basket(task, task_config)
    record_call("run_task_from_task_basket", task, task_config)
    nil
  end

  # the deck's director, which the pinned abort method calls before it
  # raises. The double RECORDS the call and answers nothing.
  def director
    @director ||= DirectorProbe.new
  end

  def to_s
    @attrs[:name].to_s
  end
end

# The deck's director: the pinned abort method calls director.abort.
class DirectorProbe
  include RecordingCalls

  def abort
    record_call("director.abort")
    nil
  end
end

# The rule card's side: the body reads left.codename and right.codename.
Side = Struct.new(:codename)

# The structure rule card: assigns_type?, type_id, type_name.
Structure = Struct.new(:assigns_type, :type_id, :type_name) do
  def assigns_type?
    assigns_type
  end
end

# The body is called the way the rig calls it, and the outcome records the
# abort STATUS as well: the pinned abort raises Card::Error::Abort, whose
# status is what the save's abortable wrapper reads (result.rb:41-58).
def call_with_abort_status(probe)
  probe.public_send(:__pinned_event_body__)
  { "raised" => nil }
rescue Card::Error::Abort => e
  { "raised" => e.class.name, "status" => e.status.to_s, "message" => e.message }
rescue SystemExit => e
  { "raised" => "SystemExit", "status" => e.status.to_s }
rescue StandardError => e
  { "raised" => e.class.name, "message" => e.message, "backtrace" => (e.backtrace || []).first(3) }
end

def capture(slug, event_file, event_name, scenarios)
  event_source = PinnedEvent.event(event_file, event_name)
  probes = scenarios.map do |scenario|
    Env.params = symbol_basket(scenario["env_params"] || {})
    Auth.always_ok = scenario["always_ok"] == true
    probe_attrs = scenario.fetch("probe", {}).each_with_object({}) { |(k, v), out| out[k.to_sym] = v }
    probe_attrs[:basket] = symbol_basket(probe_attrs[:basket]) if probe_attrs[:basket].is_a?(Hash)
    probe = CoreProbe.new(scenario["name"], **probe_attrs)
    PinnedEvent.define_event_body(probe, event_source)
    if event_name == "admin_tasks"
      # the pinned abort method (mod/core/set/all/result.rb:19-28) is the
      # deck's own, not Kernel#abort: it raises Card::Error::Abort with the
      # status it was given.
      abort_source = PinnedEvent.method("card-1.110.0/mod/core/set/all/result.rb", "abort")
      # the pinned SIGNATURE and body, both taken from the pinned file, so
      # the method the body calls is the gem's own.
      abort_declaration = PinnedEvent.pinned_lines(abort_source["file"]).find do |line|
        line["line"] == abort_source["line"]
      end["text"]
      probe.singleton_class.class_eval(
        "#{abort_declaration}\n#{abort_source["body"]}\nend",
        abort_source["file"],
        abort_source["line"]
      )
    end
    outcome = call_with_abort_status(probe)
    {
      "scenario" => scenario["name"],
      "probe" => scenario["probe"],
      "env_params" => scenario["env_params"] || {},
      "always_ok" => Auth.always_ok?,
      "errors_added" => probe.errors.added,
      "calls" => probe.calls,
      "outcome" => outcome,
    }
  end
  {
    "row" => slug,
    "event" => event_name,
    "pinned_file" => event_file,
    "pinned_declaration" => event_source["declaration"],
    "pinned_declaration_line" => event_source["line"],
    "pinned_body" => event_source["body"],
    "pinned_body_lines" => event_source["body_lines"],
    "locale_file" => LOCALE_FILE,
    "scenarios" => probes,
  }
end

TRASH_FILE = "card-1.110.0/mod/core/set/all/trash.rb"
TYPE_FILE = "card-1.110.0/mod/core/set/all/type.rb"
ADMIN_FILE = "card-1.110.0/mod/core/set/self/admin.rb"

TRASH_SCENARIOS = [
  {
    "name" => "a system card (codename set)",
    "probe" => { "name" => "Decko", "codename" => "decko", "compound" => false },
  },
  {
    "name" => "an indestructible all-rule",
    "probe" => {
      "name" => "Default+Style",
      "codename" => nil,
      "compound" => true,
      "left" => { "codename" => "all" },
      "right" => { "codename" => "default" },
    },
  },
  {
    "name" => "a holder with edits",
    "probe" => {
      "name" => "Joe User+Account",
      "codename" => nil,
      "compound" => false,
      "account" => { "id" => 7 },
      "has_edits" => true,
    },
  },
  {
    "name" => "a plain card",
    "probe" => { "name" => "Plain Card", "codename" => nil, "compound" => false },
  },
].freeze

TYPE_SCENARIOS = [
  {
    "name" => "no such type",
    "probe" => {
      "name" => "Plain Card",
      "type_name" => nil,
      "type_id" => 999,
      "structure" => nil,
    },
  },
  {
    "name" => "a structured field away from the rule card's type",
    "probe" => {
      "name" => "Field+Structure",
      "type_name" => "RichText",
      "type_id" => 3,
      "structure" => { "assigns_type" => true, "type_id" => 7, "type_name" => "RichText" },
    },
  },
  {
    "name" => "a structured field onto the rule card's type",
    "probe" => {
      "name" => "Field+Structure",
      "type_name" => "RichText",
      "type_id" => 7,
      "structure" => { "assigns_type" => true, "type_id" => 7, "type_name" => "RichText" },
    },
  },
].freeze

ADMIN_SCENARIOS = [
  {
    "name" => "a task-named update by an always-ok actor",
    "env_params" => { "task" => "clear_cache" },
    "always_ok" => true,
    "probe" => {
      "name" => "Decko",
      # the basket's task keys are SYMBOLS in the pinned deck (the body looks
      # the task up with the symbol Env.params[:task]&.to_sym produced).
      "basket" => { "tasks" => { "clear_cache" => { "kind" => "cache" } } },
    },
  },
  {
    "name" => "a task-named update by an actor who is not always-ok",
    "env_params" => { "task" => "clear_cache" },
    "always_ok" => false,
    "probe" => {
      "name" => "Decko",
      "basket" => { "tasks" => { "clear_cache" => { "kind" => "cache" } } },
    },
  },
  {
    "name" => "an update with no task named",
    "env_params" => {},
    "always_ok" => true,
    "probe" => { "name" => "Decko", "basket" => { "tasks" => { "clear_cache" => { "kind" => "cache" } } } },
  },
].freeze

# The basket the admin body reads is keyed by symbols (basket[:tasks][task]),
# so the probe's basket is built with symbol keys. The recorded form is the
# JSON one; the symbol keys are named in the capture's own note.
def symbol_basket(basket)
  return basket unless basket.is_a?(Hash)

  basket.each_with_object({}) do |(key, value), out|
    out[key.to_sym] = value.is_a?(Hash) ? symbol_basket(value) : value
  end
end

CAPTURES = {
  "validate-delete" => [TRASH_FILE, "validate_delete", TRASH_SCENARIOS],
  "validate-type" => [TYPE_FILE, "validate_type", TYPE_SCENARIOS],
  "admin-tasks" => [ADMIN_FILE, "admin_tasks", ADMIN_SCENARIOS],
}.freeze

entry = CAPTURES[SLUG]
abort("no capture for slug #{SLUG}; known: #{CAPTURES.keys.join(", ")}") if entry.nil?

# The structure scenarios carry their structure as a plain hash; the body
# calls assigns_type? on it, so it becomes the probe's own struct.
scenarios = entry[2].map do |scenario|
  probe = scenario["probe"].dup
  if probe["structure"].is_a?(Hash)
    probe["structure"] = Structure.new(
      probe["structure"]["assigns_type"],
      probe["structure"]["type_id"],
      probe["structure"]["type_name"],
    )
  end
  if probe["left"].is_a?(Hash)
    # the pinned body compares left.codename with the SYMBOL :all, so the
    # left side's codename is a symbol here.
    probe["left"] = Side.new(probe["left"]["codename"].to_sym)
  end
  if probe["right"].is_a?(Hash)
    probe["right"] = Side.new(probe["right"]["codename"])
  end
  scenario.merge("probe" => probe)
end

puts JSON.pretty_generate(capture(SLUG, entry[0], entry[1], scenarios))

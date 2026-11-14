# oracle-capture-register-events-callback-order-ruby.rb - the ORDER
# observation rig for the events family: it executes the PINNED card gem's
# own event registration machinery over the PINNED set files' own `event`
# declarations, and records the order the callbacks fire in.
#
# WHAT THIS IS. A body may move into the port's dispatch only if the port's
# order equals Ruby's. Ruby's order was never OBSERVED: it comes from
# ActiveSupport::Callbacks, whose `prepend: true` chain semantics decide
# it (callbacks.rb:14-19 sets every event callback with prepend: true).
# This rig loads the PINNED activesupport and the PINNED card gem's own
# set/event machinery, feeds it the PINNED set files' own declarations, and
# RECORDS what order the callbacks fire in.
#
# THE STUBBING RULE (the shared harness's own rule): every stub RECORDS
# what it replaced. The stubs here are the four things the pinned
# machinery touches that need a Rails-free deck: the logger
# (log_event_call), the integration error rescue (rescuing_if_integration),
# the dirty options (Api::OPTIONS), and the applicability predicate
# (event_applies?, whose gates are a separate question from the ORDER).
# None of them can change the chain order; the capture says so.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-register-events-callback-order-ruby.rb \
#     > fixtures/captured/register-events-callback-order-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a
# trailing newline. The file list and the stage list are read out of the
# pinned gem, so a re-run on the same gemset is byte-stable.

require "json"
# The stdlib Set, before the pinned gems go on the load path: the card
# gem's own lib/card/set.rb would answer a bare `require "set"` once the
# gemset is loaded (load_pinned_libs! puts lib/card on the path).
require "set"
require_relative "oracle-capture-pinned-event-bodies-ruby"

PinnedEvent.load_pinned_libs!

# Only the pieces the pinned machinery touches: the whole of active_support
# pulls i18n, which reaches the pinned card gem's lib/card/set.rb and fails
# on the deck the pinned gem cannot boot here.
require "active_support/core_ext/array/wrap"
require "active_support/core_ext/object/inclusion"
require "active_support/callbacks"

GEM = "card-1.110.0"

# ---------------------------------------------------------------------------
# the stubs the pinned machinery needs, and what each one replaced
# ---------------------------------------------------------------------------

STUBS = []

# The logger: log_event_call writes one debug line per event call
# (set/event.rb:170-172). The ORDER does not depend on it.
class NullLogger
  def debug(*) = nil
  def info(*) = nil
  def warn(*) = nil
  def error(*) = nil
end

module Rails
  def self.logger
    @logger ||= NullLogger.new
  end
end
STUBS << "Rails.logger: a null logger (set/event.rb:170-172's debug line)"

# The integration error rescue: rescuing_if_integration wraps an
# integration event's body in Error.rescue_card (set/event.rb:165-167).
# The ORDER does not depend on it.
class Card
  class Error < StandardError
    def self.rescue_card(_card)
      yield
    end
  end
end
STUBS << "Card::Error.rescue_card: a pass-through (set/event.rb:165-167)"

# The dirty options: Api::OPTIONS lists them at load time (event.rb:50).
class Card
  module Dirty
    def self.dirty_options
      %i[name content db_content type type_id left_id right_id codename trash]
    end
  end
end
STUBS << "Card::Dirty.dirty_options: the changed: field list (event.rb:50)"

# The applicability predicate: set_callback's `if:` gate asks the card
# whether the event applies (callbacks.rb:14-19). The gates are a separate
# question from the ORDER; every event is made applicable here so the
# capture shows the chain order alone.
class Card
  def event_applies?(_event) = true
  def name = "Stub Card"
  def id = 1
end
STUBS << "Card#event_applies?: always true (callbacks.rb:14-19's if: gate)"
STUBS << "Card#name / Card#id: a stub card's own name and id (set/event.rb:171)"

class Card
  # ActiveSupport::Callbacks' ClassMethods (define_callbacks, set_callback)
  # come with `include`, and the instance side (run_callbacks) with it too.
  include ActiveSupport::Callbacks
end

# The delayed job base class: the pinned delayed_event.rb subclasses it at
# load time (delayed_event.rb:57). The ORDER does not depend on it.
unless defined?(Cardio::Job)
  Cardio.const_set(:Job, Class.new do
    def self.perform_later(*) = nil
  end)
end
STUBS << "Cardio::Job: an empty base class (delayed_event.rb:57)"

# ---------------------------------------------------------------------------
# the pinned event machinery
# ---------------------------------------------------------------------------

MACHINERY = %w[
  lib/card/set/event/delayed_event.rb
  lib/card/set/event/options.rb
  lib/card/set/event/callbacks.rb
  lib/card/set/event.rb
].freeze

MACHINERY.each do |relative|
  require File.join(PinnedEvent.gems_root, GEM, relative)
end

# ---------------------------------------------------------------------------
# the pinned load order: the set_pattern files, then each pattern's set
# files in path order (loader.rb's each_file_in_dir)
# ---------------------------------------------------------------------------

def pattern_dirs
  pattern_root = File.join(PinnedEvent.gems_root, GEM, "mod/core/set_pattern")
  Dir.glob(File.join(pattern_root, "*.rb")).sort.map do |pattern_file|
    name = File.basename(pattern_file, ".rb").sub(/\A\d+_/, "")
    dir = File.join(PinnedEvent.gems_root, GEM, "mod/core/set", name)
    next nil unless Dir.exist?(dir)

    files = Dir.glob(File.join(dir, "**", "*.rb")).sort.map do |path|
      path.sub(File.join(PinnedEvent.gems_root, GEM, "mod/core/set/"), "").sub(/\.rb\z/, "")
    end
    { "pattern" => name, "set_files" => files }
  end.compact
end

# The pinned stage list (director/stages.rb:4-7), read out of the pinned
# file rather than transcribed.
def stage_symbols
  source = PinnedEvent.read_pinned("#{GEM}/lib/card/director/stages.rb")
  literal = source[/SYMBOLS\s*=\s*(.*?)\.freeze/m, 1]
  raise "no SYMBOLS in stages.rb" if literal.nil?

  eval(literal) # rubocop:disable Security/Eval -- the pinned gem's own bytes
end

# ---------------------------------------------------------------------------
# the declarations: each pinned set file's own `event` lines, by line
# ---------------------------------------------------------------------------

# Split a declaration's argument text at its top-level commas, so the
# pinned option text can be handed to the pinned registration as written.
def split_arguments(text)
  parts = []
  depth = 0
  current = +""
  text.each_char do |char|
    case char
    when "[", "(", "{" then depth += 1
    when "]", ")", "}" then depth -= 1
    end
    if char == "," && depth.zero?
      parts << current.strip
      current = +""
    else
      current << char
    end
  end
  parts << current.strip unless current.strip.empty?
  parts
end

def declarations_of(relative)
  lines = PinnedEvent.read_pinned(relative).lines
  found = []
  index = 0
  while index < lines.length
    line = lines[index].chomp
    unless /\Aevent\s+/.match?(line)
      index += 1
      next
    end
    start = index + 1
    text = line
    # A declaration may CONTINUE on the next lines (cardtype.rb:19-20:
    # `event :check_for_cards_of_type_when_type_changed,` then
    # `:validate, changing: :type, when: :was_cardtype? do`). The
    # declaration is complete when the block's `do` closes it.
    while !/\bdo\s*\z/.match?(text) && index + 1 < lines.length
      index += 1
      text = "#{text} #{lines[index].chomp}"
    end
    found << {
      "line" => start,
      "declaration" => text,
      "arguments" => text.sub(/\Aevent\s+/, ""),
    }
    index += 1
  end
  found
end

# ---------------------------------------------------------------------------
# the run: register every declaration with the PINNED machinery, then run
# every stage's chain and record the order
# ---------------------------------------------------------------------------

order = []
registered = []
per_pattern = pattern_dirs

# The stage chains, created the way the pinned director creates them
# (director/stages.rb:9-13: `Card.define_callbacks "#{stage}_stage",
# "#{stage}_final_stage"` for every stage symbol). The pinned director
# cannot be loaded here (it needs the deck), so the rig makes the same
# chains from the pinned SYMBOLS list.
stages = stage_symbols
stages.each do |stage|
  Card.define_callbacks "#{stage}_stage", "#{stage}_final_stage"
end

per_pattern.each do |pattern|
  pattern["set_files"].each do |set_file|
    relative = "#{GEM}/mod/core/set/#{set_file}.rb"
    declarations_of(relative).each do |declaration|
      arguments = split_arguments(declaration["arguments"].sub(/\s+do\s*\z/, ""))
      name = eval(arguments[0]) # rubocop:disable Security/Eval -- the pinned bytes
      stage = nil
      options_text = arguments[1..] || []
      if options_text.first&.match?(/\A:[a-z_]+\z/)
        stage = eval(options_text.shift) # rubocop:disable Security/Eval
      end
      options = eval("{#{options_text.join(", ")}}") # rubocop:disable Security/Eval
      # The set module: a MODULE that includes the pinned API, exactly the
      # shape a pinned set file's module has (the API's `event` is an
      # instance method of the module; `extend` puts it on the module
      # itself, so the call's self IS the set module, as in Ruby).
      set_module = Module.new do
        include Card::Set::Event::Api
        extend Card::Set::Event::Api
      end
      event_name = name
      set_module.event(name, *(stage.nil? ? [options] : [stage, options])) { order << event_name.to_s }
      Card.include(set_module)
      registered << {
        "set_file" => set_file,
        "pattern" => pattern["pattern"],
        "line" => declaration["line"],
        "declaration" => declaration["declaration"],
        "event" => name.to_s,
        "stage" => stage&.to_s,
        "before" => options[:before]&.to_s,
        "after" => options[:after]&.to_s,
      }
    end
  end
end

stage_orders = {}
stages.each do |stage|
  order.clear
  card = Card.new
  card.run_callbacks :"#{stage}_stage"
  stage_orders[stage.to_s] = order.dup
  order.clear
  card.run_callbacks :"#{stage}_final_stage"
  stage_orders["#{stage}_final_stage"] = order.dup
end

capture = {
  "row" => "callback-order",
  "gem" => GEM,
  "executed" => true,
  "rig" => "tests/server/oracle-capture-register-events-callback-order-ruby.rb",
  "pinned_machinery" => MACHINERY,
  "stubs" => STUBS,
  "stage_symbols" => stages.map(&:to_s),
  "load_order" => per_pattern.map { |pattern| pattern["set_files"] },
  "registered" => registered,
  "stage_orders" => stage_orders,
}

json = JSON.pretty_generate(capture)

# The capture's own path may be given as the first argument, so the rig can
# write the fixture itself (a re-run replaces the file in place; the shell
# redirect would not).
if ARGV[0] && !ARGV[0].empty?
  File.write(ARGV[0], "#{json}\n")
else
  puts json
end

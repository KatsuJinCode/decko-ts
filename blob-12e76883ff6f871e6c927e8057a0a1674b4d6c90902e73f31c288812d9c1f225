# oracle-capture-refresh-card-before-cud-ruby.rb - the PINNED DECK's own
# refresh_card before_action (rest.rb:68-70) and the before_action table it
# rides (card_controller.rb:20-25).
#
# WHY THIS SCRIPT EXISTS: the completeness register's B12 row grades the port
# on `refresh_card` - the one before_action that runs ONLY for the three
# write actions. The port's answer is structural (the register's own note:
# "PORTED (structurally)"), so what the capture has to establish is the
# PINNED side of the question:
#
#   1. WHICH ACTIONS REFRESH: the table says
#        before_action :refresh_card, only: %i[create update delete]
#      so the refresh runs for the three write actions and for NOTHING else
#      - not for a read, not for the asset arm.
#
#   2. WHEN IT RUNS: it is the LAST entry of the table, so it runs AFTER
#      load_card (the card is loaded first, then refreshed). That order is
#      the mechanism: the refresh re-reads the card the controller already
#      holds, so the write that follows acts on the CURRENT row.
#
#   3. WHAT IT DOES: `@card = card.refresh` - the card object is REPLACED
#      by the refresh's answer. The controller's card is not mutated in
#      place; a different object takes its place.
#
# WHAT THE RIG REACHES, stated exactly: the table, the per-action chains
# and the refresh ask all execute here over the recording doubles. The
# refresh's own answer is the rig's double (the pinned card gem's refresh
# is an ActiveRecord reload, and the rig has no database), so the capture
# records the ASK and the REPLACEMENT, not the reloaded row's bytes.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-refresh-card-before-cud-ruby.rb \
#     > fixtures/captured/refresh-card-before-cud-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The table and the case list are fixed, so a re-run on the same
# gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

# The PINNED DECK's own controller, loaded: the before_action table is
# captured by EXECUTING the pinned controller file against the rig's
# recording ActionController::Base.
before_actions = PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# The chain for one action: the before_actions that run for it, in the
# order the pinned table registers them.
def actions_for(before_actions, action)
  before_actions.select do |entry|
    (entry["only"].empty? || entry["only"].include?(action)) &&
      !entry["except"].include?(action)
  end.map { |entry| entry["name"] }
end

chains = %w[create update delete read asset].map do |action|
  { "action" => action, "chain" => actions_for(before_actions, action) }
end

# The card double whose refresh answers a DIFFERENT object, so the capture
# can see the controller's card being REPLACED.
class RefreshCardDouble < PinnedDeck::CardDouble
  attr_reader :replacement

  def refresh
    record(:refresh)
    @replacement = PinnedDeck::CardDouble.new(name: "#{name} (reloaded)")
    @replacement
  end
end

card = RefreshCardDouble.new(name: "Front")
harness = PinnedDeck::ControllerHarness.new(params: {}, card: card)
card_before = harness.card.name
error = nil
begin
  # refresh_card is private in the pinned module (rest.rb:29 `private`
  # precedes rest.rb:68), so the direct call goes through send - the pinned
  # body that runs is still the pinned body.
  harness.send(:refresh_card)
rescue StandardError => e
  error = "#{e.class}: #{e.message}"
end

refresh_row = {
  "label" => "the refresh ask: the card object is REPLACED by the refresh's answer",
  "error" => error,
  "cardCalls" => card.calls,
  "cardBefore" => card_before,
  "cardAfter" => harness.card.name,
  "replaced" => harness.card.equal?(card) == false
}

# The pinned sources, quoted with line numbers.
refresh_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                         .select { |row| row["line"].between?(68, 70) }
load_card_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                           .select { |row| row["line"].between?(49, 54) }
table_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller.rb")
                        .select { |row| row["line"].between?(20, 25) }

puts JSON.pretty_generate(
  "row" => "reg-routes-B12",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "beforeActionTable" => before_actions,
  "actionChains" => chains,
  "refreshAsk" => refresh_row,
  "rigArtifacts" => [
    "the refresh's own answer is the rig's double: the pinned card gem's refresh is an ActiveRecord reload and the rig has no database. The capture records the ASK (card.refresh) and the REPLACEMENT (a different object took the controller's card), not the reloaded row's bytes."
  ],
  "sources" => {
    "refresh" => refresh_source,
    "loadCard" => load_card_source,
    "beforeActionTable" => table_source
  }
)

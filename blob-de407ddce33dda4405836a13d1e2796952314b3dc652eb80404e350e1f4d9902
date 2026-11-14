# oracle-capture-record-as-main-ruby.rb - the PINNED DECK's own
# `record_as_main`, executed.
#
# WHY THIS SCRIPT EXISTS: the completeness register's B13 row grades the
# port on `record_as_main` (rest.rb:64-66, "Env.main_name from
# params[:main]"). The row's note named the method and the parameter but
# not the ANSWER, and the answer has one case a naive transliteration gets
# wrong: Ruby falls through on nil/false only, so an EMPTY `?main=` is the
# truthy empty string and the card's name is NOT the fallback. This
# capture measures the method over every case.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the method  decko-0.20.0/lib/card_controller/rest.rb:63-66
#                 # TODO: refactor this away this when new layout handling is ready
#                 def record_as_main
#                   Card::Env.main_name = params[:main] || card&.name || ""
#                 end
#
#   the call    decko-0.20.0/lib/card_controller/rest.rb:49-54
#                 def load_card
#                   @card = Card.uri_fetch params
#                   raise Card::Error::NotFound unless card
#
#                   record_as_main
#                 end
#               load_card's LAST statement, so it runs for every action that
#               loads a card and NOT for the shapes that never reach
#               load_card.
#
#   the table   decko-0.20.0/lib/card_controller.rb:20-25 - load_card runs
#               for every action except `asset`.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-record-as-main-ruby.rb \
#     > fixtures/captured/record-as-main-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!

# The PINNED DECK's own controller, loaded.
before_actions = PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

def actions_for(before_actions, action)
  before_actions.select do |entry|
    (entry["only"].empty? || entry["only"].include?(action)) &&
      !entry["except"].include?(action)
  end.map { |entry| entry["name"] }
end

# Run the PINNED record_as_main over one case and report what it recorded.
def run_record_as_main(params:, card_name:)
  Card::Env.main_name = nil

  # The card double with NO name stands in for the "no card" shape:
  # `card&.name` answers nil for a nil card and for a card with no name
  # alike, so the recorded answer is the same either way.
  card = PinnedDeck::CardDouble.new(name: card_name)
  harness = PinnedDeck::ControllerHarness.new(params: params, card: card)
  error = nil
  begin
    harness.send(:record_as_main)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end

  {
    "params" => params,
    "cardName" => card_name,
    "mainName" => Card::Env.main_name,
    "error" => error
  }
end

cases = {
  # The focal card the request declares.
  "paramPresent" => run_record_as_main(params: { main: "Branch" }, card_name: "Front"),
  # THE case: an empty ?main= is the truthy empty string in Ruby, so the
  # card's name is NOT the fallback.
  "paramEmpty" => run_record_as_main(params: { main: "" }, card_name: "Front"),
  # No param: the card's own name is the focal card.
  "paramAbsent" => run_record_as_main(params: {}, card_name: "Front"),
  # No param and no card: the empty string.
  "noParamNoCard" => run_record_as_main(params: {}, card_name: nil)
}

# The method's own source, quoted with line numbers.
method_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                           .select { |row| row["line"].between?(49, 66) }

puts JSON.pretty_generate(
  "row" => "reg-routes-B13",
  "gemset" => "decko-0.20.0 (pinned)",
  "cases" => cases,
  "methodSource" => method_source,
  "actionsForRead" => actions_for(before_actions, "read"),
  "actionsForAsset" => actions_for(before_actions, "asset"),
  "actionsForUpdate" => actions_for(before_actions, "update")
)

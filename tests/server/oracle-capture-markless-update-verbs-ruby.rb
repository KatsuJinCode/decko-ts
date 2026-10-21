# oracle-capture-markless-update-verbs-ruby.rb - the PINNED DECK's own
# markless update route pair, and the dispatch its two verbs ride.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A11 row grades the
# port on engine_routes.rb lines 29-30, `put "/" => "card#update"` and
# `patch "/" => "card#update"` - TWO registrations of the SAME action, one
# per verb. The row's subject is the pair itself: both verbs registered
# identically (the PUT/PATCH synonymy Rails' own verb set gives the form
# override its `_method=patch` shape), the update arm's before_action table
# (refresh_card included - a write re-reads the card after load), and the
# update action's two-branch dispatch. This capture measures all three, so
# the row's verdict rests on the pinned pair, not on a reading.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the routes decko-0.20.0/config/engine_routes.rb:29-30
#                put    "/" => "card#update"
#                patch  "/" => "card#update"
#              Orders 12 and 13, inside the markless write block (post 11,
#              delete 14). Two registrations, same action, same (lack of)
#              requirements - there is no verb-specific behavior anywhere in
#              the deck's controller.
#
#   the table decko-0.20.0/lib/card_controller.rb:20-25
#                update rides setup, authenticate, load_card, refresh_card
#                (refresh_card's only: %i[create update delete]).
#
#   the fetch card-1.110.0/lib/card/fetch/card_class.rb:106-121
#                params[:action] is "update", so the standard fetch runs:
#                mark = params[:mark] || card_opts[:name] - the body's card
#                name IS the mark; with neither, the EMPTY name.
#
#   the action decko-0.20.0/lib/card_controller/rest.rb:14-16
#                def update
#                  card.new_card? ? create : handle { card.update! params[:card]&.to_unsafe_h }
#                end
#              The update of a MISSING card IS a create (the C7 row's
#              measured chain); the update of a FOUND card asks
#              card.update! with the body's card hash.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-markless-update-verbs-ruby.rb \
#     > fixtures/captured/markless-update-verbs-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

# Rails' params hash answers to_unsafe_h (the update action reads it); the
# harness params are a plain hash, so the stand-in carries the one method
# (the C7 capture's shape).
class CardParams < Hash
  def to_unsafe_h
    self
  end
end

# The PINNED DECK's own route table, EXECUTED.
routes = PinnedDeck.route_table_executed
markless_routes = routes.select { |route| route["patterns"].include?("/") && route["order"].between?(11, 14) }
update_routes = markless_routes.select { |route| route["action"] == "card#update" }
raise "the markless update route pair was not found in the pinned route table" if update_routes.length != 2

# The PINNED DECK's own controller, loaded.
before_actions = PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

def actions_for(before_actions, action)
  before_actions.select do |entry|
    (entry["only"].empty? || entry["only"].include?(action)) &&
      !entry["except"].include?(action)
  end.map { |entry| entry["name"] }
end

update_actions = actions_for(before_actions, "update")

# The PINNED DECK's own fetch, executed over a recording double.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class UpdateFetchHarness
  include Card::Fetch::CardClass

  attr_reader :fetch_asks

  def initialize
    @fetch_asks = []
  end

  def fetch(mark, **opts)
    @fetch_asks << {
      "mark" => mark,
      "new" => opts[:new],
      "skipModules" => opts[:skip_modules],
      "lookInTrash" => opts[:look_in_trash]
    }
    nil
  end
end

def update_fetch_case(label, params)
  harness = UpdateFetchHarness.new
  error = nil
  begin
    harness.uri_fetch(params)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "params" => params,
    "fetchAsks" => harness.fetch_asks,
    "error" => error
  }
end

fetch_rows = [
  update_fetch_case("the body's card hash IS the mark",
                    { action: "update", card: { name: "Target" } }),
  update_fetch_case("body-less: the EMPTY name is the mark",
                    { action: "update" })
]

# The PINNED DECK's own update action, executed over both new_card? arms.
def update_action_case(label, new_card, params)
  card = PinnedDeck::CardDouble.new(name: "Target", new_card: new_card)
  params = params.transform_values { |value| value.is_a?(Hash) ? CardParams[value] : value }
  harness = PinnedDeck::ControllerHarness.new(params: params, card: card)
  error = nil
  begin
    harness.update
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "newCard" => new_card,
    "params" => params,
    "error" => error,
    "cardCalls" => card.calls,
    "redirected" => harness.redirected
  }
end

action_rows = [
  update_action_case("a FOUND card: card.update! with the body's card hash",
                     false, { card: { name: "Target", content: "new body" } }),
  update_action_case("a MISSING card: the branch IS create (card.save!)",
                     true, { card: { name: "Target" } })
]

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"].between?(29, 30) }
update_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(14, 16) }
refresh_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                           .select { |row| row["line"].between?(68, 70) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A11",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "updateRoutes" => update_routes,
  "marklessWriteRoutes" => markless_routes,
  "beforeActionsForUpdate" => update_actions,
  "uriFetch" => fetch_rows,
  "updateAction" => action_rows,
  "sources" => {
    "route" => route_source,
    "update" => update_source,
    "refreshCard" => refresh_source
  }
)

# oracle-capture-markless-create-route-ruby.rb - the PINNED DECK's own
# markless create route, and the fetch and save a POST / request rides.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A10 row grades the
# port on engine_routes.rb line 28, `post "/" => "card#create"`. The row's
# subject is the CREATE arm's own chain: the before_action table's shape for
# create (no load_mark - a write never resolves the implicit mark), the
# uri_fetch branch that builds a NEW card instead of fetching (params
# [:action] == "create" - the deck's own FIXME explains why: a fetch would
# let the save act like a normal update), and the create action's
# handle { card.save! }. This capture measures all three, so the row's
# verdict rests on the pinned arm, not on a reading.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route  decko-0.20.0/config/engine_routes.rb:28
#                post   "/" => "card#create"
#              The first of the four markless write arms (orders 11-14).
#
#   the table  decko-0.20.0/lib/card_controller.rb:20-25
#                load_mark runs ONLY for :read; refresh_card runs for
#                create|update|delete. A create's steps: setup,
#                authenticate, load_card, refresh_card.
#
#   the fetch  card-1.110.0/lib/card/fetch/card_class.rb:106-115
#                def uri_fetch params
#                  card_opts = uri_fetch_opts params
#                  if params[:action] == "create"
#                    Card.new card_opts          # <- the create branch
#                  else
#                    standard_uri_fetch params, card_opts
#                  end
#                end
#              The name comes from the body's card hash (mark_from_card_
#              hash is load_mark's business, but uri_fetch_opts reads
#              params[:card][:name] the same way); with neither,
#              Name[nil] is the EMPTY name.
#
#   the action decko-0.20.0/lib/card_controller/rest.rb:6-8, 74-77
#                def create
#                  handle { card.save! }
#                end
#                def handle
#                  Card::Env.success card.name
#                  yield ? cud_success : raise(Card::Error::UserError)
#                end
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-markless-create-route-ruby.rb \
#     > fixtures/captured/markless-create-route-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

# The PINNED DECK's own route table, EXECUTED.
routes = PinnedDeck.route_table_executed
markless_routes = routes.select { |route| route["patterns"].include?("/") && route["order"].between?(11, 14) }
create_route = markless_routes.find { |route| route["verb"] == "post" }
raise "the markless create route was not found in the pinned route table" if create_route.nil?

# The PINNED DECK's own controller, loaded.
before_actions = PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

def actions_for(before_actions, action)
  before_actions.select do |entry|
    (entry["only"].empty? || entry["only"].include?(action)) &&
      !entry["except"].include?(action)
  end.map { |entry| entry["name"] }
end

create_actions = actions_for(before_actions, "create")

# The PINNED DECK's own fetch, executed over recording doubles. The create
# branch's Card.new is recorded on the Card singleton (the ask is the opts
# hash the pinned method built), never replaced with an answer.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class << Card
  attr_reader :new_asks

  def new(card_opts = {})
    (@new_asks ||= []) << card_opts
    :new_card_recorded
  end
end

def create_fetch_case(label, params)
  Card.instance_variable_set(:@new_asks, nil)
  harness = Object.new
  harness.extend(Card::Fetch::CardClass)
  error = nil
  answer = nil
  begin
    answer = harness.uri_fetch(params)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "params" => params,
    "newAsks" => (Card.instance_variable_get(:@new_asks) || []),
    "answer" => answer,
    "error" => error
  }
end

fetch_rows = [
  create_fetch_case("the body's card hash names the new card",
                    { action: "create", card: { name: "Target", content: "body" } }),
  create_fetch_case("no body name: Name[nil] is the EMPTY name",
                    { action: "create" })
]

# The PINNED DECK's own create action, executed over the doubles.
def create_action_case(label, card_name)
  card = PinnedDeck::CardDouble.new(name: card_name)
  harness = PinnedDeck::ControllerHarness.new(params: { card: { name: card_name } }, card: card)
  error = nil
  begin
    harness.create
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "cardName" => card_name,
    "error" => error,
    "cardCalls" => card.calls,
    "redirected" => harness.redirected,
    "rendered" => harness.rendered
  }
end

action_rows = [
  create_action_case("the create action asks card.save! through handle", "Target"),
  create_action_case("an empty name reaches the same save ask (the engine's validation is not stood up here)", "")
]

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"] == 28 }
create_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(6, 8) }
handle_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(74, 77) }
uri_fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                             .select { |row| row["line"].between?(106, 115) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A10",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "createRoute" => create_route,
  "marklessWriteRoutes" => markless_routes,
  "beforeActionsForCreate" => create_actions,
  "uriFetch" => fetch_rows,
  "createAction" => action_rows,
  "sources" => {
    "route" => route_source,
    "create" => create_source,
    "handle" => handle_source,
    "uriFetch" => uri_fetch_source
  }
)

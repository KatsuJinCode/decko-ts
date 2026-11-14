# oracle-capture-get-action-routes-ruby.rb - the PINNED DECK's own GET action
# routes, and the pinned methods each one dispatches to.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A17 row grades the
# port on the five GET action alternatives
#
#   %w[create read update delete asset].each do |action|
#     get "(card)/#{action}(/:mark(.:format))" => "card", action: action
#   end
#
# The row's note did not say what those routes ANSWER, and the answer is
# not one thing: three of them are state-changing GETs (a plain link click
# saves or deletes a card) and two are reads. This capture measures the
# pinned routes, the pinned action methods and the pinned before_action
# table, so the port's half of the row (which spellings it admits) can be
# judged against the pinned deck.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the routes  decko-0.20.0/config/engine_routes.rb:40-43
#                 %w[create read update delete asset].each do |action|
#                   get "(card)/#{action}(/:mark(.:format))" => "card", action: action
#                 end
#               They are the deck's twentieth through twenty-fourth routes,
#               so they are matched BEFORE the generic ":mark/:view" arm
#               (line 51) and before the wildcard (line 54).
#
#   the actions decko-0.20.0/lib/card_controller/rest.rb:6-27
#                 def create  then handle { card.save! }
#                 def read    then show
#                 def update  card.new_card? ? create : handle { card.update! ... }
#                 def delete  then handle { card.delete! }
#                 def asset   render body: "Decko installation error: ...", status: 404
#
#   the table   decko-0.20.0/lib/card_controller.rb:20-25
#                 before_action :load_mark, only: [:read]
#                 before_action :load_action, only: [:read]
#                 before_action :refresh_card, only: %i[create update delete]
#                 before_action :setup, except: [:asset]
#                 before_action :authenticate, except: [:asset]
#                 before_action :load_card, except: [:asset]
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-get-action-routes-ruby.rb \
#     > fixtures/captured/get-action-routes-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"
require "active_support/core_ext/string/output_safety"

# The PINNED MOD's own format registry (card-mod-format's format files
# register themselves): the deck's dispatch asks it whether the requested
# format is registered.
registry = load_pinned_format_registry!

# The PINNED DECK's own route table, EXECUTED.
routes = PinnedDeck.route_table_executed
action_routes = routes.select { |route| route["requirements"]["action"] }
later_routes = routes.select { |route| [24, 25, 26, 27, 28].include?(route["order"]) }

# The PINNED DECK's own controller, loaded.
before_actions = PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

def actions_for(before_actions, action)
  before_actions.select do |entry|
    (entry["only"].empty? || entry["only"].include?(action)) &&
      !entry["except"].include?(action)
  end.map { |entry| entry["name"] }
end

action_rows = %w[read create update delete asset].map do |action|
  { "action" => action, "beforeActions" => actions_for(before_actions, action) }
end

# The request double: `request.format` is the format the request asked for.
FakeRequest = Struct.new(:format)

# The card params: Rails wraps the body's card hash in
# ActionController::Parameters, whose to_unsafe_h the deck's update calls
# (decko-0.20.0/lib/card_controller/rest.rb:15).
class CardParams < Hash
  def to_unsafe_h
    self
  end
end

def action_case(label, action, params: {}, new_card: false, card_name: "Front")
  card = PinnedDeck::CardDouble.new(name: card_name, new_card: new_card)
  harness = PinnedDeck::ControllerHarness.new(
    params: params,
    request: FakeRequest.new("html"),
    card: card,
  )
  error = nil
  begin
    harness.public_send(action)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "action" => action,
    "params" => params,
    "error" => error,
    "cardCalls" => card.calls,
    "cardAction" => card.action,
    "formatName" => card.format_name,
    "pageCalls" => card.page_calls,
    "rendered" => harness.rendered,
    "redirected" => harness.redirected
  }
end

action_method_rows = [
  action_case("the read action", "read", params: { mark: "Front" }),
  action_case("the create action", "create", params: { card: CardParams[{ "name" => "New" }] }),
  action_case("the update action on an existing card", "update", params: { card: CardParams[{ "name" => "Front" }] }),
  action_case("the update action on a missing card", "update", params: { card: CardParams[{ "name" => "New" }] }, new_card: true),
  action_case("the delete action", "delete", params: { mark: "Front" }),
  action_case("the asset action", "asset")
]

puts JSON.pretty_generate(
  "row" => "reg-routes-A17",
  "gemset" => "decko-0.20.0 + card-mod-format-0.20.0 (pinned)",
  "registeredFormats" => registry["registered"],
  "actionRoutes" => action_routes,
  "laterRoutes" => later_routes,
  "routeTableSize" => routes.length,
  "beforeActions" => before_actions,
  "actionsByAction" => action_rows,
  "actionMethods" => action_method_rows
)

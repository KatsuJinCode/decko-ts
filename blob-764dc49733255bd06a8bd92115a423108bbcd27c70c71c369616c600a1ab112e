# oracle-capture-typed-create-route-ruby.rb - the PINNED DECK's own typed
# create route, and the fetch branch its POST rides.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A13 row grades the
# port on engine_routes.rb line 33, `post "/type/:type" => "card#create"`.
# The route carries NO .:format capture - the WHOLE second segment is the
# type (Rails splits a format suffix only where the route declares the
# capture) - and the type reaches the create through uri_fetch_opts'
# ||=: the body's card hash type WINS, the URL segment is the fallback.
# This capture measures the registration, the precedence against the marked
# create route, and the executed fetch asks, so the row's verdict rests on
# the pinned arm, not on a reading.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:33
#                 post  "/type/:type" => "card#create"
#               Order 15, BEFORE the marked create (line 36, order 16), so
#               POST /type/<x> is the typed create, never a create of the
#               card named "type" at mark <x>.
#
#   the fetch   card-1.110.0/lib/card/fetch/card_class.rb:106-115, 128-133
#                 uri_fetch: params[:action] == "create" -> Card.new
#                 card_opts (the A10 branch);
#                 uri_fetch_opts: opts[:type] ||= params[:type] "for
#                 /new/:type shortcut" - the SAME mechanism serves this
#                 route; the body's card[type] wins over the segment.
#
#   the action  decko-0.20.0/lib/card_controller/rest.rb:6-8
#                 def create; handle { card.save! }; end
#               (The A10 row's measured action; quoted, not re-executed.)
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-typed-create-route-ruby.rb \
#     > fixtures/captured/typed-create-route-ruby-oracle.json
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
typed_index = routes.index { |route| route["patterns"].include?("/type/:type") && route["verb"] == "post" }
raise "the typed create route was not found in the pinned route table" if typed_index.nil?

typed_route = routes[typed_index]
marked_create = routes.find { |route| route["verb"] == "match" && route["action"] == "card#create" }

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

# The PINNED DECK's own fetch, executed over recording doubles: the create
# branch's Card.new ask is recorded on the Card singleton (the A10 shape).
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class << Card
  attr_reader :new_asks

  def new(card_opts = {})
    (@new_asks ||= []) << card_opts
    :new_card_recorded
  end
end

def typed_fetch_case(label, params)
  Card.instance_variable_set(:@new_asks, nil)
  harness = Object.new
  harness.extend(Card::Fetch::CardClass)
  error = nil
  begin
    harness.uri_fetch(params)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "params" => params,
    "newAsks" => (Card.instance_variable_get(:@new_asks) || []),
    "error" => error
  }
end

fetch_rows = [
  typed_fetch_case("the URL segment is the type, the name rides the body or the EMPTY name",
                   { action: "create", type: "Foo" }),
  typed_fetch_case("the body's card[type] WINS over the segment (the ||)",
                   { action: "create", type: "Foo", card: { type: "Bar", name: "Target" } }),
  typed_fetch_case("a suffixed segment stays IN the type: the route declares no .:format capture",
                   { action: "create", type: "Foo.json" })
]

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"].between?(33, 38) }
fetch_opts_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                              .select { |row| row["line"].between?(128, 133) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A13",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "typedCreateRoute" => typed_route,
  "markedCreateRoute" => marked_create,
  "beforeActionsForCreate" => create_actions,
  "uriFetch" => fetch_rows,
  "sources" => {
    "route" => route_source,
    "uriFetchOpts" => fetch_opts_source
  }
)

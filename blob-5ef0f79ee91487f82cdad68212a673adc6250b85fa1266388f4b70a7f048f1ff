# oracle-capture-markless-delete-route-ruby.rb - the PINNED DECK's own
# markless delete route, and the pinned methods that decide what it answers.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A12 row grades the
# port on `delete "/" => "card#delete"`. The row's note, and the port's own
# body for it, both say the markless write arms resolve the IMPLICIT mark
# (mark.rb's implicit_mark -> the *home rule). The PINNED controller's
# before_action table says otherwise: load_mark runs ONLY for the read
# action, so a write never reaches implicit_mark. This capture measures the
# pinned side so the row's verdict rests on the pinned table and the pinned
# fetch, not on a reading.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:27-31
#                 post   "/" => "card#create"
#                 put    "/" => "card#update"
#                 patch  "/" => "card#update"
#                 delete "/" => "card#delete"
#
#   the table   decko-0.20.0/lib/card_controller.rb:20-25
#                 before_action :setup, except: [:asset]
#                 before_action :authenticate, except: [:asset]
#                 before_action :load_mark, only: [:read]
#                 before_action :load_card, except: [:asset]
#                 before_action :load_action, only: [:read]
#                 before_action :refresh_card, only: %i[create update delete]
#
#   the mark    card-1.110.0/lib/card/fetch/card_class.rb:117-133
#                 def standard_uri_fetch params, card_opts
#                   mark = params[:mark] || card_opts[:name]
#                   card = fetch mark, new: card_opts, ...
#                 end
#                 def uri_fetch_opts params
#                   Env.hash(params[:card]).tap do |opts|
#                     opts[:type] ||= params[:type] if params[:type]
#                     opts[:name] ||= Name[params[:mark]]&.tr "_", " "
#                   end
#                 end
#               So a WRITE's mark is the URL mark or the body's card[name].
#               With neither, Name[nil] is the EMPTY name
#               (card-1.110.0/lib/card/name.rb:79), the fetch finds no card
#               (card-1.110.0/lib/card/fetch/results.rb:5-6 `return if
#               card.nil?`), and the controller raises the 404
#               (decko-0.20.0/lib/card_controller/rest.rb:49-54
#               `raise Card::Error::NotFound unless card`).
#
#   the action  decko-0.20.0/lib/card_controller/rest.rb:18-20
#                 def delete
#                   handle { card.delete! }
#                 end
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-markless-delete-route-ruby.rb \
#     > fixtures/captured/markless-delete-route-ruby-oracle.json
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
root_write_routes = routes.select { |route| route["patterns"].include?("/") && route["verb"] != "root" }
marked_write_routes = routes.select { |route| route["patterns"].include?(":mark(.:format)") }

# The PINNED DECK's own controller, loaded: its before_action table is the
# mechanism this row turns on.
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

# The PINNED DECK's own fetch options, executed.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class FetchHarness
  include Card::Fetch::CardClass
end

def fetch_opts_case(label, params)
  harness = FetchHarness.new
  {
    "label" => label,
    "params" => params,
    "opts" => harness.send(:uri_fetch_opts, params)
  }
end

fetch_rows = [
  fetch_opts_case("the body's card name", { card: { name: "Target" } }),
  fetch_opts_case("a URL mark", { mark: "My_Card" }),
  fetch_opts_case("neither: no mark and no card name", {})
]

# The PINNED DECK's own fetch result, executed: with no card there is no
# result, and the controller raises the 404 (rest.rb:51).
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/results.rb")

class FetchResultsHarness
  include Card::Fetch::Results

  def initialize(card)
    @card = card
  end

  attr_reader :card

  # The deck's own fetch options (card-1.110.0/lib/card/fetch/card_class.rb:
  # 121 `fetch mark, new: card_opts, skip_modules: true, ...`) - the result
  # card therefore does not include the set modules.
  def skip_modules?
    true
  end
end

fetch_result_rows = [
  {
    "label" => "no card found for the mark",
    "result" => FetchResultsHarness.new(nil).results.inspect
  },
  {
    "label" => "a card was found",
    "result" => FetchResultsHarness.new(PinnedDeck::CardDouble.new).results.class.name
  }
]

# The PINNED DECK's own delete action, executed.
delete_card = PinnedDeck::CardDouble.new(name: "Target")
delete_harness = PinnedDeck::ControllerHarness.new(params: { card: { name: "Target" } }, card: delete_card)
delete_error = nil
begin
  delete_harness.delete
rescue StandardError => e
  delete_error = "#{e.class}: #{e.message}"
end

# The pinned controller's own source for the two methods the row turns on.
rest_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
load_card_source = rest_source.select { |row| row["line"].between?(49, 54) }
delete_source = rest_source.select { |row| row["line"].between?(18, 20) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A12",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "rootWriteRoutes" => root_write_routes,
  "markedWriteRoutes" => marked_write_routes,
  "routeTableSize" => routes.length,
  "beforeActions" => before_actions,
  "actionsByAction" => action_rows,
  "fetchOptions" => fetch_rows,
  "fetchResults" => fetch_result_rows,
  "deleteAction" => {
    "error" => delete_error,
    "cardCalls" => delete_card.calls,
    "redirected" => delete_harness.redirected,
    "source" => delete_source
  },
  "loadCardSource" => load_card_source
)

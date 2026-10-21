# oracle-capture-root-route-ruby.rb - the PINNED DECK's own root route, and
# the read dispatch a GET / request rides.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A1 row grades the port
# on engine_routes.rb line 7, `root "card#read"` - GET / renders the home
# card. The register's note named the route but never asked the pinned deck
# what the root registration CARRIES (the recording Draw keeps the verb,
# the action and the registration ORDER - the order is the matching
# precedence) or what the pinned read asks the fetch for once load_mark has
# resolved the mark. This capture measures both, so the row's verdict rests
# on the pinned table and the pinned fetch, not on a reading.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:7
#                 root "card#read"
#               The FIRST registration in the deck's draw, so / matches the
#               root arm before every other route sees the path.
#
#   the table   decko-0.20.0/lib/card_controller.rb:20-25
#                 before_action :setup, except: [:asset]
#                 before_action :authenticate, except: [:asset]
#                 before_action :load_mark, only: [:read]
#                 before_action :load_card, except: [:asset]
#                 before_action :load_action, only: [:read]
#                 before_action :refresh_card, only: %i[create update delete]
#               The root arm dispatches card#read, so load_mark and
#               load_action both run for it.
#
#   the mark    decko-0.20.0/lib/card_controller/mark.rb:10-19
#                 interpret_mark(nil) -> implicit_mark -> home_mark
#                 (Card::Rule.global_setting(:home) || "Home")
#               The ladder's own arms are row B9's evidence
#               (fixtures/captured/implicit-mark-ruby-oracle.json, which the
#               setup branch raises in, and home-mark-ruby-oracle.json for
#               the fallback); this capture records only what the ROOT
#               request's mark resolution FEEDS the fetch.
#
#   the fetch   card-1.110.0/lib/card/fetch/card_class.rb:106-121
#                 def uri_fetch params
#                   card_opts = uri_fetch_opts params
#                   ... standard_uri_fetch params, card_opts
#                 end
#                 def standard_uri_fetch params, card_opts
#                   mark = params[:mark] || card_opts[:name]
#                   card = fetch mark, new: card_opts,
#                                      skip_modules: true,
#                                      look_in_trash: params[:look_in_trash]
#                   ...
#                 end
#               load_mark has already written the resolved mark into
#               params[:mark] (mark.rb:6-8), so the root request fetches
#               THAT mark - the home mark, or the ?mark= query's value.
#
#   the action  decko-0.20.0/lib/card_controller/rest.rb:10-12
#                 def read
#                   show
#                 end
#               show(nil) - the view comes from view_from_params
#               (rest.rb:106-109), the ?view=/?v= query, and not from the
#               route: the root arm carries no view.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-root-route-ruby.rb \
#     > fixtures/captured/root-route-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

# The PINNED DECK's own route table, EXECUTED. The root registration is the
# table's first entry; the neighbours quote the order context the read arms
# around it (the explicit file route and the standard page read).
routes = PinnedDeck.route_table_executed
root_route = routes[0]
raise "the pinned route table does not open with the root registration" unless root_route["verb"] == "root"

neighbours = routes.select { |route| route["patterns"].include?("/:mark(.:format)") }

# The PINNED DECK's own fetch, executed over a recording double: the ask is
# what the pinned method asked the fetch for, never the answer.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class RootFetchHarness
  include Card::Fetch::CardClass

  attr_reader :fetch_asks

  def initialize
    @fetch_asks = []
  end

  # standard_uri_fetch's fetch call (card_class.rb:116-119), recorded.
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

def root_fetch_case(label, params)
  harness = RootFetchHarness.new
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

# load_mark has written the resolved mark into params[:mark] before
# load_card runs (mark.rb:6-8), so the recorded asks carry the RESOLVED
# mark: the home mark for the settled deck, the query's mark for /?mark=.
uri_fetch_rows = [
  root_fetch_case("the settled root request: load_mark resolved the home mark",
                  { mark: "Home" }),
  root_fetch_case("the root request with a ?mark= query: the explicit mark",
                  { mark: "Target" })
]

# The PINNED DECK's own controller, loaded: the before_action table decides
# which of the controller's steps a GET / request rides.
before_actions = PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

def actions_for(before_actions, action)
  before_actions.select do |entry|
    (entry["only"].empty? || entry["only"].include?(action)) &&
      !entry["except"].include?(action)
  end.map { |entry| entry["name"] }
end

read_actions = actions_for(before_actions, "read")

# The PINNED read action's own view decision, executed: read calls
# show(nil) (rest.rb:10-12), so the rendered view is view_from_params'
# answer - the route carries no view, the query supplies it. The render
# chain BEHIND that answer is row A9's evidence (render_page executed over
# a FormatDouble in card-view-route-ruby-oracle.json); show's own
# load_format step (response.rb:93-96) needs the pinned format machinery
# and is not stood up here.
def view_case(label, params)
  harness = PinnedDeck::ControllerHarness.new(params: params)
  {
    "label" => label,
    "params" => params,
    "viewFromParams" => harness.send(:view_from_params)
  }
end

view_rows = [
  view_case("the settled root request: no query view", { mark: "Home" }),
  view_case("the root request with ?view=open", { mark: "Home", view: "open" }),
  view_case("the root request with the ?v= alias", { mark: "Home", v: "related" })
]

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"] == 7 }
controller_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller.rb")
                              .select { |row| row["line"].between?(14, 25) }
read_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                         .select { |row| row["line"].between?(10, 12) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A1",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "rootRoute" => root_route,
  "routeTableSize" => routes.length,
  "standardReadRoutes" => neighbours,
  "beforeActionsForRead" => read_actions,
  "uriFetch" => uri_fetch_rows,
  "viewFromParams" => view_rows,
  "sources" => {
    "route" => route_source,
    "controller" => controller_source,
    "read" => read_source
  }
)

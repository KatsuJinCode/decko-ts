# oracle-capture-mark-view-view-route-ruby.rb - the PINNED DECK's own
# :mark/view/:view route, and the mark, view and fetch its requests ride.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A8 row grades the port
# on engine_routes.rb line 24, `get ":mark/view/:view(.:format)" =>
# "card#read"` - the route whose own comment says it "simplifies API
# documentation". The register's note named the route but never asked the
# pinned deck what the arm's request carries: the mark, the view segment,
# and the .:format capture that sits ON THE VIEW segment (the suffix is the
# format, never part of the view's name). This capture measures the
# registration and executes the pinned methods, so the row's verdict rests
# on the pinned arm, not on a reading.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:24
#                 get ":mark/view/:view(.:format)" => "card#read"
#               Three segments with the literal "view" in the middle; the
#               .:format capture is part of the THIRD segment. The arm sits
#               at order 9, BEFORE the legacy card/:view arm (order 10) and
#               the generic :mark/:view arm (order 27).
#
#   the mark    decko-0.20.0/lib/card_controller/mark.rb:17-18, 22-26
#                 interpret_mark("Front") -> explicit_mark -> as given.
#
#   the view    decko-0.20.0/lib/card_controller/rest.rb:106-109
#                 view_from_params: the :view segment lands in params[:view],
#                 so show(nil) renders THAT view.
#
#   the fetch   card-1.110.0/lib/card/fetch/card_class.rb:106-121
#                 standard_uri_fetch: fetch <mark>, new: {name: <mark>},
#                 skip_modules: true - the standard read's fetch.
#
#   the format  the .:format suffix lands in params[:format]; with it the
#               read renders the view through the REQUESTED format (the
#               registered formats are recorded below; the explicit_file
#               dispatch arm is row A2's evidence).
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-mark-view-view-route-ruby.rb \
#     > fixtures/captured/mark-view-view-route-ruby-oracle.json
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
view_route_index = routes.index { |route| route["patterns"].include?(":mark/view/:view(.:format)") }
raise "the :mark/view/:view route was not found in the pinned route table" if view_route_index.nil?

view_route = routes[view_route_index]
neighbours = routes.select { |route| route["order"].between?(8, 10) }

# The PINNED MOD's own format registry: the .:format suffix's format must be
# registered for the read to render it.
registry = load_pinned_format_registry!

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# The pinned mark and view methods, executed over the route's own params
# shape: the :mark and :view segments (and params[:format] where the URL
# carried the suffix).
def route_case(label, params)
  harness = PinnedDeck::ControllerHarness.new(params: params)
  {
    "label" => label,
    "params" => params,
    "markAnswer" => begin
      harness.send(:interpret_mark, params[:mark])
    rescue StandardError => e
      "#{e.class}: #{e.message}"
    end,
    "viewFromParams" => harness.send(:view_from_params)
  }
end

route_rows = [
  route_case("the plain arm: mark Front, view related", { mark: "Front", view: "related" }),
  route_case("the .json suffix: params[:format] = json, the view segment clean of it",
             { mark: "Front", view: "related", format: "json" })
]

# The PINNED DECK's own fetch, executed over a recording double.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class ViewRouteFetchHarness
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

fetch_harness = ViewRouteFetchHarness.new
fetch_error = nil
begin
  fetch_harness.uri_fetch({ mark: "My_Card", view: "related" })
rescue StandardError => e
  fetch_error = "#{e.class}: #{e.message}"
end

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"] == 24 }

puts JSON.pretty_generate(
  "row" => "reg-routes-A8",
  "gemset" => "decko-0.20.0 + card-mod-format-0.20.0 (pinned)",
  "markViewViewRoute" => view_route,
  "neighbourRoutes" => neighbours,
  "routeTableSize" => routes.length,
  "registeredFormats" => registry["registered"],
  "routeRequests" => route_rows,
  "uriFetch" => {
    "params" => { "mark" => "My_Card", "view" => "related" },
    "fetchAsks" => fetch_harness.fetch_asks,
    "error" => fetch_error
  },
  "sources" => {
    "route" => route_source
  }
)

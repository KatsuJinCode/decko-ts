# oracle-capture-standard-read-route-ruby.rb - the PINNED DECK's own
# standard page read, and the mark and fetch a /<mark> request rides.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A5 row grades the port
# on engine_routes.rb line 19, `get "/:mark(.:format)" => "card#read"`, the
# standard page read (the line's own comment: "/decko is deprecated"). The
# register's note named the route but never asked the pinned deck what the
# arm's mark resolution and fetch ask LOOK like - and the fetch ask carries
# a subtlety the port's grammar must be read against: the UNFOLDED mark is
# what reaches the fetch, while the folded name rides only the new-card
# fallback options. This capture measures the registration and executes the
# pinned methods, so the row's verdict rests on the pinned arm, not on a
# reading.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:19
#                 get "/:mark(.:format)" => "card#read"  # /decko is deprecated
#               One mark segment plus the .:format capture; no view, no
#               requirements. The arm sits at order 6, behind the root and
#               the file/asset arms, and before new/:type (order 7).
#
#   the mark    decko-0.20.0/lib/card_controller/mark.rb:10-19, 22-26
#                 interpret_mark("My_Card") -> explicit_mark -> the mark
#                 AS GIVEN (no folding at the controller).
#
#   the fetch   card-1.110.0/lib/card/fetch/card_class.rb:106-121, 128-133
#                 standard_uri_fetch: mark = params[:mark] || card_opts[:name]
#                   -> the UNFOLDED "My_Card" reaches the fetch (the card
#                   name machinery folds underscores internally);
#                 uri_fetch_opts: opts[:name] ||= Name[params[:mark]]&.tr "_", " "
#                   -> the FOLDED "My Card" rides only opts[:name], the
#                   new-card fallback's name if nothing is found.
#
#   the format  the .:format capture lands in params[:format]; the read's
#               format dispatch is the registry's (row A2's dispatch rows
#               carry the explicit_file arm; the registered formats here are
#               the pinned mod's own, recorded below).
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-standard-read-route-ruby.rb \
#     > fixtures/captured/standard-read-route-ruby-oracle.json
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
standard_index = routes.index { |route| route["patterns"].include?("/:mark(.:format)") }
raise "the standard read route was not found in the pinned route table" if standard_index.nil?

standard_route = routes[standard_index]
neighbours = routes.select { |route| route["order"].between?(0, 7) }

# The PINNED MOD's own format registry: the .:format suffix's format must be
# one of these for the read to render it (otherwise row A2's dispatch rows
# apply).
registry = load_pinned_format_registry!

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# The pinned explicit mark: the arm's mark answers AS GIVEN.
def interpret_case(label, mark)
  harness = PinnedDeck::ControllerHarness.new(params: { mark: mark })
  {
    "label" => label,
    "mark" => mark,
    "answer" => harness.send(:interpret_mark, mark)
  }
end

interpret_rows = [
  interpret_case("a plain mark", "My_Card"),
  interpret_case("a mark with spaces already", "My Card"),
  interpret_case("a star mark", "*home")
]

# The PINNED DECK's own fetch, executed over a recording double.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class StandardFetchHarness
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

def standard_fetch_case(label, params)
  harness = StandardFetchHarness.new
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
  standard_fetch_case("an underscored mark: the UNFOLDED mark reaches the fetch, the folded name rides the new-card opts",
                      { mark: "My_Card" }),
  standard_fetch_case("a spelled mark",
                      { mark: "Home" }),
  standard_fetch_case("the .json suffix lands in params[:format], not the mark",
                      { mark: "My_Card", format: "json" })
]

# The pinned read's view decision, executed: the arm carries no view, the
# query decides (view_from_params).
def view_case(label, params)
  harness = PinnedDeck::ControllerHarness.new(params: params)
  {
    "label" => label,
    "params" => params,
    "viewFromParams" => harness.send(:view_from_params)
  }
end

view_rows = [
  view_case("the plain page read: no query view", { mark: "My_Card" }),
  view_case("the page read with ?view=related", { mark: "My_Card", view: "related" })
]

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"] == 19 }
mark_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/mark.rb")
                         .select { |row| row["line"].between?(10, 26) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A5",
  "gemset" => "decko-0.20.0 + card-mod-format-0.20.0 (pinned)",
  "standardRoute" => standard_route,
  "routeTableHead" => neighbours,
  "routeTableSize" => routes.length,
  "registeredFormats" => registry["registered"],
  "interpretMark" => interpret_rows,
  "uriFetch" => fetch_rows,
  "viewFromParams" => view_rows,
  "sources" => {
    "route" => route_source,
    "mark" => mark_source
  }
)

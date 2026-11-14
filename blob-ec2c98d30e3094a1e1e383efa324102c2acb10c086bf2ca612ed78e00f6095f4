# oracle-capture-mark-view-route-ruby.rb - the PINNED DECK's own super-lazy
# "for super-lazy under-achievers" read route: get :mark/:view(.:format).
#
# WHY THIS SCRIPT EXISTS: the completeness register's A21 row grades the port
# on engine_routes.rb line 51, `get ":mark/:view(.:format)" => "card#read"`.
# It is the LAST named read route before the wildcard, and the one every deck
# chrome link leans on ("/Front/related", "/Search/search_box_complete").
# This capture measures the registration and its precedence against the
# wildcard, the two route segments' own params shape as the pinned methods
# read them (interpret_mark and view_from_params, both EXECUTED), and the
# fetch the read takes - so the row's verdict rests on the pinned arm.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:51
#                 get ":mark/:view(.:format)" => "card#read"
#               Order 27 of 29, immediately before the wildcard
#               (line 54, order 28). It sets NO `view:` option, so the view
#               comes from the URL segment alone.
#
#   the shape   EXACTLY two segments. It is the lowest-precedence NAMED
#               route, so anything earlier that matches wins: the marked read
#               (line 19, order 6), new/:type (7), type/:type (8),
#               :mark/view/:view (9), card/:view (10), and the five explicit
#               GET transaction alternatives (lines 41-43, orders 19-23),
#               whose `(card)` group is optional and so also answers the bare
#               "read"/"update"/"delete"/"asset"/"create" one-segment forms.
#               That is why the shared candidate reduction matters here: a
#               claim about what this arm does NOT answer needs the whole
#               table, not this line.
#
#   the mark    decko-0.20.0/lib/card_controller/mark.rb:6-26
#                 load_mark runs ONLY for :read, and interpret_mark sends a
#                 present mark down explicit_mark, which returns it VERBATIM
#                 (no fold, no implicit ladder). So the :mark segment is the
#                 card name the deck stores, and the underscore fold belongs
#                 to the fetch's uri_fetch_opts, not to the route.
#
#   the view    decko-0.20.0/lib/card_controller/rest.rb:106-109
#                 def view_from_params
#                   %i[view v].each { |k| return params[k] if params[k].present? }
#                   nil
#                 end
#               The :view segment IS params[:view], read here by the render
#               path (rest.rb:100 `view ||= view_from_params`). The `v`
#               alias is checked second.
#
#   the format  the (.:format) capture rides the VIEW segment: Rails splits
#               the suffix into params[:format] before either method sees it,
#               so a suffixed view reaches view_from_params clean of it.
#
#   the fetch   card-1.110.0/lib/card/fetch/card_class.rb:104-115, 118-133
#                 A read is not the create branch, so standard_uri_fetch
#                 FETCHES the mark with new: card_opts, skip_modules: true;
#                 uri_fetch_opts' `opts[:name] ||= Name[params[:mark]]&.tr
#                 "_", " "` is where the underscore fold happens.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-mark-view-route-ruby.rb \
#     > fixtures/captured/mark-view-route-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"
require_relative "pinned-route-table-candidate-reduction-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

# files_web_path is primed BEFORE the table is drawn: engine_routes.rb:10,13
# interpolate `#{files}` and the real deck has loaded the PINNED carrierwave
# mod by then (row A18's finding).
files_web_path = PinnedDeck.files_web_path

# The PINNED DECK's own route table, EXECUTED.
routes, raw_requirements = PinnedDeck.route_table_executed_with_requirements
view_route_index = routes.index { |route| route["patterns"].include?(":mark/:view(.:format)") }
raise "the :mark/:view route was not found in the pinned route table" if view_route_index.nil?

view_route = routes[view_route_index]

# The arms on either side: the last (card)/ arm before it (order 26) and the
# wildcard after it (order 28).
previous_arm = routes[view_route_index - 1]
wildcard_arm = routes[view_route_index + 1]

# The shared candidate reduction: for each probe path, every route in the
# executed pinned table that can match it, with the verbs each admits, plus
# the FIRST route admitting each verb (lowest order = the precedence).
pattern_expansions = route_pattern_expansions(routes)

PROBE_PATHS = [
  "/Front/related", "/Front/related.json", "/read/Front", "/update/Front", "/new/Sign_up"
]

verb_candidates = PROBE_PATHS.map do |pathname|
  route_candidate_reduction(routes, raw_requirements, pathname)
end

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# The pinned mark and view methods, EXECUTED over each probe path's own
# params shape (the segments, plus params[:format] where the URL carried the
# suffix).
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
  route_case("the .json suffix rides the VIEW segment: params[:format] carries it, the view stays clean",
             { mark: "Front", view: "related", format: "json" }),
  route_case("the `v` alias answers when :view is absent", { mark: "Front", v: "related" }),
  route_case("no view at all: view_from_params answers nil and render_page keeps its default",
             { mark: "Front" }),
  route_case("an EMPTY view is blank, so the alias is tried next (params[k].present?)",
             { mark: "Front", view: "", v: "related" }),
  route_case("the mark segment rides VERBATIM: explicit_mark does not fold",
             { mark: "My_Card", view: "related" })
]

# The PINNED DECK's own fetch, executed over a recording double.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class MarkViewFetchHarness
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

def mark_view_fetch_case(label, params)
  harness = MarkViewFetchHarness.new
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
    "fetchAsks" => harness.fetch_asks,
    "answer" => answer,
    "error" => error
  }
end

fetch_rows = [
  mark_view_fetch_case("a read FETCHES the mark; the underscore fold lands in the new: name",
                      { mark: "My_Card", view: "related" }),
  mark_view_fetch_case("the view does not reach the fetch: it is a render-time param",
                      { mark: "Front", view: "search_box_complete" })
]

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"].between?(50, 54) }
mark_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/mark.rb")
                        .select { |row| row["line"].between?(6, 26) }
view_from_params_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                                     .select { |row| row["line"].between?(99, 109) }
render_page_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                               .select { |row| row["line"].between?(99, 104) }
uri_fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                             .select { |row| row["line"].between?(104, 115) }
standard_fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                                  .select { |row| row["line"].between?(118, 126) }
uri_fetch_opts_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                                  .select { |row| row["line"].between?(128, 133) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A21",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "filesWebPath" => files_web_path,
  "markViewRoute" => view_route,
  "precedence" => {
    "previousArm" => previous_arm,
    "wildcardArm" => wildcard_arm
  },
  "routeTableSize" => routes.length,
  "patternExpansions" => pattern_expansions,
  "verbCandidates" => verb_candidates,
  "routeRequests" => route_rows,
  "uriFetch" => fetch_rows,
  "sources" => {
    "route" => route_source,
    "mark" => mark_source,
    "renderPageAndViewFromParams" => render_page_source,
    "viewFromParams" => view_from_params_source,
    "uriFetch" => uri_fetch_source,
    "standardUriFetch" => standard_fetch_source,
    "uriFetchOpts" => uri_fetch_opts_source
  }
)
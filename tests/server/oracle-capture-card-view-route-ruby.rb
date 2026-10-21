# oracle-capture-card-view-route-ruby.rb - the PINNED DECK's own legacy
# card/:view route, and the pinned methods that decide what it answers.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A9 row grades the port
# on `get "card/:view(/:mark(.:format))" => "card#read", view: /new|edit/`.
# The row's note named the route and its view constraint but never asked the
# pinned deck what the constraint ADMITS or what the route renders, and both
# decide the port's grammar.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:25
#                 get "card/:view(/:mark(.:format))" => "card#read", view: /new|edit/
#               The :view segment is constrained by /new|edit/. It is the
#               deck's eleventh route, so it is matched BEFORE the generic
#               ":mark/:view" arm (line 51) and before the wildcard (line 54).
#               A segment the constraint refuses falls THROUGH to those.
#
#   the mark    decko-0.20.0/lib/card_controller/mark.rb:28-44
#                 implicit_mark -> home_mark
#                 (Card::Rule.global_setting(:home) || "Home")
#               The route's :mark is OPTIONAL, so a markless /card/edit
#               renders the HOME card's edit view.
#
#   the view    decko-0.20.0/lib/card_controller/rest.rb:91-109
#                 def show view=nil, status=200
#                   ...
#                   result = render_page @format, view
#                 end
#                 def render_page format, view
#                   view ||= view_from_params
#                   ...
#                 end
#                 def view_from_params
#                   %i[view v].each { |k| return params[k] if params[k].present? }
#                   nil
#                 end
#               The captured :view segment arrives in params[:view], so the
#               read renders THAT view.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-card-view-route-ruby.rb \
#     > fixtures/captured/card-view-route-ruby-oracle.json
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
# format is registered, and the answer decides the format the read renders.
registry = load_pinned_format_registry!

# The PINNED DECK's own route table, EXECUTED, with the requirements as the
# PINNED values (a Regexp stays a Regexp).
routes, raw_requirements = PinnedDeck.route_table_executed_with_requirements
card_view_index = routes.index { |route| route["patterns"].include?("card/:view(/:mark(.:format))") }
raise "the card/:view route was not found in the pinned route table" if card_view_index.nil?

card_view_route = routes[card_view_index]
view_requirement = raw_requirements[card_view_index][:view]

# What the pinned requirement ADMITS, asked of the pinned Regexp itself.
view_matches = ["new", "edit", "open", "editing", "newer"].map do |segment|
  {
    "segment" => segment,
    "matches" => view_requirement.is_a?(Regexp) ? view_requirement.match?(segment) : nil
  }
end

# The routes the card/:view arm falls THROUGH to when the constraint refuses
# the segment.
fallthrough = routes.select { |route| [27, 28].include?(route["order"]) }

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# The PINNED DECK's own mark method: the route's :mark is optional.
def implicit_mark_case(label, params: {}, home_rule: nil)
  Card::Auth.needs_setup_answer = false
  Card::Env.html_answer = true
  Card::Rule.global_settings = home_rule.nil? ? {} : { home: home_rule }
  Card::Set::Format::AbstractFormat::ViewOpts.unknown_ok_views = {}
  harness = PinnedDeck::ControllerHarness.new(params: params)
  { "label" => label, "mark" => harness.send(:implicit_mark) }
end

mark_rows = [
  implicit_mark_case("the markless /card/edit case"),
  implicit_mark_case("the markless /card/edit case, the *home rule names another card", home_rule: "Target")
]

# The PINNED DECK's own view selection, executed: the captured :view segment
# arrives in params[:view], and the read renders THAT view.
def view_case(label, params)
  harness = PinnedDeck::ControllerHarness.new(params: params)
  {
    "label" => label,
    "params" => params,
    "viewFromParams" => harness.send(:view_from_params)
  }
end

view_rows = [
  view_case("the captured :view segment", { view: "edit", mark: "Front" }),
  view_case("the v alias", { v: "edit", mark: "Front" }),
  view_case("no view at all", { mark: "Front" })
]

# The PINNED DECK's own render_page, executed: the read calls it with no
# view, and the view comes from view_from_params.
def render_page_case(label, params)
  card = PinnedDeck::CardDouble.new(name: "Front")
  harness = PinnedDeck::ControllerHarness.new(params: params, card: card)
  format = PinnedDeck::FormatDouble.new(card, :html)
  error = nil
  result = nil
  begin
    result = harness.send(:render_page, format, nil)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "params" => params,
    "error" => error,
    "result" => result,
    "pageCalls" => card.page_calls
  }
end

render_page_rows = [
  render_page_case("the card/:view route's edit arm", { view: "edit", mark: "Front" }),
  render_page_case("the card/:view route's new arm", { view: "new", mark: "Front" })
]

puts JSON.pretty_generate(
  "row" => "reg-routes-A9",
  "gemset" => "decko-0.20.0 + card-mod-format-0.20.0 (pinned)",
  "registeredFormats" => registry["registered"],
  "cardViewRoute" => card_view_route,
  "viewRequirement" => {
    "source" => view_requirement.is_a?(Regexp) ? view_requirement.source : view_requirement.to_s,
    "matches" => view_matches
  },
  "fallthroughRoutes" => fallthrough,
  "routeTableSize" => routes.length,
  "implicitMark" => mark_rows,
  "viewFromParams" => view_rows,
  "renderPage" => render_page_rows
)

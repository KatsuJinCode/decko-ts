# oracle-capture-type-route-ruby.rb - the PINNED DECK's own type/:type read
# route, and the two pinned methods that decide what it answers.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A7 row grades the port
# on `get "type/:type" => "card#read"`. The register's suggested fix ("renders
# the type's Search card") MISREAD the pinned deck, and so did the CF
# shell's own comment: nothing in the pinned gemset reads params[:type]
# except the card's own fetch options. The pinned deck answers the HOME
# CARD's page, and this capture measures that from the pinned side.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route  decko-0.20.0/config/engine_routes.rb:23
#                get "type/:type" => "card#read"
#              No view, no mark. It is the deck's ninth route, so it is
#              matched BEFORE the generic ":mark/:view" arm (line 51) and
#              before the wildcard (line 54).
#
#   the mark   decko-0.20.0/lib/card_controller/mark.rb:28-44
#                def implicit_mark
#                  case
#                  when initial_setup? then prepare_setup_card!; ""
#                  when (name = mark_from_card_hash) then name
#                  when view_does_not_require_name? then ""
#                  else home_mark
#                  end
#                end
#                def home_mark
#                  Card::Rule.global_setting(:home) || "Home"
#                end
#
#   the type   card-1.110.0/lib/card/fetch/card_class.rb:128-133
#                def uri_fetch_opts params
#                  Env.hash(params[:card]).tap do |opts|
#                    opts[:type] ||= params[:type] if params[:type]
#                    opts[:name] ||= Name[params[:mark]]&.tr "_", " "
#                  end
#                end
#
# So the :type segment becomes the card's TYPE option, and the fetch
# (card_class.rb:117-126) applies it only to the NEW-CARD fallback. On any
# deck whose home mark exists, the render is the HOME CARD's page.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-type-route-ruby.rb \
#     > fixtures/captured/type-route-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"

# The PINNED DECK's own route table, EXECUTED.
routes = PinnedDeck.route_table_executed
type_route = routes.find { |route| route["patterns"].include?("type/:type") }
neighbours = routes.select { |route| [7, 8, 9, 27, 28].include?(route["order"]) }

# The PINNED DECK's own controller, loaded: the mark module is what decides
# the mark for a markless read.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# The PINNED DECK's own mark method, executed.
def implicit_mark_case(label, params: {}, home_rule: nil, needs_setup: false, html: true, unknown_ok: {})
  Card::Auth.needs_setup_answer = needs_setup
  Card::Env.html_answer = html
  Card::Rule.global_settings = home_rule.nil? ? {} : { home: home_rule }
  Card::Set::Format::AbstractFormat::ViewOpts.unknown_ok_views = unknown_ok
  harness = PinnedDeck::ControllerHarness.new(params: params)
  {
    "label" => label,
    "params" => params,
    "mark" => harness.send(:implicit_mark),
    "paramsAfter" => harness.params
  }
end

mark_rows = [
  implicit_mark_case("no mark, no card hash, no view (the type route's case)"),
  implicit_mark_case("the *home global rule names another card", home_rule: "Target"),
  implicit_mark_case("a card hash names the card", params: { card: { name: "Other" } }),
  implicit_mark_case("a view that needs no name", params: { view: "new" }, unknown_ok: { new: true })
]

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
  fetch_opts_case("the type segment alone", { type: "Style" }),
  fetch_opts_case("the type segment with a mark", { type: "Style", mark: "My_Card" }),
  fetch_opts_case("neither", {})
]

puts JSON.pretty_generate(
  "row" => "reg-routes-A7",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "typeRoute" => type_route,
  "neighbourRoutes" => neighbours,
  "routeTableSize" => routes.length,
  "implicitMark" => mark_rows,
  "fetchOptions" => fetch_rows
)

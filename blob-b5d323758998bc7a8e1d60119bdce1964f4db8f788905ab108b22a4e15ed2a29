# oracle-capture-explicit-delete-route-ruby.rb - the PINNED DECK's own
# "super-explicit" (card)/delete route, and the fetch and delete its DELETE
# rides.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A20 row grades the
# port on engine_routes.rb line 48, `match "(card)/delete(/:mark(.:format))"
# => "card#delete", via: :delete`. Together with rows A18 and A19 this is the
# third (card)/ arm, and it completes the verb picture: create is post+patch,
# update is post+put+patch, delete is delete alone. This capture measures the
# arm's registration, the verbs the rest of the pinned table admits for the
# same paths (the shared candidate reduction), and the delete action.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:48
#                 match "(card)/delete(/:mark(.:format))" => "card#delete",
#                 via: :delete
#               Order 26, the LAST of the three (card)/ write arms, after the
#               (card)/create (24) and (card)/update (25). Both segments are
#               optional, so "delete" alone and "/card/delete" are this arm -
#               but a ONE-segment path is claimed by the marked arms first
#               (the bare "/delete" is the marked DELETE of the card named
#               "delete", order 18).
#
#   the verb    decko-0.20.0 -> actionpack-7.2.4, the chain `via:` reaches:
#                 routing/mapper.rb:1953  via = Mapping.check_via Array(...)
#                 routing/mapper.rb:207-209 def request_method
#                                          @via.map { |x| Journey::Route.verb_matcher(x) }
#                 routing/mapper.rb:186    request_method_match: request_method
#                 journey/route.rb:170-172 def requires_matching_verb?
#                 journey/route.rb:183-185 def match_verb(request)
#                                          @request_method_match.any? { |m| m.call request }
#                 journey/route.rb:14-24  the VERBS template, `req.<verb>?`
#               ONE verb admitted - the narrowest write arm in the table.
#
#   the fetch   card-1.110.0/lib/card/fetch/card_class.rb:104-115, 118-133
#                 A delete is not the create branch, so it FETCHES the mark
#                 (`mark = params[:mark] || card_opts[:name]`) with
#                 new: card_opts, skip_modules: true - the same branch the
#                 marked delete on row A16 takes.
#
#   the action  decko-0.20.0/lib/card_controller/rest.rb:18-20
#                 def delete; handle { card.delete! }; end
#               ONE arm, no new_card? branch (row A16's measured finding).
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-explicit-delete-route-ruby.rb \
#     > fixtures/captured/explicit-delete-route-ruby-oracle.json
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
# mod by then. Drawn without it those two file routes register as bare
# "/:mark/..." - two dynamic segments that match every two-segment path and
# pollute this row's candidate reduction (row A18's finding).
files_web_path = PinnedDeck.files_web_path

# The PINNED DECK's own route table, EXECUTED.
routes, raw_requirements = PinnedDeck.route_table_executed_with_requirements
explicit_delete_index = routes.index do |route|
  route["verb"] == "match" && route["action"] == "card#delete" &&
    route["patterns"].any? { |pattern| pattern.include?("delete") && pattern.include?("card") }
end
raise "the (card)/delete route was not found in the pinned route table" if explicit_delete_index.nil?

explicit_delete = routes[explicit_delete_index]
explicit_delete_via = Array(raw_requirements[explicit_delete_index][:via]).map(&:to_s)

# The arms whose precedence this row rests on: the (card)/update arm before
# it and the super-lazy :mark/:view arm (line 51) after it.
explicit_update = routes[explicit_delete_index - 1]
mark_view_arm = routes.find { |route| route["patterns"] == [":mark/:view(.:format)"] }

# The shared candidate reduction: for each probe path, every route in the
# executed pinned table that can match it and the verbs each admits, plus the
# FIRST route admitting each verb (lowest order = the matching precedence).
pattern_expansions = route_pattern_expansions(routes)

PROBE_PATHS = [
  "/delete/Foo", "/card/delete/Foo", "/delete", "/card/delete"
]

verb_candidates = PROBE_PATHS.map do |pathname|
  route_candidate_reduction(routes, raw_requirements, pathname)
end

# The PINNED DECK's own controller, loaded.
before_actions = PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

def actions_for(before_actions, action)
  before_actions.select do |entry|
    (entry["only"].empty? || entry["only"].include?(action)) &&
      !entry["except"].include?(action)
  end.map { |entry| entry["name"] }
end

delete_actions = actions_for(before_actions, "delete")

# The PINNED DECK's own fetch, executed over a recording double.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class ExplicitDeleteFetchHarness
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

def explicit_delete_fetch_case(label, params)
  harness = ExplicitDeleteFetchHarness.new
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
  explicit_delete_fetch_case("the URL mark is FETCHED (not Card.new): a delete is not the create branch",
                             { action: "delete", mark: "Target" }),
  explicit_delete_fetch_case("underscores ride the mark RAW; the FOLDED name rides the new: opts",
                             { action: "delete", mark: "My_Card" }),
  explicit_delete_fetch_case("no URL mark: the body's card[name] is the mark",
                             { action: "delete", card: { name: "Target" } })
]

# The PINNED DECK's own delete action, executed over both new_card? answers -
# the action never ASKS, which is the measurement (row A16's finding).
def explicit_delete_action_case(label, new_card)
  card = PinnedDeck::CardDouble.new(name: "Target", new_card: new_card)
  harness = PinnedDeck::ControllerHarness.new(params: {}, card: card)
  error = nil
  begin
    harness.delete
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "newCard" => new_card,
    "error" => error,
    "cardCalls" => card.calls,
    "redirected" => harness.redirected
  }
end

action_rows = [
  explicit_delete_action_case("an EXISTING card: card.delete!, one arm, no new_card? branch", false),
  explicit_delete_action_case("a MISSING card: the same delete! ask - the action never asks new_card?", true)
]

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"].between?(45, 51) }
delete_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(18, 20) }
uri_fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                             .select { |row| row["line"].between?(104, 115) }
standard_fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                                  .select { |row| row["line"].between?(118, 126) }
before_action_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller.rb")
                               .select { |row| row["line"].between?(20, 25) }
# The PINNED actionpack's own verb chain, so the row's verb is carried by the
# source that enforces it.
verb_matcher_source = PinnedDeck.pinned_lines(
  "actionpack-7.2.4/lib/action_dispatch/journey/route.rb"
).select { |row| row["line"].between?(14, 24) || row["line"].between?(170, 172) || row["line"].between?(183, 185) }
via_source = PinnedDeck.pinned_lines("actionpack-7.2.4/lib/action_dispatch/routing/mapper.rb")
                     .select { |row| row["line"].between?(207, 209) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A20",
  "gemset" => "decko-0.20.0 + card-1.110.0 + actionpack-7.2.4 (pinned)",
  "filesWebPath" => files_web_path,
  "explicitDeleteRoute" => explicit_delete,
  "explicitDeleteVia" => explicit_delete_via,
  "precedence" => {
    "explicitUpdateBefore" => explicit_update,
    "markViewArmAfter" => mark_view_arm
  },
  "beforeActionsForDelete" => delete_actions,
  "patternExpansions" => pattern_expansions,
  "verbCandidates" => verb_candidates,
  "uriFetch" => fetch_rows,
  "deleteAction" => action_rows,
  "sources" => {
    "route" => route_source,
    "delete" => delete_source,
    "uriFetch" => uri_fetch_source,
    "standardUriFetch" => standard_fetch_source,
    "beforeActions" => before_action_source,
    "pinnedVerbMatcher" => verb_matcher_source,
    "pinnedViaToRequestMethod" => via_source
  }
)
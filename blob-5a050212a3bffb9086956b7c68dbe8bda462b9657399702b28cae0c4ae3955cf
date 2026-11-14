# oracle-capture-explicit-update-route-ruby.rb - the PINNED DECK's own
# "super-explicit" (card)/update route, and the fetch and save its
# POST|PUT|PATCH rides.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A19 row grades the
# port on engine_routes.rb line 47, `match "(card)/update(/:mark(.:format))"
# => "card#update", via: %i[post put patch]`. This is the arm that tells the
# port's verb fold apart: it is the one write arm whose `via` INCLUDES :put,
# so a fold that treats PUT and PATCH as one value is right HERE and wrong on
# row A18's create arm. This capture measures the arm's own registration, the
# verbs the rest of the pinned table admits for the same paths (the shared
# candidate reduction), and the update action's two-arm dispatch.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:47
#                 match "(card)/update(/:mark(.:format))" => "card#update",
#                 via: %i[post put patch]
#               Order 25, after the (card)/create arm (24) and after the
#               marked create (16) and marked update (17). BOTH segments are
#               optional, so "update" alone and "/card/update" are this arm -
#               but a ONE-segment path is claimed by the marked arms first
#               (the bare "/update" is the marked UPDATE of the card named
#               "update").
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
#               Three verbs admitted - the widest write arm in the table.
#
#   the fetch   card-1.110.0/lib/card/fetch/card_class.rb:104-115, 118-133
#                 An update is not the create branch, so it FETCHES the mark
#                 (`mark = params[:mark] || card_opts[:name]`) with
#                 new: card_opts, skip_modules: true. The mark rides raw and
#                 the FOLDED name rides the new: opts (row A15's finding).
#
#   the action  decko-0.20.0/lib/card_controller/rest.rb:14-16
#                 def update
#                   card.new_card? ? create : handle { card.update! params[:card]&.to_unsafe_h }
#                 end
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-explicit-update-route-ruby.rb \
#     > fixtures/captured/explicit-update-route-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"
require_relative "pinned-route-table-candidate-reduction-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

# Rails' params hash answers to_unsafe_h (the update action reads it); the
# harness params are a plain hash, so the stand-in carries the one method
# (the A11/A15 captures' shape).
class CardParams < Hash
  def to_unsafe_h
    self
  end
end

# files_web_path is primed BEFORE the table is drawn: engine_routes.rb:10,13
# interpolate `#{files}` and the real deck has loaded the PINNED carrierwave
# mod by then. Drawn without it those two file routes register as bare
# "/:mark/..." - two dynamic segments that match every two-segment path and
# pollute this row's candidate reduction (row A18's finding).
files_web_path = PinnedDeck.files_web_path

# The PINNED DECK's own route table, EXECUTED.
routes, raw_requirements = PinnedDeck.route_table_executed_with_requirements
explicit_update_index = routes.index do |route|
  route["verb"] == "match" && route["action"] == "card#update" &&
    route["patterns"].any? { |pattern| pattern.include?("update") && pattern.include?("card") }
end
raise "the (card)/update route was not found in the pinned route table" if explicit_update_index.nil?

explicit_update = routes[explicit_update_index]
explicit_update_via = Array(raw_requirements[explicit_update_index][:via]).map(&:to_s)

# The arms whose precedence this row rests on: the (card)/create arm before
# it and the (card)/delete arm after it.
explicit_create = routes[explicit_update_index - 1]
explicit_delete = routes[explicit_update_index + 1]

# The shared candidate reduction: for each probe path, every route in the
# executed pinned table that can match it and the verbs each admits, plus the
# FIRST route admitting each verb (lowest order = the matching precedence).
pattern_expansions = route_pattern_expansions(routes)

PROBE_PATHS = [
  "/update/Foo", "/card/update/Foo", "/update", "/card/update"
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

update_actions = actions_for(before_actions, "update")

# The PINNED DECK's own fetch, executed over a recording double.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class ExplicitUpdateFetchHarness
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

def explicit_update_fetch_case(label, params)
  harness = ExplicitUpdateFetchHarness.new
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
  explicit_update_fetch_case("the URL mark is FETCHED (not Card.new): an update is not the create branch",
                             { action: "update", mark: "Target" }),
  explicit_update_fetch_case("underscores ride the mark RAW; the FOLDED name rides the new: opts",
                             { action: "update", mark: "My_Card" }),
  explicit_update_fetch_case("no URL mark: the body's card[name] is the mark",
                             { action: "update", card: { name: "Target" } })
]

# The PINNED DECK's own update action, executed over both new_card? arms.
def explicit_update_action_case(label, new_card, params)
  card = PinnedDeck::CardDouble.new(name: "Target", new_card: new_card)
  wrapped = params.transform_values { |value| value.is_a?(Hash) ? CardParams[value] : value }
  harness = PinnedDeck::ControllerHarness.new(params: wrapped, card: card)
  error = nil
  begin
    harness.update
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "newCard" => new_card,
    "params" => wrapped,
    "error" => error,
    "cardCalls" => card.calls,
    "redirected" => harness.redirected
  }
end

action_rows = [
  explicit_update_action_case("a FOUND card: card.update! with the body's card hash",
                              false, { card: { name: "Target", content: "new body" } }),
  explicit_update_action_case("a MISSING card: the branch IS create (card.save!)",
                              true, { card: { name: "Target" } })
]

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"].between?(45, 48) }
update_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(14, 16) }
uri_fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                             .select { |row| row["line"].between?(104, 115) }
standard_fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                                  .select { |row| row["line"].between?(118, 126) }
before_action_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller.rb")
                               .select { |row| row["line"].between?(20, 25) }
# The PINNED actionpack's own verb chain, so the row's verb set is carried
# by the source that enforces it.
verb_matcher_source = PinnedDeck.pinned_lines(
  "actionpack-7.2.4/lib/action_dispatch/journey/route.rb"
).select { |row| row["line"].between?(14, 24) || row["line"].between?(170, 172) || row["line"].between?(183, 185) }
via_source = PinnedDeck.pinned_lines("actionpack-7.2.4/lib/action_dispatch/routing/mapper.rb")
                     .select { |row| row["line"].between?(207, 209) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A19",
  "gemset" => "decko-0.20.0 + card-1.110.0 + actionpack-7.2.4 (pinned)",
  "filesWebPath" => files_web_path,
  "explicitUpdateRoute" => explicit_update,
  "explicitUpdateVia" => explicit_update_via,
  "precedence" => {
    "explicitCreateBefore" => explicit_create,
    "explicitDeleteAfter" => explicit_delete
  },
  "beforeActionsForUpdate" => update_actions,
  "patternExpansions" => pattern_expansions,
  "verbCandidates" => verb_candidates,
  "uriFetch" => fetch_rows,
  "updateAction" => action_rows,
  "sources" => {
    "route" => route_source,
    "update" => update_source,
    "uriFetch" => uri_fetch_source,
    "standardUriFetch" => standard_fetch_source,
    "beforeActions" => before_action_source,
    "pinnedVerbMatcher" => verb_matcher_source,
    "pinnedViaToRequestMethod" => via_source
  }
)
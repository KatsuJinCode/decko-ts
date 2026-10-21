# oracle-capture-marked-update-route-ruby.rb - the PINNED DECK's own MARKED
# update route, and the fetch and save its PUT|PATCH rides.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A15 row grades the
# port on engine_routes.rb line 37, `match ":mark(.:format)" =>
# "card#update", via: %i[put patch]`. It is the middle of the three
# RESTful-with-mark arms and the arm every real decko edit form reaches.
# This capture measures the registration (including the verb set the PINNED
# actionpack enforces), the before_action table's shape for update, the
# fetch branch the marked update takes - the FETCH branch, not Card.new -
# and the update action's own two-arm dispatch, so the row's verdict rests
# on the pinned arm, not on a reading.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:37
#                 match ":mark(.:format)" => "card#update", via: %i[put patch]
#               ONE registration carrying TWO verbs (unlike the markless
#               update pair on lines 29-30, which is two registrations of the
#               same action). Order 17, after the marked create (16) and
#               before the marked delete (18).
#
#   the verb    decko-0.20.0 -> actionpack-7.2.4, the chain `via:` reaches:
#                 routing/mapper.rb:1953  via = Mapping.check_via Array(...)
#                 routing/mapper.rb:207-209 def request_method
#                                          @via.map { |x| Journey::Route.verb_matcher(x) }
#                 routing/mapper.rb:186    request_method_match: request_method
#                 journey/route.rb:183-185 def match_verb(request)
#                                          @request_method_match.any? { |m| m.call request }
#                 journey/route.rb:14-24  the VERBS template: one matcher
#                                          class per verb, `req.<verb>?`
#               So this arm answers PUT and PATCH and nothing else - a POST
#               to the same path is the L36 marked create.
#
#   the table   decko-0.20.0/lib/card_controller.rb:20-25
#                 load_mark runs ONLY for :read; refresh_card runs for
#                 create|update|delete. Like the marked create, the marked
#                 update NEVER runs load_mark.
#
#   the fetch   card-1.110.0/lib/card/fetch/card_class.rb:104-115, 118-133
#                 uri_fetch: params[:action] == "create" -> Card.new; an
#                 UPDATE is not that branch, so it takes
#                 standard_uri_fetch, which FETCHES the mark
#                 (`mark = params[:mark] || card_opts[:name]`) with
#                 new: card_opts, skip_modules: true and look_in_trash from
#                 params. uri_fetch_opts builds the opts: the body's card
#                 hash, then opts[:name] ||= Name[params[:mark]]&.tr "_", " ".
#
#   the action  decko-0.20.0/lib/card_controller/rest.rb:14-16
#                 def update
#                   card.new_card? ? create : handle { card.update! params[:card]&.to_unsafe_h }
#                 end
#               The FOUND/MISSING two-arm dispatch: a missing card's update
#               IS the create branch.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-marked-update-route-ruby.rb \
#     > fixtures/captured/marked-update-route-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

# Rails' params hash answers to_unsafe_h (the update action reads it); the
# harness params are a plain hash, so the stand-in carries the one method
# (the A11 capture's shape).
class CardParams < Hash
  def to_unsafe_h
    self
  end
end

# The PINNED DECK's own route table, EXECUTED.
routes, raw_requirements = PinnedDeck.route_table_executed_with_requirements
marked_update_index = routes.index do |route|
  route["verb"] == "match" && route["action"] == "card#update" && route["patterns"].include?(":mark(.:format)")
end
raise "the marked update route was not found in the pinned route table" if marked_update_index.nil?

marked_update = routes[marked_update_index]
marked_update_via = Array(raw_requirements[marked_update_index][:via]).map(&:to_s)

# The arms this row's precedence rests on: the marked create before it and
# the marked delete after it.
marked_create = routes.find do |route|
  route["verb"] == "match" && route["action"] == "card#create" && route["patterns"].include?(":mark(.:format)")
end
marked_delete = routes.find do |route|
  route["verb"] == "match" && route["action"] == "card#delete" && route["patterns"].include?(":mark(.:format)")
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

# The PINNED DECK's own fetch, executed over a recording double. An UPDATE is
# not the create branch, so uri_fetch reaches standard_uri_fetch and the
# FETCH ask is what this row's decision rests on. The harness's fetch is a
# RECORDING stand-in: it records the mark and options the pinned method
# passed and answers nil, which standard_uri_fetch then passes to
# `card&.include_set_modules` (safe on nil).
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class MarkedUpdateFetchHarness
  include Card::Fetch::CardClass

  attr_reader :fetch_asks, :new_asks

  def initialize
    @fetch_asks = []
    @new_asks = []
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

def marked_update_fetch_case(label, params)
  harness = MarkedUpdateFetchHarness.new
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
  marked_update_fetch_case("the URL mark is FETCHED (not Card.new): the update is not the create branch",
                           { action: "update", mark: "Target" }),
  marked_update_fetch_case("underscores in the URL mark become spaces (the .tr \"_\", \" \")",
                           { action: "update", mark: "My_Card" }),
  marked_update_fetch_case("no URL mark: the body's card[name] is the mark (params[:mark] || card_opts[:name])",
                           { action: "update", card: { name: "Target" } }),
  marked_update_fetch_case("a .json-suffixed mark: the (.:format) capture split it in Rails before the fetch",
                           { action: "update", mark: "Target", format: "json" }),
  marked_update_fetch_case("look_in_trash rides params straight through to the fetch",
                           { action: "update", mark: "Target", look_in_trash: true })
]

# The PINNED DECK's own update action, executed over both new_card? arms.
def marked_update_action_case(label, new_card, params)
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
  marked_update_action_case("a FOUND card: card.update! with the body's card hash",
                           false, { card: { name: "Target", content: "new body" } }),
  marked_update_action_case("a MISSING card: the branch IS create (card.save!)",
                           true, { card: { name: "Target" } })
]

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"].between?(35, 38) }
update_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(14, 16) }
uri_fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                             .select { |row| row["line"].between?(104, 115) }
standard_fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                                  .select { |row| row["line"].between?(118, 126) }
uri_fetch_opts_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                                  .select { |row| row["line"].between?(128, 133) }
before_action_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller.rb")
                               .select { |row| row["line"].between?(20, 25) }
# The PINNED actionpack's own verb chain, so the row's verb set is carried
# by the source that enforces it.
verb_matcher_source = PinnedDeck.pinned_lines(
  "actionpack-7.2.4/lib/action_dispatch/journey/route.rb"
).select { |row| row["line"].between?(14, 24) || row["line"].between?(183, 185) }
via_source = PinnedDeck.pinned_lines("actionpack-7.2.4/lib/action_dispatch/routing/mapper.rb")
                     .select { |row| row["line"].between?(207, 209) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A15",
  "gemset" => "decko-0.20.0 + card-1.110.0 + actionpack-7.2.4 (pinned)",
  "markedUpdateRoute" => marked_update,
  "markedUpdateVia" => marked_update_via,
  "precedence" => {
    "markedCreateBefore" => marked_create,
    "markedDeleteAfter" => marked_delete
  },
  "beforeActionsForUpdate" => update_actions,
  "uriFetch" => fetch_rows,
  "updateAction" => action_rows,
  "sources" => {
    "route" => route_source,
    "update" => update_source,
    "uriFetch" => uri_fetch_source,
    "standardUriFetch" => standard_fetch_source,
    "uriFetchOpts" => uri_fetch_opts_source,
    "beforeActions" => before_action_source,
    "pinnedVerbMatcher" => verb_matcher_source,
    "pinnedViaToRequestMethod" => via_source
  }
)
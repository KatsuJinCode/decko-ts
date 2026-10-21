# oracle-capture-marked-create-route-ruby.rb - the PINNED DECK's own MARKED
# create route, and the fetch and save its POST rides.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A14 row grades the port
# on engine_routes.rb line 36, `match ":mark(.:format)" => "card#create",
# via: :post`. It is the FIRST of the three RESTful-with-mark arms and the
# arm every real decko save posts to. This capture measures the registration
# (including the verb constraint the PINNED actionpack enforces), the
# before_action table's shape for create, the fetch branch the marked create
# takes, and the create action - so the row's verdict rests on the pinned
# arm, not on a reading.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:36
#                 match ":mark(.:format)" => "card#create", via: :post
#               Order 16, AFTER the typed create (line 33, order 15) and
#               BEFORE the (card)/create arm (line 46, order 24). One
#               segment: a two-segment path is NOT this route.
#
#   the verb    decko-0.20.0 -> actionpack-7.2.4, the chain the `via:`
#               option actually reaches:
#                 routing/mapper.rb:1953  via = Mapping.check_via Array(...)
#                 routing/mapper.rb:207-209 def request_method
#                                          @via.map { |x| Journey::Route.verb_matcher(x) }
#                 routing/mapper.rb:186    request_method_match: request_method
#                 journey/route.rb:183-185 def match_verb(request)
#                                          @request_method_match.any? { |m| m.call request }
#                 journey/route.rb:19-21   def self.call(req); req.post?; end
#               So `via: :post` is a POST-only route: a PUT or PATCH to the
#               same path does not match THIS route.
#
#   the table   decko-0.20.0/lib/card_controller.rb:20-25
#                 load_mark runs ONLY for :read; refresh_card runs for
#                 create|update|delete. A marked create NEVER runs
#                 load_mark - the mark rides the URL, not the implicit
#                 ladder. Its steps: setup, authenticate, load_card,
#                 refresh_card.
#
#   the fetch   card-1.110.0/lib/card/fetch/card_class.rb:104-115, 128-133
#                 uri_fetch: params[:action] == "create" -> Card.new
#                 card_opts (the A10 branch, reached here because the
#                 marked create dispatches to the SAME action);
#                 uri_fetch_opts: opts[:name] ||= Name[params[:mark]]
#                 &.tr "_", " " - the URL mark names the new card.
#
#   the action  decko-0.20.0/lib/card_controller/rest.rb:6-8
#                 def create; handle { card.save! }; end
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-marked-create-route-ruby.rb \
#     > fixtures/captured/marked-create-route-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

# The PINNED DECK's own route table, EXECUTED.
routes, raw_requirements = PinnedDeck.route_table_executed_with_requirements
marked_create_index = routes.index do |route|
  route["verb"] == "match" && route["action"] == "card#create" && route["patterns"].include?(":mark(.:format)")
end
raise "the marked create route was not found in the pinned route table" if marked_create_index.nil?

marked_create = routes[marked_create_index]
# The pinned via values for this arm, as the Draw received them (a Regexp
# stays a Regexp in raw_requirements, so the capture can ask the pinned
# value itself whether a segment matches it - the A3 precedent).
marked_create_via = raw_requirements[marked_create_index][:via]

# The arms this row's precedence rests on: the typed create that wins
# BEFORE it and the (card)/create that comes AFTER.
typed_create = routes.find { |route| route["verb"] == "post" && route["patterns"].include?("/type/:type") }
explicit_create = routes.find do |route|
  route["verb"] == "match" && route["action"] == "card#create" &&
    route["patterns"].any? { |pattern| pattern.include?("create") }
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

create_actions = actions_for(before_actions, "create")

# The PINNED DECK's own fetch, executed over recording doubles. The create
# branch's Card.new is recorded on the Card singleton (the ask is the opts
# hash the pinned method built), never replaced with an answer.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class << Card
  attr_reader :new_asks

  def new(card_opts = {})
    (@new_asks ||= []) << card_opts
    :new_card_recorded
  end
end

def marked_create_fetch_case(label, params)
  Card.instance_variable_set(:@new_asks, nil)
  Card.instance_variable_set(:@lookups, nil)
  Card.lookup_table = nil
  harness = Object.new
  harness.extend(Card::Fetch::CardClass)
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
    "newAsks" => (Card.instance_variable_get(:@new_asks) || []),
    "fetches" => (Card.lookups || []),
    "answer" => answer,
    "error" => error
  }
end

fetch_rows = [
  marked_create_fetch_case("the URL mark names the new card",
                          { action: "create", mark: "Target" }),
  marked_create_fetch_case("underscores in the URL mark become spaces (the .tr \"_\", \" \")",
                          { action: "create", mark: "My_Card" }),
  marked_create_fetch_case("the body's card[name] WINS over the URL mark (the ||=)",
                          { action: "create", mark: "Target", card: { name: "Other" } }),
  marked_create_fetch_case("a .json-suffixed mark: the route's (.:format) capture splits it in Rails,",
                          { action: "create", mark: "Target", format: "json" })
]
# The fourth row's label says the suffix is split in RAILS, not in the
# fetch: the fetch reads params[:mark], and the split happened when the
# router built params. The capture records the ask with the format already
# separated, which is what params[:mark] and params[:format] hold.

# The PINNED DECK's own create action, executed over the doubles.
def marked_create_action_case(label, card_name)
  card = PinnedDeck::CardDouble.new(name: card_name, new_card: true)
  harness = PinnedDeck::ControllerHarness.new(params: { card: { name: card_name } }, card: card)
  error = nil
  begin
    harness.create
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "cardName" => card_name,
    "error" => error,
    "cardCalls" => card.calls,
    "redirected" => harness.redirected,
    "rendered" => harness.rendered
  }
end

action_rows = [
  marked_create_action_case("the create action asks card.save! through handle", "Target")
]

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"].between?(33, 38) }
create_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(6, 8) }
handle_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(74, 77) }
uri_fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                             .select { |row| row["line"].between?(104, 115) }
uri_fetch_opts_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                                  .select { |row| row["line"].between?(128, 133) }
before_action_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller.rb")
                               .select { |row| row["line"].between?(20, 25) }
# The PINNED actionpack's own verb chain, so the row's verb constraint is
# carried by the source that enforces it, not by a paraphrase.
verb_matcher_source = PinnedDeck.pinned_lines(
  "actionpack-7.2.4/lib/action_dispatch/journey/route.rb"
).select { |row| row["line"].between?(14, 24) || row["line"].between?(183, 185) }
via_source = PinnedDeck.pinned_lines("actionpack-7.2.4/lib/action_dispatch/routing/mapper.rb")
                     .select { |row| row["line"].between?(207, 209) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A14",
  "gemset" => "decko-0.20.0 + card-1.110.0 + actionpack-7.2.4 (pinned)",
  "markedCreateRoute" => marked_create,
  "markedCreateVia" => Array(marked_create_via).map(&:to_s),
  "precedence" => {
    "typedCreateBefore" => typed_create,
    "explicitCreateAfter" => explicit_create
  },
  "beforeActionsForCreate" => create_actions,
  "uriFetch" => fetch_rows,
  "createAction" => action_rows,
  "sources" => {
    "route" => route_source,
    "create" => create_source,
    "handle" => handle_source,
    "uriFetch" => uri_fetch_source,
    "uriFetchOpts" => uri_fetch_opts_source,
    "beforeActions" => before_action_source,
    "pinnedVerbMatcher" => verb_matcher_source,
    "pinnedViaToRequestMethod" => via_source
  }
)
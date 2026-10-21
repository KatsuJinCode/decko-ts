# oracle-capture-marked-delete-route-ruby.rb - the PINNED DECK's own MARKED
# delete route, and the fetch and delete its DELETE rides.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A16 row grades the
# port on engine_routes.rb line 38, `match ":mark(.:format)" =>
# "card#delete", via: :delete`. It is the LAST of the three
# RESTful-with-mark arms and the only one whose verb is not shared with
# another write arm. This capture measures the registration (including the
# verb the PINNED actionpack enforces), the before_action table's shape for
# delete, the fetch branch the marked delete takes, and the delete action -
# so the row's verdict rests on the pinned arm, not on a reading.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:38
#                 match ":mark(.:format)" => "card#delete", via: :delete
#               Order 18, after the marked update (17) and the last of the
#               three marked write arms.
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
#               So this arm answers DELETE only. Every other write verb to
#               the same one-segment path belongs to another arm: POST the
#               marked create (16), PUT/PATCH the marked update (17).
#
#   the table   decko-0.20.0/lib/card_controller.rb:20-25
#                 load_mark runs ONLY for :read; refresh_card runs for
#                 create|update|delete. Like the marked create and the
#                 marked update, the marked delete NEVER runs load_mark.
#
#   the fetch   card-1.110.0/lib/card/fetch/card_class.rb:104-115, 118-133
#                 uri_fetch: only params[:action] == "create" takes the
#                 Card.new branch. A delete is not that branch, so it
#                 FETCHES the mark the way the update does -
#                 `mark = params[:mark] || card_opts[:name]` with
#                 new: card_opts, skip_modules: true.
#
#   the action  decko-0.20.0/lib/card_controller/rest.rb:18-20
#                 def delete
#                   handle { card.delete! }
#                 end
#               ONE arm, no new_card? branch: a delete is a delete whether or
#               not the card exists - which is the difference from the
#               update action (rest.rb:14-16) measured on row A15.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-marked-delete-route-ruby.rb \
#     > fixtures/captured/marked-delete-route-ruby-oracle.json
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
marked_delete_index = routes.index do |route|
  route["verb"] == "match" && route["action"] == "card#delete" && route["patterns"].include?(":mark(.:format)")
end
raise "the marked delete route was not found in the pinned route table" if marked_delete_index.nil?

marked_delete = routes[marked_delete_index]
marked_delete_via = Array(raw_requirements[marked_delete_index][:via]).map(&:to_s)

# The arms this row's precedence rests on: the marked update before it, and
# the markless delete (line 31, order 14) that answers the bare "/".
marked_update = routes.find do |route|
  route["verb"] == "match" && route["action"] == "card#update" && route["patterns"].include?(":mark(.:format)")
end
markless_delete = routes.find { |route| route["verb"] == "delete" && route["patterns"] == ["/"] }

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

# The PINNED DECK's own fetch, executed over a recording double. A delete is
# not the create branch, so uri_fetch reaches standard_uri_fetch and the
# FETCH ask is what this row's decision rests on.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class MarkedDeleteFetchHarness
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

def marked_delete_fetch_case(label, params)
  harness = MarkedDeleteFetchHarness.new
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
  marked_delete_fetch_case("the URL mark is FETCHED (not Card.new): a delete is not the create branch",
                           { action: "delete", mark: "Target" }),
  marked_delete_fetch_case("underscores ride the mark RAW; the FOLDED name rides the new: opts",
                           { action: "delete", mark: "My_Card" }),
  marked_delete_fetch_case("no URL mark: the body's card[name] is the mark",
                           { action: "delete", card: { name: "Target" } }),
  marked_delete_fetch_case("a .json-suffixed mark: the (.:format) capture split it in Rails before the fetch",
                           { action: "delete", mark: "Target", format: "json" }),
  marked_delete_fetch_case("look_in_trash rides params straight through to the fetch",
                           { action: "delete", mark: "Target", look_in_trash: true })
]

# The PINNED DECK's own delete action, executed over both new_card? answers -
# the action never ASKS, which is the measurement.
def marked_delete_action_case(label, new_card)
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
  marked_delete_action_case("an EXISTING card: card.delete!, one arm, no new_card? branch", false),
  marked_delete_action_case("a MISSING card: the same delete! ask - the action never asks new_card?", true)
]

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"].between?(35, 38) }
delete_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(18, 20) }
# The update action, quoted beside it: the delete's one-arm shape is only a
# finding against the update's two-arm shape on the same object.
update_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(14, 16) }
handle_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(74, 77) }
uri_fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                             .select { |row| row["line"].between?(104, 115) }
standard_fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                                  .select { |row| row["line"].between?(118, 126) }
before_action_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller.rb")
                               .select { |row| row["line"].between?(20, 25) }
# The PINNED actionpack's own verb chain, so the row's verb is carried by
# the source that enforces it.
verb_matcher_source = PinnedDeck.pinned_lines(
  "actionpack-7.2.4/lib/action_dispatch/journey/route.rb"
).select { |row| row["line"].between?(14, 24) || row["line"].between?(183, 185) }
via_source = PinnedDeck.pinned_lines("actionpack-7.2.4/lib/action_dispatch/routing/mapper.rb")
                     .select { |row| row["line"].between?(207, 209) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A16",
  "gemset" => "decko-0.20.0 + card-1.110.0 + actionpack-7.2.4 (pinned)",
  "markedDeleteRoute" => marked_delete,
  "markedDeleteVia" => marked_delete_via,
  "precedence" => {
    "markedUpdateBefore" => marked_update,
    "marklessDelete" => markless_delete
  },
  "beforeActionsForDelete" => delete_actions,
  "uriFetch" => fetch_rows,
  "deleteAction" => action_rows,
  "sources" => {
    "route" => route_source,
    "delete" => delete_source,
    "updateForContrast" => update_source,
    "handle" => handle_source,
    "uriFetch" => uri_fetch_source,
    "standardUriFetch" => standard_fetch_source,
    "beforeActions" => before_action_source,
    "pinnedVerbMatcher" => verb_matcher_source,
    "pinnedViaToRequestMethod" => via_source
  }
)
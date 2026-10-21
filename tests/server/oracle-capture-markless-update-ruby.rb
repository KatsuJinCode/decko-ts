# oracle-capture-markless-update-ruby.rb - the PINNED DECK's own markless
# update chain, executed: the route, the mark resolution, and the
# update-of-a-missing-home create fallback.
#
# WHY THIS SCRIPT EXISTS: the completeness register's C7 row grades the
# port on the markless `PUT /` ("resolves the implicit mark, L29 +
# mark.rb"). The row's note named the route and the resolution but not
# the CHAIN: which route matches, what mark a markless body-less update
# carries, and what happens when that mark names a card the deck does
# not have (Ruby's new-card branch makes the update a CREATE). This
# capture measures the chain from the PINNED side.
#
# THE MECHANISM, from the PINNED DECK's and the PINNED card gem's own
# files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:29-31
#                 put|patch "/" => "card#update"
#                 delete "/" => "card#delete"
#               No mark segment: load_mark runs with params[:mark] nil
#               (the table gives load_mark to :read only, but update's
#               card arrives through Card.uri_fetch params, whose mark
#               falls out of uri_fetch_opts the same way).
#
#   the update  decko-0.20.0/lib/card_controller/rest.rb:14-16
#                 def update
#                   card.new_card? ? create : handle { card.update! params[:card]&.to_unsafe_h }
#                 end
#               An update of a MISSING card (new_card?) is a CREATE -
#               the fallback this row's legs exercise.
#
#   the fetch   card-1.110.0/lib/card/fetch/card_class.rb:104-133
#                 def uri_fetch params
#                   card_opts = uri_fetch_opts params
#                   ...
#                 end
#                 def standard_uri_fetch params, card_opts
#                   mark = params[:mark] || card_opts[:name]
#                   card = fetch mark, new: card_opts, ...
#                 end
#                 def uri_fetch_opts params
#                   Env.hash(params[:card]).tap do |opts|
#                     opts[:type] ||= params[:type] if params[:type]
#                     opts[:name] ||= Name[params[:mark]]&.tr "_", " "
#                   end
#                 end
#               A MARKLESS request with a body card name fetches THAT
#               name; a body-less markless request fetches nil.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-markless-update-ruby.rb \
#     > fixtures/captured/markless-update-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!

# The PINNED DECK's own route table, EXECUTED.
routes = PinnedDeck.route_table_executed
markless = routes.select { |route| route["patterns"].include?("/") }

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# The fetch stand-in: the pinned Card.uri_fetch is recorded, not
# simulated - the capture records what mark the chain FETCHED, and the
# test deck supplies whether the fetch answers a card or nil.
class FetchProbe
  attr_reader :fetched_marks, :answer, :new_card

  def initialize(answer, new_card: false)
    @fetched_marks = []
    @answer = answer
    @new_card = new_card
  end

  def uri_fetch(params)
    card_opts = { name: params.dig(:card, :name) }
    mark = params[:mark] || card_opts[:name]
    @fetched_marks << mark
    @answer.nil? ? nil : PinnedDeck::CardDouble.new(name: @answer, new_card: @new_card)
  end
end

# The params hash wrapper the pinned update reads through
# (rest.rb:15 `params[:card]&.to_unsafe_h`) - the same stand-in the
# get-action-routes capture carries.
class CardParams < Hash
  def to_unsafe_h
    self
  end
end

def run_update_chain(probe:, params: {})
  params = params.transform_values { |value| value.is_a?(Hash) ? CardParams[value] : value }
  harness = PinnedDeck::ControllerHarness.new(params: params)
  error = nil
  begin
    # rest.rb:49-54 load_card, with the pinned uri_fetch swapped for the
    # recording probe (same signature, same mark rule - card_class.rb:104-133).
    harness.instance_variable_set(:@card, probe.uri_fetch(harness.params))
    # rest.rb:51 `raise Card::Error::NotFound unless card` - the update
    # never runs for a missing fetch. The rig's Card::Error stub carries
    # no NotFound class, so the constant is defined here with the pinned
    # superclass (card-1.110.0/lib/card/error.rb).
    unless Card::Error.const_defined?(:NotFound)
      Card::Error.const_set(:NotFound, Class.new(Card::Error))
    end
    raise Card::Error::NotFound if harness.instance_variable_get(:@card).nil?

    harness.send(:record_as_main)
    # rest.rb:14-16: the new-card branch IS create.
    harness.send(:update)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end

  {
    "params" => params,
    "fetchedMarks" => probe.fetched_marks,
    "cardCalls" => harness.card&.calls || [],
    "rendered" => harness.rendered,
    "redirected" => harness.redirected,
    "error" => error
  }
end

chain = {
  # The markless PUT with a body card name: THAT name is the mark.
  "bodyName" => run_update_chain(probe: FetchProbe.new("Target"), params: { card: { name: "Target" } }),
  # A body-less markless PUT: the fetched mark is nil - the chain bottoms
  # out at the empty fetch, and the controller answers NotFound.
  "noBody" => run_update_chain(probe: FetchProbe.new(nil), params: {}),
  # An update of a MISSING card answers new_card?: the pinned branch
  # makes it a CREATE.
  "missingCardIsCreate" => run_update_chain(probe: FetchProbe.new("Target", new_card: true), params: { card: { name: "Target" } })
}

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.route_lines_matching(/^\s+(post|put|patch|delete)\s+"\/"/)
update_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(6, 20) }
fetch_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/fetch/card_class.rb")
                         .select { |row| row["line"].between?(104, 133) }

puts JSON.pretty_generate(
  "row" => "reg-routes-C7",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "marklessRoutes" => markless,
  "chain" => chain,
  "sources" => {
    "routes" => route_source,
    "update" => update_source,
    "uriFetch" => fetch_source
  }
)

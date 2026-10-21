# oracle-capture-card-update-action-ruby.rb - the PINNED DECK's own update
# action: card#update (rest.rb:14-16), including its new-card -> create
# fallback.
#
# WHY THIS SCRIPT EXISTS: the completeness register's B3 row grades the port
# on the CONTROLLER METHOD `card#update` (rest.rb:14-16), not on a route
# line. The method carries TWO decisions of its own:
#
#   1. THE NEW-CARD FORK: `card.new_card? ? create : ...` - an update whose
#      target card does not exist SAVES a new card (the create action's own
#      save ask), it does not update one. The A13/A14/A18 route rows all
#      dispatch into this method, so the fork is where an update of a
#      missing mark becomes a create.
#   2. WHAT THE UPDATE ASKS FOR: `card.update! params[:card]&.to_unsafe_h`
#      - the body's card hash, converted with to_unsafe_h, and the safe
#      navigation `&.` makes a request with NO card hash pass nil to the
#      model instead of raising.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the action  decko-0.20.0/lib/card_controller/rest.rb:14-16
#                 def update
#                   card.new_card? ? create : handle { card.update! params[:card]&.to_unsafe_h }
#                 end
#
#   the create  rest.rb:6-8: `handle { card.save! }` - the arm the fork
#               takes for a NEW card (row B2's own evidence).
#
#   the handle  rest.rb:74-77: the success envelope is created with the
#               card's name and the block's value is the fork (row B2's own
#               evidence).
#
#   the update  the ask is the RAW card hash: to_unsafe_h is Rails'
#               ActionController::Parameters#to_unsafe_h, the method that
#               returns the parameters as a plain Hash with the permitted-
#               status guard REMOVED. So the update is NOT filtered by the
#               controller - the card receives every posted card attribute.
#
# WHAT THE RIG REACHES, stated exactly: the action, the fork, the update
# ask and its argument, the create arm, the handle and the success's 303
# redirect all execute here over the recording doubles. The create arm's
# own success lattice is row B2's evidence (and rows C4/C5's).
#
# THE PARAMS DOUBLE, named on its face: the rig's ControllerHarness holds
# the request params as a plain Hash, and a plain Hash has no to_unsafe_h.
# The capture therefore supplies a params double whose [:card] answers an
# ActionController::Parameters-shaped object (a Hash with to_unsafe_h) -
# the ONE surface the pinned update body touches (params[:card]). The
# double is a CAPTURE-LOCAL stand-in for Rails' own parameters object, and
# it is labelled as such in the fixture.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-card-update-action-ruby.rb \
#     > fixtures/captured/card-update-action-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The action bodies and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# Rails' ActionController::Parameters, stood in for: the pinned update body
# asks params[:card] for its to_unsafe_h (the method that returns the
# parameters as a plain Hash with the permitted-status guard removed).
class ParametersDouble
  def initialize(hash)
    @hash = hash
  end

  def [](key)
    @hash[key]
  end

  def key?(key)
    @hash.key?(key)
  end

  def fetch(key, *args)
    @hash.fetch(key, *args)
  end

  def to_unsafe_h
    @hash
  end
end

# The request params, as the pinned controller reads them: a
# Parameters-shaped object.
class RequestParams
  def initialize(hash)
    @hash = hash
  end

  def [](key)
    @hash[key]
  end

  def key?(key)
    @hash.key?(key)
  end

  def fetch(key, *args)
    @hash.fetch(key, *args)
  end

  def to_unsafe_h
    @hash
  end
end

# The card double that RECORDS what the update ask was handed.
class RecordingUpdateCardDouble < PinnedDeck::CardDouble
  attr_reader :update_args

  def update!(attrs)
    record(:"update!")
    @update_args = attrs
    { attrs: attrs }
  end
end

def update_action_case(label, card:, params:)
  harness = PinnedDeck::ControllerHarness.new(params: params, card: card)
  error = nil
  begin
    harness.update
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "error" => error,
    "cardCalls" => card.calls,
    "updateArgs" => card.respond_to?(:update_args) ? card.update_args : nil,
    "redirected" => harness.redirected,
    "rendered" => harness.rendered
  }
end

existing_card = RecordingUpdateCardDouble.new(name: "Front", known: true, new_card: false)
existing_row = update_action_case(
  "an update of an EXISTING card: the update ask carries the body's card hash",
  card: existing_card,
  params: RequestParams.new(card: ParametersDouble.new({ "name" => "Front", "content" => "body" }))
)

new_card = RecordingUpdateCardDouble.new(name: "Front", known: false, new_card: true)
new_row = update_action_case(
  "an update of a NEW card (card.new_card? is true): the create arm saves it instead",
  card: new_card,
  params: RequestParams.new(card: ParametersDouble.new({ "name" => "Front", "content" => "body" }))
)

nameless_card = RecordingUpdateCardDouble.new(name: "Front", known: true, new_card: false)
nameless_row = update_action_case(
  "an update with NO card hash in the body: the safe navigation passes nil to the model",
  card: nameless_card,
  params: RequestParams.new({})
)

action_rows = [existing_row, new_row, nameless_row]

# The pinned sources, quoted with line numbers.
update_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(14, 16) }
create_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                         .select { |row| row["line"].between?(6, 8) }
handle_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                         .select { |row| row["line"].between?(74, 77) }
load_card_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                           .select { |row| row["line"].between?(49, 54) }

puts JSON.pretty_generate(
  "row" => "reg-routes-B3",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "updateAction" => action_rows,
  "rigArtifacts" => [
    "the rig's ControllerHarness holds the request params as a plain Hash, and a plain Hash has no to_unsafe_h; the capture supplies a CAPTURE-LOCAL params double whose [:card] answers an ActionController::Parameters-shaped object (a Hash with to_unsafe_h). That double is the ONE surface the pinned update body touches."
  ],
  "sources" => {
    "update" => update_source,
    "create" => create_source,
    "handle" => handle_source,
    "loadCard" => load_card_source
  }
)

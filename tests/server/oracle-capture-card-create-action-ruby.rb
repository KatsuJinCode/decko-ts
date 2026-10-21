# oracle-capture-card-create-action-ruby.rb - the PINNED DECK's own create
# action: card#create (rest.rb:6-8) and the handle wrapper it rides.
#
# WHY THIS SCRIPT EXISTS: the completeness register's B2 row grades the port
# on the CONTROLLER METHOD `card#create` (rest.rb:6-8), not on a route line.
# Every route row in this family that ends in card#create (A10, A13, A14, A18)
# funnels into this method, and the method's own two decisions are the ones
# the port has to reproduce:
#
#   1. WHAT THE ACTION DOES: `handle { card.save! }` - one save on the card,
#      wrapped in the handle helper.
#   2. WHAT handle DOES (rest.rb:74-77):
#          def handle
#            Card::Env.success card.name
#            yield ? cud_success : raise(Card::Error::UserError)
#          end
#      The success envelope is created with the card's NAME, and the BLOCK'S
#      VALUE decides the outcome: a truthy save goes to cud_success, a
#      falsey save raises Card::Error::UserError - the 422 class
#      (card-1.110.0/lib/card/error.rb:20-21, 68-75).
#
# The A14 row's capture already executed the create action once (to pin the
# marked create's own dispatch); this capture is the row's own: it executes
# the action BOTH ways, records the name the pinned handle handed the success
# envelope, and records the UserError the falsey arm raises.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the action  decko-0.20.0/lib/card_controller/rest.rb:6-8
#                 def create
#                   handle { card.save! }
#                 end
#
#   the handle  decko-0.20.0/lib/card_controller/rest.rb:74-77
#                 def handle
#                   Card::Env.success card.name
#                   yield ? cud_success : raise(Card::Error::UserError)
#                 end
#
#   the envelope  card-1.110.0/lib/card/env.rb:31-33
#                   def success cardname=nil
#                     @success ||= Env::Success.new(cardname, params[:success])
#                   end
#                 ONE envelope per request, MEMOIZED, created with the card's
#                 name as its context and seeded with the request's
#                 success hash. That memoization is why the second
#                 `Card::Env.success` in cud_success (rest.rb:81) is the SAME
#                 envelope the handle created.
#
#   the target   card-1.110.0/lib/card/env/success.rb:19-22
#                   def to_url name_context=@name_context
#                     target = target name_context
#                     target.is_a?(Card) ? target.format.path(params) : target
#                   end
#                 The redirect target is the envelope's resolved TARGET
#                 card, not the context name.
#
# WHAT THE RIG REACHES, stated exactly: the action, the handle, the
# envelope creation and the truthiness fork all execute here over the
# recording doubles. cud_success executes too (rest.rb:80-89) and reaches
# the redirect arm; the success lattice ITSELF (reload? / slotter_magic? /
# redirect_cud_success) is rows C4/C5's own evidence and is quoted, not
# re-graded here.
#
# THE RIG ARTIFACT, named on its face: the loading rig's SuccessDouble
# answers `to_url` from the envelope's OWN name, and the rig's
# `Card::Env.success` builds a FRESH double per call. So the recorded
# redirect url is the rig's shape ("/" - the context name is not the
# envelope name in the rig), while the recorded STATUS (303) is the pinned
# one (response.rb:31 `hard_redirect success.to_url, 303`). The rig's own
# comment on the double says this out loud. The envelope NAMES the capture
# records are the pinned ones: the name the pinned handle handed the
# envelope is the card's name, and the second lookup carries no name.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-card-create-action-ruby.rb \
#     > fixtures/captured/card-create-action-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The action bodies and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

# The PINNED DECK's own controller, loaded: the create action, the handle
# helper and the cud_success ladder are the PINNED bodies.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# The envelope names the PINNED handle handed Card::Env.success, recorded by
# wrapping the rig's own accessor. The recorder is a CAPTURE-LOCAL wrapper
# (the loading rig is untouched): it records the name and delegates.
ENVELOPE_NAMES = []

module SuccessEnvelopeNameRecorder
  def success(name = nil)
    ENVELOPE_NAMES << name
    super
  end
end

Card::Env.singleton_class.prepend(SuccessEnvelopeNameRecorder)

# The card whose save! answers a FALSEY value, so the pinned handle's
# `yield ? cud_success : raise(Card::Error::UserError)` takes its second
# arm. The rig's own double always answers :saved (truthy).
class FalseySaveCardDouble < PinnedDeck::CardDouble
  def save!
    record(:save!)
    nil
  end
end

def create_action_case(label, card)
  harness = PinnedDeck::ControllerHarness.new(params: { card: { name: card.name } }, card: card)
  error = nil
  begin
    harness.create
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "cardName" => card.name,
    "error" => error,
    "cardCalls" => card.calls,
    "redirected" => harness.redirected,
    "rendered" => harness.rendered,
    "sentFile" => harness.sent_file
  }
end

def create_case(label, card_name)
  ENVELOPE_NAMES.clear
  card = PinnedDeck::CardDouble.new(name: card_name)
  row = create_action_case(label, card)
  row["envelopeNames"] = ENVELOPE_NAMES.dup
  row
end

def falsey_create_case(label, card_name)
  ENVELOPE_NAMES.clear
  card = FalseySaveCardDouble.new(name: card_name)
  row = create_action_case(label, card)
  row["envelopeNames"] = ENVELOPE_NAMES.dup
  row
end

action_rows = [
  create_case("the create action: handle { card.save! } - a truthy save goes to cud_success", "Front"),
  falsey_create_case("the falsey arm: handle raises Card::Error::UserError when the save answers falsey", "Front")
]

# The pinned sources, quoted with line numbers.
create_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(6, 8) }
handle_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                         .select { |row| row["line"].between?(74, 77) }
cud_success_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                             .select { |row| row["line"].between?(80, 89) }
env_success_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/env.rb")
                             .select { |row| row["line"].between?(31, 33) }
success_to_url_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/env/success.rb")
                                .select { |row| row["line"].between?(19, 22) }
user_error_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                           .select { |row| row["line"].between?(68, 75) }
error_status_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                             .select { |row| row["line"].between?(20, 21) }

puts JSON.pretty_generate(
  "row" => "reg-routes-B2",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "createAction" => action_rows,
  "rigArtifacts" => [
    "the rig's SuccessDouble answers to_url from the envelope's OWN name, and the rig's Card::Env.success builds a FRESH double per call; the PINNED Card::Env.success (card-1.110.0/lib/card/env.rb:31-33) MEMOIZES one envelope per request and seeds it with params[:success]. The recorded redirect URL is the rig's shape; the recorded redirect STATUS is the pinned one (response.rb:31)."
  ],
  "sources" => {
    "create" => create_source,
    "handle" => handle_source,
    "cudSuccess" => cud_success_source,
    "pinnedEnvSuccess" => env_success_source,
    "pinnedSuccessToUrl" => success_to_url_source,
    "pinnedUserError" => user_error_source,
    "pinnedErrorStatus" => error_status_source
  }
)

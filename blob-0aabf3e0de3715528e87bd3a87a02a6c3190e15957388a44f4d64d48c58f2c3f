# oracle-capture-card-delete-action-ruby.rb - the PINNED DECK's own delete
# action: card#delete (rest.rb:18-20), and the PINNED MODEL's own delete!
# that action asks.
#
# WHY THIS SCRIPT EXISTS: the completeness register's B4 row grades the port
# on the CONTROLLER METHOD `card#delete` (rest.rb:18-20). The method looks
# like a one-liner, and the one thing worth measuring is WHAT that one line
# does for a card that does not exist - because the port answers 422 for
# that case, and the reason has to be the pinned one.
#
# THE MECHANISM, from the PINNED DECK's and the PINNED CARD GEM's own files:
#
#   the action  decko-0.20.0/lib/card_controller/rest.rb:18-20
#                 def delete
#                   handle { card.delete! }
#                 end
#               ONE arm, and no fork on new_card? - the update action (row
#               B3) has two arms, this one has one.
#
#   the handle  rest.rb:74-77
#                 def handle
#                   Card::Env.success card.name
#                   yield ? cud_success : raise(Card::Error::UserError)
#                 end
#               The block's VALUE is the fork. So whatever card.delete!
#               answers decides between the success and the 422.
#
#   the delete  card-1.110.0/mod/core/set/all/trash.rb:17-21
#                 def delete! args={}
#                   add_to_trash args do |delete_args|
#                     update! delete_args
#                   end
#                 end
#               and the helper it rides, the same file at :70-72:
#                 def add_to_trash args
#                   yield args.merge(trash: true) unless new_card?
#                 end
#               TWO consequences, both measured here:
#                 1. a delete of an EXISTING card is a TRASH, not a row
#                    removal: the model is asked to update with
#                    {trash: true} - the pinned card keeps its row.
#                 2. a delete of a card that does NOT exist asks the model
#                    NOTHING at all (the `unless new_card?` guard skips the
#                    yield) and returns nil - FALSEY. The handle's fork
#                    turns that nil into Card::Error::UserError, the 422
#                    class. So the pinned 422 for a missing card is NOT a
#                    model exception: it is the handle's own truthiness
#                    fork answering a nil delete.
#
# WHAT THE RIG REACHES, stated exactly: the pinned action, the pinned
# handle, the pinned model's delete! and add_to_trash (the PINNED GEM's own
# mod file, evaluated into a module the capture's card double includes), and
# the handle's fork all execute here over the recording doubles. The
# success lattice after the truthy arm is row B2's evidence.
#
# THE RIG ARTIFACT, named on its face: the recorded redirect URL is the
# rig's SuccessDouble answer (the envelope's own name), not the pinned
# envelope's target card (card-1.110.0/lib/card/env/success.rb:19-22). The
# recorded redirect STATUS is the pinned one.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-card-delete-action-ruby.rb \
#     > fixtures/captured/card-delete-action-ruby-oracle.json
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

# The PINNED CARD GEM's own trash set, evaluated into a module: the file's
# method bodies (delete!, add_to_trash, trash?, delete) become real
# instance methods, and the file's two top-level statements (the
# empty_trash task registration and the three event registrations) are
# absorbed by the two stand-ins below, because the card gem's mod loader
# and task basket are not part of this row.
TRASH_SET = Module.new do
  def self.basket
    @basket ||= { tasks: {} }
  end

  def self.event(*_args, &_block)
    nil
  end
end

trash_path = PinnedDeck.pinned_path("card-1.110.0/mod/core/set/all/trash.rb")
TRASH_SET.module_eval(File.read(trash_path), trash_path)

# The card double the capture uses: the PINNED model's delete! and
# add_to_trash (prepended, so the pinned bodies win over the rig's own
# stand-in) over the rig's recording surface.
class TrashCardDouble < PinnedDeck::CardDouble
  prepend TRASH_SET

  attr_reader :update_args

  def update!(attrs)
    record(:"update!")
    @update_args = attrs
    { attrs: attrs }
  end
end

def delete_action_case(label, card)
  harness = PinnedDeck::ControllerHarness.new(params: {}, card: card)
  error = nil
  begin
    harness.delete
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "error" => error,
    "cardCalls" => card.calls,
    "updateArgs" => card.update_args,
    "redirected" => harness.redirected,
    "rendered" => harness.rendered
  }
end

existing_card = TrashCardDouble.new(name: "Front", known: true, new_card: false)
existing_row = delete_action_case(
  "a delete of an EXISTING card: the model is asked to update with trash: true",
  existing_card
)

missing_card = TrashCardDouble.new(name: "Front", known: false, new_card: true)
missing_row = delete_action_case(
  "a delete of a card that does NOT exist: the model is asked NOTHING and the handle raises the 422 class",
  missing_card
)

action_rows = [existing_row, missing_row]

# The pinned sources, quoted with line numbers.
delete_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(18, 20) }
handle_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                         .select { |row| row["line"].between?(74, 77) }
update_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                          .select { |row| row["line"].between?(14, 16) }
trash_delete_source = PinnedDeck.pinned_lines("card-1.110.0/mod/core/set/all/trash.rb")
                                .select { |row| row["line"].between?(17, 21) }
trash_helper_source = PinnedDeck.pinned_lines("card-1.110.0/mod/core/set/all/trash.rb")
                                .select { |row| row["line"].between?(70, 72) }
user_error_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                           .select { |row| row["line"].between?(20, 21) || row["line"].between?(68, 75) }

puts JSON.pretty_generate(
  "row" => "reg-routes-B4",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "deleteAction" => action_rows,
  "rigArtifacts" => [
    "the rig's SuccessDouble answers to_url from the envelope's OWN name, while the PINNED envelope resolves its TARGET card (card-1.110.0/lib/card/env/success.rb:19-22); the recorded redirect STATUS is the pinned one.",
    "the PINNED card gem's trash set file is evaluated into a module here, with its empty_trash task registration and its three event registrations absorbed by two stand-ins (a task basket and a no-op event). The card gem's mod loader is not part of this row; the file's delete! and add_to_trash bodies are the pinned ones and they execute."
  ],
  "sources" => {
    "delete" => delete_source,
    "handle" => handle_source,
    "update" => update_source,
    "pinnedTrashDelete" => trash_delete_source,
    "pinnedTrashHelper" => trash_helper_source,
    "pinnedUserError" => user_error_source
  }
)

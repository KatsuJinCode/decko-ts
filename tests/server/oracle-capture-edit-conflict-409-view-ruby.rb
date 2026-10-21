# oracle-capture-edit-conflict-409-view-ruby.rb - the PINNED card gem's own
# EditConflict class (error.rb:97-100), the KEY_MAP route that reaches it,
# and the ORDER in which that route is asked.
#
# WHY THIS SCRIPT EXISTS: the completeness register's C12 row grades the port
# on "EditConflict 409 + :conflict view (error.rb:97-100)". The class
# declares nothing beyond the pair - no card_message_text override, no
# report override - so the interesting decision on this row is NOT the class
# but the ROUTE to it and the ORDER that route is asked in:
#
#   invalid_card_error_class (error.rb:177-182) walks KEY_MAP in its
#   declaration order:
#
#     def invalid_card_error_class card
#       KEY_MAP.each do |key, klass|
#         return klass if card.errors.key? key
#       end
#       Card::Error
#     end
#
#   and KEY_MAP (:128-129) is `{ permission_denied: PermissionDenied,
#   conflict: EditConflict }`. So permission_denied is asked FIRST, and a
#   card carrying BOTH keys is a PermissionDenied (403), never an
#   EditConflict (409). That is the row's finding, and it is only visible by
#   executing the walk rather than reading the hash.
#
# The card's :conflict key has a producer, and this capture reads it rather
# than standing in for it: card-mod-history-0.20.0
# set/all/history/events.rb:19-22 adds the key on an update whose
# :edit_conflict? says the revision moved under a different actor
# (events.rb:65-72). The port's counterpart is its own detect_conflict
# validation, measured over HTTP in the parity test.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-edit-conflict-409-view-ruby.rb \
#     > fixtures/captured/edit-conflict-409-view-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require_relative "pinned-card-error-classes-ruby"

# The PINNED MOD's own format registry, loaded: the rescue's show ladder
# reaches respond, whose file arm is an `is_a?(Card::Format::FileFormat)`
# test (decko-0.20.0/lib/card_controller/response.rb:14).
load_pinned_format_registry!
raise "the pinned FileFormat was not loaded by the registry" unless defined?(Card::Format::FileFormat)

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!
unless PinnedDeck::ControllerHarness.include?(CardController::Errors)
  PinnedDeck::ControllerHarness.include(CardController::Errors)
end

# 1 - THE PAIR, AND WHAT THE CLASS DECLARES BEYOND IT. Unlike
# PermissionDenied, EditConflict declares NO method of its own: the surface
# it inherits is the base class's, so its card_message_text is
# `errors.first&.message` and its report is the base report.
class_rows = {
  "editConflictStatusCode" => Card::Error::EditConflict.status_code,
  "editConflictView" => Card::Error::EditConflict.view.to_s,
  "userErrorStatusCode" => Card::Error::UserError.status_code,
  "userErrorView" => Card::Error::UserError.view.to_s,
  "editConflictDeclaresOwnCardMessageText" => Card::Error::EditConflict
                                                 .instance_methods(false).include?(:card_message_text),
  "editConflictDeclaresOwnReport" => Card::Error::EditConflict.instance_methods(false).include?(:report),
  "editConflictDeclaresOwnStatus" => Card::Error::EditConflict.singleton_class
                                         .instance_methods(false).include?(:status_code),
  "editConflictDeclaresOwnView" => Card::Error::EditConflict.singleton_class
                                       .instance_methods(false).include?(:view),
  "editConflictIsUserErrorSubclass" => Card::Error::EditConflict.ancestors.include?(Card::Error::UserError)
}

# 2 - THE KEY_MAP ROUTE, AND ITS ORDER. KEY_MAP is declared inside
# `class << self` (:127), so the constant is on the SINGLETON class.
key_map = Card::Error.singleton_class.const_get(:KEY_MAP)
map_rows = {
  "keyMap" => key_map.map { |key, klass| [key.to_s, klass.to_s] },
  "keyMapOrder" => key_map.keys.map(&:to_s)
}

# 3 - THE ORDER, EXECUTED. The same PINNED invalid_card_error_class walk, over
# three bags, so the ORDER is a measurement and not a reading.
def cardify_record_invalid(errors_bag)
  card = ErrorRowCardInstance.new(name: "Conflicted", errors: errors_bag)
  exception = rescued_exception(ActiveRecord::RecordInvalid, "validation failed")
  harness = PinnedDeck::ControllerHarness.new(params: {}, card: card, request: ErrorRowRequestDouble.new)
  harness.instance_variable_set(:@card, card)
  Card::Error.current = nil
  harness.send(:handle_exception, exception)
  {
    "errorsBag" => card.errors.entries.map { |entry| { "key" => entry.key.to_s, "message" => entry.message } },
    "errorsAsks" => card.errors.calls,
    "cardifiedClass" => Card::Error.current.class.to_s,
    "view" => Card::Error.current.class.view.to_s,
    "statusCode" => Card::Error.current.class.status_code,
    "rendered" => harness.rendered
  }
end

order_rows = {
  # Only :conflict: the walk asks permission_denied (absent), then conflict
  # (present), and EditConflict answers.
  "conflictOnly" => cardify_record_invalid(
    RecordedErrors.new({ conflict: "someone else saved first" })
  ),
  # BOTH keys: the walk STOPS at permission_denied, so this is a 403 denial
  # and never the 409 the card's conflict key would have produced.
  "bothKeys" => cardify_record_invalid(
    RecordedErrors.new({ permission_denied: "not yours", conflict: "someone else saved first" })
  ),
  # The same bag in the OTHER order: the walk still asks by KEY, not by
  # position in the bag, so this is still a 403.
  "bothKeysConflictFirst" => cardify_record_invalid(
    RecordedErrors.new({ conflict: "someone else saved first", permission_denied: "not yours" })
  ),
  # Neither key: the walk falls through to the base Card::Error (422).
  "neitherKey" => cardify_record_invalid(
    RecordedErrors.new({ name: "must be present" })
  )
}

# 4 - THE INHERITED MESSAGE. EditConflict does not override
# card_message_text, so its answer is the base class's `errors.first&.message`
# - which, for the bag the port's detector builds, IS the conflict message.
conflict_card = ErrorRowCardInstance.new(
  name: "Conflicted",
  errors: RecordedErrors.new({ conflict: "changes not based on latest revision" })
)
conflict_error = Card::Error::EditConflict.new("raised instance")
conflict_error.card = conflict_card
denial_card = ErrorRowCardInstance.new(
  name: "Denied",
  errors: RecordedErrors.new({ permission_denied: "not yours" })
)
denial_error = Card::Error::PermissionDenied.new("raised instance")
denial_error.card = denial_card
message_rows = {
  "label" => "the two classes read their message from DIFFERENT places on the same bag",
  "conflictErrorsBag" => conflict_card.errors.entries.map { |entry| { "key" => entry.key.to_s, "message" => entry.message } },
  "editConflictCardMessageText" => conflict_error.card_message_text,
  "editConflictErrorsAsks" => conflict_card.errors.calls,
  "denialErrorsBag" => denial_card.errors.entries.map { |entry| { "key" => entry.key.to_s, "message" => entry.message } },
  "permissionDeniedCardMessageText" => denial_error.card_message_text,
  "permissionDeniedErrorsAsks" => denial_card.errors.calls
}

# 5 - THE REPORT, for the record: inherited, so it reads and writes the bag
# and does NOT note the exception (ServerError is the only class that does).
notable_card = ErrorRowCardInstance.new(name: "Conflicted")
harness = PinnedDeck::ControllerHarness.new(
  params: {}, card: notable_card, request: ErrorRowRequestDouble.new
)
harness.instance_variable_set(:@card, notable_card)
Card::Error.current = nil
harness.send(:handle_exception, rescued_exception(Card::Error::EditConflict, "stale revision"))
report_row = {
  "view" => Card::Error.current.class.view.to_s,
  "statusCode" => Card::Error.current.class.status_code,
  "rendered" => harness.rendered,
  "cardErrorsCalls" => notable_card.errors.calls,
  "cardErrorsEntries" => notable_card.errors.entries.map { |entry| { "key" => entry.key.to_s, "message" => entry.message } },
  "errorRowCalls" => notable_card.error_row_calls,
  "notableExceptionRaisedCalled" => notable_card.error_row_calls.include?(:notable_exception_raised)
}

# The pinned sources, quoted with line numbers. The history mod's detector is
# READ (not executed - it is a Rails event declaration, and this capture has
# no event bus), so the key's producer is quoted from the pinned gem.
class_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                       .select { |row| row["line"].between?(95, 100) }
walk_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                     .select { |row| row["line"].between?(164, 182) }
detector_source = PinnedDeck.pinned_lines("card-mod-history-0.20.0/set/all/history/events.rb")
                          .select { |row| row["line"].between?(19, 22) || row["line"].between?(63, 73) }

puts JSON.pretty_generate(
  "row" => "reg-routes-C12",
  "gemset" => "decko-0.20.0 + card-1.110.0 + card-mod-history-0.20.0 (pinned)",
  "classes" => class_rows,
  "keyMap" => map_rows,
  "cardifyOrder" => order_rows,
  "cardMessageText" => message_rows,
  "report" => report_row,
  "rigArtifacts" => [
    "the card's :conflict key has a producer that this capture READS rather than executes: card-mod-history-0.20.0 set/all/history/events.rb declares a Rails event (`:detect_conflict, :validate, on: :update, when: :edit_conflict?`) and there is no event bus here to fire it. The quoted lines are the pinned gem's own bytes, so the producer is attributable even though it was not run; the port's counterpart IS executed, over HTTP, in this row's parity test.",
    "ActiveRecord::RecordInvalid is stood in as a real distinct class by the error rows' loader (tests/server/pinned-card-error-classes-ruby.rb), because card_error_class's case dispatches on that very class (error.rb:167-169) and this row's whole subject is that dispatch.",
    "a rescued exception is given a backtrace before the rescue runs: StandardError#report (error.rb:7-8) reads backtrace[0..MAX_BACKTRACE_LINES] and would raise NoMethodError on a never-raised exception's nil. The backtrace is a fixed two-frame value, so the fixture stays byte-stable."
  ],
  "sources" => {
    "editConflictClass" => class_source,
    "cardifyAndKeyMapWalk" => walk_source,
    "historyConflictDetector" => detector_source
  }
)
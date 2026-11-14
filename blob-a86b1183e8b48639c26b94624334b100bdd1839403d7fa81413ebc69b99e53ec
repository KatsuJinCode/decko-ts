# oracle-capture-user-error-422-view-ruby.rb - the PINNED card gem's own
# DEFAULT pair (error.rb:20-21) read off every class in the pinned ladder,
# the PINNED user_error_classes roster (:68-75), the PINNED bare raise the
# deck's handle makes (rest.rb:76), and the :errors view's second producer.
#
# WHY THIS SCRIPT EXISTS: the completeness register's C13 row grades the port
# on "UserError/validation 422 + :errors view (error.rb:20-21, 68-75)". Those
# cited lines are two statements and one assignment:
#
#     self.view = :errors          # error.rb:20  - on Card::Error ITSELF
#     self.status_code = 422       # error.rb:21  - on Card::Error ITSELF
#     ...
#     class UserError < Error      # error.rb:68  - declares NO pair
#       cattr_accessor :user_error_classes
#       self.user_error_classes = [self, ActionController::BadRequest,
#                                  ActionController::MissingFile,
#                                  ActiveRecord::RecordNotFound,
#                                  ActiveRecord::RecordInvalid]
#     end                         # error.rb:75
#
# So 422 and :errors are DEFAULTS, not UserError's own answers, and the
# consequence is a property of the whole ladder: every class that does not
# write a pair of its own answers 422 and :errors, whichever subclass it is.
# Reading the two lines proves nothing about UserError; walking the ladder
# proves it for BadQuery, for CodenameNotFound and for every other
# undeclared class in the same file. That is what this capture does.
#
# The roster is a cattr_accessor, so a deck can REPLACE it - which is the
# other decision on this row, and it is measured by writing and reading it
# back rather than by reading the assignment.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-user-error-422-view-ruby.rb \
#     > fixtures/captured/user-error-422-view-ruby-oracle.json
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

# 1 - THE WHOLE PINNED LADDER, each class's own (view, status_code) and
# whether it WROTE that pair itself or inherited it. "Declares its own" is
# read off the singleton class's own instance methods, which is what
# class_attribute's assignment leaves there - so a class that never assigned
# is genuinely undeclared rather than merely equal.
ladder_classes = [
  Card::Error,
  Card::Error::UserError,
  Card::Error::BadQuery,
  Card::Error::BadAddress,
  Card::Error::NotFound,
  Card::Error::CodenameNotFound,
  Card::Error::EditConflict,
  Card::Error::PermissionDenied,
  Card::Error::ServerError
]
ladder = ladder_classes.map do |klass|
  {
    "class" => klass.to_s,
    "statusCode" => klass.status_code,
    "view" => klass.view.to_s,
    "declaresOwnStatus" => klass.singleton_class.instance_methods(false).include?(:status_code),
    "declaresOwnView" => klass.singleton_class.instance_methods(false).include?(:view),
    "superclass" => klass.superclass.to_s
  }
end

# 2 - THE ROSTER, AND THE FACT THAT A DECK CAN REPLACE IT. The reader is
# read first, then a replacement is written and read back, then the pinned
# value is restored so the fixture's later rows still see the pinned deck's
# own roster.
roster_before = Card::Error::UserError.user_error_classes.map(&:to_s)
roster_writable = Card::Error::UserError.respond_to?(:user_error_classes=)
replacement = [Card::Error::UserError]
Card::Error::UserError.user_error_classes = replacement
roster_after_write = Card::Error::UserError.user_error_classes.map(&:to_s)
Card::Error::UserError.user_error_classes = roster_before.map { |name| Object.const_get(name) }
roster_restored = Card::Error::UserError.user_error_classes.map(&:to_s)
roster_rows = {
  "rosterAsPinned" => roster_before,
  "rosterWriterExists" => roster_writable,
  "rosterAfterADeckReplacedIt" => roster_after_write,
  "rosterRestoredToPinned" => roster_restored,
  # The roster's first entry is UserError ITSELF, not one of its subclasses.
  "rosterNamesUserErrorItself" => roster_before.first,
  "rosterNamesNotFound" => roster_before.include?("Card::Error::NotFound"),
  "rosterNamesServerError" => roster_before.include?("Card::Error::ServerError")
}

# 3 - THE BARE RAISE. `handle` (decko-0.20.0/lib/card_controller/rest.rb:74-77)
# does `yield ? cud_success : raise(Card::Error::UserError)` - a UserError
# with NO MESSAGE. Executed through the pinned rescue over a card whose bag
# is empty: what does the :errors view have to show?
bare_card = ErrorRowCardInstance.new(name: "Doomed")
bare_harness = PinnedDeck::ControllerHarness.new(
  params: {}, card: bare_card, request: ErrorRowRequestDouble.new
)
bare_harness.instance_variable_set(:@card, bare_card)
Card::Error.current = nil
bare_error = Card::Error::UserError.new
bare_error.set_backtrace(RESCUED_BACKTRACE.dup)
bare_harness.send(:handle_exception, bare_error)
bare_row = {
  "label" => "the bare raise: a UserError with no message, over a card whose errors bag is empty",
  "raisedMessage" => bare_error.message,
  "view" => Card::Error.current.class.view.to_s,
  "statusCode" => Card::Error.current.class.status_code,
  # add_card_errors wrote the class name as the key, so the bag is no longer
  # empty and the message the view reads is the bare raise's own (nil) text.
  "cardErrorsCalls" => bare_card.errors.calls,
  "cardErrorsEntries" => bare_card.errors.entries.map { |entry| { "key" => entry.key.to_s, "message" => entry.message } },
  "cardMessageText" => Card::Error.current.card_message_text,
  "rendered" => bare_harness.rendered
}

# The same bare raise over a card that ALREADY had an error: add_card_errors
# is guarded by `card.errors.empty?` (:155), so the pre-existing error stays
# and is the one the view shows.
occupied_card = ErrorRowCardInstance.new(
  name: "Busy",
  errors: RecordedErrors.new({ name: "must be present" })
)
occupied_harness = PinnedDeck::ControllerHarness.new(
  params: {}, card: occupied_card, request: ErrorRowRequestDouble.new
)
occupied_harness.instance_variable_set(:@card, occupied_card)
Card::Error.current = nil
occupied_harness.send(:handle_exception, rescued_exception(Card::Error::UserError, "that will not do"))
occupied_row = {
  "label" => "a UserError with a message, over a card whose bag already holds one",
  "view" => Card::Error.current.class.view.to_s,
  "statusCode" => Card::Error.current.class.status_code,
  "cardErrorsCalls" => occupied_card.errors.calls,
  "cardErrorsEntries" => occupied_card.errors.entries.map { |entry| { "key" => entry.key.to_s, "message" => entry.message } },
  "cardMessageText" => Card::Error.current.card_message_text
}

# 4 - THE :errors VIEW'S SECOND PRODUCER, quoted rather than executed. An
# UNSUPPORTED VIEW raises a bare Card::Error::UserError with a message
# (card-1.110.0/lib/card/format/render.rb's view_method), so a request for a
# view the card's type does not carry is the 422/:errors pair from a
# completely different direction than a validation failure. The port's
# counterpart is its own unsupported-view UserError.
unsupported_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/format/render.rb")
                                 .select { |row| row["line"].between?(66, 74) }
errors_view_source = PinnedDeck.pinned_lines("card-mod-format-0.20.0/set/all/html/error.rb")
                               .select { |row| row["line"].between?(53, 65) }
standard_errors_source = PinnedDeck.pinned_lines("card-mod-format-0.20.0/set/all/html/error.rb")
                                  .select { |row| row["line"].between?(120, 135) }

# The pinned sources, quoted with line numbers.
defaults_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                       .select { |row| row["line"].between?(15, 22) }
user_error_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                        .select { |row| row["line"].between?(67, 76) }
add_card_errors_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                             .select { |row| row["line"].between?(153, 162) }
handle_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                      .select { |row| row["line"].between?(74, 77) }

puts JSON.pretty_generate(
  "row" => "reg-routes-C13",
  "gemset" => "decko-0.20.0 + card-1.110.0 + card-mod-format-0.20.0 (pinned)",
  "ladder" => ladder,
  "roster" => roster_rows,
  "bareRaise" => [bare_row, occupied_row],
  "rigArtifacts" => [
    "the :errors VIEW BODY (card-mod-format-0.20.0 set/all/html/error.rb:53-65) is QUOTED, not executed: it is a view declaration on a format set module and reaching it needs the whole render stack - the view registry, the alert helper, the i18n title and the card's own error objects. The row's cited lines are error.rb:20-21 and :68-75, which this capture executes; the view body is quoted so the pair's destination is attributable, and the port's own :errors alert is executed over HTTP in the parity test.",
    "the unsupported-view UserError (card-1.110.0/lib/card/format/render.rb's view_method) is QUOTED for the same reason: `supports_view?` needs the view registry this capture does not build. It is the :errors pair's SECOND producer and it is named here rather than claimed as measured.",
    "the roster is written and restored inside the capture: user_error_classes is a cattr_accessor (:69), so the capture writes a one-entry roster, reads it back, and restores the pinned five. That is the measurement of the cattr - a reader alone would prove nothing about writability."
  ],
  "sources" => {
    "cardErrorDefaults" => defaults_source,
    "userErrorAndRoster" => user_error_source,
    "addCardErrors" => add_card_errors_source,
    "handleBareRaise" => handle_source,
    "unsupportedViewUserError" => unsupported_source,
    "errorsView" => errors_view_source,
    "standardErrors" => standard_errors_source
  }
)
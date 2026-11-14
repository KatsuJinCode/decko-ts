# oracle-capture-error-rescue-path-ruby.rb - the PINNED DECK's own
# handle_exception, executed over every branch of the rescue path, and the
# PINNED card gem's own Card::Error.report over every branch of cardify.
#
# WHY THIS SCRIPT EXISTS: the completeness register's C9 row grades the port
# on "Error rescue -> Card::Error.report -> show(error.class.view,
# status)" (decko-0.20.0/lib/card_controller/errors.rb:18-24). That is the
# hinge every other error row hangs on - C10 through C15 each name ONE of the
# (view, status_code) pairs this line hands to show, and no row has measured
# the line itself. It has four decisions:
#
#   1. THE DEBUGGER RE-RAISE (errors.rb:19 `raise exception if
#      debug_exception?(exception)`). debug_exception? (:27-32) is NOT a
#      class test: it excludes Card::Error::UserError and
#      ActiveRecord::RecordInvalid by class, and then asks
#      `Card::Codename[:debugger] && Card[:debugger]&.content =~ /on`. So the
#      codename alone is not the debugger being on, and a UserError is
#      exempt however the debugger is set.
#   2. THE CARD IS THE ONE ALREADY LOADED (`@card ||= Card.new`,
#      errors.rb:21). A controller that never loaded a card gets a BARE Card
#      here, and that bare card is what the report is handed.
#   3. THE REPORT IS THE PINNED CARDYFY (card-1.110.0/lib/card/error.rb:131-136
#      -> :146-157). An exception that is ALREADY a Card::Error passes
#      through unchanged; anything else is rebuilt as a NEW
#      `card_error_class(exception, card).new exception.message` - so the
#      class the rescue renders is a CHOICE the report makes, not the class
#      that was raised.
#   4. THE HANDOFF IS (class view, class status_code) - errors.rb:23
#      `show error.class.view, error.class.status_code`, both read off the
#      CLASS, never off the instance. A cardified ServerError therefore
#      renders whatever its class says today, including the debugger's 900.
#
# WHAT THE RIG REACHES, stated exactly: the PINNED error file is evaluated
# (pinned-card-error-classes-ruby.rb is its loader), so every view,
# status_code, user_error_classes roster, KEY_MAP and report side effect
# below is the pinned class's own answer. The PINNED controller's Errors,
# Rest and Response modules run; the show ladder and respond run; what
# reaches the wire is recorded.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-error-rescue-path-ruby.rb \
#     > fixtures/captured/error-rescue-path-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require_relative "pinned-card-error-classes-ruby"

# The PINNED MOD's own format registry, loaded: respond's file arm is an
# `is_a?(Card::Format::FileFormat)` test
# (decko-0.20.0/lib/card_controller/response.rb:14) and the show ladder
# reaches respond, so the PINNED class has to exist.
load_pinned_format_registry!
raise "the pinned FileFormat was not loaded by the registry" unless defined?(Card::Format::FileFormat)

# The PINNED DECK's own controller, loaded: its four modules and its
# before_action table.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!
# handle_exception lives in the Errors module, which the rig's harness does
# not include (the harness includes Response, Rest and Mark). The pinned
# module is what gets included here - not a copy of it.
unless PinnedDeck::ControllerHarness.include?(CardController::Errors)
  PinnedDeck::ControllerHarness.include(CardController::Errors)
end

# The RESCUE TABLE the pinned controller builds at boot
# (card_controller.rb:27-28): which exceptions get a rescue_from, and whether
# the StandardError net is armed at all.
rescue_table = {
  "userErrorClasses" => Card::Error::UserError.user_error_classes.map(&:to_s),
  "cardioRescueAllInController" => Cardio.config.rescue_all_in_controller,
  # rescue_all? is a class method of the pinned Errors::Rescue module, which
  # card_controller.rb:9 EXTENDS onto CardController - so the pinned class
  # is who answers, not the harness.
  "rescueAll" => CardController.rescue_all?,
  "standardErrorRescueArmed" => !!CardController.rescue_all?
}

# Run the PINNED handle_exception over one exception and report what it
# answered.
def rescue_case(label, exception:, debugger: nil, card: nil, params: {})
  Card::Codename.configured = debugger.nil? ? nil : true
  # report's own side effect is `self.current = e` (error.rb:133). Clearing it
  # before each case means a row that never reached report reads null rather
  # than the previous row's class.
  Card::Error.current = nil
  # `Card[:debugger]&.content =~ /on` - the SECOND half of the debugger test.
  # The rig's Card[] wraps a lookup entry in its RuleCard, whose `content` is
  # the entry (the loader's one addition), so the lookup table below IS the
  # debugger card's content.
  Card.lookup_table = debugger.nil? ? {} : { "debugger" => debugger == true ? DEBUGGER_CONTENT : debugger }

  harness_class = card.nil? ? NoCardLoadedHarness : PinnedDeck::ControllerHarness
  harness = harness_class.new(params: params, request: ErrorRowRequestDouble.new)
  harness.card = card unless card.nil?
  # handle_exception reads `@card ||= Card.new` (errors.rb:21) - the
  # CONTROLLER's own ivar, not a writer. A loaded card sets it; the no-card
  # case leaves it nil and lets the pinned ||= make a bare Card.
  harness.instance_variable_set(:@card, card) unless card.nil?

  raised = nil
  begin
    harness.send(:handle_exception, exception)
  rescue StandardError => e
    raised = "#{e.class}: #{e.message}"
  end

  {
    "label" => label,
    # The debugger test's TWO halves, recorded separately because they are
    # two questions: is the codename configured, and what does the card's own
    # content read.
    "debuggerCodenameConfigured" => !debugger.nil?,
    "debuggerCardContent" => debugger == true ? DEBUGGER_CONTENT : debugger,
    "exceptionClass" => exception.class.to_s,
    "exceptionMessage" => exception.message,
    # A re-raise means the rescue never reached report or show: this string
    # is the finding when it is not nil.
    "raisedOutOfHandleException" => raised,
    # Card::Error.report's side effect: `self.current = e` (:133).
    "cardErrorCurrent" => Card::Error.current&.class&.to_s,
    "cardErrorCurrentView" => Card::Error.current&.class&.view,
    "cardErrorCurrentStatus" => Card::Error.current&.class&.status_code,
    "cardErrorCurrentCardName" => Card::Error.current&.card&.name,
    # What show answered.
    "rendered" => harness.rendered,
    "redirected" => harness.redirected,
    # The card the render ran through, and its calls.
    "cardName" => card&.name,
    "cardCalls" => card&.calls,
    "cardErrorsCalls" => card&.errors&.calls,
    "cardErrorsEntries" => card&.errors&.entries&.map { |entry| { "key" => entry.key.to_s, "message" => entry.message } },
    # The card the pinned ||= made when nothing was loaded: recorded through
    # the same surface, so the reader sees what that bare Card was asked.
    "bareCardErrorsCalls" => card.nil? ? Card::Error.current&.card&.errors&.calls : nil,
    "bareCardErrorsEntries" => card.nil? ? Card::Error.current&.card&.errors&.entries&.map { |entry| { "key" => entry.key.to_s, "message" => entry.message } } : nil,
    "pageCalls" => card&.page_calls
  }
ensure
  Card::Codename.configured = DEBUGGER_CONFIGURED
  Card.lookup_table = {}
end

rows = []

# BRANCH 1 - an exception that is ALREADY a Card::Error passes through
# cardify unchanged (error.rb:148 `if exception.is_a? Card::Error`), so the
# view and status are the raised class's own. NotFound is the representative.
rows << rescue_case(
  "an exception that is already a Card::Error passes through cardify unchanged",
  exception: rescued_exception(Card::Error::NotFound, "no such card"),
  card: ErrorRowCardInstance.new(name: "Missing")
)

# BRANCH 2 - a bare StandardError is cardified to ServerError
# (error.rb:173), and ServerError's report asks the card to note it
# (error.rb:63 `card&.notable_exception_raised`).
rows << rescue_case(
  "a bare StandardError is cardified to ServerError, and its report asks the card to note it",
  exception: rescued_exception(RuntimeError, "boom"),
  card: ErrorRowCardInstance.new(name: "Server")
)

# BRANCH 3 - ActiveRecord::RecordNotFound is cardified to NotFound
# (error.rb:170).
rows << rescue_case(
  "an ActiveRecord::RecordNotFound is cardified to NotFound",
  exception: rescued_exception(ActiveRecord::RecordNotFound, "row gone"),
  card: ErrorRowCardInstance.new(name: "Gone")
)

# BRANCH 4 - ActiveRecord::RecordInvalid is cardified by the card's OWN
# errors (error.rb:168 -> invalid_card_error_class :177-182): KEY_MAP's
# :permission_denied routes to PermissionDenied, and a card with neither key
# falls all the way to the BASE Card::Error - whose default view is :errors
# and whose default status is 422 (error.rb:20-21).
invalid_permission = ErrorRowCardInstance.new(
  name: "Denied",
  errors: RecordedErrors.new(permission_denied: "not yours"),
)
rows << rescue_case(
  "a RecordInvalid whose card carries :permission_denied is cardified to PermissionDenied",
  exception: rescued_exception(ActiveRecord::RecordInvalid, "invalid"),
  card: invalid_permission
)

invalid_conflict = ErrorRowCardInstance.new(
  name: "Conflicted",
  errors: RecordedErrors.new(conflict: "someone else saved first"),
)
rows << rescue_case(
  "a RecordInvalid whose card carries :conflict is cardified to EditConflict",
  exception: rescued_exception(ActiveRecord::RecordInvalid, "invalid"),
  card: invalid_conflict
)

invalid_plain = ErrorRowCardInstance.new(
  name: "Invalid",
  errors: RecordedErrors.new(name: "must be present"),
)
rows << rescue_case(
  "a RecordInvalid whose card carries NEITHER key falls to the base Card::Error",
  exception: rescued_exception(ActiveRecord::RecordInvalid, "invalid"),
  card: invalid_plain
)

# BRANCH 5 - THE DEBUGGER RE-RAISE. errors.rb:19 raises before report and
# before show, so nothing renders. This is the same ServerError row with the
# debugger on.
rows << rescue_case(
  "the debugger re-raise: a ServerError with the debugger on never reaches report or show",
  exception: rescued_exception(RuntimeError, "boom"),
  debugger: true,
  card: ErrorRowCardInstance.new(name: "Server")
)

# ... and the codename ALONE is not the debugger being on: the pinned test
# is `Card::Codename[:debugger] && Card[:debugger]&.content =~ /on`
# (errors.rb:30-31), so an "off" debugger card lets the rescue run.
rows << rescue_case(
  "the codename alone is not the debugger: an off debugger card still renders the server error",
  exception: rescued_exception(RuntimeError, "boom"),
  debugger: "off",
  card: ErrorRowCardInstance.new(name: "Server")
)

# ... and a UserError is EXEMPT from the debugger test whatever the debugger
# says (errors.rb:28 `!e.is_a?(Card::Error::UserError)`), so it renders even
# with the debugger on - and it renders its OWN class's view, because it was
# already a Card::Error and cardify left it alone.
rows << rescue_case(
  "a UserError is exempt from the debugger test and still renders",
  exception: rescued_exception(Card::Error::UserError, "that will not do"),
  debugger: true,
  card: ErrorRowCardInstance.new(name: "Rebuked")
)

# BRANCH 6 - `@card ||= Card.new` (errors.rb:21). A controller that never
# loaded a card gets a BARE Card, and the report is handed THAT: its errors
# bag is empty, so add_card_errors writes into it.
rows << rescue_case(
  "with no card loaded, the pinned ||= makes a bare Card, the report writes into ITS errors bag, and the render that follows is a RIG ARTIFACT",
  exception: rescued_exception(RuntimeError, "boom")
)

# The pinned sources, quoted with line numbers.
errors_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/errors.rb")
                         .select { |row| row["line"].between?(18, 32) }
show_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                      .select { |row| row["line"].between?(91, 97) }
report_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                        # The roster (UserError.user_error_classes, :68-75), the
                        # base defaults (:20-21), ServerError and its debugger
                        # arm (:46-65), and the report/cardify block (:127-183):
                        # everything handle_exception's answer is read out of.
                        .select { |row| row["line"].between?(20, 21) || row["line"].between?(46, 75) || row["line"].between?(127, 183) }
controller_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller.rb")
                           .select { |row| row["line"].between?(26, 29) }

puts JSON.pretty_generate(
  "row" => "reg-routes-C9",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "rescueTable" => rescue_table,
  "cases" => rows,
  "rigArtifacts" => [
    "the PINNED card gem's error file is EVALUATED by the error rows' loader (tests/server/pinned-card-error-classes-ruby.rb), so every view, status_code, user_error_classes roster, KEY_MAP and report side effect here is the pinned class's own answer read through the pinned class. The rig's own two-class Card::Error is replaced by the pinned ladder when that file loads; that replacement is the measurement.",
    "ActionController::BadRequest, ActionController::MissingFile, ActiveRecord::RecordNotFound and ActiveRecord::RecordInvalid are stood in as REAL DISTINCT CLASSES by the loader, because the pinned file names all four at class-body evaluation (error.rb:72-74) and card_error_class's `when` arms (error.rb:167-173) are case-equality matches on those very objects. A single stand-in class would collapse three of the four arms.",
    "a rescued exception is given a backtrace before the rescue runs: StandardError#report (error.rb:7-8) reads backtrace[0..MAX_BACKTRACE_LINES], which would raise NoMethodError on a never-raised exception's nil. The backtrace is a fixed two-frame value, so the fixture stays byte-stable.",
    "Card::Codename[:debugger] and Card[:debugger].content are RECORDED answers, not pinned code: the rig has no Codename and no database. They are the whole of the debugger test's two halves (errors.rb:30-31), and the capture runs the debugger on, off, and absent, so the reader can see which half does what.",
    "Cardio.config.rescue_all_in_controller answers nil (the rig's config is an OpenStruct carrying only cache_log_level), which is the deck's DEFAULT: the StandardError net is NOT armed. A capture that wanted it armed would have to set it; this one records the default it actually found.",
    "RIG ARTIFACT, named on its row: the last case's raisedOutOfHandleException is NoMethodError on `action=`, and it is the RIG's, not the pinned deck's. `@card ||= Card.new` (errors.rb:21) is executed and IS measured - the bare Card's errors bag is read, found empty, and written to, exactly as add_card_errors (error.rb:159-162) says. What the rig cannot do is render with a bare Card: the rig's Card is a stand-in class without the instance surface show's ladder calls (card.action=, card.act, card.format). In the pinned deck Card.new is a real Card and the render proceeds. Only that render is out of reach here; the ||= and the report are not."
  ],
  "sources" => {
    "handleException" => errors_source,
    "show" => show_source,
    "cardErrorReport" => report_source,
    "controllerRescueRegistration" => controller_source
  }
)
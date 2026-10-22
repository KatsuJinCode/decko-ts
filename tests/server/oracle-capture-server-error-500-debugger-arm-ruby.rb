# oracle-capture-server-error-500-debugger-arm-ruby.rb - the PINNED card
# gem's own ServerError class (error.rb:46-65), its debugger predicate
# executed over all four codename/content combinations, the report that is
# the only one in the file that asks the card anything, and the pinned
# rescue path measured with the debugger on and off.
#
# WHY THIS SCRIPT EXISTS: the register's C14 row grades the port on
# "ServerError 500 (+900 debugger arm) (error.rb:46-59; errors.rb:27-32)".
# Two things on that surface are not visible by reading the two cited
# ranges, and both are executed here:
#
#   1. THE PAIR FLIPS ON ONE PREDICATE, AND THE PREDICATE RETURNS AN INDEX.
#      `def self.view; debugger_on? ? :debug_server_error : :server_error`
#      and `def self.status_code; debugger_on? ? 900 : 500` (:46-55). So the
#      view and the status flip together. And `debugger_on?` (:57-59) is
#      `Card::Codename[:debugger] && Card[:debugger]&.content =~ /on` - a
#      `=~`, which answers an INDEX (0 when the match is at the start) or nil.
#      The capture records the returned OBJECT, not a boolean, because a
#      method named `?` that answers 0 is a Ruby truth a reader can get
#      wrong.
#   2. THE 900 ARM IS UNREACHABLE FROM THE PINNED CONTROLLER. Sweeping the
#      pinned gemset for readers of `status_code` finds exactly TWO in the
#      deck and the card gem: the class_attribute declaration itself
#      (card/error.rb:17) and the show handoff (decko card_controller/
#      errors.rb:23) - and the handoff sits BEHIND `raise exception if
#      debug_exception?(exception)` (:19), which asks the SAME debugger test.
#      So when the debugger is on the rescue re-raises and never reads
#      status_code; when it is off, debugger_on? is false and status_code
#      answers 500. Both halves of this row's rescue path are executed with
#      the debugger on and off, and the 900 never reaches a render. The class
#      methods are not wrong; the only caller cannot reach them. (Rails and
#      Rack carry their own status_code methods and appear in the sweep; they
#      are classified as framework readers and this row's claim is about the
#      deck's and the card gem's reads only.)
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-server-error-500-debugger-arm-ruby.rb \
#     > fixtures/captured/server-error-500-debugger-arm-ruby-oracle.json
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

# 1 - THE PAIR, BOTH WAYS, READ STRAIGHT OFF THE CLASS. This is the ONLY
# consumer the pair has on this row: the class methods themselves.
pair_rows = {
  "cardErrorDefaultsStatus" => Card::Error.status_code,
  "cardErrorDefaultsView" => Card::Error.view.to_s,
  "serverErrorSuperclass" => Card::Error::ServerError.superclass.to_s,
  # ServerError is NOT a UserError, so it is outside the 422 ladder and
  # outside the rescue roster (rows C9 and C13).
  "serverErrorIsUserError" => Card::Error::ServerError.ancestors.include?(Card::Error::UserError),
  "serverErrorInRoster" => Card::Error::UserError.user_error_classes.include?(Card::Error::ServerError)
}

# 2 - THE DEBUGGER PREDICATE, EXECUTED OVER ALL FOUR COMBINATIONS. Both
# answers are recorded as the OBJECTS the pinned methods returned: `=~`
# answers an Integer index or nil, and a capture that printed `true` would be
# reporting something the method never said.
def debugger_row(codename:, content:)
  Card::Codename.configured = codename
  Card.lookup_table = content.nil? ? {} : { "debugger" => content }
  predicate = Card::Error::ServerError.debugger_on?
  {
    "codenameConfigured" => !codename.nil?,
    "debuggerCardContent" => content,
    "debuggerOnRaw" => predicate.is_a?(Integer) ? predicate : (predicate.nil? ? nil : predicate.class.to_s),
    "debuggerOnTruthy" => !!predicate,
    "statusCode" => Card::Error::ServerError.status_code,
    "view" => Card::Error::ServerError.view.to_s
  }
ensure
  Card::Codename.configured = DEBUGGER_CONFIGURED
  Card.lookup_table = {}
end

debugger_rows = {
  "noCodename" => debugger_row(codename: nil, content: nil),
  "codenameWithNoCard" => debugger_row(codename: true, content: nil),
  # A content of "on" matches at index 0 - which is the case that catches a
  # reader who assumed a boolean.
  "contentOnAtIndexZero" => debugger_row(codename: true, content: "on"),
  # The same word later in the card's content matches at index 2.
  "contentOnLaterInTheBody" => debugger_row(codename: true, content: "please turn the debugger on"),
  "contentOff" => debugger_row(codename: true, content: "off")
}

# 3 - THE REPORT, THE ONLY ONE IN THIS FILE THAT ASKS THE CARD ANYTHING.
# `def report; super; card&.notable_exception_raised; end` (:61-64).
notable_card = ErrorRowCardInstance.new(name: "Server")
report_harness = PinnedDeck::ControllerHarness.new(
  params: {}, card: notable_card, request: ErrorRowRequestDouble.new
)
report_harness.instance_variable_set(:@card, notable_card)
Card::Error.current = nil
report_harness.send(:handle_exception, rescued_exception(RuntimeError, "boom"))
report_row = {
  "cardifiedClass" => Card::Error.current.class.to_s,
  "view" => Card::Error.current.class.view.to_s,
  "statusCode" => Card::Error.current.class.status_code,
  "rendered" => report_harness.rendered,
  "cardErrorsCalls" => notable_card.errors.calls,
  "cardErrorsEntries" => notable_card.errors.entries.map { |entry| { "key" => entry.key.to_s, "message" => entry.message } },
  "errorRowCalls" => notable_card.error_row_calls,
  "notableExceptionRaisedCalled" => notable_card.error_row_calls.include?(:notable_exception_raised)
}

# 4 - THE CARDIFY ELSE. card_error_class (:164-175) ends in `else Card::Error
# ::ServerError`, so every exception that is not a Card::Error, not a
# RecordInvalid, not a RecordNotFound and not a MissingFile is a ServerError.
# Executed over one of each shape.
def cardify_row(exception_class)
  card = ErrorRowCardInstance.new(name: "Cardified")
  harness = PinnedDeck::ControllerHarness.new(params: {}, card: card, request: ErrorRowRequestDouble.new)
  harness.instance_variable_set(:@card, card)
  Card::Error.current = nil
  harness.send(:handle_exception, rescued_exception(exception_class, "the pinned message"))
  {
    "raised" => exception_class.to_s,
    "cardifiedClass" => Card::Error.current&.class&.to_s,
    "view" => Card::Error.current&.class&.view&.to_s,
    "statusCode" => Card::Error.current&.class&.status_code,
    "renderedStatus" => harness.rendered&.fetch(:status, nil)
  }
end

cardify_rows = {
  "plainStandardError" => cardify_row(RuntimeError),
  "argumentError" => cardify_row(ArgumentError),
  "nameError" => cardify_row(NameError),
  "zeroDivisionError" => cardify_row(ZeroDivisionError)
}

# 5 - THE RESCUE PATH, THE DEBUGGER ON AND OFF. This is the row's finding:
# the re-raise at errors.rb:19 happens BEFORE the status_code read at :23,
# so the 900 arm cannot reach a render.
def rescue_with_debugger(debugger:)
  Card::Codename.configured = debugger ? true : nil
  Card.lookup_table = debugger ? { "debugger" => DEBUGGER_CONTENT } : {}
  card = ErrorRowCardInstance.new(name: "Server")
  harness = PinnedDeck::ControllerHarness.new(params: {}, card: card, request: ErrorRowRequestDouble.new)
  harness.instance_variable_set(:@card, card)
  Card::Error.current = nil
  raised = nil
  begin
    harness.send(:handle_exception, rescued_exception(RuntimeError, "boom"))
  rescue StandardError => e
    raised = "#{e.class}: #{e.message}"
  end
  {
    "debuggerOn" => debugger,
    # What the rescue's OWN last line would have read, had it got there.
    "statusCodeTheClassWouldAnswer" => Card::Error::ServerError.status_code,
    "viewTheClassWouldAnswer" => Card::Error::ServerError.view.to_s,
    "raisedOutOfHandleException" => raised,
    "cardErrorCurrent" => Card::Error.current&.class&.to_s,
    "rendered" => harness.rendered,
    "renderedStatus" => harness.rendered&.fetch(:status, nil)
  }
ensure
  Card::Codename.configured = DEBUGGER_CONFIGURED
  Card.lookup_table = {}
end

rescue_rows = {
  "debuggerOff" => rescue_with_debugger(debugger: false),
  "debuggerOn" => rescue_with_debugger(debugger: true)
}

# 6 - THE CONSUMER SWEEP. Every .rb file in the pinned gemset whose text
# contains `status_code`, classified by whether it belongs to the DECK or
# the CARD gem (whose class_attribute it is) or to a FRAMEWORK (Rails' own
# HTTP status plumbing, which has its own status_code methods and does not
# call the gem's). The sweep is a grep over the pinned gemset's own files, so
# the row's "only reader" claim is checkable from the fixture rather than
# asserted in prose.
DECK_AND_CARD_GEMS = %w[decko-0.20.0 card-1.110.0].freeze

status_consumers = Dir.glob(File.join(PinnedDeck.gems_root, "*", "{lib,set,mod,config,app}/**/*.rb"))
                      .sort
                      .filter_map do |file|
                        line_number = nil
                        File.readlines(file).each_with_index do |line, index|
                          next unless line.include?("status_code")

                          line_number = index + 1
                          break
                        end
                        next if line_number.nil?

                        relative = file.sub("#{PinnedDeck.gems_root}/", "")
                        gem_dir = relative.split("/").first
                        {
                          "gem" => gem_dir.sub(/-\d[^-]*\z/, ""),
                          "belongsToDeckOrCard" => DECK_AND_CARD_GEMS.include?(gem_dir),
                          "file" => relative,
                          "line" => line_number
                        }
                      end

deck_or_card_readers = status_consumers.select { |entry| entry["belongsToDeckOrCard"] }

# The pinned sources, quoted with line numbers.
class_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                       .select { |row| row["line"].between?(45, 65) }
cardify_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                        .select { |row| row["line"].between?(164, 175) }
handler_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/errors.rb")
                         .select { |row| row["line"].between?(18, 32) }
# The debug view the pair names, read from the format mod so the view name
# is attributable even though the render is not run here.
debug_view_source = PinnedDeck.pinned_lines("card-mod-format-0.20.0/set/all/html/error.rb")
                              .select { |row| row["line"].between?(1, 10) }

puts JSON.pretty_generate(
  "row" => "reg-routes-C14",
  "gemset" => "decko-0.20.0 + card-1.110.0 + card-mod-format-0.20.0 (pinned)",
  "classPair" => pair_rows,
  "debuggerPredicate" => debugger_rows,
  "report" => report_row,
  "cardifyElse" => cardify_rows,
  "rescuePath" => rescue_rows,
  "statusCodeConsumers" => status_consumers,
  "deckOrCardStatusCodeReaders" => deck_or_card_readers,
  "rigArtifacts" => [
    "Card::Codename[:debugger] and Card[:debugger].content are RECORDED answers, not pinned code: the rig has no Codename and no database. They are the whole of the debugger predicate, and the capture runs the predicate over all five states (no codename, codename with no card, content matching at index 0, content matching later, content not matching) so the two halves can be told apart.",
    "the debugger predicate's return VALUE is recorded as the object the pinned method returned, not as a boolean: `content =~ /on` answers an Integer index or nil, so a capture that printed `true` would be reporting something the method never said. The content that matches at index 0 is included on purpose.",
    "the CONSUMER SWEEP is a grep over the pinned gemset's own .rb files, run inside the capture, so the claim 'the deck and the card gem read status_code in exactly two places' is checkable from the fixture rather than asserted in prose. It reports the FIRST status_code line per file and classifies each hit as belonging to the deck/card gems or to a framework; Rails and Rack carry their own status_code methods and are classified as framework readers, and this row's claim is about the deck's and the card gem's reads only.",
    "the debug_server_error VIEW is quoted from the format mod, not rendered: rendering it needs the whole view stack, which this capture does not build. The view exists (the quote shows its declaration and its modal wrap) - it is the STATUS that has no reachable reader."
  ],
  "sources" => {
    "serverErrorClass" => class_source,
    "cardErrorClassCase" => cardify_source,
    "handleException" => handler_source,
    "debugServerErrorView" => debug_view_source
  }
)
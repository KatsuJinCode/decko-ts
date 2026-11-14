# oracle-capture-not-found-404-view-ruby.rb - the PINNED card gem's own
# NotFound class (error.rb:88-91) and its class hierarchy, the PINNED DECK's
# own load_card raise site, and the PINNED format's own SECOND 404 producer,
# view_for_unknown.
#
# WHY THIS SCRIPT EXISTS: the completeness register's C10 row grades the port
# on "NotFound 404 + :not_found view (error.rb:88-91)". The row names a class
# whose answer is two class_attributes, so the risk on this row is measuring
# the wrong thing: a capture that only reads error.rb:88-91 measures nothing.
# Four things are actually decided here, and all four execute:
#
#   1. THE PAIR, FROM THE CLASS. `self.status_code = 404` and
#      `self.view = :not_found` are class_attribute writes on NotFound, and
#      errors.rb:23 reads them off the CLASS. Executed through the pinned
#      rescue, the pair that reaches show is (404, :not_found).
#   2. THE INHERITANCE IS LOAD-BEARING. NotFound is NOT in
#      UserError.user_error_classes (:70-74) - the roster names UserError
#      itself - so NotFound is caught only because it is a UserError
#      SUBCLASS. CodenameNotFound (:93-94) declares no pair of its own, so it
#      inherits BOTH from NotFound. Both facts are measured, not read off.
#   3. THE RAISE SITE. `raise Card::Error::NotFound unless card`
#      (decko-0.20.0/lib/card_controller/rest.rb:51) is the deck's own 404
#      producer, and it runs BEFORE record_as_main - so a missing card never
#      records a main name.
#   4. THE SECOND 404 PRODUCER, ON THE FORMAT. The rescue is not the only
#      way a 404 appears: Card::Format::Error#view_for_unknown
#      (card-1.110.0/lib/card/format/error.rb:18-25) answers :not_found and
#      sets root.error_status = 404 for an UNKNOWN card on the MAIN page at
#      ROOT, and answers the setting view (or :unknown) everywhere else. Same
#      status, same view name, different producer, and the second one is
#      reached without any exception at all.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-not-found-404-view-ruby.rb \
#     > fixtures/captured/not-found-404-view-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require_relative "pinned-card-error-classes-ruby"

# The PINNED MOD's own format registry, loaded: the show ladder reaches
# respond, whose file arm is an `is_a?(Card::Format::FileFormat)` test
# (decko-0.20.0/lib/card_controller/response.rb:14).
load_pinned_format_registry!
raise "the pinned FileFormat was not loaded by the registry" unless defined?(Card::Format::FileFormat)

# The PINNED format's own Error module, loaded: view_for_unknown (:18-25) is
# the second 404 producer and its own body, not a rig double, is what this
# row measures. The module's other methods need collaborators this capture
# never calls (Card.config, t, safe_name), and Ruby resolves those at CALL
# time, so loading the file only has to parse - which it does.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/format/error.rb")
raise "the pinned format Error module was not loaded" unless defined?(Card::Format::Error)

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!
unless PinnedDeck::ControllerHarness.include?(CardController::Errors)
  PinnedDeck::ControllerHarness.include(CardController::Errors)
end

# Card.uri_fetch (card-1.110.0/lib/card/fetch/card_class.rb:128-133) is the
# deck's own mark resolution, and this capture stands in for it as a RECORDED
# nil answerer: no database, so a fetch that finds nothing is the honest
# answer, and the ask is recorded. The 404 this produces is the pinned raise
# site's, not the fetch's.
class << Card
  attr_reader :uri_fetch_asks

  def uri_fetch(params)
    @uri_fetch_asks ||= []
    @uri_fetch_asks << params.map { |key, value| [key.to_s, value.is_a?(String) ? value : value.class.to_s] }.to_h
    nil
  end
end

# The root format the pinned view_for_unknown writes its error_status onto
# (card-1.110.0/lib/card/format/error.rb:21 `root.error_status = ...`).
class RootFormatProbe
  attr_accessor :error_status
  attr_reader :error_status_writes

  def initialize
    @error_status = nil
    @error_status_writes = []
  end

  def error_status=(value)
    @error_status_writes << value
    @error_status = value
  end
end

# The view opts object: `voo.root?` and `voo.depth` are the only two the
# unknown-card path reads. It is a probe rather than an OpenStruct because
# OpenStruct#root? looks for a KEY named "root?" and answers nil when only a
# "root" key exists - and `root?` here is a PREDICATE over the root view, not
# a lookup of a boolean.
class ViewOptsProbe
  attr_reader :calls

  def initialize(root_view, depth)
    @root_view = root_view
    @depth = depth
    @calls = []
  end

  def root?
    @calls << :root?
    !@root_view.nil? && @root_view == :root
  end

  def depth
    @calls << :depth
    @depth
  end
end

# The host for the PINNED view_for_unknown: a format object that includes the
# module and answers the four collaborators that method reads - main? (:19),
# voo.root? (:19), root (:20-21) and card (which this method never reads,
# which is itself worth recording).
class UnknownViewProbe
  include Card::Format::Error

  attr_reader :calls, :root_probe

  def initialize(card:, main:, root_view:, depth:)
    @card = card
    @main = main
    @root = RootFormatProbe.new
    @voo = ViewOptsProbe.new(root_view, depth)
    @calls = []
  end

  def main?
    @calls << :main?
    @main
  end

  def voo
    @calls << :voo
    @voo
  end

  def root
    @calls << :root
    @root
  end

  def card
    @calls << :card
    @card
  end

  # The root format's error_status, read straight off the probe so the
  # recorded calls above stay the pinned method's own.
  def root_probe_read
    @calls << :root_probe_read
    @root.error_status
  end
end

# 1 + 2 - THE CLASS'S OWN PAIR AND ITS INHERITANCE.
class_rows = {
  "notFoundStatusCode" => Card::Error::NotFound.status_code,
  "notFoundView" => Card::Error::NotFound.view.to_s,
  "userErrorStatusCode" => Card::Error::UserError.status_code,
  "userErrorView" => Card::Error::UserError.view.to_s,
  "codenameNotFoundStatusCode" => Card::Error::CodenameNotFound.status_code,
  "codenameNotFoundView" => Card::Error::CodenameNotFound.view.to_s,
  # NotFound declares no status_code of its own beyond the 404 it writes, and
  # CodenameNotFound declares none at all - so this is where inheritance is
  # visible.
  "codenameNotFoundDeclaresOwnStatus" => Card::Error::CodenameNotFound.singleton_class
                                                    .instance_methods(false).include?(:status_code),
  "codenameNotFoundDeclaresOwnView" => Card::Error::CodenameNotFound.singleton_class
                                                 .instance_methods(false).include?(:view),
  "notFoundIsUserErrorSubclass" => Card::Error::NotFound.ancestors.include?(Card::Error::UserError),
  "codenameNotFoundIsNotFoundSubclass" => Card::Error::CodenameNotFound.ancestors.include?(Card::Error::NotFound),
  # The roster the controller rescues (card_controller.rb:27): NotFound is
  # NOT in it, so it is caught only as a UserError.
  "notFoundInUserErrorRoster" => Card::Error::UserError.user_error_classes.include?(Card::Error::NotFound),
  "codenameNotFoundInUserErrorRoster" => Card::Error::UserError.user_error_classes.include?(Card::Error::CodenameNotFound),
  "userErrorRoster" => Card::Error::UserError.user_error_classes.map(&:to_s),
  # The OTHER 404: BadAddress is a UserError subclass with the same status
  # and a DIFFERENT view. Row C15's evidence, recorded here so this row's
  # "404" is not mistaken for one view.
  "badAddressStatusCode" => Card::Error::BadAddress.status_code,
  "badAddressView" => Card::Error::BadAddress.view.to_s
}

# 1 (again) - THE PINNED RESCUE, executed with a NotFound, so the pair that
# reaches show is measured rather than declared.
rescued = ErrorRowCardInstance.new(name: "Absent")
harness = PinnedDeck::ControllerHarness.new(params: {}, card: rescued, request: ErrorRowRequestDouble.new)
harness.instance_variable_set(:@card, rescued)
Card::Error.current = nil
harness.send(:handle_exception, rescued_exception(Card::Error::NotFound, "no such card"))
rescue_row = {
  "view" => Card::Error.current.class.view.to_s,
  "statusCode" => Card::Error.current.class.status_code,
  "rendered" => harness.rendered,
  "pageCalls" => rescued.page_calls
}

# 3 - THE PINNED RAISE SITE. load_card asks the fetch, gets nothing, and
# raises the class whose pair is this row's. record_as_main is on the far
# side of the raise, so a missing card never records a main name.
class << Card::Env
  attr_accessor :main_name_writes

  def main_name=(value)
    self.main_name_writes = (main_name_writes || []) + [value]
    @main_name = value
  end
end
raise_harness = PinnedDeck::ControllerHarness.new(
  params: { mark: "Ghost" }, card: ErrorRowCardInstance.new(name: "Ghost"), request: ErrorRowRequestDouble.new
)
raise_harness.instance_variable_set(:@card, nil)
Card::Env.main_name_writes = []
raised = nil
begin
  raise_harness.send(:load_card)
rescue StandardError => e
  raised = "#{e.class}: #{e.message}"
end
raise_row = {
  "uriFetchAsks" => Card.uri_fetch_asks,
  "raised" => raised,
  "raisedClassStatusCode" => raised&.start_with?("Card::Error::NotFound") ? Card::Error::NotFound.status_code : nil,
  "raisedClassView" => raised&.start_with?("Card::Error::NotFound") ? Card::Error::NotFound.view.to_s : nil,
  "mainNameWrites" => Card::Env.main_name_writes
}

# 4 - THE SECOND 404 PRODUCER, the PINNED view_for_unknown over its own three
# branches. This one needs no exception at all: an unknown card on the main
# page at root is a 404 by the FORMAT's own decision.
unknown_card = ErrorRowCardInstance.new(name: "Ghost")
view_rows = []
[
  # THE 404 PRODUCER. main? AND the root view, and no card lookup at all.
  ["the second 404 producer: main page, root view: :not_found and root.error_status 404",
   { card: unknown_card, main: true, root_view: :root, depth: 0 }, :errors],
  # The SAME branch with no setting view at all: the 404 arm does not read
  # the setting view, so :unknown never appears on this path.
  ["the 404 arm does not read the setting view: no setting view still answers :not_found",
   { card: unknown_card, main: true, root_view: :root, depth: 0 }, nil],
  # The ELSE arm. A non-root view is enough to leave the 404 arm, whatever
  # the depth - depth is NOT part of this test, and the recorded voo calls
  # show it is never even asked for.
  ["off the root view: the setting view answers, and no status is written",
   { card: unknown_card, main: true, root_view: :body, depth: 3 }, :errors],
  ["off the main page: the setting view answers, and no status is written",
   { card: unknown_card, main: false, root_view: :root, depth: 0 }, :errors],
  ["off the root view with no setting view: :unknown, and still no status",
   { card: unknown_card, main: true, root_view: :body, depth: 0 }, nil],
  # The KNOWN card changes nothing: view_for_unknown never reads the card,
  # so this method's answer is the same either way. The recorded calls show
  # card is never asked.
  ["a KNOWN card on the main page at root: the same :not_found and 404, because card is never read",
   { card: ErrorRowCardInstance.new(name: "Real"), main: true, root_view: :root, depth: 0 }, :errors]
].each do |label, config, setting_view|
  probe = UnknownViewProbe.new(**config)
  answer = probe.view_for_unknown(setting_view)
  view_calls = probe.calls.dup
  # The root probe is read AFTER the call, so its reads are counted
  # separately from the method's own calls.
  view_calls << ":rootErrorStatusRead"
  view_rows << {
    "label" => label,
    "settingView" => setting_view&.to_s,
    "view" => answer.to_s,
    "rootErrorStatus" => probe.root_probe_read,
    "rootErrorStatusWrites" => probe.root.error_status_writes,
    "calls" => view_calls,
    "vooCalls" => probe.voo.calls
  }
end

# The pinned sources, quoted with line numbers.
class_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                       .select { |row| row["line"].between?(82, 100) }
raise_site_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                              .select { |row| row["line"].between?(49, 54) }
view_for_unknown_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/format/error.rb")
                                     .select { |row| row["line"].between?(18, 25) || row["line"].between?(47, 54) }

puts JSON.pretty_generate(
  "row" => "reg-routes-C10",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "classes" => class_rows,
  "rescueRow" => rescue_row,
  "loadCardRaiseSite" => raise_row,
  "viewForUnknown" => view_rows,
  "rigArtifacts" => [
    "Card.uri_fetch is stood in for as a RECORDED nil answerer (there is no database): the ask is recorded and the answer is nil, so the pinned `raise Card::Error::NotFound unless card` (rest.rb:51) is what fires. The 404 measured here is the pinned raise site's, not the fetch's - the fetch's own contract is row B1's evidence.",
    "the PINNED Card::Format::Error module is loaded whole (card-1.110.0/lib/card/format/error.rb) and view_for_unknown is executed as the pinned body. Its collaborators that this method reads - main?, voo.root?, voo.depth, root - are answered by a probe that RECORDS each ask; the collaborators its OTHER methods read (Card.config, t, safe_name) are never called, so their absence changes nothing. root is a probe object with an error_status= that records its writes, because that write IS the second 404.",
    "view_for_unknown does not read card at all - the recorded calls show it - so the UNKNOWN-ness it branches on is main?/voo.root? alone, not a card lookup. That is why the second 404 producer needs no exception and no database."
  ],
  "sources" => {
    "notFoundAndBadAddressClasses" => class_source,
    "loadCard" => raise_site_source,
    "formatViewForUnknown" => view_for_unknown_source
  }
)
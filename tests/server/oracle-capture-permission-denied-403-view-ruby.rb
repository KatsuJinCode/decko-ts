# oracle-capture-permission-denied-403-view-ruby.rb - the PINNED card gem's
# own PermissionDenied class (error.rb:103-110), its one method BEYOND the
# pair, the PINNED KEY_MAP route that reaches it, and the PINNED format's own
# SECOND 403 producer, view_for_denial.
#
# WHY THIS SCRIPT EXISTS: the completeness register's C11 row grades the port
# on "PermissionDenied 403 + :denial view (error.rb:103-110)". Five things
# are decided on that surface, and only the first is the pair:
#
#   1. THE PAIR. `self.status_code = 403` and `self.view = :denial` are
#      class_attribute writes, and errors.rb:23 reads them off the CLASS.
#   2. THE ONE METHOD PermissionDenied DECLARES BEYOND THE PAIR:
#      `def card_message_text; card.errors[:permission_denied]; end`
#      (:107-109). The base class's answer is `card.errors.first&.message`
#      (:41-43), so PermissionDenied reads a NAMED KEY rather than the first
#      error. This is measurable and it matters: a card whose errors are
#      [name: "must be present", permission_denied: "not yours"] shows
#      "not yours" here and "must be present" under the base class. The two
#      answers are measured side by side on the same card.
#   3. message_from_card (:33-35) wraps card_message_text in an I18n call
#      with the cardname - so the KEY and the cardname are pinned facts and
#      the translated text is deployment configuration. The capture records
#      the I18n key and its arguments and composes a stand-in text; it does
#      NOT claim a translation.
#   4. PermissionDenied does NOT OVERRIDE report, so unlike ServerError
#      (:61-64) its report never asks the card to note the exception. The
#      recorded card calls show the absence, which is a finding: a denial is
#      not notable, a server error is.
#   5. THE SECOND 403 PRODUCER, ON THE FORMAT. Card::Format::Error#
#      view_for_denial (card-1.110.0/lib/card/format/error.rb:27-31) writes
#      root.error_status = 403 for a FOCAL card at root and answers
#      `view_setting(:denial, view) || :denial` - so a denied page is 403
#      with NO exception raised anywhere, exactly as the denied unknown page
#      is a 404 with no exception (row C10's second producer).
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-permission-denied-403-view-ruby.rb \
#     > fixtures/captured/permission-denied-403-view-ruby-oracle.json
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

# The PINNED format's own Error module, loaded: view_for_denial is the
# second 403 producer and its own body, not a rig double, is what this row
# measures.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/format/error.rb")
raise "the pinned format Error module was not loaded" unless defined?(Card::Format::Error)

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!
unless PinnedDeck::ControllerHarness.include?(CardController::Errors)
  PinnedDeck::ControllerHarness.include(CardController::Errors)
end

# The I18n stand-in. `message_from_card` (card-1.110.0/lib/card/error.rb:33-35)
# calls `::I18n.t :lib_exception_for_card, cardname: ..., message: ...`, so
# the KEY and the two arguments are pinned facts this capture records. The
# TEXT a real deck shows is a translation, and translations are deployment
# configuration: the probe composes a readable stand-in and says so, rather
# than inventing a translation and calling it the pinned answer.
module I18n
  class << self
    attr_reader :asks

    def t(key, **kwargs)
      @asks ||= []
      @asks << { "key" => key.to_s, "kwargs" => kwargs.transform_values(&:to_s) }
      "[#{key}](#{kwargs.map { |name, value| "#{name}=#{value}" }.join(", ")})"
    end
  end
end

# The root format the pinned view_for_denial writes its error_status onto
# (card-1.110.0/lib/card/format/error.rb:29).
class DenialRootProbe
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

# The view opts object: `voo.root?` is the only thing view_for_denial reads
# of it.
class DenialViewOptsProbe
  attr_reader :calls

  def initialize(root_view)
    @root_view = root_view
    @calls = []
  end

  def root?
    @calls << :root?
    @root_view == :root
  end
end

# The host for the PINNED view_for_denial: a format object that includes the
# module and answers the collaborators that method reads - focal? (:29),
# voo.root? (:29), root (:29) and view_setting (:30).
class DenialViewProbe
  include Card::Format::Error

  attr_reader :calls, :root_format, :denied_task, :denial_setting

  def initialize(focal:, root_view:, view_settings: {})
    @focal = focal
    @voo = DenialViewOptsProbe.new(root_view)
    @root_format = DenialRootProbe.new
    @view_settings = view_settings
    @calls = []
    @denied_task = nil
  end

  def focal?
    @calls << :focal?
    @focal
  end

  def voo
    @calls << :voo
    @voo
  end

  def root
    @calls << :root
    @root_format
  end

  # `view_setting(:denial, view)` - a two-level lookup, and the fallback
  # `|| :denial` is the pair's view name coming from the method's own source.
  def view_setting(name, view = nil)
    @calls << [:view_setting, name.to_s, view&.to_s]
    @view_settings[[name.to_s, view&.to_s]] || @view_settings[name.to_s]
  end
end

# 1 - THE PAIR, AND WHETHER THE CLASS DECLARED IT ITSELF.
class_rows = {
  "permissionDeniedStatusCode" => Card::Error::PermissionDenied.status_code,
  "permissionDeniedView" => Card::Error::PermissionDenied.view.to_s,
  "userErrorStatusCode" => Card::Error::UserError.status_code,
  "userErrorView" => Card::Error::UserError.view.to_s,
  "permissionDeniedDeclaresOwnStatus" => Card::Error::PermissionDenied.singleton_class
                                                  .instance_methods(false).include?(:status_code),
  "permissionDeniedDeclaresOwnView" => Card::Error::PermissionDenied.singleton_class
                                             .instance_methods(false).include?(:view),
  "permissionDeniedIsUserErrorSubclass" => Card::Error::PermissionDenied.ancestors
                                                 .include?(Card::Error::UserError),
  # KEY_MAP (:128-129) is what routes a card error key to this class. It is
  # declared inside `class << self` (:127), so the constant lives on the
  # SINGLETON class - not on Card::Error, which is why a reader looking for
  # `Card::Error::KEY_MAP` does not find it. The hash's order is its
  # declaration order and permission_denied comes first.
  "keyMap" => Card::Error.singleton_class.const_get(:KEY_MAP).map { |key, klass| [key.to_s, klass.to_s] }
}

# 2 + 3 - THE ONE METHOD BEYOND THE PAIR, measured against the base class's
# answer on the SAME card, so the difference is the override and nothing
# else.
dual_card = ErrorRowCardInstance.new(
  name: "Denied Card",
  # TWO errors, so the base class's `errors.first` and this class's named
  # key answer DIFFERENT things on the same bag.
  errors: RecordedErrors.new({ name: "must be present", permission_denied: "you may not touch this card" })
)
base_error = Card::Error::NotFound.new("base instance")
base_error.card = dual_card
permission_error = Card::Error::PermissionDenied.new("permission instance")
permission_error.card = dual_card
message_rows = {
  "label" => "card_message_text: the named key, not the first error",
  "errorsBag" => dual_card.errors.entries.map { |entry| { "key" => entry.key.to_s, "message" => entry.message } },
  "permissionDeniedCardMessageText" => permission_error.card_message_text,
  "baseCardMessageText" => base_error.card_message_text,
  "permissionDeniedMessageFromCard" => permission_error.message_from_card,
  "baseMessageFromCard" => base_error.message_from_card,
  "i18nAsks" => I18n.asks
}

# A card with NO :permission_denied key at all: the override reads nil where
# the base class would have found the first error. That is the shape that
# turns a denial into a blank message.
empty_card = ErrorRowCardInstance.new(
  name: "Unkeyed",
  errors: RecordedErrors.new({ name: "must be present" })
)
unkeyed_error = Card::Error::PermissionDenied.new("unkeyed instance")
unkeyed_error.card = empty_card
unkeyed_row = {
  "label" => "card_message_text with no :permission_denied key answers nil, where the base class would answer the first error",
  "errorsBag" => empty_card.errors.entries.map { |entry| { "key" => entry.key.to_s, "message" => entry.message } },
  "permissionDeniedCardMessageText" => unkeyed_error.card_message_text,
  "baseCardMessageText" => base_error.class.new("x").tap { |e| e.card = empty_card }.card_message_text
}

# 4 - THE REPORT DOES NOT NOTE THE EXCEPTION, unlike ServerError's.
notable_card = ErrorRowCardInstance.new(name: "Notable?")
harness = PinnedDeck::ControllerHarness.new(
  params: {}, card: notable_card, request: ErrorRowRequestDouble.new
)
harness.instance_variable_set(:@card, notable_card)
Card::Error.current = nil
harness.send(:handle_exception, rescued_exception(Card::Error::PermissionDenied, "no entry"))
report_row = {
  "view" => Card::Error.current.class.view.to_s,
  "statusCode" => Card::Error.current.class.status_code,
  "rendered" => harness.rendered,
  "cardErrorsCalls" => notable_card.errors.calls,
  "cardErrorsEntries" => notable_card.errors.entries.map { |entry| { "key" => entry.key.to_s, "message" => entry.message } },
  # The FINDING: notable_exception_raised is NOT among the card's calls, so
  # the class asked nothing of the card beyond reading and writing its bag.
  "cardCalls" => notable_card.calls,
  "errorRowCalls" => notable_card.error_row_calls,
  "notableExceptionRaisedCalled" => notable_card.error_row_calls.include?(:notable_exception_raised)
}

# 5 - THE SECOND 403 PRODUCER, the PINNED view_for_denial over its own
# branches. No exception is raised on this path at all.
denial_rows = []
[
  ["a focal card at root: the status is written 403 and the fallback view answers",
   { focal: true, root_view: :root }, :errors, nil],
  ["a focal card at root with a :denial setting: the SETTING view answers, and the 403 is still written",
   { focal: true, root_view: :root, view_settings: { "denial" => :denial_body } }, :errors, nil],
  ["a focal card off the root view: the setting view answers and NO status is written",
   { focal: true, root_view: :body }, :errors, nil],
  ["a card that is not focal: the setting view answers and NO status is written",
   { focal: false, root_view: :root }, :errors, nil]
].each do |label, config, view, _unused|
  settings = config[:view_settings] || {}
  probe = DenialViewProbe.new(focal: config[:focal], root_view: config[:root_view], view_settings: settings)
  answer = probe.view_for_denial(view, :update)
  denial_rows << {
    "label" => label,
    "askedView" => view.to_s,
    "askedTask" => :update.to_s,
    "answer" => answer.to_s,
    # @denied_task = task is the method's FIRST line, before the 403 test.
    "deniedTaskRecorded" => probe.instance_variable_get(:@denied_task).to_s,
    "rootErrorStatus" => probe.root_format.error_status,
    "rootErrorStatusWrites" => probe.root_format.error_status_writes,
    "calls" => probe.calls,
    "vooCalls" => probe.voo.calls
  }
end

# The pinned sources, quoted with line numbers.
class_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                       .select { |row| row["line"].between?(33, 43) || row["line"].between?(101, 110) }
key_map_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                        .select { |row| row["line"].between?(127, 130) }
view_for_denial_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/format/error.rb")
                                 .select { |row| row["line"].between?(27, 31) }

puts JSON.pretty_generate(
  "row" => "reg-routes-C11",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "classes" => class_rows,
  "cardMessageText" => [message_rows, unkeyed_row],
  "report" => report_row,
  "viewForDenial" => denial_rows,
  "rigArtifacts" => [
    "I18n is stood in as a RECORDING probe: the pinned message_from_card calls `::I18n.t :lib_exception_for_card, cardname:, message:`, so the key and the two arguments are pinned facts this fixture records verbatim, and the probe composes a readable stand-in TEXT rather than inventing a translation. The translated sentence a real deck shows is deployment configuration (config/locales), not the pinned gem, so no English sentence is claimed here.",
    "the PINNED Card::Format::Error module is loaded whole and view_for_denial is executed as the pinned body. Its collaborators that this method reads - focal?, voo.root?, root and view_setting(:denial, view) - are answered by a probe that RECORDS each ask. The module's other methods need collaborators this capture never calls (Card.config, t, safe_name), and Ruby resolves those at CALL time, so loading the file only has to parse.",
    "the second 403 producer is measured on the FORMAT, which is a different surface from the rescue: nothing is raised, no Card::Error class is involved, and the 403 is written onto the root format directly. That is why row C11 owns two producers the way row C10 owns two 404s."
  ],
  "sources" => {
    "permissionDeniedAndCardMessageText" => class_source,
    "keyMap" => key_map_source,
    "formatViewForDenial" => view_for_denial_source
  }
)
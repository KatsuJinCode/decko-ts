# pinned-card-error-classes-ruby.rb - the loading rig for the [Family]
# register-routes rows that ride the ERROR PATH (rows C9 through C15).
#
# WHAT THIS IS. The shared loading rig
# (oracle-capture-pinned-deck-harness-ruby.rb) is deliberately untouched by
# the captures; it stands in Card as a bare class and gives it a two-class
# Card::Error, because no row before this one evaluated the PINNED card gem's
# own error file. The error rows all need the REAL thing: every (view,
# status_code) pair, every cardify mapping, the report side effect and the
# controller's own rescue_from table live in
# card-1.110.0/lib/card/error.rb, and a capture that paraphrases them is not
# a capture.
#
# So this file is the error rows' loader, and it holds exactly three things:
#
#   1. the CONSTANTS the pinned error file names at class-body evaluation
#      and the pinned controller's rescue table names at boot: the Rails and
#      ActiveRecord exception classes, each a real class with its own
#      identity (the `when` arms of card_error_class are case-equality
#      matches on those very objects, so a stand-in that collapsed them
#      into one class would change the answer);
#   2. the PINNED error file itself, evaluated over the rig's Card class so
#      the rig's own Card stays the Card the controller methods see;
#   3. the recording card and errors bag the pinned methods ask for.
#
# NOTHING HERE DECIDES AN ANSWER. Every stand-in RECORDS what it was asked
# and answers the only value its own pinned call site can observe; a pinned
# method that would need a real Rails is recorded as raising, not replaced
# with a plausible value.
#
# This is a SUPPORT file for the capture scripts beside it, not the loading
# rig. The loading rig is oracle-capture-pinned-deck-harness-ruby.rb, and it
# is deliberately untouched.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!

# class_attribute (card-1.110.0/lib/card/error.rb:17), cattr_accessor
# (:16, :69) and `present?`/`blank?` in message_from_card.
require "active_support/core_ext/class/attribute"
require "active_support/core_ext/class/attribute_accessors"
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"
require "active_support/core_ext/string/output_safety"

# ---------------------------------------------------------------------------
# 1. the named constants, as REAL DISTINCT CLASSES
# ---------------------------------------------------------------------------

# ActionController::BadRequest and ::MissingFile are named in
# card-1.110.0/lib/card/error.rb:72-73 (UserError.user_error_classes). The
# rig stands in ActionController::Base (and HttpAuthentication, and, once a
# capture asks, Parameters); these two are the rest of the surface the
# pinned file names.
module ActionController
  class BadRequest < StandardError; end
  class MissingFile < StandardError; end
end

# ActiveRecord::RecordNotFound and ::RecordInvalid are the other two names in
# user_error_classes (:73-74), and RecordInvalid is the one exception the
# card_error_class case dispatches on by class (:167-169).
module ActiveRecord
  class RecordNotFound < StandardError; end

  # RecordInvalid is raised by the model's own save; the pinned file reads
  # `exception.message` and nothing else of it, but a real ActiveRecord
  # RecordInvalid carries the record, and card_error_class reaches for the
  # card's own errors instead. The stand-in keeps the record so a capture
  # can see what the pinned code would have had.
  class RecordInvalid < StandardError
    attr_reader :record

    def initialize(message = nil, record: nil)
      super(message)
      @record = record
    end
  end
end

# ---------------------------------------------------------------------------
# 2. the PINNED error file, evaluated over the rig's Card class
# ---------------------------------------------------------------------------

# Card::Codename[:debugger] (errors.rb:30 and card/error.rb:58) is how the
# pinned code asks "is the debugger card configured?". There is no Codename
# in the rig, so this is a RECORDED answer: the captures set
# DEBUGGER_CONFIGURED and the lookups are printed.
class Card
  module Codename
    class << self
      attr_accessor :configured

      def [](codename)
        @lookups ||= []
        @lookups << codename.to_s
        configured
      end

      def lookups
        @lookups ||= []
      end
    end
  end
end

# DEBUGGER_CONFIGURED: what Card::Codename[:debugger] answers, for every
# row of every capture that requires this file. nil is the deck's default
# (no debugger codename configured) and is what the captures measure first.
DEBUGGER_CONFIGURED = nil

# The DEBUGGER CARD's own content. `Card[:debugger]&.content =~ /on` (errors.rb:31,
# card/error.rb:58) is the second half of the debugger test: the codename
# alone is not enough, the CARD'S CONTENT has to read as on.
DEBUGGER_CONTENT = "on"

# The PINNED card gem's own error file, evaluated. It reopens StandardError
# (to add #report), reopens Card, and reopens Card::Error - so the rig's own
# two-class Card::Error is REPLACED by the pinned seven-class ladder. That is
# the point: every (view, status_code) pair this file names is the pinned
# class_attribute's own value, read through the pinned class.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/error.rb")

raise "the pinned error file did not define Card::Error::NotFound" unless defined?(Card::Error::NotFound)
raise "the pinned UserError roster is empty" if Card::Error::UserError.user_error_classes.empty?

# The rig's RuleCard carries db_content only (it stands in for the card a
# rule read answers, card-1.110.0/lib/card/rule.rb:7). A CARD's `content` is
# its body, and the debugger test reads exactly that
# (`Card[:debugger]&.content =~ /on`, errors.rb:31 and card/error.rb:58), so
# this is the one instance method the rig's rule read was missing.
class Card
  class RuleCard
    def content
      db_content
    end
  end
end

# ---------------------------------------------------------------------------
# 3. the recording card and the errors bag
# ---------------------------------------------------------------------------

# A RESCUED exception has a backtrace; StandardError#report
# (card-1.110.0/lib/card/error.rb:7-8) reads `backtrace[0..MAX_BACKTRACE_LINES]`
# and would raise NoMethodError on a never-raised exception's nil. Setting one
# is not a convenience, it is what the rescue context guarantees.
RESCUED_BACKTRACE = ["pinned-card-error-classes-ruby.rb:in `rescue'", "decko-0.20.0/lib/card_controller.rb:in `process_action'"].freeze

# The errors bag the pinned methods ask for. Its whole surface is what
# card/error.rb names: `empty?` (:155), `add label, message` (:161), `key?`
# (:179) and `first&.message` (:42), plus PermissionDenied's
# `card.errors[:permission_denied]` (:108). Every write is RECORDED, so a
# capture can print which keys the pinned code added and in what order.
class RecordedErrors
  Entry = Struct.new(:key, :message)

  attr_reader :entries, :calls

  def initialize(initial = {})
    @entries = initial.map { |key, message| Entry.new(key, message) }
    @calls = []
  end

  def empty?
    @calls << :empty?
    @entries.empty?
  end

  def add(key, message)
    @calls << [:add, key.to_s, message]
    @entries << Entry.new(key, message)
    nil
  end

  def key?(key)
    @calls << [:key?, key.to_s]
    @entries.any? { |entry| entry.key == key }
  end

  def first
    @calls << :first
    @entries.first
  end

  def [](key)
    @calls << [:[], key.to_s]
    entry = @entries.find { |candidate| candidate.key == key }
    entry.nil? ? nil : entry.message
  end
end

# The card the pinned error methods are handed, and the card the controller's
# own methods ask for. An instance of the rig's Card (so `card.is_a? Card`
# (card-1.110.0/lib/card/error.rb:148) and the soft-redirect guard
# (decko-0.20.0/lib/card_controller/response.rb:84) both answer true),
# carrying the instance surface the pinned methods touch and recording every
# call.
module ErrorRowCard
  def error_row_calls
    @error_row_calls ||= []
  end

  def errors
    error_row_calls << :errors
    @errors ||= RecordedErrors.new
  end

  def errors=(value)
    error_row_calls << :errors=
    @errors = value
  end

  # Card#name is the one instance method the pinned error file itself reads
  # (error.rb:34, the I18n message_from_card) and the one the controller's
  # own before_action ladder reads. It lives HERE rather than on the
  # instance class so that a BARE `Card.new` - the one handle_exception's
  # `@card ||= Card.new` (errors.rb:21) makes - answers it too.
  def name
    error_row_calls << :name
    @name
  end

  def notable_exception_raised
    error_row_calls << :notable_exception_raised
    :notable_exception_raised
  end
end
Card.prepend(ErrorRowCard)

# A card instance for the captures: the instance surface the pinned
# controller's show ladder touches (render_page, load_format, respond) plus
# the pinned error file's own surface, every call RECORDED.
class ErrorRowCardInstance < Card
  attr_reader :calls, :page_calls, :selected_params, :action, :view_setting
  attr_accessor :root_error_status

  def initialize(name: "Front", errors: RecordedErrors.new)
    @name = name
    @errors = errors
    @calls = []
    @page_calls = []
    @selected_params = nil
    @view_setting = {}
    @root_error_status = nil
  end

  def action=(value)
    @calls << :"action="
    @action = value
  end

  def act
    @calls << :act
    yield
  end

  def format(name)
    @calls << :format
    PinnedDeck::FormatDouble.new(self, name)
  end

  def known?
    @calls << :known?
    true
  end

  def new_card?
    @calls << :new_card?
    false
  end

  def content
    @calls << :content
    "CONTENT"
  end

  def drafts
    []
  end

  def select_action_by_params(params)
    @calls << :select_action_by_params
    @selected_params = params
  end

  def to_s
    "#<#{self.class.name} #{@name}>"
  end
end

# The request double: the ONE surface the pinned load_format touches
# (decko-0.20.0/lib/card_controller/response.rb:93-99 - request.format, and
# the format= setter).
class ErrorRowRequestDouble
  attr_accessor :format_value

  def initialize(format_value: "*/*")
    @format_value = format_value
  end

  def format
    format_value
  end

  def format=(value)
    @format_value = value
  end
end

# A rescued exception, with the backtrace the rescue context guarantees and
# the pinned backtrace writer where the pinned class has one.
def rescued_exception(klass, message = "the pinned message")
  error = klass.new(message)
  if error.respond_to?(:backtrace=)
    error.backtrace = RESCUED_BACKTRACE.dup
  else
    error.set_backtrace(RESCUED_BACKTRACE.dup)
  end
  error
end

# A controller that has NOT loaded a card. The rig's own harness defaults
# `@card` to a CardDouble (oracle-capture-pinned-deck-harness-ruby.rb:978),
# which would hide the pinned `@card ||= Card.new` (errors.rb:21) behind a
# card that was never loaded. This harness starts with no card at all, so the
# pinned ||= is what puts one there.
class NoCardLoadedHarness < PinnedDeck::ControllerHarness
  def initialize(params: {}, request: nil)
    @params = params
    @request = request
    @card = nil
    @rendered = nil
    @redirected = nil
    @sent_file = nil
    @format_set = nil
  end
end
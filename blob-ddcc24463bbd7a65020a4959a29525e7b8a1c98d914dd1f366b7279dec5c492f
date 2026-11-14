# oracle-capture-soft-redirect-ruby.rb - the PINNED DECK's own soft_redirect
# (response.rb:54-62) and the params surgery it rides.
#
# WHY THIS SCRIPT EXISTS: the completeness register's C3 row grades the port
# on `soft_redirect` - the ajax default of the CUD success
# (response.rb:35-37, `Card::Env.ajax? ? "soft" : "hard"`). The method is
# five lines and each of them is a decision:
#
#   1. THE TARGET BECOMES THE CARD: `@card = success.target` - the success
#      envelope's target card replaces the controller's card.
#   2. THE GUARD: `require_card_for_soft_redirect!` raises
#      Card::Error("tried to do soft redirect without a card") unless the
#      card IS a Card (response.rb:83-87).
#   3. THE PARAMS SURGERY: `self.params = soft_redirect_params` where
#      soft_redirect_params (:64-69) CLONES the request params, DELETES the
#      :card and :action keys, and MERGES the success envelope's own params
#      (env/success.rb:67-69). So the re-render sees the request WITHOUT
#      the card hash, plus the success envelope's parameters.
#   4. Card::Env.reset self - the request-scoped state is cleared.
#   5. load_action, then show - the card is re-rendered through the read
#      ladder, which answers 200 and the rendered slot.
#
# WHAT THE RIG REACHES, stated exactly: the target swap, the guard, the
# params surgery, the reset, the load_action and the show all execute here
# over the recording doubles, and the answer is the 200 render of the slot.
#
# TWO CAPTURE-LOCAL PIECES, named on its face: the rig's CardDouble is NOT
# an instance of the rig's Card class, so the guard would refuse every
# double - the capture therefore uses a card that IS a Card instance (a
# subclass of the rig's Card, carrying the instance surface the pinned
# soft_redirect and show touch). And the rig's SuccessDouble has no params
# method (the pinned envelope's is env/success.rb:67-69), so the capture
# adds one that answers a configured hash.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-soft-redirect-ruby.rb \
#     > fixtures/captured/soft-redirect-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"
require "active_support/core_ext/string/output_safety"

# The PINNED MOD's own format registry, loaded: the re-render asks the card
# for a format, and the format NAME decision reads the registry (the
# explicit_file test, response.rb:107-109) - and respond's file arm's is_a?
# check is against the PINNED class.
registry = load_pinned_format_registry!
raise "the pinned FileFormat was not loaded by the registry" unless defined?(Card::Format::FileFormat)

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# The card the soft redirect renders: an instance of the rig's Card class
# (so the pinned guard `return if card.is_a? Card` answers true) carrying
# the instance surface the pinned soft_redirect, load_action and show touch.
class SoftRedirectCard < Card
  attr_reader :calls, :page_calls, :selected_params
  attr_accessor :action

  def initialize(name: "Front")
    @name = name
    @calls = []
    @page_calls = []
    @selected_params = nil
  end

  def name
    @name
  end

  def act
    @calls << :act
    yield
  end

  def format(name)
    @calls << :format
    PinnedDeck::FormatDouble.new(self, name)
  end

  def drafts
    []
  end

  def select_action_by_params(params)
    @calls << :select_action_by_params
    @selected_params = params
  end

  def content
    @calls << :content
    "CONTENT"
  end

  def known?
    true
  end

  def new_card?
    false
  end
end

# The success envelope's own params (env/success.rb:67-69), added to the
# rig's double as a capture-local extension.
SUCCESS_PARAMS = {}

module SuccessParamsExtension
  def params
    SUCCESS_PARAMS
  end
end

Card::SuccessDouble.prepend(SuccessParamsExtension)

# The request double: the ONE surface the pinned load_format touches
# (response.rb:93-99 - request.format, and the format= setter).
class SoftRedirectRequestDouble
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

def soft_redirect_case(label, card:, params:, success_params: {}, success_target:)
  SUCCESS_PARAMS.clear
  SUCCESS_PARAMS.merge!(success_params)
  Card::Env.success_target = success_target
  Card::Env.ajax_answer = true
  Card::Env.origin_answer = "https://deck.test"
  harness = PinnedDeck::ControllerHarness.new(
    params: params,
    card: card,
    request: SoftRedirectRequestDouble.new,
  )
  error = nil
  begin
    # soft_redirect is private in the pinned module (response.rb:8
    # `private` precedes response.rb:54), so the direct call goes through
    # send - the pinned body that runs is still the pinned body.
    harness.send(:soft_redirect, Card::SuccessDouble.new("Front"))
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "error" => error,
    "cardCalls" => card.respond_to?(:calls) ? card.calls : nil,
    "pageCalls" => card.respond_to?(:page_calls) ? card.page_calls : nil,
    "paramsAfter" => harness.params,
    "rendered" => harness.rendered,
    "redirected" => harness.redirected
  }
end

# The successful soft redirect: the target card is rendered through show.
target = SoftRedirectCard.new(name: "Target")
success_row = soft_redirect_case(
  "the soft redirect: the target becomes the card and the slot renders at 200",
  card: target,
  params: { card: { name: "Target", content: "body" }, action: "update", view: "related", keep: "yes" },
  success_params: { "mark" => "Target" },
  success_target: target
)

# The guard: a card that is NOT a Card instance is refused.
not_a_card = PinnedDeck::CardDouble.new(name: "Target")
guard_row = soft_redirect_case(
  "the guard: a card that is not a Card raises Card::Error",
  card: not_a_card,
  params: { card: { name: "Target" } },
  success_params: {},
  success_target: not_a_card
)

action_rows = [success_row, guard_row]

# The pinned sources, quoted with line numbers.
soft_redirect_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                                .select { |row| row["line"].between?(52, 69) }
guard_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                         .select { |row| row["line"].between?(83, 87) }
default_type_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                              .select { |row| row["line"].between?(35, 37) }
success_params_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/env/success.rb")
                              .select { |row| row["line"].between?(67, 69) }

puts JSON.pretty_generate(
  "row" => "reg-routes-C3",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "softRedirect" => action_rows,
  "rigArtifacts" => [
    "the rig's CardDouble is NOT an instance of the rig's Card class, so the pinned guard `return if card.is_a? Card` would refuse every rig double; the capture uses a card that IS a Card instance (a subclass of the rig's Card, carrying the instance surface the pinned soft_redirect, load_action and show touch).",
    "the rig's SuccessDouble has no params method (the pinned envelope's is card-1.110.0/lib/card/env/success.rb:67-69), so the capture adds one that answers a configured hash.",
    "the ajax answer is the rig's Card::Env.ajax? double, the same question the pinned deck asks (env/serializable.rb:24); the soft redirect is the ajax DEFAULT of the CUD success (response.rb:35-37).",
    "the recorded format NAME is the rig's own answer, not the pinned one: the rig's registry holds the format names as STRINGS and the explicit_file test asks with the symbol, so the name resolves to \"file\" (the rig's loading rig says this out loud: the registry holds the name as a string and the class keeps the symbol). The format NAME decision is rows A2/D2's evidence; the render's status and content type are the pinned arm's."
  ],
  "sources" => {
    "softRedirect" => soft_redirect_source,
    "guard" => guard_source,
    "defaultRedirectType" => default_type_source,
    "pinnedSuccessParams" => success_params_source
  }
)

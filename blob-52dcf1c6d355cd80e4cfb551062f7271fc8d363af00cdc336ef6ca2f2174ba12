# oracle-capture-cud-success-redirect-lattice-ruby.rb - the PINNED DECK's own
# cud_success, executed over its whole flavor lattice, and the PINNED card
# gem's own Success#redirect executed over the values a form can carry.
#
# WHY THIS SCRIPT EXISTS: the completeness register's C8 row grades the port
# on `cud_success` - "the flavor lattice" (rest.rb:80-89 + response.rb:25-33).
# Rows C4 and C5 already measured the two JSON rungs of the ladder (reload and
# slotter magic). What no row has measured is the SUB-LATTICE UNDER the third
# rung: `redirect_cud_success` (response.rb:25-33) is where the flavor is
# chosen, and it carries two switches plus a coercion and a default nobody
# has asked about:
#
#   the flavor switch   success.redirect || default_cud_success_redirect_type
#                       (response.rb:26) - the envelope's own redirect WINS;
#                       when the envelope's redirect answers false, the
#                       DEFAULT asks Card::Env.ajax? (response.rb:36) and
#                       answers "soft" or "hard".
#   the test            redirect_type.to_s == "soft" (response.rb:27) - an
#                       EXACT, case-sensitive string test, so "Soft" and
#                       true both take the hard branch.
#   the default         success.target ||= self (response.rb:28) - on the soft
#                       branch a falsy target is filled in from the
#                       CONTROLLER before soft_redirect swaps it into @card,
#                       and the soft guard (response.rb:84) then refuses
#                       anything that is not a Card.
#
# The hard branch then rides `hard_redirect success.to_url, 303`
# (response.rb:31), and hard_redirect has its OWN transport fork
# (response.rb:42-49): an AJAX request gets `render json: {redirect: url}` at
# 200 and the status argument is IGNORED; every other request gets
# redirect_to carrying the status it was handed. So "hard on ajax" and "hard
# on a normal request" are two different answers from the same flavor, and
# only the second carries the 303. This capture measures both.
#
# WHAT THE CAPTURE READS. It records what the pinned code itself produced -
# the rendered body or the redirect, the URL that redirect carried, and the
# card calls the branch made - never a re-derivation of the answer. The one
# probe that would have to re-run a pinned method on its own (success.to_url,
# which only the hard branch calls) is therefore NOT taken here; the URL the
# pinned hard_redirect actually sent is recorded instead, which is the same
# fact as it reaches the wire.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-cud-success-redirect-lattice-ruby.rb \
#     > fixtures/captured/cud-success-redirect-lattice-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!

# The PINNED action_support extensions the pinned methods ask for:
# `success.redirect`'s `present?` (env/success.rb:38) and slotter_magic?'s
# `in?` (response.rb:80).
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"
require "active_support/core_ext/string/output_safety"

# The PINNED MOD's own format registry, loaded: respond's file arm is an
# `is_a?(Card::Format::FileFormat)` test (response.rb:14) and the soft
# branch reaches respond, so the PINNED class has to exist.
load_pinned_format_registry!
raise "the pinned FileFormat was not loaded by the registry" unless defined?(Card::Format::FileFormat)

# The pinned Success class includes Card::Env::Location and
# Card::Env::Target (env/success.rb:5-6). The rig already carries the
# Location stand-in; Target's methods are loaded below over an empty module,
# which is what lets the pinned class LOAD.
Card::Env.const_set(:Target, Module.new) unless Card::Env.const_defined?(:Target)

# normalize_success_args (env/success.rb:106-107) case-matches
# ActionController::Parameters. The rig stands in ActionController::Base but
# not Parameters, and no case in this capture carries one, so an empty class
# is the stand-in: the branch is never taken, and defining it is what lets
# the pinned class LOAD.
ActionController.const_set(:Parameters, Class.new) unless ActionController.const_defined?(:Parameters)

# The PINNED card gem's own Success class, so Success#reload?, #redirect and
# #to_url are the PINNED methods rather than doubles.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/env/success.rb")

# The PINNED Target module, loaded over the stub the include above saw: the
# hard branch's `to_url` (env/success.rb:19-22) resolves `target` through it,
# and a stub would funnel the value into method_missing's params OpenStruct
# and answer nil - an artifact, not pinned behavior. Its runtime needs are the
# two fetches, stood in as RECORDED nil-answerers (this capture has no
# database; a fetch that finds nothing is the honest answer, and the lookups
# are recorded).
PinnedDeck.eval_pinned("card-1.110.0/lib/card/env/success/target.rb")
Card::Env::Success.include(Card::Env::Success::Target) unless Card::Env::Success.ancestors.include?(Card::Env::Success::Target)

# The PINNED location module, so `hard_redirect`'s `card_url`
# (response.rb:41) is the PINNED card_url
# (card-1.110.0/lib/card/env/location.rb:19-21) and the redirect URL this
# capture records is the absolute URL the pinned method would send.
PinnedDeck.load_pinned_location_modules!

class << Card
  attr_reader :id_lookups, :fetches

  # Card.id (card-1.110.0/lib/card/fetch/card_class.rb, the id lookup):
  # no database, no id - recorded and nil.
  def id(mark)
    @id_lookups ||= []
    @id_lookups << mark.to_s
    nil
  end

  # Card.fetch: no database, no card - recorded and nil.
  def fetch(*args)
    @fetches ||= []
    @fetches << args.map(&:to_s)
    nil
  end
end

# The PINNED env.rb:31-33 body - the envelope memoizes against
# params[:success], the request's own success args. The rig's stand-in
# answers a double; this capture's rows read the PINNED Success, so the
# singleton method is the pinned one here (this capture's process only -
# the other captures keep the rig's).
class << Card::Env
  attr_accessor :success_params

  def success(cardname = nil)
    @success = Card::Env::Success.new(cardname, success_params)
  end
end

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# The card a branch renders through: an instance of the rig's Card class (so
# the pinned soft-redirect guard `return if card.is_a? Card`
# (response.rb:84) answers true) carrying the instance surface the pinned
# soft_redirect, load_action and show touch. Every call is RECORDED.
class LatticeCard < Card
  attr_reader :calls, :page_calls, :selected_params
  attr_accessor :action

  def initialize(name: "Front")
    @name = name
    @calls = []
    @page_calls = []
    @selected_params = nil
  end

  def name
    @calls << :name
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
    @calls << :known?
    true
  end

  def new_card?
    @calls << :new_card?
    false
  end
end

# The request double: the ONE surface the pinned load_format touches
# (response.rb:93-99 - request.format, and the format= setter).
class LatticeRequestDouble
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

# Run the PINNED cud_success over one configuration of the lattice and
# report what it answered.
def run_lattice(label, ajax:, success_args:, slotter_mode: nil, card_name: "Front", target: nil)
  Card::Env.ajax_answer = ajax
  Card::Env.origin_answer = "https://deck.test"
  Card::Env.success_params = success_args
  card = LatticeCard.new(name: card_name)
  harness = PinnedDeck::ControllerHarness.new(
    params: slotter_mode.nil? ? {} : { "slotter_mode" => slotter_mode },
    card: card,
    request: LatticeRequestDouble.new,
  )
  error = nil
  begin
    # cud_success is private in the pinned module (rest.rb:29's private
    # marker), so the direct call goes through send - the pinned body that
    # runs is still the pinned body.
    harness.send(:cud_success)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end

  success = Card::Env.success
  # The envelope args are echoed by NAME, not by inspect: the soft rows hand
  # the envelope a Card, and Object#inspect would put the object's ADDRESS in
  # the fixture, which is not byte-stable across runs.
  recorded_args = (success_args || {}).each_with_object({}) do |(key, value), out|
    out[key] = value.is_a?(LatticeCard) ? "Card(#{value.name})" : value
  end
  {
    "label" => label,
    "ajax" => ajax,
    "slotterMode" => slotter_mode,
    "successArgs" => recorded_args,
    # What the pinned envelope answered to the two questions the ladder
    # asks: reload? first (the top rung) and redirect (the flavor switch).
    "successReloadQuestion" => success.reload?,
    "successRedirectAnswer" => success.redirect,
    # The card that rendered the slot, when a branch rendered one. This is
    # what measures `success.target ||= self`: the soft branch renders
    # through the envelope's target when it carried one, and through the
    # CONTROLLER when it did not.
    "targetCardName" => target.nil? ? nil : target.name,
    "renderedCardName" => card.page_calls.empty? ? nil : (target.nil? ? card.name : target.name),
    "rendered" => harness.rendered,
    "redirected" => harness.redirected,
    "cardCalls" => card.calls,
    "targetCalls" => target.nil? ? nil : target.calls,
    "pageCalls" => card.page_calls,
    "paramsAfter" => harness.params,
    "error" => error
  }
end

# The mark the hard branch resolves: a site-rooted path, so the pinned
# `card_url` makes it absolute against the origin (card/env/location.rb:19-21)
# rather than leaving it alone.
HARD_MARK = { "mark" => "/Elsewhere" }.freeze

# The target card the soft branch swaps into @card, given through the
# envelope's own `mark=` (env/success/target.rb:17-24 - a Card value is
# stored as @card, which is what `target` then answers).
envelope_target = LatticeCard.new(name: "Target")

lattice = [
  # RUNG 1 - reload. It outranks everything: the magic rung and the flavor
  # switch never run.
  run_lattice("reload true outranks the magic rung and the flavor switch",
              ajax: false, success_args: { "reload" => "true", "mark" => "/Elsewhere" }),
  run_lattice("reload true also outranks an explicit soft override",
              ajax: true, success_args: { "reload" => "true", "redirect" => "soft" }),
  # RUNG 2 - slotter magic. It outranks the flavor switch.
  run_lattice("slotter magic outranks an explicit soft override",
              ajax: false, success_args: { "redirect" => "soft" }, slotter_mode: "silent-success"),
  # RUNG 3 - the flavor switch with the envelope carrying NOTHING to say
  # about it. The ajax answer alone picks the flavor. An empty envelope sets
  # no mark at all (env/success.rb:93-99 `apply` has an empty hash to apply),
  # so the pinned target is nil and `success.target ||= self`
  # (response.rb:28) installs the CONTROLLER. THIS ROW IS A MEASURED LIMIT,
  # not a finding - see "limits" below.
  run_lattice("LIMIT: an empty envelope on an ajax request: soft, then the ||= target resolution raises in this rig",
              ajax: true, success_args: {}),
  # The flavor switch with the ajax default on a NORMAL request: hard, and
  # the 303 rides the redirect.
  run_lattice("an empty envelope on a normal request: hard, and the 303 rides the redirect",
              ajax: false, success_args: HARD_MARK.dup),
  # The flavor switch with the envelope OVERRIDING the ajax default, in both
  # directions.
  run_lattice("an explicit soft override flips a normal request to soft, and the envelope's target renders",
              ajax: false, success_args: { "mark" => envelope_target, "redirect" => "soft" },
              target: envelope_target),
  run_lattice("an explicit soft override on an ajax request: soft, and the envelope's target renders",
              ajax: true, success_args: { "mark" => envelope_target, "redirect" => "soft" },
              target: envelope_target),
  # THE TRANSPORT FORK inside the hard flavor: an ajax hard answers the
  # JSON redirect at 200 and IGNORES the 303; a normal one carries the 303.
  run_lattice("an explicit hard override on an ajax request: JSON at 200, and the 303 is dropped",
              ajax: true, success_args: HARD_MARK.merge("redirect" => "hard")),
  # THE STRING TEST. `redirect_type.to_s == "soft"` is exact and
  # case-sensitive.
  run_lattice("a capitalized Soft is not the soft branch: hard",
              ajax: false, success_args: HARD_MARK.merge("redirect" => "Soft")),
  run_lattice("a boolean true redirect is not the soft branch: hard",
              ajax: false, success_args: HARD_MARK.merge("redirect" => true)),
  # THE `||` GAP. The envelope's redirect answers through `present?`
  # (env/success.rb:38), so an empty string and a blank string are both
  # false and the ajax default takes the branch. On the SOFT branch that
  # lands on a String target, and the soft guard refuses a String - the
  # `||=` cannot rescue it, because a String is truthy.
  run_lattice("an empty redirect is not an override: a normal request still hard-redirects",
              ajax: false, success_args: HARD_MARK.merge("redirect" => "")),
  run_lattice("an empty redirect on an ajax request: the soft guard refuses the String target",
              ajax: true, success_args: HARD_MARK.merge("redirect" => ""))
]

# The PINNED Success#redirect (env/success.rb:37-39) over the exact values
# an envelope can carry, separated from cud_success so the coercion is
# visible on its own: `present?` decides, and everything `present?` rejects
# answers false - which is then `||`'d to the ajax default.
redirect_checks = {}
[nil, "", " ", "soft", "Soft", "hard", true, false].each do |value|
  success = Card::Env::Success.new(nil, nil)
  success.redirect = value
  redirect_checks[value.nil? ? "absent" : "#{value.inspect} (#{value.class})"] = success.redirect
end

# The PINNED sources, quoted with line numbers.
cud_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                       .select { |row| row["line"].between?(79, 89) }
redirect_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                           .select { |row| row["line"].between?(24, 37) }
hard_redirect_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                               .select { |row| row["line"].between?(39, 50) }
success_redirect_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/env/success.rb")
                                 .select { |row| row["line"].between?(37, 43) }

puts JSON.pretty_generate(
  "row" => "reg-routes-C8",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "lattice" => lattice,
  "limits" => [
    "MEASURED LIMIT, on the row named LIMIT in the lattice: `success.target ||= self` (response.rb:28) does not produce a card in this rig, it produces `NoMethodError: undefined method 'to_name' for an instance of Card::Name`. The mechanism: `||=` calls the pinned `target=` (env/success/target.rb:8-11), whose `process_target` (:58-69) takes the else branch for a controller (a Regexp === on a non-String answers false) and sets `@name = Name[value]`; the later `target` read (:13-15) then calls `card(name_context)` (:46-54), which calls `@name.to_name.absolute(name_context)`. `to_name` is the PINNED Cardname gem's method (cardname-1.110.0/lib/cardname.rb:61, and the Object core_ext at lib/core_ext.rb:3) and the rig's Card::Name stand-in does not carry it; the rebuilt pinned gemset does not include the Cardname gem's own dependencies (it requires htmlentities), so the real resolution could not be executed here. NOTHING ABOUT THE FLAVOR IS UNMEASURED: the soft branch WAS taken on this row (the ajax default answered), and the raise happens after the branch, inside the target resolution. The rows above it measure the soft branch's render end to end, with the envelope carrying a Card as its target."
  ],
  "redirectChecks" => redirect_checks,
  "rigArtifacts" => [
    "the rig's ControllerHarness is not an instance of the rig's Card, so the pinned soft-redirect guard `return if card.is_a? Card` (response.rb:84) would refuse it; the capture uses a card that IS a Card instance (LatticeCard, a subclass of the rig's Card, carrying the instance surface the pinned soft_redirect, load_action and show touch).",
    "the rig's Card::Env.success answers a SuccessDouble; this capture replaces the singleton with the PINNED env.rb:31-33 body so Success#reload?, #redirect and #to_url are the pinned methods, and Card.id/Card.fetch are recorded nil-answerers (no database). A fetch that finds nothing is the honest answer for this capture, and the lookups are recorded in the fetch list.",
    "the recorded format NAME on the soft branch is the rig's own answer, not the pinned one: the rig's registry holds the format names as STRINGS and the explicit-file test asks with the symbol, so the name resolves to \"file\". The format NAME decision is rows A2/D2's evidence; the flavor and the STATUS are this row's.",
    "success.to_url is not probed here: the pinned code calls it only on the hard branch, and the URL the pinned hard_redirect actually sent is recorded instead (redirected.url, or rendered.json.redirect). The Cardname fetch path behind to_url is the deck's own mark resolution (row A1/B1's surface), not this row's."
  ],
  "sources" => {
    "cudSuccess" => cud_source,
    "redirectCudSuccess" => redirect_source,
    "hardRedirect" => hard_redirect_source,
    "successReloadAndRedirect" => success_redirect_source
  }
)
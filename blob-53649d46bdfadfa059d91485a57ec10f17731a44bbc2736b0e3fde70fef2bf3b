# oracle-capture-cud-reload-slotter-ruby.rb - the PINNED DECK's own
# cud_success ladder, executed over its three arms, and the PINNED card
# gem's own Success#reload?, executed over the string values.
#
# WHY THIS SCRIPT EXISTS: the completeness register's C4 row grades the
# port on the `reload` JSON arm ("response.rb:71-73; success.reload?") and
# its C5 row on the `slotter_magic?` arm ("response.rb:75-81, slotter_mode
# params"). The rows' notes name the methods but not the ORDER (reload
# outranks slotter magic - the if/elsif), nor the exact predicate strings,
# nor what an unlisted slotter_mode answers. This capture measures all of
# it from the PINNED side.
#
# THE MECHANISM, from the PINNED DECK's and the PINNED card gem's own
# files:
#
#   the ladder  decko-0.20.0/lib/card_controller/rest.rb:80-89
#                 def cud_success
#                   success = Card::Env.success.in_context card.name
#                   if success.reload?
#                     reload # instruct JSON to reload
#                   elsif slotter_magic?
#                     slotter_magic_response
#                   else
#                     redirect_cud_success success
#                   end
#                 end
#
#   the arms    decko-0.20.0/lib/card_controller/response.rb:71-81
#                 def reload
#                   render json: { reload: true }
#                 end
#
#                 def slotter_magic_response
#                   render json: { magic: true }
#                 end
#
#                 def slotter_magic?
#                   params["slotter_mode"]&.in? %w[silent-success update-modal-origin update-origin]
#                 end
#
#   the check   card-1.110.0/lib/card/env/success.rb:41-43
#                 def reload?
#                   @reload.to_s == "true"
#                 end
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-cud-reload-slotter-ruby.rb \
#     > fixtures/captured/cud-reload-slotter-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!

# Success#apply (env/success.rb:93-99) skips values that fail
# `value.present?`, and slotter_magic? (response.rb:80) asks
# `params["slotter_mode"]&.in?` - the PINNED action_support's own
# extensions, loaded the way the pinned deck loads them.
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

# The pinned Success class includes Card::Env::Location and
# Card::Env::Target (env/success.rb:5-6). The rig already carries the
# Location stand-in; Target's methods are never read by this capture's
# rows (reload? and the redirect answer are), so an empty module is the
# honest stand-in.
Card::Env.const_set(:Target, Module.new) unless Card::Env.const_defined?(:Target)

# normalize_success_args (env/success.rb:106-107) case-matches
# ActionController::Parameters. The rig stands in ActionController::Base
# but not Parameters, and no case in this capture carries one, so an
# empty class is the stand-in: the branch is never taken, and defining it
# is what lets the pinned class LOAD.
ActionController.const_set(:Parameters, Class.new) unless ActionController.const_defined?(:Parameters)

# The PINNED card gem's own Success class, so Success#reload? and
# #redirect are the PINNED methods rather than doubles.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/env/success.rb")

# The PINNED Target module, loaded over the stub the include above saw:
# the redirect arm's `success.to_url` (env/success.rb:19-22) resolves
# through it, and a stub would funnel `target` into method_missing's
# params OpenStruct and answer nil - an artifact, not pinned behavior.
# Its runtime needs are the two fetches, stood in as RECORDED
# nil-answerers (this capture has no database; a fetch that finds
# nothing is the honest answer, and the lookups are recorded).
PinnedDeck.eval_pinned("card-1.110.0/lib/card/env/success/target.rb")
Card::Env::Success.include(Card::Env::Success::Target) unless Card::Env::Success.ancestors.include?(Card::Env::Success::Target)

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
    @success ||= Card::Env::Success.new(cardname, success_params)
  end
end

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# Run the PINNED cud_success over one configuration and report what it
# rendered.
def run_cud_success(slotter_mode: nil, success_args: nil)
  Card::Env.ajax_answer = false
  Card::Env.success_params = success_args
  Card::Env.remove_instance_variable(:@success) if Card::Env.instance_variable_defined?(:@success)
  harness = PinnedDeck::ControllerHarness.new(
    params: slotter_mode.nil? ? {} : { "slotter_mode" => slotter_mode },
    card: PinnedDeck::CardDouble.new(name: "Front")
  )
  error = nil
  begin
    # The pinned method is private (rest.rb:29's private marker); send is
    # how the controller's own action methods call it (rest.rb:87).
    harness.send(:cud_success)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end

  {
    "slotterMode" => slotter_mode,
    "successArgs" => success_args,
    "rendered" => harness.rendered,
    "redirected" => harness.redirected,
    "error" => error
  }
end

ladder = {
  # The reload arm.
  "reloadTrue" => run_cud_success(success_args: { "reload" => "true" }),
  # Reload outranks slotter magic: the if/elsif order.
  "reloadTruePlusSlotter" => run_cud_success(slotter_mode: "silent-success", success_args: { "reload" => "true" }),
  # The slotter arm: each of the three magic values, each carrying an
  # explicit URL success mark so the redirect arm beside it is runnable.
  "slotterSilentSuccess" => run_cud_success(slotter_mode: "silent-success", success_args: { "mark" => "/Elsewhere" }),
  "slotterUpdateModalOrigin" => run_cud_success(slotter_mode: "update-modal-origin", success_args: { "mark" => "/Elsewhere" }),
  "slotterUpdateOrigin" => run_cud_success(slotter_mode: "update-origin", success_args: { "mark" => "/Elsewhere" }),
  # An unlisted mode is NOT magic: the redirect arm answers.
  "slotterUnlisted" => run_cud_success(slotter_mode: "modal-replace", success_args: { "mark" => "/Elsewhere" }),
  # Neither reload nor slotter magic: the redirect arm answers.
  "plainRedirect" => run_cud_success(success_args: { "mark" => "/Elsewhere" })
}

# The PINNED Success#reload? over the exact strings a form can carry.
reload_checks = {}
["true", "false", "", nil, "TRUE"].each do |value|
  success = Card::Env::Success.new(nil, value.nil? ? nil : { "reload" => value })
  reload_checks[value.nil? ? "absent" : value] = success.reload?
end

# The PINNED slotter_magic? over the exact strings a request can carry.
slotter_checks = {}
[nil, "", "silent-success", "update-modal-origin", "update-origin", "modal-replace", "TRUE"].each do |value|
  harness = PinnedDeck::ControllerHarness.new(
    params: value.nil? ? {} : { "slotter_mode" => value }
  )
  # The pinned method is private (response.rb:8), like the rest of the
  # controller's response surface; send is how the controller calls it.
  slotter_checks[value.nil? ? "absent" : value] = harness.send(:slotter_magic?)
end

# The pinned sources, quoted with line numbers.
cud_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                       .select { |row| row["line"].between?(79, 89) }
arms_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                        .select { |row| row["line"].between?(71, 81) }
success_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/env/success.rb")
                           .select { |row| row["line"].between?(41, 43) }

puts JSON.pretty_generate(
  "row" => "reg-routes-C4 + reg-routes-C5",
  "gemset" => "decko-0.20.0 + card-1.110.0 (pinned)",
  "ladder" => ladder,
  "reloadChecks" => reload_checks,
  "slotterChecks" => slotter_checks,
  "sources" => {
    "cudSuccess" => cud_source,
    "arms" => arms_source,
    "successReload" => success_source
  }
)

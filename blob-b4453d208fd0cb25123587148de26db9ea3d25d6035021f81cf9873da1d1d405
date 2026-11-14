# oracle-capture-setup-before-action-ruby.rb - the PINNED DECK's own `setup`
# before_action, executed.
#
# WHY THIS SCRIPT EXISTS: the completeness register's B6 row grades the port
# on the `setup` before_action (rest.rb:31-35, "cache renew + asset refresh +
# Env.reset"). The row's fix was "structural-equivalent documented", which
# says nothing about what the pinned method DOES. This capture measures the
# method itself, over recording doubles, and answers the three questions the
# row leaves open:
#
#   1. what the method calls, in what order;
#   2. the GATE on the second call - `unless params[:explicit_file]`;
#   3. which requests run the method at all (the before_action table).
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the method  decko-0.20.0/lib/card_controller/rest.rb:29-35
#                 private
#
#                 def setup
#                   Card::Cache.renew
#                   Card::Assets.refresh unless params[:explicit_file]
#                   Card::Env.reset self
#                 end
#               Three actions. The second one is GATED: an explicit-file
#               request skips the asset refresh. The third one installs the
#               request-scoped environment (card-1.110.0/lib/card/env.rb:25-29
#               - the controller, the params, and a cleared success, session,
#               serialized state and slot options).
#
#   the table   decko-0.20.0/lib/card_controller.rb:20-25
#                 before_action :setup, except: [:asset]
#                 before_action :authenticate, except: [:asset]
#                 before_action :load_mark, only: [:read]
#                 before_action :load_card, except: [:asset]
#                 before_action :load_action, only: [:read]
#                 before_action :refresh_card, only: %i[create update delete]
#               so `setup` runs for every action EXCEPT `asset`.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-setup-before-action-ruby.rb \
#     > fixtures/captured/setup-before-action-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The two cases and the table are fixed, so a re-run on the same
# gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!

# The PINNED DECK's own controller, loaded.
before_actions = PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

def actions_for(before_actions, action)
  before_actions.select do |entry|
    (entry["only"].empty? || entry["only"].include?(action)) &&
      !entry["except"].include?(action)
  end.map { |entry| entry["name"] }
end

# Run the PINNED `setup` over the recording doubles and report what it did.
def run_setup(params)
  Card::Cache.renewals = 0
  Card::Assets.refreshes = 0
  Card::Env.resets = 0
  Card::Env.reset_controller = nil

  harness = PinnedDeck::ControllerHarness.new(params: params)
  error = nil
  begin
    harness.send(:setup)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end

  {
    "params" => params,
    "cacheRenewals" => Card::Cache.renewals,
    "assetsRefreshes" => Card::Assets.refreshes,
    "envResets" => Card::Env.resets,
    "envResetTookController" => !Card::Env.reset_controller.nil?,
    "error" => error
  }
end

plain = run_setup({})
explicit_file = run_setup({ explicit_file: true })

# The method's own source, quoted with line numbers.
setup_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                           .select { |row| row["line"].between?(29, 35) }

# The REFRESH POLICY behind the second call, quoted from the PINNED MOD's
# own file (card-mod-assets-0.20.0/lib/card/assets.rb). The method calls
# `Card::Assets.refresh`, and that call answers a POLICY question first
# (`return unless force || refresh?`), so the policy is part of what the
# setup method does on a request. The policy has three modes and a
# cautious rule, and the cautious rule's marker lives in the SHARED
# cache - which is what decides how often the refresh runs.
asset_policy_lines = PinnedDeck.pinned_lines("card-mod-assets-0.20.0/lib/card/assets.rb")
policy_source = asset_policy_lines.select do |row|
  # The two policy methods in full (refresh? at :74-83 and
  # cautious_refresh? at :86-92) plus the marker constant at :4.
  row["line"] == 4 || row["line"].between?(74, 92)
end

puts JSON.pretty_generate(
  "row" => "reg-routes-B6",
  "gemset" => "decko-0.20.0 + card-mod-assets-0.20.0 (pinned)",
  "setupMethod" => {
    "plain" => plain,
    "explicitFile" => explicit_file,
    "source" => setup_source
  },
  "assetRefreshPolicy" => {
    "sourceFile" => "card-mod-assets-0.20.0/lib/card/assets.rb",
    "source" => policy_source
  },
  "beforeActionTable" => before_actions,
  "actionsForRead" => actions_for(before_actions, "read"),
  "actionsForAsset" => actions_for(before_actions, "asset"),
  "actionsForUpdate" => actions_for(before_actions, "update")
)

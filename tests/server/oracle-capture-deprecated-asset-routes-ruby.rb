# oracle-capture-deprecated-asset-routes-ruby.rb - the PINNED DECK's own
# deprecated asset routes, and the method they dispatch to.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A4 row grades the port
# on the deck's three DEPRECATED asset prefixes. The row's own note pointed
# at the route table without ever asking the pinned deck what those routes
# ANSWER, and the answer is the thing a port has to match: the asset action
# is a fixed installation-error 404 that needs NO deck state, because the
# pinned controller's before_action table excludes it.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the routes  decko-0.20.0/config/engine_routes.rb:12-16
#                 # DEPRECATED (old file and asset requests)
#                 %w[assets javascripts jasmine].each do |prefix|
#                   get "#{prefix}/*mark" => "card#asset"
#                 end
#
#   the method  decko-0.20.0/lib/card_controller/rest.rb:22-27
#                 def asset
#                   body = "Decko installation error: missing public directory symlinks"
#                   Rails.logger.info "#{body}.\n  >>> Try `rake card:mod:symlink`"
#                   render body: body, status: 404
#                 end
#
#   the table   decko-0.20.0/lib/card_controller.rb:20-25
#                 before_action :setup, except: [:asset]
#                 before_action :authenticate, except: [:asset]
#                 before_action :load_mark, only: [:read]
#                 before_action :load_card, except: [:asset]
#                 before_action :load_action, only: [:read]
#                 before_action :refresh_card, only: %i[create update delete]
#
# The table is the reason the asset arm is cheap to serve: the asset action
# runs NONE of the deck-state before_actions, so a host can answer it
# without touching the database.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-deprecated-asset-routes-ruby.rb \
#     > fixtures/captured/deprecated-asset-routes-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"

# The PINNED DECK's own route table, EXECUTED.
routes = PinnedDeck.route_table_executed
asset_routes = routes.select { |route| route["action"] == "card#asset" }

# The PINNED DECK's own controller, loaded: its four modules and its
# before_action table.
before_actions = PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# The PINNED DECK's own asset method, executed.
asset_harness = PinnedDeck::ControllerHarness.new
asset_error = nil
begin
  asset_harness.asset
rescue StandardError => e
  asset_error = "#{e.class}: #{e.message}"
end

# Which of the pinned before_actions run for the asset action, and which for
# the read action: the table's own only/except clauses decide.
def actions_for(before_actions, action)
  before_actions.select do |entry|
    (entry["only"].empty? || entry["only"].include?(action)) &&
      !entry["except"].include?(action)
  end.map { |entry| entry["name"] }
end

# The pinned method's own source, quoted with line numbers.
asset_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                             .select { |row| row["line"].between?(20, 29) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A4",
  "gemset" => "decko-0.20.0 + actionpack-7.2.4 (pinned)",
  "assetRoutes" => asset_routes,
  "routeTableSize" => routes.length,
  "beforeActions" => before_actions,
  "actionsForAsset" => actions_for(before_actions, "asset"),
  "actionsForRead" => actions_for(before_actions, "read"),
  "assetMethod" => {
    "rendered" => asset_harness.rendered,
    "error" => asset_error,
    "source" => asset_source
  }
)

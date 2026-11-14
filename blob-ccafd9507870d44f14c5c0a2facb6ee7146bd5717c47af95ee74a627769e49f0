# oracle-capture-card-asset-action-ruby.rb - the PINNED DECK's own card#asset
# method, executed.
#
# WHY THIS SCRIPT EXISTS: the completeness register's B5 row grades the port
# on `card#asset` (rest.rb:22-27, the deprecated 404 + symlink message). The
# row's note named the method and the 404; this capture measures the method
# itself, including the statement the row's note left out - the log line
# that carries the symlink hint - and the routes that dispatch to it.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the method  decko-0.20.0/lib/card_controller/rest.rb:22-27
#                 # @deprecated
#                 def asset
#                   body = "Decko installation error: missing public directory symlinks"
#                   Rails.logger.info "#{body}.\n  >>> Try `rake card:mod:symlink`"
#                   render body: body, status: 404
#                 end
#               Two statements are visible outside the response: the log line
#               (the body plus the symlink hint) and the render (the body at
#               404). The method is a FIXED answer - it never reads the card.
#
#   the routes that dispatch to it
#               decko-0.20.0/config/engine_routes.rb:14-16
#                 %w[assets javascripts jasmine].each { get "#{prefix}/*mark" => "card#asset" }
#               decko-0.20.0/config/engine_routes.rb:41-43
#                 %w[create read update delete asset].each { get "(card)/#{action}(/:mark)" => "card", action: action }
#
#   the table   decko-0.20.0/lib/card_controller.rb:20-23
#                 before_action :setup, except: [:asset]
#                 before_action :authenticate, except: [:asset]
#                 before_action :load_card, except: [:asset]
#               The asset action runs NONE of them, so the answer needs no
#               card, no session and no cache.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-card-asset-action-ruby.rb \
#     > fixtures/captured/card-asset-action-ruby-oracle.json
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
asset_action_route = routes.find { |route| route["requirements"]["action"] == "asset" }

# The PINNED DECK's own controller, loaded.
before_actions = PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

def actions_for(before_actions, action)
  before_actions.select do |entry|
    (entry["only"].empty? || entry["only"].include?(action)) &&
      !entry["except"].include?(action)
  end.map { |entry| entry["name"] }
end

# The PINNED DECK's own asset method, executed.
harness = PinnedDeck::ControllerHarness.new
error = nil
begin
  harness.asset
rescue StandardError => e
  error = "#{e.class}: #{e.message}"
end

# The method's own source, quoted with line numbers.
asset_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                             .select { |row| row["line"].between?(22, 27) }

puts JSON.pretty_generate(
  "row" => "reg-routes-B5",
  "gemset" => "decko-0.20.0 (pinned)",
  "assetMethod" => {
    "rendered" => harness.rendered,
    "error" => error,
    "logged" => Rails.logger.messages,
    "source" => asset_source
  },
  "assetRoutes" => asset_routes,
  "assetActionRoute" => asset_action_route,
  "actionsForAsset" => actions_for(before_actions, "asset"),
  "routeTableSize" => routes.length
)

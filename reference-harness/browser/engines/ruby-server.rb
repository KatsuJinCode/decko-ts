# Serves the stock Ruby oracle deck over HTTP for the browser scenarios.
#
#   HARNESS_DECK_JSON=<fixture>/deck.json HARNESS_PORT=<port> \
#     bundle exec decko runner reference-harness/browser/engines/ruby-server.rb
#
# DATABASE_URL names the scenario's private deck copy and DECKO_FILES_DIR its
# files, exactly as for the reference adapter. The deck environment, the
# frozen clock and local file storage come from lib/harness_env.rb; requests
# go through Decko's own controller. Two harness-only paths sit in front of
# the application and are never seen by Decko:
#
#   GET  /__harness/mail   the mail sent since the last call, as JSON (drained)
#   GET  /__harness/ready  200 once the deck is loaded

require_relative "../../oracle/lib/harness_env"
require_relative "../../oracle/lib/sqlite_regexp"
require "thin"

SPEC = JSON.parse(File.read(ENV.fetch("HARNESS_DECK_JSON")))
HarnessEnv.freeze_clock!(SPEC["clock"])
HarnessEnv.apply_environment!(SPEC["environment"])
HarnessSQLiteRegexp.install_active_record!
Cardio.config.asset_refresh = :never
port = Integer(ENV.fetch("HARNESS_PORT"))
# A browser follows Decko's absolute redirects, which are built on the deck
# origin, so the origin is this server's own address.
Cardio.config.deck_origin = "http://127.0.0.1:#{port}"
# The deck has its administrator and member accounts, but the builder created
# them as Decko Bot, and Decko infers "no account set up yet" from the account
# cards' creator; it would then answer every new-card page with the first-run
# setup form. This is the state a completed setup records.
Card::Auth.instance_variable_set(:@needs_setup, false)
# Account tokens (password reset, signup verification) are signed with the
# app's credentials secret, which a deployed deck has and this app does not:
# without one every reset mail carries "Error rendering" instead of its link.
# The TS server signs with the same fixture secret.
Card::Auth::Token.send(:remove_const, :SECRET_KEY)
Card::Auth::Token.const_set(:SECRET_KEY, "browser-scenarios-fixture-secret")

# Production error handling, as a deployed site answers an unhandled
# exception (the same two settings tools/parity-side-effects/ruby/drive.rb
# applies, with the same guards):
#
#   rescue_all_in_controller  decko-0.20.0's production environment sets it
#     true (the Railtie default and development leave it false). CardController
#     then rescues StandardError and shows the error view for the exception's
#     class (card_controller/errors.rb handle_exception): for a server error,
#     card-mod-format's :server_error under the page layout, status 500.
#   consider_all_requests_local  card-1.110.0's production environment sets
#     it false, so nothing that escapes the controller reaches Rails' developer
#     exception page (DebugExceptions checks show_detailed_exceptions).
#
# CardController registered its rescue handlers when its class body ran at
# boot, under the development default, so the registration is repeated here.
Cardio.config.rescue_all_in_controller = true
Cardio.config.consider_all_requests_local = false
CardController.rescue_from_class StandardError
unless CardController.rescue_handlers.any? { |name, _handler| name == "StandardError" }
  raise "rescue_all_in_controller did not take: StandardError is not rescued"
end
unless Cardio.application.env_config["action_dispatch.show_detailed_exceptions"] == false
  raise "consider_all_requests_local did not take: " \
        "show_detailed_exceptions is #{Cardio.application.env_config['action_dispatch.show_detailed_exceptions'].inspect}"
end

# Mail sent by any request thread lands in one shared list.
MAIL = []
MAIL_LOCK = Mutex.new
class HarnessMailStore
  def self.delivering_email(message)
    MAIL_LOCK.synchronize do
      MAIL << {
        "to" => Array(message.to).map(&:to_s).sort,
        "subject" => message.subject.to_s,
        "text" => (message.text_part&.decoded || (message.multipart? ? "" : message.body.decoded)).to_s
      }
    end
  end
end
ActionMailer::Base.register_interceptor(HarnessMailStore)

class HarnessPaths
  def initialize(app) = @app = app

  def call(env)
    case env["PATH_INFO"]
    when "/__harness/runtime" then [200, { "content-type" => "application/json" }, [JSON.generate({ engine: "ruby", ruby: RUBY_VERSION, card: Gem.loaded_specs["card"].version.to_s, decko: Gem.loaded_specs["decko"].version.to_s, sqlite_regexp_adapter: HarnessSQLiteRegexp::IMPLEMENTATION })]]
    when "/__harness/ready" then [200, { "content-type" => "text/plain" }, ["ready"]]
    when "/__harness/mail"
      mail = MAIL_LOCK.synchronize { MAIL.dup.tap { MAIL.clear } }
      [200, { "content-type" => "application/json" }, [JSON.generate(mail)]]
    else @app.call(env)
    end
  end
end

app = Rack::Builder.new do
  use HarnessPaths
  run Rails.application
end

$stderr.puts "ruby deck listening on http://127.0.0.1:#{port}"
Thin::Logging.silent = true
Thin::Server.new("127.0.0.1", port, app, signals: false).start

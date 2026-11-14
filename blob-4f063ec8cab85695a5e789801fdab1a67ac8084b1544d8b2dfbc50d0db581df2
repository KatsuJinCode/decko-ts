require File.expand_path("../boot", __FILE__)
require "decko/application"

# The reference oracle deck. Stock Decko configuration, with three
# harness-specific settings:
#   - mail goes to ActionMailer's in-memory :test store, never the network
#     (the harness reads it as a side effect);
#   - the cache lives in a per-run directory so runs cannot share state;
#   - uploaded files stay on local disk under the deck's files directory.
module ReferenceOracle
  class Application < Decko::Application
    config.action_mailer.perform_deliveries = true
    config.action_mailer.delivery_method = :test
    config.cache_store = :file_store, ENV.fetch("DECKO_CACHE_DIR", "tmp/cache")
    config.paths["files"] = ENV.fetch("DECKO_FILES_DIR", "files")
  end
end

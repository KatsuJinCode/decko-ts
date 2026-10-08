# Shared environment for every oracle script: the frozen clock, the deck
# environment named by the fixture, and request-boundary resets.
#
# Loaded by build-deck.rb and adapter.rb, both run under `decko runner`.

require "json"
require "fileutils"
require "active_support/testing/time_helpers"

module HarnessEnv
  extend ActiveSupport::Testing::TimeHelpers

  class << self
    attr_reader :clock

    # Pins Time.now / Date.today to the fixture clock for the whole process.
    # Every reference output is produced under this clock, so no output
    # carries a wall-clock byte.
    def freeze_clock!(iso)
      @clock = Time.iso8601(iso).utc
      travel_to(@clock)
    end

    # The deck environment the fixture states. Only settings a stock deck
    # exposes as configuration are allowed here.
    def apply_environment!(env)
      env ||= {}
      Cardio.config.deck_origin = env["origin"] if env["origin"]
      Cardio.config.default_html_view = env["default_html_view"].to_sym if env["default_html_view"]
      # Production rendering semantics: a nested view error renders inline
      # instead of raising page-wide.
      Cardio.config.raise_all_rendering_errors = false
      # No network: recaptcha unconfigured, so no save calls a verify endpoint.
      %i[recaptcha_site_key recaptcha_secret_key recaptcha_public_key recaptcha_private_key].each do |key|
        Cardio.config.send("#{key}=", nil)
      end
      configure_files!
      # Mail goes to the in-memory :test store, never the network. Set here
      # because Decko's development environment turns deliveries off after
      # the application config is read.
      ActionMailer::Base.delivery_method = :test
      ActionMailer::Base.perform_deliveries = true
    end

    # Uploaded files live on local disk under DECKO_FILES_DIR (the deck's
    # files tree); no cloud buckets.
    def configure_files!
      files = ENV.fetch("DECKO_FILES_DIR")
      public_dir = File.join(ENV.fetch("DECKO_CACHE_DIR"), "public")
      tmp_dir = File.join(ENV.fetch("DECKO_CACHE_DIR"), "tmp")
      FileUtils.mkdir_p([files, File.join(public_dir, "files"), tmp_dir])
      Cardio.paths["tmp"] = tmp_dir
      Cardio.config.file_buckets = {}
      Cardio.config.file_default_storage = :local
      Cardio.paths["files"] = files
      Cardio.paths["public"] = public_dir
      # Ruby Decko targets POSIX hosts, where the public-link step's symlink
      # succeeds. Windows grants symlinks only with a privilege, so use hard
      # links there; no rendered or stored byte depends on the link kind.
      return unless Gem.win_platform?

      File.singleton_class.prepend(Module.new do
        def symlink(src, dest) = File.link(src, dest)
        def symlink?(path) = File.exist?(path)
      end)
    end

    # What a new request does before it reaches the card: fresh per-request
    # state and caches, mail store emptied, then the actor signed in.
    def begin_request!(actor_id)
      Card::Env.reset
      Card::Cache.renew if Card::Cache.respond_to?(:renew)
      ActionMailer::Base.deliveries.clear
      Card::Auth.signin actor_id
    end

    # Runs a block on the main thread, or on a big-stack thread when
    # HARNESS_BIG_STACK=1.
    def on_stack(&block)
      ENV["HARNESS_BIG_STACK"] == "1" ? on_big_stack(&block) : block.call
    end

    # Runs a block on a thread with a large stack: Decko's compound-name
    # resolution recurses past the fixed main-thread stack on Windows.
    def on_big_stack(&block)
      result = nil
      error = nil
      t = Thread.new do
        result = block.call
      rescue Exception => e # rubocop:disable Lint/RescueException
        error = e
      end
      # The runner's main thread holds Rails' load interlock; let the worker
      # thread autoload (an upload's first use loads the uploader classes),
      # or the two deadlock.
      ActiveSupport::Dependencies.interlock.permit_concurrent_loads { t.join }
      raise error if error

      result
    end
  end
end

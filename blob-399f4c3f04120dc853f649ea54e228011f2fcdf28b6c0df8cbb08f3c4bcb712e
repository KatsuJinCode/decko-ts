require File.expand_path("../boot", __FILE__)
require "decko/application"

module CucumberDeck
  # A stock deck for Decko's own cucumber features. The database, cache and
  # files live in the run's work directory (CUCUMBER_WORK), never in the
  # checkout.
  class Application < Decko::Application
    work = ENV.fetch("CUCUMBER_WORK")
    config.cache_store = :file_store, File.join(work, "cache")
    config.paths["files"] = File.join(work, "files")
    # public/mod/<mod> holds each card mod's public files (TinyMCE's theme,
    # ace's modes), as `decko setup` links them; the runner copies them here.
    config.paths["public"] = File.join(work, "public")
    # Uploads are cached under tmp before they are stored.
    config.paths["tmp"] = File.join(work, "tmp")
  end
end

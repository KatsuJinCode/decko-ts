# Native launcher: Windows' bash.exe can resolve to WSL, which discards the
# staged HARNESS variables and selects another Ruby/gem platform.
ENV["GEM_HOME"] = "C:/Ruby33-x64/lib/ruby/gems/3.3.0"
ENV["GEM_PATH"] = ENV.fetch("GEM_HOME")
ENV["RAILS_ENV"] = "development"
ENV["DATABASE_URL"] = "sqlite3:#{ENV.fetch('HARNESS_DECK')}"
ENV["DECKO_FILES_DIR"] = ENV.fetch("HARNESS_FILES")
ENV["DECKO_CACHE_DIR"] = "#{ENV.fetch('HARNESS_WORK')}/cache"
app = File.expand_path("../../oracle/app", __dir__)
Dir.chdir app
ARGV.replace ["runner", File.expand_path("ruby-server.rb", __dir__)]
load File.join(app, "script/decko")

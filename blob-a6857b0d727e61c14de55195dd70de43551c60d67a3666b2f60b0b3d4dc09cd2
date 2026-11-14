# oracle-capture-forgery-posture-ruby.rb - scans the PINNED GEMSET for
# forgery protection and records every hit.
#
# Why this script exists: the completeness register's C16 row
# (register-routes) grades the port DIVERGENT: "live decko arms NO forgery
# protection (receipt documented at write-routes.ts:62-76)" against a port
# that "origin-checks every state-changing request
# (src/server/write-routes.ts:1777-1783) and restricts GET-mutation arms to
# same-origin XHR (vm-staging-server.mjs:4141-4155)". Its fix: "either drop
# the origin check or pin the hardening as an accepted, operator-ruled
# divergence".
#
# The second half of that fix is DONE: the port's approved-divergences table
# (docs/SECURITY.md) carries the forgery row with the Ruby cell, the Port
# cell, the Why, the Compatibility, the Configuration
# (DECKO_ORIGIN_CHECK=off restores Ruby's behaviour) and the Tests.
#
# What was NOT measured is the Ruby cell's claim itself: "decko 0.20.0 and
# card 1.110.0 contain no protect_from_forgery". That claim was derived by
# reading the gems. This script SCANS the pinned gemset for every forgery
# protection reference and records the hits, so the claim is a measurement of
# the pin rather than a reading of two files.
#
# The patterns are Rails' own names for the machinery: the
# protect_from_forgery call, the allow_forgery_protection setting, the
# verify_authenticity_token callback, the request_forgery_protection
# module, and the general forgery_protection namespace.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-forgery-posture-ruby.rb \
#     > fixtures/captured/forgery-posture-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The gem list and the hit list are sorted, so a re-run on the same
# gemset is byte-stable.

require "json"

GEM_ROOT = ENV.fetch("DECKO_RUBY_GEMSET", nil)
gems_root = if GEM_ROOT
              GEM_ROOT
            else
              File.expand_path(
                "../../reference-harness/ruby-oracle-gems/ruby/3.4.0/gems",
                __dir__
              )
            end

PATTERNS = [
  "protect_from_forgery",
  "allow_forgery_protection",
  "verify_authenticity_token",
  "request_forgery_protection",
  "forgery_protection"
].freeze

gems = Dir.children(gems_root).select { |entry| File.directory?(File.join(gems_root, entry)) }.sort

hits = []
gems.each do |gem|
  # Every ruby file the gem ships, not just lib/: the configuration files
  # (config/environments/*.rb) are where a Rails app arms or disarms
  # forgery protection, so a lib-only scan would miss the very file that
  # matters.
  Dir.glob(File.join(gems_root, gem, "**", "*.rb")).sort.each do |file|
    begin
      body = File.read(file)
    rescue StandardError
      next
    end
    body.lines.each_with_index do |line, index|
      PATTERNS.each do |pattern|
        next unless line.include?(pattern)
        hits << {
          "gem" => gem,
          "file" => file.sub("#{gems_root}/#{gem}/", ""),
          "line" => index + 1,
          "pattern" => pattern,
          "text" => line.strip
        }
      end
    end
  end
end

puts JSON.pretty_generate(
  "gemset" => "the pinned deck gemset",
  "gemCount" => gems.length,
  "patterns" => PATTERNS,
  "hitCount" => hits.length,
  # The DECK's own gems (the deck, the card library and the card mods) are
  # the ones the divergence is about: they are what a deck's own code
  # carries. The framework gems (Rails itself) carry the machinery, which a
  # deck arms or disarms; their hits are recorded so the separation is
  # visible rather than assumed.
  "deckGemHits" => hits.select { |hit| hit["gem"].match?(/\A(decko|card|card-mod)-/) },
  "frameworkHitCount" => hits.count { |hit| !hit["gem"].match?(/\A(decko|card|card-mod)-/) },
  "hits" => hits
)

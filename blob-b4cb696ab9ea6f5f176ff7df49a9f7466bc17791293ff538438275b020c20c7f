# oracle-capture-needs-setup-ruby.rb - runs the PINNED GEM's own
# needs_setup? decision and the PINNED DECK's own mark arming, and records
# what they answer.
#
# Why this script exists: the completeness register's B10 row (register-routes)
# grades the port DIVERGENT: "Ruby arms /setup automatically while
# Auth.needs_setup? (decko-0.20.0/lib/card_controller/mark.rb:56-63) and the
# port gates it behind DECKO_FIRST_RUN=1
# (src/server/first-run-routes.ts:123, :181)". That was derived by reading
# the gems.
#
# This script runs the two gem methods the row rests on, from the PINNED
# GEMSET:
#
#   1. card-1.110.0/lib/card/auth/setup.rb - needs_setup?, its census
#      (user_account_cql + user_account_count) and its cache marker
#      (NEEDS_SETUP). The gem's own file is loaded as it is; the composition
#      line is the one card-1.110.0/lib/card/auth.rb:9 carries
#      (`extend Setup`), and Card.cache, Card.count_by_cql and as_bot are
#      stubbed because they need a live deck.
#
#   2. decko-0.20.0/lib/card_controller/mark.rb - initial_setup?, the arming
#      that turns a markless read into the setup card. The deck gem's own
#      file is loaded as it is; Card::Auth.needs_setup? and Card::Env.html?
#      are stubbed so both cells of the conjunction can be recorded.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-needs-setup-ruby.rb \
#     > fixtures/captured/needs-setup-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The account counts are the script's own constants, so a re-run on
# the same gemset is byte-stable.

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

# The load path: every pinned gem's lib directory, the way Bundler would
# put them. The card gem's own file needs ActiveSupport's `present?` (the
# census's hidden-account arm), so the pinned activesupport is on the path.
pinned_libs = Dir.glob(File.join(gems_root, "*", "lib")).sort
raise "no pinned gems found at #{gems_root}" if pinned_libs.empty?

pinned_libs.each do |lib|
  gem_dir = File.dirname(lib)
  gem_name = File.basename(gem_dir).sub(/-\d[^-]*\z/, "")
  nested = File.join(lib, gem_name)
  $LOAD_PATH.unshift(nested) if File.directory?(nested)
  $LOAD_PATH.unshift(lib)
end

require "active_support/core_ext/object/blank"

# ---------------------------------------------------------------------------
# the stubs the gem's own methods call
# ---------------------------------------------------------------------------

class Card
  class << self
    # The count the gem's census answers with, and a record of how many
    # times the census RAN (so the cache marker is visible, not inferred).
    attr_accessor :account_count, :census_runs

    def cache
      @cache ||= Cache.new
    end

    def count_by_cql(_cql)
      @census_runs += 1
      @account_count
    end

    def search(_cql)
      []
    end
  end

  class Cache
    def initialize
      @store = {}
    end

    def read(key)
      @store[key]
    end

    def write(key, value)
      @store[key] = value
    end

    def delete(key)
      @store.delete(key)
    end
  end

  module Auth
  end
end

# The bot's id, the one the census excludes (auth/setup.rb:49).
Card.const_set(:DeckoBotID, 1)

# as_bot (auth/proxy.rb:27-29) yields with the bot as the proxy actor; the
# census runs inside it.
Card::Auth.define_singleton_method(:as_bot) { |&block| block.call }

setup_rb = File.join(gems_root, "card-1.110.0/lib/card/auth/setup.rb")
raise "card's auth/setup.rb not found at #{setup_rb}" unless File.exist?(setup_rb)

# The card gem's own file, loaded as it is.
eval(File.read(setup_rb), TOPLEVEL_BINDING, setup_rb) # rubocop:disable Security/Eval

# The composition line card-1.110.0/lib/card/auth.rb:9 carries.
Card::Auth.extend Card::Auth::Setup

# ---------------------------------------------------------------------------
# 1. the census and the decision
# ---------------------------------------------------------------------------

# The gem's own CQL, recorded by calling the gem's own method.
cql = Card::Auth.send(:user_account_cql)

def decision_for(count)
  Card.account_count = count
  Card.census_runs = 0
  Card.cache.delete Card::Auth::Setup::NEEDS_SETUP
  Card::Auth.remove_instance_variable(:@needs_setup) if Card::Auth.instance_variable_defined?(:@needs_setup)
  answer = Card::Auth.needs_setup?
  {
    "accountCount" => count,
    "needsSetup" => answer,
    "censusRuns" => Card.census_runs,
    "cacheMarker" => Card.cache.read(Card::Auth::Setup::NEEDS_SETUP)
  }
end

decisions = [
  decision_for(0),
  decision_for(1),
  decision_for(3)
]

# THE CACHE MARKER: once the census has counted a non-zero number of
# accounts, the gem writes NEEDS_SETUP=false and never counts again. The
# second call below therefore answers false WITHOUT running the census, even
# though the deck now counts zero.
Card.account_count = 1
Card.census_runs = 0
Card.cache.delete Card::Auth::Setup::NEEDS_SETUP
Card::Auth.remove_instance_variable(:@needs_setup) if Card::Auth.instance_variable_defined?(:@needs_setup)
first = Card::Auth.needs_setup?
Card.account_count = 0
second = Card::Auth.needs_setup?
cached = {
  "firstAnswer" => first,
  "secondAnswer" => second,
  "censusRuns" => Card.census_runs,
  "cacheMarker" => Card.cache.read(Card::Auth::Setup::NEEDS_SETUP)
}

# ---------------------------------------------------------------------------
# 2. the mark arming (the deck gem's own file)
# ---------------------------------------------------------------------------

mark_rb = File.join(gems_root, "decko-0.20.0/lib/card_controller/mark.rb")
raise "decko's card_controller/mark.rb not found at #{mark_rb}" unless File.exist?(mark_rb)

# The deck gem's own file, loaded as it is.
eval(File.read(mark_rb), TOPLEVEL_BINDING, mark_rb) # rubocop:disable Security/Eval

# The two cells of the conjunction (mark.rb:56-58):
# `Card::Auth.needs_setup? && Card::Env.html?`.
$needs_setup = false
$html = true

Card::Auth.define_singleton_method(:needs_setup?) { $needs_setup }

# The default accounted type id the setup card is created in
# (mark.rb:61). The gem asks the deck for it; the capture records the value
# the deck would answer, so the prepared params carry a real shape.
Card.define_singleton_method(:default_accounted_type_id) { 2 }

class Card
  module Env
    def self.html?
      $html
    end
  end
end

class MarkHarness
  include CardController::Mark

  attr_accessor :params

  def initialize(params)
    @params = params
  end
end

harness = MarkHarness.new({})
marking = []
[[true, true], [true, false], [false, true], [false, false]].each do |needs_setup, html|
  $needs_setup = needs_setup
  $html = html
  marking << {
    "needsSetup" => needs_setup,
    "html" => html,
    "initialSetup" => harness.send(:initial_setup?)
  }
end

# The setup card the arming prepares (mark.rb:60-63): the params it writes.
$needs_setup = true
$html = true
harness.params = {}
harness.send(:prepare_setup_card!)
prepared = {
  "card" => harness.params[:card],
  "view" => harness.params[:view]
}

puts JSON.pretty_generate(
  "gemset" => "card-1.110.0 + decko-0.20.0 (pinned)",
  "cql" => cql,
  "decisions" => decisions,
  "cached" => cached,
  "markArming" => marking,
  "preparedParams" => prepared
)

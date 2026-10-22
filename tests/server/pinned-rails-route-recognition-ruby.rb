# pinned-rails-route-recognition-ruby.rb - the PINNED RAILS' own matcher, run
# over the PINNED deck's own route table.
#
# WHAT THIS IS. The rows in this tranche ([Family] rows E6 through E13) ask
# one question about the pinned side: at this path, with this verb, what does
# the PINNED deck actually answer? The shared loading rig
# (oracle-capture-pinned-deck-harness-ruby.rb) already answers a NEARBY
# question - it EXECUTES the pinned deck's own route table against a recording
# Draw and the family's shared reduction reads the recorded route list. That
# reduction is deliberately LOOSE in the permissive direction (a dynamic
# segment matches ANY segment, and a "*glob" pattern matches EVERY path), so
# its answer is a SUPERSET: it is right that "no pinned route admits this
# verb for this path", and it is right about the candidate list, but the
# FIRST route it reports is not always the route the pinned deck would
# dispatch to, because the looseness lets a route that needs a literal prefix
# ("assets/*mark" needs "/assets/") win over an earlier route that matches
# exactly.
#
# This file answers the sharper question, with the PINNED RAILS' OWN matcher:
# the pinned actionpack-7.2.4 (which carries Journey, the router Rails uses)
# builds a real ActionDispatch::Routing::RouteSet, the PINNED deck's own
# config/engine_routes.rb is drawn into it verbatim, and the router is asked
# to recognize each probe path with each probe verb. What comes back is the
# route the pinned deck dispatches to, with its own parameters, in the
# pinned deck's own matching precedence.
#
# THE LOAD ORDER MATTERS and is stated here so the next reader does not
# "simplify" it:
#
#   1. The pinned gems' load path goes on FIRST, with ONE exception: the
#      card gems' nested lib/<gem_name> directories stay OFF it, because
#      card-1.110.0/lib/card/set.rb IS the stdlib "set" and shadows it
#      (i18n/config.rb requires "set" and gets the card gem's file instead).
#   2. action_dispatch is required SECOND and the shared rig THIRD. The rig
#      defines a stand-in ActionController::Base, and a stand-in declared
#      BEFORE the real one is a superclass mismatch (TypeError); the rig's
#      stand-in reopening the real class is harmless here, because no
#      controller is ever defined in this measurement.
#   3. The pinned deck's config value the routes file reads
#      (Decko::Engine.config.files_web_path) is read from the PINNED mod's
#      own file through the rig's own PinnedDeck.files_web_path, BEFORE the
#      table is drawn, because the real deck loads that mod at boot and the
#      routes file interpolates the value into two of its path patterns
#      (engine_routes.rb:10,13). Reading it from the pinned file is the
#      rig's own documented way to do this; writing the string down from
#      memory is not.
#
# WHAT A "NO ROUTE" ANSWER MEANS. The router raises
# ActionController::RoutingError for a path no route matches, which in a
# served deck is the router's own 404. That is a real pinned answer, and it
# is recorded as one.
#
# This is a SUPPORT file for the capture scripts beside it, not the loading
# rig: the loading rig is oracle-capture-pinned-deck-harness-ruby.rb, and it
# is deliberately untouched.

require "json"

# ---------------------------------------------------------------------------
# 1. the pinned gems' load path
# ---------------------------------------------------------------------------
#
# The card gems' nested lib/<gem_name> directories are left off on purpose:
# card-1.110.0/lib/card/set.rb would answer a require of "set" (i18n's
# config.rb requires it) and the load would explode inside the card gem.
module PinnedRailsRouteRecognition
  module_function

  # The environment variable the shared rig reads the pinned gemset from.
  GEMSET_ENV = "DECKO_RUBY_GEMSET".freeze

  # The pinned gemset's root, read the way the shared rig reads it: the
  # DECKO_RUBY_GEMSET environment variable when it is set, and the same
  # default path the rig falls back to when it is not.
  def gems_root
    @gems_root ||= begin
      root = ENV[PinnedRailsRouteRecognition::GEMSET_ENV]
      root ||= File.expand_path(
        "../../../reference-harness/ruby-oracle-gems/ruby/3.4.0/gems",
        __dir__
      )
      raise "no pinned gemset at #{root}; set #{PinnedRailsRouteRecognition::GEMSET_ENV}" unless Dir.exist?(root)

      root
    end
  end

  # The number of load-path entries added, so the capture can record it.
  def load_pinned_rails!
    return @load_pinned_rails_count if @load_pinned_rails_count

    root = gems_root
    count = 0
    Dir.glob(File.join(root, "*")).select { |dir| File.directory?(dir) }.sort.each do |gem_dir|
      lib = File.join(gem_dir, "lib")
      next unless File.directory?(lib)

      $LOAD_PATH.unshift(lib)
      count += 1
      gem_name = File.basename(gem_dir).sub(/-\d[^-]*\z/, "")
      nested = File.join(lib, gem_name)
      next unless File.directory?(nested)
      next if gem_name.start_with?("card")

      $LOAD_PATH.unshift(nested)
      count += 1
    end
    @load_pinned_rails_count = count
  end

  # The pinned actionpack's own router. Required AFTER the load path and
  # BEFORE the rig (see the header).
  def require_pinned_rails_router!
    return if @router_required

    load_pinned_rails!
    require "action_dispatch"
    # active_support's NameError#missing_name and String#constantize, which
    # actionpack's request-parameter encoder uses to look the controller up.
    require "active_support/core_ext/name_error"
    require "active_support/core_ext/string/inflections"
    @router_required = true
  end
end

PinnedRailsRouteRecognition.require_pinned_rails_router!

require_relative "oracle-capture-pinned-deck-harness-ruby"

module PinnedRailsRouteRecognition
  module_function

  # The PINNED deck's own route table, drawn into a REAL pinned-rails route
  # set, with the pinned deck's own config value primed first.
  def route_set
    @route_set ||= begin
      # The pinned carrierwave mod's own file sets files_web_path (the rig
      # evaluates the mod's file and reads the value back).
      files_web_path = PinnedDeck.files_web_path
      raise "the pinned files_web_path is empty" if files_web_path.to_s.empty?

      decko = Module.new
      engine = Module.new
      engine.define_singleton_method(:routes) { @routes ||= ActionDispatch::Routing::RouteSet.new }
      engine.define_singleton_method(:config) { Cardio.config }
      decko.const_set(:Engine, engine)
      Object.send(:remove_const, :Decko) if Object.const_defined?(:Decko)
      Object.const_set(:Decko, decko)

      # The PINNED routes file, evaluated verbatim.
      PinnedDeck.eval_pinned("decko-0.20.0/config/engine_routes.rb")
      Decko::Engine.routes
    end
  end

  # The pinned deck's own route table, as the pinned router holds it: the
  # verb, the path pattern and the defaults each route carries, in the
  # order the deck registers them (the order IS the matching precedence).
  def route_set_rows
    route_set.routes.map.with_index do |route, index|
      {
        "index" => index,
        "verb" => route.verb,
        "path" => route.path.spec.to_s,
        "defaults" => route.defaults.each_with_object({}) { |(key, value), out| out[key.to_s] = value.to_s }
      }
    end
  end

  # The PINNED router's own answer for one path and one verb.
  #
  # "matched" false means the pinned router found no route: the pinned deck
  # raises ActionController::RoutingError there, which a served deck answers
  # with the router's own 404.
  #
  # "matches" holds EVERY route the pinned router matched, in the pinned
  # router's own precedence order, so a reader can see both the answer (the
  # first) and the field it was chosen from.
  def recognize(pathname, verb)
    request = ActionDispatch::Request.new(
      Rack::MockRequest.env_for(pathname, method: verb.to_s.upcase)
    )
    matched = []
    route_set.router.recognize(request) do |route, parameters|
      matched << {
        "verb" => route.verb,
        "path" => route.path.spec.to_s,
        "defaults" => route.defaults.each_with_object({}) { |(key, value), out| out[key.to_s] = value.to_s },
        "parameters" => parameters.each_with_object({}) { |(key, value), out| out[key.to_s] = value.to_s }
      }
    end
    {
      "path" => pathname,
      "verb" => verb.to_s.downcase,
      "matched" => !matched.empty?,
      "answer" => matched.first,
      "matches" => matched
    }
  end
end

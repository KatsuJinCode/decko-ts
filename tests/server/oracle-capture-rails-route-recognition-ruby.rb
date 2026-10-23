# oracle-capture-rails-route-recognition-ruby.rb - the PINNED DECK's own
# route table, RECOGNIZED by the PINNED actionpack's own route matcher.
#
# WHY THIS SCRIPT EXISTS. Every route row in this family grades the port on
# ONE thing: which route the pinned deck's table (decko-0.20.0/config/
# engine_routes.rb) matches for a given request, and what that match puts in
# params. Until now that answer was READ OFF the pattern string, or
# HAND-BUILT as a params hash. Both are weaker than executing the matcher:
#
#   - a pattern string does not say how the matcher SPLITS a segment. The
#     row's own capture for the :mark/view/:view arm (engine_routes.rb:24)
#     asserts that the .:format capture "rides the VIEW segment for every
#     format" - a claim the capture could not test, because it built the
#     params hash by hand instead of letting the matcher build it.
#   - a pattern string does not say which requirement ANCHORS. The legacy
#     card/:view arm (engine_routes.rb:25) carries `view: /new|edit/`; the
#     read of that source says the requirement is UNANCHORED and so admits
#     "newer" and "editing" too. The matcher says otherwise.
#
# So this capture runs the PINNED route file against the PINNED
# actionpack's REAL RouteSet (actionpack-7.2.4), and records what the
# matcher answers for a fixed case list: the route that matched (its index
# in the table, its verb, its path spec), the params it produced, and the
# no-match answer where nothing matched.
#
# THE PINNED TABLE IS EXECUTED, NOT RE-TYPED. The capture evaluates
# decko-0.20.0/config/engine_routes.rb against a real
# ActionDispatch::Routing::RouteSet, with Decko::Engine.routes bound to
# that RouteSet and Decko::Engine.config bound to the deck's own config
# object. The files web path is the PINNED carrierwave mod's own value
# (card-mod-carrierwave-0.20.0/lib/card/mod/carrierwave.rb:2), executed,
# not written down. The route count the capture records is the table's own.
#
# THE LOAD PATH. The gemset shadows a handful of Ruby standard library
# names (benchmark, cgi, json, logger, securerandom, set - the nested
# card gem lib answers require "set" with card/set.rb). The capture
# pre-requires every shadowed name from the standard library FIRST, then
# APPENDS the gemset's lib directories, so the standard library keeps
# priority on those names while every gem's own require paths still
# resolve. This is why the real actionpack router loads here at all.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-rails-route-recognition-ruby.rb \
#     > fixtures/captured/rails-route-recognition-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require "json"
require "rbconfig"

GEMSET = ENV["DECKO_RUBY_GEMSET"] ||
         "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems"
raise "no pinned gemset at #{GEMSET}" unless Dir.exist?(GEMSET)

# ---------------------------------------------------------------------------
# the load path: the standard library first, the gemset appended
# ---------------------------------------------------------------------------

stdlib_dir = RbConfig::CONFIG["rubylibdir"]
gem_libs = Dir.glob(File.join(GEMSET, "*", "lib"))
gem_names = gem_libs.map { |lib| File.basename(File.dirname(lib)).sub(/-\d[^-]*\z/, "") }
gem_top_level = gem_libs.flat_map { |lib| Dir.glob(File.join(lib, "*.rb")) }
gem_nested = gem_libs.zip(gem_names).flat_map { |lib, name| Dir.glob(File.join(lib, name, "*.rb")) }
shadowed_names = (gem_top_level + gem_nested)
                  .map { |file| File.basename(file, ".rb") }.uniq
                  .select { |name| File.exist?(File.join(stdlib_dir, "#{name}.rb")) }
                  .sort
shadowed_names.each do |name|
  begin
    require name
  rescue LoadError
    # A shadowed name the standard library does not actually ship is
    # recorded, not silently swallowed: the capture writes it down.
  end
end

gem_libs.each do |lib|
  name = File.basename(File.dirname(lib)).sub(/-\d[^-]*\z/, "")
  nested = File.join(lib, name)
  $LOAD_PATH.push(nested) if File.directory?(nested)
  $LOAD_PATH.push(lib)
end

require "ostruct"
require "action_controller"
require "action_dispatch"
require "active_support/core_ext/name_error"

# The PINNED deck's ONE controller, by name only: the route matcher resolves
# the controller constant before it returns, and nothing else about the
# controller matters to recognition.
class CardController < ActionController::Base; end

# The deck's own config object. Cardio::Railtie.config IS Cardio.config,
# because the PINNED carrierwave mod writes into it
# (card-mod-carrierwave-0.20.0/lib/card/mod/carrierwave.rb:1-5) and the
# pinned deck's own methods read it (decko-0.20.0/lib/card_controller/
# response.rb:11).
class Cardio
  module Railtie
    def self.config
      Cardio.config
    end
  end

  class << self
    def config
      @config ||= OpenStruct.new(cache_log_level: nil)
    end
  end
end

def eval_pinned(relative)
  path = File.join(GEMSET, relative)
  raise "pinned file not found at #{path}" unless File.exist?(path)

  eval(File.read(path), TOPLEVEL_BINDING, path) # rubocop:disable Security/Eval
end

def pinned_lines(relative)
  File.read(File.join(GEMSET, relative)).lines.each_with_index.map do |line, index|
    { "line" => index + 1, "text" => line.chomp }
  end
end

# The files web path the route table reads, from the PINNED mod's own file.
eval_pinned("card-mod-carrierwave-0.20.0/lib/card/mod/carrierwave.rb")
FILES_WEB_PATH = Cardio::Railtie.config.files_web_path

# ---------------------------------------------------------------------------
# the PINNED route table, executed by the PINNED matcher
# ---------------------------------------------------------------------------

ROUTE_SET = ActionDispatch::Routing::RouteSet.new
engine = Module.new
engine.define_singleton_method(:routes) { ROUTE_SET }
engine.define_singleton_method(:config) { Cardio::Railtie.config }
unless Object.const_defined?(:Decko)
  Object.const_set(:Decko, Module.new)
end
Decko.const_set(:Engine, engine)
eval_pinned("decko-0.20.0/config/engine_routes.rb")

ROUTES = ROUTE_SET.routes.each_with_index.map do |route, index|
  {
    "order" => index + 1,
    "verb" => route.verb,
    "spec" => route.path.spec.to_s,
    "requirements" => route.requirements.each_with_object({}) do |(key, value), out|
      out[key.to_s] = value.is_a?(Regexp) ? value.source : value.to_s
    end
  }
end

# ---------------------------------------------------------------------------
# the recognition
# ---------------------------------------------------------------------------

def no_match(reason)
  {
    "matched" => false,
    "routeOrder" => nil,
    "routeVerb" => nil,
    "routeSpec" => nil,
    "params" => nil,
    "errorClass" => "Journey::Router::RoutingError",
    "error" => reason
  }
end

def recognize(path, verb)
  env = Rack::MockRequest.env_for(path, method: verb)
  # The same request the pinned RouteSet#recognize_path builds: ActionDispatch
  # owns the request, the router owns the path_info normalisation.
  request = ActionDispatch::Request.new(env)
  request.path_info = ActionDispatch::Journey::Router::Utils.normalize_path(request.path_info)
  found = nil
  ROUTE_SET.router.recognize(request) do |route, params|
    found = { route: route, params: params }
    break
  end
  return no_match("no route matched #{verb} #{path}") if found.nil?

  {
    "matched" => true,
    # The route's OWN index in the table, by object identity: the spec
    # string repeats across the table (the :mark(.:format) arm is
    # registered four times with different verbs). The index is ZERO-BASED,
    # the same numbering the family's older captures use (the shared
    # harness's recorder assigns "order" => @routes.length BEFORE it
    # pushes, so the first route is order 0).
    "routeOrder" => ROUTE_SET.routes.to_a.index(found[:route]),
    "routeVerb" => found[:route].verb,
    "routeSpec" => found[:route].path.spec.to_s,
    "params" => found[:params].each_with_object({}) do |(key, value), out|
      out[key.to_s] = value.is_a?(Symbol) ? value.to_s : value
    end
  }
rescue StandardError => e
  {
    "matched" => false,
    "routeOrder" => nil,
    "routeVerb" => nil,
    "routeSpec" => nil,
    "params" => nil,
    "errorClass" => e.class.to_s,
    "error" => e.message
  }
end

# The case list: the shapes this family grades, one per row, in row-id
# order. A case is [verb, path].
CASES = [
  ["GET", "/"],
  ["GET", "/Front"],
  ["GET", "/Front.json"],
  ["GET", "/Front.rss"],
  ["GET", "/new/Sign_up"],
  ["GET", "/type/Foo"],
  ["POST", "/type/Foo"],
  ["GET", "/files/Front/12.html"],
  ["GET", "/assets/a/b"],
  ["GET", "/jasmine/specs/x_spec"],
  ["GET", "/Front/view/open"],
  ["GET", "/Front/view/open.json"],
  ["GET", "/Front/view/open.rss"],
  ["GET", "/Front/view/related.json"],
  ["GET", "/Front/view/related.rss"],
  ["GET", "/Front/view/related"],
  ["GET", "/card/edit.rss"],
  ["GET", "/card/read.rss"],
  ["GET", "/read.rss"],
  ["GET", "/javascripts/x/y"],
  ["GET", "/card/edit"],
  ["GET", "/card/new"],
  ["GET", "/card/newer"],
  ["GET", "/card/editing"],
  ["GET", "/card/edit/Front"],
  ["GET", "/card/edit/Front.json"],
  ["GET", "/read"],
  ["GET", "/read/Front"],
  ["GET", "/card/read"],
  ["GET", "/card/read/Front"],
  ["GET", "/create/New"],
  ["GET", "/update/X"],
  ["GET", "/delete/Front"],
  ["GET", "/asset"],
  ["GET", "/card/asset"],
  ["POST", "/"],
  ["PUT", "/"],
  ["PATCH", "/"],
  ["DELETE", "/"],
  ["POST", "/card/create"],
  ["POST", "/card/create/Front"],
  ["PATCH", "/card/create/Front"],
  ["PUT", "/card/create/Front"],
  ["POST", "/create/Front"],
  ["PATCH", "/create/Front"],
  ["PUT", "/create/Front"],
  ["GET", "/Front/wat/related"],
  ["GET", "/a/b/c/d"],
  # Round five, the action arm's MARKED spellings (rows A17 and B5). The
  # first round-four pass measured the one-segment-with-mark spellings
  # (/create/New, /delete/Front, /read/Front) and the markless two-segment
  # ones (/card/read, /card/asset); the two-segment markless and
  # three-segment marked spellings of the CREATE, DELETE, UPDATE and ASSET
  # arms had no executed answer on the record. These cases put the whole
  # five-action shape set in the matcher's own words, including the
  # .:format suffix riding the ACTION arm's mark segment
  # ("(card)/#{action}(/:mark(.:format))") and the bare deprecated prefix.
  ["GET", "/card/create"],
  ["GET", "/card/create/Front"],
  ["GET", "/card/delete"],
  ["GET", "/card/delete/Front"],
  ["GET", "/card/update/X"],
  ["GET", "/asset/Front"],
  ["GET", "/card/asset/Front"],
  ["GET", "/card/read/Front.json"],
  ["GET", "/read/Front.json"],
  ["GET", "/card/asset/Front.json"],
  ["GET", "/assets"]
]

RECOGNITIONS = CASES.map do |verb, path|
  { "verb" => verb, "path" => path }.merge(recognize(path, verb))
end

puts JSON.pretty_generate(
  "row" => "reg-routes-route-recognition",
  "gemset" => "decko-0.20.0 + actionpack-7.2.4 (pinned)",
  "filesWebPath" => FILES_WEB_PATH,
  "routeTableSize" => ROUTES.length,
  "routes" => ROUTES,
  "recognitions" => RECOGNITIONS,
  "shadowedStdlibNames" => shadowed_names,
  "sources" => {
    "routeTable" => pinned_lines("decko-0.20.0/config/engine_routes.rb")
  }
)

# oracle-capture-pinned-deck-harness-ruby.rb - the shared loading rig for the
# register-routes rows' Ruby oracle captures.
#
# WHAT THIS IS. Every register-routes row in this tranche (A2, A4, A7, A9,
# A12, A17, A22, B5) grades the port on ONE PINNED DECK thing: the route
# table in decko-0.20.0/config/engine_routes.rb and the controller method
# that route dispatches to. Each capture needs the same four pieces, and this
# file is those four pieces:
#
#   1. the PINNED GEMSET on the load path (no Rails, no database);
#   2. the PINNED DECK's own route table, EXECUTED against a recording Draw,
#      so the capture holds the route list the deck builds - the patterns,
#      the options, the controller action, and the registration ORDER (the
#      order IS the matching precedence);
#   3. the PINNED MOD's own format registry (card-mod-format's format files
#      register themselves), for the rows whose decision is a format name;
#   4. a controller harness that includes the PINNED CardController modules
#      (Rest, Mark, Response) over RECORDING doubles, so the capture records
#      what the pinned method asked for.
#
# THE STUBBING RULE. Every stub here RECORDS. The capture writes down what
# the pinned method asked for; it never writes down what the port wants the
# answer to be. A pinned method that cannot be stood up is recorded as
# raising, not replaced with a plausible value.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-<row-slug>-ruby.rb \
#     > fixtures/captured/<row-slug>-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require "json"
require "ostruct"
require "logger"

# ---------------------------------------------------------------------------
# the pinned gemset
# ---------------------------------------------------------------------------

module PinnedDeck
  module_function

  GEMSET_ENV = "DECKO_RUBY_GEMSET"

  def gems_root
    root = ENV[GEMSET_ENV]
    root ||= File.expand_path(
      "../../../reference-harness/ruby-oracle-gems/ruby/3.4.0/gems",
      __dir__
    )
    raise "no pinned gemset at #{root}; set #{GEMSET_ENV}" unless Dir.exist?(root)

    root
  end

  def pinned_path(relative)
    File.join(gems_root, relative)
  end

  def read_pinned(relative)
    path = pinned_path(relative)
    raise "pinned file not found at #{path}" unless File.exist?(path)

    File.read(path)
  end

  # The pinned gems' lib directories on the load path, each gem's own
  # nested lib/<gem_name> first (the gems' own require paths assume it).
  def load_pinned_libs!
    libs = Dir.glob(File.join(gems_root, "*", "lib")).sort
    raise "no pinned gems found at #{gems_root}" if libs.empty?

    libs.each do |lib|
      gem_dir = File.dirname(lib)
      gem_name = File.basename(gem_dir).sub(/-\d[^-]*\z/, "")
      nested = File.join(lib, gem_name)
      $LOAD_PATH.unshift(nested) if File.directory?(nested)
      $LOAD_PATH.unshift(lib)
    end
    libs.length
  end

  # The PINNED DECK's own route table, line by line, with line numbers.
  def route_table
    read_pinned("decko-0.20.0/config/engine_routes.rb").lines.each_with_index.map do |line, index|
      { "line" => index + 1, "text" => line.chomp }
    end
  end

  # The route-table lines that match a pattern, with their line numbers -
  # the capture quotes these instead of paraphrasing the route.
  def route_lines_matching(pattern)
    route_table.select { |row| pattern.match?(row["text"]) }
  end

  # A pinned file's own lines, with line numbers (for a method the capture
  # cannot stand up: the capture then records the source, and says so).
  def pinned_lines(relative)
    read_pinned(relative).lines.each_with_index.map do |line, index|
      { "line" => index + 1, "text" => line.chomp }
    end
  end

  # Eval a pinned file into the top-level binding, so the capture runs the
  # PINNED gem's own method body.
  def eval_pinned(relative)
    path = pinned_path(relative)
    raise "pinned file not found at #{path}" unless File.exist?(path)

    eval(File.read(path), TOPLEVEL_BINDING, path) # rubocop:disable Security/Eval
  end

  # The PINNED actionpack's own Token module, loaded verbatim out of the
  # pinned file (actionpack-7.2.4/lib/action_controller/metal/
  # http_authentication.rb). The PINNED DECK's rest.rb includes it at module
  # level (decko-0.20.0/lib/card_controller/rest.rb:4), so the pinned
  # controller file cannot be loaded without it.
  def load_pinned_token_module!
    return ActionController::HttpAuthentication::Token if defined?(ActionController::HttpAuthentication::Token)

    require "active_support/core_ext/hash/indifferent_access"
    actionpack_rb = pinned_path("actionpack-7.2.4/lib/action_controller/metal/http_authentication.rb")
    raise "actionpack's http_authentication.rb not found at #{actionpack_rb}" unless File.exist?(actionpack_rb)

    source = File.read(actionpack_rb)
    token_start = source.index("module Token")
    raise "the Token module was not found in #{actionpack_rb}" if token_start.nil?

    token_lines = source[token_start..].lines
    unless token_lines[-3..].map(&:strip) == ["end", "end", "end"]
      raise "the pinned actionpack file does not end with the Token module's three end lines"
    end

    token_source = token_lines[0..-3].join
    ActionController::HttpAuthentication.module_eval(token_source, actionpack_rb) # rubocop:disable Security/Eval
    ActionController::HttpAuthentication::Token
  end

  # The PINNED DECK's own controller, loaded: its four modules and its
  # before_action table.
  #
  # The before_action table is the mechanism the ASSET rows turn on: the
  # pinned controller (decko-0.20.0/lib/card_controller.rb:20-25) runs
  # setup, authenticate and load_card with `except: [:asset]`, so the asset
  # action needs NO deck state at all. The table is captured by EXECUTING
  # the pinned file against a recording ActionController::Base.
  def load_pinned_controller!
    load_pinned_token_module!
    # The PINNED controller class with the PINNED superclass, so the four
    # module files (which reopen CardController) and the controller file
    # (which declares it) agree on the superclass.
    unless Object.const_defined?(:CardController)
      Object.const_set(:CardController, Class.new(ActionController::Base))
    end
    %w[
      decko-0.20.0/lib/card_controller/mark.rb
      decko-0.20.0/lib/card_controller/rest.rb
      decko-0.20.0/lib/card_controller/response.rb
      decko-0.20.0/lib/card_controller/errors.rb
    ].each { |file| eval_pinned(file) }
    eval_pinned("decko-0.20.0/lib/card_controller.rb")
    ActionController::Base.before_actions
  end

  # The pinned deck's own config value the route table reads: the files web
  # path, set by the PINNED carrierwave mod (card-mod-carrierwave-0.20.0/lib/
  # card/mod/carrierwave.rb:2 `config.files_web_path = "files"`). The mod's
  # own file is executed; the value is not written down from memory.
  def files_web_path
    @files_web_path ||= begin
      eval_pinned("card-mod-carrierwave-0.20.0/lib/card/mod/carrierwave.rb")
      Cardio.config.files_web_path
    end
  end

  # The PINNED DECK's own route table, EXECUTED.
  #
  # The pinned routes file is evaluated against a recording Draw object, so
  # the capture holds the route list the pinned deck actually builds: the
  # pattern of every route, the options it carries, the controller action it
  # dispatches to, and the ORDER the deck registers them in. The order is
  # the matching precedence - Rails matches the first registered route that
  # fits - so a port's grammar has to be read against it.
  def route_table_executed
    route_table_executed_with_requirements[0]
  end

  # The same execution, plus the routes' requirement VALUES (a Regexp stays
  # a Regexp here, so the capture can ask the pinned requirement itself
  # whether a segment matches it).
  def route_table_executed_with_requirements
    recorder = RouteRecorder.new
    EngineStub.recorder = recorder
    decko = Module.new
    decko.const_set(:Engine, EngineStub)
    Object.send(:remove_const, :Decko) if Object.const_defined?(:Decko)
    Object.const_set(:Decko, decko)
    eval_pinned("decko-0.20.0/config/engine_routes.rb")
    [recorder.routes, recorder.raw_requirements]
  end

  # The pinned deck's engine, stood in for: the routes file reads
  # Decko::Engine.config.files_web_path and draws on Decko::Engine.routes.
  class EngineStub
    class << self
      attr_accessor :recorder

      def routes
        recorder
      end

      def config
        Cardio.config
      end
    end
  end

  # The recording Draw: every route registration is kept, in order.
  class RouteRecorder
    attr_reader :routes, :raw_requirements

    def initialize
      @routes = []
      @raw_requirements = []
    end

    def draw(&block)
      instance_eval(&block)
      @routes
    end

    def root(*args, **opts)
      record("root", args, opts)
    end

    def get(*args, **opts)
      record("get", args, opts)
    end

    def post(*args, **opts)
      record("post", args, opts)
    end

    def put(*args, **opts)
      record("put", args, opts)
    end

    def patch(*args, **opts)
      record("patch", args, opts)
    end

    def delete(*args, **opts)
      record("delete", args, opts)
    end

    def match(*args, **opts)
      record("match", args, opts)
    end

    private

    # A Rails route registration carries its PATH in a String key and its
    # requirements/options in Symbol keys. Ruby 3 hands the whole hash to a
    # method that takes **opts, so both kinds of key arrive here together;
    # the recorder splits them the way Rails reads them.
    def record(verb, args, opts)
      route_hash = {}
      args.each do |arg|
        route_hash.merge!(arg) if arg.is_a?(Hash)
      end
      route_hash.merge!(opts) if opts.is_a?(Hash)

      patterns = route_hash.keys.select { |key| key.is_a?(String) }
      symbol_keys = route_hash.reject { |key, _| key.is_a?(String) }
      action = route_hash.values.find { |value| value.is_a?(String) }
      action ||= args.find { |arg| arg.is_a?(String) }
      @raw_requirements << symbol_keys

      @routes << {
        "verb" => verb,
        "patterns" => patterns.map(&:to_s),
        "requirements" => stringify(symbol_keys),
        "action" => action,
        "order" => @routes.length
      }
    end

    def stringify(value)
      value.each_with_object({}) do |(key, val), out|
        out[key.to_s] = case val
                        when Regexp then val.source
                        when Symbol then val.to_s
                        when Array then val.map(&:to_s)
                        when TrueClass, FalseClass then val.to_s
                        else val.to_s
                        end
      end
    end
  end
end

# ---------------------------------------------------------------------------
# the pinned card namespace, stood in for
# ---------------------------------------------------------------------------
#
# The real Card (card-1.110.0) is a class with a large surface. What the
# pinned CONTROLLER methods in this tranche's rows touch is a handful of
# collaborators, and each one below answers with a RECORDED value the
# capture can print. The card double (PinnedDeck::CardDouble) records what
# the controller asked the card to do.

class Card
  # Card::Auth.needs_setup? - decko-0.20.0/lib/card_controller/mark.rb:56-57
  module Auth
    class << self
      attr_accessor :needs_setup_answer

      def needs_setup?
        needs_setup_answer.nil? ? false : needs_setup_answer
      end
    end
  end

  # Card::Env - the request-scoped environment the controller reads.
  module Env
    class << self
      attr_accessor :html_answer, :ajax_answer, :main_name

      def html?
        html_answer.nil? ? true : html_answer
      end

      def ajax?
        ajax_answer.nil? ? false : ajax_answer
      end

      # Card::Env.hash - the deck's own hash coercion
      # (card-1.110.0/lib/card/env.rb), used by the PINNED deck's
      # uri_fetch_opts (card-1.110.0/lib/card/fetch/card_class.rb:129).
      def hash(value)
        return {} if value.nil?

        value.each_with_object({}) { |(key, val), out| out[key.to_sym] = val }
      end

      # Card::Env.slot_opts - the deck's own slot options, read by the
      # PINNED controller's render_page (decko-0.20.0/lib/card_controller/
      # rest.rb:99-104).
      def slot_opts
        {}
      end
    end
  end

  # Card::Rule.global_setting - card-1.110.0/lib/card/rule.rb:5-9
  module Rule
    class << self
      attr_accessor :global_settings

      def global_setting(name)
        (global_settings || {})[name]
      end
    end
  end

  # Card::Cache / Card::Assets - the setup before_action's collaborators.
  module Cache
    class << self
      attr_accessor :renewals

      def renew
        self.renewals = (renewals || 0) + 1
      end

      def tallies
        ""
      end
    end
  end

  module Assets
    class << self
      attr_accessor :refreshes

      def refresh
        self.refreshes = (refreshes || 0) + 1
      end
    end
  end

  # Card::Set::Format::AbstractFormat::ViewOpts.unknown_ok - the views that
  # need no card name (card-1.110.0/lib/card/set/format/abstract_format.rb).
  module Set
    module Format
      class AbstractFormat
        module ViewOpts
          class << self
            attr_accessor :unknown_ok_views

            def unknown_ok
              unknown_ok_views || {}
            end
          end
        end
      end
    end
  end

  # Card::Name - the deck's own name class (card-1.110.0/lib/card/name/).
  # The capture's stand-in records the mark it was handed and answers the
  # one method the PINNED deck's uri_fetch_opts calls on it (tr).
  class Name
    def self.[](mark)
      return nil if mark.nil?

      new(mark.to_s)
    end

    attr_reader :value

    def initialize(value)
      @value = value
    end

    def tr(from, to)
      @value.tr(from, to)
    end

    def to_s
      @value
    end
  end

  # Card::Error - the deck's own error classes (card-1.110.0/lib/card/error.rb).
  class Error < StandardError
    class UserError < Error
      def self.user_error_classes
        []
      end
    end
  end

  # Card::Env::Location - included by the pinned controller
  # (decko-0.20.0/lib/card_controller.rb:15).
  module Env
    module Location
    end
  end
end

# Rails' own surface the pinned controller touches, stood in for.
module Rails
  class << self
    def logger
      @logger ||= Logger.new(IO::NULL)
    end
  end
end

# ActionController::Base, stood in for: the PINNED DECK's own controller
# class inherits from it (decko-0.20.0/lib/card_controller.rb:4) and
# registers its before_action table on it. The stand-in RECORDS the table
# instead of running it, because the rows in this tranche ask WHICH
# before_actions run for a request, not what they do.
module ActionController
  # The PINNED actionpack's Token module is loaded into this namespace
  # (actionpack-7.2.4/lib/action_controller/metal/http_authentication.rb).
  module HttpAuthentication
  end

  class Base
    # One shared list, so the table is recorded wherever the registration
    # happens (the pinned controller class inherits from this one).
    RECORDED_BEFORE_ACTIONS = []

    class << self
      def before_actions
        RECORDED_BEFORE_ACTIONS
      end

      def before_action(name, **opts)
        before_actions << {
          "name" => name.to_s,
          "only" => Array(opts[:only]).map(&:to_s),
          "except" => Array(opts[:except]).map(&:to_s)
        }
      end

      def layout(*_args); end

      def rescue_from(*_klasses, &_block); end
    end
  end
end

# Cardio.config - the deck's own config object (card-1.110.0/lib/cardio.rb).
# Cardio::Railtie.config is the SAME object, because the pinned carrierwave
# mod writes into it (card-mod-carrierwave-0.20.0/lib/card/mod/carrierwave.rb:1).
class Cardio
  # Cardio::Railtie.config is the deck's config object, the same one the
  # PINNED carrierwave mod writes into (card-mod-carrierwave-0.20.0/lib/card/
  # mod/carrierwave.rb:1-5) and the same one the deck's own methods read
  # (decko-0.20.0/lib/card_controller/response.rb:11 `Cardio.config.
  # cache_log_level`).
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

# ---------------------------------------------------------------------------
# the format registry, from the PINNED MOD's own format files
# ---------------------------------------------------------------------------
#
# The real Card::Format (card-1.110.0/lib/card/format.rb) pulls in the whole
# render stack. What the format files themselves USE of it is the
# registration itself (`register :css` in the class body) and `mime_type` as
# an instance method. The stub below is exactly that surface, and the mod's
# own files are loaded verbatim on top of it.
#
# The base `mime_type` RAISES rather than answering a string: a format class
# that does not define its own mime type must be recorded as unanswered, not
# handed a plausible default. The PINNED MOD's own Card::Format::FileFormat
# (card-mod-format-0.20.0/lib/card/format/file_format.rb:5) is loaded from
# the mod's own file with the rest of them.

module Mime
  class Type
    def self.register(mime, symbol)
      (@registry ||= {})[symbol] = mime
    end

    def self.[](symbol)
      (@registry ||= {})[symbol]
    end
  end
end

class Card
  class Format
    REGISTRY = []
    REGISTRY_CLASSES = {}

    class << self
      def registered
        REGISTRY
      end

      def registered=(value)
        REGISTRY.replace(value)
      end

      def aliases
        @aliases ||= {}
      end

      # The gem's own registration (card-1.110.0/lib/card/format/
      # registration.rb:6-9): the registry holds the format's NAME as a
      # string, and the class keeps the symbol.
      def register(name)
        registered << name.to_s
        REGISTRY_CLASSES[name.to_s] = self
        name
      end
    end

    # The PINNED base class's own answer (card-1.110.0/lib/card/format.rb:
    # 86-88 `def mime_type; "text/plain"; end`). The PINNED MOD's format
    # files each define their own; the ones that do not (the PINNED
    # FileFormat, card-mod-format-0.20.0/lib/card/format/file_format.rb:5)
    # inherit this one, exactly as they do in the gem.
    def mime_type
      "text/plain"
    end
  end
end

# The PINNED MOD's own format files, loaded verbatim: each registers itself.
def load_pinned_format_registry!
  format_dir = File.join(PinnedDeck.gems_root, "card-mod-format-0.20.0/lib/card/format")
  raise "the format mod's format directory not found at #{format_dir}" unless File.directory?(format_dir)

  files = Dir.glob(File.join(format_dir, "*.rb")).sort
  files.each do |file|
    eval(File.read(file), TOPLEVEL_BINDING, file) # rubocop:disable Security/Eval
  end

  registry = Card::Format.registered.map(&:to_s).sort
  mime_types = {}
  registry.each do |name|
    klass = Card::Format::REGISTRY_CLASSES[name]
    next if klass.nil?

    mime_types[name] = begin
      klass.allocate.mime_type
    rescue StandardError => e
      "RAISED: #{e.class}: #{e.message}"
    end
  end
  { "registered" => registry, "mimeTypes" => mime_types, "files" => files }
end

# ---------------------------------------------------------------------------
# the recording doubles
# ---------------------------------------------------------------------------

module PinnedDeck
  # The card double: every call the controller makes on the card is
  # RECORDED, so the capture can print what the pinned method asked for.
  class CardDouble
    attr_accessor :name, :known, :new_card, :action, :format_name,
                  :view_setting, :root_error_status
    attr_reader :calls, :page_calls

    def initialize(name: "TestCard", known: true, new_card: false)
      @name = name
      @known = known
      @new_card = new_card
      @calls = []
      @page_calls = []
      @view_setting = {}
      @root_error_status = nil
    end

    def record(call)
      @calls << call
    end

    def known?
      record(:known?)
      @known
    end

    def new_card?
      record(:new_card?)
      @new_card
    end

    def action=(value)
      record(:"action=")
      @action = value
    end

    def act
      record(:act)
      yield
    end

    def format(name)
      record(:format)
      @format_name = name
      FormatDouble.new(self, name)
    end

    def save!
      record(:save!)
      :saved
    end

    def update!(attrs)
      record(:"update!")
      { attrs: attrs }
    end

    def delete!
      record(:delete!)
      :deleted
    end

    def drafts
      []
    end

    def select_action_by_params(_params)
      record(:select_action_by_params)
    end

    def refresh
      record(:refresh)
      self
    end

    def content
      ""
    end

    def db_content
      ""
    end

    def errors
      []
    end

    def ok?(_task)
      record(:ok?)
      true
    end

    def anyone_can?(_task)
      record(:anyone_can?)
      true
    end

    def to_url
      "/#{name}"
    end
  end

  # The format double: the pinned deck asks the card for a format, and the
  # format answers a mime type, carries an error status, and renders a page.
  class FormatDouble
    attr_accessor :error_status
    attr_reader :name, :card

    def initialize(card, name)
      @card = card
      @name = name
      @error_status = nil
    end

    def mime_type
      "text/html"
    end

    def page(controller, view, _slot_opts)
      @card.page_calls << { "view" => view.inspect, "format" => name.to_s }
      "PAGE(#{name},#{view.inspect})"
    end

    def view_setting(name, view = nil)
      @card.view_setting["#{name}:#{view}"] || @card.view_setting[name.to_s]
    end

    # card-1.110.0/lib/card/format/error.rb:18-25 - the pinned view
    # replacement for an unknown card.
    def view_for_unknown(setting_view)
      if @card.known?
        setting_view || :unknown
      else
        @card.root_error_status = 404
        :not_found
      end
    end
  end

  # The controller harness: it includes the PINNED CardController modules
  # and records the responses the pinned methods produce.
  class ControllerHarness
    attr_accessor :params, :request, :card, :rendered, :redirected, :sent_file
    attr_reader :format_set

    # The PINNED controller modules are mixed in AFTER the capture has
    # evaluated the pinned files that define them, so the harness runs the
    # pinned method bodies and not a copy of them.
    def self.include_pinned_modules!
      %i[Response Rest Mark].each do |name|
        next unless CardController.const_defined?(name)

        mod = CardController.const_get(name)
        include mod unless include?(mod)
      end
    end

    def initialize(params: {}, request: nil, card: nil)
      @params = params
      @request = request
      @card = card || CardDouble.new
      @rendered = nil
      @redirected = nil
      @sent_file = nil
      @format_set = nil
    end

    # Rails' own render, recorded.
    def render(options)
      @rendered = options
      nil
    end

    def redirect_to(url, status: 302)
      @redirected = { "url" => url, "status" => status }
      nil
    end

    def send_file(*args)
      @sent_file = args
      nil
    end

    # The deck's own card_url helper (decko-0.20.0/lib/card_controller/
    # helpers.rb) makes a URL absolute; the capture records it and returns
    # it unchanged, because WHICH branch respond takes is the question.
    def card_url(url)
      @card_url = url
      url
    end
  end
end

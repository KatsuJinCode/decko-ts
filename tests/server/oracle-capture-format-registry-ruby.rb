# oracle-capture-format-registry-ruby.rb - runs the PINNED MOD's own format
# registrations and the PINNED DECK's own format dispatch, and records what
# they answer.
#
# Why this script exists: the completeness register's D4 and D5 rows
# (register-routes) both grade the port on the same mechanism:
#
#   D4: "Ruby's general file mapping (ANY unregistered format suffix on a
#        card URL sends the file, decko-0.20.0/lib/card_controller/
#        response.rb:102-113) is absent; the port only serves bytes under
#        /files/ (src/server/file-routes.ts), so /Card.bin 404s everywhere."
#   D5: "no format-negotiation arm for css, scss, js, text/txt, csv, xml,
#        yaml/yml, jsonld: staging strips any suffix and serves HTML, the
#        edge special-cases only .json and .rss, while Ruby renders
#        /:style.css as text/css (card-mod-format-0.20.0/lib/card/format/
#        css_format.rb:7-9)."
#
# The mechanism is ONE method (decko-0.20.0/lib/card_controller/
# response.rb:99-113):
#
#   def format_name_from_params
#     rf = requested_format
#     explicit_file_format?(rf) ? :file : rf.to_sym
#   end
#
#   def explicit_file_format? rf
#     params[:explicit_file] || !Card::Format.registered.member?(rf)
#   end
#
# so the REGISTRY decides: a registered format renders as that format, and
# an UNREGISTERED one is the FILE sender. This script runs the mod's own
# format files (they register themselves) and then the deck's own dispatch
# over both kinds of suffix.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-format-registry-ruby.rb \
#     > fixtures/captured/format-registry-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The registry and the case list are fixed, so a re-run on the same
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

# The load path: the pinned activesupport, for the blank extension the
# deck's own dispatch uses (`params[:format].present?`).
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
# the registry's base class, stood in for
# ---------------------------------------------------------------------------
#
# The real Card::Format (card-1.110.0/lib/card/format.rb) pulls in the
# whole render stack (ActiveSupport::Autoload, the Env mixins, the set
# registry). What the format files themselves USE of it is the registration
# itself: `register :css` in the class body, and `mime_type` as an instance
# method. The stub below is exactly that surface, and the mod's own files
# are loaded verbatim on top of it.

# Rails' mime registry, as the mod's own files use it: the jsonld format
# registers its type at load time (jsonld_format.rb:6).
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
    # The registry lives in a constant, because the registration call
    # happens in each SUBCLASS's class body and a class-level instance
    # variable would be per-subclass.
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

    def mime_type
      "text/plain"
    end
  end
end

# The mod's own format files, loaded verbatim.
format_dir = File.join(gems_root, "card-mod-format-0.20.0/lib/card/format")
raise "the format mod's format directory not found at #{format_dir}" unless File.directory?(format_dir)

format_files = Dir.glob(File.join(format_dir, "*.rb")).sort
format_files.each do |file|
  eval(File.read(file), TOPLEVEL_BINDING, file) # rubocop:disable Security/Eval
end

# The registry, and each registered format's own mime type: the mod's own
# instance method, called on an instance of the class that registered the
# name (the registration call happens in that class's body, so the stub
# records the class alongside the name).
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

# ---------------------------------------------------------------------------
# the deck's own dispatch
# ---------------------------------------------------------------------------

response_rb = File.join(gems_root, "decko-0.20.0/lib/card_controller/response.rb")
raise "decko's card_controller/response.rb not found at #{response_rb}" unless File.exist?(response_rb)

eval(File.read(response_rb), TOPLEVEL_BINDING, response_rb) # rubocop:disable Security/Eval

# The request double: `request.format` is the format the URL suffix (or the
# Accept header) asked for.
FakeRequest = Struct.new(:format)

class DispatchHarness
  include CardController::Response

  attr_accessor :params, :request

  def initialize(params, request)
    @params = params
    @request = request
  end
end

def dispatch_case(label, requested, params: {})
  harness = DispatchHarness.new(params, FakeRequest.new(requested))
  begin
    {
      "label" => label,
      "requested" => requested,
      "params" => params,
      "formatName" => harness.send(:format_name_from_params).to_s
    }
  rescue StandardError => e
    {
      "label" => label,
      "requested" => requested,
      "params" => params,
      "formatName" => nil,
      "errorClass" => e.class.name,
      "errorMessage" => e.message
    }
  end
end

dispatch_rows = [
  dispatch_case("css", "css"),
  dispatch_case("scss", "scss"),
  dispatch_case("js", "js"),
  dispatch_case("csv", "csv"),
  dispatch_case("xml", "xml"),
  dispatch_case("yaml", "yaml"),
  dispatch_case("jsonld", "jsonld"),
  dispatch_case("txt", "txt"),
  dispatch_case("json", "json"),
  dispatch_case("rss", "rss"),
  dispatch_case("html", "html"),
  dispatch_case("bin (unregistered)", "bin"),
  dispatch_case("zzz (unregistered)", "zzz"),
  dispatch_case("bin with the explicit_file param", "bin", params: { explicit_file: "1" })
]

puts JSON.pretty_generate(
  "gemset" => "card-mod-format-0.20.0 + decko-0.20.0 (pinned)",
  "formatFiles" => format_files.map { |file| file.sub("#{gems_root}/", "") },
  "registered" => registry,
  "mimeTypes" => mime_types,
  "dispatch" => dispatch_rows
)

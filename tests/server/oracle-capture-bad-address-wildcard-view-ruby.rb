# oracle-capture-bad-address-wildcard-view-ruby.rb - the PINNED MOD's own
# bad_address view body (set/all/error.rb:23-26) executed verbatim, the
# PINNED DECK's own route table's wildcard registration, the show ladder it
# rides, and the PINNED locale token the view renders.
#
# WHY THIS SCRIPT EXISTS: the register's C15 row grades the port on the
# `BadAddress` wildcard view. Three different mechanisms in the pinned deck
# answer 404, and this row's view is the THIRD and the only one that writes
# its status from INSIDE the render:
#
#   1. THE RESCUE CLASS. Card::Error::BadAddress (card-1.110.0/lib/card/
#      error.rb:82-85) is a UserError subclass with (404, :bad_address), so
#      an RAISED BadAddress renders that view at 404 through the rescue.
#   2. THE FORMAT'S UNKNOWN-CARD ARM. view_for_unknown (card-1.110.0/lib/
#      card/format/error.rb:18-25) answers :not_found and writes
#      root.error_status = 404 - row C10's measurement.
#   3. THE VIEW'S OWN BODY, and this row's subject:
#
#        view :bad_address, perms: :none do
#          root.error_status = 404
#          t(:format_bad_address)
#        end
#
#      (card-mod-format-0.20.0/set/all/error.rb:23-26)
#
# The wildcard route `get "*mark" => "card#read", view: "bad_address"`
# (decko-0.20.0/config/engine_routes.rb:54) hands card#read a DEFAULT view,
# which reaches the render as params[:view]; `show` therefore renders
# :bad_address at its OWN DEFAULT STATUS OF 200 - and the 404 arrives
# afterwards, written onto the root format by the view's own body. So the
# status argument to show is 200 and the response is 404, and the two are
# written by different code in different places. Executing the ladder and
# then the view body shows exactly that.
#
# The view BODY is executed as the pinned block: the file is evaluated with
# a recording `view` class method that keeps each declaration's name, options
# and block, and the block is then instance_exec'd on a probe carrying `root`
# and `t`. The DSL is stood in; the body is the pinned gem's own bytes.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-bad-address-wildcard-view-ruby.rb \
#     > fixtures/captured/bad-address-wildcard-view-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require "yaml"

require_relative "pinned-card-error-classes-ruby"

# The PINNED MOD's own format registry, loaded: the show ladder reaches
# respond, whose file arm is an `is_a?(Card::Format::FileFormat)` test
# (decko-0.20.0/lib/card_controller/response.rb:14).
load_pinned_format_registry!
raise "the pinned FileFormat was not loaded by the registry" unless defined?(Card::Format::FileFormat)

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!
unless PinnedDeck::ControllerHarness.include?(CardController::Errors)
  PinnedDeck::ControllerHarness.include(CardController::Errors)
end

# ---------------------------------------------------------------------------
# the PINNED locale file, so the view's `t` is the pinned token
# ---------------------------------------------------------------------------
#
# card-mod-format-0.20.0/config/locales/en.yml is IN the pinned gemset, so
# the text the bad_address view renders is pinned data, not a stand-in. It
# is read with the stdlib YAML parser and the read is recorded, because a
# locale that changed between gemset builds would otherwise look like a view
# that changed.
LOCALE_PATH = "card-mod-format-0.20.0/config/locales/en.yml"
# The locale file is namespaced under its locale name (`en:`), so the tokens
# live one level down; the namespace is recorded so a reader can see which
# locale the text came from.
locale_namespace = "en"
locale =
  YAML.safe_load(PinnedDeck.read_pinned(LOCALE_PATH), permitted_classes: [], aliases: false) || {}
  locale = locale[locale_namespace] || {}
  locale

class FormatI18nProbe
  attr_reader :calls
  attr_accessor :locale

  def initialize(locale)
    @locale = locale
    @calls = []
  end

  # The pinned view's `t(:format_bad_address)` - one positional key, no
  # interpolation arguments on this view. A missing key is recorded as such
  # rather than answered with a plausible string.
  def t(key, **kwargs)
    @calls << { "key" => key.to_s, "kwargs" => kwargs.transform_values(&:to_s) }
    value = @locale[key.to_s]
    return "RAISED: no locale token #{key}" if value.nil?

    kwargs.empty? ? value.to_s : value.to_s % kwargs
  end
end

# The root format the pinned view writes its status onto.
class BadAddressRootProbe
  attr_accessor :error_status
  attr_reader :error_status_writes

  def initialize
    @error_status = nil
    @error_status_writes = []
  end

  def error_status=(value)
    @error_status_writes << value
    @error_status = value
  end
end

# The recording `view` declaration. The pinned file calls `view :name, opts
# do ... end` at the top level of a `format do ... end` block; the capture
# evaluates the file's own text with `format` and `view` answering, which
# KEEPS each declaration's block without running it, and then runs the
# blocks it kept.
class ViewDeclarationProbe
  attr_reader :declarations, :formats

  def initialize
    @declarations = []
    @formats = []
    @current_format = nil
  end

  # The pinned file opens THREE format blocks - the base (error.rb:1), :json
  # (:57) and :jsonld (:74) - so `format` takes an optional name and the
  # capture records which format each declaration belongs to. The base block
  # has no name.
  def format(name = nil, &block)
    @formats << (name.nil? ? "base" : name.to_s)
    @current_format = name.nil? ? "base" : name.to_s
    instance_eval(&block) if block
    nil
  end

  # A declaration may carry ALIASES as further positional names - the json
  # block's `view :server_error, :errors, perms: :none` (error.rb:64) is an
  # alias of :server_error onto the json :errors view - so the aliases are
  # recorded separately from the options.
  def view(name, *aliases, **opts, &block)
    @declarations << {
      "format" => @current_format,
      "name" => name.to_s,
      "aliases" => aliases.map(&:to_s),
      "opts" => opts.transform_keys(&:to_s),
      "block" => block
    }
    nil
  end
end

# The object the pinned view BODY runs against. `root` and `t` are the whole
# of what set/all/error.rb:23-26 touches.
class BadAddressViewProbe
  attr_reader :root, :i18n

  def initialize(i18n)
    @i18n = i18n
    @root = BadAddressRootProbe.new
  end

  def t(key, **kwargs)
    @i18n.t(key, **kwargs)
  end
end

# Load the pinned view file's OWN TEXT and evaluate it, keeping the blocks.
view_probe = ViewDeclarationProbe.new
view_file = PinnedDeck.pinned_path("card-mod-format-0.20.0/set/all/error.rb")
view_body = File.read(view_file)
view_probe.instance_eval(view_body, view_file) # rubocop:disable Security/Eval

# 1 - THE ROUTE, from the PINNED DECK's own route table, EXECUTED. The
# wildcard is the LAST registration (engine_routes.rb:54) and it carries a
# `view:` option, which Rails turns into a default param.
routes, raw_requirements = PinnedDeck.route_table_executed_with_requirements
# A single-parameter block: a two-parameter block over an array of Hashes
# destructures each HASH into a [key, value] pair, which is not the route.
# The wildcard route is the one whose PATTERN is exactly "*mark" - the
# deprecated asset routes also carry globs ("assets/*mark",
# "javascripts/*mark", "jasmine/*mark") and the first glob is not this row.
wildcard_index = routes.index { |route| route["patterns"].include?("*mark") }
raise "the pinned table registered no *mark route" if wildcard_index.nil?

wildcard = routes[wildcard_index]
wildcard_row = {
  "order" => wildcard["order"],
  "verb" => wildcard["verb"],
  "patterns" => wildcard["patterns"],
  "action" => wildcard["action"],
  "requirements" => wildcard["requirements"],
  "rawRequirements" => raw_requirements[wildcard_index].transform_keys(&:to_s),
  "totalRoutes" => routes.length
}

# 2 - THE SHOW LADDER, executed with the route's default view in the params.
# `view_from_params` (decko-0.20.0/lib/card_controller/rest.rb:106-109) is
# what reads it, and show's status argument is left at its DEFAULT.
def show_with_params(label, params)
  card = ErrorRowCardInstance.new(name: "Front")
  harness = PinnedDeck::ControllerHarness.new(
    params: params, card: card, request: ErrorRowRequestDouble.new
  )
  harness.instance_variable_set(:@card, card)
  from_params = harness.send(:view_from_params)
  harness.send(:show)
  {
    "label" => label,
    "params" => params,
    "viewFromParams" => from_params,
    # show was called with NO status argument, so this is its own default.
    "rendered" => harness.rendered,
    "pageCalls" => card.page_calls
  }
end

show_rows = [
  # The route's `view: "bad_address"` default, arriving as params[:view].
  # The keys are SYMBOLS because view_from_params asks `params[:view]` and
  # `params[:v]` (rest.rb:107) - a string-keyed bag answers nil to both.
  show_with_params("the wildcard route's default view reaches the render as params[:view]",
                   { view: "bad_address" }),
  # The :v spelling view_from_params also accepts.
  show_with_params("the v spelling the ladder also accepts",
                   { v: "bad_address" }),
  # A request that carries no view at all: the wildcard's default is what
  # supplies it in Ruby, so this row is the control.
  show_with_params("no view in the params at all: the page is asked for with no view",
                   {}),
  # A view param that is present but BLANK: `present?` is the test, so a
  # blank value is not a view and the ladder keeps nil.
  show_with_params("a blank view param is not a view",
                   { view: "" })
]

# 3 - THE VIEW BODY, EXECUTED AS THE PINNED BLOCK. This is the row's subject:
# the 404 is written from inside the render, after show has already rendered
# at its own default.
#
# THERE ARE THREE :bad_address DECLARATIONS - one per format block - and only
# the base one writes root.error_status. The capture executes the base body
# (the one the wildcard route's html page reaches) and records the other two
# as declarations, because "the bad_address view writes 404" is true of the
# base and not of the json one.
bad_address_declarations = view_probe.declarations.select { |decl| decl["name"] == "bad_address" }
base_bad_address = bad_address_declarations.find { |decl| decl["format"] == "base" }
raise "the pinned error file did not declare a base view :bad_address" if base_bad_address.nil?

declaration_rows = view_probe.declarations.map do |decl|
  {
    "format" => decl["format"],
    "name" => decl["name"],
    "aliases" => decl["aliases"],
    "opts" => decl["opts"],
    "hasBlock" => !decl["block"].nil?
  }
end

i18n_probe = FormatI18nProbe.new(locale)
body_probe = BadAddressViewProbe.new(i18n_probe)
body_return = body_probe.instance_exec(&base_bad_address["block"])
view_body_row = {
  "declaredName" => base_bad_address["name"],
  "declaredFormat" => base_bad_address["format"],
  "declaredOpts" => base_bad_address["opts"],
  # What the pinned body returned, and what it asked for.
  "returned" => body_return,
  "rootErrorStatusWrites" => body_probe.root.error_status_writes,
  "rootErrorStatus" => body_probe.root.error_status,
  "localeCalls" => i18n_probe.calls,
  "localeTokenPresent" => !locale["format_bad_address"].nil?
}

# 4 - THE OTHER :bad_address PRODUCER, the exception class, executed through
# the pinned rescue. Same view name, 404, and no view body involved.
class_rows = {
  "badAddressStatusCode" => Card::Error::BadAddress.status_code,
  "badAddressView" => Card::Error::BadAddress.view.to_s,
  "badAddressSuperclass" => Card::Error::BadAddress.superclass.to_s,
  # Both UserError-class 404s carry DIFFERENT view names, so "404" alone
  # never identifies the view.
  "notFoundStatusCode" => Card::Error::NotFound.status_code,
  "notFoundView" => Card::Error::NotFound.view.to_s
}

rescue_card = ErrorRowCardInstance.new(name: "Front")
rescue_harness = PinnedDeck::ControllerHarness.new(
  params: {}, card: rescue_card, request: ErrorRowRequestDouble.new
)
rescue_harness.instance_variable_set(:@card, rescue_card)
Card::Error.current = nil
rescue_harness.send(:handle_exception, rescued_exception(Card::Error::BadAddress, "no such address"))
rescue_row = {
  "view" => Card::Error.current.class.view.to_s,
  "statusCode" => Card::Error.current.class.status_code,
  "rendered" => rescue_harness.rendered,
  "pageCalls" => rescue_card.page_calls
}

# The pinned sources, quoted with line numbers.
view_source = PinnedDeck.pinned_lines("card-mod-format-0.20.0/set/all/error.rb")
                     # The base body (:23-26) AND the json body (:68-71), which
                     # is a DIFFERENT method: it adds an :address error and
                     # renders the errors view, and writes no status at all.
                     .select { |row| row["line"].between?(23, 26) || row["line"].between?(68, 71) }
route_source = PinnedDeck.route_lines_matching(/\*mark/)
view_from_params_source = PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/rest.rb")
                                  .select { |row| row["line"].between?(99, 109) }
class_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/error.rb")
                       .select { |row| row["line"].between?(81, 86) }
locale_source = PinnedDeck.pinned_lines(LOCALE_PATH)
                     .select { |row| row["text"].to_s.strip.start_with?("format_bad_address") }

puts JSON.pretty_generate(
  "row" => "reg-routes-C15",
  "gemset" => "decko-0.20.0 + card-1.110.0 + card-mod-format-0.20.0 (pinned)",
  "wildcardRoute" => wildcard_row,
  "showLadder" => show_rows,
  "viewBody" => view_body_row,
  "viewDeclarations" => declaration_rows,
  "exceptionClass" => class_rows.merge("rescue" => rescue_row),
  "rigArtifacts" => [
    "the view DSL is stood in and the view BODY is not: card-mod-format-0.20.0/set/all/error.rb is evaluated with a recording `view` class method that keeps each declaration's name, options and block, and the :bad_address block is then instance_exec'd on a probe. The block is the pinned gem's own bytes, so `root.error_status = 404` and `t(:format_bad_address)` are the pinned statements. Only the registration machinery around them is a stand-in.",
    "the locale text is PINNED, not a stand-in: card-mod-format-0.20.0/config/locales/en.yml is in the gemset, and the probe reads it with the stdlib YAML parser, so the rendered string is the pinned token. A key missing from the file is recorded as \"RAISED: no locale token ...\" rather than answered with a plausible sentence.",
    "the wildcard route's `view:` option is recorded AS REGISTERED. Rails turning a route option into a default param is a framework behavior this capture does not stand in for - what it measures is that the pinned table registers the option at all, and the ladder rows then hand the SAME view name in the params so the show half can be executed."
  ],
  "sources" => {
    "badAddressView" => view_source,
    "wildcardRouteLine" => route_source,
    "showAndViewFromParams" => view_from_params_source,
    "badAddressClass" => class_source,
    "localeToken" => locale_source
  }
)
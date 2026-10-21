# oracle-capture-new-type-route-ruby.rb - the PINNED DECK's own new/:type
# route, and the pinned machinery that decides what it renders.
#
# WHY THIS SCRIPT EXISTS: the completeness register's A6 row grades the port
# on engine_routes.rb line 22, `get "new/:type" => "card#read", view: "new"`
# - the card-creation route a deck's own chrome links as /new/Sign_up. The
# route's "view: new" is a String-valued non-segment key, so Rails treats it
# as a route DEFAULT: params[:view] is "new" for every request the arm
# admits, and two pinned methods read that value. This capture executes the
# registration, the pinned view registration that makes :new a
# name-not-required view, and the pinned mark/fetch chain, so the row's
# verdict rests on the pinned arm, not on a reading.
#
# THE MECHANISM, from the PINNED DECK's own files:
#
#   the route   decko-0.20.0/config/engine_routes.rb:22
#                 get "new/:type" => "card#read", view: "new"
#               The arm sits at order 7, BEFORE the generic :mark/:view arm
#               (order 27), so /new/<anything> never renders the card "new"
#               in view <anything>.
#
#   the view    card-mod-edit-0.20.0/set/all/new.rb:4
#                 view :new, perms: :create, unknown: true, cache: :never do
#               The registration rides the pinned ViewOpts
#               (card-1.110.0/lib/card/set/format/abstract_format/
#               view_opts.rb:49-57): interpret_view_settings sets
#               unknown_ok[:new] = true from the view definition's own
#               `unknown: true`. mark.rb:46-50's
#               view_does_not_require_name? reads that table.
#
#   the mark    decko-0.20.0/lib/card_controller/mark.rb:28-40
#                 implicit_mark: mark_from_card_hash nil, then
#                 view_does_not_require_name? TRUE (params[:view] = "new")
#                 -> the mark is "" - the fetched card is a NEW card.
#
#   the fetch   card-1.110.0/lib/card/fetch/card_class.rb:106-121, 128-133
#                 uri_fetch_opts: opts[:type] ||= params[:type] (the
#                 segment), opts[:name] ||= Name[params[:mark]]&.tr = ""
#                 standard_uri_fetch: mark = params[:mark] || card_opts[:name]
#                   -> "" ; fetch "", new: {type: <segment>} -> the
#                 new-card fallback of the requested type.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-new-type-route-ruby.rb \
#     > fixtures/captured/new-type-route-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The route table and the case list are fixed, so a re-run on the
# same gemset is byte-stable.

require_relative "oracle-capture-pinned-deck-harness-ruby"

PinnedDeck.load_pinned_libs!
require "active_support/core_ext/object/blank"
require "active_support/core_ext/object/inclusion"

# The PINNED DECK's own route table, EXECUTED.
routes = PinnedDeck.route_table_executed
new_index = routes.index { |route| route["patterns"].include?("new/:type") }
raise "the new/:type route was not found in the pinned route table" if new_index.nil?

new_route = routes[new_index]
generic_view_arm = routes.find { |route| route["patterns"].include?(":mark/:view(.:format)") }

# The PINNED ViewOpts registration, executed: the pinned view_opts module is
# loaded over the rig's namespace, and the pinned `view :new` definition's
# own options (card-mod-edit-0.20.0/set/all/new.rb:4) run through the
# pinned interpret_view_settings. The rig stands in AbstractFormat as a
# CLASS; the pinned file reopens it as a module, so the stand-in is removed
# here and the pinned module tree takes its place (mark.rb's
# view_does_not_require_name? resolves the constant at call time). The one
# helper the pinned registration needs from the card gem is
# view_setting_method_name (card-1.110.0/lib/card/set/format.rb:178-180),
# extracted from the pinned file the way the rig's token module is.
require "active_support/core_ext/module/attribute_accessors"
Card::Set::Format.send(:remove_const, :AbstractFormat)
PinnedDeck.eval_pinned("card-1.110.0/lib/card/set/format/abstract_format/view_opts.rb")

unless Card::Set::Format.respond_to?(:view_setting_method_name)
  format_rb = PinnedDeck.pinned_path("card-1.110.0/lib/card/set/format.rb")
  source = File.read(format_rb)
  method_start = source.index("def view_setting_method_name")
  raise "view_setting_method_name not found in #{format_rb}" if method_start.nil?

  method_source = source[method_start..].lines
                                        .take_while { |line| line.strip != "end" }.join + "end\n"
  # The pinned method sits inside `class << self` in the pinned file, so it
  # lands on the module's singleton class here.
  Card::Set::Format.singleton_class.module_eval(method_source, format_rb)
end

# The pinned `view :new` definition's own options
# (card-mod-edit-0.20.0/set/all/new.rb:4).
new_definition_opts = { perms: :create, unknown: true, cache: :never }
# normalize_view_opts walks the view definition's ARGUMENT LIST (the array
# after the view name): the alias symbol if present, then the opts hash.
# The registration runs at a set module's CLASS level in the pinned deck
# (the `view` DSL's self), so the harness is a module EXTENDED with the
# pinned module - include alone would put the methods on instances, and
# define_view_setting_method's define_method needs a module self.
new_view_set_module = Module.new
new_view_set_module.extend(Card::Set::Format::AbstractFormat::ViewOpts)
new_view_set_module.send(:process_view_opts, :new, [new_definition_opts])
new_unknown_ok = Card::Set::Format::AbstractFormat::ViewOpts.unknown_ok[:new]

# The PINNED DECK's own controller, loaded.
PinnedDeck.load_pinned_controller!
PinnedDeck::ControllerHarness.include_pinned_modules!

# The pinned mark and view methods, executed over the route's own params
# shape: the :type segment plus the route default's view.
def mark_case(label, params, unknown_ok)
  Card::Auth.needs_setup_answer = false
  Card::Env.html_answer = true
  Card::Set::Format::AbstractFormat::ViewOpts.unknown_ok = unknown_ok
  harness = PinnedDeck::ControllerHarness.new(params: params)
  error = nil
  answer = nil
  begin
    answer = harness.send(:implicit_mark)
  rescue StandardError => e
    error = "#{e.class}: #{e.message}"
  end
  {
    "label" => label,
    "params" => params,
    "mark" => answer,
    "error" => error
  }
end

mark_rows = [
  mark_case("the pinned :new registration seated: view new needs no name, the mark is empty",
            { type: "Sign_up", view: "new" }, { new: true }),
  mark_case("the contrast: without :new in the registration table, the ladder falls home",
            { type: "Sign_up", view: "new" }, {})
]

# The pinned view methods, executed with the PINNED :new registration
# seated (the deck's real boot state: the mod's unknown-true views are in
# the table).
Card::Set::Format::AbstractFormat::ViewOpts.unknown_ok = { new: true }
harness = PinnedDeck::ControllerHarness.new(params: { type: "Sign_up", view: "new" })
view_from_params_answer = harness.send(:view_from_params)
view_requires_answer = harness.send(:view_does_not_require_name?)

# The PINNED DECK's own fetch, executed over a recording double.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/fetch/card_class.rb")

class NewTypeFetchHarness
  include Card::Fetch::CardClass

  attr_reader :fetch_asks

  def initialize
    @fetch_asks = []
  end

  def fetch(mark, **opts)
    @fetch_asks << {
      "mark" => mark,
      "new" => opts[:new],
      "skipModules" => opts[:skip_modules],
      "lookInTrash" => opts[:look_in_trash]
    }
    nil
  end
end

fetch_harness = NewTypeFetchHarness.new
fetch_error = nil
begin
  fetch_harness.uri_fetch({ type: "Sign_up", view: "new" })
rescue StandardError => e
  fetch_error = "#{e.class}: #{e.message}"
end

# The pinned sources, quoted with line numbers.
route_source = PinnedDeck.pinned_lines("decko-0.20.0/config/engine_routes.rb")
                         .select { |row| row["line"] == 22 }
view_def_source = PinnedDeck.pinned_lines("card-mod-edit-0.20.0/set/all/new.rb")
                            .select { |row| row["line"].between?(4, 6) }
view_opts_source = PinnedDeck.pinned_lines("card-1.110.0/lib/card/set/format/abstract_format/view_opts.rb")
                             .select { |row| row["line"].between?(49, 57) }

puts JSON.pretty_generate(
  "row" => "reg-routes-A6",
  "gemset" => "decko-0.20.0 + card-1.110.0 + card-mod-edit-0.20.0 (pinned)",
  "newTypeRoute" => new_route,
  "genericViewRoute" => generic_view_arm,
  "routeTableSize" => routes.length,
  "pinnedNewViewRegistration" => {
    "definitionOpts" => { "perms" => "create", "unknown" => true, "cache" => "never" },
    "unknownOkNew" => new_unknown_ok == true
  },
  "implicitMark" => mark_rows,
  "viewFromParams" => view_from_params_answer,
  "viewDoesNotRequireName" => view_requires_answer,
  "uriFetch" => {
    "params" => { "type" => "Sign_up", "view" => "new" },
    "fetchAsks" => fetch_harness.fetch_asks,
    "error" => fetch_error
  },
  "sources" => {
    "route" => route_source,
    "viewDefinition" => view_def_source,
    "viewOpts" => view_opts_source
  }
)

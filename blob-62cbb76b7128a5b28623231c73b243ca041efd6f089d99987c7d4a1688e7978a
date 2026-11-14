# oracle-capture-html-format-ruby.rb - the PINNED MOD's own html format, its
# own show ladder, and the PINNED DECK's own html dispatch, all executed.
#
# WHY THIS SCRIPT EXISTS: the completeness register's D1 row ([Family]) is
# the html format itself. The register's own port evidence for the row is one
# sentence ("The primary path everywhere (A5/A21/B1)"), which is a POINTER
# and not a measurement: it says the html format is what every other row
# rides, and it says nothing about what the pinned html format DOES.
#
# The html format is the ONE format with its own class body of methods, so
# it is the one format whose semantics are not carried by a set block alone.
# The pinned pieces this row measures:
#
#   1. THE CLASS. card-mod-format-0.20.0/lib/card/format/html_format.rb
#      registers :html, answers "text/html" for its mime type, wraps an
#      escaped literal in a span, and answers main? and focal?.
#   2. THE BASE'S NESTING. main? is `!@main.nil?` (html_format.rb:11-13)
#      and focal? is `@focal ||= show_layout? ? main? : depth.zero?`
#      (html_format.rb:16-18), where depth comes from the card gem's own
#      Subformat module (card-1.110.0/lib/card/format/nesting/subformat.rb
#      :26-28) and main! from its Main module (card-1.110.0/lib/card/
#      format/nesting/main.rb:37-39).
#   3. THE SHOW LADDER. card-mod-format-0.20.0/set/all/html/show.rb carries
#      the html format's own show, show_layout?, no_layout? and
#      show_method, and card-mod-layout-0.20.0/set/all/process_layout.rb
#      carries the OTHER half of the ladder, show_with_page_layout, which is
#      the method that calls main!.
#   4. THE DECK'S DISPATCH. response.rb's own format_name_from_params
#      (decko-0.20.0/lib/card_controller/response.rb:99-113) decides which
#      format a request is, and for the html doors the answer is :html.
#
# The DSL is stood in; the BODIES ARE THE PINNED BYTES. Both set files are
# evaluated with a recording `format` method that keeps the block, and each
# kept block is then class_eval'd onto a probe class, so every `def` in it
# is the pinned method. The probe class is NESTED INSIDE Card, because the
# pinned methods name `Env` and the gem's own set loader evaluates a set
# file inside a module nested under Card, so `Env` there is `Card::Env`.
#
# Run (Ruby 3.4 on PATH, no Rails, no database):
#   DECKO_RUBY_GEMSET=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems \
#     ruby tests/server/oracle-capture-html-format-ruby.rb \
#     > fixtures/captured/html-format-ruby-oracle.json
#
# Determinism contract: pretty-printed with a fixed key order and a trailing
# newline. The case list is fixed, so a re-run on the same gemset is
# byte-stable.

require "json"

require_relative "oracle-capture-pinned-deck-harness-ruby"

# The pinned gems' lib directories on the load path, BEFORE the pinned
# activesupport is required: the gemset IS the pinned activesupport, so
# `require "active_support/..."` resolves against it and not against
# whatever the machine has installed.
PinnedDeck.load_pinned_libs!

require "active_support/core_ext/object/blank"
require "active_support/core_ext/string/strip"
require "active_support/core_ext/hash/reverse_merge"

# ---------------------------------------------------------------------------
# the PINNED MOD's own format files, loaded: the registry and the html
# format's own class body
# ---------------------------------------------------------------------------
registry = load_pinned_format_registry!
raise "the pinned registry did not load" unless registry.is_a?(Hash)

html_format_class = Card::Format::REGISTRY_CLASSES["html"]
raise "the pinned mod did not register an html format class" if html_format_class.nil?

# ---------------------------------------------------------------------------
# the PINNED card gem's own nesting modules, loaded and included
# ---------------------------------------------------------------------------
#
# Subformat carries depth and root?; Main carries main!. Both are the
# pinned gem's own bytes, and both are what the html format's main? and
# focal? read.
PinnedDeck.eval_pinned("card-1.110.0/lib/card/format/nesting/subformat.rb")
PinnedDeck.eval_pinned("card-1.110.0/lib/card/format/nesting/main.rb")

# ---------------------------------------------------------------------------
# the PINNED set blocks, kept and then class_eval'd onto a probe
# ---------------------------------------------------------------------------
#
# The mod's set DSL is `format :html do ... end`. The DSL is stood in by a
# recording `format` method that KEEPS the block (and a recording
# `wrapper` method that keeps the wrapper blocks), and the kept block is
# then class_eval'd onto the probe class, so the `def` statements in it are
# the pinned methods.
#
# The set file is evaluated with module_eval INSIDE a module nested under
# Card, because that is what the gem's own set loader does, and it is what
# makes the pinned `Env` resolve to `Card::Env`: the block's own lexical
# scope is the module the file was evaluated in.
class Card
  # The layout class registry the layout mod's own method asks for
  # (card-mod-layout-0.20.0/lib/card/layout.rb:69-77). The stand-in
  # records the layout name and answers the view options the pinned
  # render_with_layout then reads.
  module Layout
    class << self
      def main_nest_opts(layout_name, format)
        format.calls << { "ask" => "Layout.main_nest_opts", "layout" => layout_name.to_s }
        { view: format.probe_default_view }
      end
    end
  end

  module Set
    module All
      # The recording DSL the set files are evaluated against.
      module CapturedSetBlocks
        def captured_blocks
          @captured_blocks ||= {}
        end

        def captured_wrappers
          @captured_wrappers ||= {}
        end

        def format(name = nil, &block)
          captured_blocks[name.nil? ? "base" : name.to_s] = block
          nil
        end

        def wrapper(name, &block)
          captured_wrappers[name.to_s] = block
          nil
        end

        # The set file's own side effect. card-mod-layout-0.20.0/set/all/
        # process_layout.rb:1 is `basket[:cache_seed_names] << %i[all
        # layout]`, a top-level statement in the set file, so the file
        # cannot be evaluated without a basket. The stand-in answers a
        # Hash whose missing key is a fresh Array.
        def basket
          @basket ||= Hash.new { |hash, key| hash[key] = [] }
        end
      end

      module HtmlFormatSet
        extend CapturedSetBlocks
        # The pinned set files name a bare `Env`. The gem's own set loader
        # evaluates a set file inside a module nested under Card, where the
        # bare `Env` is `Card::Env`; the capture's evaluation module
        # carries the same alias, so the pinned `Env.ajax?` is the rig's
        # recorded Card::Env double and not a stand-in of this capture's.
        Env = Card::Env
      end

      module LayoutProcessSet
        extend CapturedSetBlocks
        Env = Card::Env
        # The pinned method asks the layout class registry by its own bare
        # name (process_layout.rb:50), and the gem resolves that to
        # `Card::Layout`; the capture's evaluation module carries the same
        # alias.
        Layout = Card::Layout
      end
    end
  end
end

def keep_set_block(relative, target)
  path = PinnedDeck.pinned_path(relative)
  target.module_eval(File.read(path), path) # rubocop:disable Security/Eval
  target
end

html_show_block = keep_set_block("card-mod-format-0.20.0/set/all/html/show.rb", Card::Set::All::HtmlFormatSet)
layout_block = keep_set_block("card-mod-layout-0.20.0/set/all/process_layout.rb", Card::Set::All::LayoutProcessSet)

raise "the format mod's html show block was not captured" if html_show_block.captured_blocks["html"].nil?
raise "the layout mod's html block was not captured" if layout_block.captured_blocks["html"].nil?

# ---------------------------------------------------------------------------
# the probe: the pinned html format with the pinned set blocks on it
# ---------------------------------------------------------------------------
#
# The probe is a SUBCLASS of the pinned html format class, so the class's
# own methods (mime_type, escape_literal, main?, focal?) are the pinned
# ones, and the two set blocks are class_eval'd onto the probe so their
# `def` statements become the probe's methods. Everything the pinned
# methods ask for that this capture cannot stand up is RECORDED, never
# answered with a plausible value.
class Card
  # The pinned card gem includes the nesting modules into Card::Format
  # itself (card-1.110.0/lib/card/format.rb:22), and the html format
  # class SUBCLASSES Card::Format, so the html format's own main? and
  # focal? override the base's. The includes therefore go on the BASE, or
  # they would shadow the html format's own answers.
  Card::Format.include(Card::Format::Nesting::Subformat)
  Card::Format.include(Card::Format::Nesting::Main)

  class HtmlFormatProbe < Card::Format::HtmlFormat
    attr_reader :calls
    attr_accessor :probe_params, :probe_view_setting, :probe_default_view, :probe_parent, :probe_card

    class << self
      # The wrapper blocks the pinned set file registers, kept by name.
      def wrapper_blocks
        @wrapper_blocks ||= {}
      end

      def wrapper(name, &block)
        wrapper_blocks[name.to_s] = block
        nil
      end
    end

    def initialize
      @calls = []
      @probe_params = {}
      @probe_view_setting = {}
      @probe_default_view = :core
      @probe_parent = nil
      @probe_card = Card::LayoutCardDouble.new
    end

    # The pinned Format's own parent (card-1.110.0/lib/card/format.rb:33).
    # A root format has no parent, and the pinned depth asks for it
    # (subformat.rb:27).
    def parent
      @probe_parent
    end

    # The pinned Format delegates params to Env (card-1.110.0/lib/card/
    # format.rb:38). The rig's Env carries no params, so the request-scoped
    # params are this probe's own, and every read of them is recorded.
    def params
      @calls << { "ask" => "params" }
      @probe_params
    end

    # The pinned format's own default_nest_view (the base set's answer for
    # the page view). It is a stand-in that RECORDS the ask and answers the
    # view name this capture configured.
    def default_nest_view
      @calls << { "ask" => "default_nest_view" }
      @probe_default_view
    end

    # The pinned format's render! (card-1.110.0/lib/card/format/render.rb:7).
    # The stand-in records the view and the args the pinned method asked for.
    def render!(view, view_options = {})
      @calls << { "ask" => "render!", "view" => view.inspect, "args" => view_options.transform_keys(&:to_s) }
      "RENDERED(#{view.inspect})"
    end

    # The pinned format's view_setting (the card's own setting for a view).
    def view_setting(name, view = nil)
      @calls << { "ask" => "view_setting", "name" => name.to_s, "view" => view.inspect }
      @probe_view_setting["#{name}:#{view}"] || @probe_view_setting[name.to_s]
    end

    # The card's own layout rule (card-mod-layout-0.20.0/set/all/
    # process_layout.rb:33-35). The card is not available in this capture,
    # so the ask is a recording stand-in that answers nil.
    def rule_card(name)
      @calls << { "ask" => "rule_card", "name" => name.to_s }
      nil
    end

    # The pinned Format's own card (card-1.110.0/lib/card/format.rb:33).
    def card
      @probe_card
    end
  end

  # The card the html format renders. The layout mod's own method asks the
  # card for its layout rule (process_layout.rb:33-35), so the double
  # records the ask and answers what this capture configured.
  class LayoutCardDouble
    attr_reader :calls
    attr_accessor :rule_card_answer

    def initialize(rule_card_answer: nil)
      @calls = []
      @rule_card_answer = rule_card_answer
    end

    def rule_card(name)
      @calls << { "ask" => "rule_card", "name" => name.to_s }
      @rule_card_answer
    end
  end
end

# The two pinned set blocks, class_eval'd onto the probe.
Card::HtmlFormatProbe.class_eval(&html_show_block.captured_blocks["html"])
Card::HtmlFormatProbe.class_eval(&layout_block.captured_blocks["html"])

# ---------------------------------------------------------------------------
# 1 - the format's own class, measured
# ---------------------------------------------------------------------------
class_rows = {
  "registered" => registry["registered"].include?("html"),
  "mimeType" => html_format_class.allocate.mime_type,
  "escapeLiteral" => html_format_class.allocate.escape_literal("{}"),
  "baseMimeType" => Card::Format.allocate.mime_type,
  # The shared rig stands Card in as a bare class, so the base's own
  # escape_literal (card-1.110.0/lib/card/format.rb:90-92) is not on the
  # rig's stub. The call is attempted and its failure recorded; the pinned
  # line is quoted in the sources, so the reader sees the base's answer.
  "baseEscapeLiteral" => begin
    Card::Format.allocate.escape_literal("{}")
  rescue StandardError => e
    "RAISED: #{e.class}: #{e.message}"
  end
}

# ---------------------------------------------------------------------------
# 2 - main? and focal?, measured over the pinned expressions
# ---------------------------------------------------------------------------
#
# main? is `!@main.nil?`, so it is FALSE on a fresh format and TRUE only
# after main! (card-1.110.0/lib/card/format/nesting/main.rb:37-39) or
# after show_without_page_layout set @main (set/all/html/show.rb:26).
# focal? is `@focal ||= show_layout? ? main? : depth.zero?`, and the
# `@focal ||=` MEMOIZES: the first answer is the answer for good.
def probe_with(params: {}, ajax: false, view_setting: {}, default_view: :core)
  probe = Card::HtmlFormatProbe.new
  probe.probe_params = params
  probe.probe_view_setting = view_setting
  probe.probe_default_view = default_view
  Card::Env.ajax_answer = ajax
  probe
end

focal_rows = [
  { "label" => "a fresh format, no layout shown, not main", "params" => {}, "ajax" => true },
  { "label" => "a fresh format, layout shown, not main", "params" => {}, "ajax" => false },
  { "label" => "a fresh format, layout shown, main!", "params" => {}, "ajax" => false, "main" => true },
  { "label" => "a fresh format, no layout shown, main!", "params" => {}, "ajax" => true, "main" => true }
].map do |spec|
  probe = probe_with(params: spec["params"], ajax: spec["ajax"])
  probe.main! if spec["main"]
  first = probe.focal?
  # The memoization: the second ask cannot change its answer.
  second = probe.focal?
  {
    "label" => spec["label"],
    "ajax" => spec["ajax"],
    "main" => spec["main"] ? true : false,
    "mainQuestion" => probe.main?,
    "depth" => probe.depth,
    "showLayout" => probe.send(:show_layout?),
    "focalFirst" => first,
    "focalSecond" => second,
    "focalMemoized" => first == second
  }
end

# ---------------------------------------------------------------------------
# 3 - the show ladder, measured over the request states
# ---------------------------------------------------------------------------
#
# show_layout? is `return false if no_layout?; !Env.ajax? || params[:layout]`
# (set/all/html/show.rb:40-44) and no_layout? is `params[:layout] == "none"`
# (show.rb:46-48). show_method is "show_with_page_layout" or
# "show_without_page_layout" (show.rb:36-38). The layout arm's method
# belongs to the LAYOUT mod, and it is the one that calls main! (process_
# layout.rb:18-19), which is what makes main? true.
ladder_rows = [
  { "label" => "a plain request", "params" => {}, "ajax" => false },
  { "label" => "an ajax request", "params" => {}, "ajax" => true },
  { "label" => "a request that asks for a layout", "params" => { layout: "default" }, "ajax" => true },
  { "label" => "a request that asks for no layout", "params" => { layout: "none" }, "ajax" => false }
].map do |spec|
  probe = probe_with(params: spec["params"], ajax: spec["ajax"])
  {
    "label" => spec["label"],
    "params" => spec["params"].transform_keys(&:to_s),
    "ajax" => spec["ajax"],
    "noLayout" => probe.send(:no_layout?),
    "showLayout" => probe.send(:show_layout?),
    "showMethod" => probe.send(:show_method)
  }
end

# ---------------------------------------------------------------------------
# 4 - show_without_page_layout, executed
# ---------------------------------------------------------------------------
#
# The pinned method (set/all/html/show.rb:25-30) sets @main when the
# params or the args ask for it, deletes :layout from the args, resolves
# the view, and asks render! for it.
without_layout_rows = [
  { "label" => "no main asked for", "params" => {}, "args" => {} },
  { "label" => "the args ask for main", "params" => {}, "args" => { main: true } },
  { "label" => "the params ask for main", "params" => { is_main: "1" }, "args" => {} },
  { "label" => "a view is named", "params" => {}, "args" => {}, "view" => :titled },
  { "label" => "no view, the home view is named", "params" => {}, "args" => { home_view: :home } }
].map do |spec|
  probe = probe_with(params: spec["params"], ajax: true)
  args = spec["args"].dup
  returned = probe.send(:show_without_page_layout, spec["view"], args)
  {
    "label" => spec["label"],
    "params" => spec["params"].transform_keys(&:to_s),
    "argsIn" => spec["args"].transform_keys(&:to_s),
    "argsOut" => args.transform_keys(&:to_s),
    "mainAfter" => probe.main?,
    "returned" => returned,
    "calls" => probe.calls
  }
end

# ---------------------------------------------------------------------------
# 5 - show_with_page_layout, executed
# ---------------------------------------------------------------------------
#
# The LAYOUT mod's method (process_layout.rb:18-27) calls main! FIRST, so
# the format becomes main, then resolves the layout, then asks render!
# with the main render args.
with_layout_rows = [
  { "label" => "no layout in the params, no rule", "params" => {} },
  { "label" => "the params name the layout", "params" => { layout: "modal" } }
].map do |spec|
  probe = probe_with(params: spec["params"], ajax: false)
  returned = probe.send(:show_with_page_layout, :open, {})
  {
    "label" => spec["label"],
    "params" => spec["params"].transform_keys(&:to_s),
    "mainAfter" => probe.main?,
    "returned" => returned,
    "calls" => probe.calls
  }
end

# ---------------------------------------------------------------------------
# 6 - the html page's own wrapper block, executed
# ---------------------------------------------------------------------------
#
# The wrapper is the DOCTYPE document (set/all/html/show.rb:7-17). Its
# BLOCK is the pinned bytes, and the interpolation values it names
# (head_content and interior) are the pinned method's own asks.
wrapper_block = Card::HtmlFormatProbe.wrapper_blocks["html_page"]
wrapper_row = { "declared" => !wrapper_block.nil? }
if wrapper_block
  wrapper_probe = Class.new do
    def head_content
      "HEAD"
    end

    def interior
      "INTERIOR"
    end
  end.new
  wrapper_row["rendered"] = wrapper_probe.instance_exec(&wrapper_block)
  wrapper_row["source"] = PinnedDeck.pinned_lines("card-mod-format-0.20.0/set/all/html/show.rb")
                               .select { |row| row["line"].between?(7, 17) }
end

# ---------------------------------------------------------------------------
# 7 - the DECK's own dispatch, for the html doors
# ---------------------------------------------------------------------------
#
# response.rb's own format_name_from_params (decko-0.20.0/lib/card_controller/
# response.rb:99-113) and requested_format (:111-113). The request double
# answers request.format, which is the door the suffix does not use.
PinnedDeck.load_pinned_controller!

class HtmlDispatchRequestDouble
  attr_reader :format

  def initialize(format)
    @format = format
  end
end

class HtmlDispatchHarness
  include CardController::Response

  attr_accessor :params, :request

  def initialize(params, request)
    @params = params
    @request = request
  end
end

def dispatch_case(label, requested, params: {})
  harness = HtmlDispatchHarness.new(params, HtmlDispatchRequestDouble.new(requested))
  {
    "label" => label,
    "requested" => requested,
    "params" => params.transform_keys(&:to_s),
    "formatName" => harness.send(:format_name_from_params).to_s
  }
end

dispatch_rows = [
  dispatch_case("the browser door, no suffix", "html"),
  dispatch_case("the suffix door", "html", params: { format: "html" }),
  dispatch_case("the suffix door with a different format", "json", params: { format: "json" }),
  dispatch_case("an unregistered suffix", "bin", params: { format: "bin" })
]

# ---------------------------------------------------------------------------
# the sources, quoted with line numbers
# ---------------------------------------------------------------------------
sources = {
  "htmlFormatClass" => PinnedDeck.pinned_lines("card-mod-format-0.20.0/lib/card/format/html_format.rb"),
  "htmlShowSet" => PinnedDeck.pinned_lines("card-mod-format-0.20.0/set/all/html/show.rb"),
  "processLayoutSet" => PinnedDeck.pinned_lines("card-mod-layout-0.20.0/set/all/process_layout.rb"),
  "baseFormat" => PinnedDeck.pinned_lines("card-1.110.0/lib/card/format.rb")
                         .select { |row| row["line"].between?(86, 97) },
  "subformat" => PinnedDeck.pinned_lines("card-1.110.0/lib/card/format/nesting/subformat.rb")
                         .select { |row| row["line"].between?(26, 43) },
  "mainModule" => PinnedDeck.pinned_lines("card-1.110.0/lib/card/format/nesting/main.rb")
                        .select { |row| row["line"].between?(30, 45) },
  "dispatch" => PinnedDeck.pinned_lines("decko-0.20.0/lib/card_controller/response.rb")
                       .select { |row| row["line"].between?(99, 113) }
}

puts JSON.pretty_generate(
  "row" => "reg-routes-D1",
  "gemset" => "decko-0.20.0 + card-1.110.0 + card-mod-format-0.20.0 + card-mod-layout-0.20.0 (pinned)",
  "registry" => {
    "registered" => registry["registered"],
    "mimeTypes" => registry["mimeTypes"]
  },
  "htmlFormat" => class_rows,
  "focal" => focal_rows,
  "showLadder" => ladder_rows,
  "withoutPageLayout" => without_layout_rows,
  "withPageLayout" => with_layout_rows,
  "htmlPageWrapper" => wrapper_row,
  "dispatch" => dispatch_rows,
  "rigArtifacts" => [
    "the mod's set DSL is stood in and the set BLOCKS are the pinned bytes: card-mod-format-0.20.0/set/all/html/show.rb and card-mod-layout-0.20.0/set/all/process_layout.rb are each evaluated with a recording `format` method that keeps the block, and each kept block is class_eval'd onto a probe class that SUBCLASSES the pinned html format class. Every `def` in those blocks is therefore the pinned method, and the pinned class's own methods (mime_type, escape_literal, main?, focal?) are inherited, not copied.",
    "the probe class is nested inside Card because the pinned methods name `Env`, and the gem's own set loader evaluates a set file inside a module nested under Card, so `Env` there is `Card::Env`. The nesting reproduces that lookup.",
    "the card gem's own nesting modules are loaded and included: card-1.110.0/lib/card/format/nesting/subformat.rb carries depth and root?, and card-1.110.0/lib/card/format/nesting/main.rb carries main!. Both are the pinned gem's own bytes, and both are what the html format's main? and focal? read.",
    "render!, default_nest_view, view_setting, params, rule_card and the layout class registry's main_nest_opts are RECORDING stands: each records the ask and answers a configured value. The pinned methods that call them are the pinned ones, and the capture prints what they asked for.",
    "the page wrapper's BLOCK is the pinned bytes and is executed on a probe carrying head_content and interior. The wrapper MACHINERY around it (the pinned wrapper registry) is not stood in, so this measures the block's own text, not the registry that applies it.",
    "the rebuilt gemset holds 68 gems and the original held 151. A method the html format's show calls but this gemset does not carry would raise NameError here rather than in the original set; the capture records such a call as a recorded error rather than as a pinned answer."
  ],
  "sources" => sources
)

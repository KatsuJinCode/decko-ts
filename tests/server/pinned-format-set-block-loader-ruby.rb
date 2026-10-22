# pinned-format-set-block-loader-ruby.rb - the shared loader for the rows
# that need a PINNED mod's own format SET BLOCK executed.
#
# WHAT THIS IS. A mod's format behaviour lives in two places: the format
# CLASS (card-mod-format-0.20.0/lib/card/format/<name>_format.rb, which
# registers itself and carries the class's own methods) and the set BLOCK
# (card-mod-format-0.20.0/set/all/<name>.rb, which is a `format :<name> do
# ... end` block of `def` statements and `view` declarations).
#
# The shared loading rig (tests/server/oracle-capture-pinned-deck-harness-ruby.rb)
# loads the format CLASSES already: its load_pinned_format_registry! runs
# the mod's own format files over the rig's Card::Format stand-in, so the
# registry and every class's own methods are the pinned ones.
#
# What the rig does NOT do is run a set BLOCK. That needs three things, and
# this file is those three things:
#
#   1. A place to EVALUATE the set file in. The gem's own set loader
#      evaluates a set file inside a module nested under Card, and that is
#      what makes the bare `Env` a pinned method name resolve to
#      `Card::Env`. This file evaluates each set file into its own module
#      nested under Card::Set::All, so the same resolution holds.
#   2. A stand-in for the set DSL. The DSL is `format :<name> do ... end`
#      (and `wrapper :<name> do ... end`); the stand-in KEEPS the block
#      instead of running it, and the kept block is then class_eval'd onto
#      the capture's probe class, so every `def` inside it becomes the
#      pinned method.
#   3. The recording stands the pinned methods ask for. Every stand here
#      RECORDS the ask and answers a configured value; none of them
#      decides an answer.
#
# The BODIES ARE THE PINNED BYTES. The DSL is the only thing stood in.
#
# This is a SUPPORT file for the capture scripts beside it, not the loading
# rig: the loading rig is oracle-capture-pinned-deck-harness-ruby.rb, and
# it is deliberately untouched.

require "json"

require_relative "oracle-capture-pinned-deck-harness-ruby"

# The pinned gems' lib directories on the load path, BEFORE the pinned
# activesupport is required: the gemset IS the pinned activesupport.
PinnedDeck.load_pinned_libs!

require "active_support/core_ext/object/blank"
require "active_support/core_ext/string/strip"
require "active_support/core_ext/hash/reverse_merge"

# The namespace the captured set files are evaluated in. It is nested
# under Card, because the gem's own set loader evaluates a set file inside
# a module nested under Card, and that is what makes the bare `Env` in a
# pinned set method resolve to `Card::Env`.
class Card
  module Set
    module All
      # The base set's own format module. A pinned set file names it as
      # `All::Base::Format` in a view declaration's `mod:` option, which
      # says which format module owns the view. The stand-in is the
      # constant the pinned file names; the option's VALUE is recorded, not
      # acted on.
      module Base
        module Format
        end
      end
    end
  end
end

# The recording `view` and `wrapper` declarations, for a set block that
# declares them. Inside a set block the DSL is called on the format class,
# so these are CLASS methods on the target.
module RecordingFormatDeclarations
  def view_declarations
    @view_declarations ||= []
  end

  def view(name, *aliases, **opts, &block)
    view_declarations << {
      "name" => name.to_s,
      "aliases" => aliases.map(&:to_s),
      "opts" => opts.transform_keys(&:to_s),
      "hasBlock" => !block.nil?
    }
    view_blocks[name.to_s] = block unless block.nil?
    nil
  end

  # The kept view BODIES, by view name. A capture that executes a view
  # body needs the block itself, not only the declaration's metadata.
  def view_blocks
    @view_blocks ||= {}
  end

  def wrapper_blocks
    @wrapper_blocks ||= {}
  end

  def wrapper(name, &block)
    wrapper_blocks[name.to_s] = block
    nil
  end
end

module PinnedFormatSetBlocks
  # The recording DSL a set file is evaluated against.
  module RecordingDsl
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

    # The set file's own side effect. A set file can open with a statement
    # like `basket[:cache_seed_names] << %i[all layout]`
    # (card-mod-layout-0.20.0/set/all/process_layout.rb:1), so the file
    # cannot be evaluated without a basket. The stand-in answers a Hash
    # whose missing key is a fresh Array.
    def basket
      @basket ||= Hash.new { |hash, key| hash[key] = [] }
    end
  end

  module_function

  # A module name that says which pinned file it holds, and that is legal
  # as a Ruby constant.
  def module_name_for(relative)
    relative.gsub(/[^A-Za-z0-9]+/, "_").split("_").reject(&:empty?).map(&:capitalize).join
  end

  # Evaluate a pinned set file into its own module nested under Card, with
  # the recording DSL standing in for the gem's own set DSL. The module is
  # named after the file so two set files never share one capture slot.
  def capture(relative)
    name = module_name_for(relative)
    holder = Card::Set::All
    holder.const_set(name, Module.new) unless holder.const_defined?(name, false)
    target = holder.const_get(name)
    target.extend(RecordingDsl) unless target.singleton_class.include?(RecordingDsl)
    # The bare `Env` the pinned methods name is `Card::Env` in the gem,
    # because the gem's own set loader evaluates a set file inside a module
    # nested under Card. The alias reproduces that resolution. The bare
    # `All` a pinned set file names (in a view declaration's `mod:` option)
    # is `Card::Set::All` for the same reason.
    target.const_set(:Env, Card::Env) unless target.const_defined?(:Env, false)
    target.const_set(:All, Card::Set::All) unless target.const_defined?(:All, false)
    path = PinnedDeck.pinned_path(relative)
    target.module_eval(File.read(path), path) # rubocop:disable Security/Eval
    target
  end

  # The kept block for one format name, or nil.
  def block_for(relative, format_name)
    capture(relative).captured_blocks[format_name.to_s]
  end

  # Class_eval a pinned set block onto a target class. The `def`
  # statements in the block become the target's methods, and the block's
  # own lexical scope (the module nested under Card) is what the pinned
  # methods' constant lookups see.
  def apply!(relative, format_name, target_class)
    block = block_for(relative, format_name)
    raise "the pinned set file #{relative} has no #{format_name} block" if block.nil?

    # Inside a set block the DSL is called on the format class, so the
    # recording view and wrapper declarations are class methods there.
    target_class.extend(RecordingFormatDeclarations) unless target_class.singleton_class.include?(RecordingFormatDeclarations)
    target_class.class_eval(&block)
    block
  end
end

# The recording stands the pinned format methods ask for. A capture's probe
# class includes this module, so every ask is recorded and every answer is
# the one the capture configured.
module PinnedFormatProbeStands
  attr_reader :calls
  attr_accessor :probe_params, :probe_view_setting, :probe_default_view, :probe_parent, :probe_card,
                :probe_render_answer, :probe_request_url

  def initialize
    setup_probe_stands
  end

  # The recording stands' own state. A capture whose pinned set block
  # declares an initializer of its own calls this instead, because the
  # pinned initializer cannot run against the rig's bare Card stand-in.
  def setup_probe_stands
    @calls = []
    @probe_params = {}
    @probe_view_setting = {}
    @probe_default_view = :core
    @probe_parent = nil
    @probe_card = nil
    @probe_render_answer = nil
    @probe_request_url = nil
  end

  # The pinned Format's own parent (card-1.110.0/lib/card/format.rb:33).
  # A root format has no parent, and the pinned depth asks for it
  # (nesting/subformat.rb:27).
  def parent
    @probe_parent
  end

  # The pinned Format delegates params to Env (card-1.110.0/lib/card/
  # format.rb:38). The rig's Env carries no params, so the request-scoped
  # params are the probe's own, and every read of them is recorded.
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
  # The stand-in records the view and the args the pinned method asked for,
  # and answers the configured value when there is one (a capture that
  # measures what the pinned method does with its answer sets it).
  def render!(view, view_options = {})
    @calls << {
      "ask" => "render!",
      "view" => view.inspect,
      "args" => view_options.transform_keys(&:to_s)
    }
    return @probe_render_answer unless @probe_render_answer.nil?

    "RENDERED(#{view.inspect})"
  end

  # The pinned Format's own request_url (card-1.110.0/lib/card/format.rb:
  # 81-83): the controller's original url, or the card's own path.
  def request_url
    @calls << { "ask" => "request_url" }
    @probe_request_url
  end

  # The pinned format's view_setting (the card's own setting for a view).
  def view_setting(name, view = nil)
    @calls << { "ask" => "view_setting", "name" => name.to_s, "view" => view.inspect }
    @probe_view_setting["#{name}:#{view}"] || @probe_view_setting[name.to_s]
  end

  # The card's own rule card. The card is not available in a capture, so
  # the ask is a recording stand-in that answers nil.
  def rule_card(name)
    @calls << { "ask" => "rule_card", "name" => name.to_s }
    nil
  end

  # The pinned Format's own card (card-1.110.0/lib/card/format.rb:33).
  def card
    @probe_card
  end
end

# The card gem's own format render module, loaded and included ON THE BASE.
#
# It carries the base's own expand_stubs (card-1.110.0/lib/card/format/
# render.rb:138-151), which the json format's own expand_stubs calls
# through `super` for every leaf that is not a Hash or an Array. The
# module's render! is the pinned one too, but a capture's probe carries
# its own recording render!, which sits earlier in the ancestor chain.
def load_pinned_format_render!
  PinnedDeck.eval_pinned("card-1.110.0/lib/card/format/render.rb")
  Card::Format.include(Card::Format::Render)
  Card::Format::Render
end

# The card gem's own nesting modules, loaded and included ON THE BASE.
#
# The pinned card gem includes the nesting modules into Card::Format itself
# (card-1.110.0/lib/card/format.rb:22), and a format class SUBCLASSES
# Card::Format, so the format class's own main? and focal? override the
# base's. The includes therefore go on the BASE: on the probe they would
# shadow the format class's own answers.
def load_pinned_format_nesting!
  PinnedDeck.eval_pinned("card-1.110.0/lib/card/format/nesting/subformat.rb")
  PinnedDeck.eval_pinned("card-1.110.0/lib/card/format/nesting/main.rb")
  Card::Format.include(Card::Format::Nesting::Subformat)
  Card::Format.include(Card::Format::Nesting::Main)
  Card::Format::Nesting::Subformat
end

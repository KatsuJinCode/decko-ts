# reference-editor-chrome-views.rb — static-ruby oracle capture for
# card-mod-tinymce_editor's census views :nest_editor, :modal_nest_editor,
# :nest_image and :modal_nest_image (set/all/reference_editor/
# {nest_editor,nest_image}.rb), plus the params-seam arms of :nest_content
# and :new_image.
#
# WHAT RUNS (this script is byte-PRODUCING, not hand-shaped):
#   1. The gems' own source, VERBATIM: whole-file loads (nest_parser.rb,
#      tabs lib Card::Tab/Card::LazyTab, cardname) and format-block /
#      method regions evaled into the format double:
#      - card-mod-tinymce_editor nest_editor.rb / nest_image.rb (html
#        block), reference_editor.rb, nest_editor_tabs.rb,
#        nest_editor_options.rb
#      - card-mod-format links.rb (the HTML link_to block), menu.rb
#        (help_link + help_popover_opts), tabs.rb (def tabs)
#      - card-mod-layout alert.rb (the whole html block)
#      - card-mod-bootstrap icon.rb (icon_tag chain incl. the verbatim
#        icon_lookup over basket[:icons]) + form.rb (button_tag
#        bootstrapify) + helper.rb (popover_opts)
#      - card core format/content.rb region (add_class/css_classes/
#        unique_id/output) + wrap.rb wrap_with
#   2. The REAL template engine: Haml 5.2.2 renders the gems' verbatim
#      .haml files (reference_editor.haml, _nest_editor.haml, _basics.haml,
#      _options.haml, _options_select.haml, _options_select_row.haml,
#      _image_find.haml, _image_options.haml, _image_nest_editor.haml) plus
#      card-mod-tabs' tab_panel.haml.
#   3. The REAL Rails helpers: ActionView 7.2.4 TagHelper/FormTagHelper/
#      FormOptionsHelper/OutputSafetyHelper included into the double
#      (text_field_tag, select_tag, options_for_select, content_tag, tag;
#      decko's button_tag/link_to/help_link/alert/wrap_with sit in front of
#      them via class_eval + super).
#   4. The REAL i18n: the gem's own config/locales/en.yml under real I18n
#      (the t(:..._help_text/_title) bytes: "Hello"/"Title"/"World").
#   5. The REAL cardname gem (cardname-0.20.0 whole lib) under the card-core
#      Card::Name bridge (lib/card/name.rb's []/compose semantics: symbols
#      resolve through the codename table — :all -> "*all").
#
# STUBS, each documented:
#   params           - THE PARAMS SEAM (named in the lane receipt): the gem's
#                      own example shape seeds tm_snippet_raw (the js
#                      open_nest_editor insert:
#                      "{{+<name>|view: content; size: medium}}");
#                      tinymce_id/tm_snippet_start/index are seeded with
#                      labeled SYNTHETIC pass-through values (the byte
#                      contract is the pass-through, not the value). The
#                      ABSENT-params arm is ALSO rendered (NestParser.new nil
#                      -> the default Nest struct) and CROSS-CHECKED
#                      byte-for-byte against the LIVE deck capture
#                      fixtures/captured/tinymce-editor-views.json
#                      (no_write_proof: actions 4929 -> 4929).
#   card             - the probe-card double (name/type_name/
#                      left_type_for_nest_editor_set_selection/autoname/
#                      is_structure?); the fixture's recorded facts
#                      cross-check the derived ones (image01 autoname,
#                      image02 next, "*all+by name" options card).
#   voo              - the visibility double (visibility.rb semantics:
#                      hide!/show! force-writes; show? = !hide? for
#                      unlisted optionals).
#   nest             - THE NEST SEAM: the deep engine render (the rules
#                      tab's nest_rules view, the image tabs' new_image/core
#                      views). The ABSENT-params nest_editor arm has NO nest
#                      (blank snippet name -> the placeholder div), so its
#                      bytes compare FULLY against the live capture. The
#                      SEEDED arms and the image editor's upload/preview
#                      tabs emit the seam MARKER; the script SPLICES the
#                      live capture's corresponding regions around each
#                      marker and asserts every static-controlled segment
#                      matches the deck's live bytes in order.
#   Card::Codename   - the codename bridge with the two entries the views
#                      read (:all -> "*all", :by_name -> "*by name");
#                      the composed result is cross-checked against the
#                      fixture's recorded options_card_name fact.
#   Cardio.config    - icon_libraries [:material] (card-mod-bootstrap
#                      lib/card/mod/bootstrap.rb:2 verbatim).
#
# Usage: ruby reference-editor-chrome-views.rb <card-mod-tinymce_editor-gem-path> <repo-root>

require "json"
require "cgi"
require "uri"
require "i18n"

gem "activesupport", "7.2.4"
gem "actionview", "7.2.4"
gem "haml", "5.2.2"
require "active_support"
require "active_support/core_ext/array/wrap"
require "active_support/core_ext/object/blank"
require "active_support/core_ext/hash/reverse_merge"
require "active_support/core_ext/hash/except"
require "active_support/core_ext/module/attribute_accessors"
require "action_view"
require "haml"

gem_path = ARGV[0] or abort "usage: ruby #{File.basename(__FILE__)} <card-mod-tinymce_editor-gem-path> [repo-root]"
# this script lives at <repo>/tools/mod-porting-harness/ruby-oracles/
# card-mod-tinymce_editor/ (the style-tag-views.rb pattern); the second arg
# overrides the derived repo root
repo_root = ARGV[1] || File.expand_path("../../../..", __dir__)
abort "not a card-mod-tinymce_editor gem path: #{gem_path}" unless File.basename(gem_path).start_with?("card-mod-tinymce_editor")
GEMS = File.dirname(File.expand_path(gem_path)).tr("\\", "/")
MODS = {
  "tinymce" => File.expand_path(gem_path).tr("\\", "/"),
  "format" => File.join(GEMS, "card-mod-format-0.20.0"),
  "bootstrap" => File.join(GEMS, "card-mod-bootstrap-0.20.0"),
  "layout" => File.join(GEMS, "card-mod-layout-0.20.0"),
  "tabs" => File.join(GEMS, "card-mod-tabs-0.20.0"),
  "content" => File.join(GEMS, "card-mod-content-0.20.0"),
  "card" => File.join(GEMS, "card-1.110.0"),
}.freeze
MODS.each { |n, p| abort "mod gem not found (#{n}): #{p}" unless File.directory?(p) }

def mod_file(mod, *parts)
  File.join(MODS.fetch(mod), *parts)
end

def src_lines(path)
  File.readlines(path)
end

def region(path, a, b)
  src_lines(path)[(a - 1)...b].join
end

# the verbatim body of `format :html do ... end` (the occurrence-th match)
# Block counting: def/do openers plus LINE-START if/unless/case (Ruby's
# modifier forms sit mid-line and open nothing; line-start ones need an end).
def block_opens(line)
  line.scan(/\bdef\b|\bdo\b/).length + (line.match?(/^\s*(?:if|unless|case)\b/) ? 1 : 0)
end

def block_closes(line)
  line.scan(/\bend\b/).length
end

def format_html_body(path, occurrence: 1)
  lines = src_lines(path)
  starts = lines.each_index.select { |i| lines[i].match?(/^format :html do\b/) }
  raise "no format :html do in #{path}" if starts.empty?
  raise "occurrence #{occurrence} of format :html do not in #{path} (#{starts.length} found)" if occurrence > starts.length

  i = starts[occurrence - 1] + 1
  depth = 1
  body = []
  while i < lines.length
    line = lines[i]
    depth += block_opens(line)
    depth -= block_closes(line)
    break if depth <= 0

    body << line
    i += 1
  end
  raise "unbalanced format block in #{path}" unless depth.zero?

  body.join
end

# the verbatim body of a def (matched by name, the same block counting)
def def_region(path, method_re)
  lines = src_lines(path)
  i = lines.index { |l| l.match?(/^\s*#{method_re}/) }
  raise "def #{method_re} not found in #{path}" if i.nil?

  depth = 0
  body = []
  while i < lines.length
    line = lines[i]
    depth += block_opens(line)
    depth -= block_closes(line)
    body << line
    break if depth <= 0

    i += 1
  end
  raise "unbalanced def in #{path}" unless depth.zero?

  body.join
end

def emit(obj)
  puts JSON.generate(obj)
end

# --- the REAL name machinery (cardname-0.20.0 whole lib + the card-core -------
#      Card::Name bridge: []/compose route symbols through the codename table)
$LOAD_PATH.unshift File.join(GEMS, "cardname-0.20.0", "lib")
require "cardname"

# the decko namespace: every gems-opened class hangs off this real class

class Card
  module Codename
    # the codename table, verbatim-faithful for the entries these views read;
    # the composed result is cross-checked against the fixture's recorded
    # options_card_name fact (the live deck's codename table read)
    TABLE = { all: "*all", by_name: "by name" }.freeze

    def self.name!(key)
      TABLE.fetch(key.to_sym) { raise "codename not in the oracle table: #{key}" }
    end
  end

  class Name < Cardname
    # decko's url_key (the decko core NameVariants shape; the style oracle's
    # NameString precedent): the url-safe form
    def url_key
      tr(" ", "_").downcase
    end

    class << self
      # card core lib/card/name.rb:21-32 [] (the symbol arm) + :44-49 compose
      def [](*cardish)
        cardish = cardish.first if cardish.size <= 1
        case cardish
        when Symbol then Card::Codename.name!(cardish)
        when Array  then compose(cardish)
        when String, nil then new(cardish)
        else raise "unsupported cardish: #{cardish.inspect}"
        end
      end

      def compose(parts)
        parts.map { |part| self[part] }.join(joint)
      end

      def new(str, _validated_parts = nil)
        str = Cardname(str) if str.is_a?(Array)
        super(str.to_s)
      end
    end
  end
end

Object.include(Module.new do
  def to_name
    Card::Name.new(to_s)
  end
end)
Symbol.include(Module.new do
  def to_name
    Card::Name.new(to_s) # persistent_identifier.rb:11-13 (no codename route)
  end
end)
Array.include(Module.new do
  def to_name
    Card::Name.compose(self) # array.rb:12-17 cardname compose
  end
end)

# --- the REAL i18n: the gem's own en.yml ---------------------------------------
I18n.available_locales = [:en]
I18n.locale = :en
I18n.load_path << File.join(MODS.fetch("tinymce"), "config", "locales", "en.yml")
I18n.backend.load_translations

def t(key)
  I18n.t(key)
end

# --- the REAL Rails tag helpers -------------------------------------------------
class RailsHelpersHost
  include ActionView::Helpers::TagHelper
  include ActionView::Helpers::FormTagHelper
  include ActionView::Helpers::FormOptionsHelper
  include ActionView::Helpers::OutputSafetyHelper
  attr_accessor :output_buffer

  def initialize
    @output_buffer = ActionView::OutputBuffer.new
  end
end

# --- the REAL Card::Tab (card-mod-tabs lib, whole files; tab.rb first) ------------
require mod_file("tabs", "lib", "card", "tab.rb")
require mod_file("tabs", "lib", "card", "lazy_tab.rb")

# --- Card::View.normalize_list (card core lib/card/view.rb:38-45 verbatim) -------
class Card
  class Error < StandardError; end
  class View
    class << self
      def normalize(view)
        view.present? ? view.to_sym : nil
      end

      def normalize_list(val)
        case val
        when NilClass then []
        when Array    then val
        when String   then val.split(/[\s,]+/)
        when Symbol   then [val]
        else raise Card::Error, "bad show/hide argument: #{val}"
        end
      end
    end
  end
end

# --- the Chunk::Nest double: the card-mod-content chunk's own parse chain --------
#    The parse methods are the chunk's VERBATIM methods (nest.rb); the stub
#    supplies the Chunk::Abstract#initialize machinery (full_re match +
#    @text = match[0]) and the shark_keys registry read
#    (card core view/options.rb:27-35 verbatim list).
class Card
  class Content
    module Chunk
      class Nest
        DEFAULT_OPTION = :view

        FULL_RE = /\A\{\{([^{}]*)\}\}/

        class << self
          attr_accessor :shark_keys
        end
        self.shark_keys = %i[
          view nest_name nest_syntax wrap show hide unknown
          help structure title variant joint input_type type
          size header items cache edit separator filter params
        ].freeze

        attr_reader :name, :options

        def initialize(nest_string, _parent = nil)
          match = FULL_RE.match(nest_string)
          raise NoMethodError, "undefined method `[]' for nil (chunk miss)" if match.nil?

          interpret match
        end

        # verbatim nest.rb#interpret
        def interpret(match, _content = nil)
          in_brackets = strip_tags match[1]
          name, @opt_lists = in_brackets.split "|", 2
          name = name.to_s.strip
          if name.match?(/^\#/)
            @options = nil
            @name = nil
          else
            @options = interpret_options.merge nest_name: name, nest_syntax: in_brackets
            @name = name
          end
        end

        # verbatim
        def strip_tags(string)
          string.gsub(/<[^>]*>/, "")
        end

        # verbatim
        def interpret_options
          raw_options = @opt_lists.to_s.split("|").reverse
          raw_options.inject(nil) do |prev_level, level_options|
            interpret_piped_options level_options, prev_level
          end || {}
        end

        # verbatim
        def interpret_piped_options(list_string, items)
          options_hash = items.nil? ? {} : { items: items }
          option_string_to_hash list_string, options_hash
          options_hash
        end

        # verbatim
        def option_string_to_hash(list_string, options_hash)
          each_option(list_string) do |key, value|
            key = key.to_sym
            if key == :item
              options_hash[:items] ||= {}
              options_hash[:items][:view] = value
            elsif self.class.shark_keys.include? key
              options_hash[key] = value
            end
          end
        end

        # verbatim (private)
        def each_option(attr_string)
          return if attr_string.blank?

          attr_string.strip.split(";").each do |pair|
            value, key = pair.split(":", 2).reverse
            key ||= self.class::DEFAULT_OPTION.to_s
            yield key.strip, value.strip
          end
        end
      end
    end
  end
end

# --- NestParser VERBATIM (the gem's own lib file, whole-file load) ---------------
require mod_file("tinymce", "lib", "card", "reference", "nest_parser.rb")

# --- the visibility double (visibility.rb semantics) ------------------------------
class VooDouble
  attr_reader :opts
  attr_accessor :buttons_view, :title, :help

  def initialize
    @hidden = []
    @forced = {}
    @opts = {}
  end

  def hide(view)
    @hidden << view.to_sym unless @hidden.include?(view.to_sym)
  end

  def hide!(view)
    @forced[view.to_sym] = :hide
    hide(view)
  end

  def show!(view)
    @forced[view.to_sym] = :show
    @hidden.delete(view.to_sym)
  end

  def hide?(view)
    @hidden.include?(view.to_sym)
  end

  def show?(view)
    return @forced[view.to_sym] != :hide if @forced.key?(view.to_sym)

    !@hidden.include?(view.to_sym)
  end
end

# --- the probe-card double ---------------------------------------------------------
class ProbeCardDouble
  attr_reader :name

  def initialize(name_s, type_name)
    @name = Card::Name[name_s]
    @type_name = type_name
    @taken = []
  end

  def type_name
    @type_name
  end

  def is_structure?
    false
  end

  # verbatim nest_editor.rb:2-4
  def left_type_for_nest_editor_set_selection
    type_name
  end

  # the autoname census shape (the fixture fact: image01 unused -> "image01")
  def autoname(base_name)
    base = Card::Name[base_name]
    candidate = base
    while @taken.include?(candidate.key)
      candidate = candidate.next
    end
    @taken << candidate.key
    candidate
  end

  def name_next_of(n)
    # cardname variants#next can hand back a plain String; re-wrap so the
    # decko url_key reads stay on Card::Name
    Card::Name[Card::Name[n].next]
  end
end

# --- the format double ---------------------------------------------------------------
class ReferenceEditorFormatDouble < RailsHelpersHost
  attr_reader :card, :params, :voo

  def initialize(card, params, recorded_all_views)
    super()
    @card = card
    @params = params
    @recorded_all_views = recorded_all_views
    @nest_mode = :normal
    @class_ups = {}
    @id_counter = 0
    @voo = VooDouble.new
  end

  # card-mod-format haml.rb:41-52 (the symbol form) + :56-67
  # (process_haml_template) - the double renders the REAL template files
  # with the REAL Haml engine; locals ride Haml's locals channel
  def haml(name, args = {})
    locals = args.dup
    path = template_path_for(name)
    engine = Haml::Engine.new(File.read(path))
    scope = HamlScope.new(self)
    engine.render(scope, locals)
  end

  # haml.rb:49-52 haml_partial
  def haml_partial(partial, locals = {})
    haml(:"_#{partial}", locals)
  end

  def template_path_for(name)
    nm = name.to_s.delete_prefix("_")
    candidates = [
      File.join(MODS.fetch("tinymce"), "set", "all", "reference_editor", "#{nm}.haml"),
      File.join(MODS.fetch("tinymce"), "set", "all", "reference_editor", "_#{nm}.haml"),
      File.join(MODS.fetch("tinymce"), "set", "all", "reference_editor", "nest_editor", "#{nm}.haml"),
      File.join(MODS.fetch("tinymce"), "set", "all", "reference_editor", "nest_editor", "_#{nm}.haml"),
      File.join(MODS.fetch("tabs"), "set", "all", "tabs", "#{nm}.haml")
    ]
    found = candidates.find { |p| File.file?(p) }
    found or raise "haml template not found: #{name}"
  end

  # the Haml scope: template method calls route to the format double
  class HamlScope
    def initialize(fmt)
      @fmt = fmt
    end

    # haml evaluates templates in the format object's scope: private format
    # methods are reachable from the template (send reaches them), exactly as
    # Ruby's render does
    def method_missing(name, *args, **kwargs, &block)
      if @fmt.respond_to?(name, true)
        if kwargs.empty?
          @fmt.send(name, *args, &block)
        else
          @fmt.send(name, *args, **kwargs, &block)
        end
      else
        super
      end
    end

    def respond_to_missing?(name, include_private = false)
      @fmt.respond_to?(name, true) || super
    end
  end

  # --- card core lib/card/format/content.rb (verbatim semantics) ---------------
  def add_class(options, klass)
    return if klass.blank?

    options[:class] = css_classes(options[:class], klass)
  end

  def css_classes(*array)
    array.flatten.uniq.compact * " "
  end

  def id_counter
    @id_counter += 1
  end

  def unique_id
    "#{card.name.safe_key}-#{id_counter}"
  end

  def output(*content)
    content = yield if block_given?
    Array.wrap(content).flatten.compact.join "\n"
  end

  # --- card-mod-format set/all/html/wrap.rb:128-131 + private ------------------
  def wrap_with(tag, content_or_args = {}, html_args = {}, &block)
    tag_args = block_given? ? content_or_args : html_args
    content_tag(tag, tag_args) { content_within_wrap(content_or_args, &block) }
  end

  def content_within_wrap(content)
    content = yield if block_given?
    output(content).to_s.html_safe
  end

  # --- classy.rb class_up/classy (the double's single scope list) --------------
  def class_up(key, extra)
    @class_ups[key.to_s] = @class_ups[key.to_s] ? "#{@class_ups[key.to_s]} #{extra}" : extra
  end

  def classy(*classes)
    classes = Array.wrap(classes).flatten
    extras = classes.compact.uniq.filter_map { |c| @class_ups[c.to_s] }
    [classes, extras].flatten.compact.join(" ")
  end

  # --- nest mode (card core lib/card/format/nesting/mode.rb semantics) ---------
  def with_nest_mode(new_mode)
    old = @nest_mode
    @nest_mode = new_mode
    yield
  ensure
    @nest_mode = old
  end

  def add_name_context(_name = nil)
    nil
  end

  # --- THE NEST SEAM -------------------------------------------------------------
  def nest(cardish, view_opts = {}, _format_opts = {})
    target = Array.wrap(cardish).join("+")
    "%%NEST_SEAM[#{target}|view: #{view_opts[:view]}]%%".html_safe
  end

  # --- THE SLOT-WRAP SEAM ----------------------------------------------------------
  # wrap true { nest ... } (image_find_tab/image_preview_tab,
  # nest_editor_tabs.rb:34-44): the slot wrapper's bytes carry the engine's
  # slot_attributes machinery - data-card-id/data-slot-id are RANDOMIZED in
  # the live capture itself - and the nested view inside is the nest seam.
  # The whole region is the engine's; the static oracle marks it and the
  # chrome segments around it splice-verify against the live capture.
  def wrap(*_args, &_block)
    "%%WRAP_SEAM[slot]%%".html_safe
  end

  # --- card-mod-format set/all/path.rb:35-38 (the String arm; these views -----
  #      pass only fragment strings - path "#", the tab anchors "##{tab_id}";
  #      the hash arm (Card::Path) is never exercised here)
  def path(opts = {})
    return opts unless opts.is_a? Hash

    raise "Card::Path hash arm not exercised by these views: #{opts.inspect}"
  end

  # card-mod-format set/all/demo.rb:14-16 verbatim (the fixed literal)
  def view_list
    %i[content titled labeled bar box open closed]
  end

  # --- the basket (icon.rb's verbatim icon_lookup reads it) ---------------------
  def basket
    @basket ||= { icons: { material: ICON_BASKET_MATERIAL } }
  end

  # --- the view registrar --------------------------------------------------------
  #      The verbatim `view :name, config do ... end` declarations run inside
  #      class_eval (CLASS context), so `view` is a class singleton writing the
  #      class-level table; render_oracle_view instance_execs the body on the
  #      double, exactly as the Ruby render pipeline would.
  def render_oracle_view(name, *args)
    entry = self.class.oracle_view_table.fetch(name.to_sym) { raise "oracle view not registered: #{name}" }
    instance_exec(*args, &entry[:body])
  end

  def oracle_view_config(name)
    self.class.oracle_view_table.fetch(name.to_sym) { raise "oracle view not registered: #{name}" }[:config]
  end

  class << self
    def view(name, config = {}, &block)
      oracle_view_table[name.to_sym] = { config: config, body: block }
    end

    def oracle_view_table
      @oracle_view_table ||= {}
    end
  end

  # all_views (card-mod-format set/all/demo.rb:40-42) = the html-format
  # ancestor chain's view-name union; THE RECORDED FACT is the live registry
  # read at capture time (no_write_proof 4929->4929) - the recorded-capture
  # constant, the style-tag-views.rb REMOTE_STYLE_TAG pattern
  def all_views
    @recorded_all_views
  end
end

# icon.rb:1-11 basket[:icons] material map (the keys the chrome views read)
ICON_BASKET_MATERIAL = {
  plus: :add, pencil: :edit, trash: :delete, full_page: :open_in_full,
  new_window: :close_fullscreen, history: :history, collapse: :expand_less,
  expand: :expand_more, flag: :flag, remove: :close, close: :close,
  board: :space_dashboard, warning: :warning, unknown: :add_box,
  help: :help, modal: :fullscreen, reorder: :reorder
}.freeze

# --- verbatim extractions: ONE MODULE PER EXTRACTION -----------------------------
# Ruby's own structure: every format block is its own module on the format
# chain. The double mirrors it - each extraction evals into its own anonymous
# module, included in extraction order (later modules shadow earlier on the
# lookup chain, as later set modules do in Ruby). The `private` keyword inside
# a module scopes to that module alone, exactly as in the gems.
VERBATIM_EXTRACTIONS = [
  ["nest_editor.rb", format_html_body(mod_file("tinymce", "set", "all", "reference_editor", "nest_editor.rb"))],
  ["reference_editor.rb", format_html_body(mod_file("tinymce", "set", "all", "reference_editor.rb"))],
  ["nest_editor_tabs.rb", format_html_body(mod_file("tinymce", "set", "all", "reference_editor", "nest_editor", "nest_editor_tabs.rb"))],
  ["nest_editor_options.rb", format_html_body(mod_file("tinymce", "set", "all", "reference_editor", "nest_editor", "nest_editor_options.rb"))],
  ["nest_image.rb", format_html_body(mod_file("tinymce", "set", "all", "reference_editor", "nest_image.rb"))],
  ["links.rb(html)", format_html_body(mod_file("format", "set", "all", "links.rb"), occurrence: 1)],
  ["menu.rb(help_link)", def_region(mod_file("format", "set", "all", "html", "menu.rb"), "def help_link\\b")],
  ["menu.rb(help_popover_opts)", def_region(mod_file("format", "set", "all", "html", "menu.rb"), "def help_popover_opts\\b")],
  ["alert.rb", format_html_body(mod_file("layout", "set", "all", "alert.rb"))],
  ["icon.rb(icon_tag)", def_region(mod_file("bootstrap", "set", "all", "bootstrap", "icon.rb"), "def icon_tag\\b")],
  ["icon.rb(icon_libraries)", def_region(mod_file("bootstrap", "set", "all", "bootstrap", "icon.rb"), "def icon_libraries\\b")],
  ["icon.rb(universal_icon_tag)", def_region(mod_file("bootstrap", "set", "all", "bootstrap", "icon.rb"), "def universal_icon_tag\\b")],
  ["icon.rb(icon_lookup)", def_region(mod_file("bootstrap", "set", "all", "bootstrap", "icon.rb"), "def icon_lookup\\b")],
  ["icon.rb(with_icon_tag_opts)", def_region(mod_file("bootstrap", "set", "all", "bootstrap", "icon.rb"), "def with_icon_tag_opts\\b")],
  ["icon.rb(material_icon_tag)", def_region(mod_file("bootstrap", "set", "all", "bootstrap", "icon.rb"), "def material_icon_tag\\b")],
  ["icon.rb(all_icon_keys)", def_region(mod_file("bootstrap", "set", "all", "bootstrap", "icon.rb"), "def all_icon_keys\\b")],
  ["form.rb(button_tag)", def_region(mod_file("bootstrap", "set", "all", "bootstrap", "form.rb"), "def button_tag\\b")],
  ["form.rb(bootstrapify_button)", def_region(mod_file("bootstrap", "set", "all", "bootstrap", "form.rb"), "def bootstrapify_button")],
  ["helper.rb(popover_opts)", def_region(mod_file("bootstrap", "set", "all", "bootstrap", "helper.rb"), "def popover_opts\\b")],
  ["tabs.rb(tabs)", def_region(mod_file("tabs", "set", "all", "tabs.rb"), "def tabs\\b")]
].freeze

VERBATIM_EXTRACTIONS.each do |label, src|
  mod = Module.new
  table = ReferenceEditorFormatDouble.oracle_view_table
  mod.define_singleton_method(:view) do |name, config = {}, &block|
    table[name.to_sym] = { config: config, body: block }
  end
  begin
    mod.class_eval(src, label)
  rescue StandardError, SyntaxError => e
    abort "verbatim extraction #{label} failed: #{e.class}: #{e.message}"
  end
  ReferenceEditorFormatDouble.include(mod)
end

if ENV["ORACLE_DEBUG_DUMP"]
  File.write(ENV["ORACLE_DEBUG_DUMP"], VERBATIM_EXTRACTIONS.map { |l, s| "# ==== #{l}\n#{s}" }.join("\n"))
  abort "debug dump written to #{ENV['ORACLE_DEBUG_DUMP']}"
end

# Cardio.config (card-mod-bootstrap lib/card/mod/bootstrap.rb:2 verbatim default)
module Cardio
  module Config
    ICON_LIBRARIES = [:material].freeze

    define_singleton_method(:icon_libraries) { ICON_LIBRARIES }
  end

  def self.config
    Config
  end
end

# --- the recorded frozen-gem-registry fact -----------------------------------------
fixture_path = File.join(repo_root, "fixtures", "captured", "tinymce-editor-views.json")
abort "live capture fixture not found: #{fixture_path}" unless File.file?(fixture_path)
FIXTURE = JSON.parse(File.read(fixture_path))
HELPER_FACTS = FIXTURE.fetch("helper_facts")
ALL_VIEWS = HELPER_FACTS.fetch("all_views")
abort "all_views count drift: #{ALL_VIEWS.length}" unless ALL_VIEWS.length == HELPER_FACTS.fetch("all_views_count")

# the codename-bridge cross-check (the fixture's recorded fact)
composed_options_card = Card::Name[[:all, :by_name]].to_s
abort "codename bridge drift: #{composed_options_card.inspect}" unless composed_options_card == HELPER_FACTS.fetch("options_card_name")

# --- the params seam ----------------------------------------------------------------
PROBE_CARD_NAME = "Oracle TinyMCE Editor Probe"
PROBE_CARD_TYPE = "RichText"
# the gem's own example shape (nest_image.rb:47 js insert:
# "nest.insertNest(tm, \"{{+#{card.name.tag}|view: content; size: medium}}\")")
SEEDED_SNIPPET_RAW = "{{+#{PROBE_CARD_NAME}|view: content; size: medium}}"
# labeled SYNTHETIC pass-through values (the contract is the pass-through)
SEEDED_TINYMCE_ID = "tinymce-textarea-1"
SEEDED_TM_SNIPPET_START = "12"
SEEDED_INDEX = "2"

def build_fmt(params)
  ReferenceEditorFormatDouble.new(
    ProbeCardDouble.new(PROBE_CARD_NAME, PROBE_CARD_TYPE),
    params,
    ALL_VIEWS
  )
end

# --- the live-capture splice check ----------------------------------------------------
LIVE = {
  "nest_editor" => FIXTURE.fetch("rendered").fetch("#{PROBE_CARD_NAME}#nest_editor"),
  "modal_nest_editor" => FIXTURE.fetch("rendered").fetch("#{PROBE_CARD_NAME}#modal_nest_editor"),
  "nest_image" => FIXTURE.fetch("rendered").fetch("#{PROBE_CARD_NAME}#nest_image"),
  "modal_nest_image" => FIXTURE.fetch("rendered").fetch("#{PROBE_CARD_NAME}#modal_nest_image")
}.freeze

SEAM_RE = /%%(?:NEST|WRAP)_SEAM\[[^\]]*\]%%/

def check_against_live!(oracle_body, live, view)
  if oracle_body !~ SEAM_RE
    return if live.include?(oracle_body)

    first_diff = (0...[oracle_body.length, live.length].min).find { |i| oracle_body[i] != live[i] } ||
                 [oracle_body.length, live.length].min
    abort "#{view}: static body (#{oracle_body.length}b) is NOT a substring of the live capture (#{live.length}b); " \
          "first divergence at #{first_diff}:\n  static: #{oracle_body[[first_diff - 100, 0].max, 200].inspect}\n" \
          "  live:   #{live[[first_diff - 100, 0].max, 200].inspect}"
  end

  cursor = 0
  oracle_body.split(SEAM_RE).each_with_index do |seg, i|
    idx = live.index(seg, cursor)
    abort "#{view}: static segment #{i} (#{seg[0, 60].inspect}...) not found in live bytes after #{cursor}" if idx.nil?

    cursor = idx + seg.length
  end
end

# the SEEDED arm has no live oracle (the capture is the absent-params render);
# its verification is the DIFF against the same view's absent-params render on
# a fresh identical double: the differing lines must be the params-derived
# ones, and the oracle line carries their line numbers explicitly
def seam_deltas!(seeded_body, absent_body, view)
  abort "#{view}: seeded render identical to absent render" if seeded_body == absent_body
  a = seeded_body.split("\n")
  b = absent_body.split("\n")
  changed = []
  [a.length, b.length].max.times do |i|
    changed << i + 1 if a[i] != b[i]
  end
  changed
end

# ============================================================================
# SCENARIO 1: view :nest_editor, ABSENT-params arm (the live capture's arm)
# ============================================================================
fmt1 = build_fmt({})
body1 = fmt1.render_oracle_view(:nest_editor, :overlay)
check_against_live!(body1, LIVE.fetch("nest_editor"), "nest_editor")
emit(behaviorId: "view:nest_editor",
     kind: "view-bytes",
     scenario: "nest_editor_overlay_params_absent",
     gemSource: "set/all/reference_editor/nest_editor.rb:10-16 + reference_editor.haml + _nest_editor.haml + nest_editor_tabs.rb + nest_editor_options.rb (verbatim gem methods + templates under real Haml 5.2.2 + real ActionView 7.2.4 + real cardname; blank-name arms render the placeholders, no nest seam)",
     paramsSeam: "tm_snippet_raw ABSENT -> NestParser.new nil -> the default Nest struct (name '', field? true, options [], raw '{{+ }}'); tinymce_id ABSENT -> data-tinymce-id dropped by the tag renderer",
     bytes: body1,
     liveCrossCheck: "substring-verified against fixtures/captured/tinymce-editor-views.json rendered['#{PROBE_CARD_NAME}#nest_editor'] (#{LIVE.fetch('nest_editor').length} bytes, no_write_proof actions 4929->4929)")

# ============================================================================
# SCENARIO 2: view :nest_editor, SEEDED-params arm (the named params seam)
# ============================================================================
fmt2 = build_fmt(tm_snippet_raw: SEEDED_SNIPPET_RAW, tinymce_id: SEEDED_TINYMCE_ID,
                 tm_snippet_start: SEEDED_TM_SNIPPET_START, index: SEEDED_INDEX)
body2 = fmt2.render_oracle_view(:nest_editor, :overlay)
snippet2 = Card::Reference::NestParser.new(SEEDED_SNIPPET_RAW)
emit(behaviorId: "view:nest_editor",
     kind: "view-bytes",
     scenario: "nest_editor_overlay_params_seeded",
     gemSource: "nest_editor.rb:10-16 + 55-57 (nest_snippet) + reference_editor.rb:18-37 (apply_tm_snippet_data/vars/dismiss/index) + 69-77 (set_name_for_nest_rules) + 41-50 (name_dependent_slot)",
     paramsSeam: "tm_snippet_raw = '#{SEEDED_SNIPPET_RAW}' (the gem's own js insert shape); tinymce_id = '#{SEEDED_TINYMCE_ID}'; tm_snippet_start = '#{SEEDED_TM_SNIPPET_START}'; index = '#{SEEDED_INDEX}' (labeled SYNTHETIC pass-throughs)",
     snippetParse: { name: snippet2.name, field: snippet2.field?, view: snippet2.view,
                     options: snippet2.options, raw: snippet2.raw },
     bytes: body2,
     nestSeams: ["RichText+#{PROBE_CARD_NAME}+*type plus right|view: nest_rules"],
     seamDeltas: { lines: seam_deltas!(body2, body1, "nest_editor(seeded)"), basis: "line numbers that differ from the params-absent render (scenario 1) - the params seam's exact byte reach" })

# ============================================================================
# SCENARIOS 3+4: view :modal_nest_editor (both arms)
# ============================================================================
fmt3 = build_fmt({})
body3 = fmt3.render_oracle_view(:modal_nest_editor)
check_against_live!(body3, LIVE.fetch("modal_nest_editor"), "modal_nest_editor")
emit(behaviorId: "view:modal_nest_editor",
     kind: "view-bytes",
     scenario: "modal_nest_editor_params_absent",
     gemSource: "nest_editor.rb:17-20 + 60-63 (modal_nest_editor = wrap_with :modal { nest_editor :modal }, wrap.rb:128-131 content_tag(:modal)) + reference_editor.rb:14-16 (modal_tm_snippet_editor?)",
     paramsSeam: "tm_snippet_raw/tinymce_id ABSENT (the default-struct arm)",
     bytes: body3,
     liveCrossCheck: "substring-verified against the live modal_nest_editor capture")

fmt3b = build_fmt(tm_snippet_raw: SEEDED_SNIPPET_RAW, tinymce_id: SEEDED_TINYMCE_ID)
body3b = fmt3b.render_oracle_view(:modal_nest_editor)
emit(behaviorId: "view:modal_nest_editor",
     kind: "view-bytes",
     scenario: "modal_nest_editor_params_seeded",
     gemSource: "nest_editor.rb:17-20 + 60-63 + reference_editor.rb:18-37 (the modal mode's data-bs-dismiss: modal arm)",
     paramsSeam: "tm_snippet_raw = '#{SEEDED_SNIPPET_RAW}'; tinymce_id = '#{SEEDED_TINYMCE_ID}' (labeled SYNTHETIC pass-through)",
     bytes: body3b,
     nestSeams: ["RichText+#{PROBE_CARD_NAME}+*type plus right|view: nest_rules"],
     seamDeltas: { lines: seam_deltas!(body3b, body3, "modal_nest_editor(seeded)"), basis: "line numbers that differ from the params-absent render (scenario 3)" })

# ============================================================================
# SCENARIOS 5+6: view :nest_image / :modal_nest_image (both arms)
# ============================================================================
fmt4 = build_fmt({})
body4 = fmt4.render_oracle_view(:nest_image, :overlay)
check_against_live!(body4, LIVE.fetch("nest_image"), "nest_image")
emit(behaviorId: "view:nest_image",
     kind: "view-bytes",
     scenario: "nest_image_overlay_params_absent",
     gemSource: "set/all/reference_editor/nest_image.rb:2-6 + 28-37 (nest_image_editor + adapt_reference_editor_for_images) + nest_editor.rb:29-38 (nest_editor) + reference_editor.haml + _image_nest_editor.haml + nest_editor_tabs.rb (image_nest_editor_tabs) + _image_find.haml + _image_options.haml",
     paramsSeam: "the image flow's snippet is NOT params-driven: adapt_reference_editor_for_images builds NestParser.new_image(autoname('image01')) in-process",
     autonameFact: { autoname: "image01", next: fmt4.card.name_next_of("image01").to_s },
     bytes: body4,
     nestSeams: ["image01|view: new_image", "image01|view: core"],
     liveCrossCheck: "every static segment verified in-order against the live nest_image capture")

fmt5 = build_fmt({})
body5 = fmt5.render_oracle_view(:modal_nest_image)
check_against_live!(body5, LIVE.fetch("modal_nest_image"), "modal_nest_image")
emit(behaviorId: "view:modal_nest_image",
     kind: "view-bytes",
     scenario: "modal_nest_image_params_absent",
     gemSource: "nest_image.rb:8-11 + 28-37 (the modal arm)",
     paramsSeam: "as nest_image (the in-process snippet; the modal mode flips the footer copy + data-bs-dismiss)",
     bytes: body5,
     nestSeams: ["image01|view: new_image", "image01|view: core"],
     liveCrossCheck: "every static segment verified in-order against the live modal_nest_image capture")

# ============================================================================
# SCENARIO 7: :nest_content's contract lines (both arms, params seam named)
# ============================================================================
emit(behaviorId: "view:nest_content",
     kind: "view-contract",
     scenario: "nest_content_known_arm",
     gemSource: "nest_editor.rb:22-27 + 79-85 (card.known? arm: voo.hide! :cancel_button; add_name_context; with_nest_mode :edit { wrap true { render_edit_inline } })",
     vooHide: ["cancel_button"],
     nestMode: "edit",
     wrap: "slot",
     dispatch: "render :edit_inline (the edit mod's ported inline-editing surface)",
     paramsSeam: "none (the known arm reads no params)")

emit(behaviorId: "view:nest_content",
     kind: "view-contract",
     scenario: "nest_content_unknown_arm_params_absent",
     gemSource: "nest_editor.rb:22-27 + 87-92 (the else arm; params absence drops the tinymce_id success key - Rails' success_tags nil-value omission)",
     vooHide: ["guide"],
     vooShow: ["new_type_formgroup"],
     buttonsView: "new_image_buttons",
     success: { "tinymce_id" => nil },
     paramsSeam: "tinymce_id ABSENT -> the nil value renders the value-less success[tinymce_id] hidden tag (hidden_field_tag nil omits the value attribute)")

emit(behaviorId: "view:nest_content",
     kind: "view-contract",
     scenario: "nest_content_unknown_arm_params_seeded",
     gemSource: "nest_editor.rb:87-92 (the else arm; the seeded pass-through)",
     vooHide: ["guide"],
     vooShow: ["new_type_formgroup"],
     buttonsView: "new_image_buttons",
     success: { "tinymce_id" => SEEDED_TINYMCE_ID },
     paramsSeam: "tinymce_id = '#{SEEDED_TINYMCE_ID}' (labeled SYNTHETIC pass-through)")

# ============================================================================
# SCENARIO 8: :new_image's success chain (params absent + seeded)
#   autoname(name.next) rides the REAL cardname variants (image01.next =
#   "image02", the fixture's recorded image01_next fact).
# ============================================================================
image_card = ProbeCardDouble.new("image01", "Image")
next_name = image_card.name_next_of("image01")
abort "cardname next drift: #{next_name}" unless next_name.to_s == HELPER_FACTS.fetch("image01_next")
base_success = {
  "view" => "new_image", "type" => "image",
  "slot" => { "hide" => "guide", "type" => "image", "show" => "preview_redirect" },
  "id" => next_name.url_key
}
emit(behaviorId: "view:new_image",
     kind: "view-contract",
     scenario: "new_image_create_form",
     gemSource: "nest_image.rb:13-19 (params absence keeps the tinymce_id KEY with a nil value - Rails' hidden_field_tag renders the value-less tag; the LIVE capture pins success[tinymce_id] with no value attribute; autoname(name.next) over the REAL cardname variants)",
     buttonsView: "new_image_buttons",
     autonameFact: { name: image_card.name.to_s, next: next_name.to_s, urlKey: next_name.url_key },
     success: { "tinymce_id" => nil }.merge(base_success),
     paramsSeam: "tinymce_id ABSENT -> the nil value renders the value-less success[tinymce_id] hidden tag")

emit(behaviorId: "view:new_image",
     kind: "view-contract",
     scenario: "new_image_create_form_params_seeded",
     gemSource: "nest_image.rb:13-19 (the seeded pass-through)",
     buttonsView: "new_image_buttons",
     autonameFact: { name: image_card.name.to_s, next: next_name.to_s, urlKey: next_name.url_key },
     success: { "tinymce_id" => SEEDED_TINYMCE_ID }.merge(base_success),
     paramsSeam: "tinymce_id = '#{SEEDED_TINYMCE_ID}' (labeled SYNTHETIC pass-through)")

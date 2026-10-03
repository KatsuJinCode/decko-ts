# demo-view.rb — static-ruby oracle capture for card-mod-format's
# view :demo (set/all/demo.rb:2-7), one of the census's two missing format
# views (the other, :debug_server_error, needs the better_errors dev gem -
# not in the frozen set; named remainder, not ported).
#
# WHAT RUNS: the gem's own source lines extracted VERBATIM by line range +
# the deck's REAL admin.yml files (every card-mod-*/config/admin.yml under
# the installed gems, YAML-loaded by the real interpreter - the same files
# core-admin-runtime.ts transcribes into ADMIN_CONFIG). The BEHAVIOR is
# the gems'; the ENVIRONMENT is stubbed, and every stub is listed here:
#
#   card_form        - card-mod-edit set/all/form.rb:193-240 verbatim
#                      (card_form + card_form_opts + card_form_url_and_
#                      action + card_form_html_opts + hidden_form_tags)
#                      with form_for stubbed to the Rails shell rules the
#                      tree pins (mod-form-substrate.ts cardFormShell:
#                      class/id/caller-attrs/action/accept-charset/
#                      data-remote/method="post" + utf8 enqueuer + the
#                      persisted-record _method=patch spoof + success
#                      hiddens; embed_authenticity_token_in_remote_forms
#                      =false).
#   select_tag       - Rails form_tag_helper.rb select_tag: name/id
#                      attrs first, caller opts in hash order; the
#                      bootstrap wrapper appends " form-control" to the
#                      class (the rules_tab select precedent,
#                      card-mod-rules.ts's captured bytes).
#   options_for_select - Rails form_options_helper.rb:82-96: one
#                      <option value="X">X</option> per item,
#                      selected="selected" FIRST in the attrs on the
#                      match (the captured options order, typeField).
#   hidden_tags/success_tags - form_elements.rb:16-43 verbatim.
#   wrap_with/output - the established content.rb:70-72/wrap.rb:128-131
#                      shapes.
#   Env.params       - the headless render has no request params:
#                      demo_view resolves :core (the flashView basis).
#
# Each JSONL line carries behaviorId "view:demo" + gemSource ranges.
#
# Usage: ruby demo-view.rb <card-mod-format-gem-path>

require "json"
require "yaml"
require "ostruct"

gem_path = ARGV[0] or abort "usage: ruby #{File.basename(__FILE__)} <card-mod-format-gem-path>"
# normalize: the harness's node path.join emits BACKSLASHES on win32, and
# Ruby's Dir[] treats a backslash as a glob escape (the admin.yml walk
# below would silently match nothing)
gems_root = File.dirname(gem_path).tr("\\", "/")
abort "not a card-mod-format gem path: #{gem_path}" unless File.basename(gem_path).start_with?("card-mod-format")

demo_file = File.join(gem_path, "set", "all", "demo.rb")
form_file = File.join(gems_root, "card-mod-edit-0.20.0", "set", "all", "form.rb")
form_elements_file = File.join(gems_root, "card-mod-edit-0.20.0", "set", "all", "form_elements.rb")
{
  demo_file => "demo.rb", form_file => "edit form.rb",
  form_elements_file => "form_elements.rb"
}.each { |f, n| abort "gem source not found (#{n}): #{f}" unless File.file?(f) }

SRC = {
  demo_file => File.readlines(demo_file),
  form_file => File.readlines(form_file),
  form_elements_file => File.readlines(form_elements_file)
}.freeze

def region(file, a, b)
  SRC.fetch(file)[(a - 1)...b].join
end

def emit(obj)
  puts JSON.generate(obj)
end

# --- the REAL admin.yml walk (all/admin.rb:36-42 over the frozen gems) ------

admin_ymls = Dir[File.join(gems_root, "card-mod-*-[0-9].*/config/admin.yml")].sort
mod_codenames = []
admin_ymls.each do |yml|
  parsed = YAML.safe_load(File.read(yml), permitted_classes: [Symbol], aliases: false) || {}
  views = parsed["views"]
  next unless views.is_a?(Array)

  modname = File.basename(File.dirname(File.dirname(yml)))
  views.each { |v| mod_codenames << v.to_s }
end
raise "no views category found in the frozen admin.yml files" if mod_codenames.empty?

# --- the stubbed framework ---------------------------------------------------

class String
  def present?
    !empty?
  end
  # Name#url_key on the plain name string (the double keeps card.name a
  # String; the key form is spaces->underscores, leading * -> X)
  def url_key
    tr(" ", "_").sub(/^\*/, "X")
  end
end

class Hash
  def present?
    !empty?
  end
end

module HTML
  TAG_ESCAPE = { "&" => "&amp;", "<" => "&lt;", ">" => "&gt;", '"' => "&quot;" }.freeze
  def self.escape_attr(v)
    v.to_s.gsub(/[&<>"]/) { |c| TAG_ESCAPE[c] }
  end
  def self.content_tag(tag, html_options = {})
    attrs = html_options.map { |k, v| %( #{k}="#{escape_attr(v)}") }.join
    "<#{tag}#{attrs}>#{yield}</#{tag}>"
  end
end

def content_tag(tag, html_options = {}, &block)
  HTML.content_tag(tag, html_options, &block)
end

class Array
  def self.wrap(object)
    if object.nil? then []
    elsif object.respond_to?(:to_ary) then object.to_ary
    else [object]
    end
  end
end

class Hash
  def reverse_merge!(other)
    other.each { |k, v| self[k] = v unless key?(k) }
    self
  end
end

def add_class(opts, class_str)
  opts[:class] = [class_str, opts[:class]].compact.join " "
end

def sanitize_to_id(name)
  name.to_s.delete("]").tr("[", "_")
end

# Rails options_for_select (form_options_helper.rb:82-96): the selected
# marker renders FIRST in the option attrs (the captured order).
def options_for_select(container, selected = nil)
  container.map do |value|
    selected_attr = value.to_s == selected.to_s ? ' selected="selected"' : ""
    %(<option#{selected_attr} value="#{HTML.escape_attr(value)}">#{HTML.escape_attr(value)}</option>)
  end.join
end

# Rails select_tag (form_tag_helper.rb): name/id attrs first, then the
# caller opts in hash order. NO form-control append: no select_tag
# override exists in any installed gem (grep: only the rails gems define
# select_tag; bootstrap_options/form-control chains attach to INPUT
# helpers, not to a bare select_tag).
def select_tag(name, option_tags = nil, html_options = {})
  attrs = %( name="#{HTML.escape_attr(name)}" id="#{HTML.escape_attr(sanitize_to_id(name))}")
  attrs += html_options.map { |k, v| %( #{k}="#{HTML.escape_attr(v)}") }.join
  "<select#{attrs}>#{option_tags}</select>"
end

def hidden_field_tag(name, value = nil)
  %(<input type="hidden" name="#{HTML.escape_attr(name)}" id="#{HTML.escape_attr(sanitize_to_id(name))}"#{" value=\"#{HTML.escape_attr(value)}\"" unless value.nil?} autocomplete="off" />)
end

class CardDouble
  attr_reader :id, :name
  def initialize(id, name)
    @id = id
    @name = name
  end
  def url_key
    @name.tr(" ", "_").sub(/^\*/, "X")
  end
  def new_record?
    false
  end
end

# --- the format double hosting the verbatim form machinery -------------------

class FormatDouble
  attr_reader :card, :params

  def initialize(card)
    @card = card
    @params = {}
  end

  # verbatim: card-1.110.0 lib/card/format/content.rb:70-72
  def output(*content)
    Array.wrap(content).flatten.compact.join "\n"
  end

  # verbatim: form_elements.rb:16-43 success_tags + hidden_tags +
  # process_hidden_value (the hash arm this capture reaches)
  def success_tags(opts)
    return "" unless opts.present?

    hidden_tags(success: opts)
  end

  def hidden_tags(hash, base = nil, _options = {})
    hash ||= {}
    hash.inject("") do |result, (key, val)|
      new_base = base ? "#{base}[#{key}]" : key.to_s
      result + process_hidden_value(val, new_base)
    end
  end

  def process_hidden_value(val, name)
    if val.is_a?(Hash)
      hidden_tags(val, name)
    elsif val.is_a?(Array)
      val.map { |v| hidden_field_tag("#{name}[]", v) }.join
    else
      hidden_field_tag(name, val)
    end
  end

  # verbatim: form.rb:193-240 card_form + card_form_opts +
  # card_form_url_and_action + card_form_html_opts + hidden_form_tags
  # (path(action: :get) stubbed to "/get/<url_key>" - the decko action
  # path rule, lib/card/path.rb's action_base: "/#{action}/#{mark}")
  def card_form(action, opts = {})
    hidden = hidden_form_tags(action, opts)
    form_for(card, card_form_opts(action, opts)) do |_cform|
      hidden + output(yield)
    end
  end

  def hidden_form_tags(_action, opts)
    success = opts.delete :success
    success_tags(success)
  end

  def card_form_opts(action, opts = {})
    url, action = card_form_url_and_action(action)
    html_opts = card_form_html_opts(action, opts)
    form_opts = { url: url, html: html_opts }
    form_opts[:remote] = true unless html_opts.delete(:redirect)
    form_opts
  end

  def card_form_html_opts(action, opts = {})
    add_class opts, "card-form"
    add_class opts, "slotter" unless opts[:redirect] || opts[:no_slotter]
    add_class opts, "autosave" if action == :update
    opts
  end

  def card_form_url_and_action(action)
    case action
    when Symbol then [path(action: action), action]
    when Hash   then [path(action), action[:action]]
    else raise "unsupported #card_form_url action: #{action}"
    end
  end

  def path(opts = {})
    "/#{opts[:action]}/#{card.name.url_key}"
  end

  # form_for stub: the Rails shell the tree pins (mod-form-substrate.ts
  # cardFormShell - html_options_for_form + extra_tags_for_form +
  # form_tag_with_body, form_tag_helper.rb:984-1051): class/id first, the
  # caller attrs, action, accept-charset, data-remote, method="post";
  # utf8 enqueuer + the persisted-record _method=patch spoof; NO
  # authenticity token (embed_authenticity_token_in_remote_forms=false).
  def form_for(_record, form_opts)
    url = form_opts[:url]
    html = form_opts[:html]
    dom_id = "edit_card_#{card.id}"
    klass = html[:class]
    attrs = %( class="#{HTML.escape_attr(klass)}" id="#{dom_id}" action="#{HTML.escape_attr(url)}") +
            %( accept-charset="UTF-8" data-remote="true" method="post")
    body = +%(<form#{attrs}>)
    body << %(<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />)
    body << %(<input type="hidden" name="_method" value="patch" autocomplete="off" />)
    yielded = yield(nil)
    body << yielded
    body << %(</form>)
    body
  end
end

# verbatim: demo.rb:22-39 demo_view + view_select + all_views_from_admin_
# config + demo_view (the html format block's methods)
class DemoFormatDouble < FormatDouble
  def demo_view
    Env.params[:demo_view] || :core
  end

  def all_views_from_admin_config
    card.all_admin_configs_of_category("views").map(&:codename)
  end

  def view_select
    card_form :get, success: { view: :demo } do
      select_tag :demo_view,
                 options_for_select(all_views_from_admin_config, demo_view),
                 class: "_submit-on-select"
    end
  end
end

module Env
  class << self
    def params
      @params ||= {}
    end
  end
end

class AdminItemDouble
  attr_reader :codename
  def initialize(codename)
    @codename = codename
  end
end

class AdminCardDouble < CardDouble
  def all_admin_configs_of_category(_category)
    # the REAL admin.yml walk's items (the codenames parsed above)
    mod_codenames.map { |c| AdminItemDouble.new(c) }
  end
end

mod_codenames_ref = mod_codenames
card = AdminCardDouble.new(30, "Sample Basic")
card.define_singleton_method(:all_admin_configs_of_category) do |_cat|
  mod_codenames_ref.map { |c| AdminItemDouble.new(c) }
end
format = DemoFormatDouble.new(card)

# Scenario 1: all_views_from_admin_config - the REAL admin.yml codenames.
emit(behaviorId: "view:demo",
     kind: "view-fragment",
     scenario: "all_views_from_admin_config",
     gemSource: "set/all/demo.rb:37-39 + every card-mod-*/config/admin.yml views: list (yml order)",
     codenames: mod_codenames)

# Scenario 2: demo_view's default (the headless params absence).
emit(behaviorId: "view:demo",
     kind: "view-fragment",
     scenario: "demo_view_default",
     gemSource: "set/all/demo.rb:23-25",
     demoView: format.demo_view.to_s)

# Scenario 3: the view_select form bytes (card_form :get + the select).
emit(behaviorId: "view:demo",
     kind: "view-fragment",
     scenario: "view_select",
     gemSource: "set/all/demo.rb:31-35 + form.rb:193-240 + form_elements.rb:16-43",
     viewSelect: format.view_select)

# Scenario 4: options_for_select alone (the selected marker on :core).
emit(behaviorId: "view:demo",
     kind: "view-fragment",
     scenario: "options_for_select",
     gemSource: "Rails form_options_helper.rb:82-96 over the admin.yml views list",
     options: options_for_select(mod_codenames, "core"))

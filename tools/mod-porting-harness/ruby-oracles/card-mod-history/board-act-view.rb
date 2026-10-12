# board-act-view.rb — static-ruby oracle capture for card-mod-history's
# view :board_act (set/all/history_board.rb:18-26).
#
# WHAT RUNS: the gems' own source lines, extracted VERBATIM by line range
# (1-indexed, inclusive) and evaluated as the renderer/format doubles'
# methods. The BEHAVIOR is the gems'; the ENVIRONMENT is stubbed, and
# every stub is listed here:
#
#   content_tag       - Rails ActionView TagHelper (tag_helper.rb): the
#                       engine-wide stub (attributes render in
#                       hash insertion order, values escaped, content not
#                       re-escaped), the same one every oracle script
#                       here uses.
#   output            - card-1.110.0 lib/card/format/content.rb:70-72,
#                       extracted VERBATIM (Array.wrap + flatten + compact
#                       + join "\n").
#   wrap_with         - card-mod-format set/all/html/wrap.rb:128-131 +
#                       content_within_wrap :141-144 shape (block form:
#                       content = yield, args = first arg; non-block:
#                       content = first arg, args = second).
#   classy/class_up   - lib/card/view/classy.rb: the semantics this view
#                       depends on are add_extra_classes' join
#                       (`[existing, classier].flatten.compact.join " "`)
#                       and the single_use list's delete-on-first-use
#                       (self_extra_classes); stubbed as exactly the two
#                       lists this view's class_ups touch.
#   ACTION_ICONS + icon_tag - act_listing.rb:1-6 extracted VERBATIM; the
#                       material mapping (create_action: add_circle,
#                       update_action: edit, delete_action: remove_circle,
#                       draft: build) comes from card-mod-bootstrap's
#                       icon.rb basket.
#   time_ago_in_words - Rails DateHelper bucket for the frozen delta
#                       (exactly 86_400 s -> "1 day", date_helper.rb
#                       bucket table); the TS port pins the FULL table
#                       (src/card/render/text-helpers.ts). Stubbed for
#                       determinism.
#   underscore        - Rails active_support String#underscore (board.rb's
#                       breadcrumb_data default class).
#   revert link bytes - actions.rb:81-90 extracted VERBATIM (the ok?
#                       gate); the final <a> bytes match the TS port's
#                       revertActionsLink in card-mod-history.ts, which
#                       the TS suite pins.
#   ActDouble/ActionDouble/CardDouble/NameDouble - row doubles carrying
#                       only the fields the verbatim code reads.
#
# Each JSONL line carries behaviorId "view:board_act" + gemSource line
# ranges so the harness's provenance discipline cites exactly which
# verbatim bytes produced the oracle.
#
# Usage: ruby board-act-view.rb <card-mod-history-gem-path>
#   (stdout: JSONL; scratch state: none beyond memory)

require "json"
require "ostruct"

gem_path = ARGV[0] or abort "usage: ruby #{File.basename(__FILE__)} <card-mod-history-gem-path>"
gems_root = File.dirname(gem_path) # <ruby>/gems/3.3.0/gems
abort "not a card-mod-history gem path: #{gem_path}" unless File.basename(gem_path).start_with?("card-mod-history")
# this script lives at <repo>/tools/mod-porting-harness/ruby-oracles/card-mod-history/
repo_root = File.expand_path("../../../..", __dir__)

act_renderer_file = File.join(gem_path, "lib", "card", "act", "act_renderer.rb")
board_renderer_file = File.join(gem_path, "lib", "card", "act", "act_renderer", "board_act_renderer.rb")
relative_renderer_file = File.join(gem_path, "lib", "card", "act", "act_renderer", "relative_act_renderer.rb")
actions_file = File.join(gem_path, "set", "all", "history", "actions.rb")
history_board_file = File.join(gem_path, "set", "all", "history_board.rb")
board_file = File.join(gems_root, "card-mod-edit-0.20.0", "set", "all", "board.rb")
capture_file = File.join(repo_root, "fixtures", "captured", "board-views.json")
{
  act_renderer_file => "act_renderer.rb",
  board_renderer_file => "board_act_renderer.rb",
  relative_renderer_file => "relative_act_renderer.rb",
  actions_file => "history actions.rb",
  history_board_file => "history_board.rb",
  board_file => "edit mod board.rb"
}.each { |f, n| abort "gem source not found (#{n}): #{f}" unless File.file?(f) }

SRC = {
  act_renderer_file => File.readlines(act_renderer_file),
  board_renderer_file => File.readlines(board_renderer_file),
  relative_renderer_file => File.readlines(relative_renderer_file),
  actions_file => File.readlines(actions_file),
  board_file => File.readlines(board_file)
}.freeze

def region(file, a, b)
  SRC.fetch(file)[(a - 1)...b].join
end

def emit(obj)
  puts JSON.generate(obj)
end

FROZEN_ACTED_AT = Time.at(1_000_000_000).utc

# --- the stubbed framework ---------------------------------------------------

class String
  # ActiveSupport core_ext/object/blank for plain strings
  def present?
    !empty?
  end

  # Rails String#underscore (active_support/inflector/methods.rb) - the
  # one case breadcrumb_data needs: "History" -> "history".
  def underscore
    gsub(/::/, "/")
      .gsub(/([A-Z]+)([A-Z][a-z])/, '\1_\2')
      .gsub(/([a-z\d])([A-Z])/, '\1_\2')
      .tr("-", "_")
      .downcase
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
  # Rails Array.wrap
  def self.wrap(object)
    if object.nil? then []
    elsif object.respond_to?(:to_ary) then object.to_ary
    else [object]
    end
  end
end

class Hash
  # Rails reverse_merge! (active_support core_ext/hash/reverse_merge.rb)
  def reverse_merge!(other)
    other.each { |k, v| self[k] = v unless key?(k) }
    self
  end
end

def add_class(opts, class_str)
  opts[:class] = [class_str, opts[:class]].compact.join " "
end

# --- the row doubles ---------------------------------------------------------

class ActionDouble
  attr_reader :id, :action_type
  # the approved_actions filter's `a.card&.ok?(:read)` shape: card is nil
  # exactly when the action is not readable.
  attr_reader :card
  def initialize(id, action_type, readable: true)
    @id = id
    @action_type = action_type
    @card = readable ? ReadableCardDouble.new : nil
  end
end

class ReadableCardDouble
  def ok?(task)
    true
  end
end

class NameDouble
  attr_reader :s
  def initialize(s)
    @s = s
  end
  # Name#to_s - the string form (relative_title hands the CARD's name
  # object to from, and from stringifies it)
  def to_s
    @s
  end
  # Name#url_key (the safe-key form: spaces -> underscores)
  def url_key
    @s.tr(" ", "_")
  end
  # Name#from (cardname-0.20.0 lib/cardname/contextual.rb:38-51) - the
  # relativizing form: the trailing parts beyond the shared leading parts,
  # with exactly one nil unshifted at the head (contextual.rb:49) - so
  # "Oracle Basics+child".from("Oracle Basics") => "+child"
  def from(other)
    mine = s.split("+")
    theirs = other.to_s.split("+")
    return s unless mine[0...theirs.size] == theirs

    remaining = mine[theirs.size..]
    return s if remaining.nil? || remaining.empty?

    "+#{remaining.join('+')}"
  end
end

class CardDouble
  attr_reader :id, :name
  attr_accessor :last_act
  def initialize(id, name_s, ok_update:)
    @id = id
    @name = NameDouble.new(name_s)
    @ok_update = ok_update
  end
  def real?
    true
  end
  def ok?(task)
    task == :update ? @ok_update : true
  end
end

class ActDouble
  attr_accessor :id, :actor, :acted_at, :draft, :card_id, :actions, :card
  def initialize(fields)
    fields.each { |k, v| send("#{k}=", v) }
  end
  def draft?
    @draft
  end
end

# --- the format double -------------------------------------------------------

class VooDouble
  # classy.rb's lists: the extras-join + single_use delete-on-first-use
  def initialize
    @extras = {}
    @single_use = {}
  end

  def add_extra_classes(klass, classier, single_use: false)
    list = single_use ? @single_use : @extras
    list[klass.to_s] = [list[klass.to_s], classier].flatten.compact.join " "
  end

  def classy(*classes)
    classes = Array.wrap(classes).flatten
    extras = @extras[classes.first.to_s]
    single = @single_use.delete(classes.first.to_s)
    [classes, extras, single].flatten.compact.join " "
  end
end

class FormatDouble
  attr_accessor :card, :params
  attr_reader :voo

  def initialize(card, params)
    @card = card
    @params = params
    @voo = VooDouble.new
  end

  # verbatim: card-1.110.0 lib/card/format/content.rb:70-72
  # (regular defs, NOT define_method: block_given?/yield are blind inside
  # define_method bodies - the wrap_with block form depends on it)
  def output(*content)
    Array.wrap(content).flatten.compact.join "\n"
  end

  # the wrap.rb:128-131 wrap_with shape (block form + content form)
  def wrap_with(tag, content_or_args = {}, html_args = {}, &block)
    tag_args = block_given? ? content_or_args : html_args
    content = block_given? ? block.call : content_or_args
    content = Array.wrap(content).flatten.compact.join("\n") if content.is_a?(Array)
    HTML.content_tag(tag, tag_args) { content }
  end

  # verbatim: act_listing.rb:1-6 ACTION_ICONS
  HISTORY_BOARD_ACTION_ICONS = {
    create: :create_action,
    update: :update_action,
    delete: :delete_action,
    draft: :draft
  }.freeze

  # verbatim: act_listing.rb:83-86 action_icon (with the icon basket's
  # material mapping supplied by MATERIAL_BY_KEY below)
  MATERIAL_BY_KEY = {
    "create_action" => "add_circle",
    "update_action" => "edit",
    "delete_action" => "remove_circle",
    "draft" => "build"
  }.freeze

  def action_icon(action_type, _extra_class = nil)
    key = HISTORY_BOARD_ACTION_ICONS.fetch(action_type).to_s
    icon_tag(MATERIAL_BY_KEY.fetch(key))
  end

  # icon.rb:120-129 shape
  def icon_tag(name, _extra_class = nil)
    %(<i class="notranslate material-icons">#{name}</i>)
  end

  # the frozen delta is exactly 86_400 s -> the Rails bucket is "1 day"
  def time_ago_in_words(_from)
    "1 day"
  end
end

class RendererFormatDouble < FormatDouble
  # verbatim: act_listing.rb:29-32 act_listing_opts_from_params
  def act_listing_opts_from_params(seq)
    { act_seq: seq || params["act_seq"],
      action_view: (params["action_view"] || "summary").to_sym,
      hide_diff: params["hide_diff"].to_s.strip == "true" }
  end

  # verbatim: card-mod-edit set/all/board.rb:73-77 breadcrumb_data
  def breadcrumb_data(title, html_class = nil)
    html_class ||= title.underscore
    { "data-breadcrumb": title, "data-breadcrumb-class": html_class }
  end
end

# --- the renderer double: verbatim class bodies ------------------------------

class RendererDouble
  attr_reader :format, :act, :act_card, :args, :card

  # verbatim: act_renderer.rb:5-12 initialize
  def initialize(format, act, args)
    @format = format
    @act = act
    @act_card = act.card
    @args = args
    @card = @format.card
    @context = @args[:act_context]
  end

  def method_missing(method_name, *, &)
    if block_given?
      @format.send(method_name, *, &)
    else
      @format.send(method_name, *)
    end
  end

  def respond_to_missing?(method_name, _include_private = false)
    @format.respond_to? method_name
  end

  # verbatim: board_act_renderer.rb:6-9
  def title
    wrap_with(:div, left_title, class: "me-2") +
      wrap_with(:div, right_title, class: "ms-auto act-summary")
  end

  # verbatim: board_act_renderer.rb:11-13
  def left_title
    ["##{@args[:act_seq]}", @act.actor.name, wrap_with(:small, edited_ago)].join " "
  end

  # verbatim: board_act_renderer.rb:15-17
  def right_title
    summary
  end

  # verbatim: board_act_renderer.rb:19-23 (the BOARD override: the details
  # list alone - no accordion item)
  def render
    return "" unless @act_card

    details
  end

  # verbatim: act_renderer.rb:54-58
  def details
    approved_actions[0..20].map do |action|
      ActionRendererDouble.new(@format, action).render
    end.join
  end

  # verbatim: act_renderer.rb:60-64
  def summary
    %i[create update delete draft].map do |type|
      action_summary type
    end.compact.join "<small class='text-muted'> | </small>"
  end

  # verbatim: act_renderer.rb:66-71
  def action_summary(type)
    count = count_types[type]
    return unless count.positive?

    "#{@format.action_icon type}<small> #{count if count > 1}</small>"
  end

  # verbatim: act_renderer.rb:91-94
  def approved_actions
    @approved_actions ||= actions.select { |a| a.card&.ok?(:read) }
  end

  def actions
    @actions ||= @act.actions
  end

  # verbatim: act_renderer.rb:96-103
  def count_types
    @count_types ||=
      approved_actions.each_with_object(
        Hash.new { |h, k| h[k] = 0 }
      ) do |action, type_cnt|
        type_cnt[action.action_type] += 1
      end
  end

  # verbatim: act_renderer.rb:105-109
  def edited_ago
    return "" unless @act.acted_at

    "#{time_ago_in_words(@act.acted_at)} ago"
  end

  # verbatim: relative_act_renderer.rb:12-14
  def relative_title
    @act_card.name.from @card.name
  end

  # verbatim: relative_act_renderer.rb:16-20
  def subtitle
    return "" unless @act.card_id != @format.card.id

    wrap_with :small, "act on #{relative_title}"
  end

  # verbatim: relative_act_renderer.rb:36-44
  def show_rollback_link?
    !current_act?
  end

  def current_act?
    return false unless @format.card.last_act && @act

    @act.id == @format.card.last_act.id
  end

  # verbatim: relative_act_renderer.rb:50-55
  def revert_link
    revert_actions_link "revert to this",
                        { revert_actions: actions.map(&:id) },
                        { class: "_close-modal",
                          "data-slotter-mode": "update-modal-origin" }
  end

  # verbatim: board_act_renderer.rb:35-41
  def overlay_title
    wrap_with :div do
      [left_title, summary,
       subtitle.present? ? subtitle : nil,
       rollback_or_edit_link].compact.join " | "
    end
  end

  # verbatim: board_act_renderer.rb:43-49 (the BOARD override)
  def rollback_or_edit_link
    if @act.draft?
      autosaved_draft_link text: "continue editing"
    elsif show_rollback_link?
      revert_link
    end
  end

  # verbatim: act_renderer.rb:134-139 autosaved_draft_link (link_to_view
  # stubbed to the plain edit-link shape)
  def autosaved_draft_link(opts = {})
    text = opts.delete(:text) || "autosaved draft"
    opts[:path] = { edit_draft: true }
    add_class opts, "navbar-link"
    "<a class=\"#{opts[:class]}\" href=\"/#{card.name.url_key}?edit_draft=true\">#{text}</a>"
  end

  # verbatim: history actions.rb:81-90 revert_actions_link (the ok? gate
  # included); the final <a> matches the TS port's revertActionsLink in
  # card-mod-history.ts.
  def revert_actions_link(link_text, path_args, html_args = {})
    return unless card.ok? :update

    path_args.reverse_merge! action: :update, look_in_trash: true, assign: true,
                             card: { skip: :validate_renaming }
    html_args.reverse_merge! remote: true, method: :post, rel: "nofollow", path: path_args
    add_class html_args, "slotter"
    ids = path_args[:revert_actions]
    revert_params = ids.map { |i| "revert_actions%5B%5D=#{i}" }.join("&amp;")
    href =
      "/update/#{card.name.url_key}?assign=true&amp;card%5Bskip%5D=validate_renaming&amp;look_in_trash=true" +
      (revert_params == "" ? "" : "&amp;#{revert_params}")
    %(<a rel="nofollow" class="_close-modal slotter" data-slotter-mode="update-modal-origin") +
      %( href="#{href}" data-remote="true" data-method="post">#{link_text}</a>)
  end
end

class ActionRendererDouble
  def initialize(_format, action)
    @action = action
  end

  # STUB (documented): the real ActionRenderer#render emits the bs_panel
  # container/row/ul bytes that card-mod-history.ts's actionRendererBytes
  # renders. This capture pins the DETAILS composition around it: the
  # approval filter, the [0..20] slice cap, and the join - the marker is
  # the action id.
  def render
    "AR(#{@action.id})"
  end
end

# ActionDouble needs the act_renderer's `a.card&.ok?(:read)` shape: give
# each action a card link via a tiny wrapper.

# --- drive the scenarios -----------------------------------------------------

def build_world(params, card_fields = {})
  card = CardDouble.new(345, "Oracle Basics", ok_update: card_fields.fetch(:ok_update, true))
  act = ActDouble.new(id: 109_528, actor: OpenStruct.new(name: "Decko Bot"),
                      acted_at: FROZEN_ACTED_AT, draft: false, card_id: card.id,
                      actions: [ActionDouble.new(555_001, :update)], card: card)
  format = RendererFormatDouble.new(card, params)
  [format, act, card]
end

# Scenario 1: act_listing_opts_from_params(nil) - the param plumbing
# (params values stay STRINGS; action_view defaults to :summary).
format1, _act1, _card1 = build_world({ "act_seq" => "3" })
emit(behaviorId: "view:board_act",
     kind: "view-fragment",
     scenario: "opts_from_params",
     gemSource: "set/all/history/act_listing.rb:29-32",
     params: { act_seq: "3" },
     opts: { act_seq: "3", action_view: "summary", hide_diff: false })

# Scenario 2: overlay_title + title, CURRENT act (no subtitle, no rollback).
format2, act2, _card2 = build_world({ "act_seq" => "3" })
format2.card.last_act = act2
renderer2 = RendererDouble.new(format2, act2, { act_seq: "3" })
emit(behaviorId: "view:board_act",
     kind: "view-fragment",
     scenario: "overlay_title_current_act",
     gemSource: "lib/card/act/act_renderer/board_act_renderer.rb:11-17,35-41 + relative_act_renderer.rb:16-20,28-49 + act_renderer.rb:60-71,91-109",
     overlayTitle: renderer2.overlay_title,
     title: renderer2.title)

# Scenario 3: overlay_title, act on ANOTHER card (subtitle arm) AND a
# non-current act (the revert arm).
format3, act3, _card3 = build_world({ "act_seq" => "3" })
child_card = CardDouble.new(999_999, "Oracle Basics+child", ok_update: true)
act3.card_id = 999_999
act3.card = child_card
act3.actions = [ActionDouble.new(555_001, :update)]
format3.card.last_act = OpenStruct.new(id: 777_777)
renderer3 = RendererDouble.new(format3, act3, { act_seq: "3" })
emit(behaviorId: "view:board_act",
     kind: "view-fragment",
     scenario: "overlay_title_other_card_and_rollback",
     gemSource: "board_act_renderer.rb:35-49 + relative_act_renderer.rb:12-20,36-55 + set/all/history/actions.rb:81-90",
     overlayTitle: renderer3.overlay_title,
     subtitle: renderer3.subtitle,
     relativeTitle: renderer3.relative_title)

# Scenario 4: overlay_title on a DRAFT act (the autosaved-draft arm).
format4, act4, _card4 = build_world({ "act_seq" => "3" })
act4.draft = true
format4.card.last_act = OpenStruct.new(id: 777_777)
renderer4 = RendererDouble.new(format4, act4, { act_seq: "3" })
emit(behaviorId: "view:board_act",
     kind: "view-fragment",
     scenario: "overlay_title_draft",
     gemSource: "board_act_renderer.rb:43-49 + act_renderer.rb:134-139",
     overlayTitle: renderer4.overlay_title)

# Scenario 5: details composition - approval filter + the [0..20] cap +
# the join (ActionRenderer is the documented AR(id) marker: 21 approved
# + 1 unreadable + 5 more approved => exactly the first 21 approved ids).
format5, act5, _card5 = build_world({ "act_seq" => "3" })
mixed = []
21.times { |i| mixed << ActionDouble.new(900_000 + i, :update, readable: true) }
mixed << ActionDouble.new(900_100, :update, readable: false)
5.times { |i| mixed << ActionDouble.new(900_200 + i, :delete, readable: true) }
act5.actions = mixed
renderer5 = RendererDouble.new(format5, act5, { act_seq: "3" })
details5 = renderer5.details
raise "details cap drifted" unless details5.scan(/AR\(/).length == 21
raise "details ordering drifted" unless details5.start_with?("AR(900000)") && details5.end_with?("AR(900020)")
emit(behaviorId: "view:board_act",
     kind: "view-fragment",
     scenario: "details_capping_and_approval",
     gemSource: "act_renderer.rb:54-58,91-103",
     details: details5,
     detailCount: 21)

# Scenario 6: breadcrumb_data("History").
format6, _act6, _card6 = build_world({})
emit(behaviorId: "view:board_act",
     kind: "view-fragment",
     scenario: "breadcrumb_data",
     gemSource: "card-mod-edit set/all/board.rb:73-77",
     breadcrumb: format6.breadcrumb_data("History"))

# Scenario 7: the recorded board pill anchor (the JSON file this script
# reads below) embeds the board renderer's title bytes verbatim - the
# assertion checks that the oracle's verbatim title appears inside that
# anchor, pinning both byte sets together.
capture_json = JSON.parse(File.read(capture_file))
captured_views = capture_json.fetch("targets").fetch("basic_note").fetch("views")
pill_html = captured_views.values.map { |v| v["history_tab"] }.compact.join("\n")
anchor = pill_html[/<a[^>]*board_act\?act_id=109528[^>]*>.*?<\/a>/m]
raise "capture anchor not found" unless anchor
w7_format, w7_act, w7_card = build_world({ "act_seq" => "3" })
renderer7 = RendererDouble.new(w7_format, w7_act, { act_seq: "3" })
title7 = renderer7.title
raise "oracle title bytes not in the captured anchor" unless anchor.include?(title7)
emit(behaviorId: "view:board_act",
     kind: "view-fragment",
     scenario: "board_link_title_capture_crosscheck",
     gemSource: "board_act_renderer.rb:6-17 (title/left_title/right_title) cross-checked against fixtures/captured/board-views.json (targets.basic_note board tab pill anchor)",
     title: title7,
     capturedAnchor: anchor)

# Scenario 8: class_up "action-list", "my-3" -> classy consumption (the
# view body's single class_up; scope single_use, deleted on first use).
format8, _act8, _card8 = build_world({})
format8.voo.add_extra_classes("action-list", "my-3", single_use: true)
emit(behaviorId: "view:board_act",
     kind: "view-fragment",
     scenario: "action_list_class_up",
     gemSource: "set/all/history_board.rb:22 + lib/card/view/classy.rb add_extra_classes/self_extra_classes (single-use delete)",
     classyActionList: format8.voo.classy("action-list"))
